import { Input, ALL_FORMATS, BlobSource, AudioBufferSink } from 'mediabunny';
import type { MediaAsset, Project } from '../types';
import { blobs } from '../core/media';
import { applyChainSettings, buildChain, clipGainAt, clipHasAudio } from './audioGraph';

const decoded = new Map<string, AudioBuffer>();

export function clearAudioCache() { decoded.clear(); }

/** Decodifica el audio completo de un medio (con caché). */
export async function decodeAssetAudio(assetId: string): Promise<AudioBuffer | null> {
  if (decoded.has(assetId)) return decoded.get(assetId)!;
  const blob = blobs.get(assetId);
  if (!blob) return null;
  try {
    const ac = new OfflineAudioContext(2, 1, 48000);
    const buf = await ac.decodeAudioData(await blob.arrayBuffer());
    decoded.set(assetId, buf);
    return buf;
  } catch {
    // Respaldo: decodificar con WebCodecs vía mediabunny
    try {
      const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
      const track = await input.getPrimaryAudioTrack();
      if (!track || !(await track.canDecode())) { input.dispose(); return null; }
      const sink = new AudioBufferSink(track);
      const parts: { buffer: AudioBuffer; timestamp: number }[] = [];
      for await (const wb of sink.buffers()) parts.push({ buffer: wb.buffer, timestamp: wb.timestamp });
      input.dispose();
      if (!parts.length) return null;
      const sr = parts[0].buffer.sampleRate;
      const ch = Math.min(2, parts[0].buffer.numberOfChannels);
      const end = parts[parts.length - 1].timestamp + parts[parts.length - 1].buffer.duration;
      const out = new AudioBuffer({ length: Math.ceil(end * sr), numberOfChannels: ch, sampleRate: sr });
      for (const p of parts) {
        const off = Math.max(0, Math.round(p.timestamp * sr));
        for (let c = 0; c < ch; c++) {
          const src = p.buffer.getChannelData(Math.min(c, p.buffer.numberOfChannels - 1));
          out.getChannelData(c).set(src.subarray(0, Math.min(src.length, out.length - off)), off);
        }
      }
      decoded.set(assetId, out);
      return out;
    } catch {
      return null;
    }
  }
}

/** Mezcla el audio de la línea de tiempo en [start, end). */
export async function mixAudio(
  project: Project, assets: Record<string, MediaAsset>, start: number, end: number,
  sampleRate = 48000, channels = 2, onlyClipIds?: string[], onProgress?: (p: number) => void,
): Promise<AudioBuffer | null> {
  const length = Math.max(1, Math.ceil((end - start) * sampleRate));
  const hasAudio = (id: string) => !!assets[id]?.hasAudio;
  const clips = project.clips.filter((c) =>
    (!onlyClipIds || onlyClipIds.includes(c.id)) &&
    clipHasAudio(c, project, hasAudio) &&
    c.start < end && c.start + c.duration > start);
  if (!clips.length) return null;
  const ctx = new OfflineAudioContext(channels, length, sampleRate);
  let i = 0;
  for (const clip of clips) {
    const track = project.tracks.find((t) => t.id === clip.trackId);
    if (!track || (track.kind === 'visual' && track.muted)) continue;
    const buf = await decodeAssetAudio(clip.assetId!);
    onProgress?.(++i / clips.length);
    if (!buf) continue;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = clip.speed;
    const chain = buildChain(ctx, src, ctx.destination);
    applyChainSettings(chain, clip);
    // automatización de ganancia (keyframes + fundidos)
    const visStart = Math.max(clip.start, start);
    const visEnd = Math.min(clip.start + clip.duration, end);
    const steps = Math.max(2, Math.ceil((visEnd - visStart) * 60));
    const curve = new Float32Array(steps);
    for (let k = 0; k < steps; k++) {
      const tl = visStart + ((visEnd - visStart) * k) / (steps - 1);
      curve[k] = clipGainAt(clip, tl - clip.start, track);
    }
    chain.gain.gain.value = curve[0];
    try { chain.gain.gain.setValueCurveAtTime(curve, visStart - start, Math.max(0.001, visEnd - visStart)); } catch { chain.gain.gain.value = curve[0]; }
    const when = visStart - start;
    const offset = clip.in + (visStart - clip.start) * clip.speed;
    const dur = (visEnd - visStart) * clip.speed;
    if (offset < buf.duration) src.start(when, offset, Math.min(dur, buf.duration - offset));
  }
  return await ctx.startRendering();
}

/** Codifica un AudioBuffer a WAV PCM 16 bits. */
export function encodeWav(buf: AudioBuffer): Blob {
  const ch = buf.numberOfChannels, sr = buf.sampleRate, n = buf.length;
  const data = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) data.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); data.setUint32(4, 36 + n * ch * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, ch, true);
  data.setUint32(24, sr, true); data.setUint32(28, sr * ch * 2, true); data.setUint16(32, ch * 2, true); data.setUint16(34, 16, true);
  w(36, 'data'); data.setUint32(40, n * ch * 2, true);
  const chans = Array.from({ length: ch }, (_, c) => buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) {
    const s = Math.max(-1, Math.min(1, chans[c][i]));
    data.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2;
  }
  return new Blob([data.buffer], { type: 'audio/wav' });
}
