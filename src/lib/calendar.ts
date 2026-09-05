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

// El RFC 5545 limita cada linea a 75 octetos y obliga a partir las largas en
// varias, cada continuacion empezando por un espacio. La descripcion de un
// evento admite 3.000 caracteres, asi que pasarse es el caso normal, no el
// raro: sin plegar, los parsers estrictos rechazan el calendario entero y el
// cliente de correo se queda sin la tarjeta de "Agregar al calendario".
//
// Se cuenta en bytes y no en caracteres, y se corta entre caracteres completos:
// una tilde ocupa dos octetos, y partirla por la mitad produce basura.
function foldIcsLine(line: string): string {
  const partes: string[] = [];
  let actual = '';
  let octetos = 0;

  for (const caracter of line) {
    const ancho = Buffer.byteLength(caracter, 'utf8');

    // 74 y no 75: la continuacion anade un espacio al principio, que tambien
    // cuenta para el limite.
    if (octetos + ancho > 74) {
      partes.push(actual);
      actual = '';
      octetos = 0;
    }

    actual += caracter;
    octetos += ancho;
  }

  partes.push(actual);

  return partes.join('\r\n ');
}

// Todo calendario que sale de aqui pasa por aqui: plegar es responsabilidad del
// armado, no de cada funcion que compone lineas.
function unirLineasIcs(lineas: string[]): string {
  return lineas.map(foldIcsLine).join('\r\n');
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

  return unirLineasIcs(lines);
}

// Un solo evento como calendario completo. Se saco de getIcsDataUrl para poder
// adjuntarlo a un correo: el boton de la ficha necesita una data URL, pero el
// adjunto necesita el texto crudo, y duplicar la plantilla del VEVENT entre los
// dos era garantizar que acabaran discrepando.
export function buildIcsEvent(event: NodoEvent): string {
  return unirLineasIcs([
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Nodo//Cartelera Comunitaria//ES',
    'CALSCALE:GREGORIAN',
    ...toIcsEventLines(event),
    'END:VCALENDAR',
  ]);
}

export function getIcsDataUrl(event: NodoEvent): string {
  return `data:text/calendar;charset=utf8,${encodeURIComponent(buildIcsEvent(event))}`;
}

// --- Invitaciones para el correo ---------------------------------------------

// Un .ics adjunto no basta para que Gmail muestre la tarjeta de "Agregar al
// calendario": para eso el calendario tiene que ser una INVITACION, no una
// publicacion. Eso son tres cosas juntas: METHOD:REQUEST, un ORGANIZER, y una
// linea ATTENDEE con el correo exacto de quien recibe. Sin la ultima, el
// cliente de correo no reconoce que la invitacion es para el que la abre y se
// queda en un adjunto suelto.
//
// El UID es el mismo que el del evento en el resto del sitio, y eso es lo que
// permite que una actualizacion o una cancelacion posteriores reemplacen en el
// calendario a la invitacion original en vez de anadir un evento duplicado.
// SEQUENCE es el numero de version: el cliente solo hace caso a un cambio si
// llega con una secuencia mayor que la que ya tenia guardada.
interface OpcionesInvitacion {
  event: NodoEvent;
  correoAsistente: string;
  correoOrganizador: string;
  nombreOrganizador: string;
  metodo: 'REQUEST' | 'CANCEL';
  secuencia: number;
}

export function buildIcsInvitation({
  event,
  correoAsistente,
  correoOrganizador,
  nombreOrganizador,
  metodo,
  secuencia,
}: OpcionesInvitacion): string {
  return unirLineasIcs([
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Nodo//Cartelera Comunitaria//ES',
    'CALSCALE:GREGORIAN',
    `METHOD:${metodo}`,
    'BEGIN:VEVENT',
    `UID:${event.id}@nodo.app`,
    `DTSTAMP:${toUtcBasicDate(new Date())}`,
    `DTSTART:${toUtcBasicDate(event.startDate)}`,
    `DTEND:${toUtcBasicDate(event.endDate)}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    `DESCRIPTION:${escapeIcsText(event.description)}`,
    `LOCATION:${escapeIcsText(getFullEventLocation(event))}`,
    `ORGANIZER;CN=${escapeIcsText(nombreOrganizador)}:mailto:${correoOrganizador}`,
    `ATTENDEE;CN=${correoAsistente};RSVP=FALSE;PARTSTAT=ACCEPTED;ROLE=REQ-PARTICIPANT:mailto:${correoAsistente}`,
    `SEQUENCE:${secuencia}`,
    `STATUS:${metodo === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED'}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]);
}
