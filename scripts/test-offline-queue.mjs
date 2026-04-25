// Logic test for offlineQueue.js. We mock localStorage + window and stub the
// Supabase client by monkey-patching the module's import. We don't try to
// exercise blobQueue here because it requires IndexedDB; that one is
// covered by static review.
//
// Run: node scripts/test-offline-queue.mjs

import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const PASS = (msg) => console.log(`[32m✓[0m ${msg}`);
const FAIL = (msg) => { console.log(`[31m✗[0m ${msg}`); process.exitCode = 1; };
function eq(actual, expected, msg) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  (ok ? PASS : FAIL)(`${msg}  expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`);
}
function truthy(v, msg) { (v ? PASS : FAIL)(msg); }

// ─── Shims ───────────────────────────────────────────────────────────
const lsStore = new Map();
globalThis.localStorage = {
  getItem: (k) => (lsStore.has(k) ? lsStore.get(k) : null),
  setItem: (k, v) => lsStore.set(k, String(v)),
  removeItem: (k) => lsStore.delete(k),
};
const onlineListeners = [];
const offlineListeners = [];
globalThis.window = {
  addEventListener: (ev, cb) => {
    if (ev === 'online') onlineListeners.push(cb);
    else if (ev === 'offline') offlineListeners.push(cb);
  },
  removeEventListener: () => {},
  dispatchEvent: () => true,
};
// `navigator` is a read-only global in modern Node — define it via property
// descriptor so we can swap onLine for the offline-mode test.
const navState = { onLine: true };
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  get() { return navState; },
});
function fireOnline() { onlineListeners.forEach(cb => cb()); }

// Disable setInterval/setTimeout side-effects from the module so we don't
// trigger periodic drains we don't expect.
const origSetInterval = globalThis.setInterval;
const origSetTimeout = globalThis.setTimeout;
const fakeIntervals = [];
const fakeTimeouts = [];
globalThis.setInterval = (fn, ms) => { fakeIntervals.push({ fn, ms }); return fakeIntervals.length; };
globalThis.setTimeout = (fn, ms) => { fakeTimeouts.push({ fn, ms }); return fakeTimeouts.length; };

// Dynamic import — must come AFTER shims are installed so the module's
// top-level setInterval/setTimeout/window calls hit the mocks.
const modUrl = pathToFileURL(path.resolve('src/offlineQueue.js')).href;
const oq = await import(modUrl);

// ─── Scenario 1: enqueue + dedupeKey collapse ───────────────────────
oq.enqueue({ type: 'store.upsert', payload: { key: 'k1', value: 1 }, dedupeKey: 'k1' });
oq.enqueue({ type: 'store.upsert', payload: { key: 'k1', value: 2 }, dedupeKey: 'k1' });
oq.enqueue({ type: 'store.upsert', payload: { key: 'k1', value: 3 }, dedupeKey: 'k1' });
oq.enqueue({ type: 'store.upsert', payload: { key: 'k2', value: 9 }, dedupeKey: 'k2' });
eq(oq.getCount(), 2, 'dedupe collapses repeated writes by key');
const q1 = JSON.parse(lsStore.get('expo-offline-queue'));
const k1 = q1.find(e => e.dedupeKey === 'k1');
eq(k1.payload.value, 3, 'last write wins for dedupeKey');

// Clear queue between scenarios.
lsStore.clear();

// ─── Scenario 2: drain calls handler in FIFO order ──────────────────
const calls = [];
oq.registerHandler('test.x', async (payload) => { calls.push(payload.n); });
oq.enqueue({ type: 'test.x', payload: { n: 1 } });
oq.enqueue({ type: 'test.x', payload: { n: 2 } });
oq.enqueue({ type: 'test.x', payload: { n: 3 } });
await oq.drain();
eq(calls, [1, 2, 3], 'drain replays handlers FIFO');
eq(oq.getCount(), 0, 'queue empty after successful drain');

// ─── Scenario 3: handler failure → attempts increment, then retry ──
lsStore.clear();
let attempt = 0;
oq.registerHandler('test.flaky', async () => {
  attempt++;
  if (attempt < 3) throw new Error('network fail');
});
oq.enqueue({ type: 'test.flaky', payload: {} });
await oq.drain();
truthy(oq.getCount() === 1, 'failed entry stays queued');
const q3a = JSON.parse(lsStore.get('expo-offline-queue'));
eq(q3a[0].attempts, 1, 'attempts bumped to 1 on first failure');

await oq.drain();
const q3b = JSON.parse(lsStore.get('expo-offline-queue'));
eq(q3b[0].attempts, 2, 'attempts bumped to 2 on second failure');

await oq.drain();
eq(oq.getCount(), 0, 'entry drained successfully on third attempt');

// ─── Scenario 4: max attempts → drop + emit ─────────────────────────
lsStore.clear();
const droppedErrors = [];
oq.setOnError((e) => droppedErrors.push(e));
oq.registerHandler('test.dead', async () => { throw new Error('permafail'); });
oq.enqueue({ type: 'test.dead', payload: { id: 'd1' } });
for (let i = 0; i < 6; i++) await oq.drain();
eq(oq.getCount(), 0, 'permafail entry dropped after MAX_ATTEMPTS');
eq(droppedErrors.length, 1, 'onError fired once for the dropped entry');
eq(droppedErrors[0].type, 'test.dead', 'dropped error has the right type');

// ─── Scenario 5: subscribe fires synchronously then on changes ──────
lsStore.clear();
const seen = [];
const unsub = oq.subscribe(n => seen.push(n));
oq.enqueue({ type: 'test.x', payload: { n: 1 } });
oq.enqueue({ type: 'test.x', payload: { n: 2 } });
unsub();
oq.enqueue({ type: 'test.x', payload: { n: 3 } }); // post-unsub, should NOT push
truthy(seen.length >= 3, `subscribe fires on initial + each enqueue (got ${seen.length})`);
eq(seen[seen.length - 1], 2, 'last seen count is 2 (post-unsub enqueue ignored)');

// ─── Scenario 6: offline navigator.onLine blocks drain ──────────────
lsStore.clear();
let ranOffline = 0;
oq.registerHandler('test.never', async () => { ranOffline++; });
oq.enqueue({ type: 'test.never', payload: {} });
navState.onLine = false;
await oq.drain();
eq(ranOffline, 0, 'drain skips when navigator.onLine === false');
eq(oq.getCount(), 1, 'entry remains queued while offline');
navState.onLine = true;
await oq.drain();
eq(ranOffline, 1, 'drain resumes when online');

// ─── Scenario 7: online event triggers drain via the listener ───────
lsStore.clear();
let ranEvent = 0;
oq.registerHandler('test.evt', async () => { ranEvent++; });
oq.enqueue({ type: 'test.evt', payload: {} });
fireOnline();
// fireOnline calls drainQueue() inside the listener — but the listener calls
// drain() asynchronously. Wait a microtask.
await new Promise(r => setImmediate(r));
await new Promise(r => setImmediate(r));
eq(ranEvent, 1, 'online event fires drain via the module-level listener');

// ─── Scenario 8: unknown handler → drop entry ───────────────────────
lsStore.clear();
oq.enqueue({ type: 'test.no_handler_for_this', payload: {} });
await oq.drain();
eq(oq.getCount(), 0, 'unknown op type drops cleanly without looping forever');

console.log('\nDone.');
