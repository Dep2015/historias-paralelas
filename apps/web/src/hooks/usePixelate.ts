import { useEffect, useRef, useState, type RefObject } from "react";
import { pixelarImagen } from "../lib/pixelate.js";

/**
 * Envuelve pixelarImagen en un efecto de React: cada vez que cambia "src"
 * (o gridSize) vuelve a dibujar sobre un canvas propio del hook.
 */
export function usePixelate(
  src: string | undefined,
  gridSize?: number,
): { canvasRef: RefObject<HTMLCanvasElement>; listo: boolean; error: boolean } {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [listo, setListo] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    // Bandera de cancelacion: si el componente se desmonta (o src vuelve a
    // cambiar) a mitad de la carga de la imagen, la promesa vieja no debe
    // pisar el estado de la corrida nueva.
    let cancelado = false;

    setListo(false);
    setError(false);

    if (!src || !canvasRef.current) {
      return;
    }

    pixelarImagen(src, canvasRef.current, gridSize ? { gridSize } : undefined)
      .then(() => {
        if (!cancelado) setListo(true);
      })
      .catch(() => {
        if (!cancelado) setError(true);
      });

    return () => {
      cancelado = true;
    };
  }, [src, gridSize]);

  return { canvasRef, listo, error };
}
