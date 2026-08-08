import { env } from "../lib/env.js";
import type { Historia, ModoHistoria } from "../dominio/historia.js";

/**
 * Orquestacion de turnos.
 *
 * PORQUE ES DETERMINISTA: el cronograma se deriva de `iniciadaEn` + constantes,
 * asi que servidor y todos los clientes calculan exactamente la misma ventana
 * sin necesidad de que nadie difunda "ahora te toca". Si un cliente se
 * reconecta a mitad de historia, recalcula y cae en el mismo turno que el
 * resto. El servidor no confia en el cliente: revalida con la misma funcion.
 */

/** El modo NO se configura: lo dicta la presencia real en el canal. */
export function calcularModo(participantesActivos: number): ModoHistoria {
  return participantesActivos <= 1 ? "realtime" : "snapshot";
}

export interface VentanaTurno {
  modo: ModoHistoria;
  /** Turno 0-based. -1 si la historia aun no arranco. */
  indice: number;
  /** Numero de orden (1-based) del participante que se esta integrando. */
  ordenEnCurso: number;
  iniciaEn: number;
  terminaEn: number;
  /** Incluye el margen de gracia: hasta aqui se acepta un parrafo tardio. */
  limiteConGracia: number;
  msRestantes: number;
  /** Ya pasaron todos los participantes al menos una vez. */
  rondaCompleta: boolean;
}

/**
 * Ventana de integracion vigente.
 * En realtime devuelve una ventana abierta: el unico participante escribe sin
 * esperar turno y cada frase suya dispara a la IA.
 */
export function calcularVentana(historia: Historia, ahora: number): VentanaTurno {
  const activos = participantesActivos(historia);
  const modo = calcularModo(activos.length);

  if (historia.iniciadaEn === null) {
    return {
      modo,
      indice: -1,
      ordenEnCurso: 0,
      iniciaEn: 0,
      terminaEn: 0,
      limiteConGracia: 0,
      msRestantes: 0,
      rondaCompleta: false,
    };
  }

  if (modo === "realtime") {
    const fin = historia.terminaEn ?? ahora;
    return {
      modo,
      indice: 0,
      ordenEnCurso: activos[0]?.orden ?? 1,
      iniciaEn: historia.iniciadaEn,
      terminaEn: fin,
      limiteConGracia: fin + env.TURNO_GRACIA_MS,
      msRestantes: Math.max(0, fin - ahora),
      rondaCompleta: false,
    };
  }

  const transcurrido = Math.max(0, ahora - historia.iniciadaEn);
  const indice = Math.floor(transcurrido / env.TURNO_DURACION_MS);
  const iniciaEn = historia.iniciadaEn + indice * env.TURNO_DURACION_MS;
  const terminaEn = iniciaEn + env.TURNO_DURACION_MS;

  // El orden gira sobre la lista de activos: si sobra tiempo tras pasar todos,
  // se vuelve al #1 y la historia sigue creciendo hasta que se acabe el reloj.
  const total = Math.max(1, activos.length);
  const posicion = indice % total;
  const ordenEnCurso = activos[posicion]?.orden ?? 1;

  return {
    modo,
    indice,
    ordenEnCurso,
    iniciaEn,
    terminaEn,
    limiteConGracia: terminaEn + env.TURNO_GRACIA_MS,
    msRestantes: Math.max(0, terminaEn - ahora),
    rondaCompleta: indice >= total,
  };
}

/** Participantes activos ordenados por su numero de orden (el orden del cuento). */
export function participantesActivos(historia: Historia) {
  return historia.participantes
    .filter((p) => p.activo)
    .sort((a, b) => a.orden - b.orden);
}

export interface VeredictoIntegracion {
  permitido: boolean;
  motivo?: string;
}

/**
 * Autoridad de turno. El cliente propone; esto decide.
 * Sin esta revalidacion, cualquiera podria adelantarse en la cola publicando
 * su parrafo fuera de su ventana.
 */
export function puedeIntegrar(
  historia: Historia,
  userId: string,
  ahora: number,
): VeredictoIntegracion {
  if (historia.estado !== "en_curso") {
    return { permitido: false, motivo: "La historia no esta en curso." };
  }

  const yo = historia.participantes.find((p) => p.userId === userId && p.activo);
  if (!yo) {
    return { permitido: false, motivo: "No estas en este canal." };
  }

  const ventana = calcularVentana(historia, ahora);

  if (ventana.modo === "realtime") {
    // Unico limite en realtime: no saturar la IA. El ritmo lo marca la persona.
    const desdeUltima = ahora - historia.ultimaIaEn;
    if (desdeUltima < MIN_MS_ENTRE_IA_REALTIME) {
      return { permitido: false, motivo: "Vas demasiado rapido, espera un segundo." };
    }
    return { permitido: true };
  }

  if (yo.orden !== ventana.ordenEnCurso) {
    return {
      permitido: false,
      motivo: `Aun no es tu turno (va el #${ventana.ordenEnCurso}, tu eres el #${yo.orden}).`,
    };
  }

  // El margen de gracia existe para no cortar a alguien a media frase.
  if (ahora > ventana.limiteConGracia) {
    return { permitido: false, motivo: "Se te paso el turno." };
  }

  return { permitido: true };
}

/** Rate limit por canal: en snapshot el propio turno ya lo acota. */
const MIN_MS_ENTRE_IA_REALTIME = 2_000;

/** Motivo de fin, o null si la historia sigue viva. */
export function razonDeFin(
  historia: Historia,
  ahora: number,
): "tiempo" | "todos_pasaron" | null {
  if (historia.iniciadaEn === null || historia.terminaEn === null) return null;
  if (ahora >= historia.terminaEn) return "tiempo";

  // En snapshot con cupo cerrado, si ya paso el ultimo la historia esta contada.
  const activos = participantesActivos(historia);
  if (activos.length > 1 && historia.cupo !== null && activos.length >= historia.cupo) {
    const ventana = calcularVentana(historia, ahora);
    if (ventana.indice >= activos.length) return "todos_pasaron";
  }

  return null;
}
