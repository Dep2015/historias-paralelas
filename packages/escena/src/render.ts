import { RGB, colorValido, type NombreColor } from "./paleta.js";
import { ACENTO, LUZ, SOMBRA, SPRITES, spriteValido } from "./sprites.js";
import {
  ALTO,
  ANCHO,
  type Animacion,
  type Elemento,
  type EscenaSpec,
} from "./spec.js";

/**
 * Rasterizador de escenas. Puro y determinista: para un mismo spec y un mismo
 * instante devuelve exactamente los mismos pixeles, aqui y en cualquier lado.
 *
 * De eso depende que el video exportado se parezca a lo que la gente vio: el
 * navegador y el backend llaman a esta misma funcion. Por eso no hay Canvas,
 * ni DOM, ni nada de Node aqui dentro; solo aritmetica sobre un buffer RGBA.
 */

const CANALES = 4;

export function crearLienzo(): Uint8ClampedArray {
  return new Uint8ClampedArray(ANCHO * ALTO * CANALES);
}

// --- Ruido determinista -----------------------------------------------------

/**
 * Hash entero -> [0,1). Se usa en lugar de un PRNG secuencial a proposito: el
 * valor de cada columna depende solo de su indice y de la semilla, nunca del
 * orden en que se dibujen las capas. Sin esto, anadir un elemento cambiaria
 * la forma de las montanas.
 */
function hash(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function ruido(x: number, semilla: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const a = hash(i + semilla * 131);
  const b = hash(i + 1 + semilla * 131);
  const suave = f * f * (3 - 2 * f);
  return a + (b - a) * suave;
}

/** Varias octavas: da crestas grandes con detalle fino encima. */
function ruidoMulti(x: number, semilla: number): number {
  return (
    ruido(x / 24, semilla) * 0.6 +
    ruido(x / 9, semilla + 17) * 0.3 +
    ruido(x / 4, semilla + 41) * 0.1
  );
}

// --- Pintado basico ---------------------------------------------------------

function pintar(lienzo: Uint8ClampedArray, x: number, y: number, color: NombreColor): void {
  if (x < 0 || y < 0 || x >= ANCHO || y >= ALTO) return;
  const rgb = RGB[color];
  const i = (y * ANCHO + x) * CANALES;
  lienzo[i] = rgb[0];
  lienzo[i + 1] = rgb[1];
  lienzo[i + 2] = rgb[2];
  lienzo[i + 3] = 255;
}

function rectangulo(
  lienzo: Uint8ClampedArray,
  x: number,
  y: number,
  w: number,
  h: number,
  color: NombreColor,
): void {
  const x0 = Math.round(x);
  const y0 = Math.round(y);
  for (let dy = 0; dy < Math.round(h); dy++) {
    for (let dx = 0; dx < Math.round(w); dx++) {
      pintar(lienzo, x0 + dx, y0 + dy, color);
    }
  }
}

function elipse(
  lienzo: Uint8ClampedArray,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: NombreColor,
): void {
  if (rx <= 0 || ry <= 0) return;
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      if (nx * nx + ny * ny <= 1) pintar(lienzo, x, y, color);
    }
  }
}

function linea(
  lienzo: Uint8ClampedArray,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  grosor: number,
  color: NombreColor,
): void {
  // Bresenham: el trazo tiene que quedar en la rejilla, sin antialias, o deja
  // de parecer pixel art.
  let x = Math.round(x1);
  let y = Math.round(y1);
  const xf = Math.round(x2);
  const yf = Math.round(y2);
  const dx = Math.abs(xf - x);
  const dy = -Math.abs(yf - y);
  const sx = x < xf ? 1 : -1;
  const sy = y < yf ? 1 : -1;
  let error = dx + dy;
  const radio = Math.max(1, Math.round(grosor));

  for (let guarda = 0; guarda < ANCHO * ALTO; guarda++) {
    if (radio === 1) {
      pintar(lienzo, x, y, color);
    } else {
      rectangulo(lienzo, x - (radio >> 1), y - (radio >> 1), radio, radio, color);
    }
    if (x === xf && y === yf) break;
    const e2 = 2 * error;
    if (e2 >= dy) {
      error += dy;
      x += sx;
    }
    if (e2 <= dx) {
      error += dx;
      y += sy;
    }
  }
}

