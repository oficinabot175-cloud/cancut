import type { Clip, Project, TrackingData, TrackBox } from '../types';
import { ease, prop } from './keyframes';
import { clamp } from './utils';

export interface Geometry {
  cx: number; cy: number;   // centro del rectángulo completo (sin recorte) en px del lienzo
  fw: number; fh: number;   // tamaño completo (sin recorte)
  rotation: number;
  flipH: boolean; flipV: boolean;
  opacity: number;
  blur: number;             // desenfoque extra por animación
  textReveal: number | null;
  textRevealOut: number | null;
  crop: { l: number; t: number; r: number; b: number };
}

export interface AnimOffsets { dx: number; dy: number; scale: number; sx: number; sy: number; rot: number; opacity: number; blur: number; textReveal: number | null; textRevealOut: number | null }

const h1 = (n: number) => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };

export function animationOffsets(clip: Clip, localT: number, W: number, H: number): AnimOffsets {
  const a = clip.animation;
  const o: AnimOffsets = { dx: 0, dy: 0, scale: 1, sx: 1, sy: 1, rot: 0, opacity: 1, blur: 0, textReveal: null, textRevealOut: null };
  const isText = clip.type === 'text';
  const apply = (type: string, p: number, dir: 1 | -1) => {
    // p: 0 = inicio de la animación (invisible), 1 = estado final
    if (type === 'none' || p >= 1) return;
    const e = ease('easeOut', p);
    switch (type) {
      case 'fade': o.opacity *= e; break;
      case 'zoomIn': o.scale *= 0.2 + 0.8 * e; o.opacity *= Math.min(1, p * 2); break;
      case 'zoomOut': o.scale *= 1 + (1 - e) * 1.2; o.opacity *= e; break;
      case 'slideLeft': o.dx += (1 - e) * W * 0.5 * dir; o.opacity *= Math.min(1, p * 2); break;
      case 'slideRight': o.dx -= (1 - e) * W * 0.5 * dir; o.opacity *= Math.min(1, p * 2); break;
      case 'slideUp': o.dy += (1 - e) * H * 0.4 * dir; o.opacity *= Math.min(1, p * 2); break;
      case 'slideDown': o.dy -= (1 - e) * H * 0.4 * dir; o.opacity *= Math.min(1, p * 2); break;
      case 'pop': o.scale *= Math.max(0, ease('back', p)); o.opacity *= Math.min(1, p * 3); break;
      case 'bounce': o.dy -= (1 - ease('bounce', p)) * H * 0.35 * dir; o.opacity *= Math.min(1, p * 4); break;
      case 'elastic': o.scale *= Math.max(0, ease('elastic', p)); break;
      case 'rotate': o.rot += (1 - e) * -180 * dir; o.scale *= 0.4 + 0.6 * e; o.opacity *= e; break;
      case 'flip': o.sx *= Math.max(0.001, e); break;
      case 'swing': o.rot += Math.sin((1 - p) * Math.PI * 3) * (1 - p) * 25; o.opacity *= Math.min(1, p * 3); break;
      case 'drop': o.dy -= (1 - ease('bounce', p)) * H * 0.6; break;
      case 'stretch': o.sx *= 1 + (1 - e) * 1.5; o.sy *= Math.max(0.001, e); break;
      case 'blur': o.blur += (1 - e) * 40; o.opacity *= e; break;
      case 'glitch': {
        const k = Math.floor(localT * 30);
        o.dx += (h1(k) - 0.5) * 60 * (1 - p);
        o.dy += (h1(k + 7) - 0.5) * 20 * (1 - p);
        o.opacity *= h1(k + 3) > (1 - p) * 0.6 ? 1 : 0.2;
        break;
      }
      case 'typewriter': case 'wordReveal': case 'letterFade':
        if (isText) { if (dir === 1) o.textReveal = p; else o.textRevealOut = p; }
        else o.opacity *= e;
        break;
    }
  };
  if (a.in !== 'none' && a.inDuration > 0) apply(a.in, clamp(localT / a.inDuration, 0, 1), 1);
  if (a.out !== 'none' && a.outDuration > 0) apply(a.out, clamp((clip.duration - localT) / a.outDuration, 0, 1), -1);
  if (a.loop !== 'none') {
    const t = localT * a.loopSpeed;
    const I = a.loopIntensity;
    const prog = clamp(localT / Math.max(clip.duration, 0.001), 0, 1);
    switch (a.loop) {
      case 'pulse': o.scale *= 1 + 0.08 * I * Math.sin(t * Math.PI * 2); break;
      case 'heartbeat': o.scale *= 1 + I * 0.15 * Math.pow(Math.max(0, Math.sin(t * Math.PI * 2.4)), 8); break;
      case 'float': o.dy += Math.sin(t * Math.PI) * 24 * I; break;
      case 'sway': o.rot += Math.sin(t * Math.PI) * 8 * I; break;
      case 'shake': { const k = Math.floor(t * 24); o.dx += (h1(k) - 0.5) * 30 * I; o.dy += (h1(k + 11) - 0.5) * 30 * I; break; }
      case 'wiggle': o.rot += Math.sin(t * Math.PI * 12) * 5 * I; break;
      case 'spin': o.rot += t * 90; break;
      case 'flicker': o.opacity *= h1(Math.floor(t * 15)) > 0.15 * (I * 2) ? 1 : 0.35; break;
      case 'kenBurnsIn': o.scale *= 1 + 0.25 * I * prog; break;
      case 'kenBurnsOut': o.scale *= 1 + 0.25 * I * (1 - prog); break;
      case 'panLeft': o.scale *= 1 + 0.15 * I; o.dx -= W * 0.07 * I * (prog - 0.5) * 2; break;
      case 'panRight': o.scale *= 1 + 0.15 * I; o.dx += W * 0.07 * I * (prog - 0.5) * 2; break;
    }
  }
  return o;
}

