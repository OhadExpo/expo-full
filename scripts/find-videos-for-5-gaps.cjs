// Look for ANY library entry that could supply a video for the 5 missing-video exercises.
const { createClient } = require('@supabase/supabase-js');
const SB = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';

const QUERIES = [
  { label: 'Shrimp Squat',  re: /shrimp[\s-]?squat/i },
  { label: 'Sup to Pro Y-Raise', re: /(supinated.*pronated.*y[\s-]?raise|sup.*pro.*y[\s-]?raise)/i },
  { label: 'FFESS POGO',    re: /ffess.*pogo|pogo.*ffess/i },
  { label: 'Hollow Clam',   re: /hollow.*clam|clam.*hollow/i },
  { label: 'Pogo (general)',re: /pogo/i },
];

(async () => {
  const s = createClient(SB, KEY);
  await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  const { data: row } = await s.from('store').select('value').eq('key', 'expo-exercises').maybeSingle();
  const lib = Array.isArray(row?.value) ? row.value : [];
  for (const q of QUERIES) {
    console.log('\n══ ' + q.label + ' ══');
    const hits = lib.filter(e => q.re.test(`${e.title || ''} | ${e.cues || ''}`));
    if (!hits.length) { console.log('  (none)'); continue; }
    for (const e of hits.slice(0, 8)) {
      console.log(`  · ${e.title}  [${e.id}]  ${e.videoLink || e.videoUrl || '(no vid)'}`);
    }
  }
})().catch(e => { console.error(e.message); process.exit(1); });
