// THE CLUB'S OWN APP (16.10 #832, Ohad: "Make sure yehu can have a bhbc app with the logo and everything branded, that
// will lead to bhbc website or bhbc login"). public/boot-theme.js brands a page that LOADS on a club route; a club
// coach who signs in from expo-app.co.il landed on /coach/dashboard with EXPO's manifest, icon and title, so "Add to
// Home Screen" installed EXPO. This applies the same branding at runtime, wherever he entered, and marks the page
// (body data-club) so the install prompt speaks for the club too. Idempotent.
export const CLUB_PATH = /^\/(coach\/)?bhbc(\/|$)/;

export function applyClubBranding() {
  if (typeof document === 'undefined') return;
  try {
    let m = document.querySelector('link[rel="manifest"]');
    if (!m) { m = document.createElement('link'); m.rel = 'manifest'; document.head.appendChild(m); }
    if (m.getAttribute('href') !== '/bhbc.webmanifest') m.setAttribute('href', '/bhbc.webmanifest');
    document.querySelectorAll('link[rel="apple-touch-icon"]').forEach((l) => l.setAttribute('href', '/bhbc-icon-180.png'));
    const t = document.querySelector('meta[name="apple-mobile-web-app-title"]'); if (t) t.setAttribute('content', 'Bnei Herzliya');
    const c = document.querySelector('meta[name="theme-color"]'); if (c) c.setAttribute('content', '#14294F');
    if (document.title !== 'Bnei Herzliya') document.title = 'Bnei Herzliya';
    if (document.body && document.body.dataset.club !== 'bhbc') document.body.dataset.club = 'bhbc';
  } catch { /* branding never blocks the app */ }
}

// back to EXPO (a club coach signed out on a shared phone; the next person must not install the club)
export function removeClubBranding() {
  if (typeof document === 'undefined') return;
  try {
    const m = document.querySelector('link[rel="manifest"]'); if (m && m.getAttribute('href') === '/bhbc.webmanifest') m.setAttribute('href', '/manifest.webmanifest');
    document.querySelectorAll('link[rel="apple-touch-icon"]').forEach((l) => { if (l.getAttribute('href') === '/bhbc-icon-180.png') l.setAttribute('href', '/icon-180.png'); });
    const t = document.querySelector('meta[name="apple-mobile-web-app-title"]'); if (t && t.getAttribute('content') === 'Bnei Herzliya') t.setAttribute('content', 'EXPO');
    if (document.title === 'Bnei Herzliya') document.title = 'EXPO';
    if (document.body) delete document.body.dataset.club;
  } catch { /* never blocks */ }
}

export const isClubPage = () => typeof window !== 'undefined' && (CLUB_PATH.test(window.location.pathname) || (typeof document !== 'undefined' && document.body && document.body.dataset.club === 'bhbc'));
