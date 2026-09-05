import type { APIRoute } from 'astro';
import { Timestamp } from 'firebase-admin/firestore';
import { jsonResponse } from '../../../../lib/api';
import { getCurrentUser } from '../../../../lib/auth';
import { getAdminDb } from '../../../../lib/firebase/server';
import { AFORO_COMPLETO, clearRsvp, setRsvp } from '../../../../lib/firebase/rsvps';
import { addRsvpNotification, removeRsvpNotification } from '../../../../lib/firebase/notifications';

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

  const data = event.data() ?? {};
  const endDate = toDate(data.endDate);
  if (endDate && endDate.getTime() < Date.now()) {
    return jsonResponse({ error: 'Este evento ya terminó.' }, 400);
  }

  try {
    const result = await setRsvp(id, user.uid);

    // Alguien nuevo confirmo: se le avisa al organizador, salvo que sea el
    // propio organizador confirmando su evento.
    const organizador = (data.organizer ?? {}) as { uid?: string };
    if (result.creado && organizador.uid && organizador.uid !== user.uid) {
      await addRsvpNotification({
        toUid: organizador.uid,
        fromUid: user.uid,
        actorName: user.name,
        eventId: id,
        eventTitle: typeof data.title === 'string' ? data.title : 'un evento',
      });
    }

    return jsonResponse({ attending: result.attending, count: result.count }, 200);
  } catch (error) {
    if (error instanceof Error && error.message === AFORO_COMPLETO) {
      return jsonResponse({ error: 'Este evento ya llenó su aforo.' }, 409);
    }

    throw error;
  }
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

  // Si retiró una asistencia que sí había confirmado, la notificacion que
  // habia dejado deja de tener sentido.
  const data = event.data() ?? {};
  const organizador = (data.organizer ?? {}) as { uid?: string };
  if (result.eliminado && organizador.uid && organizador.uid !== user.uid) {
    await removeRsvpNotification(organizador.uid, id, user.uid);
  }

  return jsonResponse({ attending: result.attending, count: result.count }, 200);
};
