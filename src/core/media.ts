import { Input, ALL_FORMATS, BlobSource, CanvasSink } from 'mediabunny';
import type { MediaAsset, MediaKind } from '../types';
import { uid } from './utils';

/** Blobs originales de cada medio (para exportar, analizar y guardar). */
export const blobs = new Map<string, Blob>();
/** Fuentes de imagen decodificadas (ImageBitmap / HTMLImageElement). */
const images = new Map<string, { source: TexImageSource; w: number; h: number }>();

const VIDEO_EXT = ['mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi', 'wmv', 'flv', '3gp', '3g2', 'mpg', 'mpeg', 'ts', 'mts', 'm2ts', 'ogv', 'hevc', 'h264', 'vob', 'f4v', 'asf', 'divx', 'mxf', 'qt'];
const AUDIO_EXT = ['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac', 'opus', 'wma', 'aiff', 'aif', 'amr', 'weba', 'caf', 'ac3', 'mka'];
const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'avif', 'heic', 'heif', 'tif', 'tiff', 'ico', 'jfif'];

export const ACCEPT_MEDIA = [
  'video/*', 'audio/*', 'image/*',
  ...[...VIDEO_EXT, ...AUDIO_EXT, ...IMAGE_EXT, 'srt', 'vtt', 'cube', 'ttf', 'otf', 'woff', 'woff2', 'novacut', 'json'].map((e) => '.' + e),
].join(',');

export const ext = (name: string) => (name.split('.').pop() || '').toLowerCase();

export type FileCategory = MediaKind | 'subtitle' | 'lut' | 'font' | 'project' | 'unknown';

export function classify(file: File): FileCategory {
  const e = ext(file.name);
  if (['srt', 'vtt'].includes(e)) return 'subtitle';
  if (e === 'cube') return 'lut';
  if (['ttf', 'otf', 'woff', 'woff2'].includes(e)) return 'font';
  if (['novacut', 'json'].includes(e)) return 'project';
  if (file.type.startsWith('video/') || VIDEO_EXT.includes(e)) return 'video';
  if (file.type.startsWith('audio/') || AUDIO_EXT.includes(e)) return 'audio';
  if (file.type.startsWith('image/') || IMAGE_EXT.includes(e)) return 'image';
  return 'unknown';
}

function withTimeout<T>(p: Promise<T>, ms: number, msg = 'Tiempo agotado'): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(msg)), ms))]);
}

function probeElement(url: string, kind: 'video' | 'audio'): Promise<{ duration: number; width: number; height: number }> {
  return withTimeout(new Promise((resolve, reject) => {
    const el = document.createElement(kind);
    el.preload = 'metadata';
    el.muted = true;
    el.onloadedmetadata = () => {
      const finish = () => resolve({ duration: el.duration, width: (el as HTMLVideoElement).videoWidth || 0, height: (el as HTMLVideoElement).videoHeight || 0 });
      if (!isFinite(el.duration)) {
        // algunos webm no traen duración: forzar cálculo
        el.currentTime = 1e9;
        el.ontimeupdate = () => { el.ontimeupdate = null; const d = el.duration; el.currentTime = 0; resolve({ duration: isFinite(d) ? d : 0, width: (el as HTMLVideoElement).videoWidth || 0, height: (el as HTMLVideoElement).videoHeight || 0 }); };
      } else finish();
    };
    el.onerror = () => reject(new Error('El navegador no puede reproducir este formato'));
    el.src = url;
  }), 20000);
}

async function probeWithMediabunny(blob: Blob) {
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  try {
    const v = await input.getPrimaryVideoTrack();
    const a = await input.getPrimaryAudioTrack();
    let fps = 30;
    let width = 0, height = 0;
    if (v) {
      width = await v.getDisplayWidth();
      height = await v.getDisplayHeight();
      try {
        const m: any = await (v as any).computeFrameRateMetrics?.();
        const r = m?.averageFrameRate ?? m?.frameRate ?? m?.mostCommonFrameRate;
        if (r && isFinite(r)) fps = Math.round(r * 100) / 100;
      } catch { /* noop */ }
      if (fps === 30) {
        try {
          const st: any = await (v as any).computePacketStats?.(120);
          if (st?.averagePacketRate) fps = Math.round(st.averagePacketRate * 100) / 100;
        } catch { /* noop */ }
      }
    }
    const duration = await input.computeDuration();
    let canDecodeVideo = false;
    try { canDecodeVideo = v ? await v.canDecode() : false; } catch { /* noop */ }
    return { hasVideo: !!v, hasAudio: !!a, fps, width, height, duration, canDecodeVideo };
  } finally {
    try { input.dispose(); } catch { /* noop */ }
  }
}

