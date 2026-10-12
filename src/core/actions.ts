// Acciones de alto nivel que conectan la UI con el motor, la IA y el almacenamiento.
import type { Clip, EffectType, MediaAsset, TrackBox, TransitionType } from '../types';
import { getState, selectedClips } from '../store/editor';
import { classify, createAsset, blobs, registerImageSource } from './media';
import { saveBlob, importPackage } from './persistence';
import { addCustomFont } from './fonts';
import { parseCube } from './curves';
import { parseSubtitles, toSRT, toVTT } from './subtitles';
import { uid, download, deepClone } from './utils';
import { defaultParams, EFFECT_MAP } from './presets';
import { createClip } from './defaults';
import { convertToMp4, convertAudioToWav } from '../engine/ffmpeg';
import { engine } from '../engine/preview';
import { trackObject, trackFaces, trackHeads, autoReframe, analyzeStabilization, detectScenes, detectSpeechSegments } from '../ai/analysis';
import { loadSegmenter, SegModel } from '../ai/vision';
import { insertCaptions, captionsToCues } from '../ai/transcribe';

const st = () => getState();

/** Ejecuta una tarea con barra de progreso global y cancelación. */
export async function runTask<T>(label: string, fn: (progress: (p: number, l?: string) => void, signal: AbortSignal) => Promise<T>): Promise<T | null> {
  const ac = new AbortController();
  const id = st().startTask(label, () => ac.abort());
  try {
    return await fn((p, l) => st().progressTask(id, p, l), ac.signal);
  } catch (e: any) {
    if (!ac.signal.aborted) { console.error(e); st().toast(String(e?.message || e).split('\n')[0].slice(0, 220), 'error', 6000); }
    return null;
  } finally {
    st().endTask(id);
  }
}

export async function importFiles(files: File[], opts: { addToTimeline?: boolean; at?: number } = {}) {
  const added: MediaAsset[] = [];
  const order = new Map(files.map((f, i) => [f, i]));
  const importOne = async (file: File) => {
    const cat = classify(file);
    try {
      if (cat === 'video' || cat === 'audio' || cat === 'image') {
        const id = uid('asset');
        const placeholder: MediaAsset = { id, name: file.name, kind: cat, mime: file.type, size: file.size, duration: 0, width: 0, height: 0, fps: 30, hasAudio: false, url: '', status: 'processing', createdAt: Date.now() };
        st().addAsset(placeholder);
        try {
          const a = await createAsset(file, cat, id, (patch) => st().updateAsset(id, patch));
          st().addAsset(a);
          saveBlob(id, file);
          (a as any).__order = order.get(file);
          added.push(a);
          if (a.status === 'unsupported') st().toast(`"${file.name}": ${a.error}`, 'error', 7000);
        } catch (e) {
          st().updateAsset(id, { status: 'error', error: String((e as any)?.message || e) });
          throw e;
        }
      } else if (cat === 'subtitle') {
        const cues = parseSubtitles(await file.text());
        if (!cues.length) throw new Error('No se encontraron subtítulos en el archivo');
        insertCaptions(cues, 'classic');
        st().toast(`${cues.length} subtítulos importados`, 'success');
      } else if (cat === 'lut') {
        await importLut(file);
      } else if (cat === 'font') {
        const fam = await addCustomFont(file);
        st().toast(`Fuente "${fam}" instalada`, 'success');
      } else if (cat === 'project') {
        await importPackage(file);
        st().toast('Proyecto abierto', 'success');
      } else {
        st().toast(`Formato no reconocido: ${file.name}`, 'error');
      }
    } catch (e: any) {
      st().toast(`Error al importar ${file.name}: ${e?.message || e}`, 'error', 6000);
    }
  };
  // importar en paralelo (máx. 3 a la vez)
  const queue = [...files];
  await Promise.all(Array.from({ length: Math.min(3, queue.length) }, async () => {
    while (queue.length) await importOne(queue.shift()!);
  }));
  added.sort((a, b) => ((a as any).__order ?? 0) - ((b as any).__order ?? 0));
  if (opts.addToTimeline) {
    let t = opts.at ?? st().time;
    for (const a of added) {
      if (a.status !== 'ready') continue;
      const c = st().addAssetToTimeline(a.id, t);
      if (c && (a.kind !== 'audio')) t = c.start + c.duration;
    }
  }
  // Ajustar el proyecto al primer video si está vacío
  const first = added.find((a) => a.kind === 'video' && a.status === 'ready');
  const p = st().project;
  if (first && p.clips.length <= added.length && first.width && first.height && !opts.at && Object.keys(st().assets).length === added.length) {
    if (first.width !== p.width || first.height !== p.height) {
      st().toast(`Sugerencia: el video es ${first.width}×${first.height}. Puedes ajustar el lienzo en Ajustes del proyecto.`, 'info', 5000);
    }
  }
  return added;
}

