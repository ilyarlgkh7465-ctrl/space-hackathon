/* Оболочка приложения для работы без сети: страницы и скрипты берём из кэша, если сети нет. Данные заказов в кэш не кладём. */
const V = 'picpac-shell-v3';
const SHELL = ['/t2/', '/t2/index.html', '/t2/app.js', '/t2/demo.js', '/t2/app.css', '/shared/api.js', '/shared/glass.css', '/shared/fonts/fonts.css'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL).catch(() => { })).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x !== V).map((x) => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  e.respondWith(fetch(e.request).then((r) => { const cp = r.clone(); if (r.ok) caches.open(V).then((c) => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request)));
});
