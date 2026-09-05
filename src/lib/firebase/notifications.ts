import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from './server';

// Las notificaciones viven en una subcoleccion por destinatario
// (notifications/{uid}/items), no en una coleccion plana: listarlas es leer un
// solo camino sin indice compuesto, y borrar las de una cuenta es borrar un
// solo documento con su subcoleccion.

function itemsCollection(uid: string) {
  return getAdminDb().collection('notifications').doc(uid).collection('items');
}

export interface NotificationItem {
  id: string;
  type: 'rsvp';
  fromUid: string;
  eventId: string;
  eventTitle: string;
  actorName: string;
  read: boolean;
  createdAt: Date | null;
}

function mapItem(doc: FirebaseFirestore.DocumentSnapshot): NotificationItem {
  const data = doc.data() ?? {};
  const creado = data.createdAt;

  return {
    id: doc.id,
    type: 'rsvp',
    fromUid: data.fromUid ?? '',
    eventId: data.eventId ?? '',
    eventTitle: data.eventTitle ?? '',
    actorName: data.actorName ?? 'Alguien',
    read: data.read === true,
    createdAt: creado instanceof Timestamp ? creado.toDate() : null,
  };
}

// Quien confirma un evento le deja una notificacion al organizador. El id del
// documento es determinista (evento + quien confirma): asi un mismo asistente
// no puede crear dos notificaciones del mismo evento, y retirar la asistencia
// puede borrarla sin consultas.
export async function addRsvpNotification(input: {
  toUid: string;
  fromUid: string;
  actorName: string;
  eventId: string;
  eventTitle: string;
}): Promise<void> {
  await itemsCollection(input.toUid).doc(`${input.eventId}__${input.fromUid}`).set({
    type: 'rsvp',
    fromUid: input.fromUid,
    actorName: input.actorName,
    eventId: input.eventId,
    eventTitle: input.eventTitle,
    read: false,
    createdAt: FieldValue.serverTimestamp(),
  });
}

// Cuando alguien retira su asistencia, la notificacion que habia dejado deja
// de tener sentido y se borra.
export async function removeRsvpNotification(
  toUid: string,
  eventId: string,
  fromUid: string,
): Promise<void> {
  await itemsCollection(toUid).doc(`${eventId}__${fromUid}`).delete();
}

export async function getNotifications(uid: string, max = 25): Promise<NotificationItem[]> {
  const snapshot = await itemsCollection(uid).orderBy('createdAt', 'desc').limit(max).get();
  return snapshot.docs.map(mapItem);
}

export async function countUnread(uid: string): Promise<number> {
  const snapshot = await itemsCollection(uid).where('read', '==', false).count().get();
  return snapshot.data().count;
}

export async function markAllRead(uid: string): Promise<void> {
  const snapshot = await itemsCollection(uid).where('read', '==', false).get();

  if (snapshot.empty) {
    return;
  }

  const lote = getAdminDb().batch();
  snapshot.docs.forEach((doc) => lote.update(doc.ref, { read: true }));
  await lote.commit();
}

// Las notificaciones de un evento concreto de un destinatario: al borrarse el
// evento, las suyas dejan de apuntar a algo que existe.
export async function deleteEventNotifications(toUid: string, eventId: string): Promise<void> {
  const snapshot = await itemsCollection(toUid).where('eventId', '==', eventId).get();

  await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
}

export async function deleteNotificationsForUser(uid: string): Promise<void> {
  const ref = getAdminDb().collection('notifications').doc(uid);
  const items = await ref.collection('items').listDocuments();

  await Promise.all(items.map((doc) => doc.delete()));
  await ref.delete();
}
