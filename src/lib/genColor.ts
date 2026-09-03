// Reparto de los colores del anillo de GEN entre los elementos de la interfaz.
//
// El color se deriva del propio texto y no de la posicion en la lista: asi la
// etiqueta "tecnologia" es del mismo color en la home, en el calendario y en
// la ficha del evento. Si dependiera del indice, cambiaria al filtrar y el
// color dejaria de significar nada.
export const GEN_COLORS = ['rojo', 'naranja', 'amarillo', 'celeste', 'azul', 'magenta'] as const;

export type GenColor = (typeof GEN_COLORS)[number];

// FNV-1a: barato, estable entre ejecuciones y bien repartido para cadenas
// cortas. No hace falta nada criptografico para elegir un color.
function hash(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function genColor(seed: string): GenColor {
  const normalized = seed
    .normalize('NFD')
    .replace(/[^\x00-\x7F]/g, '')
    .toLowerCase()
    .trim();

  return GEN_COLORS[hash(normalized) % GEN_COLORS.length]!;
}

// Color de un evento: manda su primera etiqueta, para que el color signifique
// el tema y no el evento suelto. Sin etiquetas cae al slug, que al menos es
// estable entre paginas.
export function genColorForEvent(event: { tags: string[]; slug: string }): GenColor {
  return genColor(event.tags[0] ?? event.slug);
}
