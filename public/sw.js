const version = 'xianwai-shell-v10';
const shell = ['style.css', 'app.js', 'workspace.js', 'analysis-core.mjs', 'casebook.mjs',
  'audio.js', 'asr-worker.js', 'asr-engine.mjs', 'model-config.mjs', 'browser-api.js', 'provider-ui.js',
  'local-device.js', 'app.webmanifest', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(version)
    .then(cache => cache.addAll(['./', ...shell]))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith('xianwai-shell-') && key !== version).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin) return;
  const base = self.registration.scope;
  if (!url.pathname.startsWith(base)) return;
  const relative = url.pathname.slice(base.length) || 'index.html';
  if (!shell.includes(relative) && relative !== 'index.html') return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
