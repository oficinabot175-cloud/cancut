import React, { useEffect, useRef, useState } from 'react';
import { RotateCcw, Upload } from 'lucide-react';
import type { Clip, CurvePoint, Curves } from '../../types';
import { edit, SliderProp } from './common';
import { Collapsible, Prop, Select, Slider, Seg, ColorField, tx } from '../components/controls';
import { FILTERS } from '../../core/presets';
import { defaultGrade } from '../../core/defaults';
import { defaultCurves, curveTable } from '../../core/curves';
import { useEditor, getState } from '../../store/editor';
import { importLut } from '../../core/actions';
import { pickFiles, clamp } from '../../core/utils';

/** Rueda de color (lift / gamma / gain) estilo DaVinci. */
function ColorWheel({ label, value, onChange }: { label: string; value: [number, number, number]; onChange: (v: [number, number, number]) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const S = 172;
  // vector RGB → posición: proyectar sobre ejes de crominancia
  const toXY = (v: [number, number, number]) => {
    const m = (v[0] + v[1] + v[2]) / 3;
    const r = v[0] - m, g = v[1] - m, b = v[2] - m;
    const x = r * Math.cos(0) + g * Math.cos((2 * Math.PI) / 3) + b * Math.cos((4 * Math.PI) / 3);
    const y = r * Math.sin(0) + g * Math.sin((2 * Math.PI) / 3) + b * Math.sin((4 * Math.PI) / 3);
    return { x: x / 0.75, y: y / 0.75, m };
  };
  const fromXY = (x: number, y: number, m: number): [number, number, number] => {
    const ch = (a: number) => (x * Math.cos(a) + y * Math.sin(a)) * 0.5;
    return [m + ch(0), m + ch((2 * Math.PI) / 3), m + ch((4 * Math.PI) / 3)].map((v) => Math.round(v * 1000) / 1000) as [number, number, number];
  };
  useEffect(() => {
    const c = ref.current!;
    c.width = S; c.height = S;
    const g = c.getContext('2d')!;
    const img = g.createImageData(S, S);
    const R = S / 2 - 4;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const dx = x - S / 2, dy = y - S / 2;
      const d = Math.hypot(dx, dy);
      const i = (y * S + x) * 4;
      if (d > R) { img.data[i + 3] = 0; continue; }
      const a = Math.atan2(-dy, dx);
      const sat = d / R;
      const col = [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3].map((o) => 0.5 + 0.5 * sat * Math.cos(a - o));
      img.data[i] = col[0] * 200 + 30; img.data[i + 1] = col[1] * 200 + 30; img.data[i + 2] = col[2] * 200 + 30; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const { x, y } = toXY(value);
    g.strokeStyle = 'rgba(0,0,0,.4)'; g.beginPath(); g.moveTo(S / 2, 4); g.lineTo(S / 2, S - 4); g.moveTo(4, S / 2); g.lineTo(S - 4, S / 2); g.stroke();
    const px = S / 2 + clamp(x, -1, 1) * R, py = S / 2 - clamp(y, -1, 1) * R;
    g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 2;
    g.beginPath(); g.arc(px, py, 7, 0, Math.PI * 2); g.fill(); g.stroke();
  }, [value]);
  const handle = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const R = r.width / 2 - 2;
    let x = (e.clientX - r.left - r.width / 2) / R, y = -(e.clientY - r.top - r.height / 2) / R;
    const d = Math.hypot(x, y); if (d > 1) { x /= d; y /= d; }
    onChange(fromXY(x, y, toXY(value).m));
  };
  const m = toXY(value).m;
  return (
    <div className="wheel">
      <canvas ref={ref} onPointerDown={(e) => { tx.begin(); (e.target as HTMLElement).setPointerCapture(e.pointerId); handle(e); }} onPointerMove={(e) => { if (e.buttons) handle(e); }} onPointerUp={tx.end} onDoubleClick={() => onChange([0, 0, 0])} title="Doble clic para restablecer" />
      <span>{label}</span>
      <input type="range" min={-0.5} max={0.5} step={0.005} value={m} style={{ width: 80 }} onPointerDown={tx.begin} onPointerUp={tx.end}
        onChange={(e) => { const nm = parseFloat(e.target.value); onChange(value.map((v) => v - m + nm) as [number, number, number]); }} />
    </div>
  );
}

