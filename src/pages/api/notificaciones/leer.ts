import type { APIRoute } from 'astro';
import { jsonResponse } from '../../../lib/api';
import { getCurrentUser } from '../../../lib/auth';
import { markAllRead } from '../../../lib/firebase/notifications';

// Marcar todas como leidas. Se llama cuando se abre el panel: para quien
// revisa el campanario, mirar ES leer.
export const POST: APIRoute = async ({ cookies }) => {
  const user = await getCurrentUser(cookies);

  if (!user) {
    return jsonResponse({ error: 'Debes iniciar sesión.' }, 401);
  }

  try {
    await markAllRead(user.uid);
    return jsonResponse({ success: true, unread: 0 }, 200);
  } catch (error) {
    console.warn('No se pudieron marcar las notificaciones como leidas:', error);
    return jsonResponse({ error: 'No se pudieron marcar las notificaciones.' }, 500);
  }
};
