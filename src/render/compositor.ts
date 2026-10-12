import type { Clip, ColorGrade, Effect, LutAsset, ProjectBackground, TrackingData } from '../types';
import { GLContext, Target, quadMatrix, FULLSCREEN } from './gl';
import * as S from './shaders';
import { Geometry, sampleTracking, visibleRect } from '../core/geometry';
import { FILTERS, BLEND_ID } from '../core/presets';
import { curvesTexture, isIdentity } from '../core/curves';
import { clamp, hexToRgb } from '../core/utils';

export interface SegMask { data: Uint8Array; w: number; h: number; version: number }

export interface RenderLayer {
  clip: Clip;
  geom: Geometry;
  source: TexImageSource | null;
  srcW: number;
  srcH: number;
  /** cambia cuando el contenido cambia; null = subir siempre (video) */
  sourceKey: string | number | null;
  cacheId: string;
  segMask?: SegMask | null;
  localT: number;
  sourceT: number;
  transition?: { typeId: number; progress: number; from: RenderLayer | null } | null;
  adjustment?: boolean;
  solid?: { color: string; gradient: { enabled: boolean; from: string; to: string; angle: number } };
}

export interface RenderScene {
  width: number;   // ancho del proyecto
  height: number;
  background: ProjectBackground;
  layers: RenderLayer[];
  time: number;
  trackings: TrackingData[];
  luts: LutAsset[];
}

const SIMPLE: Partial<Record<Effect['type'], number>> = {
  pixelate: 1, vignette: 2, grain: 3, rgbSplit: 4, glitch: 5, scanlines: 6, halftone: 7, posterize: 8,
  edge: 9, emboss: 10, duotone: 11, colorOverlay: 12, invert: 13, mirror: 14, kaleidoscope: 15, wave: 16,
  fisheye: 17, cinemaBars: 18, vhs: 19, chromaKey: 20, lumaKey: 21,
};

interface TexEntry { tex: WebGLTexture; key: string | number | null; w: number; h: number; used: number }

/** Lienzo para renders fuera de pantalla (miniaturas, exportación) sin interferir con el visor. */
export function makeRenderCanvas(w = 16, h = 16): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}

export async function canvasToBlob(c: HTMLCanvasElement | OffscreenCanvas, type = 'image/png', quality?: number): Promise<Blob> {
  if ('convertToBlob' in c) return (c as OffscreenCanvas).convertToBlob({ type, quality });
  return new Promise((r) => (c as HTMLCanvasElement).toBlob((b) => r(b!), type, quality));
}

export class Compositor {
  ctx: GLContext;
  private texCache = new Map<string, TexEntry>();
  private maskCache = new Map<string, TexEntry>();
  private curveCache = new Map<string, { tex: WebGLTexture; key: string; used: number }>();
  private lutCache = new Map<string, WebGLTexture>();
  private frame = 0;
  main: Target | null = null;
  outW = 1;
  outH = 1;
  private k = 1;
  /** tamaño máximo de textura de procesamiento (hasta 8K) */
  maxDim = 4096;
  private history = new Map<string, { frames: Target[]; last: number; used: number }>();
  private centroids = new Map<string, { version: number; c: [number, number] }>();
  private overlay: { canvas: HTMLCanvasElement | OffscreenCanvas; tex: WebGLTexture; key: string } | null = null;

  constructor(canvas: HTMLCanvasElement | OffscreenCanvas) {
    this.ctx = new GLContext(canvas);
    const gl = this.ctx.gl;
    this.maxDim = Math.max(2048, Math.min(8192, gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096, (gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number) || 8192));
  }

  /** Centro de masa de la máscara de la persona (uv, fila 0 = arriba). */
  private centroid(L: RenderLayer): [number, number] {
    const m = L.segMask;
    if (!m) return [0.5, 0.45];
    const c = this.centroids.get(L.cacheId);
    if (c && c.version === m.version) return c.c;
    let sx = 0, sy = 0, n = 0, minY = m.h;
    const step = Math.max(1, Math.floor(Math.min(m.w, m.h) / 96));
    for (let y = 0; y < m.h; y += step) for (let x = 0; x < m.w; x += step) {
      const v = m.data[y * m.w + x];
      if (v > 128) { sx += x; sy += y; n++; if (y < minY) minY = y; }
    }
    const r: [number, number] = n ? [sx / n / m.w, ((sy / n) * 0.7 + minY * 0.3) / m.h] : [0.5, 0.45];
    this.centroids.set(L.cacheId, { version: m.version, c: r });
    return r;
  }

