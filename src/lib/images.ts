import { randomUUID } from 'node:crypto';
import { ImageAnnotatorClient } from '@google-cloud/vision';
import sharp from 'sharp';
import { getSecret } from 'astro:env/server';
import { getAdminDb, getAdminStorage } from './firebase/server';

// Mismos umbrales que usa TransCar en su trigger de moderacion.
const UNSAFE = ['LIKELY', 'VERY_LIKELY'];

export type ImageKind = 'avatar' | 'banner';

const SPECS: Record<ImageKind, { prefix: string; width: number; height: number; maxBytes: number }> = {
  // El recorte se hace en el servidor: asi el tamano final no depende de lo
  // que el navegador quiera subir y las miniaturas siempre cuadran.
  avatar: { prefix: 'avatars', width: 512, height: 512, maxBytes: 2 * 1024 * 1024 },
  banner: { prefix: 'event-banners', width: 1600, height: 900, maxBytes: 5 * 1024 * 1024 },
};

let visionClient: ImageAnnotatorClient | null = null;

function getVisionClient(): ImageAnnotatorClient {
  if (visionClient) {
    return visionClient;
  }

  const projectId = getSecret('FIREBASE_PROJECT_ID');
  const clientEmail = getSecret('FIREBASE_CLIENT_EMAIL');
  const privateKey = getSecret('FIREBASE_PRIVATE_KEY')?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Faltan credenciales para el cliente de Vision.');
  }

  // TransCar no pasa credenciales porque corre dentro de Cloud Functions y las
  // toma del entorno. Aqui estamos en un VPS, asi que se reutiliza la misma
  // cuenta de servicio que ya usa el Admin SDK.
  visionClient = new ImageAnnotatorClient({
    projectId,
    credentials: { client_email: clientEmail, private_key: privateKey },
  });

  return visionClient;
}

export interface ModerationResult {
  safe: boolean;
  /** false cuando la imagen no llego a revisarse porque Vision no esta activo. */
  checked: boolean;
  scores: Record<string, string | null | undefined>;
}

// PERMISSION_DENIED aqui significa que la Cloud Vision API no esta habilitada
// en el proyecto: es un estado del despliegue, no una senal sobre la imagen, y
// no lo puede provocar quien sube. Se distingue de un fallo transitorio para
// no dejar el producto sin subida de imagenes mientras nadie activa la API.
function isVisionDisabled(error: unknown): boolean {
  const code = (error as { code?: number }).code;
  const message = String((error as { message?: string }).message ?? '');
  return code === 7 || message.includes('PERMISSION_DENIED') || message.includes('has not been used');
}

export async function moderateImage(content: Buffer): Promise<ModerationResult> {
  let result;

  try {
    [result] = await getVisionClient().safeSearchDetection({ image: { content } });
  } catch (error) {
    if (isVisionDisabled(error)) {
      console.warn(
        'Cloud Vision no está habilitada en el proyecto: la imagen se acepta SIN revisar. ' +
          'Actívala para que la moderación entre en vigor.',
      );
      return { safe: true, checked: false, scores: {} };
    }
    throw error;
  }

  const annotation = result.safeSearchAnnotation;

  if (!annotation) {
    return { safe: true, checked: true, scores: {} };
  }

  const scores = {
    adult: annotation.adult as string | null | undefined,
    violence: annotation.violence as string | null | undefined,
    racy: annotation.racy as string | null | undefined,
    spoof: annotation.spoof as string | null | undefined,
    medical: annotation.medical as string | null | undefined,
  };

  const safe = !(
    UNSAFE.includes(String(scores.adult)) ||
    UNSAFE.includes(String(scores.violence)) ||
    UNSAFE.includes(String(scores.racy))
  );

  return { safe, checked: true, scores };
}

// Deja constancia del veredicto, como hace TransCar en image_moderation: sin
// esto no hay forma de revisar despues por que se rechazo una imagen.
export async function recordModeration(
  uid: string,
  kind: ImageKind,
  result: ModerationResult,
): Promise<void> {
  try {
    await getAdminDb().collection('image_moderation').add({
      uid,
      kind,
      safe: result.safe,
      checked: result.checked,
      scores: result.scores,
      createdAt: new Date(),
    });
  } catch (error) {
    // El registro es para auditoria: que falle no debe tumbar la subida.
    console.warn('No se pudo registrar la moderación de la imagen:', error);
  }
}

export async function processImage(content: Buffer, kind: ImageKind): Promise<Buffer> {
  const spec = SPECS[kind];

  // JPEG y no WebP a proposito: el banner acaba en og:image y algunos
  // rastreadores de redes sociales todavia no previsualizan WebP.
  return sharp(content)
    .rotate() // respeta la orientacion EXIF antes de recortar
    .resize(spec.width, spec.height, { fit: 'cover', position: 'attention' })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
}

function getBucket() {
  const bucketName =
    import.meta.env.PUBLIC_FIREBASE_STORAGE_BUCKET || `${getSecret('FIREBASE_PROJECT_ID')}.firebasestorage.app`;
  return getAdminStorage().bucket(bucketName);
}

export async function uploadImage(uid: string, kind: ImageKind, content: Buffer): Promise<string> {
  const bucket = getBucket();
  const path = `${SPECS[kind].prefix}/${uid}/${Date.now()}-${randomUUID().slice(0, 8)}.jpg`;
  const token = randomUUID();

  await bucket.file(path).save(content, {
    contentType: 'image/jpeg',
    metadata: {
      // El token de descarga es lo que hace publica la URL sin depender de
      // storage.rules: es el mismo mecanismo que usa getDownloadURL().
      metadata: { firebaseStorageDownloadTokens: token },
      cacheControl: 'public, max-age=31536000, immutable',
    },
  });

  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
}

export function maxBytes(kind: ImageKind): number {
  return SPECS[kind].maxBytes;
}

// --- Limpieza ---------------------------------------------------------------

// De la URL de descarga se recupera la ruta dentro del bucket: es lo unico que
// se guarda en Firestore, asi que es el unico hilo del que tirar para borrar.
function pathFromDownloadUrl(url: string): string | null {
  const match = url.match(/\/o\/([^?]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export async function deleteImageByUrl(url: string | undefined): Promise<void> {
  if (!url || !url.includes('firebasestorage.googleapis.com')) {
    return;
  }

  const path = pathFromDownloadUrl(url);

  if (!path) {
    return;
  }

  try {
    await getBucket().file(path).delete();
  } catch (error) {
    // Que el archivo ya no exista no es un problema; el objetivo es que no quede.
    console.warn('No se pudo borrar la imagen:', path, error);
  }
}

// `prefixes` no es un detalle: al transferir los eventos a otra cuenta, sus
// banners siguen en uso aunque esten guardados bajo la carpeta de quien se va,
// asi que en ese caso solo se borra el avatar.
export async function deleteUserImages(
  uid: string,
  prefixes: readonly ('avatars' | 'event-banners')[] = ['avatars', 'event-banners'],
): Promise<void> {
  const bucket = getBucket();

  await Promise.all(
    prefixes.map(async (prefix) => {
      try {
        await bucket.deleteFiles({ prefix: `${prefix}/${uid}/` });
      } catch (error) {
        console.warn(`No se pudieron borrar las imágenes de ${prefix}/${uid}/:`, error);
      }
    }),
  );
}
