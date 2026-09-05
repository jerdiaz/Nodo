import type { APIRoute } from 'astro';
import { jsonResponse } from '../../../../lib/api';
import { getAdminUser } from '../../../../lib/auth';
import { getAdminAuth } from '../../../../lib/firebase/server';
import { getUidByUsername, getUserProfile } from '../../../../lib/firebase/users';

// Resumen de una cuenta para el panel: quien la busca por @usuario ve de
// quién se trata (nombre, correo) y su estado antes de tocar nada. El correo
// se pide a Firebase Auth, donde vive; no esta en el perfil de Firestore.
export const GET: APIRoute = async ({ params, cookies }) => {
  const admin = await getAdminUser(cookies);

  if (!admin) {
    return jsonResponse({ error: 'No tienes permiso para administrar.' }, 403);
  }

  const username = (params.username ?? '').trim().toLowerCase();

  if (!username) {
    return jsonResponse({ error: 'Indica el nombre de usuario.' }, 400);
  }

  const uid = await getUidByUsername(username);

  if (!uid) {
    return jsonResponse({ error: `No existe ninguna cuenta con el usuario @${username}.` }, 404);
  }

  const profile = await getUserProfile(uid);

  let email: string | null = null;

  try {
    const record = await getAdminAuth().getUser(uid);
    email = record.email ?? null;
  } catch (error) {
    console.warn(`No se pudo obtener el correo de ${uid}:`, error);
  }

  return jsonResponse(
    {
      success: true,
      username,
      uid,
      nombre: profile
        ? [profile.firstName, profile.lastName].filter(Boolean).join(' ') || null
        : null,
      avatarUrl: profile?.avatarUrl ?? null,
      email,
      admin: profile?.admin === true,
      blocked: profile?.blocked === true,
      verification: profile?.verification ?? null,
      tienePerfil: Boolean(profile),
    },
    200,
  );
};
