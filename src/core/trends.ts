// Efectos de tendencia (TikTok / CapCut): presets de un clic, capas detrás de la persona y mejora de calidad.
import type { Clip, EffectType, MediaAsset, TransitionType } from '../types';
import { getState, selectedClips, hooks } from '../store/editor';
import { createClip, createProject, createTrack, defaultText } from './defaults';
import { defaultParams, EFFECT_MAP } from './presets';
import { uid, deepClone, clamp } from './utils';
import { engine, captureFrame } from '../engine/preview';
import { getImage } from './media';
import { loadFont } from './fonts';
import { runTask, importFiles, loadSegmenterForUI, stabilizeClip } from './actions';
import { exportProject } from '../engine/export';

const st = () => getState();

export interface TrendPreset {
  id: string;
  name: string;
  group: string;
  icon: string;
  /** degradado del icono */
  colors: [string, string];
  desc: string;
  ai?: boolean;
  effects?: { type: EffectType; params?: Record<string, number | string | boolean> }[];
  filter?: string;
  transition?: TransitionType;
  action?: 'textBehind' | 'putBehind' | 'enhance' | 'stabilize';
  hot?: boolean;
}

export const TREND_PRESETS: TrendPreset[] = [
  // Capas con la persona
  { id: 'text-behind', name: 'Texto detrás de la persona', group: 'Capas con la persona', icon: 'Aa', colors: ['#7c5cff', '#ff2ad4'], desc: 'El texto queda entre el fondo y la persona (efecto profundidad).', ai: true, action: 'textBehind', hot: true },
  { id: 'put-behind', name: 'Poner detrás de la persona', group: 'Capas con la persona', icon: '⧉', colors: ['#2a7cff', '#00e5ff'], desc: 'Selecciona un texto, sticker, imagen o forma y lo pasa detrás de la persona.', ai: true, action: 'putBehind', hot: true },
  { id: 'aura-neon', name: 'Aura neón', group: 'Capas con la persona', icon: '🌟', colors: ['#ff2ad4', '#5b2bff'], desc: 'Resplandor de color alrededor de la persona.', ai: true, effects: [{ type: 'aura', params: { style: 'glow', color: '#ff2ad4', color2: '#00e5ff', size: 80, intensity: 1.4, background: 'dark' } }], hot: true },
  { id: 'aura-rainbow', name: 'Aura arcoíris', group: 'Capas con la persona', icon: '🌈', colors: ['#ff5f6d', '#3ae7ff'], desc: 'Aura multicolor que gira alrededor del sujeto.', ai: true, effects: [{ type: 'aura', params: { style: 'rainbow', size: 90, intensity: 1.5, background: 'keep' } }] },
  { id: 'aura-fire', name: 'Aura de fuego', group: 'Capas con la persona', icon: '🔥', colors: ['#ff3d00', '#ffc400'], desc: 'Llamas animadas detrás de la persona.', ai: true, effects: [{ type: 'aura', params: { style: 'fire', size: 110, intensity: 1.6, background: 'dark', pulse: 0.2 } }] },
  { id: 'sticker-outline', name: 'Contorno sticker', group: 'Capas con la persona', icon: '✂', colors: ['#ffffff', '#9aa4b2'], desc: 'Borde blanco tipo sticker alrededor de la persona.', ai: true, effects: [{ type: 'aura', params: { style: 'outline', color: '#ffffff', size: 26, intensity: 1.2, background: 'keep', pulse: 0 } }] },
  { id: 'double-outline', name: 'Doble contorno', group: 'Capas con la persona', icon: '◎', colors: ['#00e5ff', '#ff2ad4'], desc: 'Dos líneas de color siguiendo la silueta.', ai: true, effects: [{ type: 'aura', params: { style: 'double', color: '#ffffff', color2: '#ff2ad4', size: 40, intensity: 1.2, background: 'keep', pulse: 0 } }] },
  { id: 'rays', name: 'Rayos de luz detrás', group: 'Capas con la persona', icon: '☀', colors: ['#ffb300', '#ff6a00'], desc: 'Haces de luz que salen desde detrás del sujeto.', ai: true, effects: [{ type: 'subjectRays' }], hot: true },
  { id: 'clones', name: 'Clones', group: 'Capas con la persona', icon: '👥', colors: ['#7c5cff', '#00d4ff'], desc: 'Copias de la persona a los lados.', ai: true, effects: [{ type: 'echo', params: { target: 'subject', mode: 'clones', count: 4, spacing: 0.45, decay: 0.75, tintAmount: 0.15 } }] },
  { id: 'ghost-trail', name: 'Estela fantasma', group: 'Capas con la persona', icon: '👻', colors: ['#5b2bff', '#ff4fa3'], desc: 'La persona deja un rastro de color al moverse.', ai: true, effects: [{ type: 'echo', params: { target: 'subject', mode: 'trail', count: 5, spacing: 0.3, decay: 0.7, tint: '#7c5cff', tintAmount: 0.6 } }], hot: true },
  { id: 'depth-clones', name: 'Clones en profundidad', group: 'Capas con la persona', icon: '🌀', colors: ['#00c6ff', '#0072ff'], desc: 'Copias crecientes detrás de la persona.', ai: true, effects: [{ type: 'echo', params: { target: 'subject', mode: 'zoom', count: 5, spacing: 0.5, decay: 0.7, tint: '#00d4ff', tintAmount: 0.5 } }] },
  { id: 'portrait-blur', name: 'Modo retrato', group: 'Capas con la persona', icon: '◉', colors: ['#3a3f4b', '#9aa4b2'], desc: 'Fondo desenfocado como cámara profesional.', ai: true, effects: [{ type: 'bgRemove', params: { mode: 'blur', blur: 26 } }] },
  { id: 'color-pop', name: 'Color pop', group: 'Capas con la persona', icon: '🎯', colors: ['#2b2b2b', '#ff3b6b'], desc: 'Persona a color, fondo en blanco y negro.', ai: true, effects: [{ type: 'bgRemove', params: { mode: 'gray' } }] },
  // Ritmo y energía
  { id: 'velocity', name: 'Velocity beat', group: 'Ritmo y energía', icon: '⚡', colors: ['#ff0844', '#ffb199'], desc: 'Zoom al ritmo + flash + RGB: el edit viral de velocidad.', effects: [{ type: 'zoomPulse', params: { amount: 0.18, rate: 2, blur: 0.6 } }, { type: 'flash', params: { intensity: 0.45, rate: 2, decay: 0.18 } }, { type: 'rgbShake', params: { amount: 10, speed: 2, jitter: 0.3 } }], hot: true },
  { id: 'shake', name: 'Temblor de cámara', group: 'Ritmo y energía', icon: '📳', colors: ['#434343', '#9e9e9e'], desc: 'Cámara en mano intensa.', effects: [{ type: 'shake', params: { amount: 0.45, speed: 2.5 } }] },
  { id: 'strobe', name: 'Flash estroboscópico', group: 'Ritmo y energía', icon: '💡', colors: ['#f7f7f7', '#7c5cff'], desc: 'Destellos blancos al ritmo.', effects: [{ type: 'flash', params: { intensity: 0.9, rate: 4, decay: 0.25 } }] },
  { id: 'beat-zoom', name: 'Zoom al ritmo', group: 'Ritmo y energía', icon: '💓', colors: ['#ff416c', '#ff4b2b'], desc: 'Golpes de zoom sincronizables (ajusta golpes por segundo al BPM/60).', effects: [{ type: 'zoomPulse' }] },
  { id: 'rgb-glitch', name: 'Glitch RGB', group: 'Ritmo y energía', icon: '⌁', colors: ['#00f0ff', '#ff00aa'], desc: 'Separación RGB y cortes digitales.', effects: [{ type: 'rgbShake', params: { amount: 18, speed: 4, jitter: 0.6 } }, { type: 'glitch', params: { amount: 0.35, speed: 1.4 } }] },
  { id: 'prism', name: 'Prisma', group: 'Ritmo y energía', icon: '🔺', colors: ['#f093fb', '#f5576c'], desc: 'Copias de color girando alrededor de la imagen.', effects: [{ type: 'prism' }] },
  // Estética
  { id: 'dream', name: 'Brillo de ensueño', group: 'Estética', icon: '☁', colors: ['#fbc2eb', '#a6c1ee'], desc: 'Look suave y luminoso (Orton).', effects: [{ type: 'dreamGlow' }] },
  { id: 'sparkle', name: 'Destellos', group: 'Estética', icon: '✨', colors: ['#f6d365', '#fda085'], desc: 'Brillitos en las zonas iluminadas.', effects: [{ type: 'sparkles' }], hot: true },
  { id: 'light-leak', name: 'Fugas de luz', group: 'Estética', icon: '🌅', colors: ['#ff9a00', '#ff2d6f'], desc: 'Luces cálidas de película en movimiento.', effects: [{ type: 'lightLeak' }] },
  { id: 'webcore', name: 'Webcore Y2K', group: 'Estética', icon: '💿', colors: ['#4b2bff', '#ff9ff3'], desc: 'Estética 2000: color saturado, destellos y grano.', filter: 'tt-webcore', effects: [{ type: 'sparkles', params: { intensity: 0.8, size: 26 } }, { type: 'grain', params: { amount: 0.18 } }] },
  { id: 'old-film', name: 'Película antigua', group: 'Estética', icon: '🎞', colors: ['#8e6e53', '#2b2118'], desc: 'Rayas, polvo y parpadeo de cine viejo.', filter: 'vintage', effects: [{ type: 'oldFilm' }] },
  { id: 'camcorder', name: 'Videocámara REC', group: 'Estética', icon: '⏺', colors: ['#d31027', '#3a3a3a'], desc: 'Rótulos REC, fecha y look de cinta.', effects: [{ type: 'camcorder' }, { type: 'vhs', params: { amount: 0.3 } }], hot: true },
  { id: 'cine', name: 'Cine 2.39', group: 'Estética', icon: '🎬', colors: ['#0b5563', '#f2a65a'], desc: 'Barras de cine, teal & orange y grano.', filter: 'tt-cinematic-teal', effects: [{ type: 'cinemaBars' }, { type: 'grain', params: { amount: 0.15 } }] },
  // Partículas
  { id: 'hearts', name: 'Corazones', group: 'Partículas', icon: '💗', colors: ['#ff5e9a', '#ffb3c6'], desc: 'Corazones flotando hacia arriba.', effects: [{ type: 'particles', params: { kind: 'hearts', density: 0.8, size: 1.1, speed: 0.8 } }] },
  { id: 'snow', name: 'Nieve', group: 'Partículas', icon: '❄', colors: ['#83a4d4', '#e0eafc'], desc: 'Copos de nieve cayendo.', effects: [{ type: 'particles', params: { kind: 'snow' } }] },
  { id: 'confetti', name: 'Confeti', group: 'Partículas', icon: '🎊', colors: ['#fc466b', '#3f5efb'], desc: 'Lluvia de confeti para celebraciones.', effects: [{ type: 'particles', params: { kind: 'confetti', density: 1.2 } }] },
  { id: 'stars', name: 'Estrellas', group: 'Partículas', icon: '⭐', colors: ['#141e30', '#f7d774'], desc: 'Estrellas titilando.', effects: [{ type: 'particles', params: { kind: 'stars', density: 1.2 } }] },
  { id: 'bokeh', name: 'Bokeh', group: 'Partículas', icon: '🔆', colors: ['#f7971e', '#ffd200'], desc: 'Círculos de luz desenfocados.', effects: [{ type: 'particles', params: { kind: 'bokeh', density: 0.6, size: 1.4, speed: 0.6 } }] },
  { id: 'rain', name: 'Lluvia', group: 'Partículas', icon: '🌧', colors: ['#3a6073', '#16222a'], desc: 'Lluvia cinematográfica.', effects: [{ type: 'particles', params: { kind: 'rain', density: 1.6, speed: 1.2 } }] },
  { id: 'embers', name: 'Brasas', group: 'Partículas', icon: '🔥', colors: ['#f12711', '#f5af19'], desc: 'Chispas de fuego subiendo.', effects: [{ type: 'particles', params: { kind: 'embers', density: 1.2 } }] },
  // Belleza y calidad
  { id: 'enhance', name: 'Mejorar calidad (HD)', group: 'Belleza y calidad', icon: '💎', colors: ['#11998e', '#38ef7d'], desc: 'Reescalado inteligente, nitidez, menos ruido y color automático.', action: 'enhance', hot: true },
  { id: 'stabilize', name: 'Estabilizar video', group: 'Belleza y calidad', icon: '🎯', colors: ['#4b6cb7', '#182848'], desc: 'Quita el temblor de la cámara (análisis de movimiento + recorte mínimo).', action: 'stabilize', hot: true },
  { id: 'smooth-skin', name: 'Retoque de piel', group: 'Belleza y calidad', icon: '💄', colors: ['#ee9ca7', '#ffdde1'], desc: 'Piel suave y luminosa sin perder detalle.', effects: [{ type: 'smoothSkin' }] },
  { id: 'glow-up', name: 'Glow up', group: 'Belleza y calidad', icon: '✨', colors: ['#ffecd2', '#fcb69f'], desc: 'Piel suave + filtro Glow Up + brillo de ensueño leve.', filter: 'tt-glowup', effects: [{ type: 'smoothSkin', params: { amount: 0.5 } }, { type: 'dreamGlow', params: { amount: 0.25 } }] },
  // Transiciones
  { id: 'tr-whip', name: 'Whip pan', group: 'Transiciones virales', icon: '⇆', colors: ['#2c3e50', '#4ca1af'], desc: 'Barrido rápido con desenfoque de movimiento.', transition: 'whipLeft' },
  { id: 'tr-zoom', name: 'Zoom con desenfoque', group: 'Transiciones virales', icon: '⊕', colors: ['#000428', '#004e92'], desc: 'Entrar a toda velocidad en la siguiente toma.', transition: 'zoomBlurIn' },
  { id: 'tr-shake', name: 'Sacudida', group: 'Transiciones virales', icon: '〰', colors: ['#cb2d3e', '#ef473a'], desc: 'Golpe con temblor y RGB.', transition: 'shake' },
  { id: 'tr-spin', name: 'Giro + zoom', group: 'Transiciones virales', icon: '↻', colors: ['#8e2de2', '#4a00e0'], desc: 'Rotación rápida entre tomas.', transition: 'spinZoom' },
  { id: 'tr-leak', name: 'Fuga de luz', group: 'Transiciones virales', icon: '🌅', colors: ['#ff9966', '#ff5e62'], desc: 'Destello cálido de película.', transition: 'lightLeak' },
];

