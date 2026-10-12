import type {
  AnimationType, BlendMode, ColorGrade, EffectType, LoopAnimationType, TextData, TransitionType,
} from '../types';

// ---------------------------------------------------------------------------
//  Filtros (looks) — parámetros de corrección que se mezclan según intensidad
// ---------------------------------------------------------------------------
export interface FilterPreset {
  id: string;
  name: string;
  group: string;
  grade: Partial<ColorGrade>;
}

export const FILTERS: FilterPreset[] = [
  { id: 'none', name: 'Original', group: 'Básicos', grade: {} },
  // Cine
  { id: 'teal-orange', name: 'Teal & Orange', group: 'Cine', grade: { contrast: 0.18, saturation: 0.1, splitShadow: '#0f6f80', splitHighlight: '#ff9a3c', splitAmount: 0.45, temperature: 0.05 } },
  { id: 'blockbuster', name: 'Blockbuster', group: 'Cine', grade: { contrast: 0.3, saturation: -0.05, splitShadow: '#164a6b', splitHighlight: '#f0b070', splitAmount: 0.35, blacks: -0.1, vignette: 0.25 } },
  { id: 'cinematic-matte', name: 'Matte cinemático', group: 'Cine', grade: { contrast: 0.12, fade: 0.35, saturation: -0.15, splitShadow: '#24405a', splitAmount: 0.2 } },
  { id: 'noir', name: 'Noir', group: 'Cine', grade: { mono: 1, contrast: 0.45, blacks: -0.15, vignette: 0.45 } },
  { id: 'bleach', name: 'Bleach Bypass', group: 'Cine', grade: { saturation: -0.55, contrast: 0.4, highlights: 0.1 } },
  { id: 'dune', name: 'Desierto', group: 'Cine', grade: { temperature: 0.45, tint: 0.05, contrast: 0.15, saturation: -0.1, splitHighlight: '#ffbf6b', splitAmount: 0.3 } },
  { id: 'matrix', name: 'Código verde', group: 'Cine', grade: { tint: -0.45, contrast: 0.25, saturation: -0.2, splitShadow: '#0a4020', splitAmount: 0.3 } },
  { id: 'arctic', name: 'Ártico', group: 'Cine', grade: { temperature: -0.45, saturation: -0.2, contrast: 0.1, exposure: 0.1 } },
  { id: 'nolan', name: 'Épico frío', group: 'Cine', grade: { temperature: -0.2, contrast: 0.25, saturation: -0.25, blacks: -0.08, vignette: 0.2 } },
  // Vintage
  { id: 'vintage', name: 'Vintage', group: 'Vintage', grade: { sepia: 0.35, fade: 0.25, contrast: -0.05, saturation: -0.2, vignette: 0.35 } },
  { id: 'kodak', name: 'Película 35mm', group: 'Vintage', grade: { temperature: 0.18, contrast: 0.12, fade: 0.15, splitShadow: '#2b4a3a', splitHighlight: '#ffd29a', splitAmount: 0.25 } },
  { id: 'polaroid', name: 'Polaroid', group: 'Vintage', grade: { fade: 0.3, temperature: 0.1, tint: 0.08, saturation: -0.1, highlights: -0.1 } },
  { id: 'retro70', name: 'Años 70', group: 'Vintage', grade: { sepia: 0.25, temperature: 0.3, saturation: 0.1, fade: 0.2, splitShadow: '#5a2f1a', splitAmount: 0.2 } },
  { id: 'sepia', name: 'Sepia', group: 'Vintage', grade: { sepia: 1, contrast: 0.05 } },
  { id: 'faded', name: 'Desvanecido', group: 'Vintage', grade: { fade: 0.5, saturation: -0.3, contrast: -0.1 } },
  { id: 'vhs-look', name: 'VHS', group: 'Vintage', grade: { saturation: 0.25, contrast: -0.1, fade: 0.2, tint: 0.05, sharpen: 0 } },
  // Retrato / Social
  { id: 'warm', name: 'Cálido', group: 'Retrato', grade: { temperature: 0.3, saturation: 0.05 } },
  { id: 'cool', name: 'Frío', group: 'Retrato', grade: { temperature: -0.3 } },
  { id: 'glow-skin', name: 'Piel radiante', group: 'Retrato', grade: { exposure: 0.15, temperature: 0.12, highlights: -0.1, shadows: 0.15, saturation: -0.05, vibrance: 0.15 } },
  { id: 'soft', name: 'Suave', group: 'Retrato', grade: { contrast: -0.15, highlights: -0.15, shadows: 0.2, fade: 0.1 } },
  { id: 'pastel', name: 'Pastel', group: 'Retrato', grade: { saturation: -0.25, exposure: 0.2, fade: 0.25, tint: 0.06 } },
  { id: 'peach', name: 'Melocotón', group: 'Retrato', grade: { temperature: 0.2, tint: 0.15, fade: 0.1, highlights: -0.05 } },
  // Vivos
  { id: 'vivid', name: 'Vívido', group: 'Vivos', grade: { saturation: 0.35, vibrance: 0.25, contrast: 0.15 } },
  { id: 'pop', name: 'Pop', group: 'Vivos', grade: { saturation: 0.55, contrast: 0.25, exposure: 0.05 } },
  { id: 'hdr', name: 'HDR', group: 'Vivos', grade: { shadows: 0.45, highlights: -0.45, contrast: 0.2, vibrance: 0.3, sharpen: 0.4 } },
  { id: 'sunset', name: 'Atardecer', group: 'Vivos', grade: { temperature: 0.4, tint: 0.12, saturation: 0.2, splitShadow: '#5b2a8a', splitAmount: 0.25 } },
  { id: 'cyberpunk', name: 'Cyberpunk', group: 'Vivos', grade: { tint: 0.35, contrast: 0.25, saturation: 0.25, splitShadow: '#2a1aff', splitHighlight: '#ff2ad4', splitAmount: 0.55 } },
  { id: 'neon', name: 'Neón', group: 'Vivos', grade: { saturation: 0.6, contrast: 0.35, blacks: -0.2, splitShadow: '#00e0ff', splitHighlight: '#ff00aa', splitAmount: 0.35 } },
  { id: 'tropical', name: 'Tropical', group: 'Vivos', grade: { saturation: 0.35, tint: -0.1, temperature: 0.1, vibrance: 0.3 } },
  // Paisaje
  { id: 'forest', name: 'Bosque', group: 'Paisaje', grade: { tint: -0.15, saturation: 0.1, shadows: 0.1, contrast: 0.1 } },
  { id: 'ocean', name: 'Océano', group: 'Paisaje', grade: { temperature: -0.25, tint: -0.05, saturation: 0.2, contrast: 0.1 } },
  { id: 'golden', name: 'Hora dorada', group: 'Paisaje', grade: { temperature: 0.35, exposure: 0.08, highlights: 0.1, saturation: 0.1, splitHighlight: '#ffcf70', splitAmount: 0.3 } },
  { id: 'moody', name: 'Melancólico', group: 'Paisaje', grade: { exposure: -0.15, saturation: -0.3, contrast: 0.15, temperature: -0.1, vignette: 0.3 } },
  { id: 'night', name: 'Noche americana', group: 'Paisaje', grade: { exposure: -0.8, temperature: -0.5, saturation: -0.3, contrast: 0.2 } },
  // Tendencia TikTok / CapCut
  { id: 'tt-glowup', name: 'Glow Up', group: 'TikTok', grade: { exposure: 0.12, highlights: -0.15, shadows: 0.2, vibrance: 0.2, temperature: 0.08, fade: 0.05, sharpen: 0.15 } },
  { id: 'tt-softlight', name: 'Soft Light', group: 'TikTok', grade: { contrast: -0.12, exposure: 0.1, highlights: -0.2, fade: 0.12, saturation: -0.05, tint: 0.05 } },
  { id: 'tt-tan', name: 'Summer Tan', group: 'TikTok', grade: { temperature: 0.35, tint: 0.06, saturation: 0.15, contrast: 0.12, splitHighlight: '#ffb36b', splitAmount: 0.3, exposure: -0.03 } },
  { id: 'tt-cleangirl', name: 'Clean Girl', group: 'TikTok', grade: { exposure: 0.1, contrast: 0.05, saturation: -0.12, temperature: 0.05, highlights: -0.1, fade: 0.06 } },
  { id: 'tt-webcore', name: 'Webcore Y2K', group: 'TikTok', grade: { saturation: 0.3, contrast: 0.1, tint: 0.15, splitShadow: '#4b2bff', splitHighlight: '#ff9ff3', splitAmount: 0.35, fade: 0.1 } },
  { id: 'tt-retro', name: 'Retro TikTok', group: 'TikTok', grade: { sepia: 0.2, fade: 0.22, contrast: 0.1, temperature: 0.15, saturation: -0.1, vignette: 0.2 } },
  { id: 'tt-moody', name: 'Moody Film', group: 'TikTok', grade: { exposure: -0.1, contrast: 0.2, saturation: -0.25, splitShadow: '#1d3b4a', splitHighlight: '#d9a066', splitAmount: 0.3, fade: 0.1 } },
  { id: 'tt-portra', name: 'Portra 400', group: 'TikTok', grade: { temperature: 0.12, tint: 0.04, saturation: -0.05, contrast: -0.05, fade: 0.1, splitHighlight: '#ffd8a8', splitAmount: 0.2, shadows: 0.1 } },
  { id: 'tt-disposable', name: 'Cámara desechable', group: 'TikTok', grade: { fade: 0.15, contrast: 0.15, saturation: 0.1, tint: -0.08, temperature: 0.1, vignette: 0.3, sharpen: 0.2 } },
  { id: 'tt-pinkaura', name: 'Pink Aura', group: 'TikTok', grade: { tint: 0.25, temperature: 0.05, splitHighlight: '#ff8fd8', splitAmount: 0.3, exposure: 0.05 } },
  { id: 'tt-golden', name: 'Golden Hour', group: 'TikTok', grade: { temperature: 0.3, exposure: 0.08, saturation: 0.15, splitHighlight: '#ffc35a', splitAmount: 0.35, highlights: -0.05 } },
  { id: 'tt-coldnight', name: 'Noche fría', group: 'TikTok', grade: { temperature: -0.35, tint: 0.05, contrast: 0.15, saturation: -0.1, splitShadow: '#102a5c', splitAmount: 0.3 } },
  { id: 'tt-coffee', name: 'Café', group: 'TikTok', grade: { temperature: 0.2, saturation: -0.3, contrast: 0.1, splitShadow: '#3b2414', splitAmount: 0.3, fade: 0.1 } },
  { id: 'tt-paris', name: 'París', group: 'TikTok', grade: { fade: 0.15, tint: 0.1, saturation: -0.1, exposure: 0.08, splitHighlight: '#ffd1e0', splitAmount: 0.2 } },
  { id: 'tt-glossy', name: 'Glossy', group: 'TikTok', grade: { contrast: 0.15, vibrance: 0.3, highlights: 0.1, sharpen: 0.3, saturation: 0.1 } },
  { id: 'tt-greenmoody', name: 'Verde moody', group: 'TikTok', grade: { tint: -0.2, saturation: -0.15, contrast: 0.15, splitShadow: '#163828', splitAmount: 0.3 } },
  { id: 'tt-90s', name: 'Años 90', group: 'TikTok', grade: { fade: 0.2, saturation: 0.15, contrast: 0.05, tint: 0.06, splitShadow: '#3a2a6a', splitHighlight: '#ffe0a0', splitAmount: 0.25 } },
  { id: 'tt-latte', name: 'Latte', group: 'TikTok', grade: { temperature: 0.15, saturation: -0.2, exposure: 0.1, fade: 0.15, contrast: -0.05, splitHighlight: '#f3dcc0', splitAmount: 0.25 } },
  { id: 'tt-cinematic-teal', name: 'Teal cinemático', group: 'TikTok', grade: { contrast: 0.22, saturation: -0.1, splitShadow: '#0b5563', splitHighlight: '#f2a65a', splitAmount: 0.5, blacks: -0.05 } },
  { id: 'tt-iphone', name: 'Look iPhone', group: 'TikTok', grade: { contrast: 0.1, vibrance: 0.2, shadows: 0.15, highlights: -0.12, sharpen: 0.2, temperature: 0.03 } },
  // B&N
  { id: 'bw', name: 'Blanco y negro', group: 'B&N', grade: { mono: 1 } },
  { id: 'bw-contrast', name: 'B&N contraste', group: 'B&N', grade: { mono: 1, contrast: 0.4, blacks: -0.1 } },
  { id: 'bw-soft', name: 'B&N suave', group: 'B&N', grade: { mono: 1, fade: 0.25, contrast: -0.1 } },
  { id: 'selenium', name: 'Selenio', group: 'B&N', grade: { mono: 1, splitShadow: '#4a3a6a', splitHighlight: '#e8d8c0', splitAmount: 0.3 } },
];

