// src/useSupaStore.js — Supabase-backed storage hook (replaces useStore)
import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from './supabase';
import { enqueue, enqueueEntry, removeEntry, patchEntry, getEntries, registerHandler, drain, setOnError } from './offlineQueue';
import { setOnError as setBlobOnError } from './blobQueue';
import { checkStoreWrite } from './storeWriteGuard';
import { mergeStoreValues, deepEqual } from './storeMerge';
import { TRAINER_EMAILS } from './authRoles';
import { canSeatWrite, recordBlockedWrite } from './seatWrite';

// The size the shrink rule compares against. An array is its length; an OBJECT
// store is its key count — the BHBC season stores (expo-bhbc-loads, -medical,
// -plans) are keyed by athlete id, and leaving this null meant the shrink rule
// could never fire for them even once the server value was known.
// SNAPSHOTS MUST NEVER CONSUME THE SPACE THE SESSION NEEDS.
//
// These localStorage copies are an offline convenience: every one of them can
// be refetched from Supabase. The auth token cannot - and it lives in the same
// origin quota. On 2026-08-30 Ohad could not sign in on any surface:
//
//   QuotaExceededError: Failed to execute 'setItem' on 'Storage': setting the
//   value of 'sb-gtcbfglttoiyfsnfbhdy-auth-token' exceeded the quota.
//
// Sign-in succeeded every time and the token was then thrown away, which looks
// exactly like a login failure. Evicting caches at the moment of failure was
// tried first and measured NOT to work - with storage genuinely exhausted the
// session still failed to persist - so the space is reserved up front instead.
//
// A snapshot write that would eat into the reserve is skipped. Skipping costs
// one refetch. Not skipping costs the user their account.
const LS_QUOTA_EST = 5 * 1024 * 1024;   // the usual per-origin allowance
const LS_RESERVE = 1024 * 1024;         // always left free for auth + headroom

const lsUsedBytes = () => {
  let n = 0;
  try {
    for (const k of Object.keys(localStorage)) n += k.length + (localStorage.getItem(k) || '').length;
  } catch { return Infinity; }   // cannot measure - assume no room
  return n;
};

// The workout cache is the one store that grows without limit: measured at
// 3.2 KB per logged workout, so 500 athletes with a season each projects to
// ~94 MB against a ~5 MB quota. Headcount is not the driver - logged history
// is, and it never stops growing.
//
// The cache exists so a returning device has something to show instantly. That
// job is done by the RECENT rows; the deep history is a server fetch away. So
// the newest rows that fit a budget are kept and the rest are left to the
// server, which makes the cache flat at any roster size instead of unbounded.
//
// Rows arrive ordered by date descending (see the client_workouts select), so
// "newest first" is already true and trimming is a prefix.
const CW_BUDGET = 384 * 1024;

const trimToBudget = (rows, budget) => {
  if (!Array.isArray(rows)) return rows;
  const out = [];
  let used = 0;
  for (const r of rows) {
    const n = JSON.stringify(r).length + 1;
    if (used + n > budget) break;
    out.push(r);
    used += n;
  }
  return out;
};

/** Snapshot a newest-first list, keeping only what fits the budget. */
export const lsSnapshotRecent = (key, rows, budget = CW_BUDGET) =>
  lsSnapshot(key, trimToBudget(rows, budget));

// NOTHING MAY WRITE A SNAPSHOT WHILE SIGNED OUT.
//
// The purge in auth.jsx signOut() runs while every store is still mounted, so
// a read that resolves a moment later happily re-created the file that had just
// been deleted. Measured on the physio seat: expo-bhbc-fixtures and expo-cw
// were both back on the phone after pressing Sign out, and both are keys the
// purge explicitly covers - it deleted them and they came straight back.
//
// One latch, at the single choke point every snapshot goes through.
let snapshotsAllowed = true;
export const setSnapshotsAllowed = (v) => { snapshotsAllowed = !!v; };

/** Write a snapshot only if it leaves the reserve intact. Returns success. */
export const lsSnapshot = (key, val) => {
  // a direct write is the newest value: an older one still waiting for the
  // idle flush must not land on top of it later (29.9 audit)
  pendingSnaps.delete(key);
  if (!snapshotsAllowed) return false;
  try {
    const text = JSON.stringify(val);
    const existing = (localStorage.getItem(key) || '').length;
    if (lsUsedBytes() - existing + text.length > LS_QUOTA_EST - LS_RESERVE) {
      // Too big to hold without crowding the session: drop any stale copy so
      // the app reads from the server rather than trusting a partial one.
      try { localStorage.removeItem(key); } catch { /* nothing to do */ }
      return false;
    }
    localStorage.setItem(key, text);
    return true;
  } catch { return false; }
};

// SNAPSHOTS OFF THE CLICK (29.9 #422). A save used to stringify the whole value
// and rescan every localStorage key (up to ~4 MB) synchronously, inside the
// tap that made it. The snapshot is only a cache - the server write and the
// offline queue carry the data - so it is written in the next idle moment
// (within a second), latest value per key wins, and the signed-out latch is
// still checked at write time.
const pendingSnaps = new Map();
let snapScheduled = false;
const flushSnaps = () => {
  snapScheduled = false;
  const batch = [...pendingSnaps.entries()];
  pendingSnaps.clear();
  for (const [k, v] of batch) { try { lsSnapshot(k, v); } catch { /* cache only */ } }
};
export const lsSnapshotSoon = (key, val) => {
  pendingSnaps.set(key, val);
  if (snapScheduled) return;
  snapScheduled = true;
  try {
    if (typeof window !== 'undefined' && window.requestIdleCallback) window.requestIdleCallback(flushSnaps, { timeout: 1000 });
    else setTimeout(flushSnaps, 200);
  } catch { setTimeout(flushSnaps, 200); }
};

const storeSize = (v) => (Array.isArray(v) ? v.length
  : (v !== null && typeof v === 'object' && !(v instanceof Date)) ? Object.keys(v).length
  : null);

// ─────────────────────────────────────────────────────────────
// Save-error emitter. Every silent `catch {}` around a Supabase
// write used to mean: write failed, user typed into the void,
// next page load overwrote the local cache with pre-save data,
// work lost. Hooks now call `emitSaveError()` on failure and the
// app mounts a toast (see SaveErrorToast in auth.jsx) that shows
// the user something went wrong — no forced retries, no silent
// loss. Coach / client can see what's happening.
// ─────────────────────────────────────────────────────────────
const saveErrorListeners = new Set();
export function onSaveError(listener) {
  saveErrorListeners.add(listener);
  return () => saveErrorListeners.delete(listener);
}
export function emitSaveError(err) {
  for (const l of saveErrorListeners) {
    try { l(err); } catch {}
  }
}

// Forward queue-permanent failures (after MAX_ATTEMPTS) to the same toast bus
// so users see writes that gave up rather than discovering them missing later.
setOnError((e) => emitSaveError({ key: e.type, op: 'queue-drop', msg: e.msg }));
setBlobOnError((e) => emitSaveError({ key: 'form_video', op: 'upload-drop', msg: e.msg }));

// Decide whether a thrown/returned Supabase error is a transient network
// problem worth queueing (vs. a real DB error like a constraint violation
// that will never succeed on retry). When in doubt, queue — ops are idempotent
// or last-write-wins, so re-trying a real error costs only attempts*latency
// and eventually gets dropped via MAX_ATTEMPTS.
function isTransient(err) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const code = err?.code || '';
  // Permanent Postgres / PostgREST errors — retrying never helps. Surface a
  // toast on the first failure so the user knows the write didn't land,
  // instead of letting the queue burn 5 attempts × 30s in silence.
  //   23xxx — integrity constraint violations (unique, FK, NOT NULL, check)
  //   42501 — insufficient_privilege (RLS denied)
  //   PGRST* — PostgREST request errors (auth, schema, malformed)
  if (typeof code === 'string') {
    // Auth-token codes recover after a refresh — queue them explicitly BEFORE the
    // message checks below (a 301 can carry an 'unauthorized'-ish message that would
    // otherwise mis-classify it as permanent).
    if (code === 'PGRST301' || code === 'PGRST302') return true;
    if (/^23\d{3}$/.test(code)) return false;
    if (code === '42501') return false;
    // PGRST* are permanent EXCEPT the auth-token ones: PGRST301 (JWT expired) and
    // PGRST302 (anon disallowed) recover after supabase-js refreshes the token, so
    // they MUST be queued — else a workout finished right on the token-refresh
    // boundary is silently dropped (never retried). Mirrors offlineQueue.isPermanent
    // exactly; the queue's critical-park logic then guarantees it's never lost.
    if (code.startsWith('PGRST') && code !== 'PGRST301' && code !== 'PGRST302') return false;
  }
  const msg = (err?.message || String(err || '')).toLowerCase();
  if (!msg) return true;
  // NB: 'jwt expired'/'invalid jwt' are deliberately NOT here — a stale token is
  // transient (refresh + retry), so those writes fall through to the queue.
  if (msg.includes('row-level security') || msg.includes('permission denied') ||
      msg.includes('not authorized') || msg.includes('unauthorized') ||
      msg.includes('duplicate key') || msg.includes('violates') ||
      msg.includes('check constraint') || msg.includes('foreign key')) return false;
  if (msg.includes('network') || msg.includes('failed to fetch') || msg.includes('timeout') ||
      msg.includes('aborted') || msg.includes('offline') || msg.includes('econnreset') ||
      msg.includes('refused')) return true;
  return true; // default: queue
}

