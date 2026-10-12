import React, { useEffect, useRef, useState } from 'react';
import { Undo2, Redo2, Download, Keyboard, Sparkles } from 'lucide-react';
import { useEditor, getState } from '../store/editor';
import { exportPackage, importPackage, saveProjectNow } from '../core/persistence';
import { importFiles, snapshotPNG, exportSubtitles } from '../core/actions';
import { ACCEPT_MEDIA } from '../core/media';
import { download, pickFiles, safeFileName } from '../core/utils';
import { ASPECT_PRESETS } from '../core/defaults';

type Item = { label: string; kbd?: string; onClick: () => void; disabled?: boolean } | 'sep';

function Menu({ label, items }: { label: string; items: Item[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);
  return (
    <div className={`menu-item ${open ? 'open' : ''}`} ref={ref}>
      <button className="menu-btn" onClick={() => setOpen(!open)}>{label}</button>
      {open && (
        <div className="dropdown">
          {items.map((it, i) => it === 'sep' ? <hr key={i} /> : (
            <button key={i} disabled={it.disabled} onClick={() => { setOpen(false); it.onClick(); }}>
              {it.label}{it.kbd && <span className="kbd">{it.kbd}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function TopBar() {
  const name = useEditor((s) => s.project.name);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const w = useEditor((s) => s.project.width);
  const h = useEditor((s) => s.project.height);
  const st = getState;
  const [saved, setSaved] = useState(true);
  useEffect(() => {
    let t: any;
    return useEditor.subscribe((s, p) => {
      if (s.project !== p.project) { setSaved(false); clearTimeout(t); t = setTimeout(() => setSaved(true), 1600); }
    });
  }, []);

  const file: Item[] = [
    { label: 'Nuevo proyecto…', kbd: 'Ctrl+Alt+N', onClick: () => st().set({ modal: 'new' }) },
    { label: 'Proyectos recientes…', onClick: () => st().set({ modal: 'projects' }) },
    'sep',
    { label: 'Importar medios…', kbd: 'Ctrl+I', onClick: async () => importFiles(await pickFiles(ACCEPT_MEDIA)) },
    { label: 'Abrir paquete .novacut…', onClick: async () => { const [f] = await pickFiles('.novacut,.json,.zip', false); if (f) await importPackage(f); } },
    'sep',
    { label: 'Guardar ahora', kbd: 'Ctrl+S', onClick: async () => { await saveProjectNow(); st().toast('Proyecto guardado en este navegador', 'success'); } },
    { label: 'Guardar paquete (.novacut) con medios', onClick: async () => { const b = await exportPackage(); download(b, safeFileName(st().project.name) + '.novacut'); } },
    'sep',
    { label: 'Exportar video…', kbd: 'Ctrl+E', onClick: () => st().set({ modal: 'export' }) },
    { label: 'Exportar fotograma (PNG)', kbd: 'Ctrl+Shift+S', onClick: () => snapshotPNG() },
    { label: 'Exportar subtítulos .SRT', onClick: () => exportSubtitles('srt') },
    { label: 'Exportar subtítulos .VTT', onClick: () => exportSubtitles('vtt') },
  ];
  const edit: Item[] = [
    { label: 'Deshacer', kbd: 'Ctrl+Z', onClick: () => st().undo(), disabled: !canUndo },
    { label: 'Rehacer', kbd: 'Ctrl+Shift+Z', onClick: () => st().redo(), disabled: !canRedo },
    'sep',
    { label: 'Copiar', kbd: 'Ctrl+C', onClick: () => st().copy() },
    { label: 'Pegar', kbd: 'Ctrl+V', onClick: () => st().paste() },
    { label: 'Duplicar', kbd: 'Ctrl+D', onClick: () => st().duplicateClips(st().selection) },
    { label: 'Dividir en el cabezal', kbd: 'S', onClick: () => st().splitAt(st().time, st().selection.length ? st().selection : undefined) },
    { label: 'Eliminar', kbd: 'Supr', onClick: () => st().removeClips(st().selection) },
    { label: 'Eliminar y cerrar hueco', kbd: 'Shift+Supr', onClick: () => st().removeClips(st().selection, true) },
    'sep',
    { label: 'Seleccionar todo', kbd: 'Ctrl+A', onClick: () => st().select(st().project.clips.map((c) => c.id)) },
    { label: 'Añadir marcador', kbd: 'M', onClick: () => st().addMarker() },
  ];
  const view: Item[] = [
    { label: 'Scopes (histograma / forma de onda / vectorscopio)', onClick: () => st().set({ showScopes: !st().showScopes }) },
    { label: 'Zonas seguras', onClick: () => st().set({ showSafeZones: !st().showSafeZones }) },
    { label: 'Cuadrícula de tercios', onClick: () => st().set({ showGrid: !st().showGrid }) },
    'sep',
    { label: 'Vista previa: calidad completa', onClick: () => st().set({ previewScale: 1 }) },
    { label: 'Vista previa: 1/2 (más fluida)', onClick: () => st().set({ previewScale: 0.5 }) },
    { label: 'Vista previa: 1/4 (máxima fluidez)', onClick: () => st().set({ previewScale: 0.25 }) },
  ];
  const help: Item[] = [
    { label: 'Atajos de teclado', kbd: '?', onClick: () => st().set({ modal: 'shortcuts' }) },
    { label: 'Acerca de NovaCut Studio', onClick: () => st().set({ modal: 'about' }) },
  ];
  const aspect = ASPECT_PRESETS.find((a) => a.w === w && a.h === h)?.id || 'custom';

  return (
    <div className="topbar">
      <div className="brand"><div className="logo">N</div>NovaCut<small>Studio</small></div>
      <div className="menu">
        <Menu label="Archivo" items={file} />
        <Menu label="Editar" items={edit} />
        <Menu label="Ver" items={view} />
        <Menu label="Ayuda" items={help} />
      </div>
      <div className="row" style={{ marginLeft: 6 }}>
        <button className="icon-btn" title="Deshacer (Ctrl+Z)" disabled={!canUndo} onClick={() => st().undo()}><Undo2 size={16} /></button>
        <button className="icon-btn" title="Rehacer (Ctrl+Shift+Z)" disabled={!canRedo} onClick={() => st().redo()}><Redo2 size={16} /></button>
      </div>
      <div className="spacer" />
      <input className="project-name" value={name} onChange={(e) => st().update((p) => { p.name = e.target.value; })} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
      <div className="spacer" />
      <div className="save-state">{saved ? <><span className="dot" />Guardado</> : <><div className="spinner" style={{ width: 10, height: 10 }} />Guardando…</>}</div>
      <select className="sel" value={aspect} title="Formato del lienzo" onChange={(e) => {
        const a = ASPECT_PRESETS.find((x) => x.id === e.target.value);
        if (a) st().setProjectProps({ width: a.w, height: a.h });
      }}>
        {ASPECT_PRESETS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        {aspect === 'custom' && <option value="custom">{w}×{h} (personalizado)</option>}
      </select>
      <button className="icon-btn" title="Atajos de teclado" onClick={() => st().set({ modal: 'shortcuts' })}><Keyboard size={16} /></button>
      <button className="btn primary" onClick={() => st().set({ modal: 'export' })}><Download size={15} />Exportar</button>
    </div>
  );
}

export { Sparkles };
