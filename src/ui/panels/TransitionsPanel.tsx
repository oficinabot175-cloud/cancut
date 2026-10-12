import React, { useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { useEditor, getState } from '../../store/editor';
import { TRANSITIONS } from '../../core/presets';
import { applyTransition } from '../../core/actions';
import { Slider } from '../components/controls';

const ANIM: Record<string, string> = {
  crossfade: 't-fade', dipBlack: 't-fade', dipWhite: 't-fade', lumaFade: 't-fade', wipeLeft: 't-wipe', wipeRight: 't-wipe', wipeUp: 't-slideup', wipeDown: 't-slideup',
  diagonal: 't-wipe', barnDoor: 't-wipe', clock: 't-circle', circle: 't-circle', circleOut: 't-circle', heart: 't-circle',
  slideLeft: 't-slide', slideRight: 't-slide', slideUp: 't-slideup', slideDown: 't-slideup', pushLeft: 't-slide', pushRight: 't-slide',
  zoomIn: 't-zoom', zoomOut: 't-zoom', spin: 't-spin', blur: 't-blur', glitch: 't-fade', pixelate: 't-blur', flash: 't-fade', swirl: 't-spin', ripple: 't-blur', rgbShift: 't-fade', filmBurn: 't-fade',
};

export function TransitionsPanel() {
  const [dur, setDur] = useState(0.8);
  const sel = useEditor((s) => s.project.clips.find((c) => s.selection.includes(c.id) && c.type !== 'audio'));
  const groups = [...new Set(TRANSITIONS.map((t) => t.group))];
  return (
    <div>
      <p className="hint" style={{ marginTop: 0 }}>La transición se aplica al <b>inicio</b> del clip, mezclándolo con el clip anterior de la misma pista (o con lo que hay debajo). Arrástrala sobre un clip o selecciona uno y haz clic.</p>
      <div className="prop"><label>Duración</label><Slider value={dur} min={0.1} max={3} step={0.05} onChange={setDur} unit="s" /><span /></div>
      {sel?.transitionIn && (
        <div className="row between" style={{ marginBottom: 12 }}>
          <span className="muted">Clip actual: <b style={{ color: 'var(--text)' }}>{TRANSITIONS.find((t) => t.type === sel.transitionIn!.type)?.name}</b></span>
          <button className="btn xs danger" onClick={() => getState().updateClip(sel.id, (c) => { c.transitionIn = null; })}>Quitar</button>
        </div>
      )}
      {groups.map((g) => (
        <div className="section" key={g}>
          <div className="section-title"><ArrowLeftRight size={12} />{g}</div>
          <div className="grid">
            {TRANSITIONS.filter((t) => t.group === g).map((t) => (
              <div key={t.type} className={`tile ${sel?.transitionIn?.type === t.type ? 'active' : ''}`} onClick={() => applyTransition(t.type, dur)}
                draggable onDragStart={(e) => { e.dataTransfer.setData('application/x-nc-transition', t.type); e.dataTransfer.setData('text/duration', String(dur)); }}>
                <div className="preview"><div className="trans-thumb" style={{ ['--anim' as any]: ANIM[t.type] || 't-fade' }}><div className="a" /><div className="b" /></div></div>
                <div className="label">{t.name}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