// --- Animacion --------------------------------------------------------------

interface Desfase {
  dx: number;
  dy: number;
  escala: number;
  visible: boolean;
  onda: number;
}

const SIN_DESFASE: Desfase = { dx: 0, dy: 0, escala: 1, visible: true, onda: 0 };

function calcularDesfase(anim: Animacion | undefined, tMs: number): Desfase {
  if (!anim) return SIN_DESFASE;

  const periodo = anim.periodoMs && anim.periodoMs > 0 ? anim.periodoMs : 2000;
  const amplitud = anim.amplitud ?? 2;
  const fase = anim.fase ?? 0;
  const ciclo = tMs / periodo + fase;
  const onda = Math.sin(ciclo * Math.PI * 2);

  switch (anim.tipo) {
    case "flotar":
      return { ...SIN_DESFASE, dy: onda * amplitud };
    case "deslizar":
      return { ...SIN_DESFASE, dx: onda * amplitud };
    case "pulso":
      return { ...SIN_DESFASE, escala: 1 + onda * Math.min(0.9, amplitud) };
    case "parpadeo": {
      // "amplitud" aqui es la fraccion del ciclo que el elemento pasa apagado.
      const apagado = Math.min(0.9, Math.max(0, amplitud));
      const frac = ciclo - Math.floor(ciclo);
      return { ...SIN_DESFASE, visible: frac > apagado };
    }
    case "ondular":
      return { ...SIN_DESFASE, onda: amplitud };
    default:
      return SIN_DESFASE;
  }
}

// --- Elementos --------------------------------------------------------------

function dibujarTerreno(
  lienzo: Uint8ClampedArray,
  y: number,
  altura: number,
  aspereza: number,
  semilla: number,
  color: NombreColor,
  desfase: Desfase,
  tMs: number,
): void {
  const amplitudOnda = desfase.onda;

  for (let x = 0; x < ANCHO; x++) {
    const relieve = ruidoMulti(x + desfase.dx, semilla);
    // La onda mueve la silueta como si respirara: util para agua o niebla.
    const balanceo =
      amplitudOnda === 0
        ? 0
        : Math.sin((x / 12 + tMs / 900) * Math.PI * 2) * amplitudOnda;

    const cima = Math.round(y + desfase.dy + balanceo - relieve * altura * aspereza);
    for (let py = Math.max(0, cima); py < ALTO; py++) {
      pintar(lienzo, x, py, color);
    }
  }
}

function dibujarSprite(
  lienzo: Uint8ClampedArray,
  nombre: string,
  x: number,
  y: number,
  escala: number,
  espejo: boolean,
  color: NombreColor,
  desfase: Desfase,
): void {
  const filas = SPRITES[spriteValido(nombre)];
  const alto = filas.length;
  const primera = filas[0];
  if (!primera) return;
  const ancho = primera.length;

  const factor = Math.max(1, Math.round(escala * desfase.escala));
  // Anclaje: centro horizontal y BASE vertical. Es lo que hace que un arbol o
  // una casa se "apoyen" en el punto que indica la IA sin tener que calcular
  // su altura.
  const x0 = Math.round(x + desfase.dx - (ancho * factor) / 2);
  const y0 = Math.round(y + desfase.dy - alto * factor);

  for (let fy = 0; fy < alto; fy++) {
    const fila = filas[fy];
    if (!fila) continue;
    for (let fx = 0; fx < ancho; fx++) {
      const columna = espejo ? ancho - 1 - fx : fx;
      const simbolo = fila[columna];
      if (!simbolo || simbolo === ".") continue;

      const colorPixel: NombreColor =
        simbolo === "S" ? SOMBRA : simbolo === "L" ? LUZ : simbolo === "A" ? ACENTO : color;

      rectangulo(
        lienzo,
        x0 + fx * factor,
        y0 + fy * factor,
        factor,
        factor,
        colorPixel,
      );
    }
  }
}

