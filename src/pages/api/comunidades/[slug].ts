import type { APIRoute } from 'astro';
import { jsonResponse } from '../../../lib/api';
import { getCurrentUser } from '../../../lib/auth';
import { validateCommunityPayload } from '../../../lib/communityValidation';
import { getCommunityBySlug, updateCommunity } from '../../../lib/firebase/communities';

export const PUT: APIRoute = async ({ params, request, cookies }) => {
  const user = await getCurrentUser(cookies);

  if (!user) {
    return jsonResponse({ error: 'Debes iniciar sesión.' }, 401);
  }

  const community = await getCommunityBySlug(params.slug ?? '');

  if (!community) {
    return jsonResponse({ error: 'La comunidad no existe.' }, 404);
  }

  // La propiedad se comprueba aqui, en el codigo, leyendo el documento antes de
  // escribirlo: el Admin SDK se salta firestore.rules, asi que las reglas no
  // sirven de barrera para lo que pasa por esta ruta.
  if (community.ownerUid !== user.uid) {
    return jsonResponse({ error: 'Solo quien administra la comunidad puede editarla.' }, 403);
  }

  const validated = validateCommunityPayload(await request.json().catch(() => null));

  if ('error' in validated) {
    return jsonResponse({ error: validated.error }, 400);
  }

  // El slug no cambia aunque cambie el nombre, igual que en los eventos: es el
  // id del documento y la URL que ya puede estar compartida por ahi.
  await updateCommunity(community.id, validated.data);

  return jsonResponse({ slug: community.slug }, 200);
};
