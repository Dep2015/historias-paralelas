/**
 * Convierte una imagen cualquiera en pixel art de verdad (no un filtro CSS):
 * se reduce la imagen a una grilla chica y se vuelve a escalar sin
 * suavizado, que es lo que produce los bloques nitidos.
 */

export interface OpcionesPixel {
  /** Lado de la grilla intermedia en pixeles reales. Por defecto 64. */
  gridSize?: number;
  /**
   * Niveles de cuantizacion por canal de color (r,g,b). 0 = sin cuantizar
   * (deja el degradado normal). Valores chicos (ej. 4-6) dan el look retro
   * fuerte, tipo paleta limitada de consola vieja.
   */
  paleta?: number;
}

const GRID_SIZE_POR_DEFECTO = 64;
const PALETA_POR_DEFECTO = 0;

export async function pixelarImagen(
  src: string,
  destino: HTMLCanvasElement,
  opciones: OpcionesPixel = {},
): Promise<void> {
  const gridSize = opciones.gridSize ?? GRID_SIZE_POR_DEFECTO;
  const paleta = opciones.paleta ?? PALETA_POR_DEFECTO;

  const imagen = await cargarImagen(src);

  // Canvas intermedio diminuto: aca ocurre la perdida de detalle real. Si
  // dibujaramos directo al canvas destino (que puede ser grande) y despues
  // "pixelaramos" ahi mismo, seguiria habiendo detalle de mas.
  const chico = document.createElement("canvas");
  chico.width = gridSize;
  chico.height = gridSize;
  const ctxChico = chico.getContext("2d");
  if (!ctxChico) {
    throw new Error("No se pudo crear el contexto 2d del canvas intermedio.");
  }
  ctxChico.drawImage(imagen, 0, 0, gridSize, gridSize);

  if (paleta > 0) {
    cuantizarColores(ctxChico, gridSize, gridSize, paleta);
  }

  // Si el canvas destino todavia no tiene tamano propio (ej. recien
  // montado sin CSS que lo dimensione), lo dejamos cuadrado del gridSize;
  // si ya tiene tamano (fijado por el componente que lo dibuja) lo
  // respetamos y solo escalamos hacia el.
  const anchoDestino = destino.width || gridSize;
  const altoDestino = destino.height || gridSize;
  destino.width = anchoDestino;
  destino.height = altoDestino;

  const ctxDestino = destino.getContext("2d");
  if (!ctxDestino) {
    throw new Error("No se pudo crear el contexto 2d del canvas destino.");
  }

  // Nearest-neighbor en vez de la interpolacion por defecto del navegador:
  // esto es lo unico que realmente produce el borde duro del pixel art.
  ctxDestino.imageSmoothingEnabled = false;
  ctxDestino.clearRect(0, 0, anchoDestino, altoDestino);
  ctxDestino.drawImage(chico, 0, 0, gridSize, gridSize, 0, 0, anchoDestino, altoDestino);
}

function cargarImagen(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const imagen = new Image();
    // Necesario para poder leer getImageData despues sin que el canvas
    // quede "tainted" por CORS (rompe la cuantizacion de paleta).
    imagen.crossOrigin = "anonymous";
    imagen.onload = () => resolve(imagen);
    imagen.onerror = () => reject(new Error(`No se pudo cargar la imagen: ${src}`));
    imagen.src = src;
  });
}

function cuantizarColores(
  ctx: CanvasRenderingContext2D,
  ancho: number,
  alto: number,
  niveles: number,
): void {
  const datos = ctx.getImageData(0, 0, ancho, alto);
  const paso = 255 / (niveles - 1 || 1);

  for (let i = 0; i < datos.data.length; i += 4) {
    // Solo r,g,b (canales 0,1,2); el canal 3 es alpha y queda intacto.
    for (let canal = 0; canal < 3; canal++) {
      // noUncheckedIndexedAccess: el acceso a un typed array tambien puede
      // dar undefined segun el tipo, de ahi el "?? 0" defensivo.
      const valor = datos.data[i + canal] ?? 0;
      datos.data[i + canal] = Math.round(Math.round(valor / paso) * paso);
    }
  }

  ctx.putImageData(datos, 0, 0);
}
