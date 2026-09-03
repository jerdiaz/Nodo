import { getAdminDb } from './server';

export interface RsvpInfo {
  count: number;
  attending: boolean;
}

function rsvpsCollection(eventId: string) {
  return getAdminDb().collection('events').doc(eventId).collection('rsvps');
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
