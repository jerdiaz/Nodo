import { formatEventDateLong, formatEventTime } from '../format';

// Los cuatro correos que manda Nodo. Cada uno se arma con los datos que la cola
// guardo cuando el correo se encolo, no leyendo el evento en el momento de
// enviar: la cancelacion se manda justo despues de borrar el evento, asi que en
// ese momento ya no hay nada que leer.
export type TipoCorreo = 'confirmacion' | 'recordatorio' | 'actualizacion' | 'cancelacion';

export interface DatosCorreo {
  nombreDestinatario: string;
  tituloEvento: string;
  slugEvento: string;
  // ISO y no Timestamp: estos datos se guardan y se releen como JSON, y la
  // zona horaria viaja aparte porque es la del evento y no la del servidor.
  inicioIso: string;
  timezone: string;
  lugar: string;
  organizador: string;
  // Solo en 'actualizacion': que cambio, en frases ya redactadas. Se guardan
  // hechas porque quien las sabe es la ruta de edicion, que tiene delante el
  // documento viejo y el nuevo; reconstruirlas al enviar seria imposible.
  cambios?: string[];
}

export interface CorreoCompuesto {
  asunto: string;
  html: string;
  texto: string;
}

const ROJO = '#ed2727';

function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Estilos en linea y tablas, que es lo que entienden los clientes de correo:
// Outlook no aplica hojas de estilo externas y varios recortan el <style> del
// head. Es feo comparado con el resto del repo y es la forma correcta aqui.
function envoltura(contenido: string, pie: string): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<!-- Sin el charset, las tildes y las enes llegan rotas: el cuerpo del correo se
     interpreta como latin-1 en varios clientes por mucho que la parte MIME diga
     otra cosa, y en un producto en espanol eso se ve en la primera linea. -->
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
</head>
<body style="margin:0;padding:0;background:#f7f6f3;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f6f3;padding:32px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <tr><td style="height:4px;background:${ROJO};font-size:0;line-height:0;">&nbsp;</td></tr>
  <tr><td style="padding:28px 28px 8px;">
    <p style="margin:0;font-size:14px;font-weight:700;letter-spacing:-0.02em;color:#111113;">Nodo</p>
  </td></tr>
  <tr><td style="padding:0 28px 28px;">${contenido}</td></tr>
  <tr><td style="padding:20px 28px;border-top:1px solid #e3e3e6;">
    <p style="margin:0;font-size:12px;line-height:18px;color:#73737c;">${pie}</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function bloqueEvento(datos: DatosCorreo, enlace: string): string {
  const inicio = new Date(datos.inicioIso);
  const fecha = formatEventDateLong(inicio, datos.timezone);
  const hora = formatEventTime(inicio, datos.timezone);

  return `
    <p style="margin:0 0 6px;font-size:22px;line-height:30px;font-weight:700;letter-spacing:-0.02em;color:#111113;">
      ${escaparHtml(datos.tituloEvento)}
    </p>
    <p style="margin:0 0 4px;font-size:15px;line-height:22px;color:#58585d;">${escaparHtml(fecha)} · ${escaparHtml(hora)}</p>
    ${datos.lugar ? `<p style="margin:0 0 4px;font-size:15px;line-height:22px;color:#58585d;">${escaparHtml(datos.lugar)}</p>` : ''}
    <p style="margin:0 0 24px;font-size:15px;line-height:22px;color:#58585d;">Organiza ${escaparHtml(datos.organizador)}</p>
    <a href="${enlace}" style="display:inline-block;background:${ROJO};color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 22px;border-radius:999px;">Ver el evento</a>`;
}

function lineasTextoEvento(datos: DatosCorreo, enlace: string): string[] {
  const inicio = new Date(datos.inicioIso);

  return [
    datos.tituloEvento,
    `${formatEventDateLong(inicio, datos.timezone)} · ${formatEventTime(inicio, datos.timezone)}`,
    ...(datos.lugar ? [datos.lugar] : []),
    `Organiza ${datos.organizador}`,
    '',
    enlace,
  ];
}

// El pie explica por que llega el correo, que es lo que separa un aviso
// legitimo de algo que parece propaganda, y donde se apagan los que se pueden
// apagar. La confirmacion no se puede apagar: es el recibo de algo que la
// persona acaba de hacer.
const PIE_AVISOS =
  'Recibes este correo porque confirmaste tu asistencia en Nodo. Puedes dejar de recibir recordatorios y avisos desde Configuración → Preferencias.';
const PIE_RECIBO = 'Recibes este correo porque acabas de confirmar tu asistencia en Nodo.';

