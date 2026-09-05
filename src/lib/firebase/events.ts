import { Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from './server';
import { getUserProfiles } from './users';
import { normalizeCityName } from '../eventValidation';
import type { NodoEvent } from '../../types/event';

export interface EventFilters {
  modality?: string;
  city?: string;
  timeframe?: 'upcoming' | 'past' | 'all';
  search?: string;
  organizerUid?: string;
}

// Quita tildes/diacríticos antes de comparar, para que "ceramica" encuentre
// "cerámica" — muy común que la gente busque sin tildes en español.
function normalizeForSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[^\x00-\x7F]/g, '')
    .toLowerCase();
}

// Un documento corrupto en la coleccion (fecha ausente o mal escrita, por un
// fallo parcial o una escritura que no paso por las rutas) no debe tumbar el
// listado entero para todos: se degrada a una fecha neutra en vez de lanzar.
function toSafeDate(value: unknown): Date {
  if (value instanceof Timestamp) {
    return value.toDate();
  }
  if (value instanceof Date) {
    return value;
  }
  return new Date(0);
}

// Exportado para las rutas que ya tienen el documento en la mano (editar,
// eliminar, confirmar asistencia) y necesitan el evento como objeto para
// componer un correo. Volver a pedirlo con getEventBySlug() serian dos lecturas
// mas -la del evento y la del perfil del organizador- para datos que ya estan
// delante.
export function mapDocToEvent(doc: FirebaseFirestore.DocumentSnapshot): NodoEvent {
  const data = doc.data() ?? {};

  return {
    id: doc.id,
    slug: data.slug,
    title: data.title,
    description: data.description,
    bannerUrl: data.bannerUrl,
    bannerSmallUrl: data.bannerSmallUrl,
    modality: data.modality,
    city: data.city,
    venue: data.venue,
    address: data.address,
    meetingUrl: data.meetingUrl,
    startDate: toSafeDate(data.startDate),
    endDate: toSafeDate(data.endDate),
    timezone: data.timezone ?? 'America/Bogota',
    tags: data.tags ?? [],
    organizer: data.organizer,
    community: data.community,
    rsvpCount: typeof data.rsvpCount === 'number' ? data.rsvpCount : undefined,
    latitude: typeof data.latitude === 'number' ? data.latitude : undefined,
    longitude: typeof data.longitude === 'number' ? data.longitude : undefined,
    price: typeof data.price === 'number' ? data.price : undefined,
    currency: typeof data.currency === 'string' ? (data.currency as NodoEvent['currency']) : undefined,
    capacity: typeof data.capacity === 'number' ? data.capacity : undefined,
  };
}

// El nombre/foto del organizador se guardan en el evento al publicarlo, pero
// la persona puede cambiarlos despues en Configuracion. Sin esto, el evento
// se quedaria mostrando para siempre el nombre de cuando se publico — aqui se
// pisan con el perfil actual (si existe), en un solo viaje a Firestore para
// todos los organizadores de la lista, no uno por evento.
async function enrichOrganizers(events: NodoEvent[]): Promise<NodoEvent[]> {
  const profiles = await getUserProfiles(events.map((event) => event.organizer.uid));

  if (profiles.size === 0) {
    return events;
  }

  return events.flatMap((event) => {
    const profile = profiles.get(event.organizer.uid);

    // Los eventos de quien esta bloqueado no se muestran (no se borran): el
    // bloqueo lo decide un admin, y "ocultar lo suyo" es parte de esa
    // decision. Al desbloquear vuelven a salir solos.
    if (profile?.blocked) {
      return [];
    }

    if (!profile) {
      return [event];
    }

    const currentName = [profile.firstName, profile.lastName].filter(Boolean).join(' ');

    return [
      {
        ...event,
        organizer: {
          ...event.organizer,
          name: currentName || event.organizer.name,
          avatarUrl: profile.avatarUrl ?? event.organizer.avatarUrl,
          verification: profile.verification,
        },
      },
    ];
  });
}

