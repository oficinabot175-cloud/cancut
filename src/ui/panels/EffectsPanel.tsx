import React, { useState } from 'react';
import { Search, Wand2 } from 'lucide-react';
import { useEditor } from '../../store/editor';
import { EFFECTS } from '../../core/presets';
import { addEffect } from '../../core/actions';

export function EffectsPanel() {
  const [q, setQ] = useState('');
  const hasSel = useEditor((s) => s.selection.length > 0);
  const list = EFFECTS.filter((e) => !q || e.name.toLowerCase().includes(q.toLowerCase()) || e.group.toLowerCase().includes(q.toLowerCase()));
  const groups = [...new Set(list.map((e) => e.group))];
  return (
    <div>
      <div className="search-wrap"><Search size={14} /><input className="search" placeholder="Buscar efectos…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} /></div>
      <p className="hint" style={{ marginTop: 0 }}>{hasSel ? 'Clic para aplicar al clip seleccionado, o arrastra el efecto sobre cualquier clip.' : 'Arrastra un efecto sobre un clip, o selecciona uno y haz clic. Sin selección se crea una capa de ajuste.'}</p>
      {groups.map((g) => (
        <div className="section" key={g}>
          <div className="section-title"><Wand2 size={12} />{g}</div>
          {list.filter((e) => e.group === g).map((e) => (
            <div key={e.type} className="fx-item" onClick={() => addEffect(e.type)} draggable onDragStart={(ev) => ev.dataTransfer.setData('application/x-nc-effect', e.type)}>
              <div className="ic">{e.icon}</div>
              <div className="nm">{e.name}</div>
              {e.ai && <span className="tag">IA</span>}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
