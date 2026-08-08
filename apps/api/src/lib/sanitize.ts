/**
 * Saneado de texto libre. Se aplica DOS veces por diseno:
 *  1. antes de mandar el texto a la IA (evita inyeccion de prompt),
 *  2. antes de guardarlo en el store (lo que se guarda ya es seguro de render).
 * El frontend ademas nunca usa dangerouslySetInnerHTML.
 */

/**
 * 280, como un tweet, a proposito: frases cortas mantienen el ritmo del
 * juego y acotan el contexto que se le manda a la IA en cada turno.
 */
const LARGO_MAXIMO_FRASE = 280;

/**
 * Un caracter es "invisible" si no deja rastro en pantalla pero si viaja en la
 * cadena: controles C0/C1, guion suave, espacios de ancho cero, marcas y
 * anulaciones bidireccionales, separadores de linea/parrafo, y BOM.
 *
 * Se comprueba por punto de codigo en vez de con una expresion regular con
 * los caracteres literales dentro: un control real pegado en el fichero fuente
 * rompe el parseo del propio fichero.
 */
function esInvisible(cp: number): boolean {
  return (
    cp <= 0x1f || // controles C0 (incluye tab y saltos de linea)
    (cp >= 0x7f && cp <= 0x9f) || // DEL y controles C1
    cp === 0x00ad || // guion suave
    (cp >= 0x200b && cp <= 0x200f) || // ancho cero y marcas bidi
    (cp >= 0x2028 && cp <= 0x202e) || // separadores y anulaciones bidi
    (cp >= 0x2060 && cp <= 0x2064) || // word joiner e invisibles matematicos
    cp === 0xfeff // BOM
  );
}

/** Sustituye los invisibles por espacio. for..of respeta pares suplentes. */
function quitarInvisibles(texto: string): string {
  let salida = "";
  for (const caracter of texto) {
    const cp = caracter.codePointAt(0);
    salida += cp === undefined || esInvisible(cp) ? " " : caracter;
  }
  return salida;
}

/** Marcadores tipicos con los que se intenta secuestrar un prompt. */
const PATRONES_INYECCION: RegExp[] = [
  /```/g,
  /<\|.*?\|>/g,
  /\b(system|assistant|user)\s*:/gi,
  /\bignora(r)?\s+(las\s+)?(instrucciones|reglas)/gi,
  /\bignore\s+(all\s+)?(previous|prior)\s+instructions/gi,
];

/** Quita todo lo que podria interpretarse como HTML al renderizar. */
export function escaparHtml(texto: string): string {
  return texto
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Normaliza una frase escrita por un participante.
 * Devuelve cadena vacia si tras limpiar no queda nada util.
 */
export function sanearFrase(entrada: unknown): string {
  if (typeof entrada !== "string") return "";

  let texto = quitarInvisibles(entrada.normalize("NFC"));

  // Neutralizamos los marcadores en vez de rechazar el mensaje: cortar la
  // frase de alguien a mitad de partida arruina el juego mas que el riesgo.
  for (const patron of PATRONES_INYECCION) {
    texto = texto.replace(patron, " ");
  }

  texto = texto.replace(/\s+/g, " ").trim();

  if (texto.length > LARGO_MAXIMO_FRASE) {
    texto = texto.slice(0, LARGO_MAXIMO_FRASE).trimEnd();
  }

  return escaparHtml(texto);
}

/** Deshace el escape para mostrar el texto dentro del video (FFmpeg no lee HTML). */
export function desescaparHtml(texto: string): string {
  return texto
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&");
}

/** Los IDs de canal viajan en URLs y en nombres de fichero: lista blanca estricta. */
export function esCanalValido(canalId: string): boolean {
  return /^hist-[a-z0-9-]{1,40}$/.test(canalId);
}
