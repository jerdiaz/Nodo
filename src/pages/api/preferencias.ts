import type { APIRoute } from 'astro';
import { jsonResponse } from '../../lib/api';
import { getCurrentUser } from '../../lib/auth';
import { setEmailAvisos } from '../../lib/firebase/users';

// Endpoint propio en vez de meter la preferencia en PUT /api/perfil: ese
// valida el formulario entero y exige el nombre, asi que un cambio de un solo
// interruptor tendria que reenviar todo el perfil para no borrarlo. Es la misma
// razon por la que el token de calendario tiene el suyo.
export const PUT: APIRoute = async ({ request, cookies }) => {
  const user = await getCurrentUser(cookies);

  if (!user) {
    return jsonResponse({ error: 'Debes iniciar sesión.' }, 401);
  }

  const body = await request.json().catch(() => null);
  const emailAvisos = (body as Record<string, unknown> | null)?.emailAvisos;

  if (typeof emailAvisos !== 'boolean') {
    return jsonResponse({ error: 'Valor de preferencia inválido.' }, 400);
  }

  await setEmailAvisos(user.uid, emailAvisos);

  return jsonResponse({ success: true }, 200);
};
