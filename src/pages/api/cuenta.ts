import type { APIRoute } from 'astro';
import { jsonResponse } from '../../lib/api';
import { getCurrentUser } from '../../lib/auth';
import { getAdminAuth, getAdminDb } from '../../lib/firebase/server';
import { deleteEventWithRsvps } from '../../lib/firebase/events';
import { deleteCommunity, getCommunityByOwner } from '../../lib/firebase/communities';
import { createTransferRequest } from '../../lib/firebase/transfers';
import { deleteUserImages } from '../../lib/images';
import { deleteUserProfile, getDeletionCode, getUidByUsername, getUserProfile } from '../../lib/firebase/users';
import { deleteNotificationsForUser } from '../../lib/firebase/notifications';

export const DELETE: APIRoute = async ({ request, cookies }) => {
  const user = await getCurrentUser(cookies);

  if (!user) {
    return jsonResponse({ error: 'Debes iniciar sesión.' }, 401);
  }

  const body = await request.json().catch(() => null);
  const payload = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;

  const mode = payload.mode;
  if (mode !== 'transfer' && mode !== 'cascade') {
    return jsonResponse({ error: 'Debes elegir qué hacer con tus eventos.' }, 400);
  }

  const submitted = typeof payload.code === 'string' ? payload.code.trim().toUpperCase() : '';
  const stored = await getDeletionCode(user.uid);

  if (!stored || !submitted || submitted !== stored.code) {
    return jsonResponse({ error: 'El código de confirmación no es correcto.' }, 400);
  }

  if (Date.now() > stored.expiresAt) {
    return jsonResponse({ error: 'El código ha caducado. Genera uno nuevo.' }, 400);
  }

  const db = getAdminDb();
  const now = Date.now();

  // Solo se leen los ids: no hacen falta los perfiles de organizadores que
  // getEvents() trae para pintar. El borrado de cuenta es raro y caro, pero no
  // debe arrastrar el catálogo entero con su enriquecimiento.
  const allEvents = await db.collection('events').get();
  const own = allEvents.docs.filter((doc) => doc.data()?.organizer?.uid === user.uid);
  const others = allEvents.docs.filter((doc) => doc.data()?.organizer?.uid !== user.uid);
  const upcomingOwn = own.filter((doc) => {
    const end = doc.data()?.endDate;
    return !end || end.toDate().getTime() >= now;
  });

  if (mode === 'transfer') {
    const username = typeof payload.transferTo === 'string' ? payload.transferTo.trim().toLowerCase() : '';

    if (!username) {
      return jsonResponse({ error: 'Indica a quién transfieres tus eventos.' }, 400);
    }

    const targetUid = await getUidByUsername(username);

    if (!targetUid) {
      return jsonResponse({ error: `No existe ninguna cuenta con el usuario @${username}.` }, 404);
    }

    if (targetUid === user.uid) {
      return jsonResponse({ error: 'No puedes transferirte los eventos a ti mismo.' }, 400);
    }

    const target = await getUserProfile(targetUid);
    const targetName = target ? [target.firstName, target.lastName].filter(Boolean).join(' ') : '';

    if (!targetName) {
      return jsonResponse({ error: 'Esa cuenta todavía no ha completado su perfil.' }, 400);
    }

    // Los eventos no se reasignan aqui: se deja una solicitud que la persona
    // destino debe aceptar o rechazar. Hasta entonces conservan al organizador
    // original, cuyo nombre viaja desnormalizado y se sigue mostrando bien.
    if (upcomingOwn.length > 0) {
      const nombreDeLosEventos = upcomingOwn[0]?.data()?.organizer?.name;
      await createTransferRequest({
        toUid: targetUid,
        fromName: typeof nombreDeLosEventos === 'string' && nombreDeLosEventos ? nombreDeLosEventos : user.name,
        eventIds: upcomingOwn.map((doc) => doc.id),
      });
    }

    // La propia asistencia a esos eventos se va igual: son datos de la persona.
    await Promise.all(
      upcomingOwn.map((doc) =>
        db.collection('events').doc(doc.id).collection('rsvps').doc(user.uid).delete(),
      ),
    );
  } else {
    await Promise.all(own.map((doc) => deleteEventWithRsvps(doc.id)));
  }

  // Las asistencias a eventos ajenos se van siempre: son datos de la persona.
  await Promise.all(
    others.map((doc) => db.collection('events').doc(doc.id).collection('rsvps').doc(user.uid).delete()),
  );

  // Quien administra una comunidad se lleva su documento y sus miembros: si no,
  // quedaria una comunidad publica con un ownerUid inexistente, sin dueno y
  // sin ruta de borrado. Sus eventos ya se transfirieron o borraron arriba y la
  // referencia desnormalizada se limpia aqui.
  const miComunidad = await getCommunityByOwner(user.uid);

  if (miComunidad) {
    await deleteCommunity(miComunidad.id);
  }

  // Los archivos de Storage no cuelgan de ningun documento: si no se barren
  // aqui, el avatar (tambien el de la comunidad, que vive bajo la carpeta de
  // quien la creo) y los banners sobreviven a la cuenta para siempre. Al
  // transferir se conservan los banners: los eventos siguen vivos en otra
  // cuenta y se quedarian sin imagen.
  await deleteUserImages(user.uid, mode === 'transfer' ? ['avatars'] : ['avatars', 'event-banners']);

  await deleteNotificationsForUser(user.uid);
  await deleteUserProfile(user.uid);
  await getAdminAuth().deleteUser(user.uid);

  cookies.delete('__session', { path: '/' });

  return jsonResponse({ success: true }, 200);
};
