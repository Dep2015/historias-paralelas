import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  ALTO,
  ANCHO,
  ESCENA_POR_DEFECTO,
  aplicarFotogramaSvg,
  crearLienzo,
  renderizarEscena,
  type EscenaSpec,
} from "@historia-paralela/escena";
import { env } from "../lib/env.js";
import { codificarPng } from "../lib/png.js";
import { desescaparHtml } from "../lib/sanitize.js";
import type { Historia, Parrafo } from "../dominio/historia.js";

/**
 * Genera el mp4 final de una historia y lo entrega una unica vez.
 *
 * Cada parrafo trae una escena EN DATOS (EscenaSpec), no una imagen: los
 * frames del video se rasterizan aqui con renderizarEscena(), el MISMO motor
 * que usa el navegador para pintar la escena en vivo (@historia-paralela/
 * escena). Es lo unico que garantiza que el mp4 se parezca a lo que la gente
 * vio mientras jugaba, animacion incluida.
 *
 * REGLA DE ORO del proyecto: nada de esto persiste. El directorio de trabajo,
 * los frames, el srt y el propio mp4 viven en un directorio temporal por
 * export y se borran en cuanto se descargan (o cuando vencen sin que nadie
 * los pida). No usamos fluent-ffmpeg ni ffmpeg-static: se invoca el binario
 * directamente con spawn para no sumar dependencias a un paso que ya de por
 * si depende de un binario externo instalado en el contenedor.
 */

/** Token opaco -> export listo para descargar, en memoria (como historiaStore). */
export interface ResultadoExport {
  token: string;
  ruta: string;
  expiraEn: number;
  /** Hace falta para poder borrar la historia del store cuando se entrega el video. */
  canalId: string;
}

/**
 * 20s por parrafo: coincide a proposito con TURNO_DURACION_MS (env.ts), la
 * ventana de turno del juego. Queda fija aqui (no se lee de env) porque
 * determina cuantos frames se renderizan por parrafo (DURACION_PARRAFO_S *
 * fps) y la duracion exacta que se le pasa a FFmpeg con -t: una exportacion
 * ya en marcha no puede quedar corrupta porque alguien cambio la variable de
 * entorno a mitad de partida.
 */
const DURACION_PARRAFO_S = 20;

/**
 * FPS "logico" de render (no el del mp4 final, ver -r 24 mas abajo): cuantos
 * frames PNG se generan por segundo de parrafo. 12 es un compromiso entre que
 * las animaciones del spec (flotar, pulso, parpadeo...) se vean fluidas y el
 * volumen de PNGs a 1280x720 que hay que escribir y luego codificar.
 */
const FPS_VIDEO = 12;

/**
 * 160x90 (rejilla logica de EscenaSpec, ver packages/escena/src/spec.ts) * 8 =
 * 1280x720. El factor DEBE ser entero: codificarPng() escala repitiendo cada
 * pixel N veces (nearest-neighbor puro, ver png.ts). Un factor fraccionario
 * obligaria a promediar pixeles vecinos para rellenar la rejilla final, que
 * es exactamente la interpolacion que arruina el pixel art. 8 ademas da una
 * resolucion de video estandar (720p) sin redondeos raros.
 */
const ESCALA_PNG = 8;

/**
 * rsvg-convert: solo lo necesitan los parrafos de salas "vector" (los que
 * traen Parrafo.svg). No vive en env.ts a proposito (ese modulo no es parte
 * de este cambio): se lee process.env directamente, igual de opcional que
 * FFMPEG_PATH, con el mismo patron de "binario configurable, valor por
 * defecto razonable".
 */
const RSVG_PATH = process.env.RSVG_PATH ?? "rsvg-convert";

/** Cuanto se espera un solo frame de rsvg-convert antes de darlo por perdido. */
const TIMEOUT_RSVG_MS = 10_000;

