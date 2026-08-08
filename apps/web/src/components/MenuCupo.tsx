import { useEffect, useState, type FormEvent } from "react";
import { api, ErrorApi } from "../lib/api.js";
import type { EstiloEscena, ResumenCanal } from "../lib/historia.js";

/**
 * Formulario de entrada + lista de canales activos. El cupo y el estilo NO
 * se mandan "por si acaso": aqui es donde la persona los decide antes de
 * crear su historia (o elige unirse a una ya abierta, donde ambos ya los
 * fijo quien la creo).
 */
interface PropsMenuCupo {
  onEntrar: (canalId: string, nombre: string, cupo: number, estilo: EstiloEscena) => Promise<void>;
  error: string | null;
  ocupado: boolean;
}

// Cupo maximo ahora es 2 (duos). Ya no existen las salas de 5/10/ilimitado.
const OPCIONES_CUPO: ReadonlyArray<{ etiqueta: string; valor: number }> = [
  { etiqueta: "1", valor: 1 },
  { etiqueta: "2", valor: 2 },
];

const OPCIONES_ESTILO: ReadonlyArray<{ valor: EstiloEscena; titulo: string; descripcion: string }> = [
  {
    valor: "pixel",
    titulo: "PIXEL",
    descripcion: "Retro 16-bit · escenas dibujadas por el motor · turnos de 20s",
  },
  {
    valor: "vector",
    titulo: "VECTORIAL",
    descripcion: "Cuento ilustrado animado · la IA dibuja cada escena · turnos de 40s",
  },
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
  const [cupo, setCupo] = useState<number>(2);
  const [estilo, setEstilo] = useState<EstiloEscena>("pixel");
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
    await onEntrar(id, nombreLimpio, cupo, estilo);
  }

  async function unirseA(resumen: ResumenCanal): Promise<void> {
    const nombreLimpio = nombre.trim().slice(0, MAX_NOMBRE);
    if (!nombreLimpio) return;
    // El cupo y el estilo de un canal existente ya los fijo quien lo creo;
    // aqui solo se propagan tal cual, no se vuelven a decidir.
    await onEntrar(resumen.canalId, nombreLimpio, resumen.cupo ?? 2, resumen.estilo);
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

        <fieldset className="menu-cupo__estilo">
          <legend className="pixel-label">ESTILO DE LA SALA</legend>
          <div className="menu-cupo__estilo-opciones">
            {OPCIONES_ESTILO.map((op) => (
              <button
                key={op.valor}
                type="button"
                className={`menu-cupo__estilo-card${estilo === op.valor ? " menu-cupo__estilo-card--activo" : ""}`}
                onClick={() => setEstilo(op.valor)}
              >
                <span className="menu-cupo__estilo-titulo">{op.titulo}</span>
                <span className="menu-cupo__estilo-desc">{op.descripcion}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <div className="pixel-panel pixel-panel--info menu-cupo__nota">
          CUPO 1 = MODO REALTIME: escribes en vivo, frase a frase.
          <br />
          CUPO 2 = MODO SNAPSHOT: rondas de turno, ambos escriben en paralelo.
          <br />
          El ESTILO lo fija quien crea la sala y ya no se puede cambiar despues.
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
                <span className={`menu-cupo__badge-estilo menu-cupo__badge-estilo--${c.estilo}`}>
                  {c.estilo === "vector" ? "VECTOR" : "PIXEL"}
                </span>
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
