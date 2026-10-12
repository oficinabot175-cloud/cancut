// Plantillas de diseño: cámara + pantalla compartida (lado a lado, arriba/abajo, PiP…), marcos y fondos.
import type { Clip } from '../types';
import { getState } from '../store/editor';
import { createClip, createTrack } from './defaults';
import { importFiles } from './actions';

const st = () => getState();

export type LayoutAspect = '16:9' | '9:16' | '1:1' | '4:5';
export const ASPECT_SIZE: Record<LayoutAspect, [number, number]> = { '16:9': [1920, 1080], '9:16': [1080, 1920], '1:1': [1080, 1080], '4:5': [1080, 1350] };

/** Zona normalizada (0..1, origen arriba-izquierda). circle: se fuerza cuadrada con el lado menor. */
export interface Slot { x: number; y: number; w: number; h: number; circle?: boolean }
export interface LayoutDef {
  id: string; name: string; aspect: LayoutAspect;
  cam?: Slot; screen?: Slot;
  /** la cámara va encima (PiP) */
  camOnTop?: boolean;
  desc: string;
}

export const LAYOUTS: LayoutDef[] = [
  // ---------- 16:9
  { id: 'h-cam-left', name: 'Cámara izquierda + pantalla', aspect: '16:9', cam: { x: 0.035, y: 0.07, w: 0.3, h: 0.86 }, screen: { x: 0.365, y: 0.2, w: 0.6, h: 0.6 }, desc: 'Estilo tutorial: tú a la izquierda, la pantalla a la derecha.' },
  { id: 'h-cam-right', name: 'Pantalla + cámara derecha', aspect: '16:9', screen: { x: 0.035, y: 0.17, w: 0.6, h: 0.6 }, cam: { x: 0.665, y: 0.07, w: 0.3, h: 0.86 }, desc: 'La pantalla a la izquierda y tu cámara a la derecha.' },
  { id: 'h-split', name: 'Mitad y mitad', aspect: '16:9', cam: { x: 0.025, y: 0.12, w: 0.465, h: 0.76 }, screen: { x: 0.51, y: 0.12, w: 0.465, h: 0.76 }, desc: 'Dos paneles iguales, ideal para entrevistas o reacciones.' },
  { id: 'h-pip-circle', name: 'Pantalla + burbuja', aspect: '16:9', screen: { x: 0, y: 0, w: 1, h: 1 }, cam: { x: 0.79, y: 0.66, w: 0.18, h: 0.3, circle: true }, camOnTop: true, desc: 'Pantalla completa con tu cámara en un círculo.' },
  { id: 'h-pip-rect', name: 'Pantalla + ventana', aspect: '16:9', screen: { x: 0, y: 0, w: 1, h: 1 }, cam: { x: 0.735, y: 0.69, w: 0.24, h: 0.27 }, camOnTop: true, desc: 'Pantalla completa con tu cámara en una ventana redondeada.' },
  { id: 'h-inset-bubble', name: 'Pantalla enmarcada + burbuja', aspect: '16:9', screen: { x: 0.06, y: 0.07, w: 0.82, h: 0.82 }, cam: { x: 0.79, y: 0.62, w: 0.19, h: 0.34, circle: true }, camOnTop: true, desc: 'Pantalla con margen sobre un fondo y la burbuja encima.' },
  { id: 'h-cam-main', name: 'Cámara + pantalla pequeña', aspect: '16:9', cam: { x: 0, y: 0, w: 1, h: 1 }, screen: { x: 0.6, y: 0.06, w: 0.36, h: 0.36 }, desc: 'Tú en grande y la pantalla como ventana de apoyo.' },
  { id: 'h-pip-left', name: 'Burbuja izquierda', aspect: '16:9', screen: { x: 0, y: 0, w: 1, h: 1 }, cam: { x: 0.03, y: 0.66, w: 0.18, h: 0.3, circle: true }, camOnTop: true, desc: 'Burbuja de cámara abajo a la izquierda.' },
  // ---------- 9:16
  { id: 'v-top-bottom', name: 'Cámara arriba, pantalla abajo', aspect: '9:16', cam: { x: 0, y: 0, w: 1, h: 0.5 }, screen: { x: 0, y: 0.5, w: 1, h: 0.5 }, desc: 'El clásico split vertical de TikTok / Reels.' },
  { id: 'v-bottom-top', name: 'Pantalla arriba, cámara abajo', aspect: '9:16', screen: { x: 0, y: 0, w: 1, h: 0.5 }, cam: { x: 0, y: 0.5, w: 1, h: 0.5 }, desc: 'La pantalla arriba y tú debajo.' },
  { id: 'v-circle-screen', name: 'Burbuja + pantalla', aspect: '9:16', cam: { x: 0.62, y: 0.03, w: 0.34, h: 0.19, circle: true }, screen: { x: 0.03, y: 0.25, w: 0.94, h: 0.3 }, camOnTop: true, desc: 'Tu cámara en círculo arriba y la pantalla en el centro.' },
  { id: 'v-card', name: 'Tarjeta sobre cámara', aspect: '9:16', cam: { x: 0, y: 0, w: 1, h: 1 }, screen: { x: 0.05, y: 0.08, w: 0.9, h: 0.3 }, desc: 'Cámara a pantalla completa con la pantalla como tarjeta.' },
  { id: 'v-screen-full-bubble', name: 'Pantalla + burbuja abajo', aspect: '9:16', screen: { x: 0, y: 0, w: 1, h: 1 }, cam: { x: 0.3, y: 0.76, w: 0.4, h: 0.22, circle: true }, camOnTop: true, desc: 'Pantalla (recortada) completa y burbuja centrada abajo.' },
  { id: 'v-thirds', name: 'Pantalla 2/3 + cámara', aspect: '9:16', screen: { x: 0, y: 0, w: 1, h: 0.62 }, cam: { x: 0, y: 0.62, w: 1, h: 0.38 }, desc: 'Más espacio para la pantalla, cámara abajo.' },
  // ---------- 1:1
  { id: 's-split', name: 'Izquierda / derecha', aspect: '1:1', cam: { x: 0, y: 0, w: 0.5, h: 1 }, screen: { x: 0.5, y: 0, w: 0.5, h: 1 }, desc: 'Dos mitades verticales.' },
  { id: 's-top-bottom', name: 'Arriba / abajo', aspect: '1:1', screen: { x: 0, y: 0, w: 1, h: 0.5 }, cam: { x: 0, y: 0.5, w: 1, h: 0.5 }, desc: 'Dos franjas horizontales.' },
  { id: 's-bubble', name: 'Pantalla + burbuja', aspect: '1:1', screen: { x: 0.05, y: 0.05, w: 0.9, h: 0.9 }, cam: { x: 0.68, y: 0.68, w: 0.28, h: 0.28, circle: true }, camOnTop: true, desc: 'Pantalla enmarcada con burbuja.' },
  // ---------- 4:5
  { id: 'p-top-bottom', name: 'Arriba / abajo', aspect: '4:5', screen: { x: 0, y: 0, w: 1, h: 0.55 }, cam: { x: 0, y: 0.55, w: 1, h: 0.45 }, desc: 'Ideal para el feed de Instagram.' },
  { id: 'p-bubble', name: 'Pantalla + burbuja', aspect: '4:5', screen: { x: 0.04, y: 0.2, w: 0.92, h: 0.6 }, cam: { x: 0.66, y: 0.04, w: 0.3, h: 0.24, circle: true }, camOnTop: true, desc: 'Pantalla al centro y burbuja arriba.' },
];

