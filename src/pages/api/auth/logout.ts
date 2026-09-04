import type { APIRoute } from 'astro';
import { getAdminAuth } from '../../../lib/firebase/server';

export const POST: APIRoute = async ({ cookies }) => {
  const sessionCookie = cookies.get('__session')?.value;

  // Revocar los refresh tokens del usuario invalida tambien su cookie de sesion
  // en el servidor (verifySessionCookie va con checkRevoked): una cookie robada
  // deja de servir en cuanto la persona cierra sesion, en vez de seguir valida
  // hasta los 5 dias. El efecto colateral es cerrar las demas sesiones activas
  // de esa cuenta, que es lo que quiere quien esta cerrando la suya.
  if (sessionCookie) {
    try {
      const decoded = await getAdminAuth().verifySessionCookie(sessionCookie, false);
      await getAdminAuth().revokeRefreshTokens(decoded.uid);
    } catch (error) {
      // Cookie ya invalida: no hay nada que revocar, y el cierre igual procede.
      console.warn('No se pudo revocar la sesión en el servidor:', error);
    }
  }

  cookies.delete('__session', { path: '/' });

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
