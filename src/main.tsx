import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/app.css';

createRoot(document.getElementById('root')!).render(<App />);

// App instalable (PWA): registrar el service worker en producción
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => { /* sin SW */ }); });
}
// guardar el aviso de instalación para mostrar el botón «Instalar app»
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); (window as any).__installPrompt = e; window.dispatchEvent(new Event('cancut-installable')); });
