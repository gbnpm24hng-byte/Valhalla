const CACHE='valhalla-v0.8.3-onboarding';
const ASSETS=['./','./index.html','./manifest.json','./assets/css/styles.css?v=0.8.3','./assets/images/logo-vikingos.png','./assets/js/config.js','./assets/js/data.js','./assets/js/supabase.js','./assets/js/auth.js','./assets/js/cloud-data.js','./assets/js/finance.js','./assets/js/qrcode-generator.js','./assets/js/onboarding.js','./assets/js/app.js','./docs/VISION.md','./docs/ROADMAP.md','./docs/BACKLOG.md','./docs/ARCHITECTURE.md','./docs/DATABASE.md','./docs/CODING_RULES.md','./docs/AI.md','./docs/CHANGELOG.md'];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener('activate', event => {
  self.clients.claim();
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))));
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;
  if (request.method !== 'GET' || !isSameOrigin) {
    return;
  }
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(fetch(request).then(response => {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put('./index.html', copy));
      return response;
    }).catch(() => caches.match('./index.html')));
    return;
  }
  if (request.destination === 'image' || request.destination === 'style') {
    event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(request, copy));
      return response;
    }).catch(() => caches.match('./assets/css/styles.css'))));
    return;
  }
  event.respondWith(fetch(request).catch(() => caches.match(request)));
});
