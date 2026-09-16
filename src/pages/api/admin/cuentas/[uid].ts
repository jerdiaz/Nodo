import type { APIRoute } from 'astro';
import { jsonResponse } from '../../../../lib/api';
import { getAdminUser } from '../../../../lib/auth';
import { getAdminAuth, getAdminDb } from '../../../../lib/firebase/server';
import { deleteCommunity, getCommunityByOwner } from '../../../../lib/firebase/communities';
import { deleteUserImages } from '../../../../lib/images';
import { deleteUserProfile, isAdmin } from '../../../../lib/firebase/users';
import { deleteNotificationsForUser } from '../../../../lib/firebase/notifications';

// Borrar una cuenta desde el panel de administracion.
//
// Es la version conservadora de DELETE /api/cuenta, que es la de "me borro a
// mi mismo". Aquella decide que hacer con los eventos (transferir o borrar);
// esta no: si la cuenta tiene eventos publicados, se niega y le dice al
// administrador que los resuelva primero desde el directorio de eventos. Asi
// el caso que cubre -cuentas fantasma de pruebas, gente que entro y nunca
// termino el registro- se borra de un golpe, y el caso delicado no se puede
// borrar por accidente.
//
// Tampoco se borra a uno mismo ni a otro administrador: para lo primero esta
// Configuracion, y lo segundo se hace en dos pasos (quitar admin, borrar), que
// es justo la friccion que uno quiere delante de un boton asi.
export const DELETE: APIRoute = async ({ params, cookies }) => {
  const admin = await getAdminUser(cookies);

  if (!admin) {
    return jsonResponse({ error: 'No tienes permiso para administrar.' }, 403);
  }

  const uid = params.uid?.trim();

  if (!uid) {
    return jsonResponse({ error: 'Falta el identificador de la cuenta.' }, 400);
  }

  if (uid === admin.uid) {
    return jsonResponse({ error: 'No puedes borrar tu propia cuenta desde aquí. Hazlo desde Configuración.' }, 400);
  }

  if (await isAdmin(uid)) {
    return jsonResponse({ error: 'Es administrador. Quítale el rol antes de borrar la cuenta.' }, 400);
  }

  const db = getAdminDb();

  const propios = await db.collection('events').where('organizer.uid', '==', uid).get();

  if (!propios.empty) {
    return jsonResponse(
      {
        error: `Tiene ${propios.size} ${propios.size === 1 ? 'evento publicado' : 'eventos publicados'}. Bórralos o transfiérelos desde el directorio de eventos antes de borrar la cuenta.`,
      },
      409,
    );
  }

  // Las asistencias a eventos ajenos son datos de la persona: se van con ella.
  // Una lectura por evento, como hace /api/cuenta; a esta escala no hay
  // indice de grupo de coleccion que lo haga mas barato.
  const eventos = await db.collection('events').select().get();
  await Promise.all(eventos.docs.map((doc) => doc.ref.collection('rsvps').doc(uid).delete()));

  const comunidad = await getCommunityByOwner(uid);
  if (comunidad) {
    await deleteCommunity(comunidad.id);
  }

  await deleteUserImages(uid, ['avatars', 'event-banners']);
  await deleteNotificationsForUser(uid);
  await deleteUserProfile(uid);

  // Auth va al final: si algo de arriba fallara, la cuenta seguiria existiendo
  // y se podria reintentar. Al reves, quedarian datos de alguien sin cuenta.
  await getAdminAuth().deleteUser(uid);

  return jsonResponse({ success: true }, 200);
};