function visualTargets(): Clip[] {
  const s = selectedClips().filter((c) => c.type !== 'audio');
  if (s.length) return s;
  return subjectAt(st().time) ? [subjectAt(st().time)!] : [];
}

/** Clip de video/imagen visible bajo el cabezal (el de la pista más alta). */
function subjectAt(t: number, belowTrackIndex = -1): Clip | undefined {
  const p = st().project;
  const tracks = p.tracks.filter((tr) => tr.kind === 'visual' && !tr.hidden);
  for (const tr of tracks) {
    if (p.tracks.indexOf(tr) <= belowTrackIndex) continue;
    const c = p.clips.find((x) => x.trackId === tr.id && t >= x.start - 1e-6 && t < x.start + x.duration && (x.type === 'video' || x.type === 'image'));
    if (c) return c;
  }
  return undefined;
}

export function applyTrend(t: TrendPreset) {
  if (t.action === 'textBehind') return textBehindSubject();
  if (t.action === 'putBehind') return putBehindSubject();
  if (t.action === 'enhance') return enhanceClips();
  if (t.action === 'stabilize') return stabilizeClip(1);
  if (t.transition) {
    const ids = selectedClips().filter((c) => c.type !== 'audio').map((c) => c.id);
    if (!ids.length) { st().toast('Selecciona el clip donde empieza la transición', 'error'); return; }
    st().updateClips(ids, (c) => { c.transitionIn = { type: t.transition!, duration: Math.min(0.6, c.duration * 0.9) }; });
    st().toast(`Transición "${t.name}" aplicada`, 'success', 1800);
    return;
  }
  const targets = visualTargets();
  const fxList = (t.effects || []).map((e) => ({ id: uid('fx'), type: e.type, enabled: true, params: { ...defaultParams(e.type), ...(e.params || {}) } }));
  if (!targets.length) {
    if (t.ai) { st().toast('Selecciona un clip de video o imagen con una persona', 'error'); return; }
    // sin selección: capa de ajuste sobre todo
    const c = createClip({ type: 'adjustment', trackId: '', start: st().time, duration: 5, name: `Tendencia · ${t.name}` });
    c.effects = fxList;
    if (t.filter) { c.grade.filter = t.filter; c.grade.filterIntensity = 1; }
    st().addClip(c);
    st().toast('Se creó una capa de ajuste con el efecto (aplica a todo lo de abajo)', 'info');
    return;
  }
  const ids = targets.filter((c) => !t.ai || c.type === 'video' || c.type === 'image').map((c) => c.id);
  if (!ids.length) { st().toast('Este efecto necesita un clip de video o imagen', 'error'); return; }
  st().updateClips(ids, (c) => {
    for (const f of fxList) {
      // efectos de IA únicos: reemplazar si ya existe
      const ex = EFFECT_MAP[f.type]?.ai ? c.effects.find((e) => e.type === f.type) : undefined;
      if (ex) { ex.params = { ...f.params }; ex.enabled = true; } else c.effects.push(deepClone(f));
    }
    if (t.filter) { c.grade.filter = t.filter; c.grade.filterIntensity = 1; }
  });
  st().set({ inspectorTab: 'effects' });
  if (t.ai) loadSegmenterForUI('selfie');
  st().toast(`"${t.name}" aplicado`, 'success', 1600);
}

