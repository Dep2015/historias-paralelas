import { Router } from "express";
import { z } from "zod";
import { asyncHandler, limitadorIA, requiereSesion, validarCuerpo } from "../lib/guards.js";
import { sanearFrase } from "../lib/sanitize.js";
import type { EstadoHistoria, Historia, ModoHistoria, Parrafo } from "../dominio/historia.js";
import { historiaStore } from "../services/historiaStore.js";
import { narrar, narrarVector } from "../services/director.js";
import {
  calcularModo,
  calcularVentana,
  participantesActivos,
  puedeIntegrar,
  type VentanaTurno,
} from "../services/turnos.js";

/**
 * Ruta unica del turno de juego: recibe la frase de un participante, la pasa
 * por el director (real o simulado) y devuelve el parrafo resultante junto
 * con el snapshot publico completo, para que el cliente no tenga que hacer
 * una segunda peticion para refrescar pantalla.
 */

export const rutasIa = Router();

const cuerpoNarrar = z.object({
  canal: z.string(),
  // 280, como un tweet (ver LARGO_MAXIMO_FRASE en lib/sanitize.ts, que igual
  // recorta a ese largo): frases cortas mantienen el ritmo del juego.
  nuevoMaterial: z.string().min(1).max(280),
});

rutasIa.post(
  "/narrar",
  requiereSesion,
  limitadorIA,
  validarCuerpo(cuerpoNarrar),
  asyncHandler(async (req, res) => {
    // requiereSesion ya lo garantiza en runtime, pero el tipo de Express
    // sigue siendo opcional: lo repetimos en vez de forzar un cast inseguro.
    const sesion = req.sesion;
    if (!sesion) {
      res.status(401).json({ error: "Sesion invalida o expirada." });
      return;
    }

    // validarCuerpo ya valido la forma; el cast solo describe lo que sabemos.
    const cuerpo = req.body as { canal: string; nuevoMaterial: string };

    const textoOriginal = sanearFrase(cuerpo.nuevoMaterial);
    if (!textoOriginal) {
      res.status(400).json({ error: "El texto quedo vacio tras sanearlo." });
      return;
    }

    const historia = historiaStore.obtener(sesion.canalId);
    if (!historia) {
      res.status(404).json({ error: "La historia no existe." });
      return;
    }

    const veredicto = puedeIntegrar(historia, sesion.userId, Date.now());
    if (!veredicto.permitido) {
      res.status(409).json({ error: veredicto.motivo });
      return;
    }

    // Solo las narraciones ya contadas forman el acumulado: el texto crudo de
    // cada quien no es "cuento", es la materia prima que el director convierte.
    const acumulado = historia.parrafos.map((p) => p.narracion);
    // Ambas funciones resuelven IA real vs simulada y nunca lanzan: siempre
    // devuelven narracion + escena (la escena EN DATOS, plan B pixel), y en
    // salas vectoriales ademas el svg si la IA lo produjo y saneo bien.
    const resultado = historia.estilo === "vector"
      ? await narrarVector(acumulado, textoOriginal)
      : await narrar(acumulado, textoOriginal);

    const parrafo = historiaStore.agregarParrafo(historia.canalId, {
      autorId: sesion.userId,
      autorNombre: sesion.nombre,
      textoOriginal,
      narracion: resultado.narracion,
      escena: resultado.escena,
      svg: resultado.svg,
    });

    if (!parrafo) {
      // Solo pasaria si la historia se purgo entre el check de arriba y aqui.
      res.status(404).json({ error: "La historia ya no existe." });
      return;
    }

    res.json({ parrafo, estado: estadoPublico(historia) });
  }),
);

/** Version publica de un participante: sin datos que no le sirvan al cliente. */
export interface ParticipantePublico {
  userId: string;
  nombre: string;
  orden: number;
  activo: boolean;
}

/** Snapshot completo de un canal, lo unico que el cliente necesita para pintar pantalla. */
export interface EstadoPublico {
  canalId: string;
  estado: EstadoHistoria;
  modo: ModoHistoria;
  cupo: number | null;
  estilo: Historia["estilo"];
  dentro: number;
  participantes: ParticipantePublico[];
  parrafos: Parrafo[];
  ventana: VentanaTurno;
  terminaEn: number | null;
  razonFin: Historia["razonFin"];
  servidorAhora: number;
}

export function estadoPublico(historia: Historia): EstadoPublico {
  const activos = participantesActivos(historia);
  // Una sola marca de tiempo para ventana y servidorAhora: evita que un ms
  // de diferencia entre dos Date.now() desincronice al cliente sin motivo.
  const ahora = Date.now();

  return {
    canalId: historia.canalId,
    estado: historia.estado,
    modo: calcularModo(activos.length),
    cupo: historia.cupo,
    estilo: historia.estilo,
    dentro: activos.length,
    participantes: historia.participantes.map((p) => ({
      userId: p.userId,
      nombre: p.nombre,
      orden: p.orden,
      activo: p.activo,
    })),
    parrafos: historia.parrafos,
    ventana: calcularVentana(historia, ahora),
    terminaEn: historia.terminaEn,
    razonFin: historia.razonFin,
    servidorAhora: ahora,
  };
}
