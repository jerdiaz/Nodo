import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

if (!projectId || !clientEmail || !privateKey) {
  console.error(
    'Faltan variables de entorno de Firebase Admin (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY).\n' +
      'Corre este script con: node --env-file-if-exists=.env scripts/backfill-rsvp-counts.mjs',
  );
  process.exit(1);
}

const app = initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
const db = getFirestore(app);

// Escribe en cada evento el contador de asistentes desnormalizado. Es un
// backfill puntual: en adelante lo mantiene el toggle de RSVP en la misma
// transaccion. Idempotente: se puede volver a correr sin efectos secundarios.
const snapshot = await db.collection('events').get();

let actualizados = 0;

for (const doc of snapshot.docs) {
  const countSnapshot = await doc.ref.collection('rsvps').count().get();
  await doc.ref.update({ rsvpCount: countSnapshot.data().count });
  actualizados += 1;
}

console.log(`\n${actualizados} eventos actualizados con su contador de asistentes.`);
process.exit(0);
