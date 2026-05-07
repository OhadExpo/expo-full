// Match each exercise title in Yuval's "בלוק אלפא" plan to candidates in the
// expo-exercises library. Token-set scoring + length penalty. Reports top-3
// candidates per title with their videoLink/cues so we can decide manually.
// READ ONLY — no DB writes.
const { createClient } = require('@supabase/supabase-js');
const SB = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
const PLAN_ID = 'plan_yuvb_alpha_2605';

// Token normalization: lowercase, strip punctuation, split.
const STOP = new Set(['the','a','an','to','and','of','for','with','on','in']);
const norm = (s) => (s || '')
  .toLowerCase()
  .replace(/[+&/().,:;'"-]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();
const toks = (s) => norm(s).split(' ').filter(t => t && !STOP.has(t));

// Token-set similarity. Pure overlap weighted by inverse-length (small libs
// shouldn't outrank long-but-correct ones).
function score(qToks, cToks) {
  if (!qToks.length || !cToks.length) return 0;
  const qSet = new Set(qToks);
  const cSet = new Set(cToks);
  let inter = 0;
  for (const t of qSet) if (cSet.has(t)) inter++;
  // Jaccard
  const union = new Set([...qSet, ...cSet]).size;
  const jac = inter / union;
  // Coverage (how much of query is covered)
  const cov = inter / qSet.size;
  return jac * 0.4 + cov * 0.6;
}

(async () => {
  const sb = createClient(SB, KEY, { auth: { persistSession: false } });
  const { error: authErr } = await sb.auth.signInWithPassword({
    email: 'ohadyproductions@gmail.com', password: '1234',
  });
  if (authErr) { console.error('AUTH FAIL', authErr.message); process.exit(1); }

  const { data: lib, error: libErr } = await sb
    .from('store').select('value').eq('key', 'expo-exercises').single();
  if (libErr) { console.error('LIB FAIL', libErr.message); process.exit(1); }
  const library = (lib.value || []).filter(e => e && e.title);
  console.log(`library: ${library.length} exercises`);

  // Pre-tokenize library
  const indexed = library.map(e => ({
    id: e.id, title: e.title, cues: e.cues || '', vid: e.videoLink || '',
    tk: toks(e.title),
  }));

  const { data: planRow, error: pErr } = await sb
    .from('plans').select('data').eq('id', PLAN_ID).single();
  if (pErr) { console.error('PLAN FAIL', pErr.message); process.exit(1); }

  const days = planRow.data.days || [];
  for (const d of days) {
    console.log(`\n=== ${d.name} ===`);
    for (const ex of d.exercises) {
      const qt = toks(ex.title);
      const ranked = indexed
        .map(c => ({ ...c, s: score(qt, c.tk) }))
        .filter(c => c.s > 0.35)
        .sort((a, b) => b.s - a.s)
        .slice(0, 3);
      console.log(`\n  • ${ex.title}`);
      if (!ranked.length) { console.log('     (no candidates ≥0.35)'); continue; }
      for (const c of ranked) {
        const vidTag = c.vid ? '🎥' : '  ';
        const cuesTag = c.cues ? '📝' : '  ';
        console.log(`     ${c.s.toFixed(2)} ${vidTag}${cuesTag} ${c.id}  ${c.title}`);
      }
    }
  }

  await sb.auth.signOut();
})().catch(e => { console.error(e); process.exit(1); });
