import type { APIRoute } from 'astro';
import { jsonResponse } from '../../../lib/api';
import { getDisplayUser } from '../../../lib/auth';
import { validateCommunityPayload } from '../../../lib/communityValidation';
import { createCommunity, getCommunityByOwner, getCommunityBySlug } from '../../../lib/firebase/communities';
import { slugify } from '../../../lib/slug';

export const POST: APIRoute = async ({ request, cookies }) => {
  const user = await getDisplayUser(cookies);

  if (!user) {
    return jsonResponse({ error: 'Debes iniciar sesión para crear una comunidad.' }, 401);
  }

  const validated = validateCommunityPayload(await request.json().catch(() => null));

  if ('error' in validated) {
    return jsonResponse({ error: validated.error }, 400);
  }

  // Una comunidad por persona. Con varias, publicar obligaria a elegir en cada
  // evento, y hoy nadie ha pedido llevar dos a la vez.
  if (await getCommunityByOwner(user.uid)) {
    return jsonResponse({ error: 'Ya administras una comunidad.' }, 409);
  }

  const slug = slugify(validated.data.name);

  if (!slug) {
    return jsonResponse({ error: 'El nombre debe incluir alguna letra o número.' }, 400);
  }

  if (await getCommunityBySlug(slug)) {
    return jsonResponse({ error: 'Ya existe una comunidad con ese nombre.' }, 409);
  }

  const community = await createCommunity({ slug, ...validated.data, ownerUid: user.uid }).catch(
    (error: unknown) => {
      // create() falla de forma atomica si el slug se tomo entre la
      // comprobacion y la escritura: es la misma colision, detectada tarde.
      if ((error as { code?: string } | undefined)?.code === 'already-exists') {
        return null;
      }
      throw error;
    },
  );

  if (!community) {
    return jsonResponse({ error: 'Ya existe una comunidad con ese nombre.' }, 409);
  }

  return jsonResponse({ slug: community.slug }, 201);
};
