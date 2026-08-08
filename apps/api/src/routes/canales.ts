import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { asyncHandler, emitirSesion, requiereSesion, validarCuerpo } from "../lib/guards.js";
import { esCanalValido, sanearFrase } from "../lib/sanitize.js";
import { historiaStore } from "../services/historiaStore.js";
import { razonDeFin } from "../services/turnos.js";
// La funcion vive en ia.ts (la construye otro modulo del proyecto): no se
// redefine aqui para no tener dos nociones distintas de "estado publico".
import { estadoPublico } from "./ia.js";
import { emitirTokenPortal } from "./portalToken.js";

/**
 * Rutas de canal: listar salas, crear una, entrar/salir, y el ciclo
 * iniciar -> estado -> terminar de una historia. El estado real vive en
 * historiaStore; aqui solo se valida entrada, se autoriza sesion y se
 * traduce a JSON.
 */
export const rutasCanales = Router();

/** Id de canal corto y legible en URL. No es secreto, solo un identificador. */
function generarCanalId(): string {
  const sufijo = randomUUID().replace(/-/g, "").slice(0, 6);
  return `hist-${sufijo}`;
}

rutasCanales.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json({ canales: historiaStore.listarResumenes() });
  }),
);

const esquemaCrear = z.object({
  canalId: z.string().optional(),
  // Maximo 2: la experiencia esta pensada para duos. Ya no hay "ilimitado".
  cupo: z.number().int().min(1).max(2),
  // "vector" = escenas SVG estilo cuento animado (turnos de 40s);
  // "pixel" = motor de escenas en datos (turnos de 20s).
  estilo: z.enum(["pixel", "vector"]).default("pixel"),
});

rutasCanales.post(
  "/",
  validarCuerpo(esquemaCrear),
  asyncHandler(async (req, res) => {
    // validarCuerpo ya valido la forma; el cast solo describe lo que sabemos.
    const cuerpo = req.body as z.infer<typeof esquemaCrear>;
    const canalId = cuerpo.canalId ?? generarCanalId();

    if (!esCanalValido(canalId)) {
      res.status(400).json({ error: "Id de canal invalido." });
      return;
    }

    // Todavia no hay sesion (la sala se crea antes de que nadie "entre" con
    // su nombre): el creador queda anonimo hasta el primer POST .../entrar.
    historiaStore.crear(canalId, cuerpo.cupo, randomUUID(), cuerpo.estilo);

    const resumen = historiaStore.resumen(canalId);
    if (!resumen) {
      // Solo pasaria si el canal se purgo entre crear() y resumen(), algo
      // que no deberia ocurrir con el TTL de horas que usa el barredor.
      res.status(500).json({ error: "No se pudo crear el canal." });
      return;
    }
    res.json(resumen);
  }),
);

rutasCanales.get(
  "/:canalId",
  asyncHandler(async (req, res) => {
    const canalId = req.params.canalId;
    if (!canalId) {
      res.status(404).json({ error: "Canal no encontrado." });
      return;
    }

    const resumen = historiaStore.resumen(canalId);
    if (!resumen) {
      res.status(404).json({ error: "Canal no encontrado." });
      return;
    }
    res.json(resumen);
  }),
);

const esquemaEntrar = z.object({
  nombre: z.string().min(1).max(24),
});

rutasCanales.post(
  "/:canalId/entrar",
  validarCuerpo(esquemaEntrar),
  asyncHandler(async (req, res) => {
    const canalId = req.params.canalId;
    if (!canalId) {
      res.status(404).json({ error: "Canal no encontrado." });
      return;
    }

    // validarCuerpo ya valido la forma; el cast solo describe lo que sabemos.
    const cuerpo = req.body as z.infer<typeof esquemaEntrar>;
    const nombre = sanearFrase(cuerpo.nombre);
    if (!nombre) {
      res.status(400).json({ error: "Nombre invalido." });
      return;
    }

    const userId = randomUUID();
    const resultado = historiaStore.unir(canalId, userId, nombre);

    if (!resultado.ok) {
      // El codigo "lleno" es el que usa la UI para el mensaje de cupo.
      res.status(409).json({ error: resultado.motivo, codigo: resultado.codigo });
      return;
    }

    const token = emitirSesion({ userId, nombre, canalId });
    const portalToken = await emitirTokenPortal(userId, nombre, canalId);

    res.json({
      token,
      portalToken,
      canalId,
      userId,
      nombre,
      orden: resultado.participante.orden,
    });
  }),
);

rutasCanales.post(
  "/:canalId/salir",
  requiereSesion,
  asyncHandler(async (req, res) => {
    // requiereSesion ya lo garantiza en runtime, pero el tipo de Express
    // sigue siendo opcional: lo repetimos en vez de forzar un cast inseguro.
    const sesion = req.sesion;
    if (!sesion) {
      res.status(401).json({ error: "Sesion invalida o expirada." });
      return;
    }
    historiaStore.salir(sesion.canalId, sesion.userId);
    res.json({ ok: true });
  }),
);

rutasCanales.post(
  "/:canalId/iniciar",
  requiereSesion,
  asyncHandler(async (req, res) => {
    const canalId = req.params.canalId;
    if (!canalId) {
      res.status(404).json({ error: "Canal no encontrado." });
      return;
    }

    const historia = historiaStore.iniciar(canalId);
    if (!historia) {
      res.status(404).json({ error: "Canal no encontrado." });
      return;
    }
    res.json(estadoPublico(historia));
  }),
);

rutasCanales.get(
  "/:canalId/estado",
  requiereSesion,
  asyncHandler(async (req, res) => {
    const canalId = req.params.canalId;
    if (!canalId) {
      res.status(404).json({ error: "Canal no encontrado." });
      return;
    }

    let historia = historiaStore.obtener(canalId);
    if (!historia) {
      res.status(404).json({ error: "Canal no encontrado." });
      return;
    }

    // El fin por tiempo debe ocurrir aunque nadie pulse "terminar": se
    // revisa en cada lectura de estado, que es lo que el cliente hace en
    // bucle mientras la historia esta en curso.
    const razon = razonDeFin(historia, Date.now());
    if (razon && historia.estado === "en_curso") {
      historia = historiaStore.terminar(canalId, razon) ?? historia;
    }

    res.json(estadoPublico(historia));
  }),
);

rutasCanales.post(
  "/:canalId/terminar",
  requiereSesion,
  asyncHandler(async (req, res) => {
    const canalId = req.params.canalId;
    if (!canalId) {
      res.status(404).json({ error: "Canal no encontrado." });
      return;
    }

    const historia = historiaStore.terminar(canalId, "botones");
    if (!historia) {
      res.status(404).json({ error: "Canal no encontrado." });
      return;
    }
    res.json(estadoPublico(historia));
  }),
);
