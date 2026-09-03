import type { APIRoute } from 'astro';
import { jsonResponse } from '../../../lib/api';
import { getCurrentUser } from '../../../lib/auth';
import { getUidByUsername, isAdmin, setVerification } from '../../../lib/firebase/users';
import type { VerificationType } from '../../../types/profile';

const VALID: VerificationType[] = ['persona', 'comunidad'];

export const PUT: APIRoute = async ({ request, cookies }) => {
  const user = await getCurrentUser(cookies);

  if (!user) {
    return jsonResponse({ error: 'Debes iniciar sesión.' }, 401);
  }

  // La condicion de administrador se comprueba contra Firestore en cada
  // peticion, no se deduce de la sesion ni de nada que mande el cliente.
  if (!(await isAdmin(user.uid))) {
    return jsonResponse({ error: 'No tienes permiso para verificar cuentas.' }, 403);
  }

  const body = await request.json().catch(() => null);
  const payload = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;

  const username = typeof payload.username === 'string' ? payload.username.trim().toLowerCase() : '';

  if (!username) {
    return jsonResponse({ error: 'Indica el nombre de usuario.' }, 400);
  }

  const raw = payload.verification;
  const verification = raw === null ? null : VALID.find((value) => value === raw);

  if (verification === undefined) {
    return jsonResponse({ error: 'El tipo de verificación no es válido.' }, 400);
  }

  const targetUid = await getUidByUsername(username);

  if (!targetUid) {
    return jsonResponse({ error: `No existe ninguna cuenta con el usuario @${username}.` }, 404);
  }

  await setVerification(targetUid, verification);

  return jsonResponse({ success: true, username, verification }, 200);
};
