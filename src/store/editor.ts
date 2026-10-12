import { create } from 'zustand';
import { produce, setAutoFreeze } from 'immer';
import type { Clip, MediaAsset, Project, Track, TrackKind, Tool, Marker } from '../types';
import { createClip, createProject, createTrack, defaultText, defaultShape } from '../core/defaults';
import { clamp, deepClone, uid } from '../core/utils';

setAutoFreeze(false);

export type LeftTab = 'media' | 'trends' | 'motion' | 'audio' | 'text' | 'elements' | 'effects' | 'transitions' | 'filters' | 'captions' | 'ai';
export type InspectorTab = string;

export interface Toast { id: string; text: string; kind: 'info' | 'success' | 'error' | 'progress'; progress?: number }

export interface TaskProgress { id: string; label: string; progress: number; cancel?: () => void }

interface EditorState {
  project: Project;
  assets: Record<string, MediaAsset>;
  past: Project[];
  future: Project[];
  txBase: Project | null;
  selection: string[];
  selectedTrackId: string | null;
  time: number;
  playing: boolean;
  loop: boolean;
  zoom: number; // px por segundo
  scrollX: number;
  tool: Tool;
  snapping: boolean;
  rippleMode: boolean;
  leftTab: LeftTab;
  inspectorTab: InspectorTab;
  previewScale: number;
  showScopes: boolean;
  showSafeZones: boolean;
  showGrid: boolean;
  viewerZoom: number; // 0 = ajustar
  trackingDraw: { clipId: string } | null;
  modal: null | 'export' | 'new' | 'shortcuts' | 'settings' | 'about' | 'projects';
  toasts: Toast[];
  tasks: TaskProgress[];
  masterVolume: number;

  // --- historia ---
  commit: (fn: (p: Project) => void) => void;
  update: (fn: (p: Project) => void) => void;
  beginTx: () => void;
  endTx: () => void;
  undo: () => void;
  redo: () => void;

  // --- proyecto ---
  newProject: (opts?: Partial<Project>) => void;
  loadProject: (p: Project, assets: Record<string, MediaAsset>) => void;
  setProjectProps: (patch: Partial<Project>) => void;

  // --- medios ---
  addAsset: (a: MediaAsset) => void;
  updateAsset: (id: string, patch: Partial<MediaAsset>) => void;
  removeAsset: (id: string) => void;

  // --- pistas ---
  addTrack: (kind: TrackKind, index?: number) => string;
  removeTrack: (id: string) => void;
  updateTrack: (id: string, patch: Partial<Track>) => void;

  // --- clips ---
  addClip: (clip: Clip, opts?: { select?: boolean; newTrack?: boolean }) => Clip;
  addAssetToTimeline: (assetId: string, time?: number, trackId?: string) => Clip | null;
  addTextClip: (partial?: Partial<Clip>, text?: string) => Clip;
  addShapeClip: (kind: any) => Clip;
  updateClip: (id: string, fn: (c: Clip) => void, history?: boolean) => void;
  updateClips: (ids: string[], fn: (c: Clip) => void) => void;
  removeClips: (ids: string[], ripple?: boolean) => void;
  splitAt: (t: number, ids?: string[]) => void;
  duplicateClips: (ids: string[]) => void;
  detachAudio: (id: string) => void;
  copy: () => void;
  paste: () => void;
  resolveOverlaps: (p: Project, movedIds: string[]) => void;

  // --- UI ---
  setTime: (t: number) => void;
  setPlaying: (b: boolean) => void;
  select: (ids: string[], additive?: boolean) => void;
  set: (patch: Partial<EditorState>) => void;
  toast: (text: string, kind?: Toast['kind'], ms?: number) => string;
  dismissToast: (id: string) => void;
  startTask: (label: string, cancel?: () => void) => string;
  progressTask: (id: string, progress: number, label?: string) => void;
  endTask: (id: string) => void;
  addMarker: (t?: number) => void;
}

