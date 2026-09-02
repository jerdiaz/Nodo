import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
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

  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });
}

export function getAdminDb(): Firestore {
  return getFirestore(getFirebaseAdminApp());
}
