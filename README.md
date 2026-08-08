# HISTORIA PARALELA

Chat de cuentos colaborativo. Varias personas (o una sola) entran a un canal y
escriben una historia juntas. Una IA directora encadena lo que escriben en
parrafos de cuento y, para cada escena, **escribe el codigo de un dibujo pixel
art 16-bit animado** que se pinta en vivo. Al terminar, todo se exporta a un
video con el texto como leyenda... y se borra. **Nada persiste.**

> La IA no genera imagenes: devuelve la escena **en datos** (que hay y donde) y
> el pixel art lo dibuja codigo, sobre una rejilla de 160x90. Por eso las
> escenas **se mueven**, no cuestan nada por turno, y el video exportado sale
> del mismo motor que el navegador. Ver [DECISIONS.md](DECISIONS.md#7).

```
   ┌──────────────┐      ┌───────────────┐      ┌──────────────┐
   │  MENU/CUPO   │ ───▶ │  SALA (chat)  │ ───▶ │  EXPORTAR    │
   │ elegir canal │      │ IA + pixelart │      │ video + fin  │
   └──────────────┘      └───────────────┘      └──────────────┘
                                                  ↓
                                            todo se borra
```

---

## Arrancar

### Con Docker (recomendado)

```bash
cp .env.example .env
docker compose up --build
```

Abre **http://localhost:3000**.

Funciona con el `.env` sin tocar: sin `IA_API_KEY` el backend usa un **director
simulado** y sin claves de Portal la app cae a sondeo HTTP. Es totalmente
jugable asi — util para probar antes de gastar en APIs.

### En local (sin Docker)

```bash
npm install
cp .env.example .env
npm run dev
```

- Frontend: http://localhost:5173 (proxea `/api` al backend)
- Backend: http://localhost:3000

Para exportar video necesitas `ffmpeg` en el PATH, o define `FFMPEG_PATH`.

---

## Como se juega

### El cupo lo decide quien crea la sala

En el menu eliges un ID de canal y **cuantas personas pueden entrar** (1, 2, 5,
10 o ilimitado). El menu muestra en vivo cuantas hay dentro de cada sala. Si
esta llena, no se puede entrar — y eso se verifica **en el servidor**, no solo
en la interfaz.

### El modo no se elige: lo dicta la presencia

| Personas conectadas | Modo | Como funciona |
|---|---|---|
| 1 | **REALTIME** | Cada oracion completa (punto final, Enter, o 1.5s de pausa) dispara a la IA al instante. |
| 2 o mas | **SNAPSHOT 20s** | Todos escriben en paralelo desde el principio, pero la historia se integra por turnos. |

### El orden en modo snapshot

Al entrar recibes un **numero de orden** (1, 2, 3...) segun cuando te conectaste.
Ese numero es el orden del cuento.

1. Se integra el parrafo del **#1** y corre su leyenda sobre la imagen (~20s).
2. Mientras tanto, **#2, #3...** siguen escribiendo y pueden editar su parrafo.
3. Al acabar los 20s entra el **#2** tal como quedo su texto. Y asi sucesivamente.

Hay un margen de gracia de +3s para no cortar a nadie a media frase.

> **El borrador ajeno nunca se ve.** Cada quien ve solo su propio texto mientras
> lo escribe. El texto de los demas aparece cuando sale en la leyenda.

### Como termina

Lo que ocurra primero:
- Se agota el cronometro (3 min por defecto).
- Pasan todos los integrantes en orden.
- Cualquiera pulsa **TERMINAR** (esta disponible para todos los conectados).

Despues viene el "cinema": la historia se reproduce con sus imagenes y leyendas,
y puedes exportarla a mp4.

---

## El video y el borrado

Al exportar, el backend **renderiza los frames** de cada escena con el mismo
motor que uso el navegador (asi el video conserva la animacion y se parece a lo
que la gente vio), arma un `.srt` con los parrafos y quema los subtitulos con
FFmpeg. Los frames se escalan x8 exacto a 1280x720: factor entero, porque un
escalado fraccionario reparte un pixel logico entre dos fisicos y destruye el
filo del pixel art.

El enlace de descarga **expira en 5 minutos**. Cuando lo descargas, el video se
borra del disco y el estado de la historia se elimina de memoria. Si no lo
descargas, un temporizador lo borra igual. En Docker, `/app/tmp` es un **tmpfs**:
los ficheros ni siquiera tocan el disco real.

---

## Estructura

```
historia-paralela/
├── docker-compose.yml       app + redis (opcional, profile "cache")
├── Dockerfile               multi-stage, usuario no-root
├── portal.config.ts         autoridad de Portal (canales, authz, middleware)
├── packages/
│   └── escena/              MOTOR DE ESCENAS (compartido web + api)
│       └── src/
│           ├── spec.ts      formato que devuelve la IA
│           ├── paleta.ts    16 colores con nombre
│           ├── sprites.ts   catalogo dibujado a mano
│           ├── render.ts    rasterizador puro y determinista
│           └── sanear.ts    corrige lo que la IA se invente
├── apps/
│   ├── web/                 React 18 + Vite + TS
│   │   ├── public/assets/   pixel art 16-bit generado con IA
│   │   └── src/
│   │       ├── portal/      cliente Portal y provider
│   │       ├── hooks/       useHistorySession, usePresence, usePixelate...
│   │       ├── components/  SalaChat, EscenaPixel, Timer3min...
│   │       ├── screens/     MenuEntrada, Sala, Exportar
│   │       └── lib/         api.ts, historia.ts, pixelate.ts
│   └── api/                 Node + Express + TS
│       └── src/
│           ├── routes/      canales, ia, export, portalToken (JWKS)
│           ├── services/    director, historiaStore, turnos, videoExporter
│           ├── dominio/     tipos
│           └── lib/         env, guards, sanitize, png (codificador propio)
└── DECISIONS.md             por que cada decision tecnica
```

---

## Variables de entorno

Ver `.env.example`. Las importantes:

| Variable | Para que |
|---|---|
| `IA_API_KEY` | Clave de DeepSeek. **Nunca** llega al navegador. Sin ella, director simulado. |
| `IA_MODELO_TEXTO` | `deepseek-v4-flash` (rapido/barato) o `deepseek-v4-pro` (mejor prosa). |
| `PORTAL_PUBLISHABLE_KEY` | Va al navegador (es publica). |
| `PORTAL_SECRET_KEY` | Jamas sale del backend. |
| `JWT_PRIVATE_KEY_PEM` | Clave RSA para firmar tokens de Portal. Sin ella se genera una efimera. |
| `JWT_SIGNING_SECRET` | HMAC de las sesiones propias. **Obligatorio cambiarlo en produccion** (el arranque falla si no). |
| `HISTORIA_DURACION_SEGUNDOS` | Duracion de la partida. Por defecto 180. |
| `VIDEO_EXPIRY_SECONDS` | Vida del enlace de descarga. Por defecto 300. |

---

## Scripts

```bash
npm run dev          # backend + frontend
npm run build        # compila ambos
npm run typecheck    # TypeScript estricto en los dos workspaces
npm start            # produccion (sirve el bundle ya construido)
```

---

## Portal

La autoridad vive en `portal.config.ts` (raiz) y se despliega con el CLI de
Portal. Define:

- Canales `hist-*`, solo autenticados.
- `authz`: el claim `canal` del JWT debe coincidir con el canal al que te
  conectas.
- `onPublish`: valida forma y tamano del mensaje.
- `notify`: convierte los eventos clave (parrafo nuevo, historia terminada) en
  items de inbox.
- `auth`: verificacion por JWKS contra `/.well-known/jwks.json` de este backend.

Todos los mensajes se envian con `ephemeral: true` y los canales se abren con
`history: "none"` — Portal tampoco guarda nada.

---

## Seguridad

Clave de IA solo en backend · verificacion de cupo en servidor · revalidacion
de turno en servidor · rate limit por usuario y por canal · Helmet con CSP
explicita · CORS estricto · validacion zod en todos los endpoints · saneado
anti-XSS y anti-inyeccion-de-prompt (dos pasadas) · firma comparada en tiempo
constante · contenedor sin root.

Detalle completo en [DECISIONS.md](DECISIONS.md).

---

## Licencia

MIT — ver [LICENSE](LICENSE).
