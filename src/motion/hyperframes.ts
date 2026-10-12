// Integración de motion graphics HyperFrames (https://github.com/heygen-com/hyperframes, Apache-2.0).
// Cada composición HTML se carga en un iframe con el runtime oficial, se posiciona en el tiempo con
// __player.renderSeek(t), se rasteriza (DOM → canvas, con modern-screenshot) y se codifica a video
// (WebM VP9 con canal alfa cuando es transparente) con WebCodecs/Mediabunny.
import { Output, BufferTarget, WebMOutputFormat, Mp4OutputFormat, CanvasSource, Quality, canEncodeVideo } from 'mediabunny';
import { unzipSync, strFromU8 } from 'fflate';

export type HFVarType = 'string' | 'number' | 'color' | 'boolean' | 'enum' | 'font' | 'image';
export interface HFVariable {
  id: string; type: HFVarType; label?: string; description?: string; default?: any;
  min?: number; max?: number; step?: number; unit?: string; options?: ({ value: string | number; label?: string } | string)[];
}
export interface HFItem {
  id: string; title: string; category: string; titleEn?: string; description?: string; tags: string[];
  width: number; height: number; duration: number; file: string; poster?: string; posterRemote?: string; previewVideo?: string;
  variables: HFVariable[];
  /** composición importada por el usuario */
  custom?: { html: string; files?: Record<string, string> };
}
export interface HFCatalog { source: string; license: string; items: HFItem[] }

export const appBase = () => new URL(import.meta.env.BASE_URL || './', location.href).href;
const hfBase = () => appBase() + 'hyperframes/';

let catalogPromise: Promise<HFCatalog> | null = null;
export function loadCatalog(): Promise<HFCatalog> {
  if (!catalogPromise) {
    catalogPromise = fetch(hfBase() + 'catalog.json').then((r) => { if (!r.ok) throw new Error('No se pudo cargar el catálogo de motion graphics'); return r.json(); })
      .catch((e) => { catalogPromise = null; throw e; });
  }
  return catalogPromise;
}

export async function loadItemHtml(item: HFItem): Promise<string> {
  if (item.custom) return item.custom.html;
  const r = await fetch(hfBase() + item.file);
  if (!r.ok) throw new Error(`No se pudo cargar la plantilla ${item.title}`);
  return r.text();
}

// ---------------------------------------------------------------------------
//  Textos editables (genérico): hojas de texto visibles dentro de la composición
// ---------------------------------------------------------------------------
export interface HFText { index: number; text: string; tag: string }
const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TITLE', 'HEAD', 'META', 'LINK']);

function textElements(doc: Document): Element[] {
  const root = doc.querySelector('[data-composition-id]') || doc.body;
  const out: Element[] = [];
  const walk = (el: Element) => {
    if (SKIP.has(el.tagName)) return;
    const kids = Array.from(el.children).filter((c) => !SKIP.has(c.tagName));
    const onlyBr = kids.every((c) => c.tagName === 'BR');
    const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent!.trim());
    if (own && onlyBr) { out.push(el); return; }
    for (const k of kids) walk(k);
  };
  walk(root);
  return out;
}

const textOf = (el: Element) => Array.from(el.childNodes).map((n) => (n.nodeType === 1 && (n as Element).tagName === 'BR' ? '\n' : n.textContent || '')).join('').replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').trim();

export function extractTexts(html: string): HFText[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return textElements(doc).map((el, index) => ({ index, text: textOf(el), tag: el.tagName.toLowerCase() }))
    .filter((t) => t.text.length > 0 && t.text.length < 160 && !/^[\d\s:.,·%$€+-]*$/.test(t.text)).slice(0, 24);
}

/** Declaraciones de variables escritas en el propio HTML (para composiciones importadas). */
export function extractVariables(html: string): HFVariable[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const out: HFVariable[] = [];
  for (const el of [doc.documentElement, ...Array.from(doc.querySelectorAll('[data-composition-variables]'))]) {
    const raw = el?.getAttribute('data-composition-variables');
    if (!raw) continue;
    try { const a = JSON.parse(raw); if (Array.isArray(a)) for (const v of a) if (v?.id && !out.some((o) => o.id === v.id)) out.push(v); } catch { /* noop */ }
  }
  return out;
}

