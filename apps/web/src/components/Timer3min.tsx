import { useCountdown } from "../hooks/useCountdown.js";

/**
 * Cronometro grande estilo pixel. El nombre conserva "3min" del spec
 * original aunque la duracion real la fija el backend via ConfigPublica
 * (duracionSegundos), no un valor fijo aqui.
 */
interface PropsTimer3min {
  terminaEn: number | null;
  desfaseMs: number;
}

// Bajo este umbral el timer parpadea en magenta para meter presion visual.
const UMBRAL_URGENCIA_MS = 30_000;

export function Timer3min({ terminaEn, desfaseMs }: PropsTimer3min): JSX.Element {
  const { msRestantes, texto, agotado } = useCountdown(terminaEn, desfaseMs);
  const urgente = !agotado && msRestantes < UMBRAL_URGENCIA_MS;

  const clases = ["timer-pixel"];
  if (urgente) clases.push("timer-pixel--urgente");
  if (agotado) clases.push("timer-pixel--agotado");

  return (
    <div className={clases.join(" ")} role="timer" aria-live="polite">
      {texto}
    </div>
  );
}
