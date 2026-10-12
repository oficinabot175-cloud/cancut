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
      if (f === 'demo.html' || f.startsWith('demo-')) continue;
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
const size = (p) => statSync(p).isDirectory() ? readdirSync(p).reduce((a, f) => a + size(join(p, f)), 0) : statSync(p).size;
writeFileSync(join(out, 'catalog.json'), JSON.stringify({ source: 'https://github.com/heygen-com/hyperframes', license: 'Apache-2.0', generated: new Date().toISOString().slice(0, 10), items }, null, 1));
cpSync(join(hf, 'LICENSE'), join(out, 'LICENSE'));
writeFileSync(join(out, 'NOTICE.md'), `# HyperFrames — avisos de terceros

Las plantillas de esta carpeta (\`blocks/\`) y el runtime (\`runtime/hyperframes-runtime.js\`) provienen de
[HyperFrames](https://github.com/heygen-com/hyperframes) © HeyGen, distribuidos bajo la **Apache License 2.0**
(ver \`LICENSE\`). Se copiaron sin modificar; NovaCut solo los carga en un iframe para renderizarlos a video.
Las miniaturas \`poster.webp\` se generaron renderizando cada plantilla.
`);
console.log(`[hyperframes] ${items.length} plantillas · ${(size(out) / 1e6).toFixed(1)} MB → public/hyperframes`);
