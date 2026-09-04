import type { EventCommunity } from './community';
import type { VerificationType } from './profile';

export type EventModality = 'presencial' | 'virtual' | 'hibrido';

export interface EventOrganizer {
  uid: string;
  name: string;
  avatarUrl?: string;
  // No se guarda en el evento: lo pone enrichOrganizers leyendo el perfil, en
  // el mismo viaje que ya hace para el nombre y la foto. Guardarlo seria
  // congelar una palomita que el panel de administracion puede retirar.
  verification?: VerificationType;
}

export interface NodoEvent {
  id: string;
  slug: string;
  title: string;
  description: string;
  bannerUrl?: string;
  // Variante reducida del banner (tarjetas y miniaturas). Se guarda en el
  // evento en el mismo viaje que bannerUrl: los eventos anteriores a la
  // variante no la tienen y caen a la imagen completa.
  bannerSmallUrl?: string;
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
  // Contador de asistentes, desnormalizado en el documento para no pagar un
  // count() por evento en cada listado. Lo mantiene el toggle de RSVP; los
  // eventos anteriores a la desnormalizacion no lo tienen y caen a count().
  rsvpCount?: number;
  // Cuando el evento se publica en nombre de una comunidad, la cartelera
  // muestra a la comunidad y la ficha sigue mostrando a quien lo creo.
  community?: EventCommunity;
}
