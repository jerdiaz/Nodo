import type { AstroCookies } from 'astro';
import { getAdminAuth } from './firebase/server';

export interface CurrentUser {
  uid: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
}

export async function getCurrentUser(cookies: AstroCookies): Promise<CurrentUser | null> {
  const sessionCookie = cookies.get('__session')?.value;

  if (!sessionCookie) {
    return null;
  }

  try {
    const decodedToken = await getAdminAuth().verifySessionCookie(sessionCookie, true);

    return {
      uid: decodedToken.uid,
      name: decodedToken.name ?? decodedToken.email ?? 'Usuario',
      email: decodedToken.email ?? null,
      avatarUrl: decodedToken.picture ?? null,
    };
  } catch {
    return null;
  }
}
