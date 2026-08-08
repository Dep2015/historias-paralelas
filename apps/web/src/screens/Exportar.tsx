import { useState } from "react";
import { api, ErrorApi } from "../lib/api.js";
import type { Parrafo, SesionActiva } from "../lib/historia.js";
import { HistoriaFinal } from "../components/HistoriaFinal.js";
import { useCountdown } from "../hooks/useCountdown.js";

/**
 * Pantalla final: repasa la historia como una peli y ofrece exportar el
 * video. El enlace de descarga es efimero a proposito (regla de oro del
 * proyecto: nada persiste), por eso la advertencia y la cuenta regresiva
 * son tan visibles.
 */
interface PropsExportar {
  sesion: SesionActiva;
  parrafos: Parrafo[];
  razonFin: string | null;
}

export function Exportar({ sesion, parrafos, razonFin }: PropsExportar): JSX.Element {
  const [url, setUrl] = useState<string | null>(null);
  const [expiraEn, setExpiraEn] = useState<number | null>(null);
  const [exportando, setExportando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sin sesion de historia activa en esta pantalla no hay desfase de reloj
  // que corregir; 0 es una aproximacion razonable para una cuenta de 5min.
  const cuenta = useCountdown(expiraEn, 0);

  async function exportar(): Promise<void> {
    setExportando(true);
    setError(null);
    try {
      const resultado = await api.exportar(sesion.canalId, sesion.token);
      setUrl(resultado.url);
      setExpiraEn(resultado.expiraEn);
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : "No se pudo exportar el video.");
    } finally {
      setExportando(false);
    }
  }

  return (
    <section className="pantalla-exportar">
      <HistoriaFinal parrafos={parrafos} razonFin={razonFin} />

      <div className="pantalla-exportar__panel pixel-panel">
        {!url && (
          <button
            type="button"
            className="pixel-btn pixel-btn--amarillo"
            onClick={() => void exportar()}
            disabled={exportando || parrafos.length === 0}
          >
            {exportando ? "EXPORTANDO..." : "EXPORTAR VIDEO"}
          </button>
        )}

        {error && <p className="pantalla-exportar__error">{error}</p>}

        {url && (
          <div className="pantalla-exportar__descarga">
            <a href={url} download className="pixel-btn pixel-btn--cian">
              DESCARGAR VIDEO
            </a>
            <p className="pantalla-exportar__advertencia">
              ATENCION: este enlace expira en 5 minutos y luego se borra PARA SIEMPRE.
              Descargalo ahora.
            </p>
            <p className="pantalla-exportar__cuenta">
              {cuenta.agotado ? "ENLACE EXPIRADO" : `EXPIRA EN ${cuenta.texto}`}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