/** Crea una copia recortada (sin fondo) del sujeto justo encima de la pista indicada. */
function insertCutoutAbove(subject: Clip, aboveTrackId: string, from: number, to: number) {
  const s0 = Math.max(subject.start, from), s1 = Math.min(subject.start + subject.duration, to);
  if (s1 - s0 < 0.05) return null;
  const cut = deepClone(subject);
  cut.id = uid('clip');
  cut.name = `Persona recortada · ${subject.name}`;
  const delta = s0 - subject.start;
  cut.start = s0;
  cut.duration = s1 - s0;
  cut.in = subject.in + delta * (subject.speed || 1);
  if (delta > 1e-6) {
    for (const k of Object.keys(cut.keyframes)) cut.keyframes[k] = cut.keyframes[k].map((kf) => ({ ...kf, t: kf.t - delta }));
    cut.animation.in = 'none';
  }
  if (s1 < subject.start + subject.duration - 1e-6) cut.animation.out = 'none';
  cut.transitionIn = null;
  cut.audio.muted = true;
  cut.audioDetached = true;
  cut.effects = cut.effects.filter((e) => !['bgRemove', 'aura', 'subjectRays', 'echo'].includes(e.type));
  cut.effects.push({ id: uid('fx'), type: 'bgRemove', enabled: true, params: { ...defaultParams('bgRemove'), mode: 'remove', softness: 0.08, smooth: 0.55 } });
  const track = createTrack('visual');
  st().commit((p) => {
    const idx = p.tracks.findIndex((t) => t.id === aboveTrackId);
    track.name = 'Persona (IA)';
    cut.trackId = track.id;
    p.tracks.splice(Math.max(0, idx), 0, track);
    p.clips.push(cut);
  });
  return cut;
}

