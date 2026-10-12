import type { Clip, MediaAsset, Project } from '../types';
import type { RenderLayer, RenderScene, SegMask } from './compositor';
import { clipGeometry, sourceTimeOf, GeomCtx } from '../core/geometry';
import { prop } from '../core/keyframes';
import { rasterizeShape, rasterizeText, Raster, textIsAnimated } from './text';
import { TRANSITION_ID } from '../core/presets';
import { animationOffsets } from '../core/geometry';

export interface FrameSource { source: TexImageSource; w: number; h: number; key?: string | number | null }

export interface FrameProvider {
  videoFrame(clip: Clip, sourceT: number): FrameSource | null;
  image(assetId: string): FrameSource | null;
  tailFrame(clip: Clip): FrameSource | null;
  segMask?(clip: Clip, src: FrameSource, sourceT: number, model: string, smooth: number): SegMask | null;
}

interface RasterEntry { key: string; raster: Raster }
const rasterCache = new Map<string, RasterEntry>();

export function clearRasterCache() { rasterCache.clear(); }

/** Clave de segmentación: los duplicados de un clip (p. ej. «texto detrás de la persona») comparten máscara. */
export const segKey = (clip: Clip) => `${clip.assetId || clip.id}@${(clip.start - clip.in / (clip.speed || 1)).toFixed(3)}`;

/** Efectos que necesitan la máscara de segmentación de la persona (IA). */
export function maskEffect(clip: Clip) {
  return clip.effects.find((e) => e.enabled && (e.type === 'bgRemove' || e.type === 'aura' || e.type === 'subjectRays' || (e.type === 'echo' && e.params.target !== 'frame')));
}

function textRaster(clip: Clip, localT: number, scale: number, reveal: number | null, revealOut: number | null): Raster {
  const td = clip.text!;
  const animated = textIsAnimated(td, { reveal, revealOut });
  const q = Math.round(scale * 8) / 8;
  const key = JSON.stringify(td) + '|' + q + (animated ? `|${Math.round(localT * 60)}|${reveal?.toFixed(3)}|${revealOut?.toFixed(3)}` : '');
  const e = rasterCache.get(clip.id);
  if (e && e.key === key) return e.raster;
  const raster = rasterizeText(td, {
    localT, reveal, revealOut, scale: q,
    revealMode: clip.animation.in, revealOutMode: clip.animation.out,
  });
  rasterCache.set(clip.id, { key, raster });
  return raster;
}

function shapeRaster(clip: Clip, scale: number): Raster {
  const q = Math.round(scale * 8) / 8;
  const key = JSON.stringify(clip.shape) + '|' + q;
  const e = rasterCache.get(clip.id);
  if (e && e.key === key) return e.raster;
  const raster = rasterizeShape(clip.shape!, q);
  rasterCache.set(clip.id, { key, raster });
  return raster;
}

export function activeClipAt(project: Project, trackId: string, t: number): Clip | undefined {
  for (const c of project.clips) if (c.trackId === trackId && t >= c.start - 1e-6 && t < c.start + c.duration - 1e-6) return c;
  return undefined;
}

export interface SceneOpts { quality: number; skipText?: boolean }

/** Tamaño natural (en px del proyecto) de la fuente de un clip. */
export function naturalSize(clip: Clip, project: Project, assets: Record<string, MediaAsset>): { w: number; h: number } {
  if (clip.type === 'video' || clip.type === 'image') {
    const a = clip.assetId ? assets[clip.assetId] : undefined;
    return { w: a?.width || project.width, h: a?.height || project.height };
  }
  if (clip.type === 'text') {
    const e = rasterCache.get(clip.id);
    if (e) return { w: e.raster.w, h: e.raster.h };
    const r = textRaster(clip, 0, 1, null, null);
    return { w: r.w, h: r.h };
  }
  if (clip.type === 'shape') {
    const sd = clip.shape!;
    const pad = (sd.strokeWidth + 4) * 2;
    return { w: sd.width + pad, h: sd.height + pad };
  }
  return { w: project.width, h: project.height };
}

