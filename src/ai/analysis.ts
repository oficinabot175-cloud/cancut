import type { Clip, TrackBox, TrackingData, TrackingSample } from '../types';
import { sampleFrames, timesRange, toGray } from './frames';
import { detectFaces, detectObjects, loadFaceDetector, detectHeads, detectFacesTiled, loadPoseLandmarker } from './vision';
import { uid } from '../core/utils';
import { getState } from '../store/editor';
import { decodeAssetAudio } from '../engine/audioMix';
import TrackerWorker from './tracker.worker.ts?worker';

type Progress = (p: number, label?: string) => void;

class WorkerRPC {
  private w: Worker;
  private n = 0;
  private pending = new Map<number, (v: any) => void>();
  constructor() {
    this.w = new TrackerWorker();
    this.w.onmessage = (e) => { const r = this.pending.get(e.data.id); if (r) { this.pending.delete(e.data.id); r(e.data); } };
  }
  call(msg: any, transfer: Transferable[] = []): Promise<any> {
    const id = ++this.n;
    return new Promise((res, rej) => {
      this.pending.set(id, (d) => (d.error ? rej(new Error(d.error)) : res(d)));
      this.w.postMessage({ ...msg, id }, transfer);
    });
  }
  terminate() { this.w.terminate(); }
}

function clipSourceRange(clip: Clip) {
  return { s: clip.in, e: clip.in + clip.duration * clip.speed };
}

function smoothPath(vals: number[], win: number): number[] {
  const out: number[] = [];
  const h = Math.max(1, Math.floor(win / 2));
  for (let i = 0; i < vals.length; i++) {
    let s = 0, n = 0;
    for (let j = Math.max(0, i - h); j <= Math.min(vals.length - 1, i + h); j++) {
      const w = 1 - Math.abs(j - i) / (h + 1);
      s += vals[j] * w; n += w;
    }
    out.push(s / n);
  }
  return out;
}

/** Seguimiento de objeto: desde la caja inicial hacia adelante y hacia atrás dentro del clip. */
export async function trackObject(clip: Clip, startBox: TrackBox, startSourceT: number, onProgress: Progress, signal?: AbortSignal): Promise<TrackingData> {
  const { s, e } = clipSourceRange(clip);
  const fps = 15;
  const W = 480;
  const samples: TrackingSample[] = [{ t: startSourceT, boxes: [startBox] }];
  const run = async (times: number[], weight: number, base: number) => {
    if (times.length < 2) return;
    const rpc = new WorkerRPC();
    try {
      let i = 0;
      for await (const f of sampleFrames(clip.assetId!, times, W, signal)) {
        if (signal?.aborted) break;
        const g = toGray(f.canvas, f.w, f.h);
        if (i === 0) await rpc.call({ type: 'init', frame: g, box: startBox }, [g.data.buffer]);
        else {
          const r = await rpc.call({ type: 'track', frame: g }, [g.data.buffer]);
          samples.push({ t: f.t, boxes: [{ ...r.box, score: r.score }] });
        }
        i++;
        onProgress(base + (i / times.length) * weight, `Rastreando… ${Math.round(((base + (i / times.length) * weight)) * 100)}%`);
      }
    } finally { rpc.terminate(); }
  };
  const fwd = timesRange(startSourceT, e, fps);
  const back = timesRange(s, startSourceT, fps).reverse();
  const total = fwd.length + back.length || 1;
  await run(fwd, fwd.length / total, 0);
  await run(back, back.length / total, fwd.length / total);
  samples.sort((a, b) => a.t - b.t);
  // suavizado ligero
  const xs = smoothPath(samples.map((x) => x.boxes[0].x), 3), ys = smoothPath(samples.map((x) => x.boxes[0].y), 3);
  const ws = smoothPath(samples.map((x) => x.boxes[0].w), 5), hs = smoothPath(samples.map((x) => x.boxes[0].h), 5);
  samples.forEach((smp, i) => { smp.boxes = [{ x: xs[i], y: ys[i], w: ws[i], h: hs[i] }]; });
  return { id: uid('trk'), name: `Objeto · ${clip.name}`, kind: 'object', assetId: clip.assetId!, samples, createdAt: Date.now() };
}

