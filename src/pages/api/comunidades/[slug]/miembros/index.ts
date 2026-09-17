import type { APIRoute } from 'astro';
import { jsonResponse } from '../../../../../lib/api';
import { getCurrentUser } from '../../../../../lib/auth';
import { getCommunityBySlug, leaveMembership, requestMembership } from '../../../../../lib/firebase/communities';

// Pedir y salir comparten ruta, igual que unirse.ts con seguir. A diferencia
// de seguir, esto si concede permiso de publicar a nombre de la comunidad
// -en cuanto alguien que administra lo apruebe-, por eso queda pendiente en
// vez de activarse al momento.
export const POST: APIRoute = async ({ params, cookies }) => {
  const user = await getCurrentUser(cookies);

  if (!user) {
    return jsonResponse({ error: 'Debes iniciar sesión para pedir unirte.' }, 401);
  }

  const community = await getCommunityBySlug(params.slug ?? '');

  if (!community) {
    return jsonResponse({ error: 'La comunidad no existe.' }, 404);
  }

  if (community.ownerUid === user.uid) {
    return jsonResponse({ error: 'Ya administras esta comunidad.' }, 400);
  }

  const membership = await requestMembership(community.id, user.uid);
  return jsonResponse({ status: membership.status }, 200);
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

  await leaveMembership(community.id, user.uid);
  return jsonResponse({ status: null }, 200);
};