  /** Textura de rótulos de videocámara (REC, tiempo, fecha). */
  private camcorderTexture(w: number, h: number, label: string, showDate: boolean, showTc: boolean, t: number): WebGLTexture {
    const cw = Math.min(1600, w), ch = Math.max(2, Math.round((cw * h) / w));
    const blink = Math.floor(t * 1.25) % 2 === 0;
    const tc = Math.max(0, t);
    const tcs = `${String(Math.floor(tc / 3600)).padStart(1, '0')}:${String(Math.floor(tc / 60) % 60).padStart(2, '0')}:${String(Math.floor(tc) % 60).padStart(2, '0')}`;
    const d = new Date();
    const months = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
    const ds = `${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()}`;
    const key = [cw, ch, label, blink, showDate && ds, showTc && tcs].join('|');
    if (this.overlay && this.overlay.key === key) return this.overlay.tex;
    if (!this.overlay) this.overlay = { canvas: makeRenderCanvas(cw, ch), tex: this.ctx.createTexture(), key: '' };
    const cv = this.overlay.canvas as HTMLCanvasElement;
    if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
    const g = cv.getContext('2d') as CanvasRenderingContext2D;
    g.clearRect(0, 0, cw, ch);
    const u = ch / 100;
    const fs = Math.max(10, Math.round(u * 5.2));
    g.font = `700 ${fs}px "Courier New", ui-monospace, monospace`;
    g.textBaseline = 'middle';
    g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = u * 0.8; g.shadowOffsetY = u * 0.25;
    const mx = ch * 0.1, my = ch * 0.1;
    g.fillStyle = '#ffffff';
    if (label.startsWith('REC') || label === 'LIVE') {
      if (blink) { g.fillStyle = '#ff2a2a'; g.beginPath(); g.arc(mx + fs * 0.4, my + fs * 0.1, fs * 0.36, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = '#ffffff'; g.fillText(label, mx + fs * 1.05, my + fs * 0.1);
    } else g.fillText(label, mx, my + fs * 0.1);
    // batería
    const bw = fs * 1.9, bh = fs * 0.85, bx = cw - mx - bw, by = my + fs * 0.1 - bh / 2;
    g.lineWidth = Math.max(1.5, u * 0.45); g.strokeStyle = '#ffffff'; g.strokeRect(bx, by, bw, bh);
    g.fillRect(bx + bw, by + bh * 0.3, u * 0.7, bh * 0.4);
    for (let i = 0; i < 3; i++) g.fillRect(bx + u * 0.6 + i * (bw - u * 1.2) / 3, by + u * 0.6, (bw - u * 1.2) / 3 - u * 0.5, bh - u * 1.2);
    if (showTc) g.fillText(tcs, mx, ch - my);
    if (showDate) { const tw = g.measureText(ds).width; g.fillText(ds, cw - mx - tw, ch - my); }
    this.ctx.upload(this.overlay.tex, cv as TexImageSource);
    this.overlay.key = key;
    return this.overlay.tex;
  }

  /** Historial de fotogramas para la estela (más reciente primero). */
  private echoHistory(id: string, src: Target, mask: Target | null, time: number, delay: number, count: number): Target[] {
    const ctx = this.ctx;
    let h = this.history.get(id);
    if (!h) { h = { frames: [], last: -1e9, used: this.frame }; this.history.set(id, h); }
    h.used = this.frame;
    if (time < h.last - 1e-3 || time - h.last > 1.5) { for (const f of h.frames) ctx.release(f); h.frames = []; h.last = -1e9; }
    const out = h.frames.slice(0, count);
    if (time - h.last >= delay - 1e-4) {
      const sc = Math.min(1, 1280 / Math.max(src.w, src.h));
      const t = ctx.acquire(Math.max(2, Math.round(src.w * sc)), Math.max(2, Math.round(src.h * sc)));
      if (mask) ctx.run(this.P('segment', S.FS_SEGMENT), t, { uMode: 0, uThreshold: 0.5, uSoft: 0.1, uColor: [0, 0, 0] }, { uTex: src.tex, uMask: mask.tex });
      else ctx.run(this.P('copy', S.FS_COPY), t, { uOpacity: 1 }, { uTex: src.tex });
      h.frames.unshift(t);
      while (h.frames.length > 6) ctx.release(h.frames.pop()!);
      h.last = time;
    }
    return out;
  }

  private P(name: string, fs: string) { return this.ctx.program(name, fs); }

  /** Sube (o reutiliza) la textura de la fuente de una capa. */
  private sourceTexture(L: RenderLayer): TexEntry | null {
    if (!L.source) return null;
    let e = this.texCache.get(L.cacheId);
    if (!e) {
      e = { tex: this.ctx.createTexture(), key: '__none__', w: 0, h: 0, used: 0 };
      this.texCache.set(L.cacheId, e);
    }
    e.used = this.frame;
    if (L.sourceKey === null || e.key !== L.sourceKey) {
      try {
        this.ctx.upload(e.tex, L.source);
        e.key = L.sourceKey;
        e.w = L.srcW; e.h = L.srcH;
      } catch (err) {
        return e.w ? e : null;
      }
    }
    return e;
  }

  private maskTexture(L: RenderLayer): WebGLTexture | null {
    const m = L.segMask;
    if (!m) return null;
    let e = this.maskCache.get(L.cacheId);
    if (!e) { e = { tex: this.ctx.createTexture(), key: -1, w: 0, h: 0, used: 0 }; this.maskCache.set(L.cacheId, e); }
    e.used = this.frame;
    if (e.key !== m.version) { this.ctx.uploadR8(e.tex, m.data, m.w, m.h); e.key = m.version; }
    return e.tex;
  }

  private lutTexture(id: string, luts: LutAsset[]): WebGLTexture | null {
    if (this.lutCache.has(id)) return this.lutCache.get(id)!;
    const l = luts.find((x) => x.id === id);
    if (!l) return null;
    const t = this.ctx.create3DLut(l.data, l.size);
    this.lutCache.set(id, t);
    return t;
  }

  /** Desenfoque gaussiano con reducción de resolución para radios grandes. Devuelve un target nuevo. */
  blur(src: Target, radius: number): Target {
    const ctx = this.ctx;
    if (radius < 0.5) {
      const t = ctx.acquire(src.w, src.h);
      ctx.run(this.P('copy', S.FS_COPY), t, { uOpacity: 1 }, { uTex: src.tex });
      return t;
    }
    let f = 1;
    while (radius / f > 10 && src.w / (f * 2) >= 8 && src.h / (f * 2) >= 8) f *= 2;
    let cur = src;
    let owned: Target | null = null;
    let cf = 1;
    while (cf < f) {
      cf *= 2;
      const d = ctx.acquire(Math.max(1, Math.round(src.w / cf)), Math.max(1, Math.round(src.h / cf)));
      ctx.run(this.P('copy', S.FS_COPY), d, { uOpacity: 1 }, { uTex: cur.tex });
      if (owned) ctx.release(owned);
      owned = d; cur = d;
    }
    const r = radius / f;
    const h = ctx.acquire(cur.w, cur.h);
    ctx.run(this.P('blur', S.FS_BLUR), h, { uDir: [1 / cur.w, 0], uRadius: r }, { uTex: cur.tex });
    const v = ctx.acquire(cur.w, cur.h);
    ctx.run(this.P('blur', S.FS_BLUR), v, { uDir: [0, 1 / cur.h], uRadius: r }, { uTex: h.tex });
    ctx.release(h);
    if (owned) ctx.release(owned);
    return v;
  }

  private gradeUniforms(g: ColorGrade, texW: number, texH: number) {
    const f = FILTERS.find((x) => x.id === g.filter);
    const k = f && f.id !== 'none' ? clamp(g.filterIntensity, 0, 1) : 0;
    const fg = (f?.grade || {}) as Partial<ColorGrade>;
    const num = (key: keyof ColorGrade) => (g[key] as number) + (((fg[key] as number) || 0) * k);
    let splitShadow = hexToRgb(g.splitShadow), splitHighlight = hexToRgb(g.splitHighlight);
    let splitAmount = g.splitAmount;
    if (k > 0 && fg.splitAmount) {
      // si el filtro trae split toning, mezclarlo
      const fs = hexToRgb(fg.splitShadow || g.splitShadow), fh = hexToRgb(fg.splitHighlight || g.splitHighlight);
      const w = (fg.splitAmount * k) / Math.max(1e-3, fg.splitAmount * k + g.splitAmount);
      splitShadow = splitShadow.map((v, i) => v + (fs[i] - v) * w) as any;
      splitHighlight = splitHighlight.map((v, i) => v + (fh[i] - v) * w) as any;
      splitAmount = clamp(g.splitAmount + fg.splitAmount * k, 0, 1);
    }
    return {
      uTexel: [1 / texW, 1 / texH],
      uExposure: num('exposure'), uContrast: num('contrast'), uHighlights: num('highlights'), uShadows: num('shadows'),
      uWhites: num('whites'), uBlacks: num('blacks'), uSaturation: num('saturation'), uVibrance: num('vibrance'),
      uTemp: num('temperature'), uTint: num('tint'), uHue: num('hue'), uFade: clamp(num('fade'), 0, 1),
      uVignette: clamp(num('vignette'), -1, 1), uMono: clamp(num('mono'), 0, 1), uSepia: clamp(num('sepia'), 0, 1),
      uSharpen: clamp(num('sharpen'), 0, 2),
      uLift: g.lift, uGamma: g.gamma, uGain: g.gain,
      uSplitShadow: splitShadow, uSplitHighlight: splitHighlight, uSplitAmount: splitAmount,
    };
  }

  /** Aplica la corrección de color + cadena de efectos + máscara. Devuelve target en espacio de la fuente. */
  private processChain(L: RenderLayer | null, srcTex: WebGLTexture, sw: number, sh: number, ew: number, eh: number, clip: Clip, scene: RenderScene, geomW: number): Target {
    const ctx = this.ctx;
    const scaleToTex = ew / Math.max(1, geomW); // px del proyecto → px de la textura de efectos
    // 1) Corrección de color (siempre: también reescala a la resolución de efectos)
    let cur = ctx.acquire(ew, eh);
    const g = clip.grade;
    const curvesOn = !!g.curves && !isIdentity(g.curves);
    let curvesTex: WebGLTexture | null = null;
    if (curvesOn) {
      const key = JSON.stringify(g.curves);
      let ce = this.curveCache.get(clip.id);
      if (!ce || ce.key !== key) {
        if (!ce) ce = { tex: ctx.createTexture(), key: '', used: 0 };
        ctx.uploadRGBA(ce.tex, curvesTexture(g.curves!), 256, 4);
        ce.key = key;
        this.curveCache.set(clip.id, ce);
      }
      ce.used = this.frame;
      curvesTex = ce.tex;
    }
    const lut = g.lutId ? this.lutTexture(g.lutId, scene.luts) : null;
    const lutSize = g.lutId ? scene.luts.find((l) => l.id === g.lutId)?.size || 1 : 1;
    // Re-escalado inteligente (Mejorar calidad): bicúbico Catmull-Rom en lugar de bilineal
    let up: Target | null = null;
    const enh = clip.effects.find((e) => e.type === 'enhance' && e.enabled);
    if (enh && enh.params.upscale !== false && (ew > sw * 1.02 || eh > sh * 1.02)) {
      up = ctx.acquire(ew, eh);
      ctx.run(this.P('bicubic', S.FS_BICUBIC), up, { uSrcRes: [sw, sh] }, { uTex: srcTex });
    }
    const textures: Record<string, any> = { uTex: up ? up.tex : srcTex };
    if (curvesTex) textures.uCurves = curvesTex;
    if (lut) textures.uLut = { tex: lut, is3D: true };
    ctx.run(this.P('grade', S.FS_GRADE), cur, {
      ...this.gradeUniforms(g, up ? ew : sw, up ? eh : sh),
      uUseCurves: curvesOn ? 1 : 0,
      uLutAmount: lut ? clamp(g.lutIntensity, 0, 1) : 0,
      uLutSize: lutSize,
    }, textures);
    if (up) ctx.release(up);

    const swap = (next: Target) => { ctx.release(cur); cur = next; };
    const time = scene.time;
    const lt = L ? L.localT : time;
    // máscara de persona suavizada (compartida por todos los efectos de IA del clip)
    let personMask: Target | null = null;
    const getMask = (softness = 0.12): Target | null => {
      if (personMask) return personMask;
      const raw = L ? this.maskTexture(L) : null;
      if (!raw || !L?.segMask) return null;
      const mw = Math.min(ew, L.segMask.w * 2), mh = Math.min(eh, L.segMask.h * 2);
      const mt = ctx.acquire(mw, mh);
      ctx.run(this.P('copy', S.FS_COPY), mt, { uOpacity: 1 }, { uTex: raw });
      personMask = this.blur(mt, 1 + softness * 8);
      ctx.release(mt);
      return personMask;
    };
    const trend = (type: number, u: Record<string, any>, tex2?: WebGLTexture) => {
      const t = ctx.acquire(ew, eh);
      ctx.run(this.P('trend', S.FS_TREND), t, { uType: type, uRes: [ew, eh], uTime: lt, uA: 0, uB: 0, uC: 0, uD: 0, uCol1: [1, 1, 1], uCol2: [1, 1, 1], ...u }, tex2 ? { uTex: cur.tex, uTex2: tex2 } : { uTex: cur.tex });
      swap(t);
    };

    for (const fx of clip.effects) {
      if (!fx.enabled) continue;
      const p = fx.params;
      const n = (k: string, d = 0) => (typeof p[k] === 'number' ? (p[k] as number) : d);
      const s = (k: string, d = '') => (typeof p[k] === 'string' ? (p[k] as string) : d);
      const b = (k: string) => p[k] === true;
      switch (fx.type) {
        case 'blur': { const t = this.blur(cur, n('radius', 10) * scaleToTex); swap(this.resizeTo(t, ew, eh)); break; }
        case 'directionalBlur': {
          const a = (n('angle') * Math.PI) / 180;
          const t = ctx.acquire(ew, eh);
          ctx.run(this.P('dirblur', S.FS_DIRBLUR), t, { uDir: [Math.cos(a) / ew, Math.sin(a) / eh], uAmount: n('amount', 20) * scaleToTex }, { uTex: cur.tex });
          swap(t); break;
        }
        case 'zoomBlur': {
          const t = ctx.acquire(ew, eh);
          ctx.run(this.P('zoomblur', S.FS_ZOOMBLUR), t, { uCenter: [n('cx', 0.5), n('cy', 0.5)], uAmount: n('amount', 0.2) }, { uTex: cur.tex });
          swap(t); break;
        }
        case 'sharpen': {
          const bl = this.blur(cur, n('radius', 1.2) * Math.max(1, scaleToTex));
          const t = ctx.acquire(ew, eh);
          ctx.run(this.P('unsharp', S.FS_UNSHARP), t, { uAmount: n('amount', 0.8) }, { uTex: cur.tex, uBlur: bl.tex });
          ctx.release(bl); swap(t); break;
        }
        case 'glow': {
          const th = ctx.acquire(ew, eh);
          ctx.run(this.P('simple', S.FS_SIMPLE), th, { uType: 22, uA: n('threshold', 0.65), uRes: [ew, eh] }, { uTex: cur.tex });
          const bl = this.blur(th, n('radius', 24) * scaleToTex);
          ctx.release(th);
          const t = ctx.acquire(ew, eh);
          ctx.run(this.P('add', S.FS_ADD), t, { uAmount: n('intensity', 1) }, { uTex: cur.tex, uTex2: bl.tex });
          ctx.release(bl); swap(t); break;
        }
        case 'tiltShift': {
          const bl = this.blur(cur, n('radius', 18) * scaleToTex);
          const t = ctx.acquire(ew, eh);
          ctx.run(this.P('tilt', S.FS_TILT), t, { uCenter: n('center', 0.5), uSize: n('size', 0.2), uSoft: n('softness', 0.25) }, { uTex: cur.tex, uFx: bl.tex });
          ctx.release(bl); swap(t); break;
        }
        case 'regionBlur': case 'focus': {
          const isFocus = fx.type === 'focus';
          const mode = isFocus ? 0 : ({ blur: 0, pixelate: 1, solid: 2 } as Record<string, number>)[s('mode', 'blur')] ?? 0;
          let boxes: number[][] = [];
          const trk = s('tracking');
          if (trk) {
            const td = scene.trackings.find((x) => x.id === trk);
            const exp = n('expand', 1.2);
            boxes = sampleTracking(td, L ? L.sourceT : 0).slice(0, 8).map((bx) => [bx.x, bx.y, bx.w * exp, bx.h * exp]);
          } else boxes = [[n('x', 0.5), n('y', 0.5), n('w', 0.3), n('h', 0.3)]];
          if (!boxes.length) break;
          let fxT: Target | null = null;
          if (mode === 0) fxT = this.blur(cur, n('strength', 20) * scaleToTex);
          const flat = new Float32Array(32);
          boxes.forEach((bx, i) => flat.set(bx, i * 4));
          const t = ctx.acquire(ew, eh);
          ctx.run(this.P('region', S.FS_REGION), t, {
            uRes: [ew, eh], uBoxes: flat, uCount: boxes.length, uShape: s('shape', 'ellipse') === 'rect' ? 1 : 2,
            uFeather: n('feather', 0.25), uInvert: isFocus ? 1 : b('invert') ? 1 : 0, uMode: mode,
            uStrength: n('strength', 20) * scaleToTex, uColor: hexToRgb(s('color', '#000000')), uDarken: isFocus ? n('darken', 0) : 0,
          }, fxT ? { uTex: cur.tex, uFx: fxT.tex } : { uTex: cur.tex });
          if (fxT) ctx.release(fxT);
          swap(t); break;
        }
        case 'bgRemove': {
          // máscara suavizada (las máscaras de IA son de baja resolución)
          const mb = getMask(n('softness', 0.12));
          if (!mb) break;
          const maskTex = mb.tex;
          const modeMap: Record<string, number> = { remove: 0, blur: 1, color: 2, keepBg: 3, gray: 4 };
          const mode = modeMap[s('mode', 'remove')] ?? 0;
          let bl: Target | null = null;
          if (mode === 1) bl = this.blur(cur, n('blur', 22) * scaleToTex);
          const t = ctx.acquire(ew, eh);
          ctx.run(this.P('segment', S.FS_SEGMENT), t, {
            uMode: mode, uThreshold: n('threshold', 0.5), uSoft: n('softness', 0.12), uColor: hexToRgb(s('color', '#00b140')),
          }, bl ? { uTex: cur.tex, uMask: maskTex, uBlur: bl.tex } : { uTex: cur.tex, uMask: maskTex });
          if (bl) ctx.release(bl);
          swap(t); break;
        }
        // ---------------- Persona (IA)
        case 'aura': {
          const mk = getMask(0.1);
          if (!mk) break;
          const k = mk.w / ew;
          const size = n('size', 70) * scaleToTex * k;
          const big = this.blur(mk, Math.max(1, size));
          const small = this.blur(mk, Math.max(0.8, size * 0.32));
          const style = ({ glow: 0, rainbow: 1, outline: 2, double: 3, fire: 4 } as Record<string, number>)[s('style', 'glow')] ?? 0;
          const bg = ({ keep: 0, dark: 1, remove: 2, bw: 3 } as Record<string, number>)[s('background', 'keep')] ?? 0;
          const t = ctx.acquire(ew, eh);
          ctx.run(this.P('person', S.FS_PERSON), t, {
            uMode: 1, uStyle: style, uBg: bg, uRes: [ew, eh], uTime: lt, uCol1: hexToRgb(s('color', '#ff2ad4')), uCol2: hexToRgb(s('color2', '#00e5ff')),
            uIntensity: n('intensity', 1.3), uPulse: n('pulse', 0.3), uCenter: L ? this.centroid(L) : [0.5, 0.45],
          }, { uTex: cur.tex, uMask: mk.tex, uFx: big.tex, uFx2: small.tex });
          ctx.release(big); ctx.release(small);
          swap(t); break;
        }
        case 'subjectRays': {
          const mk = getMask(0.1);
          if (!mk) break;
          const edge = this.blur(mk, 3);
          const sil = ctx.acquire(Math.max(2, Math.round(ew / 2)), Math.max(2, Math.round(eh / 2)));
          ctx.run(this.P('trend', S.FS_TREND), sil, { uType: 16, uA: 1, uCol1: hexToRgb(s('color', '#ffe2a0')), uRes: [sil.w, sil.h] }, { uTex: mk.tex, uTex2: edge.tex });
          ctx.release(edge);
          const ctr = L ? this.centroid(L) : [0.5, 0.45];
          const r1 = ctx.acquire(sil.w, sil.h);
          ctx.run(this.P('zoomblur', S.FS_ZOOMBLUR), r1, { uCenter: ctr, uAmount: n('length', 0.55) }, { uTex: sil.tex });
          const r2 = ctx.acquire(sil.w, sil.h);
          ctx.run(this.P('zoomblur', S.FS_ZOOMBLUR), r2, { uCenter: ctr, uAmount: n('length', 0.55) * 0.45 }, { uTex: r1.tex });
          ctx.release(sil); ctx.release(r1);
          const t = ctx.acquire(ew, eh);
          ctx.run(this.P('person', S.FS_PERSON), t, {
            uMode: 2, uBg: 0, uRes: [ew, eh], uTime: lt, uIntensity: n('intensity', 1.2), uDarken: n('darken', 0.35), uSpin: n('spin', 0.4), uCenter: ctr,
          }, { uTex: cur.tex, uMask: mk.tex, uFx: r2.tex });
          ctx.release(r2);
          swap(t); break;
        }
        case 'echo': {
          const useMask = s('target', 'subject') === 'subject';
          const mk = useMask ? getMask(0.1) : null;
          if (useMask && !mk) break;
          const mode = ({ trail: 0, clones: 1, zoom: 2 } as Record<string, number>)[s('mode', 'trail')] ?? 0;
          const count = clamp(Math.round(n('count', 4)), 1, 6);
          const hist = mode === 0 ? this.echoHistory((L?.cacheId || clip.id) + ':' + fx.id, cur, mk, time, 0.02 + n('spacing', 0.25) * 0.25, count) : [];
          const tex: Record<string, any> = { uTex: cur.tex };
          if (mk) tex.uMask = mk.tex;
          hist.forEach((h, i) => { tex['uH' + i] = h.tex; });
          const t = ctx.acquire(ew, eh);
          ctx.run(this.P('echo', S.FS_ECHO), t, {
            uMode: mode, uCount: count, uHist: hist.length, uUseMask: useMask ? 1 : 0, uSpacing: n('spacing', 0.25), uDecay: n('decay', 0.6),
            uTint: hexToRgb(s('tint', '#7c5cff')), uTintAmt: n('tintAmount', 0.5), uCenter: L ? this.centroid(L) : [0.5, 0.5], uRes: [ew, eh],
          }, tex);
          swap(t); break;
        }
        // ---------------- Tendencias TikTok
        case 'shake': trend(1, { uA: n('amount', 0.35), uB: n('speed', 2), uC: n('rotation', 0.3), uD: n('blur', 0.4) }); break;
        case 'flash': trend(2, { uA: n('intensity', 0.8), uB: n('rate', 2), uC: n('decay', 0.35), uCol1: hexToRgb(s('color', '#ffffff')) }); break;
        case 'zoomPulse': trend(3, { uA: n('amount', 0.15), uB: n('rate', 2), uC: n('blur', 0.5) }); break;
        case 'rgbShake': trend(4, { uA: n('amount', 14) * scaleToTex, uB: n('speed', 3), uC: n('jitter', 0.4) }); break;
        case 'lightLeak': trend(5, { uA: n('intensity', 0.7), uB: n('speed', 0.6), uCol1: hexToRgb(s('color1', '#ff7a1a')), uCol2: hexToRgb(s('color2', '#ff2d6f')) }); break;
        case 'sparkles': trend(6, { uA: n('intensity', 1), uB: n('size', 34) * scaleToTex, uC: n('density', 60), uD: n('threshold', 0.55), uCol1: hexToRgb(s('color', '#fff6d6')) }); break;
        case 'particles': {
          const kind = ({ snow: 0, hearts: 1, confetti: 2, stars: 3, bokeh: 4, rain: 5, embers: 6 } as Record<string, number>)[s('kind', 'snow')] ?? 0;
          trend(7, { uA: n('density', 1), uB: n('size', 1), uC: n('speed', 1), uD: kind, uCol1: hexToRgb(s('color', '#ffffff')) });
          break;
        }
        case 'oldFilm': trend(8, { uA: n('amount', 0.7), uB: n('scratches', 0.6), uC: n('dust', 0.5), uD: n('flicker', 0.5) }); break;
        case 'camcorder': {
          const ov = this.camcorderTexture(ew, eh, s('label', 'REC'), p.date !== false, p.timecode !== false, lt);
          trend(9, { uA: n('look', 0.45) }, ov);
          break;
        }
        case 'prism': trend(10, { uA: n('amount', 0.04), uB: n('copies', 3), uC: n('zoom', 0.04), uD: n('speed', 1) }); break;
        case 'dreamGlow': {
          const bl = this.blur(cur, n('radius', 28) * scaleToTex);
          trend(11, { uA: n('amount', 0.55), uB: n('warmth', 0.2) }, bl.tex);
          ctx.release(bl); break;
        }
        // ---------------- Belleza y calidad
        case 'smoothSkin': trend(12, { uA: n('amount', 0.6), uB: Math.max(1, n('radius', 5) * Math.max(0.5, scaleToTex)), uC: p.skinOnly === false ? 0 : 1, uD: n('glow', 0.25) }); break;
        case 'enhance': {
          const dn = n('denoise', 0.35), db = n('deband', 0.3), cl = n('clarity', 0.3), co = n('color', 0.25), sh2 = n('sharpen', 0.55);
          if (dn > 0.01) trend(12, { uA: Math.min(1, dn * 1.2), uB: 1.2 + dn * 2.5, uC: 2, uD: 0 });
          if (db > 0.01) trend(14, { uA: 2 + db * 10, uB: db });
          if (cl > 0.01) {
            const bl = this.blur(cur, Math.max(4, Math.max(ew, eh) / 90));
            const t = ctx.acquire(ew, eh);
            ctx.run(this.P('unsharp', S.FS_UNSHARP), t, { uAmount: cl * 0.9 }, { uTex: cur.tex, uBlur: bl.tex });
            ctx.release(bl); swap(t);
          }
          if (co > 0.01) trend(15, { uA: co });
          if (sh2 > 0.01) trend(13, { uA: sh2 });
          break;
        }
        default: {
          const type = SIMPLE[fx.type];
          if (!type) break;
          const u: Record<string, any> = { uType: type, uRes: [ew, eh], uTime: time, uA: 0, uB: 0, uC: 0, uD: 0, uCol1: [0, 0, 0], uCol2: [1, 1, 1] };
          switch (fx.type) {
            case 'pixelate': u.uA = n('size', 16) * scaleToTex; break;
            case 'vignette': u.uA = n('amount', 0.5); u.uB = n('size', 0.5) + 0.3; u.uC = n('softness', 0.5); u.uCol1 = hexToRgb(s('color', '#000000')); break;
            case 'grain': u.uA = n('amount', 0.25); u.uB = n('size', 1.5) * Math.max(0.5, scaleToTex); break;
            case 'rgbSplit': u.uA = n('amount', 6) * scaleToTex; u.uB = n('angle', 0); break;
            case 'glitch': u.uA = n('amount', 0.4); u.uB = n('speed', 1); break;
            case 'scanlines': u.uA = n('amount', 0.35); u.uB = n('density', 400); break;
            case 'halftone': u.uA = Math.max(2, n('size', 8) * scaleToTex); u.uB = b('color') ? 1 : 0; break;
            case 'posterize': u.uA = n('levels', 6); break;
            case 'edge': u.uA = n('amount', 1.5); u.uB = ({ sketch: 0, neon: 1, mix: 2 } as Record<string, number>)[s('mode', 'sketch')] ?? 0; break;
            case 'emboss': u.uA = n('amount', 1); break;
            case 'duotone': u.uA = n('mix', 1); u.uCol1 = hexToRgb(s('dark', '#1a0b5e')); u.uCol2 = hexToRgb(s('light', '#ff4fa3')); break;
            case 'colorOverlay': u.uA = n('amount', 0.3); u.uCol1 = hexToRgb(s('color', '#ff3b6b')); break;
            case 'invert': u.uA = n('amount', 1); break;
            case 'mirror': u.uA = ({ h: 0, v: 1, quad: 2 } as Record<string, number>)[s('mode', 'h')] ?? 0; break;
            case 'kaleidoscope': u.uA = n('segments', 6); u.uB = n('rotation', 0); break;
            case 'wave': u.uA = n('amount', 0.015); u.uB = n('frequency', 12); u.uC = n('speed', 2); break;
            case 'fisheye': u.uA = n('amount', 0.4); break;
            case 'cinemaBars': u.uA = parseFloat(s('ratio', '2.39')) || 2.39; u.uCol1 = hexToRgb(s('color', '#000000')); break;
            case 'vhs': u.uA = n('amount', 0.6); break;
            case 'chromaKey': u.uCol1 = hexToRgb(s('color', '#00ff00')); u.uA = n('similarity', 0.38); u.uB = n('smoothness', 0.08); u.uC = n('spill', 0.5); break;
            case 'lumaKey': u.uA = n('threshold', 0.2); u.uB = n('softness', 0.1); u.uC = b('invert') ? 1 : 0; break;
          }
          const t = ctx.acquire(ew, eh);
          ctx.run(this.P('simple', S.FS_SIMPLE), t, u, { uTex: cur.tex });
          swap(t);
        }
      }
    }

    // Desenfoque de animación
    if (L && L.geom.blur > 0.3) { const t = this.blur(cur, L.geom.blur * scaleToTex); swap(this.resizeTo(t, ew, eh)); }

    // Marco de presentación (esquinas redondeadas + borde)
    const fr = clip.frame;
    if (fr && (fr.radius > 0 || fr.border > 0)) {
      const t = ctx.acquire(ew, eh);
      const cr = clip.crop;
      ctx.run(this.P('frame', S.FS_FRAME), t, { uRes: [ew, eh], uRadius: fr.radius * scaleToTex, uBorder: fr.border * scaleToTex, uColor: hexToRgb(fr.color || '#ffffff'), uCrop: [cr.l, cr.t, 1 - cr.r, 1 - cr.b] }, { uTex: cur.tex });
      swap(t);
    }

    // Máscara de forma
    const m = clip.mask;
    if (m.shape !== 'none') {
      const shapeId = ({ rect: 1, ellipse: 2, linear: 3, heart: 4, star: 5 } as Record<string, number>)[m.shape] || 1;
      const t = ctx.acquire(ew, eh);
      ctx.run(this.P('mask', S.FS_MASK), t, {
        uRes: [ew, eh], uCenter: [m.x, m.y], uSize: [m.w, m.h], uRot: m.rotation, uFeather: m.feather, uInvert: m.invert ? 1 : 0, uShape: shapeId, uRadius: m.radius,
      }, { uTex: cur.tex });
      swap(t);
    }
    if (personMask) ctx.release(personMask);
    return cur;
  }

  private resizeTo(t: Target, w: number, h: number): Target {
    if (t.w === w && t.h === h) return t;
    const ctx = this.ctx;
    const r = ctx.acquire(w, h);
    ctx.run(this.P('copy', S.FS_COPY), r, { uOpacity: 1 }, { uTex: t.tex });
    ctx.release(t);
    return r;
  }

  /** Procesa una capa y la dibuja transformada en un target del tamaño de salida. */
  private renderLayer(L: RenderLayer, scene: RenderScene): Target | null {
    const ctx = this.ctx;
    const k = this.k;
    const out = ctx.acquire(this.outW, this.outH);
    ctx.run(this.P('copy', S.FS_COPY), out, { uOpacity: 0 }, { uTex: ctx.dummy2D }, { clear: true });
    let srcTex: WebGLTexture;
    let sw: number, sh: number;
    let tempSolid: Target | null = null;
    if (L.solid) {
      sw = 64; sh = 64;
      tempSolid = ctx.acquire(sw, sh);
      const c1 = hexToRgb(L.solid.color), c2 = hexToRgb(L.solid.gradient.from), c3 = hexToRgb(L.solid.gradient.to);
      ctx.run(this.P('solid', S.FS_SOLID), tempSolid, L.solid.gradient.enabled
        ? { uColor: [...c2, 1], uColor2: [...c3, 1], uAngle: L.solid.gradient.angle, uGradient: 1 }
        : { uColor: [...c1, 1], uColor2: [...c1, 1], uAngle: 0, uGradient: 0 }, {});
      srcTex = tempSolid.tex;
    } else {
      const e = this.sourceTexture(L);
      if (!e) { ctx.release(out); return null; }
      srcTex = e.tex; sw = e.w || L.srcW; sh = e.h || L.srcH;
    }
    const g = L.geom;
    const dispW = Math.abs(g.fw * k), dispH = Math.abs(g.fh * k);
    // resolución de procesamiento: no mayor que la fuente ni que lo mostrado (con margen)
    const maxDim = this.maxDim;
    const upscale = L.clip.effects.some((e) => e.type === 'enhance' && e.enabled && e.params.upscale !== false);
    let ew = Math.min(upscale ? sw * 4 : sw, Math.max(16, Math.ceil(dispW * 1.05)), maxDim);
    let eh = Math.round((ew * sh) / sw);
    if (L.solid) { ew = Math.max(16, Math.min(Math.ceil(dispW), maxDim)); eh = Math.max(16, Math.min(Math.ceil(dispH), maxDim)); }
    if (eh > maxDim) { eh = maxDim; ew = Math.round((eh * sw) / sh); }
    ew = Math.max(2, ew); eh = Math.max(2, eh);
    const processed = this.processChain(L, srcTex, sw, sh, ew, eh, L.clip, scene, Math.abs(g.fw));
    if (tempSolid) ctx.release(tempSolid);
    const vr = visibleRect(g);
    const M = quadMatrix(this.outW, this.outH, vr.cx * k, vr.cy * k, vr.w * k, vr.h * k, g.rotation);
    ctx.run(this.P('copy', S.FS_COPY), out, { uMatrix: M, uUvRect: vr.uv, uOpacity: 1 }, { uTex: processed.tex }, { blend: 'premult' });
    ctx.release(processed);
    const fr = L.clip.frame;
    if (fr && fr.glow > 0.01) {
      // brillo o sombra exterior (marcos de plantillas de diseño)
      const bl = this.blur(out, Math.max(2, 18 * k * (0.5 + fr.glow)));
      const t = ctx.acquire(this.outW, this.outH);
      ctx.run(this.P('glowunder', S.FS_GLOWUNDER), t, { uColor: hexToRgb(fr.glowColor || '#7c5cff'), uAmount: 0.6 + fr.glow * 1.4 }, { uTex: out.tex, uBlur: bl.tex });
      ctx.release(bl); ctx.release(out);
      return t;
    }
    return out;
  }

  private compositeInto(src: Target, mode: number, opacity: number) {
    const ctx = this.ctx;
    const next = ctx.acquire(this.outW, this.outH);
    ctx.run(this.P('composite', S.FS_COMPOSITE), next, { uMode: mode, uOpacity: opacity }, { uDst: this.main!.tex, uSrc: src.tex });
    ctx.release(this.main!);
    this.main = next;
  }

  private drawBackground(scene: RenderScene) {
    const ctx = this.ctx;
    const bg = scene.background;
    const c1 = hexToRgb(bg.color), c2 = hexToRgb(bg.color2);
    if (bg.type === 'gradient') {
      ctx.run(this.P('solid', S.FS_SOLID), this.main!, { uColor: [...c1, 1], uColor2: [...c2, 1], uAngle: 90, uGradient: 1 }, {});
      return;
    }
    ctx.run(this.P('solid', S.FS_SOLID), this.main!, { uColor: [...c1, 1], uColor2: [...c1, 1], uAngle: 0, uGradient: 0 }, {});
    if (bg.type === 'blur') {
      const base = scene.layers.find((l) => !l.adjustment && !l.solid && l.source && (l.clip.type === 'video' || l.clip.type === 'image'));
      if (!base) return;
      const e = this.sourceTexture(base);
      if (!e) return;
      const sw = Math.max(1, e.w), sh = Math.max(1, e.h);
      const small = ctx.acquire(Math.max(8, Math.round(this.outW / 4)), Math.max(8, Math.round(this.outH / 4)));
      const cover = Math.max(this.outW / sw, this.outH / sh);
      const scaleX = (sw * cover) / this.outW, scaleY = (sh * cover) / this.outH;
      ctx.run(this.P('cover', S.FS_COVER), small, { uScale: [scaleX, scaleY], uDim: 0.15 }, { uTex: e.tex });
      const bl = this.blur(small, ((bg.blur || 40) * 2.5 * this.k) / 4);
      ctx.release(small);
      ctx.run(this.P('copy', S.FS_COPY), this.main!, { uOpacity: 1 }, { uTex: bl.tex });
      ctx.release(bl);
    }
  }

  /** Renderiza una escena a píxeles sin tocar el lienzo visible (miniaturas). Devuelve RGBA (fila 0 = arriba). */
  renderPixels(scene: RenderScene, w: number, h: number): Uint8ClampedArray<ArrayBuffer> {
    const saved = { main: this.main, outW: this.outW, outH: this.outH, k: this.k };
    this.main = null;
    this.render(scene, w, h, false, false);
    const px = this.ctx.readPixels(this.main!);
    this.ctx.release(this.main);
    Object.assign(this, saved);
    return new Uint8ClampedArray(px.buffer as ArrayBuffer);
  }

  /** Renderiza la escena completa al lienzo (outW x outH). */
  render(scene: RenderScene, outW: number, outH: number, present = true, resizeCanvas = true) {
    const ctx = this.ctx;
    if (ctx.lost) return;
    this.frame++;
    outW = Math.max(2, Math.round(outW)); outH = Math.max(2, Math.round(outH));
    const canvas = ctx.canvas as HTMLCanvasElement;
    if (resizeCanvas && (canvas.width !== outW || canvas.height !== outH)) { canvas.width = outW; canvas.height = outH; }
    this.outW = outW; this.outH = outH;
    this.k = outW / scene.width;
    if (this.main) ctx.release(this.main);
    this.main = ctx.acquire(outW, outH);
    this.drawBackground(scene);

    for (const L of scene.layers) {
      if (L.adjustment) {
        let processed = this.processChain(L, this.main.tex, outW, outH, outW, outH, L.clip, scene, scene.width);
        const rg = L.clip.region;
        if (rg) {
          // limitar el ajuste a la zona (movible/redimensionable con el gizmo)
          const g = L.geom;
          const masked = ctx.acquire(outW, outH);
          ctx.run(this.P('outmask', S.FS_OUTMASK), masked, {
            uRes: [outW, outH], uCenter: [g.cx / scene.width, g.cy / scene.height], uSize: [Math.abs(g.fw) / scene.width, Math.abs(g.fh) / scene.height],
            uRot: g.rotation, uFeather: rg.feather, uInvert: rg.invert ? 1 : 0, uShape: ({ rect: 1, ellipse: 2, heart: 4, star: 5 } as Record<string, number>)[rg.shape] || 1, uRadius: rg.radius,
          }, { uTex: processed.tex });
          ctx.release(processed);
          processed = masked;
        }
        this.compositeInto(processed, BLEND_ID[L.clip.blend] ?? 0, L.geom.opacity);
        ctx.release(processed);
        continue;
      }
      let layerT = this.renderLayer(L, scene);
      if (!layerT) continue;
      if (L.transition) {
        const tr = L.transition;
        let fromT: Target | null = tr.from ? this.renderLayer(tr.from, scene) : null;
        if (!fromT) {
          fromT = ctx.acquire(outW, outH);
          ctx.run(this.P('copy', S.FS_COPY), fromT, { uOpacity: 0 }, { uTex: ctx.dummy2D }, { clear: true });
        }
        const mixed = ctx.acquire(outW, outH);
        ctx.run(this.P('transition', S.FS_TRANSITION), mixed, { uP: tr.progress, uType: tr.typeId, uRes: [outW, outH], uTime: scene.time }, { uFrom: fromT.tex, uTo: layerT.tex });
        ctx.release(fromT); ctx.release(layerT);
        layerT = mixed;
      }
      this.compositeInto(layerT, BLEND_ID[L.clip.blend] ?? 0, L.geom.opacity);
      ctx.release(layerT);
    }

    if (present) ctx.run(this.P('present', S.FS_PRESENT), null, {}, { uTex: this.main.tex });
    this.gc();
  }

  /** Lee una versión reducida del fotograma (para scopes). Orientación: fila 0 = arriba. */
  readSmall(w: number, h: number): { data: Uint8Array; w: number; h: number } | null {
    if (!this.main) return null;
    const ctx = this.ctx;
    const t = ctx.acquire(w, h);
    ctx.run(this.P('copy', S.FS_COPY), t, { uOpacity: 1 }, { uTex: this.main.tex });
    const data = ctx.readPixels(t);
    ctx.release(t);
    return { data, w, h };
  }

  private gc() {
    const limit = this.frame - 90;
    for (const [id, e] of this.texCache) if (e.used < limit) { this.ctx.deleteTexture(e.tex); this.texCache.delete(id); }
    for (const [id, e] of this.maskCache) if (e.used < limit) { this.ctx.deleteTexture(e.tex); this.maskCache.delete(id); }
    for (const [id, e] of this.curveCache) if (e.used < limit) { this.ctx.deleteTexture(e.tex); this.curveCache.delete(id); }
    for (const [id, h] of this.history) if (h.used < limit) { for (const f of h.frames) this.ctx.release(f); this.history.delete(id); }
  }

  invalidateLuts() {
    for (const t of this.lutCache.values()) this.ctx.deleteTexture(t);
    this.lutCache.clear();
  }

  dispose() {
    for (const e of this.texCache.values()) this.ctx.deleteTexture(e.tex);
    this.texCache.clear();
    const lose = this.ctx.gl.getExtension('WEBGL_lose_context');
    lose?.loseContext();
  }
}

export { FULLSCREEN };