export type FrameStyle = 'none' | 'clean' | 'border' | 'glow' | 'neon';
export const FRAME_STYLES: { id: FrameStyle; name: string }[] = [
  { id: 'clean', name: 'Redondeado' }, { id: 'border', name: 'Con borde' }, { id: 'glow', name: 'Brillo' }, { id: 'neon', name: 'Neón' }, { id: 'none', name: 'Sin marco' },
];

function frameFor(style: FrameStyle, accent: string, circle: boolean, size: number, full: boolean): Clip['frame'] {
  if (style === 'none' || (full && !circle)) return circle ? { radius: size / 2, border: 0, color: '#ffffff', glow: 0, glowColor: accent } : null;
  const radius = circle ? size / 2 : Math.min(40, size * 0.06);
  switch (style) {
    case 'clean': return { radius, border: 0, color: '#ffffff', glow: 0.35, glowColor: '#000000' };
    case 'border': return { radius, border: circle ? 8 : 5, color: '#ffffff', glow: 0.3, glowColor: '#000000' };
    case 'glow': return { radius, border: 3, color: accent, glow: 1, glowColor: accent };
    case 'neon': return { radius, border: 6, color: '#ffffff', glow: 1.6, glowColor: accent };
  }
}

/** Coloca un clip dentro de una zona (rellenando y recortando lo que sobra). */
function placeInSlot(c: Clip, slot: Slot, W: number, H: number, sw: number, sh: number, style: FrameStyle, accent: string) {
  let X = slot.x * W, Y = slot.y * H, Wt = slot.w * W, Ht = slot.h * H;
  if (slot.circle) { const s = Math.min(Wt, Ht); X += (Wt - s) / 2; Y += (Ht - s) / 2; Wt = Ht = s; }
  const s = Math.max(Wt / sw, Ht / sh);
  const fw = sw * s, fh = sh * s;
  const cx = Math.max(0, (fw - Wt) / (2 * fw)), cy = Math.max(0, (fh - Ht) / (2 * fh));
  c.fit = 'none';
  c.transform = { ...c.transform, x: X + Wt / 2 - W / 2, y: Y + Ht / 2 - H / 2, scale: s, scaleX: 1, scaleY: 1, rotation: 0 };
  c.crop = { l: cx, r: cx, t: cy, b: cy };
  c.mask = { ...c.mask, shape: 'none' };
  c.keyframes = Object.fromEntries(Object.entries(c.keyframes).filter(([k]) => k === 'volume' || k === 'opacity'));
  const full = slot.w >= 0.999 && slot.h >= 0.999;
  c.frame = frameFor(style, accent, !!slot.circle, Math.min(Wt, Ht), full);
}

