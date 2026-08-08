# DECISIONS.md — decisiones tecnicas de historia-paralela

Cada entrada explica **por que** se tomo la decision, no solo cual fue.

---

## 0. Duos, tweets y dos estilos de sala

Tres decisiones de producto tomadas tras jugar con el sistema real:

**Cupo maximo 2.** La experiencia esta afinada para duos: con mas gente los
turnos se alargan (N x ventana), el costo de IA crece linealmente y la
historia pierde hilo. El tope vive en la ruta (zod `max(2)`) y OTRA VEZ en el
store (`crear()` acota), porque la UI es una sugerencia, no una defensa.

**Frases de 280 caracteres, como un tweet.** No solo por ritmo: cada turno
manda a la IA el acumulado + la frase nueva. Frases cortas = contexto corto =
respuestas mas rapidas y baratas. El limite se aplica en zod, en el saneador
(`LARGO_MAXIMO_FRASE`) y en el `maxLength` del input con contador visible.

**Dos estilos de sala.** Quien crea la sala elige:
- `pixel`: el motor de escenas en datos (punto 7). Turnos de 20s.
- `vector`: DeepSeek dibuja cada escena como SVG estilo cuento infantil.
  Turnos de 40s, porque generar un SVG son ~3500 tokens (~21s medidos) y en
  una ventana de 20s la escena llegaria siempre un turno tarde.

**La animacion vectorial es la "opcion B", por contrato.** El SVG que produce
la IA es ESTATICO y prohibimos SMIL/scripts; los elementos vivos van
etiquetados (`data-anim="flotar" data-amp data-periodo-ms data-fase`). En el
navegador, un CSS inyectado (`CSS_ANIMACIONES_VECTOR`) los mueve; para el
video, `aplicarFotogramaSvg()` congela cada frame con `calcularDesfase()` —
LA MISMA formula que anima el motor pixel — y `rsvg-convert` lo rasteriza.
La alternativa (Chromium headless capturando frames) daba animacion libre a
cambio de ~300MB de imagen Docker y fragilidad; se descarto. El costo asumido:
los movimientos son los 5 tipos del contrato, no animacion arbitraria — que es
lo que el modelo usa en la practica de todos modos.

Cada parrafo vectorial guarda TAMBIEN su `escena` pixel de respaldo: si el
SVG falla o se sanea a nada, el cliente y el video caen al motor pixel y la
partida no se entera.

---

## 1. Duracion de la historia: parametrizada, por defecto 180s

El prompt original menciona dos valores distintos: "Limite de tiempo: 2 minutos
por historia" en las reglas globales, y "Contador de 3 min regresivo" en los
criterios de exito (ademas del componente `Timer3min`).

**Decision:** no elegir por el usuario. La duracion vive en
`HISTORIA_DURACION_SEGUNDOS` y el valor por defecto es **180s (3 min)**, porque
es el que aparece dos veces y el que da nombre al componente. Cambiarlo a 120 es
editar una linea del `.env`.

---

## 2. El cronograma de turnos es determinista, no difundido

**Problema:** en modo snapshot el orden de integracion debe ser identico para
todos los clientes, y el backend debe poder rechazar a quien se adelante.

**Alternativa descartada:** que el servidor emita "ahora le toca al #3" por el
canal. Requiere que el backend publique en Portal; la REST server-side de Portal
existe (lo confirma su documentacion) pero sus rutas exactas no estan
enumeradas en la documentacion publica, y no queriamos construir la pieza
central sobre una API que no pudimos verificar.

**Decision:** la ventana de turno se **deriva** de `iniciadaEn` + constantes
(`TURNO_DURACION_MS`, `TURNO_GRACIA_MS`). `calcularVentana()` en
`services/turnos.ts` es una funcion pura que corre igual en servidor y cliente.

Consecuencias buenas:
- Un cliente que se reconecta a mitad de historia recalcula y cae en el mismo
  turno que el resto, sin pedir nada.
- El servidor revalida con la MISMA funcion en `puedeIntegrar()`, asi que la UI
  no es la defensa: es solo una sugerencia.
- No hay estado de turno que sincronizar, luego no hay estado de turno que
  pueda desincronizarse.

El desfase de reloj se corrige con `servidorAhora`, que viaja en cada snapshot
de estado.

---

## 3. Quien difunde los parrafos: el cliente que actua

Como no publicamos desde el backend (ver punto 2), el cliente cuyo parrafo se
integra publica el resultado por su propia conexion de Portal. El backend ya lo
valido y lo guardo, asi que el mensaje de Portal es **solo aceleracion**: si se
pierde, el sondeo de estado cada 2s lo recupera. La app funciona sin Portal.

---

