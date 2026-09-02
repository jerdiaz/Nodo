import type { APIRoute } from 'astro';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getCurrentUser } from '../../../lib/auth';
import { getAdminDb } from '../../../lib/firebase/server';
import type { EventModality } from '../../../types/event';

const VALID_MODALITIES: EventModality[] = ['presencial', 'virtual', 'hibrido'];

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

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

function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

interface ValidatedEventInput {
  title: string;
  description: string;
  modality: EventModality;
  city?: string;
  venue?: string;
  address?: string;
  meetingUrl?: string;
  bannerUrl?: string;
  startDate: Date;
  endDate: Date;
  tags: string[];
}

function validatePayload(body: unknown): { data: ValidatedEventInput } | { error: string } {
  if (typeof body !== 'object' || body === null) {
    return { error: 'Cuerpo de la solicitud inválido.' };
  }

  const payload = body as Record<string, unknown>;

  const title = typeof payload.title === 'string' ? payload.title.trim() : '';
  if (!title || title.length > 140) {
    return { error: 'El título es obligatorio (máx. 140 caracteres).' };
  }

  const description = typeof payload.description === 'string' ? payload.description.trim() : '';
  if (!description) {
    return { error: 'La descripción es obligatoria.' };
  }

  const modality = payload.modality;
  if (typeof modality !== 'string' || !VALID_MODALITIES.includes(modality as EventModality)) {
    return { error: 'La modalidad debe ser presencial, virtual o hibrido.' };
  }

  const city = typeof payload.city === 'string' ? payload.city.trim() : '';
  const venue = typeof payload.venue === 'string' ? payload.venue.trim() : '';
  const address = typeof payload.address === 'string' ? payload.address.trim() : '';
  const meetingUrl = typeof payload.meetingUrl === 'string' ? payload.meetingUrl.trim() : '';

  if ((modality === 'presencial' || modality === 'hibrido') && !city) {
    return { error: 'La ciudad es obligatoria para eventos presenciales o híbridos.' };
  }

  if ((modality === 'virtual' || modality === 'hibrido') && (!meetingUrl || !isValidUrl(meetingUrl))) {
    return { error: 'Se requiere un enlace de reunión válido para eventos virtuales o híbridos.' };
  }

  const bannerUrl = typeof payload.bannerUrl === 'string' ? payload.bannerUrl.trim() : '';
  if (bannerUrl && !isValidUrl(bannerUrl)) {
    return { error: 'La URL del banner no es válida.' };
  }

  const startDate = typeof payload.startDate === 'string' ? new Date(payload.startDate) : null;
  const endDate = typeof payload.endDate === 'string' ? new Date(payload.endDate) : null;

  if (!startDate || Number.isNaN(startDate.getTime())) {
    return { error: 'La fecha de inicio no es válida.' };
  }

  if (!endDate || Number.isNaN(endDate.getTime())) {
    return { error: 'La fecha de fin no es válida.' };
  }

  if (endDate <= startDate) {
    return { error: 'La fecha de fin debe ser posterior a la fecha de inicio.' };
  }

  const tags = Array.isArray(payload.tags)
    ? payload.tags
        .filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
        .map((tag) => tag.trim())
    : [];

  return {
    data: {
      title,
      description,
      modality: modality as EventModality,
      city: city || undefined,
      venue: venue || undefined,
      address: address || undefined,
      meetingUrl: meetingUrl || undefined,
      bannerUrl: bannerUrl || undefined,
      startDate,
      endDate,
      tags,
    },
  };
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const user = await getCurrentUser(cookies);

  if (!user) {
    return jsonResponse({ error: 'Debes iniciar sesión para publicar un evento.' }, 401);
  }

  const body = await request.json().catch(() => null);
  const validation = validatePayload(body);

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
