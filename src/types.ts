// ============================================================================
//  NovaCut Studio — Modelo de datos del proyecto
// ============================================================================

export type MediaKind = 'video' | 'audio' | 'image';

export interface MediaAsset {
  id: string;
  name: string;
  kind: MediaKind;
  mime: string;
  size: number;
  duration: number; // segundos (imágenes: 0)
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
  /** URL de objeto en tiempo de ejecución (no se serializa) */
  url: string;
  thumbnail?: string;
  /** miniaturas a lo largo del clip para la tira de película */
  filmstrip?: string[];
  /** picos de forma de onda normalizados (100 por segundo) */
  waveform?: number[];
  /** estado: listo, procesando, error */
  status?: 'ready' | 'processing' | 'error' | 'unsupported';
  /** el video tiene canal alfa (p. ej. motion graphics renderizados) */
  alpha?: boolean;
  /** origen: motion graphic de HyperFrames (id de la plantilla + variables) */
  motion?: { templateId: string; variables: Record<string, string | number | boolean> };
  error?: string;
  createdAt: number;
}

export type TrackKind = 'visual' | 'audio';

export interface Track {
  id: string;
  kind: TrackKind;
  name: string;
  muted: boolean;
  hidden: boolean;
  locked: boolean;
  height: number;
}

export type ClipType = 'video' | 'image' | 'audio' | 'text' | 'shape' | 'adjustment' | 'solid';

export type BlendMode =
  | 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten'
  | 'color-dodge' | 'color-burn' | 'hard-light' | 'soft-light' | 'difference'
  | 'exclusion' | 'add' | 'subtract' | 'hue' | 'saturation' | 'color' | 'luminosity';

export type FitMode = 'contain' | 'cover' | 'fill' | 'none';

export interface Transform {
  x: number; // px desde el centro del lienzo
  y: number;
  scale: number;
  scaleX: number; // multiplicador no uniforme
  scaleY: number;
  rotation: number; // grados
  opacity: number; // 0..1
  flipH: boolean;
  flipV: boolean;
}

export interface Crop { l: number; t: number; r: number; b: number } // 0..1

export interface ColorGrade {
  exposure: number;     // -3..3 (stops)
  contrast: number;     // -1..1
  highlights: number;   // -1..1
  shadows: number;      // -1..1
  whites: number;       // -1..1
  blacks: number;       // -1..1
  saturation: number;   // -1..1
  vibrance: number;     // -1..1
  temperature: number;  // -1..1
  tint: number;         // -1..1
  hue: number;          // -180..180
  fade: number;         // 0..1
  sharpen: number;      // 0..1  (nitidez rápida)
  vignette: number;     // -1..1
  lift: [number, number, number];  // -0.5..0.5 por canal
  gamma: [number, number, number]; // -0.5..0.5 por canal (offset)
  gain: [number, number, number];  // -0.5..0.5 por canal (offset)
  splitShadow: string;    // color hex
  splitHighlight: string; // color hex
  splitAmount: number;    // 0..1
  mono: number;           // 0..1
  sepia: number;          // 0..1
  filter: string;         // id de filtro predefinido
  filterIntensity: number;// 0..1
  lutId: string | null;   // id de LUT .cube importado
  lutIntensity: number;
  curves: Curves | null;
}

export interface CurvePoint { x: number; y: number }
export interface Curves {
  master: CurvePoint[];
  r: CurvePoint[];
  g: CurvePoint[];
  b: CurvePoint[];
}

export type EffectType =
  | 'blur' | 'directionalBlur' | 'zoomBlur' | 'sharpen' | 'pixelate' | 'vignette'
  | 'grain' | 'rgbSplit' | 'glitch' | 'chromaKey' | 'lumaKey' | 'bgRemove'
  | 'regionBlur' | 'focus' | 'mirror' | 'invert' | 'posterize' | 'edge' | 'duotone'
  | 'wave' | 'fisheye' | 'glow' | 'cinemaBars' | 'halftone' | 'scanlines' | 'tiltShift'
  | 'colorOverlay' | 'emboss' | 'kaleidoscope' | 'vhs'
  // Tendencias TikTok / CapCut
  | 'shake' | 'flash' | 'zoomPulse' | 'rgbShake' | 'lightLeak' | 'dreamGlow' | 'sparkles' | 'particles'
  | 'oldFilm' | 'camcorder' | 'prism'
  // Persona (IA)
  | 'aura' | 'subjectRays' | 'echo'
  // Belleza y calidad
  | 'smoothSkin' | 'enhance';

export interface Effect {
  id: string;
  type: EffectType;
  enabled: boolean;
  params: Record<string, number | string | boolean>;
}

export type MaskShape = 'none' | 'rect' | 'ellipse' | 'linear' | 'heart' | 'star';
export interface Mask {
  shape: MaskShape;
  x: number; y: number; w: number; h: number; // normalizado (centro, tamaño) en espacio de la fuente
  rotation: number;
  feather: number;  // 0..1
  invert: boolean;
  radius: number;   // esquinas redondeadas para rect
}

export type TransitionType =
  | 'none' | 'crossfade' | 'dipBlack' | 'dipWhite' | 'wipeLeft' | 'wipeRight' | 'wipeUp' | 'wipeDown'
  | 'slideLeft' | 'slideRight' | 'slideUp' | 'slideDown' | 'pushLeft' | 'pushRight'
  | 'zoomIn' | 'zoomOut' | 'blur' | 'circle' | 'circleOut' | 'spin' | 'glitch' | 'pixelate' | 'flash'
  | 'barnDoor' | 'diagonal' | 'swirl' | 'ripple' | 'heart' | 'clock' | 'lumaFade' | 'rgbShift' | 'filmBurn'
  | 'whipLeft' | 'whipRight' | 'whipUp' | 'whipDown' | 'zoomBlurIn' | 'shake' | 'lightLeak' | 'spinZoom' | 'squeeze';

