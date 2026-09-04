import type { APIRoute } from 'astro';
import { jsonResponse } from '../../lib/api';
import { getCurrentUser } from '../../lib/auth';
import {
  maxBytes,
  moderateImage,
  processImage,
  recordModeration,
  uploadBanner,
  uploadImage,
  type ImageKind,
} from '../../lib/images';

const KINDS: ImageKind[] = ['avatar', 'banner'];

// Las imagenes pasan por el servidor en vez de ir del navegador a Storage.
// Eso permite moderarlas y recortarlas antes de que existan, y de paso la
// escritura la hace el Admin SDK, que no depende de storage.rules.
export const POST: APIRoute = async ({ request, url, cookies }) => {
  const user = await getCurrentUser(cookies);

  if (!user) {
    return jsonResponse({ error: 'Debes iniciar sesión.' }, 401);
  }

  const kind = KINDS.find((value) => value === url.searchParams.get('kind'));

  if (!kind) {
    return jsonResponse({ error: 'Tipo de imagen no válido.' }, 400);
  }

  // El cuerpo va como binario crudo y no como multipart a proposito: Astro
  // trata multipart/form-data como envio de formulario y le exige que el
  // Origin coincida con el que calcula el servidor, cosa que detras del proxy
  // de produccion no ocurre y responde 403. Es el mismo fallo de 8d5c370, y
  // aqui no se puede esquivar cambiando la cabecera porque multipart ES uno de
  // los tipos que disparan esa comprobacion.
  const contentType = request.headers.get('content-type') ?? '';

  if (!contentType.startsWith('image/')) {
    return jsonResponse({ error: 'El archivo debe ser una imagen.' }, 400);
  }

  const original = Buffer.from(await request.arrayBuffer());

  if (original.length === 0) {
    return jsonResponse({ error: 'No se recibió ninguna imagen.' }, 400);
  }

  const limit = maxBytes(kind);

  if (original.length > limit) {
    return jsonResponse(
      { error: `La imagen no puede superar ${Math.round(limit / (1024 * 1024))} MB.` },
      413,
    );
  }

  let moderation;

  try {
    // Se modera el original, antes de tocar Storage: una imagen rechazada no
    // llega a existir, en vez de subirse y borrarse despues.
    moderation = await moderateImage(original);
  } catch (error) {
    console.error('No se pudo moderar la imagen:', error);
    return jsonResponse(
      { error: 'No se pudo revisar la imagen en este momento. Inténtalo más tarde.' },
      503,
    );
  }

  await recordModeration(user.uid, kind, moderation);

  if (!moderation.safe) {
    return jsonResponse({ error: 'Esa imagen no cumple las normas de la comunidad.' }, 422);
  }

  try {
    if (kind === 'banner') {
      // El banner sale en dos tamanos: el grande para la ficha y uno reducido
      // para tarjetas y miniaturas, para no bajar 1600px donde caben 280.
      const { url, urlSmall } = await uploadBanner(user.uid, original);
      return jsonResponse({ url, urlSmall }, 200);
    }

    const processed = await processImage(original, kind);
    const uploadedUrl = await uploadImage(user.uid, kind, processed);

    return jsonResponse({ url: uploadedUrl }, 200);
  } catch (error) {
    console.error('No se pudo procesar o subir la imagen:', error);
    return jsonResponse({ error: 'No se pudo guardar la imagen.' }, 500);
  }
};
