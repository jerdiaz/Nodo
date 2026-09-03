import type { APIRoute } from 'astro';
import { jsonResponse } from '../../../lib/api';
import { getCurrentUser } from '../../../lib/auth';
import { isUsernameTaken } from '../../../lib/firebase/users';
import { USERNAME_RULES, isValidUsername } from '../../../lib/profileValidation';

// Disponibilidad de un nombre de usuario, para avisar mientras se escribe en
// vez de solo al enviar. Exige sesion: los nombres de usuario son publicos,
// pero un endpoint abierto invitaria a enumerarlos en masa.
export const GET: APIRoute = async ({ params, cookies }) => {
  const user = await getCurrentUser(cookies);

  if (!user) {
    return jsonResponse({ error: 'Debes iniciar sesión.' }, 401);
  }

  const username = (params.username ?? '').trim().toLowerCase();

  if (!isValidUsername(username)) {
    return jsonResponse({ available: false, reason: USERNAME_RULES }, 200);
  }

  const taken = await isUsernameTaken(username, user.uid);

  return jsonResponse(
    { available: !taken, reason: taken ? 'Ese nombre de usuario ya está en uso.' : null },
    200,
  );
};
