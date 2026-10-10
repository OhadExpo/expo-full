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

import { getState as netState, subscribe as subscribeNet } from './connectivity.js';   // extension: the node tests import this file directly

const KEY = 'expo-offline-queue';
const MAX_ATTEMPTS = 5;
const DRAIN_INTERVAL_MS = 30000;
// A handler that never settles (a hung request behind the client's own
// timeouts, a lock that is never released) must not hold the whole queue: past
// this it counts as a transient failure and the pass moves on (5.10 #560).
const HANDLER_TIMEOUT_MS = 60000;
// After a failure an entry RESTS before it is tried again: 1 s, 2 s, 4 s ...
// capped at 60 s, with ±25% jitter so a hundred phones coming back on the same
// wifi do not retry in lockstep. Other entries are not held behind it.
const backoffMs = (attempts) => Math.min(60000, 1000 * 2 ** Math.max(0, (attempts || 1) - 1)) * (0.75 + Math.random() * 0.5);

const listeners = new Set();
const handlers = {};

// Queue entries are tagged with the auth uid active at enqueue time. Drain
// skips (preserves) entries belonging to a DIFFERENT signed-in user — on a
// shared device, user A's offline workout must not replay under B's JWT
// (RLS 42501 would classify it permanent and silently DESTROY it). A's
// entries drain when A signs back in. (audit 08-22)
let currentUid = null;
export function setQueueUser(uid) {
  const was = currentUid;
  currentUid = uid || null;
  // A workout parked because the session had lapsed (42501 with no live JWT)
  // waits for exactly this moment: drain as soon as a user is signed in again
  // instead of making the athlete wait for the 30s tick. (workout durability 27.9)
  if (currentUid && currentUid !== was && typeof window !== 'undefined') setTimeout(() => { drain(); }, 0);
}

// Workout rows are the one write that must NEVER leave the queue except by
// landing on the server. A permanent-looking error (RLS, constraint) on one of
// these parks it — kept, retried, and shown to the athlete as "not saved yet" —
// instead of the toast-and-vanish every other permanent error gets. The athlete's
// logged sets exist nowhere else once the logger closed. (workout durability 27.9)
const NEVER_DROP_TYPES = new Set(['client_workouts.upsert']);

// (Two writes of one workout row never overlap: useSupaStore runs the direct
// save and this queue's replay of client_workouts rows on one serial chain per
// row id, and each write checks its entry is still the current version.)

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
  return persistOk; // callers that stake durability on the enqueue (blobQueue) check this
}

export function registerHandler(type, fn) {
  handlers[type] = fn;
}

// `critical: true` marks a data-bearing write (a logged workout, a weigh-in)
// that must NEVER be silently dropped. On repeated transient failure such an
// entry is PARKED (kept + retried) instead of discarded after MAX_ATTEMPTS.
export function enqueue(opts) {
  return enqueueEntry(opts).durable;
}

// Same as enqueue(), but also hands back the new entry's id so a caller that
// enqueued BEFORE its own network attempt can remove exactly that entry once the
// server confirms (and leave a newer version of the same row alone).
export function enqueueEntry({ type, payload, dedupeKey, critical }) {
  const q = read();
  let next = q;
  if (dedupeKey) {
    next = q.filter(e => !(e.type === type && e.dedupeKey === dedupeKey));
  }
  const id = 'q_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  next.push({
    id,
    uid: currentUid || undefined,
    type,
    payload,
    dedupeKey: dedupeKey || null,
    critical: !!critical,
    attempts: 0,
    lastError: null,
    createdAt: Date.now(),
  });
  // durable is false if localStorage couldn't persist (quota) — the entry is in
  // memory only and won't survive a reload. A caller that trades a durable copy
  // (blobQueue deleting an uploaded blob, the logger deleting its draft) for this
  // reference MUST check it.
  return { id, durable: write(next) };
}

// Remove one entry by id (the direct save path's confirmed-success exit).
export function removeEntry(id) {
  const q = read();
  if (!q.some(e => e.id === id)) return;
  write(q.filter(e => e.id !== id));
}

// Merge fields into one entry by id (records a failed direct attempt so the
// athlete-facing "not saved yet" state can show it). No-op if it is gone.
export function patchEntry(id, patch) {
  const q = read();
  const i = q.findIndex(e => e.id === id);
  if (i < 0) return;
  const next = [...q];
  next[i] = { ...q[i], ...patch };
  write(next);
}

// Snapshot of the queue for UI (the athlete's "workout not saved yet" banner).
export function getEntries() {
  return read().map(e => ({ ...e }));
}

