import React from 'react';
import { FlipHorizontal, FlipVertical, RotateCcw, Trash2, Link2, Unlink, Settings2, Crosshair, Crop as CropIcon, Gauge, Sparkles } from 'lucide-react';
import { useEditor, getState, maxClipDuration } from '../../store/editor';
import type { Clip, FitMode, MaskShape } from '../../types';
import { AnimProp, SliderProp, edit } from './common';
import { ColorTab } from './ColorTab';
import { EffectsTab } from './EffectsTab';
import { TextTab, ShapeTab } from './TextTab';
import { Collapsible, ColorField, Prop, Seg, Select, Slider, Toggle } from '../components/controls';
import { ANIMATIONS_IN, ANIMATIONS_LOOP, BLEND_MODES } from '../../core/presets';
import { ASPECT_PRESETS, FPS_PRESETS, defaultTransform, defaultCrop } from '../../core/defaults';
import { formatDuration, formatTimecode } from '../../core/utils';
import { bindFollow, startObjectTracking, reframeClip, stabilizeClip, blurFaces, removeBackground } from '../../core/actions';

function ProjectSettings() {
  const p = useEditor((s) => s.project);
  const assets = useEditor((s) => s.assets);
  const st = getState;
  const set = (patch: any) => st().setProjectProps(patch);
  const dur = p.clips.reduce((m, c) => Math.max(m, c.start + c.duration), 0);
  return (
    <div>
      <div className="section-title"><Settings2 size={12} />Ajustes del proyecto</div>
      <Prop label="Nombre"><input className="text-input" value={p.name} onChange={(e) => st().update((d) => { d.name = e.target.value; })} onKeyDown={(e) => e.stopPropagation()} /></Prop>
      <Prop label="Formato"><Select value={ASPECT_PRESETS.find((a) => a.w === p.width && a.h === p.height)?.id || 'custom'} onChange={(v) => { const a = ASPECT_PRESETS.find((x) => x.id === v); if (a) set({ width: a.w, height: a.h }); }} options={[...ASPECT_PRESETS.map((a) => ({ value: a.id, label: a.label })), { value: 'custom', label: 'Personalizado' }]} style={{ width: '100%' }} /></Prop>
      <Prop label="Resolución">
        <div className="row">
          <input className="num" style={{ width: 70 }} type="number" value={p.width} onChange={(e) => set({ width: Math.max(16, Math.min(8192, parseInt(e.target.value) || 16)) })} onKeyDown={(e) => e.stopPropagation()} />
          ×
          <input className="num" style={{ width: 70 }} type="number" value={p.height} onChange={(e) => set({ height: Math.max(16, Math.min(8192, parseInt(e.target.value) || 16)) })} onKeyDown={(e) => e.stopPropagation()} />
        </div>
      </Prop>
      <Prop label="Fotogramas/s"><Select value={p.fps} onChange={(v) => set({ fps: v })} options={FPS_PRESETS.map((f) => ({ value: f, label: `${f} fps` }))} style={{ width: '100%' }} /></Prop>
      <div className="divider" />
      <div className="section-title">Fondo del lienzo</div>
      <Prop label="Tipo"><Seg value={p.background.type} onChange={(v) => set({ background: { ...p.background, type: v } })} options={[{ value: 'color', label: 'Color' }, { value: 'gradient', label: 'Degradado' }, { value: 'blur', label: 'Desenfocado' }]} /></Prop>
      <Prop label="Color"><ColorField value={p.background.color} onChange={(v) => set({ background: { ...p.background, color: v } })} /></Prop>
      {p.background.type === 'gradient' && <Prop label="Color 2"><ColorField value={p.background.color2} onChange={(v) => set({ background: { ...p.background, color2: v } })} /></Prop>}
      {p.background.type === 'blur' && <SliderProp label="Desenfoque" value={p.background.blur} min={5} max={150} step={1} onChange={(v) => set({ background: { ...p.background, blur: v } })} />}
      <p className="hint">“Desenfocado” rellena las barras negras con una versión desenfocada del video (ideal para formatos verticales).</p>
      <div className="divider" />
      <div className="section-title">Resumen</div>
      <div className="kv" style={{ gridTemplateColumns: '110px 1fr', gap: 6 }}>
        <label>Duración</label><span>{formatTimecode(dur, p.fps)}</span>
        <label>Clips</label><span>{p.clips.length}</span>
        <label>Pistas</label><span>{p.tracks.length}</span>
        <label>Medios</label><span>{Object.keys(assets).length}</span>
        <label>Seguimientos</label><span>{p.trackings.length}</span>
      </div>
      <p className="hint" style={{ marginTop: 14 }}>Selecciona un clip en la línea de tiempo para editar sus propiedades. El proyecto se guarda automáticamente en este navegador.</p>
    </div>
  );
}

