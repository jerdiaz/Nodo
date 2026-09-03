export interface ProfileSocials {
  instagram?: string;
  x?: string;
  youtube?: string;
  tiktok?: string;
  linkedin?: string;
  website?: string;
}

export interface UserProfile {
  uid: string;
  firstName: string;
  lastName?: string;
  username?: string;
  bio?: string;
  avatarUrl?: string;
  socials: ProfileSocials;
  // Secreto que autoriza el feed iCal. Va en la URL porque los clientes de
  // calendario no mandan cookies, asi que quien tenga el enlace ve la agenda:
  // por eso se genera aparte y se puede revocar sin tocar la sesion.
  calendarToken?: string;
}

// Clave de red social -> como se muestra y como se convierte en enlace.
// Se declara una sola vez para que el formulario, la validacion y el perfil
// publico no puedan discrepar sobre que redes existen.
export const SOCIAL_FIELDS = [
  { key: 'instagram', label: 'Instagram', prefix: 'instagram.com/', baseUrl: 'https://instagram.com/' },
  { key: 'x', label: 'X', prefix: 'x.com/', baseUrl: 'https://x.com/' },
  { key: 'youtube', label: 'YouTube', prefix: 'youtube.com/@', baseUrl: 'https://youtube.com/@' },
  { key: 'tiktok', label: 'TikTok', prefix: 'tiktok.com/@', baseUrl: 'https://tiktok.com/@' },
  { key: 'linkedin', label: 'LinkedIn', prefix: 'linkedin.com/in/', baseUrl: 'https://linkedin.com/in/' },
] as const satisfies ReadonlyArray<{
  key: keyof ProfileSocials;
  label: string;
  prefix: string;
  baseUrl: string;
}>;

export type SocialKey = (typeof SOCIAL_FIELDS)[number]['key'];
