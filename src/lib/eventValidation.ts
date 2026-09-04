import type { EventModality } from '../types/event';

const VALID_MODALITIES: EventModality[] = ['presencial', 'virtual', 'hibrido'];
const DEFAULT_TIMEZONE = 'America/Bogota';

// Límites pensados para un evento razonable. Sin tope, quien publica puede
// mandar una descripción o un listado de etiquetas que hinchan la página, el
// índice de búsqueda en memoria y la carga de cada listado.
const MAX_DESCRIPTION_LENGTH = 3000;
const MAX_CITY_LENGTH = 80;
const MAX_VENUE_LENGTH = 120;
const MAX_ADDRESS_LENGTH = 200;
const MAX_URL_LENGTH = 500;
const MAX_TAGS = 10;
const MAX_TAG_LENGTH = 40;

// new URL() acepta "javascript:alert(1)" como URL valida. Estos valores se
// pintan luego como enlace o como <img>, asi que el protocolo se comprueba de
// forma explicita en vez de dar por buena cualquier URL parseable.
function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
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
  bannerSmallUrl?: string;
  startDate: Date;
  endDate: Date;
  timezone: string;
  tags: string[];
}

export interface ValidateEventOptions {
  // El formulario ya bloquea fechas pasadas al crear, pero editar un evento
  // que ya ocurrio (corregir la descripcion, por ejemplo) es legitimo y no
  // deberia forzar a mover la fecha al futuro solo para poder guardar.
  allowPastStart?: boolean;
}

export function validateEventPayload(
  body: unknown,
  options: ValidateEventOptions = {},
): { data: ValidatedEventInput } | { error: string } {
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

  if (description.length > MAX_DESCRIPTION_LENGTH) {
    return { error: `La descripción no puede superar los ${MAX_DESCRIPTION_LENGTH} caracteres.` };
  }

  const modality = payload.modality;
  if (typeof modality !== 'string' || !VALID_MODALITIES.includes(modality as EventModality)) {
    return { error: 'La modalidad debe ser presencial, virtual o hibrido.' };
  }

  const city = typeof payload.city === 'string' ? normalizeCityName(payload.city) : '';
  const venue = typeof payload.venue === 'string' ? payload.venue.trim() : '';
  const address = typeof payload.address === 'string' ? payload.address.trim() : '';
  const meetingUrl = typeof payload.meetingUrl === 'string' ? payload.meetingUrl.trim() : '';

  if (city.length > MAX_CITY_LENGTH) {
    return { error: `La ciudad no puede superar los ${MAX_CITY_LENGTH} caracteres.` };
  }

  if (venue.length > MAX_VENUE_LENGTH) {
    return { error: `El lugar no puede superar los ${MAX_VENUE_LENGTH} caracteres.` };
  }

  if (address.length > MAX_ADDRESS_LENGTH) {
    return { error: `La dirección no puede superar los ${MAX_ADDRESS_LENGTH} caracteres.` };
  }

  if (meetingUrl.length > MAX_URL_LENGTH) {
    return { error: 'El enlace de reunión es demasiado largo.' };
  }

  if ((modality === 'presencial' || modality === 'hibrido') && !city) {
    return { error: 'La ciudad es obligatoria para eventos presenciales o híbridos.' };
  }

  if ((modality === 'virtual' || modality === 'hibrido') && (!meetingUrl || !isHttpUrl(meetingUrl))) {
    return { error: 'Se requiere un enlace de reunión válido para eventos virtuales o híbridos.' };
  }

  const bannerUrl = typeof payload.bannerUrl === 'string' ? payload.bannerUrl.trim() : '';
  if (bannerUrl && !isHttpUrl(bannerUrl)) {
    return { error: 'La URL del banner no es válida.' };
  }

  if (bannerUrl.length > MAX_URL_LENGTH) {
    return { error: 'La URL del banner es demasiado larga.' };
  }

  // La variante reducida viaja aparte (la genera /api/imagenes). Es opcional:
  // un evento sin ella simplemente pinta la imagen completa en todas partes.
  const bannerSmallUrl = typeof payload.bannerSmallUrl === 'string' ? payload.bannerSmallUrl.trim() : '';
  if (bannerSmallUrl && !isHttpUrl(bannerSmallUrl)) {
    return { error: 'La URL del banner reducido no es válida.' };
  }

  if (bannerSmallUrl.length > MAX_URL_LENGTH) {
    return { error: 'La URL del banner reducido es demasiado larga.' };
  }

  const startDate = typeof payload.startDate === 'string' ? new Date(payload.startDate) : null;
  const endDate = typeof payload.endDate === 'string' ? new Date(payload.endDate) : null;

  if (!startDate || Number.isNaN(startDate.getTime())) {
    return { error: 'La fecha de inicio no es válida.' };
  }

  if (!endDate || Number.isNaN(endDate.getTime())) {
    return { error: 'La fecha de fin no es válida.' };
  }

  if (!options.allowPastStart && startDate.getTime() < Date.now()) {
    return { error: 'La fecha de inicio no puede ser en el pasado.' };
  }

  if (endDate <= startDate) {
    return { error: 'La fecha de fin debe ser posterior a la fecha de inicio.' };
  }

  // Si la zona llega mal escrita se rechaza en vez de caer silenciosamente a
  // America/Bogota: un typo guardaria el evento con la hora desplazada sin
  // que nadie lo supiera.
  let timezone = DEFAULT_TIMEZONE;

  if (typeof payload.timezone === 'string' && payload.timezone) {
    if (!isValidTimezone(payload.timezone)) {
      return { error: 'La zona horaria no es válida.' };
    }
    timezone = payload.timezone;
  }

  const tags = Array.isArray(payload.tags)
    ? payload.tags
        .filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
        .map((tag) => tag.trim())
    : [];

  if (tags.length > MAX_TAGS) {
    return { error: `No puedes añadir más de ${MAX_TAGS} etiquetas.` };
  }

  if (tags.some((tag) => tag.length > MAX_TAG_LENGTH)) {
    return { error: `Ninguna etiqueta puede superar los ${MAX_TAG_LENGTH} caracteres.` };
  }

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
      bannerSmallUrl: bannerSmallUrl || undefined,
      startDate,
      endDate,
      timezone,
      tags,
    },
  };
}
