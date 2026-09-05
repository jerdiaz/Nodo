import { esMismoDia, formatEventDateLong, formatEventTime } from '../format';

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

  // --- Todo lo de aqui abajo es opcional a proposito -------------------------
  // La cola es estado persistido: puede haber documentos encolados antes de
  // que estos campos existieran, y componerCorreo tiene que poder renderizarlos
  // sin romperse. Cada uno cae a no pintar su bloque.
  finIso?: string;
  bannerUrl?: string;
  direccion?: string;
  enlaceMapa?: string;
  meetingUrl?: string;
  precio?: string;
  enlaceCalendario?: string;
}

export interface CorreoCompuesto {
  asunto: string;
  html: string;
  texto: string;
}

const ROJO = '#ed2727';
const TINTA = '#111113';
const SUAVE = '#58585d';
const TENUE = '#73737c';
const LINEA = '#e3e3e6';

function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Lo que Gmail enseña en la bandeja detras del asunto. Sin esto coge las
// primeras palabras del cuerpo -"Hola, Manuel."- y desperdicia la linea que
// decide si alguien abre el correo o no.
//
// El relleno de caracteres invisibles va detras a proposito: sin el, el cliente
// sigue leyendo el cuerpo y pega el saludo justo despues del preheader.
function preheader(texto: string): string {
  return `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escaparHtml(texto)}${'&#847;&zwnj;&nbsp;'.repeat(60)}</div>`;
}

