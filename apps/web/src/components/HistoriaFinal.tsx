import { useEffect, useState } from "react";
import type { Parrafo } from "../lib/historia.js";
import { EscenaPixel } from "./EscenaPixel.js";
import { EscenaVector } from "./EscenaVector.js";

/**
 * Reproductor tipo "cine": avanza solo por los parrafos para dar una
 * previsualizacion de la historia completa, y se detiene en el ultimo en
 * vez de repetir en bucle. Tambien se puede navegar a mano.
 */
interface PropsHistoriaFinal {
  parrafos: Parrafo[];
  razonFin: string | null;
}

const MS_POR_PARRAFO = 4000;

const TEXTOS_RAZON: Record<string, string> = {
  tiempo: "Se acabo el tiempo.",
  botones: "Alguien decidio terminar la historia para todos.",
  todos_pasaron: "Todos los participantes ya pasaron por su turno.",
};

export function HistoriaFinal({ parrafos, razonFin }: PropsHistoriaFinal): JSX.Element {
  const [indice, setIndice] = useState(0);
  const [enPausa, setEnPausa] = useState(false);

  const total = parrafos.length;
  const actual = parrafos[indice];
  const esUltimo = total === 0 || indice >= total - 1;

  // Avance automatico: se reprograma cada vez que cambia el indice, y se
  // detiene solo (sin bucle) al llegar al ultimo parrafo o si esta en pausa.
  useEffect(() => {
    if (enPausa || esUltimo) return;

    const id = setTimeout(() => {
      setIndice((i) => Math.min(i + 1, total - 1));
    }, MS_POR_PARRAFO);

    return () => clearTimeout(id);
  }, [indice, enPausa, esUltimo, total]);

  function anterior(): void {
    setIndice((i) => Math.max(0, i - 1));
  }

  function siguiente(): void {
    setIndice((i) => Math.min(total - 1, i + 1));
  }

  return (
    <div className="historia-final pixel-panel">
      <div className="historia-final__escena">
        {actual?.svg ? (
          <EscenaVector svg={actual.svg} leyenda={actual.narracion} />
        ) : (
          <EscenaPixel escena={actual?.escena ?? null} leyenda={actual?.narracion} pausado={enPausa} />
        )}
      </div>

      <div className="historia-final__controles">
        <button type="button" className="pixel-btn pixel-btn--chico" onClick={anterior} disabled={indice === 0}>
          {"< ANTERIOR"}
        </button>
        <button
          type="button"
          className="pixel-btn pixel-btn--chico pixel-btn--cian"
          onClick={() => setEnPausa((p) => !p)}
        >
          {enPausa ? "PLAY" : "PAUSA"}
        </button>
        <button
          type="button"
          className="pixel-btn pixel-btn--chico"
          onClick={siguiente}
          disabled={esUltimo}
        >
          {"SIGUIENTE >"}
        </button>
      </div>

      <p className="historia-final__contador">{total === 0 ? "SIN PARRAFOS" : `${indice + 1} / ${total}`}</p>

      {razonFin && <p className="historia-final__razon">{TEXTOS_RAZON[razonFin] ?? razonFin}</p>}
    </div>
  );
}
