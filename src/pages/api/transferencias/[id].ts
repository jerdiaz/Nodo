import type { APIRoute } from 'astro';
import { jsonResponse } from '../../../lib/api';
import { getCurrentUser } from '../../../lib/auth';
import { getAdminDb } from '../../../lib/firebase/server';
import { deleteTransferRequest, getTransferRequest } from '../../../lib/firebase/transfers';
import { getUserProfile } from '../../../lib/firebase/users';
import { deleteEventWithRsvps } from '../../../lib/firebase/events';

// Aceptar o rechazar una transferencia de eventos pendiente. Solo puede
// responderla quien la recibio: el uid sale de la cookie y se compara con el
// toUid de la solicitud.
export const POST: APIRoute = async ({ params, request, cookies }) => {
  const user = await getCurrentUser(cookies);

  if (!user) {
    return jsonResponse({ error: 'Debes iniciar sesión.' }, 401);
  }

  const id = params.id;

  if (!id) {
    return jsonResponse({ error: 'Falta el id de la solicitud.' }, 400);
  }

  const transfer = await getTransferRequest(id);

  if (!transfer) {
    return jsonResponse({ error: 'La solicitud ya no existe.' }, 404);
  }

  if (transfer.toUid !== user.uid) {
    return jsonResponse({ error: 'No puedes responder esta solicitud.' }, 403);
  }

  const body = await request.json().catch(() => null);
  const action = (typeof body === 'object' && body !== null ? (body as Record<string, unknown>).action : undefined);

  if (action !== 'aceptar' && action !== 'rechazar') {
    return jsonResponse({ error: 'Acción no válida.' }, 400);
  }

  const db = getAdminDb();

  if (action === 'aceptar') {
    const profile = await getUserProfile(user.uid);
    const name = profile ? [profile.firstName, profile.lastName].filter(Boolean).join(' ') : '';

    await Promise.all(
      transfer.eventIds.map((eventId) =>
        db.collection('events').doc(eventId).update({
          organizer: { uid: user.uid, name: name || user.name, avatarUrl: profile?.avatarUrl },
        }),
      ),
    );
  } else {
    // Quien iba a recibirlos no los quiere, y quien los publico ya no existe:
    // se retiran de la cartelera en vez de quedar como eventos sin dueno.
    await Promise.all(transfer.eventIds.map((eventId) => deleteEventWithRsvps(eventId)));
  }

  await deleteTransferRequest(id);

  return jsonResponse({ success: true }, 200);
};
