import type { APIRoute } from 'astro';
import { jsonResponse } from '../../lib/api';
import { getCurrentUser } from '../../lib/auth';
import { claimUsername, getUserProfile, saveUserProfile } from '../../lib/firebase/users';
import { validateProfilePayload } from '../../lib/profileValidation';
import { deleteOwnedImage } from '../../lib/images';

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
  const existing = await getUserProfile(user.uid);

  try {
    await claimUsername(user.uid, validation.data.username, existing?.username);
  } catch (error) {
    if ((error as Error).message === 'USERNAME_TAKEN') {
      return jsonResponse({ error: 'Ese nombre de usuario ya está en uso.' }, 409);
    }
    throw error;
  }

  await saveUserProfile(user.uid, validation.data);

  // Si la foto cambio o se quito, la anterior deja de estar referenciada. Se
  // borra solo si cuelga de la carpeta de quien la subio.
  const previousAvatar = existing?.avatarUrl;
  if (previousAvatar && previousAvatar !== validation.data.avatarUrl) {
    await deleteOwnedImage(previousAvatar, 'avatar', user.uid);
  }

  return jsonResponse({ success: true }, 200);
};
