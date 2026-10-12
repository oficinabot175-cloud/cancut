import React, { useEffect, useRef, useState } from 'react';
import { Palette, Upload, Trash2 } from 'lucide-react';
import { useEditor, getState } from '../../store/editor';
import { FILTERS } from '../../core/presets';
import { applyFilter, importLut } from '../../core/actions';
import { RenderLayer, RenderScene } from '../../render/compositor';
import { createClip } from '../../core/defaults';
import { engine } from '../../engine/preview';
import { getImage } from '../../core/media';
import { Slider } from '../components/controls';
import { pickFiles } from '../../core/utils';

export function sampleImage(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 320; c.height = 200;
  const g = c.getContext('2d')!;
  const sky = g.createLinearGradient(0, 0, 0, 120);
  sky.addColorStop(0, '#3d7bd8'); sky.addColorStop(1, '#f6c27a');
  g.fillStyle = sky; g.fillRect(0, 0, 320, 200);
  g.fillStyle = '#ffe9a8'; g.beginPath(); g.arc(230, 95, 26, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#2f5d3a'; g.beginPath(); g.moveTo(0, 140); g.quadraticCurveTo(80, 90, 160, 135); g.quadraticCurveTo(240, 170, 320, 120); g.lineTo(320, 200); g.lineTo(0, 200); g.fill();
  g.fillStyle = '#1f3a28'; g.beginPath(); g.moveTo(0, 170); g.quadraticCurveTo(120, 140, 320, 175); g.lineTo(320, 200); g.lineTo(0, 200); g.fill();
  g.fillStyle = '#c9785b'; g.beginPath(); g.ellipse(90, 150, 14, 18, 0, 0, Math.PI * 2); g.fill();
  return c;
}


function renderThumbs(source: TexImageSource, sw: number, sh: number): Record<string, string> {
  const comp = engine.comp;
  if (!comp) return {};
  const out2d = document.createElement('canvas');
  out2d.width = 160; out2d.height = 100;
  const g2 = out2d.getContext('2d')!;
  const W = 160, H = 100;
  const out: Record<string, string> = {};
  const fit = Math.max(W / sw, H / sh);
  const skey = 'thumb-' + Math.random();
  for (const f of FILTERS) {
    const clip = createClip({ type: 'image', trackId: '', start: 0, duration: 1 });
    clip.grade.filter = f.id;
    const L: RenderLayer = {
      clip, source, srcW: sw, srcH: sh, sourceKey: skey, cacheId: 'thumb', localT: 0, sourceT: 0,
      geom: { cx: W / 2, cy: H / 2, fw: sw * fit, fh: sh * fit, rotation: 0, flipH: false, flipV: false, opacity: 1, blur: 0, textReveal: null, textRevealOut: null, crop: { l: 0, t: 0, r: 0, b: 0 } },
    };
    const scene: RenderScene = { width: W, height: H, background: { type: 'color', color: '#000', color2: '#000', blur: 0 }, layers: [L], time: 0, trackings: [], luts: [] };
    const px = comp.renderPixels(scene, W, H);
    g2.putImageData(new ImageData(px, W, H), 0, 0);
    out[f.id] = out2d.toDataURL('image/jpeg', 0.8);
  }
  return out;
}

export function FiltersPanel() {
  const sel = useEditor((s) => s.project.clips.find((c) => s.selection.includes(c.id) && c.type !== 'audio'));
  const luts = useEditor((s) => s.project.luts);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const key = useRef('');
  useEffect(() => {
    const k = sel ? `${sel.id}|${sel.assetId}` : 'sample';
    if (k === key.current) return;
    key.current = k;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const attempt = () => {
      try {
        let src: { s: TexImageSource; w: number; h: number } | null = null;
        if (sel?.type === 'video') { const c = engine.currentClipFrame(sel); if (c) src = { s: c, w: c.width, h: c.height }; }
        if (sel?.type === 'image' && sel.assetId) { const i = getImage(sel.assetId); if (i) src = { s: i.source, w: i.w, h: i.h }; }
        // el fotograma del video aún no está listo: reintentar en breve
        if (!src && sel?.type === 'video' && tries++ < 8) { timer = setTimeout(attempt, 400); }
        if (!src) { const c = sampleImage(); src = { s: c, w: c.width, h: c.height }; }
        setThumbs(renderThumbs(src.s, src.w, src.h));
        engine.requestRender();
      } catch (e) { console.warn(e); }
    };
    timer = setTimeout(attempt, 50);
    return () => clearTimeout(timer);
  }, [sel?.id, sel?.assetId]);
  const groups = [...new Set(FILTERS.map((f) => f.group))];
  return (
    <div>
      {sel && sel.grade.filter !== 'none' && (
        <div className="prop"><label>Intensidad</label>
          <Slider value={sel.grade.filterIntensity} min={0} max={1} step={0.01} defaultValue={1} onChange={(v) => getState().updateClip(sel.id, (c) => { c.grade.filterIntensity = v; })} /><span />
        </div>
      )}
      <p className="hint" style={{ marginTop: 0 }}>{sel ? 'Vista previa con tu clip seleccionado.' : 'Selecciona un clip para ver los filtros sobre tu imagen. Sin selección se crea una capa de ajuste.'}</p>
      {groups.map((g) => (
        <div className="section" key={g}>
          <div className="section-title"><Palette size={12} />{g}</div>
          <div className="grid">
            {FILTERS.filter((f) => f.group === g).map((f) => (
              <div key={f.id} className={`tile ${sel?.grade.filter === f.id ? 'active' : ''}`} onClick={() => applyFilter(f.id)}
                draggable onDragStart={(e) => e.dataTransfer.setData('application/x-nc-filter', f.id)}>
                <div className="preview">{thumbs[f.id] ? <img src={thumbs[f.id]} alt="" /> : <div className="spinner" />}</div>
                <div className="label">{f.name}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
      <div className="section">
        <div className="section-title">LUTs 3D (.cube)</div>
        <button className="btn sm block" onClick={async () => { const [f] = await pickFiles('.cube', false); if (f) importLut(f).catch((e) => getState().toast(e.message, 'error')); }}><Upload size={13} />Importar LUT .cube</button>
        <div style={{ marginTop: 8 }}>
          {luts.map((l) => (
            <div key={l.id} className="fx-item" onClick={() => sel && getState().updateClip(sel.id, (c) => { c.grade.lutId = l.id; c.grade.lutIntensity = 1; })}>
              <div className="ic">◈</div><div className="nm">{l.name} <span className="muted">({l.size}³)</span></div>
              <button className="icon-btn sm" onClick={(e) => { e.stopPropagation(); getState().commit((p) => { p.luts = p.luts.filter((x) => x.id !== l.id); for (const c of p.clips) if (c.grade.lutId === l.id) c.grade.lutId = null; }); }}><Trash2 size={12} /></button>
            </div>
          ))}
          {!luts.length && <p className="hint">Importa LUTs de DaVinci Resolve, Premiere o cualquier software de color para aplicar looks cinematográficos.</p>}
        </div>
      </div>
    </div>
  );
}
