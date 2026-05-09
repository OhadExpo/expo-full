// For each fuzzy/missed title, dump the top library candidates so we can decide
// whether a typo-fix or synonym would correctly link it.
const { createClient } = require('@supabase/supabase-js');
const sb = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');

const probes = [
  'Continiuous Overhead Med Ball Throw',
  'Banded Crab-POS Raise',
  'Side-Plank POS Hand to Toe',
  'Trap Bar Squat Jump',
  'Chest-Supported T-Bar MID-POS Row',
  'Elevated Floating-Heel Banded Hip-Thrust POGO Jump',
  'SA Bear-POS SCAP PRO-RET',
  'Prone-Laying Supinated to Pronated SA DB Y-Raise',
];

const norm = (s) => String(s||'').toLowerCase().replace(/[–—]/g,'-').replace(/[^\w\s-+&()/]/g,' ').replace(/\s+/g,' ').trim();
const tok = (s) => norm(s).replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim().split(' ').filter(Boolean);
const jac = (a,b) => { const A=new Set(a), B=new Set(b); if(!A.size||!B.size) return 0; let i=0; for (const x of A) if (B.has(x)) i++; return i/(A.size+B.size-i); };

(async () => {
  await sb.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  const { data } = await sb.from('store').select('value').eq('key', 'expo-exercises').maybeSingle();
  const lib = data?.value || [];

  for (const want of probes) {
    const wTok = tok(want);
    const ranked = lib.map(ex => ({ ex, s: jac(wTok, tok(ex.title)) }))
      .sort((a,b) => b.s - a.s)
      .slice(0, 6);
    console.log(`\n>> ${want}`);
    for (const r of ranked) console.log(`   ${r.s.toFixed(2)}  ${r.ex.title}`);
  }
})();
