// Transcripción automática con Whisper (transformers.js) — se ejecuta 100% en el navegador.
/// <reference lib="webworker" />

const TRANSFORMERS = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1';
let pipe: any = null;
let pipeKey = '';

async function getPipe(model: string, device: string, post: (m: any) => void) {
  const key = model + '|' + device;
  if (pipe && pipeKey === key) return pipe;
  const lib: any = await import(/* @vite-ignore */ TRANSFORMERS);
  lib.env.allowLocalModels = false;
  lib.env.useBrowserCache = true;
  const files = new Map<string, { loaded: number; total: number }>();
  pipe = await lib.pipeline('automatic-speech-recognition', model, {
    device,
    dtype: device === 'webgpu' ? { encoder_model: 'fp32', decoder_model_merged: 'q4' } : 'q8',
    progress_callback: (p: any) => {
      if (p.status === 'progress' && p.file) {
        files.set(p.file, { loaded: p.loaded || 0, total: p.total || 1 });
        let l = 0, t = 0;
        for (const f of files.values()) { l += f.loaded; t += f.total; }
        post({ type: 'progress', stage: 'download', progress: t ? l / t : 0 });
      }
    },
  });
  pipeKey = key;
  return pipe;
}

self.onmessage = async (e: MessageEvent) => {
  const { audio, model, language, task, device } = e.data;
  const post = (m: any) => (self as any).postMessage(m);
  const run = async (dev: string) => {
    const p = await getPipe(model, dev, post);
    post({ type: 'progress', stage: 'transcribe', progress: 0 });
    const opts: any = { chunk_length_s: 30, stride_length_s: 5, return_timestamps: 'word' };
    if (language && language !== 'auto') opts.language = language;
    if (task) opts.task = task;
    try {
      return await p(audio, opts);
    } catch (err) {
      // algunos modelos no soportan marcas por palabra: usar marcas por frase
      opts.return_timestamps = true;
      return await p(audio, opts);
    }
  };
  try {
    let out;
    try { out = await run(device); }
    catch (err) {
      if (device === 'webgpu') { pipe = null; out = await run('wasm'); }
      else throw err;
    }
    post({ type: 'result', result: out });
  } catch (err: any) {
    post({ type: 'error', error: err?.message || String(err) });
  }
};
