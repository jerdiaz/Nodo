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
    // paso, se limpian para que no vuelvan a aparecer. Las solicitudes no
    // cuelgan de un evento sino de una comunidad, y se comprueba esa.
    const destino = (item: NotificationItem): string =>
      item.type === 'solicitud' ? `communities/${item.communityId ?? ''}` : `events/${item.eventId}`;

    const conDestino = items.filter((item) => (item.type === 'solicitud' ? item.communityId : item.eventId));
    const existentes = conDestino.length > 0
      ? await getAdminDb().getAll(...conDestino.map((item) => getAdminDb().doc(destino(item))))
      : [];

    const vivos = new Set(existentes.filter((doc) => doc.exists).map((doc) => doc.ref.path));
    const muertas = items.filter((item) => !vivos.has(destino(item)));

    if (muertas.length > 0) {
      await Promise.all(
        muertas.map((item) =>
          getAdminDb().collection('notifications').doc(user.uid).collection('items').doc(item.id).delete(),
        ),
      );
    }

    items = items.filter((item) => vivos.has(destino(item)));

    return jsonResponse({ unread, items }, 200);
  } catch (error) {
    console.warn('No se pudieron obtener las notificaciones:', error);
    return jsonResponse({ error: 'No se pudieron obtener las notificaciones.' }, 500);
  }
};
