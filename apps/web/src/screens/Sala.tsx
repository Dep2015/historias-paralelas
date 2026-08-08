import { useEffect, useRef } from "react";
import type { SesionActiva } from "../lib/historia.js";
import { useHistorySession } from "../hooks/useHistorySession.js";
import { usePresence } from "../hooks/usePresence.js";
import { Timer3min } from "../components/Timer3min.js";
import { BotonTerminar } from "../components/BotonTerminar.js";
import { SalaChat } from "../components/SalaChat.js";

/**
 * Pantalla principal mientras la historia esta viva: cabecera con reloj,
 * presencia y boton de terminar, y debajo el chat/escena colaborativo.
 */
interface PropsSala {
  sesion: SesionActiva;
  onTerminada: () => void;
}

export function Sala({ sesion, onTerminada }: PropsSala): JSX.Element {
  const historia = useHistorySession(sesion);
  const presencia = usePresence(sesion.canalId);

  // Guardia para avisar a App.tsx una sola vez cuando la historia termina,
  // aunque el estado siga refrescandose mientras esta pantalla sigue montada.
  const yaNotifico = useRef(false);
  useEffect(() => {
    if (historia.estado?.estado === "terminada" && !yaNotifico.current) {
      yaNotifico.current = true;
      onTerminada();
    }
  }, [historia.estado?.estado, onTerminada]);

  const modo = historia.ventana?.modo ?? historia.estado?.modo ?? "snapshot";
  const enLobby = historia.estado === null || historia.estado.estado === "lobby";

  return (
    <section className="pantalla-sala">
      <header className="pantalla-sala__cabecera pixel-panel">
        <Timer3min terminaEn={historia.estado?.terminaEn ?? null} desfaseMs={historia.desfaseMs} />
        <div className="pantalla-sala__info">
          <span className="pantalla-sala__canal">{sesion.canalId}</span>
          <span>MODO {modo.toUpperCase()}</span>
          <span>{presencia.disponible ? `${presencia.cuenta} CONECTADOS` : "PRESENCIA NO DISPONIBLE"}</span>
        </div>
        <BotonTerminar onTerminar={historia.terminar} deshabilitado={historia.ocupado} />
      </header>

      {enLobby && (
        <div className="pantalla-sala__lobby pixel-panel">
          <p>Esperando para arrancar. Cuando estes listo, empieza la historia.</p>
          <button
            type="button"
            className="pixel-btn pixel-btn--cian"
            onClick={() => void historia.iniciar()}
            disabled={historia.ocupado}
          >
            EMPEZAR
          </button>
        </div>
      )}

      {historia.error && <p className="pantalla-sala__error">{historia.error}</p>}

      <SalaChat sesion={historia} miOrden={historia.miOrden} nombre={sesion.nombre} />
    </section>
  );
}
