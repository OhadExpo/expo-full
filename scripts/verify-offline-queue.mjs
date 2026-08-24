// Regression suite for the offline write queue — the subsystem where a bug
// silently destroys an athlete's logged workout or weigh-in.
//
// The module talks to localStorage / navigator / window at import time, so we
// stub the browser surface FIRST, then import it. `window` is deliberately left
// undefined so the module does not install its timers/listeners in node.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
};
// node exposes navigator as a getter-only property, so define it instead.
const nav = { onLine: true };
Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true, writable: true });

const q = await import('../src/offlineQueue.js');

let pass = 0, fail = 0;
const t = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log(`  ✗ ${name}\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`); }
};
const reset = () => { store.clear(); q.setQueueUser('u1'); };

console.log('OFFLINE QUEUE\n');

// ── a transient failure must NEVER lose a critical write ───────────────────
{
  reset();
  let attempts = 0;
  q.registerHandler('t.flaky', async () => { attempts++; throw Object.assign(new Error('network down'), { code: 'FETCH' }); });
  q.enqueue({ type: 't.flaky', payload: { row: 1 }, critical: true });
  for (let i = 0; i < 8; i++) await q.drain();
  t('critical write survives repeated transient failure', q.getCount(), 1);
  t('it was actually attempted', attempts > 0, true);
}

// ── a PERMANENT failure is dropped at once, and reported ───────────────────
{
  reset();
  const seen = [];
  q.setOnError((e) => seen.push(e.msg));
  q.registerHandler('t.rls', async () => { throw Object.assign(new Error('new row violates row-level security policy'), { code: '42501' }); });
  q.enqueue({ type: 't.rls', payload: { row: 2 }, critical: true });
  await q.drain();
  t('RLS failure drops immediately', q.getCount(), 0);
  t('and surfaces to the user', seen.length > 0, true);
  q.setOnError(null);
}

// ── an EXPIRED TOKEN is transient, not permanent ───────────────────────────
// This is the one that would silently destroy a logged workout: supabase-js
// refreshes and the identical write then succeeds.
{
  reset();
  q.registerHandler('t.jwt', async () => { throw Object.assign(new Error('JWT expired'), { code: 'PGRST301' }); });
  q.enqueue({ type: 't.jwt', payload: { row: 3 }, critical: true });
  await q.drain();
  t('expired JWT keeps the write queued', q.getCount(), 1);
}

// ── another user's entry is never replayed under the wrong JWT ─────────────
{
  reset();
  let ran = 0;
  q.registerHandler('t.mine', async () => { ran++; });
  q.setQueueUser('userA');
  q.enqueue({ type: 't.mine', payload: { row: 4 }, critical: true });
  q.setQueueUser('userB');          // a different person signs in on the device
  await q.drain();
  t('foreign entry is not executed', ran, 0);
  t('and is preserved, not dropped', q.getCount(), 1);
  q.setQueueUser('userA');          // A comes back
  await q.drain();
  t('it drains once its owner returns', ran, 1);
  t('queue empty afterwards', q.getCount(), 0);
}

// ── an unknown op type: droppable if trivial, parked if it carries data ────
{
  reset();
  q.enqueue({ type: 't.unregistered.trivial', payload: { row: 5 } });
  await q.drain();
  t('unknown non-critical type is dropped', q.getCount(), 0);

  reset();
  q.enqueue({ type: 't.unregistered.critical', payload: { row: 6 }, critical: true });
  await q.drain();
  t('unknown CRITICAL type is kept for a future deploy', q.getCount(), 1);
}

// ── dedupeKey collapses a debounced autosave to the latest value ───────────
{
  reset();
  const wrote = [];
  q.registerHandler('t.dedupe', async (p) => { wrote.push(p.v); });
  q.enqueue({ type: 't.dedupe', payload: { v: 'first' }, dedupeKey: 'row-1' });
  q.enqueue({ type: 't.dedupe', payload: { v: 'second' }, dedupeKey: 'row-1' });
  t('dedupe collapses to one entry', q.getCount(), 1);
  await q.drain();
  t('and the LATEST value is what ships', wrote, ['second']);
}

// ── a success removes exactly its own entry, never a newer one ─────────────
{
  reset();
  const wrote = [];
  q.registerHandler('t.ok', async (p) => { wrote.push(p.v); });
  q.enqueue({ type: 't.ok', payload: { v: 'a' } });
  q.enqueue({ type: 't.ok', payload: { v: 'b' } });
  await q.drain();
  t('both drain in FIFO order', wrote, ['a', 'b']);
  t('queue drained clean', q.getCount(), 0);
}

// ── offline: do not even try ───────────────────────────────────────────────
{
  reset();
  let ran = 0;
  q.registerHandler('t.offline', async () => { ran++; });
  q.enqueue({ type: 't.offline', payload: {}, critical: true });
  nav.onLine = false;
  await q.drain();
  nav.onLine = true;
  t('nothing is attempted while offline', ran, 0);
  t('and the write is still queued', q.getCount(), 1);
}

console.log(`\nOFFLINE QUEUE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
