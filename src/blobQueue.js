// IndexedDB-backed queue for form-video uploads. Videos are too large for
// localStorage (5MB cap; a single 30-second clip can be 10–40MB), so the
// blob queue uses IndexedDB instead.
//
// Flow:
//  1. User records video while offline. Eager upload fails. Caller enqueues
//     {blob, contentType, storagePath, blobId} and stores blobId on the
//     in-memory formVideo entry.
//  2. User finishes workout. Workout row is saved (locally + via the regular
//     offlineQueue if also offline) with formVideos[i].pendingBlobId set.
//     Caller invokes attachWorkout(blobId, workoutId, exerciseIndex).
//  3. When connectivity returns, drainBlobs() runs:
//       - Upload blob to Supabase storage.
//       - Patch local cw[workoutId].formVideos[i] with cloudUrl, drop
//         pendingBlobId. Update localStorage.
//       - Enqueue client_workouts.update via the regular offlineQueue so the
//         row's form_videos column reflects the new URL on the server.
//       - Remove blob from IDB.
//
// Order with the regular offlineQueue: blobs and writes drain on the same
// triggers but independently. If the workout itself is also queued (offline
// at finish), it will be drained before the blob's update lands because
// updates are appended after the in-flight upsert in FIFO order.

import { supabase } from './supabase';
import { enqueue as enqueueOp } from './offlineQueue';

const DB_NAME = 'expo-blob-queue';
const STORE = 'blobs';
const MAX_ATTEMPTS = 5;
const DRAIN_INTERVAL_MS = 30000;

const listeners = new Set();
let onErrorHook = null;

