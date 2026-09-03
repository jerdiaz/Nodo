import type { APIRoute } from 'astro';
import { getSecret } from 'astro:env/server';
import { jsonResponse } from '../../../lib/api';
import { getStoredPostIds, saveInstagramPost } from '../../../lib/firebase/instagram';
import { rehostImage } from '../../../lib/images';

const CAMPOS = 'id,caption,permalink,media_type,media_url,thumbnail_url,timestamp';
const LIMITE = 12;

interface MediaGraph {
  id: string;
  caption?: string;
  permalink: string;
  media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
  media_url?: string;
  thumbnail_url?: string;
  timestamp: string;
}

// Trae las ultimas publicaciones de Instagram y las guarda en Firestore.
//
// La pagina lee de Firestore y no de Instagram: hacerlo en cada visita gastaria
// cuota, ataria el tiempo de respuesta a un servicio ajeno y expondria el token.
// Esto se dispara desde fuera cada cierto tiempo (cron del VPS o del CI).
export const POST: APIRoute = async ({ request }) => {
  const esperado = getSecret('SYNC_SECRET');

  if (!esperado) {
    return jsonResponse({ error: 'La sincronización no está configurada.' }, 503);
  }

  // Comparacion simple: el secreto no se deriva de datos del usuario y el
  // endpoint no revela nada mas que si acerto o no.
  const enviado = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');

  if (enviado !== esperado) {
    return jsonResponse({ error: 'No autorizado.' }, 401);
  }

  const token = getSecret('INSTAGRAM_TOKEN');
  const userId = getSecret('INSTAGRAM_USER_ID');

  if (!token || !userId) {
    return jsonResponse({ error: 'Faltan las credenciales de Instagram.' }, 503);
  }

  const url = `https://graph.instagram.com/v21.0/${userId}/media?fields=${CAMPOS}&limit=${LIMITE}&access_token=${token}`;

  let medios: MediaGraph[];

  try {
    const respuesta = await fetch(url);
    const cuerpo = await respuesta.json();

    if (!respuesta.ok) {
      // El fallo mas comun es el token caducado: los de larga duracion viven
      // 60 dias y hay que renovarlos.
      console.error('Instagram respondió con error:', cuerpo?.error);
      return jsonResponse({ error: cuerpo?.error?.message ?? 'Instagram rechazó la petición.' }, 502);
    }

    medios = Array.isArray(cuerpo.data) ? cuerpo.data : [];
  } catch (error) {
    console.error('No se pudo consultar Instagram:', error);
    return jsonResponse({ error: 'No se pudo consultar Instagram.' }, 502);
  }

  const yaGuardados = await getStoredPostIds();
  let nuevos = 0;

  for (const medio of medios) {
    if (yaGuardados.has(medio.id)) {
      continue;
    }

    // En los videos, media_url es el archivo de video; la miniatura viene aparte.
    const origen = medio.media_type === 'VIDEO' ? medio.thumbnail_url : medio.media_url;

    if (!origen) {
      continue;
    }

    // Las URLs de Instagram van firmadas y caducan, asi que la imagen se
    // rehospeda. Si no se puede -por ejemplo si Storage aun no esta activo- se
    // guarda la original, que al menos sirve durante un tiempo.
    const rehospedada = await rehostImage(origen, 'publicacion', medio.id);

    await saveInstagramPost({
      id: medio.id,
      caption: medio.caption ?? '',
      permalink: medio.permalink,
      imageUrl: rehospedada ?? origen,
      isVideo: medio.media_type === 'VIDEO',
      timestamp: new Date(medio.timestamp),
    });

    nuevos += 1;
  }

  return jsonResponse({ success: true, recibidos: medios.length, nuevos }, 200);
};