export interface ApplyLayoutOpts { camId?: string; screenId?: string; style: FrameStyle; accent: string; background?: BackgroundDef | null }

/** Aplica la plantilla. camId/screenId pueden ser "clip:<id>" o "asset:<id>". */
export async function applyLayout(def: LayoutDef, o: ApplyLayoutOpts) {
  const s0 = st();
  const [W, H] = ASPECT_SIZE[def.aspect];
  const p0 = s0.project;
  if (Math.abs(p0.width / p0.height - W / H) > 0.01) s0.setProjectProps({ width: W, height: H });
  const resolve = (ref?: string): Clip | null => {
    if (!ref) return null;
    const [kind, id] = ref.split(':');
    if (kind === 'clip') return st().project.clips.find((c) => c.id === id) || null;
    const a = st().assets[id];
    if (!a) return null;
    const c = createClip({ type: a.kind === 'image' ? 'image' : 'video', trackId: '', start: st().time, duration: a.kind === 'image' ? 10 : Math.max(0.1, a.duration), assetId: a.id, name: a.name });
    return st().addClip(c, { newTrack: true, select: false });
  };
  st().beginTx();
  try {
    const cam = resolve(o.camId);
    const scr = resolve(o.screenId);
    if (!cam && !scr) { st().toast('Elige al menos un video (cámara o pantalla)', 'error'); return; }
    const { width: PW, height: PH } = st().project;
    const size = (c: Clip) => { const a = c.assetId ? st().assets[c.assetId] : undefined; return { w: a?.width || PW, h: a?.height || PH }; };
    // pistas: la cámara encima si es PiP; cada clip en su propia pista
    st().commit((p) => {
      const cc = cam && p.clips.find((x) => x.id === cam.id);
      const sc = scr && p.clips.find((x) => x.id === scr.id);
      if (cc && sc) {
        // que empiecen juntos si no se solapan
        if (cc.start >= sc.start + sc.duration || sc.start >= cc.start + cc.duration) cc.start = sc.start;
        const top = def.camOnTop ? cc : sc, bottom = def.camOnTop ? sc : cc;
        let ti = p.tracks.findIndex((t) => t.id === top.trackId), bi = p.tracks.findIndex((t) => t.id === bottom.trackId);
        if (ti === bi || ti > bi) {
          const nt = createTrack('visual'); nt.name = def.camOnTop ? 'Cámara' : 'Pantalla';
          bi = p.tracks.findIndex((t) => t.id === bottom.trackId);
          p.tracks.splice(bi, 0, nt);
          top.trackId = nt.id;
        }
      }
      for (const [c, slot] of [[cc, def.cam], [sc, def.screen]] as const) {
        if (!c || !slot) continue;
        const z = size(c);
        placeInSlot(c, slot, PW, PH, z.w, z.h, o.style, o.accent);
      }
    });
    // fondo
    if (o.background !== null) {
      const main = (cam && st().project.clips.find((x) => x.id === cam.id)) || (scr && st().project.clips.find((x) => x.id === scr.id))!;
      const other = cam && scr ? st().project.clips.find((x) => x.id === (main.id === cam.id ? scr.id : cam.id)) : null;
      const start = Math.min(main.start, other?.start ?? main.start);
      const end = Math.max(main.start + main.duration, other ? other.start + other.duration : 0);
      await addBackground(o.background || BACKGROUNDS[0], start, end - start, true);
    }
    st().set({ selection: [cam?.id || scr!.id] });
    st().toast(`Plantilla «${def.name}» aplicada. Ajusta cada panel con el gizmo o en «Marco y bordes».`, 'success', 4000);
  } finally {
    st().endTx();
  }
}

