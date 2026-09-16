import { defineMiddleware } from 'astro:middleware';
import { contarVisita } from './lib/firebase/metricas';

// La paginas publicas se renderizan en el servidor contra Firestore en cada
// visita. Un visitante anonimo ve siempre el mismo HTML (cabecera, listado,
// pie no llevan datos suyos), asi que esa respuesta se puede guardar en una
// cache compartida unos segundos para no repetir las lecturas a Firestore.
//
// No se toca nada mas: quien trae la cookie de sesion ve HTML personalizado
// (su nombre, sus asistencias) y queda sin cachear. Los encabezados que ya
// existan (los del feed iCal, por ejemplo) se respetan.
// Rastreadores, previsualizadores de enlaces y las comprobaciones de salud del
// despliegue (wget --spider, curl): piden la pagina pero no son visitas.
const NO_ES_PERSONA = /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegram|discord|preview|curl|wget|python-requests|go-http-client/i;

export const onRequest = defineMiddleware(async ({ request }, next) => {
  const response = await next();
  const type = response.headers.get('Content-Type') ?? '';

  if (!type.startsWith('text/html')) {
    return response;
  }

  // La visita se cuenta sin esperar a que se escriba: la respuesta ya esta
  // lista y el contador es una consecuencia, no parte de ella. El adaptador de
  // Node corre un proceso de larga vida, asi que la promesa termina despues de
  // responder. Solo paginas servidas de verdad: ni 404 ni redirecciones.
  //
  // Y solo en produccion: el servidor de desarrollo comparte la base con
  // produccion, y cada recarga de quien desarrolla contaria como una visita
  // de verdad.
  if (import.meta.env.PROD && request.method === 'GET' && response.status === 200) {
    const agente = request.headers.get('user-agent') ?? '';

    if (!NO_ES_PERSONA.test(agente)) {
      const conSesion = (request.headers.get('cookie') ?? '').includes('__session=');
      void contarVisita(conSesion).catch(() => {
        // Sin Firebase configurado (desarrollo sin .env) no hay contador, y
        // eso no puede convertirse en un error de la pagina.
      });
    }
  }

  if (response.headers.has('Cache-Control')) {
    return response;
  }

  const cookie = request.headers.get('cookie') ?? '';

  if (cookie.includes('__session=')) {
    // Explicito y no por omision: una respuesta sin cabeceras de cache puede
    // acabar guardada igualmente por heuristica en algun intermediario, y esta
    // lleva el nombre y las asistencias de quien la pidio.
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  }

  // Vary: Cookie es lo que le dice a una cache compartida que la respuesta sin
  // sesion y la que la tiene son distintas: sin esto, un CDN podria servirle el
  // HTML anonimo (cabecera con "Iniciar sesion") a quien ya esta dentro.
  response.headers.append('Vary', 'Cookie');
  response.headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  return response;
});
