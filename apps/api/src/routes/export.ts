import { Router } from "express";
import { asyncHandler, limitadorExport, requiereSesion } from "../lib/guards.js";
import { historiaStore } from "../services/historiaStore.js";
import { consumirExport, exportarHistoria, obtenerExport } from "../services/videoExporter.js";

/**
 * Exportacion a video: el unico camino de salida de una historia.
 *
 * Dos rutas con contratos de seguridad distintos:
 *  - POST /:canalId exige sesion: solo alguien del canal puede pedir el video.
 *  - GET /descargar/:token NO exige sesion: el token opaco (UUID de un solo
 *    uso, generado por el servidor al exportar) YA ES la credencial. Ademas
 *    esta URL se dispara como descarga directa (un enlace, no un fetch
 *    autenticado del cliente SPA), asi que exigir sesion aqui simplemente
 *    romperia la descarga.
 */

export const rutasExport = Router();

rutasExport.post(
  "/:canalId",
  requiereSesion,
  limitadorExport,
  asyncHandler(async (req, res) => {
    const canalId = req.params.canalId;
    if (!canalId) {
      res.status(404).json({ error: "Canal no encontrado." });
      return;
    }

    const historia = historiaStore.obtener(canalId);
    if (!historia) {
      res.status(404).json({ error: "Canal no encontrado." });
      return;
    }

    if (historia.parrafos.length === 0) {
      res.status(409).json({ error: "No hay historia que exportar." });
      return;
    }

    // Si el reloj sigue corriendo, cerramos la historia antes de filmarla:
    // exportar una historia a medias no tiene sentido narrativo.
    if (historia.estado === "en_curso") {
      historiaStore.terminar(canalId, "botones");
    }

    try {
      const resultado = await exportarHistoria(historia);
      historiaStore.marcarEstado(canalId, "exportada");
      res.json({ url: `/api/export/descargar/${resultado.token}`, expiraEn: resultado.expiraEn });
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : "Fallo desconocido exportando el video.";
      res.status(503).json({ error: mensaje });
    }
  }),
);

rutasExport.get("/descargar/:token", (req, res) => {
  const token = req.params.token;
  if (!token) {
    res.status(404).json({ error: "Enlace de descarga invalido." });
    return;
  }

  const resultado = obtenerExport(token);
  if (!resultado || resultado.expiraEn < Date.now()) {
    res.status(404).json({ error: "El enlace no existe o ya expiro." });
    return;
  }

  res.setHeader("Content-Type", "video/mp4");
  res.setHeader("Content-Disposition", 'attachment; filename="historia-paralela.mp4"');

  res.sendFile(resultado.ruta, (error) => {
    if (error) {
      // La respuesta puede haber empezado a enviarse ya; solo fijamos el
      // status si todavia estamos a tiempo de hacerlo.
      if (!res.headersSent) {
        res.status(404).json({ error: "No se pudo leer el video." });
      }
      return;
    }

    // El video se entrega una unica vez: en cuanto termina de enviarse se
    // borra del disco y la historia deja de existir. Fire-and-forget porque
    // la respuesta HTTP ya se cerro; el catch solo evita un unhandled
    // rejection si el borrado en disco fallara.
    void consumirExport(token)
      .then(() => historiaStore.eliminar(resultado.canalId))
      .catch((errorLimpieza: unknown) => {
        console.error("[export] fallo limpiando tras la descarga:", errorLimpieza);
      });
  });
});
