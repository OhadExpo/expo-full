// Fixtures for tonnageACWR (src/lineageAnalysis.js) — the acute:chronic workload
// ratio (a recognized injury-risk signal). A fabricated HIGH band nudges a coach
// to deload a fresh athlete; a missed HIGH hides a real load spike. Pins the
// band cutoffs AND the fresh-context guards that stop a returning/sparse logger
// from faking a ~4.0 spike (in-window coverage, >=3 chronic sessions, >=21 days).
// Run: node scripts/verify-tonnage-acwr.mjs
import { tonnageACWR } from '../src/lineageAnalysis.js';

let pass = 0, fail = 0;
const check = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); cond ? pass++ : fail++; };
const DAY = 86400000;
const NOW = 1_700_000_000_000; // fixed (Date.now() is unavailable in-script)
// one session `daysAgo` with a single set load×reps (done)
const sess = (daysAgo, load, reps) => ({ date: NOW - daysAgo * DAY, exercises: [{ sets: [{ load, reps, done: true }] }] });
const run = (rows) => tonnageACWR(rows, NOW);

// --- thin guards ---
check('no sessions -> thin', run([]).state === 'thin');
check('only 3 sessions (recent<4) -> thin', run([sess(1, 100, 5), sess(10, 100, 5), sess(20, 100, 5)]).state === 'thin');
check('span <21 days (all in last 10d) -> thin', run([sess(1, 100, 5), sess(3, 100, 5), sess(5, 100, 5), sess(8, 100, 5), sess(10, 100, 5)]).state === 'thin');
check('<3 chronic sessions (days 8-28) -> thin', run([sess(1, 100, 5), sess(3, 100, 5), sess(5, 100, 5), sess(24, 100, 5)]).state === 'thin');

// --- OK band: steady 2/week, acute ~= chronic weekly ---
const ok = run([1, 4, 8, 11, 15, 18, 22, 25].map((d) => sess(d, 100, 5)));
check('steady load -> state ok', ok.state === 'ok');
check('steady load -> band ok (~0.89)', ok.band === 'ok' && ok.acwr >= 0.8 && ok.acwr < 1.5);
check('ok -> returns a tonnage series for the graph', Array.isArray(ok.series) && ok.series.length > 0);

// --- HIGH band: heavy acute week over a lighter chronic baseline ---
const high = run([sess(1, 200, 5), sess(2, 200, 5), sess(4, 200, 5), sess(6, 200, 5),
  sess(8, 100, 5), sess(11, 100, 5), sess(15, 100, 5), sess(18, 100, 5), sess(22, 100, 5), sess(25, 100, 5)]);
check('acute spike -> band high (>=1.5)', high.state === 'ok' && high.band === 'high' && high.acwr >= 1.5);

// --- LOW band: light acute week under a heavy chronic baseline ---
const low = run([sess(1, 50, 5),
  sess(8, 200, 5), sess(11, 200, 5), sess(15, 200, 5), sess(18, 200, 5), sess(22, 200, 5), sess(25, 200, 5)]);
check('acute trough -> band low (<0.8)', low.state === 'ok' && low.band === 'low' && low.acwr < 0.8);

console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ FAILURES'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
