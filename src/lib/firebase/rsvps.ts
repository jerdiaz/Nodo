import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from './server';
import { getUserProfiles } from './users';

export interface RsvpInfo {
  count: number;
  attending: boolean;
}

function rsvpsCollection(eventId: string) {
  return getAdminDb().collection('events').doc(eventId).collection('rsvps');
}

// A qué eventos, de una lista ya cargada, asiste este usuario.
//
// Lo natural seria db.collectionGroup('rsvps').where('uid','==',uid), pero esa
// consulta exige un indice COLLECTION_GROUP_ASC sobre rsvps.uid que el
// proyecto no tiene (comprobado: devuelve FAILED_PRECONDITION). Se resuelve
// con una lectura directa por evento, en la misma linea que el resto del
// repo, que evita a proposito depender de indices inexistentes.
export async function getAttendedEventIds(uid: string, eventIds: string[]): Promise<Set<string>> {
  const results = await Promise.all(
    eventIds.map(async (eventId) => {
      try {
        const doc = await rsvpsCollection(eventId).doc(uid).get();
        return doc.exists ? eventId : null;
      } catch {
        return null;
      }
    }),
  );

  return new Set(results.filter((eventId): eventId is string => eventId !== null));
}

export interface RsvpEntry {
  uid: string;
  // Cuando confirmo. Es null en un documento sin marca de tiempo, que hoy no
  // deberia existir: setRsvp es el unico que escribe aqui.
  createdAt: Date | null;
}

// Quienes han confirmado, en orden de llegada y como mucho `max`. Devuelve el
// uid y la fecha, no el perfil: cruzarlos lo hace getUserProfiles en un solo
// getAll(), y asi quien llame decide a quien mas mete en ese mismo viaje.
//
// El orden por createdAt no necesita indice compuesto -es un campo suelto de
// una subcoleccion, que Firestore indexa por su cuenta- pero si deja fuera
// cualquier documento que no lo tenga. Hoy no puede haberlos: setRsvp es el
// unico que escribe aqui y siempre pone serverTimestamp.
export async function getRsvpEntries(eventId: string, max: number): Promise<RsvpEntry[]> {
  const snapshot = await rsvpsCollection(eventId).orderBy('createdAt', 'asc').limit(max).get();

  return snapshot.docs.map((doc) => {
    const createdAt = doc.data()?.createdAt;

    return {
      uid: doc.id,
      createdAt: createdAt instanceof Timestamp ? createdAt.toDate() : null,
    };
  });
}

export interface AttendeeFace {
  uid: string;
  name: string;
  avatarUrl?: string;
}

// Las caras que van en la tarjeta de la cartelera, por evento.
//
// Es una consulta por evento, pero todas salen a la vez con Promise.all, asi
// que el coste en tiempo es el de una sola ida y vuelta y no el de la suma.
// Los perfiles se resuelven en un unico getAll() para todos los eventos
// juntos, no uno por tarjeta.
//
// Se pide por lote y desde la pagina, en vez de que cada tarjeta busque lo
// suyo: el marcado de Astro se renderiza en orden, asi que ocho tarjetas
// pidiendo por su cuenta serian ocho esperas encadenadas.
export async function getAttendeeFaces(
  eventIds: string[],
  max: number,
): Promise<Map<string, AttendeeFace[]>> {
  if (eventIds.length === 0) {
    return new Map();
  }

  const porEvento = await Promise.all(
    [...new Set(eventIds)].map(async (eventId) => {
      try {
        const snapshot = await rsvpsCollection(eventId).orderBy('createdAt', 'asc').limit(max).get();
        return [eventId, snapshot.docs.map((doc) => doc.id)] as const;
      } catch {
        // Un evento cuya subcoleccion falle no debe dejar sin caras a los
        // demas: se queda sin ellas y la tarjeta cae al contador a secas.
        return [eventId, [] as string[]] as const;
      }
    }),
  );

  const perfiles = await getUserProfiles(porEvento.flatMap(([, uids]) => uids));

  return new Map(
    porEvento.map(([eventId, uids]) => [
      eventId,
      uids.flatMap((uid) => {
        const perfil = perfiles.get(uid);

        if (!perfil) {
          return [];
        }

        return [
          {
            uid,
            name: [perfil.firstName, perfil.lastName].filter(Boolean).join(' ') || 'Alguien',
            avatarUrl: perfil.avatarUrl,
          },
        ];
      }),
    ]),
  );
}

