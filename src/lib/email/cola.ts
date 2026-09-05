import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '../firebase/server';
import { getEmailsByUid, getUserProfiles } from '../firebase/users';
import { getEventsStartingBetween } from '../firebase/events';
import { buildIcsInvitation } from '../calendar';
import { componerCorreo, type DatosCorreo, type TipoCorreo } from './plantillas';
import { correoConfigurado, direccionRemitente, enviarCorreo, type AdjuntoCorreo } from './resend';
import type { NodoEvent } from '../../types/event';

// Cola de salida de correo, en Firestore.
//
// Nada envia directo. Encolar es una escritura barata que no puede fallar por
// culpa de un tercero, y enviar es un paso aparte que se puede reintentar. Eso
// compra las tres cosas que un envio directo no da:
//
//   - Confirmar asistencia no puede fallar porque Resend este caido. La
//     transaccion del RSVP ya se cerro; el correo es una consecuencia, no parte
//     de la operacion.
//   - Un correo que salio mal se reintenta con espera creciente en vez de
//     perderse en un console.warn.
//   - "¿le llego el correo?" tiene respuesta, porque queda el documento.
//
// El id del documento es determinista (tipo + evento + destinatario), asi que
// encolar dos veces lo mismo es imposible: es el mismo truco que ya usan las
// notificaciones para no avisar dos veces del mismo RSVP.

const COLECCION = 'correos';
const MAX_INTENTOS = 5;

// La pagina para los enlaces de los correos. Sale de `site` en
// astro.config.mjs, que es donde ya vive la direccion publica del sitio: al
// mudarse a un dominio propio se cambia ahi y los correos van detras.
const SITIO = import.meta.env.SITE ?? 'https://nodo-eventos.duckdns.org';

export interface DestinatarioCorreo {
  uid: string;
  correo: string;
  nombre: string;
}

interface DocumentoCorreo {
  tipo: TipoCorreo;
  para: string;
  uid: string;
  eventoId: string;
  datos: DatosCorreo;
  adjunto?: AdjuntoCorreo;
  estado: 'pendiente' | 'enviado' | 'fallido';
  intentos: number;
}

function coleccion() {
  return getAdminDb().collection(COLECCION);
}

// --- Destinatarios -----------------------------------------------------------

// Quienes confirmaron asistencia a un evento, ya con correo y nombre.
//
// `respetarPreferencia` es falso solo para la confirmacion: ese correo es el
// recibo de algo que la persona acaba de hacer y no un aviso que se pueda
// apagar. Los otros tres si obedecen el interruptor de Configuracion.
export async function destinatariosDelEvento(
  eventoId: string,
  respetarPreferencia = true,
): Promise<DestinatarioCorreo[]> {
  // listDocuments() devuelve referencias, no datos: los uids son los ids de los
  // documentos, asi que no hace falta pagar una lectura por asistente.
  const referencias = await getAdminDb()
    .collection('events')
    .doc(eventoId)
    .collection('rsvps')
    .listDocuments();

  const uids = referencias.map((referencia) => referencia.id);

  return resolverDestinatarios(uids, respetarPreferencia);
}

export async function resolverDestinatarios(
  uids: string[],
  respetarPreferencia = true,
): Promise<DestinatarioCorreo[]> {
  if (uids.length === 0) {
    return [];
  }

  // Los dos viajes salen a la vez: los correos viven en Firebase Auth y el
  // nombre y la preferencia en el perfil de Firestore, y ninguno depende del
  // otro.
  const [correos, perfiles] = await Promise.all([getEmailsByUid(uids), getUserProfiles(uids)]);

  return uids.flatMap((uid) => {
    const correo = correos.get(uid);

    if (!correo) {
      return [];
    }

    const perfil = perfiles.get(uid);

    // Ausencia de valor es "si": quien nunca toco el interruptor espera que le
    // avisen, y esa es la unica lectura razonable de un campo que no existe en
    // los perfiles anteriores a esta funcion.
    if (respetarPreferencia && perfil?.emailAvisos === false) {
      return [];
    }

    return [
      {
        uid,
        correo,
        nombre: perfil?.firstName ?? '',
      },
    ];
  });
}

