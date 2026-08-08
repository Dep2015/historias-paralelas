import { useEffect, useState } from "react";

/**
 * Cuenta regresiva hasta "terminaEn" (timestamp del SERVIDOR, en ms).
 * desfaseMs = Date.now() - servidorAhora (ver useHistorySession) corrige el
 * reloj local para que el countdown no se adelante ni se atrase segun el
 * reloj de cada dispositivo.
 */
export function useCountdown(
  terminaEn: number | null,
  desfaseMs: number,
): { msRestantes: number; texto: string; agotado: boolean } {
  const [ahora, setAhora] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  if (terminaEn === null) {
    return { msRestantes: 0, texto: "0:00", agotado: true };
  }

  // "ahora - desfaseMs" aproxima la hora del servidor en este instante.
  const msRestantes = Math.max(0, terminaEn - (ahora - desfaseMs));
  const totalSegundos = Math.ceil(msRestantes / 1000);
  const minutos = Math.floor(totalSegundos / 60);
  const segundos = totalSegundos % 60;
  const texto = `${minutos}:${String(segundos).padStart(2, "0")}`;

  return { msRestantes, texto, agotado: msRestantes <= 0 };
}
