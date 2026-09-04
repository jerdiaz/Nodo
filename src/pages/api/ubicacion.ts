import type { APIRoute } from 'astro';
import { jsonResponse } from '../../lib/api';
import { getCurrentUser } from '../../lib/auth';
import { buscarSugerencias, detalleDeSitio, hayClaveDePlaces, type Sitio } from '../../lib/places';

// Busqueda de sitios para el formulario de eventos. Acepta las dos cosas que
// hace la gente: pegar el enlace del sitio en Google Maps, o escribir el
// nombre y elegir de una lista.
//
// El texto libre va a Places cuando hay clave y a Nominatim cuando no. Los
// enlaces de Maps se resuelven aqui en los dos casos: las coordenadas vienen
// dentro del propio enlace.
//
// Va por el servidor y no desde el navegador por cuatro razones: la clave de
// Places no puede viajar al cliente; Nominatim pide un User-Agent que el
// navegador no deja poner; su politica limita a una consulta por segundo, que
// solo se puede respetar desde un sitio que las vea todas; y seguir la
// redireccion de un enlace corto de Maps desde la pagina choca con CORS.

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

  const sessionToken = url.searchParams.get('sesion') ?? undefined;

  // Segunda mitad del flujo de Google: el autocompletado devuelve nombres sin
  // coordenadas, y el punto se pide solo del que se acaba eligiendo. Es lo que
  // hace que escribir diez letras no cueste diez consultas de detalle.
  const placeId = url.searchParams.get('placeId');

  if (placeId) {
    if (!hayClaveDePlaces()) {
      return jsonResponse({ error: 'La búsqueda por Google no está configurada.' }, 400);
    }

    try {
      const sitio = await detalleDeSitio(placeId, {
        nombre: url.searchParams.get('nombre') ?? undefined,
        sessionToken,
      });

      return jsonResponse({ resultados: sitio ? [sitio] : [] }, 200);
    } catch (error) {
      console.warn('No se pudo resolver el sitio en Places:', error);
      return jsonResponse({ error: 'No se pudo obtener la ubicación del sitio.' }, 502);
    }
  }

  const consulta = (url.searchParams.get('q') ?? '').trim();

  if (consulta.length < 3) {
    return jsonResponse({ resultados: [] }, 200);
  }

  if (consulta.length > 300) {
    return jsonResponse({ error: 'La búsqueda es demasiado larga.' }, 400);
  }

  try {
    // Un enlace de Maps se resuelve igual con clave o sin ella: las
    // coordenadas ya vienen dentro, no hay nada que preguntarle a nadie.
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

      if (nombre) {
        return jsonResponse({ resultados: await buscarTexto(nombre, false) }, 200);
      }

      return jsonResponse(
        { error: 'Ese enlace no lleva a un punto concreto. Abre el sitio en Maps y copia el enlace desde ahí.' },
        400,
      );
    }

    const soloCiudades = url.searchParams.get('tipo') === 'ciudad';

    return jsonResponse({ resultados: await buscarTexto(consulta, soloCiudades, sessionToken) }, 200);
  } catch (error) {
    console.warn('No se pudo resolver la ubicación:', error);
    return jsonResponse({ error: 'No se pudo buscar la ubicación. Inténtalo de nuevo.' }, 502);
  }
};

// Google si esta configurado, Nominatim si no. El respaldo no es solo para el
// dia que falte la clave: en desarrollo la clave esta atada a la IP del VPS y
// desde una maquina de casa Google rechaza la llamada, asi que sin esto no se
// podria probar el formulario en local.
async function buscarTexto(
  consulta: string,
  soloCiudades: boolean,
  sessionToken?: string,
): Promise<Sitio[]> {
  if (hayClaveDePlaces()) {
    try {
      return await buscarSugerencias(consulta, { soloCiudades, sessionToken });
    } catch (error) {
      console.warn('Places falló; se sigue con Nominatim:', error);
    }
  }

  const enColombia = await buscarEnNominatim(consulta, true);

  return enColombia.length > 0 ? enColombia : buscarEnNominatim(consulta, false);
}