/**
 * FPS de la rama vectorial: MAS BAJO que FPS_VIDEO (8 en vez de 12) a
 * proposito. Cada frame pixel es una funcion en el mismo proceso (barata);
 * cada frame vectorial es un spawn ENTERO de rsvg-convert (caro: arrancar un
 * proceso, leer el SVG, rasterizar, escribir el PNG). A FPS_VIDEO literal,
 * 20s de parrafo ya son 240 spawns en serie; con varios parrafos vectoriales
 * eso dispara el tiempo de exportacion muy por encima de lo razonable. 8fps
 * sigue leyendose fluido para ilustraciones de cuento (menos frenetico que el
 * pixel art animado, que es lo que pide el estilo) y recorta un tercio los
 * spawns.
 *
 * Es una decision POR EXPORTACION, no por parrafo: FFmpeg solo admite un
 * unico -framerate para toda la secuencia de PNG de entrada (el demuxer
 * image2 no soporta cambiar el fps a mitad de stream), y los 20s por parrafo
 * del SRT son fijos. Si se mezclaran 12fps de un parrafo pixel con 8fps de
 * otro vectorial en el mismo video, cada segmento se reproduciria a una
 * velocidad real distinta de los 20s que promete el subtitulo. Por eso, si
 * CUALQUIER parrafo de la historia trae svg, TODA la historia (incluidos los
 * parrafos sin svg, que igual van por la rama pixel) se renderiza a
 * FPS_VECTOR. Ver calcularFpsExport().
 */
const FPS_VECTOR = 8;

/**
 * Techo de PNGs en disco antes de recortar el FPS automaticamente. A
 * FPS_VIDEO literal cada parrafo son DURACION_PARRAFO_S * FPS_VIDEO = 240
 * frames; este limite absorbe unos 12 parrafos sin tocar nada. Mas alla, en
 * vez de truncar la historia en silencio (perder contenido) se baja el frame
 * rate (perder suavidad) y se avisa por consola. Ver calcularFps().
 */
const LIMITE_FRAMES_TOTAL = 3000;

const ANCHO_MAXIMO_LINEA_SRT = 42;
// 3 y no 2: un parrafo del director ronda los 90-110 caracteres, que a 42 por
// linea no entran en dos. Con dos lineas el texto sobrante se apelotonaba en
// la ultima y libass acababa partiendola igual, pero sin control.
const LINEAS_MAXIMAS_POR_BLOQUE = 3;
// Subido de 120s a 240s: ahora hay que codificar cientos de PNG de 1280x720
// en vez de leer un puñado de frames estaticos, y eso tarda mas.
const TIMEOUT_FFMPEG_MS = 240_000;

const NOMBRE_SRT = "historia.srt";
const NOMBRE_SALIDA = "historia.mp4";
/** Patron de entrada para FFmpeg; debe coincidir con el padStart(5) de nombreFrame(). */
const PATRON_FRAMES = "frame-%05d.png";

/**
 * Estilo "cine": fuente monoespaciada, contorno negro, leyenda al pie.
 *
 * FontName tiene que ser una fuente REALMENTE instalada en la imagen. libass
 * no avisa cuando no encuentra ninguna: codifica el video igual y el
 * subtitulo sale invisible. La imagen instala ttf-dejavu justamente para
 * esto (ver Dockerfile); si se cambia el nombre aqui, hay que cambiar el
 * paquete alli.
 *
 * OJO CON LAS UNIDADES: estos numeros NO son pixeles del video. Al convertir
 * el SRT a ASS, FFmpeg fija un lienzo virtual de 384x288 y libass escala ese
 * lienzo hasta el tamano real, sin importar la resolucion real del video (es
 * un valor fijo del filtro subtitles, no depende de -vf ni del tamano de los
 * PNG de entrada). Con un video de 720 de alto el factor es 720/288 = 2.5,
 * asi que FontSize=11 se renderiza a ~27.5px y MarginV=20 a ~50px de margen
 * inferior. Estos valores estan calibrados para verse bien en ese resultado:
 * no se tocan aunque cambie la resolucion de salida.
 */
