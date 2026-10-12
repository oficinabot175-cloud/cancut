// Genera public/hyperframes/ a partir de un clon del repositorio oficial de HyperFrames (Apache-2.0).
// Uso (solo para mantenedores; el resultado se versiona en el repo):
//   git clone --depth 1 https://github.com/heygen-com/hyperframes /tmp/hf
//   node scripts/build-hyperframes-catalog.mjs /tmp/hf [carpeta-de-posters]
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const hf = process.argv[2] || '/tmp/hf';
const posters = process.argv[3] || '';
const out = join(root, 'public/hyperframes');

/** Selección curada: plantillas que funcionan en el navegador sin WebGPU ni APIs experimentales. */
const PICK = {
  'Intros y títulos': {
    'yt-logo-intro': 'Intro con logo', 'yt-prism-title': 'Título prisma', 'weight-wave': 'Onda tipográfica', 'split-flap-board': 'Panel de aeropuerto',
    'hw-title': 'Título manuscrito', 'hw-write-title': 'Título que se escribe', 'hw-path-text': 'Texto en trayectoria', 'mk-callout-highlight': 'Frase resaltada',
  },
  'Rótulos': {
    'lt-neon-border': 'Rótulo borde neón', 'lt-accent-underline': 'Rótulo subrayado', 'lt-bold-block': 'Rótulo bloque', 'lt-clean-bar': 'Rótulo barra limpia',
    'lt-color-block': 'Rótulo color', 'lt-dark-card': 'Rótulo tarjeta oscura', 'lt-kicker-name': 'Rótulo con etiqueta', 'lt-mask-reveal': 'Rótulo con máscara',
    'lt-side-rule': 'Rótulo línea lateral', 'lt-soft-pill': 'Rótulo píldora', 'lt-stack-bars': 'Rótulo barras', 'lower-third-bild': 'Rótulo exclusiva',
    'yt-lower-third': 'Rótulo creador', 'news-ticker': 'Noticias de última hora',
  },
  'Redes sociales': {
    'tiktok-follow': 'Botón seguir (vertical)', 'instagram-follow': 'Seguir perfil (vertical)', 'x-post': 'Publicación social', 'reddit-post': 'Publicación de foro',
    'yt-comment-card': 'Comentarios', 'macos-notification': 'Notificación', 'thread-message-stack': 'Conversación',
  },
  'Overlays y efectos': {
    'camcorder-hud': 'Videocámara REC', 'editorial-flash-overlay': 'Flash editorial', 'organic-light-leak-overlay': 'Fuga de luz orgánica',
    'freeze-frame-dressing': 'Recorte scrapbook', 'hw-frame': 'Marco manuscrito', 'hw-text-cloud': 'Bocadillo manuscrito', 'hw-pipeline': 'Diagrama a mano',
    'snow': 'Nieve', 'starfield': 'Cielo estrellado',
  },
  'Transiciones': { 'hw-scribble-transition': 'Garabato', 'mk-clone-wall-transition': 'Muro de palabras', 'gooey-split': 'División líquida' },
  'Fondos animados': {
    'mk-background': 'Degradado suave', 'yt-lcd-background': 'Pantalla LCD', 'halftone-field': 'Campo de semitonos', 'cosmic-orb': 'Orbe cósmico',
    'spiral-galaxy': 'Galaxia espiral', 'vfx-anamorphic-flare': 'Destellos anamórficos', 'rack-focus': 'Bokeh con cambio de foco', 'oscilloscope-trace': 'Osciloscopio',
  },
  'Datos y gráficos': {
    'bar-chart-race': 'Carrera de barras', 'data-chart': 'Gráfico de columnas', 'mk-line-graph': 'Gráfico de líneas', 'mk-progress-stat': 'Estadística',
    'mk-specs-list': 'Lista de especificaciones', 'flowchart': 'Diagrama de flujo',
  },
  'Personajes': { 'lottie-character-walk': 'Personaje caminando' },
  'Código y tecnología': {
    'code-typing': 'Código escribiéndose', 'code-highlight': 'Código resaltado', 'code-diff': 'Diferencias de código', 'code-morph': 'Código que se transforma',
    'code-scroll': 'Código con desplazamiento', 'code-3d-extrude': 'Código 3D', 'code-particle-assemble': 'Código de partículas', 'code-shader-dissolve': 'Código que se disuelve',
    'code-snippet-apple-terminal-pro': 'Terminal',
  },
  'Galerías y carruseles': {
    'carousel-circle-1': 'Carrusel circular', 'carousel-orbit-1': 'Carrusel en órbita', 'carousel-path-1': 'Carrusel en trayectoria',
    'carousel-text-circle-1': 'Título con carrusel', 'carousel-vision-1': 'Carrusel visión',
  },
  'Mapas': { 'world-map': 'Mapa mundial', 'us-map': 'Mapa de EE. UU.', 'us-map-bubble': 'Mapa de burbujas', 'us-map-flow': 'Mapa de flujos', 'spain-map': 'Mapa de España' },
  'Interfaces y apps': {
    'notification-cascade': 'Cascada de notificaciones', 'notes-reveal': 'Notas que se escriben', 'message-thread-reveal': 'Hilo de mensajes', 'share-sheet-carousel': 'Menú compartir',
    'ai-answer-rank': 'Ranking de respuestas', 'week-in-merges': 'Ranking semanal', 'camera-dolly-zoom': 'Efecto vértigo (dolly zoom)', 'cinemagraph': 'Cinemagrafía',
  },
};

