// Copia los binarios WebAssembly de MediaPipe y FFmpeg a public/vendor para servirlos
// desde el mismo dominio (GitHub Pages) sin depender de CDNs externos.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const copies = [
  ['node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.js', 'public/vendor/mediapipe/vision_wasm_internal.js'],
  ['node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.wasm', 'public/vendor/mediapipe/vision_wasm_internal.wasm'],
  ['node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_nosimd_internal.js', 'public/vendor/mediapipe/vision_wasm_nosimd_internal.js'],
  ['node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_nosimd_internal.wasm', 'public/vendor/mediapipe/vision_wasm_nosimd_internal.wasm'],
  ['node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.js', 'public/vendor/ffmpeg/ffmpeg-core.js'],
  ['node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.wasm', 'public/vendor/ffmpeg/ffmpeg-core.wasm'],
  // Motion graphics (HyperFrames): GSAP y el rasterizador DOM → canvas
  ['node_modules/gsap/dist/gsap.min.js', 'public/vendor/gsap/gsap.min.js'],
  ['node_modules/gsap/dist/CustomEase.min.js', 'public/vendor/gsap/CustomEase.min.js'],
  ['node_modules/modern-screenshot/dist/index.js', 'public/vendor/modern-screenshot/modern-screenshot.js'],
  // librerías que usan algunas plantillas de HyperFrames (servidas localmente en lugar del CDN)
  ['node_modules/three-hf/build/three.min.js', 'public/vendor/npm/three@0.147.0/build/three.min.js'],
  ['node_modules/d3/dist/d3.min.js', 'public/vendor/npm/d3@7/dist/d3.min.js'],
  ['node_modules/topojson-client/dist/topojson-client.min.js', 'public/vendor/npm/topojson-client@3.1.0/dist/topojson-client.min.js'],
  ['node_modules/lottie-web/build/player/lottie_light.min.js', 'public/vendor/npm/lottie-web@5.12.2/build/player/lottie_light.min.js'],
  ['node_modules/clipper-lib/clipper.js', 'public/vendor/npm/clipper-lib@6.4.2/clipper.js'],
  ['node_modules/world-atlas/countries-110m.json', 'public/vendor/npm/world-atlas@2/countries-110m.json'],
  ['node_modules/us-atlas/states-10m.json', 'public/vendor/npm/us-atlas@3/states-10m.json'],
  ['node_modules/es-atlas/es/autonomous_regions.json', 'public/vendor/npm/es-atlas@0.6.0/es/autonomous_regions.json'],
];
let n = 0;
for (const [from, to] of copies) {
  const src = join(root, from), dst = join(root, to);
  if (!existsSync(src)) { console.warn('[vendor] falta', from); continue; }
  mkdirSync(dirname(dst), { recursive: true });
  cpSync(src, dst);
  n++;
}
console.log(`[vendor] ${n} archivos copiados a public/vendor`);