export async function convertAsset(asset: MediaAsset) {
  const blob = blobs.get(asset.id);
  if (!blob) return;
  await runTask(`Convirtiendo ${asset.name}`, async (progress) => {
    progress(0.01, 'Cargando FFmpeg (≈30 MB, solo la primera vez)…');
    const out = asset.kind === 'video'
      ? await convertToMp4(blob, asset.name, (p) => progress(p, `Convirtiendo a MP4… ${Math.round(p * 100)}%`))
      : await convertAudioToWav(blob, asset.name, (p) => progress(p, `Convirtiendo audio… ${Math.round(p * 100)}%`));
    const name = asset.name.replace(/\.[^.]+$/, '') + (asset.kind === 'video' ? (out.type.includes('webm') ? '.webm' : '.mp4') : '.wav');
    const file = new File([out], name, { type: out.type });
    await importFiles([file]);
    st().removeAsset(asset.id);
    st().toast('Conversión completada', 'success');
  });
}

export async function importLut(file: File) {
  const { size, data, title } = parseCube(await file.text());
  const id = uid('lut');
  st().commit((p) => { p.luts.push({ id, name: title || file.name.replace(/\.cube$/i, ''), size, data }); });
  const sel = selectedClips().filter((c) => c.type !== 'audio');
  if (sel.length) st().updateClips(sel.map((c) => c.id), (c) => { c.grade.lutId = id; c.grade.lutIntensity = 1; });
  st().toast(`LUT "${title || file.name}" importado${sel.length ? ' y aplicado' : ''}`, 'success');
  return id;
}

function targetVisualClips(): Clip[] {
  const s = selectedClips().filter((c) => c.type !== 'audio');
  if (s.length) return s;
  // si no hay selección, el clip visual bajo el cabezal
  const t = st().time;
  const p = st().project;
  const vis = p.tracks.filter((tr) => tr.kind === 'visual');
  for (const tr of vis) {
    const c = p.clips.find((x) => x.trackId === tr.id && t >= x.start && t < x.start + x.duration && (x.type === 'video' || x.type === 'image'));
    if (c) return [c];
  }
  return [];
}

function requireVideo(): Clip | null {
  const c = targetVisualClips().find((x) => x.type === 'video');
  if (!c) { st().toast('Selecciona un clip de video en la línea de tiempo', 'error'); return null; }
  return c;
}

export function addEffect(type: EffectType, clipIds?: string[]) {
  const ids = clipIds || targetVisualClips().map((c) => c.id);
  if (!ids.length) {
    if (EFFECT_MAP[type]) {
      // sin selección: crear capa de ajuste con el efecto
      const c = createClip({ type: 'adjustment', trackId: '', start: st().time, duration: 5, name: `Ajuste · ${EFFECT_MAP[type].name}` });
      c.effects.push({ id: uid('fx'), type, enabled: true, params: defaultParams(type) });
      st().addClip(c);
      st().toast('Se creó una capa de ajuste con el efecto', 'info');
    }
    return;
  }
  st().updateClips(ids, (c) => { c.effects.push({ id: uid('fx'), type, enabled: true, params: defaultParams(type) }); });
  st().set({ inspectorTab: 'effects' });
  if (EFFECT_MAP[type]?.ai) loadSegmenterForUI('selfie');
}