export function componerCorreo(tipo: TipoCorreo, datos: DatosCorreo, sitio: string): CorreoCompuesto {
  const enlace = `${sitio}/eventos/${datos.slugEvento}`;
  const saludo = datos.nombreDestinatario ? `Hola, ${datos.nombreDestinatario}.` : 'Hola.';

  if (tipo === 'confirmacion') {
    const intro = 'Tienes un lugar en';

    return {
      asunto: `Inscripción confirmada para ${datos.tituloEvento}`,
      html: envoltura(
        `<p style="margin:0 0 4px;font-size:15px;line-height:22px;color:#58585d;">${escaparHtml(saludo)}</p>
         <p style="margin:0 0 14px;font-size:15px;line-height:22px;color:#58585d;">${intro}</p>
         ${bloqueEvento(datos, enlace)}
         <p style="margin:24px 0 0;font-size:14px;line-height:21px;color:#73737c;">
           Adjuntamos la invitación para que la agregues a tu calendario. Si al final no puedes ir,
           puedes retirar tu asistencia desde la página del evento.
         </p>`,
        PIE_RECIBO,
      ),
      texto: [saludo, '', intro, ...lineasTextoEvento(datos, enlace), '', PIE_RECIBO].join('\n'),
    };
  }

  if (tipo === 'recordatorio') {
    const intro = 'Mañana es tu evento. Este es el recordatorio.';

    return {
      asunto: `Mañana: ${datos.tituloEvento}`,
      html: envoltura(
        `<p style="margin:0 0 4px;font-size:15px;line-height:22px;color:#58585d;">${escaparHtml(saludo)}</p>
         <p style="margin:0 0 14px;font-size:15px;line-height:22px;color:#58585d;">${intro}</p>
         ${bloqueEvento(datos, enlace)}`,
        PIE_AVISOS,
      ),
      texto: [saludo, '', intro, ...lineasTextoEvento(datos, enlace), '', PIE_AVISOS].join('\n'),
    };
  }

  if (tipo === 'actualizacion') {
    const cambios = datos.cambios ?? [];
    const intro = 'Quien organiza cambió algo de un evento al que vas:';

    return {
      asunto: `Cambios en ${datos.tituloEvento}`,
      html: envoltura(
        `<p style="margin:0 0 4px;font-size:15px;line-height:22px;color:#58585d;">${escaparHtml(saludo)}</p>
         <p style="margin:0 0 14px;font-size:15px;line-height:22px;color:#58585d;">${intro}</p>
         <ul style="margin:0 0 20px;padding-left:20px;font-size:15px;line-height:24px;color:#111113;">
           ${cambios.map((cambio) => `<li>${escaparHtml(cambio)}</li>`).join('')}
         </ul>
         ${bloqueEvento(datos, enlace)}
         <p style="margin:24px 0 0;font-size:14px;line-height:21px;color:#73737c;">
           La invitación adjunta reemplaza a la anterior en tu calendario.
         </p>`,
        PIE_AVISOS,
      ),
      texto: [
        saludo,
        '',
        intro,
        ...cambios.map((cambio) => `- ${cambio}`),
        '',
        ...lineasTextoEvento(datos, enlace),
        '',
        PIE_AVISOS,
      ].join('\n'),
    };
  }

  // Cancelacion. No lleva boton al evento: la pagina ya no existe.
  const inicio = new Date(datos.inicioIso);
  const cuando = `${formatEventDateLong(inicio, datos.timezone)} · ${formatEventTime(inicio, datos.timezone)}`;
  const intro = 'Se canceló un evento al que ibas:';

  return {
    asunto: `Cancelado: ${datos.tituloEvento}`,
    html: envoltura(
      `<p style="margin:0 0 4px;font-size:15px;line-height:22px;color:#58585d;">${escaparHtml(saludo)}</p>
       <p style="margin:0 0 14px;font-size:15px;line-height:22px;color:#58585d;">${intro}</p>
       <p style="margin:0 0 6px;font-size:22px;line-height:30px;font-weight:700;letter-spacing:-0.02em;color:#111113;text-decoration:line-through;">
         ${escaparHtml(datos.tituloEvento)}
       </p>
       <p style="margin:0 0 20px;font-size:15px;line-height:22px;color:#58585d;">Era el ${escaparHtml(cuando)}</p>
       <p style="margin:0;font-size:14px;line-height:21px;color:#73737c;">
         Ya lo quitamos de tu calendario y no tienes que hacer nada. Si quieres saber por qué se canceló,
         escríbele a ${escaparHtml(datos.organizador)}.
       </p>
       <p style="margin:20px 0 0;">
         <a href="${sitio}" style="display:inline-block;background:${ROJO};color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 22px;border-radius:999px;">Ver otros eventos</a>
       </p>`,
      PIE_AVISOS,
    ),
    texto: [
      saludo,
      '',
      intro,
      datos.tituloEvento,
      `Era el ${cuando}`,
      '',
      `Ya lo quitamos de tu calendario. Organizaba ${datos.organizador}.`,
      sitio,
      '',
      PIE_AVISOS,
    ].join('\n'),
  };
}
