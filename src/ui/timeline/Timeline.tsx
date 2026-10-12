import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  MousePointer2, Scissors, Trash2, Copy, Magnet, ZoomIn, ZoomOut, Plus, Eye, EyeOff, Volume2, VolumeX, Lock, Unlock,
  Bookmark, Film, Music, Maximize, SplitSquareHorizontal, Type, Wand2, Snowflake, Crosshair, Move, Undo2, Redo2, ArrowRightLeft,
} from 'lucide-react';
import { useEditor, getState, projectDuration, maxClipDuration } from '../../store/editor';
import type { Clip, Track } from '../../types';
import { formatTimecode, clamp, snapToFrame } from '../../core/utils';
import { ContextMenu } from '../components/controls';
import { importFiles, addEffect, applyFilter, applyTransition, freezeFrame, removeBackground, startObjectTracking, stabilizeClip, removeSilences } from '../../core/actions';
import { TEXT_PRESETS } from '../../core/presets';
import { addTextPreset } from '../panels/TextPanel';
import { engine } from '../../engine/preview';

const HEAD_W = 168;
const RULER_H = 28;
const SEP = 4;
const MIN_ZOOM = 4, MAX_ZOOM = 1500;

interface Layout { track: Track; top: number; height: number }

function useTrackLayout(tracks: Track[]): { rows: Layout[]; total: number } {
  return useMemo(() => {
    let y = 0;
    const rows: Layout[] = [];
    tracks.forEach((t, i) => {
      if (i > 0 && t.kind === 'audio' && tracks[i - 1].kind === 'visual') y += SEP;
      rows.push({ track: t, top: y, height: t.height });
      y += t.height;
    });
    return { rows, total: y };
  }, [tracks]);
}

// ------------------------------------------------------------------ Regla
function Ruler({ zoom, scrollLeft, width, fps, onScrub }: { zoom: number; scrollLeft: number; width: number; fps: number; onScrub: (e: React.PointerEvent) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const markers = useEditor((s) => s.project.markers);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.max(1, width * dpr); c.height = RULER_H * dpr;
    c.style.width = width + 'px';
    const g = c.getContext('2d')!;
    g.scale(dpr, dpr);
    g.clearRect(0, 0, width, RULER_H);
    const steps = [1 / fps, 2 / fps, 5 / fps, 10 / fps, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800];
    const major = steps.find((s) => s * zoom >= 90) || 3600;
    const minorN = major >= 1 ? (major % 5 === 0 ? 5 : major % 2 === 0 ? 4 : 2) : 5;
    const minor = major / minorN;
    const t0 = scrollLeft / zoom, t1 = (scrollLeft + width) / zoom;
    g.strokeStyle = '#4a5266'; g.fillStyle = '#8b93a7'; g.font = '10px JetBrains Mono, monospace';
    g.beginPath();
    for (let t = Math.floor(t0 / minor) * minor; t <= t1; t += minor) {
      const x = Math.round(t * zoom - scrollLeft) + 0.5;
      const isMajor = Math.abs(t / major - Math.round(t / major)) < 1e-6;
      g.moveTo(x, RULER_H); g.lineTo(x, isMajor ? RULER_H - 12 : RULER_H - 5);
      if (isMajor) {
        const label = major < 1 ? formatTimecode(t, fps).slice(3) : formatTimecode(t, fps, false).replace(/^00:/, '');
        g.fillText(label, x + 3, 11);
      }
    }
    g.stroke();
    for (const m of markers) {
      const x = m.t * zoom - scrollLeft;
      if (x < -10 || x > width + 10) continue;
      g.fillStyle = m.color; g.beginPath(); g.moveTo(x - 5, 14); g.lineTo(x + 5, 14); g.lineTo(x, 22); g.fill();
    }
  }, [zoom, scrollLeft, width, fps, markers]);
  return (
    <div className="ruler" onPointerDown={onScrub}>
      <canvas ref={ref} style={{ left: scrollLeft }} />
    </div>
  );
}

