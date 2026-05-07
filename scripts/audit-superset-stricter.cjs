// Stricter audit run after the ABAB fix. Catches OTHER suspicious
// superset patterns that the alternating-A/B fingerprint missed:
//
//   1. ALL-SAME — plans where every exercise has the same superset letter
//      (e.g. AAAAA). Genuine pattern is rare; usually indicates a botched
//      import that picked one letter for everything.
//   2. SOLO-LETTER — a single exercise tagged with a superset letter that
//      has no matching neighbour anywhere in its day. Real supersets pair;
//      a solo A is suspicious.
//   3. HIGH-LETTER-NO-LOW — uses C/D/E without A/B. Skipping the early
//      letters violates the mod-5 mapping convention.
//   4. ODD-GROUP-COUNT — letter appears an odd number of times in a day
//      (e.g. AAAB). Pairs should be even; tri-sets exist but are rare.
//   5. NON-CONSECUTIVE — same letter appears in positions that aren't
//      adjacent (e.g. ABABA pre-fix would qualify; ABBA also). After our
//      fix, consecutive grouping should be the rule.
//
// Output: every flagged plan/day. Day-level view so we can scope follow-up.

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const SUPA_URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const SUPA_PUBLISHABLE_KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
const sb = createClient(SUPA_URL, SUPA_PUBLISHABLE_KEY);

(async () => {
  const { error: authErr } = await sb.auth.signInWithPassword({
    email: 'ohadyproductions@gmail.com', password: '1234',
  });
  if (authErr) { console.error('auth failed:', authErr.message); process.exit(1); }

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

  const { data: plans } = await sb.from('plans').select('id, name, trainee_id, active, data');

  const findings = [];
  for (const p of plans) {
    const days = p.data?.days || [];
    for (let di = 0; di < days.length; di++) {
      const exs = days[di]?.exercises || days[di]?.ex || [];
      const seq = exs.map(e => e?.superset || e?.ss || '');
      const setOnly = seq.filter(Boolean);
      if (setOnly.length === 0) continue; // no supersets at all — different category

      const used = [...new Set(setOnly)].sort();
      const counts = {};
      setOnly.forEach(l => { counts[l] = (counts[l] || 0) + 1; });

      // Check 1: all-same single letter
      const allSame = used.length === 1 && setOnly.length >= 3;

      // Check 2: solo letter — letter with count of 1
      const soloLetters = Object.entries(counts).filter(([_, c]) => c === 1).map(([l]) => l);

      // Check 3: high-letter-no-low — uses C/D/E but not A
      const usesHighNoLow = (used.includes('C') || used.includes('D') || used.includes('E')) && !used.includes('A');

      // Check 4: odd group count (any letter with odd count > 1)
      const oddCounts = Object.entries(counts).filter(([_, c]) => c > 1 && c % 2 !== 0).map(([l, c]) => `${l}=${c}`);

      // Check 5: non-consecutive — same letter at non-adjacent positions
      const nonConsecutive = [];
      for (const letter of used) {
        const positions = [];
        seq.forEach((s, i) => { if (s === letter) positions.push(i); });
        // gap = max consecutive run; if any position has a non-letter neighbour
        // between two letter positions, it's non-consecutive.
        let prev = -2;
        let gapped = false;
        for (const pos of positions) {
          if (prev >= 0 && pos - prev > 1) {
            // Check if everything between prev and pos is empty
            for (let i = prev + 1; i < pos; i++) {
              if (seq[i] && seq[i] !== letter) { gapped = true; break; }
            }
          }
          prev = pos;
        }
        if (gapped) nonConsecutive.push(letter);
      }

      const flags = [];
      if (allSame) flags.push('ALL-SAME');
      if (soloLetters.length) flags.push(`SOLO[${soloLetters.join(',')}]`);
      if (usesHighNoLow) flags.push('HIGH-NO-LOW');
      if (oddCounts.length) flags.push(`ODD[${oddCounts.join(',')}]`);
      if (nonConsecutive.length) flags.push(`NON-CONSEC[${nonConsecutive.join(',')}]`);

      if (flags.length) {
        findings.push({
          plan_id: p.id,
          plan_name: p.name,
          trainee: traineeName(p.trainee_id),
          active: !!p.active,
          dayIdx: di,
          dayName: days[di]?.name || `Day ${di + 1}`,
          sequence: seq.join(','),
          flags,
        });
      }
    }
  }

  console.log(`\nScanned ${plans.length} plans across ${trainees.length} trainees.`);
  console.log(`Suspicious days flagged: ${findings.length}\n`);

  // Group by flag type
  const byFlag = {};
  findings.forEach(f => f.flags.forEach(fl => {
    const key = fl.split('[')[0]; // strip brackets for grouping
    byFlag[key] = (byFlag[key] || 0) + 1;
  }));
  console.log(`--- by flag ---`);
  Object.entries(byFlag).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => {
    console.log(`  ${k.padEnd(15)} ${String(n).padStart(4)} occurrences`);
  });

  console.log(`\n--- detail (first 60) ---`);
  findings.slice(0, 60).forEach(f => {
    console.log(`  [${f.trainee}] ${f.plan_name.padEnd(28)} · ${f.dayName.padEnd(20)} ${f.flags.join(',')} seq=${f.sequence}${f.active ? ' (ACTIVE)' : ''}`);
  });

  fs.writeFileSync('scripts/audit-superset-stricter.json', JSON.stringify({ generatedAt: new Date().toISOString(), totalPlans: plans.length, findings }, null, 2));
  console.log('\nwrote scripts/audit-superset-stricter.json');

  await sb.auth.signOut();
})();
