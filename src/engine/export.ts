import {
  Output, BufferTarget, Mp4OutputFormat, WebMOutputFormat, MovOutputFormat, MkvOutputFormat, OggOutputFormat,
  CanvasSource, AudioBufferSource, Quality, StreamTarget, getFirstEncodableVideoCodec, canEncodeAudio,
  Input, ALL_FORMATS, BlobSource, VideoSampleSink, VideoSample, VideoCodec, AudioCodec,
} from 'mediabunny';
import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import type { Clip, MediaAsset, Project } from '../types';
import { Compositor, SegMask, makeRenderCanvas, canvasToBlob } from '../render/compositor';
import { buildScene, FrameProvider, FrameSource } from '../render/scene';
import { blobs, getImage } from '../core/media';
import { sourceTimeOf } from '../core/geometry';
import { clearAudioCache, encodeWav, mixAudio } from './audioMix';
import { captureFrame } from './preview';
import { loadSegmenter, segmentSync, SegModel } from '../ai/vision';
import { ensureFontsReady } from '../core/fonts';
import { ffmpegConvert, FFMPEG_TARGETS } from './ffmpeg';
import { clearRasterCache, maskEffect, segKey } from '../render/scene';

export type ExportFormat = 'mp4' | 'webm' | 'mov' | 'mkv' | 'gif' | 'wav' | 'm4a' | 'ogg' | 'png' | keyof typeof FFMPEG_TARGETS;

export interface ExportOptions {
  format: ExportFormat;
  videoCodec?: VideoCodec | 'auto';
  width: number;
  height: number;
  fps: number;
  quality: 'very-high' | 'high' | 'medium' | 'low' | 'custom';
  bitrate?: number; // Mbps (custom)
  start: number;
  end: number;
  includeAudio: boolean;
  audioBitrate?: number; // kbps
  gifColors?: number;
  onProgress?: (p: number, info: string) => void;
  signal?: AbortSignal;
  /** escribir directamente a disco (File System Access API): recomendado en 4K/8K */
  fileHandle?: any;
}

export interface ExportResult { blob: Blob; filename: string; codec: string; seconds: number }

const VIDEO_CODECS: Record<string, VideoCodec[]> = {
  mp4: ['avc', 'hevc', 'av1', 'vp9'],
  mov: ['avc', 'hevc', 'prores' as VideoCodec, 'vp9'],
  webm: ['vp9', 'av1', 'vp8'],
  mkv: ['avc', 'hevc', 'vp9', 'av1', 'vp8'],
};
const AUDIO_CODECS: Record<string, AudioCodec[]> = {
  mp4: ['aac', 'opus'], mov: ['aac', 'opus'], webm: ['opus', 'vorbis'], mkv: ['aac', 'opus', 'vorbis'], m4a: ['aac', 'opus'], ogg: ['opus', 'vorbis'],
};

function quality(o: ExportOptions): Quality {
  if (o.quality === 'custom' && o.bitrate) return new Quality({ bitrate: Math.round(o.bitrate * 1e6) });
  return new Quality((o.quality === 'custom' ? 'high' : o.quality) as any);
}

/**
 * Elige un códec de audio y un bitrate que el navegador pueda codificar de verdad.
 * (El codificador AAC de Windows, por ejemplo, solo acepta 96/128/160/192 kbps: 320 kbps falla.)
 */
async function pickAudioEncoder(codecs: AudioCodec[], preferredKbps: number): Promise<{ codec: AudioCodec; kbps: number } | null> {
  const rates = [...new Set([preferredKbps, 320, 256, 192, 160, 128, 96, 64].filter((r) => r <= preferredKbps))];
  for (const codec of codecs) {
    for (const kbps of rates) {
      for (const sampleRate of [48000, 44100]) {
        try {
          if (await canEncodeAudio(codec, { numberOfChannels: 2, sampleRate, bitrate: kbps * 1000 })) return { codec, kbps };
        } catch { /* probar el siguiente */ }
      }
    }
  }
  return null;
}

class Aborted extends Error { constructor() { super('Exportación cancelada'); } }

