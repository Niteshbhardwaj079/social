// The app's service worker. It makes the app installable on phones and computers ("Add to Home screen")
// and shows a friendly page when there is no internet.
//
// It deliberately caches NOTHING else: pages, code and API answers always come fresh from the server,
// so a new release can never get stuck behind an old cached copy. Bump VERSION when offline.html changes.
const VERSION = 'v2';
const OFFLINE_CACHE = `social-offline-${VERSION}`;
const OFFLINE_FILES = ['/offline.html', '/favicon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(OFFLINE_CACHE).then((cache) => cache.addAll(OFFLINE_FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Remove offline pages left behind by older versions of this file.
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => name.startsWith('social-offline-') && name !== OFFLINE_CACHE).map((name) => caches.delete(name))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return; // let the browser handle it normally

  // Opening a page: try the network; only when that fails show the offline page.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/offline.html')));
    return;
  }

  // The offline page's own picture, when there is no network.
  if (OFFLINE_FILES.includes(new URL(request.url).pathname)) {
    event.respondWith(fetch(request).catch(() => caches.match(request)));
  }
});
