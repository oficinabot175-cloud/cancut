import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause, SkipBack, SkipForward, ChevronLeft, ChevronRight, Repeat, Camera, Maximize2, Grid3x3, ScanLine, Activity, Volume2, VolumeX, Crosshair, X } from 'lucide-react';
import { useEditor, getState, projectDuration } from '../store/editor';
import { engine } from '../engine/preview';
import { formatTimecode, clamp } from '../core/utils';
import { clipGeometry, visibleRect, canvasToSource, sourceToCanvas, Geometry } from '../core/geometry';
import { geomCtx, activeClipAt } from '../render/scene';
import { upsertKeyframe } from '../core/keyframes';
import { snapshotPNG, runObjectTracking } from '../core/actions';
import type { Clip, TrackBox } from '../types';
import { Scopes } from './Scopes';
import { Select } from './components/controls';

function setTransformProp(clip: Clip, key: 'x' | 'y' | 'scale' | 'rotation', value: number, localT: number) {
  if (clip.keyframes[key]?.length) clip.keyframes[key] = upsertKeyframe(clip.keyframes[key], { t: localT, v: value, ease: 'easeInOut' });
  else (clip.transform as any)[key] = value;
}

function useStageSize(ref: React.RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({ w: 800, h: 450 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

function Meters() {
  const [lv, setLv] = useState<[number, number]>([0, 0]);
  const playing = useEditor((s) => s.playing);
  useEffect(() => {
    if (!playing) { setLv([0, 0]); return; }
    let raf = 0;
    const loop = () => { const [l, r] = engine.levels(); setLv([Math.min(1, l * 2.2), Math.min(1, r * 2.2)]); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing]);
  return (
    <div className="meter" title="Nivel de audio">
      {lv.map((v, i) => <div className="bar" key={i}><div className="fill" style={{ height: `${v * 100}%` }} /></div>)}
    </div>
  );
}

function TimeDisplay() {
  const time = useEditor((s) => s.time);
  const fps = useEditor((s) => s.project.fps);
  const dur = useEditor((s) => projectDuration(s.project));
  return (
    <div className="row" style={{ gap: 4 }}>
      <span className="timecode">{formatTimecode(time, fps)}</span>
      <span className="timecode dim">/ {formatTimecode(dur, fps)}</span>
    </div>
  );
}

export function Transport() {
  const playing = useEditor((s) => s.playing);
  const loop = useEditor((s) => s.loop);
  const vol = useEditor((s) => s.masterVolume);
  const set = useEditor((s) => s.set);
  const st = getState;
  const step = (d: number) => { const s = st(); s.setPlaying(false); s.setTime(Math.max(0, Math.round(s.time * s.project.fps + d) / s.project.fps)); };
  return (
    <div className="transport">
      <TimeDisplay />
      <div className="spacer" />
      <button className="icon-btn" title="Ir al inicio (Inicio)" onClick={() => { st().setPlaying(false); st().setTime(0); }}><SkipBack size={16} /></button>
      <button className="icon-btn" title="Fotograma anterior (←)" onClick={() => step(-1)}><ChevronLeft size={18} /></button>
      <button className="play-btn" title="Reproducir / Pausa (Espacio)" onClick={() => engine.toggle()}>{playing ? <Pause size={18} fill="#fff" /> : <Play size={18} fill="#fff" style={{ marginLeft: 2 }} />}</button>
      <button className="icon-btn" title="Fotograma siguiente (→)" onClick={() => step(1)}><ChevronRight size={18} /></button>
      <button className="icon-btn" title="Ir al final (Fin)" onClick={() => { st().setPlaying(false); st().setTime(projectDuration(st().project)); }}><SkipForward size={16} /></button>
      <button className={`icon-btn ${loop ? 'active' : ''}`} title="Repetir" onClick={() => set({ loop: !loop })}><Repeat size={15} /></button>
      <div className="spacer" />
      <button className="icon-btn" title="Silenciar" onClick={() => set({ masterVolume: vol > 0 ? 0 : 1 })}>{vol > 0 ? <Volume2 size={16} /> : <VolumeX size={16} />}</button>
      <input type="range" min={0} max={1.5} step={0.01} value={vol} style={{ width: 70 }} onChange={(e) => set({ masterVolume: parseFloat(e.target.value) })} />
      <Meters />
    </div>
  );
}

type DragMode = { kind: 'move' | 'scale' | 'rotate' | 'scaleX' | 'scaleY' | 'track' | 'region'; startX: number; startY: number; clip: Clip; geom: Geometry; extra?: any };

export function Viewer() {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stage = useStageSize(stageRef);
  const project = useEditor((s) => s.project);
  const assets = useEditor((s) => s.assets);
  const time = useEditor((s) => s.time);
  const selection = useEditor((s) => s.selection);
  const showSafe = useEditor((s) => s.showSafeZones);
  const showGrid = useEditor((s) => s.showGrid);
  const showScopes = useEditor((s) => s.showScopes);
  const previewScale = useEditor((s) => s.previewScale);
  const viewerZoom = useEditor((s) => s.viewerZoom);
  const trackingDraw = useEditor((s) => s.trackingDraw);
  const playing = useEditor((s) => s.playing);
  const set = useEditor((s) => s.set);
  const [drag, setDrag] = useState<DragMode | null>(null);
  const [guides, setGuides] = useState<{ v: boolean; h: boolean }>({ v: false, h: false });
  const [trackRect, setTrackRect] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [trackAction, setTrackAction] = useState<'none' | 'blur' | 'focus' | 'follow-text' | 'camera'>('none');

  // Tamaño mostrado del lienzo
  const pad = 24;
  const fitK = Math.min((stage.w - pad * 2) / project.width, (stage.h - pad * 2) / project.height);
  const k = viewerZoom > 0 ? viewerZoom : Math.max(0.05, fitK);
  const dispW = project.width * k, dispH = project.height * k;
  const ox = (stage.w - dispW) / 2, oy = (stage.h - dispH) / 2;

  useEffect(() => { if (canvasRef.current) engine.attach(canvasRef.current); }, []);
  useEffect(() => { engine.setViewport(dispW, dispH); }, [dispW, dispH]);

  const ctx = useMemo(() => geomCtx(project, assets), [project, assets]);
  const selClip = selection.length === 1 ? project.clips.find((c) => c.id === selection[0]) : undefined;
  const selVisible = selClip && selClip.type !== 'audio' && (selClip.type !== 'adjustment' || !!selClip.region) && time >= selClip.start && time < selClip.start + selClip.duration;
  const geom = selVisible ? clipGeometry(selClip!, time, ctx) : null;

  const toScreen = (x: number, y: number) => ({ x: ox + x * k, y: oy + y * k });
  const toProject = (sx: number, sy: number) => ({ x: (sx - ox) / k, y: (sy - oy) / k });

  const hitTest = useCallback((px: number, py: number): Clip | undefined => {
    const vis = project.tracks.filter((t) => t.kind === 'visual' && !t.hidden && !t.locked);
    for (const tr of vis) {
      const c = activeClipAt(project, tr.id, time);
      if (!c || (c.type === 'adjustment' && !c.region)) continue;
      const g = clipGeometry(c, time, ctx);
      const vr = visibleRect(g);
      const r = (-g.rotation * Math.PI) / 180;
      const dx = px - vr.cx, dy = py - vr.cy;
      const lx = dx * Math.cos(r) - dy * Math.sin(r), ly = dx * Math.sin(r) + dy * Math.cos(r);
      if (Math.abs(lx) <= Math.abs(vr.w) / 2 && Math.abs(ly) <= Math.abs(vr.h) / 2) return c;
    }
    return undefined;
  }, [project, time, ctx]);

  const localPos = (e: React.PointerEvent | PointerEvent) => {
    const r = stageRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onStageDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const p = localPos(e);
    const st = getState();
    if (trackingDraw) {
      setTrackRect({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
      const clip = st.project.clips.find((c) => c.id === trackingDraw.clipId);
      if (clip) setDrag({ kind: 'track', startX: p.x, startY: p.y, clip, geom: clipGeometry(clip, time, ctx) });
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      return;
    }
    const pp = toProject(p.x, p.y);
    const hit = hitTest(pp.x, pp.y);
    if (!hit) { st.select([]); return; }
    if (!st.selection.includes(hit.id)) st.select([hit.id]);
    st.beginTx();
    setDrag({ kind: 'move', startX: p.x, startY: p.y, clip: hit, geom: clipGeometry(hit, time, ctx) });
  };

  const startHandle = (kind: DragMode['kind'], e: React.PointerEvent, extra?: any) => {
    e.stopPropagation();
    if (!selClip || !geom) return;
    const p = localPos(e);
    getState().beginTx();
    setDrag({ kind, startX: p.x, startY: p.y, clip: selClip, geom, extra });
  };

  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const p = localPos(e);
      const st = getState();
      const c0 = drag.clip;
      const g0 = drag.geom;
      const localT = st.time - c0.start;
      if (drag.kind === 'track') { setTrackRect((r) => (r ? { ...r, x1: p.x, y1: p.y } : r)); return; }
      if (drag.kind === 'move') {
        let dx = (p.x - drag.startX) / k, dy = (p.y - drag.startY) / k;
        if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
        const W = st.project.width, H = st.project.height;
        let ncx = g0.cx + dx, ncy = g0.cy + dy;
        const snap = 8 / k;
        const gv = Math.abs(ncx - W / 2) < snap, gh = Math.abs(ncy - H / 2) < snap;
        if (gv) ncx = W / 2;
        if (gh) ncy = H / 2;
        setGuides({ v: gv, h: gh });
        dx = ncx - g0.cx; dy = ncy - g0.cy;
        st.updateClip(c0.id, (c) => {
          if (c.follow) { c.follow.offsetX = (drag.extra?.ofx ?? c0.follow!.offsetX) + dx; c.follow.offsetY = (c0.follow!.offsetY) + dy; return; }
          const bx = c0.keyframes.x?.length ? g0.cx - W / 2 : c0.transform.x;
          const by = c0.keyframes.y?.length ? g0.cy - H / 2 : c0.transform.y;
          setTransformProp(c, 'x', Math.round(bx + dx), localT);
          setTransformProp(c, 'y', Math.round(by + dy), localT);
        });
      } else if (drag.kind === 'scale') {
        const c = toScreen(g0.cx, g0.cy);
        const d0 = Math.hypot(drag.startX - c.x, drag.startY - c.y), d1 = Math.hypot(p.x - c.x, p.y - c.y);
        const f = d1 / Math.max(1, d0);
        const base = c0.keyframes.scale?.length ? (c0.keyframes.scale.find((kf) => Math.abs(kf.t - localT) < 1e-3)?.v ?? c0.transform.scale) : c0.transform.scale;
        st.updateClip(c0.id, (c) => setTransformProp(c, 'scale', clamp(Math.round(base * f * 1000) / 1000, 0.01, 20), localT));
      } else if (drag.kind === 'scaleX' || drag.kind === 'scaleY') {
        const c = toScreen(g0.cx, g0.cy);
        const r = (g0.rotation * Math.PI) / 180;
        const axis = drag.kind === 'scaleX' ? { x: Math.cos(r), y: Math.sin(r) } : { x: -Math.sin(r), y: Math.cos(r) };
        const proj = (q: { x: number; y: number }) => Math.abs((q.x - c.x) * axis.x + (q.y - c.y) * axis.y);
        const f = proj(p) / Math.max(1, proj({ x: drag.startX, y: drag.startY }));
        st.updateClip(c0.id, (c) => {
          if (drag.kind === 'scaleX') c.transform.scaleX = clamp(c0.transform.scaleX * f, 0.02, 20);
          else c.transform.scaleY = clamp(c0.transform.scaleY * f, 0.02, 20);
        });
      } else if (drag.kind === 'rotate') {
        const c = toScreen(g0.cx, g0.cy);
        const a0 = Math.atan2(drag.startY - c.y, drag.startX - c.x), a1 = Math.atan2(p.y - c.y, p.x - c.x);
        let rot = c0.transform.rotation + ((a1 - a0) * 180) / Math.PI;
        if (e.shiftKey) rot = Math.round(rot / 15) * 15;
        st.updateClip(c0.id, (c) => setTransformProp(c, 'rotation', Math.round(rot * 10) / 10, localT));
      } else if (drag.kind === 'region') {
        const { fxId, mode, start } = drag.extra;
        const q0 = toProject(drag.startX, drag.startY), q1 = toProject(p.x, p.y);
        const s0 = canvasToSource(g0, q0.x, q0.y), s1 = canvasToSource(g0, q1.x, q1.y);
        st.updateClip(c0.id, (c) => {
          const target = fxId === '__mask' ? (c.mask as any) : c.effects.find((f) => f.id === fxId)?.params;
          if (!target) return;
          if (mode === 'move') { target.x = clamp(start.x + s1.x - s0.x, -0.5, 1.5); target.y = clamp(start.y + s1.y - s0.y, -0.5, 1.5); }
          else { target.w = clamp(Math.abs(s1.x - start.x) * 2, 0.01, 2); target.h = clamp(Math.abs(s1.y - start.y) * 2, 0.01, 2); }
        });
      }
    };
    const up = () => {
      if (drag.kind === 'track') { setDrag(null); return; }
      getState().endTx();
      setGuides({ v: false, h: false });
      setDrag(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [drag, k, ox, oy]);

  // Caja de seguimiento → coordenadas normalizadas de la fuente
  const trackBox = (): TrackBox | null => {
    if (!trackRect || !trackingDraw) return null;
    const clip = project.clips.find((c) => c.id === trackingDraw.clipId);
    if (!clip) return null;
    const g = clipGeometry(clip, time, ctx);
    const a = toProject(Math.min(trackRect.x0, trackRect.x1), Math.min(trackRect.y0, trackRect.y1));
    const b = toProject(Math.max(trackRect.x0, trackRect.x1), Math.max(trackRect.y0, trackRect.y1));
    const sa = canvasToSource(g, a.x, a.y), sb = canvasToSource(g, b.x, b.y);
    const w = Math.abs(sb.x - sa.x), h = Math.abs(sb.y - sa.y);
    if (w < 0.01 || h < 0.01) return null;
    return { x: (sa.x + sb.x) / 2, y: (sa.y + sb.y) / 2, w, h };
  };

  // Regiones editables (efecto de zona o máscara) del clip seleccionado
  const regions: { id: string; label: string; x: number; y: number; w: number; h: number; ellipse: boolean }[] = [];
  if (geom && selClip && !playing) {
    for (const f of selClip.effects) {
      if ((f.type === 'regionBlur' || f.type === 'focus') && f.enabled && !f.params.tracking) {
        regions.push({ id: f.id, label: f.type === 'focus' ? 'Enfoque' : 'Zona', x: Number(f.params.x), y: Number(f.params.y), w: Number(f.params.w), h: Number(f.params.h), ellipse: f.params.shape !== 'rect' });
      }
    }
    if (selClip.mask.shape !== 'none' && selClip.mask.shape !== 'linear') regions.push({ id: '__mask', label: 'Máscara', ...selClip.mask, ellipse: selClip.mask.shape === 'ellipse' });
  }

  const vr = geom ? visibleRect(geom) : null;
  const corners = vr && geom ? [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => {
    const r = (geom.rotation * Math.PI) / 180;
    const lx = (sx * vr.w) / 2, ly = (sy * vr.h) / 2;
    return toScreen(vr.cx + lx * Math.cos(r) - ly * Math.sin(r), vr.cy + lx * Math.sin(r) + ly * Math.cos(r));
  }) : null;
  const edgeMid = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const topMid = corners ? edgeMid(corners[0], corners[1]) : null;
  const rotHandle = topMid && geom ? (() => {
    const r = (geom.rotation * Math.PI) / 180;
    return { x: topMid.x + Math.sin(r) * 28, y: topMid.y - Math.cos(r) * 28 };
  })() : null;

  const dur = projectDuration(project);
  const trackingClip = trackingDraw ? project.clips.find((c) => c.id === trackingDraw.clipId) : undefined;
  const tb = trackBox();

  return (
    <div className="viewer">
      <div className="viewer-bar">
        <span className="muted" style={{ fontSize: 11 }}>{project.width}×{project.height} · {project.fps} fps</span>
        <div className="spacer" />
        <Select value={viewerZoom} onChange={(v) => set({ viewerZoom: v })} options={[{ value: 0, label: 'Ajustar' }, { value: 0.25, label: '25%' }, { value: 0.5, label: '50%' }, { value: 1, label: '100%' }]} />
        <Select value={previewScale} onChange={(v) => set({ previewScale: v })} options={[{ value: 1, label: 'Calidad: completa' }, { value: 0.5, label: 'Calidad: 1/2' }, { value: 0.25, label: 'Calidad: 1/4' }]} />
        <button className={`icon-btn ${showGrid ? 'active' : ''}`} title="Cuadrícula de tercios" onClick={() => set({ showGrid: !showGrid })}><Grid3x3 size={15} /></button>
        <button className={`icon-btn ${showSafe ? 'active' : ''}`} title="Zonas seguras" onClick={() => set({ showSafeZones: !showSafe })}><ScanLine size={15} /></button>
        <button className={`icon-btn ${showScopes ? 'active' : ''}`} title="Scopes de color" onClick={() => set({ showScopes: !showScopes })}><Activity size={15} /></button>
        <button className="icon-btn" title="Exportar fotograma PNG" onClick={() => snapshotPNG()}><Camera size={15} /></button>
        <button className="icon-btn" title="Pantalla completa" onClick={() => stageRef.current?.requestFullscreen?.()}><Maximize2 size={15} /></button>
      </div>
      <div className="viewer-stage" ref={stageRef} onPointerDown={onStageDown}
        onDragOver={(e) => { if (e.dataTransfer.types.includes('application/x-nc-asset')) e.preventDefault(); }}
        onDrop={(e) => { const id = e.dataTransfer.getData('application/x-nc-asset'); if (id) { e.preventDefault(); getState().addAssetToTimeline(id); } }}
        style={{ cursor: trackingDraw ? 'crosshair' : undefined }}>
        <div className="canvas-wrap" style={{ left: ox, top: oy, width: dispW, height: dispH }}>
          <canvas ref={canvasRef} />
        </div>
        {engine.error && <div className="empty" style={{ position: 'absolute', color: 'var(--err)' }}>{engine.error}</div>}
        {dur === 0 && !engine.error && (
          <div className="empty" style={{ position: 'absolute', pointerEvents: 'none' }}>
            <div style={{ fontSize: 15, color: 'var(--text2)', marginBottom: 4 }}>Arrastra videos, fotos o música aquí</div>
            o usa el panel de Medios para importar
          </div>
        )}
        <svg className="overlay-svg" style={{ pointerEvents: 'none' }}>
          {showGrid && [1, 2].map((i) => (
            <g key={i} stroke="rgba(255,255,255,.35)" strokeWidth={1}>
              <line x1={ox + (dispW * i) / 3} y1={oy} x2={ox + (dispW * i) / 3} y2={oy + dispH} />
              <line x1={ox} y1={oy + (dispH * i) / 3} x2={ox + dispW} y2={oy + (dispH * i) / 3} />
            </g>
          ))}
          {showSafe && (
            <g fill="none" strokeDasharray="4 4">
              <rect x={ox + dispW * 0.05} y={oy + dispH * 0.05} width={dispW * 0.9} height={dispH * 0.9} stroke="rgba(0,212,255,.6)" />
              <rect x={ox + dispW * 0.1} y={oy + dispH * 0.1} width={dispW * 0.8} height={dispH * 0.8} stroke="rgba(255,176,32,.7)" />
            </g>
          )}
          {guides.v && <line x1={ox + dispW / 2} y1={oy} x2={ox + dispW / 2} y2={oy + dispH} stroke="#ff3bd4" strokeWidth={1} />}
          {guides.h && <line x1={ox} y1={oy + dispH / 2} x2={ox + dispW} y2={oy + dispH / 2} stroke="#ff3bd4" strokeWidth={1} />}
          {/* cajas de seguimiento del clip seleccionado */}
          {geom && selClip && !playing && project.trackings.filter((td) => td.assetId === selClip.assetId && (td.kind === 'object' || td.kind === 'faces')).slice(-1).map((td) => {
            const ts = selClip.in + (time - selClip.start) * selClip.speed;
            const s = td.samples;
            if (!s.length) return null;
            let best = s[0];
            for (const x of s) if (Math.abs(x.t - ts) < Math.abs(best.t - ts)) best = x;
            return best.boxes.map((b, i) => {
              const p = sourceToCanvas(geom, b.x, b.y);
              const sc = toScreen(p.x, p.y);
              const w = b.w * geom.fw * k, h = b.h * geom.fh * k;
              return <rect key={td.id + i} x={sc.x - w / 2} y={sc.y - h / 2} width={w} height={h} fill="none" stroke="#2fd48a" strokeWidth={1.5} strokeDasharray="5 3" />;
            });
          })}
        </svg>
        {/* Gizmo de transformación */}
        {corners && geom && !trackingDraw && selClip && (
          <svg className="overlay-svg" style={{ pointerEvents: 'none' }}>
            <polygon points={corners.map((c) => `${c.x},${c.y}`).join(' ')} fill="none" stroke="#7c5cff" strokeWidth={1.5} />
            {topMid && rotHandle && <line x1={topMid.x} y1={topMid.y} x2={rotHandle.x} y2={rotHandle.y} stroke="#7c5cff" strokeWidth={1.2} />}
            {corners.map((c, i) => (
              <rect key={i} x={c.x - 5} y={c.y - 5} width={10} height={10} rx={2} fill="#fff" stroke="#7c5cff" strokeWidth={1.5}
                style={{ pointerEvents: 'all', cursor: i % 2 === 0 ? 'nwse-resize' : 'nesw-resize' }} onPointerDown={(e) => startHandle('scale', e)} />
            ))}
            {selClip.type !== 'text' && [[0, 1, 'scaleY'], [1, 2, 'scaleX'], [2, 3, 'scaleY'], [3, 0, 'scaleX']].map(([a, b, kind], i) => {
              const m = edgeMid(corners[a as number], corners[b as number]);
              return <circle key={'e' + i} cx={m.x} cy={m.y} r={4} fill="#7c5cff" stroke="#fff" strokeWidth={1}
                style={{ pointerEvents: 'all', cursor: kind === 'scaleX' ? 'ew-resize' : 'ns-resize' }} onPointerDown={(e) => startHandle(kind as any, e)} />;
            })}
            {rotHandle && <circle cx={rotHandle.x} cy={rotHandle.y} r={6} fill="#00d4ff" stroke="#fff" strokeWidth={1.5} style={{ pointerEvents: 'all', cursor: 'grab' }} onPointerDown={(e) => startHandle('rotate', e)} />}
            {regions.map((r) => {
              const c = sourceToCanvas(geom, r.x, r.y);
              const sc = toScreen(c.x, c.y);
              const w = r.w * geom.fw * k, h = r.h * geom.fh * k;
              const corner = sourceToCanvas(geom, r.x + r.w / 2, r.y + r.h / 2);
              const cs = toScreen(corner.x, corner.y);
              return (
                <g key={r.id}>
                  {r.ellipse ? <ellipse cx={sc.x} cy={sc.y} rx={Math.abs(w / 2)} ry={Math.abs(h / 2)} fill="rgba(255,176,32,.08)" stroke="#ffb020" strokeDasharray="6 4" strokeWidth={1.5} style={{ pointerEvents: 'all', cursor: 'move' }} onPointerDown={(e) => startHandle('region', e, { fxId: r.id, mode: 'move', start: { x: r.x, y: r.y } })} />
                    : <rect x={sc.x - Math.abs(w) / 2} y={sc.y - Math.abs(h) / 2} width={Math.abs(w)} height={Math.abs(h)} fill="rgba(255,176,32,.08)" stroke="#ffb020" strokeDasharray="6 4" strokeWidth={1.5} style={{ pointerEvents: 'all', cursor: 'move' }} onPointerDown={(e) => startHandle('region', e, { fxId: r.id, mode: 'move', start: { x: r.x, y: r.y } })} />}
                  <circle cx={cs.x} cy={cs.y} r={5} fill="#ffb020" stroke="#fff" style={{ pointerEvents: 'all', cursor: 'nwse-resize' }} onPointerDown={(e) => startHandle('region', e, { fxId: r.id, mode: 'size', start: { x: r.x, y: r.y } })} />
                  <text x={sc.x} y={sc.y - Math.abs(h) / 2 - 6} fill="#ffb020" fontSize={11} textAnchor="middle">{r.label}</text>
                </g>
              );
            })}
          </svg>
        )}
        {/* Dibujo de seguimiento */}
        {trackingDraw && (
          <>
            <svg className="overlay-svg" style={{ pointerEvents: 'none' }}>
              {trackRect && <rect x={Math.min(trackRect.x0, trackRect.x1)} y={Math.min(trackRect.y0, trackRect.y1)} width={Math.abs(trackRect.x1 - trackRect.x0)} height={Math.abs(trackRect.y1 - trackRect.y0)} fill="rgba(47,212,138,.12)" stroke="#2fd48a" strokeWidth={2} />}
            </svg>
            <div className="scopes" style={{ left: 10, right: 'auto', width: 290 }} onPointerDown={(e) => e.stopPropagation()}>
              <div className="row between" style={{ marginBottom: 6 }}><b className="row"><Crosshair size={14} />Seguimiento de objeto</b><button className="icon-btn sm" onClick={() => { set({ trackingDraw: null, tool: 'select' }); setTrackRect(null); }}><X size={13} /></button></div>
              <p className="hint" style={{ margin: '0 0 8px' }}>{trackingClip ? `Clip: ${trackingClip.name}. ` : ''}Dibuja un recuadro ajustado al objeto en el fotograma actual.</p>
              <div className="prop"><label>Al terminar</label>
                <Select value={trackAction} onChange={setTrackAction} options={[{ value: 'none', label: 'Solo rastrear' }, { value: 'blur', label: 'Difuminar objeto' }, { value: 'focus', label: 'Enfocar objeto' }, { value: 'follow-text', label: 'Texto que lo sigue' }, { value: 'camera', label: 'Cámara que lo sigue' }]} style={{ width: '100%' }} /><span />
              </div>
              <button className="btn primary block" disabled={!tb} onClick={() => { if (tb && trackingDraw) { runObjectTracking(trackingDraw.clipId, tb, trackAction); setTrackRect(null); } }}>Analizar movimiento</button>
            </div>
          </>
        )}
        {showScopes && <Scopes />}
        <div className="viewer-info">{Math.round(previewScale * 100)}% · {engine.fps || 0} fps</div>
      </div>
      <Transport />
    </div>
  );
}
