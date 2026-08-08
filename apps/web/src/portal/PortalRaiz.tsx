import { useCallback, type ReactNode } from "react";
import { PortalProvider } from "@portalsdk/react";
import { obtenerPortal } from "./portalClient.js";

interface PropsPortalRaiz {
  apiKey: string | null;
  token?: string;
  children: ReactNode;
}

/**
 * Raiz de Portal para toda la app. Vive por encima de las 3 pantallas
 * (App.tsx la monta una sola vez), asi que cualquier hook de
 * @portalsdk/react (useChannel, etc.) usado mas abajo encuentra este
 * provider en el arbol.
 *
 * MODO SIN PORTAL: si apiKey es null (config aun no cargo, o el entorno no
 * tiene una key configurada) no se monta ningun PortalProvider y se
 * renderizan los children pelados. La app tiene que poder correr asi en
 * local/dev sin claves: por eso usePresence y useHistorySession estan
 * escritos para degradarse solos cuando no hay Portal en el arbol (sondeo
 * HTTP puro), en vez de asumir que siempre hay un provider arriba.
 */
export function PortalRaiz({ apiKey, token, children }: PropsPortalRaiz): JSX.Element {
  // Portal puede llamar este callback de nuevo al reconectar (ej. token
  // vencido); useCallback le da una identidad estable mientras "token" no
  // cambie, en vez de crear un cliente nuevo de token en cada render.
  const obtenerToken = useCallback(async (): Promise<string> => {
    // En la practica solo se pasa este callback cuando token esta definido
    // (ver mas abajo), el "?? """ es solo defensivo para el tipo.
    return token ?? "";
  }, [token]);

  if (apiKey === null) {
    return <>{children}</>;
  }

  return (
    <PortalProvider
      client={obtenerPortal(apiKey)}
      token={token === undefined ? undefined : obtenerToken}
    >
      {children}
    </PortalProvider>
  );
}