/** Detección de rostros a lo largo del clip (para difuminar caras o reencuadrar). */
export async function trackFaces(clip: Clip, onProgress: Progress, signal?: AbortSignal, fps = 8): Promise<TrackingData> {
  await loadFaceDetector();
  const { s, e } = clipSourceRange(clip);
  const times = timesRange(s, e, fps);
  const samples: TrackingSample[] = [];
  let i = 0;
  for await (const f of sampleFrames(clip.assetId!, times, 640, signal)) {
    const faces = await detectFaces(f.canvas as any, f.w, f.h);
    faces.sort((a, b) => a.x - b.x);
    samples.push({ t: f.t, boxes: faces });
    onProgress(++i / times.length, `Detectando rostros… ${Math.round((i / times.length) * 100)}%`);
  }
  // rellenar huecos breves (parpadeos de detección)
  for (let k = 1; k < samples.length - 1; k++) {
    if (!samples[k].boxes.length && samples[k - 1].boxes.length && samples[k + 1].boxes.length) samples[k].boxes = samples[k - 1].boxes;
  }
  return { id: uid('trk'), name: `Rostros · ${clip.name}`, kind: 'faces', assetId: clip.assetId!, samples, createdAt: Date.now() };
}

export interface FaceTrackOpts {
  /** también cabezas de perfil / de espaldas (esqueleto) */
  heads: boolean;
  /** segundos que se cubren antes de la primera y después de la última detección */
  pad: number;
  /** fotogramas analizados por segundo */
  fps: number;
}

const iou = (a: TrackBox, b: TrackBox) => {
  const x1 = Math.max(a.x - a.w / 2, b.x - b.w / 2), x2 = Math.min(a.x + a.w / 2, b.x + b.w / 2);
  const y1 = Math.max(a.y - a.h / 2, b.y - b.h / 2), y2 = Math.min(a.y + a.h / 2, b.y + b.h / 2);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  return inter / Math.max(1e-6, a.w * a.h + b.w * b.h - inter);
};
const centerDist = (a: TrackBox, b: TrackBox) => Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1e-3, (a.w + a.h + b.w + b.h) / 4);

/** Fusiona detecciones que se solapan (rostro + cabeza de la misma persona). */
function mergeBoxes(boxes: TrackBox[]): TrackBox[] {
  const out: TrackBox[] = [];
  const sorted = [...boxes].sort((a, b) => b.w * b.h - a.w * a.h);
  for (const b of sorted) {
    const m = out.find((o) => iou(o, b) > 0.15 || centerDist(o, b) < 0.6);
    if (!m) { out.push({ ...b }); continue; }
    // unión de ambas cajas
    const x1 = Math.min(m.x - m.w / 2, b.x - b.w / 2), x2 = Math.max(m.x + m.w / 2, b.x + b.w / 2);
    const y1 = Math.min(m.y - m.h / 2, b.y - b.h / 2), y2 = Math.max(m.y + m.h / 2, b.y + b.h / 2);
    m.x = (x1 + x2) / 2; m.y = (y1 + y2) / 2; m.w = x2 - x1; m.h = y2 - y1;
  }
  return out;
}

/**
 * Seguimiento robusto de rostros/cabezas para difuminar:
 * rostros (también en mosaico para caras pequeñas) + cabezas desde el esqueleto (perfil, costado, espaldas),
 * asociación en pistas, interpolación de huecos, suavizado y margen antes/después de cada aparición.
 */
