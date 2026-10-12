import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlignLeft, AlignCenter, AlignRight, Bold, Italic, Underline, CaseUpper, Search, Upload, HardDrive } from 'lucide-react';
import type { Clip, ShapeKind } from '../../types';
import { edit, SliderProp } from './common';
import { ColorField, Collapsible, Prop, Seg, Select, Slider, Toggle } from '../components/controls';
import { FONT_CATEGORIES, getFontList, loadFont, loadFontPreview, onFontsChanged, addCustomFont, loadSystemFonts } from '../../core/fonts';
import { pickFiles } from '../../core/utils';
import { getState } from '../../store/editor';
import { TEXT_PRESETS } from '../../core/presets';
import { textCss } from '../panels/TextPanel';

function FontItem({ family, category, active, onPick }: { family: string; category: string; active: boolean; onPick: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((es) => { if (es[0].isIntersecting) { loadFontPreview(family); io.disconnect(); } });
    io.observe(el);
    return () => io.disconnect();
  }, [family]);
  return (
    <div ref={ref} className={`fo ${active ? 'active' : ''}`} style={{ fontFamily: `"${family}", Inter` }} onClick={onPick}>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{family}</span><small>{category}</small>
    </div>
  );
}

export function FontPicker({ value, onChange }: { value: string; onChange: (f: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string>('Todas');
  const [, force] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => onFontsChanged(() => force((x) => x + 1)), []);
  useEffect(() => { loadFontPreview(value); }, [value]);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);
  const list = useMemo(() => getFontList().filter((f) => (cat === 'Todas' || f.category === cat) && (!q || f.family.toLowerCase().includes(q.toLowerCase()))), [q, cat, open]);
  return (
    <div className="font-picker" ref={ref}>
      <button className="font-btn" style={{ fontFamily: `"${value}", Inter` }} onClick={() => setOpen(!open)}>
        <span>{value}</span><span className="muted" style={{ fontSize: 11, fontFamily: 'var(--font)' }}>▾</span>
      </button>
      {open && (
        <div className="font-list">
          <div className="search-wrap" style={{ marginBottom: 6 }}><Search size={14} /><input autoFocus className="search" placeholder={`Buscar entre ${getFontList().length} fuentes…`} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} /></div>
          <div className="chips" style={{ marginBottom: 6 }}>
            {['Todas', ...FONT_CATEGORIES].map((c) => <button key={c} className={`chip ${cat === c ? 'active' : ''}`} onClick={() => setCat(c)}>{c}</button>)}
          </div>
          <div className="row" style={{ marginBottom: 6 }}>
            <button className="btn xs" onClick={async () => { const [f] = await pickFiles('.ttf,.otf,.woff,.woff2', false); if (f) { const fam = await addCustomFont(f); onChange(fam); } }}><Upload size={11} />Subir fuente</button>
            <button className="btn xs" onClick={async () => { try { const n = await loadSystemFonts(); getState().toast(`${n} fuentes del sistema disponibles`, 'success'); setCat('Sistema'); } catch (e: any) { getState().toast(e.message, 'error'); } }}><HardDrive size={11} />Fuentes del PC</button>
          </div>
          {list.slice(0, 400).map((f) => <FontItem key={f.family} family={f.family} category={f.category} active={f.family === value} onPick={() => { loadFont(f.family); onChange(f.family); setOpen(false); }} />)}
          {!list.length && <div className="empty">Sin resultados</div>}
        </div>
      )}
    </div>
  );
}

