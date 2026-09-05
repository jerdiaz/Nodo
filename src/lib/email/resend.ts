import { Resend } from 'resend';
import { getSecret } from 'astro:env/server';

// Cliente de Resend, creado tarde y una sola vez, por lo mismo que el app de
// Firebase Admin: los secretos se leen con getSecret() dentro de la funcion y
// no en el modulo, para que la ausencia de configuracion sea un caso que quien
// llama puede manejar y no una excepcion al importar el archivo.
let cliente: Resend | null = null;
let claveDelCliente: string | null = null;

function getCliente(): Resend | null {
  const clave = getSecret('RESEND_API_KEY');

  if (!clave) {
    return null;
  }

  // Si la clave cambia (recarga en caliente durante el desarrollo), se rehace:
  // conservar un cliente atado a la anterior daria 401 sin explicacion.
  if (!cliente || claveDelCliente !== clave) {
    cliente = new Resend(clave);
    claveDelCliente = clave;
  }

  return cliente;
}

// Las tres piezas que hacen falta para poder enviar. EMAIL_FROM va aparte de la
// clave porque el remitente depende del dominio verificado en Resend, y ese
// dominio cambia entre el de pruebas y el definitivo sin tocar la clave.
export function correoConfigurado(): boolean {
  return Boolean(getSecret('RESEND_API_KEY') && getSecret('EMAIL_FROM'));
}

// Solo la direccion, sin el nombre visible. EMAIL_FROM se escribe como
// `Nodo <hola@dominio>` porque es lo que hace que el correo llegue firmado con
// un nombre y no con una direccion pelada, pero el ORGANIZER de un .ics tiene
// que ser un `mailto:` limpio.
export function direccionRemitente(): string | undefined {
  const remitente = getSecret('EMAIL_FROM');

  if (!remitente) {
    return undefined;
  }

  return remitente.match(/<([^>]+)>/)?.[1]?.trim() ?? remitente.trim();
}

export interface AdjuntoCorreo {
  nombre: string;
  contenido: string;
  // El tipo se manda explicito y no se deduce de la extension: un .ics de
  // invitacion necesita `text/calendar; method=REQUEST`, y sin el parametro
  // `method` Gmail lo trata como un archivo adjunto cualquiera en vez de como
  // una invitacion con su tarjeta de "Agregar al calendario".
  tipo: string;
}

export interface EnvioCorreo {
  para: string;
  asunto: string;
  html: string;
  texto: string;
  adjuntos?: AdjuntoCorreo[];
  // Se manda como cabecera Idempotency-Key. Resend la recuerda 24 horas, asi
  // que un reintento nuestro tras un fallo de red -en el que el correo si
  // llego a salir- no produce un segundo correo.
  claveIdempotencia?: string;
}

export type ResultadoEnvio =
  | { ok: true; id: string }
  | { ok: false; motivo: 'sin-configurar' | 'rechazado'; error: string };

export async function enviarCorreo(envio: EnvioCorreo): Promise<ResultadoEnvio> {
  const resend = getCliente();
  const remitente = getSecret('EMAIL_FROM');

  if (!resend || !remitente) {
    return { ok: false, motivo: 'sin-configurar', error: 'Falta RESEND_API_KEY o EMAIL_FROM.' };
  }

  // El SDK devuelve { data, error } y no lanza: un fallo de la API llega como
  // valor, no como excepcion. Solo lanzaria por un fallo de red, que se deja
  // subir para que la cola lo cuente como intento y lo reprograme.
  const { data, error } = await resend.emails.send(
    {
      from: remitente,
      to: envio.para,
      replyTo: getSecret('EMAIL_REPLY_TO') || undefined,
      subject: envio.asunto,
      html: envio.html,
      text: envio.texto,
      attachments: envio.adjuntos?.map((adjunto) => ({
        filename: adjunto.nombre,
        content: Buffer.from(adjunto.contenido, 'utf8').toString('base64'),
        contentType: adjunto.tipo,
      })),
    },
    { idempotencyKey: envio.claveIdempotencia },
  );

  if (error || !data) {
    return { ok: false, motivo: 'rechazado', error: error?.message ?? 'Resend no devolvió un id.' };
  }

  return { ok: true, id: data.id };
}
