import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { SesionHistoria } from "../hooks/useHistorySession.js";
import { useCountdown } from "../hooks/useCountdown.js";
import { EscenaPixel } from "./EscenaPixel.js";

/**
 * Sala de escritura colaborativa: escena + leyenda de cine, historia
 * integrada hasta ahora, participantes y el input donde cada quien escribe
 * su propia frase.
 */
interface PropsSalaChat {
  sesion: SesionHistoria;
  miOrden: number | null;
  nombre: string;
}

// Pausa sin teclear que en modo realtime se interpreta como "termine la frase".
const PAUSA_ENVIO_MS = 1500;
// Puntuacion que en modo realtime se interpreta como fin de oracion.
const FIN_ORACION = /[.!?]\s*$/;

export function SalaChat({ sesion, miOrden, nombre }: PropsSalaChat): JSX.Element {
  const { estado, ventana, parrafos, desfaseMs, esMiTurno, ocupado, error, enviarFrase } = sesion;
  const modoRealtime = ventana?.modo === "realtime";

  // IMPORTANTE: este borrador es SOLO mio. El backend nunca transmite lo que
  // los demas estan tecleando (no existe ese canal), asi que no hay forma de
  // que el texto ajeno aparezca aqui por accidente. Lo unico que se ve de
  // otra persona es su narracion ya integrada, cuando sale en la leyenda o
  // en la lista de parrafos de abajo.
  const [borrador, setBorrador] = useState("");
  const timerPausaRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cuentaVentana = useCountdown(ventana?.terminaEn ?? null, desfaseMs);

  useEffect(() => {
    return () => {
      if (timerPausaRef.current) clearTimeout(timerPausaRef.current);
    };
  }, []);

  function limpiarTimerPausa(): void {
    if (timerPausaRef.current) {
      clearTimeout(timerPausaRef.current);
      timerPausaRef.current = null;
    }
  }

  async function enviar(texto: string): Promise<void> {
    const limpio = texto.trim();
    if (!limpio || ocupado) return;
    limpiarTimerPausa();
    setBorrador("");
    await enviarFrase(limpio);
  }

  function manejarCambio(valor: string): void {
    setBorrador(valor);
    if (!modoRealtime) return;

    // Deteccion de "oracion completa" en realtime: punto/exclamacion/pregunta
    // dispara al instante; si no, una pausa de escritura tambien cuenta.
    limpiarTimerPausa();
    if (FIN_ORACION.test(valor)) {
      void enviar(valor);
      return;
    }
    if (valor.trim()) {
      timerPausaRef.current = setTimeout(() => void enviar(valor), PAUSA_ENVIO_MS);
    }
  }

  function manejarTecla(evento: KeyboardEvent<HTMLInputElement>): void {
    if (evento.key === "Enter") {
      evento.preventDefault();
      void enviar(borrador);
    }
  }

  const ultimoParrafo = parrafos[parrafos.length - 1];
  const participantes = estado?.participantes ?? [];
  const ordenEnCurso = ventana?.ordenEnCurso ?? null;

  return (
    <div className="sala-chat">
      <div className="sala-chat__escena">
        <EscenaPixel escena={ultimoParrafo?.escena ?? null} leyenda={ultimoParrafo?.narracion} />
      </div>

      <div className="sala-chat__input pixel-panel">
        <p className="sala-chat__estado-turno">
          {modoRealtime
            ? esMiTurno
              ? "ES TU TURNO: escribe cuando quieras."
              : "Esperando..."
            : esMiTurno
              ? `ES TU TURNO: se integra en ${cuentaVentana.texto}`
              : `Vas #${miOrden ?? "?"} · se integra en ${cuentaVentana.texto}`}
        </p>
        <div className="sala-chat__input-fila">
          <input
            className="pixel-input"
            value={borrador}
            onChange={(e) => manejarCambio(e.target.value)}
            onKeyDown={manejarTecla}
            disabled={ocupado}
            placeholder={modoRealtime ? "Escribe y sigue el ritmo..." : "Prepara tu frase..."}
            aria-label="Tu frase para la historia"
          />
          <button
            type="button"
            className="pixel-btn pixel-btn--cian"
            disabled={ocupado || !borrador.trim()}
            onClick={() => void enviar(borrador)}
          >
            ENVIAR
          </button>
        </div>
        {error && <p className="sala-chat__error">{error}</p>}
        <p className="sala-chat__firma">Escribes como {nombre}</p>
      </div>

      <div className="sala-chat__parrafos pixel-panel">
        <h2 className="pixel-subtitulo">HISTORIA</h2>
        <ol className="sala-chat__lista-parrafos">
          {parrafos.map((p) => (
            <li key={p.id}>
              <span className="sala-chat__parrafo-num">#{p.indice + 1}</span>
              <span className="sala-chat__parrafo-autor">{p.autorNombre}:</span>
              <span className="sala-chat__parrafo-texto">{p.narracion}</span>
            </li>
          ))}
          {parrafos.length === 0 && <li className="sala-chat__vacio">Aun no hay nada escrito.</li>}
        </ol>
      </div>

      <div className="sala-chat__participantes pixel-panel">
        <h2 className="pixel-subtitulo">PARTICIPANTES</h2>
        <ul>
          {participantes.map((p) => (
            <li key={p.userId} className={p.orden === ordenEnCurso ? "sala-chat__participante--activo" : ""}>
              #{p.orden} {p.nombre}
              {p.orden === ordenEnCurso && <span className="sala-chat__va-ahora"> &middot; VA AHORA</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
