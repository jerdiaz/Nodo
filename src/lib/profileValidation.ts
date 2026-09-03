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
      bio: bio || undefined,
      avatarUrl: avatarUrl || undefined,
      socials,
    },
  };
}
