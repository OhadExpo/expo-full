// THE BATTERY BACKS OFF A STRUGGLING DATABASE (4.10 #543): the 10:47 outage began
// while two test browsers kept loading signed-in pages against prod. Before every
// gate the runner calls this: a database read that is slow (> 3 s) or failing
// means WAIT (30 s steps, up to 10 min) instead of adding load. Exit 0 = healthy,
// go on; exit 3 = still unhealthy after 10 min (the runner stops).
import { probeOnce } from './db-watchdog.mjs';
const t0 = Date.now();
// exitCode + a natural end, never process.exit(): exiting while a fetch handle is still closing
// tripped libuv's assertion on Windows (10.10: 'Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)'
// - exit 127, read by the runner as an unhealthy database, and the 1010f chain stopped at once)
for (let i = 0; ; i++) {
  const a = Date.now(); const p = await probeOnce(); const ms = Date.now() - a;
  if (p.dbOk && ms < 3000) { if (i) console.log(`db-health: healthy again after ${Math.round((Date.now() - t0) / 1000)} s (${p.detail})`); process.exitCode = 0; break; }
  if (Date.now() - t0 > 10 * 60 * 1000) { console.log(`db-health: STILL unhealthy after 10 min (${p.detail}) - stopping the battery`); process.exitCode = 3; break; }
  console.log(`db-health: database slow or failing (${p.detail}) - pausing the battery 30 s`);
  await new Promise((r) => setTimeout(r, 30000));
}
