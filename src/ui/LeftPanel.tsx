import React from 'react';
import { FolderOpen, Music, Type, Shapes, Wand2, ArrowLeftRight, Palette, Captions, Sparkles, Flame, Clapperboard, LayoutTemplate } from 'lucide-react';
import { useEditor, LeftTab } from '../store/editor';
import { MediaPanel } from './panels/MediaPanel';
import { AudioPanel } from './panels/AudioPanel';
import { TextPanel } from './panels/TextPanel';
import { ElementsPanel } from './panels/ElementsPanel';
import { EffectsPanel } from './panels/EffectsPanel';
import { TransitionsPanel } from './panels/TransitionsPanel';
import { FiltersPanel } from './panels/FiltersPanel';
import { CaptionsPanel } from './panels/CaptionsPanel';
import { AIPanel } from './panels/AIPanel';
import { TrendsPanel } from './panels/TrendsPanel';
import { MotionPanel } from './panels/MotionPanel';
import { LayoutsPanel } from './panels/LayoutsPanel';

export const TABS: { id: LeftTab; label: string; icon: React.ReactNode; title: string }[] = [
  { id: 'media', label: 'Medios', icon: <FolderOpen size={19} />, title: 'Biblioteca de medios' },
  { id: 'trends', label: 'Tendencias', icon: <Flame size={19} />, title: 'Tendencias TikTok / CapCut' },
  { id: 'layouts', label: 'Diseños', icon: <LayoutTemplate size={19} />, title: 'Plantillas de diseño y fondos' },
  { id: 'motion', label: 'Motion', icon: <Clapperboard size={19} />, title: 'Motion graphics (HyperFrames)' },
  { id: 'audio', label: 'Audio', icon: <Music size={19} />, title: 'Audio y voz en off' },
  { id: 'text', label: 'Texto', icon: <Type size={19} />, title: 'Textos y títulos' },
  { id: 'elements', label: 'Elementos', icon: <Shapes size={19} />, title: 'Formas, stickers y fondos' },
  { id: 'effects', label: 'Efectos', icon: <Wand2 size={19} />, title: 'Efectos de video' },
  { id: 'transitions', label: 'Transic.', icon: <ArrowLeftRight size={19} />, title: 'Transiciones' },
  { id: 'filters', label: 'Filtros', icon: <Palette size={19} />, title: 'Filtros y LUTs' },
  { id: 'captions', label: 'Subtítul.', icon: <Captions size={19} />, title: 'Subtítulos automáticos' },
  { id: 'ai', label: 'IA', icon: <Sparkles size={19} />, title: 'Herramientas de IA' },
];

export function LeftRail() {
  const tab = useEditor((s) => s.leftTab);
  const set = useEditor((s) => s.set);
  return (
    <div className="rail">
      {TABS.map((t) => (
        <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => set({ leftTab: t.id })} title={t.title}>
          {t.icon}<span>{t.label}</span>
        </button>
      ))}
    </div>
  );
}

export function LeftPanel({ onClose }: { onClose?: () => void } = {}) {
  const tab = useEditor((s) => s.leftTab);
  const t = TABS.find((x) => x.id === tab)!;
  return (
    <div className="panel">
      <div className="panel-head"><span className="title">{t.title}</span>{onClose && <button className="icon-btn sheet-close" onClick={onClose} title="Cerrar">✕</button>}</div>
      <div className="panel-body">
        {tab === 'media' && <MediaPanel />}
        {tab === 'trends' && <TrendsPanel />}
        {tab === 'motion' && <MotionPanel />}
        {tab === 'layouts' && <LayoutsPanel />}
        {tab === 'audio' && <AudioPanel />}
        {tab === 'text' && <TextPanel />}
        {tab === 'elements' && <ElementsPanel />}
        {tab === 'effects' && <EffectsPanel />}
        {tab === 'transitions' && <TransitionsPanel />}
        {tab === 'filters' && <FiltersPanel />}
        {tab === 'captions' && <CaptionsPanel />}
        {tab === 'ai' && <AIPanel />}
      </div>
    </div>
  );
}
