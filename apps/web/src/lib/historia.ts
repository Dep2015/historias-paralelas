import type { EscenaSpec } from "@historia-paralela/escena";

/**
 * Contrato compartido con el backend (espejo reducido de
 * apps/api/src/dominio/historia.ts). Si cambias uno, cambia el otro.
 */

export type ModoHistoria = "realtime" | "snapshot";
export type EstadoHistoria = "lobby" | "en_curso" | "terminada" | "exportada";
export type RazonFin = "tiempo" | "botones" | "todos_pasaron" | null;
/** pixel = motor de escenas en datos; vector = SVG estilo cuento animado. */
export type EstiloEscena = "pixel" | "vector";

export interface Participante {
  userId: string;
  nombre: string;
  orden: number;
  activo: boolean;
}

export interface Parrafo {
  id: string;
  indice: number;
  autorId: string;
  autorNombre: string;
  textoOriginal: string;
  narracion: string;
  /**
   * La escena EN DATOS, no una imagen: se dibuja por codigo con el motor
   * compartido (@historia-paralela/escena) y por eso puede animarse.
   * Presente siempre, tambien en salas vectoriales (plan B del SVG).
   */
  escena: EscenaSpec;
  /** Solo en salas "vector": SVG estilo cuento, saneado, con data-anim. */
  svg?: string;
  creadoEn: number;
}

export interface ResumenCanal {
  canalId: string;
  cupo: number | null;
  estilo: EstiloEscena;
  dentro: number;
  lleno: boolean;
  estado: EstadoHistoria;
  modo: ModoHistoria;
}

export interface VentanaTurno {
  modo: ModoHistoria;
  indice: number;
  ordenEnCurso: number;
  iniciaEn: number;
  terminaEn: number;
  limiteConGracia: number;
  msRestantes: number;
  rondaCompleta: boolean;
}

/** Snapshot completo que devuelve el backend en cada consulta de estado. */
export interface EstadoPublico {
  canalId: string;
  estado: EstadoHistoria;
  modo: ModoHistoria;
  cupo: number | null;
  estilo: EstiloEscena;
  dentro: number;
  participantes: Participante[];
  parrafos: Parrafo[];
  ventana: VentanaTurno;
  terminaEn: number | null;
  razonFin: RazonFin;
  /** Reloj del servidor: los clientes corrigen su desfase con esto. */
  servidorAhora: number;
}

export interface SesionActiva {
  token: string;
  portalToken: string;
  canalId: string;
  userId: string;
  nombre: string;
  orden: number;
}

export interface ConfigPublica {
  portalPublishableKey: string | null;
  duracionSegundos: number;
  turnoMs: number;
  graciaMs: number;
  iaActiva: boolean;
}

/** Mensaje que viaja por el canal de Portal. Siempre efimero. */
export interface MensajeCanal {
  tipo: "parrafo" | "estado" | "fin";
  /** Presente cuando tipo === "parrafo". */
  parrafo?: Parrafo;
  /** Presente cuando tipo === "fin". */
  razon?: RazonFin;
  /**
   * userIds a los que el bridge de notify debe avisar (todos los activos
   * menos el emisor). Portal no expone un "difundir a todos" en ese campo,
   * asi que la lista se manda explicita. Ver portal.config.ts.
   */
  destinatarios?: string[];
  emitidoEn: number;
}
