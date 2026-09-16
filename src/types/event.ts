import type { EventCommunity } from './community';
import type { VerificationType } from './profile';

export type EventModality = 'presencial' | 'virtual' | 'hibrido';

// Las tres que tienen sentido hoy. Es una lista cerrada y no texto libre
// porque el valor se le pasa tal cual a Intl.NumberFormat, que lanza con un
// codigo que no sea ISO 4217.
export const EVENT_CURRENCIES = ['COP', 'USD', 'EUR'] as const;

export type EventCurrency = (typeof EVENT_CURRENCIES)[number];

// Lista cerrada y no texto libre, igual que la moneda: el pais se usa para
// filtrar, y un selector fijo evita que "Mexico"/"México"/"mexico" convivan
// como paises distintos. Se guarda el codigo (ver country en NodoEvent), no
// el nombre, por lo mismo que la ciudad se normaliza antes de guardar.
export const LATAM_COUNTRIES = [
  { code: 'AR', name: 'Argentina' },
  { code: 'BO', name: 'Bolivia' },
  { code: 'BR', name: 'Brasil' },
  { code: 'CL', name: 'Chile' },
  { code: 'CO', name: 'Colombia' },
  { code: 'CR', name: 'Costa Rica' },
  { code: 'CU', name: 'Cuba' },
  { code: 'DO', name: 'República Dominicana' },
  { code: 'EC', name: 'Ecuador' },
  { code: 'SV', name: 'El Salvador' },
  { code: 'GT', name: 'Guatemala' },
  { code: 'HN', name: 'Honduras' },
  { code: 'MX', name: 'México' },
  { code: 'NI', name: 'Nicaragua' },
  { code: 'PA', name: 'Panamá' },
  { code: 'PY', name: 'Paraguay' },
  { code: 'PE', name: 'Perú' },
  { code: 'PR', name: 'Puerto Rico' },
  { code: 'UY', name: 'Uruguay' },
  { code: 'VE', name: 'Venezuela' },
] as const;

export type EventCountryCode = (typeof LATAM_COUNTRIES)[number]['code'];

export interface EventOrganizer {
  uid: string;
  name: string;
  avatarUrl?: string;
  // No se guarda en el evento: lo pone enrichOrganizers leyendo el perfil, en
  // el mismo viaje que ya hace para el nombre y la foto. Guardarlo seria
  // congelar una palomita que el panel de administracion puede retirar.
  verification?: VerificationType;
}

// Credito publico de a quien representa el evento, cuando no coincide con
// quien lo publico (por ejemplo: alguien de una fundacion sube el evento,
// pero la fundacion es quien organiza). No es una EventCommunity -no tiene
// pagina propia, slug ni membresia- es solo un nombre y un enlace externo
// que carga libremente quien publica.
export interface EventOrganizingEntity {
  name: string;
  url?: string;
}

export interface NodoEvent {
  id: string;
  slug: string;
  title: string;
  description: string;
  bannerUrl?: string;
  // Variante reducida del banner (tarjetas y miniaturas). Se guarda en el
  // evento en el mismo viaje que bannerUrl: los eventos anteriores a la
  // variante no la tienen y caen a la imagen completa.
  bannerSmallUrl?: string;
  modality: EventModality;
  city?: string;
  // Se guarda el codigo (ver LATAM_COUNTRIES), no el nombre. Obligatorio
  // junto a city para presencial/hibrido; opcional en virtual, donde solo
  // sirve para decir de donde es la entidad organizadora.
  country?: EventCountryCode;
  venue?: string;
  address?: string;
  meetingUrl?: string;
  startDate: Date;
  endDate: Date;
  timezone: string;
  tags: string[];
  organizer: EventOrganizer;
  // Contador de asistentes, desnormalizado en el documento para no pagar un
  // count() por evento en cada listado. Lo mantiene el toggle de RSVP; los
  // eventos anteriores a la desnormalizacion no lo tienen y caen a count().
  rsvpCount?: number;
  // Cuando el evento se publica en nombre de una comunidad, la cartelera
  // muestra a la comunidad y la ficha sigue mostrando a quien lo creo.
  community?: EventCommunity;
  // Igual que community pero mas liviano: un credito de texto (nombre +
  // enlace opcional) para cuando quien organiza no tiene una comunidad
  // creada en Innvita. organizer sigue siendo quien tiene permiso de editar
  // o borrar el evento; esto es solo lo que se muestra como "quien organiza".
  organizingEntity?: EventOrganizingEntity;
  // Punto exacto del sitio, elegido en el formulario. Van los dos o ninguno:
  // media coordenada no ubica nada. Con ellas el mapa de la ficha clava el
  // sitio; sin ellas cae a buscar por la direccion escrita, que acierta el
  // barrio pero no el portal.
  latitude?: number;
  longitude?: number;
  // Precio de la entrada. Ausente es gratis: un evento sin precio es el caso
  // normal, y guardar un 0 obligaria a distinguir "gratis" de "sin definir"
  // en cada sitio que lo pinta. `currency` solo tiene sentido acompañando a
  // un precio.
  price?: number;
  currency?: EventCurrency;
  // Aforo maximo. Ausente es sin limite. Lo hace cumplir la transaccion de
  // asistencia, no el formulario: dos personas confirmando a la vez sobre el
  // ultimo lugar tienen que chocar en la escritura, no en una comprobacion
  // previa que ambas pasarian.
  capacity?: number;
}