## 4. Efimero de verdad: tres capas

La regla de oro del producto es "nada persiste". Se aplica en tres sitios:

1. **Aplicacion:** `historiaStore` es un `Map` en memoria. No hay ORM, no hay
   migraciones, no hay fichero. Un barredor purga historias vencidas cada 30s
   (TTL 10 min tras el fin, 30 min para salas en lobby nunca usadas).
2. **Portal:** los mensajes se envian con `ephemeral: true` y los canales se
   abren con `history: "none"`. Portal tampoco los guarda ni los sirve a quien
   llegue tarde.
3. **Infraestructura:** en `docker-compose.yml`, `/app/tmp` es un **tmpfs**. Los
   mp4 temporales viven en RAM y desaparecen con el contenedor, aunque el
   proceso muera sin limpiar.

El video se borra al descargarlo, y si nadie lo descarga, un temporizador lo
borra al expirar (`VIDEO_EXPIRY_SECONDS`, 5 min).

Redis es **opcional** y esta detras de un profile de compose. Solo serviria
como cache de rate-limit si se escalara a varias replicas; jamas guarda
historias. Arranca con `--save "" --appendonly no`, es decir, sin persistencia.

---

## 5. Autenticacion: dos tokens con dos proposito distintos

Portal verifica identidad por **JWKS (RS256)**, no por secreto compartido —
asi lo documenta su configuracion (`auth.jwksUrl` + `claimMap`).

- **Token de Portal (RS256):** lo firma el backend con una clave RSA y lo
  verifica Portal contra `/.well-known/jwks.json`. Lleva `sub`, `name` y el
  claim `canal`.
- **Token de sesion (HS256 propio):** prueba "soy este participante de este
  canal" ante NUESTRA API. Es un HMAC casero de 20 lineas en `lib/guards.ts`.

**Por que dos:** son audiencias distintas. Poder rotar el secreto de nuestra API
sin redeplegar la config de Portal, y viceversa, vale mas que el ahorro de tener
uno solo. La comparacion de firma usa `timingSafeEqual` porque una comparacion
normal de strings filtra la firma byte a byte.

Si no se define `JWT_PRIVATE_KEY_PEM`, el backend genera un par RSA efimero al
arrancar. Sirve para desarrollo; en produccion hay que fijarlo o los tokens
dejan de validar en cada reinicio.

---

## 6. DeepSeek como proveedor, y una IA que degrada sin romper

El director narrativo corre sobre **DeepSeek** (`https://api.deepseek.com`,
modelos `deepseek-v4-flash` y `deepseek-v4-pro`), que expone un formato
compatible con OpenAI. Cambiar de proveedor es cambiar `IA_API_URL`.

Tres detalles verificados en su documentacion que estan reflejados en el codigo:

- **DeepSeek no tiene endpoint de imagenes.** Es solo texto. Lejos de ser un
  problema, encaja exactamente con la decision del punto 7: la IA describe la
  escena en datos y el dibujo lo hace codigo.
- **El modo JSON exige** que aparezca la palabra "json" **y** un ejemplo del
  formato en el prompt. `PROMPT_SISTEMA` cumple ambas.
- **A veces devuelve contenido vacio.** El cliente lo detecta y lo trata como
  error para que entre el plan B.

### El razonamiento hay que APAGARLO, y no es evidente

Los `deepseek-v4-*` razonan por defecto y devuelven el razonamiento en
`reasoning_content`. Esos tokens **se descuentan del mismo `max_tokens`** que
la respuesta. Medido contra la API real, con nuestro prompt de 6000 caracteres:

| Configuracion | Tiempo | `finish_reason` | Razonamiento | Contenido | JSON |
|---|---|---|---|---|---|
| razonando, 1400 tokens | 15.8s | `length` | 4981 ch | **0 ch** | roto |
| razonando, 4000 tokens | 38.2s | `length` | 13072 ch | **0 ch** | roto |
| **sin razonar, 1400** | **3.8s** | `stop` | 0 ch | 1632 ch | **correcto** |

Dos lecciones:

1. **Subir `max_tokens` no lo arregla**: el modelo simplemente piensa mas. Es
   la reaccion instintiva ante un `finish_reason: "length"` y aqui es la
   equivocada.
2. **El sintoma es traicionero.** La API responde `200 OK`, con un `content`
   vacio. Nada parece roto: el turno se cae al director simulado, la partida
   continua con prosa de plantilla, y sin mirar de cerca parece que la IA esta
   funcionando. Se detecto porque una narracion "generada" salio identica a
   una plantilla del modo offline.

De ahi salen dos decisiones de codigo:

