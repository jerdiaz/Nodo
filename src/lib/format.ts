import type { NodoEvent } from '../types/event';

const DEFAULT_TIMEZONE = 'America/Bogota';

export function formatEventDate(date: Date, timezone?: string): string {
  return new Intl.DateTimeFormat('es', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: timezone || DEFAULT_TIMEZONE,
  }).format(date);
}

export function formatEventDateLong(date: Date, timezone?: string): string {
  return new Intl.DateTimeFormat('es', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: timezone || DEFAULT_TIMEZONE,
  }).format(date);
}

export function formatEventTime(date: Date, timezone?: string): string {
  return new Intl.DateTimeFormat('es', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: timezone || DEFAULT_TIMEZONE,
  }).format(date);
}

export function formatEventDay(date: Date, timezone?: string): string {
  return new Intl.DateTimeFormat('en', {
    day: 'numeric',
    timeZone: timezone || DEFAULT_TIMEZONE,
  }).format(date);
}

export function formatEventMonthShort(date: Date, timezone?: string): string {
  return new Intl.DateTimeFormat('es', {
    month: 'short',
    timeZone: timezone || DEFAULT_TIMEZONE,
  }).format(date);
}

export function formatEventMonthYear(date: Date, timezone?: string): string {
  const label = new Intl.DateTimeFormat('es', {
    month: 'long',
    year: 'numeric',
    timeZone: timezone || DEFAULT_TIMEZONE,
  }).format(date);

  return label.charAt(0).toUpperCase() + label.slice(1);
}

// Sin capitalizar, porque se incrusta a media frase: "Se unió en julio de 2026".
export function formatMonthYear(date: Date, timezone?: string): string {
  return new Intl.DateTimeFormat('es', {
    month: 'long',
    year: 'numeric',
    timeZone: timezone || DEFAULT_TIMEZONE,
  }).format(date);
}

// El precio, ya con su simbolo. Un evento sin precio es gratis: se dice con
// palabra y no con un "$0", que se lee como un error de datos.
//
// Los pesos van sin decimales porque nadie cobra centavos de peso; el resto
// de monedas si los llevan, que es donde 12.50 significa algo.
export function formatEventPrice(event: Pick<NodoEvent, 'price' | 'currency'>): string {
  if (!event.price) {
    return 'Gratis';
  }

  const currency = event.currency ?? 'COP';

  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency,
    minimumFractionDigits: currency === 'COP' ? 0 : 2,
    maximumFractionDigits: currency === 'COP' ? 0 : 2,
  }).format(event.price);
}

// Lugares que quedan segun el aforo. Devuelve null cuando el evento no tiene
// tope, que es lo que distingue "sin limite" de "lleno".
export function getRemainingSpots(
  event: Pick<NodoEvent, 'capacity'>,
  attending: number,
): number | null {
  if (!event.capacity) {
    return null;
  }

  return Math.max(0, event.capacity - attending);
}

export function getEventLocationLabel(event: NodoEvent): string {
  if (event.modality === 'virtual') {
    return 'En línea';
  }

  return [event.venue, event.city].filter(Boolean).join(', ');
}
