import type {
  ConfigPublica,
  EstadoPublico,
  ResumenCanal,
  SesionActiva,
} from "./historia.js";

/**
 * Unico punto de contacto con el backend. Centralizado para que el token de
 * sesion se adjunte siempre y ningun componente pueda olvidarlo.
 */

const BASE = "/api";

export class ErrorApi extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly codigo?: string,
  ) {
    super(message);
    this.name = "ErrorApi";
  }
}

async function pedir<T>(
  ruta: string,
  opciones: RequestInit & { token?: string } = {},
): Promise<T> {
  const { token, headers, ...resto } = opciones;

  const respuesta = await fetch(`${BASE}${ruta}`, {
    ...resto,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });

  const texto = await respuesta.text();
  const cuerpo = texto ? (JSON.parse(texto) as Record<string, unknown>) : {};

  if (!respuesta.ok) {
    throw new ErrorApi(
      typeof cuerpo.error === "string" ? cuerpo.error : "Error inesperado.",
      respuesta.status,
      typeof cuerpo.codigo === "string" ? cuerpo.codigo : undefined,
    );
  }

  return cuerpo as T;
}

export const api = {
  config: () => pedir<ConfigPublica>("/config"),

  listarCanales: () => pedir<{ canales: ResumenCanal[] }>("/canales"),

  verCanal: (canalId: string) => pedir<ResumenCanal>(`/canales/${canalId}`),

  crearCanal: (canalId: string, cupo: number | null) =>
    pedir<ResumenCanal>("/canales", {
      method: "POST",
      body: JSON.stringify({ canalId, cupo }),
    }),

  entrar: (canalId: string, nombre: string) =>
    pedir<SesionActiva>(`/canales/${canalId}/entrar`, {
      method: "POST",
      body: JSON.stringify({ nombre }),
    }),

  salir: (canalId: string, token: string) =>
    pedir<{ ok: true }>(`/canales/${canalId}/salir`, { method: "POST", token }),

  iniciar: (canalId: string, token: string) =>
    pedir<EstadoPublico>(`/canales/${canalId}/iniciar`, { method: "POST", token }),

  estado: (canalId: string, token: string) =>
    pedir<EstadoPublico>(`/canales/${canalId}/estado`, { token }),

  terminar: (canalId: string, token: string) =>
    pedir<EstadoPublico>(`/canales/${canalId}/terminar`, { method: "POST", token }),

  /** Manda la frase cruda; el backend la sanea, llama a la IA y devuelve el parrafo. */
  narrar: (canalId: string, token: string, nuevoMaterial: string) =>
    pedir<{ parrafo: import("./historia.js").Parrafo; estado: EstadoPublico }>("/ia/narrar", {
      method: "POST",
      token,
      body: JSON.stringify({ canal: canalId, nuevoMaterial }),
    }),

  exportar: (canalId: string, token: string) =>
    pedir<{ url: string; expiraEn: number }>(`/export/${canalId}`, {
      method: "POST",
      token,
    }),
};