const ESTILO_CINE =
  "FontName=DejaVu Sans Mono,FontSize=11,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=1,Shadow=0,Alignment=2,MarginV=20";

/**
 * Exports ya generados, pendientes de descarga. Vive en memoria, igual que
 * historiaStore: si el proceso se reinicia se pierden junto con sus ficheros
 * temporales (que tampoco sobreviven a un reinicio del contenedor).
 */
const exportsPendientes = new Map<string, ResultadoExport>();

export async function exportarHistoria(historia: Historia): Promise<ResultadoExport> {
  if (historia.parrafos.length === 0) {
    throw new Error("No hay parrafos que exportar.");
  }

  // En produccion el contenedor monta /app/tmp como volumen efimero; fuera
  // de produccion el tmp del sistema operativo sirve igual sin configurar nada.
  const raizTemp = process.env.NODE_ENV === "production" ? "/app/tmp" : os.tmpdir();
  const dir = path.join(raizTemp, `export-${randomUUID()}`);
  await fs.mkdir(dir, { recursive: true });

  try {
    const binario = env.FFMPEG_PATH ?? "ffmpeg";
    const fps = calcularFpsExport(historia.parrafos);
    const totalFrames = await renderizarFrames(historia.parrafos, dir, fps);

    await fs.writeFile(path.join(dir, NOMBRE_SRT), construirSrt(historia.parrafos), "utf8");

    const filtroSubtitulos = `subtitles=${escaparRutaParaFiltro(NOMBRE_SRT)}:force_style='${ESTILO_CINE}'`;

    await ejecutarFfmpeg(
      binario,
      [
        "-y",
        "-framerate",
        String(fps),
        "-i",
        PATRON_FRAMES,
        // Sin scale: codificarPng() ya escribe los PNG a 1280x720 (ver
        // ESCALA_PNG), asi que aqui solo hace falta quemar los subtitulos.
        "-vf",
        filtroSubtitulos,
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-r",
        "24",
        // Duracion exacta, independiente de como -framerate/fps redondeen el
        // numero de frames de entrada.
        "-t",
        String(historia.parrafos.length * DURACION_PARRAFO_S),
        "-movflags",
        "+faststart",
        NOMBRE_SALIDA,
      ],
      dir,
      TIMEOUT_FFMPEG_MS,
    );

    // Una vez el mp4 existe, los frames sueltos y el srt ya no aportan nada:
    // son mas bytes de historia ajena reposando en disco de lo necesario.
    await limpiarIntermedios(dir, totalFrames);

    const resultado: ResultadoExport = {
      token: randomUUID(),
      ruta: path.join(dir, NOMBRE_SALIDA),
      expiraEn: Date.now() + env.VIDEO_EXPIRY_SECONDS * 1000,
      canalId: historia.canalId,
    };
    exportsPendientes.set(resultado.token, resultado);
    return resultado;
  } catch (error) {
    // Si algo fallo a mitad de camino no dejamos restos: ni frames, ni srt,
    // ni un mp4 a medio codificar.
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    const mensaje = error instanceof Error ? error.message : String(error);
    throw new Error(`No se pudo exportar el video: ${mensaje}`);
  }
}

export function obtenerExport(token: string): ResultadoExport | undefined {
  return exportsPendientes.get(token);
}

/** Borra el mp4 (y el directorio que lo contenia) del disco y quita la entrada del mapa. */
export async function consumirExport(token: string): Promise<void> {
  const resultado = exportsPendientes.get(token);
  if (!resultado) return;

  exportsPendientes.delete(token);
  await fs.rm(path.dirname(resultado.ruta), { recursive: true, force: true }).catch(() => {});
}

