import type { NodoEvent } from '../types/event';

function toUtcBasicDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function getFullEventLocation(event: NodoEvent): string {
  const physical = [event.venue, event.address, event.city].filter(Boolean).join(', ');

  if (event.modality === 'virtual') {
    return event.meetingUrl ?? '';
  }

  if (event.modality === 'hibrido' && event.meetingUrl) {
    return [physical, event.meetingUrl].filter(Boolean).join(' — ');
  }

  return physical;
}

export function getGoogleCalendarUrl(event: NodoEvent): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${toUtcBasicDate(event.startDate)}/${toUtcBasicDate(event.endDate)}`,
    details: event.description,
    location: getFullEventLocation(event),
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function toIcsEventLines(event: NodoEvent): string[] {
  return [
    'BEGIN:VEVENT',
    `UID:${event.id}@nodo.app`,
    `DTSTAMP:${toUtcBasicDate(new Date())}`,
    `DTSTART:${toUtcBasicDate(event.startDate)}`,
    `DTEND:${toUtcBasicDate(event.endDate)}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    `DESCRIPTION:${escapeIcsText(event.description)}`,
    `LOCATION:${escapeIcsText(getFullEventLocation(event))}`,
    'END:VEVENT',
  ];
}

// Calendario completo para suscripcion. A diferencia de getIcsDataUrl, que
// entrega un solo evento como descarga, esto se sirve desde una URL estable a
// la que Google/Outlook/Apple vuelven cada cierto tiempo, asi que lleva
// X-WR-CALNAME (el nombre que muestra el cliente) y REFRESH-INTERVAL.
export function buildIcsCalendar(events: NodoEvent[], calendarName: string): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Nodo//Cartelera Comunitaria//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    'X-PUBLISHED-TTL:PT6H',
    ...events.flatMap(toIcsEventLines),
    'END:VCALENDAR',
  ];

  return lines.join('\r\n');
}

export function getIcsDataUrl(event: NodoEvent): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Nodo//Cartelera Comunitaria//ES',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${event.id}@nodo.app`,
    `DTSTAMP:${toUtcBasicDate(new Date())}`,
    `DTSTART:${toUtcBasicDate(event.startDate)}`,
    `DTEND:${toUtcBasicDate(event.endDate)}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    `DESCRIPTION:${escapeIcsText(event.description)}`,
    `LOCATION:${escapeIcsText(getFullEventLocation(event))}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  const icsContent = lines.join('\r\n');

  return `data:text/calendar;charset=utf8,${encodeURIComponent(icsContent)}`;
}
