// pwaInstall.js — ONE early, global capture of the PWA install event.
//
// `beforeinstallprompt` fires exactly ONCE per page load, and Chrome fires it
// early — before React mounts. A listener added inside a component's useEffect
// races that and usually misses it; worse, TWO components each listening means
// whichever mounts first (the LoginScreen) eats the event and the other (the
// post-sign-in modal) never sees it, since it is never re-dispatched. So we
// capture it here at module-eval time (this file is imported before React
// renders), stash it, and let every consumer READ the stash + subscribe to a
// replay instead of racing the native event. (Adversarial-review H1.)

let bipEvent = null;
const listeners = new Set();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    bipEvent = e;
    listeners.forEach((fn) => { try { fn(e); } catch { /* noop */ } });
  });
  window.addEventListener('appinstalled', () => { bipEvent = null; });
}

// The captured event (or null if Chrome hasn't offered install this load).
export function getInstallEvent() { return bipEvent; }
// A prompt() can only be used once — clear the stash after firing it.
export function clearInstallEvent() { bipEvent = null; }
// subscribe(fn): fires immediately if an event is already captured, and again if
// one arrives later. Returns an unsubscribe.
export function onInstallReady(fn) {
  listeners.add(fn);
  if (bipEvent) { try { fn(bipEvent); } catch { /* noop */ } }
  return () => listeners.delete(fn);
}

// iPad on iPadOS 13+ reports a DESKTOP 'Macintosh' UA (no 'iPad'), so the naive
// iPhone|iPad|iPod regex misses every iPad — detect a touch-capable Mac too.
// iOS/iPadOS never fire beforeinstallprompt, so this is how those users are nudged.
export function isIOS() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1);
}
// Add-to-Home-Screen from the Share sheet only produces an installed PWA in
// SAFARI on iOS — iOS Chrome/Firefox/Edge (all WebKit) can't, so don't hand them
// Safari-only steps.
export function isIOSSafari() {
  return isIOS() && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(navigator.userAgent || '');
}
// Running as the INSTALLED app (home-screen / standalone) — Android + iOS.
// The optional chain guards a missing matchMedia AND a null MediaQueryList.
export function isStandalone() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)')?.matches === true
    || window.navigator.standalone === true;
}