/**
 * Barre cada 30s los exports que nadie descargo antes de expirar.
 * unref() para que este timer no le impida a node terminar limpio ante un
 * SIGTERM en el contenedor: un timer colgado convierte un cierre ordenado en
 * un kill -9 (mismo patron que iniciarBarrido en historiaStore).
 */
export function iniciarLimpiezaExports(): NodeJS.Timeout {
  const timer = setInterval(() => {
    void limpiarExportsVencidos();
  }, 30_000);
  timer.unref();
  return timer;
}

async function limpiarExportsVencidos(): Promise<void> {
  const ahora = Date.now();
  for (const [token, resultado] of exportsPendientes) {
    if (resultado.expiraEn <= ahora) {
      exportsPendientes.delete(token);
      await fs.rm(path.dirname(resultado.ruta), { recursive: true, force: true }).catch(() => {});
    }
  }
}

/**
 * FPS efectivo del video. A FPS_VIDEO literal, una historia con muchos
 * parrafos dispara la cantidad de PNGs (cada uno a 1280x720) a un volumen que
 * puede saturar el disco efimero del contenedor o tardar minutos en
 * codificarse. En vez de truncar la historia en silencio, se baja el frame
 * rate lo necesario para quedar dentro de LIMITE_FRAMES_TOTAL: se pierde
 * suavidad de animacion, nunca contenido.
 */
function calcularFps(cantidadParrafos: number): number {
  const framesDeseados = cantidadParrafos * DURACION_PARRAFO_S * FPS_VIDEO;
  if (framesDeseados <= LIMITE_FRAMES_TOTAL) return FPS_VIDEO;

  const fpsRecortado = Math.max(
    1,
    Math.floor(LIMITE_FRAMES_TOTAL / (cantidadParrafos * DURACION_PARRAFO_S)),
  );
  console.warn(
    `[export] ${cantidadParrafos} parrafos a ${FPS_VIDEO}fps generarian ${framesDeseados} frames; ` +
      `se recorta a ${fpsRecortado}fps (${cantidadParrafos * DURACION_PARRAFO_S * fpsRecortado} frames totales) ` +
      `para no saturar disco ni tiempo de exportacion.`,
  );
  return fpsRecortado;
}

/**
 * FPS efectivo de LA EXPORTACION ENTERA (no por parrafo, ver el porque en el
 * comentario de FPS_VECTOR): si algun parrafo trae svg (sala vectorial, o una
 * sala pixel con algun turno vectorial suelto), toda la historia se renderiza
 * a FPS_VECTOR. Si ninguno trae svg, el comportamiento es exactamente el de
 * siempre (calcularFps sin tocar).
 */
function calcularFpsExport(parrafos: readonly Parrafo[]): number {
  const esVectorial = parrafos.some((parrafo) => typeof parrafo.svg === "string" && parrafo.svg.length > 0);
  return esVectorial ? FPS_VECTOR : calcularFps(parrafos.length);
}

/**
 * Guarda de tipo minima antes de rasterizar. Si el parrafo no trae una
 * escena reconocible (dato corrupto, historia guardada antes de este cambio,
 * etc.) renderizarEscena() pincharia leyendo spec.fondo.color de undefined;
 * mejor caer a la escena de emergencia del propio paquete que tumbar la
 * exportacion entera por un parrafo suelto.
 */
function escenaSegura(valor: unknown): EscenaSpec {
  if (
    valor !== null &&
    typeof valor === "object" &&
    "fondo" in valor &&
    "capas" in valor &&
    Array.isArray((valor as { capas: unknown }).capas)
  ) {
    return valor as EscenaSpec;
  }
  return ESCENA_POR_DEFECTO;
}

function nombreFrame(indiceGlobal: number): string {
  return `frame-${String(indiceGlobal).padStart(5, "0")}.png`;
}