// ─── Compare-and-swap store writes (2.10 #510-B1/B2/B4/B8) ──────────────────
// Every save wrote the WHOLE value with a blind upsert, so a device holding a
// stale copy - booted from a snapshot after a failed load, asleep through
// realtime, or replaying a queued offline write - put its old copy over every
// save other devices had made since (src/storeMerge.js has the measured cases).
// A write now names the updated_at it was built on; if the row moved, it reads
// the newer value, merges base + mine + theirs, and tries again.

// The base a device last knew, persisted beside its snapshot so a phone that
// boots offline can still merge instead of overwrite. Same prefix as the key,
// so the sign-out purge (auth.jsx CACHE_KEYS_RX) removes it with the snapshot.
// Never for the library (no snapshot of it exists, and it is ~1MB).
const BASE_SUFFIX = '::base';
// A base must describe the SAME moment as the snapshot beside it. The roster's
// snapshot is written only on load, so its base is too (persistBase(...,
// {withSnapshot:true}) there) - persisting it on every write made a snapshot
// boot treat the old roster as "my edit" and it won whole (review of #510, HIGH).
const persistBase = (key, at, val, { withSnapshot = false } = {}) => {
  if (key === 'expo-exercises' || val === undefined) return;
  if (key === 'expo-trainees' && !withSnapshot) return;
  try { lsSnapshotSoon(key + BASE_SUFFIX, { at, val }); } catch { /* a cache */ }
};
const readPersistedBase = (key) => {
  try { const s = localStorage.getItem(key + BASE_SUFFIX); const j = s ? JSON.parse(s) : null; return j && typeof j === 'object' ? j : null; } catch { return null; }
};
// a queued entry carries its base value only while it is small (the queue is localStorage)
const BASE_IN_QUEUE_MAX = 200000;
const queueBase = (val) => { try { return val !== undefined && JSON.stringify(val).length <= BASE_IN_QUEUE_MAX ? val : undefined; } catch { return undefined; } };

// at: undefined = not known, null = NO ROW, NULL_AT = a row whose updated_at is
// NULL (the column is nullable; an sbx_ copy can carry one) - conflating the last
// two made such a row read as an RLS refusal forever (review of #510).
const NULL_AT = '\u0000null';
const atOf = (row) => (row ? (row.updated_at == null ? NULL_AT : row.updated_at) : null);
async function readStoreRow(key) {
  const { data, error } = await supabase.from('store').select('value, updated_at').eq('key', key).maybeSingle();
  if (error) throw error;
  return data ? { at: atOf(data), val: data.value } : { at: null, val: undefined };
}

// One CAS attempt. `at` = the updated_at the value was built on; null = the
// row did not exist. Resolves { ok, at } or { conflict }; throws on a real error.
async function casWriteOnce(key, value, at) {
  const now = new Date().toISOString();
  if (at === null) {
    const { data, error } = await supabase.from('store').insert({ key, value, updated_at: now }).select('updated_at');
    if (error) { if (error.code === '23505') return { conflict: true }; throw error; }
    return { ok: true, at: (data && data[0] && data[0].updated_at) || now };
  }
  const q = supabase.from('store').update({ value, updated_at: now }).eq('key', key);
  const { data, error } = await (at === NULL_AT ? q.is('updated_at', null) : q.eq('updated_at', at)).select('updated_at');
  if (error) throw error;
  if (data && data.length) return { ok: true, at: data[0].updated_at || now };
  return { conflict: true };
}

// Write `mine` (built on baseVal, read at baseAt) without clobbering anything
// saved since. baseAt undefined = this device does not know what it was built
// on (snapshot boot, an old queue entry): it reads first and merges with
// whatever base it has. Resolves { at, val } with the value actually stored.
// A ONE-OFF WRITER OUTSIDE THE HOOK (Smart Import, 4.10 #524): the same fence as
// save() and the replay, then the compare-and-swap merge. baseVal = the value the
// caller read and built on (untouched copy).
export async function storeWriteFenced(key, mine, baseVal) {
  if (!canSeatWrite(key)) { recordBlockedWrite(key, 'one-off write on a seat that may not write it'); const e = new Error('This seat may not change ' + key); e.code = '42501'; throw e; }
  return storeWriteMerged(key, mine, undefined, baseVal);
}

export async function storeWriteMerged(key, mine, baseAt, baseVal) {
  let val = mine, at = baseAt, bval = baseVal;
  if (at === undefined) {
    const r = await readStoreRow(key);
    if (r.val !== undefined && !deepEqual(r.val, mine)) val = mergeStoreValues(bval, mine, r.val);
    at = r.at; bval = r.val;
  }
  for (let i = 0; i < 4; i++) {
    const res = await casWriteOnce(key, val, at);
    if (res.ok) return { at: res.at, val };
    const r = await readStoreRow(key);
    // The row did not move and nothing was written: RLS refused the update
    // (an UPDATE it may not make matches zero rows, it does not error).
    if (r.at === at) { const e = new Error('new row violates row-level security policy for table "store" (update refused)'); e.code = '42501'; throw e; }
    val = r.val === undefined ? val : mergeStoreValues(bval, val, r.val);
    at = r.at; bval = r.val;
  }
  throw new Error('store write kept racing other writers - network timeout, will retry');
}

// ─── Queue handlers ─────────────────────────────────────────────────────────
// Each Supabase write that we want to survive offline gets a handler here.
// The wrapper functions in the hooks below try the write directly; on failure
// they enqueue with the matching `type`, and the handler replays it.
registerHandler('store.upsert', async ({ key, value, baseAt, baseVal }) => {
  // A queued write replays on a later launch, possibly on another seat: the
  // fence applies here too, and a blocked replay is done, not failed.
  if (!canSeatWrite(key)) { recordBlockedWrite(key, 'queued replay on a seat that may not write it'); return; }
  // CAS + merge (#510-B1): a replay hours later must not put its old copy over
  // what other devices saved meanwhile. An entry from before this change has no
  // base: it reads first and keeps both sides.
  await storeWriteMerged(key, value, baseAt === undefined ? undefined : baseAt, baseVal);
});
// ONE write path for a workout row, used by the direct save AND the queue
// replay, so the two can never drift apart again. (Before 27.9 the replay had
// no plan_id fallback: a workout queued offline carried plan_id, the column does
// not exist yet, and every replay failed with 42703 until it parked, forever.)

// The live table has no plan_id column (27.9). Once a write has proven that,
// stop sending it: one request per save instead of a failed one plus a retry.
let planIdColumnMissing = false;
const isPlanIdColumnError = (error) => !!error && (/plan_id/i.test(error.message || '') || error.code === '42703' || error.code === 'PGRST204');

// A hung request must not hold the row's write chain (and the athlete) forever.
// An abort reads as 'aborted' → transient → the row stays queued and retries.
const WORKOUT_WRITE_TIMEOUT_MS = 15000;
async function withTimeout(build) {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const t = ctl ? setTimeout(() => ctl.abort(), WORKOUT_WRITE_TIMEOUT_MS) : null;
  try { return await (ctl ? build().abortSignal(ctl.signal) : build()); }
  finally { if (t) clearTimeout(t); }
}

// Fields the ATHLETE owns on a form-video slot. Everything else on a slot
// (reviewNotes, coach comments, replies, review marks) belongs to the coach,
// and the server's copy of it always wins over a re-save's (possibly stale) one.
const ATHLETE_FV_FIELDS = ['has', 'note', 'fileName', 'cloudUrl', 'pendingBlobId'];
const isEmptyVal = (v) => v === undefined || v === null || v === '' || v === false;
function mergeFormVideoSlot(sv, mine) {
  if (!sv || typeof sv !== 'object') return mine;
  if (!mine || typeof mine !== 'object') return sv;
  // start from the SERVER slot (coach fields, and anything newer than this
  // device knew about), then take each athlete field from this save only where
  // it carries a value — an empty local field never blanks a server one, so an
  // uploaded video (cloudUrl) or a note can not be wiped by a re-save.
  const out = { ...sv };
  for (const k of ATHLETE_FV_FIELDS) if (!isEmptyVal(mine[k])) out[k] = mine[k];
  if (out.cloudUrl || out.pendingBlobId) out.has = true;
  return out;
}