export async function trackHeads(clip: Clip, onProgress: Progress, signal?: AbortSignal, o: FaceTrackOpts = { heads: true, pad: 1, fps: 10 }): Promise<TrackingData> {
  await loadFaceDetector();
  let poseOk = o.heads;
  if (poseOk) { try { await loadPoseLandmarker(); } catch { poseOk = false; } }
  const { s, e } = clipSourceRange(clip);
  const times = timesRange(s, e, o.fps);
  const frames: { t: number; boxes: TrackBox[] }[] = [];
  let i = 0;
  for await (const f of sampleFrames(clip.assetId!, times, 1280, signal)) {
    let boxes: TrackBox[] = [];
    try { boxes.push(...await detectFacesTiled(f.canvas as any, f.w, f.h)); } catch { /* noop */ }
    if (poseOk) { try { boxes.push(...await detectHeads(f.canvas as any, f.w, f.h)); } catch { /* noop */ } }
    if (!boxes.length) {
      // último recurso: personas detectadas → zona superior (cabeza)
      try {
        const people = await detectObjects(f.canvas as any, f.w, f.h, 'person');
        for (const p of people) { const hw = p.w * 0.42; boxes.push({ x: p.x, y: p.y - p.h / 2 + p.h * 0.11, w: hw, h: Math.min(p.h * 0.24, hw * (f.w / f.h) * 1.25) }); }
      } catch { /* noop */ }
    }
    boxes = mergeBoxes(boxes.filter((b) => b.w > 0.005 && b.h > 0.005));
    frames.push({ t: f.t, boxes });
    onProgress(++i / times.length, `Buscando rostros y cabezas (también de perfil)… ${Math.round((i / times.length) * 100)}%`);
  }
  const samples = buildFaceTracks(frames, o);
  return { id: uid('trk'), name: `Rostros · ${clip.name}`, kind: 'faces', assetId: clip.assetId!, samples, createdAt: Date.now() };
}

/** Post-proceso puro: asociar detecciones en pistas, interpolar, margen y suavizado. */
export function buildFaceTracks(frames: { t: number; boxes: TrackBox[] }[], o: { pad: number; fps: number }): TrackingSample[] {
  type Pt = { t: number; b: TrackBox };
  const tracks: { pts: Pt[]; last: number }[] = [];
  const maxGap = 2.0;
  for (const fr of frames) {
    const used = new Set<number>();
    for (const b of fr.boxes) {
      let best = -1, bestD = 1e9;
      tracks.forEach((tr, k) => {
        if (used.has(k) || fr.t - tr.last > maxGap) return;
        const lb = tr.pts[tr.pts.length - 1].b;
        const d = centerDist(lb, b) - iou(lb, b);
        if (d < bestD && (centerDist(lb, b) < 1.6 + (fr.t - tr.last) * 2)) { bestD = d; best = k; }
      });
      if (best < 0) { tracks.push({ pts: [{ t: fr.t, b }], last: fr.t }); used.add(tracks.length - 1); }
      else { tracks[best].pts.push({ t: fr.t, b }); tracks[best].last = fr.t; used.add(best); }
    }
  }
  // descartar falsos positivos aislados (una sola detección muy pequeña)
  const good = tracks.filter((tr) => tr.pts.length >= 2 || (tr.pts[0].b.w * tr.pts[0].b.h > 0.002));
  // --- muestrear cada pista en todos los tiempos: interpolar huecos, margen antes/después, suavizar
  const step = 1 / o.fps;
  const allT = frames.map((f) => f.t);
  const perTrack = good.map((tr, id) => {
    const pts = tr.pts;
    const t0 = pts[0].t - o.pad, t1 = pts[pts.length - 1].t + o.pad;
    const at = (t: number): TrackBox | null => {
      if (t < t0 - 1e-6 || t > t1 + 1e-6) return null;
      if (t <= pts[0].t) return pts[0].b;
      if (t >= pts[pts.length - 1].t) return pts[pts.length - 1].b;
      let k = 0; while (k < pts.length - 2 && pts[k + 1].t < t) k++;
      const a = pts[k], b = pts[k + 1];
      const u = (t - a.t) / Math.max(1e-6, b.t - a.t);
      return { x: a.b.x + (b.b.x - a.b.x) * u, y: a.b.y + (b.b.y - a.b.y) * u, w: a.b.w + (b.b.w - a.b.w) * u, h: a.b.h + (b.b.h - a.b.h) * u };
    };
    const raw = allT.map((t) => at(t));
    // suavizado (media móvil) + tamaño conservador (máximo local)
    const win = Math.max(1, Math.round(o.fps * 0.25));
    const sm = raw.map((b, k) => {
      if (!b) return null;
      let sx = 0, sy = 0, n = 0, mw = 0, mh = 0;
      for (let j = Math.max(0, k - win); j <= Math.min(raw.length - 1, k + win); j++) {
        const q = raw[j]; if (!q) continue;
        sx += q.x; sy += q.y; n++; mw = Math.max(mw, q.w); mh = Math.max(mh, q.h);
      }
      return { x: sx / n, y: sy / n, w: mw, h: mh, id };
    });
    return sm;
  });
  void step;
  return allT.map((t, k) => ({ t, boxes: perTrack.map((tr) => tr[k]).filter(Boolean) as TrackBox[] }));
}

