import './themes.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import App from './App.jsx'
import ErrorBoundary from './ErrorBoundary.jsx'
import { installConsoleBuffer } from './consoleBuffer.js'

// Patch console.error + listen for window error events BEFORE React renders
// so the BugReportButton always has stack-trace context for what blew up.
installConsoleBuffer();
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App/>
      <Analytics/>
    </ErrorBoundary>
  </React.StrictMode>
)
