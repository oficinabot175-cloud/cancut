// Rastreador de objetos por correlación cruzada normalizada (ZNCC) con búsqueda multiescala,
// predicción de velocidad y actualización adaptativa de plantilla. También estima movimiento global.
/// <reference lib="webworker" />

interface Gray { data: Float32Array; w: number; h: number }

let tpl: Float32Array | null = null;   // plantilla actual (media cero, norma 1)
let tplOrig: Float32Array | null = null;
let TW = 0, TH = 0;                    // tamaño de la plantilla en px de trabajo
let workScale = 1;                     // px de trabajo por px del fotograma
let box = { x: 0, y: 0, w: 0, h: 0 };  // caja actual en px del fotograma (centro)
let vel = { x: 0, y: 0 };
let scale = 1;

function downscale(g: Gray, k: number): Gray {
  if (k >= 0.999) return g;
  const w = Math.max(4, Math.round(g.w * k)), h = Math.max(4, Math.round(g.h * k));
  const out = new Float32Array(w * h);
  const sx = g.w / w, sy = g.h / h;
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * sy), y1 = Math.min(g.h, Math.floor((y + 1) * sy) || y0 + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * sx), x1 = Math.min(g.w, Math.floor((x + 1) * sx) || x0 + 1);
      let s = 0, n = 0;
      for (let yy = y0; yy < Math.max(y1, y0 + 1); yy++) for (let xx = x0; xx < Math.max(x1, x0 + 1); xx++) { s += g.data[yy * g.w + xx]; n++; }
      out[y * w + x] = s / n;
    }
  }
  return { data: out, w, h };
}

