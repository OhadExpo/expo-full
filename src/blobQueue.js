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
        const { error } = await supabase.storage
          .from('form-videos')
          .upload(entry.storagePath, entry.blob, { upsert: true, contentType: entry.contentType });
        if (error) throw error;
        const { data: urlData } = supabase.storage.from('form-videos').getPublicUrl(entry.storagePath);
        const cloudUrl = urlData?.publicUrl;
        if (!cloudUrl) throw new Error('no public url after upload');

        const patchedFv = await patchLocalCw(entry.workoutId, entry.exerciseIndex, cloudUrl);
        if (patchedFv) {
          // Try the DB write directly — keeps localStorage and DB in sync
          // immediately. If a reload happens between blob-upload and the
          // queued offlineQueue drain, the row would otherwise come back
          // with a stale form_videos and clobber the local patch on rehydrate.
          let directDbOk = false;
          try {
            const { error: e2 } = await supabase
              .from('client_workouts')
              .update({ form_videos: patchedFv })
              .eq('id', entry.workoutId);
            if (e2) throw e2;
            directDbOk = true;
          } catch {
            directDbOk = false;
          }
          if (!directDbOk) {
            // Fall back through the regular queue so a flap mid-drain still
            // converges. The blob is already uploaded — we don't redo that
            // work even if this update has to retry.
            enqueueOp({
              type: 'client_workouts.update',
              payload: { id: entry.workoutId, patch: { form_videos: patchedFv } },
              dedupeKey: 'fv:' + entry.workoutId,
            });
          }
          // Tell the UI the upload is done so it can swap the local
          // previewUrl out for the cloudUrl and free its blob URL.
          try {
            window.dispatchEvent(new CustomEvent('expo-blob-uploaded', {
              detail: { blobId: entry.id, workoutId: entry.workoutId, exerciseIndex: entry.exerciseIndex, cloudUrl },
            }));
          } catch {}
        }
        await deleteEntry(entry.id);
      } catch (e) {
        const cur = await getEntry(entry.id);
        if (cur) {
          cur.attempts = (cur.attempts || 0) + 1;
          cur.lastError = e?.message || String(e);
          if (cur.attempts >= MAX_ATTEMPTS) {
            await deleteEntry(entry.id);
            if (onErrorHook) {
              try { onErrorHook({ type: 'form_video.upload', payload: { storagePath: entry.storagePath }, msg: cur.lastError }); } catch {}
            }
          } else {
            await writeEntry(cur);
            // Stop on first failure; will retry on next trigger.
            break;
          }
        } else {
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
  setInterval(() => { getCount().then(n => { if (n > 0) drainBlobs(); }); }, DRAIN_INTERVAL_MS);
  setTimeout(() => { drainBlobs(); }, 2000);
}
