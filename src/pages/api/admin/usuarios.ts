import type { APIRoute } from 'astro';
import { jsonResponse } from '../../../lib/api';
import { getAdminUser } from '../../../lib/auth';
import { getUidByUsername, setAdmin, setBlocked } from '../../../lib/firebase/users';

const ACCIONES = ['hacer-admin', 'quitar-admin', 'bloquear', 'desbloquear'] as const;

type Accion = (typeof ACCIONES)[number];

function esAccion(valor: unknown): valor is Accion {
  return typeof valor === 'string' && (ACCIONES as readonly string[]).includes(valor);
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const admin = await getAdminUser(cookies);

  if (!admin) {
    return jsonResponse({ error: 'No tienes permiso para administrar.' }, 403);
  }

  const body = await request.json().catch(() => null);
  const payload = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;

  const username = typeof payload.username === 'string' ? payload.username.trim().toLowerCase() : '';
  const accion = payload.accion;

  if (!username) {
    return jsonResponse({ error: 'Indica el nombre de usuario.' }, 400);
  }

  if (!esAccion(accion)) {
    return jsonResponse({ error: 'Acción no válida.' }, 400);
  }

  const targetUid = await getUidByUsername(username);

  if (!targetUid) {
    return jsonResponse({ error: `No existe ninguna cuenta con el usuario @${username}.` }, 404);
  }

  // Un admin no deberia poder quedarse sin administradores por error: si no
  // queda ninguno, nadie podria volver a nombrar a otro sin tocar la consola.
  if (accion === 'quitar-admin' && targetUid === admin.uid) {
    return jsonResponse({ error: 'No puedes quitarte el acceso de administrador a ti mismo.' }, 400);
  }

  switch (accion) {
    case 'hacer-admin':
      await setAdmin(targetUid, true);
      break;
    case 'quitar-admin':
      await setAdmin(targetUid, false);
      break;
    case 'bloquear':
      await setBlocked(targetUid, true);
      break;
    case 'desbloquear':
      await setBlocked(targetUid, false);
      break;
  }

  return jsonResponse({ success: true, username, accion }, 200);
};
