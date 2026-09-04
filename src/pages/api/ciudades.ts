import type { APIRoute } from 'astro';
import { filterEvents, getEvents } from '../../lib/firebase/events';
import { normalizeCityName } from '../../lib/eventValidation';

// Las ciudades que se pueden filtrar en la cabecera, con cuantos eventos
// proximos tiene cada una.
//
// Salen del catalogo y no de Places a proposito: esto es un filtro, y ofrecer
// una ciudad sin eventos lleva a un listado vacio. Cada sugerencia de aqui
// devuelve resultados por construccion. Places manda en el formulario de
// publicar, que es donde si hace falta poder nombrar cualquier sitio.
//
// Es publico -la cabecera la ve tambien quien no ha entrado- y por eso no
// puede apoyarse en Places, que se paga por llamada. Como el catalogo cambia
// despacio, se deja cachear cinco minutos: quien escribe en el campo lo pide
// una vez y el navegador lo reutiliza el resto de la visita.
export const GET: APIRoute = async () => {
  const cuenta = new Map<string, number>();

  try {
    const proximos = filterEvents(await getEvents(), { timeframe: 'upcoming' });

    for (const evento of proximos) {
      if (!evento.city) {
        continue;
      }

      const ciudad = normalizeCityName(evento.city);
      cuenta.set(ciudad, (cuenta.get(ciudad) ?? 0) + 1);
    }
  } catch (error) {
    console.warn('No se pudieron obtener las ciudades del catálogo:', error);
  }

  // Primero las que mas eventos tienen: al abrir el campo sin escribir nada,
  // lo util es ver donde esta pasando algo.
  const ciudades = [...cuenta.entries()]
    .map(([nombre, eventos]) => ({ nombre, eventos }))
    .sort((a, b) => b.eventos - a.eventos || a.nombre.localeCompare(b.nombre, 'es'));

  return new Response(JSON.stringify({ ciudades }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  });
};
