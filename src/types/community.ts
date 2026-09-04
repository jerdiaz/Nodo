export interface NodoCommunity {
  id: string;
  slug: string;
  name: string;
  description?: string;
  avatarUrl?: string;
  // Quien la creo. Es el unico que publica eventos en su nombre; el resto se
  // une para seguirla.
  ownerUid: string;
  createdAt: Date;
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
