import type { APIRoute } from 'astro';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { jsonResponse } from '../../../lib/api';
import { getCurrentUser } from '../../../lib/auth';
import { validateEventPayload } from '../../../lib/eventValidation';
import { getCommunityByOwner, toEventCommunity } from '../../../lib/firebase/communities';
import { deleteEventWithRsvps, mapDocToEvent } from '../../../lib/firebase/events';
import { deleteEventNotifications } from '../../../lib/firebase/notifications';
import { getAdminDb } from '../../../lib/firebase/server';
import { deleteOwnedImage } from '../../../lib/images';
import {
  despacharPendientes,
  destinatariosDelEvento,
  encolarCorreos,
  enSegundoPlano,
  huella,
} from '../../../lib/email/cola';
import { formatEventDateLong, formatEventTime } from '../../../lib/format';
import type { NodoEvent } from '../../../types/event';

function lugarDe(evento: Pick<NodoEvent, 'venue' | 'address' | 'city'>): string {
  return [evento.venue, evento.address, evento.city].filter(Boolean).join(', ');
}

// Que se le cuenta a quien ya dijo que iba. Solo lo que le obliga a cambiar de
// planes: no se avisa de una descripcion retocada ni de un banner nuevo, porque
// un correo por cada arreglo de una errata acaba con la gente ignorandolos
// todos, incluido el que si importaba.
function cambiosQueImportan(anterior: FirebaseFirestore.DocumentData, nuevo: NodoEvent): string[] {
  const cambios: string[] = [];
  const inicioAnterior = anterior.startDate instanceof Timestamp ? anterior.startDate.toDate() : null;

  if (!inicioAnterior || inicioAnterior.getTime() !== nuevo.startDate.getTime()) {
    cambios.push(
      `Nueva fecha: ${formatEventDateLong(nuevo.startDate, nuevo.timezone)} a las ${formatEventTime(nuevo.startDate, nuevo.timezone)}`,
    );
  }

  const lugarAnterior = lugarDe(anterior as Pick<NodoEvent, 'venue' | 'address' | 'city'>);
  const lugarNuevo = lugarDe(nuevo);

  if (lugarAnterior !== lugarNuevo && lugarNuevo) {
    cambios.push(`Nuevo lugar: ${lugarNuevo}`);
  }

  if (anterior.modality !== nuevo.modality) {
    cambios.push(`El evento pasa a ser ${nuevo.modality}`);
  }

  if ((anterior.meetingUrl ?? '') !== (nuevo.meetingUrl ?? '') && nuevo.meetingUrl) {
    cambios.push('Cambió el enlace de conexión');
  }

  return cambios;
}