/** Pone el clip seleccionado (texto, sticker, imagen, forma…) detrás de la persona del video de abajo. */
export function putBehindSubject(overlayId?: string) {
  const p = st().project;
  const overlay = overlayId ? p.clips.find((c) => c.id === overlayId) : selectedClips().find((c) => c.type !== 'audio');
  if (!overlay) { st().toast('Selecciona el texto, sticker o imagen que quieres poner detrás de la persona', 'error'); return; }
  const oIdx = p.tracks.findIndex((t) => t.id === overlay.trackId);
  // buscar el sujeto en pistas inferiores que se solape con el overlay
  const mid = Math.max(overlay.start, Math.min(st().time, overlay.start + overlay.duration - 0.01));
  let subject = subjectAt(mid, oIdx);
  if (!subject) {
    subject = p.clips.filter((c) => (c.type === 'video' || c.type === 'image') && p.tracks.findIndex((t) => t.id === c.trackId) > oIdx)
      .find((c) => c.start < overlay.start + overlay.duration && c.start + c.duration > overlay.start);
  }
  if (!subject) {
    if (overlay.type === 'video' || overlay.type === 'image') { textBehindSubject(overlay); return; }
    st().toast('No hay un video o imagen con persona debajo de este elemento', 'error');
    return;
  }
  st().beginTx();
  const cut = insertCutoutAbove(subject, overlay.trackId, overlay.start, overlay.start + overlay.duration);
  st().endTx();
  if (!cut) { st().toast('El elemento no coincide en el tiempo con el video', 'error'); return; }
  st().set({ selection: [overlay.id] });
  loadSegmenterForUI('selfie');
  st().toast('Listo: el elemento quedó detrás de la persona', 'success', 2500);
}

