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

// In-memory mirror + persist flag. The queue holds an athlete's logged workout /
// weigh-in, so a full localStorage must NOT silently drop it. Normal reads still
// come from localStorage (cross-tab aware); only after a persist FAILS do we trust
// the in-memory mirror so this session's drain can still ship the entry — and the
// athlete gets a real "storage full" message instead of a badge that lies.
let mem = null;
let persistOk = true;

function read() {
  if (!persistOk && mem !== null) return mem; // localStorage is stale (last write couldn't persist) — memory is the truth
  try {
    const s = localStorage.getItem(KEY);
    mem = s ? JSON.parse(s) : [];
    return mem;
  } catch {
    return mem || [];
  }
}

function write(arr) {
  mem = arr; // record in memory FIRST, before the persist that might throw
  try {
    localStorage.setItem(KEY, JSON.stringify(arr));
    persistOk = true;
  } catch {
    persistOk = false;
    if (onErrorHook) {
      try { onErrorHook({ type: 'storage', payload: null, msg: 'Storage is full — your log is queued but won\'t survive a page refresh until you free up space.' }); } catch {}
    }
  }
  for (const l of listeners) {
    try { l(arr.length); } catch {}
  }
}

export function registerHandler(type, fn) {
  handlers[type] = fn;
}

// `critical: true` marks a data-bearing write (a logged workout, a weigh-in)
// that must NEVER be silently dropped. On repeated transient failure such an
// entry is PARKED (kept + retried) instead of discarded after MAX_ATTEMPTS.
export function enqueue({ type, payload, dedupeKey, critical }) {
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
    critical: !!critical,
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
// TRULY permanent: the write can never succeed as-is because the ROW is
// invalid or forbidden (integrity constraint / RLS). These are safe to drop
// on any write. Auth-TOKEN errors (jwt expired/invalid, unauthorized,
// PGRST301/302) are DELIBERATELY NOT here: supabase-js refreshes the session
// and the identical write then succeeds, so classifying them permanent would
// throw away a logged workout / weigh-in that hit a token-refresh window.
// Those fall through to the retry/park path instead — a critical write is
// never lost to a transient auth blip.
function isPermanent(err) {
  const code = err?.code || '';
  if (typeof code === 'string') {
    if (/^23\d{3}$/.test(code)) return true;     // integrity constraints
    if (code === '42501') return true;            // RLS
    // PostgREST request errors are permanent EXCEPT the auth-token ones
    // (301 = JWT expired, 302 = anon disallowed) which recover after refresh.
    if (code.startsWith('PGRST') && code !== 'PGRST301' && code !== 'PGRST302') return true;
  }
  const msg = (err?.message || String(err || '')).toLowerCase();
  return msg.includes('row-level security') || msg.includes('permission denied') ||
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
          // Permanent errors (RLS/constraint/auth) can never succeed — drop now,
          // toast, and keep draining the rest. A non-critical op that exhausts
          // its retries is also dropped (its loss is tolerable).
          if (isPermanent(e) || (target.attempts >= MAX_ATTEMPTS && !target.critical)) {
            const filtered = cur.filter(x => x.id !== next.id);
            write(filtered);
            if (onErrorHook) {
              try { onErrorHook({ type: next.type, payload: next.payload, msg: target.lastError }); } catch {}
            }
            continue;
          }
          if (target.attempts >= MAX_ATTEMPTS && target.critical) {
            // Data-bearing write on a flaky connection: NEVER drop it. Park it —
            // rotate to the tail so it can't head-of-line-block other ops, keep
            // it queued to retry on the next online/interval/visibility trigger,
            // and surface ONCE so the athlete knows it's still saving. The full
            // row lives in the payload, so nothing is lost even across a reload.
            const wasParked = target.parked;
            const rest = cur.filter(x => x.id !== next.id);
            write([...rest, { ...target, parked: true }]);
            if (!wasParked && onErrorHook) {
              try { onErrorHook({ type: next.type, payload: next.payload, msg: 'Still saving — will retry when the connection is back. (' + target.lastError + ')' }); } catch {}
            }
            break; // stop this pass; the parked op retries on the next trigger
          }
          write(cur);
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