// ---------------------------------------------------------------------------
//  Catálogo de efectos
// ---------------------------------------------------------------------------
export type ParamDef =
  | { key: string; label: string; type: 'range'; min: number; max: number; step: number; default: number }
  | { key: string; label: string; type: 'color'; default: string }
  | { key: string; label: string; type: 'bool'; default: boolean }
  | { key: string; label: string; type: 'select'; options: { value: string; label: string }[]; default: string }
  | { key: string; label: string; type: 'tracking'; default: string };

export interface EffectDef {
  type: EffectType;
  name: string;
  group: string;
  icon: string;
  params: ParamDef[];
  ai?: boolean;
}

const regionParams: ParamDef[] = [
  { key: 'shape', label: 'Forma', type: 'select', default: 'ellipse', options: [{ value: 'ellipse', label: 'Elipse' }, { value: 'rect', label: 'Rectángulo' }] },
  { key: 'x', label: 'Centro X', type: 'range', min: 0, max: 1, step: 0.001, default: 0.5 },
  { key: 'y', label: 'Centro Y', type: 'range', min: 0, max: 1, step: 0.001, default: 0.5 },
  { key: 'w', label: 'Ancho', type: 'range', min: 0.01, max: 1.5, step: 0.001, default: 0.3 },
  { key: 'h', label: 'Alto', type: 'range', min: 0.01, max: 1.5, step: 0.001, default: 0.3 },
  { key: 'feather', label: 'Suavizado', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25 },
  { key: 'tracking', label: 'Seguir objeto', type: 'tracking', default: '' },
  { key: 'expand', label: 'Expandir seguimiento', type: 'range', min: 0.5, max: 3, step: 0.01, default: 1.2 },
];

