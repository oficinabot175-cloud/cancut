# Arquitectura de CanCut

CanCut es una aplicación estática (HTML + JS + WASM) que se ejecuta íntegramente en el navegador. No hay servidor: los medios del usuario se leen con la File API, se guardan en IndexedDB y nunca salen del equipo.

## Flujo de datos

```
Archivos ──► core/media (sondeo, miniaturas, forma de onda) ──► store (Zustand + Immer)
                                                                   │
                     ┌─────────────────────────────────────────────┤
                     ▼                                             ▼
         engine/preview (tiempo real)                    engine/export (fotograma a fotograma)
   <video>/<audio> sincronizados + Web Audio           Mediabunny (demux + WebCodecs decode)
                     │                                             │
                     └──────────► render/scene (escena en t) ◄─────┘
                                         │
                                         ▼
                              render/compositor (WebGL2)
       fuente → corrección de color → cadena de efectos → máscara → transformación
             → transición → modo de fusión → composición final
                                         │
                       visor (canvas)  ──┴──  CanvasSource → MP4/WebM/MOV/MKV
```

## Modelo de proyecto (`src/types.ts`)

- **Project**: resolución, fps, fondo, pistas, clips, datos de seguimiento, marcadores y LUTs.
- **Track**: `visual` o `audio`; la pista superior se dibuja encima.
- **Clip**: `video | image | audio | text | shape | solid | adjustment`, con transformación, recorte, ajuste, modo de fusión, gradación de color, efectos, máscara, transición de entrada, animaciones, keyframes y ajustes de audio. Los vínculos `follow`, `reframe` y `stabilize` conectan el clip con datos de seguimiento.
- **TrackingData**: muestras `{t, boxes[]}` en coordenadas normalizadas de la fuente, de modo que sobreviven a recortes y cambios de velocidad.

## Render (`src/render`)

- Todas las texturas usan **alfa premultiplicado**; el origen de las texturas es la esquina superior izquierda y solo el pase final invierte el eje Y.
- Cada capa se procesa a la resolución a la que se mostrará (nunca mayor que la fuente), lo que mantiene el rendimiento con medios 4K.
- Los desenfoques grandes se calculan con reducción de resolución + gaussiano separable.
- Las transiciones mezclan la capa entrante con el último fotograma (congelado) del clip anterior de la misma pista.
- El texto se rasteriza con Canvas 2D a la escala final (nítido a cualquier tamaño) y se cachea.

## IA (`src/ai`)

- **MediaPipe Tasks** (WASM autoalojado en `public/vendor/mediapipe`, modelos desde Google Storage): segmentación de personas, detección de rostros y objetos.
- **Rastreador** propio (ZNCC multiescala con predicción de velocidad y plantilla adaptativa) en un Web Worker.
- **Whisper** vía Transformers.js en un Worker, con WebGPU o WASM y marcas de tiempo por palabra.

## Exportación (`src/engine/export.ts`)

- Resoluciones de 240p a 8K: el compositor procesa hasta `min(8192, MAX_TEXTURE_SIZE)` y el pool de render targets se limita por bytes (640 MB) para no agotar la GPU en 8K.
- «Guardar directo en disco»: con la File System Access API se usa `StreamTarget` (MP4/MOV sin fast-start), así un 8K largo no necesita caber en memoria.


1. Se precargan modelos de IA y fuentes.
2. Por cada clip de video se crea un decodificador WebCodecs con los tiempos exactos que necesita (sin búsquedas repetidas).
3. Cada fotograma se compone en un `OffscreenCanvas` y se codifica con `CanvasSource` (Mediabunny).
4. El audio se mezcla con `OfflineAudioContext` aplicando la misma cadena de EQ/compresión/ganancia que la vista previa.
5. Formatos extra (AVI, MPG, MP3, FLAC) se transcodifican con FFmpeg.wasm.

## Efectos con la persona y tendencias (`src/core/trends.ts`)

