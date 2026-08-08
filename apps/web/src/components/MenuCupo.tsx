import { useEffect, useState, type FormEvent } from "react";
import { api, ErrorApi } from "../lib/api.js";
import type { ResumenCanal } from "../lib/historia.js";

/**
 * Formulario de entrada + lista de canales activos. El cupo NO se manda
 * "por si acaso": aqui es donde la persona lo decide antes de crear su
 * historia (o elige unirse a una ya abierta con el cupo que ya tiene).
 */
interface PropsMenuCupo {
  onEntrar: (canalId: string, nombre: string, cupo: number | null) => Promise<void>;
  error: string | null;
  ocupado: boolean;
}

const OPCIONES_CUPO: ReadonlyArray<{ etiqueta: string; valor: number | null }> = [
  { etiqueta: "1", valor: 1 },
  { etiqueta: "2", valor: 2 },
  { etiqueta: "5", valor: 5 },
  { etiqueta: "10", valor: 10 },
  { etiqueta: "ILIMITADO", valor: null },
];

const MAX_NOMBRE = 24;
const INTERVALO_REFRESCO_MS = 3000;

const ESTADOS_UNIBLES = new Set(["lobby", "en_curso"]);

/** Genera un id de canal que cumple la lista blanca del backend (hist-[a-z0-9-]). */
function generarCanalId(): string {
  const azar = Math.random().toString(36).slice(2, 8);
  return `hist-${azar}`;
}

export function MenuCupo({ onEntrar, error, ocupado }: PropsMenuCupo): JSX.Element {
  const [nombre, setNombre] = useState("");
  const [canalId, setCanalId] = useState("");
  const [cupo, setCupo] = useState<number | null>(2);
  const [canales, setCanales] = useState<ResumenCanal[]>([]);
  const [errorLista, setErrorLista] = useState<string | null>(null);

  // Refresco periodico de la lista: asi se ve en vivo cuando un canal se
  // llena o cambia de estado sin que la persona tenga que recargar nada.
  useEffect(() => {
    let vivo = true;

    async function refrescar(): Promise<void> {
      try {
        const { canales: lista } = await api.listarCanales();
        if (!vivo) return;
        setCanales(lista);
        setErrorLista(null);
      } catch (err) {
        if (!vivo) return;
        setErrorLista(err instanceof ErrorApi ? err.message : "No se pudo cargar la lista.");
      }
    }

    void refrescar();
    const intervalo = setInterval(() => void refrescar(), INTERVALO_REFRESCO_MS);
    return () => {
      vivo = false;
      clearInterval(intervalo);
    };
  }, []);

  const nombreListo = nombre.trim().length > 0;

  async function manejarEnvio(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    const nombreLimpio = nombre.trim().slice(0, MAX_NOMBRE);
    if (!nombreLimpio) return;
    const id = canalId.trim() || generarCanalId();
    await onEntrar(id, nombreLimpio, cupo);
  }

  async function unirseA(resumen: ResumenCanal): Promise<void> {
    const nombreLimpio = nombre.trim().slice(0, MAX_NOMBRE);
    if (!nombreLimpio) return;
    await onEntrar(resumen.canalId, nombreLimpio, resumen.cupo);
  }

  return (
    <div className="menu-cupo">
      <form className="pixel-panel menu-cupo__form" onSubmit={(e) => void manejarEnvio(e)}>
        <label className="pixel-label" htmlFor="campo-nombre">
          TU NOMBRE
        </label>
        <input
          id="campo-nombre"
          className="pixel-input"
          value={nombre}
          maxLength={MAX_NOMBRE}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Como te llamas"
        />

        <label className="pixel-label" htmlFor="campo-canal">
          ID DE CANAL (OPCIONAL)
        </label>
        <input
          id="campo-canal"
          className="pixel-input"
          value={canalId}
          onChange={(e) => setCanalId(e.target.value)}
          placeholder="se autogenera si lo dejas vacio"
        />

        <fieldset className="menu-cupo__cupo">
          <legend className="pixel-label">CUPO</legend>
          <div className="menu-cupo__opciones">
            {OPCIONES_CUPO.map((op) => (
              <button
                key={op.etiqueta}
                type="button"
                className={`pixel-btn pixel-btn--chico${cupo === op.valor ? " pixel-btn--activo" : ""}`}
                onClick={() => setCupo(op.valor)}
              >
                {op.etiqueta}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="pixel-panel pixel-panel--info menu-cupo__nota">
          CUPO 1 = MODO REALTIME: escribes en vivo, frase a frase.
          <br />
          CUPO 2 O MAS = MODO SNAPSHOT: rondas de turno, todos escriben en paralelo.
        </div>

        {error && <p className="menu-cupo__error">{error}</p>}

        <button type="submit" className="pixel-btn pixel-btn--cian" disabled={ocupado || !nombreListo}>
          {ocupado ? "ENTRANDO..." : "CREAR Y ENTRAR"}
        </button>
      </form>

      <div className="pixel-panel menu-cupo__lista">
        <h2 className="pixel-subtitulo">CANALES ACTIVOS</h2>
        {errorLista && <p className="menu-cupo__error">{errorLista}</p>}
        {canales.length === 0 && !errorLista && (
          <p className="menu-cupo__vacio">No hay canales abiertos todavia.</p>
        )}
        <ul className="menu-cupo__canales">
          {canales.map((c) => {
            const cupoTexto = c.cupo === null ? "ILIMITADO" : String(c.cupo);
            const unible = !c.lleno && ESTADOS_UNIBLES.has(c.estado);
            return (
              <li key={c.canalId} className={`menu-cupo__canal${c.lleno ? " menu-cupo__canal--lleno" : ""}`}>
                <span className="menu-cupo__canal-id">{c.canalId}</span>
                <span className="menu-cupo__canal-info">
                  {c.dentro}/{cupoTexto} dentro &middot; {c.modo.toUpperCase()}
                </span>
                {c.lleno ? (
                  <span className="menu-cupo__etiqueta-lleno">LLENO</span>
                ) : (
                  <button
                    type="button"
                    className="pixel-btn pixel-btn--chico pixel-btn--magenta"
                    disabled={ocupado || !nombreListo || !unible}
                    onClick={() => void unirseA(c)}
                  >
                    UNIRSE
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