export const EFFECTS: EffectDef[] = [
  // Desenfoque
  { type: 'blur', name: 'Desenfoque gaussiano', group: 'Desenfoque', icon: '◌', params: [
    { key: 'radius', label: 'Radio', type: 'range', min: 0, max: 100, step: 0.5, default: 12 },
  ] },
  { type: 'directionalBlur', name: 'Desenfoque de movimiento', group: 'Desenfoque', icon: '≋', params: [
    { key: 'amount', label: 'Cantidad', type: 'range', min: 0, max: 100, step: 0.5, default: 25 },
    { key: 'angle', label: 'Ángulo', type: 'range', min: 0, max: 360, step: 1, default: 0 },
  ] },
  { type: 'zoomBlur', name: 'Desenfoque radial (zoom)', group: 'Desenfoque', icon: '◎', params: [
    { key: 'amount', label: 'Cantidad', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25 },
    { key: 'cx', label: 'Centro X', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: 'cy', label: 'Centro Y', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5 },
  ] },
  { type: 'tiltShift', name: 'Tilt-Shift (miniatura)', group: 'Desenfoque', icon: '⇕', params: [
    { key: 'radius', label: 'Desenfoque', type: 'range', min: 0, max: 60, step: 0.5, default: 18 },
    { key: 'center', label: 'Centro', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: 'size', label: 'Zona nítida', type: 'range', min: 0, max: 1, step: 0.01, default: 0.2 },
    { key: 'softness', label: 'Transición', type: 'range', min: 0.01, max: 1, step: 0.01, default: 0.25 },
  ] },
  { type: 'regionBlur', name: 'Censurar / Difuminar zona', group: 'Desenfoque', icon: '▩', params: [
    { key: 'mode', label: 'Modo', type: 'select', default: 'blur', options: [{ value: 'blur', label: 'Desenfocar' }, { value: 'pixelate', label: 'Pixelar' }, { value: 'solid', label: 'Color sólido' }] },
    { key: 'strength', label: 'Intensidad', type: 'range', min: 1, max: 100, step: 1, default: 30 },
    { key: 'color', label: 'Color', type: 'color', default: '#000000' },
    { key: 'invert', label: 'Invertir (fuera de la zona)', type: 'bool', default: false },
    ...regionParams,
  ] },
  { type: 'focus', name: 'Enfoque selectivo', group: 'Desenfoque', icon: '◉', params: [
    { key: 'strength', label: 'Desenfoque exterior', type: 'range', min: 1, max: 80, step: 1, default: 20 },
    { key: 'darken', label: 'Oscurecer exterior', type: 'range', min: 0, max: 1, step: 0.01, default: 0.15 },
    ...regionParams,
  ] },
  // Nitidez y detalle
  { type: 'sharpen', name: 'Enfocar (nitidez)', group: 'Detalle', icon: '◆', params: [
    { key: 'amount', label: 'Cantidad', type: 'range', min: 0, max: 3, step: 0.01, default: 0.8 },
    { key: 'radius', label: 'Radio', type: 'range', min: 0.5, max: 5, step: 0.1, default: 1.2 },
  ] },
  { type: 'glow', name: 'Resplandor (Bloom)', group: 'Detalle', icon: '✺', params: [
    { key: 'threshold', label: 'Umbral', type: 'range', min: 0, max: 1, step: 0.01, default: 0.65 },
    { key: 'intensity', label: 'Intensidad', type: 'range', min: 0, max: 3, step: 0.01, default: 1 },
    { key: 'radius', label: 'Radio', type: 'range', min: 1, max: 80, step: 1, default: 24 },
  ] },
  { type: 'grain', name: 'Grano de película', group: 'Detalle', icon: '⁘', params: [
    { key: 'amount', label: 'Cantidad', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25 },
    { key: 'size', label: 'Tamaño', type: 'range', min: 0.5, max: 4, step: 0.1, default: 1.5 },
  ] },
  { type: 'vignette', name: 'Viñeta', group: 'Detalle', icon: '◐', params: [
    { key: 'amount', label: 'Cantidad', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: 'size', label: 'Tamaño', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: 'softness', label: 'Suavidad', type: 'range', min: 0.01, max: 1, step: 0.01, default: 0.5 },
    { key: 'color', label: 'Color', type: 'color', default: '#000000' },
  ] },
  { type: 'cinemaBars', name: 'Barras de cine', group: 'Detalle', icon: '▭', params: [
    { key: 'ratio', label: 'Relación', type: 'select', default: '2.39', options: [{ value: '2.39', label: '2.39:1' }, { value: '2.0', label: '2:1' }, { value: '1.85', label: '1.85:1' }, { value: '2.76', label: '2.76:1' }] },
    { key: 'color', label: 'Color', type: 'color', default: '#000000' },
  ] },
  // Chroma / IA
  { type: 'bgRemove', name: 'Quitar fondo (IA)', group: 'IA y Keying', icon: '✂', ai: true, params: [
    { key: 'mode', label: 'Modo', type: 'select', default: 'remove', options: [
      { value: 'remove', label: 'Quitar fondo' }, { value: 'blur', label: 'Desenfocar fondo' },
      { value: 'color', label: 'Fondo de color' }, { value: 'keepBg', label: 'Quitar persona' }, { value: 'gray', label: 'Fondo B&N (color pop)' },
    ] },
    { key: 'threshold', label: 'Umbral', type: 'range', min: 0.05, max: 0.95, step: 0.01, default: 0.5 },
    { key: 'softness', label: 'Suavizado de borde', type: 'range', min: 0, max: 0.5, step: 0.01, default: 0.12 },
    { key: 'blur', label: 'Desenfoque de fondo', type: 'range', min: 0, max: 80, step: 1, default: 22 },
    { key: 'color', label: 'Color de fondo', type: 'color', default: '#00b140' },
    { key: 'smooth', label: 'Estabilidad temporal', type: 'range', min: 0, max: 0.9, step: 0.01, default: 0.5 },
    { key: 'model', label: 'Modelo', type: 'select', default: 'selfie', options: [{ value: 'selfie', label: 'Personas (rápido)' }, { value: 'multiclass', label: 'Personas (preciso)' }, { value: 'deeplab', label: 'Objetos generales' }] },
  ] },
  { type: 'chromaKey', name: 'Chroma Key (pantalla verde)', group: 'IA y Keying', icon: '▣', params: [
    { key: 'color', label: 'Color clave', type: 'color', default: '#00ff00' },
    { key: 'similarity', label: 'Similitud', type: 'range', min: 0, max: 1, step: 0.005, default: 0.38 },
    { key: 'smoothness', label: 'Suavidad', type: 'range', min: 0, max: 0.5, step: 0.005, default: 0.08 },
    { key: 'spill', label: 'Supresión de derrame', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5 },
  ] },
  { type: 'lumaKey', name: 'Luma Key', group: 'IA y Keying', icon: '◑', params: [
    { key: 'threshold', label: 'Umbral', type: 'range', min: 0, max: 1, step: 0.01, default: 0.2 },
    { key: 'softness', label: 'Suavidad', type: 'range', min: 0, max: 0.5, step: 0.01, default: 0.1 },
    { key: 'invert', label: 'Invertir (quitar claros)', type: 'bool', default: false },
  ] },
  // Estilizar
  { type: 'pixelate', name: 'Pixelar', group: 'Estilizar', icon: '▦', params: [
    { key: 'size', label: 'Tamaño de bloque', type: 'range', min: 1, max: 120, step: 1, default: 16 },
  ] },
  { type: 'rgbSplit', name: 'Aberración cromática', group: 'Estilizar', icon: '◍', params: [
    { key: 'amount', label: 'Cantidad', type: 'range', min: 0, max: 40, step: 0.1, default: 6 },
    { key: 'angle', label: 'Ángulo', type: 'range', min: 0, max: 360, step: 1, default: 0 },
  ] },
  { type: 'glitch', name: 'Glitch digital', group: 'Estilizar', icon: '⌁', params: [
    { key: 'amount', label: 'Intensidad', type: 'range', min: 0, max: 1, step: 0.01, default: 0.4 },
    { key: 'speed', label: 'Velocidad', type: 'range', min: 0.1, max: 5, step: 0.1, default: 1 },
  ] },
  { type: 'vhs', name: 'VHS retro', group: 'Estilizar', icon: '📼', params: [
    { key: 'amount', label: 'Intensidad', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6 },
  ] },
  { type: 'scanlines', name: 'Líneas CRT', group: 'Estilizar', icon: '☰', params: [
    { key: 'amount', label: 'Intensidad', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35 },
    { key: 'density', label: 'Densidad', type: 'range', min: 50, max: 1200, step: 1, default: 400 },
  ] },
  { type: 'halftone', name: 'Semitono (cómic)', group: 'Estilizar', icon: '⠿', params: [
    { key: 'size', label: 'Tamaño', type: 'range', min: 2, max: 40, step: 0.5, default: 8 },
    { key: 'color', label: 'Color', type: 'bool', default: true },
  ] },
  { type: 'posterize', name: 'Posterizar', group: 'Estilizar', icon: '▤', params: [
    { key: 'levels', label: 'Niveles', type: 'range', min: 2, max: 32, step: 1, default: 6 },
  ] },
  { type: 'edge', name: 'Boceto / Bordes', group: 'Estilizar', icon: '✎', params: [
    { key: 'amount', label: 'Intensidad', type: 'range', min: 0, max: 4, step: 0.01, default: 1.5 },
    { key: 'mode', label: 'Estilo', type: 'select', default: 'sketch', options: [{ value: 'sketch', label: 'Lápiz' }, { value: 'neon', label: 'Neón' }, { value: 'mix', label: 'Contorno sobre imagen' }] },
  ] },
  { type: 'emboss', name: 'Relieve', group: 'Estilizar', icon: '▲', params: [
    { key: 'amount', label: 'Intensidad', type: 'range', min: 0, max: 3, step: 0.01, default: 1 },
  ] },
  { type: 'duotone', name: 'Duotono', group: 'Estilizar', icon: '◒', params: [
    { key: 'dark', label: 'Sombras', type: 'color', default: '#1a0b5e' },
    { key: 'light', label: 'Luces', type: 'color', default: '#ff4fa3' },
    { key: 'mix', label: 'Mezcla', type: 'range', min: 0, max: 1, step: 0.01, default: 1 },
  ] },
  { type: 'colorOverlay', name: 'Superposición de color', group: 'Estilizar', icon: '■', params: [
    { key: 'color', label: 'Color', type: 'color', default: '#ff3b6b' },
    { key: 'amount', label: 'Cantidad', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3 },
  ] },
  { type: 'invert', name: 'Invertir colores', group: 'Estilizar', icon: '◧', params: [
    { key: 'amount', label: 'Cantidad', type: 'range', min: 0, max: 1, step: 0.01, default: 1 },
  ] },
  // Distorsión
  { type: 'mirror', name: 'Espejo', group: 'Distorsión', icon: '⇋', params: [
    { key: 'mode', label: 'Modo', type: 'select', default: 'h', options: [{ value: 'h', label: 'Horizontal' }, { value: 'v', label: 'Vertical' }, { value: 'quad', label: 'Cuádruple' }] },
  ] },
  { type: 'kaleidoscope', name: 'Caleidoscopio', group: 'Distorsión', icon: '❋', params: [
    { key: 'segments', label: 'Segmentos', type: 'range', min: 2, max: 16, step: 1, default: 6 },
    { key: 'rotation', label: 'Rotación', type: 'range', min: 0, max: 360, step: 1, default: 0 },
  ] },
  { type: 'wave', name: 'Ondas', group: 'Distorsión', icon: '∿', params: [
    { key: 'amount', label: 'Amplitud', type: 'range', min: 0, max: 0.1, step: 0.001, default: 0.015 },
    { key: 'frequency', label: 'Frecuencia', type: 'range', min: 1, max: 60, step: 0.5, default: 12 },
    { key: 'speed', label: 'Velocidad', type: 'range', min: 0, max: 10, step: 0.1, default: 2 },
  ] },
  { type: 'fisheye', name: 'Ojo de pez / Lente', group: 'Distorsión', icon: '◯', params: [
    { key: 'amount', label: 'Distorsión', type: 'range', min: -1, max: 1, step: 0.01, default: 0.4 },
  ] },
  // ---------------- Tendencias TikTok / CapCut
  { type: 'shake', name: 'Temblor de cámara', group: 'Tendencias TikTok', icon: '📳', params: [
    { key: 'amount', label: 'Intensidad', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35 },
    { key: 'speed', label: 'Velocidad', type: 'range', min: 0.2, max: 6, step: 0.1, default: 2 },
    { key: 'rotation', label: 'Rotación', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3 },
    { key: 'blur', label: 'Desenfoque de movimiento', type: 'range', min: 0, max: 1, step: 0.01, default: 0.4 },
  ] },
  { type: 'flash', name: 'Flash / Estroboscópico', group: 'Tendencias TikTok', icon: '⚡', params: [
    { key: 'intensity', label: 'Intensidad', type: 'range', min: 0, max: 1, step: 0.01, default: 0.8 },
    { key: 'rate', label: 'Flashes por segundo', type: 'range', min: 0.25, max: 12, step: 0.05, default: 2 },
    { key: 'decay', label: 'Duración del flash', type: 'range', min: 0.05, max: 1, step: 0.01, default: 0.35 },
    { key: 'color', label: 'Color', type: 'color', default: '#ffffff' },
  ] },
  { type: 'zoomPulse', name: 'Zoom al ritmo (beat)', group: 'Tendencias TikTok', icon: '💓', params: [
    { key: 'amount', label: 'Zoom', type: 'range', min: 0, max: 0.6, step: 0.01, default: 0.15 },
    { key: 'rate', label: 'Golpes por segundo', type: 'range', min: 0.25, max: 8, step: 0.05, default: 2 },
    { key: 'blur', label: 'Desenfoque radial', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5 },
  ] },
  { type: 'rgbShake', name: 'RGB Shake', group: 'Tendencias TikTok', icon: '🌈', params: [
    { key: 'amount', label: 'Separación', type: 'range', min: 0, max: 60, step: 0.5, default: 14 },
    { key: 'speed', label: 'Velocidad', type: 'range', min: 0.2, max: 8, step: 0.1, default: 3 },
    { key: 'jitter', label: 'Temblor', type: 'range', min: 0, max: 1, step: 0.01, default: 0.4 },
  ] },
  { type: 'prism', name: 'Prisma / Fantasma RGB', group: 'Tendencias TikTok', icon: '🔺', params: [
    { key: 'amount', label: 'Distancia', type: 'range', min: 0, max: 0.2, step: 0.001, default: 0.04 },
    { key: 'copies', label: 'Copias', type: 'range', min: 1, max: 6, step: 1, default: 3 },
    { key: 'zoom', label: 'Zoom de copias', type: 'range', min: 0, max: 0.3, step: 0.005, default: 0.04 },
    { key: 'speed', label: 'Animación', type: 'range', min: 0, max: 4, step: 0.05, default: 1 },
  ] },
  { type: 'lightLeak', name: 'Fugas de luz', group: 'Tendencias TikTok', icon: '🌅', params: [
    { key: 'intensity', label: 'Intensidad', type: 'range', min: 0, max: 1.5, step: 0.01, default: 0.7 },
    { key: 'speed', label: 'Velocidad', type: 'range', min: 0, max: 3, step: 0.05, default: 0.6 },
    { key: 'color1', label: 'Color 1', type: 'color', default: '#ff7a1a' },
    { key: 'color2', label: 'Color 2', type: 'color', default: '#ff2d6f' },
  ] },
  { type: 'dreamGlow', name: 'Brillo de ensueño (Orton)', group: 'Tendencias TikTok', icon: '☁', params: [
    { key: 'amount', label: 'Intensidad', type: 'range', min: 0, max: 1, step: 0.01, default: 0.55 },
    { key: 'radius', label: 'Radio', type: 'range', min: 2, max: 80, step: 1, default: 28 },
    { key: 'warmth', label: 'Calidez', type: 'range', min: -1, max: 1, step: 0.01, default: 0.2 },
  ] },
  { type: 'sparkles', name: 'Destellos ✨', group: 'Tendencias TikTok', icon: '✨', params: [
    { key: 'intensity', label: 'Intensidad', type: 'range', min: 0, max: 2, step: 0.01, default: 1 },
    { key: 'size', label: 'Tamaño', type: 'range', min: 4, max: 120, step: 1, default: 34 },
    { key: 'density', label: 'Densidad', type: 'range', min: 10, max: 200, step: 1, default: 60 },
    { key: 'threshold', label: 'Solo en brillos', type: 'range', min: 0, max: 1, step: 0.01, default: 0.55 },
    { key: 'color', label: 'Color', type: 'color', default: '#fff6d6' },
  ] },
  { type: 'particles', name: 'Partículas (nieve, corazones…)', group: 'Tendencias TikTok', icon: '❄', params: [
    { key: 'kind', label: 'Tipo', type: 'select', default: 'snow', options: [
      { value: 'snow', label: 'Nieve' }, { value: 'hearts', label: 'Corazones' }, { value: 'confetti', label: 'Confeti' },
      { value: 'stars', label: 'Estrellas' }, { value: 'bokeh', label: 'Bokeh' }, { value: 'rain', label: 'Lluvia' }, { value: 'embers', label: 'Brasas' },
    ] },
    { key: 'density', label: 'Cantidad', type: 'range', min: 0.1, max: 3, step: 0.05, default: 1 },
    { key: 'size', label: 'Tamaño', type: 'range', min: 0.2, max: 4, step: 0.05, default: 1 },
    { key: 'speed', label: 'Velocidad', type: 'range', min: 0, max: 4, step: 0.05, default: 1 },
    { key: 'color', label: 'Color', type: 'color', default: '#ffffff' },
  ] },
  { type: 'oldFilm', name: 'Película antigua', group: 'Tendencias TikTok', icon: '🎞', params: [
    { key: 'amount', label: 'Intensidad', type: 'range', min: 0, max: 1, step: 0.01, default: 0.7 },
    { key: 'scratches', label: 'Rayas', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6 },
    { key: 'dust', label: 'Polvo', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: 'flicker', label: 'Parpadeo', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5 },
  ] },
  { type: 'camcorder', name: 'Videocámara REC', group: 'Tendencias TikTok', icon: '⏺', params: [
    { key: 'label', label: 'Texto', type: 'select', default: 'REC', options: [{ value: 'REC', label: 'REC' }, { value: 'PLAY ▶', label: 'PLAY ▶' }, { value: 'LIVE', label: 'LIVE' }, { value: 'CAM 01', label: 'CAM 01' }] },
    { key: 'date', label: 'Mostrar fecha', type: 'bool', default: true },
    { key: 'timecode', label: 'Mostrar tiempo', type: 'bool', default: true },
    { key: 'look', label: 'Look de cinta', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45 },
  ] },
  // ---------------- Persona (IA): efectos detrás / alrededor del sujeto
  { type: 'aura', name: 'Aura / Contorno de la persona', group: 'Persona (IA)', icon: '🌟', ai: true, params: [
    { key: 'style', label: 'Estilo', type: 'select', default: 'glow', options: [
      { value: 'glow', label: 'Aura neón' }, { value: 'rainbow', label: 'Aura arcoíris' }, { value: 'outline', label: 'Contorno sticker' },
      { value: 'double', label: 'Doble contorno' }, { value: 'fire', label: 'Aura de fuego' },
    ] },
    { key: 'color', label: 'Color', type: 'color', default: '#ff2ad4' },
    { key: 'color2', label: 'Color 2', type: 'color', default: '#00e5ff' },
    { key: 'size', label: 'Tamaño', type: 'range', min: 2, max: 250, step: 1, default: 70 },
    { key: 'intensity', label: 'Intensidad', type: 'range', min: 0, max: 3, step: 0.01, default: 1.3 },
    { key: 'pulse', label: 'Pulso animado', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3 },
    { key: 'background', label: 'Fondo', type: 'select', default: 'keep', options: [
      { value: 'keep', label: 'Mantener fondo' }, { value: 'dark', label: 'Oscurecer fondo' }, { value: 'remove', label: 'Quitar fondo' }, { value: 'bw', label: 'Fondo B&N' },
    ] },
    { key: 'model', label: 'Modelo', type: 'select', default: 'selfie', options: [{ value: 'selfie', label: 'Personas (rápido)' }, { value: 'multiclass', label: 'Personas (preciso)' }, { value: 'deeplab', label: 'Objetos generales' }] },
  ] },
  { type: 'subjectRays', name: 'Rayos de luz detrás', group: 'Persona (IA)', icon: '☀', ai: true, params: [
    { key: 'intensity', label: 'Intensidad', type: 'range', min: 0, max: 3, step: 0.01, default: 1.2 },
    { key: 'length', label: 'Longitud', type: 'range', min: 0.05, max: 0.95, step: 0.01, default: 0.55 },
    { key: 'color', label: 'Color', type: 'color', default: '#ffe2a0' },
    { key: 'spin', label: 'Giro de rayos', type: 'range', min: 0, max: 2, step: 0.01, default: 0.4 },
    { key: 'darken', label: 'Oscurecer fondo', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35 },
    { key: 'model', label: 'Modelo', type: 'select', default: 'selfie', options: [{ value: 'selfie', label: 'Personas (rápido)' }, { value: 'multiclass', label: 'Personas (preciso)' }, { value: 'deeplab', label: 'Objetos generales' }] },
  ] },
  { type: 'echo', name: 'Clones / Estela fantasma', group: 'Persona (IA)', icon: '👥', ai: true, params: [
    { key: 'target', label: 'Aplicar a', type: 'select', default: 'subject', options: [{ value: 'subject', label: 'Persona (IA)' }, { value: 'frame', label: 'Toda la imagen' }] },
    { key: 'mode', label: 'Modo', type: 'select', default: 'trail', options: [{ value: 'trail', label: 'Estela en el tiempo' }, { value: 'clones', label: 'Clones a los lados' }, { value: 'zoom', label: 'Clones en profundidad' }] },
    { key: 'count', label: 'Copias', type: 'range', min: 1, max: 6, step: 1, default: 4 },
    { key: 'spacing', label: 'Separación / retardo', type: 'range', min: 0.02, max: 1, step: 0.01, default: 0.25 },
    { key: 'decay', label: 'Desvanecimiento', type: 'range', min: 0.1, max: 1, step: 0.01, default: 0.6 },
    { key: 'tint', label: 'Tinte', type: 'color', default: '#7c5cff' },
    { key: 'tintAmount', label: 'Cantidad de tinte', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: 'model', label: 'Modelo', type: 'select', default: 'selfie', options: [{ value: 'selfie', label: 'Personas (rápido)' }, { value: 'multiclass', label: 'Personas (preciso)' }, { value: 'deeplab', label: 'Objetos generales' }] },
  ] },
  // ---------------- Belleza y calidad
  { type: 'smoothSkin', name: 'Retoque de piel', group: 'Belleza y calidad', icon: '💄', params: [
    { key: 'amount', label: 'Suavizado', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6 },
    { key: 'radius', label: 'Radio', type: 'range', min: 1, max: 12, step: 0.5, default: 5 },
    { key: 'skinOnly', label: 'Solo piel', type: 'bool', default: true },
    { key: 'glow', label: 'Luminosidad', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25 },
  ] },
  { type: 'enhance', name: 'Mejorar calidad (HD)', group: 'Belleza y calidad', icon: '💎', params: [
    { key: 'upscale', label: 'Reescalado inteligente', type: 'bool', default: true },
    { key: 'sharpen', label: 'Nitidez adaptativa', type: 'range', min: 0, max: 1, step: 0.01, default: 0.55 },
    { key: 'denoise', label: 'Reducir ruido', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35 },
    { key: 'clarity', label: 'Claridad', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3 },
    { key: 'deband', label: 'Quitar bandas / bloques', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3 },
    { key: 'color', label: 'Realce de color', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25 },
  ] },
];

