import { useEffect, useRef, type CSSProperties } from "react";
import {
  ALTO,
  ANCHO,
  ESCENA_POR_DEFECTO,
  crearLienzo,
  renderizarEscena,
  type EscenaSpec,
} from "@historia-paralela/escena";

/**
 * Dibuja una EscenaSpec animada en un canvas, con una leyenda de cine
 * superpuesta encima.
 *
 * Esto reemplaza a las imagenes generadas por IA: la escena ya no es un PNG,
 * es la DESCRIPCION EN DATOS de un dibujo (ver packages/escena/src/spec.ts).
 * "renderizarEscena" es pura y determinista, y es la MISMA funcion que usa
 * el backend para producir el video final, asi que lo que se ve aqui en vivo
 * es exactamente lo que despues sale exportado.
 */
interface PropsEscenaPixel {
  escena: EscenaSpec | null;
  /** Pausa la animacion (util en la pantalla final cuando el cinema esta en pausa). */
  pausado?: boolean;
  /** Texto de leyenda que se dibuja SOBRE la escena, estilo cine. */
  leyenda?: string;
  className?: string;
}

// El pixel art no gana nada corriendo a 60fps (la rejilla logica es de
// 160x90; cada "pixel" ya cubre varios pixeles reales de pantalla), y a
// 24fps no calentamos el portatil ni la bateria de quien esta jugando.
const FPS_OBJETIVO = 24;
const MS_POR_CUADRO = 1000 / FPS_OBJETIVO;

// Misma "pinta" de subtitulo de cine que ya definia pixel.css para
// .sala-chat__leyenda / .historia-final__leyenda (dos clases identicas,
// una por pantalla). pixel.css es contrato y no se toca en este cambio, asi
// que en vez de agregar una tercera clase gemela, EscenaPixel se hace cargo
// de la leyenda el mismo y replica el mismo estilo en linea: queda
// autonomo y sirve igual a SalaChat que a HistoriaFinal. La tipografia
// VT323 no hace falta declararla aparte: ya es la fuente de <body> por
// defecto (--fuente-cuerpo en pixel.css).
const ESTILO_LEYENDA: CSSProperties = {
  position: "absolute",
  left: 0,
  right: 0,
  bottom: 0,
  margin: 0,
  padding: "var(--espacio-xs) var(--espacio-sm)",
  background: "rgba(0, 0, 0, 0.72)",
  color: "#fff",
  // Mas chica que antes: la escala anterior estaba pensada para las
  // plantillas cortas del director simulado. DeepSeek escribe parrafos de
  // 300+ caracteres, y con la fuente grande la leyenda superaba la altura
  // de la propia escena (medido: 252px de leyenda sobre 170px de escena en
  // un movil de 375px de ancho), tapaba todo el dibujo y desbordaba el
  // contenedor descuadrando la pantalla de exportar.
  fontSize: "clamp(0.85rem, 0.75rem + 0.5vw, 1.15rem)",
  lineHeight: 1.25,
  textAlign: "center",
  borderTop: "var(--borde-fino) solid var(--color-cian)",
  // La leyenda puede ocupar como mucho media escena; si el parrafo es aun
  // mas largo, hace scroll interno en vez de comerse el pixel art (el texto
  // completo siempre esta ademas en la lista HISTORIA / en el video).
  maxHeight: "50%",
  overflowY: "auto",
};

// Rejilla de la transicion "fade a bloques" (misma idea que ya usaba
// ImagePixel): cuantas mas celdas, mas fino el efecto.
const COLUMNAS_TRANSICION = 6;
const FILAS_TRANSICION = 4;
const BLOQUES_TRANSICION = COLUMNAS_TRANSICION * FILAS_TRANSICION;

export function EscenaPixel({ escena, pausado, leyenda, className }: PropsEscenaPixel): JSX.Element {
  const spec = escena ?? ESCENA_POR_DEFECTO;

  // Clave por CONTENIDO, no por referencia. useHistorySession reemplaza el
  // array de parrafos entero en cada sondeo (cada 2s), asi que el MISMO
  // parrafo llega envuelto en un objeto EscenaSpec nuevo aunque no haya
  // cambiado nada. Si remontaramos el lienzo por identidad de objeto, la
  // transicion "fade a bloques" y el reinicio de la animacion (fase 0)
  // se dispararian cada 2 segundos sin que la escena realmente cambiara.
  // Comparando el contenido serializado, solo se remonta cuando de verdad
  // llega una escena distinta (nuevo parrafo).
  const claveEscena = JSON.stringify(spec);

  return (
    <div
      className={className ? `imagen-pixel ${className}` : "imagen-pixel"}
      role="img"
      aria-label={leyenda ?? "Escena de la historia"}
    >
      <LienzoEscena key={claveEscena} spec={spec} pausado={pausado} />
      {leyenda && <p style={ESTILO_LEYENDA}>{leyenda}</p>}
    </div>
  );
}

