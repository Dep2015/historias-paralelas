import { useCallback, useEffect, useRef, useState } from "react";
import { useChannel, type UseChannelResult } from "@portalsdk/react";
import { api, ErrorApi } from "../lib/api.js";
import type {
  EstadoPublico,
  MensajeCanal,
  Parrafo,
  SesionActiva,
  VentanaTurno,
} from "../lib/historia.js";

const INTERVALO_SONDEO_MS = 2000;
const ESTADOS_TERMINALES = new Set(["terminada", "exportada"]);

export interface SesionHistoria {
  estado: EstadoPublico | null;
  ventana: VentanaTurno | null;
  parrafos: Parrafo[];
  desfaseMs: number;
  miOrden: number | null;
  esMiTurno: boolean;
  ocupado: boolean;
  error: string | null;
  enviarFrase: (texto: string) => Promise<void>;
  iniciar: () => Promise<void>;
  terminar: () => Promise<void>;
  refrescar: () => Promise<void>;
}

/**
 * Hook central de una historia en curso. Combina dos fuentes:
 *  - sondeo HTTP a /estado cada 2s, que es la fuente de verdad real y la
 *    unica que siempre funciona (no depende de Portal).
 *  - un canal de Portal efimero, usado solo para bajar la latencia: cuando
 *    OTRO participante narra, nos enteramos al instante en vez de esperar
 *    hasta el proximo tick del sondeo.
 *
 * Si Portal no esta configurado (PortalRaiz sin apiKey) send/onMessage
 * quedan inertes y el hook sigue funcionando solo con el sondeo. Esa
 * degradacion es intencional: el sondeo nunca depende de Portal.
 */