export function filterEvents(events: NodoEvent[], filters?: EventFilters): NodoEvent[] {
  if (!filters) {
    return events;
  }

  const now = Date.now();

  return events.filter((event) => {
    if (filters.organizerUid && event.organizer.uid !== filters.organizerUid) {
      return false;
    }

    if (filters.modality && event.modality !== filters.modality) {
      return false;
    }

    // Comparacion normalizada y no estricta: la ciudad se guarda tal como la
    // teclea quien publica, asi que "Cartagena" y "cartagena" conviven en la
    // base. Con igualdad estricta, el campo de ciudad de la cabecera solo
    // acertaria si se escribiera con las mismas mayusculas y tildes que el
    // evento, que es pedirle adivinacion a quien busca.
    if (filters.city && normalizeForSearch(event.city ?? '') !== normalizeForSearch(filters.city)) {
      return false;
    }

    if (filters.timeframe === 'upcoming' && event.endDate.getTime() < now) {
      return false;
    }

    if (filters.timeframe === 'past' && event.endDate.getTime() >= now) {
      return false;
    }

    if (filters.search) {
      const query = normalizeForSearch(filters.search.trim());
      const haystack = normalizeForSearch([event.title, event.description, ...event.tags].join(' '));

      if (query && !haystack.includes(query)) {
        return false;
      }
    }

    return true;
  });
}

// La ciudad se normaliza al guardar (ver normalizeCityName en
// eventValidation.ts) desde que existe esta funcion, pero eso no toca lo que
// ya esta en Firestore: eventos publicados antes conviven con "cartagena" y
// "Cartagena" como si fueran ciudades distintas. Agrupar aqui, en vez de
// migrar los documentos, resuelve el filtro sin tocar datos ya publicados.
export function getFilterCities(events: NodoEvent[]): string[] {
  const cities = new Set(
    events.filter((event): event is NodoEvent & { city: string } => Boolean(event.city)).map((event) => normalizeCityName(event.city)),
  );

  return [...cities].sort((a, b) => a.localeCompare(b, 'es'));
}

export async function getEvents(filters?: EventFilters): Promise<NodoEvent[]> {
  const db = getAdminDb();

  // Quien pide solo lo suyo (Mis eventos, el contador de la cuenta) no necesita
  // que se lea el catalogo entero: una igualdad sobre un campo suelto usa el
  // indice que Firestore mantiene solo, sin compuesto. El orden se repone en
  // memoria, que es lo que la consulta con orderBy exigiria de todos modos.
  if (filters?.organizerUid) {
    const snapshot = await db.collection('events').where('organizer.uid', '==', filters.organizerUid).get();
    const events = await enrichOrganizers(snapshot.docs.map(mapDocToEvent));
    events.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
    return filterEvents(events, filters);
  }

  const snapshot = await db.collection('events').orderBy('startDate', 'asc').get();
  const events = await enrichOrganizers(snapshot.docs.map(mapDocToEvent));

  return filterEvents(events, filters);
}

// Los eventos que empiezan dentro de una ventana de tiempo. Lo usa el barrido
// que encola los recordatorios, que no puede permitirse leer el catalogo entero
// cada cuarto de hora.
//
// Dos desigualdades sobre el MISMO campo suelto, que es lo que Firestore indexa
// por su cuenta; con dos campos distintos haria falta un indice compuesto, que
// es justo lo que el resto del repo evita. Sin enrichOrganizers a proposito: el
// correo lleva el nombre del organizador guardado en el evento, y cruzar el
// perfil de cada uno seria una lectura mas por recordatorio.
export async function getEventsStartingBetween(desde: Date, hasta: Date): Promise<NodoEvent[]> {
  const snapshot = await getAdminDb()
    .collection('events')
    .where('startDate', '>=', Timestamp.fromDate(desde))
    .where('startDate', '<=', Timestamp.fromDate(hasta))
    .orderBy('startDate', 'asc')
    .get();

  return snapshot.docs.map(mapDocToEvent);
}

