/* Оболочка помощника: экраны и скрипты берём из сети, а без сети — из запаса. Ответы сервера (/api/) в запас не кладём. */
const V = 'fp-helper-v1';
const SHELL = ['/helper/', '/t1/app.js', '/t1/studio.js', '/t1/style.css', '/t1/studio.css', '/shared/glass.css', '/shared/fonts/fonts.css', '/shared/install.js'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL).catch(() => { })).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x.startsWith('fp-helper-') && x !== V).map((x) => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  e.respondWith(fetch(e.request).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(V).then((c) => c.put(e.request, copy)); } return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('/helper/'))));
});
