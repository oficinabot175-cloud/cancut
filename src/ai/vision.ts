// Visión por computadora en el navegador con MediaPipe Tasks (segmentación, rostros, objetos).
import type { ImageSegmenter, FaceDetector, ObjectDetector, PoseLandmarker } from '@mediapipe/tasks-vision';

// Carga diferida del paquete MediaPipe (reduce el tamaño inicial de la app)
const mp = () => import('@mediapipe/tasks-vision');
import type { TrackBox } from '../types';

const WASM_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0/wasm';
/** Primero intenta los binarios autoalojados (public/vendor), luego el CDN. */
async function wasmBase(): Promise<string> {
  const local = new URL('vendor/mediapipe', document.baseURI).href;
  try {
    const r = await fetch(`${local}/vision_wasm_internal.js`, { method: 'HEAD' });
    if (r.ok && !(r.headers.get('content-type') || '').includes('text/html')) return local;
  } catch { /* usar CDN */ }
  return WASM_CDN;
}
const MODELS = {
  selfie: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite',
  multiclass: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite',
  deeplab: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/deeplab_v3/float32/latest/deeplab_v3.tflite',
  face: 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite',
  object: 'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/latest/efficientdet_lite0.tflite',
  pose: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task',
};

export type SegModel = 'selfie' | 'multiclass' | 'deeplab';

let filesetP: Promise<any> | null = null;
const fileset = () => (filesetP ??= Promise.all([wasmBase(), mp()]).then(([base, m]) => m.FilesetResolver.forVisionTasks(base)));

const segmenters = new Map<string, ImageSegmenter>();
const segLoading = new Map<string, Promise<ImageSegmenter>>();
const segFailed = new Set<string>();
/** Permite reintentar la carga tras un fallo (p. ej. sin conexión). */
export function resetVisionFailures() { segFailed.clear(); }
let faceDet: FaceDetector | null = null;
let faceP: Promise<FaceDetector> | null = null;
let objDet: ObjectDetector | null = null;
let objP: Promise<ObjectDetector> | null = null;
const listeners = new Set<() => void>();
export const onVisionReady = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

async function withDelegate<T>(make: (delegate: 'GPU' | 'CPU') => Promise<T>): Promise<T> {
  try { return await make('GPU'); } catch { return await make('CPU'); }
}

export function loadSegmenter(model: SegModel): Promise<ImageSegmenter> {
  if (segmenters.has(model)) return Promise.resolve(segmenters.get(model)!);
  segFailed.delete(model);
  if (segLoading.has(model)) return segLoading.get(model)!;
  const p = (async () => {
    const fs = await fileset();
    const { ImageSegmenter } = await mp();
    const seg = await withDelegate((delegate) => ImageSegmenter.createFromOptions(fs, {
      baseOptions: { modelAssetPath: MODELS[model], delegate },
      runningMode: 'IMAGE',
      outputConfidenceMasks: true,
      outputCategoryMask: false,
    }));
    segmenters.set(model, seg);
    listeners.forEach((f) => f());
    return seg;
  })();
  segLoading.set(model, p);
  p.catch(() => { segLoading.delete(model); segFailed.add(model); });
  return p;
}

export const segmenterReady = (model: SegModel) => segmenters.has(model);

let work: OffscreenCanvas | HTMLCanvasElement | null = null;
function workCanvas(w: number, h: number) {
  if (!work) work = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : document.createElement('canvas');
  if (work.width !== w || work.height !== h) { work.width = w; work.height = h; }
  return work;
}

function toCanvas(source: TexImageSource, sw: number, sh: number, maxDim: number) {
  const k = Math.min(1, maxDim / Math.max(sw, sh));
  const w = Math.max(16, Math.round(sw * k)), h = Math.max(16, Math.round(sh * k));
  const c = workCanvas(w, h);
  const ctx = c.getContext('2d', { willReadFrequently: false }) as CanvasRenderingContext2D;
  ctx.drawImage(source as CanvasImageSource, 0, 0, w, h);
  return c;
}

