import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, X, Diamond, ChevronLeft } from 'lucide-react';
import { getState } from '../../store/editor';

export const tx = {
  begin: () => getState().beginTx(),
  end: () => getState().endTx(),
};

interface SliderProps {
  value: number; min: number; max: number; step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  defaultValue?: number;
  unit?: string;
}

/** Deslizador con campo numérico arrastrable; agrupa el arrastre en un solo paso de deshacer. */
export function Slider({ value, min, max, step = 0.01, onChange, defaultValue, unit }: SliderProps) {
  return (
    <div className="slider">
      <input
        type="range" min={min} max={max} step={step} value={Number.isFinite(value) ? value : 0}
        onPointerDown={tx.begin} onPointerUp={tx.end} onPointerCancel={tx.end}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        onDoubleClick={() => defaultValue !== undefined && onChange(defaultValue)}
        title={defaultValue !== undefined ? 'Doble clic para restablecer' : undefined}
      />
      <NumberField value={value} onChange={onChange} step={step} min={min} max={max} unit={unit} />
    </div>
  );
}

export function NumberField({ value, onChange, step = 1, min = -Infinity, max = Infinity, unit, width }: { value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; unit?: string; width?: number }) {
  const [editing, setEditing] = useState<string | null>(null);
  const drag = useRef<{ x: number; v: number; moved: boolean } | null>(null);
  const decimals = step >= 1 ? 0 : step >= 0.1 ? 1 : step >= 0.01 ? 2 : 3;
  const shown = editing ?? (Number.isFinite(value) ? value.toFixed(decimals) : '0') + (unit && editing === null ? '' : '');
  const clampV = (v: number) => Math.min(max, Math.max(min, v));
  return (
    <input
      className="num" style={width ? { width } : undefined} value={shown}
      onChange={(e) => setEditing(e.target.value)}
      onFocus={(e) => { setEditing(e.target.value); e.target.select(); }}
      onBlur={() => { if (editing !== null) { const v = parseFloat(editing.replace(',', '.')); if (!isNaN(v)) onChange(clampV(v)); } setEditing(null); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') { setEditing(null); (e.target as HTMLInputElement).blur(); }
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); onChange(clampV(value + (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1))); setEditing(null); }
        e.stopPropagation();
      }}
      onPointerDown={(e) => {
        if (document.activeElement === e.target) return;
        drag.current = { x: e.clientX, v: value, moved: false };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        tx.begin();
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const dx = e.clientX - d.x;
        if (Math.abs(dx) > 2) d.moved = true;
        if (d.moved) { e.preventDefault(); onChange(clampV(d.v + dx * step * (e.shiftKey ? 10 : 1) * (step >= 1 ? 1 : 2))); }
      }}
      onPointerUp={(e) => {
        const d = drag.current;
        drag.current = null;
        tx.end();
        if (d && !d.moved) (e.target as HTMLInputElement).focus();
        else e.preventDefault();
      }}
    />
  );
}

export function ColorField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const hex = /^#[0-9a-f]{6}$/i.test(value) ? value : value.startsWith('#') && value.length === 4 ? '#' + value.slice(1).split('').map((c) => c + c).join('') : '#000000';
  const [txt, setTxt] = useState<string | null>(null);
  return (
    <div className="color">
      <input type="color" value={hex} onPointerDown={tx.begin} onBlur={tx.end} onChange={(e) => onChange(e.target.value)} />
      <input className="hex" value={txt ?? value} onChange={(e) => setTxt(e.target.value)} onKeyDown={(e) => e.stopPropagation()}
        onBlur={() => { if (txt && /^#?[0-9a-f]{3,8}$/i.test(txt)) onChange(txt.startsWith('#') ? txt : '#' + txt); setTxt(null); }} />
    </div>
  );
}

export function Toggle({ value, onChange, title }: { value: boolean; onChange: (v: boolean) => void; title?: string }) {
  return <button className={`toggle ${value ? 'on' : ''}`} onClick={() => onChange(!value)} title={title} aria-pressed={value} />;
}

export function Select<T extends string | number>({ value, options, onChange, style }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; style?: React.CSSProperties }) {
  return (
    <select className="sel" value={String(value)} style={style} onChange={(e) => {
      const o = options.find((x) => String(x.value) === e.target.value);
      if (o) onChange(o.value);
    }}>
      {options.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
    </select>
  );
}

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: React.ReactNode; title?: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map((o) => <button key={o.value} title={o.title} className={value === o.value ? 'active' : ''} onClick={() => onChange(o.value)}>{o.label}</button>)}
    </div>
  );
}

