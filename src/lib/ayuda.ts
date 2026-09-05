// Contenido del centro de ayuda.
//
// Vive aparte del componente que lo pinta por la misma razon que SOCIAL_FIELDS
// vive en types/profile.ts: es una lista que va a crecer y a la que se le van a
// corregir textos, y no tiene por que obligar a leer el marcado para tocarla.
// Quien escribe ayuda edita este archivo y nada mas.
//
// Las respuestas van en parrafos sueltos y no en HTML: asi nadie puede meter
// marcado por accidente en una pagina que ya se renderiza en el servidor, y el
// buscador de abajo puede concatenarlas para buscar sin tener que limpiar
// etiquetas antes.

import type { GenColor } from './genColor';

export const ICONOS_AYUDA = [
  'cuenta',
  'publicar',
  'asistir',
  'comunidades',
  'avisos',
  'normas',
] as const;

export type IconoAyuda = (typeof ICONOS_AYUDA)[number];

export interface ArticuloAyuda {
  id: string;
  pregunta: string;
  respuesta: string[];
  // La accion que resuelve la duda, cuando existe una pagina que la resuelve.
  // Es opcional a proposito: un articulo que explica una regla del producto
  // ("sin precio es gratis") no lleva a ningun sitio, y forzarle un enlace
  // acabaria en enlaces de relleno.
  enlace?: { texto: string; href: string };
}

export interface CategoriaAyuda {
  id: string;
  nombre: string;
  descripcion: string;
  icono: IconoAyuda;
  // El color se asigna a mano y no con genColor(). Esa funcion deriva el color
  // del texto para que una misma etiqueta se vea igual en toda la aplicacion,
  // que aqui no hace falta -estas seis categorias no aparecen en ningun otro
  // sitio- y con estos nombres concretos reparte tres magentas y dos naranjas,
  // dejando fuera medio anillo. Siendo una lista cerrada de seis, se recorre
  // el anillo entero una vez.
  color: GenColor;
  articulos: ArticuloAyuda[];
}

