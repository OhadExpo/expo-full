// Set the opponent / venue / home flag on one fixture the calendar left blank.
//
// Ohad, 20.09: "why isn't this updated? an opponent has been set" — then, when
// I blamed the calendar: "thats incorrect the game is on friday and updated
// plus it's info that's everywhere online". He was right on both counts. The
// DATE is current (25.09.2026 is a Friday, 14:00, Winner Cup) and only the
// opponent was missing, because the club calendar event is still titled
// "Winner cup game ???" and he has reader-only access to that calendar.
//
// The zone now has an opponent field in the Week Planner so this is a one-off,
// but the value still has to get into the row that is already there.
//
//   node scripts/set-fixture-opponent.mjs --date 2026-09-25 --opponent "..." \
//        [--venue "..."] [--home true|false] [--dry]
//
// writeStore snapshots the previous value before replacing it.
import { ownerClient, readStore, writeStore } from './lib/store-client.mjs';

const arg = (k, d) => {
  const i = process.argv.indexOf('--' + k);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const DRY = process.argv.includes('--dry');
const date = arg('date');
const opponent = arg('opponent');
const venue = arg('venue');
const home = arg('home');
if (!date || !opponent) { console.log('need --date and --opponent'); process.exit(2); }

const s = await ownerClient();
const fx = (await readStore(s, 'expo-bhbc-fixtures')) || [];
const hits = fx.filter((f) => f.date === date && /game/i.test(f.type || ''));
if (hits.length !== 1) {
  // Never guess which row to write. Two games on one date is a real shape in
  // this data (a seeded row plus a calendar row), and picking the wrong one
  // puts the opponent on the wrong fixture.
  console.log(`${hits.length} game(s) on ${date} — refusing to guess. Rows:`);
  for (const h of hits) console.log('  ' + JSON.stringify(h));
  process.exit(1);
}
const before = hits[0];
const after = { ...before, opponent, ...(venue ? { venue } : null), ...(home != null ? { home: home === 'true' } : null) };
console.log('before:', JSON.stringify(before));
console.log('after :', JSON.stringify(after));
if (DRY) { console.log('--dry: nothing written'); process.exit(0); }

const out = fx.map((f) => (f === before ? after : f));
await writeStore(s, 'expo-bhbc-fixtures', out);
// Read it back. A write that is not read back is a claim, not a fact.
const check = ((await readStore(s, 'expo-bhbc-fixtures')) || []).find((f) => f.date === date && /game/i.test(f.type || ''));
console.log(check && check.opponent === opponent
  ? `verified in the store: ${date} vs ${check.opponent}${check.venue ? ' @ ' + check.venue : ''}`
  : `WRITE DID NOT STICK: ${JSON.stringify(check)}`);
if (!check || check.opponent !== opponent) process.exitCode = 1;