/** Componentes (primitivas de movimiento): se usan sus composiciones de demostración. Categoría según etiquetas. */
const COMPONENT_CATEGORY = (tags) => {
  const has = (...k) => k.some((x) => tags.includes(x));
  if (has('captions', 'caption-style')) return 'Subtítulos animados';
  if (has('transition', 'transition-primitive', 'wipe', 'transitions-dev-port')) return 'Transiciones';
  if (has('cursor', 'pointer', 'product-demo', 'ui-props', 'interaction')) return 'Demos de producto (cursor y UI)';
  if (has('data', 'chart')) return 'Datos y gráficos';
  if (has('handwritten', 'annotation')) return 'Anotaciones a mano';
  if (has('camera', 'parallax')) return 'Cámara y profundidad';
  if (has('typography', 'text', 'text-effects', 'text-effect', 'reveal', 'kinetic-type')) return 'Efectos de texto';
  if (has('texture', 'effect', 'effects', 'overlay', 'grain')) return 'Overlays y efectos';
  return 'Animaciones';
};

if (!existsSync(join(hf, 'registry/blocks'))) { console.error('No se encontró', join(hf, 'registry/blocks')); process.exit(1); }
const keepRuntime = existsSync(join(out, 'runtime')) ? join(out, 'runtime') : null;
const tmpRuntime = join(root, '.hf-runtime-tmp');
if (keepRuntime) { rmSync(tmpRuntime, { recursive: true, force: true }); cpSync(keepRuntime, tmpRuntime, { recursive: true }); }
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'blocks'), { recursive: true });
if (keepRuntime) { cpSync(tmpRuntime, join(out, 'runtime'), { recursive: true }); rmSync(tmpRuntime, { recursive: true, force: true }); }