export const EFFECT_MAP = Object.fromEntries(EFFECTS.map((e) => [e.type, e])) as Record<EffectType, EffectDef>;

export function defaultParams(type: EffectType): Record<string, number | string | boolean> {
  const def = EFFECT_MAP[type];
  const out: Record<string, number | string | boolean> = {};
  for (const p of def.params) out[p.key] = p.default;
  return out;
}

// ---------------------------------------------------------------------------
//  Transiciones
// ---------------------------------------------------------------------------
export const TRANSITIONS: { type: TransitionType; name: string; group: string; id: number }[] = [
  { type: 'crossfade', name: 'Disolver', group: 'Básicas', id: 1 },
  { type: 'dipBlack', name: 'Fundido a negro', group: 'Básicas', id: 2 },
  { type: 'dipWhite', name: 'Fundido a blanco', group: 'Básicas', id: 3 },
  { type: 'lumaFade', name: 'Fundido por luminancia', group: 'Básicas', id: 26 },
  { type: 'wipeLeft', name: 'Barrido izquierda', group: 'Barridos', id: 4 },
  { type: 'wipeRight', name: 'Barrido derecha', group: 'Barridos', id: 5 },
  { type: 'wipeUp', name: 'Barrido arriba', group: 'Barridos', id: 6 },
  { type: 'wipeDown', name: 'Barrido abajo', group: 'Barridos', id: 7 },
  { type: 'diagonal', name: 'Barrido diagonal', group: 'Barridos', id: 21 },
  { type: 'barnDoor', name: 'Cortina', group: 'Barridos', id: 20 },
  { type: 'clock', name: 'Reloj', group: 'Barridos', id: 25 },
  { type: 'circle', name: 'Iris abrir', group: 'Formas', id: 15 },
  { type: 'circleOut', name: 'Iris cerrar', group: 'Formas', id: 16 },
  { type: 'heart', name: 'Corazón', group: 'Formas', id: 24 },
  { type: 'slideLeft', name: 'Deslizar izquierda', group: 'Movimiento', id: 8 },
  { type: 'slideRight', name: 'Deslizar derecha', group: 'Movimiento', id: 9 },
  { type: 'slideUp', name: 'Deslizar arriba', group: 'Movimiento', id: 10 },
  { type: 'slideDown', name: 'Deslizar abajo', group: 'Movimiento', id: 11 },
  { type: 'pushLeft', name: 'Empujar izquierda', group: 'Movimiento', id: 12 },
  { type: 'pushRight', name: 'Empujar derecha', group: 'Movimiento', id: 13 },
  { type: 'zoomIn', name: 'Zoom acercar', group: 'Movimiento', id: 14 },
  { type: 'zoomOut', name: 'Zoom alejar', group: 'Movimiento', id: 27 },
  { type: 'spin', name: 'Giro', group: 'Movimiento', id: 17 },
  { type: 'blur', name: 'Desenfoque', group: 'Efectos', id: 18 },
  { type: 'glitch', name: 'Glitch', group: 'Efectos', id: 19 },
  { type: 'pixelate', name: 'Pixelado', group: 'Efectos', id: 22 },
  { type: 'flash', name: 'Destello', group: 'Efectos', id: 23 },
  { type: 'swirl', name: 'Remolino', group: 'Efectos', id: 28 },
  { type: 'ripple', name: 'Ondas', group: 'Efectos', id: 29 },
  { type: 'rgbShift', name: 'Separación RGB', group: 'Efectos', id: 30 },
  { type: 'filmBurn', name: 'Quemado de película', group: 'Efectos', id: 31 },
  { type: 'whipLeft', name: 'Whip pan izquierda', group: 'TikTok', id: 32 },
  { type: 'whipRight', name: 'Whip pan derecha', group: 'TikTok', id: 33 },
  { type: 'whipUp', name: 'Whip pan arriba', group: 'TikTok', id: 39 },
  { type: 'whipDown', name: 'Whip pan abajo', group: 'TikTok', id: 40 },
  { type: 'zoomBlurIn', name: 'Zoom con desenfoque', group: 'TikTok', id: 34 },
  { type: 'shake', name: 'Sacudida', group: 'TikTok', id: 35 },
  { type: 'lightLeak', name: 'Fuga de luz', group: 'TikTok', id: 36 },
  { type: 'spinZoom', name: 'Giro + zoom', group: 'TikTok', id: 37 },
  { type: 'squeeze', name: 'Comprimir', group: 'TikTok', id: 38 },
];
export const TRANSITION_ID: Record<string, number> = Object.fromEntries(TRANSITIONS.map((t) => [t.type, t.id]));

