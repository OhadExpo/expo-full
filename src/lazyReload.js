// lazy() that survives a deploy: the same guard App.jsx wraps every route in (see its lazyReload), for the lazy views
// that live outside App.jsx (16.10, review F12: a stale Tasks tab opening נכסים 404'd the old chunk into the error
// boundary - four deploys that day). On a chunk-load error it reloads the page ONCE (the sessionStorage flag App.jsx
// clears after a good mount), and never while offline, mid-upload or mid-workout - then the error boundary offers it.
import { lazy } from 'react';

const RELOAD_FLAG = 'expo-chunk-reload-once';   // the same key App.jsx sets and clears
const CHUNK_ERR_RX = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;
const unsafeToReload = () => { try { return navigator.onLine === false || (window.__expoUploadInFlight | 0) > 0 || (window.__expoWorkoutActive | 0) > 0; } catch { return false; } };

export function lazyReload(importFn) {
  return lazy(() => importFn().catch((err) => {
    if (err && err.message && CHUNK_ERR_RX.test(err.message)) {
      try {
        if (!sessionStorage.getItem(RELOAD_FLAG) && !unsafeToReload()) {
          sessionStorage.setItem(RELOAD_FLAG, '1');
          window.location.reload();
          return new Promise(() => {});   // parked: React.lazy never shows the error before the reload lands
        }
      } catch { /* storage blocked: fall through to the boundary */ }
    }
    throw err;
  }));
}
