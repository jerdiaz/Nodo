import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from './server';

// Metricas del panel de administracion.
//
// Dos de las tres series se cuentan aqui y una se lee de donde ya vive:
//
//   - Visitas: un contador por dia que incrementa el middleware. No hay
//     analitica de terceros y no hace falta: lo que quiere saber quien
//     administra es si entra gente y cuanta, y eso cabe en un numero al dia.
//   - Eventos creados: otro contador por dia, que incrementa la ruta de crear.
//     No se cuenta consultando la coleccion porque un evento borrado
//     desaparece de ella, y "cuantos se crearon" es un hecho que no deberia
//     cambiar porque despues alguien lo borrara.
//   - Registros: salen de Firebase Auth, que guarda la fecha de alta de cada
//     cuenta. Es la fuente de verdad y no se pierde con nada.
//
// Los dias se cortan en la zona del producto (America/Bogota) y no en la del
// servidor: a las once de la noche en Bogota ya es manana en UTC, y el dia del
// contador tiene que ser el que ve quien mira el panel.

const ZONA = 'America/Bogota';
const COLECCION = 'metricas';

export type TipoMetrica = 'visitas' | 'eventos';

export interface PuntoSerie {
  // YYYY-MM-DD
  fecha: string;
  total: number;
  // Solo en visitas: cuantas de esas venian con sesion iniciada.
  conSesion?: number;
}

export function claveDia(fecha: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: ZONA,
  }).format(fecha);
}

function diaRef(tipo: TipoMetrica, dia: string) {
  return getAdminDb().collection(COLECCION).doc(tipo).collection('dias').doc(dia);
}

// Una escritura por visita, con increment: no hay lectura previa ni carrera
// entre dos visitas a la vez. set con merge crea el dia si no existe.
export async function contarVisita(conSesion: boolean): Promise<void> {
  await diaRef('visitas', claveDia()).set(
    {
      total: FieldValue.increment(1),
      conSesion: FieldValue.increment(conSesion ? 1 : 0),
    },
    { merge: true },
  );
}

export async function contarEventoCreado(): Promise<void> {
  await diaRef('eventos', claveDia()).set({ total: FieldValue.increment(1) }, { merge: true });
}

// Los ultimos `dias` dias, todos presentes aunque no tengan documento: un dia
// sin visitas es un cero en el grafico, no un hueco.
function ultimosDias(dias: number): string[] {
  const claves: string[] = [];
  const ahora = Date.now();

  for (let i = dias - 1; i >= 0; i -= 1) {
    claves.push(claveDia(new Date(ahora - i * 86_400_000)));
  }

  return claves;
}

export async function getSeriePorDia(tipo: TipoMetrica, dias: number): Promise<PuntoSerie[]> {
  const claves = ultimosDias(dias);
  const docs = await getAdminDb().getAll(...claves.map((dia) => diaRef(tipo, dia)));

  return claves.map((fecha, i) => {
    const datos = docs[i]?.data() ?? {};

    return {
      fecha,
      total: typeof datos.total === 'number' ? datos.total : 0,
      ...(tipo === 'visitas' ? { conSesion: typeof datos.conSesion === 'number' ? datos.conSesion : 0 } : {}),
    };
  });
}

// Altas por dia, leidas de Firebase Auth. listUsers pagina de mil en mil; a la
// escala de Nodo cabe en una pagina, pero se recorre entera por si acaso.
export async function getRegistrosPorDia(dias: number): Promise<PuntoSerie[]> {
  const claves = ultimosDias(dias);
  const desde = new Set(claves);
  const cuenta = new Map<string, number>(claves.map((dia) => [dia, 0]));

  let pagina = await getAdminAuth().listUsers(1000);

  for (;;) {
    for (const usuario of pagina.users) {
      const creado = usuario.metadata.creationTime;
      if (!creado) continue;
      const dia = claveDia(new Date(creado));
      if (desde.has(dia)) cuenta.set(dia, (cuenta.get(dia) ?? 0) + 1);
    }

    if (!pagina.pageToken) break;
    pagina = await getAdminAuth().listUsers(1000, pagina.pageToken);
  }

  return claves.map((fecha) => ({ fecha, total: cuenta.get(fecha) ?? 0 }));
}
