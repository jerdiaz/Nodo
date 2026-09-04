import type { APIRoute } from 'astro';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { jsonResponse } from '../../../lib/api';
import { getDisplayUser } from '../../../lib/auth';
import { validateEventPayload } from '../../../lib/eventValidation';
import { getAdminDb } from '../../../lib/firebase/server';
import { getCommunityByOwner, toEventCommunity } from '../../../lib/firebase/communities';
import { slugify } from '../../../lib/slug';

function randomSuffix(length = 4): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i += 1) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const user = await getDisplayUser(cookies);

  if (!user) {
    return jsonResponse({ error: 'Debes iniciar sesión para publicar un evento.' }, 401);
  }

  const body = await request.json().catch(() => null);
  const validation = validateEventPayload(body);

  if ('error' in validation) {
    return jsonResponse({ error: validation.error }, 400);
  }

  const { startDate, endDate, ...rest } = validation.data;
  const db = getAdminDb();

  // Quien administra una comunidad elige en el formulario si publica en su
  // nombre o en el suyo propio. Sin el campo se asume la comunidad, que es lo
  // que hacia antes de que se pudiera elegir.
  const publishAs = (body as Record<string, unknown> | null)?.publishAs;
  const comunidad = publishAs === 'persona' ? null : await getCommunityByOwner(user.uid);

  const baseSlug = slugify(rest.title) || 'evento';
  const data = {
    ...rest,
    startDate: Timestamp.fromDate(startDate),
    endDate: Timestamp.fromDate(endDate),
    organizer: {
      uid: user.uid,
      name: user.name,
      avatarUrl: user.avatarUrl ?? undefined,
    },
    community: comunidad ? toEventCommunity(comunidad) : undefined,
    createdAt: FieldValue.serverTimestamp(),
  };

  // create() falla si el documento ya existe, y el fallo es atomico: sin eso,
  // dos peticiones simultaneas con el mismo titulo pasarian ambas la
  // comprobacion previa y la segunda pisaria entera a la primera.
  let slug = baseSlug;
  let creado = false;

  for (let attempt = 0; attempt < 5 && !creado; attempt += 1) {
    try {
      await db.collection('events').doc(slug).create({ ...data, slug });
      creado = true;
    } catch (error) {
      const code = (error as { code?: string } | undefined)?.code;

      if (code !== 'already-exists') {
        throw error;
      }

      slug = `${baseSlug}-${randomSuffix()}`;
    }
  }

  if (!creado) {
    return jsonResponse({ error: 'No se pudo reservar un título único. Inténtalo de nuevo.' }, 409);
  }

  return jsonResponse({ success: true, slug }, 201);
};
