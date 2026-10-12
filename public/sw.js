// CanCut — service worker: app instalable y uso sin conexión (caché de la app, librerías, plantillas y modelos de IA).
const VERSION = 'cancut-v1.2.0';
const CORE = ['./', './index.html', './manifest.webmanifest', './favicon.svg', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k.startsWith('cancut-')).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

const CACHEABLE_HOSTS = ['storage.googleapis.com', 'cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com', 'huggingface.co', 'cdn-lfs.huggingface.co'];

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    // navegación: red primero (para recibir actualizaciones), caché si no hay conexión
    if (req.mode === 'navigate') {
      e.respondWith(fetch(req).then((r) => { const cp = r.clone(); caches.open(VERSION).then((c) => c.put('./index.html', cp)); return r; }).catch(() => caches.match('./index.html')));
      return;
    }
    // archivos con hash, librerías y plantillas: caché primero
    if (/\/(assets|vendor|hyperframes|icons)\//.test(url.pathname)) {
      e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => { if (r.ok) { const cp = r.clone(); caches.open(VERSION).then((c) => c.put(req, cp)); } return r; })));
    }
    return;
  }
  // modelos de IA, fuentes y CDN: caché primero (se descargan una sola vez)
  if (CACHEABLE_HOSTS.includes(url.hostname)) {
    e.respondWith(caches.open('cancut-ext').then((c) => c.match(req).then((hit) => hit || fetch(req).then((r) => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }))));
  }
});