/** Proveedor de fotogramas para exportación: decodificación exacta por clip con WebCodecs. */
class ExportProvider implements FrameProvider {
  private decoders = new Map<string, { input: Input; iter: AsyncGenerator<VideoSample | null>; times: number[]; idx: number; last: VideoSample | null }>();
  private fallbackEls = new Map<string, HTMLVideoElement>();
  current = new Map<string, FrameSource>();
  tails = new Map<string, FrameSource>();
  private segPrev = new Map<string, { acc: Float32Array; w: number; h: number; t: number }>();
  private segVersion = 0;

  constructor(private project: Project, private assets: Record<string, MediaAsset>, private frameTimes: number[]) {}

  /** Tiempos de fuente que necesita cada clip (en orden) para el decodificador. */
  private timesFor(clip: Clip): number[] {
    const out: number[] = [];
    for (const t of this.frameTimes) if (t >= clip.start - 1e-6 && t < clip.start + clip.duration - 1e-6) out.push(sourceTimeOf(clip, t));
    return out;
  }

  private async decoderFor(clip: Clip) {
    let d = this.decoders.get(clip.id);
    if (d) return d;
    const blob = blobs.get(clip.assetId!);
    if (!blob) return null;
    try {
      const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
      const track = await input.getPrimaryVideoTrack();
      if (!track || !(await track.canDecode())) { input.dispose(); return null; }
      const sink = new VideoSampleSink(track);
      const times = this.timesFor(clip);
      d = { input, iter: sink.samplesAtTimestamps(times), times, idx: 0, last: null };
      this.decoders.set(clip.id, d);
      return d;
    } catch {
      return null;
    }
  }

  private async fallbackFrame(clip: Clip, ts: number): Promise<FrameSource | null> {
    let el = this.fallbackEls.get(clip.id);
    const a = this.assets[clip.assetId!];
    if (!el) {
      el = document.createElement('video');
      el.muted = true; el.preload = 'auto'; el.src = a.url;
      await new Promise((r) => { el!.onloadeddata = r; el!.onerror = r; });
      this.fallbackEls.set(clip.id, el);
    }
    await new Promise<void>((r) => {
      const to = setTimeout(r, 3000);
      el!.onseeked = () => { clearTimeout(to); r(); };
      el!.currentTime = Math.min(ts, Math.max(0, (el!.duration || ts) - 0.001));
    });
    return { source: el, w: el.videoWidth, h: el.videoHeight, key: null };
  }

  /** Prepara los fotogramas de todos los clips de video activos en t. */
  async prepare(t: number) {
    this.current.clear();
    const visible = new Set(this.project.tracks.filter((tr) => tr.kind === 'visual' && !tr.hidden).map((tr) => tr.id));
    for (const clip of this.project.clips) {
      if (clip.type !== 'video' || !visible.has(clip.trackId)) continue;
      if (t < clip.start - 1e-6 || t >= clip.start + clip.duration - 1e-6) continue;
      const ts = sourceTimeOf(clip, t);
      const d = await this.decoderFor(clip);
      if (d) {
        const r = await d.iter.next();
        d.idx++;
        const sample = r.done ? null : r.value;
        if (sample) {
          d.last?.close();
          d.last = sample;
        }
        const s = d.last;
        if (s) {
          const src = s.toCanvasImageSource() as TexImageSource;
          this.current.set(clip.id, { source: src, w: s.displayWidth, h: s.displayHeight, key: null });
          continue;
        }
      }
      const fb = await this.fallbackFrame(clip, ts);
      if (fb) this.current.set(clip.id, fb);
    }
  }

  async prepareTails() {
    for (const clip of this.project.clips) {
      if (!clip.transitionIn || clip.transitionIn.type === 'none') continue;
      const prev = this.project.clips.find((c) => c.trackId === clip.trackId && c.id !== clip.id && Math.abs(c.start + c.duration - clip.start) < 0.05);
      if (!prev || prev.type !== 'video') continue;
      const c = await captureFrame(prev.assetId!, sourceTimeOf(prev, prev.start + prev.duration - 0.02), 3840);
      if (c) this.tails.set(prev.id, { source: c as TexImageSource, w: c.width, h: c.height, key: 'tail' });
    }
  }