- `thinking: { type: "disabled" }` por defecto (`IA_RAZONAMIENTO`). Aqui no
  queremos deliberacion, queremos JSON estructurado dentro de un turno de 20s.
- **El fallback ya no es silencioso.** `narrar()` registra por que degrado.
  Degradar sin avisar es peor que fallar: todo "funciona" mientras la IA lleva
  horas sin responder. Y `iaClient` distingue un `finish_reason: "length"` del
  fallo esporadico de respuesta vacia, porque llevan a arreglos opuestos.

`services/director.ts` tiene tres niveles:

1. Con `IA_API_KEY`: llama a DeepSeek y pide JSON estricto.
2. Si esa llamada falla, se agota, vuelve vacia o el JSON no parsea: cae al
   director **simulado**.
3. Sin `IA_API_KEY`: director simulado desde el principio.

**Por que:** una partida en curso con gente escribiendo no puede morir porque
el proveedor tenga un mal minuto. Ademas hace el proyecto demostrable y
testeable sin claves — `docker compose up` funciona con un `.env` vacio.

El director simulado no se limita al texto: tambien **compone la escena** a
partir de palabras clave del material (bosque, mar, cueva, noche, fuego,
puerta, castillo...), asi que la demo sin claves tambien tiene pixel art
animado.

---

## 7. La IA no dibuja la escena: escribe el codigo de la escena

Esta es la decision que mas define el producto.

El planteamiento obvio seria pedirle una imagen a un generador y reducirla
para que parezca pixel art. Se descarto. En su lugar, la IA devuelve un
**`EscenaSpec`**: datos que describen que hay en la escena y donde
(`packages/escena`). El pixel art lo dibuja **codigo**, sobre una rejilla de
160x90.

**Por que es mejor:**

- **Se mueve.** Un PNG generado es una foto fija. Un spec lleva animaciones
  por elemento (`flotar`, `deslizar`, `parpadeo`, `pulso`, `ondular`), asi que
  la escena respira mientras se lee el parrafo.
- **Cuesta cero por turno.** El modelo solo escribe texto. No hay factura de
  generacion de imagenes, y de paso el proveedor de IA solo necesita saber
  hacer texto — que es justo la limitacion de DeepSeek (ver punto 6).
- **Es pixel art de verdad.** Pixeles colocados en una rejilla, no una foto
  encogida con los bordes sucios.
- **Es rapido.** Una respuesta de texto llega en ~1-2s; una imagen tarda
  10-30s, lo que no cabe en un turno de 20s.
- **Es determinista.** El mismo spec da siempre los mismos pixeles.

**El truco que lo sostiene: un unico motor compartido.** `renderizarEscena()`
es una funcion pura sin DOM ni Node, y la llaman tanto el navegador (animando
en vivo) como el backend (generando los frames del video). Por eso el mp4
exportado se parece a lo que la gente vio jugando, en vez de ser una
reconstruccion aproximada.

**Como se evita que el modelo produzca ruido.** La libertad esta acotada a
proposito:
- La paleta son 16 colores **con nombre**. La IA escribe `"cian"`, no un hex.
  Ninguna escena puede salirse de la identidad visual del juego.
- Los sprites son un **catalogo dibujado a mano** (arbol, pino, luna, casa,
  puerta, zorro, portal, torre...). La IA decide QUE aparece y donde; el
  estilo lo garantiza el catalogo. Si pudiera pintar pixel a pixel, saldria
  ruido.
- `sanearEscena()` **corrige en vez de rechazar**: recorta coordenadas
  absurdas, sustituye nombres inventados y limita capas y escalas. Tirar la
  escena entera porque el modelo se equivoco en un numero dejaria al jugador
  sin imagen; y un spec con 5000 capas bloquearia el hilo de render.

**Rendimiento.** El canvas del navegador se mantiene a 160x90 nativos y es el
CSS quien lo agranda: el nearest-neighbor lo hace el navegador gratis. Para el
video, los PNG se escalan x8 exacto (1280x720) — factor **entero**, porque
cualquier escalado fraccionario reparte un pixel logico entre dos fisicos y
arruina el filo del pixel art.

Los assets estaticos de la UI (emblema, fondos, iconos) si son imagenes, y se
generaron con Higgsfield en pixel art 16-bit: viven en
`apps/web/public/assets/`.

### El codificador PNG es propio

`apps/api/src/lib/png.ts` son ~50 lineas sobre `zlib` (que ya viene en Node).
Traer `sharp` o `node-canvas` significaria un binario nativo, una imagen de
Docker mucho mas pesada y problemas de compilacion en Alpine — todo para
volcar un buffer RGBA a un fichero que FFmpeg sepa leer.

### Tres trampas de FFmpeg que costaron un video invisible