// Solo los slugs, para el sitemap: no hace falta el perfil de cada organizador
// (enrichOrganizers) ni traer el documento entero.
export async function getEventSlugs(): Promise<string[]> {
  const db = getAdminDb();
  const snapshot = await db.collection('events').select('slug').get();
  return snapshot.docs.map((doc) => doc.data()?.slug ?? doc.id);
}

// El id del documento y el slug siempre son el mismo (asi se crea: .doc(slug)),
// asi que la lectura es directa, sin query de por medio.
export async function getEventBySlug(slug: string): Promise<NodoEvent | null> {
  const db = getAdminDb();
  const doc = await db.collection('events').doc(slug).get();

  if (!doc.exists) {
    return null;
  }

  const [event] = await enrichOrganizers([mapDocToEvent(doc)]);
  return event ?? null;
}

// Borrar un documento no borra sus subcolecciones: los rsvps de un evento
// sobreviven a su documento si no se recorren a mano. listDocuments() no trae
// los datos, solo las referencias, asi que no se paga una lectura por asistente.
export async function deleteEventWithRsvps(eventId: string): Promise<void> {
  const db = getAdminDb();
  const eventRef = db.collection('events').doc(eventId);
  const rsvps = await eventRef.collection('rsvps').listDocuments();

  await Promise.all(rsvps.map((doc) => doc.delete()));
  await eventRef.delete();
}

// --- Directorio del panel de administracion ---------------------------------

export interface AdminEventRow {
  id: string;
  slug: string;
  title: string;
  startDate: Date;
  endDate: Date;
  timezone: string;
  modality: NodoEvent['modality'];
  city?: string;
  venue?: string;
  organizerUid: string;
  organizerName: string;
  // El organizador esta bloqueado: sus eventos no se ven en la cartelera pero
  // el admin tiene que poder verlos y gestionarlos aqui.
  organizadorBloqueado: boolean;
  organizadorAdmin: boolean;
  comunidad?: string;
  rsvpCount: number;
  capacity?: number;
  price?: number;
  currency?: NodoEvent['currency'];
}

// Todos los eventos, incluidos los de organizadores bloqueados (que
// getEvents oculta a la cartelera). El admin los ve todos. Una sola lectura de
// la coleccion y un getAll() de perfiles de organizadores, como el resto del
// repo; no escribe nada.
export async function getAdminEventRows(): Promise<AdminEventRow[]> {
  const db = getAdminDb();
  const snapshot = await db.collection('events').orderBy('startDate', 'desc').get();

  const perfiles = await getUserProfiles(
    snapshot.docs.map((doc) => doc.data()?.organizer?.uid).filter((uid): uid is string => Boolean(uid)),
  );

  return snapshot.docs.map((doc) => {
    const data = doc.data() ?? {};
    const organizer = (data.organizer ?? {}) as { uid?: string; name?: string };
    const perfil = organizer.uid ? perfiles.get(organizer.uid) : undefined;

    return {
      id: doc.id,
      slug: data.slug ?? doc.id,
      title: data.title ?? '(sin título)',
      startDate: toSafeDate(data.startDate),
      endDate: toSafeDate(data.endDate),
      timezone: data.timezone ?? 'America/Bogota',
      modality: data.modality,
      city: data.city,
      venue: data.venue,
      organizerUid: organizer.uid ?? '',
      organizerName: organizer.name ?? 'Desconocido',
      organizadorBloqueado: perfil?.blocked === true,
      organizadorAdmin: perfil?.admin === true,
      comunidad: data.community?.name,
      rsvpCount: typeof data.rsvpCount === 'number' ? data.rsvpCount : 0,
      capacity: typeof data.capacity === 'number' ? data.capacity : undefined,
      price: typeof data.price === 'number' ? data.price : undefined,
      currency: typeof data.currency === 'string' ? (data.currency as NodoEvent['currency']) : undefined,
    };
  });
}
