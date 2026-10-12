import React, { useState } from 'react';
import { Upload, Music, Scissors, Wand2, VolumeX, Zap, Search } from 'lucide-react';
import { useEditor, getState, selectedClips } from '../../store/editor';
import { importFiles, removeSilences } from '../../core/actions';
import { pickFiles } from '../../core/utils';
import { encodeWav } from '../../engine/audioMix';
import { Recorder, AssetCard } from './MediaPanel';

type Synth = (ctx: OfflineAudioContext) => void;

const noise = (ctx: OfflineAudioContext, dur: number) => {
  const b = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const s = ctx.createBufferSource(); s.buffer = b; return s;
};

const SFX: { id: string; name: string; dur: number; make: Synth }[] = [
  { id: 'whoosh', name: 'Whoosh', dur: 0.9, make: (ctx) => {
    const n = noise(ctx, 0.9); const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(300, 0); f.frequency.exponentialRampToValueAtTime(4000, 0.45); f.frequency.exponentialRampToValueAtTime(500, 0.9);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, 0); g.gain.linearRampToValueAtTime(0.9, 0.4); g.gain.linearRampToValueAtTime(0, 0.9);
    n.connect(f).connect(g).connect(ctx.destination); n.start();
  } },
  { id: 'pop', name: 'Pop', dur: 0.25, make: (ctx) => {
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(900, 0); o.frequency.exponentialRampToValueAtTime(120, 0.15);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.9, 0); g.gain.exponentialRampToValueAtTime(0.001, 0.22);
    o.connect(g).connect(ctx.destination); o.start(); o.stop(0.25);
  } },
  { id: 'ding', name: 'Ding', dur: 1.4, make: (ctx) => {
    [1, 2.01, 3.02].forEach((m, i) => { const o = ctx.createOscillator(); o.frequency.value = 1046 * m; const g = ctx.createGain(); g.gain.setValueAtTime(0.5 / (i + 1), 0); g.gain.exponentialRampToValueAtTime(0.001, 1.3); o.connect(g).connect(ctx.destination); o.start(); o.stop(1.4); });
  } },
  { id: 'beep', name: 'Censura (beep)', dur: 0.6, make: (ctx) => {
    const o = ctx.createOscillator(); o.frequency.value = 1000; const g = ctx.createGain(); g.gain.value = 0.5; o.connect(g).connect(ctx.destination); o.start(); o.stop(0.6);
  } },
  { id: 'rise', name: 'Subida (riser)', dur: 2.5, make: (ctx) => {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(110, 0); o.frequency.exponentialRampToValueAtTime(1760, 2.4);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(400, 0); f.frequency.exponentialRampToValueAtTime(8000, 2.4);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0, 0); g.gain.linearRampToValueAtTime(0.35, 2.3); g.gain.linearRampToValueAtTime(0, 2.5);
    o.connect(f).connect(g).connect(ctx.destination); o.start(); o.stop(2.5);
  } },
  { id: 'impact', name: 'Impacto', dur: 1.5, make: (ctx) => {
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(120, 0); o.frequency.exponentialRampToValueAtTime(35, 1.2);
    const g = ctx.createGain(); g.gain.setValueAtTime(1, 0); g.gain.exponentialRampToValueAtTime(0.001, 1.4);
    o.connect(g).connect(ctx.destination); o.start(); o.stop(1.5);
    const n = noise(ctx, 0.3); const ng = ctx.createGain(); ng.gain.setValueAtTime(0.6, 0); ng.gain.exponentialRampToValueAtTime(0.001, 0.3);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2500; n.connect(f).connect(ng).connect(ctx.destination); n.start();
  } },
  { id: 'click', name: 'Clic', dur: 0.08, make: (ctx) => {
    const n = noise(ctx, 0.05); const g = ctx.createGain(); g.gain.setValueAtTime(0.8, 0); g.gain.exponentialRampToValueAtTime(0.001, 0.04);
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 2000; n.connect(f).connect(g).connect(ctx.destination); n.start();
  } },
  { id: 'swoosh-down', name: 'Caída', dur: 1.2, make: (ctx) => {
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(1500, 0); o.frequency.exponentialRampToValueAtTime(80, 1.1);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.5, 0); g.gain.linearRampToValueAtTime(0, 1.2);
    o.connect(g).connect(ctx.destination); o.start(); o.stop(1.2);
  } },
];

async function addSfx(s: typeof SFX[number]) {
  const ctx = new OfflineAudioContext(1, Math.ceil(48000 * s.dur), 48000);
  s.make(ctx);
  const buf = await ctx.startRendering();
  const file = new File([encodeWav(buf)], `SFX ${s.name}.wav`, { type: 'audio/wav' });
  await importFiles([file], { addToTimeline: true, at: getState().time });
}

export function AudioPanel() {
  const assets = useEditor((s) => s.assets);
  const clips = useEditor((s) => s.project.clips);
  const selection = useEditor((s) => s.selection);
  const [q, setQ] = useState('');
  const used = new Set(clips.map((c) => c.assetId));
  const list = Object.values(assets).filter((a) => a.kind === 'audio' && (!q || a.name.toLowerCase().includes(q.toLowerCase())));
  const sel = clips.find((c) => selection.includes(c.id) && (c.type === 'video' || c.type === 'audio'));
  return (
    <div>
      <button className="btn block" style={{ marginBottom: 10 }} onClick={async () => importFiles(await pickFiles('audio/*,.mp3,.wav,.m4a,.aac,.flac,.ogg,.opus,.wma,.aiff'))}><Upload size={14} />Importar música o audio</button>
      <Recorder kinds={['voice']} />
      {sel && (
        <div className="section">
          <div className="section-title">Clip seleccionado</div>
          <div className="stack">
            {sel.type === 'video' && <button className="btn sm" onClick={() => getState().detachAudio(sel.id)}><Scissors size={13} />Separar audio del video</button>}
            <button className="btn sm" onClick={() => removeSilences()}><VolumeX size={13} />Quitar silencios automáticamente</button>
            <button className="btn sm" onClick={() => getState().updateClip(sel.id, (c) => { c.audio.voiceEnhance = !c.audio.voiceEnhance; c.audio.denoise = true; })}><Wand2 size={13} />{sel.audio.voiceEnhance ? 'Quitar mejora de voz' : 'Mejorar voz (limpieza + presencia)'}</button>
          </div>
        </div>
      )}
      <div className="section">
        <div className="section-title"><Zap size={12} />Efectos de sonido</div>
        <div className="grid sm" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
          {SFX.map((s) => <button key={s.id} className="btn sm" onClick={() => addSfx(s)}>{s.name}</button>)}
        </div>
      </div>
      <div className="section">
        <div className="section-title">Tu audio <span className="count">{list.length}</span></div>
        <div className="search-wrap"><Search size={14} /><input className="search" placeholder="Buscar audio…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} /></div>
        {list.length ? <div className="grid">{list.map((a) => <AssetCard key={a.id} a={a} used={used.has(a.id)} />)}</div>
          : <div className="empty"><Music size={28} /><div>Importa música, efectos o graba tu voz.</div></div>}
      </div>
    </div>
  );
}