/** Segmenta (síncrono). Devuelve máscara de "persona/primer plano" en 0..255. */
export function segmentSync(model: SegModel, source: TexImageSource, sw: number, sh: number): { data: Uint8Array; w: number; h: number } | null {
  const seg = segmenters.get(model);
  if (!seg) { if (!segFailed.has(model) && !segLoading.has(model)) loadSegmenter(model).catch(() => null); return null; }
  const c = toCanvas(source, sw, sh, model === 'deeplab' ? 513 : 384);
  let res: any;
  try { res = seg.segment(c as any); } catch { return null; }
  try {
    const masks = res.confidenceMasks as any[] | undefined;
    if (!masks?.length) return null;
    const w = masks[0].width, h = masks[0].height;
    const out = new Uint8Array(w * h);
    if (masks.length === 1) {
      const f = masks[0].getAsFloat32Array();
      // Heurística de orientación: los bordes suelen ser fondo y el centro el sujeto.
      let edge = 0, ne = 0, center = 0, nc = 0;
      for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
        const v = f[y * w + x];
        const bx = Math.min(x, w - 1 - x) / w, by = Math.min(y, h - 1 - y) / h;
        if (bx < 0.06 || by < 0.06) { edge += v; ne++; }
        else if (bx > 0.3 && by > 0.25) { center += v; nc++; }
      }
      const inv = ne && nc && edge / ne > center / nc + 0.25;
      for (let i = 0; i < f.length; i++) { const v = inv ? 1 - f[i] : f[i]; out[i] = Math.max(0, Math.min(255, v * 255)); }
    } else {
      const bg = masks[0].getAsFloat32Array();
      for (let i = 0; i < bg.length; i++) out[i] = Math.max(0, Math.min(255, (1 - bg[i]) * 255));
    }
    return { data: out, w, h };
  } finally {
    try { res.close?.(); } catch { /* noop */ }
  }
}

export function loadFaceDetector(): Promise<FaceDetector> {
  if (faceDet) return Promise.resolve(faceDet);
  return (faceP ??= (async () => {
    const fs = await fileset();
    const { FaceDetector } = await mp();
    faceDet = await withDelegate((delegate) => FaceDetector.createFromOptions(fs, {
      baseOptions: { modelAssetPath: MODELS.face, delegate },
      runningMode: 'IMAGE',
      minDetectionConfidence: 0.3,
      minSuppressionThreshold: 0.3,
    }));
    return faceDet;
  })().catch((e) => { faceP = null; throw e; }));
}

export function loadObjectDetector(): Promise<ObjectDetector> {
  if (objDet) return Promise.resolve(objDet);
  return (objP ??= (async () => {
    const fs = await fileset();
    const { ObjectDetector } = await mp();
    objDet = await withDelegate((delegate) => ObjectDetector.createFromOptions(fs, {
      baseOptions: { modelAssetPath: MODELS.object, delegate },
      runningMode: 'IMAGE',
      scoreThreshold: 0.35,
      maxResults: 10,
    }));
    return objDet;
  })().catch((e) => { objP = null; throw e; }));
}

/** Detecta rostros; devuelve cajas normalizadas (centro, tamaño). */
export async function detectFaces(source: TexImageSource, sw: number, sh: number): Promise<TrackBox[]> {
  const det = await loadFaceDetector();
  const c = toCanvas(source, sw, sh, 640);
  const r = det.detect(c as any);
  return (r.detections || []).map((d) => {
    const b = d.boundingBox!;
    return { x: (b.originX + b.width / 2) / c.width, y: (b.originY + b.height / 2) / c.height, w: b.width / c.width, h: b.height / c.height, score: d.categories?.[0]?.score };
  });
}

/** Detecta objetos (personas, autos, animales...). */
export async function detectObjects(source: TexImageSource, sw: number, sh: number, category?: string): Promise<(TrackBox & { label: string })[]> {
  const det = await loadObjectDetector();
  const c = toCanvas(source, sw, sh, 640);
  const r = det.detect(c as any);
  return (r.detections || [])
    .map((d) => {
      const b = d.boundingBox!;
      return { x: (b.originX + b.width / 2) / c.width, y: (b.originY + b.height / 2) / c.height, w: b.width / c.width, h: b.height / c.height, score: d.categories?.[0]?.score, label: d.categories?.[0]?.categoryName || '' };
    })
    .filter((d) => !category || d.label === category);
}