export async function upsertWorkoutRow(row) {
  // form_videos is MERGED, never blindly overwritten (see mergeFormVideoSlot).
  // A parked upsert can drain AFTER the blob queue patched a cloudUrl onto the
  // row, and a re-save of an existing log carries this device's copy of slots
  // the coach has since commented on (audit 08-22, review 27.9).
  if (row && row.id && row.form_videos) {
    // AUDIT 29.9 (#391 pass 1): a FAILED read (error or timeout) used to fall
    // through to a plain upsert of this device's slots - on a re-save that
    // deleted the coach's reviewNotes, on a replay a cloudUrl the blob queue had
    // patched in. Now it throws a code-less error, which the queue treats as
    // transient: the row stays queued and is retried, never written blind.
    let existing = null;
    {
      let res;
      try { res = await withTimeout(() => supabase.from('client_workouts').select('form_videos').eq('id', row.id).maybeSingle()); }
      catch (e) { throw new Error('form_videos read failed - retrying: ' + (e?.message || e)); }
      if (res && res.error) throw new Error('form_videos read failed - retrying: ' + (res.error.message || res.error));
      existing = res ? res.data : null;
    }
    try {
      const srv = existing && existing.form_videos;
      if (srv && typeof srv === 'object') {
        const merged = Array.isArray(srv) ? [...(row.form_videos || [])] : { ...(row.form_videos || {}) };
        const entries = Array.isArray(srv) ? srv.map((v, i) => [i, v]) : Object.entries(srv);
        for (const [k, sv] of entries) merged[k] = mergeFormVideoSlot(sv, merged[k]);
        row = { ...row, form_videos: merged };
      }
    } catch { /* a malformed server slot - keep this device's */ }
  }
  if (planIdColumnMissing && row && 'plan_id' in row) { row = { ...row }; delete row.plan_id; }
  let { error } = await withTimeout(() => supabase.from('client_workouts').upsert(row));
  // plan_id is what lets the portal tell two couple members' identically-named
  // plans apart (audit #31). The column may not exist yet — retry without it.
  if (error && row && 'plan_id' in row && isPlanIdColumnError(error)) {
    planIdColumnMissing = true;
    const rest = { ...row };
    delete rest.plan_id;
    ({ error } = await withTimeout(() => supabase.from('client_workouts').upsert(rest)));
  }
  if (error) throw error;
}

// ONE WRITE AT A TIME PER ROW (review 27.9). The direct save and the queue
// replay both write through this chain, keyed by row id, so two versions of
// one workout can never be in flight together and an older one can never land
// last. Each write first checks its queue entry is still there: an entry that
// was replaced by a newer version of the same row (dedupeKey) is skipped, and
// one already removed (the other path landed it) is not written twice.
const rowChains = new Map();
export function runRowSerialized(id, fn) {
  const prev = rowChains.get(id) || Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  const tail = next.catch(() => {});
  rowChains.set(id, tail);
  tail.then(() => { if (rowChains.get(id) === tail) rowChains.delete(id); });
  return next;
}
const entryStillQueued = (entryId) => { try { return getEntries().some(e => e.id === entryId); } catch { return true; } };

registerHandler('client_workouts.upsert', async ({ row }, entry) => {
  await runRowSerialized(row && row.id, async () => {
    if (entry && entry.id && !entryStillQueued(entry.id)) return; // superseded or already landed
    await upsertWorkoutRow(row);
  });
});
// ONE UPLOAD SLOT, NOT THE WHOLE ARRAY (2.10 #510-B5). The blob queue used to
// queue the device's whole cached form_videos for a failed upload or a row that
// had not landed yet, and client_workouts.update upserts it as is: a coach's
// reviewNotes and replies on OTHER slots were replaced by the athlete's stale
// copy, and a stub insert for a row not there yet had no client_id, failed RLS,
// counted as permanent and was dropped while the blob was already deleted.
// This replaces only the slot's UPLOAD fields on the server's own row - coach
// fields stay the server's - and waits for a row that has not landed instead of
// inventing one (a 'network' error is transient: the queue retries it).
const UPLOAD_FV_FIELDS = [...ATHLETE_FV_FIELDS, 'uploadFailed', 'failReason'];
registerHandler('client_workouts.fvSlot', async ({ id, index, slot }) => {
  const { data: row, error } = await supabase.from('client_workouts').select('form_videos').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!row) {
    // its own upsert still queued -> wait for it; nothing queued -> the workout
    // is gone (deleted, or its row was refused): retrying would park forever
    const waiting = getEntries().some((e) => e && e.type === 'client_workouts.upsert' && e.payload && e.payload.row && e.payload.row.id === id);
    if (waiting) throw new Error('workout row not on the server yet - network wait, retry after its own upsert');
    console.warn(`[fvSlot] workout ${id} is not on the server and none is queued - dropping the slot update`);
    return;
  }
  const fv = Array.isArray(row.form_videos) ? row.form_videos.slice() : [];
  while (fv.length <= index) fv.push(null);
  const next = { ...(fv[index] || {}) };
  // the upload STATE fields follow the slot exactly (a stale pendingBlobId must
  // go); the athlete's words (note, fileName) are set when given, never blanked
  for (const k of UPLOAD_FV_FIELDS) {
    if (slot && Object.prototype.hasOwnProperty.call(slot, k)) next[k] = slot[k];
    else if (k !== 'note' && k !== 'fileName') delete next[k];
  }
  fv[index] = next;
  const { error: e2 } = await supabase.from('client_workouts').update({ form_videos: fv }).eq('id', id);
  if (e2) throw e2;
});
registerHandler('client_workouts.update', async ({ id, patch }) => {
  // Update + ensure the row exists. The blob queue can race ahead of the
  // workout upsert (offline finish → online drain order is not guaranteed)
  // and call this against a row that hasn't materialized yet. Switching to
  // upsert with `id` lets the patch land either as a real update OR as a
  // stub insert that the subsequent `client_workouts.upsert` will then
  // merge over via onConflict on the primary key.
  const { error } = await supabase.from('client_workouts')
    .upsert({ id, ...patch }, { onConflict: 'id' });
  if (error) throw error;
});
// Coach reviewNotes written while OFFLINE. Distinct from client_workouts.update
// (blobQueue's URL write, which IS authoritative for a slot's upload fields):
// here the SERVER owns each slot's upload/media fields and we apply only
// reviewNotes — the offline mirror of updateFormVideos's online read-modify-write,
// so a coach note drained later can't clobber an athlete upload. (WorkoutReview
// audit Finding 1 — residual close.)
// THE NOTES ON A SLOT ARE MERGED, NOT REPLACED (4.10 #524 audit, HIGH): the save
// used to take this screen's whole reviewNotes array, so a coach note written
// after the athlete opened History was deleted by the athlete's reply (and the
// other way round). base = the notes this screen started from; with it the merge
// keeps the other side's new notes/replies and applies this side's edits and
// deletions. No base (an old queued entry) = this screen's array, as before.
function mergeSlotNotes(baseNotes, mineNotes, serverNotes) {
  if (mineNotes === undefined) return serverNotes;
  if (baseNotes === undefined) return mineNotes;
  const merged = mergeStoreValues(baseNotes || [], mineNotes || [], serverNotes || []);
  return Array.isArray(merged) ? merged : mineNotes;
}
registerHandler('client_workouts.mergeReviewNotes', async ({ id, formVideos, baseFormVideos }) => {
  const { data: row, error: readErr } = await supabase
    .from('client_workouts').select('form_videos').eq('id', id).maybeSingle();
  if (readErr) throw readErr;
  const serverFv = Array.isArray(row?.form_videos) ? row.form_videos : [];
  const inc = Array.isArray(formVideos) ? formVideos : [];
  const len = Math.max(serverFv.length, inc.length);
  const merged = [];
  for (let i = 0; i < len; i++) {
    const s = serverFv[i], c = inc[i];
    const b = Array.isArray(baseFormVideos) ? baseFormVideos[i] : undefined;
    if (s && c) merged.push({ ...s, reviewNotes: mergeSlotNotes(b ? (b.reviewNotes || []) : undefined, c.reviewNotes, s.reviewNotes) });
    else merged.push(s || c);
  }
  const { error } = await supabase.from('client_workouts').upsert({ id, form_videos: merged }, { onConflict: 'id' });
  if (error) throw error;
});
registerHandler('client_workouts.delete', async ({ id }) => {
  const { error } = await supabase.from('client_workouts').delete().eq('id', id);
  if (error) throw error;
});
registerHandler('bw_logs.upsert', async ({ row }) => {
  // onConflict matches the table's (client_id, block_name, week) unique
  // constraint. Without it, replaying a queued bw upsert for an existing
  // (client, block, week) tuple fails with 23505 — same class as the
  // weekly_focus bug. The direct save path in useSupaBwLog already passes
  // this; the queue handler did not until now.
  const { error } = await supabase.from('bw_logs').upsert(row, { onConflict: 'client_id,block_name,week' });
  if (error) throw error;
});
registerHandler('bw_logs.delete', async ({ filter }) => {
  let q = supabase.from('bw_logs').delete();
  for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
  const { error } = await q;
  if (error) throw error;
});
// Focus keys are `clientId|planName|dayName|eid|Wn` (legacy rows lack the
// clientId prefix). The client_id column drives the athlete-side RLS
// (wf_own_read) — rows without it are visible to staff only.
function focusClientId(k) {
  const seg = String(k).split('|')[0];
  return seg.startsWith('tr_') ? seg : null;
}
registerHandler('weekly_focus.upsert', async ({ k, v }) => {
  // onConflict: focus_key — table has serial id PK + unique focus_key. Without
  // this, every re-write of an existing focus_key tried to INSERT and failed
  // with 23505 (unique violation). The first save for a key worked; every
  // subsequent edit was silently lost.
  const { error } = await supabase.from('weekly_focus').upsert(
    { focus_key: k, value: v, client_id: focusClientId(k), updated_at: new Date().toISOString() },
    { onConflict: 'focus_key' }
  );
  if (error) throw error;
});