// Estilos en linea y tablas, que es lo que entienden los clientes de correo:
// Outlook no aplica hojas de estilo externas y varios recortan el <style> del
// head. Es feo comparado con el resto del repo y es la forma correcta aqui.
function envoltura(avance: string, contenido: string, pie: string): string {
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
${preheader(avance)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f6f3;padding:32px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <tr><td style="height:4px;background:${ROJO};font-size:0;line-height:0;">&nbsp;</td></tr>
  <tr><td style="padding:26px 28px 0;">
    <p style="margin:0;font-size:14px;font-weight:700;letter-spacing:-0.02em;color:${TINTA};">Nodo</p>
  </td></tr>
  ${contenido}
  <tr><td style="padding:20px 28px;border-top:1px solid ${LINEA};">
    <p style="margin:0;font-size:12px;line-height:18px;color:${TENUE};">${pie}</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

// La imagen del evento, a sangre y al ancho de la tarjeta.
//
// Va con alt y con el titulo repetido en texto debajo porque muchos clientes
// bloquean imagenes por omision: el correo tiene que decir lo mismo con la
// imagen apagada. Por eso la imagen nunca lleva informacion que no este escrita.
function bloqueBanner(datos: DatosCorreo): string {
  if (!datos.bannerUrl) {
    return '';
  }

  return `<tr><td style="padding:20px 28px 0;">
    <img src="${escaparHtml(datos.bannerUrl)}" alt="" width="504" style="display:block;width:100%;max-width:504px;height:auto;border-radius:12px;border:0;outline:none;text-decoration:none;">
  </td></tr>`;
}

function filaDato(etiqueta: string, lineas: string[]): string {
  if (lineas.length === 0) {
    return '';
  }

  return `<tr>
    <td style="padding:14px 18px;border-bottom:1px solid ${LINEA};">
      <p style="margin:0 0 3px;font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:${TENUE};">${etiqueta}</p>
      ${lineas.map((linea) => `<p style="margin:0;font-size:15px;line-height:22px;color:${TINTA};">${linea}</p>`).join('')}
    </td>
  </tr>`;
}

// Cuando, donde y cuanto, en una tarjeta con una fila por dato.
//
// Etiquetas en vez de iconos: un emoji se ve distinto en cada cliente y una
// imagen se bloquea. Una palabra en versalitas se lee igual en todos.
function tarjetaDetalles(datos: DatosCorreo): string {
  const inicio = new Date(datos.inicioIso);
  const fin = datos.finIso ? new Date(datos.finIso) : null;

  const fechaInicio = formatEventDateLong(inicio, datos.timezone);
  const horaInicio = formatEventTime(inicio, datos.timezone);

  // Un evento que termina otro dia necesita las dos fechas; el que empieza y
  // acaba el mismo dia se lee mejor con una sola y el rango de horas.
  const cuando =
    fin && formatEventDateLong(fin, datos.timezone) !== fechaInicio
      ? [
          `${escaparHtml(fechaInicio)}, ${escaparHtml(horaInicio)}`,
          `hasta ${escaparHtml(formatEventDateLong(fin, datos.timezone))}, ${escaparHtml(formatEventTime(fin, datos.timezone))}`,
        ]
      : [
          escaparHtml(fechaInicio),
          fin
            ? `${escaparHtml(horaInicio)} – ${escaparHtml(formatEventTime(fin, datos.timezone))}`
            : escaparHtml(horaInicio),
        ];

  const donde: string[] = [];

  if (datos.direccion) {
    donde.push(escaparHtml(datos.direccion));

    if (datos.enlaceMapa) {
      donde.push(
        `<a href="${escaparHtml(datos.enlaceMapa)}" style="color:${ROJO};text-decoration:none;font-size:14px;">Ver en el mapa &rarr;</a>`,
      );
    }
  }

  if (datos.meetingUrl) {
    donde.push(
      `<a href="${escaparHtml(datos.meetingUrl)}" style="color:${ROJO};text-decoration:none;font-size:14px;">Enlace de conexión &rarr;</a>`,
    );
  }

  const filas = [
    filaDato('Cuándo', cuando),
    filaDato('Dónde', donde),
    filaDato('Entrada', datos.precio ? [escaparHtml(datos.precio)] : []),
    filaDato('Organiza', [escaparHtml(datos.organizador)]),
  ].join('');

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${LINEA};border-radius:12px;overflow:hidden;">
    ${filas}
  </table>`;
}

function botones(datos: DatosCorreo, sitio: string): string {
  const evento = `${sitio}/eventos/${datos.slugEvento}`;

  const principal = `<a href="${escaparHtml(evento)}" style="display:inline-block;background:${ROJO};color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 22px;border-radius:999px;">Ver el evento</a>`;

  const calendario = datos.enlaceCalendario
    ? `<a href="${escaparHtml(datos.enlaceCalendario)}" style="display:inline-block;border:1px solid ${LINEA};color:${TINTA};text-decoration:none;font-size:15px;font-weight:600;padding:11px 21px;border-radius:999px;">Añadir al calendario</a>`
    : '';

  // Celdas sueltas y no un flex: en correo, dos enlaces en linea con un
  // espacio entre ellos es lo unico que se comporta igual en todas partes.
  return `<p style="margin:22px 0 0;line-height:44px;">${principal}${calendario ? `&nbsp;&nbsp;${calendario}` : ''}</p>`;
}

function seccion(contenido: string): string {
  return `<tr><td style="padding:20px 28px 28px;">${contenido}</td></tr>`;
}

function titulo(texto: string, tachado = false): string {
  return `<p style="margin:0 0 16px;font-size:23px;line-height:30px;font-weight:700;letter-spacing:-0.02em;color:${TINTA};${tachado ? 'text-decoration:line-through;' : ''}">${escaparHtml(texto)}</p>`;
}

function parrafo(texto: string, color = SUAVE): string {
  return `<p style="margin:0 0 14px;font-size:15px;line-height:22px;color:${color};">${escaparHtml(texto)}</p>`;
}

function nota(texto: string): string {
  return `<p style="margin:22px 0 0;font-size:14px;line-height:21px;color:${TENUE};">${escaparHtml(texto)}</p>`;
}

// --- Version en texto plano --------------------------------------------------

// No es un descarte: va en la parte text/plain del mensaje y es lo que leen los
// filtros de spam y los clientes sin HTML. Un correo con HTML y sin texto
// puntua peor en entregabilidad, asi que sigue la misma estructura.
function lineasEvento(datos: DatosCorreo, sitio: string): string[] {
  const inicio = new Date(datos.inicioIso);
  const fin = datos.finIso ? new Date(datos.finIso) : null;

  const hora = fin
    ? `${formatEventTime(inicio, datos.timezone)} – ${formatEventTime(fin, datos.timezone)}`
    : formatEventTime(inicio, datos.timezone);

  return [
    datos.tituloEvento,
    '',
    `CUÁNDO   ${formatEventDateLong(inicio, datos.timezone)}, ${hora}`,
    ...(datos.direccion ? [`DÓNDE    ${datos.direccion}`] : []),
    ...(datos.meetingUrl ? [`ENLACE   ${datos.meetingUrl}`] : []),
    ...(datos.precio ? [`ENTRADA  ${datos.precio}`] : []),
    `ORGANIZA ${datos.organizador}`,
    '',
    `${sitio}/eventos/${datos.slugEvento}`,
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
  const saludo = datos.nombreDestinatario ? `Hola, ${datos.nombreDestinatario}.` : 'Hola.';
  const inicio = new Date(datos.inicioIso);
  const cuandoCorto = `${formatEventDateLong(inicio, datos.timezone)}, ${formatEventTime(inicio, datos.timezone)}`;

  if (tipo === 'confirmacion') {
    const avance = `Tu lugar está confirmado. ${cuandoCorto}${datos.lugar ? `, ${datos.lugar}` : ''}.`;

    return {
      asunto: `Inscripción confirmada para ${datos.tituloEvento}`,
      html: envoltura(
        avance,
        bloqueBanner(datos) +
          seccion(
            parrafo(saludo) +
              parrafo('Tienes un lugar en') +
              titulo(datos.tituloEvento) +
              tarjetaDetalles(datos) +
              botones(datos, sitio) +
              nota(
                'Adjuntamos la invitación para que la agregues a tu calendario. Si al final no puedes ir, retira tu asistencia desde la página del evento para dejarle el lugar a alguien más.',
              ),
          ),
        PIE_RECIBO,
      ),
      texto: [saludo, '', 'Tienes un lugar en:', '', ...lineasEvento(datos, sitio), '', PIE_RECIBO].join('\n'),
    };
  }

  if (tipo === 'recordatorio') {
    // El barrido cubre de 2 a 24 horas antes, asi que un evento de esta tarde
    // entra igual que uno de manana. Decirle "manana" a alguien que va hoy es
    // el tipo de error que hace desconfiar del resto del mensaje.
    const esHoy = esMismoDia(inicio, new Date(), datos.timezone);
    const cuando = esHoy ? 'hoy' : 'mañana';
    const avance = `Es ${cuando}, ${formatEventTime(inicio, datos.timezone)}${datos.lugar ? `, ${datos.lugar}` : ''}.`;

    return {
      asunto: `${esHoy ? 'Hoy' : 'Mañana'}: ${datos.tituloEvento}`,
      html: envoltura(
        avance,
        bloqueBanner(datos) +
          seccion(
            parrafo(saludo) +
              parrafo(`Tu evento es ${cuando}. Este es el recordatorio.`) +
              titulo(datos.tituloEvento) +
              tarjetaDetalles(datos) +
              botones(datos, sitio),
          ),
        PIE_AVISOS,
      ),
      texto: [
        saludo,
        '',
        `Tu evento es ${cuando}. Este es el recordatorio.`,
        '',
        ...lineasEvento(datos, sitio),
        '',
        PIE_AVISOS,
      ].join('\n'),
    };
  }

  if (tipo === 'actualizacion') {
    const cambios = datos.cambios ?? [];
    const avance = cambios[0] ?? `Cambió algo en ${datos.tituloEvento}.`;

    return {
      asunto: `Cambios en ${datos.tituloEvento}`,
      html: envoltura(
        avance,
        bloqueBanner(datos) +
          seccion(
            parrafo(saludo) +
              parrafo('Quien organiza cambió algo de un evento al que vas:') +
              // Los cambios van resaltados y antes del resto: es lo unico que
              // esta persona no sabia ya.
              `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fdeaea;border-radius:12px;margin:0 0 18px;">
                 <tr><td style="padding:14px 18px;">
                   ${cambios.map((cambio) => `<p style="margin:0 0 4px;font-size:15px;line-height:22px;font-weight:600;color:${TINTA};">${escaparHtml(cambio)}</p>`).join('')}
                 </td></tr>
               </table>` +
              titulo(datos.tituloEvento) +
              tarjetaDetalles(datos) +
              botones(datos, sitio) +
              nota('La invitación adjunta reemplaza a la anterior en tu calendario.'),
          ),
        PIE_AVISOS,
      ),
      texto: [
        saludo,
        '',
        'Quien organiza cambió algo de un evento al que vas:',
        ...cambios.map((cambio) => `  · ${cambio}`),
        '',
        ...lineasEvento(datos, sitio),
        '',
        PIE_AVISOS,
      ].join('\n'),
    };
  }

  // Cancelacion. Sin imagen y sin boton al evento: la pagina ya no existe, y
  // un banner grande de algo que no va a pasar se lee como una burla.
  const avance = `El evento del ${formatEventDateLong(inicio, datos.timezone)} ya no se hará.`;

  return {
    asunto: `Cancelado: ${datos.tituloEvento}`,
    html: envoltura(
      avance,
      seccion(
        parrafo(saludo) +
          parrafo('Se canceló un evento al que ibas:') +
          titulo(datos.tituloEvento, true) +
          `<p style="margin:0 0 18px;font-size:15px;line-height:22px;color:${SUAVE};">Era el ${escaparHtml(cuandoCorto)}${datos.lugar ? ` en ${escaparHtml(datos.lugar)}` : ''}.</p>` +
          `<p style="margin:0;font-size:15px;line-height:22px;color:${SUAVE};">Ya lo quitamos de tu calendario y no tienes que hacer nada. Si quieres saber por qué se canceló, escríbele a ${escaparHtml(datos.organizador)}.</p>` +
          `<p style="margin:22px 0 0;line-height:44px;"><a href="${escaparHtml(sitio)}" style="display:inline-block;background:${ROJO};color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 22px;border-radius:999px;">Ver otros eventos</a></p>`,
      ),
      PIE_AVISOS,
    ),
    texto: [
      saludo,
      '',
      'Se canceló un evento al que ibas:',
      '',
      datos.tituloEvento,
      `Era el ${cuandoCorto}${datos.lugar ? ` en ${datos.lugar}` : ''}.`,
      '',
      `Ya lo quitamos de tu calendario. Organizaba ${datos.organizador}.`,
      sitio,
      '',
      PIE_AVISOS,
    ].join('\n'),
  };
}
