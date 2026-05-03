// Audit Block #25 — for every exercise across Day A/B/C, report:
//   library title, has-videoLink?, has-cues?, cues language (he/en/none)
const { createClient } = require('@supabase/supabase-js');
const SB = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
const PLAN_ID = 'plan_tb6bfw9qmoosndn9';

const langOf = (s) => {
  if (!s) return 'NONE';
  if (/[֐-׿]/.test(s)) return 'HE';
  return 'EN';
};

(async () => {
  const s = createClient(SB, KEY);
  await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  const [{ data: row }, { data: p }] = await Promise.all([
    s.from('store').select('value').eq('key', 'expo-exercises').maybeSingle(),
    s.from('plans').select('*').eq('id', PLAN_ID).maybeSingle(),
  ]);
  const lib = Array.isArray(row?.value) ? row.value : [];
  const byId = Object.fromEntries(lib.map(e => [e.id, e]));

  const gaps = { noVideo: [], noCues: [], nonHebrewCues: [] };
  for (const day of (p.data?.days || [])) {
    console.log(`\n── ${day.name} ──`);
    for (const ex of (day.exercises || [])) {
      const e = byId[ex.exerciseId];
      const hasVid = !!(e?.videoLink || e?.videoUrl);
      const cues = e?.cues || '';
      const lang = langOf(cues);
      const planNotes = ex.notes || '';
      const planNotesLang = langOf(planNotes);
      const tag = `${hasVid ? '✓vid' : '✗VID'}  ${lang === 'HE' ? '✓he' : lang === 'EN' ? '⚠EN' : '✗CUES'}  ${planNotes ? `(plan-notes:${planNotesLang})` : ''}`;
      console.log(`  ${(ex.order + 1).toString().padStart(2)}. [${ex.exerciseId}]  ${(e?.title || '?').padEnd(60)}  ${tag}`);
      if (!hasVid) gaps.noVideo.push({ id: ex.exerciseId, title: e?.title });
      if (!cues) gaps.noCues.push({ id: ex.exerciseId, title: e?.title });
      else if (lang === 'EN') gaps.nonHebrewCues.push({ id: ex.exerciseId, title: e?.title, cues });
    }
  }

  console.log('\n══ GAPS ══');
  console.log(`no video: ${gaps.noVideo.length}`);  gaps.noVideo.forEach(x => console.log(`  · ${x.id}  ${x.title}`));
  console.log(`no cues:  ${gaps.noCues.length}`);   gaps.noCues.forEach(x  => console.log(`  · ${x.id}  ${x.title}`));
  console.log(`EN cues:  ${gaps.nonHebrewCues.length}`); gaps.nonHebrewCues.forEach(x => console.log(`  · ${x.id}  ${x.title}\n      "${x.cues}"`));
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
