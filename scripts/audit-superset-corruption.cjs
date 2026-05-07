// Read-only audit of every plan's superset assignments to find rows with
// the alternating-A/B fingerprint that indicates the old `1a/1b/2a/2b/3a/3b`
// import bug. The fix path: pull the original Drive sheet for each affected
// plan and re-derive the correct group-number → letter mapping (mod-5).
//
// Output: one row per affected day, sorted by trainee + plan, with the
// observed superset sequence so we can eyeball before any DB writes.
//
// Run: node scripts/audit-superset-corruption.cjs
//
// No DB writes anywhere. Strictly diagnostic.

const { createClient } = require('@supabase/supabase-js');

const SUPA_URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const SUPA_PUBLISHABLE_KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';

const sb = createClient(SUPA_URL, SUPA_PUBLISHABLE_KEY);

(async () => {
  const { error: authErr } = await sb.auth.signInWithPassword({
    email: 'ohadyproductions@gmail.com',
    password: '1234',
  });
  if (authErr) { console.error('auth failed:', authErr.message); process.exit(1); }

  // Trainee map for readable output (id → name).
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

  // Fetch every plan. data column carries days[].exercises[].
  const { data: plans, error: pErr } = await sb.from('plans').select('id, name, trainee_id, data, created_at, updated_at');
  if (pErr) { console.error('plans fetch failed:', pErr.message); process.exit(1); }
  console.log(`Scanned ${plans.length} plans.\n`);

  // Some plans use compact keys (ex/eid/ss), others verbose (exercises/superset).
  const exsOf = (day) => day?.exercises || day?.ex || [];
  const ssOf = (ex) => ex?.superset || ex?.ss || '';

  // For each day, score the alternating-A/B fingerprint:
  //   - consider only exercises where ss is set
  //   - if every set ss is in {A, B} (never C/D/E) AND
  //     adjacent ones alternate A,B,A,B,... that's the corruption pattern
  //   - count alternations vs same-letter neighbours
  function dayDiagnosis(exs) {
    const seq = exs.map(ssOf);
    const setOnly = seq.filter(Boolean);
    if (setOnly.length < 2) return { affected: false, sequence: seq.join('') };
    const usedLetters = new Set(setOnly);
    if (!(usedLetters.size === 2 && usedLetters.has('A') && usedLetters.has('B'))) {
      return { affected: false, sequence: seq.join(''), reason: `letters: ${[...usedLetters].join(',')}` };
    }
    let alt = 0, same = 0;
    for (let i = 1; i < setOnly.length; i++) {
      if (setOnly[i] !== setOnly[i - 1]) alt++; else same++;
    }
    // Strict fingerprint: more alternations than same-letter neighbours,
    // and at least 4 exercises participating.
    const affected = alt >= same && setOnly.length >= 4 && alt >= 3;
    return { affected, sequence: seq.join(''), alt, same, n: setOnly.length };
  }

  const affected = [];
  for (const p of plans) {
    const days = p.data?.days || [];
    const dayHits = [];
    for (let di = 0; di < days.length; di++) {
      const d = days[di];
      const dx = dayDiagnosis(exsOf(d));
      if (dx.affected) dayHits.push({ dayIdx: di, dayName: d?.name || `Day ${di + 1}`, ...dx });
    }
    if (dayHits.length) {
      affected.push({
        id: p.id,
        name: p.name,
        trainee_id: p.trainee_id,
        traineeName: traineeName(p.trainee_id),
        created_at: p.created_at,
        days: dayHits,
      });
    }
  }

  // Sort by athlete then plan name for human-readable output.
  affected.sort((a, b) => (a.traineeName || '').localeCompare(b.traineeName || '', 'he')
    || (a.name || '').localeCompare(b.name || '', 'he'));

  console.log(`Affected plans: ${affected.length} of ${plans.length}\n`);

  // By athlete summary
  const byAthlete = new Map();
  for (const a of affected) {
    const k = a.traineeName;
    if (!byAthlete.has(k)) byAthlete.set(k, []);
    byAthlete.get(k).push(a);
  }
  console.log('--- by athlete ---');
  for (const [name, list] of [...byAthlete.entries()].sort((x, y) => y[1].length - x[1].length)) {
    console.log(`  ${name.padEnd(30)} ${String(list.length).padStart(3)} plans`);
  }

  console.log('\n--- detail (first 80 affected days) ---');
  let printed = 0;
  for (const a of affected) {
    for (const d of a.days) {
      if (printed >= 80) break;
      console.log(`  [${a.traineeName}] ${a.name.padEnd(30)} · ${d.dayName.padEnd(20)} seq=${d.sequence}  (alt=${d.alt}, same=${d.same}, n=${d.n})`);
      printed++;
    }
    if (printed >= 80) break;
  }

  // Dump full result to JSON for downstream tooling.
  const fs = require('fs');
  const out = { generatedAt: new Date().toISOString(), totalPlans: plans.length, affected };
  fs.writeFileSync('scripts/audit-superset-corruption.json', JSON.stringify(out, null, 2));
  console.log('\nwrote scripts/audit-superset-corruption.json');

  await sb.auth.signOut();
})();
