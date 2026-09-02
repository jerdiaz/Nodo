import { getApps, initializeApp, type FirebaseOptions } from 'firebase/app';
import { GoogleAuthProvider, OAuthProvider, getAuth, signInWithPopup, signOut, type AuthProvider } from 'firebase/auth';

const firebaseConfig: FirebaseOptions = {
  apiKey: import.meta.env.PUBLIC_FIREBASE_API_KEY,
  authDomain: import.meta.env.PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.PUBLIC_FIREBASE_APP_ID,
};

export const firebaseApp = getApps().length ? getApps()[0]! : initializeApp(firebaseConfig);

export const auth = getAuth(firebaseApp);

async function completeSignIn(provider: AuthProvider): Promise<void> {
  const credential = await signInWithPopup(auth, provider);
  const idToken = await credential.user.getIdToken();

  const response = await fetch('/api/auth/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });

  if (!response.ok) {
    throw new Error('No se pudo iniciar sesión.');
  }

  window.location.reload();
}

export function loginWithGoogle(): Promise<void> {
  return completeSignIn(new GoogleAuthProvider());
}

export function loginWithMicrosoft(): Promise<void> {
  // Cubre cuentas Microsoft personales y de organización (incluye tenants
  // educativos/corporativos como el de la UTB), siempre que el registro de
  // la app en Azure tenga habilitado "cualquier tenant + cuentas personales".
  return completeSignIn(new OAuthProvider('microsoft.com'));
}

export async function logout(): Promise<void> {
  await signOut(auth).catch(() => {});
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/';
}
