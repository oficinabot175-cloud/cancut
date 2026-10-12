import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Clapperboard, Search, Upload, Play, Pause, Film, Type as TypeIcon, SlidersHorizontal, Info } from 'lucide-react';
import { getState } from '../../store/editor';
import { HFItem, HFSession, HFVariable, loadCatalog, loadItemHtml, extractTexts, extractVariables, openComposition, renderComposition, itemFromFile, appBase } from '../../motion/hyperframes';
import { Modal, ProgressBar, Select, Toggle, ColorField } from '../components/controls';
import { importFiles } from '../../core/actions';
import { createClip } from '../../core/defaults';
import { pickFiles } from '../../core/utils';

const CAT_ICON: Record<string, string> = {
  'Intros y títulos': '🎬', 'Rótulos': '🏷', 'Redes sociales': '📱', 'Overlays y efectos': '✨', 'Transiciones': '⇄', 'Fondos animados': '🌌', 'Datos y gráficos': '📊', 'Personajes': '🚶', 'Importados': '📥',
};

function MotionTile({ item, onOpen }: { item: HFItem; onOpen: () => void }) {
  const [hover, setHover] = useState(false);
  const vertical = item.height > item.width;
  return (
    <div className="tile motion-tile" onClick={onOpen} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} title={item.description || item.title}>
      <div className="preview checker">
        {item.poster ? <img src={appBase() + 'hyperframes/' + item.poster} alt="" loading="lazy" /> : <span className="trend-ic">{CAT_ICON[item.category] || '🎞'}</span>}
        {hover && item.previewVideo && <video src={item.previewVideo} autoPlay muted loop playsInline onError={(e) => ((e.target as HTMLVideoElement).style.display = 'none')} />}
        <div className="trend-badges">
          {vertical && <span className="badge-ai" style={{ background: '#333' }}>9:16</span>}
          <span className="badge-ai" style={{ background: 'rgba(0,0,0,.7)' }}>{item.duration.toFixed(1)}s</span>
        </div>
      </div>
      <div className="label">{item.title}</div>
    </div>
  );
}

function VarField({ v, value, onChange }: { v: HFVariable; value: any; onChange: (x: any) => void }) {
  const stop = (e: React.KeyboardEvent) => e.stopPropagation();
  if (v.type === 'color') return <ColorField value={String(value ?? v.default ?? '#ffffff')} onChange={onChange} />;
  if (v.type === 'boolean') return <Toggle value={!!(value ?? v.default)} onChange={onChange} />;
  if (v.type === 'enum') {
    const opts = (v.options || []).map((o) => (typeof o === 'object' ? { value: String(o.value), label: o.label || String(o.value) } : { value: String(o), label: String(o) }));
    return <Select value={String(value ?? v.default ?? opts[0]?.value ?? '')} options={opts} onChange={onChange} />;
  }
  if (v.type === 'number') {
    const n = Number(value ?? v.default ?? 0);
    if (v.min !== undefined && v.max !== undefined) {
      return (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="range" min={v.min} max={v.max} step={v.step ?? (v.max - v.min) / 100} value={n} onChange={(e) => onChange(parseFloat(e.target.value))} style={{ flex: 1 }} />
          <input className="num" style={{ width: 64 }} type="number" value={n} step={v.step ?? 'any'} onChange={(e) => onChange(parseFloat(e.target.value))} onKeyDown={stop} />
        </div>
      );
    }
    return <input className="num" style={{ width: '100%' }} type="number" value={n} step={v.step ?? 'any'} onChange={(e) => onChange(parseFloat(e.target.value))} onKeyDown={stop} />;
  }
  if (v.type === 'image') {
    return (
      <button className="btn sm" onClick={async () => {
        const [f] = await pickFiles('image/*', false);
        if (!f) return;
        const r = new FileReader(); r.onload = () => onChange(String(r.result)); r.readAsDataURL(f);
      }}><Upload size={12} />{value && String(value).startsWith('data:') ? 'Cambiar imagen' : 'Elegir imagen'}</button>
    );
  }
  const long = String(value ?? v.default ?? '').length > 40;
  return long
    ? <textarea className="text-input" rows={3} value={String(value ?? v.default ?? '')} onChange={(e) => onChange(e.target.value)} onKeyDown={stop} style={{ width: '100%', resize: 'vertical' }} />
    : <input className="text-input" style={{ width: '100%' }} value={String(value ?? v.default ?? '')} onChange={(e) => onChange(e.target.value)} onKeyDown={stop} />;
}

