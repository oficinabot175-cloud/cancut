import React, { useEffect, useRef, useState } from 'react';
import { Flame, Layers, Search, Sparkles, Wand2, Gem } from 'lucide-react';
import { useEditor, getState } from '../../store/editor';
import { TREND_PRESETS, TrendPreset, applyTrend, textBehindSubject, putBehindSubject, enhanceClips, autoEnhancePref, bakeEnhancedAsset } from '../../core/trends';
import { RenderLayer, RenderScene } from '../../render/compositor';
import { createClip } from '../../core/defaults';
import { defaultParams } from '../../core/presets';
import { engine } from '../../engine/preview';
import { getImage } from '../../core/media';
import { sampleImage } from './FiltersPanel';
import { uid } from '../../core/utils';

/** Miniaturas reales de los presets (sobre el clip seleccionado o una imagen de ejemplo). */
function renderTrendThumbs(source: TexImageSource, sw: number, sh: number): Record<string, string> {
  const comp = engine.comp;
  if (!comp) return {};
  const W = 160, H = 100;
  const c2 = document.createElement('canvas'); c2.width = W; c2.height = H;
  const g2 = c2.getContext('2d')!;
  const fit = Math.max(W / sw, H / sh);
  const out: Record<string, string> = {};
  const skey = 'trend-' + Math.random();
  for (const t of TREND_PRESETS) {
    if (t.ai || t.action || t.transition || !t.effects) continue;
    const clip = createClip({ type: 'image', trackId: '', start: 0, duration: 2 });
    clip.effects = t.effects.map((e) => ({ id: uid('fx'), type: e.type, enabled: true, params: { ...defaultParams(e.type), ...(e.params || {}) } }));
    if (t.filter) { clip.grade.filter = t.filter; clip.grade.filterIntensity = 1; }
    const L: RenderLayer = {
      clip, source, srcW: sw, srcH: sh, sourceKey: skey, cacheId: 'trend-thumb', localT: 0.08, sourceT: 0,
      geom: { cx: W / 2, cy: H / 2, fw: sw * fit, fh: sh * fit, rotation: 0, flipH: false, flipV: false, opacity: 1, blur: 0, textReveal: null, textRevealOut: null, crop: { l: 0, t: 0, r: 0, b: 0 } },
    };
    const scene: RenderScene = { width: W, height: H, background: { type: 'color', color: '#000', color2: '#000', blur: 0 }, layers: [L], time: 0.08, trackings: [], luts: [] };
    try {
      const px = comp.renderPixels(scene, W, H);
      g2.putImageData(new ImageData(px, W, H), 0, 0);
      out[t.id] = c2.toDataURL('image/jpeg', 0.8);
    } catch { /* noop */ }
  }
  return out;
}

function TrendTile({ t, thumb }: { t: TrendPreset; thumb?: string }) {
  return (
    <div className="tile trend-tile" onClick={() => applyTrend(t)} title={t.desc}>
      <div className="preview" style={{ background: `linear-gradient(135deg, ${t.colors[0]}, ${t.colors[1]})` }}>
        {thumb ? <img src={thumb} alt="" /> : <span className="trend-ic">{t.icon}</span>}
        <div className="trend-badges">
          {t.hot && <span className="badge-hot">TOP</span>}
          {t.ai && <span className="badge-ai">IA</span>}
        </div>
      </div>
      <div className="label">{t.name}</div>
    </div>
  );
}

