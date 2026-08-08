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
 *   otros: cada sprite puede declarar su propia mini-paleta en "colores"
 *   (caracter -> nombre de color). Es lo que permite sprites multicolor al
 *   estilo GBA en vez de siluetas planas de un solo tono.
 */

export const SOMBRA: NombreColor = "abismo";
export const LUZ: NombreColor = "blanco";
export const ACENTO: NombreColor = "amarillo";

/**
 * Un sprite: sus filas de caracteres y, opcionalmente, la mini-paleta fija
 * de ese dibujo. "#" sigue siendo el color que elige la IA (permite tenir el
 * elemento segun la escena) y S/L/A conservan su significado global.
 */
export interface SpriteDef {
  filas: readonly string[];
  colores?: Readonly<Partial<Record<string, NombreColor>>>;
}

export const SPRITES = {
  arbol: {
    filas: [
      "...L##L##S...",
      "..##v#####S..",
      ".L#vvv#####S.",
      "###vvv######S",
      "L#######SS##S",
      "S######SSSS#S",
      ".S#####SSSSS.",
      "..S#####SSS..",
      "...SSttSSS...",
      ".....ttS.....",
      ".....ttS.....",
      "....SttSS....",
    ],
    colores: { t: "tierra", v: "verde" },
  },
  pino: {
    filas: [
      "...LS...",
      "..L##S..",
      ".S####S.",
      "..###S..",
      ".L####S.",
      "SS####SS",
      "..###S..",
      ".L####S.",
      "SSSSSSSS",
      "...tS...",
      "...tS...",
      "...tS...",
    ],
    colores: { t: "tierra" },
  },
  luna: {
    filas: [
      "....S....",
      "..LL##S..",
      ".LL###SS.",
      "##LL##SSS",
      "######SSS",
      "S#####SSS",
      ".S####SS.",
      "..SS#SS..",
      "....S....",
    ],
  },
  sol: {
    filas: [
      ".....A.....",
      ".A.......A.",
      "....LLS....",
      "...LL##S...",
      "..#LL###S..",
      "A.######S.A",
      "..S###SSS..",
      "...S##SS...",
      "....SSS....",
      ".A.......A.",
      ".....A.....",
    ],
  },
  nube: {
    filas: [
      "......L##S.....",
      "....LLLL##LS...",
      ".LL#LLLLL###LS.",
      "##############S",
      "S#############S",
      ".SSSSSSSSSSSSSS",
    ],
  },
  casa: {
    filas: [
      "........#S........",
      "...mS..L#SS.......",
      "...mS.####SS......",
      "...mS######SLS....",
      "...mS#######SSS...",
      "SSSmmSSSSSSSSSSSSS",
      "..LmmmmmmmmmmmSS..",
      "..LmmmmmmmmmmmSS..",
      "..LmLAmmmmmLAmSS..",
      "..LmAAmSSSmAAmSS..",
      "..LmmmmSSSmmmmSS..",
      "..LmmmmSSAmmmmSS..",
      "..LmmmmSSSmmmmSS..",
      "..SSSSSSSSSSSSSS..",
    ],
    colores: { m: "gris" },
  },
  puerta: {
    filas: [
      "S...#...S",
      "S.#####.S",
      "S#######S",
      "S#StStS#S",
      "S#tStSt#S",
      "S#StStS#S",
      "S#tStSt#S",
      "S#StSAS#S",
      "S#tStSt#S",
      "S#StStS#S",
      "S#tStSt#S",
      "SSSSSSSSS",
    ],
    colores: { t: "tierra" },
  },
  figura: {
    filas: [
      "...SSSSS..",
      "...SSSSS..",
      "...pSpSp..",
      "....ppp...",
      "...####S..",
      "...####S..",
      "..#####S..",
      "#L######LS",
      "#########S",
      "L########S",
      "L########S",
      "ppAAAAAAAp",
      ".#######S.",
      ".#######S.",
      ".SSSSSSSS.",
      "..SSS.SSS.",
    ],
    colores: { p: "rosa" },
  },
  /**
   * Protagonista mas usado: de perfil, mirando a la izquierda (hocico y
   * orejas a la izquierda, cola esponjosa curvada a la derecha).
   */
  zorro: {
    filas: [
      "S..S............ww",
      "SS##S........#L#ww",
      ".L###L##L#S.L####S",
      "#S###############S",
      "S################S",
      ".SS##wwwww#######S",
      "...wwwwwwww######S",
      "....wwwwwwwSSS#SS.",
      "...SS.SSSSSSS.S...",
      "...SS..SS..SS.....",
    ],
    colores: { w: "blanco" },
  },
  roca: {
    filas: [
      "...LL#LL#S...",
      "..L###L###S..",
      ".####S#LL##S.",
      "S####S######S",
      ".S##S######S.",
      "..SSSSSSSSS..",
      "SSSSSSSSSSSSS",
    ],
  },
  portal: {
    filas: [
      "...LLSLSLL...",
      "..LL#####LL..",
      ".LL##LLL##LL.",
      ".L##L###L##L.",
      ".S#L##L##L#S.",
      "L##L#LLL#L##L",
      ".S#L##L##L#S.",
      ".L##L###L##L.",
      ".LL##LLL##LL.",
      "..LL#####LL..",
      "...LLSLSLL...",
    ],
  },
  antorcha: {
    filas: [
      "..LL..",
      "..AS..",
      ".LAAS.",
      ".AAAAS",
      "SSAAAS",
      ".SSSSS",
      "..L#S.",
      "..##S.",
      "..##S.",
      "..L#S.",
      "..SSS.",
      ".SSSSS",
    ],
  },
  torre: {
    filas: [
      ".....LS....",
      "mm.mm##m.mm",
      "mm.mmmmm.mm",
      ".mmmmmmmmm.",
      "..L#####S..",
      "..######S..",
      "..###A##S..",
      "..L##A##S..",
      "..###A##S..",
      "..######S..",
      "..L#####S..",
      "..L#####S..",
      "LL########S",
      "##########S",
      "##########S",
      "L#########S",
      "##########S",
      "####SSS###S",
      "SSSSSSSSSSS",
      "SSSSSSSSSSS",
    ],
    colores: { m: "gris" },
  },
  cristal: {
    filas: [
      "...S..",
      "..LS..",
      ".L#SS.",
      ".L#LS.",
      "###L#S",
      "SA#S#A",
      ".L#SS.",
      ".S#SS.",
      "..#S..",
      "..SS..",
      "...S..",
      "...S..",
    ],
  },
  ola: {
    filas: [
      "............LLLLLLL.",
      "LL.......LLLww##ww#L",
      "wwLLLLLLLw##########",
      "####ww##w###########",
      "SSSSSSSSSSSSSSSSSSSS",
    ],
    colores: { w: "blanco" },
  },
  cofre: {
    filas: [
      "......S......",
      "..##L##L##S..",
      ".L#S###S###S.",
      "#####AAA####S",
      "L##S#AAA###SS",
      "#####ASS####S",
      "###S###S###SS",
      "SSSSSSSSSSSSS",
      "SSSSSSSSSSSSS",
    ],
  },
  /**
   * Ejemplar del formato multicolor (estilo GBA): "#" lo tine la IA (cuerpo),
   * y la mini-paleta fija pone vientre claro, chorro y ojo. Nacio de un bug
   * real: alguien pidio una ballena, no existia, y el fallback la convirtio
   * en una roca diminuta color cian.
   */
  ballena: {
    filas: [
      "...........LL...............",
      "..........LL................",
      "..........LL................",
      ".....##########.............",
      "...##############......SS...",
      "..#################...SSS...",
      ".###################.SSS....",
      ".#####S###############S.....",
      ".#####################......",
      ".wwwwwwwww############......",
      "..wwwwwwwwww#########.......",
      "...wwwwwwww#########........",
      ".....wwwww#######...........",
    ],
    colores: { w: "gris" },
  },
  ave: {
    filas: [
      "....S..........",
      ".....S#S.......",
      "......L#S.##S..",
      "LS...#######SAA",
      "#SS.L######SS..",
      "S...S#wwwwS....",
      ".....Swwww.....",
    ],
    colores: { w: "blanco" },
  },
  /** El sprite espectacular del catalogo: alas desplegadas, cuernos, cola con pincho. */
  dragon: {
    filas: [
      "................S.S..",
      "................SS...",
      ".............S.SS....",
      "...S#SS.....S.SSS....",
      ".S.L##SSSL#SSSSS.....",
      "L######S##SSS..S.....",
      "S#A#####S#S###S......",
      ".SS######S#####LLS...",
      "...SS###############S",
      ".....###wwwww#####SSS",
      ".....SwwwwwwwwwSSS...",
      "......SSwwwwSSw......",
      "......SS....SS.......",
      "......SS....SS.......",
    ],
    colores: { w: "gris" },
  },
  barco: {
    filas: [
      ".........AA........",
      ".........t#S.......",
      "........Lt##S......",
      "......L##t###S.....",
      ".....####t####S....",
      "....S####t#####S...",
      ".....SSSStSSSSSSS..",
      ".........t.........",
      "tLttLtttLttLttLtttS",
      "StttttttttttttttttS",
      ".ttttttttttttttttS.",
      ".SttttttttttttttS..",
      "..SSSSSSSSSSSSSS...",
    ],
    colores: { t: "tierra" },
  },
  montana: {
    filas: [
      "..................LS........",
      ".................wwwS.......",
      ".......LS........LwwS.......",
      "......wwwS......SwwwwS......",
      "......LwwwS......####S......",
      "......L###S.....L####S......",
      "...#L#####S.....######S.....",
      "..L########S...L######S.....",
      "..L#########S..########S....",
      ".L##########S..########S....",
      "SSSSSSSSSSSSSSSSSSSSSSSSS...",
      "SSSSSSSSSSSSSSSSSSSSSSSSSSSS",
    ],
    colores: { w: "blanco" },
  },
  estrella: {
    filas: [
      "....A....",
      "....A....",
      "...AAA...",
      "..ALALA..",
      "AAAALAAAA",
      "..ALALA..",
      "...AAA...",
      "....A....",
      "....A....",
    ],
  },
  puente: {
    filas: [
      "SLSSLSSLSSLSSLSSLSSLSSLSS",
      "#LL#LL##L##LL#LL##L##LL#S",
      "SS######S#############SSS",
      "..#####S.############S...",
      "..##SSSS.#########SSSS...",
      "..LS...S.L#SSSS##S...S...",
      "..S......LS....SS........",
      "..S......S......S........",
      ".........S...............",
    ],
  },
} as const satisfies Record<string, SpriteDef>;