/** Interpola las cajas de seguimiento en el tiempo de fuente ts. */
export function sampleTracking(td: TrackingData | undefined, ts: number): TrackBox[] {
  if (!td || !td.samples.length) return [];
  const s = td.samples;
  if (ts <= s[0].t) return s[0].boxes;
  if (ts >= s[s.length - 1].t) return s[s.length - 1].boxes;
  let lo = 0, hi = s.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (s[m].t <= ts) lo = m; else hi = m; }
  const a = s[lo], b = s[hi];
  const k = (ts - a.t) / Math.max(b.t - a.t, 1e-6);
  if (a.boxes.some((x) => x.id !== undefined)) {
    // pistas con id: interpolar cada pista por separado; las que solo existen en un extremo se mantienen
    const out: TrackBox[] = [];
    const ids = new Set([...a.boxes, ...b.boxes].map((x) => x.id));
    for (const id of ids) {
      const A = a.boxes.find((x) => x.id === id), B = b.boxes.find((x) => x.id === id);
      if (A && B) out.push({ x: A.x + (B.x - A.x) * k, y: A.y + (B.y - A.y) * k, w: A.w + (B.w - A.w) * k, h: A.h + (B.h - A.h) * k, id });
      else out.push((A || B)!);
    }
    return out;
  }
  if (td.kind === 'faces') {
    // para rostros: no interpolar entre conjuntos de distinto tamaño
    if (a.boxes.length !== b.boxes.length) return k < 0.5 ? a.boxes : b.boxes;
  }
  const n = Math.min(a.boxes.length, b.boxes.length);
  if (n === 0) return k < 0.5 ? a.boxes : b.boxes;
  const out: TrackBox[] = [];
  for (let i = 0; i < n; i++) {
    const A = a.boxes[i], B = b.boxes[i];
    out.push({ x: A.x + (B.x - A.x) * k, y: A.y + (B.y - A.y) * k, w: A.w + (B.w - A.w) * k, h: A.h + (B.h - A.h) * k });
  }
  return out;
}

export function sourceTimeOf(clip: Clip, t: number) {
  const local = Math.max(0, t - clip.start);
  return clip.reversed ? clip.in + (clip.duration - local) * clip.speed : clip.in + local * clip.speed;
}

export interface GeomCtx {
  project: Project;
  sizeOf: (clip: Clip) => { w: number; h: number };
  depth?: number;
}

/** Tamaño base tras aplicar el modo de ajuste. */
export function fitSize(fit: Clip['fit'], sw: number, sh: number, W: number, H: number) {
  if (fit === 'none') return { w: sw, h: sh };
  if (fit === 'fill') return { w: W, h: H };
  const s = fit === 'cover' ? Math.max(W / sw, H / sh) : Math.min(W / sw, H / sh);
  return { w: sw * s, h: sh * s };
}

