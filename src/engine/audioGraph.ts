import type { Clip, Project, Track } from '../types';
import { evalKeyframes } from '../core/keyframes';
import { clamp } from '../core/utils';

export interface ChainNodes {
  input: AudioNode;
  gain: GainNode;
  pan: StereoPannerNode;
  low: BiquadFilterNode;
  mid: BiquadFilterNode;
  high: BiquadFilterNode;
  hp: BiquadFilterNode;
  presence: BiquadFilterNode;
  comp: DynamicsCompressorNode;
  output: AudioNode;
}

/** Construye la cadena de audio de un clip: EQ 3 bandas, limpieza de voz, compresor, paneo y ganancia. */
export function buildChain(ctx: BaseAudioContext, input: AudioNode, dest: AudioNode): ChainNodes {
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 10;
  const low = ctx.createBiquadFilter(); low.type = 'lowshelf'; low.frequency.value = 200;
  const mid = ctx.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 1000; mid.Q.value = 0.9;
  const high = ctx.createBiquadFilter(); high.type = 'highshelf'; high.frequency.value = 4500;
  const presence = ctx.createBiquadFilter(); presence.type = 'peaking'; presence.frequency.value = 3200; presence.Q.value = 1; presence.gain.value = 0;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = 0; comp.ratio.value = 1; comp.knee.value = 10; comp.attack.value = 0.005; comp.release.value = 0.2;
  const pan = ctx.createStereoPanner();
  const gain = ctx.createGain();
  input.connect(hp).connect(low).connect(mid).connect(high).connect(presence).connect(comp).connect(pan).connect(gain).connect(dest);
  return { input, gain, pan, low, mid, high, hp, presence, comp, output: gain };
}

export function applyChainSettings(n: ChainNodes, clip: Clip) {
  const a = clip.audio;
  n.low.gain.value = a.eqLow;
  n.mid.gain.value = a.eqMid;
  n.high.gain.value = a.eqHigh;
  const clean = a.denoise || a.voiceEnhance;
  n.hp.frequency.value = clean ? (a.voiceEnhance ? 85 : 100) : 10;
  n.presence.gain.value = a.voiceEnhance ? 4 : 0;
  n.comp.threshold.value = a.voiceEnhance ? -22 : a.denoise ? -12 : 0;
  n.comp.ratio.value = a.voiceEnhance ? 4 : a.denoise ? 2 : 1;
  n.pan.pan.value = clamp(a.pan, -1, 1);
}

/** Ganancia efectiva del clip en el tiempo local (volumen con keyframes, fundidos y silencio). */
export function clipGainAt(clip: Clip, localT: number, track?: Track): number {
  if (clip.audio.muted || track?.muted) return 0;
  let g = evalKeyframes(clip.keyframes.volume, localT, clip.audio.volume);
  if (clip.audio.fadeIn > 0 && localT < clip.audio.fadeIn) g *= clamp(localT / clip.audio.fadeIn, 0, 1);
  const rem = clip.duration - localT;
  if (clip.audio.fadeOut > 0 && rem < clip.audio.fadeOut) g *= clamp(rem / clip.audio.fadeOut, 0, 1);
  return Math.max(0, g);
}

/** ¿El clip produce audio? */
export function clipHasAudio(clip: Clip, project: Project, hasAudio: (assetId: string) => boolean): boolean {
  if (clip.type === 'audio') return true;
  if (clip.type !== 'video' || clip.audioDetached) return false;
  return !!clip.assetId && hasAudio(clip.assetId);
}
