import type { APIRoute } from 'astro';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { jsonResponse } from '../../../lib/api';
import { getDisplayUser } from '../../../lib/auth';
import { validateEventPayload } from '../../../lib/eventValidation';
import { getAdminDb } from '../../../lib/firebase/server';
import { canPublishForCommunity, getCommunityBySlug, toEventCommunity } from '../../../lib/firebase/communities';
import { slugify } from '../../../lib/slug';
import { contarEventoCreado } from '../../../lib/firebase/metricas';

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

  if (user.isBlocked) {
    return jsonResponse({ error: 'Tu cuenta está bloqueada y no puede publicar eventos.' }, 403);
  }

  const body = await request.json().catch(() => null);
  const validation = validateEventPayload(body);

  if ('error' in validation) {
    return jsonResponse({ error: validation.error }, 400);
  }

  const { startDate, endDate, ...rest } = validation.data;
  const db = getAdminDb();

  // Quien pertenece a una o mas comunidades elige en el formulario si publica
  // en su nombre o en el de una de ellas. El formulario manda cual con
  // `communityId` porque, a diferencia de antes, puede haber mas de una
  // posible.
  const publishAs = (body as Record<string, unknown> | null)?.publishAs;
  const communityId = (body as Record<string, unknown> | null)?.communityId;
  let comunidad = null;

  if (publishAs === 'comunidad') {
    if (typeof communityId !== 'string' || !communityId) {
      return jsonResponse({ error: 'Falta elegir a nombre de qué comunidad publicas.' }, 400);
    }

    comunidad = await getCommunityBySlug(communityId);

    if (!comunidad || !(await canPublishForCommunity(comunidad, user.uid))) {
      return jsonResponse({ error: 'No puedes publicar a nombre de esa comunidad.' }, 403);
    }
  }

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

  // Se cuenta aqui y no leyendo la coleccion: un evento borrado sale de ella,
  // y "cuantos se crearon" no deberia bajar porque alguien borrara el suyo.
  void contarEventoCreado().catch(() => {});

  return jsonResponse({ success: true, slug }, 201);
};
