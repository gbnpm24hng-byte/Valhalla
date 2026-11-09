const CACHE='valhalla-v0.9.53-molestias';
// SDK de Supabase fijado a una versión exacta (ver index.html). Es inmutable, así que se
// sirve desde caché para que la pantalla de acceso también cargue sin conexión.
const SUPABASE_SDK_URL='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js';
const ASSETS=['./','./index.html','./manifest.json','./assets/css/styles.css?v=0.9.53','./assets/images/valhalla-logo.svg','./assets/images/valhalla-icono-app.svg','./assets/images/valhalla-icono-192.png','./assets/images/valhalla-icono-512.png','./assets/images/figura-esculpida.svg','./assets/js/config.js?v=0.9.53','./assets/js/circuits-core.js?v=0.9.53','./assets/js/blocks-core.js?v=0.9.53','./assets/js/monthly-card-core.js?v=0.9.53','./assets/js/data.js?v=0.9.53','./assets/js/supabase.js?v=0.9.53','./assets/js/auth.js?v=0.9.53','./assets/js/invite-core.js?v=0.9.53','./assets/js/cloud-data.js?v=0.9.53','./assets/js/finance.js?v=0.9.53','./assets/js/qrcode-generator.js?v=0.9.53','./assets/js/onboarding.js?v=0.9.53','./assets/js/sync-core.js?v=0.9.53','./assets/js/cloud-sync.js?v=0.9.53','./assets/js/client-overrides-core.js?v=0.9.53','./assets/js/swap-reason-core.js?v=0.9.53','./assets/js/muscle-map-core.js?v=0.9.53','./assets/js/publish-core.js?v=0.9.53','./assets/js/publish.js?v=0.9.53','./assets/js/invites.js?v=0.9.53','./assets/js/self-log-core.js?v=0.9.53','./assets/js/student-view.js?v=0.9.53','./assets/js/auth-gate.js?v=0.9.53','./assets/js/labels.js?v=0.9.53','./assets/js/student-import-core.js?v=0.9.53','./assets/js/coach-sets-core.js?v=0.9.53','./assets/js/group-draft-core.js?v=0.9.53','./assets/js/group-round-core.js?v=0.9.53','./assets/js/program-import-core.js?v=0.9.53','./assets/js/settings-core.js?v=0.9.53','./assets/js/monthly-card.js?v=0.9.53','./assets/js/payment-period-core.js?v=0.9.53','./assets/js/app.js?v=0.9.53','./docs/VISION.md','./docs/ROADMAP.md','./docs/BACKLOG.md','./docs/ARCHITECTURE.md','./docs/DATABASE.md','./docs/CODING_RULES.md','./docs/AI.md','./docs/CHANGELOG.md'];

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
  if (request.method === 'GET' && request.url === SUPABASE_SDK_URL) {
    event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(request, copy));
      }
      return response;
    })));
    return;
  }
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