/** Crea un texto grande entre el fondo y la persona (efecto «texto detrás de la persona»). */
export function textBehindSubject(subjectClip?: Clip) {
  const subject = subjectClip || selectedClips().find((c) => c.type === 'video' || c.type === 'image') || subjectAt(st().time);
  if (!subject) { st().toast('Selecciona un clip de video o imagen con una persona', 'error'); return; }
  const p = st().project;
  loadFont('Anton');
  const t0 = Math.max(subject.start, Math.min(st().time, subject.start + subject.duration - 0.5));
  const dur = Math.max(0.5, Math.min(subject.start + subject.duration - t0, 6));
  st().beginTx();
  // pista para el texto justo encima del sujeto
  const textTrack = createTrack('visual');
  st().commit((pp) => {
    const idx = pp.tracks.findIndex((t) => t.id === subject.trackId);
    textTrack.name = 'Texto (detrás)';
    pp.tracks.splice(Math.max(0, idx), 0, textTrack);
  });
  const text = createClip({ type: 'text', trackId: textTrack.id, start: t0, duration: dur, name: 'Texto detrás de la persona' });
  text.text = {
    ...defaultText('TU TEXTO'), content: 'TU TEXTO', font: 'Anton', weight: 400, size: Math.round(Math.min(p.width, p.height * 0.75) * 0.3), uppercase: true,
    color: '#ffffff', letterSpacing: 2, lineHeight: 0.95,
    shadow: { enabled: true, color: 'rgba(0,0,0,0.35)', blur: 30, x: 0, y: 8 },
  };
  text.transform.y = -p.height * 0.14;
  text.animation.in = 'zoomOut'; text.animation.inDuration = 0.6; text.animation.out = 'fade'; text.animation.outDuration = 0.4;
  st().commit((pp) => { pp.clips.push(text); });
  insertCutoutAbove(subject, textTrack.id, t0, t0 + dur);
  st().endTx();
  st().set({ selection: [text.id], inspectorTab: 'text' });
  st().setTime(t0 + Math.min(0.7, dur / 2));
  loadSegmenterForUI('selfie');
  st().toast('Texto detrás de la persona creado. Edita el texto en el inspector.', 'success', 3500);
}

