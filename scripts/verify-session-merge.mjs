// Regression test for audit #43 — the group-session coach mirror.
// Pure logic, no browser and no second device needed.
import { mergeIncomingSession, PROTECT_MS } from '../src/sessionMerge.js';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; } else { fail++; console.log(`  ✗ ${name}\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`); }
};

const athlete = (rowId, load) => ({ rowId, exercises: [{ sets: [{ load }] }] });
const NOW = 1_000_000;

console.log('SESSION MERGE — audit #43\n');

// 1. The big screen is typing a load on athlete A; the phone's snapshot, built
//    before that keystroke, must NOT revert it.
{
  const mine = { athletes: [athlete('a', '100'), athlete('b', '50')] };
  const remote = { athletes: [athlete('a', ''), athlete('b', '50')] };
  const touched = new Map([['a', NOW - 200]]);
  const out = mergeIncomingSession(mine, remote, touched, NOW);
  eq('in-flight local edit survives', out.athletes[0].exercises[0].sets[0].load, '100');
  eq('untouched row takes the remote value', out.athletes[1].exercises[0].sets[0].load, '50');
}

// 2. The other device's change to a row we are NOT editing must land.
{
  const mine = { athletes: [athlete('a', '100'), athlete('b', '')] };
  const remote = { athletes: [athlete('a', '100'), athlete('b', '60')] };
  const touched = new Map([['a', NOW - 200]]);
  const out = mergeIncomingSession(mine, remote, touched, NOW);
  eq('remote edit on another athlete applies', out.athletes[1].exercises[0].sets[0].load, '60');
}

// 3. Protection EXPIRES — a stale touch must not pin a row forever.
{
  const mine = { athletes: [athlete('a', '100')] };
  const remote = { athletes: [athlete('a', '999')] };
  const touched = new Map([['a', NOW - (PROTECT_MS + 1)]]);
  const out = mergeIncomingSession(mine, remote, touched, NOW);
  eq('expired protection yields to remote', out.athletes[0].exercises[0].sets[0].load, '999');
}

// 4. An athlete added on the other device still arrives.
{
  const mine = { athletes: [athlete('a', '100')] };
  const remote = { athletes: [athlete('a', '100'), athlete('c', '')] };
  const out = mergeIncomingSession(mine, remote, new Map([['a', NOW]]), NOW);
  eq('newly added athlete arrives', out.athletes.map((x) => x.rowId), ['a', 'c']);
}

// 5. Non-athlete session fields always come from the incoming snapshot.
{
  const mine = { curEx: 1, athletes: [athlete('a', '100')] };
  const remote = { curEx: 4, athletes: [athlete('a', '')] };
  const out = mergeIncomingSession(mine, remote, new Map([['a', NOW]]), NOW);
  eq('session-level fields follow the sender', out.curEx, 4);
}

// 6. Degenerate inputs never throw or lose state.
{
  eq('no prev -> take incoming', mergeIncomingSession(null, { athletes: [] }, new Map(), NOW), { athletes: [] });
  eq('no incoming athletes -> keep prev', mergeIncomingSession({ athletes: [athlete('a', '1')] }, {}, new Map(), NOW).athletes[0].rowId, 'a');
}

console.log(`\nSESSION MERGE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
