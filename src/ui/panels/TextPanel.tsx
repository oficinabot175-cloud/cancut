import React, { useEffect } from 'react';
import { Type, Plus, Captions } from 'lucide-react';
import { getState } from '../../store/editor';
import { TEXT_PRESETS, TextPreset } from '../../core/presets';
import { loadFont } from '../../core/fonts';
import { defaultText } from '../../core/defaults';
import type { TextData } from '../../types';

export function textCss(d: Partial<TextData>, scale = 0.22): React.CSSProperties {
  const t = { ...defaultText(), ...d };
  const s: React.CSSProperties = {
    fontFamily: `"${t.font}", Inter, sans-serif`, fontWeight: t.weight, fontStyle: t.italic ? 'italic' : 'normal',
    fontSize: Math.max(11, Math.min(26, t.size * scale)), color: t.color, letterSpacing: t.letterSpacing * scale,
    textTransform: t.uppercase ? 'uppercase' : 'none', whiteSpace: 'pre-line', lineHeight: t.lineHeight, maxWidth: '100%',
  };
  if (t.stroke.enabled) (s as any).WebkitTextStroke = `${Math.max(0.6, t.stroke.width * scale * 0.9)}px ${t.stroke.color}`;
  const shadows: string[] = [];
  if (t.shadow.enabled) shadows.push(`${t.shadow.x * scale}px ${t.shadow.y * scale}px ${t.shadow.blur * scale}px ${t.shadow.color}`);
  if (t.glow.enabled) shadows.push(`0 0 ${t.glow.size * scale}px ${t.glow.color}`, `0 0 ${t.glow.size * scale * 2}px ${t.glow.color}`);
  if (shadows.length) s.textShadow = shadows.join(',');
  if (t.gradient.enabled) {
    s.background = `linear-gradient(${t.gradient.angle + 90}deg, ${t.gradient.from}, ${t.gradient.to})`;
    (s as any).WebkitBackgroundClip = 'text';
    (s as any).WebkitTextFillColor = 'transparent';
  }
  if (t.background.enabled) {
    s.background = t.background.color;
    s.padding = `${t.background.padding * scale * 0.6}px ${t.background.padding * scale}px`;
    s.borderRadius = t.background.radius * scale;
  }
  return s;
}

export function addTextPreset(p: TextPreset, at?: number) {
  const st = getState();
  loadFont(p.data.font || 'Montserrat');
  const clip = st.addTextClip({ start: at ?? st.time } as any, p.text);
  st.updateClip(clip.id, (c) => {
    c.text = { ...defaultText(p.text), ...p.data, content: p.text };
    c.name = p.name;
    if (p.anim) { c.animation.in = p.anim; c.animation.inDuration = p.anim === 'typewriter' || p.anim === 'wordReveal' || p.anim === 'letterFade' ? 1.2 : 0.5; c.animation.out = 'fade'; c.animation.outDuration = 0.4; }
    if (p.loop) c.animation.loop = p.loop;
    if (!p.anim) { c.animation.in = 'none'; c.animation.out = 'none'; }
    if (p.id === 'lower-third') { const pr = st.project; c.transform.x = -pr.width * 0.28; c.transform.y = pr.height * 0.3; }
  });
  st.set({ inspectorTab: 'text' });
  // mover el cabezal para ver el resultado final de la animación de entrada
  if (p.anim && !st.playing) {
    const c = getState().project.clips.find((x) => x.id === clip.id);
    if (c) getState().setTime(c.start + Math.min(c.animation.inDuration + 0.05, c.duration / 2));
  }
}

export function TextPanel() {
  useEffect(() => { TEXT_PRESETS.forEach((p) => p.data.font && loadFont(p.data.font)); }, []);
  const groups = [...new Set(TEXT_PRESETS.map((p) => p.group))];
  return (
    <div>
      <button className="btn primary block lg" style={{ marginBottom: 8 }} onClick={() => addTextPreset({ id: 'basic', name: 'Texto', group: '', text: 'Tu texto aquí', data: {} })}>
        <Plus size={16} />Añadir texto
      </button>
      <button className="btn block" style={{ marginBottom: 14 }} onClick={() => getState().set({ leftTab: 'captions' })}><Captions size={14} />Subtítulos automáticos con IA</button>
      {groups.map((g) => (
        <div className="section" key={g}>
          <div className="section-title"><Type size={12} />{g}</div>
          <div className="grid lg">
            {TEXT_PRESETS.filter((p) => p.group === g).map((p) => (
              <div key={p.id} className="text-tile" onClick={() => addTextPreset(p)} title={`Añadir "${p.name}"`}
                draggable onDragStart={(e) => { e.dataTransfer.setData('application/x-nc-text', p.id); }}>
                <span style={{ ...textCss(p.data, 0.22), fontSize: Math.min(textCss(p.data, 0.22).fontSize as number, 210 / Math.max(5, p.text.split('\n')[0].length + (p.data.letterSpacing || 0) / 6)), whiteSpace: 'nowrap' }}>{p.text.split('\n')[0]}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
