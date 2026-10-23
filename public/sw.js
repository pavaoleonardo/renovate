/* Renovate — a shell service worker, nothing more.
 *
 * What it does: keeps the app's offline card and the immutable build assets
 * around, so an installed Renovate opens with a recognisable screen on site
 * instead of the browser's dinosaur.
 *
 * What it deliberately does NOT do: cache pages or data. Every estimate is
 * rendered on the server for the signed-in company, so a cached page could show
 * yesterday's prices — or, on a shared phone after a logout, another session's
 * client list. Budgets are read from the network or not at all.
 *
 * `sw.js` sits in `public/` and is served from the root, which is what gives it
 * the `/` scope the app needs (a worker under `/_next/` could not control pages).
 */

const SHELL_CACHE = 'renovate-shell-v1';
const STATIC_CACHE = 'renovate-static-v1';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // `reload` skips the HTTP cache: after a redeploy the new card must land,
      // not the copy the browser already had.
      await cache.add(new Request(OFFLINE_URL, { cache: 'reload' }));
      // Take over without waiting for every tab to close. Safe here because
      // nothing the worker caches is stale data.
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = [SHELL_CACHE, STATIC_CACHE];
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => !keep.includes(key)).map((key) => caches.delete(key)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Writes are the app's own business (Server Actions), and cross-origin calls
  // are Supabase's: never in the middle of either.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Hashed by the build, so a URL never points at two different files.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkWithOfflineCard(request));
    return;
  }

  // Everything else (RSC payloads, `/api/*`, manifest) goes straight to the
  // network, untouched.
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(STATIC_CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

async function networkWithOfflineCard(request) {
  try {
    return await fetch(request);
  } catch (error) {
    const offline = await caches.match(OFFLINE_URL);
    if (offline) return offline;
    throw error;
  }
}
