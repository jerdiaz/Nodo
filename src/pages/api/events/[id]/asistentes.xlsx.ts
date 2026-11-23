import type { APIRoute } from 'astro';
import { getCurrentUser } from '../../../../lib/auth';
import { getEventBySlug } from '../../../../lib/firebase/events';
import { esEventoDePago, getAsistentes } from '../../../../lib/firebase/rsvps';
import { buildXlsx, XLSX_CONTENT_TYPE, type XlsxCell, type XlsxColumn } from '../../../../lib/xlsx';

// La lista de asistentes en Excel, para quien organiza. Mismo permiso y mismos
// datos que /eventos/<slug>/asistentes: sale de getAsistentes(), con el correo
// y el celular de cada persona. El pago solo en los eventos de pago.
//
// Es un GET con la cookie de sesion para que baste un enlace con `download`:
// no hay que montar un fetch y un Blob en el cliente.

// Sin el tope de 500 de la pagina, pero con uno: la lectura de perfiles va en
// un solo getAll() y un evento con mas gente que esto ya no es de esta escala.
const MAX_ASISTENTES = 5000;

function texto(mensaje: string, status: number): Response {
  return new Response(mensaje, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store' },
  });
}

export const GET: APIRoute = async ({ params, cookies, site, url }) => {
  const user = await getCurrentUser(cookies);

  if (!user) {
    return texto('Debes iniciar sesión.', 401);
  }

  const event = params.id ? await getEventBySlug(params.id).catch(() => null) : null;

  if (!event) {
    return texto('Evento no encontrado.', 404);
  }

  if (event.organizer.uid !== user.uid) {
    return texto('No tienes permiso para ver los asistentes de este evento.', 403);
  }

  let asistentes;

  try {
    asistentes = await getAsistentes(event, MAX_ASISTENTES);
  } catch (error) {
    console.error('No se pudo leer la lista de asistentes para exportar:', error);
    return texto('No se pudo generar el archivo. Inténtalo de nuevo.', 503);
  }

  const dePago = esEventoDePago(event);
  const origen = site ?? url;

  const columnas: XlsxColumn[] = [
    { header: 'Nombre', width: 28 },
    { header: 'Usuario', width: 20 },
    { header: 'Perfil en Innvita', width: 40 },
    { header: 'Correo', width: 32 },
    { header: 'Celular', width: 18 },
    { header: 'Confirmó', width: 18 },
    ...(dePago ? [{ header: 'Pago', width: 14 }] : []),
  ];

  const filas: XlsxCell[][] = asistentes.map((asistente) => [
    asistente.nombre,
    asistente.perfil.username ? `@${asistente.perfil.username}` : '',
    asistente.perfil.username ? new URL(`/u/${asistente.perfil.username}`, origen).href : '',
    asistente.correo ?? '',
    asistente.perfil.phone ?? '',
    asistente.confirmadoEl,
    ...(dePago ? [asistente.pagoConfirmado ? 'Confirmado' : 'Pendiente'] : []),
  ]);

  const archivo = buildXlsx({
    name: 'Asistentes',
    columns: columnas,
    rows: filas,
    timezone: event.timezone,
  });

  return new Response(new Uint8Array(archivo), {
    status: 200,
    headers: {
      'Content-Type': XLSX_CONTENT_TYPE,
      // El slug es ASCII (lo genera slugify), asi que va tal cual en filename.
      'Content-Disposition': `attachment; filename="asistentes-${event.slug}.xlsx"`,
      // Lleva correos y celulares: que ningun intermediario lo guarde.
      'Cache-Control': 'private, no-store',
    },
  });
};
