import { colorValido, type NombreColor } from "./paleta.js";
import { SPRITES, spriteValido, type SpriteDef } from "./sprites.js";
import {
  ALTO,
  ANCHO,
  ESCENA_POR_DEFECTO,
  type Animacion,
  type Elemento,
  type EscenaSpec,
  type TipoAnimacion,
} from "./spec.js";

/**
 * Convierte el JSON que devuelve la IA en un spec seguro de renderizar.
 *
 * PORQUE NO BASTA CON VALIDAR Y RECHAZAR: si tiramos la escena entera cada vez
 * que el modelo se equivoca en un numero, el jugador se queda sin imagen. Aqui
 * se corrige lo corregible (recortar coordenadas, sustituir nombres inventados)
 * y solo se cae a la escena por defecto cuando no hay nada aprovechable.
 *
 * Ademas acota el coste: un spec con 5000 capas o un sprite a escala 900
 * bloquearia el hilo de render tanto en el navegador como en el servidor.
 */

const MAX_CAPAS = 24;
const MARGEN = 60;
const MAX_ESCALA = 6;

function num(valor: unknown, porDefecto: number): number {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : porDefecto;
}

function acotar(valor: number, minimo: number, maximo: number): number {
  return Math.min(maximo, Math.max(minimo, valor));
}

const coordX = (v: unknown, d = 0): number => acotar(num(v, d), -MARGEN, ANCHO + MARGEN);
const coordY = (v: unknown, d = 0): number => acotar(num(v, d), -MARGEN, ALTO + MARGEN);
const tamano = (v: unknown, d = 1): number => acotar(num(v, d), 0, Math.max(ANCHO, ALTO) * 2);

const TIPOS_ANIM: readonly TipoAnimacion[] = [
  "flotar",
  "deslizar",
  "parpadeo",
  "pulso",
  "ondular",
];

function sanearAnimacion(bruto: unknown): Animacion | undefined {
  if (!bruto || typeof bruto !== "object") return undefined;
  const objeto = bruto as Record<string, unknown>;
  const tipo = TIPOS_ANIM.find((t) => t === objeto.tipo);
  if (!tipo) return undefined;

  return {
    tipo,
    amplitud: acotar(num(objeto.amplitud, 2), 0, 40),
    // Menos de 200ms es un parpadeo epileptico; mas de 20s no se percibe.
    periodoMs: acotar(num(objeto.periodoMs, 2000), 200, 20_000),
    fase: acotar(num(objeto.fase, 0), 0, 1),
  };
}

function sanearElemento(bruto: unknown): Elemento | null {
  if (!bruto || typeof bruto !== "object") return null;
  const o = bruto as Record<string, unknown>;
  const color = colorValido(typeof o.color === "string" ? o.color : undefined);
  const anim = sanearAnimacion(o.anim);
  const base = anim ? { color, anim } : { color };

  switch (o.forma) {
    case "rect":
      return {
        ...base,
        forma: "rect",
        x: coordX(o.x),
        y: coordY(o.y),
        w: tamano(o.w, 10),
        h: tamano(o.h, 10),
      };
    case "elipse":
      return {
        ...base,
        forma: "elipse",
        x: coordX(o.x),
        y: coordY(o.y),
        rx: tamano(o.rx, 6),
        ry: tamano(o.ry, 6),
      };
    case "linea":
      return {
        ...base,
        forma: "linea",
        x1: coordX(o.x1),
        y1: coordY(o.y1),
        x2: coordX(o.x2, ANCHO),
        y2: coordY(o.y2),
        grosor: acotar(num(o.grosor, 1), 1, 8),
      };
    case "terreno":
      return {
        ...base,
        forma: "terreno",
        y: coordY(o.y, ALTO * 0.7),
        altura: acotar(num(o.altura, 14), 1, ALTO),
        aspereza: acotar(num(o.aspereza, 0.5), 0, 1),
      };
    case "sprite": {
      const nombre = spriteValido(typeof o.nombre === "string" ? o.nombre : undefined);
      return {
        ...base,
        forma: "sprite",
        nombre,
        x: coordX(o.x, ANCHO / 2),
        y: coordY(o.y, ALTO * 0.8),
        escala: escalaAcotada(o.escala, SPRITES[nombre]),
        espejo: o.espejo === true,
      };
    }
    case "dibujo":
      return sanearDibujo(o, base);
    default:
      return null;
  }
}

/** Limites del dibujo libre: mas alla de esto, o es ruido o es un ataque. */
const DIBUJO_MAX_LADO = 24;
const DIBUJO_MIN_PIXELES = 6;

/** Tamano maximo EFECTIVO en pantalla (celdas), no solo escala nominal. */
const MAX_ANCHO_EFECTIVO = 120;
const MAX_ALTO_EFECTIVO = 70;

