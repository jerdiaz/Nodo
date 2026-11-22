import { crc32, deflateRawSync } from 'node:zlib';

// Generador minimo de .xlsx, sin dependencias: una hoja, una fila de
// encabezado en negrita y celdas de texto, numero o fecha.
//
// Es .xlsx de verdad y no un CSV con otra extension por dos motivos:
//
//   - El Excel en espanol (es-CO incluido) usa la coma como separador decimal
//     y espera `;` entre columnas. Un CSV con comas se abre con todo metido en
//     la columna A, y uno con `;` se rompe en un Excel en ingles.
//   - Una celda de CSV que empieza por `=`, `+`, `-` o `@` Excel la ejecuta
//     como formula, y aqui los textos los escribe cualquiera (nombre, usuario).
//     Como `inlineStr` el contenido es siempre texto: nunca se evalua.
//
// Un .xlsx es un zip de XML. El zip se escribe a mano (cabecera local por
// archivo, directorio central y registro final) con deflate de node:zlib.

export type XlsxCell = string | number | Date | null | undefined;

export interface XlsxColumn {
  header: string;
  // Ancho en caracteres, como lo mide Excel.
  width?: number;
}

export interface XlsxSheet {
  name: string;
  columns: XlsxColumn[];
  rows: XlsxCell[][];
  // Las fechas se guardan como hora de reloj en esta zona: Excel no conoce
  // zonas horarias, y lo que tiene que ver quien abre el archivo es la hora
  // del evento, no la del servidor ni UTC.
  timezone: string;
}

// Caracteres que XML 1.0 no admite ni escapados. Un nombre pegado desde otro
// sitio puede traer alguno, y uno solo basta para que Excel declare el
// archivo corrupto.
const INVALIDOS_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

function escaparXml(texto: string): string {
  return texto
    .replace(INVALIDOS_XML, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function letraColumna(indice: number): string {
  let resto = indice + 1;
  let letras = '';

  while (resto > 0) {
    const modulo = (resto - 1) % 26;
    letras = String.fromCharCode(65 + modulo) + letras;
    resto = Math.floor((resto - 1) / 26);
  }

  return letras;
}

// Numero de serie de Excel (dias desde 1899-12-30) de la hora de reloj que
// marca `fecha` en `timezone`.
function serieExcel(fecha: Date, timezone: string): number {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(fecha)
      .map((parte) => [parte.type, parte.value]),
  );

  const relojComoUtc = Date.UTC(
    Number(partes.year),
    Number(partes.month) - 1,
    Number(partes.day),
    Number(partes.hour),
    Number(partes.minute),
    Number(partes.second),
  );

  return relojComoUtc / 86_400_000 + 25_569;
}

// Estilos (indices de cellXfs en styles.xml): 0 normal, 1 encabezado en
// negrita, 2 fecha y hora.
const ESTILO_ENCABEZADO = 1;
const ESTILO_FECHA = 2;

function celdaXml(valor: XlsxCell, referencia: string, timezone: string, estilo?: number): string {
  const s = estilo ? ` s="${estilo}"` : '';

  if (valor === null || valor === undefined || valor === '') {
    return '';
  }

  if (valor instanceof Date) {
    return Number.isNaN(valor.getTime())
      ? ''
      : `<c r="${referencia}" s="${ESTILO_FECHA}"><v>${serieExcel(valor, timezone)}</v></c>`;
  }

  if (typeof valor === 'number') {
    return Number.isFinite(valor) ? `<c r="${referencia}"${s}><v>${valor}</v></c>` : '';
  }

  return `<c r="${referencia}" t="inlineStr"${s}><is><t xml:space="preserve">${escaparXml(valor)}</t></is></c>`;
}

function hojaXml(hoja: XlsxSheet): string {
  const ultimaColumna = letraColumna(Math.max(0, hoja.columns.length - 1));
  const totalFilas = hoja.rows.length + 1;

  const columnas = hoja.columns
    .map((columna, i) => `<col min="${i + 1}" max="${i + 1}" width="${columna.width ?? 18}" customWidth="1"/>`)
    .join('');

  const encabezado = `<row r="1">${hoja.columns
    .map((columna, i) => celdaXml(columna.header, `${letraColumna(i)}1`, hoja.timezone, ESTILO_ENCABEZADO))
    .join('')}</row>`;

  const filas = hoja.rows
    .map((fila, f) => {
      const numero = f + 2;
      const celdas = fila.map((valor, c) => celdaXml(valor, `${letraColumna(c)}${numero}`, hoja.timezone)).join('');
      return `<row r="${numero}">${celdas}</row>`;
    })
    .join('');

  // Encabezado fijo al desplazarse y con filtro: es lo primero que alguien
  // hace con una lista de asistentes en Excel.
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetViews><sheetView workbookViewId="0">' +
    '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' +
    '</sheetView></sheetViews>' +
    `<cols>${columnas}</cols>` +
    `<sheetData>${encabezado}${filas}</sheetData>` +
    `<autoFilter ref="A1:${ultimaColumna}${totalFilas}"/>` +
    '</worksheet>'
  );
}

