import type { APIRoute } from 'astro';
import { jsonResponse } from '../../../../../lib/api';
import { getCurrentUser } from '../../../../../lib/auth';
import {
  approveMembership,
  declineMembership,
  getCommunityBySlug,
  isCommunityAdmin,
  setMemberRole,
} from '../../../../../lib/firebase/communities';

const ACCIONES = ['aprobar', 'declinar', 'hacer-admin', 'quitar-admin'] as const;
type Accion = (typeof ACCIONES)[number];

// El dueño y cualquier admin tienen exactamente el mismo permiso aqui: no hay
// jerarquia entre ellos, es la equivalencia total que se penso para el rol.
export const PUT: APIRoute = async ({ params, request, cookies }) => {
  const user = await getCurrentUser(cookies);

  if (!user) {
    return jsonResponse({ error: 'Debes iniciar sesión.' }, 401);
  }

  const { slug, uid } = params;

  if (!slug || !uid) {
    return jsonResponse({ error: 'Falta la comunidad o la persona.' }, 400);
  }

  const community = await getCommunityBySlug(slug);

  if (!community) {
    return jsonResponse({ error: 'La comunidad no existe.' }, 404);
  }

  if (!(await isCommunityAdmin(community, user.uid))) {
    return jsonResponse({ error: 'Solo quien administra la comunidad puede hacer esto.' }, 403);
  }

  // El dueño no depende de un doc en `members`: no hay solicitud que aprobar
  // ni rol que tocarle.
  if (uid === community.ownerUid) {
    return jsonResponse({ error: 'No puedes hacer esto sobre quien administra la comunidad.' }, 400);
  }

  const body = await request.json().catch(() => null);
  const accion = (body as Record<string, unknown> | null)?.accion;

  if (typeof accion !== 'string' || !ACCIONES.includes(accion as Accion)) {
    return jsonResponse({ error: 'Acción inválida.' }, 400);
  }

  switch (accion as Accion) {
    case 'aprobar':
      await approveMembership(community.id, uid);
      break;
    case 'declinar':
      await declineMembership(community.id, uid);
      break;
    case 'hacer-admin':
      await setMemberRole(community.id, uid, 'admin');
      break;
    case 'quitar-admin':
      await setMemberRole(community.id, uid, 'member');
      break;
  }

  return jsonResponse({ success: true }, 200);
};