- Los efectos que necesitan la máscara de la persona (`bgRemove`, `aura`, `subjectRays`, `echo`) se detectan con `maskEffect()` en `scene.ts`; la máscara se calcula una vez por fotograma y se comparte (clave `segKey`: los duplicados de un clip comparten segmentación).
- `processChain` suaviza la máscara una sola vez (`getMask`) y la reutiliza en todos los efectos de IA del clip. Aura/contorno usan dos campos de distancia aproximados (máscara desenfocada a dos radios) en `FS_PERSON`; los rayos salen de una silueta con desenfoque radial; la estela guarda un historial de recortes por clip (`echoHistory`).
- «Texto detrás de la persona» = texto en una pista nueva + copia del clip con `bgRemove` (modo quitar) en una pista encima, recortada al rango del texto y con audio silenciado. Todo es editable y deshacible en un solo paso.
- `FS_TREND` agrupa los efectos procedurales (temblor, flash, zoom al ritmo, RGB shake, fugas de luz, destellos, partículas, película antigua, videocámara, prisma, Orton, bilateral, CAS, deband, color).
- «Mejorar calidad»: si el clip se muestra más grande que su resolución, se reescala con Catmull-Rom (`FS_BICUBIC`) antes de la corrección de color; después bilateral → deband → claridad → color → CAS.

## Motion graphics (`src/motion/hyperframes.ts`)

1. El catálogo (`public/hyperframes/catalog.json`) se genera con `scripts/build-hyperframes-catalog.mjs` desde un clon del repositorio oficial (plantillas sin WebGPU ni APIs experimentales).
2. La composición se carga en un iframe `srcdoc` con: `<base>` a su carpeta, `window.__hfVariables` (variables personalizadas), parche `preserveDrawingBuffer` para WebGL, las librerías de CDN reescritas a `public/vendor/` y el runtime oficial de HyperFrames.
3. Se espera a `__player.renderSeek` + `__renderReady`, y por cada fotograma: `renderSeek(t)` → `modern-screenshot.domToCanvas` (en el propio iframe) → `CanvasSource` de Mediabunny. Si el fotograma tiene transparencia se codifica WebM VP9 con `alpha: 'keep'`; si no, MP4 H.264 (o VP9/VP8).
4. El video resultante se importa como medio (`asset.alpha`, `asset.motion`) y se inserta en una pista nueva arriba (overlay) o abajo (fondo). La reproducción y la exportación conservan el alfa (Chrome decodifica VP9 alfa en `<video>` y Mediabunny en WebCodecs).

## Diseños, zonas y móvil

- `src/core/layouts.ts`: cada plantilla define zonas normalizadas para cámara y pantalla; `placeInSlot` calcula escala (cubrir), recorte simétrico y posición, y `Clip.frame` (esquinas, borde, brillo) se dibuja en `processChain` (FS_FRAME, respetando el recorte) y como brillo exterior en `renderLayer` (FS_GLOWUNDER). Los fondos procedurales se generan en un canvas a la resolución del proyecto.
- Zona de desenfoque: capa de ajuste con `Clip.region`; el resultado del ajuste se recorta con FS_OUTMASK usando la geometría del clip (se mueve con el gizmo).
- Rostros: `trackHeads` combina rostros (completo + mosaico 2×2), cabezas desde Pose Landmarker y personas; `buildFaceTracks` asocia en pistas con id, interpola huecos, suaviza y añade margen antes/después. `sampleTracking` interpola por id.
- Móvil: `useMobile()` cambia a una disposición tipo app (visor, timeline, barra inferior y hojas deslizables). `public/sw.js` + `manifest.webmanifest` la hacen instalable y con caché sin conexión.

## Persistencia

- IndexedDB `novacut-studio`: `projects` (JSON del proyecto + metadatos) y `blobs` (archivos originales).
- Paquete `.novacut`: ZIP con `project.json` y la carpeta `media/`.