  videoFrame(clip: Clip): FrameSource | null { return this.current.get(clip.id) || null; }
  image(assetId: string): FrameSource | null { const i = getImage(assetId); return i ? { source: i.source, w: i.w, h: i.h, key: assetId } : null; }
  tailFrame(clip: Clip): FrameSource | null { return this.tails.get(clip.id) || null; }
  segMask(clip: Clip, src: FrameSource, sourceT: number, model: string, smooth: number): SegMask | null {
    const m = segmentSync(model as SegModel, src.source, src.w, src.h);
    if (!m) return null;
    const skey = segKey(clip);
    const prev = this.segPrev.get(skey);
    let data = m.data;
    if (prev && prev.w === m.w && prev.h === m.h && Math.abs(sourceT - prev.t) < 0.25 && smooth > 0) {
      data = new Uint8Array(m.data.length);
      for (let i = 0; i < data.length; i++) { prev.acc[i] = prev.acc[i] * smooth + m.data[i] * (1 - smooth); data[i] = prev.acc[i]; }
      prev.t = sourceT;
    } else this.segPrev.set(skey, { acc: Float32Array.from(m.data), w: m.w, h: m.h, t: sourceT });
    return { data, w: m.w, h: m.h, version: ++this.segVersion };
  }

  dispose() {
    for (const d of this.decoders.values()) { try { d.last?.close(); d.iter.return(undefined as any); d.input.dispose(); } catch { /* noop */ } }
    for (const el of this.fallbackEls.values()) { el.removeAttribute('src'); el.load(); }
    this.decoders.clear();
  }
}

async function preloadModels(project: Project) {
  const models = new Set<string>();
  for (const c of project.clips) { const e = maskEffect(c); if (e) models.add(String(e.params.model || 'selfie')); }
  for (const m of models) await loadSegmenter(m as SegModel);
  const fonts = project.clips.filter((c) => c.text).map((c) => c.text!.font);
  await ensureFontsReady([...new Set(fonts)]);
}

function frameTimesFor(start: number, end: number, fps: number) {
  const n = Math.max(1, Math.round((end - start) * fps));
  return Array.from({ length: n }, (_, i) => start + i / fps);
}

const nameFor = (project: Project, extn: string) => `${project.name.replace(/[\\/:*?"<>|]+/g, '_') || 'video'}.${extn}`;

