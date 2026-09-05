import type { APIRoute } from 'astro';
import { jsonResponse } from '../../../lib/api';
import { getCurrentUser } from '../../../lib/auth';
import { getAdminDb } from '../../../lib/firebase/server';
import { countUnread, getNotifications, type NotificationItem } from '../../../lib/firebase/notifications';

// Lista las notificaciones de quien tiene la sesion y cuantas quedan sin leer.
// Con ?solo=conteo devuelve solo el numero sin leer, que es lo que la campana
// pide al cargar cada pagina: listar en cada visita arrastraria las lecturas
// de Firestore de todos los mensajes aunque no se abra el panel.
export const GET: APIRoute = async ({ url, cookies }) => {
  const user = await getCurrentUser(cookies);

  if (!user) {
    return jsonResponse({ error: 'Debes iniciar sesión.' }, 401);
  }

  const soloConteo = url.searchParams.get('solo') === 'conteo';

  try {
    const unread = await countUnread(user.uid);

    if (soloConteo) {
      return jsonResponse({ unread, items: [] }, 200);
    }

    let items = await getNotifications(user.uid, 25);

    // Las notificaciones de un evento que ya no existe no llevan a ningun
    // sitio: se descartan (el id del evento es el id del documento) y, de
    // paso, se limpian para que no vuelvan a aparecer.
    const vivos = new Set<string>();
    const refs = items.map((item) => getAdminDb().collection('events').doc(item.eventId));
    const existentes = await getAdminDb().getAll(...refs);

    existentes.forEach((doc) => {
      if (doc.exists) {
        vivos.add(doc.id);
      }
    });

    const muertas = items.filter((item) => !vivos.has(item.eventId));

    if (muertas.length > 0) {
      await Promise.all(
        muertas.map((item) =>
          getAdminDb().collection('notifications').doc(user.uid).collection('items').doc(item.id).delete(),
        ),
      );
    }

    items = items.filter((item) => vivos.has(item.eventId)) as NotificationItem[];

    return jsonResponse({ unread, items }, 200);
  } catch (error) {
    console.warn('No se pudieron obtener las notificaciones:', error);
    return jsonResponse({ error: 'No se pudieron obtener las notificaciones.' }, 500);
  }
};
