import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from './server';
import type { EventCommunity, NodoCommunity } from '../../types/community';

function communitiesCollection() {
  return getAdminDb().collection('communities');
}

// Los miembros van en subcoleccion, igual que los rsvps de un evento: el
// documento de la comunidad no crece con cada persona que se une y contar es
// una agregacion, no leer una lista entera.
function membersCollection(communityId: string) {
  return communitiesCollection().doc(communityId).collection('members');
}

function mapDoc(doc: FirebaseFirestore.DocumentSnapshot): NodoCommunity {
  const data = doc.data() ?? {};

  return {
    id: doc.id,
    slug: data.slug ?? doc.id,
    name: data.name,
    description: data.description,
    avatarUrl: data.avatarUrl,
    ownerUid: data.ownerUid,
    createdAt: (data.createdAt as Timestamp | undefined)?.toDate() ?? new Date(0),
  };
}

export async function getCommunities(): Promise<NodoCommunity[]> {
  const snapshot = await communitiesCollection().orderBy('name').get();
  return snapshot.docs.map(mapDoc);
}

export async function getCommunityBySlug(slug: string): Promise<NodoCommunity | null> {
  const doc = await communitiesCollection().doc(slug).get();
  return doc.exists ? mapDoc(doc) : null;
}

// La que administra esta persona, si tiene alguna. Solo se puede tener una:
// asi "publicar" no obliga a elegir entre varias cada vez, que era la parte
// que complicaba el formulario sin que nadie lo hubiera pedido.
export async function getCommunityByOwner(uid: string): Promise<NodoCommunity | null> {
  const snapshot = await communitiesCollection().where('ownerUid', '==', uid).limit(1).get();
  const doc = snapshot.docs[0];
  return doc ? mapDoc(doc) : null;
}

export function toEventCommunity(community: NodoCommunity): EventCommunity {
  return {
    id: community.id,
    slug: community.slug,
    name: community.name,
    avatarUrl: community.avatarUrl,
  };
}

export async function getMemberCount(communityId: string): Promise<number> {
  const snapshot = await membersCollection(communityId).count().get();
  return snapshot.data().count;
}

export async function isMember(communityId: string, uid: string): Promise<boolean> {
  const doc = await membersCollection(communityId).doc(uid).get();
  return doc.exists;
}

export async function joinCommunity(communityId: string, uid: string): Promise<void> {
  await membersCollection(communityId).doc(uid).set({ joinedAt: FieldValue.serverTimestamp() });
}

export async function leaveCommunity(communityId: string, uid: string): Promise<void> {
  await membersCollection(communityId).doc(uid).delete();
}

export interface CreateCommunityInput {
  slug: string;
  name: string;
  description?: string;
  avatarUrl?: string;
  ownerUid: string;
}

export async function createCommunity(input: CreateCommunityInput): Promise<NodoCommunity> {
  const db = getAdminDb();
  const ref = communitiesCollection().doc(input.slug);

  // create() falla si el slug ya esta tomado, y el fallo es atomico: dos
  // peticiones simultaneas con el mismo nombre no pueden pisarse entre si.
  await ref.create({ ...input, createdAt: FieldValue.serverTimestamp() });

  // Quien la crea queda dentro sin tener que unirse aparte: es su comunidad, y
  // que el recuento arrancara en cero seria mentir sobre cuanta gente hay.
  await membersCollection(input.slug).doc(input.ownerUid).set({ joinedAt: FieldValue.serverTimestamp() });

  // Los eventos que ya tenia publicados pasan a la comunidad. Sin esto, quien
  // lleva meses publicando a su nombre tendria una comunidad recien creada y
  // vacia al lado de su propio historial.
  const comunidad = { id: input.slug, slug: input.slug, name: input.name, avatarUrl: input.avatarUrl };
  const propios = await db.collection('events').where('organizer.uid', '==', input.ownerUid).get();

  if (!propios.empty) {
    const lote = db.batch();
    propios.docs.forEach((doc) => lote.update(doc.ref, { community: comunidad }));
    await lote.commit();
  }

  const creada = await ref.get();
  return mapDoc(creada);
}

// Borra la comunidad entera: documento y miembros (un borrado no arrastra las
// subcolecciones) y la copia desnormalizada que sus eventos llevan en el campo
// `community`. Sin esto, los eventos publicados en su nombre quedarian
// apuntando a una comunidad que ya no existe.
export async function deleteCommunity(communityId: string): Promise<void> {
  const db = getAdminDb();
  const ref = communitiesCollection().doc(communityId);

  const members = await ref.collection('members').listDocuments();
  await Promise.all(members.map((member) => member.delete()));

  const eventos = await db.collection('events').where('community.id', '==', communityId).get();

  if (!eventos.empty) {
    const lote = db.batch();
    eventos.docs.forEach((doc) => lote.update(doc.ref, { community: FieldValue.delete() }));
    await lote.commit();
  }

  await ref.delete();
}

// Renombrar o cambiar el avatar tiene que arrastrar los eventos ya publicados,
// porque su copia de la comunidad es la que se pinta en la cartelera.
//
// Los campos opcionales que llegan sin valor se borran en vez de ignorarse:
// el formulario de edicion manda siempre los tres, asi que un hueco significa
// que se ha vaciado a proposito y con { merge: true } se quedaria el anterior.
export async function updateCommunity(
  communityId: string,
  cambios: { name: string; description?: string; avatarUrl?: string },
): Promise<void> {
  const db = getAdminDb();

  await communitiesCollection().doc(communityId).set(
    {
      name: cambios.name,
      description: cambios.description ?? FieldValue.delete(),
      avatarUrl: cambios.avatarUrl ?? FieldValue.delete(),
    },
    { merge: true },
  );

  const doc = await communitiesCollection().doc(communityId).get();
  const comunidad = toEventCommunity(mapDoc(doc));
  const eventos = await db.collection('events').where('community.id', '==', communityId).get();

  if (!eventos.empty) {
    const lote = db.batch();
    eventos.docs.forEach((evento) => lote.update(evento.ref, { community: comunidad }));
    await lote.commit();
  }
}
