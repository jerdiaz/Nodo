import type { APIRoute } from 'astro';
import { getAdminUser } from '../../../../../lib/auth';
import { mapDocToEvent } from '../../../../../lib/firebase/events';
import { esEventoDePago, getAsistentesAdmin } from '../../../../../lib/firebase/rsvps';
import { getAdminDb } from '../../../../../lib/firebase/server';
import { buildXlsx, XLSX_CONTENT_TYPE, type XlsxCell, type XlsxColumn } from '../../../../../lib/xlsx';

// La lista de asistentes de cualquier evento en Excel, para el panel de
// administracion. Mismos datos que la tabla del panel (getAsistentesAdmin):
// correo siempre, celular y pago solo en eventos de pago, y las cuentas
// eliminadas como "Cuenta eliminada" en vez de desaparecer.
//
// GET con la cookie de sesion, como la descarga del organizador, para que
// baste un enlace con `download`.

function texto(mensaje: string, status: number): Response {
  return new Response(mensaje, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store' },
  });
}

function estadoDeCuenta(fila: { admin: boolean; verification: unknown; blocked: boolean }): string {
  return [fila.admin ? 'Admin' : null, fila.verification ? 'Verificado' : null, fila.blocked ? 'Bloqueado' : null]
    .filter(Boolean)
    .join(', ');
}

export const GET: APIRoute = async ({ params, cookies, site, url }) => {
  const admin = await getAdminUser(cookies);

  if (!admin) {
    return texto('No tienes permiso para administrar.', 403);
  }

  const id = params.id;

  if (!id) {
    return texto('Falta el id del evento.', 400);
  }

  let event;
  let filas;

  try {
    const doc = await getAdminDb().collection('events').doc(id).get();

    if (!doc.exists) {
      return texto('El evento no existe.', 404);
    }

    event = mapDocToEvent(doc);
    filas = await getAsistentesAdmin(event);
  } catch (error) {
    console.error('No se pudo leer la lista de asistentes para exportar (admin):', error);
    return texto('No se pudo generar el archivo. Inténtalo de nuevo.', 503);
  }

  const dePago = esEventoDePago(event);
  const origen = site ?? url;

  const columnas: XlsxColumn[] = [
    { header: 'Nombre', width: 28 },
    { header: 'Usuario', width: 20 },
    { header: 'Perfil en Innvita', width: 40 },
    { header: 'Correo', width: 32 },
    ...(dePago ? [{ header: 'Celular', width: 18 }] : []),
    { header: 'Confirmó', width: 18 },
    ...(dePago ? [{ header: 'Pago', width: 14 }] : []),
    { header: 'Estado de la cuenta', width: 22 },
  ];

  const celdas: XlsxCell[][] = filas.map((fila) => [
    fila.nombre,
    fila.username ? `@${fila.username}` : '',
    fila.username ? new URL(`/u/${fila.username}`, origen).href : '',
    fila.email ?? '',
    ...(dePago ? [fila.telefono ?? ''] : []),
    fila.confirmadoEl,
    ...(dePago ? [fila.pagoConfirmado ? 'Confirmado' : 'Pendiente'] : []),
    estadoDeCuenta(fila),
  ]);

  const archivo = buildXlsx({
    name: 'Asistentes',
    columns: columnas,
    rows: celdas,
    timezone: event.timezone,
  });

  return new Response(new Uint8Array(archivo), {
    status: 200,
    headers: {
      'Content-Type': XLSX_CONTENT_TYPE,
      // El slug es ASCII (lo genera slugify), asi que va tal cual en filename.
      'Content-Disposition': `attachment; filename="asistentes-${event.slug ?? id}.xlsx"`,
      // Lleva correos de todos los asistentes: que ningun intermediario lo
      // guarde.
      'Cache-Control': 'private, no-store',
    },
  });
};
