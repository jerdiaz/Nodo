import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from './server';

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

// Quienes han confirmado, en orden de llegada y como mucho `max`. Devuelve
// solo los uid: cruzarlos con sus perfiles es trabajo de getUserProfiles, que
// lo hace en un solo viaje con getAll() y ya se usa para los organizadores.
//
// El orden por createdAt no necesita indice compuesto -es un campo suelto de
// una subcoleccion, que Firestore indexa por su cuenta- pero si deja fuera
// cualquier documento que no lo tenga. Hoy no puede haberlos: setRsvp es el
// unico que escribe aqui y siempre pone serverTimestamp.
export async function getRsvpUids(eventId: string, max: number): Promise<string[]> {
  const snapshot = await rsvpsCollection(eventId).orderBy('createdAt', 'asc').limit(max).get();
  return snapshot.docs.map((doc) => doc.id);
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
