import React from 'react';
import { Layers, Smile, Square, Droplets } from 'lucide-react';
import { getState } from '../../store/editor';
import { EMOJI_STICKERS } from '../../core/presets';
import { createClip, defaultText } from '../../core/defaults';
import { defaultParams } from '../../core/presets';
import { uid } from '../../core/utils';
import type { EffectType } from '../../types';
import type { ShapeKind } from '../../types';

const SHAPES: { kind: ShapeKind; name: string; svg: React.ReactNode }[] = [
  { kind: 'rect', name: 'Rectángulo', svg: <rect x="6" y="10" width="36" height="28" /> },
  { kind: 'roundRect', name: 'Redondeado', svg: <rect x="6" y="10" width="36" height="28" rx="8" /> },
  { kind: 'circle', name: 'Círculo', svg: <circle cx="24" cy="24" r="16" /> },
  { kind: 'ring', name: 'Anillo', svg: <path d="M24 8a16 16 0 1 0 0.01 0zM24 14a10 10 0 1 1-0.01 0z" fillRule="evenodd" /> },
  { kind: 'triangle', name: 'Triángulo', svg: <path d="M24 8 42 40H6z" /> },
  { kind: 'star', name: 'Estrella', svg: <path d="m24 6 5 12 13 1-10 8 3 13-11-7-11 7 3-13-10-8 13-1z" /> },
  { kind: 'heart', name: 'Corazón', svg: <path d="M24 40S6 29 6 18a9 9 0 0 1 18-2 9 9 0 0 1 18 2c0 11-18 22-18 22z" /> },
  { kind: 'arrow', name: 'Flecha', svg: <path d="M6 20h22v-8l14 12-14 12v-8H6z" /> },
  { kind: 'polygon', name: 'Hexágono', svg: <path d="m24 6 16 9v18l-16 9-16-9V15z" /> },
  { kind: 'bubble', name: 'Globo', svg: <path d="M8 8h32v24H20l-8 8v-8H8z" /> },
  { kind: 'line', name: 'Línea', svg: <rect x="4" y="22" width="40" height="4" rx="2" /> },
  { kind: 'cross', name: 'Cruz', svg: <path d="M19 6h10v13h13v10H29v13H19V29H6V19h13z" /> },
];

const BACKGROUNDS: { name: string; color: string; gradient?: [string, string, number] }[] = [
  { name: 'Negro', color: '#000000' }, { name: 'Blanco', color: '#ffffff' }, { name: 'Grafito', color: '#1b1f2a' },
  { name: 'Verde croma', color: '#00b140' }, { name: 'Azul croma', color: '#0047bb' },
  { name: 'Violeta', color: '#7c5cff', gradient: ['#7c5cff', '#00d4ff', 45] },
  { name: 'Atardecer', color: '#ff7a18', gradient: ['#ff7a18', '#af002d', 90] },
  { name: 'Océano', color: '#2193b0', gradient: ['#2193b0', '#6dd5ed', 90] },
  { name: 'Menta', color: '#11998e', gradient: ['#11998e', '#38ef7d', 45] },
  { name: 'Noche', color: '#0f2027', gradient: ['#0f2027', '#2c5364', 90] },
  { name: 'Rosa', color: '#ee9ca7', gradient: ['#ee9ca7', '#ffdde1', 90] },
  { name: 'Fuego', color: '#f12711', gradient: ['#f12711', '#f5af19', 90] },
];

const ZONE_SHAPES: { shape: 'rect' | 'ellipse' | 'heart' | 'star'; radius: number; name: string; svg: React.ReactNode }[] = [
  { shape: 'rect', radius: 0, name: 'Rectángulo', svg: <rect x="6" y="12" width="36" height="24" /> },
  { shape: 'rect', radius: 0.35, name: 'Redondeado', svg: <rect x="6" y="12" width="36" height="24" rx="8" /> },
  { shape: 'ellipse', radius: 0, name: 'Elipse', svg: <ellipse cx="24" cy="24" rx="18" ry="13" /> },
  { shape: 'heart', radius: 0, name: 'Corazón', svg: <path d="M24 40S6 29 6 18a9 9 0 0 1 18-2 9 9 0 0 1 18 2c0 11-18 22-18 22z" /> },
  { shape: 'star', radius: 0, name: 'Estrella', svg: <path d="m24 6 5 12 13 1-10 8 3 13-11-7-11 7 3-13-10-8 13-1z" /> },
];
const ZONE_FX: { id: string; name: string; effects: { type: EffectType; params?: Record<string, number | string | boolean> }[] }[] = [
  { id: 'blur', name: 'Desenfocar', effects: [{ type: 'blur', params: { radius: 30 } }] },
  { id: 'pixel', name: 'Pixelar', effects: [{ type: 'pixelate', params: { size: 28 } }] },
  { id: 'glass', name: 'Cristal esmerilado', effects: [{ type: 'blur', params: { radius: 22 } }, { type: 'colorOverlay', params: { color: '#ffffff', amount: 0.18 } }] },
  { id: 'dark', name: 'Oscurecer', effects: [{ type: 'blur', params: { radius: 12 } }, { type: 'colorOverlay', params: { color: '#000000', amount: 0.55 } }] },
  { id: 'bw', name: 'Blanco y negro', effects: [] },
];

