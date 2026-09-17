export interface NodoCommunity {
  id: string;
  slug: string;
  name: string;
  description?: string;
  avatarUrl?: string;
  // Quien la creo. Tiene las mismas funciones que un admin, mas la de serlo
  // de forma permanente: no hay transferencia de propiedad.
  ownerUid: string;
  createdAt: Date;
}

// 'admin' tiene las mismas funciones que el dueño (aprobar miembros, asignar
// el rol, editar y eliminar la comunidad); 'member' solo puede publicar
// eventos a nombre de la comunidad. El dueño no necesita un valor propio aqui
// porque siempre se identifica por `NodoCommunity.ownerUid`.
export type CommunityRole = 'admin' | 'member';

// 'pending' es una solicitud sin resolver: no da permiso de publicar todavia.
export type MembershipStatus = 'pending' | 'active';

export interface CommunityMembership {
  role: CommunityRole;
  status: MembershipStatus;
  requestedAt: Date;
  respondedAt?: Date;
}

// Lo que se guarda dentro de cada evento, desnormalizado, para poder pintar la
// cartelera sin una lectura extra por evento. El nombre y el avatar se copian
// a proposito: si la comunidad se renombra, los eventos ya publicados se
// actualizan en la misma operacion.
export interface EventCommunity {
  id: string;
  slug: string;
  name: string;
  avatarUrl?: string;
}