// ---------------------------------------------------------------------------
//  Animaciones
// ---------------------------------------------------------------------------
export const ANIMATIONS_IN: { type: AnimationType; name: string; textOnly?: boolean }[] = [
  { type: 'none', name: 'Ninguna' },
  { type: 'fade', name: 'Aparecer' },
  { type: 'zoomIn', name: 'Zoom entrada' },
  { type: 'zoomOut', name: 'Zoom desde grande' },
  { type: 'slideLeft', name: 'Desde la derecha' },
  { type: 'slideRight', name: 'Desde la izquierda' },
  { type: 'slideUp', name: 'Desde abajo' },
  { type: 'slideDown', name: 'Desde arriba' },
  { type: 'pop', name: 'Pop' },
  { type: 'bounce', name: 'Rebote' },
  { type: 'elastic', name: 'Elástico' },
  { type: 'rotate', name: 'Rotar' },
  { type: 'flip', name: 'Voltear' },
  { type: 'swing', name: 'Columpio' },
  { type: 'drop', name: 'Caer' },
  { type: 'stretch', name: 'Estirar' },
  { type: 'blur', name: 'Desenfoque' },
  { type: 'glitch', name: 'Glitch' },
  { type: 'typewriter', name: 'Máquina de escribir', textOnly: true },
  { type: 'wordReveal', name: 'Palabra por palabra', textOnly: true },
  { type: 'letterFade', name: 'Letras en cascada', textOnly: true },
];

