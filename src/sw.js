// Custom service worker — handles Workbox precaching (so we keep the
// PWA behavior we already had) AND Web Push events (`push` shows the
// notification, `notificationclick` focuses or opens the app).
//
// vite-plugin-pwa picks this file up via the `injectManifest` strategy:
// it injects __WB_MANIFEST at build time so precacheAndRoute knows what
// to precache. The rest of the listeners run as normal SW code.
//
// Switched from generateSW (Workbox-only, no push) → injectManifest on
// 2026-05-16 when push notifications shipped. If a future change needs
// to revert, swap `strategies: 'injectManifest'` back to the default
// in vite.config.js and delete this file.

import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL, addPlugins } from 'workbox-precaching';
import { setCacheNameDetails } from 'workbox-core';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

// PROMPT update flow (registerType:'prompt'): a new SW must NOT skip-waiting on
// install — it has to WAIT so useRegisterSW (SwUpdateBanner) can detect it and
// show "NEW VERSION". The previous `skipWaiting()` on install broke the cycle:
// the new SW activated immediately, updateServiceWorker(true) had nothing to
// message, so the banner never cleared and the page never hard-refreshed —
// users kept running stale code. Now we skip-waiting ONLY when the page asks
// (vite-plugin-pwa posts {type:'SKIP_WAITING'} from updateServiceWorker(true)).
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// A SCRIPT IS NEVER CACHED AS A PAGE (23.10, found by the post-deploy smoke: the dashboard rendered 271 characters).
// A worker that installed while Vercel's edge was still swapping deployments asked for a new chunk the old deployment did
// not have; the catch-all rewrite answered with index.html and a 200, and Workbox - which trusts a hashed URL - stored
// that HTML AS the chunk, forever (the URL never changes). Now: a .js that is not JavaScript, or a .css that is not CSS,
// is refused - the install fails and the browser retries it later, instead of caching a page. (vercel.json no longer
// rewrites /assets/* either, so a missing asset is a 404.)
addPlugins([{
  cacheWillUpdate: async ({ request, response }) => {
    if (!response || response.status !== 200) return null;
    const ct = response.headers.get('content-type') || '';
    const u = request.url || '';
    if (/\.m?js(\?|$)/.test(u) && !/javascript/.test(ct)) return null;
    if (/\.css(\?|$)/.test(u) && !/css/.test(ct)) return null;
    return response;
  },
}]);
// A NEW PRECACHE NAME: every browser whose cache holds an HTML page under a chunk's URL downloads everything again into a
// clean cache; the poisoned one is deleted when this worker activates.
setCacheNameDetails({ prefix: 'expo', suffix: 'v3' });
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => /^workbox-precache-/.test(k)).map((k) => caches.delete(k)))));
});
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST || []);

// Deep-path offline fallback (offline-lifecycle audit #2). The app is PATH-routed
// (/coach/dashboard, /athlete, …), so a RELOAD or webview-restore while offline
// requests that exact path — which isn't precached → white screen for an
// offline-first gym app. Serve the precached index.html for any navigation
// request so the SPA boots offline on ANY route (the client router then takes
// over). Deny-list API/auth and asset-looking paths so only real navigations hit it.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    denylist: [/^\/api\//, /^\/auth\//, /\/[^/?]+\.[^/?]+$/],
  })
);

// Runtime caches for the two things the precache cannot hold because they are
// cross-origin: the MediaPipe WASM (jsdelivr, ~3MB) and the pose model (Google
// storage, ~9MB). Both URLs are version-pinned and never change in place.
// Measured on production 2026-09-07: without this, every coach page view that
// touched pose (the auto-analyse warmer, the camera tools) downloaded both
// again - 6.8MB and 7.3MB warm loads of the dashboard and the club zone, on a
// wifi Ohad already thought was slow. CacheFirst: fetched once per device.
const isMediaPipe = ({ url }) =>
  (/(^|\.)cdn\.jsdelivr\.net$/.test(url.hostname) && /@mediapipe\/tasks-vision/.test(url.pathname))
  || (/(^|\.)storage\.googleapis\.com$/.test(url.hostname) && /\/mediapipe-models\//.test(url.pathname));
registerRoute(isMediaPipe, new CacheFirst({
  cacheName: 'mediapipe-v1',
  plugins: [
    new CacheableResponsePlugin({ statuses: [0, 200] }),
    new ExpirationPlugin({ maxEntries: 12, maxAgeSeconds: 180 * 24 * 3600 }),
  ],
}));

// YouTube poster frames for the tap-to-play facade (VideoEmbed.YouTubeLite):
// a demo the athlete opens every session should not re-fetch its poster.
registerRoute(({ url }) => /(^|\.)ytimg\.com$/.test(url.hostname), new StaleWhileRevalidate({
  cacheName: 'yt-posters-v1',
  plugins: [
    new CacheableResponsePlugin({ statuses: [0, 200] }),
    new ExpirationPlugin({ maxEntries: 300, maxAgeSeconds: 30 * 24 * 3600 }),
  ],
}));

// ---------------------------------------------------------------------
// Web Push handlers
// ---------------------------------------------------------------------

// `push` event fires when the push service delivers a payload. The
// server-side /api/push/send encrypts a JSON payload with the device's
// keys; we decrypt + show the notification.
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload = {};
  try { payload = event.data.json(); }
  catch { payload = { title: 'EXPO', body: event.data.text() }; }

  const {
    title = 'EXPO',
    body  = '',
    icon  = '/icon-192.png',
    badge = '/icon-192.png',
    tag,                 // de-dup key — same tag replaces previous
    url   = '/',         // where to navigate on click
    requireInteraction = false,
  } = payload;

  event.waitUntil(
    self.registration.showNotification(title, {
      body, icon, badge, tag, requireInteraction,
      data: { url },
    })
  );
});

// `notificationclick` — focus the app if open, otherwise open it at
// the URL the push specified (e.g., a trainee's message thread).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // Security: the push payload's `url` is attacker-influenceable (any authenticated
  // session can trigger a push), so treat it as untrusted. Only ever navigate/open
  // a SAME-ORIGIN path — resolve against our origin and coerce anything off-origin
  // back to the app root. Prevents a trusted-EXPO-notification → external-phishing
  // open-redirect.
  let targetUrl = '/';
  try {
    const u = new URL(event.notification.data?.url || '/', self.location.origin);
    targetUrl = u.origin === self.location.origin ? (u.pathname + u.search + u.hash) : '/';
  } catch { targetUrl = '/'; }

  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({
      type: 'window', includeUncontrolled: true,
    });
    // If a window is already open, focus it and navigate.
    for (const client of allClients) {
      if (client.url.startsWith(self.location.origin)) {
        await client.focus();
        // ROUTE INSIDE THE OPEN APP, DON'T RELOAD IT (2.10 #510-R2 M9):
        // client.navigate() is a full page load - whatever the coach or athlete
        // had in memory and unsaved went with it. The app is asked first and
        // routes in place; only an app that does not answer (an older bundle)
        // gets the old full navigation.
        const handled = await new Promise((res) => {
          try {
            const mc = new MessageChannel();
            const t = setTimeout(() => res(false), 1500);
            mc.port1.onmessage = () => { clearTimeout(t); res(true); };
            client.postMessage({ type: 'expo-navigate', url: targetUrl }, [mc.port2]);
          } catch { res(false); }
        });
        if (!handled && 'navigate' in client) {
          try { await client.navigate(targetUrl); } catch {}
        }
        return;
      }
    }
    // Otherwise open a new window.
    await self.clients.openWindow(targetUrl);
  })());
});
