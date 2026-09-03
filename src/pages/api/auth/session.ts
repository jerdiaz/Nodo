import type { APIRoute } from 'astro';
import { getAdminAuth } from '../../../lib/firebase/server';
import { getUserProfile } from '../../../lib/firebase/users';

const SESSION_EXPIRES_IN_MS = 60 * 60 * 24 * 5 * 1000;

export const POST: APIRoute = async ({ request, cookies }) => {
  const body = await request.json().catch(() => null);
  const idToken = body && typeof body === 'object' ? (body as Record<string, unknown>).idToken : null;

  if (typeof idToken !== 'string' || !idToken) {
    return new Response(JSON.stringify({ error: 'Falta idToken.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // Se verifica el idToken para conocer el uid: createSessionCookie devuelve
    // la cookie pero no dice de quien es, y hace falta para saber si esta
    // persona ya tiene perfil.
    const decoded = await getAdminAuth().verifyIdToken(idToken);

    const sessionCookie = await getAdminAuth().createSessionCookie(idToken, {
      expiresIn: SESSION_EXPIRES_IN_MS,
    });

    cookies.set('__session', sessionCookie, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_EXPIRES_IN_MS / 1000,
    });

    // Quien entra por Google o Microsoft llega con el nombre que tenga alli,
    // que puede no ser el que quiere mostrar, y sin nombre de usuario. Se
    // avisa aqui para que el cliente lo lleve al paso de bienvenida en vez de
    // dejarlo en la home sin saber que puede cambiarlo.
    let needsOnboarding = false;

    try {
      const profile = await getUserProfile(decoded.uid);
      needsOnboarding = !profile?.username;
    } catch (error) {
      // Si Firestore falla, entrar es mas importante que dar la bienvenida.
      console.warn('No se pudo comprobar el perfil tras iniciar sesión:', error);
    }

    return new Response(JSON.stringify({ success: true, needsOnboarding }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('No se pudo crear la cookie de sesión:', error);
    return new Response(JSON.stringify({ error: 'No se pudo iniciar sesión.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
