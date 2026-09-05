import type { APIRoute } from 'astro';
import { Timestamp } from 'firebase-admin/firestore';
import { jsonResponse } from '../../../../../lib/api';
import { getAdminUser } from '../../../../../lib/auth';
import { getAdminDb } from '../../../../../lib/firebase/server';
import { getEmailsByUid, getUserProfiles } from '../../../../../lib/firebase/users';

// Asistentes de un evento con todo lo que el admin necesita ver: nombre,
// usuario, correo, estado de la cuenta y cuando confirmo. Es el unico sitio
// donde se exponen correos, y por eso exige ser administrador.
export const GET: APIRoute = async ({ params, cookies }) => {
  const admin = await getAdminUser(cookies);

  if (!admin) {
    return jsonResponse({ error: 'No tienes permiso para administrar.' }, 403);
  }

  const id = params.id;

  if (!id) {
    return jsonResponse({ error: 'Falta el id del evento.' }, 400);
  }

  const db = getAdminDb();
  const doc = await db.collection('events').doc(id).get();

  if (!doc.exists) {
    return jsonResponse({ error: 'El evento no existe.' }, 404);
  }

  const rsvps = await doc.ref.collection('rsvps').orderBy('createdAt', 'asc').get();
  const uids = rsvps.docs.map((rsvp) => rsvp.id);
  const [perfiles, correos] = await Promise.all([getUserProfiles(uids), getEmailsByUid(uids)]);

  const asistentes = rsvps.docs.map((rsvp) => {
    const perfil = perfiles.get(rsvp.id);
    const creado = rsvp.data()?.createdAt;

    return {
      uid: rsvp.id,
      nombre: perfil
        ? [perfil.firstName, perfil.lastName].filter(Boolean).join(' ') || 'Sin nombre'
        : 'Cuenta eliminada',
      username: perfil?.username ?? null,
      avatarUrl: perfil?.avatarUrl ?? null,
      email: correos.get(rsvp.id) ?? null,
      verification: perfil?.verification ?? null,
      admin: perfil?.admin === true,
      blocked: perfil?.blocked === true,
      confirmadoEn: creado instanceof Timestamp ? creado.toDate().toISOString() : null,
    };
  });

  return jsonResponse({ success: true, evento: { id, title: doc.data()?.title }, asistentes }, 200);
};
