import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Film, CheckCircle2, AlertCircle } from 'lucide-react';
import { getState, projectDuration, useEditor } from '../store/editor';
import { exportProject, ExportFormat, ExportResult } from '../engine/export';
import { Modal, ProgressBar, Select, Toggle } from './components/controls';
import { download, formatBytes, formatTimecode } from '../core/utils';
import { getEncodableVideoCodecs } from 'mediabunny';

const FORMATS: { id: ExportFormat; name: string; desc: string; group: string }[] = [
  { id: 'mp4', name: 'MP4', desc: 'H.264 / HEVC / AV1 · universal', group: 'Video' },
  { id: 'webm', name: 'WebM', desc: 'VP9 / AV1 · web', group: 'Video' },
  { id: 'mov', name: 'MOV', desc: 'QuickTime · Apple / Final Cut', group: 'Video' },
  { id: 'mkv', name: 'MKV', desc: 'Matroska · archivo', group: 'Video' },
  { id: 'gif', name: 'GIF', desc: 'Animación en bucle', group: 'Video' },
  { id: 'avi', name: 'AVI', desc: 'MPEG-4 · compatibilidad (FFmpeg)', group: 'Video' },
  { id: 'wmvlike', name: 'MPEG-2', desc: '.mpg · DVD / TV (FFmpeg)', group: 'Video' },
  { id: 'png', name: 'PNG', desc: 'Fotograma actual', group: 'Imagen' },
  { id: 'wav', name: 'WAV', desc: 'Audio sin pérdida', group: 'Audio' },
  { id: 'm4a', name: 'M4A', desc: 'AAC · audio', group: 'Audio' },
  { id: 'mp3', name: 'MP3', desc: 'Audio universal (FFmpeg)', group: 'Audio' },
  { id: 'ogg', name: 'OGG', desc: 'Opus · audio', group: 'Audio' },
  { id: 'flac', name: 'FLAC', desc: 'Sin pérdida (FFmpeg)', group: 'Audio' },
];

