import { EVENT_CURRENCIES, type EventCurrency, type EventModality } from '../types/event';
import { esImagenSubida } from './imagenSubida';

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

// Un precio por encima de esto es casi seguro un dedazo (un cero de mas al
// teclear pesos), y el aforo tope evita que un numero absurdo acabe pintando
// "quedan 999999999 lugares".
const MAX_PRICE = 100_000_000;
const MAX_CAPACITY = 100_000;

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
  latitude?: number;
  longitude?: number;
  price?: number;
  currency?: EventCurrency;
  capacity?: number;
}

// Acepta numero o cadena porque el formulario manda lo que hay en un input de
// texto. Cadena vacia, null y undefined son "sin valor", que no es lo mismo
// que un cero.
function toNumber(value: unknown): number | null | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const numero = typeof value === 'number' ? value : Number(value);

  return Number.isFinite(numero) ? numero : null;
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
  if (bannerUrl && !esImagenSubida(bannerUrl)) {
    return { error: 'La URL del banner no es válida.' };
  }

  if (bannerUrl.length > MAX_URL_LENGTH) {
    return { error: 'La URL del banner es demasiado larga.' };
  }

  // La variante reducida viaja aparte (la genera /api/imagenes). Es opcional:
  // un evento sin ella simplemente pinta la imagen completa en todas partes.
  const bannerSmallUrl = typeof payload.bannerSmallUrl === 'string' ? payload.bannerSmallUrl.trim() : '';
  if (bannerSmallUrl && !esImagenSubida(bannerSmallUrl)) {
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

  // Las dos coordenadas van juntas o no van: con una sola no se puede pintar
  // un punto, y guardarla dejaria el evento en un estado que ninguna pantalla
  // sabe leer.
  const latitude = toNumber(payload.latitude);
  const longitude = toNumber(payload.longitude);

  if (latitude === null || longitude === null) {
    return { error: 'Las coordenadas del sitio no son válidas.' };
  }

  if ((latitude === undefined) !== (longitude === undefined)) {
    return { error: 'Las coordenadas del sitio están incompletas.' };
  }

  if (latitude !== undefined && (latitude < -90 || latitude > 90)) {
    return { error: 'La latitud del sitio está fuera de rango.' };
  }

  if (longitude !== undefined && (longitude < -180 || longitude > 180)) {
    return { error: 'La longitud del sitio está fuera de rango.' };
  }

  const precioBruto = toNumber(payload.price);

  if (precioBruto === null || (precioBruto !== undefined && precioBruto < 0)) {
    return { error: 'El precio no es válido.' };
  }

  if (precioBruto !== undefined && precioBruto > MAX_PRICE) {
    return { error: 'El precio es demasiado alto.' };
  }

  // Un cero se guarda como "sin precio": es lo mismo que gratis, y dejar solo
  // una forma de decirlo evita que cada pantalla tenga que comprobar las dos.
  // Se redondea a dos decimales porque un precio con mas no existe en ninguna
  // de las monedas admitidas.
  const price = precioBruto ? Math.round(precioBruto * 100) / 100 : undefined;

  const monedaBruta = typeof payload.currency === 'string' ? payload.currency.trim().toUpperCase() : '';

  if (monedaBruta && !EVENT_CURRENCIES.includes(monedaBruta as EventCurrency)) {
    return { error: 'La moneda no es válida.' };
  }

  // La moneda solo se guarda si hay precio, y por defecto es la de casa.
  const currency = price ? ((monedaBruta || 'COP') as EventCurrency) : undefined;

  const aforo = toNumber(payload.capacity);

  if (aforo === null || (aforo !== undefined && (!Number.isInteger(aforo) || aforo < 1))) {
    return { error: 'El aforo debe ser un número entero mayor que cero.' };
  }

  if (aforo !== undefined && aforo > MAX_CAPACITY) {
    return { error: `El aforo no puede superar los ${MAX_CAPACITY} asistentes.` };
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
      latitude,
      longitude,
      price,
      currency,
      capacity: aforo,
    },
  };
}