export async function getRsvpInfo(eventId: string, uid?: string): Promise<RsvpInfo> {
  const db = getAdminDb();
  const eventRef = db.collection('events').doc(eventId);
  const rsvpsRef = rsvpsCollection(eventId);
  const eventDoc = await eventRef.get();
  const stored = eventDoc.data()?.rsvpCount;

  // Los eventos anteriores a la desnormalizacion no llevan rsvpCount: se cae a
  // count() solo para esos, hasta que corra el backfill.
  const count =
    typeof stored === 'number' ? stored : (await rsvpsRef.count().get()).data().count;

  if (!uid) {
    return { count, attending: false };
  }

  const doc = await rsvpsRef.doc(uid).get();
  return { count, attending: doc.exists };
}

// Lo lanza setRsvp cuando ya no quedan lugares. Es un mensaje centinela, como
// el USERNAME_TAKEN de claimUsername: la transaccion no puede devolver un
// resultado a medias, tiene que abortar, y quien la llama lo traduce a una
// respuesta HTTP.
export const AFORO_COMPLETO = 'AFORO_COMPLETO';

// Toggle de asistencia con el contador desnormalizado: la escritura del
// documento de rsvp y la del contador van en la misma transaccion, asi que no
// pueden descuadrarse aunque dos personas confirmen a la vez.
//
// El aforo se comprueba aqui dentro y no antes por lo mismo: dos personas
// pidiendo el ultimo lugar a la vez pasarian las dos una comprobacion previa
// y el evento acabaria con un asistente de mas. Dentro de la transaccion, la
// segunda relee el contador ya actualizado y se cae.
export async function setRsvp(eventId: string, uid: string): Promise<{ attending: true; count: number }> {
  const db = getAdminDb();
  const eventRef = db.collection('events').doc(eventId);
  const rsvpRef = rsvpsCollection(eventId).doc(uid);

  const count = await db.runTransaction(async (transaction) => {
    const eventDoc = await transaction.get(eventRef);
    const current = typeof eventDoc.data()?.rsvpCount === 'number' ? (eventDoc.data()!.rsvpCount as number) : 0;
    const capacity = typeof eventDoc.data()?.capacity === 'number' ? (eventDoc.data()!.capacity as number) : null;
    const existing = await transaction.get(rsvpRef);

    if (!existing.exists) {
      if (capacity !== null && current >= capacity) {
        throw new Error(AFORO_COMPLETO);
      }

      transaction.set(rsvpRef, { uid, createdAt: FieldValue.serverTimestamp() });
      transaction.update(eventRef, { rsvpCount: current + 1 });
      return current + 1;
    }

    return current;
  });

  return { attending: true, count };
}

export async function clearRsvp(eventId: string, uid: string): Promise<{ attending: false; count: number }> {
  const db = getAdminDb();
  const eventRef = db.collection('events').doc(eventId);
  const rsvpRef = rsvpsCollection(eventId).doc(uid);

  const count = await db.runTransaction(async (transaction) => {
    const eventDoc = await transaction.get(eventRef);
    const current = typeof eventDoc.data()?.rsvpCount === 'number' ? (eventDoc.data()!.rsvpCount as number) : 0;
    const existing = await transaction.get(rsvpRef);

    if (existing.exists) {
      transaction.delete(rsvpRef);
      transaction.update(eventRef, { rsvpCount: Math.max(0, current - 1) });
      return Math.max(0, current - 1);
    }

    return current;
  });

  return { attending: false, count };
}
