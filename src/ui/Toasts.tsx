import React from 'react';
import { X, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { useEditor } from '../store/editor';
import { ProgressBar } from './components/controls';

export function Toasts() {
  const toasts = useEditor((s) => s.toasts);
  const dismiss = useEditor((s) => s.dismissToast);
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          {t.kind === 'success' ? <CheckCircle2 size={16} color="var(--ok)" /> : t.kind === 'error' ? <AlertCircle size={16} color="var(--err)" /> : t.kind === 'progress' ? <div className="spinner" /> : <Info size={16} color="var(--accent2)" />}
          <span>{t.text}</span>
          <button className="x" onClick={() => dismiss(t.id)}><X size={14} /></button>
        </div>
      ))}
    </div>
  );
}

export function Tasks() {
  const tasks = useEditor((s) => s.tasks);
  if (!tasks.length) return null;
  return (
    <div className="tasks">
      {tasks.map((t) => (
        <div key={t.id} className="task">
          <div className="lbl"><span className="row"><div className="spinner" />{t.label}</span><span className="row">{Math.round(t.progress * 100)}%{t.cancel && <button className="btn xs ghost" onClick={t.cancel}>Cancelar</button>}</span></div>
          <ProgressBar value={t.progress} />
        </div>
      ))}
    </div>
  );
}
