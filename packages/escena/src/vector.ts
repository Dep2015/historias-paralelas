import { calcularDesfase } from "./render.js";
import type { Animacion, TipoAnimacion } from "./spec.js";

/**
 * Modo vectorial: el director dibuja la escena como SVG estilo cuento en vez
 * de EscenaSpec en datos. String-puro, sin DOM ni Node: este archivo lo
 * importa tanto el navegador (para reproducir la animacion en vivo, via CSS)
 * como el backend (para congelar un fotograma exacto en el video con
 * aplicarFotogramaSvg). Nada de manipulacion DOM (no hay DOMParser aqui
 * dentro): todo es texto y regex sobre texto.
 *
 * Contrato de animacion compartido con el motor pixel: cada grupo animado
 * lleva atributos data-anim="tipo" data-amp="N" data-periodo-ms="M"
 * data-fase="F", que es la misma terna (tipo, amplitud, periodoMs, fase) que
 * consume calcularDesfase() en render.ts. Un solo contrato, dos dibujantes.
 */

// --- Saneado -----------------------------------------------------------------

/** Por encima de esto no es un SVG legitimo del director: es ataque o basura. */
const LIMITE_CARACTERES = 60_000;

/**
 * Recorta el SVG bruto a su bloque <svg ...>...</svg> y le quita todo lo que
 * podria ejecutar codigo o traer contenido remoto en el navegador de quien
 * juega. PROHIBIDO SMIL en la salida a proposito (opcion B del proyecto): la
 * animacion la calcula NUESTRO codigo (CSS_ANIMACIONES_VECTOR en vivo,
 * aplicarFotogramaSvg en video), nunca <animate>/<animateTransform>/etc del
 * propio SVG, porque eso desincroniza lo que el navegador anima de lo que el
 * video congela.
 */
export function sanearSvg(svgCrudo: string): string | undefined {
  if (typeof svgCrudo !== "string" || svgCrudo.length === 0) return undefined;

  const inicio = svgCrudo.indexOf("<svg");
  const fin = svgCrudo.lastIndexOf("</svg>");
  if (inicio === -1 || fin === -1 || fin < inicio) return undefined;

  let svg = svgCrudo.slice(inicio, fin + "</svg>".length);

  // Bloques completos que pueden ejecutar codigo o incrustar otro documento.
  svg = svg.replace(/<script[\s\S]*?<\/script\s*>/gi, "");
  svg = svg.replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, "");
  svg = svg.replace(/<iframe[\s\S]*?>/gi, "");

  // SMIL: la animacion es nuestra, no del SVG (opcion B, ver comentario de
  // arriba). Cada tag puede venir auto-cerrado (<animate .../>) o en pareja
  // (<animate ...>...</animate>): se cubren las dos formas, y en ese orden
  // (animateTransform/animateMotion antes que animate a secas) porque "<animate"
  // es tambien el prefijo literal de esos dos nombres mas largos.
  const quitarTagSmil = (nombre: string): void => {
    const patron = new RegExp(
      `<${nombre}\\b[^>]*\\/>|<${nombre}\\b[^>]*>[\\s\\S]*?<\\/${nombre}\\s*>`,
      "gi",
    );
    svg = svg.replace(patron, "");
  };
  quitarTagSmil("animateTransform");
  quitarTagSmil("animateMotion");
  quitarTagSmil("animate");
  quitarTagSmil("set");

  // Atributos de evento inline: on\w+="..." u on\w+='...'.
  svg = svg.replace(/\son\w+\s*=\s*"(?:[^"\\]|\\.)*"/gi, "");
  svg = svg.replace(/\son\w+\s*=\s*'(?:[^'\\]|\\.)*'/gi, "");

  // "javascript:" en cualquier atributo (href, xlink:href, style con url()...).
  svg = svg.replace(/(["'])\s*javascript:[^"']*\1/gi, '$1#$1');

  // href/xlink:href externos: solo se permiten anclas internas ("#algo").
  // Las referencias remotas (http(s), data:, etc.) salen fuera.
  svg = svg.replace(
    /\b(xlink:href|href)\s*=\s*"(?!#)[^"]*"/gi,
    `$1="#"`,
  );
  svg = svg.replace(
    /\b(xlink:href|href)\s*=\s*'(?!#)[^']*'/gi,
    `$1='#'`,
  );

  // <image> con fuente remota (http/https): imagenes de fuera del proyecto no.
  svg = svg.replace(/<image\b[^>]*\bhttp[^>]*>/gi, "");

  if (svg.length > LIMITE_CARACTERES) return undefined;
  if (!svg.includes("<svg")) return undefined;

  return svg;
}

// --- CSS para reproducir el contrato en el navegador -------------------------