// ---------------------------------------------------------------------------
//  Fondos
// ---------------------------------------------------------------------------
export interface BackgroundDef {
  id: string; name: string;
  kind: 'solid' | 'gradient' | 'pattern' | 'blur';
  colors: string[];
  pattern?: 'mesh' | 'grid' | 'dots' | 'aurora' | 'bokeh' | 'lines' | 'noise' | 'spotlight';
  angle?: number;
}

export const BACKGROUNDS: BackgroundDef[] = [
  { id: 'midnight', name: 'Medianoche', kind: 'pattern', pattern: 'spotlight', colors: ['#0b1020', '#1b2a52', '#3b5bdb'] },
  { id: 'studio-grid', name: 'Estudio cuadrícula', kind: 'pattern', pattern: 'grid', colors: ['#0d0f17', '#1e2333', '#7c5cff'] },
  { id: 'mesh-violet', name: 'Malla violeta', kind: 'pattern', pattern: 'mesh', colors: ['#120c2e', '#7c5cff', '#00d4ff', '#ff4fa3'] },
  { id: 'aurora', name: 'Aurora', kind: 'pattern', pattern: 'aurora', colors: ['#050b14', '#00e5a8', '#3b82f6', '#a855f7'] },
  { id: 'dots', name: 'Puntos', kind: 'pattern', pattern: 'dots', colors: ['#0f172a', '#334155'] },
  { id: 'bokeh', name: 'Bokeh cálido', kind: 'pattern', pattern: 'bokeh', colors: ['#1a0f0a', '#ff9f43', '#ff6b6b', '#feca57'] },
  { id: 'lines', name: 'Líneas diagonales', kind: 'pattern', pattern: 'lines', colors: ['#111827', '#1f2937'] },
  { id: 'paper', name: 'Papel claro', kind: 'pattern', pattern: 'noise', colors: ['#f5f1e8', '#e8e1d0'] },
  { id: 'mesh-sunset', name: 'Malla atardecer', kind: 'pattern', pattern: 'mesh', colors: ['#2d0b1f', '#ff7a18', '#af002d', '#ffd166'] },
  { id: 'mesh-ocean', name: 'Malla océano', kind: 'pattern', pattern: 'mesh', colors: ['#03121f', '#0077b6', '#00b4d8', '#90e0ef'] },
  { id: 'g-violet', name: 'Degradado violeta', kind: 'gradient', colors: ['#7c5cff', '#00d4ff'], angle: 45 },
  { id: 'g-night', name: 'Degradado noche', kind: 'gradient', colors: ['#0f2027', '#2c5364'], angle: 90 },
  { id: 'g-fire', name: 'Degradado fuego', kind: 'gradient', colors: ['#f12711', '#f5af19'], angle: 90 },
  { id: 'g-mint', name: 'Degradado menta', kind: 'gradient', colors: ['#11998e', '#38ef7d'], angle: 45 },
  { id: 'black', name: 'Negro', kind: 'solid', colors: ['#000000'] },
  { id: 'white', name: 'Blanco', kind: 'solid', colors: ['#ffffff'] },
  { id: 'blur', name: 'Video desenfocado', kind: 'blur', colors: ['#000000'] },
];