function dibujarFondo(lienzo: Uint8ClampedArray, spec: EscenaSpec, tMs: number): void {
  const fondo = spec.fondo;
  const semilla = spec.semilla ?? 1;
  const base = colorValido(fondo.color);

  if (fondo.tipo === "degradado") {
    const segundo = colorValido(fondo.color2 ?? fondo.color);
    const a = RGB[base];
    const b = RGB[segundo];
    for (let y = 0; y < ALTO; y++) {
      const t = y / (ALTO - 1);
      // Bandas de 3px: un degradado continuo delataria que no es pixel art.
      const paso = Math.round((t * 12) / 1) / 12;
      const r = a[0] + (b[0] - a[0]) * paso;
      const g = a[1] + (b[1] - a[1]) * paso;
      const az = a[2] + (b[2] - a[2]) * paso;
      for (let x = 0; x < ANCHO; x++) {
        const i = (y * ANCHO + x) * CANALES;
        lienzo[i] = r;
        lienzo[i + 1] = g;
        lienzo[i + 2] = az;
        lienzo[i + 3] = 255;
      }
    }
    return;
  }

  rectangulo(lienzo, 0, 0, ANCHO, ALTO, base);

  if (fondo.tipo === "estrellado") {
    const densidad = Math.min(1, Math.max(0, fondo.densidadEstrellas ?? 0.3));
    const cantidad = Math.round(densidad * 220);
    for (let n = 0; n < cantidad; n++) {
      const ex = Math.floor(hash(n * 2 + semilla * 977) * ANCHO);
      const ey = Math.floor(hash(n * 2 + 1 + semilla * 977) * ALTO * 0.7);
      // Titileo: cada estrella con su propia fase, si no parpadearian todas a la vez.
      const faseEstrella = hash(n + semilla * 31);
      const brillo = Math.sin((tMs / 1400 + faseEstrella) * Math.PI * 2);
      pintar(lienzo, ex, ey, brillo > 0.4 ? "blanco" : "gris");
    }
  }
}

// --- Punto de entrada -------------------------------------------------------

export function renderizarEscena(
  spec: EscenaSpec,
  tMs: number,
  lienzo: Uint8ClampedArray,
): void {
  dibujarFondo(lienzo, spec, tMs);

  const semilla = spec.semilla ?? 1;
  const capas: Elemento[] = Array.isArray(spec.capas) ? spec.capas : [];

  for (const capa of capas) {
    const desfase = calcularDesfase(capa.anim, tMs);
    if (!desfase.visible) continue;
    const color = colorValido(capa.color);

    switch (capa.forma) {
      case "rect":
        rectangulo(lienzo, capa.x + desfase.dx, capa.y + desfase.dy, capa.w, capa.h, color);
        break;
      case "elipse":
        elipse(
          lienzo,
          capa.x + desfase.dx,
          capa.y + desfase.dy,
          capa.rx * desfase.escala,
          capa.ry * desfase.escala,
          color,
        );
        break;
      case "linea":
        linea(
          lienzo,
          capa.x1 + desfase.dx,
          capa.y1 + desfase.dy,
          capa.x2 + desfase.dx,
          capa.y2 + desfase.dy,
          capa.grosor ?? 1,
          color,
        );
        break;
      case "terreno":
        dibujarTerreno(
          lienzo,
          capa.y,
          capa.altura,
          capa.aspereza ?? 0.5,
          semilla,
          color,
          desfase,
          tMs,
        );
        break;
      case "sprite":
        dibujarSprite(
          lienzo,
          capa.nombre,
          capa.x,
          capa.y,
          capa.escala ?? 1,
          capa.espejo ?? false,
          color,
          desfase,
        );
        break;
      default:
        break;
    }
  }
}
