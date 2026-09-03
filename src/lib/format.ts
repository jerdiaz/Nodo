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

export function getEventLocationLabel(event: NodoEvent): string {
  if (event.modality === 'virtual') {
    return 'En línea';
  }

  return [event.venue, event.city].filter(Boolean).join(', ');
}
