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

import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';

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

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST || []);

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
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({
      type: 'window', includeUncontrolled: true,
    });
    // If a window is already open, focus it and navigate.
    for (const client of allClients) {
      if (client.url.startsWith(self.location.origin)) {
        await client.focus();
        if ('navigate' in client) {
          try { await client.navigate(targetUrl); } catch {}
        }
        return;
      }
    }
    // Otherwise open a new window.
    await self.clients.openWindow(targetUrl);
  })());
});
