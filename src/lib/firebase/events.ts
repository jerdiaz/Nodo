import { getAdminDb } from './server';
import type { NodoEvent } from '../../types/event';

export async function getEvents(): Promise<NodoEvent[]> {
  const db = getAdminDb();
  const snapshot = await db.collection('events').orderBy('startDate', 'asc').get();

  return snapshot.docs.map((doc): NodoEvent => {
    const data = doc.data();

    return {
      id: doc.id,
      slug: data.slug,
      title: data.title,
      description: data.description,
      bannerUrl: data.bannerUrl,
      modality: data.modality,
      city: data.city,
      venue: data.venue,
      address: data.address,
      meetingUrl: data.meetingUrl,
      startDate: data.startDate.toDate(),
      endDate: data.endDate.toDate(),
      tags: data.tags ?? [],
      organizer: data.organizer,
    };
  });
}
