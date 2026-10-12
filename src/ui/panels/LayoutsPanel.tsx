import React, { useEffect, useMemo, useRef, useState } from 'react';
import { LayoutTemplate, ArrowLeftRight, Image as ImageIcon, Move } from 'lucide-react';
import { useEditor, getState } from '../../store/editor';
import { LAYOUTS, LayoutAspect, LayoutDef, FRAME_STYLES, FrameStyle, BACKGROUNDS, BackgroundDef, applyLayout, addBackground, drawBackground, ASPECT_SIZE } from '../../core/layouts';
import { Select, ColorField } from '../components/controls';
import { stabilizeClip } from '../../core/actions';

function LayoutThumb({ def, accent }: { def: LayoutDef; accent: string }) {
  const [W, H] = ASPECT_SIZE[def.aspect];
  const vw = 160, vh = (160 * H) / W;
  const box = (sl: LayoutDef['cam'], kind: 'cam' | 'screen') => {
    if (!sl) return null;
    let x = sl.x * vw, y = sl.y * vh, w = sl.w * vw, h = sl.h * vh;
    if (sl.circle) { const s = Math.min(w, h); x += (w - s) / 2; y += (h - s) / 2; w = h = s; }
    const full = sl.w >= 0.999 && sl.h >= 0.999;
    return (
      <g>
        <rect x={x} y={y} width={w} height={h} rx={sl.circle ? w / 2 : full ? 0 : 5} fill={kind === 'cam' ? '#3b2f6b' : '#1f3a5c'} stroke={full ? 'none' : accent} strokeWidth={1.2} />
        {kind === 'cam'
          ? <g transform={`translate(${x + w / 2},${y + h / 2})`} fill="#c9b8ff"><circle r={Math.min(w, h) * 0.13} cy={-Math.min(w, h) * 0.08} /><path d={`M${-Math.min(w, h) * 0.22} ${Math.min(w, h) * 0.25} a${Math.min(w, h) * 0.22} ${Math.min(w, h) * 0.18} 0 0 1 ${Math.min(w, h) * 0.44} 0z`} /></g>
          : <g fill="#8fc3ff" opacity=".8"><rect x={x + w * 0.1} y={y + h * 0.12} width={w * 0.8} height={Math.max(2, h * 0.08)} rx={1} /><rect x={x + w * 0.1} y={y + h * 0.3} width={w * 0.5} height={Math.max(2, h * 0.05)} rx={1} /><rect x={x + w * 0.1} y={y + h * 0.42} width={w * 0.65} height={Math.max(2, h * 0.05)} rx={1} /></g>}
      </g>
    );
  };
  const order = def.camOnTop ? [box(def.screen, 'screen'), box(def.cam, 'cam')] : [box(def.cam, 'cam'), box(def.screen, 'screen')];
  return (
    <svg viewBox={`0 0 ${vw} ${vh}`} style={{ width: '100%', height: '100%' }} preserveAspectRatio="xMidYMid meet">
      <rect width={vw} height={vh} fill="#0d1120" />
      {order}
    </svg>
  );
}

function BgThumb({ b }: { b: BackgroundDef }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { const c = ref.current; if (c) drawBackground(c.getContext('2d', { willReadFrequently: true })!, c.width, c.height, b); }, [b]);
  return b.kind === 'blur'
    ? <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg,#334,#556)', filter: 'blur(.5px)' }}><ImageIcon size={18} /></div>
    : <canvas ref={ref} width={160} height={90} />;
}

