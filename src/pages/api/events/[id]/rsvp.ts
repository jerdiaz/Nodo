import type { APIRoute } from 'astro';
import { Timestamp } from 'firebase-admin/firestore';
import { jsonResponse } from '../../../../lib/api';
import { getCurrentUser } from '../../../../lib/auth';
import { getAdminDb } from '../../../../lib/firebase/server';
import { AFORO_COMPLETO, clearRsvp, setRsvp } from '../../../../lib/firebase/rsvps';
import { addRsvpNotification, removeRsvpNotification } from '../../../../lib/firebase/notifications';
import { mapDocToEvent } from '../../../../lib/firebase/events';
import { despacharCorreo, encolarCorreos, enSegundoPlano } from '../../../../lib/email/cola';
import { getUserProfile } from '../../../../lib/firebase/users';

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

  // Evento de pago: hace falta un celular en el perfil, porque el pago se
  // cuadra por fuera y quien organiza necesita como contactar a la persona.
  // Es obligatorio desde la bienvenida, pero una cuenta anterior a eso puede
  // no tenerlo todavia: aqui se comprueba de nuevo, que es donde importa.
  const esDePago = typeof data.price === 'number' && data.price > 0;
  const perfil = await getUserProfile(user.uid).catch(() => null);

  if (esDePago && !perfil?.phone) {
    return jsonResponse(
      { error: 'Para asistir a un evento de pago necesitas un celular en tu perfil. Añádelo en Configuración.' },
      400,
    );
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

    // La confirmacion por correo, encolada y disparada sin esperarla. Va en su
    // propio try/catch y despues de responder porque la asistencia ya esta
    // guardada: un fallo del correo no puede convertir un RSVP correcto en un
    // error para quien acaba de pulsar el boton.
    //
    // `result.creado` es la misma guarda que usa la notificacion de arriba: un
    // POST repetido no vuelve a confirmar, asi que tampoco vuelve a escribir.
    if (result.creado && user.email) {
      try {
        const [correoId] = await encolarCorreos({
          evento: mapDocToEvent(event),
          tipo: 'confirmacion',
          destinatarios: [
            {
              uid: user.uid,
              correo: user.email,
              nombre: perfil?.firstName ?? user.name.split(' ')[0] ?? '',
              celular: perfil?.phone,
            },
          ],
          // En un evento de pago la confirmacion reserva el lugar sin enlace:
          // el enlace llega con el correo de pago confirmado.
          pagoPendiente: esDePago,
        });

        if (correoId) {
          enSegundoPlano(despacharCorreo(correoId));
        }
      } catch (error) {
        console.warn('No se pudo encolar la confirmación de asistencia:', error);
      }
    }

    // El enlace de reunion se entrega aqui, al confirmar, y solo aqui: la ficha
    // no lo lleva en el HTML de quien no ha confirmado, asi que este es el
    // unico camino por el que llega al navegador ademas del correo.
    // En un evento de pago, una asistencia recien creada esta pendiente de
    // pago y el enlace no se entrega: lo entrega quien organiza al confirmar.
    const meetingUrl =
      result.attending && !esDePago && data.modality !== 'presencial' && typeof data.meetingUrl === 'string'
        ? data.meetingUrl
        : undefined;

    return jsonResponse(
      {
        attending: result.attending,
        count: result.count,
        meetingUrl,
        pagoPendiente: esDePago,
        celular: esDePago ? perfil?.phone : undefined,
      },
      200,
    );
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
