import type { Clip, TrackBox, TrackingData, TrackingSample } from '../types';
import { sampleFrames, timesRange, toGray } from './frames';
import { detectFaces, detectObjects, loadFaceDetector } from './vision';
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
