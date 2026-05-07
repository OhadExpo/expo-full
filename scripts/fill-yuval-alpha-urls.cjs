// Fill the 3 confident URLs harvested from other trainee מעקב sheets into
// the Yuval Alpha plan, ONLY for exercises whose current videoUrl is empty.
// Doesn't touch cues (none extractable from the sheets — those would need
// to come from the library, which is off-limits work in this repo).
const { createClient } = require('@supabase/supabase-js');
const SB = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
const PLAN_ID = 'plan_yuvb_alpha_2605';

// Title → URL (only exact-match titles, all sourced from real trainee sheets)
const FILLS = {
  'BB Back Squat':            'https://www.youtube.com/shorts/Df3xfTgOMkA',                         // from עמית
  'Standing SA MID-POS OHP':  'https://www.youtube.com/shorts/eJqjNVmR238',                         // from עמית
  'Push-Up Drop & Catch':     'https://www.youtube.com/watch?v=Fr8mcBqOi3E&ab_channel=UofLSportsPerformance', // from יובל
};

(async () => {
  const sb = createClient(SB, KEY, { auth: { persistSession: false } });
  const { error: authErr } = await sb.auth.signInWithPassword({
    email: 'ohadyproductions@gmail.com', password: '1234',
  });
  if (authErr) { console.error('AUTH FAIL', authErr.message); process.exit(1); }

  const { data: planRow, error: pErr } = await sb
    .from('plans').select('data').eq('id', PLAN_ID).single();
  if (pErr) { console.error('PLAN FAIL', pErr.message); process.exit(1); }

  const data = planRow.data;
  let filled = 0, skipped = 0;
  for (const day of data.days) {
    for (const ex of day.exercises) {
      const url = FILLS[ex.title];
      if (!url) continue;
      if (ex.videoUrl && ex.videoUrl.trim()) {
        console.log(`  - ${ex.title.padEnd(45)} already has URL, skipping`);
        skipped++;
        continue;
      }
      ex.videoUrl = url;
      filled++;
      console.log(`  ✓ ${ex.title.padEnd(45)} ← ${url}`);
    }
  }

  const { error: upErr } = await sb
    .from('plans').update({ data, updated_at: new Date().toISOString() }).eq('id', PLAN_ID);
  if (upErr) { console.error('UPDATE FAIL', upErr.message); process.exit(1); }

  console.log(`\nUpdated ${PLAN_ID}: filled=${filled}, skipped=${skipped}`);
  await sb.auth.signOut();
})().catch(e => { console.error(e); process.exit(1); });
