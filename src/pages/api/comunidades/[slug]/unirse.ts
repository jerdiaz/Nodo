import type { APIRoute } from 'astro';
import { jsonResponse } from '../../../../lib/api';
import { getCurrentUser } from '../../../../lib/auth';
import { followCommunity, getCommunityBySlug, isFollowing, unfollowCommunity } from '../../../../lib/firebase/communities';

// Seguir y dejar de seguir comparten ruta y se distinguen por el metodo, igual
// que el rsvp de un evento: es la misma accion sobre el mismo recurso. Esto no
// da permiso de publicar a nombre de la comunidad -eso es ser miembro, que se
// pide y se aprueba aparte-, asi que no hace falta comprobar nada mas que la
// sesion.
export const POST: APIRoute = async ({ params, cookies }) => {
  const user = await getCurrentUser(cookies);

  if (!user) {
    return jsonResponse({ error: 'Debes iniciar sesión para seguir esta comunidad.' }, 401);
  }

  const community = await getCommunityBySlug(params.slug ?? '');

  if (!community) {
    return jsonResponse({ error: 'La comunidad no existe.' }, 404);
  }

  if (!(await isFollowing(community.id, user.uid))) {
    await followCommunity(community.id, user.uid);
  }

  return jsonResponse({ following: true }, 200);
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

  await unfollowCommunity(community.id, user.uid);
  return jsonResponse({ following: false }, 200);
};
