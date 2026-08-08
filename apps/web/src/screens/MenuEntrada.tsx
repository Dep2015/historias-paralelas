import { useState } from "react";
import { api, ErrorApi } from "../lib/api.js";
import type { EstiloEscena, SesionActiva } from "../lib/historia.js";
import { MenuCupo } from "../components/MenuCupo.js";

/**
 * Primera pantalla: crear o unirse a un canal. Propaga la sesion resultante
 * hacia arriba para que App.tsx cambie de pantalla.
 */
interface PropsMenuEntrada {
  onSesion: (sesion: SesionActiva) => void;
}

export function MenuEntrada({ onSesion }: PropsMenuEntrada): JSX.Element {
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function entrar(canalId: string, nombre: string, cupo: number, estilo: EstiloEscena): Promise<void> {
    setOcupado(true);
    setError(null);
    try {
      // crearCanal es idempotente en el backend: si el canal ya existe lo
      // devuelve tal cual sin tocar su cupo ni su estilo. Por eso sirve tanto
      // para crear uno nuevo como para "entrar" a uno existente (el estilo
      // que se manda aqui se ignora si el canal ya existia, lo fijo quien lo
      // creo) sin logica extra en este componente.
      await api.crearCanal(canalId, cupo, estilo);
      const sesion = await api.entrar(canalId, nombre);
      onSesion(sesion);
    } catch (err) {
      // El backend manda 409 (entre otros) con un mensaje legible cuando el
      // canal esta lleno; lo mostramos tal cual en vez de inventar uno propio.
      setError(err instanceof ErrorApi ? err.message : "No se pudo entrar a la historia.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section className="pantalla-menu">
      <MenuCupo onEntrar={entrar} error={error} ocupado={ocupado} />
    </section>
  );
}