Las tres se encontraron exportando de verdad y mirando un fotograma, no
leyendo el codigo. Ninguna produce un error: FFmpeg termina con exito y
devuelve un mp4 valido.

**1. Alpine no trae fuentes.** `libass` (quien quema los subtitulos) necesita
al menos una fuente instalada. Sin ninguna, codifica el video entero sin una
sola advertencia y los subtitulos salen **invisibles**. Por eso el `Dockerfile`
instala `ttf-dejavu`, y por eso `ESTILO_CINE` pide `DejaVu Sans Mono` y no
`Courier New` (que tampoco existe en la imagen). Si se cambia el nombre de la
fuente en el codigo, hay que cambiar el paquete del Dockerfile.

**2. `force_style` no habla en pixeles.** Al convertir SRT a ASS, FFmpeg fija
un lienzo virtual de 384x288 y libass lo escala al tamano real. Con un video
de 1024 de alto el factor es ~3.56, asi que un `FontSize=26` razonable se
renderiza a ~92px y tapa la escena entera. Los valores actuales
(`FontSize=11`, `MarginV=20`, `Outline=1`) estan elegidos para caer en ~39px
de texto y ~71px de margen una vez escalados.

**3. El demuxer `concat` cuenta el ultimo tramo dos veces.** Hay que repetir
la linea `file` final para que el ultimo frame no dure 0s, pero cuando el
mismo PNG se repite en la lista (historias sin imagen, que reusan el frame de
respaldo) ese tramo final se contabilizaba entero: 3 parrafos daban 80s en vez
de 60s. Se resuelve acotando la salida con `-t parrafos * 20`, que ademas hace
la duracion exacta e independiente de las rarezas del demuxer.

---

## 8. Un solo contenedor sirve API y frontend

El backend sirve el bundle estatico de Vite. Mismo origen: sin CORS en
produccion, sin un segundo servicio que exponer, y el `Content-Security-Policy`
puede ser mas estricto. En desarrollo, Vite proxea `/api` al backend para
reproducir esa misma condicion.

---

## 9. Seguridad: donde esta cada defensa

| Riesgo | Defensa | Donde |
|---|---|---|
| Fuga de la clave de IA | Nunca sale del backend | `services/iaClient.ts` |
| Exceder el cupo | Verificacion server-side en el alta | `historiaStore.unir()` |
| Saltarse el turno | Revalidacion con la funcion pura de turnos | `turnos.puedeIntegrar()` |
| XSS | Escape en servidor + cero `dangerouslySetInnerHTML` | `lib/sanitize.ts` |
| Inyeccion de prompt | Limpieza de marcadores + instruccion explicita a la IA | `sanitize.ts`, `director.ts` |
| Abuso de coste | Rate limit por usuario y por canal | `lib/guards.ts` |
| Cabeceras | Helmet con CSP explicita | `server.ts` |
| Contenedor | Usuario no-root, multi-stage, `no-new-privileges` | `Dockerfile`, compose |

El saneado se aplica **dos veces**: antes de mandar el texto a la IA y antes de
guardarlo. Lo que esta en el store ya es seguro de renderizar.

---

## 10. Sin dependencias innecesarias

- El JWT propio es un HMAC de ~20 lineas, no una libreria.
- FFmpeg se invoca con `spawn`, sin `fluent-ffmpeg`.
- No hay router de React: tres pantallas se manejan con una maquina de estados
  en `App.tsx`.
- `ffmpeg-static` descartado a favor del `ffmpeg` del sistema (Alpine): la
  imagen final pesa menos.

### Sobre `npm audit`

`npm audit` reporta 2 avisos (1 moderado, 1 alto) que provienen de **Vite y su
esbuild**, y ambos afectan unicamente al **servidor de desarrollo**
(`vite dev`): CORS permisivo en el dev-server de esbuild y lectura de ficheros
via el dev-server de Vite.

Se fija Vite `5.4.21`, la ultima de la rama 5.x. El aviso de esbuild persiste
ahi; resolverlo exige saltar a Vite 7, lo que arrastra `@vitejs/plugin-react`
a la v5.

**Por que se acepta:** la imagen de produccion **no ejecuta Vite**. El
`Dockerfile` compila el bundle en una etapa intermedia y el runtime solo sirve
ficheros estaticos con Express, con `npm install --omit=dev`, de modo que ni
Vite ni esbuild llegan a la imagen final. La superficie afectada es la maquina
de quien desarrolla, y solo mientras `npm run dev` este levantado.

Si se quiere dejar el audit en cero, el camino es actualizar los tres a la vez:
`vite@^7`, `@vitejs/plugin-react@^5` y revisar `vite.config.ts`.
