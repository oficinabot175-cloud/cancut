import { Input, ALL_FORMATS, BlobSource, CanvasSink } from 'mediabunny';
import type { Clip } from '../types';
import { Compositor, SegMask, makeRenderCanvas, canvasToBlob } from '../render/compositor';
import { buildScene, FrameProvider, FrameSource } from '../render/scene';
import { getState, projectDuration, useEditor } from '../store/editor';
import { blobs, getImage } from '../core/media';
import { sourceTimeOf } from '../core/geometry';
import { applyChainSettings, buildChain, ChainNodes, clipGainAt, clipHasAudio } from './audioGraph';
import { segmentSync, SegModel, onVisionReady } from '../ai/vision';
import { onFontsChanged } from '../core/fonts';
import { clearRasterCache, segKey } from '../render/scene';

interface MediaSlot {
  clipId: string;
  assetId: string;
  el: HTMLVideoElement | HTMLAudioElement;
  chain?: ChainNodes;
  source?: MediaElementAudioSourceNode;
  lastSeek: number;
  failed?: boolean;
}

interface SegState { sourceT: number; data: Uint8Array; acc?: Float32Array; w: number; h: number; version: number; frameKey: string }

type ScopeListener = (d: { data: Uint8Array; w: number; h: number }) => void;

class PreviewEngine implements FrameProvider {
  canvas: HTMLCanvasElement | null = null;
  comp: Compositor | null = null;
  private slots = new Map<string, MediaSlot>();
  private hidden: HTMLDivElement;
  private tails = new Map<string, { key: string; canvas: HTMLCanvasElement | OffscreenCanvas | null; pending: boolean }>();
  private seg = new Map<string, SegState>();
  actx: AudioContext | null = null;
  master: GainNode | null = null;
  analyser: AnalyserNode | null = null;
  private analyserL: AnalyserNode | null = null;
  private analyserR: AnalyserNode | null = null;
  private dirty = true;
  private perf0 = 0;
  private t0 = 0;
  private lastStoreT = -1;
  private raf = 0;
  private viewW = 960;
  private viewH = 540;
  private frameCount = 0;
  private scopeListeners = new Set<ScopeListener>();
  error: string | null = null;
  fps = 0;
  private fpsAcc = { n: 0, t: performance.now() };

