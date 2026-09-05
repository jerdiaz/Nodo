import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from './server';

// Las notificaciones viven en una subcoleccion por destinatario
// (notifications/{uid}/items), no en una coleccion plana: listarlas es leer un
// solo camino sin indice compuesto, y borrar las de una cuenta es borrar un
// solo documento con su subcoleccion.

function itemsCollection(uid: string) {
  return getAdminDb().collection('notifications').doc(uid).collection('items');
}

// 'rsvp' le llega a quien organiza cuando alguien confirma. 'recordatorio' le
// llega a quien asiste la vispera de su evento, y es el mismo aviso que sale
// por correo: quien no abre el correo lo ve igual al entrar al sitio.
export type NotificationType = 'rsvp' | 'recordatorio';

export interface NotificationItem {
  id: string;
  type: NotificationType;
  fromUid: string;
  eventId: string;
  eventTitle: string;
  actorName: string;
  // Miniatura del evento, para los recordatorios. Se copia al crear el aviso en
  // vez de leer el evento al pintarlo: la campana se abre a menudo y no vale
  // una lectura por linea. Los eventos sin banner no la tienen.
  imageUrl?: string;
  read: boolean;
  createdAt: Date | null;
}

function mapItem(doc: FirebaseFirestore.DocumentSnapshot): NotificationItem {
  const data = doc.data() ?? {};
  const creado = data.createdAt;

  return {
    id: doc.id,
    // Los avisos anteriores al recordatorio no llevan `type` y todos eran de
    // asistencia: por eso el valor por omision es 'rsvp' y no un error.
    type: data.type === 'recordatorio' ? 'recordatorio' : 'rsvp',
    fromUid: data.fromUid ?? '',
    eventId: data.eventId ?? '',
    eventTitle: data.eventTitle ?? '',
    actorName: data.actorName ?? 'Alguien',
    imageUrl: typeof data.imageUrl === 'string' ? data.imageUrl : undefined,
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

// El recordatorio de la vispera, en la campana. Lo deja el mismo barrido que
// encola el correo, y por eso el id es determinista y solo lleva el evento: dos
// pasadas del cron sobre el mismo evento escriben el mismo documento y no se
// duplica el aviso.
//
// A diferencia del correo, este no obedece el interruptor de avisos: ese
// interruptor apaga lo que llega a tu bandeja, no lo que ves dentro de Nodo.
export async function addReminderNotification(input: {
  toUid: string;
  eventId: string;
  eventTitle: string;
  imageUrl?: string;
}): Promise<void> {
  try {
    // create() y no set(): set() reescribiria el documento entero, incluido
    // `read: false`. El cron pasa cada cuarto de hora durante las 22 horas que
    // dura la ventana, asi que la campana volveria a encenderse sola unas
    // ochenta veces por evento aunque el aviso ya se hubiera leido.
    await itemsCollection(input.toUid).doc(`recordatorio__${input.eventId}`).create({
      type: 'recordatorio',
      fromUid: '',
      actorName: '',
      eventId: input.eventId,
      eventTitle: input.eventTitle,
      imageUrl: input.imageUrl,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    // Que ya exista es el caso normal a partir de la segunda pasada, no un
    // fallo. El codigo llega como cadena o como el numero 6 de gRPC segun la
    // version del SDK, asi que se comprueban los dos.
    const code = (error as { code?: string | number } | undefined)?.code;

    if (code !== 'already-exists' && code !== 6) {
      throw error;
    }
  }
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