export function applyFilter(filterId: string) {
  const ids = targetVisualClips().map((c) => c.id);
  if (!ids.length) {
    const c = createClip({ type: 'adjustment', trackId: '', start: st().time, duration: 5, name: 'Filtro' });
    c.grade.filter = filterId;
    st().addClip(c);
    return;
  }
  st().updateClips(ids, (c) => { c.grade.filter = filterId; if (!c.grade.filterIntensity) c.grade.filterIntensity = 1; });
}

export function applyTransition(type: TransitionType, duration = 0.8, clipId?: string) {
  const ids = clipId ? [clipId] : selectedClips().filter((c) => c.type !== 'audio').map((c) => c.id);
  if (!ids.length) { st().toast('Selecciona el clip donde empieza la transición (o arrástrala sobre él)', 'error'); return; }
  st().updateClips(ids, (c) => { c.transitionIn = type === 'none' ? null : { type, duration: Math.min(duration, c.duration * 0.9) }; });
}

export async function loadSegmenterForUI(model: SegModel) {
  const t = st().toast('Cargando modelo de IA para quitar fondo…', 'progress', 0);
  try { await loadSegmenter(model); st().toast('Modelo de IA listo', 'success', 1500); }
  catch (e: any) { st().toast('No se pudo cargar el modelo de IA (revisa tu conexión): ' + String(e?.message || e).split('\n')[0].slice(0, 160), 'error', 7000); }
  finally { st().dismissToast(t); engine.requestRender(); }
}

export function removeBackground(mode: 'remove' | 'blur' | 'color' | 'gray' = 'remove') {
  const clips = targetVisualClips().filter((c) => c.type === 'video' || c.type === 'image');
  if (!clips.length) { st().toast('Selecciona un clip de video o imagen', 'error'); return; }
  st().updateClips(clips.map((c) => c.id), (c) => {
    const ex = c.effects.find((e) => e.type === 'bgRemove');
    if (ex) { ex.enabled = true; ex.params.mode = mode; }
    else c.effects.push({ id: uid('fx'), type: 'bgRemove', enabled: true, params: { ...defaultParams('bgRemove'), mode } });
  });
  st().set({ inspectorTab: 'effects' });
  loadSegmenterForUI('selfie');
}

export async function blurFaces(opts: { heads?: boolean; pad?: number; mode?: 'blur' | 'pixelate' | 'solid'; strength?: number } = {}) {
  const clip = requireVideo();
  if (!clip) return;
  const td = await runTask('Detectando rostros y cabezas', (p, s) => trackHeads(clip, p, s, { heads: opts.heads !== false, pad: opts.pad ?? 1, fps: 10 }));
  if (!td) return;
  const faces = td.samples.reduce((m, x) => Math.max(m, x.boxes.length), 0);
  if (!faces) { st().toast('No se detectaron rostros en el clip', 'info'); return; }
  st().commit((p) => {
    p.trackings.push(td);
    const c = p.clips.find((x) => x.id === clip.id);
    c?.effects.push({ id: uid('fx'), type: 'regionBlur', enabled: true, params: { ...defaultParams('regionBlur'), mode: opts.mode || 'blur', tracking: td.id, expand: 1.3, strength: opts.strength ?? 45, shape: 'ellipse', feather: 0.2 } });
  });
  st().set({ inspectorTab: 'effects' });
  st().toast(`Rostros difuminados (hasta ${faces} por fotograma)`, 'success');
}

export function startObjectTracking() {
  const clip = requireVideo();
  if (!clip) return;
  st().select([clip.id]);
  st().set({ trackingDraw: { clipId: clip.id }, tool: 'track' });
  st().toast('Dibuja un recuadro sobre el objeto a seguir en el visor', 'info', 5000);
}

