const CACHE = 'yururi-v6';
const FONT_CACHE = 'yururi-fonts-v1';
const ASSETS = ['./', './index.html', './manifest.json', './offline.html'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE && k !== FONT_CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Claude API: ネットワークのみ
  if (url.hostname === 'api.anthropic.com') {
    e.respondWith(fetch(e.request).catch(() =>
      new Response(JSON.stringify({error: 'offline'}), {status: 503, headers: {'Content-Type': 'application/json'}})
    ));
    return;
  }
  // Googleフォント: キャッシュ優先
  if (url.hostname.includes('fonts.g')) {
    e.respondWith(
      caches.open(FONT_CACHE).then(c => c.match(e.request).then(hit =>
        hit || fetch(e.request).then(res => { c.put(e.request, res.clone()); return res; })
      ))
    );
    return;
  }
  // 自サイト: HTML(画面本体)はネットワーク優先、それ以外はStale While Revalidate
  if (url.origin === location.origin) {
    const isHTML = e.request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('/');
    if (isHTML) {
      e.respondWith(
        fetch(e.request).then(res => {
          if (res && res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
          return res;
        }).catch(() => caches.open(CACHE).then(c => c.match(e.request).then(hit => hit || c.match('./offline.html'))))
      );
      return;
    }
    e.respondWith(
      caches.open(CACHE).then(c => c.match(e.request).then(hit => {
        const net = fetch(e.request).then(res => {
          if (res && res.ok) c.put(e.request, res.clone());
          return res;
        }).catch(() => hit || c.match('./offline.html'));
        return hit || net;
      }))
    );
  }
});
