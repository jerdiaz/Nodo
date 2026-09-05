import type { APIRoute } from 'astro';
import { jsonResponse } from '../../../../lib/api';
import { getAdminUser } from '../../../../lib/auth';
import { getAdminDb } from '../../../../lib/firebase/server';
import { deleteEventWithRsvps } from '../../../../lib/firebase/events';
import { deleteEventNotifications } from '../../../../lib/firebase/notifications';
import { deleteOwnedImage } from '../../../../lib/images';

// Borrar cualquier evento, sea de quien sea. Es la diferencia con el DELETE de
// /api/events/[id], que exige ser el organizador. El admin puede con los
// eventos de quien este bloqueado, que la cartelera ya no muestra.
export const DELETE: APIRoute = async ({ params, cookies }) => {
  const admin = await getAdminUser(cookies);

  if (!admin) {
    return jsonResponse({ error: 'No tienes permiso para administrar.' }, 403);
  }

  const id = params.id;

  if (!id) {
    return jsonResponse({ error: 'Falta el id del evento.' }, 400);
  }

  const db = getAdminDb();
  const doc = await db.collection('events').doc(id).get();

  if (!doc.exists) {
    return jsonResponse({ error: 'El evento no existe.' }, 404);
  }

  const data = doc.data() ?? {};
  const organizer = (data.organizer ?? {}) as { uid?: string };

  await deleteEventWithRsvps(id);

  // Los banners cuelgan de la carpeta de quien los subio (el organizador),
  // no de la del admin que borra.
  if (organizer.uid) {
    await deleteOwnedImage(data.bannerUrl, 'banner', organizer.uid);
    await deleteOwnedImage(data.bannerSmallUrl, 'banner', organizer.uid);
    await deleteEventNotifications(organizer.uid, id);
  }

  return jsonResponse({ success: true, slug: data.slug ?? id }, 200);
};
