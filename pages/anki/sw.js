const CACHE_NAME = 'lumina-anki-v1';
const ASSETS_TO_CACHE = [
  'anki.html',
  'anki.css',
  'anki.js',
  'anki_generator.js',
  'anki_generator.css',
  'anki_client.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});