/**
 * Renderiza todos los frames de la historia con el MISMO motor que usa el
 * navegador (renderizarEscena, de @historia-paralela/escena), para que el
 * mp4 se parezca a lo que la gente vio jugando, animacion incluida.
 *
 * Un solo lienzo se reutiliza para los 20*fps frames de cada parrafo y para
 * la historia entera: crear uno por frame significaria cientos de arrays de
 * ANCHO*ALTO*4 bytes vivos a la vez sin motivo, cuando renderizarEscena ya
 * repinta el area completa en cada llamada (no hay estado que arrastrar de
 * un frame al siguiente).
 *
 * Devuelve el numero total de frames escritos (numerados globalmente y sin
 * huecos), que hace falta luego para poder borrarlos todos en limpiarIntermedios.
 */
async function renderizarFrames(
  parrafos: readonly Parrafo[],
  dir: string,
  fps: number,
): Promise<number> {
  const lienzo = crearLienzo();
  const framesPorParrafo = DURACION_PARRAFO_S * fps;
  const msPorFrame = 1000 / fps;
  let indiceGlobal = 0;
  // Compartido entre parrafos: el aviso de rsvg roto se muestra UNA vez por
  // exportacion, no una vez por parrafo vectorial que falle.
  const avisoRsvg = { mostrado: false };

  for (const parrafo of parrafos) {
    let escritoPorVector = false;

    if (typeof parrafo.svg === "string" && parrafo.svg.length > 0) {
      escritoPorVector = await renderizarParrafoVectorial(
        parrafo.svg,
        dir,
        indiceGlobal,
        framesPorParrafo,
        msPorFrame,
        avisoRsvg,
      );
    }

    if (!escritoPorVector) {
      // RAMA PIXEL, sin cambios: mismo motor de siempre. Tambien es el
      // fallback si el parrafo traia svg pero rsvg-convert fallo a mitad de
      // camino (ver renderizarParrafoVectorial): se pisan los mismos nombres
      // de archivo que ya se hubieran escrito.
      const spec = escenaSegura(parrafo.escena);

      // tMs arranca en 0 en cada parrafo: es lo mismo que hace el navegador al
      // entrar a una escena nueva, y es lo que garantiza que una animacion
      // (flotar, pulso, parpadeo...) se vea exactamente igual en el video que
      // en vivo, en vez de arrastrar el reloj acumulado de toda la historia.
      for (let indiceLocal = 0; indiceLocal < framesPorParrafo; indiceLocal++) {
        const tMs = indiceLocal * msPorFrame;
        renderizarEscena(spec, tMs, lienzo);

        const png = codificarPng(lienzo, ANCHO, ALTO, ESCALA_PNG);
        await fs.writeFile(path.join(dir, nombreFrame(indiceGlobal + indiceLocal)), png);
      }
    }

    indiceGlobal += framesPorParrafo;
  }

  return indiceGlobal;
}

/**
 * RAMA VECTOR de un parrafo: congela el SVG del parrafo en cada tMs con
 * aplicarFotogramaSvg (la MISMA calcularDesfase que usa el motor pixel, ver
 * packages/escena/src/render.ts) y convierte cada fotograma a PNG con
 * rsvg-convert, un frame a la vez y EN SERIE (mas simple y predecible que
 * paralelizar spawns de un binario externo).
 *
 * Devuelve false ante el primer frame que falle (binario ausente, timeout,
 * SVG que rsvg no pueda leer): renderizarFrames() cae entonces a la rama
 * pixel para el parrafo COMPLETO (no solo el frame que fallo), reescribiendo
 * los mismos nombres de archivo. La exportacion nunca muere por esto: en el
 * peor caso, ese turno se ve en pixel art en vez de vectorial.
 */