export type NombreSprite = keyof typeof SPRITES;

export const NOMBRES_SPRITE = Object.keys(SPRITES) as NombreSprite[];

/**
 * Sinonimos: la IA (y la gente) piden cosas por su nombre natural, no por el
 * identificador del catalogo. Antes de caer al comodin, se intenta mapear al
 * sprite mas parecido. Nacio de un bug real: "ballena" no existia y el
 * fallback la convertia en una roca diminuta — un punto celeste en pantalla.
 */
const SINONIMOS: Readonly<Record<string, NombreSprite>> = {
  delfin: "ballena",
  orca: "ballena",
  pez: "ballena",
  tiburon: "ballena",
  pajaro: "ave",
  aguila: "ave",
  halcon: "ave",
  gaviota: "ave",
  cuervo: "ave",
  lobo: "zorro",
  perro: "zorro",
  gato: "zorro",
  animal: "zorro",
  persona: "figura",
  heroe: "figura",
  nino: "figura",
  nina: "figura",
  viajero: "figura",
  hoguera: "antorcha",
  fuego: "antorcha",
  llama: "antorcha",
  castillo: "torre",
  faro: "torre",
  cabana: "casa",
  refugio: "casa",
  piedra: "roca",
  gema: "cristal",
  diamante: "cristal",
  joya: "cristal",
  mar: "ola",
  agua: "ola",
  rio: "ola",
  tesoro: "cofre",
  caja: "cofre",
  arco: "puerta",
  entrada: "puerta",
  serpiente: "dragon",
  gigante: "dragon",
  monstruo: "dragon",
  bestia: "dragon",
  barca: "barco",
  bote: "barco",
  velero: "barco",
  nave: "barco",
  colina: "montana",
  cordillera: "montana",
  cerro: "montana",
  volcan: "montana",
  lucero: "estrella",
  chispa: "estrella",
  destello: "estrella",
  arcoiris: "puente",
  viaducto: "puente",
};

/** Cae al sinonimo mas cercano, y solo despues a una pieza neutra. */
export function spriteValido(nombre: string | undefined): NombreSprite {
  if (nombre === undefined) return "roca";
  if (nombre in SPRITES) return nombre as NombreSprite;

  // Normaliza tildes y mayusculas: "Ballena" o "pájaro" tambien deben caer
  // en su sprite, no en el comodin.
  const llano = nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  if (llano in SPRITES) return llano as NombreSprite;

  const sinonimo = SINONIMOS[llano];
  if (sinonimo) return sinonimo;

  return "roca";
}
