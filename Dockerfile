# =============================================================================
# historia-paralela — imagen unica (multi-stage)
# El backend sirve el bundle estatico del frontend: un solo contenedor, menos
# superficie expuesta y CORS trivial en produccion.
# =============================================================================

# --- Etapa 1: build --------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

# Los manifests primero: mientras no cambien, Docker reutiliza la capa de
# dependencias y el build no vuelve a bajar nada.
COPY package.json package-lock.json* ./
COPY packages/escena/package.json ./packages/escena/
COPY apps/web/package.json ./apps/web/
COPY apps/api/package.json ./apps/api/

# npm workspaces eleva las dependencias a /app/node_modules, asi que NO se
# pueden copiar carpetas por workspace entre etapas (pueden no existir).
# Se instala aqui directamente. --ignore-scripts evita postinstall de terceros.
#
# El lockfile se borra ANTES de instalar, a proposito. Se genera en la maquina
# de quien desarrolla (macOS) y ahi npm solo registra los binarios nativos
# opcionales de esa plataforma; dentro de Alpine falta
# @rollup/rollup-linux-*-musl y "vite build" muere. Es el bug npm/cli#4828, y
# el propio mensaje de npm indica esta salida: reinstalar sin lockfile.
# Se copia igualmente arriba para que siga sirviendo de clave de cache: si
# cambian las dependencias, esta capa se invalida.
# La reproducibilidad no se pierde donde importa: la etapa de runtime, que es
# la que llega a produccion, si instala con el lockfile.
RUN rm -f package-lock.json && npm install --ignore-scripts

COPY . .
RUN npm run build

# --- Etapa 2: runtime ------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app

# ffmpeg del sistema: mas liviano que arrastrar el binario de ffmpeg-static.
#
# ttf-dejavu NO es opcional: libass (el que quema los subtitulos) necesita al
# menos una fuente instalada, y Alpine no trae ninguna. Sin este paquete
# ffmpeg codifica el video sin error alguno pero las leyendas salen
# invisibles, que es justo lo que este proyecto va a exportar.
#
# rsvg-convert: rasteriza a PNG los fotogramas de las salas "vector" (SVG
# congelado por aplicarFotogramaSvg, ver videoExporter.ts) antes de pasarlos
# a ffmpeg. Sin el, esos parrafos siguen exportando: videoExporter cae a la
# rama pixel y avisa por consola, pero el video pierde el estilo vectorial.
RUN apk add --no-cache ffmpeg tini ttf-dejavu rsvg-convert

ENV NODE_ENV=production \
    PORT=3000 \
    FFMPEG_PATH=/usr/bin/ffmpeg

# Solo dependencias de produccion en la imagen final. Se copian TODOS los
# manifests porque el package.json raiz declara los tres workspaces y npm falla
# si alguno no existe en el arbol.
#
# El de packages/escena es imprescindible aunque sea codigo propio: npm lo
# enlaza en node_modules, y Node necesita ese package.json para resolver el
# paquete (su campo "exports" apunta a dist/index.js). Sin el, el enlace existe
# pero el import muere con ERR_MODULE_NOT_FOUND.
COPY package.json package-lock.json* ./
COPY packages/escena/package.json ./packages/escena/
COPY apps/web/package.json ./apps/web/
COPY apps/api/package.json ./apps/api/
RUN npm install --omit=dev --ignore-scripts --workspace=apps/api \
    && npm cache clean --force

# El motor de escenas es un workspace propio y el backend lo importa en
# tiempo de ejecucion (renderiza los frames del video con el). npm deja el
# enlace simbolico en node_modules, pero sin este dist el enlace apunta a un
# paquete vacio y el proceso muere con ERR_MODULE_NOT_FOUND al arrancar.
COPY --from=build /app/packages/escena/dist ./packages/escena/dist

COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/web/dist ./apps/web/dist

# Directorio de trabajo para los mp4 temporales (se vacia solo)
RUN mkdir -p /app/tmp

# Nunca como root: el usuario 'node' ya existe en la imagen base
RUN chown -R node:node /app
USER node

EXPOSE 3000

# tini como PID 1 para que SIGTERM llegue a node y los timers se limpien
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/api/dist/server.js"]
