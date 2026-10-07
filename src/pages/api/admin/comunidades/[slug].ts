import type { APIRoute } from 'astro';
import { jsonResponse } from '../../../../lib/api';
import { getAdminUser } from '../../../../lib/auth';
import { deleteCommunity, getCommunityBySlug, setCommunityVerified } from '../../../../lib/firebase/communities';
import { deleteOwnedImage } from '../../../../lib/images';

// Borrar cualquier comunidad, sea de quien sea. Es la diferencia con el DELETE
// de /api/comunidades/[slug], que exige administrar esa comunidad. Los eventos
// que publico no se borran: deleteCommunity los deja a nombre de quien los creo.
export const DELETE: APIRoute = async ({ params, cookies }) => {
  const admin = await getAdminUser(cookies);

  if (!admin) {
    return jsonResponse({ error: 'No tienes permiso para administrar.' }, 403);
  }

  const community = await getCommunityBySlug(params.slug ?? '');

  if (!community) {
    return jsonResponse({ error: 'La comunidad no existe.' }, 404);
  }

  await deleteCommunity(community.id);

  // La foto cuelga de la carpeta del dueño, no de la del admin que borra.
  await deleteOwnedImage(community.avatarUrl, 'avatar', community.ownerUid);

  return jsonResponse({ success: true }, 200);
};

// Poner o quitar la insignia de comunidad oficial. Va aqui y no en
// /api/admin/verificacion porque aquella verifica cuentas por @usuario o uid,
// y una comunidad no es una cuenta.
export const PUT: APIRoute = async ({ params, request, cookies }) => {
  const admin = await getAdminUser(cookies);

  if (!admin) {
    return jsonResponse({ error: 'No tienes permiso para administrar.' }, 403);
  }

  const community = await getCommunityBySlug(params.slug ?? '');

  if (!community) {
    return jsonResponse({ error: 'La comunidad no existe.' }, 404);
  }

  const body = await request.json().catch(() => null);
  const verified = (body as Record<string, unknown> | null)?.verified;

  if (typeof verified !== 'boolean') {
    return jsonResponse({ error: 'Indica si la comunidad queda verificada o no.' }, 400);
  }

  await setCommunityVerified(community.id, verified);

  return jsonResponse({ success: true, verified }, 200);
};