async function thumbsWithMediabunny(blob: Blob, duration: number, count: number): Promise<string[]> {
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  try {
    const v = await input.getPrimaryVideoTrack();
    if (!v || !(await v.canDecode())) return [];
    const sink = new CanvasSink(v, { width: 192, fit: 'contain' });
    const times = Array.from({ length: count }, (_, i) => Math.min(duration - 0.05, (i + 0.5) * (duration / count)));
    const out: string[] = [];
    for await (const wc of sink.canvasesAtTimestamps(times)) {
      if (!wc) { out.push(out[out.length - 1] || ''); continue; }
      out.push(await canvasToDataURL(wc.canvas));
    }
    return out;
  } catch {
    return [];
  } finally {
    try { input.dispose(); } catch { /* noop */ }
  }
}

async function canvasToDataURL(c: HTMLCanvasElement | OffscreenCanvas): Promise<string> {
  if ('convertToBlob' in c) {
    const b = await (c as OffscreenCanvas).convertToBlob({ type: 'image/jpeg', quality: 0.7 });
    return await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result as string); fr.readAsDataURL(b); });
  }
  return (c as HTMLCanvasElement).toDataURL('image/jpeg', 0.7);
}

async function thumbsWithElement(url: string, duration: number, count: number): Promise<string[]> {
  const v = document.createElement('video');
  v.muted = true; v.preload = 'auto'; v.src = url;
  await withTimeout(new Promise((r, j) => { v.onloadeddata = r; v.onerror = j; }), 15000);
  const c = document.createElement('canvas');
  const out: string[] = [];
  const W = 192, H = Math.round((192 * (v.videoHeight || 108)) / (v.videoWidth || 192));
  c.width = W; c.height = H;
  const ctx = c.getContext('2d')!;
  for (let i = 0; i < count; i++) {
    const t = Math.min(duration - 0.05, (i + 0.5) * (duration / count));
    await withTimeout(new Promise((r) => { v.onseeked = r; v.currentTime = Math.max(0, t); }), 5000).catch(() => null);
    ctx.drawImage(v, 0, 0, W, H);
    out.push(c.toDataURL('image/jpeg', 0.7));
  }
  v.removeAttribute('src'); v.load();
  return out;
}

/** Calcula picos de la forma de onda (50 por segundo). */
export async function computeWaveform(blob: Blob): Promise<number[] | undefined> {
  if (blob.size > 1.2e9) return undefined;
  try {
    const AC = window.OfflineAudioContext || (window as any).webkitOfflineAudioContext;
    const ac = new AC(1, 1, 44100);
    const buf = await ac.decodeAudioData(await blob.arrayBuffer());
    const rate = 50;
    const n = Math.ceil(buf.duration * rate);
    const peaks = new Array(n).fill(0);
    const chans = Math.min(2, buf.numberOfChannels);
    const block = buf.sampleRate / rate;
    for (let c = 0; c < chans; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < n; i++) {
        let m = 0;
        const s = Math.floor(i * block), e = Math.min(d.length, Math.floor((i + 1) * block));
        for (let j = s; j < e; j += 4) { const v = Math.abs(d[j]); if (v > m) m = v; }
        if (m > peaks[i]) peaks[i] = m;
      }
    }
    const max = Math.max(0.01, ...peaks.slice(0, 200000));
    return peaks.map((p) => Math.round((p / max) * 1000) / 1000);
  } catch {
    return undefined;
  }
}

async function loadImage(blob: Blob, url: string): Promise<{ source: TexImageSource; w: number; h: number }> {
  try {
    const bmp = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' } as any);
    return { source: bmp, w: bmp.width, h: bmp.height };
  } catch {
    const img = new Image();
    img.src = url;
    await withTimeout(img.decode(), 15000, 'No se pudo decodificar la imagen');
    let w = img.naturalWidth || 1024, h = img.naturalHeight || 1024;
    // SVG sin tamaño: rasterizar a 2048px
    const c = document.createElement('canvas');
    const k = Math.max(1, 2048 / Math.max(w, h));
    if (blob.type.includes('svg')) { w = Math.round(w * k); h = Math.round(h * k); }
    c.width = w; c.height = h;
    c.getContext('2d')!.drawImage(img, 0, 0, w, h);
    return { source: c, w, h };
  }
}

