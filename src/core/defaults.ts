import type {
  AudioSettings, Clip, ClipAnimation, ColorGrade, Crop, Mask, Project, ShapeData, ShapeKind, TextData, Track,
  TrackKind, Transform,
} from '../types';
import { uid } from './utils';

export const defaultTransform = (): Transform => ({
  x: 0, y: 0, scale: 1, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, flipH: false, flipV: false,
});

export const defaultCrop = (): Crop => ({ l: 0, t: 0, r: 0, b: 0 });

export const defaultGrade = (): ColorGrade => ({
  exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0,
  saturation: 0, vibrance: 0, temperature: 0, tint: 0, hue: 0, fade: 0, sharpen: 0, vignette: 0,
  lift: [0, 0, 0], gamma: [0, 0, 0], gain: [0, 0, 0],
  splitShadow: '#2a6cff', splitHighlight: '#ffa040', splitAmount: 0,
  mono: 0, sepia: 0,
  filter: 'none', filterIntensity: 1,
  lutId: null, lutIntensity: 1,
  curves: null,
});

export const defaultMask = (): Mask => ({
  shape: 'none', x: 0.5, y: 0.5, w: 0.6, h: 0.6, rotation: 0, feather: 0.05, invert: false, radius: 0,
});

export const defaultAnimation = (): ClipAnimation => ({
  in: 'none', inDuration: 0.5, out: 'none', outDuration: 0.5, loop: 'none', loopSpeed: 1, loopIntensity: 0.5,
});

export const defaultAudio = (): AudioSettings => ({
  volume: 1, fadeIn: 0, fadeOut: 0, muted: false, pan: 0, eqLow: 0, eqMid: 0, eqHigh: 0,
  denoise: false, voiceEnhance: false, preservePitch: true,
});

export const defaultText = (content = 'Tu texto aquí'): TextData => ({
  content,
  font: 'Montserrat',
  size: 96,
  weight: 800,
  italic: false,
  underline: false,
  uppercase: false,
  color: '#ffffff',
  gradient: { enabled: false, from: '#7c5cff', to: '#00d4ff', angle: 90 },
  align: 'center',
  lineHeight: 1.15,
  letterSpacing: 0,
  boxWidth: 0,
  stroke: { enabled: false, color: '#000000', width: 6 },
  shadow: { enabled: true, color: 'rgba(0,0,0,0.6)', blur: 12, x: 0, y: 4 },
  glow: { enabled: false, color: '#00d4ff', size: 20 },
  background: { enabled: false, color: '#000000', padding: 18, radius: 12, opacity: 0.7, mode: 'block' },
  captionMode: 'none',
  highlightColor: '#ffd400',
  highlightBg: '#7c5cff',
});

export const defaultShape = (kind: ShapeKind = 'rect'): ShapeData => ({
  kind,
  width: 400, height: kind === 'line' ? 12 : 400,
  fill: '#7c5cff', fillEnabled: true,
  gradient: { enabled: false, from: '#7c5cff', to: '#00d4ff', angle: 45 },
  stroke: '#ffffff', strokeWidth: 0,
  radius: kind === 'roundRect' ? 48 : 0,
  sides: kind === 'polygon' ? 6 : 5,
});

export function createClip(partial: Partial<Clip> & Pick<Clip, 'type' | 'trackId' | 'start' | 'duration'>): Clip {
  return {
    id: uid('clip'),
    name: partial.name || 'Clip',
    in: 0,
    speed: 1,
    transform: defaultTransform(),
    crop: defaultCrop(),
    fit: partial.type === 'text' || partial.type === 'shape' ? 'none' : 'contain',
    blend: 'normal',
    grade: defaultGrade(),
    effects: [],
    mask: defaultMask(),
    transitionIn: null,
    animation: defaultAnimation(),
    keyframes: {},
    audio: defaultAudio(),
    follow: null,
    reframe: null,
    stabilize: null,
    ...partial,
  } as Clip;
}

export function createTrack(kind: TrackKind, name?: string): Track {
  return {
    id: uid('trk'),
    kind,
    name: name || (kind === 'visual' ? 'Video' : 'Audio'),
    muted: false,
    hidden: false,
    locked: false,
    height: kind === 'visual' ? 64 : 52,
  };
}

export function createProject(opts: Partial<Project> = {}): Project {
  const v2 = createTrack('visual', 'V2');
  const v1 = createTrack('visual', 'V1');
  const a1 = createTrack('audio', 'A1');
  const a2 = createTrack('audio', 'A2');
  return {
    id: uid('prj'),
    name: 'Proyecto sin título',
    width: 1920,
    height: 1080,
    fps: 30,
    sampleRate: 48000,
    background: { type: 'color', color: '#000000', color2: '#1b1f2a', blur: 40 },
    tracks: [v2, v1, a1, a2],
    clips: [],
    trackings: [],
    markers: [],
    luts: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    version: 1,
    ...opts,
  };
}

export const ASPECT_PRESETS = [
  { id: '16:9', label: '16:9 · YouTube / TV', w: 1920, h: 1080 },
  { id: '9:16', label: '9:16 · TikTok / Reels / Shorts', w: 1080, h: 1920 },
  { id: '1:1', label: '1:1 · Instagram Post', w: 1080, h: 1080 },
  { id: '4:5', label: '4:5 · Instagram Feed', w: 1080, h: 1350 },
  { id: '4:3', label: '4:3 · Clásico', w: 1440, h: 1080 },
  { id: '21:9', label: '21:9 · Ultrawide', w: 2560, h: 1080 },
  { id: '2.39:1', label: '2.39:1 · Cinemascope', w: 1920, h: 804 },
  { id: '3:4', label: '3:4 · Retrato', w: 1080, h: 1440 },
  { id: '4K', label: '4K UHD 16:9', w: 3840, h: 2160 },
  { id: '2K', label: '2K DCI', w: 2048, h: 1080 },
  { id: '720p', label: 'HD 720p', w: 1280, h: 720 },
];

export const FPS_PRESETS = [23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60];
