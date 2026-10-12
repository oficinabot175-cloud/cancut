import type { CurvePoint, Curves } from '../types';

/** Interpolación cúbica monótona (Fritsch–Carlson) → tabla de 256 valores. */
export function curveTable(points: CurvePoint[]): Uint8Array {
  const pts = [...points].sort((a, b) => a.x - b.x);
  if (pts.length === 0 || pts[0].x > 0) pts.unshift({ x: 0, y: pts[0]?.x === 0 ? pts[0].y : 0 });
  if (pts[pts.length - 1].x < 1) pts.push({ x: 1, y: 1 });
  const n = pts.length;
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const d: number[] = [], m: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / Math.max(xs[i + 1] - xs[i], 1e-6));
  m.push(d[0]);
  for (let i = 1; i < n - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2);
  m.push(d[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  const out = new Uint8Array(256);
  let seg = 0;
  for (let k = 0; k < 256; k++) {
    const x = k / 255;
    while (seg < n - 2 && x > xs[seg + 1]) seg++;
    const h = Math.max(xs[seg + 1] - xs[seg], 1e-6);
    const t = Math.min(1, Math.max(0, (x - xs[seg]) / h));
    const t2 = t * t, t3 = t2 * t;
    const y = (2 * t3 - 3 * t2 + 1) * ys[seg] + (t3 - 2 * t2 + t) * h * m[seg] + (-2 * t3 + 3 * t2) * ys[seg + 1] + (t3 - t2) * h * m[seg + 1];
    out[k] = Math.round(Math.min(1, Math.max(0, y)) * 255);
  }
  return out;
}

/** Textura 256x4 RGBA: filas master, R, G, B. */
export function curvesTexture(c: Curves): Uint8Array {
  const data = new Uint8Array(256 * 4 * 4);
  const rows = [c.master, c.r, c.g, c.b];
  rows.forEach((pts, row) => {
    const t = curveTable(pts);
    for (let i = 0; i < 256; i++) {
      const o = (row * 256 + i) * 4;
      data[o] = t[i]; data[o + 1] = t[i]; data[o + 2] = t[i]; data[o + 3] = 255;
    }
  });
  return data;
}

export const identityCurve = (): CurvePoint[] => [{ x: 0, y: 0 }, { x: 1, y: 1 }];
export const defaultCurves = (): Curves => ({ master: identityCurve(), r: identityCurve(), g: identityCurve(), b: identityCurve() });

export function isIdentity(c: Curves | null) {
  if (!c) return true;
  const id = (p: CurvePoint[]) => p.length === 2 && p[0].x === 0 && p[0].y === 0 && p[1].x === 1 && p[1].y === 1;
  return id(c.master) && id(c.r) && id(c.g) && id(c.b);
}

/** Parser de LUT .cube (3D). */
export function parseCube(text: string): { size: number; data: number[]; title: string } {
  let size = 0; let title = '';
  const data: number[] = [];
  let dmin = [0, 0, 0], dmax = [1, 1, 1];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('TITLE')) { title = line.replace(/^TITLE\s+"?|"?$/g, ''); continue; }
    if (line.startsWith('LUT_3D_SIZE')) { size = parseInt(line.split(/\s+/)[1], 10); continue; }
    if (line.startsWith('LUT_1D_SIZE')) throw new Error('Solo se admiten LUT 3D (.cube)');
    if (line.startsWith('DOMAIN_MIN')) { dmin = line.split(/\s+/).slice(1).map(Number); continue; }
    if (line.startsWith('DOMAIN_MAX')) { dmax = line.split(/\s+/).slice(1).map(Number); continue; }
    if (/^[A-Z_]+/.test(line)) continue;
    const v = line.split(/\s+/).map(Number);
    if (v.length >= 3 && v.every((x) => !isNaN(x))) {
      data.push((v[0] - dmin[0]) / (dmax[0] - dmin[0]), (v[1] - dmin[1]) / (dmax[1] - dmin[1]), (v[2] - dmin[2]) / (dmax[2] - dmin[2]));
    }
  }
  if (!size || data.length < size * size * size * 3) throw new Error('Archivo .cube inválido');
  return { size, data: data.slice(0, size * size * size * 3), title };
}
