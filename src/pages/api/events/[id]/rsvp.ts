import type { APIRoute } from 'astro';
import { Timestamp } from 'firebase-admin/firestore';
import { jsonResponse } from '../../../../lib/api';
import { getCurrentUser } from '../../../../lib/auth';
import { getAdminDb } from '../../../../lib/firebase/server';
import { clearRsvp, setRsvp } from '../../../../lib/firebase/rsvps';

function toDate(value: unknown): Date | null {
  if (value instanceof Timestamp) {
    return value.toDate();
  }
  if (value instanceof Date) {
    return value;
  }
  return null;
}

export const POST: APIRoute = async ({ params, cookies }) => {
  const user = await getCurrentUser(cookies);

  if (!user) {
    return jsonResponse({ error: 'Debes iniciar sesión.' }, 401);
  }

  const id = params.id;
  if (!id) {
    return jsonResponse({ error: 'Falta el id del evento.' }, 400);
  }

  const db = getAdminDb();
  const eventRef = db.collection('events').doc(id);
  const event = await eventRef.get();

  if (!event.exists) {
    return jsonResponse({ error: 'Evento no encontrado.' }, 404);
  }

  const endDate = toDate(event.data()?.endDate);
  if (endDate && endDate.getTime() < Date.now()) {
    return jsonResponse({ error: 'Este evento ya terminó.' }, 400);
  }

  const result = await setRsvp(id, user.uid);
  return jsonResponse({ attending: result.attending, count: result.count }, 200);
};

export const DELETE: APIRoute = async ({ params, cookies }) => {
  const user = await getCurrentUser(cookies);

  if (!user) {
    return jsonResponse({ error: 'Debes iniciar sesión.' }, 401);
  }

  const id = params.id;
  if (!id) {
    return jsonResponse({ error: 'Falta el id del evento.' }, 400);
  }

  const db = getAdminDb();
  const eventRef = db.collection('events').doc(id);
  const event = await eventRef.get();

  if (!event.exists) {
    return jsonResponse({ error: 'Evento no encontrado.' }, 404);
  }

  const result = await clearRsvp(id, user.uid);
  return jsonResponse({ attending: result.attending, count: result.count }, 200);
};
