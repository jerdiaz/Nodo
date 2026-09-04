import type { EventCommunity } from './community';

export type EventModality = 'presencial' | 'virtual' | 'hibrido';

export interface EventOrganizer {
  uid: string;
  name: string;
  avatarUrl?: string;
}

export interface NodoEvent {
  id: string;
  slug: string;
  title: string;
  description: string;
  bannerUrl?: string;
  modality: EventModality;
  city?: string;
  venue?: string;
  address?: string;
  meetingUrl?: string;
  startDate: Date;
  endDate: Date;
  timezone: string;
  tags: string[];
  organizer: EventOrganizer;
  // Cuando el evento se publica en nombre de una comunidad, la cartelera
  // muestra a la comunidad y la ficha sigue mostrando a quien lo creo.
  community?: EventCommunity;
}