/** Auto-reencuadre: sigue al sujeto principal (rostro o persona) con un camino de cámara suave. */
export async function autoReframe(clip: Clip, onProgress: Progress, signal?: AbortSignal, smoothness = 0.7): Promise<TrackingData> {
  const { s, e } = clipSourceRange(clip);
  const fps = 6;
  const times = timesRange(s, e, fps);
  const centers: { t: number; x: number; y: number; found: boolean }[] = [];
  let i = 0;
  let last = { x: 0.5, y: 0.45 };
  for await (const f of sampleFrames(clip.assetId!, times, 640, signal)) {
    let faces = await detectFaces(f.canvas as any, f.w, f.h);
    let found = false;
    if (faces.length) {
      faces.sort((a, b) => b.w * b.h - a.w * a.h);
      const fc = faces[0];
      last = { x: fc.x, y: Math.min(0.85, fc.y + fc.h * 0.35) };
      found = true;
    } else {
      try {
        const people = await detectObjects(f.canvas as any, f.w, f.h, 'person');
        if (people.length) {
          people.sort((a, b) => b.w * b.h - a.w * a.h);
          last = { x: people[0].x, y: people[0].y - people[0].h * 0.15 };
          found = true;
        }
      } catch { /* noop */ }
    }
    centers.push({ t: f.t, ...last, found });
    onProgress(++i / times.length, `Analizando encuadre… ${Math.round((i / times.length) * 100)}%`);
    faces = [];
  }
  const win = Math.max(3, Math.round(fps * (0.5 + smoothness * 2.5)));
  const xs = smoothPath(centers.map((c) => c.x), win), ys = smoothPath(centers.map((c) => c.y), win);
  const samples: TrackingSample[] = centers.map((c, k) => ({ t: c.t, boxes: [{ x: xs[k], y: ys[k], w: 0.1, h: 0.1 }] }));
  return { id: uid('trk'), name: `Reencuadre · ${clip.name}`, kind: 'reframe', assetId: clip.assetId!, samples, createdAt: Date.now() };
}

/** Estabilización: estima el movimiento de cámara y calcula la corrección suavizada. */
export async function analyzeStabilization(clip: Clip, onProgress: Progress, signal?: AbortSignal, smoothing = 1.2): Promise<TrackingData> {
  const { s, e } = clipSourceRange(clip);
  const asset = getState().assets[clip.assetId!];
  const fps = Math.min(30, asset?.fps || 30);
  const times = timesRange(s, e, fps);
  const rpc = new WorkerRPC();
  const path: { t: number; x: number; y: number }[] = [];
  let prev: { data: Float32Array; w: number; h: number } | null = null;
  let cx = 0, cy = 0, i = 0;
  try {
    for await (const f of sampleFrames(clip.assetId!, times, 320, signal)) {
      const g = toGray(f.canvas, f.w, f.h);
      if (prev) {
        const r = await rpc.call({ type: 'motion', a: prev, b: g });
        cx += r.dx; cy += r.dy;
      }
      path.push({ t: f.t, x: cx, y: cy });
      prev = g;
      onProgress(++i / times.length, `Analizando movimiento… ${Math.round((i / times.length) * 100)}%`);
    }
  } finally { rpc.terminate(); }
  const win = Math.max(5, Math.round(fps * smoothing));
  const sx = smoothPath(path.map((p) => p.x), win), sy = smoothPath(path.map((p) => p.y), win);
  const samples: TrackingSample[] = path.map((p, k) => ({ t: p.t, boxes: [{ x: sx[k] - p.x, y: sy[k] - p.y, w: 0, h: 0 }] }));
  return { id: uid('trk'), name: `Estabilización · ${clip.name}`, kind: 'motion', assetId: clip.assetId!, samples, createdAt: Date.now() };
}

