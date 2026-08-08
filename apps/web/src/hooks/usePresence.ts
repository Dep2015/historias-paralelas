import { useChannel } from "@portalsdk/react";

/**
 * Presencia del canal de una historia. No hace polling propio: Portal
 * empuja los cambios de presencia por el canal en tiempo real.
 */
export function usePresence(canalId: string | null): {
  cuenta: number;
  participantes: Array<{ id: string; username?: string }>;
  disponible: boolean;
} {
  // channelId undefined deja el hook inerte (segun la doc de Portal) en vez
  // de tener que llamar useChannel condicionalmente, cosa que las reglas de
  // hooks no permiten.
  //
  // OJO/SUPUESTO IMPORTANTE: useChannel exige un <PortalProvider> en el
  // arbol y tira una excepcion en render si no lo encuentra (no degrada
  // solo). Como PortalRaiz NO monta provider cuando no hay apiKey (modo sin
  // Portal, ver PortalRaiz.tsx), atajamos esa excepcion aca con try/catch
  // para poder devolver "disponible: false" en vez de tumbar la pantalla.
  // Esto no rompe las reglas de hooks: para una instancia ya montada de
  // este componente, que haya o no provider nunca cambia a mitad de vida
  // (PortalRaiz cambia de Fragment a PortalProvider en la raiz del arbol,
  // lo que remonta todo lo de abajo en vez de alternar la condicion
  // in-place), asi que la cantidad de hooks internos que useChannel llega a
  // ejecutar es estable render tras render para esa instancia.
  let presence: ReturnType<typeof useChannel>["presence"];
  try {
    presence = useChannel({ channelId: canalId ?? undefined, history: "none" }).presence;
  } catch {
    presence = undefined;
  }

  if (presence === undefined) {
    return { cuenta: 0, participantes: [], disponible: false };
  }

  if (presence.kind === "detailed") {
    return {
      cuenta: presence.count,
      participantes: presence.participants.map((p) => ({ id: p.id, username: p.username })),
      disponible: true,
    };
  }

  // kind === "aggregate": el backend solo da el total, sin lista individual.
  return { cuenta: presence.count, participantes: [], disponible: true };
}