/** Editor de curvas RGB. */
function CurvesEditor({ curves, onChange }: { curves: Curves; onChange: (c: Curves) => void }) {
  const [ch, setCh] = useState<'master' | 'r' | 'g' | 'b'>('master');
  const ref = useRef<HTMLCanvasElement>(null);
  const drag = useRef<number | null>(null);
  const pts = curves[ch];
  const color = { master: '#ffffff', r: '#ff5050', g: '#40e080', b: '#5090ff' }[ch];
  useEffect(() => {
    const c = ref.current!;
    const S = 260; c.width = S; c.height = S;
    const g = c.getContext('2d')!;
    g.fillStyle = '#07090d'; g.fillRect(0, 0, S, S);
    g.strokeStyle = 'rgba(255,255,255,.07)';
    for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo((S * i) / 4, 0); g.lineTo((S * i) / 4, S); g.moveTo(0, (S * i) / 4); g.lineTo(S, (S * i) / 4); g.stroke(); }
    g.strokeStyle = 'rgba(255,255,255,.15)'; g.beginPath(); g.moveTo(0, S); g.lineTo(S, 0); g.stroke();
    (['r', 'g', 'b', 'master'] as const).filter((k) => k !== ch).forEach((k) => {
      const t = curveTable(curves[k]);
      g.strokeStyle = { master: 'rgba(255,255,255,.25)', r: 'rgba(255,80,80,.3)', g: 'rgba(64,224,128,.3)', b: 'rgba(80,144,255,.3)' }[k];
      g.beginPath(); for (let i = 0; i < 256; i++) { const x = (i / 255) * S, y = S - (t[i] / 255) * S; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
    });
    const t = curveTable(pts);
    g.strokeStyle = color; g.lineWidth = 2;
    g.beginPath(); for (let i = 0; i < 256; i++) { const x = (i / 255) * S, y = S - (t[i] / 255) * S; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
    g.lineWidth = 1;
    for (const p of pts) { g.fillStyle = '#07090d'; g.strokeStyle = color; g.beginPath(); g.arc(p.x * S, S - p.y * S, 5, 0, Math.PI * 2); g.fill(); g.stroke(); }
  }, [curves, ch]);
  const pos = (e: { clientX: number; clientY: number }) => { const r = ref.current!.getBoundingClientRect(); return { x: clamp((e.clientX - r.left) / r.width, 0, 1), y: clamp(1 - (e.clientY - r.top) / r.height, 0, 1) }; };
  const setPts = (np: CurvePoint[]) => onChange({ ...curves, [ch]: np.sort((a, b) => a.x - b.x) });
  return (
    <div>
      <div className="row between" style={{ marginBottom: 6 }}>
        <Seg value={ch} onChange={setCh} options={[{ value: 'master', label: 'Y' }, { value: 'r', label: 'R' }, { value: 'g', label: 'G' }, { value: 'b', label: 'B' }]} />
        <button className="btn xs ghost" onClick={() => setPts([{ x: 0, y: 0 }, { x: 1, y: 1 }])}>Restablecer</button>
      </div>
      <canvas ref={ref} className="curves"
        onPointerDown={(e) => {
          const p = pos(e);
          tx.begin();
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          let idx = pts.findIndex((q) => Math.hypot(q.x - p.x, q.y - p.y) < 0.05);
          if (idx < 0) { const np = [...pts, p]; setPts(np); idx = np.sort((a, b) => a.x - b.x).findIndex((q) => q.x === p.x && q.y === p.y); }
          drag.current = idx;
        }}
        onPointerMove={(e) => {
          if (drag.current === null) return;
          const p = pos(e);
          const np = pts.map((q, i) => (i === drag.current ? (i === 0 ? { x: 0, y: p.y } : i === pts.length - 1 && q.x === 1 ? { x: 1, y: p.y } : p) : q));
          onChange({ ...curves, [ch]: np });
        }}
        onPointerUp={() => { drag.current = null; tx.end(); }}
        onDoubleClick={(e) => { const p = pos(e); const idx = pts.findIndex((q) => Math.hypot(q.x - p.x, q.y - p.y) < 0.05); if (idx > 0 && idx < pts.length - 1) setPts(pts.filter((_, i) => i !== idx)); }}
      />
      <p className="hint">Clic para añadir puntos, arrastra para ajustar, doble clic para eliminar.</p>
    </div>
  );
}

export function ColorTab({ clip }: { clip: Clip }) {
  const g = clip.grade;
  const luts = useEditor((s) => s.project.luts);
  const set = (fn: (gr: Clip['grade']) => void) => edit(clip.id, (c) => fn(c.grade));
  const num = (k: keyof Clip['grade'], label: string, min = -1, max = 1, step = 0.01) => (
    <SliderProp label={label} value={g[k] as number} min={min} max={max} step={step} defaultValue={0} onChange={(v) => set((gr) => { (gr as any)[k] = v; })} />
  );
  return (
    <div>
      <div className="row between" style={{ marginBottom: 10 }}>
        <span className="muted">Corrección y gradación de color</span>
        <button className="btn xs" onClick={() => set((gr) => Object.assign(gr, defaultGrade()))}><RotateCcw size={11} />Restablecer</button>
      </div>
      <Collapsible title="Filtro / Look">
        <Prop label="Filtro"><Select value={g.filter} onChange={(v) => set((gr) => { gr.filter = v; })} options={FILTERS.map((f) => ({ value: f.id, label: `${f.group} · ${f.name}` }))} style={{ width: '100%' }} /></Prop>
        {g.filter !== 'none' && <SliderProp label="Intensidad" value={g.filterIntensity} min={0} max={1} defaultValue={1} onChange={(v) => set((gr) => { gr.filterIntensity = v; })} />}
        <Prop label="LUT 3D">
          <div className="row">
            <Select value={g.lutId || ''} onChange={(v) => set((gr) => { gr.lutId = v || null; })} options={[{ value: '', label: 'Ninguno' }, ...luts.map((l) => ({ value: l.id, label: l.name }))]} style={{ flex: 1, minWidth: 0 }} />
            <button className="icon-btn sm" title="Importar .cube" onClick={async () => { const [f] = await pickFiles('.cube', false); if (f) importLut(f).catch((e) => getState().toast(e.message, 'error')); }}><Upload size={12} /></button>
          </div>
        </Prop>
        {g.lutId && <SliderProp label="Mezcla LUT" value={g.lutIntensity} min={0} max={1} defaultValue={1} onChange={(v) => set((gr) => { gr.lutIntensity = v; })} />}
      </Collapsible>
      <Collapsible title="Básico">
        {num('exposure', 'Exposición', -3, 3)}
        {num('contrast', 'Contraste')}
        {num('highlights', 'Altas luces')}
        {num('shadows', 'Sombras')}
        {num('whites', 'Blancos')}
        {num('blacks', 'Negros')}
      </Collapsible>
      <Collapsible title="Color">
        {num('temperature', 'Temperatura')}
        {num('tint', 'Matiz (tinte)')}
        {num('saturation', 'Saturación')}
        {num('vibrance', 'Intensidad')}
        {num('hue', 'Tono', -180, 180, 1)}
      </Collapsible>
      <Collapsible title="Ruedas de color (Lift · Gamma · Gain)" defaultOpen={false}>
        <div className="wheels">
          <ColorWheel label="Sombras" value={g.lift} onChange={(v) => set((gr) => { gr.lift = v; })} />
          <ColorWheel label="Medios" value={g.gamma} onChange={(v) => set((gr) => { gr.gamma = v; })} />
          <ColorWheel label="Luces" value={g.gain} onChange={(v) => set((gr) => { gr.gain = v; })} />
        </div>
      </Collapsible>
      <Collapsible title="Curvas" defaultOpen={false}>
        <CurvesEditor curves={g.curves || defaultCurves()} onChange={(cv) => set((gr) => { gr.curves = cv; })} />
      </Collapsible>
      <Collapsible title="Virado partido (split toning)" defaultOpen={false}>
        <Prop label="Sombras"><ColorField value={g.splitShadow} onChange={(v) => set((gr) => { gr.splitShadow = v; })} /></Prop>
        <Prop label="Luces"><ColorField value={g.splitHighlight} onChange={(v) => set((gr) => { gr.splitHighlight = v; })} /></Prop>
        {num('splitAmount', 'Cantidad', 0, 1)}
      </Collapsible>
      <Collapsible title="Efectos de color" defaultOpen={false}>
        {num('sharpen', 'Nitidez', 0, 2)}
        {num('vignette', 'Viñeta')}
        {num('fade', 'Desvanecer', 0, 1)}
        {num('mono', 'Blanco y negro', 0, 1)}
        {num('sepia', 'Sepia', 0, 1)}
      </Collapsible>
    </div>
  );
}

export { Slider };