export const ANIMATIONS_LOOP: { type: LoopAnimationType; name: string }[] = [
  { type: 'none', name: 'Ninguna' },
  { type: 'pulse', name: 'Pulso' },
  { type: 'heartbeat', name: 'Latido' },
  { type: 'float', name: 'Flotar' },
  { type: 'sway', name: 'Balanceo' },
  { type: 'shake', name: 'Temblor' },
  { type: 'wiggle', name: 'Vibrar' },
  { type: 'spin', name: 'Girar' },
  { type: 'flicker', name: 'Parpadeo' },
  { type: 'kenBurnsIn', name: 'Ken Burns (acercar)' },
  { type: 'kenBurnsOut', name: 'Ken Burns (alejar)' },
  { type: 'panLeft', name: 'Paneo izquierda' },
  { type: 'panRight', name: 'Paneo derecha' },
];

// ---------------------------------------------------------------------------
//  Modos de fusión
// ---------------------------------------------------------------------------
export const BLEND_MODES: { value: BlendMode; label: string; id: number }[] = [
  { value: 'normal', label: 'Normal', id: 0 },
  { value: 'multiply', label: 'Multiplicar', id: 1 },
  { value: 'screen', label: 'Trama', id: 2 },
  { value: 'overlay', label: 'Superponer', id: 3 },
  { value: 'darken', label: 'Oscurecer', id: 4 },
  { value: 'lighten', label: 'Aclarar', id: 5 },
  { value: 'color-dodge', label: 'Sobreexponer color', id: 6 },
  { value: 'color-burn', label: 'Subexponer color', id: 7 },
  { value: 'hard-light', label: 'Luz fuerte', id: 8 },
  { value: 'soft-light', label: 'Luz suave', id: 9 },
  { value: 'difference', label: 'Diferencia', id: 10 },
  { value: 'exclusion', label: 'Exclusión', id: 11 },
  { value: 'add', label: 'Sumar', id: 12 },
  { value: 'subtract', label: 'Restar', id: 13 },
  { value: 'hue', label: 'Tono', id: 14 },
  { value: 'saturation', label: 'Saturación', id: 15 },
  { value: 'color', label: 'Color', id: 16 },
  { value: 'luminosity', label: 'Luminosidad', id: 17 },
];
export const BLEND_ID: Record<string, number> = Object.fromEntries(BLEND_MODES.map((b) => [b.value, b.id]));

