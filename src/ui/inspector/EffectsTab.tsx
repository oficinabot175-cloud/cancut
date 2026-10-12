import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Trash2, ArrowUp, ArrowDown, Plus, Copy } from 'lucide-react';
import type { Clip, EffectType } from '../../types';
import { edit } from './common';
import { EFFECTS, EFFECT_MAP, ParamDef } from '../../core/presets';
import { ColorField, Prop, Select, Slider, Toggle } from '../components/controls';
import { addEffect } from '../../core/actions';
import { useEditor, getState } from '../../store/editor';
import { uid } from '../../core/utils';
import { loadSegmenter } from '../../ai/vision';

function ParamControl({ clip, fxId, def, value }: { clip: Clip; fxId: string; def: ParamDef; value: any }) {
  const trackings = useEditor((s) => s.project.trackings);
  const setP = (v: any) => edit(clip.id, (c) => { const f = c.effects.find((x) => x.id === fxId); if (f) f.params[def.key] = v; });
  switch (def.type) {
    case 'range': return <Prop label={def.label}><Slider value={Number(value ?? def.default)} min={def.min} max={def.max} step={def.step} defaultValue={def.default} onChange={setP} /></Prop>;
    case 'color': return <Prop label={def.label}><ColorField value={String(value ?? def.default)} onChange={setP} /></Prop>;
    case 'bool': return <Prop label={def.label}><Toggle value={!!value} onChange={setP} /></Prop>;
    case 'select': return <Prop label={def.label}><Select value={String(value ?? def.default)} onChange={(v) => { setP(v); if (def.key === 'model') loadSegmenter(v as any).catch(() => null); }} options={def.options} style={{ width: '100%' }} /></Prop>;
    case 'tracking': {
      const opts = trackings.filter((t) => t.assetId === clip.assetId && (t.kind === 'object' || t.kind === 'faces'));
      return <Prop label={def.label}><Select value={String(value || '')} onChange={setP} options={[{ value: '', label: 'Posición fija' }, ...opts.map((t) => ({ value: t.id, label: t.name }))]} style={{ width: '100%' }} /></Prop>;
    }
  }
}

export function EffectsTab({ clip }: { clip: Clip }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [adding, setAdding] = useState<EffectType | ''>('');
  const effects = clip.effects;
  return (
    <div>
      <div className="row" style={{ marginBottom: 10 }}>
        <Select value={adding} onChange={(v) => setAdding(v)} options={[{ value: '', label: 'Añadir efecto…' }, ...EFFECTS.map((e) => ({ value: e.type, label: `${e.group} · ${e.name}` }))]} style={{ flex: 1 }} />
        <button className="btn sm primary" disabled={!adding} onClick={() => { if (adding) { addEffect(adding, [clip.id]); setAdding(''); } }}><Plus size={13} /></button>
      </div>
      {!effects.length && <div className="empty">Sin efectos. Arrastra efectos desde el panel izquierdo o añádelos aquí.</div>}
      {effects.map((f, i) => {
        const def = EFFECT_MAP[f.type];
        if (!def) return null;
        const isOpen = open[f.id] ?? true;
        const params = def.params.filter((p) => {
          if (f.type === 'regionBlur' && p.key === 'color') return f.params.mode === 'solid';
          if (f.type === 'bgRemove' && p.key === 'blur') return f.params.mode === 'blur';
          if (f.type === 'bgRemove' && p.key === 'color') return f.params.mode === 'color';
          if ((f.type === 'regionBlur' || f.type === 'focus') && ['x', 'y', 'w', 'h'].includes(p.key)) return !f.params.tracking;
          if ((f.type === 'regionBlur' || f.type === 'focus') && p.key === 'expand') return !!f.params.tracking;
          return true;
        });
        return (
          <div key={f.id} className={`effect-card ${f.enabled ? '' : 'disabled'}`}>
            <div className="head">
              <button className="icon-btn sm" onClick={() => setOpen({ ...open, [f.id]: !isOpen })}>{isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</button>
              <span className="nm" onClick={() => setOpen({ ...open, [f.id]: !isOpen })}>{def.icon} {def.name}</span>
              <Toggle value={f.enabled} onChange={(v) => edit(clip.id, (c) => { c.effects[i].enabled = v; })} title="Activar / desactivar" />
              <button className="icon-btn sm" title="Subir" disabled={i === 0} onClick={() => edit(clip.id, (c) => { const [x] = c.effects.splice(i, 1); c.effects.splice(i - 1, 0, x); })}><ArrowUp size={12} /></button>
              <button className="icon-btn sm" title="Bajar" disabled={i === effects.length - 1} onClick={() => edit(clip.id, (c) => { const [x] = c.effects.splice(i, 1); c.effects.splice(i + 1, 0, x); })}><ArrowDown size={12} /></button>
              <button className="icon-btn sm" title="Duplicar" onClick={() => edit(clip.id, (c) => { c.effects.splice(i + 1, 0, { ...c.effects[i], id: uid('fx'), params: { ...c.effects[i].params } }); })}><Copy size={12} /></button>
              <button className="icon-btn sm" title="Eliminar" onClick={() => edit(clip.id, (c) => { c.effects.splice(i, 1); })}><Trash2 size={12} /></button>
            </div>
            {isOpen && (
              <div className="body">
                {params.map((p) => <ParamControl key={p.key} clip={clip} fxId={f.id} def={p} value={f.params[p.key]} />)}
                {(f.type === 'regionBlur' || f.type === 'focus') && !f.params.tracking && <p className="hint">Arrastra la zona naranja en el visor para moverla o redimensionarla. Usa “Seguimiento de objeto” (panel IA) para que siga un objeto.</p>}
                {f.type === 'bgRemove' && <p className="hint">La IA se descarga una sola vez (~1–3 MB) y funciona sin conexión después. Ajusta el umbral si se recorta de más o de menos.</p>}
              </div>
            )}
          </div>
        );
      })}
      {effects.length > 1 && <p className="hint">Los efectos se aplican en orden, de arriba hacia abajo.</p>}
      {effects.length > 0 && <button className="btn xs ghost" onClick={() => { if (confirm('¿Quitar todos los efectos?')) edit(clip.id, (c) => { c.effects = []; }); }}>Quitar todos</button>}
    </div>
  );
}
