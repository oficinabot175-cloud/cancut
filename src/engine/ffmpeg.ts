// FFmpeg compilado a WebAssembly: conversión de formatos no soportados de forma nativa por el navegador.
import type { FFmpeg } from '@ffmpeg/ffmpeg';

const CORE = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm';
let instance: FFmpeg | null = null;
let loading: Promise<FFmpeg> | null = null;

export function loadFFmpeg(onLog?: (msg: string) => void): Promise<FFmpeg> {
  if (instance) return Promise.resolve(instance);
  return (loading ??= (async () => {
    const [{ FFmpeg: FF }, { toBlobURL }] = await Promise.all([import('@ffmpeg/ffmpeg'), import('@ffmpeg/util')]);
    const ff = new FF();
    if (onLog) ff.on('log', ({ message }) => onLog(message));
    const local = new URL('vendor/ffmpeg', document.baseURI).href;
    let base = CORE;
    try {
      const r = await fetch(`${local}/ffmpeg-core.js`, { method: 'HEAD' });
      if (r.ok && !(r.headers.get('content-type') || '').includes('text/html')) base = local;
    } catch { /* usar CDN */ }
    await ff.load({
      coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    instance = ff;
    return ff;
  })().catch((e) => { loading = null; throw e; }));
}

export interface ConvertOpts {
  input: Blob;
  inputName: string;
  outputName: string;
  args: string[];
  mime: string;
  onProgress?: (p: number) => void;
}

export async function ffmpegConvert(o: ConvertOpts): Promise<Blob> {
  const ff = await loadFFmpeg();
  const progress = ({ progress }: { progress: number }) => o.onProgress?.(Math.max(0, Math.min(1, progress)));
  ff.on('progress', progress);
  const inName = 'in_' + o.inputName.replace(/[^a-z0-9.]/gi, '_');
  try {
    await ff.writeFile(inName, new Uint8Array(await o.input.arrayBuffer()));
    const code = await ff.exec(['-i', inName, ...o.args, o.outputName]);
    if (code !== 0) throw new Error('FFmpeg no pudo convertir el archivo (código ' + code + ')');
    const data = await ff.readFile(o.outputName);
    return new Blob([data as BlobPart], { type: o.mime });
  } finally {
    ff.off('progress', progress);
    try { await ff.deleteFile(inName); } catch { /* noop */ }
    try { await ff.deleteFile(o.outputName); } catch { /* noop */ }
  }
}

/** Convierte cualquier video a un formato editable en el navegador (MP4 H.264, o WebM VP9 si no hay H.264). */
export function convertToMp4(file: Blob, name: string, onProgress?: (p: number) => void) {
  const h264 = document.createElement('video').canPlayType('video/mp4; codecs="avc1.640028"') !== '';
  if (!h264) {
    return ffmpegConvert({
      input: file, inputName: name, outputName: 'out.webm', mime: 'video/webm', onProgress,
      args: ['-c:v', 'libvpx', '-deadline', 'realtime', '-cpu-used', '8', '-b:v', '8M', '-c:a', 'libvorbis', '-q:a', '5'],
    });
  }
  return ffmpegConvert({
    input: file, inputName: name, outputName: 'out.mp4', mime: 'video/mp4', onProgress,
    args: ['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart'],
  });
}

export function convertAudioToWav(file: Blob, name: string, onProgress?: (p: number) => void) {
  return ffmpegConvert({ input: file, inputName: name, outputName: 'out.wav', mime: 'audio/wav', onProgress, args: ['-vn', '-ac', '2', '-ar', '48000'] });
}

export const FFMPEG_TARGETS: Record<string, { ext: string; mime: string; args: string[]; label: string }> = {
  avi: { ext: 'avi', mime: 'video/x-msvideo', label: 'AVI (MPEG-4)', args: ['-c:v', 'mpeg4', '-q:v', '3', '-c:a', 'libmp3lame', '-q:a', '3'] },
  mp3: { ext: 'mp3', mime: 'audio/mpeg', label: 'MP3', args: ['-vn', '-c:a', 'libmp3lame', '-b:a', '256k'] },
  flac: { ext: 'flac', mime: 'audio/flac', label: 'FLAC (sin pérdida)', args: ['-vn', '-c:a', 'flac'] },
  flv: { ext: 'flv', mime: 'video/x-flv', label: 'FLV', args: ['-c:v', 'flv', '-q:v', '4', '-c:a', 'libmp3lame', '-ar', '44100'] },
  wmvlike: { ext: 'mpg', mime: 'video/mpeg', label: 'MPEG-2 (.mpg)', args: ['-c:v', 'mpeg2video', '-q:v', '3', '-c:a', 'mp2', '-b:a', '192k'] },
};
