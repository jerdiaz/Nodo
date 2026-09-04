import type { APIRoute } from 'astro';
import { jsonResponse } from '../../lib/api';
import { getCurrentUser } from '../../lib/auth';

// Busqueda de sitios para el formulario de eventos. Acepta las dos cosas que
// hace la gente: pegar el enlace del sitio en Google Maps, o escribir el
// nombre y elegir de una lista.
//
// Va por el servidor y no desde el navegador por tres razones: Nominatim pide
// un User-Agent que identifique a la aplicacion y el navegador no deja
// ponerlo; su politica limita a una consulta por segundo, que solo se puede
// respetar desde un sitio que las vea todas; y seguir la redireccion de un
// enlace corto de Maps desde la pagina choca con CORS.

export interface Sitio {
  nombre: string;
  direccion?: string;
  ciudad?: string;
  latitude: number;
  longitude: number;
}

// Solo se sigue la redireccion de estos dominios. Sin la lista, pegar
// cualquier URL convertiria este endpoint en un cliente HTTP a peticion de
// quien la pegue, que es justo lo que no debe ser.
const HOSTS_MAPS = [
  'maps.app.goo.gl',
  'goo.gl',
  'maps.google.com',
  'www.google.com',
  'google.com',
  'maps.apple.com',
];

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const AGENTE = 'Nodo/1.0 (cartelera comunitaria; https://nodo-eventos.duckdns.org)';

// La politica de uso de Nominatim admite como mucho una consulta por segundo.
// Se respeta aqui, en un unico punto, porque es el unico sitio del que salen.
let ultimaConsulta = 0;

async function esperarTurno(): Promise<void> {
  const espera = 1000 - (Date.now() - ultimaConsulta);

  if (espera > 0) {
    await new Promise((resolve) => setTimeout(resolve, espera));
  }

  ultimaConsulta = Date.now();
}

function esUrlDeMapas(valor: string): URL | null {
  try {
    const url = new URL(valor);

    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return null;
    }

    return HOSTS_MAPS.includes(url.hostname) ? url : null;
  } catch {
    return null;
  }
}

function coordenadasValidas(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180
  );
}

// Los enlaces de Maps llevan las coordenadas de varias formas segun como se
// hayan generado: la vista de la camara va en @lat,lng, el punto real del
// sitio en !3d/!4d, y los enlaces de compartir en q= o ll=. Se prueban en ese
// orden de fiabilidad inversa: !3d/!4d es el sitio, @ es solo el encuadre.
function coordenadasDeUrl(url: URL): { latitude: number; longitude: number } | null {
  const texto = url.href;

  const patrones = [
    /!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/,
    /[?&](?:q|ll|center|daddr)=(-?\d+\.?\d*),\s*(-?\d+\.?\d*)/,
    /@(-?\d+\.?\d*),(-?\d+\.?\d*)/,
  ];

  for (const patron of patrones) {
    const encontrado = texto.match(patron);

    if (encontrado) {
      const latitude = Number(encontrado[1]);
      const longitude = Number(encontrado[2]);

      if (coordenadasValidas(latitude, longitude)) {
        return { latitude, longitude };
      }
    }
  }

  return null;
}

// El nombre que Google mete en la ruta del enlace, para cuando el enlace no
// trae coordenadas y hay que buscarlo por texto de todos modos.
function nombreDeUrl(url: URL): string | null {
  const encontrado = url.pathname.match(/\/place\/([^/@]+)/);

  if (!encontrado?.[1]) {
    return null;
  }

  return decodeURIComponent(encontrado[1].replace(/\+/g, ' ')).trim() || null;
}

// Los enlaces cortos no llevan nada dentro: hay que pedirlos para que digan a
// donde apuntan. Se lee solo la cabecera Location, sin descargar la pagina.
async function resolverEnlaceCorto(url: URL): Promise<URL> {
  let actual = url;

  for (let salto = 0; salto < 3; salto += 1) {
    const respuesta = await fetch(actual.href, {
      method: 'HEAD',
      redirect: 'manual',
      signal: AbortSignal.timeout(5000),
    });

    const destino = respuesta.headers.get('location');

    if (!destino) {
      return actual;
    }

    const siguiente = new URL(destino, actual);

    if (!HOSTS_MAPS.includes(siguiente.hostname)) {
      return actual;
    }

    actual = siguiente;
  }

  return actual;
}

