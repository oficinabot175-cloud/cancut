import { useEffect } from 'react';
import { getState, projectDuration } from '../store/editor';
import { engine } from '../engine/preview';
import { saveProjectNow } from '../core/persistence';
import { importFiles, snapshotPNG } from '../core/actions';
import { ACCEPT_MEDIA } from '../core/media';
import { pickFiles, clamp } from '../core/utils';
import { addTextPreset } from './panels/TextPanel';

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement;
  if (!t) return false;
  const tag = t.tagName;
  if (tag === 'TEXTAREA' || t.isContentEditable) return true;
  if (tag === 'INPUT') {
    const type = (t as HTMLInputElement).type;
    return !['range', 'checkbox', 'color', 'button'].includes(type);
  }
  return tag === 'SELECT';
}

export function useShortcuts() {
  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      const st = getState();
      const ctrl = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      const fps = st.project.fps;
      const step = (frames: number) => { st.setPlaying(false); st.setTime(clamp(Math.round(st.time * fps + frames) / fps, 0, Math.max(0, projectDuration(st.project)))); };
      const handled = () => { e.preventDefault(); e.stopPropagation(); };

      if (ctrl) {
        if (k === 'z' && !e.shiftKey) { handled(); st.undo(); return; }
        if ((k === 'z' && e.shiftKey) || k === 'y') { handled(); st.redo(); return; }
        if (k === 'c') { handled(); st.copy(); return; }
        if (k === 'v') { handled(); st.paste(); return; }
        if (k === 'x') { handled(); st.copy(); st.removeClips(st.selection); return; }
        if (k === 'd') { handled(); st.duplicateClips(st.selection); return; }
        if (k === 'a') { handled(); st.select(st.project.clips.map((c) => c.id)); return; }
        if (k === 'k') { handled(); st.splitAt(st.time, st.selection.length ? st.selection : undefined); return; }
        if (k === 's' && e.shiftKey) { handled(); snapshotPNG(); return; }
        if (k === 's') { handled(); await saveProjectNow(); st.toast('Proyecto guardado', 'success', 1500); return; }
        if (k === 'e') { handled(); st.set({ modal: 'export' }); return; }
        if (k === 'i') { handled(); importFiles(await pickFiles(ACCEPT_MEDIA)); return; }
        if (k === 'n' && e.altKey) { handled(); st.set({ modal: 'new' }); return; }
        return;
      }
      if (st.modal) return;
      switch (e.key) {
        case ' ': handled(); engine.toggle(); return;
        case 'ArrowLeft': handled(); step(e.shiftKey ? -fps : -1); return;
        case 'ArrowRight': handled(); step(e.shiftKey ? fps : 1); return;
        case 'ArrowUp': case 'ArrowDown': {
          handled();
          const edges = [...new Set(st.project.clips.flatMap((c) => [c.start, c.start + c.duration]))].sort((a, b) => a - b);
          const t = e.key === 'ArrowUp' ? [...edges].reverse().find((x) => x < st.time - 1e-3) : edges.find((x) => x > st.time + 1e-3);
          if (t !== undefined) { st.setPlaying(false); st.setTime(t); }
          return;
        }
        case 'Home': handled(); st.setPlaying(false); st.setTime(0); return;
        case 'End': handled(); st.setPlaying(false); st.setTime(projectDuration(st.project)); return;
        case 'Delete': case 'Backspace': handled(); st.removeClips(st.selection, e.shiftKey); return;
        case 'Escape':
          if (st.trackingDraw) st.set({ trackingDraw: null, tool: 'select' });
          else st.select([]);
          return;
        case '+': case '=': handled(); st.set({ zoom: clamp(st.zoom * 1.3, 4, 1500) }); return;
        case '-': case '_': handled(); st.set({ zoom: clamp(st.zoom / 1.3, 4, 1500) }); return;
        case '?': handled(); st.set({ modal: 'shortcuts' }); return;
      }
      switch (k) {
        case 's': handled(); st.splitAt(st.time, st.selection.length ? st.selection : undefined); return;
        case 'v': st.set({ tool: 'select' }); return;
        case 'c': st.set({ tool: 'blade' }); return;
        case 'm': st.addMarker(); return;
        case 't': addTextPreset({ id: 'basic', name: 'Texto', group: '', text: 'Tu texto aquí', data: {} }); return;
        case 'k': st.setPlaying(false); return;
        case 'j': step(-fps); return;
        case 'l': if (!st.playing) engine.play(); return;
        case 'f': document.querySelector('.viewer-stage')?.requestFullscreen?.(); return;
        case 'z': if (e.shiftKey) { const el = document.querySelector('.tl-scroll') as HTMLElement; const d = Math.max(5, projectDuration(st.project)); if (el) st.set({ zoom: clamp((el.clientWidth - 60) / d, 4, 1500) }); } return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