export function addBlurZone(shape: typeof ZONE_SHAPES[number], fxId = 'blur') {
  const s = getState();
  const fx = ZONE_FX.find((f) => f.id === fxId) || ZONE_FX[0];
  const c = createClip({ type: 'adjustment', trackId: '', start: s.time, duration: 5, name: `Zona · ${fx.name}` });
  c.region = { shape: shape.shape, radius: shape.radius, feather: 0.08, invert: false };
  c.transform.scaleX = 0.32; c.transform.scaleY = shape.shape === 'rect' ? 0.22 : 0.32 * (s.project.width / s.project.height);
  if (shape.shape === 'heart' || shape.shape === 'star' || shape.shape === 'ellipse') c.transform.scaleY = Math.min(0.6, 0.32 * (s.project.width / s.project.height) * (shape.shape === 'ellipse' ? 0.75 : 1));
  c.effects = fx.effects.map((e) => ({ id: uid('fx'), type: e.type, enabled: true, params: { ...defaultParams(e.type), ...(e.params || {}) } }));
  if (fxId === 'bw') c.grade.mono = 1;
  const added = s.addClip(c, { newTrack: true });
  s.set({ selection: [added.id], inspectorTab: 'basic' });
}

export function ElementsPanel() {
  const [zoneFx, setZoneFx] = React.useState('blur');
  const st = getState;
  const addSticker = (emoji: string) => {
    const s = st();
    const c = s.addTextClip({} as any, emoji);
    s.updateClip(c.id, (x) => {
      x.text = { ...defaultText(emoji), size: 220, shadow: { enabled: false, color: '#000', blur: 0, x: 0, y: 0 }, weight: 400 };
      x.name = 'Sticker ' + emoji;
      x.animation.in = 'pop'; x.animation.inDuration = 0.4;
    });
  };
  const addBg = (b: typeof BACKGROUNDS[number]) => {
    const s = st();
    const p = s.project;
    const bottom = [...p.tracks].reverse().find((t) => t.kind === 'visual');
    const c = createClip({ type: 'solid', trackId: bottom?.id || '', start: s.time, duration: 5, name: 'Fondo ' + b.name });
    c.fit = 'fill';
    c.solid = { color: b.color, gradient: b.gradient ? { enabled: true, from: b.gradient[0], to: b.gradient[1], angle: b.gradient[2] } : { enabled: false, from: b.color, to: b.color, angle: 0 } };
    s.addClip(c);
  };
  const addAdjustment = () => {
    const s = st();
    const c = createClip({ type: 'adjustment', trackId: '', start: s.time, duration: 5, name: 'Capa de ajuste' });
    s.addClip(c, { newTrack: false });
    s.set({ inspectorTab: 'color' });
  };
  return (
    <div>
      <div className="ai-card">
        <h4><Layers size={15} />Capa de ajuste</h4>
        <p>Aplica color, filtros y efectos a todas las pistas que quedan debajo, como en Premiere y DaVinci.</p>
        <button className="btn sm primary" onClick={addAdjustment}>Añadir capa de ajuste</button>
      </div>
      <div className="ai-card">
        <h4><Droplets size={15} />Zona de desenfoque (forma editable)</h4>
        <p>Una forma que puedes mover, girar y redimensionar en el visor y que difumina (o pixela) todo lo que tiene debajo: matrículas, pantallas, rostros, datos…</p>
        <div className="chips" style={{ marginBottom: 8 }}>
          {ZONE_FX.map((f) => <button key={f.id} className={`chip ${zoneFx === f.id ? 'active' : ''}`} onClick={() => setZoneFx(f.id)}>{f.name}</button>)}
        </div>
        <div className="grid sm">
          {ZONE_SHAPES.map((z) => (
            <div key={z.name} className="tile" title={`${z.name} · ${ZONE_FX.find((f) => f.id === zoneFx)?.name}`} onClick={() => addBlurZone(z, zoneFx)}>
              <div className="preview" style={{ aspectRatio: '1', background: 'repeating-linear-gradient(45deg,#1d2230 0 6px,#262c3b 6px 12px)' }}>
                <svg viewBox="0 0 48 48" width="38" height="38" fill="rgba(255,255,255,.35)" stroke="#fff" strokeWidth="1.5" style={{ filter: 'blur(.3px)' }}>{z.svg}</svg>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="section">
        <div className="section-title"><Square size={12} />Formas</div>
        <div className="grid sm">
          {SHAPES.map((s) => (
            <div key={s.kind} className="tile" title={s.name} onClick={() => st().addShapeClip(s.kind)}
              draggable onDragStart={(e) => e.dataTransfer.setData('application/x-nc-shape', s.kind)}>
              <div className="preview" style={{ aspectRatio: '1' }}><svg viewBox="0 0 48 48" width="38" height="38" fill="url(#g1)">
                <defs><linearGradient id="g1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#8a6bff" /><stop offset="1" stopColor="#00d4ff" /></linearGradient></defs>{s.svg}</svg></div>
            </div>
          ))}
        </div>
      </div>
      <div className="section">
        <div className="section-title"><Smile size={12} />Stickers y emojis</div>
        <div className="grid sm" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(44px, 1fr))' }}>
          {EMOJI_STICKERS.map((e) => <div key={e} className="emoji" onClick={() => addSticker(e)} style={{ fontSize: 24 }}>{e}</div>)}
        </div>
      </div>
      <div className="section">
        <div className="section-title">Fondos de color</div>
        <div className="grid sm">
          {BACKGROUNDS.map((b) => (
            <div key={b.name} className="tile" onClick={() => addBg(b)} title={b.name}>
              <div className="preview" style={{ aspectRatio: '1', background: b.gradient ? `linear-gradient(${b.gradient[2] + 90}deg, ${b.gradient[0]}, ${b.gradient[1]})` : b.color }} />
              <div className="label">{b.name}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