// ---------------------------------------------------------------------------
//  Mejora de calidad
// ---------------------------------------------------------------------------

/** Analiza un fotograma y devuelve una corrección automática de color (niveles + balance de blancos). */
export function autoColorFrom(src: CanvasImageSource, w: number, h: number) {
  const sc = Math.min(1, 160 / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * sc)), ch = Math.max(1, Math.round(h * sc));
  const c = document.createElement('canvas'); c.width = cw; c.height = ch;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(src, 0, 0, cw, ch);
  const d = g.getImageData(0, 0, cw, ch).data;
  const hist = new Uint32Array(256);
  let r = 0, gg = 0, b = 0, sat = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) {
    const R = d[i] / 255, G = d[i + 1] / 255, B = d[i + 2] / 255;
    const l = 0.2126 * R + 0.7152 * G + 0.0722 * B;
    hist[Math.min(255, Math.round(l * 255))]++;
    r += R; gg += G; b += B; sat += Math.max(R, G, B) - Math.min(R, G, B); n++;
  }
  r /= n; gg /= n; b /= n; sat /= n;
  const pct = (q: number) => { let acc = 0; const target = q * n; for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= target) return i / 255; } return 1; };
  const lo = pct(0.01), hi = pct(0.99), med = pct(0.5);
  const mean = (r + gg + b) / 3;
  return {
    exposure: clamp(Math.log2(0.46 / Math.max(0.05, med)) * 0.45, -0.8, 0.8),
    contrast: clamp((0.85 - (hi - lo)) * 0.45, -0.1, 0.3),
    blacks: clamp(-lo * 0.8, -0.25, 0),
    whites: clamp((0.97 - hi) * 0.6, 0, 0.25),
    temperature: clamp((b - r) * 1.4, -0.3, 0.3),
    tint: clamp(-(gg - (r + b) / 2) * 2, -0.25, 0.25),
    vibrance: clamp((0.22 - sat) * 1.2, 0, 0.3),
    mean,
  };
}