// Excel no admite en el nombre de la hoja []:*?/\ ni mas de 31 caracteres.
function nombreHoja(nombre: string): string {
  return nombre.replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31) || 'Hoja1';
}

function partesDelLibro(hoja: XlsxSheet): Array<[string, string]> {
  return [
    [
      '[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '</Types>',
    ],
    [
      '_rels/.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>',
    ],
    [
      'xl/workbook.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        `<sheets><sheet name="${escaparXml(nombreHoja(hoja.name))}" sheetId="1" r:id="rId1"/></sheets>` +
        // El filtro de la hoja necesita este nombre definido para que Excel lo
        // reconozca como tal al abrir.
        `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${escaparXml(
          nombreHoja(hoja.name).replace(/'/g, "''"),
        )}'!$A$1:$${letraColumna(Math.max(0, hoja.columns.length - 1))}$${hoja.rows.length + 1}</definedName></definedNames>` +
        '</workbook>',
    ],
    [
      'xl/_rels/workbook.xml.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        '</Relationships>',
    ],
    [
      'xl/styles.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        '<numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy hh:mm"/></numFmts>' +
        '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
        '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        '<cellXfs count="3">' +
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
        '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
        '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
        '</cellXfs>' +
        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
        '</styleSheet>',
    ],
    ['xl/worksheets/sheet1.xml', hojaXml(hoja)],
  ];
}

function zip(archivos: Array<[string, string]>): Buffer {
  const locales: Buffer[] = [];
  const centrales: Buffer[] = [];
  let desplazamiento = 0;

  for (const [nombre, contenido] of archivos) {
    const nombreBytes = Buffer.from(nombre, 'utf8');
    const datos = Buffer.from(contenido, 'utf8');
    const comprimido = deflateRawSync(datos);
    const crc = crc32(datos);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version necesaria
    local.writeUInt16LE(0x0800, 6); // nombres en UTF-8
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(0, 10); // hora
    local.writeUInt16LE(0x21, 12); // fecha: 1980-01-01
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comprimido.length, 18);
    local.writeUInt32LE(datos.length, 22);
    local.writeUInt16LE(nombreBytes.length, 26);
    local.writeUInt16LE(0, 28);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version que lo creo
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(comprimido.length, 20);
    central.writeUInt32LE(datos.length, 24);
    central.writeUInt16LE(nombreBytes.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(desplazamiento, 42);

    locales.push(local, nombreBytes, comprimido);
    centrales.push(central, nombreBytes);
    desplazamiento += local.length + nombreBytes.length + comprimido.length;
  }

  const directorio = Buffer.concat(centrales);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(archivos.length, 8);
  fin.writeUInt16LE(archivos.length, 10);
  fin.writeUInt32LE(directorio.length, 12);
  fin.writeUInt32LE(desplazamiento, 16);

  return Buffer.concat([...locales, directorio, fin]);
}

export function buildXlsx(hoja: XlsxSheet): Buffer {
  return zip(partesDelLibro(hoja));
}

export const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