interface RespuestaNominatim {
  name?: string;
  display_name?: string;
  lat?: string;
  lon?: string;
  address?: Record<string, string>;
}

function aSitio(entrada: RespuestaNominatim): Sitio | null {
  const latitude = Number(entrada.lat);
  const longitude = Number(entrada.lon);

  if (!coordenadasValidas(latitude, longitude)) {
    return null;
  }

  const direccion = entrada.address ?? {};
  const calle = [direccion.road, direccion.house_number].filter(Boolean).join(' ');

  return {
    nombre: entrada.name || entrada.display_name?.split(',')[0]?.trim() || 'Sitio sin nombre',
    direccion: calle || undefined,
    ciudad: direccion.city || direccion.town || direccion.village || direccion.municipality,
    latitude,
    longitude,
  };
}

async function buscarEnNominatim(consulta: string, soloColombia: boolean): Promise<Sitio[]> {
  const params = new URLSearchParams({
    q: consulta,
    format: 'jsonv2',
    limit: '6',
    addressdetails: '1',
    'accept-language': 'es',
  });

  if (soloColombia) {
    params.set('countrycodes', 'co');
  }

  await esperarTurno();

  const respuesta = await fetch(`${NOMINATIM}?${params.toString()}`, {
    headers: { 'User-Agent': AGENTE, Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });

  if (!respuesta.ok) {
    throw new Error(`Nominatim respondió ${respuesta.status}`);
  }

  const datos = (await respuesta.json()) as RespuestaNominatim[];

  return datos.map(aSitio).filter((sitio): sitio is Sitio => sitio !== null);
}

export const GET: APIRoute = async ({ url, cookies }) => {
  // Buscar sitios solo tiene sentido publicando o editando, y las dos cosas
  // piden sesion. Exigirla aqui tambien evita que el endpoint quede como un
  // proxy de geocodificacion abierto a cualquiera.
  const user = await getCurrentUser(cookies);

  if (!user) {
    return jsonResponse({ error: 'Debes iniciar sesión.' }, 401);
  }

  const consulta = (url.searchParams.get('q') ?? '').trim();

  if (consulta.length < 3) {
    return jsonResponse({ resultados: [] }, 200);
  }

  if (consulta.length > 300) {
    return jsonResponse({ error: 'La búsqueda es demasiado larga.' }, 400);
  }

  try {
    const enlace = esUrlDeMapas(consulta);

    if (enlace) {
      const resuelto = enlace.hostname.endsWith('goo.gl') ? await resolverEnlaceCorto(enlace) : enlace;
      const coordenadas = coordenadasDeUrl(resuelto);
      const nombre = nombreDeUrl(resuelto);

      if (coordenadas) {
        return jsonResponse(
          { resultados: [{ nombre: nombre ?? 'Punto del enlace', ...coordenadas }] satisfies Sitio[] },
          200,
        );
      }

      // El enlace no traia coordenadas pero si el nombre del sitio: se busca
      // por ese nombre, que es lo que haria quien lo tecleara a mano.
      if (nombre) {
        return jsonResponse({ resultados: await buscarEnNominatim(nombre, false) }, 200);
      }

      return jsonResponse(
        { error: 'Ese enlace no lleva a un punto concreto. Abre el sitio en Maps y copia el enlace desde ahí.' },
        400,
      );
    }

    // Se busca primero dentro de Colombia, que es donde pasa casi todo lo que
    // se publica aqui: sin esa acotacion, "Casa Taller" devuelve medio mundo
    // antes que la de Bogota. Si no hay nada, se repite sin acotar.
    const enColombia = await buscarEnNominatim(consulta, true);

    if (enColombia.length > 0) {
      return jsonResponse({ resultados: enColombia }, 200);
    }

    return jsonResponse({ resultados: await buscarEnNominatim(consulta, false) }, 200);
  } catch (error) {
    console.warn('No se pudo resolver la ubicación:', error);
    return jsonResponse({ error: 'No se pudo buscar la ubicación. Inténtalo de nuevo.' }, 502);
  }
};
