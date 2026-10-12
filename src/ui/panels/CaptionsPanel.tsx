import React, { useEffect, useState } from 'react';
import { Sparkles, Upload, Download, Captions, Trash2 } from 'lucide-react';
import { useEditor, getState } from '../../store/editor';
import { CAPTION_STYLES } from '../../core/presets';
import { WHISPER_LANGS, WHISPER_MODELS, groupWords, parseSubtitles } from '../../core/subtitles';
import { transcribe, insertCaptions, applyCaptionStyle, regroupCaptions } from '../../ai/transcribe';
import { runTask, exportSubtitles } from '../../core/actions';
import { loadFont } from '../../core/fonts';
import { formatTimecode, pickFiles } from '../../core/utils';
import { Select, Slider } from '../components/controls';
import { textCss } from './TextPanel';

export function CaptionsPanel() {
  const clips = useEditor((s) => s.project.clips);
  const selection = useEditor((s) => s.selection);
  const fps = useEditor((s) => s.project.fps);
  const time = useEditor((s) => s.time);
  const [model, setModel] = useState(WHISPER_MODELS[1].id);
  const [lang, setLang] = useState('spanish');
  const [task, setTask] = useState<'transcribe' | 'translate'>('transcribe');
  const [style, setStyle] = useState('karaoke');
  const [scope, setScope] = useState<'all' | 'selected'>('all');
  const [words, setWords] = useState(5);
  const [device, setDevice] = useState<'webgpu' | 'wasm'>(() => ('gpu' in navigator ? 'webgpu' : 'wasm'));
  useEffect(() => { CAPTION_STYLES.forEach((s) => s.data.font && loadFont(s.data.font)); }, []);
  const caps = clips.filter((c) => c.text?.isCaption).sort((a, b) => a.start - b.start);
  const hasSelAudio = clips.some((c) => selection.includes(c.id) && (c.type === 'video' || c.type === 'audio'));

  const generate = async () => {
    const st = getState();
    const ids = scope === 'selected' ? st.selection.filter((id) => st.project.clips.find((c) => c.id === id && (c.type === 'video' || c.type === 'audio'))) : undefined;
    const res = await runTask('Subtítulos automáticos', (progress, signal) => transcribe({ clipIds: ids, model, language: lang, task, device, onProgress: progress, signal }));
    if (!res) return;
    if (!res.length) { st.toast('No se detectó voz en el audio', 'info'); return; }
    const styleDef = CAPTION_STYLES.find((s) => s.id === style)!;
    const cues = groupWords(res, styleDef.wordsPerCaption || words);
    insertCaptions(cues, style);
    st.toast(`${cues.length} subtítulos generados`, 'success');
  };

  return (
    <div>
      <div className="ai-card">
        <h4><Sparkles size={15} />Subtítulos automáticos <span className="badge-ai">IA</span></h4>
        <p>Transcribe la voz con Whisper directamente en tu navegador (privado, sin servidores). Incluye marcas de tiempo por palabra para estilos karaoke.</p>
        <div className="stack">
          <div className="prop"><label>Idioma</label><Select value={lang} onChange={setLang} options={WHISPER_LANGS.map((l) => ({ value: l.code, label: l.name }))} style={{ width: '100%' }} /><span /></div>
          <div className="prop"><label>Modelo</label><Select value={model} onChange={setModel} options={WHISPER_MODELS.map((m) => ({ value: m.id, label: m.name }))} style={{ width: '100%' }} /><span /></div>
          <div className="prop"><label>Tarea</label><Select value={task} onChange={setTask} options={[{ value: 'transcribe', label: 'Transcribir' }, { value: 'translate', label: 'Traducir al inglés' }]} style={{ width: '100%' }} /><span /></div>
          <div className="prop"><label>Audio de</label><Select value={scope} onChange={setScope} options={[{ value: 'all', label: 'Toda la línea de tiempo' }, { value: 'selected', label: 'Clips seleccionados' }]} style={{ width: '100%' }} /><span /></div>
          <div className="prop"><label>Motor</label><Select value={device} onChange={setDevice} options={[{ value: 'webgpu', label: 'GPU (WebGPU, rápido)' }, { value: 'wasm', label: 'CPU (compatible)' }]} style={{ width: '100%' }} /><span /></div>
          <button className="btn primary" disabled={scope === 'selected' && !hasSelAudio} onClick={generate}><Captions size={14} />Generar subtítulos</button>
        </div>
      </div>

      <div className="section">
        <div className="section-title">Estilo de subtítulos</div>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
          {CAPTION_STYLES.map((s) => (
            <div key={s.id} className="style-tile" style={{ borderColor: style === s.id ? 'var(--accent)' : undefined }}
              onClick={() => { setStyle(s.id); if (caps.length) applyCaptionStyle(s.id); }} title={s.name}>
              <div style={{ ...textCss(s.data, 0.2), fontSize: 15 }}>
                {s.data.captionMode === 'karaoke' || s.data.captionMode === 'bounceWord' ? <>Hola <span style={{ color: s.data.highlightColor }}>mundo</span></> :
                  s.data.captionMode === 'highlightBox' ? <>Hola <span style={{ background: s.data.highlightBg, borderRadius: 4, padding: '0 3px' }}>mundo</span></> : 'Hola mundo'}
              </div>
              <div className="muted" style={{ fontSize: 10, marginTop: 6 }}>{s.name}</div>
            </div>
          ))}
        </div>
      </div>

      {caps.length > 0 && (
        <div className="section">
          <div className="section-title">Ajustes <span className="count">{caps.length} subtítulos</span></div>
          <div className="prop"><label>Palabras/línea</label><Slider value={words} min={1} max={12} step={1} onChange={setWords} /><span /></div>
          <div className="row" style={{ marginBottom: 10 }}>
            <button className="btn sm" style={{ flex: 1 }} onClick={() => regroupCaptions(words)}>Reagrupar</button>
            <button className="btn sm danger" onClick={() => { if (confirm('¿Eliminar todos los subtítulos?')) getState().commit((p) => { p.clips = p.clips.filter((c) => !c.text?.isCaption); }); }}><Trash2 size={12} /></button>
          </div>
        </div>
      )}

      <div className="row" style={{ marginBottom: 12 }}>
        <button className="btn sm" style={{ flex: 1 }} onClick={async () => {
          const [f] = await pickFiles('.srt,.vtt', false);
          if (!f) return;
          const cues = parseSubtitles(await f.text());
          if (!cues.length) { getState().toast('Archivo sin subtítulos válidos', 'error'); return; }
          insertCaptions(cues, style);
        }}><Upload size={13} />Importar SRT/VTT</button>
        <button className="btn sm" onClick={() => exportSubtitles('srt')}><Download size={13} />SRT</button>
        <button className="btn sm" onClick={() => exportSubtitles('vtt')}><Download size={13} />VTT</button>
      </div>

      {caps.length > 0 && (
        <div className="section">
          <div className="section-title">Editar texto</div>
          {caps.map((c) => (
            <div key={c.id} className={`caption-row ${time >= c.start && time < c.start + c.duration ? 'active' : ''}`}>
              <div className="t" onClick={() => { getState().setTime(c.start + 0.01); getState().select([c.id]); }}>{formatTimecode(c.start, fps).slice(3, 8)}</div>
              <textarea value={c.text!.content} onKeyDown={(e) => e.stopPropagation()} onChange={(e) => {
                const v = e.target.value;
                getState().updateClip(c.id, (x) => {
                  const parts = v.split(/\s+/).filter(Boolean);
                  x.text!.content = v;
                  if (x.text!.words && x.text!.words.length === parts.length) {
                    x.text!.words = x.text!.words.map((w, i) => ({ ...w, text: parts[i] }));
                  } else if (x.text!.words) {
                    const d = x.duration;
                    x.text!.words = parts.map((t, i) => ({ text: t, start: (i * d) / parts.length, end: ((i + 1) * d) / parts.length }));
                  }
                });
              }} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