export async function runObjectTracking(clipId: string, box: TrackBox, action: 'none' | 'blur' | 'focus' | 'follow-text' | 'camera' = 'none') {
  const clip = st().project.clips.find((c) => c.id === clipId);
  if (!clip) return;
  const ts = Math.max(clip.in, Math.min(clip.in + clip.duration * clip.speed - 0.05, clip.in + (st().time - clip.start) * clip.speed));
  st().set({ trackingDraw: null, tool: 'select' });
  const td = await runTask('Seguimiento de objeto', (p, s) => trackObject(clip, box, ts, p, s));
  if (!td) return;
  st().commit((p) => { p.trackings.push(td); });
  applyTrackingAction(clipId, td.id, action);
  st().toast('Seguimiento completado. Puedes vincular textos, stickers o efectos al objeto.', 'success', 5000);
}

export function applyTrackingAction(clipId: string, trackingId: string, action: string) {
  const s = st();
  if (action === 'blur' || action === 'focus') {
    s.updateClip(clipId, (c) => {
      c.effects.push({ id: uid('fx'), type: action === 'blur' ? 'regionBlur' : 'focus', enabled: true, params: { ...defaultParams(action === 'blur' ? 'regionBlur' : 'focus'), tracking: trackingId, expand: 1.15 } });
    });
    s.set({ inspectorTab: 'effects' });
  } else if (action === 'follow-text') {
    const target = s.project.clips.find((c) => c.id === clipId)!;
    const text = s.addTextClip({ start: target.start, duration: target.duration } as any, 'Objeto');
    bindFollow(text.id, clipId, trackingId);
  } else if (action === 'camera') {
    s.updateClip(clipId, (c) => { c.reframe = { trackingId, zoom: 1.6 }; c.fit = 'cover'; });
  }
}

/** Vincula la posición de un clip al objeto rastreado en otro clip. */
export function bindFollow(clipId: string, targetClipId: string, trackingId: string) {
  const s = st();
  s.updateClip(clipId, (c) => {
    c.follow = { trackingId, clipId: targetClipId, offsetX: 0, offsetY: -60, boxIndex: 0, scaleWithObject: false, baseW: 0 };
  });
}

export async function reframeClip(aspect?: { w: number; h: number }) {
  const clip = requireVideo();
  if (!clip) return;
  if (aspect) st().setProjectProps({ width: aspect.w, height: aspect.h });
  const td = await runTask('Auto-reencuadre con IA', (p, s) => autoReframe(clip, p, s));
  if (!td) return;
  st().commit((p) => {
    p.trackings.push(td);
    const c = p.clips.find((x) => x.id === clip.id);
    if (c) { c.reframe = { trackingId: td.id, zoom: 1 }; c.fit = 'cover'; c.transform.x = 0; c.transform.y = 0; }
  });
  st().toast('Encuadre automático aplicado: la cámara sigue al sujeto', 'success');
}

export async function stabilizeClip(strength = 1) {
  const clip = requireVideo();
  if (!clip) return;
  const td = await runTask('Estabilizando video', (p, s) => analyzeStabilization(clip, p, s));
  if (!td) return;
  const maxShift = td.samples.reduce((m, x) => Math.max(m, Math.abs(x.boxes[0].x), Math.abs(x.boxes[0].y)), 0);
  const zoom = Math.min(1.35, 1 + maxShift * 2.2 + 0.03);
  st().commit((p) => {
    p.trackings.push(td);
    const c = p.clips.find((x) => x.id === clip.id);
    if (c) c.stabilize = { trackingId: td.id, zoom, strength };
  });
  st().toast(`Video estabilizado (zoom de recorte ${Math.round((zoom - 1) * 100)}%)`, 'success');
}

