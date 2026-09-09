/**
 * Recolorea la mancha de fondo de un banner de categoria, del color de marca
 * de GEN al equivalente de Fundacion Conceptos.
 *
 * El problema no es cambiar un color plano, sino no estropear la foto que va
 * encima. Una rotacion de matiz global volveria verdes la piel, el barro y la
 * madera, que estan en la misma zona calida que el naranja de la mancha.
 *
 * Un desmezclado puro no basta, y el motivo importa: la mancha es un relleno
 * plano compuesto sobre blanco con cobertura t, asi que cada pixel cumple
 * p = t*mancha + (1-t)*blanco y se puede despejar t. Pero cuando t es pequeno
 * el modelo degenera: el valor esperado es casi blanco, y entonces CUALQUIER
 * pixel claro de la fotografia lo satisface. La primera version de este script
 * tocaba asi el 32% de la imagen en vez del 23% de la mancha, y sembraba
 * motitas verdes en el pelo, la camiseta y las letras del rotulo.
 *
 * La seleccion es por tanto espacial y no solo cromatica, en tres pasos:
 *
 *   1. Nucleo: pixeles a menos de UMBRAL_NUCLEO del color de la mancha. Esto
 *      captura el relleno plano y descarta la piel y el barro, que estan lejos.
 *   2. Componentes conexas: se descartan las manchas de menos de MIN_REGION
 *      pixeles. Es lo que elimina las motitas dentro de la foto, porque son
 *      islas de unas pocas decenas de pixeles y la mancha real son cientos de
 *      miles.
 *   3. Borde: solo los pixeles pegados al nucleo -a DILATACION de distancia-
 *      se recolorean por desmezclado, que reconstruye el antialias sin el halo
 *      naranja que deja un reemplazo de color exacto.
 *
 * Los trazos oscuros dibujados sobre la mancha se quedan como estan: su
 * antialias mezcla negro con naranja, no naranja con blanco, asi que el
 * residuo los rechaza. Es preferible dejarlos intactos que teñirlos a medias.
 *
 * El alfa no se toca nunca: la silueta de la mancha y el recorte de la foto
 * quedan pixel a pixel como estaban.
 *
 * Uso:
 *   node scripts/recolor-banner.mjs <entrada.webp> <#origen> <#destino> [salida.webp]
 *
 * Ejemplo (mancha naranja de GEN -> verde de Conceptos):
 *   node scripts/recolor-banner.mjs public/banner/arte.webp '#D4841C' '#3AAE49'
 */

import sharp from 'sharp';
import { statSync } from 'node:fs';

const hex = (h) => {
  const v = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
};

const [, , entrada, origenHex, destinoHex, salidaArg] = process.argv;
if (!entrada || !origenHex || !destinoHex) {
  console.error('uso: node scripts/recolor-banner.mjs <entrada.webp> <#origen> <#destino> [salida.webp]');
  process.exit(1);
}
const salida = salidaArg ?? entrada;

const ORIGEN = hex(origenHex);
const DESTINO = hex(destinoHex);

// Distancia RGB maxima al color de la mancha para considerar un pixel parte
// del nucleo. Medido sobre este banner: a <=20 caen 118.887 pixeles (el
// relleno), y la siguiente poblacion -piel y barro- no aparece hasta 60.
const UMBRAL_NUCLEO = 22;
// Islas mas pequenas que esto se descartan. La mancha real son >100.000
// pixeles; el ruido de compresion dentro de la foto no pasa de unas decenas.
const MIN_REGION = 2000;
// Radio, en pixeles, del borde que se reconstruye alrededor del nucleo.
const DILATACION = 2;
// Croma minimo para tocar un pixel. Por debajo es practicamente neutro: el
// contorno blanco de la foto y los trazos negros caen aqui y quedan intactos.
const CROMA_MINIMO = 12;
// Desviacion de matiz admitida respecto al de la mancha, en grados. Protege
// de arrastrar algo de otro color que caiga dentro de la region.
const MATIZ_TOLERANCIA = 30;

const { data, info } = await sharp(entrada)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const { width: W, height: H } = info;