// --- Encolar -----------------------------------------------------------------

function idDeCorreo(tipo: TipoCorreo, eventoId: string, uid: string, version?: string): string {
  return [tipo, eventoId, uid, version].filter(Boolean).join('_');
}

// SEQUENCE del calendario: tiene que crecer para que una actualizacion pise a
// la invitacion anterior en vez de crear un evento nuevo. Los segundos desde
// epoch crecen solos y no obligan a llevar la cuenta por evento en ningun sitio.
function secuenciaAhora(): number {
  return Math.floor(Date.now() / 1000);
}

function datosDelEvento(
  evento: NodoEvent,
  destinatario: DestinatarioCorreo,
  cambios?: string[],
): DatosCorreo {
  return {
    nombreDestinatario: destinatario.nombre,
    tituloEvento: evento.title,
    slugEvento: evento.slug,
    inicioIso: evento.startDate.toISOString(),
    timezone: evento.timezone,
    lugar: [evento.venue, evento.city].filter(Boolean).join(', '),
    organizador: evento.community?.name ?? evento.organizer.name,
    cambios,
  };
}

// La invitacion va por destinatario y no una para todos: la linea ATTENDEE
// lleva el correo de quien la recibe, y sin eso Gmail no la reconoce como
// dirigida a el y no ofrece agregarla al calendario.
function invitacionPara(
  evento: NodoEvent,
  destinatario: DestinatarioCorreo,
  metodo: 'REQUEST' | 'CANCEL',
): AdjuntoCorreo | undefined {
  const remitente = direccionRemitente();

  if (!remitente) {
    return undefined;
  }

  const ics = buildIcsInvitation({
    event: evento,
    correoAsistente: destinatario.correo,
    // Como ORGANIZER va la direccion de Nodo y no la de quien organiza: el
    // ORGANIZER de un .ics es visible para todos los invitados, y el correo
    // personal de quien publica un evento no tiene por que serlo.
    correoOrganizador: remitente,
    nombreOrganizador: evento.community?.name ?? evento.organizer.name,
    metodo,
    secuencia: secuenciaAhora(),
  });

  return {
    nombre: metodo === 'CANCEL' ? 'cancelacion.ics' : 'invitacion.ics',
    contenido: ics,
    tipo: `text/calendar; charset=utf-8; method=${metodo}`,
  };
}

export interface EncolarOpciones {
  evento: NodoEvent;
  tipo: TipoCorreo;
  destinatarios: DestinatarioCorreo[];
  cambios?: string[];
  // Discriminador para el id, cuando el mismo tipo puede repetirse
  // legitimamente sobre el mismo evento y la misma persona. Lo usa
  // 'actualizacion': dos ediciones distintas son dos correos, dos guardados
  // identicos del mismo formulario son uno.
  version?: string;
}

// Un lote de Firestore admite 500 escrituras, y getAll() tampoco es gratis con
// una lista enorme. Se trocea por debajo de ese limite para que un evento
// multitudinario encole igual que uno de diez personas, en vez de reventar el
// commit entero.
const POR_LOTE = 400;

// Devuelve los ids encolados de verdad (los que ya existian no se repiten).
export async function encolarCorreos(opciones: EncolarOpciones): Promise<string[]> {
  const encolados: string[] = [];

  for (let i = 0; i < opciones.destinatarios.length; i += POR_LOTE) {
    const trozo = opciones.destinatarios.slice(i, i + POR_LOTE);
    encolados.push(...(await encolarLote({ ...opciones, destinatarios: trozo })));
  }

  return encolados;
}

