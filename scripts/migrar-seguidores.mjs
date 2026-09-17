// Antes de este cambio, "seguir" una comunidad y "ser miembro" eran la misma
// accion: el boton escribia directo en `communities/{id}/members/{uid}` sin
// aprobacion de nadie. Dejar esos docs como "miembro activo" bajo el modelo
// nuevo le daria a cualquiera que alguna vez le dio clic a Seguir el permiso
// de publicar eventos a nombre de esa comunidad sin que nadie lo aprobara.
//
// Este script mueve cada uno de esos docs (salvo el del dueño, que sigue
// siendo miembro por definicion) a `communities/{id}/followers/{uid}`, que es
// lo que esa persona hizo en realidad, y borra el doc de `members`.
//
// Se corre una sola vez, a mano:
//   node --env-file-if-exists=.env scripts/migrar-seguidores.mjs

import { cert, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

if (!projectId || !clientEmail || !privateKey) {
  console.error(
    'Faltan variables de entorno de Firebase Admin (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY).\n' +
      'Corre este script con: node --env-file-if-exists=.env scripts/migrar-seguidores.mjs',
  );
  process.exit(1);
}

const app = initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
const db = getFirestore(app);

const comunidades = await db.collection('communities').get();

if (comunidades.empty) {
  console.log('No hay comunidades. Nada que migrar.');
  process.exit(0);
}

for (const comunidadDoc of comunidades.docs) {
  const comunidad = comunidadDoc.data();
  const nombre = comunidad.name ?? comunidadDoc.id;
  const ownerUid = comunidad.ownerUid;

  const miembros = await comunidadDoc.ref.collection('members').get();

  if (miembros.empty) {
    console.log(`- ${nombre}: sin miembros que migrar.`);
    continue;
  }

  for (const miembroDoc of miembros.docs) {
    const uid = miembroDoc.id;

    if (uid === ownerUid) {
      // El dueño no depende de este doc para nada -su permiso viene de
      // `ownerUid`-, pero se normaliza para que las lecturas que ya asumen
      // `status`/`role` lo vean consistente desde ya.
      await miembroDoc.ref.set({ status: 'active' }, { merge: true });
      console.log(`- ${nombre}: dueño (${uid}) normalizado, se queda como miembro.`);
      continue;
    }

    // Ya migrado (el doc trae status/role explicitos porque se creo despues
    // de este cambio, ej. una solicitud real): no se toca.
    if (miembroDoc.data().status !== undefined) {
      console.log(`- ${nombre}: ${uid} ya es una solicitud/membresía real, se deja igual.`);
      continue;
    }

    const followedAt = miembroDoc.data().joinedAt ?? FieldValue.serverTimestamp();

    await comunidadDoc.ref.collection('followers').doc(uid).set({ followedAt });
    await miembroDoc.ref.delete();
    console.log(`- ${nombre}: ${uid} pasó de miembro a seguidor.`);
  }
}

console.log('Listo.');
process.exit(0);
