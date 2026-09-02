import type { APIRoute } from 'astro';
import { getAdminAuth } from '../../../lib/firebase/server';

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

    return new Response(JSON.stringify({ success: true }), {
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
