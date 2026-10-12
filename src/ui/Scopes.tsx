import React, { useEffect, useRef, useState } from 'react';
import { engine } from '../engine/preview';
import { Seg } from './components/controls';

type Mode = 'histogram' | 'waveform' | 'parade' | 'vectorscope';

export function Scopes() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<Mode>('waveform');
  useEffect(() => {
    engine.requestRender();
    return engine.onScopes(({ data, w, h }) => {
      const c = ref.current;
      if (!c) return;
      const W = 300, H = 160;
      if (c.width !== W) { c.width = W; c.height = H; }
      const g = c.getContext('2d')!;
      g.fillStyle = '#05070a'; g.fillRect(0, 0, W, H);
      const img = g.getImageData(0, 0, W, H);
      const px = img.data;
      const add = (x: number, y: number, r: number, gg: number, b: number) => {
        if (x < 0 || y < 0 || x >= W || y >= H) return;
        const i = ((y | 0) * W + (x | 0)) * 4;
        px[i] = Math.min(255, px[i] + r); px[i + 1] = Math.min(255, px[i + 1] + gg); px[i + 2] = Math.min(255, px[i + 2] + b); px[i + 3] = 255;
      };
      if (mode === 'histogram') {
        const hr = new Uint32Array(256), hg = new Uint32Array(256), hb = new Uint32Array(256);
        for (let i = 0; i < data.length; i += 4) { hr[data[i]]++; hg[data[i + 1]]++; hb[data[i + 2]]++; }
        const mx = Math.max(1, ...hr, ...hg, ...hb);
        g.putImageData(img, 0, 0);
        g.globalCompositeOperation = 'lighter';
        ([[hr, '#ff4d4d'], [hg, '#3ddc84'], [hb, '#4d8dff']] as const).forEach(([hist, col]) => {
          g.fillStyle = col; g.globalAlpha = 0.55;
          g.beginPath(); g.moveTo(0, H);
          for (let v = 0; v < 256; v++) g.lineTo((v / 255) * W, H - Math.pow(hist[v] / mx, 0.5) * (H - 4));
          g.lineTo(W, H); g.fill();
        });
        g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
        return;
      }
      if (mode === 'vectorscope') {
        const cx = W / 2, cy = H / 2, R = H / 2 - 6;
        for (let i = 0; i < data.length; i += 8) {
          const r = data[i] / 255, gg = data[i + 1] / 255, b = data[i + 2] / 255;
          const Y = 0.299 * r + 0.587 * gg + 0.114 * b;
          const U = (b - Y) * 0.565, V = (r - Y) * 0.713;
          add(cx + U * R * 2.2, cy - V * R * 2.2, data[i] * 0.25 + 20, data[i + 1] * 0.25 + 20, data[i + 2] * 0.25 + 20);
        }
        g.putImageData(img, 0, 0);
        g.strokeStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
        g.beginPath(); g.moveTo(cx - R, cy); g.lineTo(cx + R, cy); g.moveTo(cx, cy - R); g.lineTo(cx, cy + R); g.stroke();
        // línea de tono de piel
        g.strokeStyle = 'rgba(255,180,120,.5)'; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx - R * 0.55, cy - R * 0.84); g.stroke();
        return;
      }
      // forma de onda (filas leídas de abajo arriba no afectan al eje x)
      const parade = mode === 'parade';
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          const r = data[i], gg = data[i + 1], b = data[i + 2];
          if (parade) {
            const sx = (x / w) * (W / 3);
            add(sx, H - 2 - (r / 255) * (H - 4), 40, 6, 6);
            add(sx + W / 3, H - 2 - (gg / 255) * (H - 4), 6, 40, 6);
            add(sx + (2 * W) / 3, H - 2 - (b / 255) * (H - 4), 8, 8, 44);
          } else {
            const l = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
            add((x / w) * W, H - 2 - (l / 255) * (H - 4), 18, 36, 22);
          }
        }
      }
      g.putImageData(img, 0, 0);
      g.strokeStyle = 'rgba(255,255,255,.12)';
      for (const v of [0.25, 0.5, 0.75]) { g.beginPath(); g.moveTo(0, H - 2 - v * (H - 4)); g.lineTo(W, H - 2 - v * (H - 4)); g.stroke(); }
    });
  }, [mode]);
  return (
    <div className="scopes" onPointerDown={(e) => e.stopPropagation()}>
      <div style={{ marginBottom: 6 }}>
        <Seg value={mode} onChange={setMode} options={[{ value: 'waveform', label: 'Onda' }, { value: 'parade', label: 'RGB' }, { value: 'histogram', label: 'Histog.' }, { value: 'vectorscope', label: 'Vector' }]} />
      </div>
      <canvas ref={ref} />
    </div>
  );
}
