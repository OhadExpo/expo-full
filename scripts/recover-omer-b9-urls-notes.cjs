// Recover videoUrl + notes for the restored Block #9 by matching its exercises
// (by eid first, then by normalized title) against EVERY surviving plan (all
// athletes) and the exercise library. DRY by default; pass --apply to patch.
const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
const APPLY = process.argv.includes('--apply');
const B9 = 'pl_t7582oqqmr0cjblm4870';
const norm = (t) => String(t || '').toLowerCase().replace(/\s+/g, ' ').trim();

(async () => {
  await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });

  // 1. Every plan (all athletes) — harvest videoUrl + notes per eid and per title.
  const { data: allPlans } = await s.from('plans').select('id,name,data');
  const byEid = new Map(), byTitle = new Map();
  const remember = (map, key, vid, note) => {
    if (!key) return;
    const cur = map.get(key) || { videoUrl: undefined, notes: '' };
    if ((cur.videoUrl == null || cur.videoUrl === '') && vid) cur.videoUrl = vid;
    if ((!cur.notes || !cur.notes.trim()) && note && note.trim()) cur.notes = note;
    map.set(key, cur);
  };
  for (const p of (allPlans || [])) {
    if (p.id === B9) continue;
    const days = p.data?.days || [];
    for (const d of days) {
      const exs = d.exercises || d.ex || [];
      for (const ex of exs) {
        const eid = ex.exerciseId || ex.eid;
        const vid = ('videoUrl' in ex ? ex.videoUrl : ex.vid);
        const note = (ex.notes ?? ex.n ?? '');
        const title = ex.title || '';
        remember(byEid, eid, vid, note);
        if (title) remember(byTitle, norm(title), vid, note);
      }
    }
  }

  // 2. Exercise library — videoLink + cues as a secondary source (by eid + title).
  const { data: exRow } = await s.from('store').select('value').eq('key', 'expo-exercises').single();
  const libByEid = new Map(), libByTitle = new Map();
  for (const e of (exRow?.value || [])) {
    const note = e.cues || e.notes || '';
    libByEid.set(e.id, { videoUrl: e.videoLink || e.videoUrl, notes: note });
    if (e.title) libByTitle.set(norm(e.title), { videoUrl: e.videoLink || e.videoUrl, notes: note });
  }

  // 3. Walk Block #9 and fill.
  const { data: b9 } = await s.from('plans').select('data').eq('id', B9).single();
  const days = b9.data.days;
  let vidFilled = 0, noteFilled = 0, total = 0;
  for (const d of days) {
    for (const ex of d.exercises) {
      total++;
      const t = norm(ex.title);
      const eid = ex.exerciseId;
      const src = byEid.get(eid) || byTitle.get(t) || libByEid.get(eid) || libByTitle.get(t) || {};
      const whichV = (byEid.get(eid)?.videoUrl && 'plan:eid') || (byTitle.get(t)?.videoUrl && 'plan:title') || (libByEid.get(eid)?.videoUrl && 'lib:eid') || (libByTitle.get(t)?.videoUrl && 'lib:title') || '—';
      if ((ex.videoUrl == null || ex.videoUrl === '') && src.videoUrl) { ex.videoUrl = src.videoUrl; vidFilled++; }
      if ((!ex.notes || !ex.notes.trim()) && src.notes && src.notes.trim()) { ex.notes = src.notes; ex.notesEdited = true; noteFilled++; }
      console.log(`${ex.videoUrl ? '🎥' : '  '} ${ex.notes && ex.notes.trim() ? '📝' : '  '}  ${ex.title.slice(0,42).padEnd(42)}  vid=${whichV}`);
    }
  }
  console.log(`\nFilled: ${vidFilled}/${total} videos, ${noteFilled}/${total} notes.`);

  if (APPLY) {
    const { error } = await s.from('plans').update({ data: b9.data, updated_at: new Date().toISOString() }).eq('id', B9);
    console.log(error ? `UPDATE FAILED: ${error.message}` : '✅ APPLIED to Block #9.');
  } else {
    console.log('(dry run — re-run with --apply to save)');
  }
  process.exit(0);
})();
