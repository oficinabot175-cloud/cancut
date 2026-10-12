import React, { useEffect, useRef, useState } from 'react';
import { useEditor, getState } from './store/editor';
import { TopBar } from './ui/TopBar';
import { LeftRail, LeftPanel, TABS } from './ui/LeftPanel';
import { useMobile } from './ui/useMobile';
import { SlidersHorizontal } from 'lucide-react';
import { Viewer } from './ui/Viewer';
import { Inspector } from './ui/inspector/Inspector';
import { Timeline } from './ui/timeline/Timeline';
import { ExportDialog } from './ui/ExportDialog';
import { WelcomeDialog } from './ui/WelcomeDialog';
import { ShortcutsDialog, AboutDialog } from './ui/HelpDialogs';
import { Toasts, Tasks } from './ui/Toasts';
import { useShortcuts } from './ui/shortcuts';
import { importFiles } from './core/actions';
import { restoreLast, startAutosave } from './core/persistence';
import { loadFont } from './core/fonts';
import './engine/preview';
import * as actions from './core/actions';
import { exportProject } from './engine/export';
import { Compositor } from './render/compositor';
import * as Shaders from './render/shaders';
import * as trends from './core/trends';
import * as motion from './motion/hyperframes';
import * as analysis from './ai/analysis';

// Acceso de depuración desde la consola del navegador
(window as any).__nc = { actions, getState, exportProject, Compositor, Shaders, trends, motion, analysis };

function useSplitter(cssVar: string, initial: number, min: number, max: number, axis: 'x' | 'y', invert = false) {
  const [size, setSize] = useState(() => {
    try { const v = parseInt(localStorage.getItem('nc:' + cssVar) || '', 10); if (v) return v; } catch { /* noop */ }
    return initial;
  });
  const [active, setActive] = useState(false);
  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    setActive(true);
    const start = axis === 'x' ? e.clientX : e.clientY;
    const s0 = size;
    const move = (ev: PointerEvent) => {
      const d = (axis === 'x' ? ev.clientX : ev.clientY) - start;
      const v = Math.min(max, Math.max(min, s0 + (invert ? -d : d)));
      setSize(v);
    };
    const up = () => { setActive(false); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  useEffect(() => { try { localStorage.setItem('nc:' + cssVar, String(size)); } catch { /* noop */ } }, [size, cssVar]);
  return { size, active, onPointerDown };
}

export default function App() {
  const modal = useEditor((s) => s.modal);
  const set = useEditor((s) => s.set);
  const [ready, setReady] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragCount = useRef(0);
  const left = useSplitter('--left-w', 330, 240, 560, 'x');
  const right = useSplitter('--right-w', 330, 260, 560, 'x', true);
  const tl = useSplitter('--tl-h', 320, 160, 700, 'y', true);
  useShortcuts();

  useEffect(() => {
    (async () => {
      ['Montserrat', 'Poppins', 'Inter'].forEach((f) => loadFont(f));
      const ok = await restoreLast().catch(() => false);
      startAutosave();
      setReady(true);
      if (!ok) set({ modal: 'new' });
    })();
  }, [set]);

  useEffect(() => {
    const isFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types || []).includes('Files');
    const enter = (e: DragEvent) => { if (!isFiles(e)) return; dragCount.current++; setDragging(true); };
    const leave = (e: DragEvent) => { if (!isFiles(e)) return; dragCount.current = Math.max(0, dragCount.current - 1); if (!dragCount.current) setDragging(false); };
    const over = (e: DragEvent) => { if (isFiles(e)) e.preventDefault(); };
    const drop = (e: DragEvent) => {
      if (!isFiles(e)) return;
      e.preventDefault();
      dragCount.current = 0; setDragging(false);
      if ((e as any).__handled) return;
      const files = Array.from(e.dataTransfer?.files || []);
      if (files.length) importFiles(files);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, []);

  const style = { '--left-w': left.size + 'px', '--right-w': right.size + 'px', '--tl-h': tl.size + 'px' } as React.CSSProperties;
  const mobile = useMobile();
  const leftTab = useEditor((s) => s.leftTab);
  const [sheet, setSheet] = useState<null | 'panel' | 'inspector'>(null);
  const selCount = useEditor((s) => s.selection.length);

  if (mobile) {
    return (
      <div className="app mobile">
        <TopBar />
        <div className="m-viewer"><Viewer /></div>
        <div className="m-timeline"><Timeline /></div>
        <nav className="m-nav">
          <button className={`m-nav-edit ${sheet === 'inspector' ? 'active' : ''}`} onClick={() => setSheet(sheet === 'inspector' ? null : 'inspector')}>
            <SlidersHorizontal size={20} /><span>Editar{selCount ? ` (${selCount})` : ''}</span>
          </button>
          {TABS.map((t) => (
            <button key={t.id} className={sheet === 'panel' && leftTab === t.id ? 'active' : ''} onClick={() => { if (sheet === 'panel' && leftTab === t.id) setSheet(null); else { set({ leftTab: t.id }); setSheet('panel'); } }}>
              {t.icon}<span>{t.label}</span>
            </button>
          ))}
        </nav>
        {sheet && <div className="m-sheet-back" onPointerDown={() => setSheet(null)} />}
        <div className={`m-sheet ${sheet ? 'open' : ''}`}>
          <div className="m-sheet-grip" onClick={() => setSheet(null)}><button className="icon-btn m-sheet-x" title="Cerrar">✕</button></div>
          {sheet === 'panel' && <LeftPanel />}
          {sheet === 'inspector' && <div className="m-inspector"><Inspector /></div>}
        </div>
        {ready && modal === 'export' && <ExportDialog onClose={() => set({ modal: null })} />}
        {ready && (modal === 'new' || modal === 'projects') && <WelcomeDialog onClose={() => set({ modal: null })} />}
        {modal === 'shortcuts' && <ShortcutsDialog onClose={() => set({ modal: null })} />}
        {modal === 'about' && <AboutDialog onClose={() => set({ modal: null })} />}
        <Toasts />
        <Tasks />
        {!ready && <div className="loading-screen"><div className="row"><div className="spinner" /> Cargando CanCut…</div></div>}
      </div>
    );
  }

  return (
    <div className="app" style={style}>
      <TopBar />
      <div className="workspace">
        <div className="upper">
          <LeftRail />
          <LeftPanel />
          <div className={`splitter-v ${left.active ? 'active' : ''}`} onPointerDown={left.onPointerDown} />
          <Viewer />
          <div className={`splitter-v ${right.active ? 'active' : ''}`} onPointerDown={right.onPointerDown} />
          <Inspector />
        </div>
        <div className={`splitter-h ${tl.active ? 'active' : ''}`} onPointerDown={tl.onPointerDown} />
        <Timeline />
      </div>
      {ready && modal === 'export' && <ExportDialog onClose={() => set({ modal: null })} />}
      {ready && (modal === 'new' || modal === 'projects') && <WelcomeDialog onClose={() => set({ modal: null })} />}
      {modal === 'shortcuts' && <ShortcutsDialog onClose={() => set({ modal: null })} />}
      {modal === 'about' && <AboutDialog onClose={() => set({ modal: null })} />}
      <Toasts />
      <Tasks />
      {dragging && <div className="global-drop">Suelta tus archivos para importarlos</div>}
      {!ready && <div className="loading-screen"><div className="row"><div className="spinner" /> Cargando CanCut…</div></div>}
    </div>
  );
}

export { getState };
