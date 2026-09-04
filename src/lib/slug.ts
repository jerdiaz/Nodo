// Estaba duplicada dentro de la ruta que crea eventos; las comunidades
// necesitan exactamente la misma regla para su identificador, y dos copias de
// esto se desincronizan en cuanto una acepte un caracter que la otra no.
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[^\x00-\x7F]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
