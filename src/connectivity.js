// WHETHER THE SERVER CAN ACTUALLY BE REACHED, NOT WHETHER THE RADIO IS ON.
//
// Ohad (5.10 #560): "make sure it autonomously knows when there's not internet
// or wifi". navigator.onLine is the radio: on a gym's dead wifi it says true
// while every request hangs until its timeout, so the portal sat on "Loading…"
// and the queue never drained because nothing ever fired an 'online' event.
//
// This module asks the one question that matters - does a tiny GET to Supabase
// come back - and keeps the answer where every other module can read it:
//
//   'online'    the probe answered (any HTTP status is an answer: the gateway
//               was reached) within the budget
//   'degraded'  it answered, but slowly or with a server error - reachable,
//               not to be relied on
//   'offline'   the radio is off, or the probe failed / timed out
//
// Probed on load, on the browser's online/offline events, when the tab comes
// back, every 30 s while the tab is visible, and straight after any request the
// Supabase client saw fail. One probe at a time (callers share the one in
// flight) and never more often than every 2 s, so a queue retrying twenty rows
// cannot turn into twenty probes. A successful Supabase response is itself the
// answer, so the client reports those here and no probe is spent on them.
//
// No imports: offlineQueue.js is loaded under node by its tests with a stubbed
// window, and supabase.js hands the probe URL in at startup (it imports this
// file, so this file must not import it back).

const PROBE_TIMEOUT_MS = 4000;     // a health GET is ~40 ms on a live link
const SLOW_MS = 2500;              // answered, but slower than this = degraded
const PERIOD_MS = 30000;           // re-ask while the tab is visible and online
const PERIOD_OFFLINE_MS = 10000;   // ...and sooner while it is not: "as soon as the client has wifi"
const MIN_GAP_MS = 2000;           // failed-fetch probes are coalesced to this

let probeUrl = null;
let probeHeaders = null;
let state = (typeof navigator !== 'undefined' && navigator.onLine === false) ? 'offline' : 'online';
let lastProbeAt = 0;
let inflight = null;
const listeners = new Set();

export function setProbeUrl(url, headers = null) { probeUrl = url; probeHeaders = headers; }
// THE PROBE RUNS ONLY FOR A SIGNED-IN SEAT (5.10, the demo gate): a visitor on
// the public demo or the landing page has no queue to sync, and a request every
// 30 s per visitor was load for nothing - and an aborted one read as a failed
// request on the demo pages. auth.jsx turns it on with a session (a real one or
// the offline boot's stored one) and off at sign-out. Off: the state follows
// the browser's own online / offline events only.
let probeActive = false;
export function setProbeActive(on) {
  const was = probeActive; probeActive = !!on;
  if (probeActive && !was) setTimeout(() => { probeNow(); }, 0);
}

export function getState() { return state; }

/** fn(state) now, and on every change. Returns the unsubscribe. */
export function subscribe(fn) {
  listeners.add(fn);
  try { fn(state); } catch { /* a listener's problem */ }
  return () => listeners.delete(fn);
}

function setState(next) {
  if (next === state) return;
  state = next;
  for (const l of listeners) { try { l(state); } catch { /* keep notifying */ } }
  try { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('expo-connectivity', { detail: { state } })); } catch { /* no DOM */ }
}

/** A Supabase response came back: the server is reachable, no probe needed. */
export function noteSuccess() {
  lastProbeAt = Date.now();
  setState('online');
}

/** A Supabase request failed on the network: ask the server directly. */
export function noteFailure() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) { setState('offline'); return; }
  if (Date.now() - lastProbeAt < MIN_GAP_MS && !inflight) return;   // just asked
  probeNow();
}

/** Ask the server now. Resolves to the state; shares a probe already in flight. */
export function probeNow() {
  if (inflight) return inflight;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) { setState('offline'); return Promise.resolve(state); }
  if (!probeActive || !probeUrl || typeof fetch !== 'function') return Promise.resolve(state);
  const started = Date.now();
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const t = setTimeout(() => { try { ctl && ctl.abort(); } catch { /* noop */ } }, PROBE_TIMEOUT_MS);
  inflight = fetch(probeUrl, { method: 'GET', cache: 'no-store', headers: probeHeaders || undefined, signal: ctl ? ctl.signal : undefined })
    .then((r) => {
      const took = Date.now() - started;
      setState(r.status >= 500 || took > SLOW_MS ? 'degraded' : 'online');
    }, () => { setState('offline'); })
    .then(() => { clearTimeout(t); lastProbeAt = Date.now(); inflight = null; return state; });
  return inflight;
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  try {
    window.addEventListener('online', () => { probeNow(); });
    window.addEventListener('offline', () => { setState('offline'); });
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') probeNow(); });
    }
    const iv = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      if (state === 'online' && Date.now() - lastProbeAt < PERIOD_MS - 500) return;   // a response arrived lately
      probeNow();
    }, PERIOD_OFFLINE_MS);
    // on load, once supabase.js has handed the URL in (same tick, after imports)
    const t0 = setTimeout(() => { probeNow(); }, 0);
    // under node (the queue's tests stub a window) a live timer would keep the
    // process from exiting
    for (const h of [iv, t0]) if (h && typeof h.unref === 'function') h.unref();
  } catch { /* a stub window (tests) */ }
}