export function TextTab({ clip }: { clip: Clip }) {
  const t = clip.text!;
  const set = (fn: (td: NonNullable<Clip['text']>) => void) => edit(clip.id, (c) => { if (c.text) fn(c.text); });
  const ta = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { loadFont(t.font); }, [t.font]);
  return (
    <div>
      <textarea ref={ta} className="text-input" value={t.content} rows={3} onKeyDown={(e) => e.stopPropagation()}
        onChange={(e) => { const v = e.target.value; set((td) => { td.content = v; if (td.words && td.words.length !== v.split(/\s+/).filter(Boolean).length) { const parts = v.split(/\s+/).filter(Boolean); const d = clip.duration; td.words = parts.map((w, i) => ({ text: w, start: (i * d) / parts.length, end: ((i + 1) * d) / parts.length })); } }); }} />
      <div style={{ height: 8 }} />
      <Prop label="Fuente"><FontPicker value={t.font} onChange={(f) => set((td) => { td.font = f; })} /></Prop>
      <SliderProp label="Tamaño" value={t.size} min={8} max={600} step={1} onChange={(v) => set((td) => { td.size = v; })} />
      <Prop label="Peso"><Select value={t.weight} onChange={(v) => set((td) => { td.weight = v; })} options={[100, 200, 300, 400, 500, 600, 700, 800, 900].map((w) => ({ value: w, label: `${w} ${({ 100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black' } as any)[w]}` }))} style={{ width: '100%' }} /></Prop>
      <Prop label="Estilo">
        <div className="row">
          <button className={`icon-btn sm ${t.weight >= 700 ? 'active' : ''}`} onClick={() => set((td) => { td.weight = td.weight >= 700 ? 400 : 700; })}><Bold size={13} /></button>
          <button className={`icon-btn sm ${t.italic ? 'active' : ''}`} onClick={() => set((td) => { td.italic = !td.italic; })}><Italic size={13} /></button>
          <button className={`icon-btn sm ${t.underline ? 'active' : ''}`} onClick={() => set((td) => { td.underline = !td.underline; })}><Underline size={13} /></button>
          <button className={`icon-btn sm ${t.uppercase ? 'active' : ''}`} onClick={() => set((td) => { td.uppercase = !td.uppercase; })}><CaseUpper size={13} /></button>
        </div>
      </Prop>
      <Prop label="Alineación">
        <div className="row">
          <Seg value={t.align} onChange={(v) => set((td) => { td.align = v; })} options={[{ value: 'left', label: <AlignLeft size={13} /> }, { value: 'center', label: <AlignCenter size={13} /> }, { value: 'right', label: <AlignRight size={13} /> }]} />
        </div>
      </Prop>
      <Prop label="Color"><ColorField value={t.color} onChange={(v) => set((td) => { td.color = v; })} /></Prop>
      <SliderProp label="Interletrado" value={t.letterSpacing} min={-20} max={80} step={0.5} defaultValue={0} onChange={(v) => set((td) => { td.letterSpacing = v; })} />
      <SliderProp label="Interlineado" value={t.lineHeight} min={0.6} max={3} step={0.01} defaultValue={1.15} onChange={(v) => set((td) => { td.lineHeight = v; })} />
      <SliderProp label="Ancho de caja" value={t.boxWidth} min={0} max={4000} step={10} defaultValue={0} onChange={(v) => set((td) => { td.boxWidth = v; })} title="0 = automático; mayor que 0 ajusta las líneas" />

      <Collapsible title="Degradado" defaultOpen={t.gradient.enabled} right={<Toggle value={t.gradient.enabled} onChange={(v) => set((td) => { td.gradient.enabled = v; })} />}>
        <Prop label="Desde"><ColorField value={t.gradient.from} onChange={(v) => set((td) => { td.gradient.from = v; })} /></Prop>
        <Prop label="Hasta"><ColorField value={t.gradient.to} onChange={(v) => set((td) => { td.gradient.to = v; })} /></Prop>
        <SliderProp label="Ángulo" value={t.gradient.angle} min={0} max={360} step={1} onChange={(v) => set((td) => { td.gradient.angle = v; })} />
      </Collapsible>
      <Collapsible title="Contorno" defaultOpen={t.stroke.enabled} right={<Toggle value={t.stroke.enabled} onChange={(v) => set((td) => { td.stroke.enabled = v; })} />}>
        <Prop label="Color"><ColorField value={t.stroke.color} onChange={(v) => set((td) => { td.stroke.color = v; })} /></Prop>
        <SliderProp label="Grosor" value={t.stroke.width} min={0} max={40} step={0.5} onChange={(v) => set((td) => { td.stroke.width = v; })} />
      </Collapsible>
      <Collapsible title="Sombra" defaultOpen={false} right={<Toggle value={t.shadow.enabled} onChange={(v) => set((td) => { td.shadow.enabled = v; })} />}>
        <Prop label="Color"><ColorField value={t.shadow.color} onChange={(v) => set((td) => { td.shadow.color = v; })} /></Prop>
        <SliderProp label="Desenfoque" value={t.shadow.blur} min={0} max={80} step={1} onChange={(v) => set((td) => { td.shadow.blur = v; })} />
        <SliderProp label="Desplaz. X" value={t.shadow.x} min={-60} max={60} step={1} onChange={(v) => set((td) => { td.shadow.x = v; })} />
        <SliderProp label="Desplaz. Y" value={t.shadow.y} min={-60} max={60} step={1} onChange={(v) => set((td) => { td.shadow.y = v; })} />
      </Collapsible>
      <Collapsible title="Brillo (neón)" defaultOpen={t.glow.enabled} right={<Toggle value={t.glow.enabled} onChange={(v) => set((td) => { td.glow.enabled = v; })} />}>
        <Prop label="Color"><ColorField value={t.glow.color} onChange={(v) => set((td) => { td.glow.color = v; })} /></Prop>
        <SliderProp label="Tamaño" value={t.glow.size} min={0} max={100} step={1} onChange={(v) => set((td) => { td.glow.size = v; })} />
      </Collapsible>
      <Collapsible title="Fondo / caja" defaultOpen={t.background.enabled} right={<Toggle value={t.background.enabled} onChange={(v) => set((td) => { td.background.enabled = v; })} />}>
        <Prop label="Modo"><Seg value={t.background.mode} onChange={(v) => set((td) => { td.background.mode = v; })} options={[{ value: 'block', label: 'Bloque' }, { value: 'line', label: 'Por línea' }]} /></Prop>
        <Prop label="Color"><ColorField value={t.background.color} onChange={(v) => set((td) => { td.background.color = v; })} /></Prop>
        <SliderProp label="Opacidad" value={t.background.opacity} min={0} max={1} onChange={(v) => set((td) => { td.background.opacity = v; })} />
        <SliderProp label="Relleno" value={t.background.padding} min={0} max={120} step={1} onChange={(v) => set((td) => { td.background.padding = v; })} />
        <SliderProp label="Radio" value={t.background.radius} min={0} max={100} step={1} onChange={(v) => set((td) => { td.background.radius = v; })} />
      </Collapsible>
      {(t.words?.length || t.isCaption) && (
        <Collapsible title="Resaltado por palabra (subtítulos)">
          <Prop label="Modo"><Select value={t.captionMode} onChange={(v) => set((td) => { td.captionMode = v; })} options={[
            { value: 'none', label: 'Sin resaltado' }, { value: 'karaoke', label: 'Karaoke' }, { value: 'wordByWord', label: 'Palabra a palabra' },
            { value: 'singleWord', label: 'Una palabra' }, { value: 'highlightBox', label: 'Caja resaltada' }, { value: 'bounceWord', label: 'Rebote viral' }]} style={{ width: '100%' }} /></Prop>
          <Prop label="Color activo"><ColorField value={t.highlightColor} onChange={(v) => set((td) => { td.highlightColor = v; })} /></Prop>
          <Prop label="Caja activa"><ColorField value={t.highlightBg} onChange={(v) => set((td) => { td.highlightBg = v; })} /></Prop>
        </Collapsible>
      )}
      <Collapsible title="Aplicar diseño" defaultOpen={false}>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
          {TEXT_PRESETS.map((p) => (
            <div key={p.id} className="text-tile" style={{ minHeight: 50 }} onClick={() => { if (p.data.font) loadFont(p.data.font); set((td) => { Object.assign(td, JSON.parse(JSON.stringify(p.data))); }); }}>
              <span style={{ ...textCss(p.data, 0.12) }}>{p.name}</span>
            </div>
          ))}
        </div>
      </Collapsible>
    </div>
  );
}

