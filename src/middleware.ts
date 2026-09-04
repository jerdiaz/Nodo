import { defineMiddleware } from 'astro:middleware';

// La paginas publicas se renderizan en el servidor contra Firestore en cada
// visita. Un visitante anonimo ve siempre el mismo HTML (cabecera, listado,
// pie no llevan datos suyos), asi que esa respuesta se puede guardar en una
// cache compartida unos segundos para no repetir las lecturas a Firestore.
//
// No se toca nada mas: quien trae la cookie de sesion ve HTML personalizado
// (su nombre, sus asistencias) y queda sin cachear. Los encabezados que ya
// existan (los del feed iCal, por ejemplo) se respetan.
export const onRequest = defineMiddleware(async ({ request }, next) => {
  const response = await next();
  const type = response.headers.get('Content-Type') ?? '';

  if (!type.startsWith('text/html')) {
    return response;
  }

  if (response.headers.has('Cache-Control')) {
    return response;
  }

  const cookie = request.headers.get('cookie') ?? '';

  if (cookie.includes('__session=')) {
    return response;
  }

  // Vary: Cookie es lo que le dice a una cache compartida que la respuesta sin
  // sesion y la que la tiene son distintas: sin esto, un CDN podria servirle el
  // HTML anonimo (cabecera con "Iniciar sesion") a quien ya esta dentro.
  response.headers.append('Vary', 'Cookie');
  response.headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  return response;
});
