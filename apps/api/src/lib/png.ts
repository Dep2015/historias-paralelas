import { deflateSync } from "node:zlib";

/**
 * Codificador PNG minimo.
 *
 * PORQUE A MANO Y NO CON UNA LIBRERIA: lo unico que hace falta es volcar un
 * buffer RGBA a un fichero que FFmpeg sepa leer. Traer sharp o node-canvas
 * significaria un binario nativo, una imagen de Docker mucho mas pesada y
 * problemas de compilacion en Alpine, todo para algo que zlib (que ya viene en
 * Node) resuelve en cincuenta lineas.
 */

const FIRMA = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const TABLA_CRC = ((): Uint32Array => {
  const tabla = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    tabla[n] = c >>> 0;
  }
  return tabla;
})();

function crc32(datos: Buffer): number {
  let c = 0xffffffff;
  for (const byte of datos) {
    const indice = (c ^ byte) & 0xff;
    c = (TABLA_CRC[indice] ?? 0) ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(tipo: string, datos: Buffer): Buffer {
  const longitud = Buffer.alloc(4);
  longitud.writeUInt32BE(datos.length, 0);

  const cuerpo = Buffer.concat([Buffer.from(tipo, "ascii"), datos]);

  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo), 0);

  return Buffer.concat([longitud, cuerpo, crc]);
}

/**
 * Codifica un buffer RGBA a PNG sin perdida.
 * `escala` repite cada pixel N veces: nearest-neighbor puro, que es justo lo
 * que el pixel art necesita (cualquier interpolacion lo destruiria).
 */
export function codificarPng(
  rgba: Uint8ClampedArray,
  ancho: number,
  alto: number,
  escala = 1,
): Buffer {
  const factor = Math.max(1, Math.round(escala));
  const anchoFinal = ancho * factor;
  const altoFinal = alto * factor;

  // Cada scanline lleva delante un byte de filtro; usamos 0 (sin filtrar)
  // porque el contenido es plano y deflate ya lo comprime de sobra.
  const bytesPorFila = anchoFinal * 4;
  const crudo = Buffer.alloc(altoFinal * (bytesPorFila + 1));

  let salida = 0;
  for (let y = 0; y < altoFinal; y++) {
    crudo[salida++] = 0;
    const filaOrigen = Math.floor(y / factor);
    for (let x = 0; x < anchoFinal; x++) {
      const columnaOrigen = Math.floor(x / factor);
      const origen = (filaOrigen * ancho + columnaOrigen) * 4;
      crudo[salida++] = rgba[origen] ?? 0;
      crudo[salida++] = rgba[origen + 1] ?? 0;
      crudo[salida++] = rgba[origen + 2] ?? 0;
      crudo[salida++] = rgba[origen + 3] ?? 255;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(anchoFinal, 0);
  ihdr.writeUInt32BE(altoFinal, 4);
  ihdr[8] = 8; // profundidad de bit
  ihdr[9] = 6; // color RGBA
  ihdr[10] = 0; // compresion deflate
  ihdr[11] = 0; // filtro adaptativo
  ihdr[12] = 0; // sin entrelazado

  return Buffer.concat([
    FIRMA,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(crudo, { level: 6 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
