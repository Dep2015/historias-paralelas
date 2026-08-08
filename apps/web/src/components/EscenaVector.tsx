import { useMemo, type CSSProperties } from "react";
import { incrustarAnimacionesSvg } from "@historia-paralela/escena";

/**
 * Version vectorial de EscenaPixel: en vez de dibujar en un canvas con el
 * motor de escenas en datos, muestra el SVG estilo cuento que devuelve la IA
 * (ya saneado por el backend, ver contrato Parrafo.svg en lib/historia.ts).
 */
interface PropsEscenaVector {
  svg: string;
  leyenda?: string;
  className?: string;
}

// Misma "pinta" de subtitulo de cine que EscenaPixel replica en linea (ver
// el comentario largo alla sobre por que no se toca pixel.css). Se repite
// aqui en vez de compartir una constante entre componentes porque cada uno
// debe quedar autonomo y pixel.css sigue siendo el unico contrato de CSS.
const ESTILO_LEYENDA: CSSProperties = {
  position: "absolute",
  left: 0,
  right: 0,
  bottom: 0,
  margin: 0,
  padding: "var(--espacio-xs) var(--espacio-sm)",
  background: "rgba(0, 0, 0, 0.72)",
  color: "#fff",
  fontSize: "clamp(0.85rem, 0.75rem + 0.5vw, 1.15rem)",
  lineHeight: 1.25,
  textAlign: "center",
  borderTop: "var(--borde-fino) solid var(--color-cian)",
  maxHeight: "50%",
  overflowY: "auto",
};

export function EscenaVector({ svg, leyenda, className }: PropsEscenaVector): JSX.Element {
  // incrustarAnimacionesSvg inyecta el <style> de animaciones CSS (variables
  // --amp/--dur/--fase-delay por grupo, ver packages/escena). Se memoiza por
  // el string del svg: si no cambia el contenido, no hace falta recalcular
  // ni reconstruir el data URI.
  const dataUri = useMemo(() => {
    const animado = incrustarAnimacionesSvg(svg);
    return `data:image/svg+xml;utf8,${encodeURIComponent(animado)}`;
  }, [svg]);

  return (
    <div
      className={className ? `escena-vector ${className}` : "escena-vector"}
      role="img"
      aria-label={leyenda ?? "Escena de la historia"}
    >
      {/*
       * PORQUE <img> y no dangerouslySetInnerHTML: un <img> con data URI es,
       * por especificacion, un contexto SIN scripts (ni siquiera <script>
       * dentro del SVG se ejecuta, y los manejadores tipo onclick tampoco
       * corren). Es defensa en profundidad ADEMAS del saneado que ya hace el
       * servidor (ver packages/escena sanear.ts): aunque algo se colara ahi,
       * este contexto no lo dejaria correr. Las animaciones CSS internas del
       * propio SVG (@keyframes, transform, opacity) SI se reproducen dentro
       * de un img, asi que no se pierde nada visual por renderizarlo asi.
       */}
      <img src={dataUri} alt="Escena de la historia" className="escena-vector__img" />
      {leyenda && <p style={ESTILO_LEYENDA}>{leyenda}</p>}
    </div>
  );
}
