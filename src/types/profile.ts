export interface ProfileSocials {
  instagram?: string;
  x?: string;
  youtube?: string;
  tiktok?: string;
  linkedin?: string;
  website?: string;
}

// Dos criterios distintos, misma palomita: una certifica que la persona es
// quien dice ser, la otra que el colectivo esta reconocido por Nodo.
export type VerificationType = 'persona' | 'comunidad';

export const VERIFICATION_LABEL: Record<VerificationType, string> = {
  persona: 'Identidad confirmada',
  comunidad: 'Comunidad oficial',
};

export interface UserProfile {
  uid: string;
  firstName: string;
  lastName?: string;
  username?: string;
  // Celular en E.164 (+573001234567), para los recordatorios por WhatsApp.
  //
  // Vive aqui y no en Firebase Auth a proposito: el campo phoneNumber de Auth
  // significa "numero verificado" y ademas es unico entre cuentas. Este no se
  // verifica -es una decision tomada a sabiendas- asi que meterlo ahi seria
  // afirmar algo que no comprobamos, y un numero repetido rompería el guardado
  // de la segunda persona en vez de dejar que el problema se vea.
  phone?: string;
  bio?: string;
  avatarUrl?: string;
  socials: ProfileSocials;
  // Secreto que autoriza el feed iCal. Va en la URL porque los clientes de
  // calendario no mandan cookies, asi que quien tenga el enlace ve la agenda:
  // por eso se genera aparte y se puede revocar sin tocar la sesion.
  calendarToken?: string;
  // Ninguno de estos dos viaja por el formulario de configuracion:
  // validateProfilePayload construye el objeto campo a campo y descarta lo que
  // no conoce, asi que un PUT /api/perfil no puede autoconcederselos.
  verification?: VerificationType;
  admin?: boolean;
  // Quien esta bloqueado no puede publicar eventos ni comunidades, y sus
  // eventos dejan de verse en la cartelera (sin borrarse). Lo pone un admin.
  blocked?: boolean;
  // Recordatorios y avisos de cambio o cancelacion por correo. Ausencia de
  // valor es "si": los perfiles anteriores a esta preferencia no la tienen, y
  // quien no ha tocado el interruptor espera que le avisen. No cubre la
  // confirmacion de asistencia, que es el recibo de algo que se acaba de hacer
  // y sale siempre. Vive en el perfil y no en el navegador -a diferencia del
  // tema- porque quien la consulta es el cron que manda los correos.
  emailAvisos?: boolean;
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
