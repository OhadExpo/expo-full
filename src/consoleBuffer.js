// Global ring buffer for the last N console errors + window.onerror /
// unhandledrejection events. Consumed by BugReportButton so the user's
// description ships with the stack trace context that produced the bug
// instead of asking them to paste it manually.
//
// Installed once at module-import time. The patched console.error keeps
// the original behavior (still logs to the devtools console) and just
// also appends to the ring.

const MAX_ENTRIES = 25;
const ring = [];

// Listeners for error events — BugReportButton subscribes so it can
// surface itself only after an actual error has fired this session
// (Android crash-report behavior). Survives across SPA route changes
// since the buffer is module-singleton.
const errorListeners = new Set();
const SESSION_KEY = 'expo-bug-seen-error';

function push(entry) {
  ring.push(entry);
  if (ring.length > MAX_ENTRIES) ring.shift();
  if (entry?.level === 'error') {
    try { sessionStorage.setItem(SESSION_KEY, '1'); } catch {}
    errorListeners.forEach(cb => { try { cb(entry); } catch {} });
  }
}

export function onError(cb) {
  errorListeners.add(cb);
  return () => errorListeners.delete(cb);
}

// True if any error has fired in this browser session — survives SPA
// route changes via sessionStorage so the button stays visible after a
// crash on a previous page.
export function hasSeenError() {
  try { return sessionStorage.getItem(SESSION_KEY) === '1'; } catch { return false; }
}

let installed = false;
export function installConsoleBuffer() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  const origError = console.error.bind(console);
  console.error = (...args) => {
    try {
      const message = args.map(a => {
        if (a == null) return String(a);
        if (typeof a === 'string') return a;
        if (a instanceof Error) return a.message + (a.stack ? '\n' + a.stack : '');
        try { return JSON.stringify(a); } catch { return String(a); }
      }).join(' ');
      push({ at: new Date().toISOString(), level: 'error', message, source: 'console.error' });
    } catch {}
    origError(...args);
  };

  window.addEventListener('error', (ev) => {
    try {
      const message = ev?.error?.message || ev?.message || 'window.error';
      const stack = ev?.error?.stack || '';
      push({
        at: new Date().toISOString(),
        level: 'error',
        message: stack ? message + '\n' + stack : message,
        source: `${ev?.filename || ''}:${ev?.lineno || 0}`,
      });
    } catch {}
  });

  window.addEventListener('unhandledrejection', (ev) => {
    try {
      const reason = ev?.reason;
      const message = reason?.message || (typeof reason === 'string' ? reason : 'unhandledrejection');
      const stack = reason?.stack || '';
      push({
        at: new Date().toISOString(),
        level: 'error',
        message: stack ? message + '\n' + stack : message,
        source: 'unhandledrejection',
      });
    } catch {}
  });
}

export function snapshotConsoleBuffer() {
  return ring.slice();
}
