import React from 'react';
import { Keyboard, Info } from 'lucide-react';
import { Modal } from './components/controls';

const SHORTCUTS: [string, string][] = [
  ['Reproducir / Pausa', 'Espacio'], ['Retroceder / Avanzar 1 s', 'J / L'], ['Pausa', 'K'],
  ['Fotograma anterior / siguiente', '← / →'], ['Saltar 1 segundo', 'Shift + ← / →'], ['Ir al inicio / final', 'Inicio / Fin'],
  ['Clip anterior / siguiente (corte)', '↑ / ↓'], ['Dividir en el cabezal', 'S o Ctrl+K'], ['Eliminar', 'Supr / Retroceso'],
  ['Eliminar y cerrar hueco', 'Shift + Supr'], ['Deshacer', 'Ctrl + Z'], ['Rehacer', 'Ctrl + Shift + Z / Ctrl + Y'],
  ['Copiar / Pegar', 'Ctrl + C / Ctrl + V'], ['Duplicar', 'Ctrl + D'], ['Seleccionar todo', 'Ctrl + A'],
  ['Herramienta selección', 'V'], ['Herramienta cuchilla', 'C'], ['Añadir texto', 'T'], ['Añadir marcador', 'M'],
  ['Acercar / alejar línea de tiempo', '+ / − o Ctrl + rueda'], ['Ajustar línea de tiempo', 'Shift + Z'],
  ['Importar medios', 'Ctrl + I'], ['Guardar', 'Ctrl + S'], ['Exportar video', 'Ctrl + E'], ['Exportar fotograma', 'Ctrl + Shift + S'],
  ['Pantalla completa del visor', 'F'], ['Cancelar / deseleccionar', 'Esc'], ['Atajos', '?'],
];

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Atajos de teclado" onClose={onClose} icon={<Keyboard size={18} />}>
      <div className="kbd-list">
        {SHORTCUTS.map(([a, k]) => <div key={a}><span>{a}</span><span>{k.split(' / ').map((x, i) => <React.Fragment key={i}>{i > 0 && ' / '}<kbd>{x}</kbd></React.Fragment>)}</span></div>)}
      </div>
    </Modal>
  );
}

export function AboutDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Acerca de NovaCut Studio" onClose={onClose} size="sm" icon={<Info size={18} />}>
      <p style={{ lineHeight: 1.6, marginTop: 0 }}>
        <b>NovaCut Studio</b> es un editor de video profesional que funciona 100% en tu navegador. Tus archivos nunca salen de tu equipo: la decodificación, el render por GPU (WebGL2), la IA y la exportación (WebCodecs) se ejecutan localmente.
      </p>
      <p className="hint">Tecnologías: React, TypeScript, WebGL2, WebCodecs, Mediabunny, MediaPipe Tasks, Transformers.js (Whisper), FFmpeg.wasm, Web Audio API. Motion graphics: plantillas y runtime de HyperFrames © HeyGen (Apache-2.0), GSAP y modern-screenshot.</p>
      <p className="hint">Inspirado en los mejores editores libres: Kdenlive, Shotcut (MLT), OpenShot, Olive, Blender VSE, LosslessCut y editores web como Omniclip y Diffusion Studio.</p>
      <p className="hint">Versión 1.0.0 · Licencia MIT</p>
    </Modal>
  );
}
