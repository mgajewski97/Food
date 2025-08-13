const CACHE_PREFIX = 'food-cache';
let CACHE_VERSION = '0';
const OFFLINE_URL = '/offline';
const OFFLINE_HTML = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Offline</title></head><body><h1>You're offline</h1></body></html>`;

async function fetchVersion() {
  if (CACHE_VERSION !== '0') return CACHE_VERSION;
  try {
    const res = await fetch('/version.txt', { cache: 'no-store' });
    if (res.ok) {
      CACHE_VERSION = (await res.text()).trim();
    }
  } catch (e) {
    // ignore, keep default
  }
  return CACHE_VERSION;
}

function cacheName() {
  return `${CACHE_PREFIX}-${CACHE_VERSION}`;
}

function precacheUrls(v) {
  return [
    '/',
    `/static/styles.css?v=${v}`,
    `/static/script.js?v=${v}`,
    '/api/ui/en',
    '/api/ui/pl',
    '/static/icons/icon-192x192.png',
    '/static/icons/icon-512x512.png',
    '/manifest.json'
  ];
}

self.addEventListener('install', event => {
  event.waitUntil(
    fetchVersion().then(v =>
      caches.open(cacheName()).then(cache => {
        cache.addAll(precacheUrls(v));
        cache.put(OFFLINE_URL, new Response(OFFLINE_HTML, { headers: { 'Content-Type': 'text/html' } }));
      }).then(() => {
        if (self.registration.active) {
          return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
            clients.forEach(client => client.postMessage({ type: 'RELOAD_PROMPT' }));
          });
        }
      })
    )
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    fetchVersion().then(() =>
      caches.keys().then(keys => Promise.all(
        keys.filter(key => key.startsWith(`${CACHE_PREFIX}-`) && key !== cacheName()).map(key => caches.delete(key))
      )).then(() => self.clients.claim())
    )
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/ui/')) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(OFFLINE_URL))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      const fetchPromise = fetch(event.request).then(networkResponse => {
        return caches.open(cacheName()).then(cache => {
          cache.put(event.request, networkResponse.clone());
          return networkResponse;
        });
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
