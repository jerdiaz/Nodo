import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from './server';
import type { UserProfile, VerificationType } from '../../types/profile';

function usersCollection() {
  return getAdminDb().collection('users');
}

function mapDocToProfile(doc: FirebaseFirestore.DocumentSnapshot): UserProfile | null {
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
    verification: data.verification,
    admin: data.admin === true,
    blocked: data.blocked === true,
  };
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const doc = await usersCollection().doc(uid).get();
  return mapDocToProfile(doc);
}

// Lectura por lotes para no pagar una consulta por organizador al listar
// eventos: getAll() hace un solo viaje de red por muchos uids conocidos,
// sin necesitar indice (a diferencia de un where(documentId(), 'in', ...),
// que ademas topa en 30 valores).
export async function getUserProfiles(uids: string[]): Promise<Map<string, UserProfile>> {
  const uniqueUids = [...new Set(uids)];

  if (uniqueUids.length === 0) {
    return new Map();
  }

  const docs = await getAdminDb().getAll(...uniqueUids.map((uid) => usersCollection().doc(uid)));
  const profiles = new Map<string, UserProfile>();

  for (const doc of docs) {
    const profile = mapDocToProfile(doc);
    if (profile) {
      profiles.set(doc.id, profile);
    }
  }

  return profiles;
}

// La condicion de administrador se lee siempre de Firestore, nunca de nada que
// mande el cliente. El primer administrador se marca a mano desde la consola
// de Firebase: es el unico eslabon manual de la cadena.
export async function isAdmin(uid: string): Promise<boolean> {
  const doc = await usersCollection().doc(uid).get();
  return doc.data()?.admin === true;
}

export async function setVerification(uid: string, verification: VerificationType | null): Promise<void> {
  await usersCollection()
    .doc(uid)
    .set({ verification: verification ?? FieldValue.delete() }, { merge: true });
}

// El resto de campos de rol se tocan solo desde el panel de administracion y
// con set(merge): la forma de quitar el valor es borrar el campo, igual que con
// la verificacion, para que "no consta" sea ausencia y no false.
export async function setAdmin(uid: string, admin: boolean): Promise<void> {
  await usersCollection().doc(uid).set({ admin: admin ? true : FieldValue.delete() }, { merge: true });
}

export async function setBlocked(uid: string, blocked: boolean): Promise<void> {
  await usersCollection().doc(uid).set({ blocked: blocked ? true : FieldValue.delete() }, { merge: true });
}

// Al reves que los de arriba: aqui se guarda el `false` y se borra el `true`,
// porque el valor por defecto es recibir avisos. Guardar el campo solo cuando
// se apagan deja "no consta" y "los quiero" como el mismo estado, que es lo que
// evita tener que rellenarle el campo a todos los perfiles que ya existen.
export async function setEmailAvisos(uid: string, activos: boolean): Promise<void> {
  await usersCollection()
    .doc(uid)
    .set({ emailAvisos: activos ? FieldValue.delete() : false }, { merge: true });
}

// Los correos no viven en el perfil de Firestore: estan en Firebase Auth, y
// para verlos en el panel de admin hay que pedirlos al Admin SDK. getUsers
// acepta hasta 100 uids por llamada.
export async function getEmailsByUid(uids: string[]): Promise<Map<string, string | null>> {
  const unicos = [...new Set(uids)];
  const correos = new Map<string, string | null>();

  for (let i = 0; i < unicos.length; i += 100) {
    const lote = unicos.slice(i, i + 100).map((uid) => ({ uid }));

    try {
      const resultado = await getAdminAuth().getUsers(lote);
      resultado.users.forEach((usuario) => correos.set(usuario.uid, usuario.email ?? null));
    } catch (error) {
      console.warn('No se pudieron obtener los correos del lote de usuarios:', error);
    }
  }

  return correos;
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
// rsvps, esta no necesita crear ningun indice. Se usa para resolver a quien
// pertenece un username (transferencia, verificacion) — no para garantizar la
// unicidad, que vive en la coleccion `usernames` (ver claimUsername).
export async function isUsernameTaken(username: string, ownUid: string): Promise<boolean> {
  const snapshot = await usersCollection().where('username', '==', username).limit(1).get();
  const [match] = snapshot.docs;

  if (match && match.id !== ownUid) {
    return true;
  }

  // Tambien cuenta el claim de `usernames`, la fuente de verdad de la
  // unicidad: puede existir un claim sin que el perfil haya terminado de
  // guardarse, y sin esto el endpoint de disponibilidad diria "libre" un
  // nombre que el guardado real acabaria rechazando.
  const claim = await getAdminDb().collection('usernames').doc(username).get();

  return claim.exists && claim.data()?.uid !== ownUid;
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
  const doc = await usersCollection().doc(uid).get();
  const batch = getAdminDb().batch();

  batch.delete(usersCollection().doc(uid));

  // Sin esto, el claim de `usernames` quedaria tomado por un perfil inexistente
  // y nadie podria volver a usar ese nombre.
  const username = doc.data()?.username;
  if (typeof username === 'string' && username) {
    batch.delete(getAdminDb().collection('usernames').doc(username));
  }

  await batch.commit();
}

export async function saveUserProfile(uid: string, profile: Omit<UserProfile, 'uid'>): Promise<void> {
  // merge para no borrar campos que se añadan al documento mas adelante y que
  // este formulario todavia no conozca. Pero undefined no borra: con
  // ignoreUndefinedProperties activo, un campo que se vacia a proposito (bio,
  // avatar...) se quedaria con el valor anterior. Los que llegan sin valor se
  // marcan para borrarse de forma explicita.
  const data: Record<string, unknown> = { ...profile, updatedAt: new Date() };

  for (const key of Object.keys(profile)) {
    if (data[key] === undefined) {
      data[key] = FieldValue.delete();
    }
  }

  await usersCollection().doc(uid).set(data, { merge: true });
}

// La unicidad del username no la puede imponer Firestore por si solo: no hay
// indices unicos. Se garantiza con una coleccion `usernames` cuyo id es el
// propio username y cuyo documento dice quien lo tiene. Reclamarlo es una
// transaccion sobre ese documento fijo, asi que dos personas que pidan el
// mismo nombre a la vez chocan en esa escritura y solo una gana — no hace
// falta comparar contra toda la coleccion de perfiles.
export async function claimUsername(
  uid: string,
  next: string | undefined,
  previous: string | undefined,
): Promise<void> {
  const db = getAdminDb();
  const claims = db.collection('usernames');

  const prevRef = previous && previous !== next ? claims.doc(previous) : null;
  const nextRef = next ? claims.doc(next) : null;

  await db.runTransaction(async (transaction) => {
    // Suelta el claim anterior solo si es suyo.
    if (prevRef) {
      const prev = await transaction.get(prevRef);
      if (prev.exists && prev.data()?.uid === uid) {
        transaction.delete(prevRef);
      }
    }

    if (!nextRef) {
      return;
    }

    const claim = await transaction.get(nextRef);

    if (claim.exists && claim.data()?.uid !== uid) {
      throw new Error('USERNAME_TAKEN');
    }

    // Los perfiles creados antes de existir `usernames` no tienen claim todavia:
    // se comprueba la coleccion como respaldo para que esa primera reclamacion
    // tampoco pueda robarle el nombre a nadie.
    const legacy = await transaction.get(usersCollection().where('username', '==', next).limit(1));

    if (!legacy.empty) {
      const [match] = legacy.docs;
      if (match!.id !== uid) {
        throw new Error('USERNAME_TAKEN');
      }
    }

    transaction.set(nextRef, { uid, claimedAt: new Date() });
  });
}