export async function splitScenes(sensitivity = 0.6) {
  const clip = requireVideo();
  if (!clip) return;
  const cuts = await runTask('Detectando escenas', (p, s) => detectScenes(clip, sensitivity, p, s));
  if (!cuts) return;
  if (!cuts.length) { st().toast('No se detectaron cambios de escena', 'info'); return; }
  const times = cuts.map((ts) => clip.start + (ts - clip.in) / clip.speed).filter((t) => t > clip.start + 0.1 && t < clip.start + clip.duration - 0.1);
  let ids = [clip.id];
  for (const t of times) {
    st().splitAt(t, ids);
    ids = st().project.clips.filter((c) => c.trackId === clip.trackId && c.assetId === clip.assetId).map((c) => c.id);
  }
  st().toast(`Clip dividido en ${times.length + 1} escenas`, 'success');
}

export async function removeSilences(thresholdDb = -38, minSilence = 0.45, padding = 0.12) {
  const sel = selectedClips().find((c) => c.type === 'video' || c.type === 'audio');
  if (!sel) { st().toast('Selecciona un clip de video o audio con voz', 'error'); return; }
  const segs = await runTask('Analizando silencios', async () => detectSpeechSegments(sel, thresholdDb, minSilence, padding));
  if (!segs) return;
  if (!segs.length) { st().toast('No se detectó voz por encima del umbral', 'info'); return; }
  const before = sel.duration;
  st().commit((p) => {
    const orig = p.clips.find((c) => c.id === sel.id)!;
    p.clips = p.clips.filter((c) => c.id !== sel.id);
    let t = orig.start;
    for (const g of segs) {
      const n: Clip = deepClone(orig);
      n.id = uid('clip');
      n.in = g.s;
      n.start = t;
      n.duration = (g.e - g.s) / orig.speed;
      n.transitionIn = null;
      n.keyframes = {};
      t += n.duration;
      p.clips.push(n);
    }
    const removed = before - (t - orig.start);
    for (const c of p.clips) if (c.trackId === orig.trackId && c.start >= orig.start + before - 1e-3) c.start -= removed;
  });
  st().toast(`Silencios eliminados: ${segs.length} segmentos conservados`, 'success');
}

export async function freezeFrame() {
  const clip = requireVideo();
  if (!clip) return;
  const t = st().time;
  if (t <= clip.start || t >= clip.start + clip.duration) { st().toast('Coloca el cabezal dentro del clip', 'error'); return; }
  const canvas = engine.currentClipFrame(clip);
  if (!canvas) return;
  const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/png'));
  const file = new File([blob], `Congelado ${clip.name}.png`, { type: 'image/png' });
  const [asset] = await importFiles([file]);
  if (!asset) return;
  registerImageSource(asset.id, { source: canvas, w: canvas.width, h: canvas.height });
  const dur = 2;
  st().splitAt(t, [clip.id]);
  const s = st();
  s.commit((p) => {
    for (const c of p.clips) if (c.trackId === clip.trackId && c.start >= t - 1e-4) c.start += dur;
    const img = createClip({ type: 'image', trackId: clip.trackId, start: t, duration: dur, assetId: asset.id, name: 'Fotograma congelado' });
    img.transform = { ...clip.transform };
    img.fit = clip.fit;
    img.grade = deepClone(clip.grade);
    img.effects = deepClone(clip.effects.filter((e) => e.type !== 'bgRemove'));
    p.clips.push(img);
  });
}

export async function snapshotPNG() {
  const blob = await engine.snapshot();
  download(blob, `${st().project.name}-fotograma.png`);
}

export function exportSubtitles(fmt: 'srt' | 'vtt') {
  const cues = captionsToCues();
  if (!cues.length) { st().toast('No hay subtítulos en el proyecto', 'error'); return; }
  const text = fmt === 'srt' ? toSRT(cues) : toVTT(cues);
  download(new Blob([text], { type: 'text/plain' }), `${st().project.name}.${fmt}`);
}

export function fitProjectToAsset(asset: MediaAsset) {
  if (!asset.width || !asset.height) return;
  st().setProjectProps({ width: asset.width, height: asset.height, fps: Math.round(asset.fps) || 30 });
}
