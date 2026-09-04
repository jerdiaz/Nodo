import type { APIRoute } from 'astro';
import { jsonResponse } from '../../../../lib/api';
import { getCurrentUser } from '../../../../lib/auth';
import { getCommunityBySlug, isMember, joinCommunity, leaveCommunity } from '../../../../lib/firebase/communities';

// Unirse y salir comparten ruta y se distinguen por el metodo, igual que el
// rsvp de un evento: es la misma accion sobre el mismo recurso.
export const POST: APIRoute = async ({ params, cookies }) => {
  const user = await getCurrentUser(cookies);

  if (!user) {
    return jsonResponse({ error: 'Debes iniciar sesión para unirte.' }, 401);
  }

  const community = await getCommunityBySlug(params.slug ?? '');

  if (!community) {
    return jsonResponse({ error: 'La comunidad no existe.' }, 404);
  }

  if (!(await isMember(community.id, user.uid))) {
    await joinCommunity(community.id, user.uid);
  }

  return jsonResponse({ joined: true }, 200);
};

export const DELETE: APIRoute = async ({ params, cookies }) => {
  const user = await getCurrentUser(cookies);

  if (!user) {
    return jsonResponse({ error: 'Debes iniciar sesión.' }, 401);
  }

  const community = await getCommunityBySlug(params.slug ?? '');

  if (!community) {
    return jsonResponse({ error: 'La comunidad no existe.' }, 404);
  }

  // Quien la administra no puede salirse: quedaria una comunidad publicando
  // eventos sin nadie dentro.
  if (community.ownerUid === user.uid) {
    return jsonResponse({ error: 'Administras esta comunidad, no puedes salir de ella.' }, 400);
  }

  await leaveCommunity(community.id, user.uid);
  return jsonResponse({ joined: false }, 200);
};
