// For each still-unmatched xlsx name, find expo titles whose token-set differs
// by only 1-2 tokens, and tally the differing tokens. This reveals which diffs
// are pure synonyms/abbreviations (safe to unify) vs real qualifiers (unsafe).
// Read-only. node scripts/library-nearmiss.cjs
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const SB = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
const XLSX_JSON = 'C:\\Users\\ADMINI~1\\AppData\\Local\\Temp\\claude\\C--Users-Administrator-Desktop-expo-full\\33c126c1-1fa5-49fc-8867-e401ddbc6e30\\scratchpad\\xlsx_library.json';

const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
const tset = (s) => norm(s).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ');
const toks = (s) => new Set(norm(s).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean));
function symDiff(a, b) { const A = toks(a), B = toks(b); const only = []; for (const t of A) if (!B.has(t)) only.push('x:' + t); for (const t of B) if (!A.has(t)) only.push('e:' + t); return only; }

(async () => {
  const s = createClient(SB, KEY);
  await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  const { data: row } = await s.from('store').select('value').eq('key', 'expo-exercises').single();
  const titles = row.value.map(e => e.title).filter(Boolean);
  const expoSets = titles.map(t => ({ t, set: tset(t), toks: toks(t) }));
  const expoTsetSet = new Set(expoSets.map(e => e.set));

  const xlsx = JSON.parse(fs.readFileSync(XLSX_JSON, 'utf8'));
  const unmatched = Object.values(xlsx).filter(r => !expoTsetSet.has(tset(r.name)));

  const pairCount = {};   // "x:tokenA|e:tokenB" symmetric single-token swaps
  const near1 = [];       // differ by exactly 1 token each side (a swap)
  for (const rec of unmatched) {
    const xt = toks(rec.name);
    let best = null;
    for (const e of expoSets) {
      // quick size gate: sets within 1 of each other
      if (Math.abs(e.toks.size - xt.size) > 1) continue;
      const d = symDiff(rec.name, e.t);
      if (!best || d.length < best.d.length) best = { d, e };
    }
    if (best && best.d.length <= 2) {
      const xOnly = best.d.filter(t => t.startsWith('x:')).map(t => t.slice(2));
      const eOnly = best.d.filter(t => t.startsWith('e:')).map(t => t.slice(2));
      if (xOnly.length === 1 && eOnly.length === 1) {
        const key = `${xOnly[0]}  <->  ${eOnly[0]}`;
        pairCount[key] = (pairCount[key] || 0) + 1;
        near1.push({ x: rec.name, e: best.e.t, swap: key });
      } else if (best.d.length === 1) {
        // one side has an extra token (present/absent) — usually a qualifier
        const key = best.d[0];
        pairCount['(extra) ' + key] = (pairCount['(extra) ' + key] || 0) + 1;
      }
    }
  }
  const sorted = Object.entries(pairCount).sort((a, b) => b[1] - a[1]);
  console.log('unmatched after tset:', unmatched.length);
  console.log('\n=== most common single-token differences (x:xlsx <-> e:expo) ===');
  sorted.slice(0, 45).forEach(([k, n]) => console.log(String(n).padStart(3), k));
  fs.writeFileSync(XLSX_JSON.replace('xlsx_library.json', 'nearmiss_swaps.json'), JSON.stringify(near1, null, 1), 'utf8');
})().catch(e => { console.error(e); process.exit(1); });
