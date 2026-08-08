import type { NombreColor } from "./paleta.js";
import type { NombreSprite } from "./sprites.js";

/**
 * Formato de escena que devuelve la IA directora.
 *
 * NO es una imagen: es la DESCRIPCION EN DATOS de un dibujo, que se rasteriza
 * por codigo. Eso permite tres cosas que un PNG generado no da: animacion,
 * coste cero por turno (el modelo solo escribe texto) y pixel art de verdad
 * sobre una rejilla, en lugar de una foto reducida.
 *
 * El mismo spec lo pinta el navegador (en vivo) y el backend (para el video),
 * asi que lo que se exporta es identico a lo que la gente vio jugando.
 */

/** Rejilla logica. Todo se expresa en celdas, nunca en pixeles de pantalla. */
export const ANCHO = 160;
export const ALTO = 90;

export type TipoAnimacion = "flotar" | "deslizar" | "parpadeo" | "pulso" | "ondular";

export interface Animacion {
  tipo: TipoAnimacion;
  /** Celdas de recorrido (flotar/deslizar/ondular) o intensidad 0..1 (parpadeo/pulso). */
  amplitud?: number;
  periodoMs?: number;
  /** Desfase 0..1: dos elementos iguales no se mueven al unisono. */
  fase?: number;
}

interface Comun {
  color: NombreColor;
  anim?: Animacion;
}

export interface FormaRect extends Comun {
  forma: "rect";
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FormaElipse extends Comun {
  forma: "elipse";
  x: number;
  y: number;
  rx: number;
  ry: number;
}

export interface FormaLinea extends Comun {
  forma: "linea";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  grosor?: number;
}

/** Silueta de horizonte: cordillera, colinas o dientes de sierra. */
export interface FormaTerreno extends Comun {
  forma: "terreno";
  /** Altura de la linea base, medida desde arriba. */
  y: number;
  altura: number;
  /** 0 = liso, 1 = muy escarpado. */
  aspereza?: number;
}

export interface FormaSprite extends Comun {
  forma: "sprite";
  nombre: NombreSprite;
  x: number;
  y: number;
  /** Multiplicador entero de tamano (1..6). */
  escala?: number;
  espejo?: boolean;
}

/**
 * Ultimo recurso: un dibujo pixel a pixel definido por la IA para algo que no
 * existe en el catalogo (un robot, una sirena, un carruaje...).
 *
 * Usa la MISMA gramatica que los sprites del catalogo: filas de caracteres y
 * una leyenda de colores con nombres de la paleta fija. Eso es lo que evita
 * que degenere en ruido: la rejilla obliga a pensar en pixeles, la paleta
 * cerrada obliga a la identidad visual del juego, y el saneador acota el
 * tamano. "." es transparente; los demas caracteres los define la leyenda.
 */
export interface FormaDibujo extends Comun {
  forma: "dibujo";
  filas: string[];
  /** Leyenda caracter -> nombre de color de la paleta. "#" usa "color". */
  leyenda: Record<string, NombreColor>;
  x: number;
  y: number;
  escala?: number;
  espejo?: boolean;
}

export type Elemento =
  | FormaRect
  | FormaElipse
  | FormaLinea
  | FormaTerreno
  | FormaSprite
  | FormaDibujo;

export interface Fondo {
  tipo: "liso" | "degradado" | "estrellado";
  color: NombreColor;
  /** Solo en degradado: color de la parte baja. */
  color2?: NombreColor;
  /** Solo en estrellado: 0..1. */
  densidadEstrellas?: number;
}

export interface EscenaSpec {
  fondo: Fondo;
  /** Se pintan en orden: la primera capa queda al fondo. */
  capas: Elemento[];
  /** Fija el ruido (estrellas, terreno) para que cliente y servidor coincidan. */
  semilla?: number;
}

/** Escena de emergencia cuando la IA no devuelve nada usable. */
export const ESCENA_POR_DEFECTO: EscenaSpec = {
  fondo: { tipo: "estrellado", color: "noche", densidadEstrellas: 0.35 },
  semilla: 7,
  capas: [
    { forma: "terreno", y: 62, altura: 16, aspereza: 0.6, color: "morado" },
    { forma: "terreno", y: 74, altura: 10, aspereza: 0.3, color: "abismo" },
    {
      forma: "sprite",
      nombre: "portal",
      x: 80,
      y: 40,
      escala: 3,
      color: "cian",
      anim: { tipo: "pulso", amplitud: 0.2, periodoMs: 2600 },
    },
  ],
};
