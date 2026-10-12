import { getState, projectDuration } from '../store/editor';
import { mixAudio } from '../engine/audioMix';
import { Cue, groupWords, whisperToWords, Word } from '../core/subtitles';
import WhisperWorker from './whisper.worker.ts?worker';
import { CAPTION_STYLES, CaptionStyle } from '../core/presets';
import { createClip, createTrack, defaultText } from '../core/defaults';
import { loadFont } from '../core/fonts';
import type { Clip } from '../types';

export interface TranscribeOpts {
  clipIds?: string[];
  model: string;
  language: string;
  task: 'transcribe' | 'translate';
  device: 'webgpu' | 'wasm';
  onProgress: (p: number, label: string) => void;
  signal?: AbortSignal;
}

export async function transcribe(o: TranscribeOpts): Promise<Word[]> {
  const st = getState();
  const p = st.project;
  let start = 0, end = projectDuration(p);
  if (o.clipIds?.length) {
    const cs = p.clips.filter((c) => o.clipIds!.includes(c.id));
    start = Math.min(...cs.map((c) => c.start));
    end = Math.max(...cs.map((c) => c.start + c.duration));
  }
  if (end - start < 0.2) throw new Error('No hay audio en el rango seleccionado.');
  o.onProgress(0.02, 'Extrayendo audio…');
  const buf = await mixAudio(p, st.assets, start, end, 16000, 1, o.clipIds);
  if (!buf) throw new Error('No se encontró audio para transcribir.');
  const audio = buf.getChannelData(0).slice();
  const worker = new WhisperWorker();
  try {
    const result: any = await new Promise((resolve, reject) => {
      o.signal?.addEventListener('abort', () => { worker.terminate(); reject(new Error('Cancelado')); });
      worker.onmessage = (e) => {
        const m = e.data;
        if (m.type === 'progress') {
          if (m.stage === 'download') o.onProgress(0.05 + m.progress * 0.45, `Descargando modelo Whisper… ${Math.round(m.progress * 100)}%`);
          else o.onProgress(0.55, 'Transcribiendo con IA (puede tardar unos minutos)…');
        } else if (m.type === 'result') resolve(m.result);
        else if (m.type === 'error') reject(new Error(/fetch|network|import/i.test(m.error) ? 'No se pudo descargar el motor de subtítulos (Whisper). Revisa tu conexión a internet e inténtalo de nuevo.' : m.error));
      };
      worker.onerror = (e) => reject(new Error(e.message || 'Error en el motor de transcripción'));
      worker.postMessage({ audio, model: o.model, language: o.language, task: o.task, device: o.device }, [audio.buffer]);
    });
    o.onProgress(1, 'Listo');
    return whisperToWords(result).map((w) => ({ ...w, start: w.start + start, end: w.end + start }));
  } finally {
    worker.terminate();
  }
}

/** Inserta subtítulos como clips de texto en una pista nueva superior. */
export function insertCaptions(cues: Cue[], styleId: string) {
  const st = getState();
  const style = CAPTION_STYLES.find((s) => s.id === styleId) || CAPTION_STYLES[0];
  loadFont(style.data.font || 'Inter');
  const track = createTrack('visual', 'Subtítulos');
  const p = st.project;
  const clips: Clip[] = cues.map((c) => captionClip(c, style, track.id, p.height));
  st.commit((d) => {
    d.tracks.unshift(track);
    d.clips.push(...clips);
  });
  return track.id;
}

export function captionClip(c: Cue, style: CaptionStyle, trackId: string, H: number): Clip {
  const clip = createClip({ type: 'text', trackId, start: c.start, duration: Math.max(0.2, c.end - c.start), name: c.text.slice(0, 24) });
  clip.text = { ...defaultText(c.text), ...style.data, content: c.text, words: c.words, isCaption: true } as any;
  clip.text!.boxWidth = Math.round(H * 0.9 > 1500 ? 1500 : H * 0.9);
  clip.transform.y = style.positionY * H;
  if (style.anim) { clip.animation.in = style.anim; clip.animation.inDuration = 0.15; }
  return clip;
}

/** Aplica un estilo de subtítulo a todos los clips de subtítulos. */
export function applyCaptionStyle(styleId: string) {
  const style = CAPTION_STYLES.find((s) => s.id === styleId);
  if (!style) return;
  loadFont(style.data.font || 'Inter');
  const st = getState();
  const H = st.project.height;
  st.commit((d) => {
    for (const c of d.clips) {
      if (!c.text?.isCaption) continue;
      Object.assign(c.text, style.data);
      c.transform.y = style.positionY * H;
      c.animation.in = style.anim || 'none';
      c.animation.inDuration = 0.15;
    }
  });
}

export function captionsToCues(): Cue[] {
  const st = getState();
  return st.project.clips.filter((c) => c.text?.isCaption || (c.type === 'text' && c.text)).filter((c) => c.text!.isCaption)
    .sort((a, b) => a.start - b.start)
    .map((c) => ({ start: c.start, end: c.start + c.duration, text: c.text!.content }));
}

export function regroupCaptions(maxWords: number) {
  const st = getState();
  const caps = st.project.clips.filter((c) => c.text?.isCaption).sort((a, b) => a.start - b.start);
  if (!caps.length) return;
  const words: Word[] = [];
  for (const c of caps) {
    if (c.text!.words?.length) for (const w of c.text!.words) words.push({ text: w.text, start: w.start + c.start, end: w.end + c.start });
    else {
      const parts = c.text!.content.split(/\s+/).filter(Boolean);
      parts.forEach((t, i) => words.push({ text: t, start: c.start + (i * c.duration) / parts.length, end: c.start + ((i + 1) * c.duration) / parts.length }));
    }
  }
  const trackId = caps[0].trackId;
  const template = caps[0];
  const cues = groupWords(words, maxWords);
  st.commit((d) => {
    d.clips = d.clips.filter((c) => !c.text?.isCaption);
    for (const cue of cues) {
      const cl = createClip({ type: 'text', trackId, start: cue.start, duration: Math.max(0.2, cue.end - cue.start), name: cue.text.slice(0, 24) });
      cl.text = { ...template.text!, content: cue.text, words: cue.words };
      cl.transform = { ...template.transform };
      cl.animation = { ...template.animation };
      d.clips.push(cl);
    }
  });
}