export function useHistorySession(sesion: SesionActiva | null): SesionHistoria {
  const [estado, setEstado] = useState<EstadoPublico | null>(null);
  const [parrafos, setParrafos] = useState<Parrafo[]>([]);
  const [desfaseMs, setDesfaseMs] = useState(0);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Copia siempre-actualizada de "sesion" para usar dentro de callbacks
  // estables (useCallback con deps []) sin tener que reconstruirlos cada
  // vez que cambia la sesion.
  const sesionRef = useRef(sesion);
  sesionRef.current = sesion;

  // Se apaga al desmontar; toda actualizacion de estado async la consulta
  // antes de llamar a un setState para no escribir sobre un componente ya
  // desmontado.
  const vivoRef = useRef(true);
  useEffect(() => {
    return () => {
      vivoRef.current = false;
    };
  }, []);

  // channelId undefined deja el canal inerte cuando no hay sesion, en vez
  // de llamar useChannel condicionalmente (las reglas de hooks no dejan).
  //
  // SUPUESTO IMPORTANTE (confirmado leyendo node_modules/@portalsdk/react):
  // useChannel exige un <PortalProvider> en el arbol y tira una excepcion
  // en render si no lo encuentra, no se degrada solo. Como PortalRaiz NO
  // monta provider cuando no hay apiKey (modo sin Portal), atajamos esa
  // excepcion con try/catch para poder seguir funcionando solo con el
  // sondeo en vez de tumbar la pantalla. Esto no rompe las reglas de hooks:
  // para una instancia ya montada de este hook, que haya o no provider
  // nunca cambia a mitad de vida (PortalRaiz cambia de Fragment a
  // PortalProvider en la raiz del arbol, lo que remonta todo lo de abajo en
  // vez de alternar la condicion in-place), asi que la cantidad de hooks
  // internos que useChannel llega a ejecutar es estable render tras render.
  let send: UseChannelResult<MensajeCanal>["send"];
  try {
    ({ send } = useChannel<MensajeCanal>({
      channelId: sesion?.canalId,
      history: "none",
      onMessage: (mensaje) => {
        const contenido = mensaje.content;
        if (contenido.tipo !== "parrafo" || !contenido.parrafo) return;

        const nuevo = contenido.parrafo;
        // El propio parrafo ya se agrego optimista en enviarFrase; solo nos
        // interesa lo que mandan LOS DEMAS.
        if (nuevo.autorId === sesionRef.current?.userId) return;

        setParrafos((previos) => {
          if (previos.some((p) => p.id === nuevo.id)) return previos;
          return [...previos, nuevo].sort((a, b) => a.indice - b.indice);
        });
      },
    }));
  } catch {
    send = () => Promise.reject(new Error("Portal no disponible."));
  }

  const refrescar = useCallback(async (): Promise<void> => {
    const actual = sesionRef.current;
    if (!actual) return;
    try {
      const datos = await api.estado(actual.canalId, actual.token);
      if (!vivoRef.current) return;
      setEstado(datos);
      setParrafos(datos.parrafos);
      setDesfaseMs(Date.now() - datos.servidorAhora);
    } catch (err) {
      if (!vivoRef.current) return;
      setError(err instanceof Error ? err.message : "No se pudo consultar el estado.");
    }
  }, []);

  // Primer estado apenas hay sesion, sin esperar los 2s del intervalo.
  useEffect(() => {
    if (sesion) void refrescar();
  }, [sesion, refrescar]);

  // Sondeo cada 2s mientras la historia no llego a un estado terminal. Se
  // reprograma solo cuando cambia el estado.estado (no en cada tick), asi
  // que el intervalo no se reinicia de mas.
  useEffect(() => {
    if (!sesion) return;
    if (estado && ESTADOS_TERMINALES.has(estado.estado)) return;

    const id = setInterval(() => {
      void refrescar();
    }, INTERVALO_SONDEO_MS);

    return () => clearInterval(id);
  }, [sesion, estado?.estado, refrescar]);

  const iniciar = useCallback(async (): Promise<void> => {
    const actual = sesionRef.current;
    if (!actual) return;
    setOcupado(true);
    setError(null);
    try {
      const datos = await api.iniciar(actual.canalId, actual.token);
      if (!vivoRef.current) return;
      setEstado(datos);
      setParrafos(datos.parrafos);
      setDesfaseMs(Date.now() - datos.servidorAhora);
    } catch (err) {
      if (!vivoRef.current) return;
      setError(err instanceof Error ? err.message : "No se pudo iniciar la historia.");
    } finally {
      if (vivoRef.current) setOcupado(false);
    }
  }, []);

  const terminar = useCallback(async (): Promise<void> => {
    const actual = sesionRef.current;
    if (!actual) return;
    setOcupado(true);
    setError(null);
    try {
      const datos = await api.terminar(actual.canalId, actual.token);
      if (!vivoRef.current) return;
      setEstado(datos);
      setParrafos(datos.parrafos);
      setDesfaseMs(Date.now() - datos.servidorAhora);
    } catch (err) {
      if (!vivoRef.current) return;
      setError(err instanceof Error ? err.message : "No se pudo terminar la historia.");
    } finally {
      if (vivoRef.current) setOcupado(false);
    }
  }, []);

  const enviarFrase = useCallback(
    async (texto: string): Promise<void> => {
      const actual = sesionRef.current;
      if (!actual) return;
      setOcupado(true);
      setError(null);
      try {
        const resultado = await api.narrar(actual.canalId, actual.token, texto);
        if (!vivoRef.current) return;

        // Optimista: "resultado.estado" ya trae el parrafo nuevo integrado,
        // asi que pisamos el estado local ya mismo en vez de esperar el
        // proximo tick del sondeo.
        setEstado(resultado.estado);
        setParrafos(resultado.estado.parrafos);
        setDesfaseMs(Date.now() - resultado.estado.servidorAhora);

        // El bridge "notify" de portal.config.ts necesita userIds concretos:
        // el campo "to" del descriptor NO acepta un "difundir a todos", asi
        // que un valor tipo "all" se tomaria como un usuario llamado "all" y
        // el item de inbox no le llegaria a nadie. Por eso el emisor adjunta
        // la lista explicita de activos menos el mismo.
        const destinatarios = resultado.estado.participantes
          .filter((p) => p.activo && p.userId !== actual.userId)
          .map((p) => p.userId);

        // Ademas lo publicamos por Portal para que los demas lo vean sin
        // esperar su propio sondeo. Es best-effort: si Portal no esta
        // disponible o el send falla, no bloqueamos el flujo principal (el
        // sondeo HTTP de todos igual va a traer este parrafo).
        send({
          ephemeral: true,
          content: {
            tipo: "parrafo",
            parrafo: resultado.parrafo,
            destinatarios,
            emitidoEn: Date.now(),
          },
        }).catch(() => {
          // silencioso a proposito, ver comentario de arriba
        });
      } catch (err) {
        if (!vivoRef.current) return;
        if (err instanceof ErrorApi && err.status === 409) {
          // 409 = no es tu turno; el mensaje del backend ya es legible.
          setError(err.message);
        } else {
          setError(err instanceof Error ? err.message : "No se pudo enviar la frase.");
        }
      } finally {
        if (vivoRef.current) setOcupado(false);
      }
    },
    [send],
  );

  const miOrden = sesion?.orden ?? null;
  const ventana = estado?.ventana ?? null;
  const esMiTurno =
    miOrden === null || ventana === null
      ? false
      : ventana.modo === "realtime"
        ? true
        : ventana.ordenEnCurso === miOrden;

  return {
    estado,
    ventana,
    parrafos,
    desfaseMs,
    miOrden,
    esMiTurno,
    ocupado,
    error,
    enviarFrase,
    iniciar,
    terminar,
    refrescar,
  };
}
