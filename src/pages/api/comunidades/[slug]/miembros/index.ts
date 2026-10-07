import type { APIRoute } from 'astro';
import { jsonResponse } from '../../../../../lib/api';
import { getCurrentUser, getDisplayUser } from '../../../../../lib/auth';
import { getCommunityBySlug, leaveMembership, requestMembership } from '../../../../../lib/firebase/communities';
import {
  addMembershipRequestNotification,
  removeMembershipRequestNotification,
} from '../../../../../lib/firebase/notifications';
import { getUserProfile } from '../../../../../lib/firebase/users';

// Pedir y salir comparten ruta, igual que unirse.ts con seguir. A diferencia
// de seguir, esto si concede permiso de publicar a nombre de la comunidad
// -en cuanto alguien que administra lo apruebe-, por eso queda pendiente en
// vez de activarse al momento.
export const POST: APIRoute = async ({ params, cookies }) => {
  // getDisplayUser y no getCurrentUser: el aviso al dueño lleva el nombre del
  // perfil, no el de la cuenta de Google, si la persona ya lo completo.
  const user = await getDisplayUser(cookies);

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

  const { membership, nueva } = await requestMembership(community.id, user.uid);

  // Un fallo al avisar no deshace la solicitud, que ya quedo guardada y se ve
  // igual en la ficha de la comunidad.
  if (nueva) {
    const perfil = await getUserProfile(user.uid).catch(() => null);

    await addMembershipRequestNotification({
      toUid: community.ownerUid,
      fromUid: user.uid,
      actorName: user.name,
      imageUrl: perfil?.avatarUrl,
      community: { id: community.id, slug: community.slug, name: community.name },
    }).catch((error: unknown) => console.warn('No se pudo avisar de la solicitud:', error));
  }

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

  // Si se va con la solicitud aun pendiente, el aviso al dueño ya no pide nada.
  await removeMembershipRequestNotification(community.ownerUid, community.id, user.uid).catch(() => {});

  return jsonResponse({ status: null }, 200);
};
