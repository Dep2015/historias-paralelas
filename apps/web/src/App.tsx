import { useState } from "react";
import { PortalRaiz } from "./portal/PortalRaiz.js";
import { useConfig } from "./hooks/useConfig.js";
import { api } from "./lib/api.js";
import type { Parrafo, RazonFin, SesionActiva } from "./lib/historia.js";
import { MenuEntrada } from "./screens/MenuEntrada.js";
import { Sala } from "./screens/Sala.js";
import { Exportar } from "./screens/Exportar.js";

/** Maquina de 3 pantallas. Sin router: todo vive en un estado local aqui. */
type Pantalla = "menu" | "sala" | "exportar";

export function App(): JSX.Element {
  const { config } = useConfig();
  const [pantalla, setPantalla] = useState<Pantalla>("menu");
  const [sesion, setSesion] = useState<SesionActiva | null>(null);
  const [parrafosFinal, setParrafosFinal] = useState<Parrafo[]>([]);
  const [razonFinFinal, setRazonFinFinal] = useState<RazonFin>(null);

  function manejarSesion(nueva: SesionActiva): void {
    setSesion(nueva);
    setPantalla("sala");
  }

  async function manejarTerminada(): Promise<void> {
    if (sesion) {
      try {
        // Sala.tsx ya se esta desmontando junto con su propio polling: para
        // no perder los parrafos finales, releemos el estado una vez mas
        // aqui arriba, directo contra la API, antes de pasar a exportar.
        const estadoFinal = await api.estado(sesion.canalId, sesion.token);
        setParrafosFinal(estadoFinal.parrafos);
        setRazonFinFinal(estadoFinal.razonFin);
      } catch {
        // Si la relectura falla, se exporta igual con lo ultimo disponible.
      }
    }
    setPantalla("exportar");
  }

  return (
    <PortalRaiz apiKey={config?.portalPublishableKey ?? null} token={sesion?.portalToken}>
      <div className="app-shell">
        {pantalla === "menu" && (
          <>
            <header className="app-shell__cabecera">
              <img src="/assets/logo-emblema.png" alt="Historia Paralela" className="app-shell__logo" />
              <h1 className="pixel-titulo">HISTORIA PARALELA</h1>
            </header>
            <MenuEntrada onSesion={manejarSesion} />
          </>
        )}

        {pantalla === "sala" && sesion && (
          <Sala sesion={sesion} onTerminada={() => void manejarTerminada()} />
        )}

        {pantalla === "exportar" && sesion && (
          <Exportar sesion={sesion} parrafos={parrafosFinal} razonFin={razonFinFinal} />
        )}
      </div>
    </PortalRaiz>
  );
}