// SwUpdateBanner asks this before a silent reload: a workout row still waiting
// in the queue means the athlete's session exists only on this device.
// Only THIS user's entries that can still land by themselves count: another
// account's parked row (shared device) or a stuck one (needs the owner / a
// sign-in) would otherwise hold every future app update back indefinitely.
export function hasPendingWorkouts() {
  return read().some(e => NEVER_DROP_TYPES.has(e.type) && !e.stuck && (!e.uid || e.uid === currentUid));
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

// One timer for "the earliest resting entry is due": a failed pass books the
// next one itself instead of waiting for the 30 s tick (5.10 #560).
let retryTimer = null;
function scheduleRetry(ms) {
  if (!Number.isFinite(ms)) return;   // never a NaN timer (fires at once)
  if (typeof setTimeout !== 'function') return;
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = setTimeout(() => { retryTimer = null; drain(); }, Math.max(250, ms));
  if (retryTimer && typeof retryTimer.unref === 'function') retryTimer.unref();   // node tests
}

// drain({ now: true }) ignores the rest periods - the athlete's RETRY button and
// the pill's tap mean "try it again, now", not "when the backoff says".
export async function drain(opts) {
  const force = !!(opts && opts.now);
  if (draining) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  // the probe's word, not the radio's: on a dead wifi every attempt would hang
  // to its timeout and count against the entry (5.10 #560)
  if (netState() === 'offline') return;
  draining = true;
  // Track critical unknown-type entries we've already rotated this pass, so a
  // parked-to-tail entry can't spin the loop forever within one drain.
  const cycledUnknown = new Set();
  try {
    const cycledForeign = new Set();
    while (true) {
      const q = read();
      if (q.length === 0) break;
      // FIFO among the entries that are not resting after a failure; an entry
      // whose backoff has not elapsed is left in place and the rest go on.
      const now = Date.now();
      // ...but never past a resting entry for the SAME ROW (5.10 review N1): an
      // upsert waiting out its backoff, then a delete of that workout run first,
      // then the upsert lands and the deleted workout is back. Same table + same
      // row (or store key / body-weight filter) = keep their order.
      const rowOf = (e) => {
        const p = (e && e.payload) || {};
        // body weight: an upsert carries a row, a delete a filter - both keyed on
        // client|block|week so they can match (5.10 review 1005d #4b)
        const bw = String(e.type || '').startsWith('bw_logs') ? (p.row || p.filter) : null;
        const id = bw ? `${bw.client_id}|${bw.block_name}|${bw.week}` : (p.id || (p.row && p.row.id) || p.key || p.k || (p.filter && JSON.stringify(p.filter)));
        return id ? `${String(e.type || '').split('.')[0]}:${id}` : null;
      };
      const blocked = new Set();
      const next = q.find((e) => {
        const resting = !force && e.nextTryAt && e.nextTryAt > now;
        const rk = rowOf(e);
        if (resting) { if (rk) blocked.add(rk); return false; }
        return !(rk && blocked.has(rk));
      });
      if (!next) {
        // only entries that HAVE a rest time (5.10 review 1005d #4a: an entry blocked
        // behind a resting one has none -> NaN -> a timer that fired at once, a spin)
        // ...and only FUTURE ones (9.10 whole-diff review): a past-due entry
        // blocked behind a resting one for the same row booked the 250 ms floor
        // every pass - the phone re-read the queue 4x a second until the resting
        // one woke. It becomes eligible exactly when that one does, and that time
        // is already in this list.
        const rests = q.map((e) => e.nextTryAt).filter((t) => Number.isFinite(t) && t > now);
        if (rests.length) scheduleRetry(Math.min(...rests) - now);
        break;
      }
      // Foreign-user entry (or signed-out): keep it, rotate to tail, never
      // attempt it under the wrong (or no) JWT.
      if (next.uid && next.uid !== currentUid) {
        if (cycledForeign.has(next.id)) break; // full pass done — everything left is foreign
        cycledForeign.add(next.id);
        write([...q.filter((e) => e.id !== next.id), next]);
        continue;
      }
      const handler = handlers[next.type];
      if (!handler) {
        // Unknown op type. A NON-critical write is tolerable to drop (it can
        // never succeed without a handler). But a CRITICAL data-bearing write
        // must NEVER be silently dropped — a future deploy may re-register the
        // type, and the full row lives in the payload. Park it to the tail
        // (mirroring the retry-exhaustion path) + surface once, instead of
        // losing the athlete's data.
        if (next.critical) {
          if (cycledUnknown.has(next.id)) break; // already rotated this pass — stop
          cycledUnknown.add(next.id);
          const wasParked = next.parked;
          write([...q.filter((e) => e.id !== next.id), { ...next, parked: true }]);
          if (!wasParked && onErrorHook) {
            try { onErrorHook({ type: next.type, payload: next.payload, msg: 'Still saving — will retry when the app updates.' }); } catch {}
          }
          continue;
        }
        write(q.filter((e) => e.id !== next.id));
        continue;
      }
      try {
        // The entry is passed too, so a handler can tell whether it is still the
        // current version of its row when its turn on the row's chain comes.
        // Bounded: a handler that never settles is a transient failure, not a
        // frozen queue.
        let hung = null;
        try {
          await Promise.race([
            handler(next.payload, next),
            new Promise((_, rej) => { hung = setTimeout(() => rej(new Error('handler timeout - network wait, retrying')), HANDLER_TIMEOUT_MS); }),
          ]);
        } finally { if (hung) clearTimeout(hung); }
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
          // A workout row is never dropped, not even on a "permanent" error: RLS
          // (42501) is also what a lapsed session looks like, and a constraint
          // error today can be a policy the owner fixes tomorrow. Park it (kept,
          // rotated to the tail, retried on the next trigger); the athlete sees
          // it in the portal's "not saved yet" banner, so nothing is silent.
          if (NEVER_DROP_TYPES.has(next.type) && isPermanent(e)) {
            const wasParked = target.parked;
            const rest = cur.filter(x => x.id !== next.id);
            write([...rest, { ...target, parked: true, stuck: true, nextTryAt: Date.now() + backoffMs(target.attempts) }]);
            // Surface ONCE when it first parks (a coach-side save has no banner).
            if (!wasParked && onErrorHook) {
              try { onErrorHook({ type: next.type, payload: next.payload, msg: 'Workout not saved yet — kept on this device and retrying.' }); } catch {}
            }
            break;
          }
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
            write([...rest, { ...target, parked: true, nextTryAt: Date.now() + backoffMs(target.attempts) }]);
            if (!wasParked && onErrorHook) {
              try { onErrorHook({ type: next.type, payload: next.payload, msg: 'Still saving — will retry when the connection is back. (' + target.lastError + ')' }); } catch {}
            }
            break; // stop this pass; the parked op retries on the next trigger
          }
          target.nextTryAt = Date.now() + backoffMs(target.attempts);
          write(cur);
        }
        break; // stop the drain; reschedule by online/interval
      }
    }
  } finally {
    draining = false;
    // whatever is resting gets its own wake-up, until the server confirms it
    try {
      const t0 = Date.now();
      const left = read().filter((e) => e.nextTryAt && e.nextTryAt > t0 && (!e.uid || e.uid === currentUid));   // future rests only (see above)
      if (left.length) scheduleRetry(Math.min(...left.map((e) => e.nextTryAt)) - t0);
    } catch { /* the interval still runs */ }
  }
}