/** Aplica «Mejorar calidad»: efecto enhance + corrección automática de color. */
export function enhanceClips(ids?: string[]) {
  const p = st().project;
  const clips = ids ? p.clips.filter((c) => ids.includes(c.id)) : visualTargets().filter((c) => c.type === 'video' || c.type === 'image');
  if (!clips.length) { st().toast('Selecciona un clip de video o imagen para mejorar', 'error'); return; }
  for (const clip of clips) {
    let auto: ReturnType<typeof autoColorFrom> | null = null;
    try {
      if (clip.type === 'video') { const f = engine.currentClipFrame(clip); if (f) auto = autoColorFrom(f, f.width, f.height); }
      else if (clip.assetId) { const im = getImage(clip.assetId); if (im) auto = autoColorFrom(im.source as CanvasImageSource, im.w, im.h); }
    } catch { /* noop */ }
    const asset = clip.assetId ? st().assets[clip.assetId] : undefined;
    const low = asset && Math.max(asset.width, asset.height) < Math.max(p.width, p.height) * 0.9;
    st().updateClip(clip.id, (c) => {
      const ex = c.effects.find((e) => e.type === 'enhance');
      const params = { ...defaultParams('enhance'), sharpen: low ? 0.7 : 0.5, denoise: low ? 0.45 : 0.3, deband: low ? 0.45 : 0.25 };
      if (ex) { ex.enabled = true; ex.params = params; } else c.effects.unshift({ id: uid('fx'), type: 'enhance', enabled: true, params });
      if (auto) {
        c.grade.exposure = +auto.exposure.toFixed(3); c.grade.contrast = +auto.contrast.toFixed(3);
        c.grade.blacks = +auto.blacks.toFixed(3); c.grade.whites = +auto.whites.toFixed(3);
        c.grade.temperature = +auto.temperature.toFixed(3); c.grade.tint = +auto.tint.toFixed(3); c.grade.vibrance = +auto.vibrance.toFixed(3);
      }
    });
  }
  st().set({ inspectorTab: 'effects' });
  st().toast(`Calidad mejorada en ${clips.length} clip(s): reescalado inteligente, nitidez, reducción de ruido y color automático`, 'success', 3500);
}

/** Preferencia: mejorar automáticamente al importar. */
export const autoEnhancePref = {
  get(): boolean { try { return localStorage.getItem('nc.autoEnhance') === '1'; } catch { return false; } },
  set(v: boolean) { try { localStorage.setItem('nc.autoEnhance', v ? '1' : '0'); } catch { /* noop */ } },
};

