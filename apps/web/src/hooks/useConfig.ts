import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import type { ConfigPublica } from "../lib/historia.js";

/**
 * Trae /api/config una sola vez al montar. Toda la app arranca "a ciegas"
 * hasta que esto resuelve: PortalRaiz necesita portalPublishableKey, y las
 * pantallas de turno necesitan duracionSegundos/turnoMs/graciaMs.
 */
export function useConfig(): {
  config: ConfigPublica | null;
  cargando: boolean;
  error: string | null;
} {
  const [config, setConfig] = useState<ConfigPublica | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;

    api
      .config()
      .then((datos) => {
        if (!vivo) return;
        setConfig(datos);
      })
      .catch((err: unknown) => {
        if (!vivo) return;
        setError(err instanceof Error ? err.message : "No se pudo cargar la configuracion.");
      })
      .finally(() => {
        if (!vivo) return;
        setCargando(false);
      });

    return () => {
      vivo = false;
    };
  }, []);

  return { config, cargando, error };
}
