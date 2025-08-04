const CACHE_NAME = 'food-cache-v1';
const URLS_TO_CACHE = [
    '/',
    '/static/styles.css',
    '/static/script.js',
    '/static/icons/icon-192x192.png',
    '/static/icons/icon-512x512.png',
    '/manifest.json'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(URLS_TO_CACHE))
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => Promise.all(
            keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
        ))
    );
});

self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;
    event.respondWith(
        caches.match(event.request).then(response => {
            if (response) return response;
            return fetch(event.request).then(fetchResponse => {
                const copy = fetchResponse.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
                return fetchResponse;
            }).catch(() => caches.match('/'));
        })
    );