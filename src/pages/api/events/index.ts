import type { APIRoute } from 'astro';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { jsonResponse } from '../../../lib/api';
import { getDisplayUser } from '../../../lib/auth';
import { validateEventPayload } from '../../../lib/eventValidation';
import { getAdminDb } from '../../../lib/firebase/server';

function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[^\x00-\x7F]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function randomSuffix(length = 4): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i += 1) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const user = await getDisplayUser(cookies);

  if (!user) {
    return jsonResponse({ error: 'Debes iniciar sesión para publicar un evento.' }, 401);
  }

  const body = await request.json().catch(() => null);
  const validation = validateEventPayload(body);

  if ('error' in validation) {
    return jsonResponse({ error: validation.error }, 400);
  }

  const { startDate, endDate, ...rest } = validation.data;
  const db = getAdminDb();

  const baseSlug = slugify(rest.title) || 'evento';
  let slug = baseSlug;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const existing = await db.collection('events').doc(slug).get();
    if (!existing.exists) {
      break;
    }
    slug = `${baseSlug}-${randomSuffix()}`;
  }

  await db
    .collection('events')
    .doc(slug)
    .set({
      ...rest,
      slug,
      startDate: Timestamp.fromDate(startDate),
      endDate: Timestamp.fromDate(endDate),
      organizer: {
        uid: user.uid,
        name: user.name,
        avatarUrl: user.avatarUrl ?? undefined,
      },
      createdAt: FieldValue.serverTimestamp(),
    });

  return jsonResponse({ success: true, slug }, 201);
};