function BasicTab({ clip }: { clip: Clip }) {
  const asset = useEditor((s) => (clip.assetId ? s.assets[clip.assetId] : undefined));
  const visual = clip.type !== 'audio';
  return (
    <div>
      {visual && clip.type !== 'adjustment' && (
        <Collapsible title="Transformar" right={<button className="icon-btn sm" title="Restablecer" onClick={() => edit(clip.id, (c) => { c.transform = defaultTransform(); c.keyframes = Object.fromEntries(Object.entries(c.keyframes).filter(([k]) => k === 'volume')); })}><RotateCcw size={12} /></button>}>
          <AnimProp clip={clip} k="x" />
          <AnimProp clip={clip} k="y" />
          <AnimProp clip={clip} k="scale" max={5} defaultValue={1} />
          <AnimProp clip={clip} k="rotation" min={-360} max={360} defaultValue={0} />
          <SliderProp label="Escala X" value={clip.transform.scaleX} min={0.05} max={4} defaultValue={1} onChange={(v) => edit(clip.id, (c) => { c.transform.scaleX = v; })} />
          <SliderProp label="Escala Y" value={clip.transform.scaleY} min={0.05} max={4} defaultValue={1} onChange={(v) => edit(clip.id, (c) => { c.transform.scaleY = v; })} />
          <Prop label="Voltear">
            <div className="row">
              <button className={`icon-btn sm ${clip.transform.flipH ? 'active' : ''}`} title="Horizontal" onClick={() => edit(clip.id, (c) => { c.transform.flipH = !c.transform.flipH; })}><FlipHorizontal size={14} /></button>
              <button className={`icon-btn sm ${clip.transform.flipV ? 'active' : ''}`} title="Vertical" onClick={() => edit(clip.id, (c) => { c.transform.flipV = !c.transform.flipV; })}><FlipVertical size={14} /></button>
            </div>
          </Prop>
          {(clip.type === 'video' || clip.type === 'image') && (
            <Prop label="Ajuste"><Seg value={clip.fit} onChange={(v: FitMode) => edit(clip.id, (c) => { c.fit = v; })} options={[{ value: 'contain', label: 'Encajar' }, { value: 'cover', label: 'Rellenar' }, { value: 'fill', label: 'Estirar' }, { value: 'none', label: 'Original' }]} /></Prop>
          )}
          <Prop label="Alinear">
            <div className="row wrap">
              {([['Centro', 0, 0], ['Arriba', 0, -1], ['Abajo', 0, 1], ['Izq.', -1, 0], ['Der.', 1, 0]] as const).map(([l, ax, ay]) => (
                <button key={l} className="btn xs" onClick={() => {
                  const p = getState().project;
                  edit(clip.id, (c) => { c.transform.x = ax * p.width * 0.35; c.transform.y = ay * p.height * 0.35; });
                }}>{l}</button>
              ))}
            </div>
          </Prop>
        </Collapsible>
      )}
      {visual && (
        <Collapsible title="Composición">
          <AnimProp clip={clip} k="opacity" defaultValue={1} />
          <Prop label="Fusión"><Select value={clip.blend} onChange={(v) => edit(clip.id, (c) => { c.blend = v; })} options={BLEND_MODES.map((b) => ({ value: b.value, label: b.label }))} style={{ width: '100%' }} /></Prop>
        </Collapsible>
      )}
      {clip.type === 'solid' && clip.solid && (
        <Collapsible title="Color sólido">
          <Prop label="Color"><ColorField value={clip.solid.color} onChange={(v) => edit(clip.id, (c) => { c.solid!.color = v; })} /></Prop>
          <Prop label="Degradado"><Toggle value={clip.solid.gradient.enabled} onChange={(v) => edit(clip.id, (c) => { c.solid!.gradient.enabled = v; })} /></Prop>
          {clip.solid.gradient.enabled && <>
            <Prop label="Desde"><ColorField value={clip.solid.gradient.from} onChange={(v) => edit(clip.id, (c) => { c.solid!.gradient.from = v; })} /></Prop>
            <Prop label="Hasta"><ColorField value={clip.solid.gradient.to} onChange={(v) => edit(clip.id, (c) => { c.solid!.gradient.to = v; })} /></Prop>
            <SliderProp label="Ángulo" value={clip.solid.gradient.angle} min={0} max={360} step={1} onChange={(v) => edit(clip.id, (c) => { c.solid!.gradient.angle = v; })} />
          </>}
        </Collapsible>
      )}
      {(clip.type === 'video' || clip.type === 'image') && (
        <Collapsible title={<span className="row"><CropIcon size={13} />Recortar</span>} defaultOpen={false} right={<button className="icon-btn sm" onClick={() => edit(clip.id, (c) => { c.crop = defaultCrop(); })}><RotateCcw size={12} /></button>}>
          {(['l', 't', 'r', 'b'] as const).map((s) => (
            <SliderProp key={s} label={{ l: 'Izquierda', t: 'Arriba', r: 'Derecha', b: 'Abajo' }[s]} value={clip.crop[s]} min={0} max={0.95} defaultValue={0} onChange={(v) => edit(clip.id, (c) => { c.crop[s] = v; })} />
          ))}
        </Collapsible>
      )}
      {(clip.type === 'video' || clip.type === 'audio') && (
        <Collapsible title={<span className="row"><Gauge size={13} />Velocidad</span>}>
          <Prop label="Velocidad">
            <Slider value={clip.speed} min={0.1} max={8} step={0.05} defaultValue={1} onChange={(v) => edit(clip.id, (c) => {
              const srcLen = c.duration * c.speed;
              c.speed = v;
              c.duration = Math.min(srcLen / v, maxClipDuration(c, asset));
            })} />
          </Prop>
          <div className="row wrap" style={{ marginBottom: 6 }}>
            {[0.25, 0.5, 1, 1.5, 2, 4].map((v) => (
              <button key={v} className={`chip ${Math.abs(clip.speed - v) < 0.01 ? 'active' : ''}`} onClick={() => edit(clip.id, (c) => { const srcLen = c.duration * c.speed; c.speed = v; c.duration = Math.min(srcLen / v, maxClipDuration(c, asset)); })}>{v}×</button>
            ))}
          </div>
          <Prop label="Mantener tono"><Toggle value={clip.audio.preservePitch} onChange={(v) => edit(clip.id, (c) => { c.audio.preservePitch = v; })} /></Prop>
          <p className="hint">Duración: {formatDuration(clip.duration)} · La velocidad cambia la duración del clip en la línea de tiempo.</p>
        </Collapsible>
      )}
      {clip.type === 'image' && (
        <Collapsible title="Duración">
          <SliderProp label="Segundos" value={clip.duration} min={0.1} max={60} step={0.1} onChange={(v) => edit(clip.id, (c) => { c.duration = v; })} />
        </Collapsible>
      )}
    </div>
  );
}

