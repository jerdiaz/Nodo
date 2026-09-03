import type { APIRoute } from 'astro';
import { randomBytes } from 'node:crypto';
import { jsonResponse } from '../../lib/api';
import { getCurrentUser } from '../../lib/auth';
import { setCalendarToken } from '../../lib/firebase/users';

// Genera (o regenera) el token del feed iCal. Regenerar invalida el enlace
// anterior, que es la unica forma de revocar el acceso de quien lo tuviera.
export const POST: APIRoute = async ({ cookies }) => {
  const user = await getCurrentUser(cookies);

  if (!user) {
    return jsonResponse({ error: 'Debes iniciar sesión.' }, 401);
  }

  // 32 bytes de aleatoriedad criptografica: el token es la unica credencial
  // del feed, asi que no puede ser adivinable.
  const token = randomBytes(32).toString('base64url');

  await setCalendarToken(user.uid, token);

  return jsonResponse({ token }, 200);
};
