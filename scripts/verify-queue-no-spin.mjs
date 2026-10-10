// THE OFFLINE QUEUE DOES NOT SPIN (9.10 whole-diff review).
//
// A past-due entry blocked behind a RESTING entry for the same row (an athlete's
// workout row parked after repeated failures, then its video-link patch) used to
// book the 250 ms floor timer on every pass: the phone woke 4x a second and
// re-read the whole queue (full workout rows) until the resting entry's turn.
// Fixed in src/offlineQueue.js: retry timers are booked from FUTURE rest times only.
//
// Measures it in Node on the real module: queue reads in 3 s with that layout.
// Before the fix: 26 reads. After: a handful (the drain itself + the timer that
// waits for the resting entry). Fails above 10.
//   node scripts/verify-queue-no-spin.mjs [path to offlineQueue.js]
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const store = new Map();
let reads = 0;
globalThis.localStorage = {
  getItem: (k) => { if (k === 'expo-offline-queue') reads++; return store.has(k) ? store.get(k) : null; },
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.window = { addEventListener() {}, dispatchEvent() {} };
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });

const file = path.resolve(process.argv[2] || 'src/offlineQueue.js');
const q = await import(pathToFileURL(file).href);
let calls = 0;
q.registerHandler('client_workouts.upsert', async () => { calls++; throw new Error('network wait'); });
q.registerHandler('client_workouts.fvSlot', async () => { calls++; throw new Error('network wait'); });
q.setQueueUser('u1');
const now = Date.now();
store.set('expo-offline-queue', JSON.stringify([
  { id: 'X', uid: 'u1', type: 'client_workouts.upsert', payload: { row: { id: 'R' } }, critical: true, attempts: 6, parked: true, nextTryAt: now + 20000 },
  { id: 'Y', uid: 'u1', type: 'client_workouts.fvSlot', payload: { id: 'R', index: 0 }, critical: true, attempts: 6, parked: true, nextTryAt: now - 1000 },
]));
reads = 0;
await q.drain();
await new Promise((r) => setTimeout(r, 3000));
const ok = reads <= 10 && calls === 0;
console.log(`QUEUE NO-SPIN: ${reads} queue reads in 3 s, ${calls} handler calls (a resting entry ahead of a past-due one for the same row) -> ${ok ? 'ok' : 'FAIL: the retry timer spins'}`);
process.exit(ok ? 0 : 1);