function AudioTab({ clip }: { clip: Clip }) {
  const a = clip.audio;
  const set = (fn: (au: Clip['audio']) => void) => edit(clip.id, (c) => fn(c.audio));
  const asset = useEditor((s) => (clip.assetId ? s.assets[clip.assetId] : undefined));
  if (clip.type === 'video' && !asset?.hasAudio) return <div className="empty">Este video no tiene pista de audio.</div>;
  if (clip.audioDetached) return <div className="empty">El audio de este clip está separado en una pista de audio.<br /><button className="btn sm" style={{ marginTop: 10 }} onClick={() => edit(clip.id, (c) => { c.audioDetached = false; })}>Volver a unir</button></div>;
  return (
    <div>
      <Collapsible title="Volumen">
        <AnimProp clip={clip} k="volume" defaultValue={1} />
        <Prop label="Silenciar"><Toggle value={a.muted} onChange={(v) => set((au) => { au.muted = v; })} /></Prop>
        <SliderProp label="Panorama" value={a.pan} min={-1} max={1} defaultValue={0} onChange={(v) => set((au) => { au.pan = v; })} />
        <SliderProp label="Fundido entrada" value={a.fadeIn} min={0} max={Math.min(10, clip.duration / 2)} step={0.05} defaultValue={0} onChange={(v) => set((au) => { au.fadeIn = v; })} />
        <SliderProp label="Fundido salida" value={a.fadeOut} min={0} max={Math.min(10, clip.duration / 2)} step={0.05} defaultValue={0} onChange={(v) => set((au) => { au.fadeOut = v; })} />
      </Collapsible>
      <Collapsible title="Ecualizador">
        <SliderProp label="Graves" value={a.eqLow} min={-15} max={15} step={0.5} defaultValue={0} onChange={(v) => set((au) => { au.eqLow = v; })} />
        <SliderProp label="Medios" value={a.eqMid} min={-15} max={15} step={0.5} defaultValue={0} onChange={(v) => set((au) => { au.eqMid = v; })} />
        <SliderProp label="Agudos" value={a.eqHigh} min={-15} max={15} step={0.5} defaultValue={0} onChange={(v) => set((au) => { au.eqHigh = v; })} />
        <div className="row wrap">
          {[['Plano', 0, 0, 0], ['Voz', -3, 2, 3], ['Bajos+', 6, 0, -1], ['Brillante', -1, 1, 5], ['Radio', -8, 5, -6], ['Teléfono', -12, 6, -10]].map(([n, l, m, h]) => (
            <button key={n as string} className="chip" onClick={() => set((au) => { au.eqLow = l as number; au.eqMid = m as number; au.eqHigh = h as number; })}>{n}</button>
          ))}
        </div>
      </Collapsible>
      <Collapsible title="Limpieza">
        <Prop label="Reducir ruido"><Toggle value={a.denoise} onChange={(v) => set((au) => { au.denoise = v; })} /></Prop>
        <Prop label="Mejorar voz"><Toggle value={a.voiceEnhance} onChange={(v) => set((au) => { au.voiceEnhance = v; })} /></Prop>
        <p className="hint">Filtro paso alto, compresión dinámica y realce de presencia para voces más claras.</p>
      </Collapsible>
      {clip.type === 'video' && <button className="btn sm block" onClick={() => getState().detachAudio(clip.id)}>Separar audio en otra pista</button>}
    </div>
  );
}