export function setOnError(fn) { onErrorHook = fn; }

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('no indexeddb'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function txStore(mode) {
  const db = await openDb();
  return db.transaction(STORE, mode).objectStore(STORE);
}

function notify(count) {
  for (const l of listeners) {
    try { l(count); } catch {}
  }
}

async function readAll() {
  try {
    const store = await txStore('readonly');
    return await new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

async function writeEntry(entry) {
  const store = await txStore('readwrite');
  return new Promise((resolve, reject) => {
    const req = store.put(entry);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function deleteEntry(id) {
  const store = await txStore('readwrite');
  return new Promise((resolve, reject) => {
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// Public alias used by the upload UI to drop a previously-queued blob when
// the user re-uploads to the same exercise slot before the original drained.
export async function removeBlob(id) {
  await deleteEntry(id);
  const all = await readAll();
  notify(all.length);
}

async function getEntry(id) {
  const store = await txStore('readonly');
  return new Promise((resolve, reject) => {
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export function newBlobId() {
  return 'pb_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export async function enqueueBlob({ id, blob, contentType, storagePath }) {
  const entry = {
    id: id || newBlobId(),
    blob, contentType, storagePath,
    workoutId: null,
    exerciseIndex: null,
    attempts: 0,
    lastError: null,
    createdAt: Date.now(),
  };
  await writeEntry(entry);
  const all = await readAll();
  notify(all.length);
  return entry.id;
}

export async function attachWorkout(blobId, workoutId, exerciseIndex) {
  const entry = await getEntry(blobId);
  if (!entry) return;
  entry.workoutId = workoutId;
  entry.exerciseIndex = exerciseIndex;
  await writeEntry(entry);
}

export async function getCount() {
  return (await readAll()).length;
}

export function subscribe(fn) {
  listeners.add(fn);
  // Fire current count async; callers tolerate a brief 0 → real-count flash.
  readAll().then(arr => { try { fn(arr.length); } catch {} });
  return () => listeners.delete(fn);
}

let draining = false;

async function patchLocalCw(workoutId, exerciseIndex, cloudUrl) {
  // Patch the cached client_workouts list in localStorage so the user sees
  // the new URL on next render. The DB write goes through the regular
  // offlineQueue.
  try {
    const raw = localStorage.getItem('expo-cw');
    if (!raw) return null;
    const arr = JSON.parse(raw);
    let nextFv = null;
    const next = arr.map(w => {
      if (w.id !== workoutId) return w;
      const fv = (w.formVideos || []).map((f, i) => {
        if (i !== exerciseIndex) return f;
        const { pendingBlobId, ...rest } = f || {};
        return { ...rest, cloudUrl, has: true };
      });
      nextFv = fv;
      return { ...w, formVideos: fv };
    });
    localStorage.setItem('expo-cw', JSON.stringify(next));
    // Tell any mounted ClientPortal/WorkoutReview that local cw has changed.
    try { window.dispatchEvent(new CustomEvent('expo-cw-patched', { detail: { workoutId } })); } catch {}
    return nextFv;
  } catch {
    return null;
  }
}

// Mirror of patchLocalCw for the DROP path: a blob that will never upload
// (oversize / permanent error / gave up after MAX_ATTEMPTS) must stop showing
// as "pending upload" forever. Clear pendingBlobId and flag the slot failed so
// the history/review UI shows a failed marker instead of a perpetual spinner,
// then persist via the regular offlineQueue so a reload from the server doesn't
// resurrect the stale pendingBlobId. Returns the patched formVideos (or null).
async function markCwBlobFailed(workoutId, exerciseIndex, reason) {
  if (!workoutId || exerciseIndex == null) return null;
  try {
    const raw = localStorage.getItem('expo-cw');
    if (!raw) return null;
    const arr = JSON.parse(raw);
    let nextFv = null;
    const next = arr.map(w => {
      if (w.id !== workoutId) return w;
      const fv = (w.formVideos || []).map((f, i) => {
        if (i !== exerciseIndex) return f;
        const { pendingBlobId, ...rest } = f || {};
        return { ...rest, has: false, cloudUrl: null, uploadFailed: true, failReason: reason || 'upload failed' };
      });
      nextFv = fv;
      return { ...w, formVideos: fv };
    });
    localStorage.setItem('expo-cw', JSON.stringify(next));
    try { window.dispatchEvent(new CustomEvent('expo-cw-patched', { detail: { workoutId } })); } catch {}
    if (nextFv) {
      // Idempotent last-write-wins update; same dedupeKey as the success path so
      // a success and a later failure for the same workout don't both linger.
      enqueueOp({
        type: 'client_workouts.update',
        payload: { id: workoutId, patch: { form_videos: nextFv } },
        dedupeKey: 'fv:' + workoutId,
      });
    }
    return nextFv;
  } catch {
    return null;
  }
}

// Durably attach an uploaded video's URL to its client_workouts row. Returns
// true once the reference is recorded (written to the DB, or durably queued in
// the offlineQueue). Returns false when the workout row can't be reached yet —
// its own offlineQueue upsert may not have drained, or the DB flapped — so the
// caller keeps the blob and retries instead of orphaning the uploaded bytes.
async function attachUrl(workoutId, exerciseIndex, cloudUrl) {
  // Best-effort local-cache patch first (drives the UI immediately). When the
  // cache holds the workout we get back the full form_videos array to write.
  const patchedFv = await patchLocalCw(workoutId, exerciseIndex, cloudUrl);
  if (patchedFv) {
    try {
      const { data, error } = await supabase
        .from('client_workouts')
        .update({ form_videos: patchedFv })
        .eq('id', workoutId)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) {
        // The row isn't on the server yet — an offline-finished workout whose own
        // client_workouts.upsert hasn't drained. An .update() matching 0 rows
        // returns NO error, so treating this as done would drop the blob while
        // the later full-row upsert (form_videos snapshotted before this URL
        // existed) overwrites it → orphaned bytes. Queue a durable form_videos
        // update instead; the offlineQueue is FIFO so it lands AFTER the pending
        // workout upsert (its update handler upserts-with-onConflict), URL last.
        enqueueOp({
          type: 'client_workouts.update',
          payload: { id: workoutId, patch: { form_videos: patchedFv } },
          dedupeKey: 'fv:' + workoutId,
        });
      }
    } catch {
      // Direct write flapped — hand it to the durable queue. Still "referenced":
      // the URL now lives in the persisted offlineQueue, so dropping the blob is
      // safe (the bytes are already up; only the row update remains, and it will
      // converge on the next drain).
      enqueueOp({
        type: 'client_workouts.update',
        payload: { id: workoutId, patch: { form_videos: patchedFv } },
        dedupeKey: 'fv:' + workoutId,
      });
    }
    return true;
  }
  // Local cache doesn't have this workout (evicted, or synced from another
  // device). Read-modify-write the row on the server so the URL still lands.
  try {
    const { data, error } = await supabase
      .from('client_workouts')
      .select('form_videos')
      .eq('id', workoutId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return false; // row not synced yet — retry on the next drain
    const fv = Array.isArray(data.form_videos) ? data.form_videos.slice() : [];
    while (fv.length <= exerciseIndex) fv.push(null);
    const { pendingBlobId, ...rest } = fv[exerciseIndex] || {};
    fv[exerciseIndex] = { ...rest, cloudUrl, has: true };
    const { error: e2 } = await supabase
      .from('client_workouts')
      .update({ form_videos: fv })
      .eq('id', workoutId);
    if (e2) throw e2;
    return true;
  } catch {
    return false; // transient (offline / DB error) — keep the blob, retry
  }
}

export async function drainBlobs() {
  if (draining) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  draining = true;
  try {
    const queue = await readAll();
    // Only attempt blobs whose workout has been attached. Unattached blobs
    // belong to in-progress workouts not yet finished — drainBlobs() runs
    // again on the next trigger (or is invoked explicitly post-finish).
    const ready = queue.filter(e => e.workoutId && e.exerciseIndex != null);
    for (const entry of ready) {
      try {
        // Supabase hard-rejects objects >= 50MB (413, project-wide free-plan
        // cap). A queued oversized blob would retry on every drain forever —
        // drop it instead of looping.
        if (entry.blob?.size > 50 * 1024 * 1024) {
          const mb = Math.round(entry.blob.size / 1e6);
          console.warn('blobQueue: dropping oversized blob', entry.id, entry.blob.size);
          await removeBlob(entry.id);
          // Surface it — a silent drop leaves the slot stuck on "pending upload"
          // forever with the athlete never told their clip won't make it.
          if (onErrorHook) {
            try { onErrorHook({ type: 'form_video.upload', payload: { storagePath: entry.storagePath, workoutId: entry.workoutId, exerciseIndex: entry.exerciseIndex }, msg: `Video too large to upload (${mb}MB > 50MB limit)` }); } catch {}
          }
          try {
            window.dispatchEvent(new CustomEvent('expo-blob-failed', {
              detail: { blobId: entry.id, workoutId: entry.workoutId, exerciseIndex: entry.exerciseIndex, reason: 'oversize', mb },
            }));
          } catch {}
          await markCwBlobFailed(entry.workoutId, entry.exerciseIndex, `too large (${mb}MB)`);
          continue;
        }
        // STEP 1 — upload the bytes. Idempotent (upsert), and the result is
        // persisted onto the queue entry so a later reference-retry never has
        // to re-upload the (potentially large) blob.
        let cloudUrl = entry.cloudUrl;
        if (!entry.uploaded || !cloudUrl) {
          const { error } = await supabase.storage
            .from('form-videos')
            .upload(entry.storagePath, entry.blob, { upsert: true, contentType: entry.contentType });
          if (error) throw error;
          const { data: urlData } = supabase.storage.from('form-videos').getPublicUrl(entry.storagePath);
          cloudUrl = urlData?.publicUrl;
          if (!cloudUrl) throw new Error('no public url after upload');
          const cur0 = await getEntry(entry.id);
          if (cur0) { cur0.uploaded = true; cur0.cloudUrl = cloudUrl; await writeEntry(cur0); }
        }

        // STEP 2 — durably attach the URL to the workout row BEFORE dropping the
        // blob. Previously deleteEntry() ran unconditionally, so when the local
        // cache patch found nothing to patch (cache evicted, or the workout not
        // cached on this device), the blob was deleted after upload with NO row
        // ever pointing to the bytes — a silently orphaned video. attachUrl now
        // guarantees the reference lands (locally-queued, direct write, or
        // server read-modify-write) and returns false only when the workout row
        // isn't reachable yet, in which case we keep the blob and retry.
        const referenced = await attachUrl(entry.workoutId, entry.exerciseIndex, cloudUrl);
        if (!referenced) {
          throw Object.assign(new Error('form-video reference not yet durable'), { _transientRef: true });
        }
        // Tell the UI the upload is done so it can swap the local previewUrl out
        // for the cloudUrl and free its blob URL.
        try {
          window.dispatchEvent(new CustomEvent('expo-blob-uploaded', {
            detail: { blobId: entry.id, workoutId: entry.workoutId, exerciseIndex: entry.exerciseIndex, cloudUrl },
          }));
        } catch {}
        await deleteEntry(entry.id);
      } catch (e) {
        const cur = await getEntry(entry.id);
        if (!cur) break;
        const msg = e?.message || String(e);
        // Reference-not-yet-durable: the bytes are already uploaded (persisted on
        // the entry), we're only waiting on the workout row to become reachable.
        // Keep the blob, count the attempt, and move ON to other blobs rather
        // than blocking the whole drain behind one un-synced workout. After the
        // cap, dead-letter it (surface + mark the slot failed) instead of looping.
        if (e?._transientRef) {
          cur.lastError = msg;
          cur.attempts = (cur.attempts || 0) + 1;
          if (cur.attempts >= MAX_ATTEMPTS) {
            await deleteEntry(cur.id);
            if (onErrorHook) { try { onErrorHook({ type: 'form_video.upload', payload: { storagePath: entry.storagePath, workoutId: entry.workoutId, exerciseIndex: entry.exerciseIndex }, msg: 'video uploaded but its workout never synced' }); } catch {} }
            try { window.dispatchEvent(new CustomEvent('expo-blob-failed', { detail: { blobId: entry.id, workoutId: entry.workoutId, exerciseIndex: entry.exerciseIndex, reason: 'orphan', msg } })); } catch {}
            await markCwBlobFailed(entry.workoutId, entry.exerciseIndex, 'workout never synced');
          } else {
            await writeEntry(cur);
          }
          continue;
        }
        const st = e?.status ?? e?.statusCode ?? e?.httpStatus;
        cur.lastError = msg;
        // Classify like the live uploader: a permanent failure (RLS/payload/mime,
        // or a definite 4xx) will NEVER succeed on retry — drop it now and
        // surface the real reason instead of looping the full cap then dropping
        // silently. Auth-expiry (401/403-auth) is RECOVERABLE via re-sign-in, so
        // keep it queued (don't count attempts) until the next drain after login.
        // Kept in lockstep with ClientPortal.jsx's uploader: decide
        // permanent-by-message first, then treat a bare 403 (server-side expired
        // token / generic "Forbidden") as RECOVERABLE auth — NOT permanent —
        // unless the body names a permanent cause. Otherwise a recoverable 403
        // would match permanent-by-status (403 is 4xx) and the blob would be
        // dropped instead of waiting for re-auth.
        const permanentByMsg = /row-level security|permission denied|payload too large|exceeded|maximum allowed|invalid (jwt|token|signature|mime)|mime type|not allowed/i.test(msg);
        const isAuth = st === 401 || (st === 403 && !permanentByMsg);
        const permanent = !isAuth && ((typeof st === 'number' && st >= 400 && st < 500 && ![408, 429].includes(st)) || permanentByMsg);
        if (permanent) {
          await deleteEntry(entry.id);
          if (onErrorHook) { try { onErrorHook({ type: 'form_video.upload', payload: { storagePath: entry.storagePath, workoutId: entry.workoutId }, msg }); } catch {} }
          try { window.dispatchEvent(new CustomEvent('expo-blob-failed', { detail: { blobId: entry.id, workoutId: entry.workoutId, exerciseIndex: entry.exerciseIndex, reason: 'permanent', msg } })); } catch {}
          await markCwBlobFailed(entry.workoutId, entry.exerciseIndex, msg);
          continue; // next entry — don't burn retries on a doomed upload
        }
        if (!isAuth) cur.attempts = (cur.attempts || 0) + 1;
        if (cur.attempts >= MAX_ATTEMPTS) {
          await deleteEntry(entry.id);
          if (onErrorHook) { try { onErrorHook({ type: 'form_video.upload', payload: { storagePath: entry.storagePath }, msg }); } catch {} }
          try { window.dispatchEvent(new CustomEvent('expo-blob-failed', { detail: { blobId: entry.id, workoutId: entry.workoutId, exerciseIndex: entry.exerciseIndex, reason: 'max-attempts', msg } })); } catch {}
          await markCwBlobFailed(entry.workoutId, entry.exerciseIndex, msg);
        } else {
          await writeEntry(cur);
          // Stop on first transient failure; will retry on next trigger.
          break;
        }
      }
    }
    const after = await readAll();
    notify(after.length);
  } finally {
    draining = false;
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { drainBlobs(); });
  // Skip the wake-up while the tab is backgrounded; the visibilitychange
  // handler picks up any pending uploads as soon as it returns to
  // foreground. Saves battery on long PWA sessions.
  setInterval(() => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    getCount().then(n => { if (n > 0) drainBlobs(); });
  }, DRAIN_INTERVAL_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      getCount().then(n => { if (n > 0) drainBlobs(); });
    }
  });
  setTimeout(() => { drainBlobs(); }, 2000);
}
