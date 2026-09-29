// Cancel (or restore) one BHBC court session by date + start - the same flag the
// Practices planner's CANCEL button sets (29.9 #398). For a cancel that has to
// happen before the planner build is live, or from the shell.
//
//   node scripts/bhbc-cancel-session.mjs --date 2026-09-28 --start 10:30 [--restore] [--dry]
//
// writeStore snapshots the previous value before replacing it; the row is read
// back after the write.
import { ownerClient, readStore, writeStore } from './lib/store-client.mjs';

const arg = (k, d) => {
  const i = process.argv.indexOf('--' + k);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const DRY = process.argv.includes('--dry');
const RESTORE = process.argv.includes('--restore');
const date = arg('date');
const start = arg('start');
if (!date || !start) { console.log('need --date and --start'); process.exit(2); }

const COURT = ['practice', 'shootaround', 'scrimmage'];
const s = await ownerClient();
const fx = (await readStore(s, 'expo-bhbc-fixtures')) || [];
console.log(`sessions on ${date}:`);
for (const f of fx.filter((x) => x.date === date)) console.log('  ' + JSON.stringify({ type: f.type, start: f.start, minutes: f.minutes, cancelled: !!f.cancelled }));
const hits = fx.filter((f) => f.date === date && String(f.start || '') === start && COURT.includes(String(f.type || '').toLowerCase()));
if (hits.length !== 1) { console.log(`${hits.length} court session(s) at ${date} ${start} - refusing to guess.`); process.exit(1); }
const before = hits[0];
const after = { ...before };
if (RESTORE) { delete after.cancelled; delete after.cancelledAt; } else { after.cancelled = true; after.cancelledAt = new Date().toISOString(); }
console.log('before:', JSON.stringify(before));
console.log('after :', JSON.stringify(after));
if (DRY) { console.log('--dry: nothing written'); process.exit(0); }

await writeStore(s, 'expo-bhbc-fixtures', fx.map((f) => (f === before ? after : f)));
const check = ((await readStore(s, 'expo-bhbc-fixtures')) || []).find((f) => f.date === date && String(f.start || '') === start && COURT.includes(String(f.type || '').toLowerCase()));
console.log('read back:', JSON.stringify(check));
process.exit(!!(check && check.cancelled) === !RESTORE ? 0 : 1);