function AnimationTab({ clip }: { clip: Clip }) {
  const a = clip.animation;
  const set = (fn: (an: Clip['animation']) => void) => edit(clip.id, (c) => fn(c.animation));
  const isText = clip.type === 'text';
  const ins = ANIMATIONS_IN.filter((x) => isText || !x.textOnly);
  const kfCount = Object.values(clip.keyframes).reduce((n, l) => n + l.length, 0);
  return (
    <div>
      <div className="section-title">Entrada</div>
      <div className="anim-grid">{ins.map((x) => <button key={x.type} className={a.in === x.type ? 'active' : ''} onClick={() => set((an) => { an.in = x.type; })}>{x.name}</button>)}</div>
      {a.in !== 'none' && <SliderProp label="Duración" value={a.inDuration} min={0.05} max={Math.max(0.1, Math.min(5, clip.duration))} step={0.05} onChange={(v) => set((an) => { an.inDuration = v; })} />}
      <div className="section-title" style={{ marginTop: 12 }}>Salida</div>
      <div className="anim-grid">{ins.map((x) => <button key={x.type} className={a.out === x.type ? 'active' : ''} onClick={() => set((an) => { an.out = x.type; })}>{x.name}</button>)}</div>
      {a.out !== 'none' && <SliderProp label="Duración" value={a.outDuration} min={0.05} max={Math.max(0.1, Math.min(5, clip.duration))} step={0.05} onChange={(v) => set((an) => { an.outDuration = v; })} />}
      <div className="section-title" style={{ marginTop: 12 }}>Bucle (durante todo el clip)</div>
      <div className="anim-grid">{ANIMATIONS_LOOP.map((x) => <button key={x.type} className={a.loop === x.type ? 'active' : ''} onClick={() => set((an) => { an.loop = x.type; })}>{x.name}</button>)}</div>
      {a.loop !== 'none' && <>
        <SliderProp label="Velocidad" value={a.loopSpeed} min={0.1} max={5} step={0.05} defaultValue={1} onChange={(v) => set((an) => { an.loopSpeed = v; })} />
        <SliderProp label="Intensidad" value={a.loopIntensity} min={0} max={2} step={0.01} defaultValue={0.5} onChange={(v) => set((an) => { an.loopIntensity = v; })} />
      </>}
      <div className="divider" />
      <div className="section-title">Keyframes</div>
      <p className="hint">Usa el rombo ◇ junto a Posición, Escala, Rotación, Opacidad o Volumen para crear animaciones personalizadas con keyframes. {kfCount ? `Este clip tiene ${kfCount} keyframe(s).` : ''}</p>
      {kfCount > 0 && <button className="btn xs danger" onClick={() => edit(clip.id, (c) => { c.keyframes = {}; })}>Borrar todos los keyframes</button>}
    </div>
  );
}

