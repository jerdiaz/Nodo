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

export async function getRsvpInfo(eventId: string, uid?: string): Promise<RsvpInfo> {
  const rsvpsRef = rsvpsCollection(eventId);

  if (!uid) {
    const countSnapshot = await rsvpsRef.count().get();
    return { count: countSnapshot.data().count, attending: false };
  }

  const [doc, countSnapshot] = await Promise.all([rsvpsRef.doc(uid).get(), rsvpsRef.count().get()]);
  return { count: countSnapshot.data().count, attending: doc.exists };
}
