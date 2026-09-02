import { cert, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

if (!projectId || !clientEmail || !privateKey) {
  console.error(
    'Faltan variables de entorno de Firebase Admin (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY).\n' +
      'Corre este script con: node --env-file-if-exists=.env scripts/seed.mjs',
  );
  process.exit(1);
}

const app = initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
const db = getFirestore(app);

function inDays(days, hour, minute = 0) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, minute, 0, 0);
  return date;
}

const organizerNodo = { uid: 'seed-organizer-nodo', name: 'Comunidad Nodo' };
const organizerAda = {
  uid: 'seed-organizer-ada',
  name: 'Ada Espacio Creativo',
  avatarUrl: 'https://api.dicebear.com/9.x/initials/svg?seed=Ada%20Espacio',
};

const events = [
  {
    slug: 'taller-ceramica-comunitaria',
    title: 'Taller de cerámica comunitaria',
    description:
      'Un espacio para aprender las bases del modelado en cerámica, con materiales incluidos. No se necesita experiencia previa: solo ganas de ensuciarte las manos y conocer gente nueva del barrio.',
    bannerUrl: 'https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=1200&q=80',
    modality: 'presencial',
    city: 'Bogotá',
    venue: 'Casa Taller Chapinero',
    address: 'Cra 13 #45-12',
    startDate: Timestamp.fromDate(inDays(12, 15, 0)),
    endDate: Timestamp.fromDate(inDays(12, 18, 0)),
    tags: ['arte', 'comunidad', 'manualidades'],
    organizer: organizerAda,
  },
  {
    slug: 'webinar-ia-para-emprendedores',
    title: 'Webinar: Introducción a la IA para emprendedores',
    description:
      'Una sesión práctica sobre cómo emprendedores y pequeños negocios pueden empezar a usar herramientas de inteligencia artificial hoy mismo, sin necesitar equipo técnico. Incluye espacio de preguntas al final.',
    modality: 'virtual',
    meetingUrl: 'https://meet.google.com/nodo-ia-emprende',
    startDate: Timestamp.fromDate(inDays(6, 18, 0)),
    endDate: Timestamp.fromDate(inDays(6, 19, 30)),
    tags: ['tecnologia', 'emprendimiento'],
    organizer: organizerNodo,
  },
  {
    slug: 'feria-emprendimiento-local-medellin',
    title: 'Feria de emprendimiento local',
    description:
      'Más de 20 emprendimientos locales muestran sus productos y servicios. Habrá zona de comida y música en vivo, además de transmisión en línea para quienes no puedan asistir presencialmente.',
    bannerUrl: 'https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=1200&q=80',
    modality: 'hibrido',
    city: 'Medellín',
    venue: 'Parque de las Luces',
    address: 'Cra 51 #34-38',
    meetingUrl: 'https://youtube.com/live/nodo-feria-medellin',
    startDate: Timestamp.fromDate(inDays(20, 10, 0)),
    endDate: Timestamp.fromDate(inDays(20, 17, 0)),
    tags: ['emprendimiento', 'comunidad'],
    organizer: organizerNodo,
  },
  {
    slug: 'noche-trivia-networking-tech-cartagena',
    title: 'Noche de trivia y networking tech',
    description:
      'Trivia sobre tecnología y cultura pop, en equipos, con premios para los ganadores. Buena excusa para conocer a otras personas del gremio tech en Cartagena en un ambiente relajado.',
    modality: 'presencial',
    city: 'Cartagena',
    venue: 'Café Central',
    address: 'Calle del Arsenal',
    startDate: Timestamp.fromDate(inDays(9, 19, 0)),
    endDate: Timestamp.fromDate(inDays(9, 21, 30)),
    tags: ['tecnologia', 'networking'],
    organizer: organizerAda,
  },
];

for (const event of events) {
  await db
    .collection('events')
    .doc(event.slug)
    .set({ ...event, createdAt: FieldValue.serverTimestamp() });
  console.log(`Sembrado: ${event.slug}`);
}

console.log(`\n${events.length} eventos sembrados en la colección 'events'.`);
process.exit(0);