const rnd = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

/** Dibuja un fondo procedural (también se usa para las miniaturas). */
export function drawBackground(g: CanvasRenderingContext2D, w: number, h: number, b: BackgroundDef) {
  const [c0, c1 = c0, c2 = c1, c3 = c2] = b.colors;
  const r = rnd(7);
  if (b.kind === 'solid' || b.kind === 'blur') { g.fillStyle = c0; g.fillRect(0, 0, w, h); return; }
  if (b.kind === 'gradient') {
    const a = ((b.angle ?? 90) * Math.PI) / 180;
    const dx = Math.cos(a) * w / 2, dy = Math.sin(a) * h / 2;
    const gr = g.createLinearGradient(w / 2 - dx, h / 2 - dy, w / 2 + dx, h / 2 + dy);
    gr.addColorStop(0, c0); gr.addColorStop(1, c1);
    g.fillStyle = gr; g.fillRect(0, 0, w, h); return;
  }
  g.fillStyle = c0; g.fillRect(0, 0, w, h);
  const m = Math.max(w, h);
  switch (b.pattern) {
    case 'spotlight': {
      const gr = g.createRadialGradient(w * 0.5, h * 0.35, 0, w * 0.5, h * 0.35, m * 0.75);
      gr.addColorStop(0, c2 + '55'); gr.addColorStop(0.45, c1 + '66'); gr.addColorStop(1, c0 + '00');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      break;
    }
    case 'grid': {
      const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, m * 0.7);
      gr.addColorStop(0, c2 + '33'); gr.addColorStop(1, c0 + '00');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.strokeStyle = c1; g.lineWidth = Math.max(1, m / 900);
      const step = m / 24;
      for (let x = (w / 2) % step; x < w; x += step) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
      for (let y = (h / 2) % step; y < h; y += step) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      const v = g.createRadialGradient(w / 2, h / 2, m * 0.2, w / 2, h / 2, m * 0.75);
      v.addColorStop(0, '#00000000'); v.addColorStop(1, '#000000cc');
      g.fillStyle = v; g.fillRect(0, 0, w, h);
      break;
    }
    case 'mesh': case 'aurora': {
      g.filter = `blur(${Math.round(m / (b.pattern === 'aurora' ? 14 : 10))}px)`;
      const cols = [c1, c2, c3, c1, c2];
      for (let i = 0; i < 6; i++) {
        g.fillStyle = cols[i % cols.length] + (b.pattern === 'aurora' ? 'aa' : 'cc');
        g.beginPath();
        if (b.pattern === 'aurora') g.ellipse(w * (0.1 + i * 0.18), h * (0.25 + 0.2 * Math.sin(i * 1.7)), m * 0.22, m * 0.06, -0.5 + i * 0.15, 0, Math.PI * 2);
        else g.arc(w * r(), h * r(), m * (0.15 + r() * 0.2), 0, Math.PI * 2);
        g.fill();
      }
      g.filter = 'none';
      break;
    }
    case 'dots': {
      g.fillStyle = c1;
      const step = m / 40, rad = Math.max(1, m / 900);
      for (let y = step / 2; y < h; y += step) for (let x = step / 2; x < w; x += step) { g.beginPath(); g.arc(x, y, rad * 1.6, 0, Math.PI * 2); g.fill(); }
      break;
    }
    case 'bokeh': {
      for (let i = 0; i < 40; i++) {
        const x = w * r(), y = h * r(), rr = m * (0.02 + r() * 0.07);
        const col = [c1, c2, c3][i % 3];
        const gr = g.createRadialGradient(x, y, 0, x, y, rr);
        gr.addColorStop(0, col + '88'); gr.addColorStop(0.8, col + '44'); gr.addColorStop(1, col + '00');
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fill();
      }
      break;
    }
    case 'lines': {
      g.strokeStyle = c1; g.lineWidth = m / 160;
      for (let x = -h; x < w + h; x += m / 30) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + h, h); g.stroke(); }
      break;
    }
    case 'noise': {
      const img = g.getImageData(0, 0, w, h);
      for (let i = 0; i < img.data.length; i += 4) { const n = (r() - 0.5) * 18; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n; }
      g.putImageData(img, 0, 0);
      break;
    }
  }
}

