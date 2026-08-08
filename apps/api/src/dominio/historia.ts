import type { EscenaSpec } from "@historia-paralela/escena";

/**
 * Tipos del dominio. Se duplican (reducidos) en apps/web/src/lib/historia.ts:
 * son pocos y estables, y un paquete compartido obligaria a compilar el
 * workspace entero antes de levantar el frontend.
 */

/** Un canal = una historia. El modo NO se elige: lo dicta la presencia. */
export type ModoHistoria = "realtime" | "snapshot";

/**
 * Estilo visual de la sala, elegido por quien la crea:
 *  - "pixel": motor de escenas en datos (EscenaSpec), turnos de 20s.
 *  - "vector": DeepSeek dibuja cada escena en SVG estilo cuento infantil,
 *    animado por el contrato data-anim. Generar un SVG tarda ~20s, asi que
 *    estas salas usan turnos de 40s (TURNO_VECTOR_MS).
 */
export type EstiloEscena = "pixel" | "vector";

export type EstadoHistoria =
  | "lobby" // creada, esperando gente
  | "en_curso" // corriendo el cronometro
  | "terminada" // se acabo el tiempo, pasaron todos, o alguien pulso Terminar
  | "exportada"; // ya se entrego el video; el estado esta por desaparecer

export interface Participante {
  userId: string;
  nombre: string;
  /** Numero de orden 1..N segun el momento de conexion. Define el orden del cuento. */
  orden: number;
  unidoEn: number;
  activo: boolean;
}

export interface Parrafo {
  id: string;
  /** Posicion en la historia final. */
  indice: number;
  autorId: string;
  autorNombre: string;
  /** Lo que tecleo la persona, ya saneado. */
  textoOriginal: string;
  /** Lo que devolvio la IA directora: el parrafo de cuento encadenado. */
  narracion: string;
  /**
   * La escena EN DATOS, no una imagen. La IA describe que hay y donde, y el
   * pixel art se dibuja por codigo (mismo motor en navegador y backend), lo
   * que ademas permite que la escena tenga movimiento.
   *
   * Presente SIEMPRE, tambien en salas vectoriales: es el plan B si el SVG
   * no llega (el cliente y el video caen a pintarla con el motor pixel).
   */
  escena: EscenaSpec;
  /**
   * Solo en salas "vector": el dibujo SVG estilo cuento, YA saneado
   * (sin scripts) y con las animaciones declaradas via atributos data-anim.
   */
  svg?: string;
  creadoEn: number;
}

export interface Historia {
  canalId: string;
  /**
   * Cupo maximo, 1 o 2. La experiencia esta pensada para duos: mas gente
   * diluye los turnos y dispara el costo de IA. Se valida SIEMPRE en servidor
   * (el tipo conserva null por compatibilidad, pero ya no se crea ilimitado).
   */
  cupo: number | null;
  /** Estilo visual elegido al crear la sala. */
  estilo: EstiloEscena;
  creadorId: string;
  estado: EstadoHistoria;
  participantes: Participante[];
  parrafos: Parrafo[];
  creadaEn: number;
  /** Momento en que arranco el cronometro (y el cronograma de turnos). */
  iniciadaEn: number | null;
  /** Instante limite absoluto. Derivado de iniciadaEn + duracion. */
  terminaEn: number | null;
  /** Quien y por que se termino, para mostrarlo en la pantalla final. */
  razonFin: "tiempo" | "botones" | "todos_pasaron" | null;
  /** Marca de la ultima llamada a IA, para el rate limit por canal. */
  ultimaIaEn: number;
  /** Contador monotono para asignar numeros de orden sin reusar. */
  siguienteOrden: number;
}

/** Vista publica del canal que se muestra en el menu ANTES de entrar. */
export interface ResumenCanal {
  canalId: string;
  cupo: number | null;
  estilo: EstiloEscena;
  dentro: number;
  lleno: boolean;
  estado: EstadoHistoria;
  modo: ModoHistoria;
}

export interface RespuestaDirector {
  narracion: string;
  escena: EscenaSpec;
  /** Solo la produce el director vectorial; ya saneada. */
  svg?: string;
}
