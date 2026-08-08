import { fileURLToPath } from "node:url";
import path from "node:path";
import express from "express";
import helmet from "helmet";
import cors from "cors";

import { env, hayIA, origenesPermitidos } from "./lib/env.js";
import { limitadorGeneral } from "./lib/guards.js";
import { iniciarBarrido } from "./services/historiaStore.js";
import { iniciarLimpiezaExports } from "./services/videoExporter.js";
import { rutasCanales } from "./routes/canales.js";
import { rutasIa } from "./routes/ia.js";
import { rutasExport } from "./routes/export.js";
import { rutasPortal } from "./routes/portalToken.js";

const app = express();
const aqui = path.dirname(fileURLToPath(import.meta.url));

// Detras de un proxy (Docker, Fly, Render) el rate limit necesita la IP real.
app.set("trust proxy", 1);

/**
 * CSP explicita en vez de la de por defecto: necesitamos permitir las fuentes
 * pixel de Google, imagenes en data:/blob: (los frames que pixelamos en canvas)
 * y el websocket de Portal. Todo lo demas queda cerrado.
 */
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        connectSrc: ["'self'", "https://*.useportal.co", "wss://*.useportal.co"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    // Las fuentes e imagenes vienen de otro origen; COEP las bloquearia.
    crossOriginEmbedderPolicy: false,
  }),
);

app.use(
  cors({
    origin: origenesPermitidos,
    credentials: true,
  }),
);

// Limite de tamano: una frase de cuento no pesa 100kb, y las imagenes que
// suben del cliente no existen. Todo lo grande es sospechoso.
app.use(express.json({ limit: "256kb" }));

app.use("/api", limitadorGeneral);

// --- Rutas ------------------------------------------------------------------

app.get("/api/salud", (_req, res) => {
  res.json({ ok: true, historiasVivas: undefined });
});

/**
 * Config publica. Solo sale de aqui lo que el navegador PUEDE saber:
 * la publishable key de Portal, nunca la secreta ni la de IA.
 */
app.get("/api/config", (_req, res) => {
  res.json({
    portalPublishableKey: env.PORTAL_PUBLISHABLE_KEY ?? null,
    duracionSegundos: env.HISTORIA_DURACION_SEGUNDOS,
    turnoMs: env.TURNO_DURACION_MS,
    graciaMs: env.TURNO_GRACIA_MS,
    iaActiva: hayIA,
  });
});

// JWKS: se monta en la raiz porque Portal lo busca en /.well-known/jwks.json
app.use(rutasPortal);

app.use("/api/canales", rutasCanales);
app.use("/api/ia", rutasIa);
app.use("/api/export", rutasExport);

// --- Frontend estatico ------------------------------------------------------

/**
 * Un solo contenedor sirve API y bundle: mismo origen, sin CORS en produccion
 * y una superficie expuesta menos.
 */
const raizWeb = path.resolve(aqui, "../../web/dist");
app.use(express.static(raizWeb, { maxAge: "1h", index: false }));

// SPA: cualquier ruta que no sea /api cae en el index para que el front enrute.
app.get(/^\/(?!api\/).*/, (_req, res) => {
  res.sendFile(path.join(raizWeb, "index.html"), (error) => {
    if (error) res.status(404).json({ error: "No encontrado." });
  });
});

// --- Manejo de errores ------------------------------------------------------

app.use(
  (
    error: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    // El detalle solo va al log: al cliente no se le filtra la traza.
    console.error("[error]", error.message);
    res.status(500).json({ error: "Error interno." });
  },
);

// --- Arranque ---------------------------------------------------------------

const servidor = app.listen(env.PORT, () => {
  console.log(`[historia-paralela] escuchando en :${env.PORT}`);
  console.log(`[historia-paralela] IA ${hayIA ? "activa" : "simulada (sin IA_API_KEY)"}`);
  console.log(
    `[historia-paralela] Portal ${env.PORTAL_PUBLISHABLE_KEY ? "configurado" : "ausente (modo local)"}`,
  );
});

// Timers de limpieza: ambos van con unref() para no bloquear el cierre.
iniciarBarrido();
iniciarLimpiezaExports();

/**
 * Cierre ordenado: en Docker un SIGTERM sin manejar se convierte en kill -9 a
 * los 10s, y queremos que los ficheros temporales se borren antes de morir.
 */
function apagar(senal: string): void {
  console.log(`[historia-paralela] ${senal} recibido, cerrando...`);
  servidor.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5_000).unref();
}

process.on("SIGTERM", () => apagar("SIGTERM"));
process.on("SIGINT", () => apagar("SIGINT"));
