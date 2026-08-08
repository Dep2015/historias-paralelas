/**
 * Motor de escenas de historia-paralela.
 *
 * Lo comparten el navegador (animacion en vivo) y el backend (frames del
 * video). Es la unica forma de garantizar que el mp4 exportado se parezca a lo
 * que la gente vio mientras jugaba.
 */

export { PALETA, NOMBRES_COLOR, RGB, colorValido, type NombreColor } from "./paleta.js";
export { SPRITES, NOMBRES_SPRITE, spriteValido, type NombreSprite } from "./sprites.js";
export {
  ANCHO,
  ALTO,
  ESCENA_POR_DEFECTO,
  type Animacion,
  type Elemento,
  type EscenaSpec,
  type Fondo,
  type TipoAnimacion,
} from "./spec.js";
export { crearLienzo, renderizarEscena, calcularDesfase, type Desfase } from "./render.js";
export { sanearEscena } from "./sanear.js";
export {
  sanearSvg,
  incrustarAnimacionesSvg,
  aplicarFotogramaSvg,
  CSS_ANIMACIONES_VECTOR,
} from "./vector.js";