export function TrendsPanel() {
  const sel = useEditor((s) => s.project.clips.find((c) => s.selection.includes(c.id) && c.type !== 'audio'));
  const assets = useEditor((s) => s.assets);
  const [q, setQ] = useState('');
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [auto, setAuto] = useState(autoEnhancePref.get());
  const key = useRef('');
  useEffect(() => {
    const k = sel && (sel.type === 'video' || sel.type === 'image') ? `${sel.id}|${sel.assetId}` : 'sample';
    if (k === key.current) return;
    key.current = k;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const attempt = () => {
      let src: { s: TexImageSource; w: number; h: number } | null = null;
      if (sel?.type === 'video') { const c = engine.currentClipFrame(sel); if (c) src = { s: c, w: c.width, h: c.height }; }
      if (sel?.type === 'image' && sel.assetId) { const i = getImage(sel.assetId); if (i) src = { s: i.source, w: i.w, h: i.h }; }
      if (!src && sel?.type === 'video' && tries++ < 8) { timer = setTimeout(attempt, 400); return; }
      if (!src) { const c = sampleImage(); src = { s: c, w: c.width, h: c.height }; }
      setThumbs(renderTrendThumbs(src.s, src.w, src.h));
      engine.requestRender();
    };
    timer = setTimeout(attempt, 60);
    return () => clearTimeout(timer);
  }, [sel?.id, sel?.assetId]);

  const list = TREND_PRESETS.filter((t) => !q || (t.name + ' ' + t.desc + ' ' + t.group).toLowerCase().includes(q.toLowerCase()));
  const groups = [...new Set(list.map((t) => t.group))];
  const selAsset = sel?.assetId ? assets[sel.assetId] : undefined;
  const isOverlay = sel && sel.type !== 'video';
  return (
    <div>
      <div className="trend-hero">
        <div className="trend-hero-title"><Flame size={15} />Lo más viral de TikTok y CapCut</div>
        <button className="btn primary block" onClick={() => textBehindSubject()}><Layers size={14} />Texto detrás de la persona</button>
        <button className="btn block" style={{ marginTop: 6 }} disabled={!isOverlay} onClick={() => putBehindSubject()} title="Selecciona un texto, sticker o imagen sobre un video con una persona">
          <Layers size={14} />Poner selección detrás de la persona
        </button>
        <p className="hint" style={{ marginBottom: 0 }}>La IA recorta a la persona en una pista nueva encima, así cualquier capa intermedia queda «detrás». Todo sigue siendo editable.</p>
      </div>
      <div className="search-wrap"><Search size={14} /><input className="search" placeholder="Buscar tendencias…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} /></div>
      {groups.map((g) => (
        <div className="section" key={g}>
          <div className="section-title">{g === 'Capas con la persona' ? <Sparkles size={12} /> : g === 'Belleza y calidad' ? <Gem size={12} /> : <Wand2 size={12} />}{g}</div>
          <div className="grid">
            {list.filter((t) => t.group === g).map((t) => <TrendTile key={t.id} t={t} thumb={thumbs[t.id]} />)}
          </div>
        </div>
      ))}
      <div className="section">
        <div className="section-title"><Gem size={12} />Mejorar calidad del video</div>
        <button className="btn block" onClick={() => enhanceClips()}><Gem size={14} />Mejorar clip seleccionado (en vivo)</button>
        <label className="check" style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
          <input type="checkbox" checked={auto} onChange={(e) => { autoEnhancePref.set(e.target.checked); setAuto(e.target.checked); }} />
          Mejorar automáticamente al importar / añadir al timeline
        </label>
        <p className="hint">Reescalar y guardar una versión mejorada como medio nuevo (ideal para videos de baja resolución):</p>
        <div className="row" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
          {[[1080, '1080p'], [1440, '2K'], [2160, '4K'], [4320, '8K']].map(([h, l]) => (
            <button key={l} className="btn sm" disabled={!selAsset || selAsset.kind === 'audio'} onClick={() => selAsset && bakeEnhancedAsset(selAsset, h as number)}>{l}</button>
          ))}
        </div>
        {!selAsset && <p className="hint">Selecciona un clip de video o imagen en el timeline.</p>}
        {selAsset && <p className="hint">Original: {selAsset.width}×{selAsset.height}. 8K requiere un navegador/GPU compatible (Chrome o Edge recientes).</p>}
      </div>
    </div>
  );
}

export function openTrends() { getState().set({ leftTab: 'trends' }); }
