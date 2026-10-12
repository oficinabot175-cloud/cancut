import React, { useState } from 'react';
import { Scissors, Crosshair, ScanFace, Crop, Move, Film, VolumeX, Captions, Focus, Wand2, Droplet, Mic } from 'lucide-react';
import { useEditor, getState } from '../../store/editor';
import { removeBackground, blurFaces, startObjectTracking, reframeClip, stabilizeClip, splitScenes, removeSilences, addEffect } from '../../core/actions';
import { ASPECT_PRESETS } from '../../core/defaults';
import { Select } from '../components/controls';

function Card({ icon, title, desc, children }: { icon: React.ReactNode; title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="ai-card">
      <h4>{icon}{title}</h4>
      <p>{desc}</p>
      <div className="row">{children}</div>
    </div>
  );
}

export function AIPanel() {
  const sel = useEditor((s) => s.project.clips.find((c) => s.selection.includes(c.id)));
  const [aspect, setAspect] = useState('9:16');
  const [faceMode, setFaceMode] = useState<'blur' | 'pixelate' | 'solid'>('blur');
  const [faceHeads, setFaceHeads] = useState(true);
  const [facePad, setFacePad] = useState(1);
  const isVideo = sel?.type === 'video';
  return (
    <div>
      <p className="hint" style={{ marginTop: 0 }}>
        Todo se procesa localmente en tu navegador con modelos de IA (MediaPipe, Whisper). {sel ? <>Clip: <b style={{ color: 'var(--text)' }}>{sel.name}</b></> : 'Selecciona un clip en la línea de tiempo.'}
      </p>
      <Card icon={<Scissors size={15} />} title="Quitar fondo" desc="Segmentación de personas en tiempo real, sin pantalla verde. Ajusta umbral, bordes y estabilidad en el panel de efectos.">
        <button className="btn sm primary" onClick={() => removeBackground('remove')}>Quitar fondo</button>
        <button className="btn sm" onClick={() => removeBackground('blur')}>Desenfocar fondo</button>
        <button className="btn sm" onClick={() => removeBackground('color')}>Fondo de color</button>
        <button className="btn sm" onClick={() => removeBackground('gray')}>Color pop</button>
      </Card>
      <Card icon={<Droplet size={15} />} title="Chroma key" desc="Elimina fondos verdes o azules con supresión de derrame de color.">
        <button className="btn sm" onClick={() => addEffect('chromaKey')}>Aplicar chroma key</button>
      </Card>
      <Card icon={<Crosshair size={15} />} title="Seguimiento de objeto" desc="Dibuja un recuadro sobre cualquier objeto y el rastreador lo seguirá. Luego vincula textos, stickers, desenfoques o el enfoque al objeto.">
        <button className="btn sm primary" disabled={!isVideo} onClick={startObjectTracking}>Iniciar seguimiento</button>
      </Card>
      <Card icon={<ScanFace size={15} />} title="Difuminar rostros" desc="Detecta caras de frente, de perfil, de costado e incluso de espaldas (cabezas por esqueleto), las sigue en el tiempo y las cubre desde antes de que aparezcan del todo.">
        <Select value={faceMode} onChange={setFaceMode} options={[{ value: 'blur', label: 'Desenfocar' }, { value: 'pixelate', label: 'Pixelar' }, { value: 'solid', label: 'Tapar (color)' }]} style={{ flex: 1 }} />
        <Select value={facePad} onChange={setFacePad} options={[{ value: 0, label: 'Sin margen' }, { value: 0.5, label: 'Margen 0,5 s' }, { value: 1, label: 'Margen 1 s' }, { value: 2, label: 'Margen 2 s' }]} style={{ flex: 1 }} />
        <label className="row" style={{ gap: 6, fontSize: 12, width: '100%' }}><input type="checkbox" checked={faceHeads} onChange={(e) => setFaceHeads(e.target.checked)} />Incluir perfiles, costados y cabezas de espaldas</label>
        <button className="btn sm primary" disabled={!isVideo} onClick={() => blurFaces({ heads: faceHeads, pad: facePad, mode: faceMode })}>Difuminar rostros</button>
      </Card>
      <Card icon={<Crop size={15} />} title="Auto-reencuadre (cámara inteligente)" desc="Convierte videos horizontales a vertical (o cualquier formato): una cámara virtual sigue al sujeto principal con movimiento suave.">
        <Select value={aspect} onChange={setAspect} options={ASPECT_PRESETS.slice(0, 8).map((a) => ({ value: a.id, label: a.label }))} style={{ flex: 1 }} />
        <button className="btn sm primary" disabled={!isVideo} onClick={() => { const a = ASPECT_PRESETS.find((x) => x.id === aspect)!; reframeClip({ w: a.w, h: a.h }); }}>Reencuadrar</button>
      </Card>
      <Card icon={<Move size={15} />} title="Estabilizar video" desc="Analiza el movimiento de cámara y suaviza temblores con recorte automático mínimo.">
        <button className="btn sm primary" disabled={!isVideo} onClick={() => stabilizeClip(1)}>Estabilizar</button>
        {sel?.stabilize && <button className="btn sm" onClick={() => getState().updateClip(sel.id, (c) => { c.stabilize = null; })}>Quitar</button>}
      </Card>
      <Card icon={<Focus size={15} />} title="Enfoque y desenfoque" desc="Enfoque selectivo (desenfoca alrededor de una zona), nitidez y efecto miniatura.">
        <button className="btn sm" onClick={() => addEffect('focus')}>Enfoque selectivo</button>
        <button className="btn sm" onClick={() => addEffect('sharpen')}>Nitidez</button>
        <button className="btn sm" onClick={() => addEffect('tiltShift')}>Tilt-shift</button>
      </Card>
      <Card icon={<Film size={15} />} title="Detectar escenas" desc="Encuentra los cortes de cámara del video y divide el clip automáticamente en escenas.">
        <button className="btn sm primary" disabled={!isVideo} onClick={() => splitScenes(0.6)}>Dividir por escenas</button>
      </Card>
      <Card icon={<VolumeX size={15} />} title="Quitar silencios (jump cut)" desc="Elimina pausas y silencios de un clip con voz y cierra los huecos automáticamente.">
        <button className="btn sm primary" disabled={!sel || (sel.type !== 'video' && sel.type !== 'audio')} onClick={() => removeSilences()}>Quitar silencios</button>
      </Card>
      <Card icon={<Mic size={15} />} title="Mejorar voz" desc="Limpieza de graves, compresión y presencia para voces claras.">
        <button className="btn sm" disabled={!sel || (sel.type !== 'video' && sel.type !== 'audio')} onClick={() => sel && getState().updateClip(sel.id, (c) => { c.audio.voiceEnhance = true; c.audio.denoise = true; })}>Aplicar</button>
      </Card>
      <Card icon={<Captions size={15} />} title="Subtítulos automáticos" desc="Transcripción con Whisper, estilos virales y karaoke por palabra.">
        <button className="btn sm primary" onClick={() => getState().set({ leftTab: 'captions' })}>Abrir subtítulos</button>
      </Card>
      <Card icon={<Wand2 size={15} />} title="Look cinematográfico rápido" desc="Aplica gradación Teal & Orange, barras de cine y grano de película en un clic.">
        <button className="btn sm" disabled={!sel} onClick={() => {
          if (!sel) return;
          getState().updateClip(sel.id, (c) => { c.grade.filter = 'teal-orange'; c.grade.filterIntensity = 0.85; });
          addEffect('cinemaBars'); addEffect('grain');
        }}>Aplicar look</button>
      </Card>
    </div>
  );
}
