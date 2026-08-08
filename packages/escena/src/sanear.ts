import { colorValido } from "./paleta.js";
import { spriteValido } from "./sprites.js";
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
    case "sprite":
      return {
        ...base,
        forma: "sprite",
        nombre: spriteValido(typeof o.nombre === "string" ? o.nombre : undefined),
        x: coordX(o.x, ANCHO / 2),
        y: coordY(o.y, ALTO * 0.8),
        escala: Math.round(acotar(num(o.escala, 2), 1, MAX_ESCALA)),
        espejo: o.espejo === true,
      };
    default:
      return null;
  }
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
