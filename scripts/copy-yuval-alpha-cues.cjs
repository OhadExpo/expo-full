// Explicitly copy library `cues` into each matched plan exercise's `notes`
// (and library `videoLink` into `videoUrl`), so the data is hard-saved on
// the plan instead of relying on render-time inheritance.
const { createClient } = require('@supabase/supabase-js');
const SB = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
const PLAN_ID = 'plan_yuvb_alpha_2605';

(async () => {
  const sb = createClient(SB, KEY, { auth: { persistSession: false } });
  const { error: authErr } = await sb.auth.signInWithPassword({
    email: 'ohadyproductions@gmail.com', password: '1234',
  });
  if (authErr) { console.error('AUTH FAIL', authErr.message); process.exit(1); }

  const [{ data: lib, error: lErr }, { data: planRow, error: pErr }] = await Promise.all([
    sb.from('store').select('value').eq('key', 'expo-exercises').single(),
    sb.from('plans').select('data').eq('id', PLAN_ID).single(),
  ]);
  if (lErr || pErr) { console.error('FETCH FAIL', lErr || pErr); process.exit(1); }

  const byId = new Map((lib.value || []).map(e => [e.id, e]));

  const data = planRow.data;
  let copiedCues = 0, copiedVideos = 0, total = 0;
  for (const day of data.days) {
    for (const ex of day.exercises) {
      if (!ex.exerciseId) continue;
      total++;
      const libEx = byId.get(ex.exerciseId);
      if (!libEx) { console.warn(`  ! missing eid ${ex.exerciseId} for "${ex.title}"`); continue; }
      const cues = (libEx.cues || '').trim();
      const vid = (libEx.videoLink || '').trim();
      ex.notes = cues;       // explicit, even if empty
      ex.videoUrl = vid;     // explicit, even if empty
      if (cues) copiedCues++;
      if (vid) copiedVideos++;
      console.log(`  ✓ ${ex.title.padEnd(50)}  cues=${cues ? 'Y' : '-'}  vid=${vid ? 'Y' : '-'}`);
    }
  }

  const { error: upErr } = await sb
    .from('plans').update({ data, updated_at: new Date().toISOString() }).eq('id', PLAN_ID);
  if (upErr) { console.error('UPDATE FAIL', upErr.message); process.exit(1); }

  console.log(`\nUpdated ${PLAN_ID}: ${total} matched exercises | cues=${copiedCues} | videos=${copiedVideos}`);
  await sb.auth.signOut();
})().catch(e => { console.error(e); process.exit(1); });
