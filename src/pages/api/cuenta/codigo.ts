import type { APIRoute } from 'astro';
import { randomInt } from 'node:crypto';
import { jsonResponse } from '../../../lib/api';
import { getCurrentUser } from '../../../lib/auth';
import { setDeletionCode } from '../../../lib/firebase/users';

const CODE_TTL_MS = 10 * 60 * 1000;

// Sin I, O, 0 ni 1: el codigo se lee de pantalla y se teclea a mano.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const POST: APIRoute = async ({ cookies }) => {
  const user = await getCurrentUser(cookies);

  if (!user) {
    return jsonResponse({ error: 'Debes iniciar sesión.' }, 401);
  }

  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }

  const expiresAt = Date.now() + CODE_TTL_MS;

  await setDeletionCode(user.uid, { code, expiresAt });

  // PENDIENTE: enviar el codigo al correo de la persona en vez de devolverlo.
  // El servidor ya lo emite y lo verifica, asi que ese cambio afecta solo al
  // canal de entrega: bastaria con no incluir `code` en esta respuesta.
  return jsonResponse({ code, expiresAt }, 200);
};