export const CATEGORIAS_AYUDA: CategoriaAyuda[] = [
  {
    id: 'cuenta',
    nombre: 'Cuenta y acceso',
    descripcion: 'Entrar, tu perfil, tu nombre de usuario y cerrar la cuenta.',
    icono: 'cuenta',
    color: 'rojo',
    articulos: [
      {
        id: 'no-puedo-entrar',
        pregunta: 'No puedo entrar a mi cuenta',
        respuesta: [
          'Nodo no usa contraseñas: se entra con tu cuenta de Google o de Microsoft, y es ese proveedor quien confirma que eres tú. Si el acceso falla, casi siempre es una de tres cosas: el navegador bloqueó la ventana emergente del proveedor, cerraste esa ventana antes de terminar, o estás eligiendo una cuenta distinta de la que usaste la primera vez.',
          'Permite las ventanas emergentes para este sitio e inténtalo de nuevo. Si entraste con Google la primera vez, tu perfil, tus eventos y tus asistencias están atados a esa cuenta: con otra distinta entrarás a un perfil vacío, no al tuyo.',
        ],
      },
      {
        id: 'sesion-caducada',
        pregunta: 'Se cerró mi sesión sola',
        respuesta: [
          'La sesión dura cinco días y luego caduca por seguridad. No es un error ni pierdes nada: al volver a entrar con el mismo proveedor recuperas tu perfil tal como estaba.',
          'También caduca si cierras sesión en otro dispositivo o si tu cuenta cambia en el proveedor.',
        ],
      },
      {
        id: 'cambiar-nombre-foto',
        pregunta: 'Cómo cambio mi nombre, mi foto o mi biografía',
        respuesta: [
          'Todo se edita en la pestaña Cuenta de esta misma página. El nombre y el apellido admiten hasta 60 caracteres cada uno y la biografía hasta 280.',
          'El cambio no se queda solo en tu perfil: los eventos que ya publicaste pasan a mostrar tu nombre y tu foto nuevos, porque la cartelera lee siempre tu perfil actual y no una copia de cuando publicaste.',
        ],
        enlace: { texto: 'Editar mi perfil', href: '/configuracion' },
      },
      {
        id: 'nombre-de-usuario',
        pregunta: 'Para qué sirve el nombre de usuario',
        respuesta: [
          'Es tu dirección pública en Nodo: con @tunombre, tu perfil queda en nodo.../u/tunombre y puedes compartirlo como cualquier enlace.',
          'Admite entre 3 y 30 caracteres: letras, números, punto, guion o guion bajo, sin empezar ni terminar en símbolo. Es único, así que si el que quieres ya está tomado el formulario te lo dice antes de guardar.',
        ],
      },
      {
        id: 'foto-no-sube',
        pregunta: 'Mi foto no se sube',
        respuesta: [
          'Las imágenes pueden pesar hasta 15 MB y deben ser JPG, PNG o WEBP. Antes de guardarse pasan por dos pasos: encuadras el recorte en el propio formulario y el servidor las revisa y las ajusta al tamaño que usa el sitio.',
          'Si la subida se rechaza, el mensaje bajo el campo dice el motivo. Los archivos de otros formatos (HEIC del iPhone, por ejemplo) hay que convertirlos antes.',
        ],
      },
      {
        id: 'palomita-verificacion',
        pregunta: 'Qué significa la palomita junto a un nombre',
        respuesta: [
          'Hay dos, con el mismo símbolo y criterios distintos. "Identidad confirmada" dice que esa persona es quien dice ser. "Comunidad oficial" dice que ese colectivo está reconocido por Nodo.',
          'No se solicita desde el formulario ni se puede activar uno mismo: la concede el equipo de Nodo, y puede retirarla.',
        ],
      },
      {
        id: 'eliminar-cuenta',
        pregunta: 'Cómo elimino mi cuenta',
        respuesta: [
          'En la pestaña Cuenta, al final, está "Eliminar cuenta". Se pide un código de confirmación de seis caracteres que caduca a los diez minutos, para que no pueda ocurrir de un clic.',
          'Antes de borrar tienes que decidir qué pasa con tus eventos próximos: transferirlos a otra cuenta, que los recibe y decide si los acepta, o borrarlos todos junto con sus asistencias. La eliminación no se puede deshacer.',
        ],
      },
    ],
  },
  {
    id: 'publicar',
    nombre: 'Publicar eventos',
    descripcion: 'Crear, editar, ubicar y darle precio o aforo a un evento.',
    icono: 'publicar',
    color: 'naranja',
    articulos: [
      {
        id: 'como-publico',
        pregunta: 'Cómo publico un evento',
        respuesta: [
          'Necesitas haber iniciado sesión. Desde "Publicar evento" llenas el formulario: título, descripción, modalidad, fechas y, si quieres, imagen, etiquetas, precio y aforo. Se publica en la cartelera al guardarlo, sin revisión previa.',
          'El título admite hasta 140 caracteres y la descripción hasta 3.000. Puedes añadir hasta 10 etiquetas de 40 caracteres cada una: son las que agrupan tu evento por categoría en la portada.',
        ],
        enlace: { texto: 'Publicar un evento', href: '/eventos/nuevo' },
      },
      {
        id: 'editar-eliminar',
        pregunta: 'Puedo editar o eliminar un evento ya publicado',
        respuesta: [
          'Sí, y solo puede hacerlo quien lo organiza. Desde la ficha del evento, o desde "Mis eventos", entras a editarlo y cambias lo que necesites.',
          'La dirección web del evento no cambia al editarlo, ni siquiera si cambias el título: los enlaces que ya compartiste siguen funcionando. Al eliminarlo se borran también las asistencias confirmadas, así que quienes dijeron que iban dejan de verlo en su calendario.',
        ],
        enlace: { texto: 'Ver mis eventos', href: '/mis-eventos' },
      },
      {
        id: 'modalidades',
        pregunta: 'Qué diferencia hay entre presencial, virtual e híbrido',
        respuesta: [
          'Presencial pide ciudad y lugar. Virtual pide el enlace de conexión y no lleva sitio físico. Híbrido pide las dos cosas, porque ocurre en un sitio y se transmite a la vez.',
          'En la portada los híbridos van con los presenciales, no en el carril de eventos en línea: tienen sitio y ciudad, y quien busca algo cerca los quiere ver.',
        ],
      },
      {
        id: 'ubicacion-exacta',
        pregunta: 'Cómo pongo el lugar exacto en el mapa',
        respuesta: [
          'El campo de dirección del formulario sugiere sitios mientras escribes. Al elegir uno de la lista se fija el punto exacto en el mapa, y ese es el que ve quien abre la ficha.',
          'Si escribes la dirección a mano sin elegir una sugerencia, el mapa la ubica igual, pero por aproximación: acierta el barrio y la calle, no el portal. Para un sitio con entrada difícil de encontrar, conviene elegir la sugerencia.',
        ],
      },
      {
        id: 'precio-aforo',
        pregunta: 'Cómo funcionan el precio y el aforo',
        respuesta: [
          'Un evento sin precio es gratis: no hay que escribir un cero. Si le pones precio, eliges también la moneda entre peso colombiano, dólar y euro. Nodo no cobra ni procesa pagos: el precio es informativo y el cobro lo gestionas tú por fuera.',
          'Un evento sin aforo no tiene límite de asistentes. Si le pones uno, deja de admitir confirmaciones al llenarse, y el límite se comprueba en el momento exacto de confirmar: dos personas que pulsen a la vez sobre el último lugar no pueden entrar las dos.',
        ],
      },
      {
        id: 'zona-horaria',
        pregunta: 'En qué horario se muestra mi evento',
        respuesta: [
          'Cada evento guarda su propia zona horaria, la del sitio donde ocurre. La hora que escribes es la hora local del evento, y es la que ve todo el mundo, esté donde esté.',
          'Eso significa que si editas tu evento desde otro país, la hora no se desplaza sola. También es la hora que llega a tu calendario si usas la suscripción.',
        ],
      },
      {
        id: 'publicar-como-comunidad',
        pregunta: 'Puedo publicar a nombre de mi comunidad',
        respuesta: [
          'Sí, si administras una. El formulario te deja elegir si el evento sale a nombre de la comunidad o al tuyo propio.',
          'Publicado en nombre de la comunidad, la cartelera muestra a la comunidad como organizadora y la ficha sigue mostrando quién lo creó.',
        ],
      },
    ],
  },
  {
    id: 'asistir',
    nombre: 'Asistir a eventos',
    descripcion: 'Confirmar, cancelar y qué ve el resto cuando dices que vas.',
    icono: 'asistir',
    color: 'amarillo',
    articulos: [
      {
        id: 'como-confirmo',
        pregunta: 'Cómo confirmo que voy a un evento',
        respuesta: [
          'En la ficha del evento, con el botón de asistir. Hace falta haber iniciado sesión; si no la tienes, se te pide entrar y vuelves al mismo evento.',
          'La confirmación es inmediata y no necesita aprobación de quien organiza.',
        ],
      },
      {
        id: 'cancelar-asistencia',
        pregunta: 'Puedo cancelar mi asistencia',
        respuesta: [
          'Sí, con el mismo botón, y sin penalización. El lugar vuelve a quedar libre para alguien más y el aviso que le llegó a quien organiza se retira.',
          'Si el evento tenía aforo lleno y alguien cancela, el lugar queda disponible para el siguiente que lo pulse. No hay lista de espera.',
        ],
      },
      {
        id: 'aforo-lleno',
        pregunta: 'El evento dice que está lleno',
        respuesta: [
          'Se alcanzó el aforo que puso quien organiza. Nodo no guarda cupo ni mantiene lista de espera: los lugares se ocupan por orden de llegada.',
          'Puede liberarse si alguien cancela, así que vale la pena volver a mirar. Si el evento te importa mucho, escríbele a quien lo organiza desde su perfil.',
        ],
      },
      {
        id: 'evento-terminado',
        pregunta: 'No puedo confirmar en un evento pasado',
        respuesta: [
          'Un evento que ya terminó deja de admitir confirmaciones. Sigue visible en la cartelera —los pasados se pueden consultar— pero el botón de asistir queda cerrado.',
        ],
      },
      {
        id: 'quien-ve-mi-asistencia',
        pregunta: 'Quién ve que voy a un evento',
        respuesta: [
          'Tu foto y tu nombre aparecen entre las caras de quienes asisten, tanto en la tarjeta de la cartelera como en la ficha del evento. Quien lo organiza puede además ver la lista completa de asistentes y entrar a cada perfil.',
          'Es información pública del evento, no de tu cuenta: si prefieres no aparecer, retira la asistencia.',
        ],
      },
    ],
  },
  {
    id: 'comunidades',
    nombre: 'Comunidades',
    descripcion: 'Crear la tuya, unirte a otras y qué cambia al hacerlo.',
    icono: 'comunidades',
    color: 'celeste',
    articulos: [
      {
        id: 'que-es-comunidad',
        pregunta: 'Qué es una comunidad',
        respuesta: [
          'Es el colectivo que organiza eventos: un grupo, una escuela, un colectivo de barrio. Tiene su propia página con su descripción, su foto y sus eventos publicados.',
          'Quien la crea es quien la administra y la única persona que publica eventos en su nombre. El resto se une para seguirla.',
        ],
        enlace: { texto: 'Ver comunidades', href: '/comunidades' },
      },
      {
        id: 'crear-comunidad',
        pregunta: 'Cómo creo una comunidad',
        respuesta: [
          'Desde la página de comunidades, con "Crear comunidad". Pones nombre, descripción y foto, y queda publicada al instante.',
          'Cada persona puede administrar una sola comunidad: así, al publicar un evento, no hay que elegir entre varias cada vez. Los eventos que ya tenías publicados a tu nombre pasan a la comunidad al crearla, para que no nazca vacía al lado de tu propio historial.',
        ],
        enlace: { texto: 'Crear una comunidad', href: '/comunidades/nueva' },
      },
      {
        id: 'unirse-comunidad',
        pregunta: 'Qué pasa cuando me uno a una comunidad',
        respuesta: [
          'Quedas contado entre sus miembros y su página te reconoce como parte del grupo. Unirse no da permiso para publicar en su nombre: eso lo hace solo quien la administra.',
          'Puedes salirte cuando quieras desde la misma página de la comunidad.',
        ],
      },
      {
        id: 'renombrar-comunidad',
        pregunta: 'Si renombro mi comunidad, qué pasa con sus eventos',
        respuesta: [
          'Se actualizan solos. El nombre y la foto que muestran los eventos ya publicados se cambian en la misma operación, así que no queda ninguno con el nombre viejo.',
          'Lo mismo al borrarla: sus eventos dejan de apuntar a una comunidad que ya no existe y vuelven a mostrar a quien los creó.',
        ],
      },
    ],
  },
  {
    id: 'avisos',
    nombre: 'Calendario y avisos',
    descripcion: 'Llevar tus eventos a tu calendario y qué te notifica Nodo.',
    icono: 'avisos',
    color: 'azul',
    articulos: [
      {
        id: 'suscripcion-ical',
        pregunta: 'Cómo llevo mis eventos a mi calendario',
        respuesta: [
          'En la pestaña Cuenta, en "Sincronización de calendario", se genera un enlace de suscripción. Lo pegas en Google Calendar, Outlook o Apple como calendario suscrito y tus eventos aparecen ahí.',
          'No es una descarga que haya que repetir: el calendario vuelve a consultar el enlace por su cuenta, así que lo que confirmes después aparece solo. Trae únicamente tus eventos futuros.',
        ],
      },
      {
        id: 'enlace-calendario-secreto',
        pregunta: 'Quién puede ver mi enlace de calendario',
        respuesta: [
          'Cualquiera que tenga el enlace. Los programas de calendario no envían cookies, así que el enlace lleva su propia clave dentro y es lo único que hace falta para leer tu agenda: trátalo como una contraseña.',
          'Si se te escapa, genéralo de nuevo desde la misma sección. El anterior deja de funcionar en el acto, y quien lo tuviera suscrito dejará de recibir actualizaciones.',
        ],
      },
      {
        id: 'que-notifica',
        pregunta: 'Qué avisos me manda Nodo',
        respuesta: [
          'Dentro de Nodo, uno: cuando alguien confirma asistencia a un evento tuyo, te queda un aviso en la campana de la cabecera. Si esa persona cancela, el aviso desaparece.',
          'Por correo, tres: la confirmación cuando dices que vas a un evento, un recordatorio el día antes, y un aviso si quien organiza cambia la fecha o el lugar, o si cancela el evento.',
          'No hay notificaciones al teléfono.',
        ],
      },
      {
        id: 'correo-confirmacion',
        pregunta: 'Confirmé mi asistencia y no me llegó el correo',
        respuesta: [
          'El correo sale a la dirección de la cuenta con la que entraste, no a otra: si entraste con Google, llega a tu Gmail. Mira también en spam y en la pestaña de Promociones, que es donde suelen caer los primeros correos de un remitente nuevo.',
          'Tu asistencia queda confirmada aunque el correo no llegue: lo que vale es lo que muestra la página del evento. Si ahí dice que vas, tienes tu lugar.',
        ],
      },
      {
        id: 'agregar-al-calendario',
        pregunta: 'Cómo agrego el evento a mi calendario desde el correo',
        respuesta: [
          'El correo de confirmación lleva la invitación adjunta. En Gmail aparece un recuadro con el evento y un botón para agregarlo; en Apple Mail y Outlook basta con abrir el archivo adjunto.',
          'Si después cambia la fecha o el lugar, el aviso de cambio trae una invitación nueva que reemplaza a la anterior en tu calendario en vez de duplicarla. Y si el evento se cancela, se quita solo.',
        ],
      },
      {
        id: 'dejar-de-recibir-correos',
        pregunta: 'Cómo dejo de recibir correos de Nodo',
        respuesta: [
          'En la pestaña Preferencias, en «Correos», apagas los recordatorios y los avisos de cambio. El cambio vale desde ese momento y para todos tus eventos.',
          'La confirmación de asistencia no se puede apagar: es el comprobante de algo que acabas de hacer, como el recibo de una compra. Si no quieres recibir ninguno, la vía es no confirmar asistencia.',
        ],
      },
      {
        id: 'tema-claro-oscuro',
        pregunta: 'Cómo cambio a modo oscuro',
        respuesta: [
          'En la pestaña Preferencias puedes elegir claro, oscuro o seguir la preferencia de tu dispositivo.',
          'La elección se guarda en este navegador, así que todavía no viaja contigo a otros dispositivos: en el teléfono hay que elegirla otra vez.',
        ],
      },
    ],
  },
  {
    id: 'normas',
    nombre: 'Privacidad y normas',
    descripcion: 'Qué datos se guardan, qué se revisa y cómo reportar algo.',
    icono: 'normas',
    color: 'magenta',
    articulos: [
      {
        id: 'que-datos',
        pregunta: 'Qué datos guarda Nodo sobre mí',
        respuesta: [
          'Lo que trae tu cuenta del proveedor al entrar (nombre, correo y foto), lo que escribes en tu perfil, y lo que haces en la cartelera: los eventos que publicas y las asistencias que confirmas.',
          'Nodo no guarda contraseñas —de eso se encarga Google o Microsoft— ni datos de pago, porque no procesa pagos.',
        ],
        enlace: { texto: 'Política de privacidad', href: '/privacidad' },
      },
      {
        id: 'moderacion-imagenes',
        pregunta: 'Se revisan las imágenes que se suben',
        respuesta: [
          'Sí: las fotos de perfil y los banners de eventos pasan por una revisión automática antes de publicarse, y se rechazan las que dan señales de contenido adulto, violento o sugerente.',
          'La revisión automática no lo ve todo. Si te encuentras algo que no debería estar en la cartelera, avísale a Red Global por Instagram.',
        ],
      },
      {
        id: 'reportar',
        pregunta: 'Cómo reporto un evento o una cuenta',
        respuesta: [
          'Escribiéndole a Red Global por Instagram, con el enlace del evento o del perfil. Nodo no tiene un botón de reporte todavía.',
          'Una cuenta bloqueada deja de publicar eventos y comunidades, y lo que había publicado deja de verse en la cartelera sin llegar a borrarse: si el bloqueo se levanta, vuelve a aparecer.',
        ],
      },
      {
        id: 'quien-esta-detras',
        pregunta: 'Quién está detrás de Nodo',
        respuesta: [
          'Nodo es la cartelera de Red Global Colombia, capítulo colombiano de la Global Entrepreneurship Network. No es una empresa con equipo de soporte: las dudas que no resuelva esta página se atienden por los canales de la comunidad.',
        ],
        enlace: { texto: 'Acerca de Nodo', href: '/acerca' },
      },
    ],
  },
];

// Los que se ven arriba del todo sin buscar nada. Son ids y no una lista
// aparte para que no puedan quedarse contando una version vieja del texto:
// el articulo se edita en un solo sitio.
export const DESTACADOS_AYUDA = [
  'no-puedo-entrar',
  'como-publico',
  'como-confirmo',
  'nombre-de-usuario',
  'palomita-verificacion',
  'eliminar-cuenta',
];

export function articuloPorId(id: string): ArticuloAyuda | undefined {
  for (const categoria of CATEGORIAS_AYUDA) {
    const encontrado = categoria.articulos.find((articulo) => articulo.id === id);
    if (encontrado) {
      return encontrado;
    }
  }
  return undefined;
}

// Misma regla que usa el buscador de eventos: sin tildes y en minusculas, para
// que "como publico" encuentre "Cómo publico". Se exporta porque la usan los
// dos lados —el servidor al preparar el texto de cada articulo y el navegador
// al normalizar lo que se teclea— y con dos copias acabarian discrepando.
export function normalizarAyuda(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[^\x00-\x7F]/g, '')
    .toLowerCase();
}
