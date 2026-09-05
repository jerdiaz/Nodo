import type { APIRoute } from 'astro';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { jsonResponse } from '../../../lib/api';
import { getCurrentUser } from '../../../lib/auth';
import { validateEventPayload } from '../../../lib/eventValidation';
import { getCommunityByOwner, toEventCommunity } from '../../../lib/firebase/communities';
import { deleteEventWithRsvps } from '../../../lib/firebase/events';
import { deleteEventNotifications } from '../../../lib/firebase/notifications';
import { getAdminDb } from '../../../lib/firebase/server';
import { deleteOwnedImage } from '../../../lib/images';

export const PUT: APIRoute = async ({ params, request, cookies }) => {
  const user = await getCurrentUser(cookies);

  if (!user) {
    return jsonResponse({ error: 'Debes iniciar sesión.' }, 401);
  }

  const id = params.id;
  if (!id) {
    return jsonResponse({ error: 'Falta el id del evento.' }, 400);
  }

  const db = getAdminDb();
  const docRef = db.collection('events').doc(id);
  const existing = await docRef.get();

  if (!existing.exists) {
    return jsonResponse({ error: 'Evento no encontrado.' }, 404);
  }

  const existingData = existing.data();
  if (existingData?.organizer?.uid !== user.uid) {
    return jsonResponse({ error: 'No tienes permiso para editar este evento.' }, 403);
  }

  const body = await request.json().catch(() => null);
  const validation = validateEventPayload(body, { allowPastStart: true });

  if ('error' in validation) {
    return jsonResponse({ error: validation.error }, 400);
  }

  const { startDate, endDate, ...rest } = validation.data;

  // Editar tambien puede cambiar a nombre de quien sale el evento. Se toca
  // solo si el formulario manda el campo: una peticion que no lo lleve deja la
  // comunidad como estaba en vez de borrarla por omision.
  const publishAs = (body as Record<string, unknown> | null)?.publishAs;
  let community: FirebaseFirestore.FieldValue | ReturnType<typeof toEventCommunity> | undefined;

  if (publishAs === 'persona') {
    community = FieldValue.delete();
  } else if (publishAs === 'comunidad') {
    const comunidad = await getCommunityByOwner(user.uid);
    community = comunidad ? toEventCommunity(comunidad) : FieldValue.delete();
  }

  await docRef.update({
    ...rest,
    startDate: Timestamp.fromDate(startDate),
    endDate: Timestamp.fromDate(endDate),
    ...(community === undefined ? {} : { community }),
  });

  // Si llega un banner nuevo, el anterior deja de estar referenciado por nadie.
  // Se borra despues de guardar: si el update fallara, no habriamos destruido
  // la imagen que el evento sigue usando. La guarda de propiedad impide que
  // alguien cuelgue su evento de la URL de la imagen de otro y luego la borre.
  const previousBanner = existingData?.bannerUrl;
  if (rest.bannerUrl && previousBanner && previousBanner !== rest.bannerUrl) {
    await deleteOwnedImage(previousBanner, 'banner', user.uid);
  }

  const previousBannerSmall = existingData?.bannerSmallUrl;
  if (rest.bannerSmallUrl && previousBannerSmall && previousBannerSmall !== rest.bannerSmallUrl) {
    await deleteOwnedImage(previousBannerSmall, 'banner', user.uid);
  }

  return jsonResponse({ success: true, slug: existingData?.slug ?? id }, 200);
};

export const DELETE: APIRoute = async ({ params, cookies }) => {
  const user = await getCurrentUser(cookies);

  if (!user) {
    return jsonResponse({ error: 'Debes iniciar sesión.' }, 401);
  }

  const id = params.id;
  if (!id) {
    return jsonResponse({ error: 'Falta el id del evento.' }, 400);
  }

  const db = getAdminDb();
  const docRef = db.collection('events').doc(id);
  const existing = await docRef.get();

  if (!existing.exists) {
    return jsonResponse({ error: 'Evento no encontrado.' }, 404);
  }

  const existingData = existing.data();
  if (existingData?.organizer?.uid !== user.uid) {
    return jsonResponse({ error: 'No tienes permiso para eliminar este evento.' }, 403);
  }

  await deleteEventWithRsvps(id);
  await deleteOwnedImage(existingData?.bannerUrl, 'banner', user.uid);
  await deleteOwnedImage(existingData?.bannerSmallUrl, 'banner', user.uid);

  // Las notificaciones que apuntaban a este evento dejan de llevar a algo.
  await deleteEventNotifications(user.uid, id);

  return jsonResponse({ success: true }, 200);
};