/** Re-renderiza un video mejorado y reescalado (1080p, 4K u 8K) como un medio nuevo. */
export async function bakeEnhancedAsset(asset: MediaAsset, targetHeight: number) {
  if (asset.kind !== 'video' && asset.kind !== 'image') return;
  await runTask(`Mejorando ${asset.name} a ${targetHeight >= 4320 ? '8K' : targetHeight >= 2160 ? '4K' : targetHeight + 'p'}`, async (progress, signal) => {
    const ar = (asset.width || 1920) / Math.max(1, asset.height || 1080);
    const portrait = ar < 1;
    // targetHeight se refiere al lado corto
    let w = portrait ? targetHeight : Math.round(targetHeight * ar);
    let h = portrait ? Math.round(targetHeight / ar) : targetHeight;
    w = Math.round(w / 2) * 2; h = Math.round(h / 2) * 2;
    const proj = createProject({ name: asset.name.replace(/\.[^.]+$/, '') + ` (mejorado ${targetHeight >= 4320 ? '8K' : targetHeight >= 2160 ? '4K' : targetHeight + 'p'})`, width: w, height: h, fps: asset.fps || 30 });
    const vt = proj.tracks.find((t) => t.kind === 'visual')!;
    const dur = asset.kind === 'video' ? asset.duration : 5;
    const clip = createClip({ type: asset.kind === 'video' ? 'video' : 'image', trackId: vt.id, start: 0, duration: dur, assetId: asset.id, name: asset.name });
    clip.fit = 'fill';
    clip.effects.push({ id: uid('fx'), type: 'enhance', enabled: true, params: { ...defaultParams('enhance'), sharpen: 0.65, denoise: 0.4, deband: 0.4, clarity: 0.25, color: 0.2 } });
    if (asset.kind === 'video') {
      try {
        const f = await captureFrame(asset.id, Math.min(1, asset.duration / 2), 640);
        if (f) { const a = autoColorFrom(f as CanvasImageSource, f.width, f.height); clip.grade.exposure = a.exposure * 0.7; clip.grade.temperature = a.temperature * 0.7; clip.grade.tint = a.tint * 0.7; clip.grade.vibrance = a.vibrance; clip.grade.contrast = a.contrast * 0.7; }
      } catch { /* noop */ }
    }
    proj.clips.push(clip);
    if (asset.hasAudio) {
      const at = proj.tracks.find((t) => t.kind === 'audio')!;
      const ac = createClip({ type: 'audio', trackId: at.id, start: 0, duration: dur, assetId: asset.id, name: asset.name });
      if (at) proj.clips.push(ac);
      clip.audio.muted = true;
    }
    const assets = { ...st().assets };
    const out = await exportProject(proj, assets, {
      format: asset.kind === 'image' ? 'png' : 'mp4', videoCodec: 'auto', width: w, height: h, fps: proj.fps, quality: 'very-high',
      start: 0, end: dur, includeAudio: !!asset.hasAudio, signal,
      onProgress: (pp, info) => progress(pp, info),
    }).catch(async (e) => {
      if (asset.kind === 'image') throw e;
      // respaldo: WebM (VP9) suele codificar resoluciones más altas
      return exportProject(proj, assets, { format: 'webm', videoCodec: 'auto', width: w, height: h, fps: proj.fps, quality: 'very-high', start: 0, end: dur, includeAudio: !!asset.hasAudio, signal, onProgress: (pp, info) => progress(pp, info) });
    });
    const file = new File([out.blob], out.filename, { type: out.blob.type });
    const [added] = await importFiles([file]);
    st().toast(`Listo: "${out.filename}" (${w}×${h}) añadido a tus medios`, 'success', 5000);
    return added;
  });
}

/** Al añadir un medio al timeline con la preferencia activa, aplicar la mejora. */
export function maybeAutoEnhance(clip: Clip | null) {
  if (!clip || !autoEnhancePref.get()) return;
  if (clip.type !== 'video' && clip.type !== 'image') return;
  setTimeout(() => enhanceClips([clip.id]), 400);
}

hooks.afterAssetAdded = maybeAutoEnhance;