/** Detección de cortes de escena por diferencia de histogramas. Devuelve tiempos de fuente. */
export async function detectScenes(clip: Clip, sensitivity: number, onProgress: Progress, signal?: AbortSignal): Promise<number[]> {
  const { s, e } = clipSourceRange(clip);
  const fps = 8;
  const times = timesRange(s, e, fps);
  const cuts: number[] = [];
  let prevH: Float32Array | null = null;
  const diffs: { t: number; d: number }[] = [];
  let i = 0;
  for await (const f of sampleFrames(clip.assetId!, times, 96, signal)) {
    const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(64, 36) : Object.assign(document.createElement('canvas'), { width: 64, height: 36 });
    const ctx = c.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
    ctx.drawImage(f.canvas as CanvasImageSource, 0, 0, 64, 36);
    const d = ctx.getImageData(0, 0, 64, 36).data;
    const h = new Float32Array(48);
    for (let k = 0; k < d.length; k += 4) { h[d[k] >> 4]++; h[16 + (d[k + 1] >> 4)]++; h[32 + (d[k + 2] >> 4)]++; }
    for (let k = 0; k < 48; k++) h[k] /= 64 * 36;
    if (prevH) {
      let diff = 0;
      for (let k = 0; k < 48; k++) diff += Math.abs(h[k] - prevH[k]);
      diffs.push({ t: f.t, d: diff / 6 });
    }
    prevH = h;
    onProgress(++i / times.length, `Buscando cortes… ${Math.round((i / times.length) * 100)}%`);
  }
  // umbral adaptativo
  const vals = diffs.map((x) => x.d).sort((a, b) => a - b);
  const median = vals[vals.length >> 1] || 0;
  const thr = Math.max(0.12, median * 3) * (1.6 - sensitivity);
  let lastCut = -1;
  for (let k = 0; k < diffs.length; k++) {
    const dd = diffs[k];
    const isPeak = (k === 0 || dd.d >= diffs[k - 1].d) && (k === diffs.length - 1 || dd.d >= diffs[k + 1].d);
    if (dd.d > thr && isPeak && dd.t - lastCut > 0.6 && dd.t - s > 0.3 && e - dd.t > 0.3) {
      cuts.push(dd.t - 0.5 / fps);
      lastCut = dd.t;
    }
  }
  return cuts;
}

/** Detecta tramos con voz/sonido. Devuelve segmentos a CONSERVAR en tiempo de fuente. */
export async function detectSpeechSegments(clip: Clip, thresholdDb: number, minSilence: number, padding: number): Promise<{ s: number; e: number }[]> {
  const buf = await decodeAssetAudio(clip.assetId!);
  if (!buf) throw new Error('No se pudo decodificar el audio de este clip');
  const { s, e } = clipSourceRange(clip);
  const sr = buf.sampleRate;
  const win = Math.round(sr * 0.02);
  const ch = buf.getChannelData(0);
  const ch2 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : ch;
  const thr = Math.pow(10, thresholdDb / 20);
  const loud: boolean[] = [];
  const start = Math.floor(s * sr), end = Math.min(ch.length, Math.floor(e * sr));
  for (let i = start; i < end; i += win) {
    let sum = 0;
    for (let j = i; j < Math.min(end, i + win); j++) { const v = (ch[j] + ch2[j]) * 0.5; sum += v * v; }
    loud.push(Math.sqrt(sum / win) > thr);
  }
  const segs: { s: number; e: number }[] = [];
  let cur: { s: number; e: number } | null = null;
  loud.forEach((l, k) => {
    const t = s + k * 0.02;
    if (l) { if (!cur) cur = { s: t, e: t + 0.02 }; else cur.e = t + 0.02; }
    else if (cur && t - cur.e > minSilence) { segs.push(cur); cur = null; }
  });
  if (cur) segs.push(cur);
  // padding y fusión
  const out: { s: number; e: number }[] = [];
  for (const g of segs) {
    const a = Math.max(s, g.s - padding), b = Math.min(e, g.e + padding);
    if (out.length && a <= out[out.length - 1].e + 0.05) out[out.length - 1].e = b;
    else if (b - a > 0.08) out.push({ s: a, e: b });
  }
  return out;
}
