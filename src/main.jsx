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
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App/>
      <Analytics/>
    </ErrorBoundary>
  </React.StrictMode>
)