const items = [];
for (const [category, map] of Object.entries(PICK)) {
  for (const [id, title] of Object.entries(map)) {
    const dir = join(hf, 'registry/blocks', id);
    const meta = JSON.parse(readFileSync(join(dir, 'registry-item.json'), 'utf8'));
    const html = meta.files.find((f) => f.path.endsWith('.html'));
    const dst = join(out, 'blocks', id);
    mkdirSync(dst, { recursive: true });
    for (const f of readdirSync(dir)) {
      if (f === 'demo.html' || f.startsWith('demo-') || f === 'registry-item.json' || /\.md$/i.test(f)) continue;
      cpSync(join(dir, f), join(dst, f), { recursive: true });
    }
    let poster = '';
    if (posters && existsSync(join(posters, id + '.webp'))) { cpSync(join(posters, id + '.webp'), join(dst, 'poster.webp')); poster = `blocks/${id}/poster.webp`; }
    items.push({
      id, title, category, titleEn: meta.title, description: meta.description, tags: meta.tags || [],
      width: meta.dimensions?.width || 1920, height: meta.dimensions?.height || 1080, duration: meta.duration || 5,
      file: `blocks/${id}/${html.path}`, poster, posterRemote: meta.preview?.poster || '', previewVideo: meta.preview?.video || '',
      variables: meta.variables || [],
    });
  }
}
// ---- componentes
mkdirSync(join(out, 'components'), { recursive: true });
const compDir = join(hf, 'registry/components');
// composiciones de demostración que no muestran nada por sí solas (necesitan datos del proyecto anfitrión)
const SKIP_COMPONENTS = new Set(['caption-camera-follow', 'extended-keyframe', 'grade-split-reveal', 'kinetic-center-build', 'shutter-slam']);
for (const id of readdirSync(compDir).sort()) {
  if (SKIP_COMPONENTS.has(id)) continue;
  const dir = join(compDir, id);
  if (!existsSync(join(dir, 'demo.html')) || !existsSync(join(dir, 'registry-item.json'))) continue;
  const meta = JSON.parse(readFileSync(join(dir, 'registry-item.json'), 'utf8'));
  const demo = readFileSync(join(dir, 'demo.html'), 'utf8');
  if (!demo.includes('data-composition-id')) continue;
  const dst = join(out, 'components', id);
  mkdirSync(dst, { recursive: true });
  // solo lo necesario para renderizar: la composición de demostración y sus carpetas de recursos
  for (const f of readdirSync(dir)) if (/\.(html?|js|css|json|svg|png|jpe?g|webp|woff2?)$/i.test(f) && f !== 'registry-item.json' || statSync(join(dir, f)).isDirectory()) cpSync(join(dir, f), join(dst, f), { recursive: true });
  const w = Number((demo.match(/data-width="(\d+)"/) || [])[1]) || 1920, h = Number((demo.match(/data-height="(\d+)"/) || [])[1]) || 1080;
  const d = Number((demo.match(/data-duration="([\d.]+)"/) || [])[1]) || 4;
  let poster = '';
  if (posters && existsSync(join(posters, 'c-' + id + '.webp'))) { cpSync(join(posters, 'c-' + id + '.webp'), join(dst, 'poster.webp')); poster = `components/${id}/poster.webp`; }
  items.push({
    id: 'c-' + id, title: meta.title || id, category: COMPONENT_CATEGORY(meta.tags || []), titleEn: meta.title, description: meta.description, tags: meta.tags || [],
    width: w, height: h, duration: d, file: `components/${id}/demo.html`, poster, posterRemote: meta.preview?.poster || '', previewVideo: meta.preview?.video || '',
    variables: meta.variables || [], component: true,
  });
}

const size = (p) => statSync(p).isDirectory() ? readdirSync(p).reduce((a, f) => a + size(join(p, f)), 0) : statSync(p).size;
writeFileSync(join(out, 'catalog.json'), JSON.stringify({ source: 'https://github.com/heygen-com/hyperframes', license: 'Apache-2.0', generated: new Date().toISOString().slice(0, 10), items }, null, 1));
cpSync(join(hf, 'LICENSE'), join(out, 'LICENSE'));
writeFileSync(join(out, 'NOTICE.md'), `# HyperFrames — avisos de terceros

Las plantillas de esta carpeta (\`blocks/\`) y el runtime (\`runtime/hyperframes-runtime.js\`) provienen de
[HyperFrames](https://github.com/heygen-com/hyperframes) © HeyGen, distribuidos bajo la **Apache License 2.0**
(ver \`LICENSE\`). Se copiaron sin modificar; CanCut solo los carga en un iframe para renderizarlos a video.
Las miniaturas \`poster.webp\` se generaron renderizando cada plantilla.
`);
console.log(`[hyperframes] ${items.length} plantillas · ${(size(out) / 1e6).toFixed(1)} MB → public/hyperframes`);
