import type { APIRoute } from 'astro';
import { getSecret } from 'astro:env/server';
import { jsonResponse } from '../../../lib/api';
import { despacharPendientes, encolarRecordatorios } from '../../../lib/email/cola';
import { correoConfigurado } from '../../../lib/email/resend';

// Motor de la cola de correo. Hace dos cosas en cada pasada:
//
//   1. Encola el recordatorio de los eventos que empiezan en las proximas 24 h.
//   2. Manda lo que haya pendiente, incluido lo que fallo antes y ya toca
//      reintentar.
//
// Se dispara desde fuera, con el mismo mecanismo que la sincronizacion de
// Instagram: un cron del VPS con SYNC_SECRET en la cabecera. Va aqui y no en un
// temporizador dentro del proceso porque un setInterval en el servidor se
// duplicaria con cada contenedor y se perderia en cada despliegue.
//
// Las dos pasadas son idempotentes: los ids de la cola son deterministas y los
// correos ya enviados dejan de aparecer en la consulta de pendientes. Correr
// esto de mas no manda nada dos veces, asi que la frecuencia del cron es una
// decision de latencia, no de correccion. Cada cuarto de hora esta bien.
//
// OJO al llamarlo: el POST tiene que llevar `Content-Type: application/json`.
// Sin esa cabecera, Astro lo trata como envio de formulario, le exige que el
// Origin coincida con el del servidor y responde "Cross-site POST form
// submissions are forbidden" antes de que esta funcion llegue a ejecutarse.
// Un curl de cron no manda Origin, asi que sin la cabecera no entra nunca.
// Es el mismo chequeo que ya obligo a que /api/imagenes suba el binario crudo
// en vez de multipart.
const LIMITE_POR_PASADA = 50;

export const POST: APIRoute = async ({ request }) => {
  const esperado = getSecret('SYNC_SECRET');

  if (!esperado) {
    return jsonResponse({ error: 'El despacho de correo no está configurado.' }, 503);
  }

  const enviado = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');

  if (enviado !== esperado) {
    return jsonResponse({ error: 'No autorizado.' }, 401);
  }

  if (!correoConfigurado()) {
    return jsonResponse({ error: 'Faltan RESEND_API_KEY o EMAIL_FROM.' }, 503);
  }

  // Encolar va antes de despachar para que un recordatorio que acaba de entrar
  // salga en esta misma pasada y no en la siguiente.
  let recordatorios = 0;

  try {
    recordatorios = await encolarRecordatorios();
  } catch (error) {
    // Que falle el barrido de recordatorios no debe impedir que salga lo que ya
    // estaba en la cola esperando.
    console.warn('No se pudieron encolar los recordatorios:', error);
  }

  const resumen = await despacharPendientes(LIMITE_POR_PASADA);

  return jsonResponse({ recordatorios, ...resumen }, 200);
};