function applyTexts(doc: Document, texts: Record<number, string>) {
  const els = textElements(doc);
  for (const [k, v] of Object.entries(texts)) {
    const el = els[Number(k)];
    if (!el) continue;
    el.textContent = '';
    v.split('\n').forEach((line, i) => { if (i) el.appendChild(doc.createElement('br')); el.appendChild(doc.createTextNode(line)); });
  }
}

// ---------------------------------------------------------------------------
//  Construcción del documento para el iframe
// ---------------------------------------------------------------------------
const LOCAL_NPM = /https:\/\/cdn\.jsdelivr\.net\/npm\/((?:three@0\.147\.0|d3@7|topojson-client@3\.1\.0|lottie-web@5\.12\.2|clipper-lib@6\.4\.2)\/[^"'\s)]+)/g;
const GSAP_CDN = /https:\/\/cdn\.jsdelivr\.net\/npm\/gsap@[\d.]+\/dist\/(gsap|CustomEase)\.min\.js/g;

export interface BuildOpts { item: HFItem; variables?: Record<string, any>; texts?: Record<number, string> }

export function buildDocument(html: string, o: BuildOpts): string {
  const app = appBase();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  if (o.texts && Object.keys(o.texts).length) applyTexts(doc, o.texts);
  // archivos de una composición importada en .zip → URLs blob
  const files = o.item.custom?.files;
  if (files) {
    for (const el of Array.from(doc.querySelectorAll('[src],[href],[data-composition-src]'))) {
      for (const attr of ['src', 'href', 'data-composition-src']) {
        const v = el.getAttribute(attr);
        if (!v || /^(https?:|data:|blob:|#)/.test(v)) continue;
        const key = v.replace(/^\.\//, '').split('?')[0];
        if (files[key]) el.setAttribute(attr, files[key]);
      }
    }
  }
  let out = '<!doctype html>\n' + doc.documentElement.outerHTML;
  out = out.replace(GSAP_CDN, (_m, f) => `${app}vendor/gsap/${f}.min.js`).replace(LOCAL_NPM, (_m, p) => `${app}vendor/npm/${p}`);
  const base = o.item.custom ? '' : `<base href="${hfBase()}${o.item.file.replace(/[^/]*$/, '')}">`;
  const pre = `${base}<script>
window.__hfVariables = ${JSON.stringify(o.variables || {}).replace(/</g, '\\u003c')};
globalThis.__HF_RENDER_CAPTURE_MODE = true;
(function(){
  var g = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(t, opt){
    if (t === 'webgl' || t === 'webgl2' || t === 'experimental-webgl') opt = Object.assign({}, opt || {}, { preserveDrawingBuffer: true });
    return g.call(this, t, opt);
  };
})();
<\/script>`;
  const post = `<script src="${hfBase()}runtime/hyperframes-runtime.js"><\/script><script src="${app}vendor/modern-screenshot/modern-screenshot.js"><\/script>`;
  out = /<head[^>]*>/i.test(out) ? out.replace(/<head([^>]*)>/i, (m) => m + pre) : pre + out;
  out = /<\/body>/i.test(out) ? out.replace(/<\/body>/i, post + '</body>') : out + post;
  return out;
}

// ---------------------------------------------------------------------------
//  Sesión de composición (iframe vivo)
// ---------------------------------------------------------------------------
export interface HFSession {
  iframe: HTMLIFrameElement;
  win: any;
  width: number;
  height: number;
  duration: number;
  seek(t: number): Promise<void>;
  capture(scale: number): Promise<HTMLCanvasElement>;
  dispose(): void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Abre la composición en un iframe. Si `host` se pasa, el iframe se muestra dentro (vista previa escalada). */
export async function openComposition(html: string, o: BuildOpts, host?: HTMLElement, signal?: AbortSignal): Promise<HFSession> {
  const doc0 = new DOMParser().parseFromString(html, 'text/html');
  const root = doc0.querySelector('[data-composition-id]');
  const width = Number(root?.getAttribute('data-width')) || o.item.width || 1920;
  const height = Number(root?.getAttribute('data-height')) || o.item.height || 1080;
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = host
    ? `position:absolute;left:0;top:0;width:${width}px;height:${height}px;border:0;transform-origin:0 0;pointer-events:none;background:transparent`
    : `position:fixed;left:-${width + 200}px;top:0;width:${width}px;height:${height}px;border:0;pointer-events:none;opacity:1`;
  // mismo color-scheme que el documento interno: si difieren, el navegador pinta un fondo blanco opaco
  iframe.style.colorScheme = 'normal';
  iframe.srcdoc = buildDocument(html, o);
  (host || document.body).appendChild(iframe);
  await new Promise<void>((res, rej) => { iframe.onload = () => res(); iframe.onerror = () => rej(new Error('No se pudo cargar la composición')); });
  const win: any = iframe.contentWindow;
  const t0 = performance.now();
  while (!(win.__player && typeof win.__player.renderSeek === 'function' && win.__renderReady && !win.__hfTimelinesBuilding)) {
    if (signal?.aborted) { iframe.remove(); throw new Error('Cancelado'); }
    if (performance.now() - t0 > 20000) {
      iframe.remove();
      throw new Error('La composición no se inicializó (¿falta data-composition-id o una librería externa?)');
    }
    await sleep(40);
  }
  try { await Promise.race([win.document.fonts?.ready, sleep(4000)]); } catch { /* noop */ }
  const declared = Number(root?.getAttribute('data-duration')) || o.item.duration || 5;
  const duration = Math.max(0.1, Number(win.__player.getDuration?.()) || declared);
  let ctxPromise: Promise<any> | null = null;
  let ctxScale = -1;
  return {
    iframe, win, width, height, duration,
    async seek(t: number) {
      win.__player.renderSeek(Math.max(0, Math.min(t, duration - 1e-3)));
      await new Promise((r) => win.setTimeout(r, 0));
    },
    async capture(scale: number) {
      const ms = win.modernScreenshot;
      if (!ms) throw new Error('No se cargó el rasterizador (modern-screenshot)');
      if (!ctxPromise || ctxScale !== scale) {
        ctxScale = scale;
        ctxPromise = ms.createContext(win.document.body, { width, height, scale, backgroundColor: null, timeout: 15000 });
      }
      const ctx = await ctxPromise;
      return ms.domToCanvas(ctx);
    },
    dispose() { try { iframe.remove(); } catch { /* noop */ } },
  };
}

// ---------------------------------------------------------------------------
//  Render a video
// ---------------------------------------------------------------------------
export interface RenderOpts extends BuildOpts {
  fps: number;
  /** alto (o lado corto) de salida en px */
  outShort: number;
  transparent: 'auto' | 'yes' | 'no';
  background?: string;
  onProgress?: (p: number, info: string) => void;
  signal?: AbortSignal;
}
export interface RenderResult { blob: Blob; filename: string; width: number; height: number; duration: number; alpha: boolean }

function hasTransparency(c: HTMLCanvasElement | OffscreenCanvas): boolean {
  const w = Math.min(64, c.width), h = Math.min(64, c.height);
  const t = document.createElement('canvas'); t.width = w; t.height = h;
  const g = t.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(c as CanvasImageSource, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 250) return true;
  return false;
}

export async function renderComposition(html: string, o: RenderOpts): Promise<RenderResult> {
  const progress = (p: number, s: string) => o.onProgress?.(Math.max(0, Math.min(1, p)), s);
  progress(0.01, 'Cargando composición…');
  const s = await openComposition(html, o, undefined, o.signal);
  try {
    const short = Math.min(s.width, s.height);
    const scale = Math.max(0.25, Math.min(4, o.outShort / short));
    const W = Math.round((s.width * scale) / 2) * 2, H = Math.round((s.height * scale) / 2) * 2;
    const frames = Math.max(1, Math.round(s.duration * o.fps));
    // primer fotograma (a mitad) para decidir transparencia
    await s.seek(s.duration * 0.5);
    const probe = await s.capture(Math.min(scale, 0.25));
    let alpha = o.transparent === 'yes' || (o.transparent === 'auto' && hasTransparency(probe));
    if (alpha) {
      const ok = await canEncodeVideo('vp9', { width: W, height: H, alpha: 'keep' } as any).catch(() => false);
      if (!ok) { alpha = false; console.warn('[motion] VP9 con alfa no disponible: se renderiza opaco'); }
    }
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const g = canvas.getContext('2d', { alpha: true })!;
    let format: WebMOutputFormat | Mp4OutputFormat = new WebMOutputFormat();
    let codec: 'vp9' | 'avc' | 'vp8' = 'vp9';
    if (!alpha) {
      for (const c of ['avc', 'vp9', 'vp8'] as const) {
        if (await canEncodeVideo(c, { width: W, height: H }).catch(() => false)) { codec = c; break; }
      }
      format = codec === 'avc' ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat();
    }
    const output = new Output({ format, target: new BufferTarget() });
    const src = new CanvasSource(canvas, { codec, quality: new Quality({ bitrate: Math.round(Math.max(4, (W * H * o.fps * 0.12) / 1e6) * 1e6) }), keyFrameInterval: 2, latencyMode: 'realtime', ...(alpha ? { alpha: 'keep' } : {}) } as any);
    output.addVideoTrack(src, { frameRate: o.fps });
    await output.start();
    const tStart = performance.now();
    // la codificación del fotograma anterior se solapa con la rasterización del siguiente
    let pending: Promise<void> | null = null;
    for (let i = 0; i < frames; i++) {
      if (o.signal?.aborted) { await pending?.catch(() => {}); await output.cancel().catch(() => {}); throw new Error('Render cancelado'); }
      await s.seek(i / o.fps);
      const fr = await s.capture(scale);
      if (pending) await pending;
      g.clearRect(0, 0, W, H);
      if (!alpha) { g.fillStyle = o.background || '#000000'; g.fillRect(0, 0, W, H); }
      g.drawImage(fr, 0, 0, W, H);
      pending = src.add(i / o.fps, 1 / o.fps);
      const el = (performance.now() - tStart) / 1000;
      if (i % 3 === 2 || i === frames - 1) progress(0.03 + 0.95 * ((i + 1) / frames), `Fotograma ${i + 1}/${frames} · ${((i + 1) / el).toFixed(1)} fps · quedan ${Math.ceil((el / (i + 1)) * (frames - i - 1))} s`);
    }
    if (pending) await pending;
    await output.finalize();
    const mime = await output.getMimeType();
    const blob = new Blob([output.target.buffer!], { type: mime.split(';')[0] });
    const ext = codec === 'avc' ? 'mp4' : 'webm';
    const safe = o.item.title.replace(/[\\/:*?"<>|]+/g, '_');
    return { blob, filename: `${safe}${alpha ? ' (alfa)' : ''}.${ext}`, width: W, height: H, duration: frames / o.fps, alpha };
  } finally {
    s.dispose();
  }
}

// ---------------------------------------------------------------------------
//  Importar composiciones propias (.html o proyecto .zip de HyperFrames)
// ---------------------------------------------------------------------------
export async function itemFromFile(file: File): Promise<HFItem> {
  let html = '';
  let files: Record<string, string> | undefined;
  if (/\.zip$/i.test(file.name)) {
    const z = unzipSync(new Uint8Array(await file.arrayBuffer()));
    const names = Object.keys(z).filter((n) => !n.endsWith('/') && !n.startsWith('__MACOSX'));
    // carpeta raíz común
    const htmls = names.filter((n) => /\.html?$/i.test(n));
    const main = htmls.find((n) => /(^|\/)index\.html?$/i.test(n)) || htmls.find((n) => strFromU8(z[n]).includes('data-composition-id'));
    if (!main) throw new Error('El .zip no contiene ninguna composición HTML (index.html)');
    const prefix = main.replace(/[^/]*$/, '');
    files = {};
    const mimeOf = (n: string) => ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml', mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', wav: 'audio/wav', js: 'text/javascript', css: 'text/css', json: 'application/json', html: 'text/html', woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', otf: 'font/otf' } as Record<string, string>)[n.split('.').pop()!.toLowerCase()] || 'application/octet-stream';
    for (const n of names) {
      if (n === main || !n.startsWith(prefix)) continue;
      files[n.slice(prefix.length)] = URL.createObjectURL(new Blob([z[n] as BlobPart], { type: mimeOf(n) }));
    }
    html = strFromU8(z[main]);
  } else {
    html = await file.text();
  }
  if (!html.includes('data-composition-id')) throw new Error('El archivo no parece una composición de HyperFrames (falta data-composition-id)');
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const root = doc.querySelector('[data-composition-id]')!;
  return {
    id: 'custom-' + Date.now().toString(36), title: file.name.replace(/\.(html?|zip)$/i, ''), category: 'Importados', tags: ['importado'],
    width: Number(root.getAttribute('data-width')) || 1920, height: Number(root.getAttribute('data-height')) || 1080,
    duration: Number(root.getAttribute('data-duration')) || 5, file: '', variables: extractVariables(html),
    custom: { html, files },
  };
}