// ------------------------------------------------------------------ Forma de onda
const Waveform = memo(function Waveform({ peaks, inSec, durSec, width, color }: { peaks: number[]; inSec: number; durSec: number; width: number; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const W = Math.max(1, Math.min(4000, Math.round(width)));
    const H = 40;
    c.width = W; c.height = H;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, W, H);
    g.fillStyle = color;
    const rate = 50;
    for (let x = 0; x < W; x++) {
      const a = Math.floor((inSec + (x / W) * durSec) * rate), b = Math.max(a + 1, Math.floor((inSec + ((x + 1) / W) * durSec) * rate));
      let m = 0;
      for (let i = a; i < b && i < peaks.length; i++) if (peaks[i] > m) m = peaks[i];
      const h = Math.max(1, m * H);
      g.fillRect(x, (H - h) / 2, 1, h);
    }
  }, [peaks, inSec, durSec, width, color]);
  return <canvas ref={ref} className="wave" style={{ width: '100%' }} />;
});

// ------------------------------------------------------------------ Clip
interface ClipViewProps {
  clip: Clip; zoom: number; selected: boolean; height: number; locked: boolean;
  onPointerDown: (e: React.PointerEvent, clip: Clip, mode: 'move' | 'trimL' | 'trimR') => void;
  onContext: (e: React.MouseEvent, clip: Clip) => void;
}

const ClipView = memo(function ClipView({ clip, zoom, selected, height, locked, onPointerDown, onContext }: ClipViewProps) {
  const asset = useEditor((s) => (clip.assetId ? s.assets[clip.assetId] : undefined));
  const left = clip.start * zoom;
  const width = Math.max(2, clip.duration * zoom);
  const tiles = useMemo(() => {
    if (clip.type !== 'video' && clip.type !== 'image') return [];
    const strip = clip.type === 'image' ? (asset?.thumbnail ? [asset.thumbnail] : []) : asset?.filmstrip || (asset?.thumbnail ? [asset.thumbnail] : []);
    if (!strip.length) return [];
    const tileW = Math.max(30, (height - 6) * (asset && asset.height ? asset.width / asset.height : 16 / 9));
    const n = Math.min(120, Math.ceil(width / tileW));
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
      if (clip.type === 'image') { out.push(strip[0]); continue; }
      const ts = clip.in + ((i + 0.5) * tileW / zoom) * clip.speed;
      const idx = clamp(Math.floor((ts / Math.max(0.01, asset!.duration)) * strip.length), 0, strip.length - 1);
      out.push(strip[idx]);
    }
    return out.map((src) => ({ src, w: tileW }));
  }, [clip.type, clip.in, clip.speed, asset?.filmstrip, asset?.thumbnail, width, height, zoom]);
  const kfTimes = useMemo(() => [...new Set(Object.values(clip.keyframes).flat().map((k) => Math.round(k.t * 100) / 100))], [clip.keyframes]);
  const showWave = (clip.type === 'audio' || (clip.type === 'video' && !clip.audioDetached)) && asset?.waveform;
  const label = clip.type === 'text' ? (clip.text?.content || 'Texto') : clip.name;
  const badges: string[] = [];
  if (clip.speed !== 1) badges.push(`${clip.speed}×`);
  if (clip.effects.length) badges.push(`FX ${clip.effects.length}`);
  if (clip.grade.filter !== 'none' || clip.grade.lutId) badges.push('◐');
  if (clip.follow || clip.reframe || clip.stabilize) badges.push('⌖');
  if (clip.audio.muted && clip.type !== 'image') badges.push('🔇');
  return (
    <div
      className={`clip ${clip.type} ${selected ? 'selected' : ''} ${locked ? 'disabled' : ''}`}
      style={{ left, width }}
      onPointerDown={(e) => onPointerDown(e, clip, 'move')}
      onContextMenu={(e) => onContext(e, clip)}
      data-clip={clip.id}
      title={`${clip.name}\n${formatTimecode(clip.start, 30).slice(3)} · ${clip.duration.toFixed(2)} s`}
    >
      {tiles.length > 0 && <div className="strip">{tiles.map((t, i) => <img key={i} src={t.src} style={{ width: t.w }} alt="" />)}</div>}
      {showWave && <Waveform peaks={asset!.waveform!} inSec={clip.in} durSec={clip.duration * clip.speed} width={width} color={clip.type === 'audio' ? 'rgba(220,255,235,.75)' : 'rgba(255,255,255,.45)'} />}
      {clip.transitionIn && <div className="trans" style={{ width: Math.min(width, clip.transitionIn.duration * zoom) }} title="Transición" />}
      {clip.audio.fadeIn > 0 && <div className="fade" style={{ left: 0, width: clip.audio.fadeIn * zoom, background: 'linear-gradient(90deg, rgba(0,0,0,.5), transparent)' }} />}
      {clip.audio.fadeOut > 0 && <div className="fade" style={{ right: 0, width: clip.audio.fadeOut * zoom, background: 'linear-gradient(270deg, rgba(0,0,0,.5), transparent)' }} />}
      <div className="label">
        {clip.type === 'text' ? <Type size={10} /> : clip.type === 'audio' ? <Music size={10} /> : clip.type === 'adjustment' ? <Wand2 size={10} /> : clip.type === 'video' ? <Film size={10} /> : null}
        {label}
      </div>
      {width > 60 && badges.length > 0 && <div className="badges">{badges.map((b) => <span key={b}>{b}</span>)}</div>}
      {kfTimes.map((t) => <div key={t} className="kf" style={{ left: t * zoom }} />)}
      {!locked && <>
        <div className="handle l" onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e, clip, 'trimL'); }} />
        <div className="handle r" onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e, clip, 'trimR'); }} />
      </>}
    </div>
  );
});

