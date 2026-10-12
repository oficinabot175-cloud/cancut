import { Input, ALL_FORMATS, BlobSource, CanvasSink } from 'mediabunny';
import { blobs } from '../core/media';
import { getState } from '../store/editor';

export interface SampledFrame { t: number; canvas: HTMLCanvasElement | OffscreenCanvas; w: number; h: number }

/** Recorre fotogramas de un medio en los tiempos dados (decodificación eficiente con WebCodecs; respaldo con <video>). */
export async function* sampleFrames(assetId: string, times: number[], maxW = 640, signal?: AbortSignal): AsyncGenerator<SampledFrame> {
  const blob = blobs.get(assetId);
  const asset = getState().assets[assetId];
  if (!blob || !asset) return;
  let usedMb = false;
  try {
    const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
    const v = await input.getPrimaryVideoTrack();
    if (v && (await v.canDecode())) {
      usedMb = true;
      const w = Math.min(maxW, await v.getDisplayWidth());
      const sink = new CanvasSink(v, { width: w, poolSize: 3 });
      for await (const wc of sink.canvasesAtTimestamps(times)) {
        if (signal?.aborted) break;
        if (!wc) continue;
        yield { t: wc.timestamp, canvas: wc.canvas, w: wc.canvas.width, h: wc.canvas.height };
      }
    }
    input.dispose();
  } catch (e) {
    if (usedMb) throw e;
  }
  if (usedMb) return;
  // Respaldo: buscar con un elemento de video
  const el = document.createElement('video');
  el.muted = true; el.preload = 'auto'; el.src = asset.url;
  await new Promise((r, j) => { el.onloadeddata = r; el.onerror = () => j(new Error('No se pudo leer el video')); });
  const k = Math.min(1, maxW / el.videoWidth);
  const c = document.createElement('canvas');
  c.width = Math.round(el.videoWidth * k); c.height = Math.round(el.videoHeight * k);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  for (const t of times) {
    if (signal?.aborted) break;
    await new Promise<void>((r) => { const to = setTimeout(r, 3000); el.onseeked = () => { clearTimeout(to); r(); }; el.currentTime = Math.min(t, el.duration - 0.01); });
    ctx.drawImage(el, 0, 0, c.width, c.height);
    yield { t, canvas: c, w: c.width, h: c.height };
  }
  el.removeAttribute('src'); el.load();
}

/** Convierte un canvas a escala de grises (Float32 0..1). */
export function toGray(canvas: HTMLCanvasElement | OffscreenCanvas, w?: number, h?: number): { data: Float32Array; w: number; h: number } {
  const W = w || canvas.width, H = h || canvas.height;
  const tmp = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(W, H) : Object.assign(document.createElement('canvas'), { width: W, height: H });
  const ctx = tmp.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
  ctx.drawImage(canvas as CanvasImageSource, 0, 0, W, H);
  const d = ctx.getImageData(0, 0, W, H).data;
  const out = new Float32Array(W * H);
  for (let i = 0, j = 0; i < out.length; i++, j += 4) out[i] = (d[j] * 0.299 + d[j + 1] * 0.587 + d[j + 2] * 0.114) / 255;
  return { data: out, w: W, h: H };
}

export function timesRange(start: number, end: number, fps: number): number[] {
  const out: number[] = [];
  const n = Math.max(1, Math.floor((end - start) * fps));
  for (let i = 0; i <= n; i++) out.push(Math.min(end - 0.001, start + i / fps));
  return out;
}
