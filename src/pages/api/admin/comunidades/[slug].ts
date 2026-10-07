import type { APIRoute } from 'astro';
import { jsonResponse } from '../../../../lib/api';
import { getAdminUser } from '../../../../lib/auth';
import { deleteCommunity, getCommunityBySlug } from '../../../../lib/firebase/communities';
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
