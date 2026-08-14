import './themes.css'
// Import BEFORE React so the global beforeinstallprompt capture is registered
// before Chrome fires it (it fires once, early — a component listener misses it).
import './pwaInstall.js'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import App from './App.jsx'
import ErrorBoundary from './ErrorBoundary.jsx'
import { installConsoleBuffer } from './consoleBuffer.js'
import { installCopyGuard } from './copyGuard.js'

// Patch console.error + listen for window error events BEFORE React renders
// so the BugReportButton always has stack-trace context for what blew up.
installConsoleBuffer();
// Block copy + right-click site-wide (anti-scraping); the program editor opts
// back in via data-allow-copy so Ohad can copy/paste while building programs.
installCopyGuard();
// LOCALHOST DEV GUARD: the injectManifest service worker precaches the bundle,
// which repeatedly served STALE code during local preview — a rebuild's changes
// stayed invisible until a manual hard-refresh (the root cause of a whole QA
// session's worth of "nothing changed" confusion). On localhost we actively kill
// any SW + its caches on every load, so the preview is ALWAYS the latest build.
// Production (expo-app.co.il) is untouched — the PWA/offline layer stays intact.
if (typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)) {
  try {
    navigator.serviceWorker?.getRegistrations?.().then(rs => rs.forEach(r => r.unregister())).catch(() => {});
    window.caches?.keys?.().then(ks => ks.forEach(k => caches.delete(k))).catch(() => {});
  } catch { /* noop */ }
}
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App/>
      <Analytics/>
    </ErrorBoundary>
  </React.StrictMode>
)
