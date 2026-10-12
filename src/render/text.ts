import type { ShapeData, TextData } from '../types';
import { clamp } from '../core/utils';

export interface Raster { canvas: HTMLCanvasElement | OffscreenCanvas; w: number; h: number; version: number }

let version = 1;
const makeCanvas = (w: number, h: number): HTMLCanvasElement | OffscreenCanvas => {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(Math.max(1, w), Math.max(1, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, w); c.height = Math.max(1, h);
  return c;
};

const measureCtx = (makeCanvas(8, 8).getContext('2d') as CanvasRenderingContext2D);

export interface TextRenderOpts {
  localT: number;
  reveal: number | null;
  revealOut: number | null;
  revealMode: string;
  revealOutMode: string;
  scale: number;
}

function fontString(td: TextData, size: number) {
  return `${td.italic ? 'italic ' : ''}${td.weight} ${size}px "${td.font}", "Inter", system-ui, sans-serif`;
}

interface Glyph { text: string; x: number; w: number; wordIndex: number }
interface Line { glyphs: Glyph[]; width: number }

function rgbaWithOpacity(color: string, opacity: number) {
  if (opacity >= 1) return color;
  if (color.startsWith('#')) {
    let h = color.slice(1);
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h.slice(0, 6), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${opacity})`;
  }
  return color;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** ¿El render del texto depende del tiempo? (para invalidar la caché) */
export function textIsAnimated(td: TextData, opts: Pick<TextRenderOpts, 'reveal' | 'revealOut'>) {
  return (td.captionMode !== 'none' && !!td.words?.length) || opts.reveal !== null || opts.revealOut !== null;
}

export function rasterizeText(td: TextData, opts: TextRenderOpts): Raster {
  const S = clamp(opts.scale, 0.2, 4);
  const size = td.size * S;
  const ctx = measureCtx;
  ctx.font = fontString(td, size);
  (ctx as any).letterSpacing = `${td.letterSpacing * S}px`;
  const spaceW = ctx.measureText(' ').width;
  const lh = size * td.lineHeight;

  // Tokens: palabras con índice (para subtítulos con tiempos)
  const hasWords = td.captionMode !== 'none' && td.words && td.words.length > 0;
  const content = td.uppercase ? td.content.toUpperCase() : td.content;
  const paragraphs: { text: string; wordIndex: number }[][] = [];
  if (hasWords) {
    paragraphs.push(td.words!.map((w, i) => ({ text: td.uppercase ? w.text.trim().toUpperCase() : w.text.trim(), wordIndex: i })));
  } else {
    let wi = 0;
    for (const para of content.split('\n')) paragraphs.push(para.split(/ +/).filter((x, i, arr) => x.length || arr.length === 1).map((w) => ({ text: w, wordIndex: wi++ })));
  }
  const totalWords = paragraphs.reduce((a, p) => a + p.length, 0);

  // Ajuste de línea
  const maxW = td.boxWidth > 0 ? td.boxWidth * S : Infinity;
  const lines: Line[] = [];
  for (const para of paragraphs) {
    let line: Line = { glyphs: [], width: 0 };
    for (const tok of para) {
      const w = ctx.measureText(tok.text).width;
      const add = line.glyphs.length ? spaceW + w : w;
      if (line.glyphs.length && line.width + add > maxW) {
        lines.push(line);
        line = { glyphs: [], width: 0 };
      }
      const x = line.glyphs.length ? line.width + spaceW : 0;
      line.glyphs.push({ text: tok.text, x, w, wordIndex: tok.wordIndex });
      line.width = x + w;
    }
    lines.push(line);
  }

  // Modo una sola palabra: mostrar solo la palabra activa
  let activeWord = -1;
  if (hasWords) {
    const t = opts.localT;
    const words = td.words!;
    for (let i = 0; i < words.length; i++) if (t >= words[i].start - 0.02) activeWord = i;
    if (activeWord >= 0 && t > words[activeWord].end + 0.4 && td.captionMode !== 'wordByWord' && td.captionMode !== 'singleWord') activeWord = -1;
  }
  let drawLines = lines;
  if (hasWords && td.captionMode === 'singleWord') {
    const idx = Math.max(0, activeWord);
    const g = lines.flatMap((l) => l.glyphs).find((g) => g.wordIndex === idx);
    drawLines = g ? [{ glyphs: [{ ...g, x: 0 }], width: g.w }] : [];
  }

  const textW = Math.max(1, ...drawLines.map((l) => l.width));
  const textH = Math.max(lh, drawLines.length * lh);
  const bgPad = td.background.enabled ? td.background.padding * S : 0;
  const strokeW = td.stroke.enabled ? td.stroke.width * S : 0;
  const shadowExt = td.shadow.enabled ? (td.shadow.blur * S + Math.max(Math.abs(td.shadow.x), Math.abs(td.shadow.y)) * S) : 0;
  const glowExt = td.glow.enabled ? td.glow.size * S * 1.5 : 0;
  const bounceExt = td.captionMode === 'bounceWord' || td.captionMode === 'highlightBox' ? size * 0.25 : 0;
  const pad = Math.ceil(Math.max(bgPad + 4 * S, strokeW + shadowExt, glowExt, bounceExt) + 6 * S);
  const cw = Math.ceil(textW + pad * 2);
  const chh = Math.ceil(textH + pad * 2);
  const canvas = makeCanvas(cw, chh);
  const c = canvas.getContext('2d') as CanvasRenderingContext2D;
  c.font = fontString(td, size);
  (c as any).letterSpacing = `${td.letterSpacing * S}px`;
  c.textBaseline = 'alphabetic';
  c.lineJoin = 'round';
  c.miterLimit = 2;
  const ascent = size * 0.8;
  const lineX = (l: Line) => (td.align === 'left' ? pad : td.align === 'right' ? cw - pad - l.width : (cw - l.width) / 2);

  // Fondo
  if (td.background.enabled && drawLines.length) {
    c.fillStyle = rgbaWithOpacity(td.background.color, td.background.opacity);
    const r = td.background.radius * S;
    if (td.background.mode === 'block') {
      const lx = Math.min(...drawLines.map(lineX));
      roundRect(c, lx - bgPad, pad - bgPad + (lh - size) * 0.15, textW + bgPad * 2 - (td.align === 'center' ? 0 : 0), textH + bgPad * 2 - (lh - size) * 0.3, r);
      c.fill();
    } else {
      drawLines.forEach((l, i) => {
        if (!l.glyphs.length) return;
        const x = lineX(l);
        const y = pad + i * lh + (lh - size) * 0.5;
        roundRect(c, x - bgPad, y - bgPad * 0.55, l.width + bgPad * 2, size + bgPad * 1.1, r);
        c.fill();
      });
    }
  }

  // Revelado (máquina de escribir, etc.)
  const totalChars = lines.reduce((a, l) => a + l.glyphs.reduce((b, g) => b + g.text.length + 1, 0), 0);
  const revealAlpha = (wordIndex: number, charIndex: number): number => {
    let a = 1;
    const calc = (p: number | null, mode: string, out: boolean) => {
      if (p === null) return 1;
      if (mode === 'typewriter') return charIndex < Math.floor(p * totalChars) ? 1 : 0;
      if (mode === 'wordReveal') {
        const k = p * (totalWords + 0.5) - wordIndex;
        return clamp(k * 2, 0, 1);
      }
      if (mode === 'letterFade') { const k = p * (totalChars + 8) - charIndex; return clamp(k / 8, 0, 1); }
      return out ? p : p;
    };
    a *= calc(opts.reveal, opts.revealMode, false);
    a *= calc(opts.revealOut, opts.revealOutMode, true);
    return a;
  };

  // Relleno (color o degradado)
  let fill: string | CanvasGradient = td.color;
  if (td.gradient.enabled) {
    const ang = (td.gradient.angle * Math.PI) / 180;
    const dx = Math.cos(ang) * cw / 2, dy = Math.sin(ang) * chh / 2;
    const g = c.createLinearGradient(cw / 2 - dx, chh / 2 - dy, cw / 2 + dx, chh / 2 + dy);
    g.addColorStop(0, td.gradient.from);
    g.addColorStop(1, td.gradient.to);
    fill = g;
  }

  const perChar = opts.reveal !== null && (opts.revealMode === 'typewriter' || opts.revealMode === 'letterFade')
    || opts.revealOut !== null && (opts.revealOutMode === 'typewriter' || opts.revealOutMode === 'letterFade');

  type DrawItem = { text: string; x: number; y: number; alpha: number; color: string | CanvasGradient; scale: number; box?: string; w: number };
  const items: DrawItem[] = [];
  let charCounter = 0;
  drawLines.forEach((l, li) => {
    const baseX = lineX(l);
    const y = pad + li * lh + (lh - size) / 2 + ascent;
    for (const g of l.glyphs) {
      let color: string | CanvasGradient = fill;
      let scale = 1;
      let alpha = 1;
      let box: string | undefined;
      if (hasWords) {
        const wd = td.words![g.wordIndex];
        const active = g.wordIndex === activeWord;
        switch (td.captionMode) {
          case 'karaoke': if (active) color = td.highlightColor; break;
          case 'wordByWord': if (opts.localT < wd.start - 0.02) alpha = 0; else if (active) color = td.highlightColor !== td.color ? td.highlightColor : color; break;
          case 'highlightBox': if (active) box = td.highlightBg; break;
          case 'bounceWord': {
            if (active) {
              color = td.highlightColor;
              const k = clamp((opts.localT - wd.start) / 0.12, 0, 1);
              scale = 1 + 0.18 * Math.sin(k * Math.PI) + 0.06 * k;
            }
            break;
          }
          case 'singleWord': {
            const k = clamp((opts.localT - wd.start) / 0.1, 0, 1);
            scale = 0.7 + 0.3 * (1 - Math.pow(1 - k, 3));
            break;
          }
        }
      }
      if (perChar) {
        for (let ci = 0; ci < g.text.length; ci++) {
          const pre = c.measureText(g.text.slice(0, ci)).width;
          const ch = g.text[ci];
          items.push({ text: ch, x: baseX + g.x + pre, y, alpha: alpha * revealAlpha(g.wordIndex, charCounter), color, scale: 1, w: c.measureText(ch).width });
          charCounter++;
        }
        charCounter++;
      } else {
        items.push({ text: g.text, x: baseX + g.x, y, alpha: alpha * revealAlpha(g.wordIndex, charCounter), color, scale, box, w: g.w });
        charCounter += g.text.length + 1;
      }
    }
  });

  const drawItem = (it: DrawItem, pass: 'shadow' | 'glow' | 'stroke' | 'fill') => {
    if (it.alpha <= 0.001) return;
    c.save();
    c.globalAlpha = it.alpha;
    if (it.scale !== 1) {
      const cx = it.x + it.w / 2, cy = it.y - size * 0.35;
      c.translate(cx, cy); c.scale(it.scale, it.scale); c.translate(-cx, -cy);
    }
    if (pass === 'shadow') {
      c.shadowColor = td.shadow.color;
      c.shadowBlur = td.shadow.blur * S;
      c.shadowOffsetX = td.shadow.x * S;
      c.shadowOffsetY = td.shadow.y * S;
      c.fillStyle = td.shadow.color;
      if (strokeW > 0) { c.lineWidth = strokeW * 2; c.strokeStyle = td.shadow.color; c.strokeText(it.text, it.x, it.y); }
      c.fillText(it.text, it.x, it.y);
    } else if (pass === 'glow') {
      c.shadowColor = td.glow.color;
      c.shadowBlur = td.glow.size * S;
      c.fillStyle = td.glow.color;
      c.fillText(it.text, it.x, it.y);
      c.shadowBlur = td.glow.size * S * 0.4;
      c.fillText(it.text, it.x, it.y);
    } else if (pass === 'stroke') {
      c.lineWidth = strokeW * 2;
      c.strokeStyle = td.stroke.color;
      c.strokeText(it.text, it.x, it.y);
    } else {
      if (it.box) {
        c.fillStyle = it.box;
        roundRect(c, it.x - size * 0.12, it.y - ascent - size * 0.08, it.w + size * 0.24, size * 1.16, size * 0.18);
        c.fill();
      }
      c.fillStyle = it.color;
      c.fillText(it.text, it.x, it.y);
      if (td.underline) {
        c.fillRect(it.x, it.y + size * 0.1, it.w + spaceW * 0.5, Math.max(1, size * 0.06));
      }
    }
    c.restore();
  };

  if (td.shadow.enabled) {
    // la sombra se dibuja desplazada fuera del lienzo para no duplicar el relleno
    for (const it of items) drawItem(it, 'shadow');
    // limpiar el relleno de la sombra para que solo quede la sombra difusa: se cubre con el relleno principal
  }
  if (td.glow.enabled) for (const it of items) drawItem(it, 'glow');
  if (strokeW > 0) for (const it of items) drawItem(it, 'stroke');
  for (const it of items) drawItem(it, 'fill');

  return { canvas, w: cw / S, h: chh / S, version: version++ };
}

// ---------------------------------------------------------------------------
//  Formas vectoriales
// ---------------------------------------------------------------------------
export function rasterizeShape(sd: ShapeData, scaleIn: number): Raster {
  const S = clamp(scaleIn, 0.2, 4);
  const sw = sd.strokeWidth * S;
  const pad = Math.ceil(sw + 4);
  const w = Math.max(2, sd.width * S), h = Math.max(2, sd.height * S);
  const canvas = makeCanvas(Math.ceil(w + pad * 2), Math.ceil(h + pad * 2));
  const c = canvas.getContext('2d') as CanvasRenderingContext2D;
  c.translate(pad, pad);
  c.lineJoin = 'round';
  const path = new Path2D();
  const cx = w / 2, cy = h / 2;
  switch (sd.kind) {
    case 'rect': path.rect(0, 0, w, h); break;
    case 'roundRect': {
      const r = Math.min(sd.radius * S, w / 2, h / 2);
      path.moveTo(r, 0); path.arcTo(w, 0, w, h, r); path.arcTo(w, h, 0, h, r); path.arcTo(0, h, 0, 0, r); path.arcTo(0, 0, w, 0, r); path.closePath();
      break;
    }
    case 'circle': path.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2); break;
    case 'ring': path.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2); path.ellipse(cx, cy, w * 0.32, h * 0.32, 0, 0, Math.PI * 2, true); break;
    case 'triangle': path.moveTo(cx, 0); path.lineTo(w, h); path.lineTo(0, h); path.closePath(); break;
    case 'line': path.rect(0, 0, w, h); break;
    case 'cross': {
      const t = Math.min(w, h) * 0.28;
      path.rect(cx - t / 2, 0, t, h); path.rect(0, cy - t / 2, w, t);
      break;
    }
    case 'star': case 'polygon': {
      const n = sd.kind === 'star' ? sd.sides : Math.max(3, sd.sides);
      const pts = sd.kind === 'star' ? n * 2 : n;
      for (let i = 0; i < pts; i++) {
        const a = -Math.PI / 2 + (i * Math.PI * 2) / pts;
        const rr = sd.kind === 'star' && i % 2 ? 0.45 : 1;
        const x = cx + Math.cos(a) * (w / 2) * rr, y = cy + Math.sin(a) * (h / 2) * rr;
        i ? path.lineTo(x, y) : path.moveTo(x, y);
      }
      path.closePath();
      break;
    }
    case 'heart': {
      path.moveTo(cx, h * 0.3);
      path.bezierCurveTo(cx, h * 0.05, 0, h * 0.0, 0, h * 0.32);
      path.bezierCurveTo(0, h * 0.6, cx * 0.8, h * 0.78, cx, h);
      path.bezierCurveTo(cx * 1.2, h * 0.78, w, h * 0.6, w, h * 0.32);
      path.bezierCurveTo(w, h * 0.0, cx, h * 0.05, cx, h * 0.3);
      path.closePath();
      break;
    }
    case 'arrow': {
      const t = h * 0.36;
      path.moveTo(0, cy - t / 2); path.lineTo(w * 0.62, cy - t / 2); path.lineTo(w * 0.62, 0);
      path.lineTo(w, cy); path.lineTo(w * 0.62, h); path.lineTo(w * 0.62, cy + t / 2); path.lineTo(0, cy + t / 2); path.closePath();
      break;
    }
    case 'bubble': {
      const r = Math.min(w, h) * 0.18, bh = h * 0.8;
      path.moveTo(r, 0); path.arcTo(w, 0, w, bh, r); path.arcTo(w, bh, 0, bh, r);
      path.lineTo(w * 0.35, bh); path.lineTo(w * 0.2, h); path.lineTo(w * 0.22, bh);
      path.arcTo(0, bh, 0, 0, r); path.arcTo(0, 0, w, 0, r); path.closePath();
      break;
    }
  }
  if (sd.fillEnabled) {
    if (sd.gradient.enabled) {
      const ang = (sd.gradient.angle * Math.PI) / 180;
      const dx = Math.cos(ang) * w / 2, dy = Math.sin(ang) * h / 2;
      const g = c.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
      g.addColorStop(0, sd.gradient.from); g.addColorStop(1, sd.gradient.to);
      c.fillStyle = g;
    } else c.fillStyle = sd.fill;
    c.fill(path, 'evenodd');
  }
  if (sw > 0) { c.lineWidth = sw; c.strokeStyle = sd.stroke; c.stroke(path); }
  return { canvas, w: (w + pad * 2) / S, h: (h + pad * 2) / S, version: version++ };
}
