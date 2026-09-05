import { SOCIAL_FIELDS, type ProfileSocials, type UserProfile } from '../types/profile';

// `new URL()` acepta "javascript:alert(1)" como URL valida. Estos valores se
// pintan luego como href en el perfil, asi que el protocolo se comprueba de
// forma explicita en vez de dar por buena cualquier URL parseable.
function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{1,28}[a-z0-9])$/;
const HANDLE_PATTERN = /^[A-Za-z0-9._-]{1,60}$/;

export const USERNAME_RULES =
  'Entre 3 y 30 caracteres: letras, números, punto, guion o guion bajo, sin empezar ni terminar en símbolo.';

export function isValidUsername(value: string): boolean {
  return USERNAME_PATTERN.test(value);
}

// --- Celular -----------------------------------------------------------------

// El numero no se verifica con un codigo: es una decision tomada a sabiendas, y
// significa que lo unico que separa a un asistente de un desconocido que reciba
// sus recordatorios es esta validacion. Por eso es mas estricta de lo habitual.
//
// E.164: '+', indicativo que no empieza por cero, y entre 8 y 15 digitos.
const PHONE_PATTERN = /^\+[1-9]\d{7,14}$/;

// Y para Colombia, ademas, la forma exacta de un celular: +57 y diez digitos
// que empiezan por 3. Los fijos no reciben WhatsApp, asi que aceptar uno seria
// guardar un numero al que nunca vamos a poder escribir.
const PHONE_CO_PATTERN = /^\+573\d{9}$/;

export const PHONE_RULES = 'Escribe tu celular con indicativo: +57 300 123 4567.';

// Acepta el numero como lo teclea la gente -con espacios, guiones, parentesis,
// con 00 delante o sin indicativo- y lo deja en E.164. Diez digitos que
// empiezan por 3 se asumen colombianos, que es como lo escribe casi todo el
// mundo aqui; para cualquier otro pais hay que poner el '+'.
export function normalizePhone(value: string): string {
  const limpio = value.replace(/[\s()\-.]/g, '');

  if (limpio.startsWith('+')) {
    return limpio;
  }

  if (limpio.startsWith('00')) {
    return `+${limpio.slice(2)}`;
  }

  if (/^3\d{9}$/.test(limpio)) {
    return `+57${limpio}`;
  }

  if (/^573\d{9}$/.test(limpio)) {
    return `+${limpio}`;
  }

  return limpio;
}

export function isValidPhone(e164: string): boolean {
  if (!PHONE_PATTERN.test(e164)) {
    return false;
  }

  // Fuera de Colombia no se puede comprobar la forma del numero sin una tabla
  // por pais: basta con E.164. Dentro, si se puede, y se comprueba.
  return e164.startsWith('+57') ? PHONE_CO_PATTERN.test(e164) : true;
}

// Propuesta a partir del nombre que devuelve el proveedor de identidad: sin
// tildes, sin espacios y en minusculas. Puede quedar corta o vacia -un nombre
// en alfabeto no latino se queda sin nada-, y en ese caso no se sugiere nada.
export function suggestUsername(name: string, email: string | null): string {
  const fromName = name
    .normalize('NFD')
    .replace(/[^\x00-\x7F]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

  const fromEmail = (email ?? '').split('@')[0]?.toLowerCase().replace(/[^a-z0-9._-]/g, '') ?? '';
  const candidate = (fromName.length >= 3 ? fromName : fromEmail).slice(0, 30);

  return isValidUsername(candidate) ? candidate : '';
}

export type ValidatedProfile = Omit<UserProfile, 'uid'>;

export function validateProfilePayload(body: unknown): { data: ValidatedProfile } | { error: string } {
  if (typeof body !== 'object' || body === null) {
    return { error: 'Cuerpo de la solicitud inválido.' };
  }

  const payload = body as Record<string, unknown>;
  const text = (key: string) => (typeof payload[key] === 'string' ? (payload[key] as string).trim() : '');

  const firstName = text('firstName');
  if (!firstName || firstName.length > 60) {
    return { error: 'El nombre es obligatorio (máx. 60 caracteres).' };
  }

  const lastName = text('lastName');
  if (lastName.length > 60) {
    return { error: 'El apellido no puede superar 60 caracteres.' };
  }

  // El nombre de usuario se guarda en minusculas para que la comprobacion de
  // unicidad no dependa de como lo escriba cada quien.
  const username = text('username').toLowerCase();
  if (username && !USERNAME_PATTERN.test(username)) {
    return {
      error:
        'El nombre de usuario debe tener entre 3 y 30 caracteres: letras, números, punto, guion o guion bajo, sin empezar ni terminar en símbolo.',
    };
  }

  const bio = text('bio');
  if (bio.length > 280) {
    return { error: 'La biografía no puede superar 280 caracteres.' };
  }

  // Obligatorio, y comprobado aqui y no solo en el formulario: "sin salida"
  // solo es cierto si el servidor tambien lo exige. Un PUT a mano sin numero
  // tiene que fallar igual que el formulario.
  const phone = normalizePhone(text('phone'));
  if (!phone) {
    return { error: 'El celular es obligatorio.' };
  }
  if (!isValidPhone(phone)) {
    return { error: `Ese celular no es válido. ${PHONE_RULES}` };
  }

  const avatarUrl = text('avatarUrl');
  if (avatarUrl && !isHttpUrl(avatarUrl)) {
    return { error: 'La foto de perfil no es una URL válida.' };
  }

  const rawSocials =
    typeof payload.socials === 'object' && payload.socials !== null
      ? (payload.socials as Record<string, unknown>)
      : {};

  const socials: ProfileSocials = {};

  for (const field of SOCIAL_FIELDS) {
    const raw = typeof rawSocials[field.key] === 'string' ? (rawSocials[field.key] as string).trim() : '';
    // Se acepta que peguen "@usuario" o la URL entera y se queda el handle.
    const handle = raw.replace(/^@/, '').replace(/\/+$/, '').split('/').pop() ?? '';

    if (!handle) {
      continue;
    }

    if (!HANDLE_PATTERN.test(handle)) {
      return { error: `El usuario de ${field.label} contiene caracteres no válidos.` };
    }

    socials[field.key] = handle;
  }

  const website = typeof rawSocials.website === 'string' ? rawSocials.website.trim() : '';
  if (website) {
    const normalized = /^https?:\/\//i.test(website) ? website : `https://${website}`;
    if (!isHttpUrl(normalized)) {
      return { error: 'El sitio web no es una URL válida.' };
    }
    socials.website = normalized;
  }

  return {
    data: {
      firstName,
      lastName: lastName || undefined,
      username: username || undefined,
      phone,
      bio: bio || undefined,
      avatarUrl: avatarUrl || undefined,
      socials,
    },
  };
}
