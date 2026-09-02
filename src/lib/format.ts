import type { NodoEvent } from '../types/event';

const shortDateFormatter = new Intl.DateTimeFormat('es', { weekday: 'short', day: 'numeric', month: 'short' });
const longDateFormatter = new Intl.DateTimeFormat('es', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const timeFormatter = new Intl.DateTimeFormat('es', { hour: 'numeric', minute: '2-digit', hour12: true });

export function formatEventDate(date: Date): string {
  return shortDateFormatter.format(date);
}

export function formatEventDateLong(date: Date): string {
  return longDateFormatter.format(date);
}

export function formatEventTime(date: Date): string {
  return timeFormatter.format(date);
}

export function getEventLocationLabel(event: NodoEvent): string {
  if (event.modality === 'virtual') {
    return 'En línea';
  }

  return [event.venue, event.city].filter(Boolean).join(', ');
}
