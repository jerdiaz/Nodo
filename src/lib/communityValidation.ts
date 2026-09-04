import { esImagenSubida } from './imagenSubida';

// Compartido entre crear (POST /api/comunidades) y editar
// (PUT /api/comunidades/[slug]), por el mismo motivo que
// validateEventPayload: dos validaciones paralelas acaban discrepando, y la
// que se queda corta es siempre la de editar.

export interface ValidatedCommunityInput {
  name: string;
  description?: string;
  avatarUrl?: string;
}

export function validateCommunityPayload(
  body: unknown,
): { data: ValidatedCommunityInput } | { error: string } {
  if (typeof body !== 'object' || body === null) {
    return { error: 'Petición inválida.' };
  }

  const payload = body as Record<string, unknown>;

  const name = typeof payload.name === 'string' ? payload.name.trim() : '';

  if (name.length < 3) {
    return { error: 'El nombre de la comunidad debe tener al menos 3 caracteres.' };
  }

  if (name.length > 60) {
    return { error: 'El nombre no puede superar los 60 caracteres.' };
  }

  if (payload.description !== undefined && typeof payload.description !== 'string') {
    return { error: 'La descripción no es válida.' };
  }

  const description = typeof payload.description === 'string' ? payload.description.trim() : '';

  if (description.length > 400) {
    return { error: 'La descripción no puede superar los 400 caracteres.' };
  }

  // Solo se acepta una URL que haya salido de /api/imagenes: el cliente manda
  // aqui lo que le devolvio esa ruta.
  const avatarUrl = typeof payload.avatarUrl === 'string' ? payload.avatarUrl.trim() : '';

  if (avatarUrl && !esImagenSubida(avatarUrl)) {
    return { error: 'La imagen no es válida.' };
  }

  return {
    data: {
      name,
      description: description || undefined,
      avatarUrl: avatarUrl || undefined,
    },
  };
}