export function geomCtx(project: Project, assets: Record<string, MediaAsset>): GeomCtx {
  return { project, sizeOf: (c) => naturalSize(c, project, assets) };
}

export function buildScene(project: Project, assets: Record<string, MediaAsset>, t: number, provider: FrameProvider, opts: SceneOpts): RenderScene {
  const layers: RenderLayer[] = [];
  const ctx = geomCtx(project, assets);
  const W = project.width, H = project.height;

  const makeLayer = (clip: Clip, time: number, tail: boolean): RenderLayer | null => {
    const localT = time - clip.start;
    const sourceT = sourceTimeOf(clip, time);
    let source: TexImageSource | null = null;
    let srcW = 1, srcH = 1;
    let sourceKey: string | number | null = null;
    let segMask: SegMask | null = null;
    let solid: RenderLayer['solid'];
    let adjustment = false;

    if (clip.type === 'video') {
      const fr = tail ? provider.tailFrame(clip) : provider.videoFrame(clip, sourceT);
      if (!fr) return null;
      source = fr.source; srcW = fr.w; srcH = fr.h; sourceKey = fr.key ?? null;
      const bg = maskEffect(clip);
      if (bg && provider.segMask) segMask = provider.segMask(clip, fr, sourceT, String(bg.params.model || 'selfie'), Number(bg.params.smooth ?? 0.5));
    } else if (clip.type === 'image') {
      const fr = provider.image(clip.assetId!);
      if (!fr) return null;
      source = fr.source; srcW = fr.w; srcH = fr.h; sourceKey = fr.key ?? clip.assetId!;
      const bg = maskEffect(clip);
      if (bg && provider.segMask) segMask = provider.segMask(clip, fr, 0, String(bg.params.model || 'selfie'), 0);
    } else if (clip.type === 'text') {
      if (opts.skipText) return null;
      const scale = Math.abs(prop(clip, 'scale', localT, clip.transform.scale)) * opts.quality;
      const anim = animationOffsets(clip, localT, W, H);
      const r = textRaster(clip, localT, Math.max(0.25, scale * anim.scale), anim.textReveal, anim.textRevealOut);
      source = r.canvas as TexImageSource; srcW = r.canvas.width; srcH = r.canvas.height; sourceKey = r.version;
    } else if (clip.type === 'shape') {
      const scale = Math.abs(prop(clip, 'scale', localT, clip.transform.scale)) * opts.quality;
      const r = shapeRaster(clip, Math.max(0.25, scale));
      source = r.canvas as TexImageSource; srcW = r.canvas.width; srcH = r.canvas.height; sourceKey = r.version;
    } else if (clip.type === 'solid') {
      solid = clip.solid || { color: '#000000', gradient: { enabled: false, from: '#000', to: '#fff', angle: 0 } };
    } else if (clip.type === 'adjustment') {
      adjustment = true;
    } else return null;

    const geom = clipGeometry(clip, time, ctx);
    return {
      clip, geom, source, srcW, srcH, sourceKey, cacheId: clip.id + (tail ? ':tail' : ''), segMask, localT, sourceT,
      solid, adjustment,
    };
  };

  const visualTracks = project.tracks.filter((tr) => tr.kind === 'visual' && !tr.hidden);
  for (let i = visualTracks.length - 1; i >= 0; i--) {
    const tr = visualTracks[i];
    const clip = activeClipAt(project, tr.id, t);
    if (!clip) continue;
    const L = makeLayer(clip, t, false);
    if (!L) continue;
    const tin = clip.transitionIn;
    if (tin && tin.type !== 'none' && tin.duration > 0 && t - clip.start < tin.duration) {
      const prev = project.clips.find((c) => c.trackId === tr.id && c.id !== clip.id && Math.abs(c.start + c.duration - clip.start) < 0.05);
      const from = prev ? makeLayer(prev, prev.start + prev.duration - 0.001, prev.type === 'video') : null;
      L.transition = { typeId: TRANSITION_ID[tin.type] || 1, progress: (t - clip.start) / tin.duration, from };
    }
    layers.push(L);
  }

  return { width: W, height: H, background: project.background, layers, time: t, trackings: project.trackings, luts: project.luts };
}