export interface Transition { type: TransitionType; duration: number }

export type AnimationType =
  | 'none' | 'fade' | 'zoomIn' | 'zoomOut' | 'slideLeft' | 'slideRight' | 'slideUp' | 'slideDown'
  | 'rotate' | 'pop' | 'bounce' | 'blur' | 'flip' | 'swing' | 'drop' | 'stretch' | 'typewriter'
  | 'wordReveal' | 'letterFade' | 'glitch' | 'elastic';
export type LoopAnimationType = 'none' | 'pulse' | 'float' | 'shake' | 'spin' | 'heartbeat' | 'wiggle' | 'kenBurnsIn' | 'kenBurnsOut' | 'panLeft' | 'panRight' | 'flicker' | 'sway';

export interface ClipAnimation {
  in: AnimationType; inDuration: number;
  out: AnimationType; outDuration: number;
  loop: LoopAnimationType; loopSpeed: number; loopIntensity: number;
}

export type Easing = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'hold' | 'bounce' | 'elastic' | 'back';
export interface Keyframe { t: number; v: number; ease: Easing } // t relativo al inicio del clip
export type KeyframeMap = Record<string, Keyframe[]>;

export interface AudioSettings {
  volume: number;     // 0..2
  fadeIn: number;     // s
  fadeOut: number;    // s
  muted: boolean;
  pan: number;        // -1..1
  eqLow: number;      // dB -12..12
  eqMid: number;
  eqHigh: number;
  denoise: boolean;   // filtro paso alto + puerta suave
  voiceEnhance: boolean;
  preservePitch: boolean;
}

export interface TextWord { text: string; start: number; end: number } // relativo al clip

export type TextAlign = 'left' | 'center' | 'right';
export type CaptionMode = 'none' | 'karaoke' | 'wordByWord' | 'singleWord' | 'highlightBox' | 'bounceWord';

export interface TextData {
  content: string;
  font: string;
  size: number;          // px del proyecto
  weight: number;
  italic: boolean;
  underline: boolean;
  uppercase: boolean;
  color: string;
  gradient: { enabled: boolean; from: string; to: string; angle: number };
  align: TextAlign;
  lineHeight: number;
  letterSpacing: number; // px
  boxWidth: number;      // 0 = auto
  stroke: { enabled: boolean; color: string; width: number };
  shadow: { enabled: boolean; color: string; blur: number; x: number; y: number };
  glow: { enabled: boolean; color: string; size: number };
  background: { enabled: boolean; color: string; padding: number; radius: number; opacity: number; mode: 'block' | 'line' };
  captionMode: CaptionMode;
  highlightColor: string;
  highlightBg: string;
  words?: TextWord[];
  isCaption?: boolean;
}

export type ShapeKind = 'rect' | 'roundRect' | 'circle' | 'triangle' | 'star' | 'heart' | 'arrow' | 'line' | 'polygon' | 'bubble' | 'ring' | 'cross';
export interface ShapeData {
  kind: ShapeKind;
  width: number; height: number;
  fill: string; fillEnabled: boolean;
  gradient: { enabled: boolean; from: string; to: string; angle: number };
  stroke: string; strokeWidth: number;
  radius: number;
  sides: number;
}

export interface FollowBinding {
  trackingId: string;
  clipId: string;    // clip cuyo espacio de fuente define el seguimiento
  offsetX: number;
  offsetY: number;
  boxIndex: number;
  scaleWithObject: boolean;
  baseW: number;
}

export interface ReframeBinding { trackingId: string; zoom: number }
export interface StabilizeBinding { trackingId: string; zoom: number; strength: number }

export interface Clip {
  id: string;
  trackId: string;
  type: ClipType;
  name: string;
  start: number;
  duration: number;
  in: number;
  speed: number;
  assetId?: string;
  color?: string; // etiqueta de color
  transform: Transform;
  crop: Crop;
  fit: FitMode;
  blend: BlendMode;
  grade: ColorGrade;
  effects: Effect[];
  mask: Mask;
  transitionIn: Transition | null;
  animation: ClipAnimation;
  keyframes: KeyframeMap;
  audio: AudioSettings;
  text?: TextData;
  shape?: ShapeData;
  solid?: { color: string; gradient: { enabled: boolean; from: string; to: string; angle: number } };
  follow?: FollowBinding | null;
  reframe?: ReframeBinding | null;
  stabilize?: StabilizeBinding | null;
  audioDetached?: boolean; // audio separado en otra pista
  reversed?: boolean;
}

export interface TrackBox { x: number; y: number; w: number; h: number; score?: number } // normalizado 0..1 (x,y = centro)
export interface TrackingSample { t: number; boxes: TrackBox[] } // t = tiempo de la fuente
export interface TrackingData {
  id: string;
  name: string;
  kind: 'object' | 'faces' | 'motion' | 'reframe' | 'person';
  assetId: string;
  samples: TrackingSample[];
  createdAt: number;
}

export interface Marker { id: string; t: number; label: string; color: string }

export interface LutAsset { id: string; name: string; size: number; data: number[] } // datos RGB float aplanados

export interface ProjectBackground { type: 'color' | 'blur' | 'gradient'; color: string; color2: string; blur: number }

export interface Project {
  id: string;
  name: string;
  width: number;
  height: number;
  fps: number;
  sampleRate: number;
  background: ProjectBackground;
  tracks: Track[];
  clips: Clip[];
  trackings: TrackingData[];
  markers: Marker[];
  luts: LutAsset[];
  createdAt: number;
  updatedAt: number;
  version: number;
}

export type Tool = 'select' | 'blade' | 'hand' | 'track';
