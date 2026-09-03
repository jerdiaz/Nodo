import type { APIRoute } from 'astro';
import { jsonResponse } from '../../lib/api';
import { getCurrentUser } from '../../lib/auth';
import { getAdminAuth, getAdminDb } from '../../lib/firebase/server';
import { getEvents } from '../../lib/firebase/events';
import { deleteUserImages } from '../../lib/images';
import { deleteUserProfile, getDeletionCode, getUidByUsername, getUserProfile } from '../../lib/firebase/users';

// Borrar un documento no borra sus subcolecciones: los rsvps de un evento
// sobreviven al evento si no se recorren a mano.
async function deleteEventWithRsvps(eventId: string): Promise<void> {
  const db = getAdminDb();
  const eventRef = db.collection('events').doc(eventId);
  const rsvps = await eventRef.collection('rsvps').get();

  await Promise.all(rsvps.docs.map((doc) => doc.ref.delete()));
  await eventRef.delete();
}

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

  const allEvents = await getEvents();
  const own = allEvents.filter((event) => event.organizer.uid === user.uid);
  const now = Date.now();
  const upcoming = own.filter((event) => event.endDate.getTime() >= now);

  const db = getAdminDb();

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

    // Solo los futuros. Los pasados conservan el organizador tal como estaba:
    // el nombre viaja desnormalizado en el propio evento, asi que siguen
    // mostrandose bien y el historial no se falsea atribuyendoselos a otra
    // persona que no los organizo.
    await Promise.all(
      upcoming.map((event) =>
        db.collection('events').doc(event.id).update({
          organizer: { uid: targetUid, name: targetName, avatarUrl: target?.avatarUrl },
        }),
      ),
    );
  } else {
    // deleteUserImages ya barre event-banners/{uid}/, asi que los banners de
    // estos eventos se van con ella.
    await Promise.all(own.map((event) => deleteEventWithRsvps(event.id)));
  }

  // Las asistencias a eventos ajenos se van siempre: son datos de la persona.
  const others = allEvents.filter((event) => event.organizer.uid !== user.uid);
  await Promise.all(
    others.map((event) =>
      db.collection('events').doc(event.id).collection('rsvps').doc(user.uid).delete(),
    ),
  );

  // Los archivos de Storage no cuelgan de ningun documento: si no se barren
  // aqui, el avatar y los banners sobreviven a la cuenta para siempre. Al
  // transferir se conservan los banners: los eventos siguen vivos en otra
  // cuenta y se quedarian sin imagen.
  await deleteUserImages(user.uid, mode === 'transfer' ? ['avatars'] : ['avatars', 'event-banners']);

  await deleteUserProfile(user.uid);
  await getAdminAuth().deleteUser(user.uid);

  cookies.delete('__session', { path: '/' });

  return jsonResponse({ success: true }, 200);
};