/**
 * La escala se acota por el tamano real del sprite, no con un tope fijo:
 * escala 5 es razonable para una figura de 10 celdas pero convierte una
 * ballena de 28 en un monstruo de 140 celdas que tapa la pantalla entera
 * (paso con una escena real generada por la IA).
 */
function escalaAcotada(escalaCruda: unknown, def: SpriteDef): number {
  const anchoSprite = def.filas[0]?.length ?? 1;
  const altoSprite = def.filas.length || 1;
  const topePorAncho = Math.floor(MAX_ANCHO_EFECTIVO / anchoSprite);
  const topePorAlto = Math.floor(MAX_ALTO_EFECTIVO / altoSprite);
  const tope = Math.max(1, Math.min(MAX_ESCALA, topePorAncho, topePorAlto));
  return Math.round(acotar(num(escalaCruda, 2), 1, tope));
}

/**
 * Valida un dibujo pixel a pixel hecho por la IA. Se corrige lo corregible
 * (recortar filas largas, descartar colores invalidos de la leyenda) y solo
 * se descarta el elemento si el resultado no dibujaria nada reconocible.
 */
function sanearDibujo(
  o: Record<string, unknown>,
  base: { color: ReturnType<typeof colorValido>; anim?: Animacion },
): Elemento | null {
  if (!Array.isArray(o.filas)) return null;

  const filasCrudas = o.filas
    .filter((fila): fila is string => typeof fila === "string")
    .slice(0, DIBUJO_MAX_LADO)
    .map((fila) => fila.slice(0, DIBUJO_MAX_LADO));

  if (filasCrudas.length === 0) return null;

  // Todas las filas al mismo ancho: el render asume rejilla rectangular.
  const anchoMax = Math.max(...filasCrudas.map((fila) => fila.length));
  if (anchoMax === 0) return null;
  const filas = filasCrudas.map((fila) => fila.padEnd(anchoMax, "."));

  // Leyenda: solo entradas de un caracter con color valido de la paleta.
  const leyenda: Record<string, NombreColor> = {};
  if (o.leyenda && typeof o.leyenda === "object") {
    for (const [caracter, nombre] of Object.entries(o.leyenda as Record<string, unknown>)) {
      if (caracter.length === 1 && caracter !== "." && typeof nombre === "string") {
        leyenda[caracter] = colorValido(nombre);
      }
    }
  }

  // Un dibujo casi vacio (o cuyos caracteres no estan en la leyenda ni son
  // #/S/L/A) no representa nada: mejor descartarlo y que el resto de la
  // escena sobreviva, igual que hace el resto del saneador.
  let pintables = 0;
  for (const fila of filas) {
    for (const caracter of fila) {
      if (caracter === ".") continue;
      if (caracter in leyenda || caracter === "#" || caracter === "S" || caracter === "L" || caracter === "A") {
        pintables++;
      }
    }
  }
  if (pintables < DIBUJO_MIN_PIXELES) return null;

  return {
    ...base,
    forma: "dibujo",
    filas,
    leyenda,
    x: coordX(o.x, ANCHO / 2),
    y: coordY(o.y, ALTO * 0.8),
    // Mismo tope efectivo que los sprites del catalogo: un dibujo libre de
    // 24 celdas a escala 6 tambien taparia la pantalla.
    escala: escalaAcotada(o.escala, { filas }),
    espejo: o.espejo === true,
  };
}

export function sanearEscena(bruto: unknown): EscenaSpec {
  if (!bruto || typeof bruto !== "object") return ESCENA_POR_DEFECTO;
  const o = bruto as Record<string, unknown>;

  const fondoBruto = (o.fondo ?? {}) as Record<string, unknown>;
  const tipoFondo =
    fondoBruto.tipo === "degradado" || fondoBruto.tipo === "estrellado"
      ? fondoBruto.tipo
      : "liso";

  const capasBrutas = Array.isArray(o.capas) ? o.capas.slice(0, MAX_CAPAS) : [];
  const capas = capasBrutas
    .map(sanearElemento)
    .filter((capa): capa is Elemento => capa !== null);

  // Una escena sin nada que dibujar es peor que la de emergencia.
  if (capas.length === 0) return ESCENA_POR_DEFECTO;

  return {
    fondo: {
      tipo: tipoFondo,
      color: colorValido(
        typeof fondoBruto.color === "string" ? fondoBruto.color : undefined,
      ),
      color2: colorValido(
        typeof fondoBruto.color2 === "string" ? fondoBruto.color2 : undefined,
      ),
      densidadEstrellas: acotar(num(fondoBruto.densidadEstrellas, 0.3), 0, 1),
    },
    capas,
    semilla: Math.round(acotar(num(o.semilla, 1), 0, 100_000)),
  };
}