async function renderizarParrafoVectorial(
  svgSaneado: string,
  dir: string,
  indiceGlobalInicio: number,
  framesPorParrafo: number,
  msPorFrame: number,
  avisoRsvg: { mostrado: boolean },
): Promise<boolean> {
  for (let indiceLocal = 0; indiceLocal < framesPorParrafo; indiceLocal++) {
    const indiceGlobal = indiceGlobalInicio + indiceLocal;
    const tMs = indiceLocal * msPorFrame;
    const rutaSvg = path.join(dir, nombreFrameSvgTemporal(indiceGlobal));
    const rutaPng = path.join(dir, nombreFrame(indiceGlobal));

    try {
      const fotograma = aplicarFotogramaSvg(svgSaneado, tMs);
      await fs.writeFile(rutaSvg, fotograma, "utf8");
      await ejecutarRsvg(RSVG_PATH, rutaSvg, rutaPng, TIMEOUT_RSVG_MS);
    } catch (error) {
      if (!avisoRsvg.mostrado) {
        avisoRsvg.mostrado = true;
        const mensaje = error instanceof Error ? error.message : String(error);
        console.warn(
          `[export] rsvg-convert fallo ("${RSVG_PATH}"), se usa la rama pixel para los parrafos vectoriales de esta exportacion: ${mensaje}`,
        );
      }
      return false;
    } finally {
      // El .svg intermedio no aporta nada una vez convertido (o si fallo la
      // conversion): fuera siempre, exito o error.
      await fs.rm(rutaSvg, { force: true }).catch(() => {});
    }
  }

  return true;
}

function nombreFrameSvgTemporal(indiceGlobal: number): string {
  return `frame-${String(indiceGlobal).padStart(5, "0")}.svg`;
}

/**
 * Lanza rsvg-convert para un unico frame y espera a que termine. Rechaza si
 * el binario no existe, no responde en TIMEOUT_RSVG_MS o sale con codigo de
 * error; renderizarParrafoVectorial() decide que hacer con ese rechazo.
 */
function ejecutarRsvg(
  binario: string,
  rutaSvgEntrada: string,
  rutaPngSalida: string,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proceso = spawn(binario, [
      "-w",
      String(ANCHO * ESCALA_PNG),
      "-h",
      String(ALTO * ESCALA_PNG),
      "--background-color",
      "#0b0d1a",
      "-o",
      rutaPngSalida,
      rutaSvgEntrada,
    ]);
    let stderr = "";

    const agotado = setTimeout(() => {
      proceso.kill("SIGKILL");
      reject(new Error(`rsvg-convert no respondio en ${timeoutMs}ms y fue terminado.`));
    }, timeoutMs);
    agotado.unref();

    proceso.stderr.on("data", (fragmento: Buffer) => {
      stderr += fragmento.toString("utf8");
    });

    proceso.on("error", (error) => {
      clearTimeout(agotado);
      reject(new Error(`No se pudo lanzar rsvg-convert ("${binario}"): ${error.message}`));
    });

    proceso.on("close", (codigo) => {
      clearTimeout(agotado);
      if (codigo === 0) {
        resolve();
        return;
      }
      reject(new Error(`rsvg-convert termino con codigo ${codigo}: ${stderr.slice(-500)}`));
    });
  });
}

/**
 * Escapa una ruta para usarla dentro de un filtro de FFmpeg. Los dos puntos
 * separan opciones dentro del filtro y la barra invertida es el caracter de
 * escape de FFmpeg: sin escapar, cualquiera de los dos rompe el filtergraph
 * completo. Ejecutamos FFmpeg con cwd en el directorio temporal para poder
 * usar siempre una ruta relativa simple y minimizar este problema.
 */
function escaparRutaParaFiltro(ruta: string): string {
  return ruta.replaceAll("\\", "\\\\").replaceAll(":", "\\:");
}