// Generic store hook: loads from Supabase 'store' table, falls back to localStorage
// on network failure so the UI isn't stuck empty when Supabase is unreachable.
export function useSupaStore(key, initial) {
  const [data, setData] = useState(() => {
    // Skip synchronous localStorage parse for auth/exercise stores — Supabase is
    // the source of truth, and a stale localStorage blob here can overwrite fresh
    // server data during the brief window before the effect runs.
    if (key === 'expo-exercises' || key === 'expo-trainees') return initial;
    // Coerce a corrupt persisted blob back to the declared shape: if the caller
    // declared an array store (initial is []) but the snapshot is a non-array
    // (a real serial-corruption/blob-restore hazard in this app's history), a
    // non-array here makes every downstream .map/.filter crash app-wide.
    try { const s = localStorage.getItem(key); const p = s ? JSON.parse(s) : initial; return (Array.isArray(initial) && !Array.isArray(p)) ? initial : p; } catch { return initial; }
  });
  // Same shape-guard for values loaded from Supabase / re-hydrated below.
  const asShape = (v) => (Array.isArray(initial) && !Array.isArray(v)) ? initial : v;
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const dataRef = useRef(data);
  const savingRef = useRef(false);
  const pendingRef = useRef(null);
  // Sticky "the user has mutated local state" latch (mirrors useSupaClientWorkouts
  // / useSupaBwLog). savingRef is only true DURING an in-flight write, so a slow
  // initial mount-load that resolves AFTER a save completed would clobber the
  // just-saved value back to the stale server snapshot. This latch is set on the
  // first save/saveLocal and never reset, so the load permanently defers to it.
  const mutatedRef = useRef(false);
  // DATA-LOSS GUARD (2026-08-27). The exercise library was replaced by a
  // TWO-ROW array because a save ran before the store had ever loaded: the
  // picker's "create in library" did setExercises(prev => [...prev, one]) while
  // `prev` was still the empty initial value, and save() writes the WHOLE
  // array. 1,326 exercises gone in one click.
  //
  // serverLoadedRef: has the server's value for this key actually been applied
  // (or confirmed absent)? Until it has, this store does not know what it
  // holds, and writing the whole array destroys data we never read.
  // serverLenRef: the last array length the SERVER reported — the baseline a
  // catastrophic shrink is measured against.
  const serverLoadedRef = useRef(false);
  const serverLenRef = useRef(null);
  // What the SERVER held when this device last synced (#510-B1): its updated_at
  // and value - the base a write is built on. known:false = not read this
  // session (the writer reads first). saveGenRef counts finished writes, so a
  // refetch that started before one finished can not put the older value back
  // (#510-B8). inflightRef is the value on the wire, for the pagehide flush.
  const baseRef = useRef({ known: false, at: undefined, val: undefined });
  const saveGenRef = useRef(0);
  const inflightRef = useRef(null);
  // the guarded refetch below, for callers that learn of a change another way
  // (the club zone's broadcast + fallback poll, #510-R2 M7)
  const refetchRef = useRef(null);

  // Load from Supabase on mount. On failure, fall back to any localStorage
  // snapshot and surface the error so the caller can show a banner.
  useEffect(() => {
    (async () => {
      try {
        const { data: row, error } = await supabase.from('store').select('value, updated_at').eq('key', key).maybeSingle();
        if (error) throw error;
        // the base every write from here is built on (#510-B1)
        baseRef.current = { known: true, at: atOf(row), val: row ? row.value : undefined };
        if (row) persistBase(key, atOf(row), row.value, { withSnapshot: key !== 'expo-trainees' || (Array.isArray(row.value) && row.value.length > 0) });
        // Record what the SERVER holds before deciding whether to apply it.
        // This must happen even when the apply is skipped below, because it is
        // what unlocks writing at all (see the guard in save()).
        if (row && row.value !== undefined) {
          serverLenRef.current = storeSize(row.value);
          serverLoadedRef.current = true;
        } else if (!error) {
          // No row for this key: legitimately empty, so writing is safe.
          serverLoadedRef.current = true;
          serverLenRef.current = 0;
        }
        // A local mutation normally wins over a slow load. But if the local
        // value is EMPTY and the server has rows, deferring means the store
        // stays empty forever — which is precisely how one click replaced the
        // library. An empty local value is not an edit worth protecting.
        const localIsEmpty = Array.isArray(dataRef.current) && dataRef.current.length === 0;
        const serverHasRows = Array.isArray(row?.value) && row.value.length > 0;
        const deferToLocal = (savingRef.current || mutatedRef.current) && !(localIsEmpty && serverHasRows);
        if (row && row.value !== undefined && !deferToLocal) {
          const val = asShape(row.value);
          if (key === 'expo-exercises') {
            // Yield so React doesn't block on committing a very large list.
            // Re-check savingRef INSIDE the timer: a save dispatched between the
            // outer guard and this macrotask would otherwise be clobbered back to
            // the stale server snapshot (data loss).
            // Same empty-local exception as the outer guard: never leave the
            // library empty because a mutation beat this macrotask.
            setTimeout(() => {
              const emptyNow = Array.isArray(dataRef.current) && dataRef.current.length === 0;
              if ((!savingRef.current && !mutatedRef.current) || emptyNow) { setData(val); dataRef.current = val; }
            }, 0);
          } else {
            setData(val);
            dataRef.current = val;
            // The roster snapshots too now (Ohad, 2026-09-07: "do everything").
            // Only staff seats ever receive roster rows (RLS), so a NON-EMPTY
            // value is by construction a coach's own device; an athlete's
            // empty [] is never written, and the old exclusion of legacy
            // full-roster blobs on athlete devices still holds.
            if (key !== 'expo-trainees' || (Array.isArray(val) && val.length > 0)) {
              try { lsSnapshotSoon(key, val); } catch {}
            }
          }
        }
      } catch (e) {
        // Fall back to localStorage snapshot — nothing worse than an empty UI
        // on a transient network blip. EXCEPT the deliberately-unsynced keys:
        // a legacy 'expo-trainees' blob holds full-roster PII that RLS now
        // denies — resurrecting it here defeats the exclusion (audit 08-22).
        try {
          // A roster snapshot is restored only for a staff session - never
          // resurrected on an athlete's device, whatever it holds.
          let rosterOk = false;
          if (key === 'expo-trainees') {
            try {
              const { data: sess } = await supabase.auth.getSession();
              const em = String(sess?.session?.user?.email || '').toLowerCase();
              rosterOk = !!em && TRAINER_EMAILS.includes(em);
            } catch { rosterOk = false; }
          }
          if (key !== 'expo-exercises' && (key !== 'expo-trainees' || rosterOk)) {
            const s = localStorage.getItem(key);
            if (s) {
              const parsed = asShape(JSON.parse(s));
              setData(parsed); dataRef.current = parsed;
              // We recovered a real snapshot, so we DO know what this store
              // holds and saving is safe again. Without this, a transient read
              // failure would leave the write guard latched shut and the coach
              // unable to save anything for the rest of the session — trading
              // one data-loss bug for a different one.
              serverLoadedRef.current = true;
              serverLenRef.current = storeSize(parsed);
              // writing from a snapshot: the writer reads the row first and
              // merges against the base this snapshot was built on (#510-B1)
              const pb = readPersistedBase(key);
              baseRef.current = { known: false, at: undefined, val: pb ? pb.val : undefined };
            }
          }
        } catch {}
        // Deliberately NOT unlocked for expo-exercises / expo-trainees: those
        // have no local snapshot, so after a failed read we genuinely do not
        // know what the server holds. Refusing to save is the correct answer —
        // it is exactly the write that destroyed the library.
        setLoadError(e?.message || 'load failed');
        console.warn(`useSupaStore[${key}] load failed:`, e?.message || e);
      }
      setLoaded(true);
    })();
  }, [key]);

  useEffect(() => { dataRef.current = data; }, [data]);

  // TRUE instant realtime (the `store` table is in the supabase_realtime
  // publication): when this key changes on the server — another device or a
  // sync script writing — re-fetch and apply it live, so every open client stays
  // in sync like a shared Google Sheet. Skips our own in-flight write (savingRef)
  // and no-op diffs. Applies via saveLocal semantics (state + localStorage, no
  // re-write). A component mid-edit still wins for ~600ms until its own save
  // lands; last-write-wins after that, which is the shared-sheet contract.
  useEffect(() => {
    let disposed = false;
    let ch = null;
    // One refetch for realtime, a return to the tab and the network coming back
    // (#510-B1/B2): a phone that slept through realtime used to keep its stale
    // copy until the next server change - and build its next write on it.
    const refetch = async () => {
      if (disposed || savingRef.current) return;
      const gen = saveGenRef.current;
      try {
        // the version first: a focus on a tab whose stores did not move costs one
        // tiny read per key, not the value (the library is ~1MB)
        const { data: v, error: ve } = await supabase.from('store').select('updated_at').eq('key', key).maybeSingle();
        if (disposed || ve || !v || savingRef.current || gen !== saveGenRef.current) return;
        if (baseRef.current.known && atOf(v) === baseRef.current.at) return;
        const { data: row, error } = await supabase.from('store').select('value, updated_at').eq('key', key).maybeSingle();
        // a write that finished while this read was out is newer than it (#510-B8)
        if (disposed || error || savingRef.current || gen !== saveGenRef.current) return;
        if (!row || row.value === undefined) return;
        baseRef.current = { known: true, at: atOf(row), val: row.value };
        persistBase(key, atOf(row), row.value);
        // AN EDIT STILL IN THE OFFLINE QUEUE IS NOT ON THE SERVER YET: showing the
        // server value now would make it vanish from the screen until its replay
        // lands (review of #510). The base moves; the screen keeps the edit.
        if (getEntries().some((e) => e && e.type === 'store.upsert' && e.payload && e.payload.key === key)) return;
        const val = asShape(row.value);
        if (JSON.stringify(val) === JSON.stringify(dataRef.current)) return;
        setData(val); dataRef.current = val;
        if (key !== 'expo-exercises' && key !== 'expo-trainees') { try { lsSnapshot(key, val); } catch {} }
      } catch { /* transient */ }
    };
    refetchRef.current = refetch;
    try {
      ch = supabase.channel('store-rt-' + key)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'store', filter: `key=eq.${key}` }, refetch)
        .subscribe();
    } catch { /* realtime optional */ }
    const onVisible = () => { if (document.visibilityState === 'visible' && serverLoadedRef.current) refetch(); };
    const onOnline = () => { if (serverLoadedRef.current) refetch(); };
    // A TAB CLOSING MID-SAVE (#510-B4): the value on the wire, or the edit
    // waiting behind it, existed only in memory. It goes to the offline queue
    // with its base; if the write did land, the replay merges to the same value.
    // Only the edit WAITING behind the write (never sent). The value on the wire
    // usually lands; re-sending it later on its old base made the replay revert
    // other devices' edits made after it (review of #510).
    const onHide = () => {
      const v = pendingRef.current;
      if (v === null || v === undefined) return;
      const b = baseRef.current;
      try { enqueue({ type: 'store.upsert', payload: { key, value: v, baseAt: b.known ? b.at : undefined, baseVal: queueBase(b.val) }, dedupeKey: key, critical: true }); } catch { /* best effort */ }
    };
    try {
      document.addEventListener('visibilitychange', onVisible);
      window.addEventListener('online', onOnline);
      window.addEventListener('pagehide', onHide);
    } catch { /* no DOM */ }
    return () => {
      disposed = true;
      refetchRef.current = null;
      if (ch) { try { supabase.removeChannel(ch); } catch {} }
      try {
        document.removeEventListener('visibilitychange', onVisible);
        window.removeEventListener('online', onOnline);
        window.removeEventListener('pagehide', onHide);
      } catch { /* no DOM */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Single-flight debounced writer. `pendingRef` is the "next value to write"
  // and `savingRef` is the in-flight lock. If a new save lands during a write,
  // it just updates pendingRef — the running loop picks it up on the next turn.
  // The previous version swallowed failures and left savingRef stuck true on
  // errors, blocking subsequent writes.
  const writeToSupa = useCallback(async (val) => {
    pendingRef.current = val;
    if (savingRef.current) return;
    savingRef.current = true;
    try {
      while (pendingRef.current !== null) {
        const toWrite = pendingRef.current;
        pendingRef.current = null;
        inflightRef.current = toWrite;
        const b = baseRef.current;
        const startedAt = Date.now();
        const fail = (err) => {
          if (isTransient(err)) {
            // critical: this entry is the only durable copy of an offline edit (4.10 audit)
            enqueue({ type: 'store.upsert', payload: { key, value: toWrite, baseAt: b.known ? b.at : undefined, baseVal: queueBase(b.val) }, dedupeKey: key, critical: true });
          } else {
            console.warn(`useSupaStore[${key}] save error:`, err?.message || err);
            emitSaveError({ key, op: 'save', msg: err?.message || 'save failed' });
          }
        };
        try {
          // CAS on the base this value was built on; merged if the row moved (#510-B1)
          const r = await storeWriteMerged(key, toWrite, b.known ? b.at : undefined, b.val);
          // A QUEUED SAVE OF THIS KEY IS NOW HISTORY (4.10 #524 audit): this value was
          // built on the screen's data, which already carries the queued edit. Left
          // in the queue, the old value replayed on the next drain and the merge kept
          // its stale leaves ("mine wins") - x=1 came back over x=2, a deleted row
          // returned. Only entries queued BEFORE this write started are dropped.
          try { getEntries().filter((q) => q.type === 'store.upsert' && q.dedupeKey === key && (q.createdAt || 0) < startedAt).forEach((q) => removeEntry(q.id)); } catch { /* the queue is best effort */ }
          baseRef.current = { known: true, at: r.at, val: r.val };
          persistBase(key, r.at, r.val);
          if (r.val !== toWrite && !deepEqual(r.val, toWrite)) {
            // Someone else saved in between and the merge kept both. An edit made
            // while this write was out was built on toWrite: fold it onto the merge.
            if (pendingRef.current !== null) pendingRef.current = mergeStoreValues(toWrite, pendingRef.current, r.val);
            const show = asShape(pendingRef.current !== null ? pendingRef.current : r.val);
            setData(show); dataRef.current = show;
            if (Array.isArray(show)) serverLenRef.current = show.length;
            if (key !== 'expo-exercises' && key !== 'expo-trainees') { try { lsSnapshotSoon(key, show); } catch {} }
          }
        } catch (e) {
          fail(e);
        } finally {
          inflightRef.current = null;
          saveGenRef.current++;
        }
      }
    } finally {
      savingRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const save = useCallback(async (next) => {
    const val = typeof next === 'function' ? next(dataRef.current) : next;
    // A SAME-REFERENCE UPDATE IS A NO-OP, NEVER A NETWORK WRITE (26.9).
    //
    // Callers use `prev => prev` to mean "nothing to change" — App's
    // handleDecrementSession returns the athlete portal's own (empty, RLS-locked)
    // roster untouched when a workout is completed there. React would skip that;
    // this function did not, and upserted the empty list to the staff-only
    // expo-trainees row from the athlete's seat. RLS refused the INSERT and the
    // athlete saw "SAVE FAILED — EXPO-TRAINEES" over a workout that had in fact
    // saved (client_workouts is a different table). Photographed on a phone at
    // 13:50 on 26.9.
    if (val === dataRef.current) return;

    // THE SEAT FENCE (26.9). A write this seat cannot make never leaves the
    // device and never becomes a banner: it is recorded (console, telemetry,
    // window.__expoBlockedWrites) as the upstream bug it is. RLS remains the
    // last line behind it. See src/seatWrite.js.
    if (!canSeatWrite(key)) { recordBlockedWrite(key); return; }

    // ---- DATA-LOSS GUARD (2026-08-27) ---------------------------------
    // A save writes the WHOLE array, so it must never run before the store has
    // been read, and must never accept a value that collapses it. Both rules
    // live in src/storeWriteGuard.js so they are unit-tested. See that file for
    // the incident this exists to prevent.
    const verdict = checkStoreWrite({
      value: val,
      serverLoaded: serverLoadedRef.current,
      serverLen: serverLenRef.current,
    });
    if (!verdict.ok) {
      console.warn(`useSupaStore[${key}] BLOCKED save (${verdict.reason}):`, verdict.message);
      // TELEMETRY MUST NOT ALARM THE COACH.
      //
      // 19.9, photographed at 390 on /coach/bhbc: opening the zone and touching a
      // tab within a few seconds of a cold load put a red "NOT SAVED — THE DATA
      // HAD NOT FINISHED LOADING. RELOAD AND TRY AGAIN" across the screen. The
      // guard was RIGHT to block - expo-bhbc-activity had not loaded and the
      // write would have replaced the feed with one entry, the library-wipe shape
      // exactly. But the blocked write was the zone logging its OWN 'opened the
      // club zone' line. The coach did nothing, lost nothing, and was told to
      // reload. Still blocked, still in the console, but no banner: it is a usage
      // trail, not his data. Any key that IS his data keeps the banner.
      if (key !== 'expo-bhbc-activity') emitSaveError({ key, op: 'save', msg: verdict.message });
      return;
    }
    // An accepted write becomes the new baseline for the next shrink check.
    if (Array.isArray(val)) serverLenRef.current = val.length;
    // -------------------------------------------------------------------

    mutatedRef.current = true;
    setData(val);
    dataRef.current = val;
    if (key !== 'expo-exercises' && key !== 'expo-trainees') {
      try { lsSnapshotSoon(key, val); } catch {}
    }
    writeToSupa(val);
  }, [key, writeToSupa]);

  // Local-only setter: updates state + the localStorage snapshot but does NOT
  // write to Supabase. For applying a value that arrived over realtime broadcast
  // (the sender already persisted it) — persisting again on the receiver is
  // redundant, and on a user without write RLS (e.g. an athlete receiving a
  // coach's portal-visibility change) the failed upsert fires a false
  // "SAVE FAILED" toast.
  const saveLocal = useCallback((next) => {
    mutatedRef.current = true;
    // asShape: poll/broadcast payloads must never replace a declared-array
    // store with a non-array — one bad server value would crash every
    // connected client on its next .map/.filter (audit 08-22).
    const val = asShape(typeof next === 'function' ? next(dataRef.current) : next);
    setData(val);
    dataRef.current = val;
    if (key !== 'expo-exercises' && key !== 'expo-trainees') {
      try { lsSnapshotSoon(key, val); } catch {}
    }
  }, [key]);

  // refresh(): re-read this key through every guard the hook has (a save in
  // flight, a save finished meanwhile, an edit still queued) - never apply a
  // server value from outside with saveLocal (#510-R2 M7)
  const refresh = useCallback(() => { const f = refetchRef.current; return f ? f() : Promise.resolve(); }, []);
  return [data, save, loaded, loadError, saveLocal, refresh];
}

// Longest the athlete waits in the logger for the server after Complete. The
// row is already durable in the offline queue before the request starts.
const SAVE_WAIT_MS = 4000;

// Client workouts hook — uses dedicated table
export function useSupaClientWorkouts(initial = []) {
  const [data, setData] = useState(() => {
    // Array-shape guard: a corrupt non-array 'expo-cw' blob would JSON.parse
    // fine but then poison every downstream .map/.filter/.reduce on cw and
    // white-screen Review/CRM/History. Fall back to `initial` unless it's an array.
    try { const s = localStorage.getItem('expo-cw'); const p = s ? JSON.parse(s) : initial; return Array.isArray(p) ? p : initial; } catch { return initial; }
  });
  const dataRef = useRef(data);
  // Becomes true the moment the user mutates local state (new workout,
  // form-video patch, reviewed toggle, delete). Guards the initial Supabase
  // fetch below so a slow SELECT can't overwrite edits the user already made
  // — e.g. a review-comment saved during page load no longer gets wiped by
  // the (now stale) snapshot the server returns a moment later.
  const mutatedRef = useRef(false);

  // Loaded flips true after the initial fetch settles (success OR failure,
  // same semantics as useSupaStore) so the app shell can hold its splash
  // instead of flashing empty Review/CRM states while the table loads.
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data: rows, error } = await supabase.from('client_workouts').select('*').order('date', { ascending: false });
        // Guard on `error`, NOT on rows.length: on a DB/RLS failure supabase-js
        // returns rows===null (so `rows &&` short-circuits and the local cache is
        // preserved). A legitimately-EMPTY result ([]) must still clear state —
        // otherwise a device whose rows were all deleted elsewhere keeps showing
        // them from localStorage forever (audit BUG 2).
        if (!error && rows && !mutatedRef.current) {
          const mapped = rows.map(r => ({
            // planId disambiguates two couple members' identically-named plans;
            // plan_name alone cannot (audit 08-22 #31). Undefined until the
            // column exists — every consumer falls back to the name.
            id: r.id, clientId: r.client_id, planId: r.plan_id || null, planName: r.plan_name,
            dayName: r.day_name, week: r.week, date: r.date,
            autoregulation: r.autoregulation || {}, notes: r.notes || '',
            exercises: r.exercises || [], formVideos: r.form_videos || [],
            reviewedAt: r.reviewed_at || null
          }));
          // Overlay any workout still sitting in the offline queue that the server
          // doesn't have yet. A workout finished offline in a PRIOR session is
          // enqueued (critical) + cached but not yet drained; on next launch the
          // mount fetch resolves BEFORE the ~1.5s initial drain, so without this
          // overlay it clobbers state+localStorage and the workout vanishes from
          // History until a manual reload — risking the athlete re-logging a dup.
          // mutatedRef only covers THIS session's edits. Mirror the weekly_focus
          // overlay (audit finding #1).
          try {
            const haveIds = new Set(mapped.map(w => w.id));
            const queued = JSON.parse(localStorage.getItem('expo-offline-queue') || '[]');
            for (const item of queued) {
              if (item?.type !== 'client_workouts.upsert') continue;
              const r = item.payload?.row;
              if (!r || !r.id) continue;
              // A queued row is always NEWER than the server's copy (it is the
              // athlete's re-save of an existing log that has not landed yet):
              // it replaces the server version instead of being skipped, or
              // History would show the old sets until the queue drained.
              if (haveIds.has(r.id)) {
                const at = mapped.findIndex(w => w.id === r.id);
                if (at >= 0) mapped[at] = { ...mapped[at], planName: r.plan_name, dayName: r.day_name, week: r.week, date: r.date, autoregulation: r.autoregulation || {}, notes: r.notes || '', exercises: r.exercises || [] };
                continue;
              }
              mapped.push({
                id: r.id, clientId: r.client_id, planId: r.plan_id || null, planName: r.plan_name,
                dayName: r.day_name, week: r.week, date: r.date,
                autoregulation: r.autoregulation || {}, notes: r.notes || '',
                exercises: r.exercises || [], formVideos: r.form_videos || [],
                reviewedAt: r.reviewed_at || null
              });
              haveIds.add(r.id);
            }
            // keep the fetch's date-desc ordering after merging queued rows in
            mapped.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
          } catch {}
          setData(mapped);
          dataRef.current = mapped;
          lsSnapshotRecent('expo-cw', mapped);
        }
      } catch {}
      setLoaded(true);
    })();
  }, []);

  useEffect(() => { dataRef.current = data; }, [data]);

  // Re-hydrate from localStorage when the blob queue patches a workout's
  // form_videos in place. Without this, components viewing History would
  // keep showing a pendingBlobId placeholder until the user reloads.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onPatch = () => {
      try {
        const s = localStorage.getItem('expo-cw');
        if (!s) return;
        const parsed = JSON.parse(s);
        // MERGE the form_videos patch into current state — do NOT replace state
        // wholesale from localStorage. If an earlier save() hit a quota error the
        // setItem is swallowed, so the localStorage blob can be MISSING the newest
        // workout (which lives in React state + the DB). A blind setData(parsed)
        // would drop it from the UI until reload (audit BUG 4). Keep every current
        // workout, apply the patched form_videos, and never lose a current-only row.
        const cur = dataRef.current || [];
        const patchById = new Map((parsed || []).map(w => [w.id, w]));
        const seen = new Set();
        const merged = cur.map(w => {
          seen.add(w.id);
          const p = patchById.get(w.id);
          return p ? { ...w, formVideos: p.formVideos } : w;
        });
        for (const p of (parsed || [])) if (p && !seen.has(p.id)) merged.push(p);
        mutatedRef.current = true;
        setData(merged);
        dataRef.current = merged;
      } catch {}
    };
    window.addEventListener('expo-cw-patched', onPatch);
    return () => window.removeEventListener('expo-cw-patched', onPatch);
  }, []);

  // save(next, { upsertIds }) returns a Promise of
  //   { ok, confirmed, queued, permanent, authWait, settled }
  //   ok        — the workout is SAFE: on the server, or durably in the queue
  //   confirmed — the server acknowledged it
  //   settled   — resolves when the network attempt itself is over (the SW
  //               reload guard in ClientPortal holds until then)
  // It resolves at the latest after SAVE_WAIT_MS even if the network hangs: by
  // then the row is already durable in the queue, so a slow connection does not
  // hold the athlete in the logger.
  //
  // Which rows are written: every NEW id, plus existing ids the caller names in
  // opts.upsertIds (the athlete re-saving the log he already has for that
  // plan/day/week). Named explicitly — never inferred from object identity — so
  // a caller that rebuilds the array can not bulk-overwrite rows by accident.
  // (Before 27.9 an existing id was never written at all.)
  const save = useCallback((next, opts = {}) => {
    const prev = dataRef.current;
    const val = typeof next === 'function' ? next(prev) : next;
    mutatedRef.current = true;
    setData(val);
    dataRef.current = val;
    try { lsSnapshotRecent('expo-cw', val); } catch {}
    const upsertIds = new Set(Array.isArray(opts.upsertIds) ? opts.upsertIds : []);
    const prevIds = new Set(prev.map(p => p.id));
    const toWrite = val.filter(w => w && w.id && (!prevIds.has(w.id) || upsertIds.has(w.id)));
    if (toWrite.length === 0) return Promise.resolve({ ok: true, confirmed: true, queued: false, settled: Promise.resolve() });

    let allDurable = true;
    const jobs = toWrite.map(w => {
      const isExisting = prevIds.has(w.id);
      const row = {
        id: w.id, client_id: w.clientId, plan_name: w.planName,
        day_name: w.dayName, week: w.week, date: w.date,
        autoregulation: w.autoregulation, notes: w.notes,
        exercises: w.exercises, form_videos: w.formVideos,
      };
      // reviewed_at is the COACH's mark. A re-save of an existing row never
      // sends it (the upsert then leaves the server's value alone); a new row
      // sends it only when the caller set one. Before, every save wrote this
      // device's copy — null on a re-save — and wiped the coach's review.
      if (!isExisting && w.reviewedAt) row.reviewed_at = w.reviewedAt;
      if (w.planId) row.plan_id = w.planId;
      // DURABLE BEFORE NETWORK. The row goes into the critical queue FIRST,
      // synchronously, before any await: a tab closed 50 ms after Complete, a
      // silent SW reload, a dead phone — the queue replays it on the next
      // launch. Before 27.9 the row was queued only AFTER a transient failure,
      // and the logger deleted its draft before the server answered, so a
      // permanent error or an interrupted request left the sets nowhere.
      const entry = enqueueEntry({ type: 'client_workouts.upsert', payload: { row }, dedupeKey: w.id, critical: true });
      if (!entry.durable) allDurable = false;
      return (async () => {
        let failure = null;
        // The write itself runs on the row's serial chain (shared with the
        // queue replay) — see runRowSerialized.
        try {
          await runRowSerialized(w.id, async () => {
            if (!entryStillQueued(entry.id)) return; // a newer save replaced it, or the replay landed it
            await upsertWorkoutRow(row);
            removeEntry(entry.id); // confirmed — only now does the queue let go
          });
          return { confirmed: true, durable: entry.durable };
        } catch (e) { failure = e; }
        const msg = failure?.message || String(failure);
        if (isTransient(failure)) {
          patchEntry(entry.id, { lastError: msg, attempts: 1 });
          return { confirmed: false, durable: entry.durable };
        }
        // Permanent-looking error. It stays PARKED in the queue (never the old
        // toast-and-vanish) and the portal shows "not saved yet"; the save-error
        // toast fires once too, so a COACH-side save that fails is never silent.
        // 42501 with no live session is an AUTH problem (the JWT lapsed while he
        // trained), not a forbidden row: flag it; it drains when he signs in.
        // The probe runs off the row's chain and gives up after 1.5 s.
        let authWait = false;
        try {
          const probe = supabase.auth.getSession().then(({ data }) => {
            const session = data && data.session;
            return !session || !!(session.expires_at && session.expires_at * 1000 < Date.now());
          });
          authWait = await Promise.race([probe, new Promise(res => setTimeout(() => res(false), 1500))]);
        } catch { authWait = true; }
        patchEntry(entry.id, { lastError: msg, attempts: 1, parked: true, stuck: true, authWait });
        emitSaveError({ key: 'client_workouts', op: 'save', msg: authWait ? 'Signed out — the workout is kept on this device and is sent when you sign in again.' : 'Workout not saved yet — kept on this device and retrying.' });
        return { confirmed: false, durable: entry.durable, permanent: true, authWait };
      })();
    });
    const settledResult = Promise.all(jobs).then(rs => {
      const confirmed = rs.every(r => r.confirmed);
      return {
        ok: rs.every(r => r.confirmed || r.durable),
        confirmed,
        queued: !confirmed,
        permanent: rs.some(r => r.permanent),
        authWait: rs.some(r => r.authWait),
      };
    });
    // Nudge the drainer once the direct attempt is over, so a queued row is
    // retried promptly when the connection comes back.
    settledResult.then(r => { if (!r.confirmed) setTimeout(() => { drain(); }, 2000); }).catch(() => {});
    const timeout = new Promise(res => setTimeout(() => res({
      ok: allDurable, confirmed: false, queued: true, pending: true,
    }), SAVE_WAIT_MS));
    const settled = settledResult.then(() => undefined, () => undefined);
    return Promise.race([settledResult, timeout]).then(r => ({ ...r, settled }));
  }, []);

  // Toggle or set reviewed state on an existing workout. Patches the single
  // row directly (save() writes whole rows), so this bypasses it.
  const markReviewed = useCallback(async (id, reviewed = true) => {
    const ts = reviewed ? new Date().toISOString() : null;
    const next = dataRef.current.map(w => w.id === id ? { ...w, reviewedAt: ts } : w);
    mutatedRef.current = true;
    setData(next);
    dataRef.current = next;
    try { lsSnapshotRecent('expo-cw', next); } catch {}
    try {
      const { error } = await supabase.from('client_workouts').update({ reviewed_at: ts }).eq('id', id);
      if (error) {
        if (isTransient(error)) enqueue({ type: 'client_workouts.update', payload: { id, patch: { reviewed_at: ts } }, dedupeKey: 'reviewed:' + id });
        else emitSaveError({ key: 'client_workouts', op: 'markReviewed', msg: error.message || String(error) });
      }
    } catch (e) {
      if (isTransient(e)) enqueue({ type: 'client_workouts.update', payload: { id, patch: { reviewed_at: ts } }, dedupeKey: 'reviewed:' + id });
      else emitSaveError({ key: 'client_workouts', op: 'markReviewed', msg: e?.message || 'update failed' });
    }
  }, []);

  // Patch just the form_videos column of a workout. Used by the trainer's
  // timestamped-comment feature and the client's reply-to-comment flow.
  // Optimistic: updates local state first, then writes to Supabase. Errors
  // surface via emitSaveError and get shown in the save-error toast.
  const updateFormVideos = useCallback(async (id, formVideos) => {
    // the slots as this screen had them before this edit - the merge's base
    const baseFormVideos = ((dataRef.current.find((w) => w.id === id) || {}).formVideos) || undefined;
    // Optimistic local update for immediate UI.
    const next = dataRef.current.map(w => w.id === id ? { ...w, formVideos } : w);
    mutatedRef.current = true;
    setData(next);
    dataRef.current = next;
    try { lsSnapshotRecent('expo-cw', next); } catch {}
    try {
      // Server-authoritative READ-MODIFY-WRITE (audit CRITICAL). The coach's
      // clientWorkouts snapshot is frozen at page-load and never refreshes from
      // the server, so a whole-column overwrite here SILENTLY ERASED an athlete's
      // form video uploaded after the coach opened Review (the un-fixed mirror of
      // the blobQueue.attachUrl per-slot fix). Re-read the row and keep the
      // SERVER's upload/media fields per slot (cloudUrl / pendingBlobId / has /
      // uploadFailed / fileName …), applying only the local reviewNotes.
      const { data: row, error: readErr } = await supabase
        .from('client_workouts').select('form_videos').eq('id', id).maybeSingle();
      if (readErr) throw readErr;
      const serverFv = Array.isArray(row?.form_videos) ? row.form_videos : [];
      const inc = Array.isArray(formVideos) ? formVideos : [];
      const len = Math.max(serverFv.length, inc.length);
      const merged = [];
      for (let i = 0; i < len; i++) {
        const s = serverFv[i], c = inc[i];
        const b = Array.isArray(baseFormVideos) ? baseFormVideos[i] : undefined;
        // shared slot: server owns media fields; the notes are merged three-way
        // (base = what this screen started from) so neither side erases the other;
        // server-only slot (an athlete upload the coach never saw) is preserved.
        if (s && c) merged.push({ ...s, reviewNotes: mergeSlotNotes(b ? (b.reviewNotes || []) : undefined, c.reviewNotes, s.reviewNotes) });
        else merged.push(s || c);
      }
      const { error } = await supabase.from('client_workouts').update({ form_videos: merged }).eq('id', id);
      if (error) throw error;
      // Reconcile local state to the merged truth (may now include an athlete
      // upload the coach's stale snapshot lacked).
      const reconciled = dataRef.current.map(w => w.id === id ? { ...w, formVideos: merged } : w);
      setData(reconciled); dataRef.current = reconciled;
      try { lsSnapshotRecent('expo-cw', reconciled); } catch {}
    } catch (e) {
      // Offline / DB flap: keep the optimistic local update and durably enqueue.
      // Drains via the reviewNotes-merge handler (server-authoritative on upload
      // fields), NOT the generic update — so a note drained after an athlete's
      // offline-window upload still can't clobber the video. Distinct dedupeKey
      // from blobQueue's 'fv:' URL writes so the two never replace each other.
      if (isTransient(e)) {
        // a later offline edit REPLACES the queued one (dedupe): keep the FIRST
        // edit's base, or the merge would read the first edit as already saved
        const prior = getEntries().find((q) => q.type === 'client_workouts.mergeReviewNotes' && q.dedupeKey === 'fvnotes:' + id);
        const base = prior && prior.payload && prior.payload.baseFormVideos !== undefined ? prior.payload.baseFormVideos : (prior ? undefined : baseFormVideos);
        enqueue({ type: 'client_workouts.mergeReviewNotes', payload: { id, formVideos, baseFormVideos: base }, dedupeKey: 'fvnotes:' + id, critical: true });
      }
      else emitSaveError({ key: 'client_workouts', op: 'updateFormVideos', msg: e?.message || 'update failed' });
    }
  }, []);

  // Hard-delete a workout (and its form videos / review notes by cascade —
  // the row owns those columns). Optimistic local removal, then DB delete.
  const deleteWorkout = useCallback(async (id) => {
    const next = dataRef.current.filter(w => w.id !== id);
    mutatedRef.current = true;
    setData(next);
    dataRef.current = next;
    try { lsSnapshotRecent('expo-cw', next); } catch {}
    try {
      const { error } = await supabase.from('client_workouts').delete().eq('id', id);
      if (error) {
        if (isTransient(error)) enqueue({ type: 'client_workouts.delete', payload: { id } });
        else emitSaveError({ key: 'client_workouts', op: 'delete', msg: error.message || String(error) });
      }
    } catch (e) {
      if (isTransient(e)) enqueue({ type: 'client_workouts.delete', payload: { id } });
      else emitSaveError({ key: 'client_workouts', op: 'delete', msg: e?.message || 'delete failed' });
    }
  }, []);

  return [data, save, markReviewed, updateFormVideos, deleteWorkout, loaded];
}