export function LayoutsPanel() {
  const project = useEditor((s) => s.project);
  const assets = useEditor((s) => s.assets);
  const selection = useEditor((s) => s.selection);
  const projAspect: LayoutAspect = useMemo(() => {
    const r = project.width / project.height;
    return Math.abs(r - 9 / 16) < 0.02 ? '9:16' : Math.abs(r - 1) < 0.02 ? '1:1' : Math.abs(r - 0.8) < 0.02 ? '4:5' : '16:9';
  }, [project.width, project.height]);
  const [aspect, setAspect] = useState<LayoutAspect>(projAspect);
  const [style, setStyle] = useState<FrameStyle>('glow');
  const [accent, setAccent] = useState('#7c5cff');
  const [bg, setBg] = useState<string>('midnight');

  // fuentes disponibles: clips visuales del proyecto + medios de video/imagen
  const options = useMemo(() => {
    const clips = project.clips.filter((c) => (c.type === 'video' || c.type === 'image') && !c.name.startsWith('Fondo de diseño')).map((c) => ({ value: 'clip:' + c.id, label: `▶ ${c.name}` }));
    const media = Object.values(assets).filter((a) => (a.kind === 'video' || a.kind === 'image') && a.status === 'ready').map((a) => ({ value: 'asset:' + a.id, label: `＋ ${a.name} (medios)` }));
    return [{ value: '', label: '— ninguno —' }, ...clips, ...media];
  }, [project.clips, assets]);
  const guess = useMemo(() => {
    const usable = (c: typeof project.clips[number]) => (c.type === 'video' || c.type === 'image') && !c.name.startsWith('Fondo de diseño');
    const sel = project.clips.filter((c) => selection.includes(c.id) && usable(c));
    const pool = sel.length >= 2 ? sel : project.clips.filter(usable);
    if (!pool.length) return { cam: '', screen: '' };
    const px = (c: typeof pool[number]) => { const a = c.assetId ? assets[c.assetId] : undefined; return (a?.width || 0) * (a?.height || 0); };
    const sorted = [...pool].sort((a, b) => px(a) - px(b)); // la cámara suele tener menos resolución que la captura de pantalla
    return { cam: 'clip:' + sorted[0].id, screen: sorted.length > 1 ? 'clip:' + sorted[sorted.length - 1].id : '' };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection.join(','), project.clips.length, Object.keys(assets).length]);
  const [cam, setCam] = useState(guess.cam);
  const [screen, setScreen] = useState(guess.screen);
  // solo re-adivinar cuando cambia la selección o se añaden/quitan clips (no al editar)
  useEffect(() => { setCam((c) => (c && options.some((o) => o.value === c) && !selection.length ? c : guess.cam)); setScreen((c) => (c && options.some((o) => o.value === c) && !selection.length ? c : guess.screen)); }, [guess.cam, guess.screen]);

  const bgDef = BACKGROUNDS.find((b) => b.id === bg) || null;
  const list = LAYOUTS.filter((l) => l.aspect === aspect);
  return (
    <div>
      <div className="trend-hero">
        <div className="trend-hero-title"><LayoutTemplate size={15} />Plantillas de diseño profesionales</div>
        <p className="hint" style={{ marginTop: 0 }}>Combina tu cámara y la grabación de pantalla en un solo cuadro (lado a lado, arriba/abajo, burbuja…), con marco y fondo.</p>
        <div className="kv" style={{ gridTemplateColumns: '82px 1fr', gap: 8 }}>
          <label>Cámara</label><Select value={cam} onChange={setCam} options={options} />
          <label>Pantalla</label><Select value={screen} onChange={setScreen} options={options} />
        </div>
        <button className="btn sm" style={{ marginTop: 8 }} onClick={() => { setCam(screen); setScreen(cam); }}><ArrowLeftRight size={12} />Intercambiar</button>
      </div>
      <div className="chips">
        {(['16:9', '9:16', '1:1', '4:5'] as LayoutAspect[]).map((a) => <button key={a} className={`chip ${aspect === a ? 'active' : ''}`} onClick={() => setAspect(a)}>{a}{a === projAspect ? ' · proyecto' : ''}</button>)}
      </div>
      <div className="kv" style={{ gridTemplateColumns: '82px 1fr', gap: 8, marginBottom: 10 }}>
        <label>Marco</label><Select value={style} onChange={setStyle} options={FRAME_STYLES.map((f) => ({ value: f.id, label: f.name }))} />
        <label>Color</label><ColorField value={accent} onChange={setAccent} />
      </div>
      <div className="section">
        <div className="section-title"><LayoutTemplate size={12} />Diseños {aspect}</div>
        <div className="grid lg">
          {list.map((l) => (
            <div key={l.id} className="tile" title={l.desc} onClick={() => applyLayout(l, { camId: cam || undefined, screenId: screen || undefined, style, accent, background: bgDef })}>
              <div className="preview" style={{ aspectRatio: aspect === '16:9' ? '16/9' : aspect === '9:16' ? '9/12' : aspect === '1:1' ? '1' : '4/4' }}><LayoutThumb def={l} accent={accent} /></div>
              <div className="label">{l.name}</div>
            </div>
          ))}
        </div>
        {aspect !== projAspect && <p className="hint">Al aplicar un diseño {aspect} el proyecto cambia a ese formato.</p>}
      </div>
      <div className="section">
        <div className="section-title"><ImageIcon size={12} />Fondo</div>
        <div className="grid">
          {BACKGROUNDS.map((b) => (
            <div key={b.id} className={`tile ${bg === b.id ? 'active' : ''}`} onClick={() => setBg(b.id)} onDoubleClick={() => addBackground(b, getState().time, 10)} title="Clic: usar en la plantilla · Doble clic: añadir ahora al timeline">
              <div className="preview"><BgThumb b={b} /></div>
              <div className="label">{b.name}</div>
            </div>
          ))}
        </div>
        <button className="btn sm block" style={{ marginTop: 8 }} onClick={() => bgDef && addBackground(bgDef, getState().time, 10)}>Añadir fondo seleccionado al timeline</button>
      </div>
      <div className="section">
        <div className="section-title"><Move size={12} />Estabilizar</div>
        <p className="hint" style={{ marginTop: 0 }}>Quita el temblor de la cámara del clip seleccionado (analiza el movimiento y lo compensa con un recorte mínimo).</p>
        <div className="row" style={{ display: 'flex', gap: 6 }}>
          <button className="btn sm" onClick={() => stabilizeClip(0.6)}>Suave</button>
          <button className="btn sm primary" onClick={() => stabilizeClip(1)}>Normal</button>
          <button className="btn sm" onClick={() => stabilizeClip(1.4)}>Fuerte</button>
        </div>
      </div>
    </div>
  );
}
