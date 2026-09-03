import type { APIRoute } from 'astro';
import { FieldValue } from 'firebase-admin/firestore';
import { jsonResponse } from '../../../../lib/api';
import { getCurrentUser } from '../../../../lib/auth';
import { getAdminDb } from '../../../../lib/firebase/server';

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

  const rsvpsRef = eventRef.collection('rsvps');
  await rsvpsRef.doc(user.uid).set({ uid: user.uid, createdAt: FieldValue.serverTimestamp() });

  const countSnapshot = await rsvpsRef.count().get();
  return jsonResponse({ attending: true, count: countSnapshot.data().count }, 200);
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

  const rsvpsRef = eventRef.collection('rsvps');
  await rsvpsRef.doc(user.uid).delete();

  const countSnapshot = await rsvpsRef.count().get();
  return jsonResponse({ attending: false, count: countSnapshot.data().count }, 200);
};