// BW logs hook — uses dedicated table
export function useSupaBwLog(initial = []) {
  const [data, setData] = useState(() => {
    // Array-shape guard (same as useSupaClientWorkouts): a corrupt non-array
    // 'expo-bw' blob would poison the BW chart's min/max/map math.
    try { const s = localStorage.getItem('expo-bw'); const p = s ? JSON.parse(s) : initial; return Array.isArray(p) ? p : initial; } catch { return initial; }
  });
  const dataRef = useRef(data);
  // Same loaded contract as useSupaClientWorkouts above.
  const [loaded, setLoaded] = useState(false);
  // Mirrors useSupaClientWorkouts' guard (see ~240). Without it, an athlete who
  // typed their weight and hit SAVE *before* this mount fetch resolved had the
  // response overwrite both state and the localStorage cache — their weigh-in
  // visibly vanished from the graph. The row did reach the DB (the upsert had
  // already fired), so it reappeared after a reload, which made it look random.
  const mutatedRef = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const { data: rows, error } = await supabase.from('bw_logs').select('*').order('date', { ascending: true });
        // Guard on `error`, not rows.length — empty must clear stale local cache (audit BUG 2).
        if (!error && rows && !mutatedRef.current) {
          const mapped = rows.map(r => ({
            date: r.date, clientId: r.client_id, week: r.week, bw: r.bw,
            blockName: r.block_name, planId: r.plan_id
          }));
          // Overlay any weigh-in still queued offline that the server lacks —
          // same prior-session drain race as client_workouts (audit finding #1).
          try {
            const key = (b) => `${b.clientId}|${b.blockName}|${b.week}`;
            const have = new Set(mapped.map(key));
            const queued = JSON.parse(localStorage.getItem('expo-offline-queue') || '[]');
            for (const item of queued) {
              if (item?.type !== 'bw_logs.upsert') continue;
              const r = item.payload?.row;
              if (!r) continue;
              const entry = { date: r.date, clientId: r.client_id, week: r.week, bw: r.bw, blockName: r.block_name, planId: r.plan_id };
              if (have.has(key(entry))) continue;
              mapped.push(entry);
              have.add(key(entry));
            }
            mapped.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
          } catch {}
          setData(mapped);
          dataRef.current = mapped;
          lsSnapshot('expo-bw', mapped);
        }
      } catch {}
      setLoaded(true);
    })();
  }, []);

  useEffect(() => { dataRef.current = data; }, [data]);

  const save = useCallback(async (next) => {
    const prev = dataRef.current;
    const val = typeof next === 'function' ? next(prev) : next;
    // Claim local ownership BEFORE the await below, so an in-flight mount fetch
    // can no longer clobber this entry when it lands.
    mutatedRef.current = true;
    setData(val);
    dataRef.current = val;
    try { lsSnapshot('expo-bw', val); } catch {}
    // Upsert entries that are new or whose bw/date changed for (clientId, blockName, week)
    const changed = val.filter(b => {
      const p = prev.find(x => x.clientId === b.clientId && x.blockName === b.blockName && x.week === b.week);
      return !p || p.bw !== b.bw || p.date !== b.date;
    });
    for (const b of changed) {
      if (!b.blockName) continue; // DB requires block_name NOT NULL
      const row = {
        client_id: b.clientId,
        plan_id: b.planId ?? null,
        block_name: b.blockName,
        week: b.week,
        bw: b.bw,
        date: b.date,
      };
      const dedupeKey = `${b.clientId}|${b.blockName}|${b.week}`;
      // QUEUE FIRST, then send (#471, AUDIT-470): the weigh-in went to the network
      // first and was queued only after an ERROR - a request that hung on a
      // "connected" phone with no data, then an app close, lost it without a word.
      // Now it is durable before the network is touched, exactly as the workout
      // row; the direct send only removes that entry once the server confirms.
      // The upsert is keyed (client, block, week), so a replay racing the direct
      // send cannot duplicate it.
      // A NEWER WEIGH-IN BEATS AN OLDER QUEUED DELETE of the same week (4.10 #524
      // audit): a delete that failed and was queued, then the athlete re-entered
      // the week - the drain replayed the delete and erased the new weigh-in.
      try { getEntries().filter((q) => q.type === 'bw_logs.delete' && q.payload && q.payload.filter && q.payload.filter.client_id === row.client_id && q.payload.filter.block_name === row.block_name && q.payload.filter.week === row.week).forEach((q) => removeEntry(q.id)); } catch { /* best effort */ }
      const { id: qid } = enqueueEntry({ type: 'bw_logs.upsert', payload: { row }, dedupeKey, critical: true });
      try {
        const { error } = await supabase.from('bw_logs').upsert(row, { onConflict: 'client_id,block_name,week' });
        if (!error) removeEntry(qid);
        else if (!isTransient(error)) { removeEntry(qid); emitSaveError({ key: 'bw_logs', op: 'save', msg: error.message || String(error) }); }
        // transient: it stays queued and drains with the next connection
      } catch (e) {
        if (!isTransient(e)) { removeEntry(qid); emitSaveError({ key: 'bw_logs', op: 'save', msg: e?.message || 'save failed' }); }
      }
    }
    // Delete entries that were in prev but are gone from val
    const removed = prev.filter(p => {
      if (!p.blockName || !p.clientId) return false;
      return !val.find(v => v.clientId === p.clientId && v.blockName === p.blockName && v.week === p.week);
    });
    for (const p of removed) {
      const filter = { client_id: p.clientId, block_name: p.blockName, week: p.week };
      try {
        const { error } = await supabase.from('bw_logs').delete()
          .eq('client_id', p.clientId)
          .eq('block_name', p.blockName)
          .eq('week', p.week);
        if (error) {
          if (isTransient(error)) enqueue({ type: 'bw_logs.delete', payload: { filter } });
          else emitSaveError({ key: 'bw_logs', op: 'delete', msg: error.message || String(error) });
        }
      } catch (e) {
        if (isTransient(e)) enqueue({ type: 'bw_logs.delete', payload: { filter } });
        else emitSaveError({ key: 'bw_logs', op: 'delete', msg: e?.message || 'delete failed' });
      }
    }
  }, []);

  return [data, save, loaded];
}

