import { getApps, initializeApp, type FirebaseOptions } from 'firebase/app';
import { GoogleAuthProvider, OAuthProvider, getAuth, signInWithPopup, signOut, type UserCredential } from 'firebase/auth';
import { rutaInterna } from '../rutaInterna';

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

// redirectTo existe para quien entra desde el modal de sesion: sin el se
// recargaria la pagina de la que salio, y quien pulso "Publicar evento"
// acabaria de vuelta donde estaba en vez de en el formulario.
async function completeSignIn(userCredential: UserCredential, redirectTo?: string): Promise<void> {
  const idToken = await userCredential.user.getIdToken();

  const response = await fetch('/api/auth/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });

  if (!response.ok) {
    throw new Error('No se pudo iniciar sesión.');
  }

  const result = await response.json().catch(() => ({}));

  // Sin nombre de usuario aun: se pasa por la bienvenida para elegirlo y
  // corregir el nombre que venga del proveedor, en vez de recargar y dejar a
  // la persona sin saber que puede cambiarlo.
  if (result.needsOnboarding) {
    window.location.href = '/bienvenida';
    return;
  }

  // Se vuelve a comprobar aqui, que es donde se navega de verdad: asi ningun
  // sitio que llame a esta funcion puede colar un destino ajeno.
  const destino = redirectTo ? rutaInterna(redirectTo, '') : '';

  if (destino) {
    window.location.href = destino;
    return;
  }

  window.location.reload();
}

export async function loginWithGoogle(redirectTo?: string): Promise<void> {
  const userCredential = await signInWithPopup(auth, new GoogleAuthProvider());
  return completeSignIn(userCredential, redirectTo);
}

export async function loginWithMicrosoft(redirectTo?: string): Promise<void> {
  // Cubre cuentas Microsoft personales y de organización (incluye tenants
  // educativos/corporativos como el de la UTB), siempre que el registro de
  // la app en Azure tenga habilitado "cualquier tenant + cuentas personales".
  const userCredential = await signInWithPopup(auth, new OAuthProvider('microsoft.com'));
  return completeSignIn(userCredential, redirectTo);
}

export async function logout(): Promise<void> {
  await signOut(auth).catch(() => {});
  await fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
  window.location.href = '/';
}