export async function exportProject(project: Project, assets: Record<string, MediaAsset>, o: ExportOptions): Promise<ExportResult> {
  const t0 = performance.now();
  const check = () => { if (o.signal?.aborted) throw new Aborted(); };
  const progress = (p: number, info: string) => o.onProgress?.(Math.max(0, Math.min(1, p)), info);
  clearRasterCache();

  // ---------------- Solo audio
  if (o.format === 'wav' || o.format === 'm4a' || o.format === 'ogg' || o.format === 'mp3' || o.format === 'flac') {
    progress(0.05, 'Mezclando audio…');
    const buf = await mixAudio(project, assets, o.start, o.end, 48000, 2, undefined, (p) => progress(0.05 + p * 0.5, 'Decodificando audio…'));
    check();
    if (!buf) throw new Error('El proyecto no tiene audio para exportar.');
    const wav = encodeWav(buf);
    if (o.format === 'wav') return { blob: wav, filename: nameFor(project, 'wav'), codec: 'PCM 16-bit', seconds: (performance.now() - t0) / 1000 };
    if (o.format === 'mp3' || o.format === 'flac') {
      const tgt = FFMPEG_TARGETS[o.format];
      progress(0.6, 'Codificando con FFmpeg…');
      const blob = await ffmpegConvert({ input: wav, inputName: 'audio.wav', outputName: 'out.' + tgt.ext, args: tgt.args, mime: tgt.mime, onProgress: (p) => progress(0.6 + p * 0.4, 'Codificando con FFmpeg…') });
      return { blob, filename: nameFor(project, tgt.ext), codec: tgt.label, seconds: (performance.now() - t0) / 1000 };
    }
    const pick = await pickAudioEncoder(AUDIO_CODECS[o.format], o.audioBitrate || 256);
    if (!pick) throw new Error('Tu navegador no puede codificar este formato de audio. Prueba WAV, MP3 u OGG.');
    const codec = pick.codec;
    const output = new Output({ format: o.format === 'm4a' ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new OggOutputFormat(), target: new BufferTarget() });
    const src = new AudioBufferSource({ codec, quality: new Quality({ bitrate: pick.kbps * 1000 }) });
    output.addAudioTrack(src);
    await output.start();
    await src.add(buf);
    await output.finalize();
    const mime = await output.getMimeType();
    return { blob: new Blob([output.target.buffer!], { type: mime }), filename: nameFor(project, o.format), codec, seconds: (performance.now() - t0) / 1000 };
  }

  progress(0, 'Preparando modelos y fuentes…');
  await preloadModels(project);
  check();

  // ---------------- Fotograma PNG
  if (o.format === 'png') {
    const canvas = makeRenderCanvas(o.width, o.height);
    const comp = new Compositor(canvas);
    const prov = new ExportProvider(project, assets, [o.start]);
    await prov.prepareTails();
    await prov.prepare(o.start);
    comp.render(buildScene(project, assets, o.start, prov, { quality: o.width / project.width }), o.width, o.height);
    const blob = await canvasToBlob(canvas, 'image/png');
    prov.dispose(); comp.dispose();
    return { blob, filename: nameFor(project, 'png'), codec: 'PNG', seconds: (performance.now() - t0) / 1000 };
  }

  const fps = o.format === 'gif' ? Math.min(o.fps, 30) : o.fps;
  const times = frameTimesFor(o.start, o.end, fps);
  const canvas = makeRenderCanvas(o.width, o.height);
  const comp = new Compositor(canvas);
  const prov = new ExportProvider(project, assets, times);
  progress(0.01, 'Preparando transiciones…');
  await prov.prepareTails();
  const quality01 = o.width / project.width;
  let onFail: (() => Promise<void>) | null = null;

  try {
    // ---------------- GIF
    if (o.format === 'gif') {
      const gif = GIFEncoder();
      const c2 = document.createElement('canvas');
      c2.width = o.width; c2.height = o.height;
      const ctx2 = c2.getContext('2d', { willReadFrequently: true })!;
      let palette: number[][] | null = null;
      for (let i = 0; i < times.length; i++) {
        check();
        await prov.prepare(times[i]);
        comp.render(buildScene(project, assets, times[i], prov, { quality: quality01 }), o.width, o.height);
        ctx2.drawImage(canvas as CanvasImageSource, 0, 0);
        const { data } = ctx2.getImageData(0, 0, o.width, o.height);
        if (!palette || i % 30 === 0) palette = quantize(data, o.gifColors || 256);
        const index = applyPalette(data, palette);
        gif.writeFrame(index, o.width, o.height, { palette, delay: Math.round(1000 / fps) });
        progress((i + 1) / times.length, `Fotograma ${i + 1} de ${times.length}`);
        if (i % 4 === 0) await new Promise((r) => setTimeout(r, 0));
      }
      gif.finish();
      return { blob: new Blob([gif.bytes() as BlobPart], { type: 'image/gif' }), filename: nameFor(project, 'gif'), codec: 'GIF', seconds: (performance.now() - t0) / 1000 };
    }

    // ---------------- Video (mediabunny + WebCodecs)
    const isFF = o.format in FFMPEG_TARGETS;
    const container = isFF ? 'mp4' : (o.format as 'mp4' | 'webm' | 'mov' | 'mkv');
    const candidates = o.videoCodec && o.videoCodec !== 'auto' ? [o.videoCodec, ...VIDEO_CODECS[container]] : VIDEO_CODECS[container];
    const q = quality(o);
    const vcodec = await getFirstEncodableVideoCodec(candidates as VideoCodec[], { width: o.width, height: o.height, quality: q, frameRate: fps });
    if (!vcodec) throw new Error(`Tu navegador no puede codificar video ${container.toUpperCase()} a ${o.width}×${o.height}. Prueba otra resolución o formato (WebM suele funcionar en todos).`);
    const stream = !isFF && o.fileHandle ? await o.fileHandle.createWritable() : null;
    const format = container === 'mp4' ? new Mp4OutputFormat({ fastStart: stream ? false : 'in-memory' })
      : container === 'mov' ? new MovOutputFormat({ fastStart: stream ? false : 'in-memory' })
      : container === 'webm' ? new WebMOutputFormat() : new MkvOutputFormat();
    const output = new Output({ format, target: stream ? new StreamTarget(stream, { chunked: true }) : new BufferTarget() });
    onFail = async () => { try { await output.cancel(); } catch { /* noop */ } try { await stream?.abort?.(); } catch { /* noop */ } };
    const videoSource = new CanvasSource(canvas, { codec: vcodec, quality: q, keyFrameInterval: 2 });
    output.addVideoTrack(videoSource, { frameRate: fps });

    let audioBuf: AudioBuffer | null = null;
    let audioSource: AudioBufferSource | null = null;
    if (o.includeAudio) {
      progress(0.02, 'Mezclando audio…');
      audioBuf = await mixAudio(project, assets, o.start, o.end, 48000, 2);
      if (audioBuf) {
        const pick = await pickAudioEncoder(AUDIO_CODECS[container], o.audioBitrate || 320);
        if (!pick) console.warn('[export] ningún códec de audio disponible: se exporta sin audio');
        if (pick) {
          audioSource = new AudioBufferSource({ codec: pick.codec, quality: new Quality({ bitrate: pick.kbps * 1000 }) });
          output.addAudioTrack(audioSource);
        }
      }
    }
    output.setMetadataTags({ title: project.name, comment: 'Creado con NovaCut Studio' } as any);
    await output.start();
    if (audioSource && audioBuf) await audioSource.add(audioBuf);

    const tStart = performance.now();
    for (let i = 0; i < times.length; i++) {
      check();
      await prov.prepare(times[i]);
      comp.render(buildScene(project, assets, times[i], prov, { quality: quality01 }), o.width, o.height);
      await videoSource.add(i / fps, 1 / fps);
      const el = (performance.now() - tStart) / 1000;
      const eta = el / (i + 1) * (times.length - i - 1);
      progress(0.03 + 0.95 * ((i + 1) / times.length) * (isFF ? 0.6 : 1), `Fotograma ${i + 1}/${times.length} · ${((i + 1) / el).toFixed(1)} fps · quedan ${Math.ceil(eta)} s`);
    }
    progress(isFF ? 0.6 : 0.99, 'Finalizando archivo…');
    await output.finalize();
    const mime = await output.getMimeType();
    let blob: Blob;
    if (stream) { blob = await o.fileHandle.getFile(); }
    else blob = new Blob([(output.target as BufferTarget).buffer!], { type: mime });
    let ext = container === 'mkv' ? 'mkv' : container;
    let codecLabel = `${vcodec.toUpperCase()}${audioSource ? ' + audio' : ''}`;
    if (isFF) {
      const tgt = FFMPEG_TARGETS[o.format as string];
      progress(0.62, 'Convirtiendo con FFmpeg…');
      blob = await ffmpegConvert({ input: blob, inputName: 'render.mp4', outputName: 'out.' + tgt.ext, args: tgt.args, mime: tgt.mime, onProgress: (p) => progress(0.62 + p * 0.38, 'Convirtiendo con FFmpeg…') });
      ext = tgt.ext; codecLabel = tgt.label;
    }
    return { blob, filename: nameFor(project, ext), codec: codecLabel, seconds: (performance.now() - t0) / 1000 };
  } catch (e) {
    if (onFail) await onFail();
    throw e;
  } finally {
    prov.dispose();
    comp.dispose();
    clearAudioCache();
  }
}
