import type { Clip, Easing, Keyframe } from '../types';

export function ease(type: Easing, t: number): number {
  switch (type) {
    case 'linear': return t;
    case 'easeIn': return t * t * t;
    case 'easeOut': return 1 - Math.pow(1 - t, 3);
    case 'easeInOut': return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    case 'hold': return 0;
    case 'back': {
      const c1 = 1.70158, c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }
    case 'bounce': {
      const n1 = 7.5625, d1 = 2.75;
      if (t < 1 / d1) return n1 * t * t;
      if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
      if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
      return n1 * (t -= 2.625 / d1) * t + 0.984375;
    }
    case 'elastic': {
      if (t === 0 || t === 1) return t;
      const c4 = (2 * Math.PI) / 3;
      return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
    }
  }
  return t;
}

/** Evalúa una lista de keyframes en el tiempo local t. */
export function evalKeyframes(kfs: Keyframe[] | undefined, t: number, fallback: number): number {
  if (!kfs || kfs.length === 0) return fallback;
  if (kfs.length === 1) return kfs[0].v;
  if (t <= kfs[0].t) return kfs[0].v;
  const last = kfs[kfs.length - 1];
  if (t >= last.t) return last.v;
  let lo = 0, hi = kfs.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (kfs[mid].t <= t) lo = mid; else hi = mid;
  }
  const a = kfs[lo], b = kfs[hi];
  const span = b.t - a.t || 1e-6;
  const p = ease(a.ease, (t - a.t) / span);
  return a.v + (b.v - a.v) * p;
}

/** Obtiene el valor de una propiedad animable del clip (con keyframes si existen). */
export function prop(clip: Clip, key: string, localT: number, base: number): number {
  return evalKeyframes(clip.keyframes[key], localT, base);
}

export function hasKeyframes(clip: Clip, key: string) {
  return !!clip.keyframes[key]?.length;
}

export function keyframeAt(clip: Clip, key: string, localT: number, tol = 1 / 60): Keyframe | undefined {
  return clip.keyframes[key]?.find((k) => Math.abs(k.t - localT) <= tol);
}

/** Inserta o reemplaza un keyframe (retorna nueva lista ordenada). */
export function upsertKeyframe(list: Keyframe[] | undefined, kf: Keyframe, tol = 1 / 60): Keyframe[] {
  const out = (list || []).filter((k) => Math.abs(k.t - kf.t) > tol);
  out.push(kf);
  out.sort((a, b) => a.t - b.t);
  return out;
}

/** Valores base de propiedades animables, mapeo clave → lector. */
export const ANIMATABLE: Record<string, { label: string; get: (c: Clip) => number; min: number; max: number; step: number }> = {
  x: { label: 'Posición X', get: (c) => c.transform.x, min: -4000, max: 4000, step: 1 },
  y: { label: 'Posición Y', get: (c) => c.transform.y, min: -4000, max: 4000, step: 1 },
  scale: { label: 'Escala', get: (c) => c.transform.scale, min: 0.01, max: 10, step: 0.01 },
  rotation: { label: 'Rotación', get: (c) => c.transform.rotation, min: -720, max: 720, step: 0.1 },
  opacity: { label: 'Opacidad', get: (c) => c.transform.opacity, min: 0, max: 1, step: 0.01 },
  volume: { label: 'Volumen', get: (c) => c.audio.volume, min: 0, max: 2, step: 0.01 },
};
