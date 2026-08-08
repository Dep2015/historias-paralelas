import { z } from "zod";

/**
 * Toda la configuracion pasa por aqui y se valida al arrancar.
 * Preferimos que el proceso muera en el boot a descubrir un secreto ausente
 * en mitad de una historia, cuando ya hay gente escribiendo.
 */
const esquema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // DeepSeek por defecto: es compatible con el formato de OpenAI, asi que
  // cualquier proveedor equivalente funciona cambiando solo la URL.
  IA_API_URL: z.string().url().default("https://api.deepseek.com"),
  IA_API_KEY: z.string().optional(),
  IA_MODELO_TEXTO: z.string().default("deepseek-v4-flash"),
  /** Acota la respuesta: un JSON truncado a mitad no se puede parsear. */
  IA_MAX_TOKENS: z.coerce.number().int().positive().max(8192).default(1400),
  /**
   * Razonamiento del modelo. Por defecto DESACTIVADO: en los deepseek-v4-* el
   * razonamiento consume el mismo max_tokens que la respuesta y deja el JSON
   * vacio (ver la medicion en services/iaClient.ts). Solo tiene sentido
   * activarlo con un max_tokens muy alto y asumiendo turnos mucho mas lentos.
   */
  IA_RAZONAMIENTO: z.enum(["disabled", "enabled"]).default("disabled"),

  PORTAL_PUBLISHABLE_KEY: z.string().optional(),
  PORTAL_SECRET_KEY: z.string().optional(),

  JWT_ISSUER: z.string().default("http://localhost:3000"),
  JWT_PRIVATE_KEY_PEM: z.string().optional(),
  JWT_SIGNING_SECRET: z.string().min(8).default("desarrollo-inseguro-cambiar"),

  FFMPEG_PATH: z.string().optional(),
  VIDEO_EXPIRY_SECONDS: z.coerce.number().int().positive().default(300),

  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(60),

  HISTORIA_DURACION_SEGUNDOS: z.coerce.number().int().positive().default(180),
  TURNO_DURACION_MS: z.coerce.number().int().positive().default(20_000),
  /**
   * Turno de las salas vectoriales. Generar un SVG completo son ~3500 tokens
   * (~21s medidos contra DeepSeek); en 20s la escena llegaria siempre un
   * turno tarde. 40s deja holgura sin matar el ritmo.
   */
  TURNO_VECTOR_MS: z.coerce.number().int().positive().default(40_000),
  TURNO_GRACIA_MS: z.coerce.number().int().nonnegative().default(3_000),

  REDIS_URL: z.string().optional(),
});

const parseado = esquema.safeParse(process.env);

if (!parseado.success) {
  console.error("[env] Configuracion invalida:", parseado.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parseado.data;

/** En produccion un secreto por defecto es un incidente, no una advertencia. */
if (env.NODE_ENV === "production" && env.JWT_SIGNING_SECRET === "desarrollo-inseguro-cambiar") {
  console.error("[env] JWT_SIGNING_SECRET sigue con el valor por defecto en produccion.");
  process.exit(1);
}

/** Sin clave de IA el backend no revienta: entra en modo demo con director simulado. */
export const hayIA = Boolean(env.IA_API_KEY);

/** Origenes permitidos por CORS (lista separada por comas). */
export const origenesPermitidos = env.CORS_ORIGIN.split(",")
  .map((o) => o.trim())
  .filter(Boolean);