export function getImage(assetId: string) { return images.get(assetId) || null; }

export async function ensureImageLoaded(asset: MediaAsset) {
  if (asset.kind !== 'image' || images.has(asset.id)) return;
  const blob = blobs.get(asset.id);
  if (!blob) return;
  images.set(asset.id, await loadImage(blob, asset.url));
}

export function registerImageSource(assetId: string, src: { source: TexImageSource; w: number; h: number }) {
  images.set(assetId, src);
}

/** Crea un MediaAsset a partir de un archivo (sondeo completo). */
export async function createAsset(file: Blob & { name?: string }, kind: MediaKind, existingId?: string, onUpdate?: (patch: Partial<MediaAsset>) => void): Promise<MediaAsset> {
  const id = existingId || uid('asset');
  const name = (file as File).name || `${kind}-${id}`;
  const url = URL.createObjectURL(file);
  blobs.set(id, file);
  const asset: MediaAsset = {
    id, name, kind, mime: file.type || '', size: file.size, duration: 0, width: 0, height: 0, fps: 30,
    hasAudio: kind === 'audio', url, status: 'processing', createdAt: Date.now(),
  };
  if (kind === 'image') {
    const img = await loadImage(file, url);
    images.set(id, img);
    asset.width = img.w; asset.height = img.h;
    const c = document.createElement('canvas');
    const k = 192 / Math.max(img.w, img.h);
    c.width = Math.max(1, Math.round(img.w * k)); c.height = Math.max(1, Math.round(img.h * k));
    c.getContext('2d')!.drawImage(img.source as CanvasImageSource, 0, 0, c.width, c.height);
    asset.thumbnail = c.toDataURL('image/jpeg', 0.75);
    asset.status = 'ready';
    return asset;
  }
  // Video / audio
  let elementOk = true;
  try {
    const m = await probeElement(url, kind === 'video' ? 'video' : 'audio');
    asset.duration = m.duration; asset.width = m.width; asset.height = m.height;
    if (kind === 'video' && (!m.width || !m.height)) elementOk = false;
  } catch {
    elementOk = false;
  }
  try {
    const mb = await probeWithMediabunny(file);
    if (!asset.duration && mb.duration) asset.duration = mb.duration;
    if (!asset.width && mb.width) { asset.width = mb.width; asset.height = mb.height; }
    asset.hasAudio = mb.hasAudio;
    asset.fps = mb.fps || 30;
    if (kind === 'video' && !mb.hasVideo && mb.hasAudio) asset.kind = 'audio';
  } catch {
    if (kind === 'video') asset.hasAudio = true; // suponer audio si no se pudo sondear
  }
  if (!elementOk && asset.kind === 'video') {
    asset.status = 'unsupported';
    asset.error = 'Formato o códec no soportado por el navegador. Puedes convertirlo a MP4 con FFmpeg.';
    return asset;
  }
  if (!elementOk && asset.kind === 'audio' && !asset.duration) {
    asset.status = 'unsupported';
    asset.error = 'Formato de audio no soportado. Conviértelo con FFmpeg.';
    return asset;
  }
  asset.status = 'ready';
  // Trabajo en segundo plano: miniaturas y forma de onda
  (async () => {
    if (asset.kind === 'video') {
      const count = Math.max(6, Math.min(40, Math.ceil(asset.duration / 2)));
      let thumbs = await thumbsWithMediabunny(file, asset.duration, count);
      if (!thumbs.length) thumbs = await thumbsWithElement(url, asset.duration, Math.min(count, 16)).catch(() => []);
      if (thumbs.length) onUpdate?.({ filmstrip: thumbs, thumbnail: thumbs[Math.floor(thumbs.length / 3)] || thumbs[0] });
    }
    if (asset.hasAudio || asset.kind === 'audio') {
      const wf = await computeWaveform(file);
      if (wf) onUpdate?.({ waveform: wf });
    }
  })();
  return asset;
}

export function revokeAsset(a: MediaAsset) {
  try { URL.revokeObjectURL(a.url); } catch { /* noop */ }
  blobs.delete(a.id);
  images.delete(a.id);
}
