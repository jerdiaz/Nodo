/**
 * Regenera el juego de iconos de Innvita desde el SVG maestro.
 *
 * Sustituye a scripts/recolor-logo.py, que partia de public/logo-icon.png como
 * maestro y le rotaba el matiz al rojo de GEN. Eso era peligroso: ejecutarlo
 * hoy destruiria la marca actual, porque sobrescribe logo-icon.png y todos los
 * favicons derivados con un recolor que ya no corresponde.
 *
 * El maestro ahora es vectorial -public/marca/isotipo.svg-, asi que cada
 * tamano se rasteriza directo del vector en vez de reescalar un PNG. No hay
 * perdida acumulada al reescalar, y cambiar la marca es editar un SVG de
 * medio kilobyte.
 *
 * Los PNG se codifican con paleta y compresion maxima: son geometria plana de
 * cinco colores, asi que la paleta pesa la mitad que el color verdadero y no
 * hay diferencia visible.
 *
 * Uso: node scripts/regenerar-iconos.mjs
 */

import sharp from 'sharp';
import { copyFileSync, statSync, writeFileSync } from 'node:fs';

const MAESTRO = 'public/marca/isotipo.svg';
// Con fondo solido y margen: iOS no respeta la transparencia y recorta las
// esquinas con su propia mascara, asi que sin aire el anillo queda cortado.
const MAESTRO_APP = 'public/marca/isotipo-app.svg';

const PNG = { palette: true, quality: 100, compressionLevel: 9, effort: 10 };

const rasterizar = (svg, tamano) =>
  sharp(svg, { density: 384 }).resize(tamano, tamano).png(PNG).toBuffer();

const salidas = [
  ['public/logo-icon.png', MAESTRO, 256],
  ['public/favicon-32x32.png', MAESTRO, 32],
  ['public/favicon-180x180.png', MAESTRO_APP, 180],
  ['public/apple-touch-icon.png', MAESTRO_APP, 180],
];

for (const [ruta, svg, tamano] of salidas) {
  const antes = statSync(ruta).size;
  writeFileSync(ruta, await rasterizar(svg, tamano));
  const despues = statSync(ruta).size;
  console.log(`  ${ruta.replace('public/', '').padEnd(22)} ${tamano}px  ${antes} → ${despues} bytes`);
}

// favicon.ico con las tres medidas en una pieza. El formato admite entradas
// comprimidas en PNG desde Windows Vista, asi que no hay que pasar por BMP.
const medidas = [16, 32, 48];
const trozos = await Promise.all(medidas.map((s) => rasterizar(MAESTRO, s)));
const cabecera = Buffer.alloc(6);
cabecera.writeUInt16LE(0, 0);
cabecera.writeUInt16LE(1, 2);
cabecera.writeUInt16LE(medidas.length, 4);

let desplazamiento = 6 + 16 * medidas.length;
const entradas = medidas.map((s, i) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(s, 0);
  e.writeUInt8(s, 1);
  e.writeUInt16LE(1, 4);
  e.writeUInt16LE(32, 6);
  e.writeUInt32LE(trozos[i].length, 8);
  e.writeUInt32LE(desplazamiento, 12);
  desplazamiento += trozos[i].length;
  return e;
});

writeFileSync('public/favicon.ico', Buffer.concat([cabecera, ...entradas, ...trozos]));
console.log(`  favicon.ico            ${medidas.join('/')}px  ${statSync('public/favicon.ico').size} bytes`);

// El favicon vectorial es el propio maestro: se copia tal cual. Pasarlo por
// sharp lo rasterizaria, que es justo lo contrario de lo que se quiere.
copyFileSync(MAESTRO, 'public/favicon.svg');
console.log(`  favicon.svg            vector  ${statSync('public/favicon.svg').size} bytes`);
