import React, { useEffect, useState } from 'react';
import { FolderOpen, Trash2, Sparkles, Clapperboard } from 'lucide-react';
import { Modal } from './components/controls';
import { getState } from '../store/editor';
import { ASPECT_PRESETS, createClip, defaultText, defaultShape } from '../core/defaults';
import { listProjects, openProject, deleteProject, importPackage, saveProjectNow, StoredProject } from '../core/persistence';
import { formatDuration, pickFiles } from '../core/utils';
import { loadFont } from '../core/fonts';

function demoProject(w: number, h: number) {
  const st = getState();
  st.newProject({ name: 'Proyecto de ejemplo', width: w, height: h });
  const p = getState().project;
  const v1 = p.tracks.filter((t) => t.kind === 'visual').slice(-1)[0].id;
  const v2 = p.tracks.filter((t) => t.kind === 'visual')[0].id;
  ['Montserrat', 'Bebas Neue', 'Poppins'].forEach(loadFont);
  const bg = (start: number, from: string, to: string, angle: number) => {
    const c = createClip({ type: 'solid', trackId: v1, start, duration: 4, name: 'Fondo' });
    c.fit = 'fill';
    c.solid = { color: from, gradient: { enabled: true, from, to, angle } };
    c.animation.loop = 'kenBurnsIn';
    return c;
  };
  const b1 = bg(0, '#7c5cff', '#00d4ff', 45);
  const b2 = bg(4, '#ff7a18', '#af002d', 90); b2.transitionIn = { type: 'circle', duration: 0.8 };
  const b3 = bg(8, '#11998e', '#38ef7d', 30); b3.transitionIn = { type: 'swirl', duration: 1 };
  const t1 = createClip({ type: 'text', trackId: v2, start: 0.3, duration: 3.4, name: 'Título' });
  t1.text = { ...defaultText('NOVACUT STUDIO'), font: 'Montserrat', weight: 900, size: Math.round(h * 0.11), letterSpacing: 4 };
  t1.animation = { ...t1.animation, in: 'zoomIn', inDuration: 0.6, out: 'fade', outDuration: 0.4 };
  const t2 = createClip({ type: 'text', trackId: v2, start: 4.3, duration: 3.4, name: 'Subtítulo' });
  t2.text = { ...defaultText('Edita como un profesional'), font: 'Poppins', weight: 700, size: Math.round(h * 0.07), boxWidth: Math.round(w * 0.8) };
  t2.animation = { ...t2.animation, in: 'typewriter', inDuration: 1.4, out: 'slideUp', outDuration: 0.4 };
  const t3 = createClip({ type: 'text', trackId: v2, start: 8.3, duration: 3.4, name: 'Cierre' });
  t3.text = { ...defaultText('¡Crea algo increíble!'), font: 'Bebas Neue', weight: 400, size: Math.round(h * 0.13), gradient: { enabled: true, from: '#ffffff', to: '#ffe66d', angle: 90 } };
  t3.animation = { ...t3.animation, in: 'bounce', inDuration: 0.8, loop: 'pulse', loopIntensity: 0.5 };
  getState().commit((d) => { d.clips.push(b1, b2, b3, t1, t2, t3); });
  const v3 = getState().addTrack('visual');
  const star = createClip({ type: 'shape', trackId: v3, start: 8.5, duration: 3.2, name: 'Estrella', shape: { ...defaultShape('star'), fill: '#ffe66d', width: Math.round(h * 0.15), height: Math.round(h * 0.15) } });
  star.transform.y = -h * 0.28;
  star.animation = { ...star.animation, in: 'pop', inDuration: 0.5, loop: 'spin', loopSpeed: 0.6 };
  getState().commit((d) => { d.clips.push(star); });
  getState().set({ time: 0.8 });
}

export function WelcomeDialog({ onClose }: { onClose: () => void }) {
  const [recent, setRecent] = useState<StoredProject[]>([]);
  const [w, setW] = useState(1920);
  const [h, setH] = useState(1080);
  useEffect(() => { listProjects().then(setRecent); }, []);
  const start = async (pw: number, ph: number, name = 'Proyecto sin título') => {
    const st = getState();
    if (st.project.clips.length) await saveProjectNow().catch(() => null);
    st.newProject({ width: pw, height: ph, name });
    onClose();
  };
  return (
    <Modal title="CanCut" onClose={onClose} size="lg" icon={<Clapperboard size={20} color="var(--accent)" />}>
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 24 }}>
        <div>
          <div className="section-title">Nuevo proyecto</div>
          <div className="welcome-grid">
            {ASPECT_PRESETS.slice(0, 8).map((a) => {
              const k = 54 / Math.max(a.w, a.h);
              return (
                <div key={a.id} className="aspect-card" onClick={() => start(a.w, a.h)}>
                  <div className="shape" style={{ width: a.w * k, height: a.h * k }} />
                  <div><b>{a.id}</b><br /><small>{a.label.split('·')[1]?.trim() || a.label} · {a.w}×{a.h}</small></div>
                </div>
              );
            })}
          </div>
          <div className="row" style={{ marginTop: 14, gap: 8 }}>
            <span className="muted">Personalizado</span>
            <input className="num" type="number" value={w} onChange={(e) => setW(parseInt(e.target.value) || 1920)} style={{ width: 80 }} onKeyDown={(e) => e.stopPropagation()} />×
            <input className="num" type="number" value={h} onChange={(e) => setH(parseInt(e.target.value) || 1080)} style={{ width: 80 }} onKeyDown={(e) => e.stopPropagation()} />
            <button className="btn sm" onClick={() => start(Math.max(16, Math.min(8192, w)), Math.max(16, Math.min(8192, h)))}>Crear</button>
          </div>
          <div className="row" style={{ marginTop: 16, gap: 8 }}>
            <button className="btn" onClick={() => { demoProject(1920, 1080); onClose(); }}><Sparkles size={14} />Abrir proyecto de ejemplo</button>
            <button className="btn" onClick={async () => { const [f] = await pickFiles('.cancut,.novacut,.json,.zip', false); if (f) { await importPackage(f); onClose(); } }}><FolderOpen size={14} />Abrir proyecto (.cancut)</button>
          </div>
        </div>
        <div>
          <div className="section-title">Proyectos recientes <span className="count">{recent.length}</span></div>
          {!recent.length && <p className="hint">Tus proyectos se guardan automáticamente en este navegador y aparecerán aquí.</p>}
          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            {recent.map((r) => (
              <div key={r.id} className="recent" onClick={async () => { await openProject(r.id); onClose(); }}>
                {r.thumb ? <img src={r.thumb} alt="" /> : <div className="ph" />}
                <div className="info">
                  <b>{r.name}</b>
                  <span className="muted" style={{ fontSize: 11 }}>{r.width}×{r.height} · {formatDuration(r.duration)} · {new Date(r.updatedAt).toLocaleString('es')}</span>
                </div>
                <button className="icon-btn sm" title="Eliminar proyecto" onClick={async (e) => { e.stopPropagation(); if (confirm(`¿Eliminar "${r.name}"?`)) { await deleteProject(r.id); setRecent(await listProjects()); } }}><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