/** Añade un fondo en la pista inferior (reemplaza el fondo de diseño anterior si existe). */
export async function addBackground(b: BackgroundDef, start?: number, duration?: number, replace = false) {
  const s = st();
  const p = s.project;
  start = start ?? s.time;
  duration = duration ?? 10;
  if (b.kind === 'blur') { s.setProjectProps({ background: { ...p.background, type: 'blur', blur: 40 } }); return; }
  let reuseTrack: string | null = null;
  if (replace) {
    const oldClips = p.clips.filter((c) => c.name.startsWith('Fondo de diseño') && c.start < start! + duration! && c.start + c.duration > start!);
    if (oldClips.length) { reuseTrack = oldClips[0].trackId; s.removeClips(oldClips.map((c) => c.id)); }
  }
  // pista al fondo (reutiliza la del fondo anterior)
  const track = createTrack('visual');
  track.name = 'Fondo';
  if (reuseTrack && st().project.tracks.some((t) => t.id === reuseTrack)) track.id = reuseTrack;
  let clip: Clip;
  if (b.kind === 'solid' || b.kind === 'gradient') {
    clip = createClip({ type: 'solid', trackId: track.id, start, duration, name: `Fondo de diseño · ${b.name}` });
    clip.fit = 'fill';
    clip.solid = { color: b.colors[0], gradient: b.kind === 'gradient' ? { enabled: true, from: b.colors[0], to: b.colors[1], angle: b.angle ?? 90 } : { enabled: false, from: b.colors[0], to: b.colors[0], angle: 0 } };
  } else {
    const W = p.width, H = p.height;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    drawBackground(c.getContext('2d', { willReadFrequently: b.pattern === 'noise' })!, W, H, b);
    const blob: Blob = await new Promise((res) => c.toBlob((x) => res(x!), 'image/png'));
    const [asset] = await importFiles([new File([blob], `fondo-${b.id}-${W}x${H}.png`, { type: 'image/png' })]);
    if (!asset) return;
    clip = createClip({ type: 'image', trackId: track.id, start, duration, assetId: asset.id, name: `Fondo de diseño · ${b.name}` });
    clip.fit = 'cover';
  }
  st().commit((pp) => {
    if (!pp.tracks.some((t) => t.id === track.id)) {
      const lastVisual = pp.tracks.map((t) => t.kind).lastIndexOf('visual');
      pp.tracks.splice(lastVisual + 1, 0, track);
    }
    pp.clips.push(clip);
  });
}
