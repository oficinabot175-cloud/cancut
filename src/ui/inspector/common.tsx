import React from 'react';
import { getState, useEditor } from '../../store/editor';
import type { Clip } from '../../types';
import { evalKeyframes, keyframeAt, upsertKeyframe, ANIMATABLE } from '../../core/keyframes';
import { KeyframeButton, Prop, Slider } from '../components/controls';

export const edit = (id: string, fn: (c: Clip) => void) => getState().updateClip(id, fn);

/** Propiedad animable con soporte de keyframes. */
export function AnimProp({ clip, k, label, min, max, step, format, defaultValue }: { clip: Clip; k: keyof typeof ANIMATABLE; label?: string; min?: number; max?: number; step?: number; format?: (v: number) => string; defaultValue?: number }) {
  const time = useEditor((s) => s.time);
  const def = ANIMATABLE[k];
  const localT = Math.max(0, Math.min(clip.duration, time - clip.start));
  const kfs = clip.keyframes[k];
  const has = !!kfs?.length;
  const base = def.get(clip);
  const value = evalKeyframes(kfs, localT, base);
  const on = !!keyframeAt(clip, k, localT, 0.5 / getState().project.fps);
  const setValue = (v: number) => edit(clip.id, (c) => {
    if (c.keyframes[k]?.length) c.keyframes[k] = upsertKeyframe(c.keyframes[k], { t: localT, v, ease: 'easeInOut' }, 0.5 / getState().project.fps);
    else if (k === 'volume') c.audio.volume = v;
    else (c.transform as any)[k] = v;
  });
  const toggle = () => edit(clip.id, (c) => {
    const tol = 0.5 / getState().project.fps;
    if (on) {
      c.keyframes[k] = (c.keyframes[k] || []).filter((x) => Math.abs(x.t - localT) > tol);
      if (!c.keyframes[k].length) delete c.keyframes[k];
    } else {
      c.keyframes[k] = upsertKeyframe(c.keyframes[k], { t: localT, v: value, ease: 'easeInOut' }, tol);
    }
  });
  const jump = (dir: 1 | -1) => {
    if (!kfs?.length) return;
    const cand = dir > 0 ? kfs.find((x) => x.t > localT + 1e-3) : [...kfs].reverse().find((x) => x.t < localT - 1e-3);
    if (cand) getState().setTime(clip.start + cand.t);
  };
  return (
    <Prop label={label || def.label} extra={<KeyframeButton has={has} on={on} onToggle={toggle} onPrev={() => jump(-1)} onNext={() => jump(1)} />}>
      <Slider value={value} min={min ?? def.min} max={max ?? def.max} step={step ?? def.step} onChange={setValue} defaultValue={defaultValue} />
    </Prop>
  );
}

export function SliderProp({ label, value, min, max, step = 0.01, onChange, defaultValue, title }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; defaultValue?: number; title?: string }) {
  return <Prop label={label} title={title}><Slider value={value} min={min} max={max} step={step} onChange={onChange} defaultValue={defaultValue} /></Prop>;
}
