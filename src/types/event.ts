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
}
