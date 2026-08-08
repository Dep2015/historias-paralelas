import { randomUUID } from "node:crypto";
import { env } from "../lib/env.js";
import type {
  EstadoHistoria,
  EstiloEscena,
  Historia,
  Parrafo,
  Participante,
  ResumenCanal,
} from "../dominio/historia.js";
import { calcularModo, participantesActivos } from "./turnos.js";

/**
 * Estado EFIMERO de las historias. Un Map en memoria, nada mas.
 *
 * REGLA DE ORO del proyecto: nada de historias persiste. No hay tabla, no hay
 * fichero, no hay Redis. Cuando el proceso muere, o cuando la historia se
 * exporta, deja de existir. El barredor de abajo garantiza que ni siquiera una
 * historia abandonada sobreviva indefinidamente en RAM.
 */

/** Margen tras el final antes de purgar: da tiempo a exportar y descargar. */
const TTL_TRAS_FIN_MS = 10 * 60 * 1000;
/** Una sala creada y nunca usada tampoco puede quedarse para siempre. */
const TTL_LOBBY_MS = 30 * 60 * 1000;
const INTERVALO_BARRIDO_MS = 30 * 1000;

export type ResultadoUnion =
  | { ok: true; historia: Historia; participante: Participante }
  | { ok: false; motivo: string; codigo: "lleno" | "terminada" | "invalido" };

class HistoriaStore {
  private readonly historias = new Map<string, Historia>();

  /** Crea la sala. El creador fija el cupo y ese cupo manda en el servidor. */
  crear(
    canalId: string,
    cupo: number | null,
    creadorId: string,
    estilo: EstiloEscena = "pixel",
  ): Historia {
    const existente = this.historias.get(canalId);
    if (existente) return existente;

    // Tope duro de 2 aunque la ruta ya lo valide: el store es la ultima
    // linea, y un "ilimitado" heredado (null) tambien se normaliza aqui.
    const cupoAcotado = cupo === null ? 2 : Math.max(1, Math.min(2, cupo));

    const historia: Historia = {
      canalId,
      cupo: cupoAcotado,
      estilo,
      creadorId,
      estado: "lobby",
      participantes: [],
      parrafos: [],
      creadaEn: Date.now(),
      iniciadaEn: null,
      terminaEn: null,
      razonFin: null,
      ultimaIaEn: 0,
      siguienteOrden: 1,
    };

    this.historias.set(canalId, historia);
    return historia;
  }

  obtener(canalId: string): Historia | undefined {
    return this.historias.get(canalId);
  }

  /** Vista publica para el menu: se puede consultar SIN estar dentro. */
  resumen(canalId: string): ResumenCanal | undefined {
    const historia = this.historias.get(canalId);
    if (!historia) return undefined;

    const dentro = participantesActivos(historia).length;
    return {
      canalId: historia.canalId,
      cupo: historia.cupo,
      estilo: historia.estilo,
      dentro,
      lleno: historia.cupo !== null && dentro >= historia.cupo,
      estado: historia.estado,
      modo: calcularModo(dentro),
    };
  }

  listarResumenes(): ResumenCanal[] {
    const salas: ResumenCanal[] = [];
    for (const canalId of this.historias.keys()) {
      const resumen = this.resumen(canalId);
      if (resumen) salas.push(resumen);
    }
    return salas;
  }

  /**
   * Alta de un participante. Aqui vive la verificacion de cupo del servidor:
   * la UI tambien lo comprueba, pero la UI es una sugerencia, no una defensa.
   */
  unir(canalId: string, userId: string, nombre: string): ResultadoUnion {
    const historia = this.historias.get(canalId);
    if (!historia) {
      return { ok: false, motivo: "El canal no existe.", codigo: "invalido" };
    }
    if (historia.estado === "terminada" || historia.estado === "exportada") {
      return { ok: false, motivo: "Esta historia ya termino.", codigo: "terminada" };
    }

    // Reconexion: si ya tenia numero de orden, lo conserva. El orden del cuento
    // no puede cambiar porque a alguien se le caiga el wifi.
    const previo = historia.participantes.find((p) => p.userId === userId);
    if (previo) {
      previo.activo = true;
      previo.nombre = nombre;
      return { ok: true, historia, participante: previo };
    }

    const dentro = participantesActivos(historia).length;
    if (historia.cupo !== null && dentro >= historia.cupo) {
      return { ok: false, motivo: "El canal esta lleno.", codigo: "lleno" };
    }

    const participante: Participante = {
      userId,
      nombre,
      orden: historia.siguienteOrden++,
      unidoEn: Date.now(),
      activo: true,
    };
    historia.participantes.push(participante);

    return { ok: true, historia, participante };
  }