let clipboard: Clip[] = [];

export function projectDuration(p: Project): number {
  let d = 0;
  for (const c of p.clips) d = Math.max(d, c.start + c.duration);
  return d;
}

export function clipEnd(c: Clip) { return c.start + c.duration; }

/** Duración disponible en la fuente desde el punto in (para no exceder el medio). */
export function maxClipDuration(c: Clip, asset?: MediaAsset): number {
  if (!asset || asset.kind === 'image') return Infinity;
  return Math.max(0.05, (asset.duration - c.in) / c.speed);
}

/** Ganchos opcionales (evitan dependencias circulares con módulos de funciones). */
export const hooks: { afterAssetAdded: ((c: Clip) => void) | null } = { afterAssetAdded: null };

export const useEditor = create<EditorState>((set, get) => ({
  project: createProject(),
  assets: {},
  past: [],
  future: [],
  txBase: null,
  selection: [],
  selectedTrackId: null,
  time: 0,
  playing: false,
  loop: false,
  zoom: 80,
  scrollX: 0,
  tool: 'select',
  snapping: true,
  rippleMode: false,
  leftTab: 'media',
  inspectorTab: 'basic',
  previewScale: 1,
  showScopes: false,
  showSafeZones: false,
  showGrid: false,
  viewerZoom: 0,
  trackingDraw: null,
  modal: null,
  toasts: [],
  tasks: [],
  masterVolume: 1,

  commit: (fn) => {
    const { project, past, txBase } = get();
    const next = produce(project, (d) => { fn(d as Project); (d as Project).updatedAt = Date.now(); });
    if (txBase) { set({ project: next }); return; }
    set({ project: next, past: [...past.slice(-120), project], future: [] });
  },
  update: (fn) => {
    const { project } = get();
    set({ project: produce(project, (d) => { fn(d as Project); }) });
  },
  beginTx: () => set({ txBase: get().project }),
  endTx: () => {
    const { txBase, project, past } = get();
    if (!txBase) return;
    if (txBase !== project) set({ past: [...past.slice(-120), txBase], future: [], txBase: null });
    else set({ txBase: null });
  },
  undo: () => {
    const { past, project, future } = get();
    if (!past.length) return;
    const prev = past[past.length - 1];
    set({ project: prev, past: past.slice(0, -1), future: [project, ...future].slice(0, 120) });
  },
  redo: () => {
    const { past, project, future } = get();
    if (!future.length) return;
    const [next, ...rest] = future;
    set({ project: next, past: [...past, project], future: rest });
  },

  newProject: (opts) => set({ project: createProject(opts), past: [], future: [], selection: [], time: 0 }),
  loadProject: (p, assets) => set({ project: p, assets, past: [], future: [], selection: [], time: 0 }),
  setProjectProps: (patch) => get().commit((p) => { Object.assign(p, patch); }),

  addAsset: (a) => set({ assets: { ...get().assets, [a.id]: a } }),
  updateAsset: (id, patch) => {
    const a = get().assets[id];
    if (!a) return;
    set({ assets: { ...get().assets, [id]: { ...a, ...patch } } });
  },
  removeAsset: (id) => {
    const assets = { ...get().assets };
    const a = assets[id];
    delete assets[id];
    set({ assets });
    if (a?.url) setTimeout(() => URL.revokeObjectURL(a.url), 1000);
    get().commit((p) => { p.clips = p.clips.filter((c) => c.assetId !== id); });
  },

  addTrack: (kind, index) => {
    const t = createTrack(kind);
    get().commit((p) => {
      const same = p.tracks.filter((x) => x.kind === kind);
      t.name = (kind === 'visual' ? 'V' : 'A') + (same.length + 1);
      if (index !== undefined) p.tracks.splice(index, 0, t);
      else if (kind === 'visual') p.tracks.unshift(t);
      else p.tracks.push(t);
    });
    return t.id;
  },
  removeTrack: (id) => get().commit((p) => {
    const t = p.tracks.find((x) => x.id === id);
    if (!t) return;
    if (p.tracks.filter((x) => x.kind === t.kind).length <= 1) return;
    p.tracks = p.tracks.filter((x) => x.id !== id);
    p.clips = p.clips.filter((c) => c.trackId !== id);
  }),
  updateTrack: (id, patch) => get().commit((p) => {
    const t = p.tracks.find((x) => x.id === id);
    if (t) Object.assign(t, patch);
  }),

  addClip: (clip, opts = {}) => {
    const st = get();
    const kind: TrackKind = clip.type === 'audio' ? 'audio' : 'visual';
    let trackId = clip.trackId;
    let newTrack: Track | null = null;
    const free = (tid: string) => !st.project.clips.some((c) => c.trackId === tid && c.start < clip.start + clip.duration - 1e-4 && c.start + c.duration > clip.start + 1e-4);
    const track = st.project.tracks.find((t) => t.id === trackId);
    if (!track || track.kind !== kind || track.locked || !free(trackId) || opts.newTrack) {
      const candidates = st.project.tracks.filter((t) => t.kind === kind && !t.locked);
      // medios: preferir las pistas inferiores (V1); textos y gráficos: las superiores
      const ordered = kind === 'visual' && (clip.type === 'video' || clip.type === 'image' || clip.type === 'solid') ? [...candidates].reverse() : candidates;
      const found = opts.newTrack ? undefined : ordered.find((t) => free(t.id));
      if (found) trackId = found.id;
      else {
        newTrack = createTrack(kind);
        newTrack.name = (kind === 'visual' ? 'V' : 'A') + (st.project.tracks.filter((x) => x.kind === kind).length + 1);
        trackId = newTrack.id;
      }
    }
    const c = { ...clip, trackId };
    get().commit((p) => {
      if (newTrack) { if (kind === 'visual') p.tracks.unshift(newTrack); else p.tracks.push(newTrack); }
      p.clips.push(c);
    });
    if (opts.select !== false) set({ selection: [c.id] });
    return c;
  },

  addAssetToTimeline: (assetId, time, trackId) => {
    const st = get();
    const a = st.assets[assetId];
    if (!a || a.status === 'unsupported' || a.status === 'error') return null;
    const start = time ?? st.time;
    const type = a.kind === 'video' ? 'video' : a.kind === 'audio' ? 'audio' : 'image';
    const duration = a.kind === 'image' ? 5 : Math.max(0.1, a.duration || 5);
    const clip = createClip({ type, trackId: trackId || '', start, duration, assetId, name: a.name });
    if (type === 'image' || type === 'video') {
      const p = st.project;
      // Rellenar si la proporción coincide casi exactamente
      const ar = a.width / Math.max(1, a.height), pr = p.width / p.height;
      clip.fit = Math.abs(ar - pr) < 0.02 ? 'cover' : 'contain';
    }
    const added = st.addClip(clip);
    try { hooks.afterAssetAdded?.(added); } catch { /* noop */ }
    return added;
  },

  addTextClip: (partial = {}, text) => {
    const st = get();
    const clip = createClip({
      type: 'text', trackId: '', start: st.time, duration: 4, name: 'Texto',
      text: { ...defaultText(text), ...(partial.text || {}) },
      ...partial,
    } as any);
    clip.text = { ...defaultText(text), ...(partial.text || {}) };
    return st.addClip(clip, { newTrack: !partial.trackId ? undefined : false });
  },

  addShapeClip: (kind) => {
    const st = get();
    const clip = createClip({ type: 'shape', trackId: '', start: st.time, duration: 5, name: 'Forma', shape: defaultShape(kind) });
    return st.addClip(clip);
  },

  updateClip: (id, fn, history = true) => {
    const f = (p: Project) => { const c = p.clips.find((x) => x.id === id); if (c) fn(c); };
    history ? get().commit(f) : get().update(f);
  },
  updateClips: (ids, fn) => get().commit((p) => { for (const c of p.clips) if (ids.includes(c.id)) fn(c); }),

  removeClips: (ids, ripple = false) => {
    if (!ids.length) return;
    get().commit((p) => {
      const removed = p.clips.filter((c) => ids.includes(c.id));
      p.clips = p.clips.filter((c) => !ids.includes(c.id));
      if (ripple) {
        for (const r of removed) {
          for (const c of p.clips) if (c.trackId === r.trackId && c.start >= r.start + r.duration - 1e-4) c.start -= r.duration;
        }
      }
      // limpiar vínculos huérfanos
      for (const c of p.clips) if (c.follow && ids.includes(c.follow.clipId)) c.follow = null;
    });
    set({ selection: get().selection.filter((s) => !ids.includes(s)) });
  },

  splitAt: (t, ids) => {
    const st = get();
    const targets = st.project.clips.filter((c) => (ids ? ids.includes(c.id) : true) && c.start < t - 1e-3 && c.start + c.duration > t + 1e-3)
      .filter((c) => !st.project.tracks.find((tr) => tr.id === c.trackId)?.locked);
    if (!targets.length) return;
    const newIds: string[] = [];
    st.commit((p) => {
      for (const tc of targets) {
        const c = p.clips.find((x) => x.id === tc.id)!;
        const left = t - c.start;
        const right = c.duration - left;
        const n: Clip = deepClone(c as Clip);
        n.id = uid('clip');
        n.start = t;
        n.duration = right;
        n.in = c.in + left * c.speed;
        n.transitionIn = null;
        // keyframes y palabras: desplazar
        for (const k of Object.keys(n.keyframes)) {
          n.keyframes[k] = n.keyframes[k].map((kf) => ({ ...kf, t: kf.t - left })).filter((kf) => kf.t >= -1e-4);
          c.keyframes[k] = c.keyframes[k].filter((kf) => kf.t <= left + 1e-4);
        }
        if (n.text?.words) {
          n.text.words = n.text.words.filter((w) => w.end > left).map((w) => ({ ...w, start: Math.max(0, w.start - left), end: w.end - left }));
          n.text.content = n.text.words.map((w) => w.text).join(' ');
          c.text!.words = c.text!.words!.filter((w) => w.start < left).map((w) => ({ ...w, end: Math.min(w.end, left) }));
          c.text!.content = c.text!.words.map((w) => w.text).join(' ');
        }
        c.duration = left;
        n.animation = { ...n.animation, in: 'none' };
        c.animation = { ...c.animation, out: 'none' };
        p.clips.push(n);
        newIds.push(n.id);
      }
    });
  },

  duplicateClips: (ids) => {
    const st = get();
    const src = st.project.clips.filter((c) => ids.includes(c.id));
    if (!src.length) return;
    const minStart = Math.min(...src.map((c) => c.start));
    const maxEnd = Math.max(...src.map((c) => c.start + c.duration));
    const newClips = src.map((c) => ({ ...deepClone(c), id: uid('clip'), start: c.start - minStart + maxEnd }));
    st.commit((p) => {
      for (const n of newClips) p.clips.push(n);
      st.resolveOverlaps(p, newClips.map((n) => n.id));
    });
    set({ selection: newClips.map((n) => n.id) });
  },

  detachAudio: (id) => {
    const st = get();
    const c = st.project.clips.find((x) => x.id === id);
    if (!c || c.type !== 'video') return;
    const a = st.assets[c.assetId!];
    if (!a?.hasAudio) { st.toast('Este video no tiene pista de audio', 'error'); return; }
    const audioClip = createClip({ type: 'audio', trackId: '', start: c.start, duration: c.duration, in: c.in, speed: c.speed, assetId: c.assetId, name: `${c.name} (audio)` });
    audioClip.audio = { ...c.audio };
    st.addClip(audioClip, { select: false });
    st.updateClip(id, (x) => { x.audioDetached = true; });
    st.toast('Audio separado en una pista de audio', 'success');
  },

  copy: () => {
    const st = get();
    clipboard = st.project.clips.filter((c) => st.selection.includes(c.id)).map((c) => deepClone(c));
    if (clipboard.length) st.toast(`${clipboard.length} clip(s) copiado(s)`, 'info', 1200);
  },
  paste: () => {
    const st = get();
    if (!clipboard.length) return;
    const minStart = Math.min(...clipboard.map((c) => c.start));
    const newClips = clipboard.map((c) => ({ ...deepClone(c), id: uid('clip'), start: c.start - minStart + st.time }));
    st.commit((p) => {
      for (const n of newClips) {
        if (!p.tracks.find((t) => t.id === n.trackId)) n.trackId = p.tracks.find((t) => t.kind === (n.type === 'audio' ? 'audio' : 'visual'))!.id;
        p.clips.push(n);
      }
      st.resolveOverlaps(p, newClips.map((n) => n.id));
    });
    set({ selection: newClips.map((n) => n.id) });
  },

  /** Semántica de "sobrescribir": los clips movidos recortan/eliminan lo que pisan. */
  resolveOverlaps: (p, movedIds) => {
    const moved = p.clips.filter((c) => movedIds.includes(c.id));
    for (const m of moved) {
      const ms = m.start, me = m.start + m.duration;
      const others = p.clips.filter((c) => c.trackId === m.trackId && !movedIds.includes(c.id));
      for (const o of others) {
        const os = o.start, oe = o.start + o.duration;
        if (oe <= ms + 1e-4 || os >= me - 1e-4) continue;
        if (os >= ms - 1e-4 && oe <= me + 1e-4) {
          p.clips = p.clips.filter((c) => c.id !== o.id);
        } else if (os < ms && oe > me) {
          const right: Clip = deepClone(o as Clip);
          right.id = uid('clip');
          right.start = me;
          right.duration = oe - me;
          right.in = o.in + (me - os) * o.speed;
          right.transitionIn = null;
          o.duration = ms - os;
          p.clips.push(right);
        } else if (os < ms) {
          o.duration = ms - os;
        } else {
          const cut = me - os;
          o.start = me;
          o.in += cut * o.speed;
          o.duration -= cut;
        }
      }
    }
  },

  setTime: (t) => set({ time: Math.max(0, t) }),
  setPlaying: (b) => set({ playing: b }),
  select: (ids, additive = false) => {
    if (!additive) { set({ selection: ids }); return; }
    const cur = new Set(get().selection);
    for (const id of ids) cur.has(id) ? cur.delete(id) : cur.add(id);
    set({ selection: [...cur] });
  },
  set: (patch) => set(patch as any),
  toast: (text, kind = 'info', ms = 3200) => {
    const id = uid('t');
    set({ toasts: [...get().toasts, { id, text, kind }] });
    if (ms > 0) setTimeout(() => get().dismissToast(id), ms);
    return id;
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  startTask: (label, cancel) => {
    const id = uid('task');
    set({ tasks: [...get().tasks, { id, label, progress: 0, cancel }] });
    return id;
  },
  progressTask: (id, progress, label) => set({ tasks: get().tasks.map((t) => (t.id === id ? { ...t, progress: clamp(progress, 0, 1), label: label ?? t.label } : t)) }),
  endTask: (id) => set({ tasks: get().tasks.filter((t) => t.id !== id) }),
  addMarker: (t) => {
    const time = t ?? get().time;
    const m: Marker = { id: uid('mk'), t: time, label: `Marcador ${get().project.markers.length + 1}`, color: '#ffb020' };
    get().commit((p) => { p.markers.push(m); });
  },
}));

export const getState = () => useEditor.getState();

export function selectedClips(): Clip[] {
  const s = getState();
  return s.project.clips.filter((c) => s.selection.includes(c.id));
}