// Matiz en grados, con la distancia angular resuelta al comparar.
const matiz = (r, g, b) => {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
};
const CROMA_ORIGEN = Math.max(...ORIGEN) - Math.min(...ORIGEN);
const MATIZ_ORIGEN = matiz(ORIGEN[0], ORIGEN[1], ORIGEN[2]);

const dist = (i) =>
  Math.hypot(data[i] - ORIGEN[0], data[i + 1] - ORIGEN[1], data[i + 2] - ORIGEN[2]);

// --- 1. Nucleo por color ---
const nucleo = new Uint8Array(W * H);
for (let p = 0; p < W * H; p++) {
  const i = p * 4;
  if (data[i + 3] > 0 && dist(i) <= UMBRAL_NUCLEO) nucleo[p] = 1;
}

// --- 2. Componentes conexas, descartando las islas pequenas ---
// Recorrido en anchura con una pila explicita: la recursion desborda en
// regiones de cien mil pixeles.
const conservado = new Uint8Array(W * H);
const visto = new Uint8Array(W * H);
const pila = new Int32Array(W * H);
let regiones = 0;
let descartadas = 0;
for (let inicio = 0; inicio < W * H; inicio++) {
  if (!nucleo[inicio] || visto[inicio]) continue;
  let tope = 0;
  pila[tope++] = inicio;
  visto[inicio] = 1;
  const region = [];
  while (tope > 0) {
    const p = pila[--tope];
    region.push(p);
    const x = p % W;
    const y = (p - x) / W;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const q = ny * W + nx;
      if (nucleo[q] && !visto[q]) {
        visto[q] = 1;
        pila[tope++] = q;
      }
    }
  }
  if (region.length >= MIN_REGION) {
    regiones++;
    for (const p of region) conservado[p] = 1;
  } else {
    descartadas++;
  }
}

// --- 3. Recolorear el nucleo conservado y su borde ---
let tocados = 0;
const salidaData = Buffer.from(data);
for (let p = 0; p < W * H; p++) {
  const i = p * 4;
  if (data[i + 3] === 0) continue;

  let dentro = conservado[p] === 1;
  if (!dentro) {
    // ¿Esta pegado al nucleo? Solo entonces se considera borde.
    const x = p % W;
    const y = (p - x) / W;
    for (let dy = -DILATACION; dy <= DILATACION && !dentro; dy++) {
      for (let dx = -DILATACION; dx <= DILATACION; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (conservado[ny * W + nx]) { dentro = true; break; }
      }
    }
    if (!dentro) continue;
  }

  // t = croma(p) / croma(mancha). Vale igual para el borde contra blanco y
  // para el halo bajo un trazo negro, porque ambos son neutros.
  const r = data[i], g = data[i + 1], b = data[i + 2];
  const croma = Math.max(r, g, b) - Math.min(r, g, b);
  if (croma < CROMA_MINIMO) continue;

  // El matiz tiene que ser el de la mancha; si no, es otra cosa.
  if (Math.abs(matiz(r, g, b) - MATIZ_ORIGEN) > MATIZ_TOLERANCIA) continue;

  const t = Math.min(1, croma / CROMA_ORIGEN);
  for (let c = 0; c < 3; c++) {
    salidaData[i + c] = Math.max(
      0,
      Math.min(255, Math.round(data[i + c] + t * (DESTINO[c] - ORIGEN[c])))
    );
  }
  tocados += 1;
}
data.set(salidaData);

const total = info.width * info.height;
const antes = statSync(entrada).size;

// El original venia en webp con alfa. Se mantiene el formato y se busca un
// peso parecido: subir la calidad aqui no aporta nada, porque lo que se ha
// tocado es un relleno plano.
await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
  .webp({ quality: 82, effort: 6, alphaQuality: 100 })
  .toFile(salida);

const despues = statSync(salida).size;
console.log(
  `${entrada}\n` +
    `  ${info.width}x${info.height}  ${tocados.toLocaleString('es')} de ${total.toLocaleString('es')} pixeles recoloreados (${((100 * tocados) / total).toFixed(1)}%)\n` +
    `  ${regiones} region(es) conservada(s), ${descartadas} isla(s) descartada(s)\n` +
    `  ${origenHex} -> ${destinoHex}\n` +
    `  ${antes.toLocaleString('es')} -> ${despues.toLocaleString('es')} bytes`
);
