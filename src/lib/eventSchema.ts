import type { NodoEvent } from '../types/event';

const ATTENDANCE_MODE: Record<NodoEvent['modality'], string> = {
  presencial: 'https://schema.org/OfflineEventAttendanceMode',
  virtual: 'https://schema.org/OnlineEventAttendanceMode',
  hibrido: 'https://schema.org/MixedEventAttendanceMode',
};

export function getEventJsonLd(event: NodoEvent, pageUrl: string): Record<string, unknown> {
  const locations: Record<string, unknown>[] = [];

  if (event.modality === 'presencial' || event.modality === 'hibrido') {
    locations.push({
      '@type': 'Place',
      name: event.venue || event.city || event.title,
      address: {
        '@type': 'PostalAddress',
        streetAddress: event.address,
        addressLocality: event.city,
      },
    });
  }

  if ((event.modality === 'virtual' || event.modality === 'hibrido') && event.meetingUrl) {
    locations.push({
      '@type': 'VirtualLocation',
      url: event.meetingUrl,
    });
  }

  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: event.title,
    description: event.description,
    startDate: event.startDate.toISOString(),
    endDate: event.endDate.toISOString(),
    eventAttendanceMode: ATTENDANCE_MODE[event.modality],
    eventStatus: 'https://schema.org/EventScheduled',
    location: locations.length === 1 ? locations[0] : locations,
    organizer: {
      '@type': 'Organization',
      name: event.organizer.name,
    },
    url: pageUrl,
  };

  // Google pide offers para mostrar el evento como resultado enriquecido, y
  // un evento gratis tambien tiene oferta: la suya vale cero. Sin aforo no se
  // puede afirmar que queden lugares, asi que se declara InStock, que es lo
  // que significa "abierto".
  jsonLd.offers = {
    '@type': 'Offer',
    price: event.price ?? 0,
    priceCurrency: event.currency ?? 'COP',
    availability:
      event.capacity && (event.rsvpCount ?? 0) >= event.capacity
        ? 'https://schema.org/SoldOut'
        : 'https://schema.org/InStock',
    url: pageUrl,
  };

  if (event.bannerUrl) {
    jsonLd.image = [event.bannerUrl];
  }

  return jsonLd;
}
