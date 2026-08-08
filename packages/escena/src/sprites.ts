import type { NombreColor } from "./paleta.js";

/**
 * Catalogo de sprites dibujados a mano, en codigo.
 *
 * PORQUE UN CATALOGO Y NO PIXELES LIBRES: si la IA pudiera pintar pixel a
 * pixel, el resultado seria ruido. Eligiendo de una lista de piezas ya
 * dibujadas, cualquier combinacion se ve como pixel art intencionado. La IA
 * decide QUE hay en la escena y donde; el estilo lo garantiza el catalogo.
 *
 * Mapa de caracteres:
 *   .  transparente
 *   #  color que eligio la IA para ese elemento
 *   S  sombra (fija)
 *   L  luz (fija)
 *   A  acento (fijo)
 */

export const SOMBRA: NombreColor = "abismo";
export const LUZ: NombreColor = "blanco";
export const ACENTO: NombreColor = "amarillo";

export const SPRITES = {
  arbol: [
    "...####...",
    "..######..",
    ".########.",
    "##########",
    "##########",
    ".########.",
    "..######..",
    "....SS....",
    "....SS....",
    "....SS....",
    "...SSSS...",
  ],
  pino: [
    "....#....",
    "...###...",
    "..#####..",
    "...###...",
    "..#####..",
    ".#######.",
    "..#####..",
    ".#######.",
    "#########",
    "....S....",
    "....S....",
  ],
  luna: [
    "..#####..",
    ".#######.",
    "#########",
    "#########",
    "#########",
    ".#######.",
    "..#####..",
  ],
  sol: [
    "..A.A.A..",
    ".#######.",
    "A#######A",
    ".#######.",
    "A#######A",
    ".#######.",
    "..A.A.A..",
  ],
  nube: [
    "...####.......",
    "..######..##..",
    ".############.",
    "##############",
    ".############.",
  ],
  casa: [
    "......#......",
    ".....###.....",
    "....#####....",
    "...#######...",
    "..#########..",
    ".###########.",
    ".##SSSSSSS##.",
    ".##S#####S##.",
    ".##S#AAA#S##.",
    ".##S#AAA#S##.",
  ],
  puerta: [
    ".#######.",
    "#########",
    "#SSSSSSS#",
    "#S#####S#",
    "#S#####S#",
    "#S#####S#",
    "#S###L#S#",
    "#S#####S#",
    "#SSSSSSS#",
    "#########",
  ],
  figura: [
    "..###..",
    "..###..",
    "...#...",
    ".#####.",
    "#..#..#",
    "...#...",
    "...#...",
    "..#.#..",
    ".#...#.",
  ],
  zorro: [
    ".#........#.",
    "##........##",
    "############",
    "#L##....##L#",
    "############",
    ".##########.",
    "..########..",
    "...######...",
    "....####....",
  ],
  roca: [
    "...####...",
    "..######..",
    ".########.",
    "##########",
    "##########",
    "SSSSSSSSSS",
  ],
  portal: [
    "...#####...",
    "..#LLLLL#..",
    ".#LL###LL#.",
    "#LL#####LL#",
    "#L#######L#",
    "#LL#####LL#",
    ".#LL###LL#.",
    "..#LLLLL#..",
    "...#####...",
  ],
  antorcha: ["..A..", ".AAA.", "AAAAA", ".AAA.", "..#..", "..#..", "..#.."],
  torre: [
    "...###...",
    "..#####..",
    "..#####..",
    "..#SSS#..",
    "..#SLS#..",
    "..#SSS#..",
    ".#######.",
    "#########",
    "#S#####S#",
    "#S#####S#",
    "#S##L##S#",
    "#S#####S#",
  ],
  cristal: ["...#...", "..###..", ".#L#L#.", "#L###L#", ".#L#L#.", "..###..", "...#..."],
  ola: ["..##....##......", ".####..####..##.", "################", "SSSSSSSSSSSSSSSS"],
  cofre: [
    "..#######..",
    ".#########.",
    "#####A#####",
    "###########",
    "#SSSSSSSSS#",
    "#S###A###S#",
    "#SSSSSSSSS#",
    "###########",
  ],
} as const satisfies Record<string, readonly string[]>;

export type NombreSprite = keyof typeof SPRITES;

export const NOMBRES_SPRITE = Object.keys(SPRITES) as NombreSprite[];

/** Cae a una pieza neutra si la IA inventa un sprite que no existe. */
export function spriteValido(nombre: string | undefined): NombreSprite {
  return nombre !== undefined && nombre in SPRITES ? (nombre as NombreSprite) : "roca";
}
