import { allow, block, defineConfig, defineMiddleware } from "@portalsdk/config";

/**
 * Autoridad REAL de Portal para este proyecto.
 *
 * Este archivo vive en la raiz del repo (y no dentro de apps/api) porque el
 * CLI de Portal lo despliega leyendo directamente desde aqui. "@portalsdk/config"
 * es por tanto una dependencia del CLI de Portal en tiempo de despliegue,
 * NO una dependencia del bundle de la API: no esta (ni debe estar) en
 * apps/api/package.json, que solo declara lo que corre dentro del proceso
 * de Express. apps/api/src/portal/portal.config.ts documenta esta misma
 * politica en forma de funciones puras, para quien lea el codigo del
 * backend sin saltar fuera de su workspace de TypeScript.
 *
 * El tipo del mensaje del canal se declara aqui en vez de importarse desde
 * apps/web o apps/api: el CLI de Portal procesa este archivo de forma
 * aislada, sin garantia de resolver rutas de otros workspaces del monorepo.
 * El original (para mantenerlo sincronizado a mano) es
 * apps/web/src/lib/historia.ts -> MensajeCanal.
 */

interface ParrafoMensaje {
  id: string;
  indice: number;
  autorId: string;
  autorNombre: string;
  textoOriginal: string;
  narracion: string;
  escena: string;
  imagen?: string;
  creadoEn: number;
}

interface MensajeCanal {
  tipo: "parrafo" | "estado" | "fin";
  /** Presente cuando tipo === "parrafo". */
  parrafo?: ParrafoMensaje;
  /** Presente cuando tipo === "fin". */
  razon?: "tiempo" | "botones" | "todos_pasaron" | null;
  /**
   * A quien notificar. Portal NO documenta un valor de difusion tipo "all":
   * el campo "to" del descriptor de notify son userIds concretos, asi que un
   * "all" literal se tomaria como un usuario llamado "all" y la notificacion
   * no llegaria a nadie. Por eso el emisor adjunta la lista explicita de
   * participantes activos (todos menos el mismo).
   */
  destinatarios?: string[];
  emitidoEn: number;
}

/** Igual que LARGO_MAXIMO_NARRACION en apps/api/src/portal/portal.config.ts. */
const LARGO_MAXIMO_NARRACION = 2000;

// JWT_ISSUER tiene que ser el mismo valor que usa apps/api/src/lib/env.ts
// (y con el que se firma el token en portalToken.ts): si no coinciden,
// Portal no encuentra el JWKS o rechaza el "iss" del token.
const issuer = process.env.JWT_ISSUER ?? "http://localhost:3000";

export default defineConfig({
  channels: {
    "hist-*": {
      // Nadie escribe en un canal de historia sin haber "entrado" antes: el
      // JWT RS256 que emite portalToken.ts es obligatorio para conectar.
      anonymous: false,
      // Sin esto, "anonymous: false" por si solo pone access en "membership"
      // (SDK real, ver node_modules/@portalsdk/config/dist/index.d.ts): con
      // "membership" Portal rechaza TODO como "not_member" antes de que
      // authz llegue a ejecutarse. "authz" es lo que deja que el callback de
      // abajo sea quien decida, sin lista de miembros previa.
      access: "authz",

      authz: (ctx) => {
        // El claim "canal" del JWT fija a que sala sirve ese token. Si no
        // coincide con el canal al que se intenta conectar, es un token de
        // OTRA historia (robado, reusado, o simplemente viejo).
        // ctx.claims tipa userId/anon explicitos; cualquier otro claim (como
        // "canal") llega como unknown via el indice, asi que se valida el
        // tipo antes de comparar. Y ctx.channel es un ChannelRef (objeto),
        // no un string: hay que comparar contra ctx.channel.id.
        const canalDelToken = ctx.claims.canal;
        if (typeof canalDelToken !== "string" || canalDelToken !== ctx.channel.id) {
          return block("Ese token no es de este canal.");
        }
        return allow({ publish: true, sendDirect: true });
      },

      onPublish: [
        defineMiddleware<MensajeCanal>("publish", (ctx) => {
          // Doble candado: aunque authz ya dejo pasar la conexion, cada
          // publicacion revalida la capacidad (por si se revoca a mitad de
          // sesion, p.ej. tras un onDisconnect en otro dispositivo).
          if (!ctx.capabilities.publish) {
            return block("No tienes permiso para publicar en este canal.");
          }

          const contenido = ctx.message.content;
          const tipoValido =
            !!contenido &&
            (contenido.tipo === "parrafo" ||
              contenido.tipo === "estado" ||
              contenido.tipo === "fin");
          if (!tipoValido) {
            return block("Formato de mensaje invalido.");
          }

          const narracion = contenido.parrafo?.narracion;
          if (typeof narracion === "string" && narracion.length > LARGO_MAXIMO_NARRACION) {
            return block("La narracion supera el tamano maximo permitido.");
          }

          return allow();
        }),
      ],

      notify: (ctx) => {
        const contenido = ctx.message.content as MensajeCanal;

        // Sin destinatarios explicitos no hay a quien notificar: mejor no
        // crear un item de inbox huerfano que inventarse un destino.
        const destinatarios = contenido.destinatarios ?? [];
        if (destinatarios.length === 0) return null;

        // Solo los eventos que le importan a alguien que no esta mirando la
        // pantalla en ese instante se convierten en notificacion de inbox.
        if (contenido.tipo === "fin") {
          return { title: "La historia termino", data: contenido, to: destinatarios };
        }
        if (contenido.tipo === "parrafo") {
          return { title: "Nuevo parrafo en la historia", data: contenido, to: destinatarios };
        }
        // Los "estado" son ruido de sincronizacion (heartbeats de UI): no
        // merecen sacar a nadie de lo que este haciendo.
        return null;
      },

      onDisconnect: [
        defineMiddleware("disconnect", (ctx) => {
          // Solo observa: un onDisconnect no puede rechazar la salida. No
          // hay logica de negocio aqui, solo un punto de extension por si
          // en el futuro hace falta telemetria de abandonos.
          ctx.notify(async () => {});
        }),
      ],
    },
  },

  auth: {
    issuer,
    jwksUrl: `${issuer}/.well-known/jwks.json`,
    claimMap: { userId: "sub", username: "name" },
  },
});
