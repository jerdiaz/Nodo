import { getAdminDb } from './server';
import type { NodoEvent } from '../../types/event';

export interface EventFilters {
  modality?: string;
  city?: string;
  timeframe?: 'upcoming' | 'past' | 'all';
  search?: string;
}

// Quita tildes/diacríticos antes de comparar, para que "ceramica" encuentre
// "cerámica" — muy común que la gente busque sin tildes en español.
function normalizeForSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[^\x00-\x7F]/g, '')
    .toLowerCase();
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
    timezone: data.timezone ?? 'America/Bogota',
    tags: data.tags ?? [],
    organizer: data.organizer,
  };
}

export function filterEvents(events: NodoEvent[], filters?: EventFilters): NodoEvent[] {
  if (!filters) {
    return events;
  }

  const now = Date.now();

  return events.filter((event) => {
    if (filters.modality && event.modality !== filters.modality) {
      return false;
    }

    if (filters.city && event.city !== filters.city) {
      return false;
    }

    if (filters.timeframe === 'upcoming' && event.endDate.getTime() < now) {
      return false;
    }

    if (filters.timeframe === 'past' && event.endDate.getTime() >= now) {
      return false;
    }

    if (filters.search) {
      const query = normalizeForSearch(filters.search.trim());
      const haystack = normalizeForSearch([event.title, event.description, ...event.tags].join(' '));

      if (query && !haystack.includes(query)) {
        return false;
      }
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
