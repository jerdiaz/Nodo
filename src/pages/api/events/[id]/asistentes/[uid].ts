import type { APIRoute } from 'astro';
import { jsonResponse } from '../../../../../lib/api';
import { getCurrentUser } from '../../../../../lib/auth';
import { getAdminDb } from '../../../../../lib/firebase/server';
import { mapDocToEvent } from '../../../../../lib/firebase/events';
import { SIN_ASISTENCIA, setPagoConfirmado } from '../../../../../lib/firebase/rsvps';
import { despacharCorreo, encolarCorreos, enSegundoPlano, resolverDestinatarios } from '../../../../../lib/email/cola';

// Quien organiza un evento de pago marca cada asistencia como pagada cuando le
// llega el dinero por fuera. Innvita no cobra: esto es el registro de que el
// pago ocurrio, y es lo que abre el enlace de reunion a esa persona.
//
// Solo el organizador. No un admin: el dinero lo recibe quien organiza y es
// quien sabe si llego.
export const PUT: APIRoute = async ({ params, request, cookies }) => {
  const user = await getCurrentUser(cookies);

  if (!user) {
    return jsonResponse({ error: 'Debes iniciar sesión.' }, 401);
  }

  const { id, uid } = params;

  if (!id || !uid) {
    return jsonResponse({ error: 'Faltan el evento o la persona.' }, 400);
  }

  const doc = await getAdminDb().collection('events').doc(id).get();

  if (!doc.exists) {
    return jsonResponse({ error: 'Evento no encontrado.' }, 404);
  }

  const data = doc.data() ?? {};

  if ((data.organizer as { uid?: string } | undefined)?.uid !== user.uid) {
    return jsonResponse({ error: 'Solo quien organiza puede confirmar pagos.' }, 403);
  }

  if (!(typeof data.price === 'number' && data.price > 0)) {
    return jsonResponse({ error: 'Este evento es gratis: no hay pago que confirmar.' }, 400);
  }

  const body = await request.json().catch(() => null);
  const confirmado = (body as Record<string, unknown> | null)?.confirmado;

  if (typeof confirmado !== 'boolean') {
    return jsonResponse({ error: 'Indica si el pago está confirmado.' }, 400);
  }

  let cambio: boolean;

  try {
    ({ cambio } = await setPagoConfirmado(id, uid, confirmado));
  } catch (error) {
    if (error instanceof Error && error.message === SIN_ASISTENCIA) {
      return jsonResponse({ error: 'Esa persona no tiene asistencia confirmada en este evento.' }, 404);
    }
    throw error;
  }

  // Solo al pasar de pendiente a confirmado sale el correo con el enlace y la
  // invitacion completa. Desmarcar no avisa: es una correccion de quien
  // organiza, no un cambio para la persona. Y solo si de verdad cambio, para
  // que un doble clic no mande dos correos.
  if (confirmado && cambio) {
    try {
      const destinatarios = await resolverDestinatarios([uid], false);
      const [correoId] = await encolarCorreos({
        evento: mapDocToEvent(doc),
        tipo: 'pago-confirmado',
        destinatarios,
      });

      if (correoId) {
        enSegundoPlano(despacharCorreo(correoId));
      }
    } catch (error) {
      console.warn('No se pudo encolar el correo de pago confirmado:', error);
    }
  }

  return jsonResponse({ success: true, pagoConfirmado: confirmado }, 200);
};
