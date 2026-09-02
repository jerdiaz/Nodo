import { getAdminDb } from './server';
import type { NodoEvent } from '../../types/event';

export interface EventFilters {
  modality?: string;
  city?: string;
}

function mapDocToEvent(doc: FirebaseFirestore.QueryDocumentSnapshot): NodoEvent {
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
}

export function filterEvents(events: NodoEvent[], filters?: EventFilters): NodoEvent[] {
  if (!filters) {
    return events;
  }

  return events.filter((event) => {
    if (filters.modality && event.modality !== filters.modality) {
      return false;
    }

    if (filters.city && event.city !== filters.city) {
      return false;
    }

    return true;
  });
}

export async function getEvents(filters?: EventFilters): Promise<NodoEvent[]> {
  const db = getAdminDb();
  const snapshot = await db.collection('events').orderBy('startDate', 'asc').get();
  const events = snapshot.docs.map(mapDocToEvent);

  return filterEvents(events, filters);
}

export async function getEventBySlug(slug: string): Promise<NodoEvent | null> {
  const db = getAdminDb();
  const snapshot = await db.collection('events').where('slug', '==', slug).limit(1).get();

  if (snapshot.empty) {
    return null;
  }

  return mapDocToEvent(snapshot.docs[0]!);
}