async function encolarLote({
  evento,
  tipo,
  destinatarios,
  cambios,
  version,
}: EncolarOpciones): Promise<string[]> {
  if (destinatarios.length === 0) {
    return [];
  }

  const metodo = tipo === 'cancelacion' ? 'CANCEL' : 'REQUEST';
  const referencias = destinatarios.map((destinatario) =>
    coleccion().doc(idDeCorreo(tipo, evento.id, destinatario.uid, version)),
  );

  // Un getAll() para saber cuales ya existen, en vez de batch.create(), que
  // aborta el lote entero en cuanto uno choca. El barrido de recordatorios
  // vuelve a pasar por los mismos eventos cada quince minutos, asi que chocar
  // es el caso normal y no un error.
  const existentes = new Set(
    (await getAdminDb().getAll(...referencias)).filter((doc) => doc.exists).map((doc) => doc.id),
  );

  const lote = getAdminDb().batch();
  const encolados: string[] = [];

  destinatarios.forEach((destinatario, indice) => {
    const referencia = referencias[indice]!;

    if (existentes.has(referencia.id)) {
      return;
    }

    const documento: DocumentoCorreo = {
      tipo,
      para: destinatario.correo,
      uid: destinatario.uid,
      eventoId: evento.id,
      datos: datosDelEvento(evento, destinatario, cambios),
      adjunto: invitacionPara(evento, destinatario, metodo),
      estado: 'pendiente',
      intentos: 0,
    };

    lote.set(referencia, {
      ...documento,
      creadoEn: FieldValue.serverTimestamp(),
      proximoIntento: Timestamp.now(),
    });

    encolados.push(referencia.id);
  });

  if (encolados.length > 0) {
    await lote.commit();
  }

  return encolados;
}

// --- Recordatorios -----------------------------------------------------------

// El suelo de la ventana. Sin el, quien confirma la vispera por la tarde
// recibiria el "manana es tu evento" quince minutos despues de la confirmacion,
// que se lee como un fallo aunque sea literalmente cierto.
const HORAS_MINIMAS_ANTES = 2;

// Encola el recordatorio de todo evento que empiece dentro de las proximas 24
// horas. Se puede llamar tantas veces como se quiera: el id del correo es
// determinista, asi que el segundo barrido sobre el mismo evento no encola
// nada. Es lo que permite que el cron corra cada cuarto de hora sin llevar la
// cuenta de por donde iba.
export async function encolarRecordatorios(): Promise<number> {
  const ahora = Date.now();
  const eventos = await getEventsStartingBetween(
    new Date(ahora + HORAS_MINIMAS_ANTES * 60 * 60_000),
    new Date(ahora + 24 * 60 * 60_000),
  );

  let total = 0;

  for (const evento of eventos) {
    const destinatarios = await destinatariosDelEvento(evento.id);
    const encolados = await encolarCorreos({ evento, tipo: 'recordatorio', destinatarios });
    total += encolados.length;
  }

  return total;
}

// --- Despachar ---------------------------------------------------------------

// Espera creciente entre intentos, tope de una hora: si Resend esta caido, no
// tiene sentido insistir cada minuto durante horas.
function proximoIntentoTras(intentos: number): Timestamp {
  const minutos = Math.min(2 ** intentos, 60);
  return Timestamp.fromMillis(Date.now() + minutos * 60_000);
}

