import type { APIRoute } from 'astro';
import { jsonResponse } from '../../../lib/api';
import { getDisplayUser } from '../../../lib/auth';
import { createCommunity, getCommunityByOwner, getCommunityBySlug } from '../../../lib/firebase/communities';
import { slugify } from '../../../lib/slug';

export const POST: APIRoute = async ({ request, cookies }) => {
  const user = await getDisplayUser(cookies);

  if (!user) {
    return jsonResponse({ error: 'Debes iniciar sesión para crear una comunidad.' }, 401);
  }

  const body = await request.json().catch(() => null);

  if (!body || typeof body !== 'object') {
    return jsonResponse({ error: 'Petición inválida.' }, 400);
  }

  const { name, description, avatarUrl } = body as Record<string, unknown>;

  if (typeof name !== 'string' || name.trim().length < 3) {
    return jsonResponse({ error: 'El nombre de la comunidad debe tener al menos 3 caracteres.' }, 400);
  }

  if (description !== undefined && typeof description !== 'string') {
    return jsonResponse({ error: 'La descripción no es válida.' }, 400);
  }

  // Una comunidad por persona. Con varias, publicar obligaria a elegir en cada
  // evento, y hoy nadie ha pedido llevar dos a la vez.
  if (await getCommunityByOwner(user.uid)) {
    return jsonResponse({ error: 'Ya administras una comunidad.' }, 409);
  }

  const slug = slugify(name);

  if (!slug) {
    return jsonResponse({ error: 'El nombre debe incluir alguna letra o número.' }, 400);
  }

  if (await getCommunityBySlug(slug)) {
    return jsonResponse({ error: 'Ya existe una comunidad con ese nombre.' }, 409);
  }

  const community = await createCommunity({
    slug,
    name: name.trim(),
    description: typeof description === 'string' && description.trim() ? description.trim() : undefined,
    avatarUrl: typeof avatarUrl === 'string' && avatarUrl ? avatarUrl : undefined,
    ownerUid: user.uid,
  });

  return jsonResponse({ slug: community.slug }, 201);
};
