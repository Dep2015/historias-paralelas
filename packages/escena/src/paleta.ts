/**
 * Paleta fija de 16 colores, al estilo de una consola de 16 bits.
 *
 * PORQUE ES FIJA Y CERRADA: la IA elige colores POR NOMBRE, no por hex. Asi
 * ninguna escena puede salirse de la identidad visual del juego por mucho que
 * el modelo se ponga creativo, y el prompt no tiene que explicar teoria del
 * color. Ademas el render y el video comparten exactamente los mismos valores.
 */

export const PALETA = {
  noche: "#0b0d1a",
  abismo: "#161a2e",
  morado: "#2b1f5c",
  violeta: "#5b3fa8",
  cian: "#00ffcc",
  turquesa: "#00a88a",
  magenta: "#ff00aa",
  rosa: "#ff77c8",
  amarillo: "#ffd400",
  ambar: "#ff9500",
  blanco: "#e8e6ff",
  gris: "#8a88a8",
  verde: "#3ddc84",
  bosque: "#1c7a4a",
  rojo: "#ff4444",
  tierra: "#6b4a2f",
} as const;

export type NombreColor = keyof typeof PALETA;

export const NOMBRES_COLOR = Object.keys(PALETA) as NombreColor[];

/** RGB pre-decodificado: el render no puede permitirse parsear hex por pixel. */
export const RGB: Record<NombreColor, readonly [number, number, number]> =
  Object.fromEntries(
    NOMBRES_COLOR.map((nombre) => {
      const hex = PALETA[nombre];
      return [
        nombre,
        [
          Number.parseInt(hex.slice(1, 3), 16),
          Number.parseInt(hex.slice(3, 5), 16),
          Number.parseInt(hex.slice(5, 7), 16),
        ] as const,
      ];
    }),
  ) as Record<NombreColor, readonly [number, number, number]>;

/** Cae a un color seguro si la IA inventa un nombre que no existe. */
export function colorValido(nombre: string | undefined): NombreColor {
  return nombre !== undefined && nombre in PALETA ? (nombre as NombreColor) : "blanco";
}
