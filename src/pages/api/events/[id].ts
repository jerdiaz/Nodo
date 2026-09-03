import type { APIRoute } from 'astro';
import { Timestamp } from 'firebase-admin/firestore';
import { jsonResponse } from '../../../lib/api';
import { getCurrentUser } from '../../../lib/auth';
import { validateEventPayload } from '../../../lib/eventValidation';
import { getAdminDb } from '../../../lib/firebase/server';

export const PUT: APIRoute = async ({ params, request, cookies }) => {
  const user = await getCurrentUser(cookies);

  if (!user) {
    return jsonResponse({ error: 'Debes iniciar sesión.' }, 401);
  }

  const id = params.id;
  if (!id) {
    return jsonResponse({ error: 'Falta el id del evento.' }, 400);
  }

  const db = getAdminDb();
  const docRef = db.collection('events').doc(id);
  const existing = await docRef.get();

  if (!existing.exists) {
    return jsonResponse({ error: 'Evento no encontrado.' }, 404);
  }

  const existingData = existing.data();
  if (existingData?.organizer?.uid !== user.uid) {
    return jsonResponse({ error: 'No tienes permiso para editar este evento.' }, 403);
  }

  const body = await request.json().catch(() => null);
  const validation = validateEventPayload(body);

  if ('error' in validation) {
    return jsonResponse({ error: validation.error }, 400);
  }

  const { startDate, endDate, ...rest } = validation.data;

  await docRef.update({
    ...rest,
    startDate: Timestamp.fromDate(startDate),
    endDate: Timestamp.fromDate(endDate),
  });

  return jsonResponse({ success: true, slug: existingData?.slug ?? id }, 200);
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
  const docRef = db.collection('events').doc(id);
  const existing = await docRef.get();

  if (!existing.exists) {
    return jsonResponse({ error: 'Evento no encontrado.' }, 404);
  }

  const existingData = existing.data();
  if (existingData?.organizer?.uid !== user.uid) {
    return jsonResponse({ error: 'No tienes permiso para eliminar este evento.' }, 403);
  }

  await docRef.delete();

  return jsonResponse({ success: true }, 200);
};