/**
 * Keyframes y reglas por atributo data-anim, para que el navegador anime el
 * SVG con el MISMO vocabulario (flotar/deslizar/parpadeo/pulso/ondular) que
 * calcularDesfase() usa para el motor pixel. No es la misma formula pixel a
 * pixel (una es CSS declarativo, la otra es una funcion de tMs) pero produce
 * el mismo movimiento percibido: mismo tipo, misma amplitud, mismo periodo,
 * mismo desfase de fase.
 *
 * transform-box: fill-box es necesario para "pulso": sin el, el origen de
 * scale() es el viewport del SVG entero, no el propio grupo, y el elemento
 * "crece" hacia una esquina en vez de latir sobre si mismo.
 */
export const CSS_ANIMACIONES_VECTOR = `
[data-anim] {
  transform-box: fill-box;
  transform-origin: center;
  animation-delay: var(--fase-delay, 0s);
  animation-fill-mode: both;
}

[data-anim="flotar"] {
  animation-name: hp-flotar;
  animation-duration: var(--dur, 3s);
  animation-timing-function: ease-in-out;
  animation-iteration-count: infinite;
  animation-direction: alternate;
}
@keyframes hp-flotar {
  from { transform: translateY(calc(var(--amp, 8px) * -1)); }
  to   { transform: translateY(var(--amp, 8px)); }
}

[data-anim="deslizar"] {
  animation-name: hp-deslizar;
  animation-duration: var(--dur, 3s);
  animation-timing-function: ease-in-out;
  animation-iteration-count: infinite;
  animation-direction: alternate;
}
@keyframes hp-deslizar {
  from { transform: translateX(calc(var(--amp, 8px) * -1)); }
  to   { transform: translateX(var(--amp, 8px)); }
}

[data-anim="parpadeo"] {
  animation-name: hp-parpadeo;
  animation-duration: var(--dur, 3s);
  animation-timing-function: steps(2, jump-none);
  animation-iteration-count: infinite;
}
@keyframes hp-parpadeo {
  0%   { opacity: 1; }
  69%  { opacity: 1; }
  70%  { opacity: 0; }
  100% { opacity: 0; }
}

[data-anim="pulso"] {
  animation-name: hp-pulso;
  animation-duration: var(--dur, 3s);
  animation-timing-function: ease-in-out;
  animation-iteration-count: infinite;
  animation-direction: alternate;
}
@keyframes hp-pulso {
  from { transform: scale(calc(1 - var(--amp-pulso, 0.08))); }
  to   { transform: scale(calc(1 + var(--amp-pulso, 0.08))); }
}

[data-anim="ondular"] {
  animation-name: hp-ondular;
  animation-duration: var(--dur, 3s);
  animation-timing-function: ease-in-out;
  animation-iteration-count: infinite;
  animation-direction: alternate;
}
@keyframes hp-ondular {
  from { transform: skewX(-4deg) translateY(calc(var(--amp, 8px) * -0.3)); }
  to   { transform: skewX(4deg) translateY(var(--amp, 8px) * 0.3); }
}
`.trim();

/** Coincide con los defaults de calcularDesfase() en render.ts. */
const AMP_PX_DEFECTO = 8;
const PERIODO_MS_DEFECTO = 3000;
const FASE_DEFECTO = 0;

function leerAtributoNumerico(tagG: string, atributo: string, porDefecto: number): number {
  const patron = new RegExp(`${atributo}\\s*=\\s*"([^"]*)"`, "i");
  const coincidencia = tagG.match(patron);
  if (!coincidencia || !coincidencia[1]) return porDefecto;
  const valor = Number(coincidencia[1]);
  return Number.isFinite(valor) ? valor : porDefecto;
}

/**
 * Inserta el <style> con CSS_ANIMACIONES_VECTOR justo tras la apertura del
 * SVG, y convierte data-amp/data-periodo-ms/data-fase de cada <g> en
 * variables CSS inline (--amp, --dur, --fase-delay, --amp-pulso) que el CSS
 * de arriba consulta con var(). El delay es NEGATIVO (-fase*periodo): asi el
 * grupo arranca a mitad de su ciclo en vez de esperar fase*periodo antes de
 * moverse, que es exactamente lo que hace "fase" en calcularDesfase (un
 * offset del reloj interno, no un retraso de arranque).
 */
export function incrustarAnimacionesSvg(svg: string): string {
  const conEstilo = svg.replace(
    /<svg\b([^>]*)>/i,
    (coincidenciaCompleta) => `${coincidenciaCompleta}<style>${CSS_ANIMACIONES_VECTOR}</style>`,
  );

  return conEstilo.replace(/<g\b[^>]*>/gi, (tagG) => {
    if (!/data-anim\s*=/.test(tagG)) return tagG;

    const amp = leerAtributoNumerico(tagG, "data-amp", AMP_PX_DEFECTO);
    const periodoMs = leerAtributoNumerico(tagG, "data-periodo-ms", PERIODO_MS_DEFECTO);
    const fase = leerAtributoNumerico(tagG, "data-fase", FASE_DEFECTO);

    const delayMs = -(fase * periodoMs);
    // amplitud de pulso en CSS es fraccion (0..1), no px: reusa amp/100 igual
    // que aplicarFotogramaSvg mas abajo, para que navegador y video coincidan.
    const ampPulso = Math.min(0.9, amp / 100);

    const variables = `--amp: ${amp}px; --dur: ${periodoMs}ms; --fase-delay: ${delayMs}ms; --amp-pulso: ${ampPulso};`;

    if (/\sstyle\s*=\s*"/.test(tagG)) {
      return tagG.replace(/\sstyle\s*=\s*"([^"]*)"/i, (_m, estiloPrevio: string) => {
        const separador = estiloPrevio.trim().endsWith(";") || estiloPrevio.trim() === "" ? "" : ";";
        return ` style="${estiloPrevio}${separador}${variables}"`;
      });
    }

    return tagG.replace(/<g\b/i, `<g style="${variables}"`);
  });
}

