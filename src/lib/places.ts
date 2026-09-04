import { getSecret } from 'astro:env/server';

// Cliente de la Places API (New) de Google.
//
// La clave se lee con getSecret y no con un import nombrado de astro:env, por
// lo mismo que las de Firebase: el import nombrado valida el esquema entero al
// evaluar el modulo, asi que un despliegue sin clave reventaria antes de que
// nadie pudiera capturarlo. Con getSecret, "no hay clave" es simplemente null
// y quien llama decide que hacer — aqui, caer a Nominatim.

const AUTOCOMPLETE = 'https://places.googleapis.com/v1/places:autocomplete';
const DETAILS = 'https://places.googleapis.com/v1/places';

export interface Sitio {
  nombre: string;
  direccion?: string;
  ciudad?: string;
  // Las coordenadas faltan en las sugerencias de Google: el autocompletado
  // devuelve nombres, y el punto exacto cuesta una segunda llamada. Se pide
  // solo del que se elige, que es lo que ahorra la mayor parte del gasto.
  latitude?: number;
  longitude?: number;
  placeId?: string;
}

export function hayClaveDePlaces(): boolean {
  return Boolean(getSecret('GOOGLE_MAPS_SERVER_KEY'));
}

function clave(): string {
  const valor = getSecret('GOOGLE_MAPS_SERVER_KEY');

  if (!valor) {
    throw new Error('Falta GOOGLE_MAPS_SERVER_KEY.');
  }

  return valor;
}

interface PrediccionGoogle {
  placePrediction?: {
    placeId?: string;
    structuredFormat?: {
      mainText?: { text?: string };
      secondaryText?: { text?: string };
    };
    text?: { text?: string };
  };
}

/**
 * Sugerencias para lo que se va escribiendo. `soloCiudades` acota a
 * poblaciones, que es lo que hace falta en el campo Ciudad; sin el, buscar
 * "Cartagena" devuelve tambien bares y hoteles que se llaman asi.
 *
 * El sessionToken agrupa las pulsaciones de una misma busqueda con la consulta
 * de detalles que venga despues: Google las factura como una sola sesion en
 * vez de como una llamada por tecla.
 */
export async function buscarSugerencias(
  consulta: string,
  opciones: { soloCiudades?: boolean; sessionToken?: string } = {},
): Promise<Sitio[]> {
  const cuerpo: Record<string, unknown> = {
    input: consulta,
    languageCode: 'es',
    // Sesga hacia Colombia sin excluir el resto: un evento puede ser fuera.
    regionCode: 'CO',
  };

  if (opciones.sessionToken) {
    cuerpo.sessionToken = opciones.sessionToken;
  }

  if (opciones.soloCiudades) {
    cuerpo.includedPrimaryTypes = ['(cities)'];
  }

  const respuesta = await fetch(AUTOCOMPLETE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': clave(),
    },
    body: JSON.stringify(cuerpo),
    signal: AbortSignal.timeout(8000),
  });

  if (!respuesta.ok) {
    throw new Error(`Places autocomplete respondió ${respuesta.status}`);
  }

  const datos = (await respuesta.json()) as { suggestions?: PrediccionGoogle[] };

  return (datos.suggestions ?? []).flatMap((sugerencia) => {
    const prediccion = sugerencia.placePrediction;
    const nombre = prediccion?.structuredFormat?.mainText?.text ?? prediccion?.text?.text;

    if (!prediccion?.placeId || !nombre) {
      return [];
    }

    return [
      {
        nombre,
        // El resto de la linea de Google -barrio, ciudad, pais- se guarda como
        // direccion para que la lista diga cual de los tres "Casa Taller" es.
        direccion: prediccion.structuredFormat?.secondaryText?.text,
        placeId: prediccion.placeId,
      },
    ];
  });
}

interface ComponenteGoogle {
  longText?: string;
  shortText?: string;
  types?: string[];
}

/**
 * El punto y la direccion de un sitio ya elegido.
 *
 * La mascara de campos no es un detalle de eficiencia sino de precio: `id`,
 * `location`, `formattedAddress` y `addressComponents` estan en el tramo
 * Essentials. Pedir `displayName` subiria la llamada al tramo Pro, que tiene
 * la mitad de cupo gratis — por eso el nombre se toma de la sugerencia, que ya
 * venia pagada en el autocompletado.
 */
export async function detalleDeSitio(
  placeId: string,
  opciones: { nombre?: string; sessionToken?: string } = {},
): Promise<Sitio | null> {
  const params = new URLSearchParams({ languageCode: 'es' });

  if (opciones.sessionToken) {
    params.set('sessionToken', opciones.sessionToken);
  }

  const respuesta = await fetch(`${DETAILS}/${encodeURIComponent(placeId)}?${params.toString()}`, {
    headers: {
      'X-Goog-Api-Key': clave(),
      'X-Goog-FieldMask': 'id,location,formattedAddress,addressComponents',
    },
    signal: AbortSignal.timeout(8000),
  });

  if (!respuesta.ok) {
    throw new Error(`Places details respondió ${respuesta.status}`);
  }

  const datos = (await respuesta.json()) as {
    location?: { latitude?: number; longitude?: number };
    formattedAddress?: string;
    addressComponents?: ComponenteGoogle[];
  };

  const latitude = datos.location?.latitude;
  const longitude = datos.location?.longitude;

  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return null;
  }

  const componentes = datos.addressComponents ?? [];
  const porTipo = (tipo: string) => componentes.find((c) => c.types?.includes(tipo))?.longText;

  // En Colombia el municipio unas veces viene como `locality` y otras solo
  // como `administrative_area_level_2`; se prueban en ese orden.
  const ciudad = porTipo('locality') ?? porTipo('administrative_area_level_2');

  // formattedAddress trae la direccion entera, con ciudad y pais. La ciudad ya
  // va en su campo y se pinta aparte, asi que se recorta a la primera parte
  // para no repetirla en la ficha.
  const direccion = datos.formattedAddress?.split(',')[0]?.trim();

  return {
    nombre: opciones.nombre?.trim() || direccion || 'Sitio',
    direccion,
    ciudad,
    latitude,
    longitude,
    placeId,
  };
}
