import type { CSSProperties } from "react";
import { usePixelate } from "../hooks/usePixelate.js";

/**
 * Pixela una imagen ESTATICA cualquiera (archivos servidos desde /assets:
 * fondos, logos, arte suelto) reduciendola a una grilla chica y volviendo a
 * escalarla sin suavizado. Ya NO se usa para las escenas de la historia: esas
 * ahora son datos (EscenaSpec) que se dibujan animados por codigo en canvas
 * via el componente EscenaPixel (ver EscenaPixel.tsx). Este componente puede
 * no tener consumidores en un momento dado, pero se deja funcional para
 * cualquier imagen estatica que necesite el mismo look retro.
 *
 * Mientras el pixelado del canvas no esta listo (o si no hay src todavia)
 * se cae al frame placeholder para que la pantalla nunca se vea vacia.
 */
interface PropsImagePixel {
  src?: string;
  alt: string;
  gridSize?: number;
}

const RUTA_PLACEHOLDER = "/assets/escena-placeholder.png";

// Rejilla de la transicion "fade a bloques": cuantas mas celdas, mas fino el efecto.
const COLUMNAS_TRANSICION = 6;
const FILAS_TRANSICION = 4;
const BLOQUES_TRANSICION = COLUMNAS_TRANSICION * FILAS_TRANSICION;

export function ImagePixel({ src, alt, gridSize }: PropsImagePixel): JSX.Element {
  const { canvasRef, listo, error } = usePixelate(src, gridSize);
  const mostrarPlaceholder = !src || !listo || error;

  return (
    // La key cambia con el src: obliga a React a desmontar y remontar este
    // bloque entero cada vez que llega una escena nueva, lo que reinicia de
    // un tiron la animacion CSS "fade a bloques" (ver pixel.css).
    <div className="imagen-pixel" role="img" aria-label={alt} key={src ?? "placeholder"}>
      <canvas
        ref={canvasRef}
        className="imagen-pixel__canvas"
        style={{ display: mostrarPlaceholder ? "none" : "block" }}
        aria-hidden={mostrarPlaceholder}
      />
      {mostrarPlaceholder && (
        <img
          src={RUTA_PLACEHOLDER}
          alt=""
          className="imagen-pixel__canvas imagen-pixel__placeholder"
        />
      )}
      <div className="imagen-pixel__transicion" aria-hidden="true">
        {Array.from({ length: BLOQUES_TRANSICION }, (_, i) => (
          <span key={i} style={{ "--i": i } as unknown as CSSProperties} />
        ))}
      </div>
    </div>
  );
}