function MaskTab({ clip }: { clip: Clip }) {
  const m = clip.mask;
  const set = (fn: (mk: Clip['mask']) => void) => edit(clip.id, (c) => fn(c.mask));
  return (
    <div>
      <div className="anim-grid">
        {([['none', 'Ninguna'], ['rect', 'Rectángulo'], ['ellipse', 'Elipse'], ['linear', 'Lineal'], ['heart', 'Corazón'], ['star', 'Estrella']] as [MaskShape, string][]).map(([v, l]) => (
          <button key={v} className={m.shape === v ? 'active' : ''} onClick={() => set((mk) => { mk.shape = v; })}>{l}</button>
        ))}
      </div>
      {m.shape !== 'none' && <>
        <SliderProp label="Centro X" value={m.x} min={-0.5} max={1.5} step={0.001} defaultValue={0.5} onChange={(v) => set((mk) => { mk.x = v; })} />
        <SliderProp label="Centro Y" value={m.y} min={-0.5} max={1.5} step={0.001} defaultValue={0.5} onChange={(v) => set((mk) => { mk.y = v; })} />
        {m.shape !== 'linear' && <>
          <SliderProp label="Ancho" value={m.w} min={0.01} max={2} step={0.001} onChange={(v) => set((mk) => { mk.w = v; })} />
          <SliderProp label="Alto" value={m.h} min={0.01} max={2} step={0.001} onChange={(v) => set((mk) => { mk.h = v; })} />
        </>}
        <SliderProp label="Rotación" value={m.rotation} min={-180} max={180} step={0.5} defaultValue={0} onChange={(v) => set((mk) => { mk.rotation = v; })} />
        <SliderProp label="Suavizado" value={m.feather} min={0} max={1} step={0.005} onChange={(v) => set((mk) => { mk.feather = v; })} />
        {m.shape === 'rect' && <SliderProp label="Esquinas" value={m.radius} min={0} max={1} step={0.01} onChange={(v) => set((mk) => { mk.radius = v; })} />}
        <Prop label="Invertir"><Toggle value={m.invert} onChange={(v) => set((mk) => { mk.invert = v; })} /></Prop>
        <p className="hint">Arrastra la máscara en el visor para moverla. Combínala con keyframes de posición para animar revelados.</p>
      </>}
    </div>
  );
}

