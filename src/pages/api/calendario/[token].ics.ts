import type { APIRoute } from 'astro';
import { buildIcsCalendar } from '../../../lib/calendar';
import { getEvents } from '../../../lib/firebase/events';
import { getAttendedEventIds } from '../../../lib/firebase/rsvps';
import { getUidByCalendarToken } from '../../../lib/firebase/users';

// Feed iCal personal. No lleva sesion: los clientes de calendario no mandan
// cookies, asi que la autorizacion es el token de la propia URL.
export const GET: APIRoute = async ({ params }) => {
  const token = params.token;

  if (!token) {
    return new Response('No encontrado', { status: 404 });
  }

  let uid: string | null = null;

  try {
    uid = await getUidByCalendarToken(token);
  } catch (error) {
    console.warn('No se pudo resolver el token de calendario:', error);
    return new Response('No disponible', { status: 503 });
  }

  if (!uid) {
    return new Response('No encontrado', { status: 404 });
  }

  const allEvents = await getEvents();
  const attendedIds = await getAttendedEventIds(
    uid,
    allEvents.map((event) => event.id),
  );

  const mine = allEvents.filter(
    (event) => event.organizer.uid === uid || attendedIds.has(event.id),
  );

  const body = buildIcsCalendar(mine, 'Nodo — Mis eventos');

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="nodo.ics"',
      // El token es un secreto en la URL: que no quede en caches compartidas.
      'Cache-Control': 'private, max-age=900',
    },
  });
};
