import type { TextWord } from '../types';

export interface Cue { start: number; end: number; text: string; words?: TextWord[] }

const toSec = (s: string) => {
  const m = s.trim().replace(',', '.').match(/(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)/);
  if (!m) return 0;
  return (parseInt(m[1] || '0', 10) * 3600) + parseInt(m[2], 10) * 60 + parseFloat(m[3]);
};

export function parseSubtitles(text: string): Cue[] {
  const cues: Cue[] = [];
  const blocks = text.replace(/\r/g, '').replace(/^WEBVTT.*\n/, '').split(/\n\s*\n/);
  for (const b of blocks) {
    const lines = b.split('\n').filter((l) => l.trim() !== '');
    const idx = lines.findIndex((l) => l.includes('-->'));
    if (idx < 0) continue;
    const [a, z] = lines[idx].split('-->');
    const body = lines.slice(idx + 1).join('\n').replace(/<[^>]+>/g, '').trim();
    if (!body) continue;
    cues.push({ start: toSec(a), end: toSec(z.split(' ').filter(Boolean)[0] || z), text: body });
  }
  return cues;
}

const fmt = (t: number, sep: string) => {
  const ms = Math.round(t * 1000);
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000), r = ms % 1000;
  const p = (n: number, l = 2) => String(n).padStart(l, '0');
  return `${p(h)}:${p(m)}:${p(s)}${sep}${p(r, 3)}`;
};

export function toSRT(cues: Cue[]) {
  return cues.map((c, i) => `${i + 1}\n${fmt(c.start, ',')} --> ${fmt(c.end, ',')}\n${c.text}\n`).join('\n');
}

export function toVTT(cues: Cue[]) {
  return 'WEBVTT\n\n' + cues.map((c) => `${fmt(c.start, '.')} --> ${fmt(c.end, '.')}\n${c.text}\n`).join('\n');
}

export interface Word { text: string; start: number; end: number }

/** Agrupa palabras en subtítulos legibles según palabras máximas, caracteres, pausas y puntuación. */
export function groupWords(words: Word[], maxWords: number, maxChars = 42, maxDur = 4): Cue[] {
  const cues: Cue[] = [];
  let cur: Word[] = [];
  const flush = () => {
    if (!cur.length) return;
    const start = cur[0].start, end = cur[cur.length - 1].end;
    cues.push({
      start, end: Math.max(end, start + 0.3),
      text: cur.map((w) => w.text).join(' '),
      words: cur.map((w) => ({ text: w.text, start: w.start - start, end: w.end - start })),
    });
    cur = [];
  };
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (cur.length) {
      const prev = cur[cur.length - 1];
      const chars = cur.reduce((a, x) => a + x.text.length + 1, 0) + w.text.length;
      if (cur.length >= maxWords || chars > maxChars || w.start - prev.end > 0.7 || w.end - cur[0].start > maxDur || /[.!?…]$/.test(prev.text)) flush();
    }
    cur.push(w);
  }
  flush();
  // evitar solapes
  for (let i = 0; i < cues.length - 1; i++) if (cues[i].end > cues[i + 1].start) cues[i].end = cues[i + 1].start;
  return cues;
}

/** Normaliza la salida de Whisper a una lista de palabras. */
export function whisperToWords(result: any): Word[] {
  const chunks: any[] = result?.chunks || [];
  const words: Word[] = [];
  for (const c of chunks) {
    const [a, b] = c.timestamp || [0, 0];
    const text = String(c.text || '').trim();
    if (!text) continue;
    const parts = text.split(/\s+/);
    if (parts.length === 1) words.push({ text, start: a ?? 0, end: b ?? (a ?? 0) + 0.4 });
    else {
      // marcas por frase: repartir el tiempo proporcionalmente a la longitud
      const total = parts.reduce((s, p) => s + p.length, 0) || 1;
      const end = b ?? a + parts.length * 0.35;
      let t = a ?? 0;
      for (const p of parts) {
        const d = ((end - (a ?? 0)) * p.length) / total;
        words.push({ text: p, start: t, end: t + d });
        t += d;
      }
    }
  }
  return words.filter((w) => isFinite(w.start) && isFinite(w.end));
}

export const WHISPER_LANGS: { code: string; name: string }[] = [
  { code: 'auto', name: 'Detectar automáticamente' }, { code: 'spanish', name: 'Español' }, { code: 'english', name: 'Inglés' },
  { code: 'portuguese', name: 'Portugués' }, { code: 'french', name: 'Francés' }, { code: 'italian', name: 'Italiano' },
  { code: 'german', name: 'Alemán' }, { code: 'japanese', name: 'Japonés' }, { code: 'korean', name: 'Coreano' },
  { code: 'chinese', name: 'Chino' }, { code: 'russian', name: 'Ruso' }, { code: 'arabic', name: 'Árabe' },
  { code: 'hindi', name: 'Hindi' }, { code: 'dutch', name: 'Neerlandés' }, { code: 'turkish', name: 'Turco' },
  { code: 'polish', name: 'Polaco' }, { code: 'catalan', name: 'Catalán' }, { code: 'quechua', name: 'Quechua' },
];

export const WHISPER_MODELS = [
  { id: 'onnx-community/whisper-tiny_timestamped', name: 'Tiny · muy rápido (~40 MB)' },
  { id: 'onnx-community/whisper-base_timestamped', name: 'Base · equilibrado (~80 MB)' },
  { id: 'onnx-community/whisper-small_timestamped', name: 'Small · más preciso (~250 MB)' },
];