function TrackingTab({ clip }: { clip: Clip }) {
  const p = useEditor((s) => s.project);
  const mine = p.trackings.filter((t) => t.assetId === clip.assetId);
  // objetos rastreados disponibles para vincular este clip
  const linkable = p.trackings.filter((t) => t.kind === 'object' || t.kind === 'faces').flatMap((t) =>
    p.clips.filter((c) => c.assetId === t.assetId && c.id !== clip.id && c.type === 'video').map((c) => ({ t, c })));
  return (
    <div>
      {clip.type === 'video' && (
        <>
          <div className="section-title"><Sparkles size={12} />Herramientas de IA para este clip</div>
          <div className="stack" style={{ marginBottom: 12 }}>
            <button className="btn sm" onClick={startObjectTracking}><Crosshair size={13} />Rastrear un objeto</button>
            <button className="btn sm" onClick={blurFaces}>Difuminar rostros</button>
            <button className="btn sm" onClick={() => removeBackground('remove')}>Quitar fondo</button>
            <button className="btn sm" onClick={() => reframeClip()}>Auto-reencuadre (seguir sujeto)</button>
            <button className="btn sm" onClick={() => stabilizeClip()}>Estabilizar</button>
          </div>
        </>
      )}
      {clip.reframe && (
        <Collapsible title="Cámara inteligente (reencuadre)" right={<button className="btn xs danger" onClick={() => edit(clip.id, (c) => { c.reframe = null; })}>Quitar</button>}>
          <SliderProp label="Zoom" value={clip.reframe.zoom} min={1} max={4} step={0.01} defaultValue={1} onChange={(v) => edit(clip.id, (c) => { c.reframe!.zoom = v; })} />
        </Collapsible>
      )}
      {clip.stabilize && (
        <Collapsible title="Estabilización" right={<button className="btn xs danger" onClick={() => edit(clip.id, (c) => { c.stabilize = null; })}>Quitar</button>}>
          <SliderProp label="Intensidad" value={clip.stabilize.strength} min={0} max={1.5} step={0.01} defaultValue={1} onChange={(v) => edit(clip.id, (c) => { c.stabilize!.strength = v; })} />
          <SliderProp label="Zoom recorte" value={clip.stabilize.zoom} min={1} max={1.6} step={0.005} onChange={(v) => edit(clip.id, (c) => { c.stabilize!.zoom = v; })} />
        </Collapsible>
      )}
      {clip.type !== 'audio' && (
        <Collapsible title={<span className="row"><Link2 size={13} />Seguir un objeto rastreado</span>}>
          {clip.follow ? (
            <>
              <p className="hint">Este elemento sigue al objeto. Arrástralo en el visor para ajustar su desplazamiento.</p>
              <SliderProp label="Desplaz. X" value={clip.follow.offsetX} min={-2000} max={2000} step={1} onChange={(v) => edit(clip.id, (c) => { c.follow!.offsetX = v; })} />
              <SliderProp label="Desplaz. Y" value={clip.follow.offsetY} min={-2000} max={2000} step={1} onChange={(v) => edit(clip.id, (c) => { c.follow!.offsetY = v; })} />
              <Prop label="Escalar con objeto"><Toggle value={clip.follow.scaleWithObject} onChange={(v) => edit(clip.id, (c) => {
                c.follow!.scaleWithObject = v;
                if (v) { const td = getState().project.trackings.find((t) => t.id === c.follow!.trackingId); c.follow!.baseW = td?.samples[0]?.boxes[0]?.w || 0.2; }
              })} /></Prop>
              <button className="btn xs danger" onClick={() => edit(clip.id, (c) => { c.follow = null; })}><Unlink size={11} />Desvincular</button>
            </>
          ) : linkable.length ? (
            <Select value="" onChange={(v) => { const [tid, cid] = String(v).split('|'); if (tid) bindFollow(clip.id, cid, tid); }}
              options={[{ value: '', label: 'Elegir objeto…' }, ...linkable.map(({ t, c }) => ({ value: `${t.id}|${c.id}`, label: `${t.name} → ${c.name}` }))]} style={{ width: '100%' }} />
          ) : <p className="hint">Primero rastrea un objeto en un clip de video (panel IA → Seguimiento de objeto).</p>}
        </Collapsible>
      )}
      {mine.length > 0 && (
        <Collapsible title="Datos de análisis" defaultOpen={false}>
          {mine.map((t) => (
            <div key={t.id} className="row between" style={{ marginBottom: 6 }}>
              <span>{t.name} <span className="muted">({t.samples.length} muestras)</span></span>
              <button className="icon-btn sm" title="Eliminar" onClick={() => getState().commit((d) => {
                d.trackings = d.trackings.filter((x) => x.id !== t.id);
                for (const c of d.clips) {
                  if (c.follow?.trackingId === t.id) c.follow = null;
                  if (c.reframe?.trackingId === t.id) c.reframe = null;
                  if (c.stabilize?.trackingId === t.id) c.stabilize = null;
                  for (const f of c.effects) if (f.params.tracking === t.id) f.params.tracking = '';
                }
              })}><Trash2 size={12} /></button>
            </div>
          ))}
        </Collapsible>
      )}
    </div>
  );
}

