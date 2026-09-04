import type { AstroCookies } from 'astro';
import { getAdminAuth } from './firebase/server';
import { getUserProfile } from './firebase/users';

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

// getCurrentUser() solo lee el token de sesión: el nombre y la foto que trae
// son los del proveedor (Google/Microsoft) en el momento del login, y no se
// actualizan si la persona edita su perfil después — la sesión no vuelve a
// pasar por el proveedor hasta que inicia sesión de nuevo. Para mostrar el
// nombre/foto que la persona eligió en Configuración hace falta cruzar con su
// perfil de Firestore, que es justo lo que hace esta función. Se usa solo
// donde el nombre se muestra o se guarda (Navbar, crear evento) — no en
// comprobaciones de dueño, que solo necesitan el uid y no vale la pena
// pagar la lectura extra a Firestore.
export async function getDisplayUser(cookies: AstroCookies): Promise<CurrentUser | null> {
  const user = await getCurrentUser(cookies);

  if (!user) {
    return null;
  }

  try {
    const profile = await getUserProfile(user.uid);

    if (profile) {
      return {
        ...user,
        name: [profile.firstName, profile.lastName].filter(Boolean).join(' ') || user.name,
        avatarUrl: profile.avatarUrl ?? user.avatarUrl,
      };
    }
  } catch (error) {
    console.warn('No se pudo obtener el perfil para mostrar el nombre actualizado:', error);
  }

  return user;
}