export const PUT: APIRoute = async ({ params, request, cookies }) => {
  const user = await getCurrentUser(cookies);

  if (!user) {
    return jsonResponse({ error: 'Debes iniciar sesión.' }, 401);
  }

  const id = params.id;
  if (!id) {
    return jsonResponse({ error: 'Falta el id del evento.' }, 400);
  }

  const db = getAdminDb();
  const docRef = db.collection('events').doc(id);
  const existing = await docRef.get();

  if (!existing.exists) {
    return jsonResponse({ error: 'Evento no encontrado.' }, 404);
  }

  const existingData = existing.data();
  if (existingData?.organizer?.uid !== user.uid) {
    return jsonResponse({ error: 'No tienes permiso para editar este evento.' }, 403);
  }

  const body = await request.json().catch(() => null);
  const validation = validateEventPayload(body, { allowPastStart: true });

  if ('error' in validation) {
    return jsonResponse({ error: validation.error }, 400);
  }

  const { startDate, endDate, ...rest } = validation.data;

  // Editar tambien puede cambiar a nombre de quien sale el evento. Se toca
  // solo si el formulario manda el campo: una peticion que no lo lleve deja la
  // comunidad como estaba en vez de borrarla por omision.
  const publishAs = (body as Record<string, unknown> | null)?.publishAs;
  let community: FirebaseFirestore.FieldValue | ReturnType<typeof toEventCommunity> | undefined;

  if (publishAs === 'persona') {
    community = FieldValue.delete();
  } else if (publishAs === 'comunidad') {
    const comunidad = await getCommunityByOwner(user.uid);
    community = comunidad ? toEventCommunity(comunidad) : FieldValue.delete();
  }

  await docRef.update({
    ...rest,
    startDate: Timestamp.fromDate(startDate),
    endDate: Timestamp.fromDate(endDate),
    ...(community === undefined ? {} : { community }),
  });

  // Si llega un banner nuevo, el anterior deja de estar referenciado por nadie.
  // Se borra despues de guardar: si el update fallara, no habriamos destruido
  // la imagen que el evento sigue usando. La guarda de propiedad impide que
  // alguien cuelgue su evento de la URL de la imagen de otro y luego la borre.
  const previousBanner = existingData?.bannerUrl;
  if (rest.bannerUrl && previousBanner && previousBanner !== rest.bannerUrl) {
    await deleteOwnedImage(previousBanner, 'banner', user.uid);
  }

  const previousBannerSmall = existingData?.bannerSmallUrl;
  if (rest.bannerSmallUrl && previousBannerSmall && previousBannerSmall !== rest.bannerSmallUrl) {
    await deleteOwnedImage(previousBannerSmall, 'banner', user.uid);
  }

  // Aviso a quienes ya habian confirmado, si cambio algo que les afecte.
  // Todo el bloque va protegido: el evento ya se guardo, y un fallo del correo
  // no puede devolver un error por una edicion que si se aplico.
  try {
    const actualizado = mapDocToEvent(await docRef.get());
    const cambios = cambiosQueImportan(existingData ?? {}, actualizado);

    if (cambios.length > 0) {
      const destinatarios = (await destinatariosDelEvento(id)).filter(
        // Quien organiza no necesita que le avisen de su propio cambio, aunque
        // figure entre los asistentes de su evento.
        (destinatario) => destinatario.uid !== user.uid,
      );

      const encolados = await encolarCorreos({
        evento: actualizado,
        tipo: 'actualizacion',
        destinatarios,
        cambios,
        // Dos guardados identicos del formulario son el mismo aviso y se
        // colapsan en un documento; dos ediciones distintas son dos avisos.
        version: huella(`${actualizado.startDate.getTime()}|${lugarDe(actualizado)}|${actualizado.meetingUrl ?? ''}`),
      });

      if (encolados.length > 0) {
        enSegundoPlano(despacharPendientes(encolados.length));
      }
    }
  } catch (error) {
    console.warn('No se pudieron encolar los avisos de cambio del evento:', error);
  }

  return jsonResponse({ success: true, slug: existingData?.slug ?? id }, 200);
};

export const DELETE: APIRoute = async ({ params, cookies }) => {
  const user = await getCurrentUser(cookies);

  if (!user) {
    return jsonResponse({ error: 'Debes iniciar sesión.' }, 401);
  }

  const id = params.id;
  if (!id) {
    return jsonResponse({ error: 'Falta el id del evento.' }, 400);
  }

  const db = getAdminDb();
  const docRef = db.collection('events').doc(id);
  const existing = await docRef.get();

  if (!existing.exists) {
    return jsonResponse({ error: 'Evento no encontrado.' }, 404);
  }

  const existingData = existing.data();
  if (existingData?.organizer?.uid !== user.uid) {
    return jsonResponse({ error: 'No tienes permiso para eliminar este evento.' }, 403);
  }

  // Los asistentes se leen ANTES de borrar: deleteEventWithRsvps se lleva por
  // delante la subcoleccion de asistencias, y despues ya no hay a quien avisar.
  // El evento tambien se convierte a objeto aqui, porque la plantilla del
  // correo lo necesita cuando el documento ya no exista.
  let cancelacion: { evento: NodoEvent; destinatarios: Awaited<ReturnType<typeof destinatariosDelEvento>> } | null =
    null;

  try {
    cancelacion = {
      evento: mapDocToEvent(existing),
      destinatarios: (await destinatariosDelEvento(id)).filter(
        (destinatario) => destinatario.uid !== user.uid,
      ),
    };
  } catch (error) {
    console.warn('No se pudieron leer los asistentes para avisar de la cancelación:', error);
  }

  await deleteEventWithRsvps(id);

  // Y se encola despues de borrar, no antes: si el borrado fallara, habriamos
  // avisado de la cancelacion de un evento que sigue en pie.
  if (cancelacion && cancelacion.destinatarios.length > 0) {
    try {
      const encolados = await encolarCorreos({
        evento: cancelacion.evento,
        tipo: 'cancelacion',
        destinatarios: cancelacion.destinatarios,
      });

      if (encolados.length > 0) {
        enSegundoPlano(despacharPendientes(encolados.length));
      }
    } catch (error) {
      console.warn('No se pudieron encolar los avisos de cancelación:', error);
    }
  }

  await deleteOwnedImage(existingData?.bannerUrl, 'banner', user.uid);
  await deleteOwnedImage(existingData?.bannerSmallUrl, 'banner', user.uid);

  // Las notificaciones que apuntaban a este evento dejan de llevar a algo.
  await deleteEventNotifications(user.uid, id);

  return jsonResponse({ success: true }, 200);
};
