import { getAdminDb } from './server';
import type { UserProfile } from '../../types/profile';

function usersCollection() {
  return getAdminDb().collection('users');
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const doc = await usersCollection().doc(uid).get();

  if (!doc.exists) {
    return null;
  }

  const data = doc.data() ?? {};

  return {
    uid: doc.id,
    firstName: data.firstName ?? '',
    lastName: data.lastName,
    username: data.username,
    bio: data.bio,
    avatarUrl: data.avatarUrl,
    socials: data.socials ?? {},
    calendarToken: data.calendarToken,
  };
}

export async function getUidByCalendarToken(token: string): Promise<string | null> {
  const snapshot = await usersCollection().where('calendarToken', '==', token).limit(1).get();
  return snapshot.docs[0]?.id ?? null;
}

// Va aparte de saveUserProfile porque el token no lo edita nadie a mano: se
// genera y se revoca solo. El merge de saveUserProfile ya lo conserva, pero
// mezclarlo en el payload del formulario lo dejaria expuesto a que un cliente
// lo mandara en el cuerpo de PUT /api/perfil.
export async function setCalendarToken(uid: string, token: string): Promise<void> {
  await usersCollection().doc(uid).set({ calendarToken: token }, { merge: true });
}

// Consulta de igualdad sobre un campo suelto de una coleccion normal, que
// Firestore indexa por su cuenta: a diferencia del collectionGroup sobre
// rsvps, esta no necesita crear ningun indice.
export async function isUsernameTaken(username: string, ownUid: string): Promise<boolean> {
  const snapshot = await usersCollection().where('username', '==', username).limit(1).get();
  const [match] = snapshot.docs;

  return Boolean(match) && match!.id !== ownUid;
}

export async function getUidByUsername(username: string): Promise<string | null> {
  const snapshot = await usersCollection().where('username', '==', username).limit(1).get();
  return snapshot.docs[0]?.id ?? null;
}

export interface DeletionCode {
  code: string;
  expiresAt: number;
}

// El codigo lo emite y lo verifica el servidor, aunque hoy se muestre en
// pantalla. Asi, cuando pase a enviarse por correo, solo cambia el canal de
// entrega: la comprobacion ya vive donde debe.
export async function setDeletionCode(uid: string, code: DeletionCode): Promise<void> {
  await usersCollection().doc(uid).set({ deletionCode: code }, { merge: true });
}

export async function getDeletionCode(uid: string): Promise<DeletionCode | null> {
  const doc = await usersCollection().doc(uid).get();
  const stored = doc.data()?.deletionCode;

  if (!stored || typeof stored.code !== 'string' || typeof stored.expiresAt !== 'number') {
    return null;
  }

  return { code: stored.code, expiresAt: stored.expiresAt };
}

export async function deleteUserProfile(uid: string): Promise<void> {
  await usersCollection().doc(uid).delete();
}

export async function saveUserProfile(uid: string, profile: Omit<UserProfile, 'uid'>): Promise<void> {
  // merge para no borrar campos que se añadan al documento mas adelante y que
  // este formulario todavia no conozca.
  await usersCollection().doc(uid).set({ ...profile, updatedAt: new Date() }, { merge: true });
}