export function ShapeTab({ clip }: { clip: Clip }) {
  const s = clip.shape!;
  const set = (fn: (sd: NonNullable<Clip['shape']>) => void) => edit(clip.id, (c) => { if (c.shape) fn(c.shape); });
  return (
    <div>
      <Prop label="Forma"><Select value={s.kind} onChange={(v: ShapeKind) => set((sd) => { sd.kind = v; })} options={[
        { value: 'rect', label: 'Rectángulo' }, { value: 'roundRect', label: 'Rect. redondeado' }, { value: 'circle', label: 'Círculo / elipse' }, { value: 'ring', label: 'Anillo' },
        { value: 'triangle', label: 'Triángulo' }, { value: 'star', label: 'Estrella' }, { value: 'polygon', label: 'Polígono' }, { value: 'heart', label: 'Corazón' },
        { value: 'arrow', label: 'Flecha' }, { value: 'bubble', label: 'Globo de diálogo' }, { value: 'line', label: 'Línea' }, { value: 'cross', label: 'Cruz' }]} style={{ width: '100%' }} /></Prop>
      <SliderProp label="Ancho" value={s.width} min={2} max={4000} step={1} onChange={(v) => set((sd) => { sd.width = v; })} />
      <SliderProp label="Alto" value={s.height} min={2} max={4000} step={1} onChange={(v) => set((sd) => { sd.height = v; })} />
      {(s.kind === 'roundRect') && <SliderProp label="Radio" value={s.radius} min={0} max={500} step={1} onChange={(v) => set((sd) => { sd.radius = v; })} />}
      {(s.kind === 'star' || s.kind === 'polygon') && <SliderProp label="Puntas/lados" value={s.sides} min={3} max={24} step={1} onChange={(v) => set((sd) => { sd.sides = v; })} />}
      <Prop label="Relleno" extra={<Toggle value={s.fillEnabled} onChange={(v) => set((sd) => { sd.fillEnabled = v; })} />}><ColorField value={s.fill} onChange={(v) => set((sd) => { sd.fill = v; })} /></Prop>
      <Collapsible title="Degradado" defaultOpen={s.gradient.enabled} right={<Toggle value={s.gradient.enabled} onChange={(v) => set((sd) => { sd.gradient.enabled = v; })} />}>
        <Prop label="Desde"><ColorField value={s.gradient.from} onChange={(v) => set((sd) => { sd.gradient.from = v; })} /></Prop>
        <Prop label="Hasta"><ColorField value={s.gradient.to} onChange={(v) => set((sd) => { sd.gradient.to = v; })} /></Prop>
        <SliderProp label="Ángulo" value={s.gradient.angle} min={0} max={360} step={1} onChange={(v) => set((sd) => { sd.gradient.angle = v; })} />
      </Collapsible>
      <Prop label="Borde"><ColorField value={s.stroke} onChange={(v) => set((sd) => { sd.stroke = v; })} /></Prop>
      <SliderProp label="Grosor borde" value={s.strokeWidth} min={0} max={80} step={0.5} onChange={(v) => set((sd) => { sd.strokeWidth = v; })} />
    </div>
  );
}
