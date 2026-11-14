// SenseLab service worker: makes the app load fast on repeat visits and work offline.
// Only same-origin files are ever fetched or cached (privacy rule: no third-party requests).
//
//  - App shell (index.html + the hashed JS/CSS chunks): precached at install. The list is written into
//    PRECACHE by the build (see vite.config.ts); the cache name changes with every build.
//  - Models (/models/**: .task, .onnx, wasm): cached the first time they are fetched, then served from the
//    cache. They are big and never change under the same name, so they have their own long-lived cache.
//    Bump MODELS_CACHE when a model file is replaced.
//  - Navigations: network first (so a new deploy shows up), cached page when offline.
//
// No skipWaiting: a new version waits until every tab is closed, so one tab never mixes the JS chunks of
// two builds.

const BUILD_ID = '__BUILD_ID__';
const PRECACHE = '__PRECACHE__';
const SHELL_CACHE = `senselab-shell-${BUILD_ID}`;
// Also written by the page itself (src/core/prefetch.ts): keep the two names the same.
const MODELS_CACHE = 'senselab-models-v1';

const scope = self.registration.scope; // e.g. https://example.com/
const modelsPrefix = new URL('models/', scope).href;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      const urls = Array.isArray(PRECACHE) ? PRECACHE : [];
      // './' is the page itself. `reload` skips the browser's HTTP cache so a stale copy is not pinned.
      await cache.addAll(
        ['./', ...urls].map((u) => new Request(new URL(u, scope), { cache: 'reload' })),
      );
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith('senselab-shell-') && name !== SHELL_CACHE) await caches.delete(name);
      }
      // Take control of the page that registered us, so models fetched on the very first visit are cached.
      await self.clients.claim();
    })(),
  );
});

// Downloads in progress, by URL. The app starts fetching the face model and WASM when the user ticks the
// consent box, and the worker asks for the same files a few seconds later. Without this the second request
// would start a second download while the first is still running.
const inflight = new Map();

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  // ignoreVary: these are static files. Some servers send `Vary: Origin`, and a request that differs
  // in that header from the one that filled the cache would otherwise miss (and fail while offline).
  const hit = await cache.match(request, { ignoreVary: true });
  if (hit) return hit;

  let download = inflight.get(request.url);
  if (!download) {
    download = (async () => {
      const res = await fetch(request);
      // Only whole, successful responses: a partial (206) or failed one must never be stored.
      if (res.ok && res.status === 200) await cache.put(request, res.clone());
    })().finally(() => inflight.delete(request.url));
    inflight.set(request.url, download);
  }
  await download;
  // Everyone, the first asker included, reads the stored copy. If nothing was stored (an error response),
  // ask again so the caller sees the real answer.
  return (await cache.match(request, { ignoreVary: true })) ?? fetch(request);
}

async function networkFirstPage(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const res = await fetch(request);
    if (res.ok) await cache.put(new URL('./', scope).href, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(new URL('./', scope).href, { ignoreVary: true });
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.headers.has('range')) return; // a ranged read cannot be answered from a whole cached file

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstPage(request));
  } else if (url.href.startsWith(modelsPrefix)) {
    event.respondWith(cacheFirst(request, MODELS_CACHE));
  } else if (url.pathname !== new URL('sw.js', scope).pathname) {
    event.respondWith(cacheFirst(request, SHELL_CACHE).catch(() => fetch(request)));
  }
});
