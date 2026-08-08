import { useState } from "react";

/**
 * Terminar la historia no es una accion personal: afecta a TODOS los
 * participantes de la sala. Por eso el boton exige confirmacion en dos
 * pasos en vez de dispararse con un solo clic accidental.
 */
interface PropsBotonTerminar {
  onTerminar: () => Promise<void>;
  deshabilitado?: boolean;
}

export function BotonTerminar({ onTerminar, deshabilitado }: PropsBotonTerminar): JSX.Element {
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function manejarClic(): Promise<void> {
    if (!confirmando) {
      setConfirmando(true);
      return;
    }

    setEnviando(true);
    try {
      await onTerminar();
    } finally {
      setEnviando(false);
      setConfirmando(false);
    }
  }

  return (
    <button
      type="button"
      className="pixel-btn pixel-btn--rojo boton-terminar"
      onClick={() => void manejarClic()}
      onBlur={() => setConfirmando(false)}
      disabled={deshabilitado || enviando}
    >
      {enviando ? "TERMINANDO..." : confirmando ? "¿SEGURO?" : "TERMINAR"}
    </button>
  );
}
