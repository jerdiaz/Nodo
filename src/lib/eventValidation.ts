import type { EventModality } from '../types/event';

const VALID_MODALITIES: EventModality[] = ['presencial', 'virtual', 'hibrido'];
const DEFAULT_TIMEZONE = 'America/Bogota';

function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function isValidTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

// "cartagena" y "Cartagena" son la misma ciudad pero, guardadas tal cual las
// escribe quien publica, son dos valores distintos para cualquiera que
// agrupe por el campo. Se exporta para poder aplicar el mismo criterio al
// leer eventos ya publicados (ver getFilterCities en events.ts), sin
// necesidad de migrar lo que ya hay en Firestore.
export function normalizeCityName(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/(^|[\s-])\p{L}/gu, (letra) => letra.toUpperCase());
}

export interface ValidatedEventInput {
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
  timezone: string;
  tags: string[];
}

export function validateEventPayload(body: unknown): { data: ValidatedEventInput } | { error: string } {
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

  const city = typeof payload.city === 'string' ? normalizeCityName(payload.city) : '';
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

  const timezone =
    typeof payload.timezone === 'string' && isValidTimezone(payload.timezone) ? payload.timezone : DEFAULT_TIMEZONE;

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
      timezone,
      tags,
    },
  };
}
