import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from './server';

export interface TransferRequest {
  id: string;
  toUid: string;
  fromName: string;
  eventIds: string[];
  createdAt: Date;
}

function transfersCollection() {
  return getAdminDb().collection('transfer_requests');
}

function mapDoc(doc: FirebaseFirestore.DocumentSnapshot): TransferRequest {
  const data = doc.data() ?? {};

  return {
    id: doc.id,
    toUid: data.toUid ?? '',
    fromName: data.fromName ?? 'Alguien',
    eventIds: Array.isArray(data.eventIds) ? data.eventIds : [],
    createdAt: (data.createdAt as { toDate?: () => Date } | undefined)?.toDate?.() ?? new Date(0),
  };
}

export async function createTransferRequest(input: {
  toUid: string;
  fromName: string;
  eventIds: string[];
}): Promise<void> {
  await transfersCollection().add({ ...input, createdAt: FieldValue.serverTimestamp() });
}

export async function getPendingTransfers(uid: string): Promise<TransferRequest[]> {
  // Igualdad sobre un campo suelto: usa el indice que Firestore mantiene solo.
  const snapshot = await transfersCollection().where('toUid', '==', uid).get();
  return snapshot.docs.map(mapDoc);
}

export async function getTransferRequest(id: string): Promise<TransferRequest | null> {
  const doc = await transfersCollection().doc(id).get();
  return doc.exists ? mapDoc(doc) : null;
}

export async function deleteTransferRequest(id: string): Promise<void> {
  await transfersCollection().doc(id).delete();
}
