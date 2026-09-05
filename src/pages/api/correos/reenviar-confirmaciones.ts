import type { APIRoute } from 'astro';
import { getSecret } from 'astro:env/server';
import { jsonResponse } from '../../../lib/api';
import { filterEvents, getEvents } from '../../../lib/firebase/events';
import {
  despacharPendientes,
  destinatariosDelEvento,
  encolarCorreos,
} from '../../../lib/email/cola';
import { correoConfigurado } from '../../../lib/email/resend';

// Reenvia la confirmacion a quien ya habia confirmado asistencia a un evento
// futuro. Existe para cuando la plantilla cambia y merece la pena que la gente
// reciba la version buena, o para reponer correos que no llegaron.
//
// No es una ruta de uso corriente: manda correo de verdad a personas de verdad.
// Por eso lleva tres frenos:
//
//   1. El mismo SYNC_SECRET que el despachador.
//   2. Un `confirmar: "reenviar"` explicito en el cuerpo. Sin el no hace nada,
//      asi que un curl a medio escribir no le escribe a nadie.
//   3. La version del id lleva la fecha, asi que dos ejecuciones el mismo dia
//      encolan el mismo documento y la segunda no manda nada. Para repetir a
//      proposito hay que esperar al dia siguiente.
//
// Solo eventos futuros: "Tienes un lugar en" para algo que ya paso no es un
// recordatorio de nada, es ruido.
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

  const body = await request.json().catch(() => null);

  if ((body as Record<string, unknown> | null)?.confirmar !== 'reenviar') {
    return jsonResponse(
      { error: 'Falta la confirmación explícita: manda {"confirmar":"reenviar"} en el cuerpo.' },
      400,
    );
  }

  // Marca del dia, para que el id del correo cambie respecto al de la
  // confirmacion original pero no cambie entre dos llamadas seguidas.
  const version = `reenvio-${new Date().toISOString().slice(0, 10)}`;

  const proximos = filterEvents(await getEvents(), { timeframe: 'upcoming' });
  const detalle: { evento: string; encolados: number }[] = [];

  for (const evento of proximos) {
    // Se respeta el interruptor de avisos, a diferencia de la confirmacion
    // original: aquella es el recibo inmediato de algo que la persona acaba de
    // hacer, y esto es un envio en bloque que ella no ha pedido.
    const destinatarios = await destinatariosDelEvento(evento.id);

    if (destinatarios.length === 0) {
      continue;
    }

    const encolados = await encolarCorreos({
      evento,
      tipo: 'confirmacion',
      destinatarios,
      version,
    });

    if (encolados.length > 0) {
      detalle.push({ evento: evento.slug, encolados: encolados.length });
    }
  }

  const encolados = detalle.reduce((suma, fila) => suma + fila.encolados, 0);

  // Se despacha aqui mismo y no se deja al cron para poder devolver en la misma
  // respuesta cuantos salieron: quien dispara esto quiere saber que paso.
  const resumen = await despacharPendientes(Math.max(encolados, 1));

  return jsonResponse({ version, encolados, detalle, ...resumen }, 200);
};