function construirSrt(parrafos: readonly Parrafo[]): string {
  const bloques: string[] = [];

  parrafos.forEach((parrafo, indice) => {
    const inicioMs = indice * DURACION_PARRAFO_S * 1000;
    const finMs = (indice + 1) * DURACION_PARRAFO_S * 1000;
    // FFmpeg no entiende entidades HTML: el texto guardado esta escapado
    // (sanitize.ts lo hace dos veces por diseno), asi que hay que deshacerlo
    // antes de quemarlo en el video.
    const texto = desescaparHtml(parrafo.narracion);
    const lineas = envolverTexto(texto, ANCHO_MAXIMO_LINEA_SRT, LINEAS_MAXIMAS_POR_BLOQUE);

    bloques.push(
      [
        String(indice + 1),
        `${formatearTiempoSrt(inicioMs)} --> ${formatearTiempoSrt(finMs)}`,
        lineas.join("\n"),
        "",
      ].join("\n"),
    );
  });

  return bloques.join("\n");
}

/** Envuelve texto a ~maxAncho caracteres por linea, colapsando el resto en la ultima linea visible. */
function envolverTexto(texto: string, maxAncho: number, maxLineas: number): string[] {
  const palabras = texto.split(" ").filter(Boolean);
  const lineas: string[] = [];
  let actual = "";

  for (const palabra of palabras) {
    const candidata = actual ? `${actual} ${palabra}` : palabra;
    if (candidata.length > maxAncho && actual) {
      lineas.push(actual);
      actual = palabra;
    } else {
      actual = candidata;
    }
  }
  if (actual) lineas.push(actual);

  if (lineas.length <= maxLineas) return lineas;

  // Mas lineas de las permitidas: se colapsan las sobrantes en la ultima
  // linea visible en vez de cortar la frase (perder una palabra confunde
  // mas que una linea un poco mas larga de lo ideal).
  const visibles = lineas.slice(0, maxLineas - 1);
  const resto = lineas.slice(maxLineas - 1).join(" ");
  visibles.push(resto);
  return visibles;
}

function formatearTiempoSrt(ms: number): string {
  const horas = Math.floor(ms / 3_600_000);
  const minutos = Math.floor((ms % 3_600_000) / 60_000);
  const segundos = Math.floor((ms % 60_000) / 1000);
  const milis = ms % 1000;
  const dosDigitos = (n: number): string => n.toString().padStart(2, "0");
  return `${dosDigitos(horas)}:${dosDigitos(minutos)}:${dosDigitos(segundos)},${milis.toString().padStart(3, "0")}`;
}

/** Borra los frames PNG y el srt, y deja solo el mp4. */
async function limpiarIntermedios(dir: string, totalFrames: number): Promise<void> {
  const nombres: string[] = [NOMBRE_SRT];
  for (let indice = 0; indice < totalFrames; indice++) {
    nombres.push(nombreFrame(indice));
  }
  await Promise.all(
    nombres.map((nombre) => fs.rm(path.join(dir, nombre), { force: true }).catch(() => {})),
  );
}

/** Lanza el binario de FFmpeg y espera a que termine. Rechaza con un mensaje claro si falla o no responde. */
function ejecutarFfmpeg(
  binario: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proceso = spawn(binario, args, { cwd });
    let stderr = "";

    const agotado = setTimeout(() => {
      // Si FFmpeg se cuelga no dejamos el proceso zombie: se mata y se
      // rechaza. La limpieza del directorio la hace el catch de arriba.
      proceso.kill("SIGKILL");
      reject(new Error(`FFmpeg no respondio en ${timeoutMs}ms y fue terminado.`));
    }, timeoutMs);
    agotado.unref();

    proceso.stderr.on("data", (fragmento: Buffer) => {
      stderr += fragmento.toString("utf8");
    });

    proceso.on("error", (error) => {
      clearTimeout(agotado);
      reject(new Error(`No se pudo lanzar FFmpeg ("${binario}"): ${error.message}`));
    });

    proceso.on("close", (codigo) => {
      clearTimeout(agotado);
      if (codigo === 0) {
        resolve();
        return;
      }
      reject(new Error(`FFmpeg termino con codigo ${codigo}: ${stderr.slice(-500)}`));
    });
  });
}
