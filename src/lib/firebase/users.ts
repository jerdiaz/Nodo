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
  };
}

// Consulta de igualdad sobre un campo suelto de una coleccion normal, que
// Firestore indexa por su cuenta: a diferencia del collectionGroup sobre
// rsvps, esta no necesita crear ningun indice.
export async function isUsernameTaken(username: string, ownUid: string): Promise<boolean> {
  const snapshot = await usersCollection().where('username', '==', username).limit(1).get();
  const [match] = snapshot.docs;

  return Boolean(match) && match!.id !== ownUid;
}

export async function saveUserProfile(uid: string, profile: Omit<UserProfile, 'uid'>): Promise<void> {
  // merge para no borrar campos que se añadan al documento mas adelante y que
  // este formulario todavia no conozca.
  await usersCollection().doc(uid).set({ ...profile, updatedAt: new Date() }, { merge: true });
}
