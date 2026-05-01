// Offline write queue. Failed Supabase writes get persisted to localStorage
// and replayed once connectivity returns. Each queued entry has a `type`
// (mapped to a handler at module init), a `payload`, and optional
// `dedupeKey` so repeated writes to the same row (e.g. a debounced auto-
// save) collapse to just the latest value.
//
// FIFO drain order — `online` event triggers it, plus a periodic check so
// flaky connections eventually catch up. A failed handler bumps `attempts`;
// after MAX_ATTEMPTS the entry is dropped and an error is emitted so the
// user sees that something is permanently stuck.
//
// What this does NOT do (yet):
//   - form video uploads (binary blobs are too big for localStorage)
//   - cross-op ordering (a delete after an update for the same row replays
//     in arrival order, last-write-wins; fine for one coach + one client
//     device at this scale)

const KEY = 'expo-offline-queue';
const MAX_ATTEMPTS = 5;
const DRAIN_INTERVAL_MS = 30000;

const listeners = new Set();
const handlers = {};

function read() {
  try {
    const s = localStorage.getItem(KEY);
    return s ? JSON.parse(s) : [];
  } catch {
    return [];
  }
}

function write(arr) {
  try { localStorage.setItem(KEY, JSON.stringify(arr)); } catch {}
  for (const l of listeners) {
    try { l(arr.length); } catch {}
  }
}

export function registerHandler(type, fn) {
  handlers[type] = fn;
}

export function enqueue({ type, payload, dedupeKey }) {
  const q = read();
  let next = q;
  if (dedupeKey) {
    next = q.filter(e => !(e.type === type && e.dedupeKey === dedupeKey));
  }
  next.push({
    id: 'q_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36),
    type,
    payload,
    dedupeKey: dedupeKey || null,
    attempts: 0,
    lastError: null,
    createdAt: Date.now(),
  });
  write(next);
}

export function getCount() {
  return read().length;
}

export function subscribe(fn) {
  listeners.add(fn);
  // Fire immediately so subscribers can render initial state.
  try { fn(getCount()); } catch {}
  return () => listeners.delete(fn);
}

let draining = false;
let onErrorHook = null;

export function setOnError(fn) {
  onErrorHook = fn;
}

// Permanent errors — RLS, auth, constraint violations — never succeed on retry.
// Drop them on the first failure so the user sees a toast immediately instead
// of waiting MAX_ATTEMPTS × DRAIN_INTERVAL_MS (~150s) of silent looping.
function isPermanent(err) {
  const code = err?.code || '';
  if (typeof code === 'string') {
    if (/^23\d{3}$/.test(code)) return true;     // integrity constraints
    if (code === '42501') return true;            // RLS
    if (code.startsWith('PGRST')) return true;    // PostgREST request errors
  }
  const msg = (err?.message || String(err || '')).toLowerCase();
  return msg.includes('row-level security') || msg.includes('permission denied') ||
         msg.includes('not authorized') || msg.includes('unauthorized') ||
         msg.includes('jwt expired') || msg.includes('invalid jwt') ||
         msg.includes('duplicate key') || msg.includes('violates') ||
         msg.includes('check constraint') || msg.includes('foreign key');
}

export async function drain() {
  if (draining) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  draining = true;
  try {
    while (true) {
      const q = read();
      if (q.length === 0) break;
      const next = q[0];
      const handler = handlers[next.type];
      if (!handler) {
        // Unknown op type — drop and continue. Writes that depend on a
        // missing handler can't ever succeed; better to log and move on
        // than to loop forever.
        write(q.slice(1));
        continue;
      }
      try {
        await handler(next.payload);
        // Re-read to avoid clobbering newer enqueues that landed during
        // the await.
        const cur = read();
        write(cur.filter(e => e.id !== next.id));
      } catch (e) {
        const cur = read();
        const target = cur.find(x => x.id === next.id);
        if (target) {
          target.attempts = (target.attempts || 0) + 1;
          target.lastError = e?.message || String(e);
          // Permanent errors: drop now, surface a toast, and keep draining the
          // rest of the queue — don't let a bad payload hold up unrelated work.
          if (isPermanent(e) || target.attempts >= MAX_ATTEMPTS) {
            const filtered = cur.filter(x => x.id !== next.id);
            write(filtered);
            if (onErrorHook) {
              try { onErrorHook({ type: next.type, payload: next.payload, msg: target.lastError }); } catch {}
            }
            continue;
          } else {
            write(cur);
          }
        }
        break; // stop the drain; reschedule by online/interval
      }
    }
  } finally {
    draining = false;
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { drain(); });
  // Skip the periodic wake-up while the tab is backgrounded — battery
  // friendly, especially on mobile PWAs where this can otherwise wake
  // every 30s for hours. The visibilitychange handler below catches up
  // immediately when the tab returns to foreground so the user never
  // waits for the next tick.
  setInterval(() => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    if (getCount() > 0) drain();
  }, DRAIN_INTERVAL_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && getCount() > 0) drain();
  });
  // Best-effort initial drain on app load — handles the case where a tab
  // was last closed offline and reopened with network already up.
  setTimeout(() => { drain(); }, 1500);
}