// ---------------------------------------------------------------------------
//  Estilos de texto (diseños)
// ---------------------------------------------------------------------------
export interface TextPreset { id: string; name: string; group: string; text: string; data: Partial<TextData>; anim?: AnimationType; loop?: LoopAnimationType }

export const TEXT_PRESETS: TextPreset[] = [
  { id: 'title', name: 'Título', group: 'Básicos', text: 'TÍTULO PRINCIPAL', data: { font: 'Montserrat', weight: 900, size: 140, uppercase: true } , anim: 'zoomIn' },
  { id: 'subtitle', name: 'Subtítulo', group: 'Básicos', text: 'Subtítulo elegante', data: { font: 'Poppins', weight: 500, size: 72, shadow: { enabled: true, color: 'rgba(0,0,0,.5)', blur: 10, x: 0, y: 3 } }, anim: 'fade' },
  { id: 'body', name: 'Párrafo', group: 'Básicos', text: 'Escribe aquí un texto descriptivo\nde varias líneas.', data: { font: 'Inter', weight: 400, size: 54, lineHeight: 1.35 }, anim: 'fade' },
  { id: 'serif', name: 'Editorial', group: 'Básicos', text: 'Una historia', data: { font: 'Playfair Display', weight: 700, italic: true, size: 120 }, anim: 'fade' },
  { id: 'outline', name: 'Contorno', group: 'Estilos', text: 'CONTORNO', data: { font: 'Anton', weight: 400, size: 180, color: 'rgba(0,0,0,0)', stroke: { enabled: true, color: '#ffffff', width: 5 }, shadow: { enabled: false, color: '#000', blur: 0, x: 0, y: 0 }, letterSpacing: 8 }, anim: 'slideUp' },
  { id: 'neon', name: 'Neón', group: 'Estilos', text: 'NEÓN', data: { font: 'Monoton', weight: 400, size: 160, color: '#ffe9ff', glow: { enabled: true, color: '#ff2ad4', size: 32 }, shadow: { enabled: false, color: '#000', blur: 0, x: 0, y: 0 } }, loop: 'flicker' },
  { id: 'gradient', name: 'Degradado', group: 'Estilos', text: 'Degradado', data: { font: 'Poppins', weight: 900, size: 150, gradient: { enabled: true, from: '#7c5cff', to: '#00d4ff', angle: 90 } }, anim: 'pop' },
  { id: 'sunset-grad', name: 'Atardecer', group: 'Estilos', text: 'VERANO', data: { font: 'Bebas Neue', weight: 400, size: 220, letterSpacing: 10, gradient: { enabled: true, from: '#ff7a18', to: '#af002d', angle: 0 } }, anim: 'zoomOut' },
  { id: 'impact', name: 'Impacto', group: 'Estilos', text: '¡WOW!', data: { font: 'Bangers', weight: 400, size: 200, color: '#ffd400', stroke: { enabled: true, color: '#000000', width: 12 }, shadow: { enabled: true, color: '#000000', blur: 0, x: 8, y: 8 } }, anim: 'bounce' },
  { id: 'comic', name: 'Cómic', group: 'Estilos', text: '¡BOOM!', data: { font: 'Luckiest Guy', weight: 400, size: 170, color: '#ff3b3b', stroke: { enabled: true, color: '#ffffff', width: 10 }, shadow: { enabled: true, color: '#000', blur: 0, x: 10, y: 10 } }, anim: 'elastic', loop: 'wiggle' },
  { id: 'glitch-txt', name: 'Glitch', group: 'Estilos', text: 'GLITCH', data: { font: 'Rubik Glitch', weight: 400, size: 160, color: '#ffffff', shadow: { enabled: true, color: '#00e5ff', blur: 0, x: -6, y: 0 }, glow: { enabled: true, color: '#ff004c', size: 6 } }, anim: 'glitch' },
  { id: 'retro', name: 'Retro 80s', group: 'Estilos', text: 'RETRO', data: { font: 'Press Start 2P', weight: 400, size: 90, color: '#fffb00', shadow: { enabled: true, color: '#ff00c8', blur: 0, x: 6, y: 6 } }, anim: 'typewriter' },
  { id: 'handwritten', name: 'Manuscrito', group: 'Estilos', text: 'con cariño', data: { font: 'Pacifico', weight: 400, size: 120, color: '#ffffff' }, anim: 'letterFade' },
  { id: 'signature', name: 'Firma', group: 'Estilos', text: 'Carlos', data: { font: 'Great Vibes', weight: 400, size: 160 }, anim: 'fade' },
  { id: 'chrome', name: 'Metálico', group: 'Estilos', text: 'METAL', data: { font: 'Russo One', weight: 400, size: 170, gradient: { enabled: true, from: '#f5f5f5', to: '#6b6b6b', angle: 180 }, stroke: { enabled: true, color: '#1a1a1a', width: 4 } }, anim: 'stretch' },
  { id: 'box', name: 'Etiqueta', group: 'Diseños', text: 'NUEVO', data: { font: 'Montserrat', weight: 800, size: 64, color: '#0d0f14', shadow: { enabled: false, color: '#000', blur: 0, x: 0, y: 0 }, background: { enabled: true, color: '#ffd400', padding: 20, radius: 10, opacity: 1, mode: 'block' }, letterSpacing: 4 }, anim: 'pop' },
  { id: 'lower-third', name: 'Rótulo (lower third)', group: 'Diseños', text: 'Carlos Bardales\nDirector creativo', data: { font: 'Inter', weight: 700, size: 52, align: 'left', shadow: { enabled: false, color: '#000', blur: 0, x: 0, y: 0 }, background: { enabled: true, color: '#7c5cff', padding: 22, radius: 6, opacity: 0.92, mode: 'line' } }, anim: 'slideRight' },
  { id: 'quote', name: 'Cita', group: 'Diseños', text: '“La creatividad es\ninteligencia divirtiéndose.”', data: { font: 'Lora', weight: 500, italic: true, size: 70, lineHeight: 1.3 }, anim: 'wordReveal' },
  { id: 'cine-title', name: 'Título de cine', group: 'Diseños', text: 'U N A   P E L Í C U L A', data: { font: 'Cinzel', weight: 600, size: 80, letterSpacing: 12, shadow: { enabled: true, color: 'rgba(0,0,0,.8)', blur: 30, x: 0, y: 0 } }, anim: 'blur' },
  { id: 'subscribe', name: 'Suscríbete', group: 'Diseños', text: '▶ SUSCRÍBETE', data: { font: 'Roboto', weight: 900, size: 64, color: '#ffffff', background: { enabled: true, color: '#ff0033', padding: 24, radius: 14, opacity: 1, mode: 'block' }, shadow: { enabled: true, color: 'rgba(0,0,0,.4)', blur: 14, x: 0, y: 6 } }, anim: 'pop', loop: 'pulse' },
  { id: 'news', name: 'Noticias', group: 'Diseños', text: 'ÚLTIMA HORA', data: { font: 'Oswald', weight: 700, size: 72, color: '#ffffff', background: { enabled: true, color: '#c8102e', padding: 18, radius: 0, opacity: 1, mode: 'block' }, letterSpacing: 3 }, anim: 'slideRight' },
  { id: 'minimal', name: 'Minimalista', group: 'Diseños', text: 'minimal', data: { font: 'Raleway', weight: 200, size: 110, letterSpacing: 20, shadow: { enabled: false, color: '#000', blur: 0, x: 0, y: 0 } }, anim: 'fade' },
  { id: 'social-caption', name: 'Leyenda social', group: 'Diseños', text: 'Esto cambió todo 🤯', data: { font: 'Poppins', weight: 800, size: 74, color: '#000000', background: { enabled: true, color: '#ffffff', padding: 18, radius: 18, opacity: 1, mode: 'line' }, shadow: { enabled: false, color: '#000', blur: 0, x: 0, y: 0 } }, anim: 'pop' },
  { id: 'countdown', name: 'Número grande', group: 'Diseños', text: '3', data: { font: 'Archivo Black', weight: 400, size: 400, color: '#ffffff', stroke: { enabled: true, color: '#7c5cff', width: 14 } }, anim: 'zoomOut' },
];