// PERSISTENT STORAGE, ASKED FOR ONCE (5.10 #560). Without it the browser may
// evict this origin's storage - the queue, the drafts, the cached programme -
// under pressure, silently. Chrome grants it to an installed PWA or an engaged
// site; asked after the first save landed, when there is something to protect.
let persistAsked = false;
export function ensurePersistentStorage() {
  if (persistAsked) return;
  persistAsked = true;
  try {
    if (typeof navigator === 'undefined' || !navigator.storage || typeof navigator.storage.persist !== 'function') return;
    if (typeof localStorage !== 'undefined' && localStorage.getItem('expo-storage-persisted') === '1') return;
    navigator.storage.persist().then((granted) => {
      if (granted) { try { localStorage.setItem('expo-storage-persisted', '1'); } catch { /* fine */ } }
    }).catch(() => {});
  } catch { /* not available */ }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { drain(); });
  // THE PROBE'S 'online', not the radio's (5.10 #560): a dead wifi fires no
  // 'online' event when it comes back to life; the probe notices within 30 s
  // (or at once, after the next request the app makes) and the queue drains
  // then. Transitions only - the first notification is just the current state,
  // and at import time no handler is registered yet.
  let lastNet = netState();
  subscribeNet((st) => {
    const was = lastNet;
    lastNet = st;
    if (st === 'online' && was !== 'online') drain();
  });
  // Skip the periodic wake-up while the tab is backgrounded — battery
  // friendly, especially on mobile PWAs where this can otherwise wake
  // every 30s for hours. The visibilitychange handler below catches up
  // immediately when the tab returns to foreground so the user never
  // waits for the next tick.
  setInterval(() => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    if (getCount() > 0) drain();
  }, DRAIN_INTERVAL_MS);
  // guarded like the interval above: under Node (scripts/test-offline-queue.mjs)
  // there is a window but no document, and this line crashed the import
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && getCount() > 0) drain();
  });
  // Best-effort initial drain on app load — handles the case where a tab
  // was last closed offline and reopened with network already up.
  setTimeout(() => { drain(); }, 1500);
}
