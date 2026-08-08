import { env } from "../lib/env.js";

/**
 * Capa fina sobre la API de DeepSeek (compatible con el formato de chat de
 * OpenAI). DeepSeek es text-only: no existe endpoint de generacion de
 * imagenes, asi que este modulo ya NO tiene una funcion "generarImagen". La
 * IA ahora devuelve la escena EN DATOS (ver services/director.ts) y el pixel
 * art se dibuja por codigo con el paquete @historia-paralela/escena.
 *
 * PORQUE una capa separada: el resto del backend no deberia saber si detras
 * hay DeepSeek, un proxy propio o cualquier otro proveedor compatible; solo le
 * importa "dame texto". Ademas concentra aqui el unico sitio del proyecto que
 * hace networking saliente hacia la IA.
 *
 * Esta funcion asume que quien la llama ya comprobo `hayIA` (ver lib/env.ts).
 * Si se llama sin clave configurada, la API remota respondera con un error de
 * autenticacion que se propaga como Error normal.
 */

const TIMEOUT_TEXTO_MS = 30_000;
/**
 * Un SVG completo son ~3500 tokens de salida y tarda ~21s medidos contra
 * DeepSeek (ver TURNO_VECTOR_MS en lib/env.ts). El timeout generico de 30s se
 * queda corto con ese margen real de red incluido, asi que cuando el llamador
 * pide un maxTokens grande se usa una ventana mas holgada.
 */
const TIMEOUT_TEXTO_LARGO_MS = 60_000;
const UMBRAL_MAX_TOKENS_TIMEOUT_LARGO = 4_000;

interface MensajeChat {
  role: "system" | "user";
  content: string;
}

export interface OpcionesCompletar {
  /**
   * Si pedir la respuesta en json_object estricto. Default true (modo pixel:
   * un objeto {narracion, escena}). El modo vector lo pone en false porque un
   * SVG dentro de un string JSON es un infierno de escapes (cada comilla,
   * cada salto de linea hay que escaparlo) y de tokens (el escapado infla el
   * conteo); ahi es mas simple y barato pedir texto plano delimitado por
   * marcadores y parsearlo a mano (ver director.ts).
   */
  json?: boolean;
  /** Tope de tokens de la respuesta. Default env.IA_MAX_TOKENS. */
  maxTokens?: number;
}

interface RespuestaChatIA {
  choices?: Array<{
    message?: {
      content?: string;
      /** Solo lo emiten los modelos que razonan; sus tokens gastan max_tokens. */
      reasoning_content?: string;
    };
    finish_reason?: string;
  }>;
}

function mensajeDeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Pide una completion de chat. Quien llama (director.ts) es responsable de
 * construir el prompt; aqui solo se habla con la red.
 */
export async function completarTexto(
  sistema: string,
  usuario: string,
  opciones?: OpcionesCompletar,
): Promise<string> {
  const pedirJson = opciones?.json ?? true;
  const maxTokens = opciones?.maxTokens ?? env.IA_MAX_TOKENS;
  const timeoutMs = maxTokens > UMBRAL_MAX_TOKENS_TIMEOUT_LARGO ? TIMEOUT_TEXTO_LARGO_MS : TIMEOUT_TEXTO_MS;

  const mensajes: MensajeChat[] = [
    { role: "system", content: sistema },
    { role: "user", content: usuario },
  ];

  let respuesta: Response;
  try {
    respuesta = await fetch(`${env.IA_API_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Bearer con clave ausente solo puede pasar si el llamador ignoro
        // hayIA; dejamos que la API remota lo rechace con su propio 401.
        Authorization: `Bearer ${env.IA_API_KEY}`,
      },
      body: JSON.stringify({
        model: env.IA_MODELO_TEXTO,
        messages: mensajes,
        // El modo vector pide texto plano (ver OpcionesCompletar.json): un
        // SVG con comillas y saltos de linea dentro de un string JSON es
        // fragil de escapar y caro de tokenizar.
        ...(pedirJson ? { response_format: { type: "json_object" } } : {}),
        temperature: 1.0,
        max_tokens: maxTokens,
        /**
         * DESACTIVAR EL RAZONAMIENTO NO ES OPCIONAL AQUI.
         *
         * Los modelos deepseek-v4-* razonan por defecto y emiten el
         * razonamiento en "reasoning_content", cuyos tokens se descuentan del
         * MISMO max_tokens que la respuesta. Medido contra la API real con
         * nuestro prompt (6000 caracteres):
         *
         *   razonando, 1400 tokens -> 15.8s, finish_reason "length",
         *                             4981 chars de razonamiento y content VACIO
         *   razonando, 4000 tokens -> 38.2s, 13072 chars de razonamiento
         *                             y content VACIO otra vez
         *   sin razonar, 1400      ->  3.8s, finish_reason "stop",
         *                             1632 chars de JSON correcto
         *
         * Es decir: subir max_tokens NO lo arregla, el modelo simplemente
         * piensa mas. Y el sintoma es traicionero, porque la API responde 200
         * con un content vacio y el turno se cae al director simulado sin que
         * nadie lo note.
         *
         * Aqui no queremos deliberacion: queremos un JSON estructurado y
         * rapido, dentro de una ventana de turno de 20 segundos.
         */
        thinking: { type: env.IA_RAZONAMIENTO },
      }),
      // AbortSignal.timeout es nativo: no hace falta un controller manual.
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    // Aqui caen tanto el timeout (AbortError) como fallos de red: para quien
    // llama da igual la causa, lo que importa es que la IA no respondio.
    throw new Error(`No se pudo contactar la API de IA: ${mensajeDeError(error)}`);
  }

  if (!respuesta.ok) {
    const cuerpoError = await respuesta.text().catch(() => "");
    throw new Error(
      `La API de IA respondio ${respuesta.status}: ${cuerpoError.slice(0, 200)}`,
    );
  }

  let datos: RespuestaChatIA;
  try {
    datos = (await respuesta.json()) as RespuestaChatIA;
  } catch (error) {
    throw new Error(`La API de IA devolvio JSON invalido: ${mensajeDeError(error)}`);
  }

  const eleccion = datos.choices?.[0];
  const contenido = eleccion?.message?.content;

  if (typeof contenido !== "string" || contenido.trim().length === 0) {
    // El motivo importa, y mucho: un content vacio con finish_reason "length"
    // NO es el fallo esporadico de DeepSeek, es que el razonamiento se comio
    // todo el presupuesto de tokens. Distinguirlos evita perseguir el problema
    // equivocado (subir max_tokens ahi solo empeora las cosas).
    const motivo = eleccion?.finish_reason ?? "desconocido";
    const razonamiento = eleccion?.message?.reasoning_content?.length ?? 0;

    if (motivo === "length") {
      throw new Error(
        `La IA agoto max_tokens (${maxTokens}) sin emitir contenido: ` +
          `gasto ${razonamiento} caracteres razonando. Desactiva el razonamiento ` +
          `con IA_RAZONAMIENTO=disabled o sube IA_MAX_TOKENS.`,
      );
    }

    throw new Error(
      `La API de IA devolvio una respuesta vacia (finish_reason=${motivo}).`,
    );
  }

  return contenido;
}