// ---------------------------------------------------------------------------
//  Estilos de subtítulos automáticos
// ---------------------------------------------------------------------------
export interface CaptionStyle { id: string; name: string; wordsPerCaption: number; data: Partial<TextData>; positionY: number; anim?: AnimationType }

export const CAPTION_STYLES: CaptionStyle[] = [
  { id: 'classic', name: 'Clásico', wordsPerCaption: 7, positionY: 0.38, data: { font: 'Inter', weight: 700, size: 56, color: '#ffffff', stroke: { enabled: true, color: '#000000', width: 6 }, shadow: { enabled: true, color: 'rgba(0,0,0,.6)', blur: 6, x: 0, y: 2 }, captionMode: 'none', background: { enabled: false, color: '#000', padding: 12, radius: 8, opacity: 0.7, mode: 'line' } } },
  { id: 'boxed', name: 'Caja negra', wordsPerCaption: 7, positionY: 0.38, data: { font: 'Roboto', weight: 500, size: 52, color: '#ffffff', stroke: { enabled: false, color: '#000', width: 0 }, shadow: { enabled: false, color: '#000', blur: 0, x: 0, y: 0 }, background: { enabled: true, color: '#000000', padding: 14, radius: 6, opacity: 0.75, mode: 'line' }, captionMode: 'none' } },
  { id: 'karaoke', name: 'Karaoke', wordsPerCaption: 5, positionY: 0.3, data: { font: 'Montserrat', weight: 900, size: 72, uppercase: true, color: '#ffffff', highlightColor: '#ffd400', stroke: { enabled: true, color: '#000000', width: 8 }, shadow: { enabled: true, color: 'rgba(0,0,0,.5)', blur: 10, x: 0, y: 4 }, captionMode: 'karaoke' } },
  { id: 'hormozi', name: 'Viral amarillo', wordsPerCaption: 3, positionY: 0.2, data: { font: 'Montserrat', weight: 900, size: 92, uppercase: true, color: '#ffffff', highlightColor: '#ffe600', stroke: { enabled: true, color: '#000000', width: 10 }, shadow: { enabled: true, color: '#000', blur: 0, x: 0, y: 6 }, captionMode: 'bounceWord' } },
  { id: 'highlight-box', name: 'Resaltado en caja', wordsPerCaption: 4, positionY: 0.25, data: { font: 'Poppins', weight: 800, size: 80, color: '#ffffff', highlightBg: '#7c5cff', stroke: { enabled: false, color: '#000', width: 0 }, shadow: { enabled: true, color: 'rgba(0,0,0,.6)', blur: 12, x: 0, y: 4 }, captionMode: 'highlightBox' } },
  { id: 'word', name: 'Una palabra', wordsPerCaption: 1, positionY: 0.0, data: { font: 'Anton', weight: 400, size: 150, uppercase: true, color: '#ffffff', stroke: { enabled: true, color: '#000000', width: 10 }, captionMode: 'singleWord' }, anim: 'pop' },
  { id: 'word-by-word', name: 'Palabra a palabra', wordsPerCaption: 6, positionY: 0.3, data: { font: 'Poppins', weight: 700, size: 70, color: '#ffffff', stroke: { enabled: true, color: '#000', width: 6 }, captionMode: 'wordByWord' } },
  { id: 'neon-cap', name: 'Neón', wordsPerCaption: 4, positionY: 0.3, data: { font: 'Montserrat', weight: 800, size: 74, color: '#ffffff', highlightColor: '#00f0ff', glow: { enabled: true, color: '#00f0ff', size: 18 }, captionMode: 'karaoke', stroke: { enabled: false, color: '#000', width: 0 } } },
  { id: 'minimal-cap', name: 'Minimal', wordsPerCaption: 8, positionY: 0.4, data: { font: 'Inter', weight: 500, size: 46, color: '#ffffff', shadow: { enabled: true, color: 'rgba(0,0,0,.8)', blur: 8, x: 0, y: 1 }, stroke: { enabled: false, color: '#000', width: 0 }, captionMode: 'none' } },
  { id: 'bubble', name: 'Burbuja', wordsPerCaption: 5, positionY: 0.3, data: { font: 'Nunito', weight: 900, size: 66, color: '#111111', background: { enabled: true, color: '#ffffff', padding: 18, radius: 30, opacity: 1, mode: 'line' }, highlightColor: '#ff3b6b', captionMode: 'karaoke', stroke: { enabled: false, color: '#000', width: 0 }, shadow: { enabled: false, color: '#000', blur: 0, x: 0, y: 0 } } },
];

export const EMOJI_STICKERS = ['😀','😂','🤣','😍','🥰','😎','🤩','🥳','😱','🤯','😭','😡','👍','👏','🙌','🔥','✨','💯','❤️','💜','💙','💚','💛','🧡','🖤','⭐','🌟','⚡','💥','💣','🎉','🎊','🎬','🎥','📸','🎵','🎶','🎤','🎧','🚀','🌈','☀️','🌙','❄️','🌊','🌸','🍕','🍔','☕','🏆','🥇','💰','💎','👑','🎯','✅','❌','⚠️','❓','❗','👉','👈','👆','👇','🫶','🙏','💪','👀','🤔','🤫','🤝','📍','🔔','💡','📈','📉','🕐','🎁','🛒'];