const PRESETS = [
  { id: 'yt8k', name: 'YouTube 8K', w: 7680, h: 4320, fps: 30, fmt: 'mp4' },
  { id: 'yt4k', name: 'YouTube 4K', w: 3840, h: 2160, fps: 30, fmt: 'mp4' },
  { id: 'yt', name: 'YouTube 1080p', w: 1920, h: 1080, fps: 30, fmt: 'mp4' },
  { id: 'tiktok', name: 'TikTok / Reels / Shorts', w: 1080, h: 1920, fps: 30, fmt: 'mp4' },
  { id: 'ig', name: 'Instagram feed 4:5', w: 1080, h: 1350, fps: 30, fmt: 'mp4' },
  { id: 'sq', name: 'Cuadrado 1:1', w: 1080, h: 1080, fps: 30, fmt: 'mp4' },
  { id: 'wa', name: 'WhatsApp (ligero)', w: 1280, h: 720, fps: 30, fmt: 'mp4' },
];

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const project = useEditor((s) => s.project);
  const time = useEditor((s) => s.time);
  const dur = projectDuration(project);
  const [format, setFormat] = useState<ExportFormat>('mp4');
  const [scale, setScale] = useState(1);
  const [fps, setFps] = useState(project.fps);
  const [quality, setQuality] = useState<'very-high' | 'high' | 'medium' | 'low' | 'custom' | 'master'>('high');
  const canStream = typeof (window as any).showSaveFilePicker === 'function';
  const [toDisk, setToDisk] = useState(false);
  const [sizeCodecs, setSizeCodecs] = useState<string[] | null>(null);
  const [bitrate, setBitrate] = useState(12);
  const [codec, setCodec] = useState<string>('auto');
  const [audio, setAudio] = useState(true);
  const [range, setRange] = useState<'all' | 'markers' | 'custom'>('all');
  const [rStart, setRStart] = useState(0);
  const [rEnd, setREnd] = useState(dur);
  const [gifW, setGifW] = useState(480);
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [info, setInfo] = useState('');
  const [result, setResult] = useState<ExportResult | null>(null);
  const [error, setError] = useState('');
  const [codecs, setCodecs] = useState<string[]>([]);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => { getEncodableVideoCodecs(['avc', 'hevc', 'vp9', 'av1', 'vp8'], { width: 1920, height: 1080 }).then(setCodecs).catch(() => setCodecs([])); }, []);

  const isAudio = ['wav', 'm4a', 'mp3', 'ogg', 'flac'].includes(format);
  const isGif = format === 'gif';
  const isPng = format === 'png';
  const even = (v: number) => Math.max(2, Math.round(v / 2) * 2);
  const W = isGif ? even(gifW) : even(project.width * scale);
  const H = isGif ? even((gifW * project.height) / project.width) : even(project.height * scale);
  const shortSide = Math.min(W, H);
  useEffect(() => {
    let alive = true;
    setSizeCodecs(null);
    getEncodableVideoCodecs(['avc', 'hevc', 'vp9', 'av1', 'vp8'], { width: W, height: H }).then((c) => alive && setSizeCodecs(c)).catch(() => alive && setSizeCodecs([]));
    return () => { alive = false; };
  }, [W, H]);
  useEffect(() => { if (canStream && W * H >= 3840 * 2160) setToDisk(true); }, [W, H, canStream]);
  const masterBitrate = Math.min(500, Math.max(20, Math.round((W * H * fps * 0.8) / 1e6)));
  const markers = [...project.markers].sort((a, b) => a.t - b.t);
  const [start, end] = useMemo(() => {
    if (range === 'markers' && markers.length >= 2) return [markers[0].t, markers[markers.length - 1].t];
    if (range === 'custom') return [Math.max(0, Math.min(rStart, dur)), Math.max(0, Math.min(rEnd, dur))];
    return [0, dur];
  }, [range, rStart, rEnd, dur, markers]);
  const estMB = useMemo(() => {
    const secs = Math.max(0, end - start);
    if (isAudio) return (secs * 256) / 8 / 1024;
    const px = W * H * fps;
    const bps = quality === 'custom' ? bitrate * 1e6 : quality === 'master' ? masterBitrate * 1e6 : px * ({ 'very-high': 0.2, high: 0.12, medium: 0.07, low: 0.04 } as any)[quality];
    return (secs * (bps + 320000)) / 8 / 1024 / 1024;
  }, [W, H, fps, quality, bitrate, end, start, isAudio, masterBitrate]);

  const run = async () => {
    if (!isPng && end - start < 0.05) { setError('El rango de exportación está vacío.'); setState('error'); return; }
    abort.current = new AbortController();
    let fileHandle: any = null;
    const streamable = toDisk && canStream && ['mp4', 'mov', 'webm', 'mkv'].includes(format);
    if (streamable) {
      try {
        const ext = format;
        fileHandle = await (window as any).showSaveFilePicker({ suggestedName: `${project.name.replace(/[\\/:*?"<>|]+/g, '_') || 'video'}.${ext}`, types: [{ description: `Video ${ext.toUpperCase()}`, accept: { [ext === 'mov' ? 'video/quicktime' : ext === 'mkv' ? 'video/x-matroska' : `video/${ext}`]: ['.' + ext] } }] });
      } catch { return; }
    }
    setState('running'); setProgress(0); setError('');
    document.body.classList.add('nc-busy');
    try {
      const q = quality === 'master' ? 'custom' : quality;
      const br = quality === 'master' ? masterBitrate : bitrate;
      const r = await exportProject(getState().project, getState().assets, {
        format, videoCodec: codec as any, width: W, height: H, fps, quality: q, bitrate: br, start: isPng ? time : start, end, includeAudio: audio,
        onProgress: (p, i) => { setProgress(p); setInfo(i); }, signal: abort.current.signal, fileHandle,
      });
      setResult(r); setState('done');
      if (!fileHandle) download(r.blob, r.filename);
    } catch (e: any) {
      if (abort.current?.signal.aborted) { setState('idle'); return; }
      console.error(e);
      const msg = String(e?.message || e);
      setError(/not supported in this environment|encoder configuration/i.test(msg)
        ? `Tu navegador no admite esta combinación de códec en este formato (${msg.match(/\(([^)]+)\)/)?.[1] || 'configuración'}). Prueba otro códec, el formato MP4 o WebM, o desactiva «Incluir audio».`
        : msg);
      setState('error');
    } finally { document.body.classList.remove('nc-busy'); }
  };

  const groups = [...new Set(FORMATS.map((f) => f.group))];
  return (
    <Modal title="Exportar" onClose={() => { abort.current?.abort(); onClose(); }} size="lg" icon={<Film size={18} />}
      footer={state === 'running' ? <button className="btn danger" onClick={() => abort.current?.abort()}>Cancelar</button>
        : state === 'done' ? <><button className="btn" onClick={() => setState('idle')}>Exportar otro</button><button className="btn primary" onClick={() => result && download(result.blob, result.filename)}><Download size={14} />Descargar de nuevo</button></>
        : <><span className="muted" style={{ marginRight: 'auto' }}>{isPng ? `Fotograma en ${formatTimecode(time, project.fps)}` : `${W}×${H} · ${(end - start).toFixed(1)} s · ≈ ${estMB < 1 ? (estMB * 1024).toFixed(0) + ' KB' : estMB.toFixed(1) + ' MB'}`}</span>
          <button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary lg" disabled={dur === 0} onClick={run}><Download size={15} />Exportar</button></>}>
      {state === 'running' && (
        <div style={{ padding: '30px 10px' }}>
          <div className="row between" style={{ marginBottom: 10 }}><b>Renderizando…</b><span className="timecode">{Math.round(progress * 100)}%</span></div>
          <ProgressBar value={progress} lg />
          <p className="hint" style={{ marginTop: 10 }}>{info}</p>
          <p className="hint">Mantén esta pestaña abierta. El render usa tu GPU y los codificadores de hardware del navegador.</p>
        </div>
      )}
      {state === 'done' && result && (
        <div style={{ padding: '30px 10px', textAlign: 'center' }}>
          <CheckCircle2 size={44} color="var(--ok)" />
          <h3 style={{ margin: '10px 0 4px' }}>¡Exportación completada!</h3>
          <p className="muted">{result.filename} · {formatBytes(result.blob.size)} · {result.codec} · {result.seconds.toFixed(1)} s</p>
          {result.blob.type.startsWith('video') && <video src={URL.createObjectURL(result.blob)} controls style={{ maxWidth: '100%', maxHeight: 320, borderRadius: 10, marginTop: 10, background: '#000' }} />}
          {result.blob.type.startsWith('image') && <img src={URL.createObjectURL(result.blob)} style={{ maxWidth: '100%', maxHeight: 320, borderRadius: 10, marginTop: 10 }} alt="" />}
        </div>
      )}
      {(state === 'idle' || state === 'error') && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 22 }}>
          <div>
            {groups.map((g) => (
              <div key={g} className="section">
                <div className="section-title">{g}</div>
                <div className="format-grid">
                  {FORMATS.filter((f) => f.group === g).map((f) => (
                    <div key={f.id} className={`format-card ${format === f.id ? 'active' : ''}`} onClick={() => setFormat(f.id)}>
                      <b>{f.name}</b><span>{f.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div className="section">
              <div className="section-title">Ajustes rápidos para redes</div>
              <div className="chips">
                {PRESETS.map((p) => (
                  <button key={p.id} className="chip" onClick={() => {
                    const same = Math.abs(p.w / p.h - project.width / project.height) < 0.01;
                    if (!same) {
                      if (!confirm(`Este preset usa ${p.w}×${p.h}. ¿Cambiar el formato del proyecto?`)) return;
                      getState().setProjectProps({ width: p.w, height: p.h });
                      setScale(1);
                    } else setScale(Math.round((p.w / project.width) * 10000) / 10000);
                    setFps(p.fps); setFormat(p.fmt as ExportFormat); setQuality(p.id === 'wa' ? 'medium' : 'high');
                  }}>{p.name}</button>
                ))}
              </div>
            </div>
          </div>
          <div>
            <div className="kv">
              {!isAudio && !isGif && <>
                <label>Resolución</label>
                <Select value={scale} onChange={setScale} options={(() => {
                  const ps = Math.min(project.width, project.height);
                  const std: [number, string][] = [[4320, '8K UHD'], [3240, '6K'], [2880, '5K'], [2160, '4K UHD'], [1440, '2K QHD'], [1080, 'Full HD'], [720, 'HD'], [540, 'qHD'], [480, 'SD'], [360, '360p'], [240, '240p']];
                  const opts = std.map(([h, l]) => { const k = Math.round((h / ps) * 10000) / 10000; return { value: k, label: `${l} · ${even(project.width * k)}×${even(project.height * k)}${k > 1.001 ? ' ↑' : ''}` }; });
                  if (!opts.some((o) => Math.abs(o.value - 1) < 1e-6)) opts.push({ value: 1, label: `Proyecto · ${project.width}×${project.height}` });
                  for (const m of [2, 3, 4]) if (!opts.some((o) => Math.abs(o.value - m) < 1e-3) && ps * m <= 4320) opts.push({ value: m, label: `${m}× · ${even(project.width * m)}×${even(project.height * m)}` });
                  if (!opts.some((o) => Math.abs(o.value - scale) < 1e-6)) opts.push({ value: scale, label: `${even(project.width * scale)}×${even(project.height * scale)}` });
                  return opts.sort((a, b) => b.value - a.value);
                })()} />
              </>}
              {isGif && <><label>Ancho GIF</label><Select value={gifW} onChange={setGifW} options={[240, 320, 480, 640, 800].map((w) => ({ value: w, label: `${w}px` }))} /></>}
              {!isAudio && !isPng && <><label>Fotogramas/s</label><Select value={fps} onChange={setFps} options={(isGif ? [10, 12, 15, 20, 24, 30] : [23.976, 24, 25, 29.97, 30, 50, 60]).map((f) => ({ value: f, label: `${f} fps` }))} /></>}
              {!isAudio && !isGif && !isPng && <>
                <label>Calidad</label>
                <Select value={quality} onChange={setQuality} options={[{ value: 'master', label: `Máster (≈${masterBitrate} Mbps)` }, { value: 'very-high', label: 'Máxima' }, { value: 'high', label: 'Alta (recomendada)' }, { value: 'medium', label: 'Media' }, { value: 'low', label: 'Baja (archivo pequeño)' }, { value: 'custom', label: 'Bitrate personalizado' }]} />
                {quality === 'custom' && <><label>Bitrate (Mbps)</label><input className="num" style={{ width: '100%' }} type="number" min={0.5} max={500} value={bitrate} onChange={(e) => setBitrate(parseFloat(e.target.value) || 8)} onKeyDown={(e) => e.stopPropagation()} /></>}
                {['mp4', 'mov', 'mkv', 'webm'].includes(format) && <>
                  <label>Códec</label>
                  <Select value={codec} onChange={setCodec} options={[{ value: 'auto', label: 'Automático' }, ...['avc', 'hevc', 'vp9', 'av1', 'vp8'].filter((c) => codecs.includes(c)).map((c) => ({ value: c, label: ({ avc: 'H.264 / AVC', hevc: 'H.265 / HEVC', vp9: 'VP9', av1: 'AV1', vp8: 'VP8' } as any)[c] }))]} />
                </>}
                <label>Incluir audio</label><Toggle value={audio} onChange={setAudio} />
                {canStream && ['mp4', 'mov', 'webm', 'mkv'].includes(format) && <><label title="Escribe el video directamente en tu disco mientras se renderiza: sin límite de memoria (recomendado para 4K/8K)">Guardar directo en disco</label><Toggle value={toDisk} onChange={setToDisk} /></>}
              </>}
              {!isPng && <>
                <label>Rango</label>
                <Select value={range} onChange={setRange} options={[{ value: 'all', label: 'Todo el proyecto' }, ...(markers.length >= 2 ? [{ value: 'markers' as const, label: 'Entre marcadores' }] : []), { value: 'custom', label: 'Personalizado' }]} />
                {range === 'custom' && <>
                  <label>Desde (s)</label><input className="num" style={{ width: '100%' }} type="number" step={0.1} value={rStart} onChange={(e) => setRStart(parseFloat(e.target.value) || 0)} onKeyDown={(e) => e.stopPropagation()} />
                  <label>Hasta (s)</label><input className="num" style={{ width: '100%' }} type="number" step={0.1} value={rEnd} onChange={(e) => setREnd(parseFloat(e.target.value) || 0)} onKeyDown={(e) => e.stopPropagation()} />
                </>}
              </>}
            </div>
            {!isAudio && !isGif && !isPng && sizeCodecs && (() => {
              const need: Record<string, string[]> = { mp4: ['avc', 'hevc', 'av1', 'vp9'], mov: ['avc', 'hevc', 'vp9'], webm: ['vp9', 'av1', 'vp8'], mkv: ['avc', 'hevc', 'vp9', 'av1', 'vp8'], avi: ['avc', 'hevc', 'av1', 'vp9'], wmvlike: ['avc', 'hevc', 'av1', 'vp9'] };
              const ok = (need[format] || []).filter((c) => sizeCodecs.includes(c));
              if (!ok.length) return <p className="hint" style={{ color: 'var(--warn)', marginTop: 12 }}>⚠ Tu navegador/GPU no puede codificar {format.toUpperCase()} a {W}×{H}. {sizeCodecs.length ? `Prueba ${sizeCodecs.includes('vp9') || sizeCodecs.includes('av1') ? 'WebM o MKV' : 'otro formato'} (códecs disponibles: ${sizeCodecs.join(', ').toUpperCase()}).` : 'Elige una resolución menor.'}</p>;
              if (shortSide > 2160) return <p className="hint" style={{ marginTop: 12 }}>✓ {shortSide >= 4320 ? '8K' : shortSide + 'p'} disponible con: {ok.map((c) => ({ avc: 'H.264', hevc: 'HEVC', vp9: 'VP9', av1: 'AV1', vp8: 'VP8' } as any)[c]).join(', ')}. El render a esta resolución es intensivo: usa «Guardar directo en disco».</p>;
              return null;
            })()}
            {state === 'error' && <div className="toast error" style={{ marginTop: 16, animation: 'none' }}><AlertCircle size={16} color="var(--err)" /><span>{error}</span></div>}
            <p className="hint" style={{ marginTop: 16 }}>La exportación usa WebCodecs con aceleración por hardware. Los formatos marcados con FFmpeg se convierten después en el navegador (más lento). Para máxima compatibilidad usa MP4 H.264.</p>
            {!codecs.length && <p className="hint" style={{ color: 'var(--warn)' }}>Tu navegador no expone codificadores de video WebCodecs. Usa Chrome, Edge u Opera actualizados.</p>}
          </div>
        </div>
      )}
    </Modal>
  );
}
