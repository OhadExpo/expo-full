// Remediate the `1a/1b/2a/2b/3a/3b` import bug in EXPO's plans table.
//
// Detection: per-day, find exercises whose superset values form a strict
// alternating A/B pattern with no other letters. Verified against Omer
// Sade's Drive sheet (Block #2) on 2026-05-08 — the source labels match
// the predicted pair-by-pair grouping exactly. Applies same rule across
// every affected day, athlete-agnostic, since the corruption fingerprint
// is unambiguous.
//
// Algorithm (per affected day):
//   1. Walk exercises in order, count only those with a non-empty superset.
//   2. Pair index = (with-ss-counter) / 2.
//   3. Letter = LETTERS[pair_index mod 5] where LETTERS = [A,B,C,D,E].
//   4. Standalone exercises (no superset) are untouched.
//   5. All other fields (sets, reps, load, rpe, tempo, notes, video) stay.
//
// Run modes:
//   node scripts/fix-superset-corruption.cjs           → dry-run, prints
//                                                       proposed diff for
//                                                       every affected
//                                                       plan/day. No DB
//                                                       writes.
//   node scripts/fix-superset-corruption.cjs --apply  → executes the
//                                                       updates against
//                                                       Supabase.
//
// Auth uses ohadyproductions@gmail.com / 1234 per
// reference_scripts_trainer_auth.md.

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const SUPA_URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const SUPA_PUBLISHABLE_KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
const APPLY = process.argv.includes('--apply');
const LETTERS = ['A', 'B', 'C', 'D', 'E'];

const sb = createClient(SUPA_URL, SUPA_PUBLISHABLE_KEY);

const exsOf = (day) => day?.exercises || day?.ex || [];
const exsKeyOf = (day) => (day?.exercises ? 'exercises' : 'ex');
const ssOf = (ex) => ex?.superset ?? ex?.ss ?? '';
const ssKeyOf = (ex) => (ex && Object.prototype.hasOwnProperty.call(ex, 'superset') ? 'superset'
                       : ex && Object.prototype.hasOwnProperty.call(ex, 'ss') ? 'ss'
                       : 'superset');

function isCorruptedSequence(seq) {
  const setOnly = seq.filter(Boolean);
  if (setOnly.length < 4) return false;
  const used = new Set(setOnly);
  if (!(used.size === 2 && used.has('A') && used.has('B'))) return false;
  // Strictly alternating: no two adjacent are the same.
  for (let i = 1; i < setOnly.length; i++) {
    if (setOnly[i] === setOnly[i - 1]) return false;
  }
  return true;
}

function remapDayExercises(exs) {
  let pairCounter = 0; // counts exercises with a superset assigned
  return exs.map((ex) => {
    const ss = ssOf(ex);
    if (!ss) return ex;
    const pairIdx = Math.floor(pairCounter / 2);
    const letter = LETTERS[pairIdx % LETTERS.length];
    pairCounter++;
    const key = ssKeyOf(ex);
    if (ex[key] === letter) return ex;
    return { ...ex, [key]: letter };
  });
}

(async () => {
  const { error: authErr } = await sb.auth.signInWithPassword({
    email: 'ohadyproductions@gmail.com',
    password: '1234',
  });
  if (authErr) { console.error('auth failed:', authErr.message); process.exit(1); }

  // Trainee map for readable output.
  const { data: tr } = await sb.from('store').select('value').eq('key', 'expo-trainees').maybeSingle();
  const trainees = tr?.value || [];
  const traineeName = (tid) => {
    if (!tid) return '(unassigned)';
    const t = trainees.find(x => x.id === tid);
    if (t) return t.name;
    const m = tid.match(/^(.+?)__(\d+)$/);
    if (m) {
      const parent = trainees.find(x => x.id === m[1]);
      const i = parseInt(m[2], 10);
      return (parent?.members?.[i]?.name) || (parent?.name) || tid;
    }
    return tid;
  };

  const { data: plans, error: pErr } = await sb.from('plans').select('id, name, trainee_id, data');
  if (pErr) { console.error('plans fetch failed:', pErr.message); process.exit(1); }

  const proposed = [];
  for (const p of plans) {
    const days = p.data?.days || [];
    if (!days.length) continue;
    let modified = false;
    const dayDiffs = [];
    const newDays = days.map((d, di) => {
      const exs = exsOf(d);
      const seq = exs.map(ssOf);
      if (!isCorruptedSequence(seq)) return d;
      const newExs = remapDayExercises(exs);
      const newSeq = newExs.map(ssOf);
      modified = true;
      dayDiffs.push({
        dayIdx: di,
        dayName: d?.name || `Day ${di + 1}`,
        before: seq.join(','),
        after: newSeq.join(','),
      });
      const key = exsKeyOf(d);
      return { ...d, [key]: newExs };
    });
    if (modified) {
      proposed.push({
        id: p.id,
        name: p.name,
        traineeId: p.trainee_id,
        traineeName: traineeName(p.trainee_id),
        days: dayDiffs,
        oldData: p.data,
        newData: { ...p.data, days: newDays },
      });
    }
  }

  proposed.sort((a, b) => (a.traineeName || '').localeCompare(b.traineeName || '', 'he')
    || (a.name || '').localeCompare(b.name || '', 'he'));

  console.log(`Plans to update: ${proposed.length} of ${plans.length} (mode: ${APPLY ? 'APPLY' : 'DRY-RUN'})\n`);
  for (const p of proposed) {
    console.log(`[${p.traineeName}] ${p.name}  (id=${p.id})`);
    for (const d of p.days) {
      console.log(`   ${d.dayName.padEnd(28)}  before: ${d.before}`);
      console.log(`   ${' '.padEnd(28)}  after:  ${d.after}`);
    }
    console.log('');
  }

  // Persist dry-run output for review.
  fs.writeFileSync('scripts/fix-superset-corruption.dryrun.json',
    JSON.stringify({ generatedAt: new Date().toISOString(), apply: APPLY, count: proposed.length, proposed: proposed.map(p => ({ id: p.id, name: p.name, traineeName: p.traineeName, days: p.days })) }, null, 2));

  if (!APPLY) {
    console.log('Dry-run only. No DB writes. Re-run with --apply to commit.');
    await sb.auth.signOut();
    return;
  }

  console.log('Applying updates…');
  let ok = 0, fail = 0;
  for (const p of proposed) {
    const { error } = await sb.from('plans').update({ data: p.newData, updated_at: new Date().toISOString() }).eq('id', p.id);
    if (error) { console.error(`  ✗ ${p.id}: ${error.message}`); fail++; }
    else { console.log(`  ✓ ${p.id}`); ok++; }
  }
  console.log(`\nDone. ${ok} updated, ${fail} failed.`);

  await sb.auth.signOut();
})();