  /** Marca inactivo sin borrar: su numero de orden sigue reservado. */
  salir(canalId: string, userId: string): void {
    const historia = this.historias.get(canalId);
    if (!historia) return;

    const participante = historia.participantes.find((p) => p.userId === userId);
    if (participante) participante.activo = false;

    // Sala vacia y sin nada escrito: no hay nada que preservar.
    if (participantesActivos(historia).length === 0 && historia.parrafos.length === 0) {
      this.eliminar(canalId);
    }
  }

  /** Arranca el cronometro. Idempotente: el primero que llega fija el reloj. */
  iniciar(canalId: string): Historia | undefined {
    const historia = this.historias.get(canalId);
    if (!historia || historia.estado !== "lobby") return historia;

    const ahora = Date.now();
    historia.estado = "en_curso";
    historia.iniciadaEn = ahora;
    historia.terminaEn = ahora + env.HISTORIA_DURACION_SEGUNDOS * 1000;
    return historia;
  }

  /** Anade el parrafo ya narrado por la IA. El indice lo fija el servidor. */
  agregarParrafo(
    canalId: string,
    datos: Omit<Parrafo, "id" | "indice" | "creadoEn">,
  ): Parrafo | undefined {
    const historia = this.historias.get(canalId);
    if (!historia) return undefined;

    const parrafo: Parrafo = {
      ...datos,
      id: randomUUID(),
      indice: historia.parrafos.length,
      creadoEn: Date.now(),
    };
    historia.parrafos.push(parrafo);
    historia.ultimaIaEn = parrafo.creadoEn;
    return parrafo;
  }

  terminar(canalId: string, razon: Historia["razonFin"]): Historia | undefined {
    const historia = this.historias.get(canalId);
    if (!historia || historia.estado === "terminada" || historia.estado === "exportada") {
      return historia;
    }
    historia.estado = "terminada";
    historia.razonFin = razon;
    historia.terminaEn = Math.min(historia.terminaEn ?? Date.now(), Date.now());
    return historia;
  }

  marcarEstado(canalId: string, estado: EstadoHistoria): void {
    const historia = this.historias.get(canalId);
    if (historia) historia.estado = estado;
  }

  /** Borrado explicito. Se llama en cuanto el video se entrega. */
  eliminar(canalId: string): void {
    this.historias.delete(canalId);
  }

  /** Solo para diagnostico; nunca expone contenido de historias. */
  tamano(): number {
    return this.historias.size;
  }

  /** Purga historias vencidas. Una historia olvidada tampoco puede quedarse. */
  barrer(ahora = Date.now()): number {
    let purgadas = 0;

    for (const [canalId, historia] of this.historias) {
      const finReal = historia.terminaEn ?? historia.creadaEn;
      const vencida =
        historia.estado === "exportada"
          ? true
          : historia.estado === "lobby"
            ? ahora - historia.creadaEn > TTL_LOBBY_MS
            : ahora - finReal > TTL_TRAS_FIN_MS;

      if (vencida) {
        this.historias.delete(canalId);
        purgadas++;
      }
    }

    return purgadas;
  }
}

export const historiaStore = new HistoriaStore();

/**
 * unref() para que el barredor no impida que el proceso termine: en un
 * contenedor, un timer colgado convierte un SIGTERM limpio en un kill -9.
 */
export function iniciarBarrido(): NodeJS.Timeout {
  const timer = setInterval(() => historiaStore.barrer(), INTERVALO_BARRIDO_MS);
  timer.unref();
  return timer;
}