export function Prop({ label, children, extra, full, title }: { label?: React.ReactNode; children: React.ReactNode; extra?: React.ReactNode; full?: boolean; title?: string }) {
  return (
    <div className={`prop ${full ? 'full' : ''}`} title={title}>
      {label !== undefined && <label>{label}</label>}
      <div style={{ minWidth: 0 }}>{children}</div>
      {!full && <div style={{ width: 20 }}>{extra}</div>}
    </div>
  );
}

export function Collapsible({ title, children, defaultOpen = true, right, icon }: { title: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean; right?: React.ReactNode; icon?: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="collapsible">
      <div className="head" onClick={() => setOpen(!open)}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {icon}
        <span style={{ flex: 1 }}>{title}</span>
        <span onClick={(e) => e.stopPropagation()}>{right}</span>
      </div>
      {open && <div className="body">{children}</div>}
    </div>
  );
}

export function Modal({ title, onClose, children, footer, size = '', icon }: { title: React.ReactNode; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; size?: '' | 'sm' | 'lg'; icon?: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-back" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${size}`} role="dialog">
        <div className="modal-head">{icon}<h3>{title}</h3><button className="icon-btn" onClick={onClose}><X size={16} /></button></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function KeyframeButton({ has, on, onToggle, onPrev, onNext }: { has: boolean; on: boolean; onToggle: () => void; onPrev?: () => void; onNext?: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      {has && onPrev && <button className="kf-btn" style={{ width: 12 }} onClick={onPrev} title="Keyframe anterior"><ChevronLeft size={11} /></button>}
      <button className={`kf-btn ${on ? 'on' : has ? 'has' : ''}`} onClick={onToggle} title={on ? 'Quitar keyframe' : 'Añadir keyframe'}>
        <Diamond size={12} fill={on ? 'currentColor' : 'none'} />
      </button>
      {has && onNext && <button className="kf-btn" style={{ width: 12 }} onClick={onNext} title="Keyframe siguiente"><ChevronRight size={11} /></button>}
    </div>
  );
}

export function ProgressBar({ value, lg }: { value: number; lg?: boolean }) {
  return <div className={`progress ${lg ? 'lg' : ''}`}><div style={{ width: `${Math.round(value * 100)}%` }} /></div>;
}

/** Menú contextual flotante */
export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: ({ label: string; icon?: React.ReactNode; onClick: () => void; kbd?: string; danger?: boolean; disabled?: boolean } | 'sep')[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  useEffect(() => {
    const el = ref.current;
    if (el) {
      const r = el.getBoundingClientRect();
      setPos({ x: Math.min(x, window.innerWidth - r.width - 8), y: Math.min(y, window.innerHeight - r.height - 8) });
    }
    const close = (e: Event) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    setTimeout(() => { window.addEventListener('pointerdown', close); window.addEventListener('keydown', k); }, 0);
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', k); };
  }, [x, y, onClose]);
  return (
    <div className="ctx-menu" ref={ref} style={{ left: pos.x, top: pos.y }} onContextMenu={(e) => e.preventDefault()}>
      {items.map((it, i) => it === 'sep' ? <hr key={i} /> : (
        <button key={i} className={it.danger ? 'danger' : ''} disabled={it.disabled} onClick={() => { it.onClick(); onClose(); }}>
          {it.icon}{it.label}{it.kbd && <span className="kbd">{it.kbd}</span>}
        </button>
      ))}
    </div>
  );
}