function bil(g: Gray, x: number, y: number): number {
  if (x < 0) x = 0; if (y < 0) y = 0;
  if (x > g.w - 1.001) x = g.w - 1.001; if (y > g.h - 1.001) y = g.h - 1.001;
  const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0;
  const i = y0 * g.w + x0;
  const a = g.data[i], b = g.data[i + 1], c = g.data[i + g.w], d = g.data[i + g.w + 1];
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/** Extrae un parche (TW x TH) centrado en (cx, cy) con escala s, normalizado (media 0, norma 1). */
function patch(g: Gray, cx: number, cy: number, s: number, out: Float32Array): boolean {
  let sum = 0;
  let k = 0;
  for (let j = 0; j < TH; j++) {
    const y = cy + (j - TH / 2 + 0.5) * s;
    for (let i = 0; i < TW; i++) {
      const v = bil(g, cx + (i - TW / 2 + 0.5) * s, y);
      out[k++] = v; sum += v;
    }
  }
  const mean = sum / out.length;
  let n2 = 0;
  for (let i = 0; i < out.length; i++) { out[i] -= mean; n2 += out[i] * out[i]; }
  const n = Math.sqrt(n2);
  if (n < 1e-4) return false;
  for (let i = 0; i < out.length; i++) out[i] /= n;
  return true;
}

function score(g: Gray, cx: number, cy: number, s: number, buf: Float32Array): number {
  if (!patch(g, cx, cy, s, buf)) return -1;
  let d = 0;
  for (let i = 0; i < buf.length; i++) d += buf[i] * tpl![i];
  return d;
}

function init(frame: Gray, b: { x: number; y: number; w: number; h: number }) {
  box = { x: b.x * frame.w, y: b.y * frame.h, w: b.w * frame.w, h: b.h * frame.h };
  workScale = Math.min(1, 36 / Math.max(box.w, box.h, 1));
  const g = downscale(frame, workScale);
  TW = Math.max(8, Math.round(box.w * workScale));
  TH = Math.max(8, Math.round(box.h * workScale));
  tpl = new Float32Array(TW * TH);
  patch(g, box.x * workScale, box.y * workScale, 1, tpl);
  tplOrig = Float32Array.from(tpl);
  vel = { x: 0, y: 0 };
  scale = 1;
}

function track(frame: Gray) {
  if (!tpl) return { box, score: 0 };
  const g = downscale(frame, workScale);
  const buf = new Float32Array(TW * TH);
  const px = (box.x + vel.x) * workScale, py = (box.y + vel.y) * workScale;
  const R = Math.max(6, Math.round(Math.max(TW, TH) * scale * 0.75));
  let best = -2, bx = px, by = py;
  for (let dy = -R; dy <= R; dy += 2) for (let dx = -R; dx <= R; dx += 2) {
    const s = score(g, px + dx, py + dy, scale, buf);
    if (s > best) { best = s; bx = px + dx; by = py + dy; }
  }
  // refinamiento fino
  let fx = bx, fy = by;
  for (let dy = -1.5; dy <= 1.5; dy += 0.5) for (let dx = -1.5; dx <= 1.5; dx += 0.5) {
    const s = score(g, bx + dx, by + dy, scale, buf);
    if (s > best) { best = s; fx = bx + dx; fy = by + dy; }
  }
  // multiescala
  let bs = scale;
  for (const f of [0.94, 0.97, 1.03, 1.06]) {
    const s = score(g, fx, fy, scale * f, buf) - 0.004; // ligera preferencia por la escala actual
    if (s > best) { best = s; bs = scale * f; }
  }
  if (best > 0.3) {
    const nx = fx / workScale, ny = fy / workScale;
    vel = { x: (nx - box.x) * 0.6 + vel.x * 0.4, y: (ny - box.y) * 0.6 + vel.y * 0.4 };
    scale = bs;
    box = { x: nx, y: ny, w: (TW / workScale) * scale, h: (TH / workScale) * scale };
    // actualización adaptativa de la plantilla
    if (best > 0.6 && patch(g, fx, fy, scale, buf)) {
      for (let i = 0; i < tpl.length; i++) tpl[i] = tpl[i] * 0.85 + buf[i] * 0.1 + tplOrig![i] * 0.05;
      let n2 = 0; for (let i = 0; i < tpl.length; i++) n2 += tpl[i] * tpl[i];
      const n = Math.sqrt(n2) || 1; for (let i = 0; i < tpl.length; i++) tpl[i] /= n;
    }
  } else {
    vel = { x: vel.x * 0.5, y: vel.y * 0.5 };
  }
  return { box: { x: box.x / frame.w, y: box.y / frame.h, w: box.w / frame.w, h: box.h / frame.h }, score: best };
}

/** Movimiento global entre dos fotogramas: mediana del desplazamiento de varios bloques. */
function motion(a: Gray, b: Gray) {
  const P = 20, R = 10;
  const dxs: number[] = [], dys: number[] = [];
  const grid = 4;
  for (let gy = 1; gy <= grid; gy++) for (let gx = 1; gx <= grid; gx++) {
    const cx = Math.round((gx / (grid + 1)) * a.w), cy = Math.round((gy / (grid + 1)) * a.h);
    // varianza del bloque (descartar zonas planas)
    let m = 0, v = 0;
    for (let j = -P / 2; j < P / 2; j++) for (let i = -P / 2; i < P / 2; i++) m += a.data[(cy + j) * a.w + cx + i];
    m /= P * P;
    for (let j = -P / 2; j < P / 2; j++) for (let i = -P / 2; i < P / 2; i++) { const d = a.data[(cy + j) * a.w + cx + i] - m; v += d * d; }
    if (v / (P * P) < 0.0008) continue;
    let best = Infinity, bdx = 0, bdy = 0;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      let sad = 0;
      for (let j = -P / 2; j < P / 2; j += 2) {
        const ya = cy + j, yb = cy + j + dy;
        if (yb < 0 || yb >= b.h) { sad = Infinity; break; }
        for (let i = -P / 2; i < P / 2; i += 2) {
          const xb = cx + i + dx;
          if (xb < 0 || xb >= b.w) { sad += 1; continue; }
          sad += Math.abs(a.data[ya * a.w + cx + i] - b.data[yb * b.w + xb]);
        }
        if (sad >= best) break;
      }
      if (sad < best) { best = sad; bdx = dx; bdy = dy; }
    }
    dxs.push(bdx); dys.push(bdy);
  }
  const med = (arr: number[]) => { if (!arr.length) return 0; const s = [...arr].sort((x, y) => x - y); return s[s.length >> 1]; };
  return { dx: med(dxs) / a.w, dy: med(dys) / a.h };
}

self.onmessage = (e: MessageEvent) => {
  const { id, type } = e.data;
  try {
    if (type === 'init') { init(e.data.frame, e.data.box); (self as any).postMessage({ id, ok: true }); }
    else if (type === 'track') (self as any).postMessage({ id, ...track(e.data.frame) });
    else if (type === 'motion') (self as any).postMessage({ id, ...motion(e.data.a, e.data.b) });
  } catch (err: any) {
    (self as any).postMessage({ id, error: err?.message || String(err) });
  }
};
