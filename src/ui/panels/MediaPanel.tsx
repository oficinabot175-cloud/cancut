import React, { useEffect, useState } from 'react';
import { Upload, Plus, Trash2, Film, Image as ImageIcon, Music, Video, Monitor, Mic, Square, RefreshCw, Maximize, AlertTriangle, Search } from 'lucide-react';
import { useEditor, getState } from '../../store/editor';
import { importFiles, convertAsset, fitProjectToAsset } from '../../core/actions';
import { ACCEPT_MEDIA } from '../../core/media';
import { formatBytes, formatDuration, pickFiles } from '../../core/utils';
import { startRecording, RecKind, Recording } from '../../core/recorder';
import type { MediaAsset } from '../../types';

export function AssetCard({ a, used }: { a: MediaAsset; used: boolean }) {
  const st = getState;
  return (
    <div
      className={`asset ${used ? 'used' : ''}`} draggable={a.status === 'ready'}
      onDragStart={(e) => { e.dataTransfer.setData('application/x-nc-asset', a.id); e.dataTransfer.effectAllowed = 'copy'; }}
      onDoubleClick={() => st().addAssetToTimeline(a.id)}
      title={`${a.name}\n${a.kind === 'image' ? '' : formatDuration(a.duration) + ' · '}${a.width ? a.width + '×' + a.height + ' · ' : ''}${formatBytes(a.size)}${a.fps && a.kind === 'video' ? ' · ' + a.fps + ' fps' : ''}\nDoble clic o arrastra a la línea de tiempo`}
    >
      {a.kind === 'audio' ? <div className="audio-thumb"><Music size={26} /></div>
        : a.thumbnail ? <img src={a.thumbnail} alt="" /> : <div className="audio-thumb" style={{ background: 'var(--bg3)', color: 'var(--text3)' }}><Film size={24} /></div>}
      <div className="badge">
        {a.kind === 'video' ? <Film size={10} /> : a.kind === 'image' ? <ImageIcon size={10} /> : <Music size={10} />}
        {a.kind !== 'image' && formatDuration(a.duration)}
      </div>
      <div className="meta"><span className="name">{a.name}</span></div>
      {a.status === 'ready' && (
        <div className="actions">
          <button title="Añadir en el cabezal" onClick={() => st().addAssetToTimeline(a.id)}><Plus size={13} /></button>
          {a.kind === 'video' && <button title="Ajustar el lienzo a este video" onClick={() => fitProjectToAsset(a)}><Maximize size={12} /></button>}
          <button title="Eliminar de la biblioteca" onClick={() => { if (!used || confirm('Este medio se usa en la línea de tiempo. ¿Eliminarlo y quitar sus clips?')) st().removeAsset(a.id); }}><Trash2 size={12} /></button>
        </div>
      )}
      {a.status === 'processing' && <div className="overlay"><div className="spinner" /><span>Procesando…</span></div>}
      {(a.status === 'unsupported' || a.status === 'error') && (
        <div className="overlay">
          <AlertTriangle size={16} color="#ffb020" />
          <span style={{ fontSize: 10 }}>{a.status === 'unsupported' ? 'Formato no soportado' : 'Error'}</span>
          {a.status === 'unsupported' && <button className="btn xs primary" onClick={() => convertAsset(a)}><RefreshCw size={11} />Convertir</button>}
          <button className="btn xs ghost" onClick={() => st().removeAsset(a.id)}>Quitar</button>
        </div>
      )}
    </div>
  );
}

export function Recorder({ kinds }: { kinds: RecKind[] }) {
  const [rec, setRec] = useState<{ r: Recording; kind: RecKind } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!rec) return;
    const i = setInterval(() => setElapsed((Date.now() - rec.r.startedAt) / 1000), 250);
    return () => clearInterval(i);
  }, [rec]);
  const start = async (kind: RecKind) => {
    try { setRec({ r: await startRecording(kind), kind }); setElapsed(0); }
    catch (e: any) { getState().toast('No se pudo iniciar la grabación: ' + (e?.message || e), 'error'); }
  };
  const stop = async () => {
    if (!rec) return;
    const f = await rec.r.stop();
    setRec(null);
    await importFiles([f], { addToTimeline: true, at: getState().time });
  };
  if (rec) return (
    <div className="ai-card" style={{ borderColor: 'rgba(255,77,106,.5)', background: 'rgba(255,77,106,.08)' }}>
      <div className="row between">
        <div className="row"><span style={{ width: 10, height: 10, borderRadius: 5, background: '#ff4d6a', boxShadow: '0 0 10px #ff4d6a' }} /> Grabando · <b style={{ fontFamily: 'var(--mono)' }}>{formatDuration(elapsed)}</b></div>
        <div className="row">
          <button className="btn sm ghost" onClick={() => { rec.r.cancel(); setRec(null); }}>Cancelar</button>
          <button className="btn sm danger" onClick={stop}><Square size={12} />Detener</button>
        </div>
      </div>
    </div>
  );
  return (
    <div className="row" style={{ gap: 6, marginBottom: 12 }}>
      {kinds.includes('camera') && <button className="btn sm" style={{ flex: 1 }} onClick={() => start('camera')}><Video size={13} />Cámara</button>}
      {kinds.includes('screen') && <button className="btn sm" style={{ flex: 1 }} onClick={() => start('screen')}><Monitor size={13} />Pantalla</button>}
      {kinds.includes('voice') && <button className="btn sm" style={{ flex: 1 }} onClick={() => start('voice')}><Mic size={13} />Voz en off</button>}
    </div>
  );
}

export function MediaPanel() {
  const assets = useEditor((s) => s.assets);
  const clips = useEditor((s) => s.project.clips);
  const [filter, setFilter] = useState<'all' | 'video' | 'image' | 'audio'>('all');
  const [q, setQ] = useState('');
  const list = Object.values(assets)
    .filter((a) => filter === 'all' || a.kind === filter)
    .filter((a) => !q || a.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.createdAt - a.createdAt);
  const used = new Set(clips.map((c) => c.assetId));
  return (
    <div>
      <div className="dropzone" onClick={async () => importFiles(await pickFiles(ACCEPT_MEDIA))}>
        <Upload size={22} />
        <strong>Importar medios</strong>
        Arrastra aquí videos, audios, imágenes, subtítulos (.srt), LUTs (.cube) o fuentes. Todos los formatos: MP4, MOV, MKV, WebM, AVI, MP3, WAV, PNG, GIF…
      </div>
      <Recorder kinds={['camera', 'screen', 'voice']} />
      {Object.keys(assets).length > 0 && (
        <>
          <div className="search-wrap"><Search size={14} /><input className="search" placeholder="Buscar en la biblioteca…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} /></div>
          <div className="chips">
            {(['all', 'video', 'image', 'audio'] as const).map((f) => (
              <button key={f} className={`chip ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
                {{ all: 'Todo', video: 'Video', image: 'Imagen', audio: 'Audio' }[f]}
              </button>
            ))}
          </div>
        </>
      )}
      {list.length === 0 ? (
        <div className="empty"><Film size={32} /><div>Tu biblioteca está vacía.<br />Importa archivos o graba desde tu cámara o pantalla.</div></div>
      ) : (
        <div className="grid">{list.map((a) => <AssetCard key={a.id} a={a} used={used.has(a.id)} />)}</div>
      )}
    </div>
  );
}