export function MotionDialog({ item, onClose }: { item: HFItem; onClose: () => void }) {
  const [html, setHtml] = useState<string | null>(null);
  const [vars, setVars] = useState<Record<string, any>>({});
  const [texts, setTexts] = useState<Record<number, string>>({});
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [quality, setQuality] = useState(() => { const p = getState().project; return Math.min(2160, Math.max(720, Math.min(p.width, p.height))); });
  const [fps, setFps] = useState(() => Math.min(60, Math.round(getState().project.fps || 30)));
  const [transparent, setTransparent] = useState<'auto' | 'yes' | 'no'>('auto');
  const [placement, setPlacement] = useState<'top' | 'bottom' | 'media'>(item.category === 'Fondos animados' ? 'bottom' : 'top');
  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [info, setInfo] = useState('');
  const host = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const session = useRef<HFSession | null>(null);
  const abort = useRef<AbortController | null>(null);
  const timeRef = useRef(0);

  useEffect(() => { loadItemHtml(item).then(setHtml).catch((e) => setErr(String(e.message || e))); }, [item]);
  const varList = useMemo(() => {
    const list = item.variables?.length ? item.variables : html ? extractVariables(html) : [];
    return list.filter((v) => ['string', 'number', 'color', 'boolean', 'enum', 'image'].includes(v.type));
  }, [html, item]);
  // los textos que ya controla una variable se editan desde la variable (si no, el script los sobrescribe)
  const textList = useMemo(() => {
    if (!html) return [];
    const norm = (x: any) => String(x ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
    const varTexts = new Set(varList.filter((v) => v.type === 'string').map((v) => norm(v.default)));
    return extractTexts(html).filter((t) => !varTexts.has(norm(t.text)));
  }, [html, varList]);

  // (re)abrir la vista previa cuando cambian textos/variables
  useEffect(() => {
    if (!html || !host.current) return;
    let alive = true;
    const t = setTimeout(async () => {
      setLoading(true); setErr('');
      try {
        const s = await openComposition(html, { item, variables: vars, texts }, host.current!);
        if (!alive) { s.dispose(); return; }
        session.current?.dispose();
        session.current = s;
        fit();
        await s.seek(timeRef.current || Math.min(s.duration * 0.6, s.duration - 0.05));
        if (!timeRef.current) { timeRef.current = Math.min(s.duration * 0.6, s.duration - 0.05); setTime(timeRef.current); }
      } catch (e: any) { if (alive) setErr(String(e?.message || e)); }
      finally { if (alive) setLoading(false); }
    }, 350);
    return () => { alive = false; clearTimeout(t); };
  }, [html, vars, texts]);

  useEffect(() => () => { session.current?.dispose(); abort.current?.abort(); }, []);

  const fit = () => {
    const s = session.current, b = box.current;
    if (!s || !b) return;
    const k = Math.min(b.clientWidth / s.width, b.clientHeight / s.height);
    s.iframe.style.transform = `scale(${k})`;
    s.iframe.style.left = `${(b.clientWidth - s.width * k) / 2}px`;
    s.iframe.style.top = `${(b.clientHeight - s.height * k) / 2}px`;
  };

  // reproducción en vivo (sin rasterizar)
  useEffect(() => {
    if (!playing) return;
    let raf = 0; let last = performance.now();
    const loop = (now: number) => {
      const s = session.current;
      if (s) {
        let t = timeRef.current + (now - last) / 1000;
        if (t >= s.duration) t = 0;
        timeRef.current = t; setTime(t); s.seek(t);
      }
      last = now;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const dur = session.current?.duration || item.duration;

  const insert = async () => {
    if (!html) return;
    setPlaying(false);
    // liberar la vista previa mientras se renderiza (más rápido)
    session.current?.dispose(); session.current = null;
    abort.current = new AbortController();
    setRendering(true); setProgress(0); setErr('');
    document.body.classList.add('nc-busy');
    try {
      const r = await renderComposition(html, { item, variables: vars, texts, fps, outShort: quality, transparent, signal: abort.current.signal, onProgress: (p, i) => { setProgress(p); setInfo(i); } });
      const file = new File([r.blob], r.filename, { type: r.blob.type });
      const [asset] = await importFiles([file]);
      if (!asset) throw new Error('No se pudo importar el video renderizado');
      const st = getState();
      st.updateAsset(asset.id, { alpha: r.alpha, motion: { templateId: item.id, variables: vars } });
      if (placement !== 'media') {
        const p = st.project;
        const clip = createClip({ type: 'video', trackId: '', start: st.time, duration: Math.max(0.1, asset.duration || r.duration), assetId: asset.id, name: `Motion · ${item.title}` });
        const ar = r.width / r.height, pr = p.width / p.height;
        clip.fit = Math.abs(ar - pr) < 0.02 ? 'cover' : 'contain';
        if (placement === 'top') st.addClip(clip, { newTrack: true });
        else {
          const added = st.addClip(clip, { newTrack: true });
          // mover la pista nueva al fondo (debajo de las demás pistas visuales)
          st.commit((pp) => {
            const idx = pp.tracks.findIndex((t) => t.id === added.trackId);
            const [tr] = pp.tracks.splice(idx, 1);
            const lastVisual = pp.tracks.map((t) => t.kind).lastIndexOf('visual');
            pp.tracks.splice(lastVisual + 1, 0, tr);
          });
        }
      }
      st.toast(`Motion graphic "${item.title}" ${placement === 'media' ? 'añadido a tus medios' : 'insertado en el timeline'}${r.alpha ? ' (con transparencia)' : ''}`, 'success', 4000);
      onClose();
    } catch (e: any) {
      if (!abort.current?.signal.aborted) setErr(String(e?.message || e));
    } finally { setRendering(false); document.body.classList.remove('nc-busy'); }
  };

  return (
    <Modal title={<>Motion graphic · {item.title}</>} onClose={() => { abort.current?.abort(); onClose(); }} size="lg" icon={<Clapperboard size={18} />}
      footer={rendering
        ? <><div style={{ flex: 1, marginRight: 12 }}><ProgressBar value={progress} /><div className="hint" style={{ marginTop: 4 }}>{info}</div></div><button className="btn danger" onClick={() => abort.current?.abort()}>Cancelar</button></>
        : <><span className="muted" style={{ marginRight: 'auto', fontSize: 12 }}>Plantilla de HyperFrames (Apache-2.0) · {item.width}×{item.height} · {dur.toFixed(1)} s</span>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn primary lg" disabled={!html || !!err && !session.current} onClick={insert}><Film size={15} />{placement === 'media' ? 'Renderizar a medios' : 'Insertar en el timeline'}</button></>}>
      <div className="motion-dialog" onKeyDown={(e) => e.stopPropagation()}>
        <div>
          <div className="motion-stage checker" ref={box}>
            <div ref={host} style={{ position: 'absolute', inset: 0 }} />
            {loading && <div className="motion-loading"><div className="spinner" /></div>}
          </div>
          <div className="row" style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
            <button className="icon-btn" onClick={() => setPlaying((p) => !p)} disabled={!session.current}>{playing ? <Pause size={16} /> : <Play size={16} />}</button>
            <input type="range" min={0} max={dur} step={0.01} value={time} style={{ flex: 1 }}
              onChange={(e) => { const t = parseFloat(e.target.value); timeRef.current = t; setTime(t); session.current?.seek(t); }} />
            <span className="timecode">{time.toFixed(2)} / {dur.toFixed(2)} s</span>
          </div>
          {err && <p className="hint" style={{ color: 'var(--err)' }}>{err}</p>}
          <p className="hint"><Info size={11} /> {item.description}</p>
        </div>
        <div className="motion-side">
          {textList.length > 0 && <div className="section">
            <div className="section-title"><TypeIcon size={12} />Textos</div>
            {textList.map((t) => (
              <div key={t.index} style={{ marginBottom: 6 }}>
                {t.text.includes('\n') || t.text.length > 40
                  ? <textarea className="text-input" rows={2} style={{ width: '100%', resize: 'vertical' }} value={texts[t.index] ?? t.text} onChange={(e) => setTexts({ ...texts, [t.index]: e.target.value })} />
                  : <input className="text-input" style={{ width: '100%' }} value={texts[t.index] ?? t.text} onChange={(e) => setTexts({ ...texts, [t.index]: e.target.value })} />}
              </div>
            ))}
          </div>}
          {varList.length > 0 && <div className="section">
            <div className="section-title"><SlidersHorizontal size={12} />Personalizar</div>
            <div className="kv">
              {varList.map((v) => (
                <React.Fragment key={v.id}>
                  <label title={v.description}>{v.label || v.id}</label>
                  <VarField v={v} value={vars[v.id]} onChange={(x) => setVars({ ...vars, [v.id]: x })} />
                </React.Fragment>
              ))}
            </div>
          </div>}
          <div className="section">
            <div className="section-title"><Film size={12} />Render</div>
            <div className="kv">
              <label>Calidad</label>
              <Select value={quality} onChange={setQuality} options={[[540, '540p (rápido)'], [720, '720p'], [1080, '1080p Full HD'], [1440, '1440p 2K'], [2160, '2160p 4K']].map(([v, l]) => ({ value: v as number, label: l as string }))} />
              <label>Fotogramas/s</label>
              <Select value={fps} onChange={setFps} options={[24, 25, 30, 50, 60].map((f) => ({ value: f, label: `${f} fps` }))} />
              <label>Transparencia</label>
              <Select value={transparent} onChange={setTransparent} options={[{ value: 'auto', label: 'Automática' }, { value: 'yes', label: 'Siempre (WebM alfa)' }, { value: 'no', label: 'Fondo opaco' }]} />
              <label>Colocar</label>
              <Select value={placement} onChange={setPlacement} options={[{ value: 'top', label: 'Capa superior (overlay)' }, { value: 'bottom', label: 'Al fondo (background)' }, { value: 'media', label: 'Solo en medios' }]} />
            </div>
            <p className="hint">Se renderiza fotograma a fotograma en tu navegador y se añade como video. Los overlays conservan la transparencia sobre tu video.</p>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function MotionPanel() {
  const [items, setItems] = useState<HFItem[]>([]);
  const [custom, setCustom] = useState<HFItem[]>([]);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('Todos');
  const [open, setOpen] = useState<HFItem | null>(null);
  useEffect(() => { loadCatalog().then((c) => setItems(c.items)).catch((e) => setErr(String(e.message || e))); }, []);
  const all = [...custom, ...items];
  const cats = ['Todos', ...new Set(all.map((i) => i.category))];
  const list = all.filter((i) => (cat === 'Todos' || i.category === cat) && (!q || (i.title + ' ' + (i.titleEn || '') + ' ' + i.tags.join(' ') + ' ' + i.category).toLowerCase().includes(q.toLowerCase())));
  const groups = [...new Set(list.map((i) => i.category))];
  const importCustom = async () => {
    const [f] = await pickFiles('.html,.htm,.zip', false);
    if (!f) return;
    try { const it = await itemFromFile(f); setCustom((c) => [it, ...c]); setOpen(it); }
    catch (e: any) { getState().toast(String(e?.message || e), 'error', 6000); }
  };
  return (
    <div>
      <div className="trend-hero">
        <div className="trend-hero-title"><Clapperboard size={15} />Motion graphics listos para usar</div>
        <p className="hint" style={{ marginTop: 0 }}>Intros, rótulos, overlays, transiciones y fondos animados de <a href="https://github.com/heygen-com/hyperframes" target="_blank" rel="noreferrer">HyperFrames</a>. Edita textos y colores, y se insertan como capa de video (con transparencia).</p>
        <button className="btn block" onClick={importCustom}><Upload size={14} />Importar mi composición (.html/.zip)</button>
      </div>
      <div className="search-wrap"><Search size={14} /><input className="search" placeholder="Buscar motion graphics…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} /></div>
      <div className="chips" style={{ marginBottom: 10 }}>
        {cats.map((c) => <button key={c} className={`chip ${cat === c ? 'active' : ''}`} onClick={() => setCat(c)}>{c === 'Todos' ? c : `${CAT_ICON[c] || ''} ${c}`}</button>)}
      </div>
      {err && <p className="hint" style={{ color: 'var(--err)' }}>{err}</p>}
      {!items.length && !err && <div style={{ display: 'grid', placeItems: 'center', padding: 30 }}><div className="spinner" /></div>}
      {groups.map((g) => (
        <div className="section" key={g}>
          <div className="section-title">{CAT_ICON[g] || '🎞'} {g}</div>
          <div className="grid">
            {list.filter((i) => i.category === g).map((i) => <MotionTile key={i.id} item={i} onOpen={() => setOpen(i)} />)}
          </div>
        </div>
      ))}
      <p className="hint" style={{ marginTop: 12 }}>Plantillas © HeyGen, licencia Apache-2.0. Ver <a href={appBase() + 'hyperframes/NOTICE.md'} target="_blank" rel="noreferrer">avisos</a>.</p>
      {open && <MotionDialog item={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
