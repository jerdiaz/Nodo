import type { AstroCookies } from 'astro';
import { getAdminAuth } from './firebase/server';

export interface CurrentUser {
  uid: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
}

// La fecha de alta no viaja en la cookie de sesión: vive en los metadatos de
// Firebase Auth y hay que pedirla aparte. Devuelve null en vez de lanzar
// porque no todos los uid existen en Auth — los organizadores sembrados por
// scripts/seed.mjs son inventados y responden auth/user-not-found.
export async function getAccountCreatedAt(uid: string): Promise<Date | null> {
  try {
    const record = await getAdminAuth().getUser(uid);
    const createdAt = record.metadata.creationTime;
    return createdAt ? new Date(createdAt) : null;
  } catch {
    return null;
  }
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
