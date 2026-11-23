import type { APIRoute } from 'astro';
import { jsonResponse } from '../../../../../lib/api';
import { getAdminUser } from '../../../../../lib/auth';
import { mapDocToEvent } from '../../../../../lib/firebase/events';
import { getAsistentesAdmin } from '../../../../../lib/firebase/rsvps';
import { getAdminDb } from '../../../../../lib/firebase/server';

// Asistentes de un evento con todo lo que el admin necesita ver: nombre,
// usuario, correo, estado de la cuenta y cuando confirmo. Es el unico sitio
// donde se exponen correos de eventos gratuitos, y por eso exige ser
// administrador. La descarga en Excel (asistentes.xlsx) sale de los mismos
// datos.
export const GET: APIRoute = async ({ params, cookies }) => {
  const admin = await getAdminUser(cookies);

  if (!admin) {
    return jsonResponse({ error: 'No tienes permiso para administrar.' }, 403);
  }

  const id = params.id;

  if (!id) {
    return jsonResponse({ error: 'Falta el id del evento.' }, 400);
  }

  const doc = await getAdminDb().collection('events').doc(id).get();

  if (!doc.exists) {
    return jsonResponse({ error: 'El evento no existe.' }, 404);
  }

  const filas = await getAsistentesAdmin(mapDocToEvent(doc));

  // El celular y el pago no viajan a la tabla del panel: no los pinta. Solo
  // van en la descarga.
  const asistentes = filas.map((fila) => ({
    uid: fila.uid,
    nombre: fila.nombre,
    username: fila.username,
    avatarUrl: fila.avatarUrl,
    email: fila.email,
    verification: fila.verification,
    admin: fila.admin,
    blocked: fila.blocked,
    confirmadoEn: fila.confirmadoEl ? fila.confirmadoEl.toISOString() : null,
  }));

  return jsonResponse({ success: true, evento: { id, title: doc.data()?.title }, asistentes }, 200);
};