interface PropsLienzoEscena {
  spec: EscenaSpec;
  pausado?: boolean;
}

/**
 * El canvas y su bucle de animacion viven en un componente aparte a
 * proposito: la "key" de EscenaPixel lo remonta entero cuando cambia el
 * contenido de la escena, y eso es lo que reinicia tMs en fase 0 y vuelve a
 * montar los <span> de la transicion "fade a bloques" (misma animacion CSS
 * que ya traia pixel.css para ImagePixel).
 */
function LienzoEscena({ spec, pausado }: PropsLienzoEscena): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Un solo buffer reutilizado en TODOS los cuadros de este montaje: crear
  // un Uint8ClampedArray de 57KB (160*90*4) en cada frame dispararia el
  // recolector de basura sin necesidad, cuando el mismo buffer se puede
  // pisar una y otra vez.
  const lienzoRef = useRef<Uint8ClampedArray>(crearLienzo());

  // Instante en que ESTE lienzo se monto. tMs se mide desde aqui (no desde
  // un performance.now() crudo) para que la animacion de una escena nueva
  // arranque siempre en fase 0, en vez de heredar el reloj de la anterior.
  const inicioRef = useRef<number>(performance.now());

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const lienzo = lienzoRef.current;

    function dibujar(tMs: number): void {
      renderizarEscena(spec, tMs, lienzo);
      // putImageData vuelca el buffer tal cual, pixel a pixel, sin ningun
      // reescalado: el canvas se queda en su resolucion nativa 160x90 (ver
      // el estilo del <canvas> mas abajo) y es el CSS quien lo agranda.
      //
      // El "as" de abajo es puro papeleo de tipos, no un cambio de dato: el
      // paquete escena (contrato, no se toca) declara crearLienzo():
      // Uint8ClampedArray sin parametro generico, que TS resuelve como
      // Uint8ClampedArray<ArrayBufferLike>; el lib.dom de TS 5.7+ en cambio
      // pide Uint8ClampedArray<ArrayBuffer> para ImageData. En runtime es
      // el mismo array respaldado por un ArrayBuffer normal (nunca
      // SharedArrayBuffer), asi que el cast es seguro.
      ctx!.putImageData(new ImageData(lienzo as Uint8ClampedArray<ArrayBuffer>, ANCHO, ALTO), 0, 0);
    }

    if (pausado) {
      // Un cuadro fijo y listo. Sin esto, si se llega YA pausado (p.ej. se
      // cambia de parrafo en HistoriaFinal con el cinema en pausa) el
      // lienzo quedaria en negro en vez de mostrar la escena quieta.
      dibujar(performance.now() - inicioRef.current);
      return;
    }

    let idFrame: number;
    let ultimoCuadro = 0;

    function paso(ahora: number): void {
      // Se reprograma el proximo frame SIEMPRE primero: el limitador de fps
      // de abajo solo decide si este tick pinta o no, nunca si se sigue
      // pidiendo el siguiente.
      idFrame = requestAnimationFrame(paso);

      if (ahora - ultimoCuadro < MS_POR_CUADRO) return;
      ultimoCuadro = ahora;

      dibujar(ahora - inicioRef.current);
    }

    idFrame = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(idFrame);
  }, [spec, pausado]);

  return (
    <>
      <canvas
        ref={canvasRef}
        width={ANCHO}
        height={ALTO}
        className="imagen-pixel__canvas"
        // width:100% + height:auto + aspect-ratio (en vez de width/height
        // fijos en pixeles de pantalla) es lo que deja al canvas en su
        // resolucion nativa 160x90 mientras el navegador lo escala visual-
        // mente. image-rendering:pixelated (regla global de pixel.css para
        // "img, canvas") hace que ese escalado sea nearest-neighbor y no
        // difuminado, asi que el "agrandado" sale gratis en el compositor
        // en vez de tener que rasterizar nosotros mismos a 1280px por
        // cuadro.
        style={{ height: "auto", aspectRatio: `${ANCHO} / ${ALTO}` }}
      />
      <div className="imagen-pixel__transicion" aria-hidden="true">
        {Array.from({ length: BLOQUES_TRANSICION }, (_, i) => (
          <span key={i} style={{ "--i": i } as unknown as CSSProperties} />
        ))}
      </div>
    </>
  );
}