async function despacharDocumento(
  doc: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot,
): Promise<'enviado' | 'reintentar' | 'fallido'> {
  const datos = doc.data() as (DocumentoCorreo & { intentos?: number }) | undefined;

  if (!datos || datos.estado !== 'pendiente') {
    return 'enviado';
  }

  const intentos = (datos.intentos ?? 0) + 1;
  const { asunto, html, texto } = componerCorreo(datos.tipo, datos.datos, SITIO);

  let error = '';

  try {
    const resultado = await enviarCorreo({
      para: datos.para,
      asunto,
      html,
      texto,
      adjuntos: datos.adjunto ? [datos.adjunto] : undefined,
      // El id del documento como clave de idempotencia: si un fallo de red nos
      // hace reintentar un envio que si llego a salir, Resend lo reconoce y no
      // manda un segundo correo.
      claveIdempotencia: doc.id,
    });

    if (resultado.ok) {
      await doc.ref.update({
        estado: 'enviado',
        intentos,
        enviadoEn: FieldValue.serverTimestamp(),
        idResend: resultado.id,
        // Se borra el campo en vez de marcarlo: la consulta del barrido filtra
        // por `proximoIntento <= ahora`, y en Firestore un documento sin ese
        // campo no aparece en un filtro sobre el. Asi el barrido no necesita un
        // indice compuesto (estado + proximoIntento) y el documento se queda
        // como registro de lo enviado.
        proximoIntento: FieldValue.delete(),
      });

      return 'enviado';
    }

    error = resultado.error;
  } catch (fallo) {
    error = fallo instanceof Error ? fallo.message : String(fallo);
  }

  if (intentos >= MAX_INTENTOS) {
    await doc.ref.update({
      estado: 'fallido',
      intentos,
      error,
      proximoIntento: FieldValue.delete(),
    });

    return 'fallido';
  }

  await doc.ref.update({ intentos, error, proximoIntento: proximoIntentoTras(intentos) });

  return 'reintentar';
}

export interface ResumenDespacho {
  enviados: number;
  reintentar: number;
  fallidos: number;
}

// Dispara el envio sin hacer esperar a quien pidio la pagina. Es seguro porque
// el adaptador de Node corre un servidor de larga vida: el proceso sigue en pie
// despues de responder y la promesa termina. En un despliegue sin servidor
// (Vercel, Workers) esto se cortaria al devolver la respuesta, y habria que
// dejarselo entero al cron -que de todas formas es la red de seguridad: lo que
// no salga por aqui sale en el siguiente barrido.
export function enSegundoPlano(trabajo: Promise<unknown>): void {
  void trabajo.catch((error) => {
    console.warn('Fallo al despachar correo en segundo plano:', error);
  });
}

// Huella corta y estable de un texto, para distinguir dos ediciones distintas
// del mismo evento en el id del correo. FNV-1a, igual que genColor: no hace
// falta nada criptografico para esto.
export function huella(texto: string): string {
  let h = 0x811c9dc5;

  for (let i = 0; i < texto.length; i += 1) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }

  return (h >>> 0).toString(36);
}

// Un solo correo, por id. Lo usa la ruta de RSVP justo despues de encolar, para
// que la confirmacion salga en el acto y no en el siguiente paso del cron.
export async function despacharCorreo(id: string): Promise<void> {
  if (!correoConfigurado()) {
    return;
  }

  const doc = await coleccion().doc(id).get();

  if (doc.exists) {
    await despacharDocumento(doc);
  }
}

export async function despacharPendientes(limite = 25): Promise<ResumenDespacho> {
  const resumen: ResumenDespacho = { enviados: 0, reintentar: 0, fallidos: 0 };

  if (!correoConfigurado()) {
    return resumen;
  }

  // Rango y orden sobre el mismo campo suelto: Firestore lo indexa por su
  // cuenta, sin indice compuesto, en la misma linea que el resto del repo.
  const pendientes = await coleccion()
    .where('proximoIntento', '<=', Timestamp.now())
    .orderBy('proximoIntento', 'asc')
    .limit(limite)
    .get();

  // En serie y no con Promise.all: son llamadas a una API con limite de ritmo,
  // y veinticinco a la vez es la forma de que empiece a devolver 429.
  for (const doc of pendientes.docs) {
    const resultado = await despacharDocumento(doc);

    if (resultado === 'enviado') {
      resumen.enviados += 1;
    } else if (resultado === 'fallido') {
      resumen.fallidos += 1;
    } else {
      resumen.reintentar += 1;
    }
  }

  return resumen;
}
