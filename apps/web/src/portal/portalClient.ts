import { Portal } from "@portalsdk/core";

/**
 * La apiKey de Portal no existe en build time: llega en runtime desde
 * /api/config (ver useConfig + ConfigPublica.portalPublishableKey). Por eso
 * no podemos crear el cliente a nivel de modulo con un import estatico;
 * necesitamos una fabrica perezosa que se llama recien cuando la apiKey ya
 * se conoce (desde PortalRaiz).
 */

let instancia: Portal | null = null;
let apiKeyDeInstancia: string | null = null;

/**
 * Singleton perezoso cacheado por apiKey. Si la apiKey cambia (por ejemplo
 * al cambiar de tenant o de entorno sin recargar la pagina) se descarta el
 * cliente viejo y se construye uno nuevo; construir un Portal es sincrono y
 * pasivo, asi que no hay costo de red al recrearlo.
 */
export function obtenerPortal(apiKey: string): Portal {
  if (instancia === null || apiKeyDeInstancia !== apiKey) {
    instancia = new Portal({ apiKey });
    apiKeyDeInstancia = apiKey;
  }
  return instancia;
}