// --- Fotograma congelado (server, para el video) ------------------------------

/**
 * Mapeo de amplitud data-amp (px, en la convencion del SVG) a la "amplitud"
 * que espera Animacion en el contrato del motor (spec.ts): para
 * flotar/deslizar/ondular es directamente celdas/px de recorrido, tal cual.
 * Para pulso y parpadeo, calcularDesfase espera 0..1 (intensidad/fraccion),
 * asi que aqui se traduce: pulso usa amp/100 acotado a 0.9 (igual que el CSS
 * de arriba, --amp-pulso), y parpadeo usa una fraccion fija de 0.3 (30% del
 * ciclo apagado) independiente de data-amp, para que el video parpadee con la
 * misma cadencia que el keyframe hp-parpadeo (70%/30%) del navegador.
 */
function animacionDesdeAtributos(tipo: TipoAnimacion, amp: number, periodoMs: number, fase: number): Animacion {
  switch (tipo) {
    case "pulso":
      return { tipo, amplitud: Math.min(0.9, amp / 100), periodoMs, fase };
    case "parpadeo":
      return { tipo, amplitud: 0.3, periodoMs, fase };
    case "flotar":
    case "deslizar":
    case "ondular":
    default:
      return { tipo, amplitud: amp, periodoMs, fase };
  }
}

const TIPOS_ANIM_VALIDOS: readonly TipoAnimacion[] = [
  "flotar",
  "deslizar",
  "parpadeo",
  "pulso",
  "ondular",
];

function tipoAnimacionValido(valor: string): TipoAnimacion | undefined {
  return TIPOS_ANIM_VALIDOS.find((t) => t === valor);
}

/**
 * Congela el SVG en el instante tMs: para cada <g data-anim="..."> calcula su
 * Desfase con la MISMA calcularDesfase() que usa el motor pixel, y le inyecta
 * un transform="translate(dx dy) scale(k)" (compuesto despues de un
 * transform previo, si lo hubiera) mas opacity="0" cuando !visible.
 *
 * Aproximacion asumida: el pulso en video escala desde el origen del grupo
 * via transform, no desde su centro geometrico exacto como hace
 * transform-box:fill-box en el navegador (rsvg-convert no soporta esa
 * propiedad CSS). Para los sprites del director, centrados razonablemente
 * sobre su propio bbox, la diferencia es milimetrica y se acepta a proposito
 * en vez de complicar esto con calculo de bounding boxes.
 *
 * String-puro: nada de DOM, se usa exclusivamente regex sobre el tag <g>.
 */
export function aplicarFotogramaSvg(svg: string, tMs: number): string {
  return svg.replace(/<g\b[^>]*>/gi, (tagG) => {
    const tipoBruto = tagG.match(/data-anim\s*=\s*"([^"]*)"/i)?.[1];
    if (!tipoBruto) return tagG;
    const tipo = tipoAnimacionValido(tipoBruto);
    if (!tipo) return tagG;

    const amp = leerAtributoNumerico(tagG, "data-amp", AMP_PX_DEFECTO);
    const periodoMs = leerAtributoNumerico(tagG, "data-periodo-ms", PERIODO_MS_DEFECTO);
    const fase = leerAtributoNumerico(tagG, "data-fase", FASE_DEFECTO);

    const anim = animacionDesdeAtributos(tipo, amp, periodoMs, fase);
    const desfase = calcularDesfase(anim, tMs);

    let tagConTransform = tagG;

    // translate+scale compuestos DESPUES de un transform existente, si lo hay:
    // se anexa dentro del mismo atributo en vez de sobrescribirlo.
    const nuevoTransform = `translate(${desfase.dx} ${desfase.dy}) scale(${desfase.escala})`;
    if (/\stransform\s*=\s*"/.test(tagConTransform)) {
      tagConTransform = tagConTransform.replace(
        /\stransform\s*=\s*"([^"]*)"/i,
        (_m, previo: string) => ` transform="${previo} ${nuevoTransform}"`,
      );
    } else {
      tagConTransform = tagConTransform.replace(/<g\b/i, `<g transform="${nuevoTransform}"`);
    }

    if (!desfase.visible) {
      tagConTransform = tagConTransform.replace(/<g\b/i, `<g opacity="0"`);
    }

    return tagConTransform;
  });
}
