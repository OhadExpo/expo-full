// Categorize the 317 unmatched xlsx names: are they spelling variants of an
// existing expo exercise (→ enrich) or genuinely new (→ would be a new entry)?
// Read-only. node scripts/library-xlsx-analyze.cjs
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const SB = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
const XLSX_JSON = 'C:\\Users\\ADMINI~1\\AppData\\Local\\Temp\\claude\\C--Users-Administrator-Desktop-expo-full\\33c126c1-1fa5-49fc-8867-e401ddbc6e30\\scratchpad\\xlsx_library.json';

const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
const toks = (s) => new Set(norm(s).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean));
function jac(a, b) { const A = toks(a), B = toks(b); let i = 0; for (const t of A) if (B.has(t)) i++; return i / (A.size + B.size - i || 1); }

(async () => {
  const s = createClient(SB, KEY);
  await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  const { data: row } = await s.from('store').select('value').eq('key', 'expo-exercises').single();
  const exercises = row.value;
  const titles = exercises.map(e => e.title).filter(Boolean);
  const expoNorm = new Set(titles.map(norm));

  const xlsx = JSON.parse(fs.readFileSync(XLSX_JSON, 'utf8'));
  const unmatched = Object.values(xlsx).filter(r => !expoNorm.has(norm(r.name)));

  const buckets = { strong: [], weak: [], none: [] }; // >=0.7 spelling variant, 0.45-0.7 maybe, <0.45 new
  for (const rec of unmatched) {
    let best = 0, bestT = '';
    for (const t of titles) { const j = jac(rec.name, t); if (j > best) { best = j; bestT = t; } }
    const b = best >= 0.7 ? 'strong' : best >= 0.45 ? 'weak' : 'none';
    buckets[b].push({ xlsx: rec.name, expo: bestT, score: +best.toFixed(2) });
  }
  console.log('unmatched total:', unmatched.length);
  console.log('strong variant (>=0.70):', buckets.strong.length);
  console.log('weak/maybe (0.45-0.70) :', buckets.weak.length);
  console.log('likely NEW (<0.45)     :', buckets.none.length);
  const show = (name, arr) => { console.log(`\n--- ${name} (first 15) ---`); arr.slice(0, 15).forEach(x => console.log(`  "${x.xlsx}"  ~  "${x.expo}"  (${x.score})`)); };
  show('STRONG', buckets.strong);
  show('WEAK', buckets.weak);
  show('NONE/NEW', buckets.none);
  fs.writeFileSync(XLSX_JSON.replace('xlsx_library.json', 'merge_buckets.json'), JSON.stringify(buckets, null, 1), 'utf8');
})().catch(e => { console.error(e); process.exit(1); });
