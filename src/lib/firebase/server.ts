import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getStorage, type Storage } from 'firebase-admin/storage';
import { getSecret } from 'astro:env/server';

function getFirebaseAdminApp(): App {
  const [existingApp] = getApps();
  if (existingApp) {
    return existingApp;
  }

  const projectId = getSecret('FIREBASE_PROJECT_ID');
  const clientEmail = getSecret('FIREBASE_CLIENT_EMAIL');
  const privateKey = getSecret('FIREBASE_PRIVATE_KEY')?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Faltan variables de entorno de Firebase Admin: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.',
    );
  }

  const app = initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });

  // Los campos opcionales del dominio (city, venue, meetingUrl, etc.) se
  // construyen como `undefined` cuando no aplican; el SDK de Admin rechaza
  // esos valores por defecto, así que se relaja aquí, una sola vez, antes
  // de la primera operación contra Firestore.
  getFirestore(app).settings({ ignoreUndefinedProperties: true });

  return app;
}

export function getAdminDb(): Firestore {
  return getFirestore(getFirebaseAdminApp());
}

export function getAdminAuth(): Auth {
  return getAuth(getFirebaseAdminApp());
}

export function getAdminStorage(): Storage {
  return getStorage(getFirebaseAdminApp());
}
