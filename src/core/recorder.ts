// Grabación de cámara, pantalla y voz en off con MediaRecorder.
export type RecKind = 'camera' | 'screen' | 'voice';

export interface Recording { stop: () => Promise<File>; cancel: () => void; stream: MediaStream; startedAt: number }

function pickMime(kind: RecKind) {
  const opts = kind === 'voice'
    ? ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
    : ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
  return opts.find((m) => (window as any).MediaRecorder?.isTypeSupported?.(m)) || '';
}

export async function startRecording(kind: RecKind): Promise<Recording> {
  let stream: MediaStream;
  if (kind === 'screen') {
    const disp = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true });
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      stream = new MediaStream([...disp.getVideoTracks(), ...disp.getAudioTracks(), ...mic.getAudioTracks()]);
    } catch { stream = disp; }
  } else if (kind === 'camera') {
    stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } }, audio: { echoCancellation: true, noiseSuppression: true } });
  } else {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  }
  const mime = pickMime(kind);
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 8_000_000 } : undefined);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  rec.start(500);
  const startedAt = Date.now();
  const stopTracks = () => stream.getTracks().forEach((t) => t.stop());
  return {
    stream, startedAt,
    stop: () => new Promise<File>((resolve) => {
      rec.onstop = () => {
        stopTracks();
        const type = rec.mimeType || (kind === 'voice' ? 'audio/webm' : 'video/webm');
        const ext = type.includes('mp4') ? (kind === 'voice' ? 'm4a' : 'mp4') : type.includes('ogg') ? 'ogg' : 'webm';
        const label = kind === 'voice' ? 'Voz en off' : kind === 'screen' ? 'Grabación de pantalla' : 'Cámara';
        const stamp = new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).replace(/:/g, '-');
        resolve(new File(chunks, `${label} ${stamp}.${ext}`, { type }));
      };
      rec.stop();
    }),
    cancel: () => { rec.onstop = null; try { rec.stop(); } catch { /* noop */ } stopTracks(); },
  };
}
