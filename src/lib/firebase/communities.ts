import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from './server';
import type { CommunityMembership, CommunityRole, EventCommunity, NodoCommunity } from '../../types/community';

function communitiesCollection() {
  return getAdminDb().collection('communities');
}

// Los miembros van en subcoleccion, igual que los rsvps de un evento: el
// documento de la comunidad no crece con cada persona que se une y contar es
// una agregacion, no leer una lista entera.
function membersCollection(communityId: string) {
  return communitiesCollection().doc(communityId).collection('members');
}

// Seguir es la accion libre e instantanea que antes hacia este mismo boton
// sobre `members`: no da permiso de publicar, solo dice "me interesa esto".
// Va en su propia subcoleccion para no mezclar quien sigue con quien puede
// publicar a nombre de la comunidad.
function followersCollection(communityId: string) {
  return communitiesCollection().doc(communityId).collection('followers');
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

// --- Seguidores: instantaneo, sin aprobacion, no da permiso de publicar -----

export async function getFollowerCount(communityId: string): Promise<number> {
  const snapshot = await followersCollection(communityId).count().get();
  return snapshot.data().count;
}

export async function isFollowing(communityId: string, uid: string): Promise<boolean> {
  const doc = await followersCollection(communityId).doc(uid).get();
  return doc.exists;
}

export async function followCommunity(communityId: string, uid: string): Promise<void> {
  await followersCollection(communityId).doc(uid).set({ followedAt: FieldValue.serverTimestamp() });
}

export async function unfollowCommunity(communityId: string, uid: string): Promise<void> {
  await followersCollection(communityId).doc(uid).delete();
}

// --- Miembros: requieren aprobacion y dan permiso de publicar --------------

function mapMembership(doc: FirebaseFirestore.DocumentSnapshot): CommunityMembership {
  const data = doc.data() ?? {};
  const solicitado = data.requestedAt as Timestamp | undefined;
  const respondido = data.respondedAt as Timestamp | undefined;

  return {
    // Los docs de antes de este cambio no llevan `role`/`status` (solo
    // `joinedAt`, de cuando "seguir" y "ser miembro" eran lo mismo): se leen
    // como miembro activo para no dejar a nadie sin acceso por sorpresa si el
    // script de migracion no ha corrido todavia.
    role: data.role === 'admin' ? 'admin' : 'member',
    status: data.status === 'pending' ? 'pending' : 'active',
    requestedAt: solicitado?.toDate() ?? new Date(0),
    respondedAt: respondido?.toDate(),
  };
}

export async function getMembership(communityId: string, uid: string): Promise<CommunityMembership | null> {
  const doc = await membersCollection(communityId).doc(uid).get();
  return doc.exists ? mapMembership(doc) : null;
}

// Cuenta solo miembros activos: una solicitud pendiente todavia no es nadie
// que pueda publicar a nombre de la comunidad.
//
// Sin filtro en la consulta y a mano en vez de con `where('status', '!=', ...)`
// a proposito: los docs de antes de este cambio no llevan el campo `status`, y
// Firestore excluye de una consulta por desigualdad cualquier documento donde
// el campo no exista. El numero de miembros por comunidad es pequeño, asi que
// leer la subcoleccion entera sale mas barato que ese error silencioso.
export async function getMemberCount(communityId: string): Promise<number> {
  const snapshot = await membersCollection(communityId).get();
  return snapshot.docs.filter((doc) => mapMembership(doc).status === 'active').length;
}

export async function isMember(communityId: string, uid: string): Promise<boolean> {
  const membership = await getMembership(communityId, uid);
  return membership?.status === 'active';
}

// Si ya hay una solicitud (pendiente o activa) no se pisa: pedir dos veces no
// debe reiniciar el turno de quien ya estaba en la fila.
export async function requestMembership(communityId: string, uid: string): Promise<CommunityMembership> {
  const existing = await getMembership(communityId, uid);
  if (existing) return existing;

  await membersCollection(communityId).doc(uid).set({
    role: 'member',
    status: 'pending',
    requestedAt: FieldValue.serverTimestamp(),
  });

  return { role: 'member', status: 'pending', requestedAt: new Date() };
}

export async function approveMembership(communityId: string, uid: string): Promise<void> {
  await membersCollection(communityId)
    .doc(uid)
    .set({ status: 'active', respondedAt: FieldValue.serverTimestamp() }, { merge: true });
}

// Declinar borra la solicitud en vez de marcarla, para que esa persona pueda
// volver a pedirlo mas adelante sin quedar atada a un rechazo antiguo.
export async function declineMembership(communityId: string, uid: string): Promise<void> {
  await membersCollection(communityId).doc(uid).delete();
}

export async function leaveMembership(communityId: string, uid: string): Promise<void> {
  await membersCollection(communityId).doc(uid).delete();
}

export async function setMemberRole(communityId: string, uid: string, role: CommunityRole): Promise<void> {
  await membersCollection(communityId).doc(uid).set({ role }, { merge: true });
}

// Mismo motivo que en `getMemberCount` para no filtrar con `where`: los docs
// viejos no llevan `status`, y una consulta por igualdad tampoco los
// devolveria.
export async function getPendingRequests(communityId: string): Promise<(CommunityMembership & { uid: string })[]> {
  const snapshot = await membersCollection(communityId).get();
  return snapshot.docs
    .map((doc) => ({ uid: doc.id, ...mapMembership(doc) }))
    .filter((miembro) => miembro.status === 'pending')
    .sort((a, b) => a.requestedAt.getTime() - b.requestedAt.getTime());
}

export async function getActiveMembers(communityId: string): Promise<(CommunityMembership & { uid: string })[]> {
  const snapshot = await membersCollection(communityId).get();
  return snapshot.docs
    .map((doc) => ({ uid: doc.id, ...mapMembership(doc) }))
    .filter((miembro) => miembro.status === 'active')
    .sort((a, b) => a.requestedAt.getTime() - b.requestedAt.getTime());
}

// El dueño siempre puede administrar; un admin tiene exactamente las mismas
// funciones, asignadas por el dueño o por otro admin. Este es el unico gate
// que reemplaza todos los "solo el dueño" de antes de este cambio.
export async function isCommunityAdmin(community: Pick<NodoCommunity, 'ownerUid' | 'id'>, uid: string): Promise<boolean> {
  if (community.ownerUid === uid) return true;
  const membership = await getMembership(community.id, uid);
  return membership?.status === 'active' && membership.role === 'admin';
}

// A diferencia de administrar, publicar a nombre de la comunidad no exige el
// rol de admin: cualquier miembro activo puede hacerlo, que es justamente lo
// que distingue a un miembro de un seguidor.
export async function canPublishForCommunity(community: Pick<NodoCommunity, 'ownerUid' | 'id'>, uid: string): Promise<boolean> {
  if (community.ownerUid === uid) return true;
  const membership = await getMembership(community.id, uid);
  return membership?.status === 'active';
}

// A que comunidades pertenece esta persona (como dueño o como miembro activo),
// para el selector de "publicar como" y para el perfil publico. Mismo patron
// que ya usaba `u/[usuario].astro`: recorrer las comunidades (son pocas) y
// resolver la pertenencia de cada una, en vez de mantener una lista aparte o
// depender de un indice compuesto entre subcolecciones.
export async function getMembershipsForUser(
  uid: string,
): Promise<{ community: NodoCommunity; role: 'owner' | CommunityRole }[]> {
  const communities = await getCommunities();

  const resultados = await Promise.all(
    communities.map(async (community) => {
      if (community.ownerUid === uid) {
        return { community, role: 'owner' as const };
      }

      const membership = await getMembership(community.id, uid);
      return membership?.status === 'active' ? { community, role: membership.role } : null;
    }),
  );

  return resultados.filter((entrada): entrada is { community: NodoCommunity; role: 'owner' | CommunityRole } => entrada !== null);
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

  // Quien la crea queda dentro sin tener que pedirlo aparte: es su comunidad,
  // y que el recuento arrancara en cero seria mentir sobre cuanta gente hay.
  // El rol no importa aqui -su permiso viene siempre de `ownerUid`-, pero
  // `status: 'active'` si, para que las lecturas que cuentan miembros (que no
  // usan `where` por los docs viejos sin este campo) lo vean desde el primer
  // dia.
  await membersCollection(input.slug)
    .doc(input.ownerUid)
    .set({ status: 'active', requestedAt: FieldValue.serverTimestamp() });

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

  const followers = await ref.collection('followers').listDocuments();
  await Promise.all(followers.map((follower) => follower.delete()));

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
