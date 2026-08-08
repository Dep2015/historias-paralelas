/**
 * Este archivo NO es la config real de Portal. La autoridad vive en la raiz
 * del repo (../../../../portal.config.ts) porque el CLI de Portal la
 * despliega leyendo directamente desde ahi.
 *
 * Un simple `export { default } from "../../../../portal.config.js"` es
 * fragil aqui y se descarta a proposito: el tsconfig de esta app fija
 * `rootDir: "src"` e `include: ["src/**\/*.ts"]`, asi que `tsc -p
 * tsconfig.json` no puede mapear un archivo fuera de src/ (y fuera del
 * paquete apps/api entero) a outDir. Ese import compilaria hoy solo por
 * casualidad de rutas y rompe el build en cuanto alguien mueva este
 * archivo o el build se vuelva un poco mas estricto.
 *
 * En su lugar, este modulo expone como funciones puras la MISMA politica
 * que aplica portal.config.ts (autorizacion por canal, forma del mensaje y
 * limite de tamano de la narracion), para que:
 *  (a) quien lea el codigo de la API encuentre aqui, dentro de su propio
 *      workspace de TypeScript, que reglas rigen el canal realtime, sin
 *      tener que saltar a un archivo fuera de src/, y
 *  (b) esas reglas se puedan probar con los tests de apps/api sin arrastrar
 *      "@portalsdk/config", que es una dependencia de despliegue del CLI de
 *      Portal y no forma parte del bundle de esta API.
 *
 * La copia se mantiene deliberadamente pequena y sin dependencias, para que
 * sea facil comprobar a ojo que sigue coincidiendo con portal.config.ts si
 * ese archivo cambia.
 *
 * Nota de integracion con el SDK real (node_modules/@portalsdk/config): con
 * "anonymous: false" a secas, Portal fija "access" en "membership" por
 * defecto, y con "membership" rechaza toda conexion como "not_member" ANTES
 * de que el callback "authz" llegue a ejecutarse. portal.config.ts declara
 * ademas "access: authz" para que sea ese callback (no una lista previa de
 * miembros) quien decida. Si algun dia se quita esa linea de la raiz, la
 * comprobacion de "coincideCanal" de aqui deja de tener efecto alguno.
 */

/** Debe coincidir con LARGO_MAXIMO_NARRACION en portal.config.ts (raiz). */
export const LARGO_MAXIMO_NARRACION = 2000;

/**
 * Misma regla que "authz" en portal.config.ts: el claim "canal" del JWT
 * debe coincidir exactamente con el canal al que se intenta conectar. Nota:
 * la politica de cupo NO vive aqui ni en portal.config.ts, porque Portal
 * solo entra en juego DESPUES de que historiaStore.unir ya acepto al
 * participante (ver apps/api/src/routes/canales.ts); el canal realtime no
 * vuelve a comprobar cupo.
 */
export function coincideCanal(canalDelToken: string | undefined, canalDestino: string): boolean {
  return canalDelToken === canalDestino;
}

/** Misma validacion de forma que el middleware "onPublish". */
export function tipoMensajeValido(tipo: unknown): tipo is "parrafo" | "estado" | "fin" {
  return tipo === "parrafo" || tipo === "estado" || tipo === "fin";
}

/** Misma validacion de tamano que el middleware "onPublish". */
export function narracionDentroDeLimite(narracion: string | undefined): boolean {
  return narracion === undefined || narracion.length <= LARGO_MAXIMO_NARRACION;
}
