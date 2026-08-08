import type { NextFunction, Request, RequestHandler, Response } from "express";
import rateLimit from "express-rate-limit";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { env } from "./env.js";

/**
 * Defensas transversales: validacion, identidad y limites de uso.
 * Todo lo que entra del cliente pasa por aqui antes de tocar el dominio.
 */

/** Identidad minima que llevamos en la sesion. No hay datos personales. */
export interface Sesion {
  userId: string;
  nombre: string;
  canalId: string;
  exp: number;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      sesion?: Sesion;
    }
  }
}

const b64url = (buf: Buffer): string =>
  buf.toString("base64").replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");

function firmar(payload: string): string {
  return b64url(createHmac("sha256", env.JWT_SIGNING_SECRET).update(payload).digest());
}

/**
 * Token de sesion propio (HS256 casero, sin dependencias).
 * PORQUE no reusamos el JWT de Portal: aquel es para Portal y se verifica por
 * JWKS; este solo prueba "yo soy este participante de este canal" ante nuestra
 * propia API, y queremos poder rotarlo sin tocar la config de Portal.
 */
export function emitirSesion(sesion: Omit<Sesion, "exp">, ttlSegundos = 3600): string {
  const cuerpo: Sesion = { ...sesion, exp: Math.floor(Date.now() / 1000) + ttlSegundos };
  const payload = b64url(Buffer.from(JSON.stringify(cuerpo), "utf8"));
  return `${payload}.${firmar(payload)}`;
}

export function verificarSesion(token: string): Sesion | null {
  const partes = token.split(".");
  if (partes.length !== 2) return null;

  const [payload, firma] = partes;
  if (!payload || !firma) return null;

  const esperada = firmar(payload);
  // Comparacion en tiempo constante: una comparacion normal filtra la firma.
  const a = Buffer.from(firma);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const sesion = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Sesion;
    if (typeof sesion.exp !== "number" || sesion.exp * 1000 < Date.now()) return null;
    return sesion;
  } catch {
    return null;
  }
}

/** Exige sesion valida y ademas que corresponda al canal de la ruta. */
export const requiereSesion: RequestHandler = (req, res, next) => {
  const cabecera = req.header("authorization") ?? "";
  const token = cabecera.startsWith("Bearer ") ? cabecera.slice(7) : "";
  const sesion = token ? verificarSesion(token) : null;

  if (!sesion) {
    res.status(401).json({ error: "Sesion invalida o expirada." });
    return;
  }

  const canalRuta = req.params.canalId ?? (req.body as { canal?: string } | undefined)?.canal;
  if (canalRuta && canalRuta !== sesion.canalId) {
    res.status(403).json({ error: "Esa sesion no pertenece a este canal." });
    return;
  }

  req.sesion = sesion;
  next();
};

/** Valida el body contra un esquema zod y lo reemplaza por la version tipada. */
export function validarCuerpo<T extends z.ZodTypeAny>(esquema: T): RequestHandler {
  return (req, res, next) => {
    const resultado = esquema.safeParse(req.body);
    if (!resultado.success) {
      res.status(400).json({
        error: "Datos invalidos.",
        detalles: resultado.error.flatten().fieldErrors,
      });
      return;
    }
    req.body = resultado.data;
    next();
  };
}

/** Envuelve handlers async para que un reject no tumbe el proceso. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

export const limitadorGeneral = rateLimit({
  windowMs: 60_000,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas peticiones, respira un momento." },
});

/** La IA cuesta dinero: limite mas duro y por sesion, no por IP compartida. */
export const limitadorIA = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.sesion?.userId ?? req.ip ?? "anon",
  message: { error: "Estas escribiendo demasiado rapido." },
});

/** Exportar lanza FFmpeg: caro en CPU, se limita aparte. */
export const limitadorExport = rateLimit({
  windowMs: 60_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.sesion?.canalId ?? req.ip ?? "anon",
  message: { error: "Ya hay una exportacion en marcha." },
});
