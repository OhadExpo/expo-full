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

// ===== SELF-REPORTING (#887, Ohad 22.10: "bug report system needs be so much better, efficient, and self-solving") =====
// bug_reports held ZERO rows: the button only appears after an error, and nothing else ever wrote there. Now an
// uncaught error reports ITSELF - once per fingerprint per session, with the trail of what the user did before it and
// the commit it ran on - and a daemon step (scripts/bugs-to-queue.mjs) puts every new report on Claude's queue.

// THE TRAIL: the last 30 routes, taps and failed requests. A tap records the control's visible label (40 chars),
// never anything typed; a request records its status and path, never its query or body.
const TRAIL_MAX = 30;
const trail = [];
const crumb = (kind, what) => { trail.push({ at: new Date().toISOString().slice(11, 19), kind, what: String(what || '').slice(0, 80) }); if (trail.length > TRAIL_MAX) trail.shift(); };
export function snapshotTrail() { return trail.slice(); }

// the deployed commit (vite.config define), so a report names the release it ran on, not only a bundle hash
// eslint-disable-next-line no-undef
export const BUILD_SHA = typeof __BUILD_SHA__ !== 'undefined' ? __BUILD_SHA__ : '';

// ONE ERROR, ONE NAME: the message with its numbers, ids and hashes taken out, plus the first frame of OUR code with
// the bundle hash taken out - so the same bug on two builds or two athletes groups as one.
export function fingerprintOf(message, stack) {
  const msg = String(message || '').split('\n')[0].replace(/https?:\/\/\S+/g, '<url>').replace(/\b(?=[A-Za-z_-]*\d)[A-Za-z0-9_-]{8,}\b/g, '<id>').replace(/\d+/g, '#').slice(0, 140);
  const frame = (String(stack || '').split('\n').find((l) => /\/assets\/|\/src\//.test(l)) || '').replace(/-[A-Za-z0-9_-]{6,}\.js/g, '.js').replace(/:\d+:\d+/g, '').replace(/^\s*at\s*/, '').replace(/https?:\/\/[^/]+/, '').slice(0, 120);
  return `${msg} @ ${frame}`;
}

// Not ours, or not a bug: browser extensions, the ad blocker on the debug profile, a cancelled request, the
// ResizeObserver notice every browser prints, and the opaque cross-origin "Script error."
const NOISE = /ResizeObserver loop|^Script error\.?$|chrome-extension:|moz-extension:|ERR_BLOCKED_BY_CLIENT|AbortError|The user aborted|signal is aborted/i;
const AUTO_MAX = 3;            // per tab session: a broken page must not file a report per render
let autoSent = 0;
const autoSeen = new Set();
function autoReport(message, stack, source) {
  try {
    // an extension frame disqualifies an error only when NONE of our code is in the stack: extensions (ad blockers,
    // password managers) wrap window.fetch, so a real app fetch failure carries their frame too (22.10 probe: it was
    // dropped as noise on a profile with one installed)
    const st = String(stack || '');
    if (NOISE.test(String(message || '')) || (NOISE.test(st) && !/\/assets\/|\/src\//.test(st))) return;
    if (!/^https?:$/.test(location.protocol) || /^(localhost|127\.)/.test(location.hostname)) return;   // dev servers have no /api
    const fp = fingerprintOf(message, stack);
    let seen = []; try { seen = JSON.parse(sessionStorage.getItem('expo-bug-auto-fps') || '[]'); } catch { /* */ }
    if (autoSeen.has(fp) || seen.includes(fp) || autoSent >= AUTO_MAX) return;
    autoSeen.add(fp); autoSent += 1;
    try { sessionStorage.setItem('expo-bug-auto-fps', JSON.stringify([...seen, fp].slice(-20))); } catch { /* */ }
    const body = {
      description: `AUTO · ${String(message || '').split('\n')[0].slice(0, 300)}`,
      role: 'auto',
      url: location.href.replace(/[?#].*$/, ''),
      context: { auto: true, fingerprint: fp, source, release: BUILD_SHA, stack: String(stack || '').slice(0, 2000), trail: snapshotTrail(), consoleErrors: ring.slice(-5), ua: navigator.userAgent, viewport: { w: innerWidth, h: innerHeight }, theme: document.documentElement.getAttribute('data-theme') || '', locale: navigator.language },
    };
    // a signed-in tab says who it was (the server reads the token, never the body)
    import('./supabase').then(({ supabase }) => supabase.auth.getSession()).then(({ data }) => data && data.session && data.session.access_token).catch(() => null)
      .then((tok) => fetch('/api/report-bug', { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) }, body: JSON.stringify(body) }))
      .catch(() => { /* reporting never throws */ });
  } catch { /* never */ }
}

// A FEATURE THAT GAVE UP files itself like a thrown error (#974: the trimmer that did not show on his phone left no trace)
export function reportIssue(message, source) { autoReport(message, '', source); }

// A SCREEN THAT NEVER LOADS throws nothing (#909, 23.10: a couple's block preview sat on 'Loading your program' for an
// hour and only Ohad's phone screenshot said so). A loading screen still up after 20s, in a tab someone is looking at,
// files itself exactly like a thrown error: same table, same queue, grouped by the screen.
export function watchStuck(label, ms = 20000) {
  if (typeof window === 'undefined') return () => {};
  const t = setTimeout(() => {
    if (document.visibilityState !== 'visible') return;   // a background tab is allowed to wait
    // the route is in the MESSAGE (ids become <id> in the fingerprint), so two different screens stuck on the same
    // words are two reports, not one (#933 review: the portal and the couple preview both say 'Loading your program')
    autoReport(`STUCK · ${label} still on screen after ${Math.round(ms / 1000)}s on ${location.pathname}`, '', `stuck:${location.pathname}`);
  }, ms);
  return () => clearTimeout(t);
}

let trailInstalled = false;
export function installSelfReporting() {
  if (trailInstalled || typeof window === 'undefined') return;
  trailInstalled = true;
  crumb('route', location.pathname);
  const wrap = (k) => { const orig = history[k]; history[k] = function (...a) { const r = orig.apply(this, a); try { crumb('route', location.pathname); } catch { /* */ } return r; }; };
  try { wrap('pushState'); wrap('replaceState'); } catch { /* */ }
  window.addEventListener('popstate', () => crumb('route', location.pathname));
  document.addEventListener('click', (ev) => {
    try {
      const el = ev.target && ev.target.closest && ev.target.closest('button, a, [role="button"], [role="tab"], summary, label');
      if (!el || el.closest('input, textarea, [contenteditable="true"]')) return;
      const label = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || el.tagName).replace(/\s+/g, ' ').trim().slice(0, 40);
      crumb('tap', label);
    } catch { /* */ }
  }, { capture: true, passive: true });
  try {
    const of = window.fetch;
    window.fetch = function (...a) {
      const u = String((a[0] && a[0].url) || a[0] || '');
      return of.apply(this, a).then((r) => { if (r && r.status >= 400) crumb('http', `${r.status} ${u.replace(/^https?:\/\/[^/]+/, '').replace(/\?.*/, '').slice(0, 70)}`); return r; },
        (e) => { if (!/AbortError/.test(String(e && e.name))) crumb('http', `failed ${u.replace(/^https?:\/\/[^/]+/, '').replace(/\?.*/, '').slice(0, 70)}`); throw e; });
    };
  } catch { /* */ }
  window.addEventListener('error', (ev) => { if (ev && ev.error) autoReport(ev.error.message || ev.message, ev.error.stack, `${ev.filename || ''}:${ev.lineno || 0}`); });
  window.addEventListener('unhandledrejection', (ev) => { const r = ev && ev.reason; autoReport((r && r.message) || (typeof r === 'string' ? r : 'unhandledrejection'), r && r.stack, 'unhandledrejection'); });
  // A STALE CHUNK HEALS ITSELF: after a deploy an open tab asks for a chunk that no longer exists. Vite raises
  // vite:preloadError for it; one reload brings the new build. Guarded so a truly missing chunk cannot loop.
  window.addEventListener('vite:preloadError', (ev) => {
    try {
      const last = Number(sessionStorage.getItem('expo-preload-reload-at') || 0);
      if (Date.now() - last < 60000) return;
      sessionStorage.setItem('expo-preload-reload-at', String(Date.now()));
      if (ev && ev.preventDefault) ev.preventDefault();
      crumb('remedy', 'stale chunk -> reload');
      // through a clean cache (#903): the bad copy may live in the worker's precache
      import('./lazyReload').then((m) => m.purgePrecacheThenReload()).catch(() => location.reload());
    } catch { /* */ }
  });
}