/** Calcula la geometría final de un clip en el tiempo t de la línea de tiempo. */
export function clipGeometry(clip: Clip, t: number, ctx: GeomCtx): Geometry {
  const { project } = ctx;
  const W = project.width, H = project.height;
  const local = t - clip.start;
  const { w: sw, h: sh } = ctx.sizeOf(clip);
  const base = fitSize(clip.fit, Math.max(1, sw), Math.max(1, sh), W, H);
  let x = prop(clip, 'x', local, clip.transform.x);
  let y = prop(clip, 'y', local, clip.transform.y);
  let scale = prop(clip, 'scale', local, clip.transform.scale);
  let rotation = prop(clip, 'rotation', local, clip.transform.rotation);
  let opacity = prop(clip, 'opacity', local, clip.transform.opacity);
  const anim = animationOffsets(clip, local, W, H);
  let fw = base.w * clip.transform.scaleX;
  let fh = base.h * clip.transform.scaleY;
  const ts = sourceTimeOf(clip, t);

  // Estabilización: corrige el movimiento de cámara
  if (clip.stabilize) {
    const td = project.trackings.find((x) => x.id === clip.stabilize!.trackingId);
    const b = sampleTracking(td, ts)[0];
    const z = clip.stabilize.zoom;
    scale *= z;
    if (b) { x += b.x * fw * scale * clip.stabilize.strength; y += b.y * fh * scale * clip.stabilize.strength; }
  }
  // Auto-reencuadre: mantiene al sujeto centrado
  if (clip.reframe) {
    const td = project.trackings.find((x) => x.id === clip.reframe!.trackingId);
    const b = sampleTracking(td, ts)[0];
    scale *= clip.reframe.zoom;
    if (b) {
      const dw = fw * scale, dh = fh * scale;
      const maxX = Math.max(0, (dw - W) / 2), maxY = Math.max(0, (dh - H) / 2);
      x += clamp(-(b.x - 0.5) * dw, -maxX, maxX);
      y += clamp(-(b.y - 0.5) * dh, -maxY, maxY);
    }
  }
  // Seguir un objeto rastreado de otro clip
  if (clip.follow && (ctx.depth || 0) < 2) {
    const f = clip.follow;
    const target = project.clips.find((c) => c.id === f.clipId);
    const td = project.trackings.find((x) => x.id === f.trackingId);
    if (target && td) {
      const tts = sourceTimeOf(target, clamp(t, target.start, target.start + target.duration));
      const boxes = sampleTracking(td, tts);
      const b = boxes[f.boxIndex] || boxes[0];
      if (b) {
        const tg = clipGeometry(target, clamp(t, target.start, target.start + target.duration - 1e-4), { ...ctx, depth: (ctx.depth || 0) + 1 });
        const pt = sourceToCanvas(tg, b.x, b.y);
        x = pt.x - W / 2 + f.offsetX;
        y = pt.y - H / 2 + f.offsetY;
        if (f.scaleWithObject && f.baseW > 0) scale *= b.w / f.baseW;
      }
    }
  }

  fw *= scale * anim.scale * anim.sx;
  fh *= scale * anim.scale * anim.sy;
  return {
    cx: W / 2 + x + anim.dx,
    cy: H / 2 + y + anim.dy,
    fw, fh,
    rotation: rotation + anim.rot,
    flipH: clip.transform.flipH,
    flipV: clip.transform.flipV,
    opacity: clamp(opacity * anim.opacity, 0, 1),
    blur: anim.blur,
    textReveal: anim.textReveal,
    textRevealOut: anim.textRevealOut,
    crop: clip.crop,
  };
}

/** Punto normalizado de la fuente → px del lienzo. */
export function sourceToCanvas(g: Geometry, nx: number, ny: number) {
  const lx = (nx - 0.5) * g.fw * (g.flipH ? -1 : 1);
  const ly = (ny - 0.5) * g.fh * (g.flipV ? -1 : 1);
  const r = (g.rotation * Math.PI) / 180;
  const c = Math.cos(r), s = Math.sin(r);
  return { x: g.cx + lx * c - ly * s, y: g.cy + lx * s + ly * c };
}

/** Px del lienzo → punto normalizado de la fuente. */
export function canvasToSource(g: Geometry, px: number, py: number) {
  const dx = px - g.cx, dy = py - g.cy;
  const r = (-g.rotation * Math.PI) / 180;
  const c = Math.cos(r), s = Math.sin(r);
  const lx = dx * c - dy * s, ly = dx * s + dy * c;
  return { x: (lx / g.fw) * (g.flipH ? -1 : 1) + 0.5, y: (ly / g.fh) * (g.flipV ? -1 : 1) + 0.5 };
}

/** Rectángulo visible (con recorte) para dibujar: centro, tamaño y uv. */
export function visibleRect(g: Geometry) {
  const { l, t, r, b } = g.crop;
  const w = g.fw * Math.max(0.001, 1 - l - r);
  const h = g.fh * Math.max(0.001, 1 - t - b);
  const offX = ((l - r) / 2) * g.fw * (g.flipH ? -1 : 1);
  const offY = ((t - b) / 2) * g.fh * (g.flipV ? -1 : 1);
  const rad = (g.rotation * Math.PI) / 180;
  const c = Math.cos(rad), s = Math.sin(rad);
  const cx = g.cx + offX * c - offY * s;
  const cy = g.cy + offX * s + offY * c;
  let u0 = l, u1 = 1 - r, v0 = t, v1 = 1 - b;
  if (g.flipH) [u0, u1] = [u1, u0];
  if (g.flipV) [v0, v1] = [v1, v0];
  return { cx, cy, w, h, uv: [u0, v0, u1, v1] as [number, number, number, number] };
}
