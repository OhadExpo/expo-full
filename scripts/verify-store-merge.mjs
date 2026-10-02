// verify-store-merge.mjs - the three-way merge a store write falls back to when
// the row moved under it (2.10 #510-B1/B2). Pure, no network.
import { mergeStoreValues as M, deepEqual } from '../src/storeMerge.js';

let pass = 0, fail = 0;
const ok = (name, cond, got) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${name}\n       got ${JSON.stringify(got)}`); } };
console.log('STORE MERGE\n');

// --- the roster (array of records with id) ---
const base = [{ id: 'a', name: 'Amit', sessions: 8 }, { id: 'b', name: 'Bar', sessions: 4 }];
{
  // phone edits Amit's name; desktop added Dana and decremented Bar
  const mine = [{ id: 'a', name: 'Amit G', sessions: 8 }, { id: 'b', name: 'Bar', sessions: 4 }];
  const theirs = [{ id: 'a', name: 'Amit', sessions: 8 }, { id: 'b', name: 'Bar', sessions: 3 }, { id: 'd', name: 'Dana', sessions: 10 }];
  const r = M(base, mine, theirs);
  ok('roster: my rename kept', r.find((x) => x.id === 'a').name === 'Amit G', r);
  ok('roster: their decrement kept', r.find((x) => x.id === 'b').sessions === 3, r);
  ok('roster: their new athlete kept', r.some((x) => x.id === 'd'), r);
  ok('roster: no duplicates', r.length === 3, r);
}
{
  // I deleted Bar; they did not touch him -> gone
  const r = M(base, [base[0]], base);
  ok('roster: my delete of an untouched row stands', r.length === 1 && r[0].id === 'a', r);
  // I deleted Bar; they CHANGED him -> kept (never lose their edit to a delete)
  const r2 = M(base, [base[0]], [base[0], { ...base[1], sessions: 2 }]);
  ok('roster: a row they changed survives my delete', r2.some((x) => x.id === 'b' && x.sessions === 2), r2);
}
{
  // both edited the same field of the same athlete: mine wins, theirs elsewhere kept
  const mine = [{ id: 'a', name: 'Amit', sessions: 7 }, base[1]];
  const theirs = [{ id: 'a', name: 'Amit', sessions: 6, phone: '050' }, base[1]];
  const r = M(base, mine, theirs);
  ok('same field both sides: mine wins', r[0].sessions === 7, r);
  ok('same record, other field of theirs kept', r[0].phone === '050', r);
}

// --- the club season: object keyed by athlete -> per-day records ---
const season = { t1: { loads: { '2026-10-01': 300 }, availability: {} }, t2: { loads: {}, availability: {} } };
{
  // coach B logged RPE loads for t1 and t2; the physio (stale) set t2 availability
  const theirs = { t1: { loads: { '2026-10-01': 300, '2026-10-02': 420 }, availability: {} }, t2: { loads: { '2026-10-02': 380 }, availability: {} } };
  const mine = { t1: season.t1, t2: { loads: {}, availability: { '2026-10-02': 2 } } };
  const r = M(season, mine, theirs);
  ok('season: coach B loads on t1 kept', r.t1.loads['2026-10-02'] === 420, r);
  ok('season: coach B load on t2 kept', r.t2.loads['2026-10-02'] === 380, r);
  ok('season: physio availability on t2 kept', r.t2.availability['2026-10-02'] === 2, r);
}

// --- no base (booted from a snapshot): keep everything either side holds ---
{
  const r = M(undefined, [{ id: 'a', v: 1 }], [{ id: 'b', v: 2 }]);
  ok('no base: union of keyed arrays', r.length === 2, r);
  const r2 = M(undefined, { x: 1 }, { y: 2 });
  ok('no base: union of objects', r2.x === 1 && r2.y === 2, r2);
}

// --- unkeyed values are leaves ---
ok('unchanged mine -> theirs', deepEqual(M([1, 2], [1, 2], [1, 2, 3]), [1, 2, 3]), M([1, 2], [1, 2], [1, 2, 3]));
ok('unchanged theirs -> mine', deepEqual(M([1, 2], [9], [1, 2]), [9]), M([1, 2], [9], [1, 2]));
ok('identical edits', deepEqual(M(1, 5, 5), 5), M(1, 5, 5));

// --- counters and id-less lists (#510-R2 M4) ---
{
  // counters are LEAVES, deliberately (replay safety): a replay of a decrement
  // that already landed must not count twice
  const b = [{ id: 'a', sessionsRemaining: 5, phone: '1' }];
  const replay = M(b, [{ id: 'a', sessionsRemaining: 4, phone: '1' }], [{ id: 'a', sessionsRemaining: 4, phone: '2' }]);
  ok('counter: a replayed decrement is not counted twice (4, not 3)', replay[0].sessionsRemaining === 4 && replay[0].phone === '2', replay);
}
{
  const feed = [{ who: 'x', at: 1 }, { who: 'y', at: 0 }];
  const mine = [{ who: 'me', at: 3 }, ...feed];          // newest first
  const theirs = [{ who: 'them', at: 2 }, ...feed];
  const r = M(feed, mine, theirs);
  ok('feed: both new entries kept', r.length === 4 && r.some((x) => x.who === 'me') && r.some((x) => x.who === 'them'), r);
  ok('feed: my newest-first entry stays at the front', r[0].who === 'me', r);
  const r2 = M(['a', 'b', 'c'], ['a', 'c'], ['a', 'b', 'c', 'd']);
  ok('list: my removal + their addition both stand', JSON.stringify(r2) === JSON.stringify(['a', 'c', 'd']), r2);
  const rp = M(feed, mine, [{ who: 'them', at: 2 }, ...mine]);
  ok('feed: a replay of my entry that already landed is not duplicated', rp.filter((x) => x.who === 'me').length === 1 && rp.length === 4, rp);
}

// --- THE BREAK TEST: the old write was "mine, whole" - prove the roster case catches it
{
  const mine = [{ id: 'a', name: 'Amit G', sessions: 8 }, { id: 'b', name: 'Bar', sessions: 4 }];
  const theirs = [{ id: 'a', name: 'Amit', sessions: 8 }, { id: 'b', name: 'Bar', sessions: 3 }, { id: 'd', name: 'Dana', sessions: 10 }];
  const oldWrite = mine;   // what landed before #510-B1
  ok('break test: the old whole-value write loses Dana and the decrement', !oldWrite.some((x) => x.id === 'd') && oldWrite[1].sessions === 4, oldWrite);
  ok('break test: the merge does not', M(base, mine, theirs).some((x) => x.id === 'd'), null);
}

console.log(`STORE MERGE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