function Playhead({ zoom }: { zoom: number }) {
  const time = useEditor((s) => s.time);
  return <div className="playhead" style={{ left: time * zoom }} />;
}

// ------------------------------------------------------------------ Timeline
interface DragState {
  mode: 'move' | 'trimL' | 'trimR';
  startX: number; startY: number;
  clipId: string;
  orig: Clip[];
  started: boolean;
  origTrackIdx: number;
}

export function Timeline() {
  const project = useEditor((s) => s.project);
  const selection = useEditor((s) => s.selection);
  const zoom = useEditor((s) => s.zoom);
  const tool = useEditor((s) => s.tool);
  const snapping = useEditor((s) => s.snapping);
  const ripple = useEditor((s) => s.rippleMode);
  const playing = useEditor((s) => s.playing);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const set = useEditor((s) => s.set);
  const scrollRef = useRef<HTMLDivElement>(null);
  const headsRef = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState({ left: 0, top: 0, width: 800, height: 200 });
  const [snapLine, setSnapLine] = useState<number | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; clip: Clip } | null>(null);
  const [dropRow, setDropRow] = useState<string | null>(null);
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [editingTrack, setEditingTrack] = useState<string | null>(null);
  const drag = useRef<DragState | null>(null);
  const { rows, total } = useTrackLayout(project.tracks);
  const duration = projectDuration(project);
  const contentW = Math.max((duration + 30) * zoom, scroll.width + 200);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setScroll({ left: el.scrollLeft, top: el.scrollTop, width: el.clientWidth, height: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    el.addEventListener('scroll', update);
    return () => { ro.disconnect(); el.removeEventListener('scroll', update); };
  }, []);

  // seguimiento automático del cabezal durante la reproducción
  useEffect(() => {
    if (!playing) return;
    return useEditor.subscribe((s) => {
      const el = scrollRef.current;
      if (!el) return;
      const x = s.time * s.zoom;
      if (x > el.scrollLeft + el.clientWidth - 60 || x < el.scrollLeft) el.scrollLeft = Math.max(0, x - 80);
    });
  }, [playing]);

  const timeAt = (clientX: number) => {
    const el = scrollRef.current!;
    const r = el.getBoundingClientRect();
    return Math.max(0, (clientX - r.left + el.scrollLeft) / zoom);
  };
  const rowAt = (clientY: number): Layout | undefined => {
    const el = scrollRef.current!;
    const r = el.getBoundingClientRect();
    const y = clientY - r.top + el.scrollTop - RULER_H;
    return rows.find((row) => y >= row.top && y < row.top + row.height);
  };

  const snapPoints = useCallback((exclude: string[]) => {
    const st = getState();
    const pts = [0, st.time, ...st.project.markers.map((m) => m.t)];
    for (const c of st.project.clips) if (!exclude.includes(c.id)) pts.push(c.start, c.start + c.duration);
    return pts;
  }, []);

  const scrub = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const st = getState();
    st.setPlaying(false);
    const move = (ev: PointerEvent | React.PointerEvent) => st.setTime(snapToFrame(timeAt(ev.clientX), st.project.fps));
    move(e);
    const mv = (ev: PointerEvent) => move(ev);
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };

  const onClipDown = useCallback((e: React.PointerEvent, clip: Clip, mode: 'move' | 'trimL' | 'trimR') => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const st = getState();
    const track = st.project.tracks.find((t) => t.id === clip.trackId);
    if (st.tool === 'blade') {
      if (track?.locked) return;
      const t = snapToFrame(timeAt(e.clientX), st.project.fps);
      st.splitAt(t, [clip.id]);
      return;
    }
    let sel = st.selection;
    if (e.shiftKey || e.ctrlKey || e.metaKey) { st.select([clip.id], true); sel = getState().selection; if (!sel.includes(clip.id)) return; }
    else if (!sel.includes(clip.id)) { st.select([clip.id]); sel = [clip.id]; }
    if (track?.locked) return;
    const ids = mode === 'move' ? sel : [clip.id];
    drag.current = {
      mode, startX: e.clientX, startY: e.clientY, clipId: clip.id, started: false,
      orig: st.project.clips.filter((c) => ids.includes(c.id)).map((c) => ({ ...c })),
      origTrackIdx: st.project.tracks.findIndex((t) => t.id === clip.trackId),
    };
  }, [zoom, rows]);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const st = getState();
      if (!d.started) {
        if (Math.abs(e.clientX - d.startX) < 3 && Math.abs(e.clientY - d.startY) < 3) return;
        d.started = true;
        st.beginTx();
      }
      const fps = st.project.fps;
      let dt = (e.clientX - d.startX) / zoom;
      const main = d.orig.find((c) => c.id === d.clipId)!;
      const thr = 8 / zoom;
      const excl = d.orig.map((c) => c.id);
      const doSnap = st.snapping !== e.altKey;
      let snapped: number | null = null;
      const trySnap = (edges: number[]) => {
        if (!doSnap) return;
        let best = thr, bestDelta = 0;
        for (const p of snapPoints(excl)) for (const edge of edges) {
          const diff = p - (edge + dt);
          if (Math.abs(diff) < best) { best = Math.abs(diff); bestDelta = diff; snapped = p; }
        }
        dt += bestDelta;
      };
      if (d.mode === 'move') {
        trySnap([main.start, main.start + main.duration]);
        const minStart = Math.min(...d.orig.map((c) => c.start));
        dt = Math.max(dt, -minStart);
        dt = Math.round(dt * fps) / fps;
        // cambio de pista (mismo tipo)
        const row = rowAt(e.clientY);
        const mainTrack = st.project.tracks.find((t) => t.id === main.trackId)!;
        let targetTrack: string | null = null;
        if (row && row.track.kind === mainTrack.kind && !row.track.locked && d.orig.length === 1) targetTrack = row.track.id;
        st.update((p) => {
          for (const o of d.orig) {
            const c = p.clips.find((x) => x.id === o.id);
            if (!c) continue;
            c.start = o.start + dt;
            if (targetTrack && o.id === main.id) c.trackId = targetTrack;
          }
        });
      } else if (d.mode === 'trimL') {
        const asset = main.assetId ? st.assets[main.assetId] : undefined;
        trySnap([main.start]);
        const end = main.start + main.duration;
        let ns = clamp(main.start + dt, 0, end - 1 / fps);
        if (asset && asset.kind !== 'image') ns = Math.max(ns, main.start - main.in / main.speed);
        ns = Math.round(ns * fps) / fps;
        st.update((p) => {
          const c = p.clips.find((x) => x.id === main.id)!;
          const shift = ns - main.start;
          c.start = ns;
          c.duration = end - ns;
          c.in = Math.max(0, main.in + shift * main.speed);
          if (c.text?.words) c.text.words = main.text!.words!.map((w) => ({ ...w, start: w.start - shift, end: w.end - shift }));
          for (const k of Object.keys(c.keyframes)) c.keyframes[k] = main.keyframes[k].map((kf) => ({ ...kf, t: kf.t - shift }));
        });
      } else {
        const asset = main.assetId ? st.assets[main.assetId] : undefined;
        trySnap([main.start + main.duration]);
        let nd = Math.max(1 / fps, main.duration + dt);
        nd = Math.min(nd, maxClipDuration(main, asset));
        nd = Math.round(nd * fps) / fps;
        const delta = nd - main.duration;
        st.update((p) => {
          const c = p.clips.find((x) => x.id === main.id)!;
          c.duration = nd;
          if (st.rippleMode) {
            for (const o of p.clips) if (o.trackId === main.trackId && o.id !== main.id && o.start >= main.start + main.duration - 1e-4) {
              const orig = st.txBase?.clips.find((x) => x.id === o.id);
              if (orig) o.start = orig.start + delta;
            }
          }
        });
      }
      setSnapLine(snapped);
    };
    const up = () => {
      const d = drag.current;
      drag.current = null;
      setSnapLine(null);
      if (!d || !d.started) return;
      const st = getState();
      if (d.mode === 'move') st.commit((p) => st.resolveOverlaps(p, d.orig.map((c) => c.id)));
      else if (d.mode === 'trimR' && !st.rippleMode) st.commit((p) => st.resolveOverlaps(p, [d.clipId]));
      else if (d.mode === 'trimL') st.commit((p) => st.resolveOverlaps(p, [d.clipId]));
      st.endTx();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [zoom, rows, snapPoints]);

  // Zoom con Ctrl + rueda, anclado al cursor
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) {
        if (e.shiftKey && !e.deltaX) { el.scrollLeft += e.deltaY; e.preventDefault(); }
        return;
      }
      e.preventDefault();
      const st = getState();
      const r = el.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const tAt = (mx + el.scrollLeft) / st.zoom;
      const nz = clamp(st.zoom * Math.exp(-e.deltaY * 0.0022), MIN_ZOOM, MAX_ZOOM);
      st.set({ zoom: nz });
      requestAnimationFrame(() => { el.scrollLeft = Math.max(0, tAt * nz - mx); });
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []);

  const fitZoom = () => {
    const el = scrollRef.current;
    if (!el) return;
    const d = Math.max(5, projectDuration(getState().project));
    set({ zoom: clamp((el.clientWidth - 60) / d, MIN_ZOOM, MAX_ZOOM) });
    el.scrollLeft = 0;
  };

  // Selección por recuadro / clic en vacío
  const onEmptyDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('.clip') || (e.target as HTMLElement).closest('.ruler')) return;
    const el = scrollRef.current!;
    const r = el.getBoundingClientRect();
    const x0 = e.clientX - r.left + el.scrollLeft, y0 = e.clientY - r.top + el.scrollTop;
    let moved = false;
    const additive = e.shiftKey || e.ctrlKey;
    const base = additive ? getState().selection : [];
    const mv = (ev: PointerEvent) => {
      const x1 = ev.clientX - r.left + el.scrollLeft, y1 = ev.clientY - r.top + el.scrollTop;
      if (!moved && Math.hypot(x1 - x0, y1 - y0) < 4) return;
      moved = true;
      setMarquee({ x0, y0, x1, y1 });
      const t0 = Math.min(x0, x1) / zoom, t1 = Math.max(x0, x1) / zoom;
      const ya = Math.min(y0, y1) - RULER_H, yb = Math.max(y0, y1) - RULER_H;
      const ids = getState().project.clips.filter((c) => {
        const row = rows.find((rw) => rw.track.id === c.trackId);
        if (!row) return false;
        return c.start < t1 && c.start + c.duration > t0 && row.top < yb && row.top + row.height > ya;
      }).map((c) => c.id);
      getState().select([...new Set([...base, ...ids])]);
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      setMarquee(null);
      if (!moved) {
        const st = getState();
        if (!additive) st.select([]);
        st.setPlaying(false);
        st.setTime(snapToFrame(timeAt(ev.clientX), st.project.fps));
      }
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };

  // Soltar elementos desde paneles o archivos
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDropRow(null);
    const st = getState();
    const t = snapToFrame(timeAt(e.clientX), st.project.fps);
    const row = rowAt(e.clientY);
    const clipEl = (e.target as HTMLElement).closest('[data-clip]') as HTMLElement | null;
    const clipId = clipEl?.dataset.clip;
    const dt = e.dataTransfer;
    const asset = dt.getData('application/x-nc-asset');
    const fx = dt.getData('application/x-nc-effect');
    const filter = dt.getData('application/x-nc-filter');
    const trans = dt.getData('application/x-nc-transition');
    const text = dt.getData('application/x-nc-text');
    const shape = dt.getData('application/x-nc-shape');
    if (asset) {
      const a = st.assets[asset];
      const kind = a?.kind === 'audio' ? 'audio' : 'visual';
      st.addAssetToTimeline(asset, t, row && row.track.kind === kind ? row.track.id : undefined);
    } else if (fx && clipId) addEffect(fx as any, [clipId]);
    else if (filter && clipId) { st.updateClip(clipId, (c) => { c.grade.filter = filter; }); }
    else if (trans && clipId) applyTransition(trans as any, parseFloat(dt.getData('text/duration')) || 0.8, clipId);
    else if (fx) { addEffect(fx as any); }
    else if (filter) applyFilter(filter);
    else if (text) { const p = TEXT_PRESETS.find((x) => x.id === text); if (p) addTextPreset(p, t); }
    else if (shape) { st.setTime(t); st.addShapeClip(shape as any); }
    else if (dt.files.length) {
      (e.nativeEvent as any).__handled = true;
      await importFiles(Array.from(dt.files), { addToTimeline: true, at: t });
    }
  };

  const clipMenu = (e: React.MouseEvent, clip: Clip) => {
    e.preventDefault();
    const st = getState();
    if (!st.selection.includes(clip.id)) st.select([clip.id]);
    setMenu({ x: e.clientX, y: e.clientY, clip });
  };

  const st = getState;
  const selCount = selection.length;
  const visualCount = project.tracks.filter((t) => t.kind === 'visual').length;

  return (
    <div className="timeline">
      <div className="tl-toolbar">
        <button className="icon-btn" title="Deshacer (Ctrl+Z)" disabled={!canUndo} onClick={() => st().undo()}><Undo2 size={15} /></button>
        <button className="icon-btn" title="Rehacer (Ctrl+Shift+Z)" disabled={!canRedo} onClick={() => st().redo()}><Redo2 size={15} /></button>
        <div className="sep" />
        <button className={`icon-btn ${tool === 'select' ? 'active' : ''}`} title="Selección (V)" onClick={() => set({ tool: 'select' })}><MousePointer2 size={15} /></button>
        <button className={`icon-btn ${tool === 'blade' ? 'active' : ''}`} title="Cuchilla (C)" onClick={() => set({ tool: 'blade' })}><Scissors size={15} /></button>
        <div className="sep" />
        <button className="icon-btn" title="Dividir en el cabezal (S)" onClick={() => st().splitAt(st().time, selCount ? selection : undefined)}><SplitSquareHorizontal size={15} /></button>
        <button className="icon-btn" title="Duplicar (Ctrl+D)" disabled={!selCount} onClick={() => st().duplicateClips(selection)}><Copy size={15} /></button>
        <button className="icon-btn" title="Eliminar (Supr)" disabled={!selCount} onClick={() => st().removeClips(selection)}><Trash2 size={15} /></button>
        <button className="icon-btn" title="Congelar fotograma" disabled={!selCount} onClick={() => freezeFrame()}><Snowflake size={15} /></button>
        <div className="sep" />
        <button className={`icon-btn ${snapping ? 'active' : ''}`} title="Imán / ajuste (Alt invierte)" onClick={() => set({ snapping: !snapping })}><Magnet size={15} /></button>
        <button className={`icon-btn ${ripple ? 'active' : ''}`} title="Modo ripple (recorte arrastra los clips siguientes)" onClick={() => set({ rippleMode: !ripple })}><ArrowRightLeft size={15} /></button>
        <button className="icon-btn" title="Añadir marcador (M)" onClick={() => st().addMarker()}><Bookmark size={15} /></button>
        <div className="sep" />
        <button className="btn xs" onClick={() => st().addTrack('visual')}><Plus size={11} />Pista de video</button>
        <button className="btn xs" onClick={() => st().addTrack('audio')}><Plus size={11} />Pista de audio</button>
        <div className="spacer" />
        <span className="muted" style={{ fontSize: 11, marginRight: 6 }}>{selCount ? `${selCount} seleccionado(s)` : ''}</span>
        <button className="icon-btn" title="Ajustar a la ventana" onClick={fitZoom}><Maximize size={14} /></button>
        <button className="icon-btn" title="Alejar (−)" onClick={() => set({ zoom: clamp(zoom / 1.4, MIN_ZOOM, MAX_ZOOM) })}><ZoomOut size={15} /></button>
        <input className="zoom-slider" type="range" min={Math.log(MIN_ZOOM)} max={Math.log(MAX_ZOOM)} step={0.01} value={Math.log(zoom)} onChange={(e) => set({ zoom: Math.exp(parseFloat(e.target.value)) })} />
        <button className="icon-btn" title="Acercar (+)" onClick={() => set({ zoom: clamp(zoom * 1.4, MIN_ZOOM, MAX_ZOOM) })}><ZoomIn size={15} /></button>
      </div>
      <div className="tl-body">
        <div className="tl-heads" ref={headsRef}>
          <div className="tl-corner"><span className="muted" style={{ fontSize: 10.5 }}>PISTAS</span></div>
          <div className="tl-heads-inner" style={{ top: RULER_H - scroll.top }}>
            {rows.map((row, i) => {
              const t = row.track;
              const prev = rows[i - 1];
              return (
                <React.Fragment key={t.id}>
                  {prev && prev.track.kind === 'visual' && t.kind === 'audio' && <div className="track-sep" />}
                  <div className="tl-head" style={{ height: t.height }}>
                    <div className="kind" style={{ background: t.kind === 'visual' ? 'var(--clip-video)' : 'var(--clip-audio)' }} />
                    {t.kind === 'visual' ? <Film size={12} color="var(--text3)" /> : <Music size={12} color="var(--text3)" />}
                    {editingTrack === t.id
                      ? <input autoFocus className="text-input" style={{ height: 22, padding: '0 4px' }} defaultValue={t.name} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} onBlur={(e) => { st().updateTrack(t.id, { name: e.target.value || t.name }); setEditingTrack(null); }} />
                      : <span className="nm" onDoubleClick={() => setEditingTrack(t.id)} title="Doble clic para renombrar">{t.name}</span>}
                    {t.kind === 'visual' && <button className={`icon-btn sm ${t.hidden ? 'active' : ''}`} title={t.hidden ? 'Mostrar' : 'Ocultar'} onClick={() => st().updateTrack(t.id, { hidden: !t.hidden })}>{t.hidden ? <EyeOff size={12} /> : <Eye size={12} />}</button>}
                    <button className={`icon-btn sm ${t.muted ? 'active' : ''}`} title={t.muted ? 'Activar sonido' : 'Silenciar'} onClick={() => st().updateTrack(t.id, { muted: !t.muted })}>{t.muted ? <VolumeX size={12} /> : <Volume2 size={12} />}</button>
                    <button className={`icon-btn sm ${t.locked ? 'active' : ''}`} title={t.locked ? 'Desbloquear' : 'Bloquear'} onClick={() => st().updateTrack(t.id, { locked: !t.locked })}>{t.locked ? <Lock size={12} /> : <Unlock size={12} />}</button>
                    {(t.kind === 'visual' ? visualCount : project.tracks.length - visualCount) > 1 && !project.clips.some((c) => c.trackId === t.id) &&
                      <button className="icon-btn sm" title="Eliminar pista vacía" onClick={() => st().removeTrack(t.id)}><Trash2 size={11} /></button>}
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </div>
        <div className="tl-scroll" ref={scrollRef} onPointerDown={onEmptyDown}
          onDragOver={(e) => { e.preventDefault(); const r = rowAt(e.clientY); setDropRow(r?.track.id || null); }}
          onDragLeave={() => setDropRow(null)} onDrop={onDrop}
          style={{ cursor: tool === 'blade' ? 'crosshair' : undefined }}>
          <div className="tl-content" style={{ width: contentW, height: RULER_H + total + 40 }}>
            <Ruler zoom={zoom} scrollLeft={scroll.left} width={scroll.width} fps={project.fps} onScrub={scrub} />
            {rows.map((row, i) => {
              const t = row.track;
              const prev = rows[i - 1];
              const clips = project.clips.filter((c) => c.trackId === t.id);
              return (
                <React.Fragment key={t.id}>
                  {prev && prev.track.kind === 'visual' && t.kind === 'audio' && <div className="track-sep" />}
                  <div className={`track-row ${dropRow === t.id ? 'drop' : ''} ${t.locked ? 'locked' : ''}`} style={{ height: t.height, opacity: t.hidden ? 0.5 : 1 }}>
                    {clips.map((c) => {
                      const L = c.start * zoom, R = (c.start + c.duration) * zoom;
                      if (R < scroll.left - 200 || L > scroll.left + scroll.width + 200) return null;
                      return <ClipView key={c.id} clip={c} zoom={zoom} selected={selection.includes(c.id)} height={t.height} locked={t.locked} onPointerDown={onClipDown} onContext={clipMenu} />;
                    })}
                  </div>
                </React.Fragment>
              );
            })}
            <Playhead zoom={zoom} />
            {snapLine !== null && <div className="snap-line" style={{ left: snapLine * zoom }} />}
            {marquee && <div className="marquee" style={{ left: Math.min(marquee.x0, marquee.x1), top: Math.min(marquee.y0, marquee.y1), width: Math.abs(marquee.x1 - marquee.x0), height: Math.abs(marquee.y1 - marquee.y0) }} />}
            {project.clips.length === 0 && <div className="tl-empty" style={{ left: scroll.left + scroll.width / 2 }}>Arrastra medios aquí para empezar a editar<br /><span style={{ fontSize: 11 }}>Ctrl + rueda para hacer zoom · Espacio para reproducir · S para dividir</span></div>}
          </div>
        </div>
      </div>
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)} items={[
          { label: 'Dividir en el cabezal', kbd: 'S', icon: <SplitSquareHorizontal size={13} />, onClick: () => st().splitAt(st().time, st().selection) },
          { label: 'Duplicar', kbd: 'Ctrl+D', icon: <Copy size={13} />, onClick: () => st().duplicateClips(st().selection) },
          { label: 'Copiar', kbd: 'Ctrl+C', onClick: () => st().copy() },
          'sep',
          ...(menu.clip.type === 'video' ? [
            { label: 'Separar audio', icon: <Music size={13} />, onClick: () => st().detachAudio(menu.clip.id) },
            { label: 'Congelar fotograma', icon: <Snowflake size={13} />, onClick: () => freezeFrame() },
            { label: 'Quitar fondo (IA)', icon: <Wand2 size={13} />, onClick: () => removeBackground('remove') },
            { label: 'Rastrear objeto', icon: <Crosshair size={13} />, onClick: () => startObjectTracking() },
            { label: 'Estabilizar', icon: <Move size={13} />, onClick: () => stabilizeClip() },
            'sep' as const,
          ] : []),
          ...((menu.clip.type === 'video' || menu.clip.type === 'audio') ? [
            { label: 'Quitar silencios', onClick: () => removeSilences() },
            { label: 'Velocidad 2×', onClick: () => st().updateClip(menu.clip.id, (c) => { const src = c.duration * c.speed; c.speed = 2; c.duration = src / 2; }) },
            { label: 'Velocidad 0.5×', onClick: () => st().updateClip(menu.clip.id, (c) => { const a = c.assetId ? st().assets[c.assetId] : undefined; const src = c.duration * c.speed; c.speed = 0.5; c.duration = Math.min(src / 0.5, maxClipDuration(c, a)); }) },
            { label: menu.clip.audio.muted ? 'Activar audio' : 'Silenciar clip', onClick: () => st().updateClip(menu.clip.id, (c) => { c.audio.muted = !c.audio.muted; }) },
            'sep' as const,
          ] : []),
          { label: 'Eliminar', kbd: 'Supr', danger: true, icon: <Trash2 size={13} />, onClick: () => st().removeClips(st().selection) },
          { label: 'Eliminar y cerrar hueco', kbd: 'Shift+Supr', danger: true, onClick: () => st().removeClips(st().selection, true) },
        ]} />
      )}
    </div>
  );
}

export { engine, HEAD_W };