let poseDet: PoseLandmarker | null = null;
let poseP: Promise<PoseLandmarker> | null = null;
export function loadPoseLandmarker(): Promise<PoseLandmarker> {
  if (poseDet) return Promise.resolve(poseDet);
  return (poseP ??= (async () => {
    const fs = await fileset();
    const { PoseLandmarker } = await mp();
    poseDet = await withDelegate((delegate) => PoseLandmarker.createFromOptions(fs, {
      baseOptions: { modelAssetPath: MODELS.pose, delegate },
      runningMode: 'IMAGE',
      numPoses: 6,
      minPoseDetectionConfidence: 0.3,
      minPosePresenceConfidence: 0.3,
    }));
    return poseDet;
  })().catch((e) => { poseP = null; throw e; }));
}

/**
 * Cabezas a partir del esqueleto (funciona de perfil, de costado y de espaldas):
 * usa nariz, ojos, orejas y boca; si no son visibles, estima la cabeza desde los hombros.
 */
export async function detectHeads(source: TexImageSource, sw: number, sh: number): Promise<TrackBox[]> {
  const det = await loadPoseLandmarker();
  const c = toCanvas(source, sw, sh, 640);
  const r = det.detect(c as any);
  const ar = c.width / c.height;
  const out: TrackBox[] = [];
  for (const lm of r.landmarks || []) {
    const face = lm.slice(0, 11).filter((p) => (p.visibility ?? 1) > 0.25);
    const ls = lm[11], rs = lm[12];
    const shoulderW = ls && rs ? Math.hypot((ls.x - rs.x) * ar, ls.y - rs.y) : 0;
    let cx: number, cy: number, size: number;
    if (face.length >= 2) {
      const xs = face.map((p) => p.x), ys = face.map((p) => p.y);
      cx = xs.reduce((a, b) => a + b, 0) / xs.length;
      cy = ys.reduce((a, b) => a + b, 0) / ys.length;
      const spread = Math.max((Math.max(...xs) - Math.min(...xs)) * ar, Math.max(...ys) - Math.min(...ys));
      size = Math.max(spread * 2.2, shoulderW * 0.62, 0.04);
      cy -= size * 0.12; // incluir frente y pelo
    } else if (ls && rs && (ls.visibility ?? 1) > 0.3 && (rs.visibility ?? 1) > 0.3) {
      cx = (ls.x + rs.x) / 2;
      size = Math.max(shoulderW * 0.65, 0.04);
      cy = (ls.y + rs.y) / 2 - size * 0.85;
    } else continue;
    // tamaño en coordenadas normalizadas (ancho relativo al ancho, alto al alto)
    out.push({ x: cx, y: cy, w: size / ar, h: size * 1.2, score: 0.6 });
  }
  return out;
}

/** Rostros en mosaico 2×2 (encuentra caras pequeñas en planos abiertos). */
export async function detectFacesTiled(source: TexImageSource, sw: number, sh: number): Promise<TrackBox[]> {
  const det = await loadFaceDetector();
  const full = await detectFaces(source, sw, sh);
  if (Math.max(sw, sh) < 900) return full;
  const out = [...full];
  const tw = sw * 0.6, th = sh * 0.6;
  const tile = workCanvas(640, Math.round((640 * th) / tw));
  const g = tile.getContext('2d') as CanvasRenderingContext2D;
  for (const [ox, oy] of [[0, 0], [sw - tw, 0], [0, sh - th], [sw - tw, sh - th]]) {
    g.drawImage(source as CanvasImageSource, ox, oy, tw, th, 0, 0, tile.width, tile.height);
    const r = det.detect(tile as any);
    for (const d of r.detections || []) {
      const b = d.boundingBox!;
      const x = (ox + ((b.originX + b.width / 2) / tile.width) * tw) / sw;
      const y = (oy + ((b.originY + b.height / 2) / tile.height) * th) / sh;
      out.push({ x, y, w: ((b.width / tile.width) * tw) / sw, h: ((b.height / tile.height) * th) / sh, score: d.categories?.[0]?.score });
    }
  }
  return out;
}