const TAB_LABELS: Record<string, string> = { basic: 'Video', text: 'Texto', shape: 'Forma', color: 'Color', effects: 'Efectos', animation: 'Animación', mask: 'Máscara', audio: 'Audio', ai: 'IA' };

function tabsFor(c: Clip): string[] {
  switch (c.type) {
    case 'video': return ['basic', 'color', 'effects', 'animation', 'audio', 'mask', 'ai'];
    case 'image': return ['basic', 'color', 'effects', 'animation', 'mask', 'ai'];
    case 'text': return ['text', 'basic', 'animation', 'effects', 'ai'];
    case 'shape': return ['shape', 'basic', 'animation', 'effects', 'mask', 'ai'];
    case 'solid': return ['basic', 'color', 'effects', 'animation', 'mask'];
    case 'adjustment': return ['color', 'effects', 'basic'];
    case 'audio': return ['audio', 'basic'];
  }
}

export function Inspector() {
  const selection = useEditor((s) => s.selection);
  const clip = useEditor((s) => (s.selection.length === 1 ? s.project.clips.find((c) => c.id === s.selection[0]) : undefined));
  const tab = useEditor((s) => s.inspectorTab);
  const set = useEditor((s) => s.set);
  if (selection.length > 1) {
    return (
      <div className="panel">
        <div className="panel-head"><span className="title">{selection.length} clips seleccionados</span></div>
        <div className="panel-body">
          <div className="stack">
            <button className="btn" onClick={() => getState().duplicateClips(selection)}>Duplicar</button>
            <button className="btn danger" onClick={() => getState().removeClips(selection)}><Trash2 size={13} />Eliminar</button>
            <button className="btn" onClick={() => getState().removeClips(selection, true)}>Eliminar y cerrar huecos</button>
          </div>
          <p className="hint" style={{ marginTop: 12 }}>Los filtros, efectos y transiciones que apliques desde el panel izquierdo se aplicarán a todos los clips seleccionados.</p>
        </div>
      </div>
    );
  }
  if (!clip) return <div className="panel"><div className="panel-head"><span className="title">Inspector</span></div><div className="panel-body"><ProjectSettings /></div></div>;
  const tabs = tabsFor(clip);
  const active = tabs.includes(tab) ? tab : tabs[0];
  const label = (t: string) => (t === 'basic' ? (clip.type === 'audio' ? 'Velocidad' : clip.type === 'video' ? 'Video' : 'General') : TAB_LABELS[t]);
  return (
    <div className="panel">
      <div className="panel-head">
        <span className="title" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{clip.name}</span>
        <span className="muted" style={{ fontSize: 11 }}>{formatDuration(clip.duration)}</span>
      </div>
      <div className="tabs">
        {tabs.map((t) => <button key={t} className={active === t ? 'active' : ''} onClick={() => set({ inspectorTab: t })}>{label(t)}</button>)}
      </div>
      <div className="panel-body">
        {active === 'basic' && <BasicTab clip={clip} />}
        {active === 'color' && <ColorTab clip={clip} />}
        {active === 'effects' && <EffectsTab clip={clip} />}
        {active === 'animation' && <AnimationTab clip={clip} />}
        {active === 'mask' && <MaskTab clip={clip} />}
        {active === 'audio' && <AudioTab clip={clip} />}
        {active === 'text' && clip.text && <TextTab clip={clip} />}
        {active === 'shape' && clip.shape && <ShapeTab clip={clip} />}
        {active === 'ai' && <TrackingTab clip={clip} />}
      </div>
    </div>
  );
}
