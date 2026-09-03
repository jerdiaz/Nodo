import type { APIRoute } from 'astro';
import { jsonResponse } from '../../lib/api';
import { getCurrentUser } from '../../lib/auth';
import { isUsernameTaken, saveUserProfile } from '../../lib/firebase/users';
import { validateProfilePayload } from '../../lib/profileValidation';

export const PUT: APIRoute = async ({ request, cookies }) => {
  const user = await getCurrentUser(cookies);

  if (!user) {
    return jsonResponse({ error: 'Debes iniciar sesión.' }, 401);
  }

  const body = await request.json().catch(() => null);
  const validation = validateProfilePayload(body);

  if ('error' in validation) {
    return jsonResponse({ error: validation.error }, 400);
  }

  // El uid sale siempre de la cookie de sesion, nunca del cuerpo: si no,
  // cualquiera podria editar el perfil ajeno mandando otro uid.
  if (validation.data.username) {
    const taken = await isUsernameTaken(validation.data.username, user.uid);

    if (taken) {
      return jsonResponse({ error: 'Ese nombre de usuario ya está en uso.' }, 409);
    }
  }

  await saveUserProfile(user.uid, validation.data);

  return jsonResponse({ success: true }, 200);
};