  constructor() {
    this.hidden = document.createElement('div');
    this.hidden.style.cssText = 'position:fixed;left:-10px;top:-10px;width:2px;height:2px;overflow:hidden;opacity:0;pointer-events:none;';
    document.body.appendChild(this.hidden);
    useEditor.subscribe((s, prev) => {
      if (s.project !== prev.project || s.assets !== prev.assets || s.previewScale !== prev.previewScale) this.dirty = true;
      if (s.time !== prev.time && !s.playing) this.dirty = true;
      if (s.playing !== prev.playing) s.playing ? this.startPlayback() : this.stopPlayback();
      if (s.masterVolume !== prev.masterVolume && this.master) this.master.gain.value = s.masterVolume;
    });
    onVisionReady(() => { this.dirty = true; });
    onFontsChanged(() => { clearRasterCache(); this.dirty = true; });
    const loop = () => { this.tick(); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  }

  attach(canvas: HTMLCanvasElement) {
    if (this.canvas === canvas) return;
    this.canvas = canvas;
    try {
      this.comp = new Compositor(canvas);
      this.error = null;
    } catch (e: any) {
      this.error = e.message;
      this.comp = null;
    }
    this.dirty = true;
  }

  setViewport(w: number, h: number) {
    if (w !== this.viewW || h !== this.viewH) { this.viewW = w; this.viewH = h; this.dirty = true; }
  }

  requestRender() { this.dirty = true; }

  onScopes(fn: ScopeListener) { this.scopeListeners.add(fn); return () => { this.scopeListeners.delete(fn); }; }

  private ensureAudio() {
    if (this.actx) return;
    try {
      this.actx = new AudioContext({ latencyHint: 'interactive' });
      this.master = this.actx.createGain();
      this.master.gain.value = getState().masterVolume;
      this.analyser = this.actx.createAnalyser();
      this.analyser.fftSize = 2048;
      const split = this.actx.createChannelSplitter(2);
      this.analyserL = this.actx.createAnalyser(); this.analyserL.fftSize = 1024;
      this.analyserR = this.actx.createAnalyser(); this.analyserR.fftSize = 1024;
      this.master.connect(this.analyser);
      this.master.connect(split);
      split.connect(this.analyserL, 0);
      split.connect(this.analyserR, 1);
      this.master.connect(this.actx.destination);
    } catch { this.actx = null; }
  }

  /** Niveles RMS (L, R) en 0..1 para los vúmetros. */
  levels(): [number, number] {
    const rms = (a: AnalyserNode | null) => {
      if (!a) return 0;
      const buf = new Float32Array(a.fftSize);
      a.getFloatTimeDomainData(buf);
      let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
      return Math.sqrt(s / buf.length);
    };
    return [rms(this.analyserL), rms(this.analyserR)];
  }

  private startPlayback() {
    this.ensureAudio();
    this.actx?.resume().catch(() => null);
    const st = getState();
    const dur = projectDuration(st.project);
    if (st.time >= dur - 0.01) st.setTime(0);
    this.t0 = getState().time;
    this.perf0 = performance.now();
  }

  private stopPlayback() {
    for (const s of this.slots.values()) if (!s.el.paused) s.el.pause();
    this.dirty = true;
  }

  play() { getState().setPlaying(true); }
  pause() { getState().setPlaying(false); }
  toggle() { getState().setPlaying(!getState().playing); }

  private slotFor(clip: Clip): MediaSlot | null {
    let s = this.slots.get(clip.id);
    const st = getState();
    const asset = clip.assetId ? st.assets[clip.assetId] : undefined;
    if (!asset || asset.status !== 'ready') return null;
    if (s && s.assetId !== asset.id) { this.disposeSlot(s); s = undefined; }
    if (s) return s;
    const el = document.createElement(clip.type === 'audio' ? 'audio' : 'video') as HTMLVideoElement;
    el.preload = 'auto';
    el.playsInline = true;
    el.crossOrigin = 'anonymous';
    el.src = asset.url;
    el.muted = false;
    (el as any).disableRemotePlayback = true;
    el.addEventListener('seeked', () => { this.dirty = true; });
    // Redibujar en cuanto el decodificador presente un fotograma nuevo
    const rvfc = (el as any).requestVideoFrameCallback?.bind(el);
    if (rvfc) {
      const onFrame = () => { this.dirty = true; if (this.slots.get(clip.id)?.el === el) rvfc(onFrame); };
      rvfc(onFrame);
    }
    el.addEventListener('loadeddata', () => { this.dirty = true; });
    el.addEventListener('error', () => { const sl = this.slots.get(clip.id); if (sl) sl.failed = true; });
    this.hidden.appendChild(el);
    s = { clipId: clip.id, assetId: asset.id, el, lastSeek: -1 };
    this.slots.set(clip.id, s);
    return s;
  }

  private connectAudio(s: MediaSlot) {
    if (s.chain || !this.actx || !this.master) return;
    try {
      s.source = this.actx.createMediaElementSource(s.el);
      s.chain = buildChain(this.actx, s.source, this.master);
    } catch { /* puede fallar si ya fue conectado */ }
  }

  private disposeSlot(s: MediaSlot) {
    try { s.el.pause(); } catch { /* noop */ }
    try { s.source?.disconnect(); s.chain?.output.disconnect(); } catch { /* noop */ }
    s.el.removeAttribute('src');
    try { s.el.load(); } catch { /* noop */ }
    s.el.remove();
    this.slots.delete(s.clipId);
  }

  /** Sincroniza los elementos multimedia con el tiempo t. */
  private pending = false;
  private syncMedia(t: number, playing: boolean) {
    this.pending = false;
    const st = getState();
    const p = st.project;
    const fps = p.fps;
    const keep = new Set<string>();
    const hasAudio = (id: string) => !!st.assets[id]?.hasAudio;
    for (const clip of p.clips) {
      if (clip.type !== 'video' && clip.type !== 'audio') continue;
      const track = p.tracks.find((tr) => tr.id === clip.trackId);
      if (!track) continue;
      const end = clip.start + clip.duration;
      const active = t >= clip.start && t < end;
      const upcoming = !active && clip.start > t && clip.start - t < (playing ? 2.5 : 0.6);
      const visible = track.kind === 'audio' || !track.hidden;
      if (!active && !upcoming) continue;
      if (clip.type === 'video' && !visible && (clip.audioDetached || !hasAudio(clip.assetId!))) continue;
      const s = this.slotFor(clip);
      if (!s || s.failed) continue;
      keep.add(clip.id);
      const el = s.el;
      const desired = active ? sourceTimeOf(clip, t) : clip.in;
      const makesSound = clipHasAudio(clip, p, hasAudio);
      if (playing && makesSound && this.actx) this.connectAudio(s);
      // ganancia
      const gain = makesSound && active ? clipGainAt(clip, t - clip.start, track) : 0;
      if (s.chain) {
        applyChainSettings(s.chain, clip);
        s.chain.gain.gain.setTargetAtTime(gain, this.actx!.currentTime, 0.015);
        el.volume = 1;
      } else {
        el.volume = Math.min(1, gain);
      }
      el.muted = !makesSound || gain === 0 && !s.chain;
      const rate = Math.max(0.0625, Math.min(16, clip.speed));
      if (Math.abs(el.playbackRate - rate) > 1e-3) el.playbackRate = rate;
      (el as any).preservesPitch = clip.audio.preservePitch;
      if (playing && active) {
        if (el.paused) {
          if (Math.abs(el.currentTime - desired) > 0.05) el.currentTime = desired;
          el.play().catch(() => null);
        } else if (Math.abs(el.currentTime - desired) > 0.25 * Math.max(1, rate)) {
          el.currentTime = desired;
        }
      } else {
        if (!el.paused) el.pause();
        const tol = active ? 0.5 / fps : 0.1;
        if (Math.abs(el.currentTime - desired) > tol && !el.seeking) el.currentTime = desired;
        else if (el.seeking && Math.abs(s.lastSeek - desired) > tol) { el.currentTime = desired; }
        s.lastSeek = desired;
        if (active && (el.seeking || el.readyState < 2)) this.pending = true;
      }
    }
    // liberar elementos fuera de ventana (mantener algunos en caché)
    if (this.slots.size > 12) {
      for (const s of this.slots.values()) if (!keep.has(s.clipId)) { this.disposeSlot(s); if (this.slots.size <= 10) break; }
    } else {
      for (const s of this.slots.values()) if (!keep.has(s.clipId) && !s.el.paused) s.el.pause();
    }
    // clips eliminados
    for (const s of [...this.slots.values()]) if (!p.clips.find((c) => c.id === s.clipId)) this.disposeSlot(s);
  }

  private tick() {
    const st = getState();
    const now = performance.now();
    let t = st.time;
    if (st.playing) {
      t = this.t0 + ((now - this.perf0) / 1000);
      const dur = projectDuration(st.project);
      if (t >= dur) {
        if (st.loop && dur > 0) { t = 0; this.t0 = 0; this.perf0 = now; }
        else { t = dur; st.setPlaying(false); }
      }
      this.lastStoreT = t;
      st.setTime(t);
      this.dirty = true;
    } else if (t !== this.lastStoreT) {
      this.lastStoreT = t;
      this.dirty = true;
    }
    this.syncMedia(t, st.playing);
    if (this.pending) this.dirty = true;
    if (this.dirty) {
      this.dirty = false;
      this.render(t);
    }
  }

  private renderSize() {
    const st = getState();
    const p = st.project;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const k = Math.min(1, (this.viewW * dpr) / p.width, (this.viewH * dpr) / p.height) * st.previewScale;
    return { w: Math.max(32, Math.round(p.width * k)), h: Math.max(32, Math.round(p.height * k)), k };
  }

  render(t = getState().time) {
    if (!this.comp) return;
    const st = getState();
    const { w, h, k } = this.renderSize();
    try {
      const scene = buildScene(st.project, st.assets, t, this, { quality: k });
      this.comp.render(scene, w, h);
    } catch (e) {
      console.error('Error de render', e);
    }
    this.frameCount++;
    this.fpsAcc.n++;
    const now = performance.now();
    if (now - this.fpsAcc.t > 1000) { this.fps = Math.round((this.fpsAcc.n * 1000) / (now - this.fpsAcc.t)); this.fpsAcc = { n: 0, t: now }; }
    if (st.showScopes && this.scopeListeners.size && (!st.playing || this.frameCount % 3 === 0)) {
      const d = this.comp.readSmall(320, Math.round((320 * h) / w));
      if (d) this.scopeListeners.forEach((fn) => fn(d));
    }
  }

  // ------------------------------------------------------------------ FrameProvider
  videoFrame(clip: Clip): FrameSource | null {
    const s = this.slots.get(clip.id) || this.slotFor(clip);
    if (!s) return null;
    const el = s.el as HTMLVideoElement;
    if (el.readyState < 2 || !el.videoWidth) return null;
    return { source: el, w: el.videoWidth, h: el.videoHeight, key: null };
  }

  image(assetId: string): FrameSource | null {
    const img = getImage(assetId);
    return img ? { source: img.source, w: img.w, h: img.h, key: assetId } : null;
  }

  tailFrame(clip: Clip): FrameSource | null {
    const key = `${clip.assetId}|${clip.in}|${clip.duration}|${clip.speed}`;
    const e = this.tails.get(clip.id);
    if (e && e.key === key) return e.canvas ? { source: e.canvas as TexImageSource, w: e.canvas.width, h: e.canvas.height, key } : null;
    this.tails.set(clip.id, { key, canvas: null, pending: true });
    const ts = sourceTimeOf(clip, clip.start + clip.duration - 0.02);
    captureFrame(clip.assetId!, ts).then((c) => {
      const cur = this.tails.get(clip.id);
      if (cur && cur.key === key) { cur.canvas = c; cur.pending = false; this.dirty = true; }
    });
    return null;
  }

  segMask(clip: Clip, src: FrameSource, sourceT: number, model: string, smooth: number): SegMask | null {
    const st = getState();
    const skey = segKey(clip);
    const prev = this.seg.get(skey);
    const frameKey = `${model}|${src.w}x${src.h}`;
    if (prev && !st.playing && Math.abs(prev.sourceT - sourceT) < 1e-4 && prev.frameKey === frameKey) {
      return { data: prev.data, w: prev.w, h: prev.h, version: prev.version };
    }
    const m = segmentSync(model as SegModel, src.source, src.w, src.h);
    if (!m) return prev ? { data: prev.data, w: prev.w, h: prev.h, version: prev.version } : null;
    let data = m.data;
    let acc = prev?.acc;
    const continuous = prev && prev.w === m.w && prev.h === m.h && Math.abs(sourceT - prev.sourceT) < 0.25 && st.playing;
    if (smooth > 0 && continuous && acc) {
      const a = smooth, b = 1 - smooth;
      data = new Uint8Array(m.data.length);
      for (let i = 0; i < m.data.length; i++) { acc[i] = acc[i] * a + m.data[i] * b; data[i] = acc[i]; }
    } else {
      acc = Float32Array.from(m.data);
    }
    const version = (prev?.version || 0) + 1;
    this.seg.set(skey, { sourceT, data, acc, w: m.w, h: m.h, version, frameKey });
    return { data, w: m.w, h: m.h, version };
  }

  /** Renderiza el fotograma actual a resolución completa y devuelve PNG. */
  async snapshot(): Promise<Blob> {
    const st = getState();
    const p = st.project;
    const off = makeRenderCanvas(p.width, p.height);
    const comp = new Compositor(off);
    const scene = buildScene(p, st.assets, st.time, this, { quality: 1 });
    comp.render(scene, p.width, p.height);
    const blob = await canvasToBlob(off, 'image/png');
    comp.dispose();
    this.dirty = true;
    return blob;
  }

  /** Fotograma actual (sin efectos) de un clip de video, como canvas. */
  currentClipFrame(clip: Clip): HTMLCanvasElement | null {
    const fr = this.videoFrame(clip);
    if (!fr) return null;
    const c = document.createElement('canvas');
    c.width = fr.w; c.height = fr.h;
    c.getContext('2d')!.drawImage(fr.source as CanvasImageSource, 0, 0);
    return c;
  }
}

/** Captura un fotograma de un medio en el tiempo ts (mediabunny con respaldo en <video>). */
export async function captureFrame(assetId: string, ts: number, maxW = 1920): Promise<HTMLCanvasElement | OffscreenCanvas | null> {
  const blob = blobs.get(assetId);
  const asset = getState().assets[assetId];
  if (!blob || !asset) return null;
  try {
    const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
    const v = await input.getPrimaryVideoTrack();
    if (v && (await v.canDecode())) {
      const w = Math.min(maxW, await v.getDisplayWidth());
      const sink = new CanvasSink(v, { width: w });
      const wc = await sink.getCanvas(Math.max(0, ts));
      if (wc) {
        const c = document.createElement('canvas');
        c.width = wc.canvas.width; c.height = wc.canvas.height;
        c.getContext('2d')!.drawImage(wc.canvas as CanvasImageSource, 0, 0);
        input.dispose();
        return c;
      }
    }
    input.dispose();
  } catch { /* respaldo */ }
  return await new Promise((resolve) => {
    const el = document.createElement('video');
    el.muted = true; el.preload = 'auto'; el.src = asset.url;
    const fail = setTimeout(() => resolve(null), 8000);
    el.onloadeddata = () => { el.currentTime = Math.max(0, Math.min(ts, (el.duration || ts) - 0.01)); };
    el.onseeked = () => {
      clearTimeout(fail);
      const k = Math.min(1, maxW / el.videoWidth);
      const c = document.createElement('canvas');
      c.width = Math.round(el.videoWidth * k); c.height = Math.round(el.videoHeight * k);
      c.getContext('2d')!.drawImage(el, 0, 0, c.width, c.height);
      el.removeAttribute('src'); el.load();
      resolve(c);
    };
    el.onerror = () => { clearTimeout(fail); resolve(null); };
  });
}

export const engine = new PreviewEngine();
(window as any).__novacut = (window as any).__cancut = { engine, getState };