// Weekly focus hook — uses dedicated table.
// Supabase writes are debounced 500ms so typing in the focus textarea doesn't
// fire one network call per keystroke. Local state + localStorage update
// synchronously, so UI feels instant.
export function useSupaWeeklyFocus(initial = {}) {
  const [data, setData] = useState(() => {
    try { const s = localStorage.getItem('expo-weekly-focus'); return s ? JSON.parse(s) : initial; } catch { return initial; }
  });
  const dataRef = useRef(data);
  const pendingRef = useRef({}); // focus_key -> latest value not yet flushed
  const timerRef = useRef(null);
  // Sticky latch: once the coach has typed anything, the slow mount-fetch must NOT
  // overwrite it. The offline-queue overlay only covers writes that already enqueued;
  // a just-typed value sitting in pendingRef (no error yet, not queued) is invisible
  // to it, so without this guard the load reverts the edit on-screen (parity with the
  // three sibling hooks in this file — this one was missing it).
  const mutatedRef = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const { data: rows } = await supabase.from('weekly_focus').select('*');
        if (!rows || mutatedRef.current) return;
        // Build merged state: cloud first, then overlay any unsynced writes
        // still sitting in the offline queue (e.g. last session typed a longer
        // value but the upsert hadn't drained yet). Without this overlay, a
        // page reload would replace the local cache with the older cloud
        // value and silently nuke the in-flight typing.
        const cloud = {};
        rows.forEach(r => { cloud[r.focus_key] = r.value; });
        let pending = {};
        try {
          const queued = JSON.parse(localStorage.getItem('expo-offline-queue') || '[]');
          for (const item of queued) {
            if (item?.type !== 'weekly_focus.upsert') continue;
            const { k, v } = item.payload || {};
            if (k != null) pending[k] = v;
          }
        } catch {}
        const merged = { ...cloud, ...pending };
        setData(merged);
        dataRef.current = merged;
        try { lsSnapshot('expo-weekly-focus', merged); } catch {}
      } catch {}
    })();
  }, []);

  useEffect(() => { dataRef.current = data; }, [data]);

  const flush = useCallback(async () => {
    const pending = pendingRef.current;
    pendingRef.current = {};
    timerRef.current = null;
    for (const [k, v] of Object.entries(pending)) {
      try {
        const { error } = await supabase.from('weekly_focus').upsert(
          { focus_key: k, value: v, client_id: focusClientId(k), updated_at: new Date().toISOString() },
          { onConflict: 'focus_key' }
        );
        if (error) {
          if (isTransient(error)) enqueue({ type: 'weekly_focus.upsert', payload: { k, v }, dedupeKey: k });
          else emitSaveError({ key: 'weekly_focus', op: 'save', msg: error.message || String(error) });
        }
      } catch (e) {
        if (isTransient(e)) enqueue({ type: 'weekly_focus.upsert', payload: { k, v }, dedupeKey: k });
        else emitSaveError({ key: 'weekly_focus', op: 'save', msg: e?.message || 'save failed' });
      }
    }
  }, []);

  // Flush any pending writes on unmount so typed notes don't sit in memory.
  // A tab close / PWA kill does NOT run React unmount cleanups, so a note still
  // inside the 500ms debounce never reached the server and vanished on every
  // other device (audit 08-22). pagehide + hidden-visibility are the only
  // reliable "page is going away" signals on mobile — flush on those too.
  useEffect(() => {
    const flushNow = () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; flush(); } };
    const onHide = () => { if (typeof document !== 'undefined' && document.visibilityState === 'hidden') flushNow(); };
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', flushNow);
      document.addEventListener('visibilitychange', onHide);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('pagehide', flushNow);
        document.removeEventListener('visibilitychange', onHide);
      }
      flushNow();
    };
  }, [flush]);

  const save = useCallback((next) => {
    mutatedRef.current = true; // once the coach types, the mount-fetch must not clobber it
    const prev = dataRef.current;
    const val = typeof next === 'function' ? next(prev) : next;
    setData(val);
    dataRef.current = val;
    try { lsSnapshot('expo-weekly-focus', val); } catch {}

    for (const [k, v] of Object.entries(val)) {
      if (prev[k] !== v) pendingRef.current[k] = v;
    }
    // Sync CLEARS too: a focus key present before but now removed from `val`
    // means the coach cleared that week's focus. Without this the delete never
    // reached Supabase (save only diffed keys present in val), so a reload
    // restored the "cleared" focus and the athlete kept seeing it. Push '' so
    // flush upserts an empty value (= no focus). (deep-logic audit)
    for (const k of Object.keys(prev)) {
      if (!(k in val) && prev[k] !== '') pendingRef.current[k] = '';
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, 500);
  }, [flush]);

  return [data, save];
}
