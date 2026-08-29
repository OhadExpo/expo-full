// DRY RUN. What can the library fill on Amit's Block #1? Writes nothing.
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
const blank = (v) => v == null || String(v).trim() === '';
const norm = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

(async () => {
  await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  const { data: lib } = await s.from('store').select('value').eq('key', 'expo-exercises').single();
  const EX = (lib && lib.value) || [];
  const byId = new Map(EX.map((e) => [e.id, e]));
  const byName = new Map();
  for (const e of EX) { const k = norm(e.title || e.name); if (k && !byName.has(k)) byName.set(k, e); }
  console.log('library entries:', EX.length, '| with a video:', EX.filter((e) => !blank(e.videoLink || e.video)).length);

  const { data: plans } = await s.from('plans').select('id,name,data').eq('trainee_id', 'tr_bh_4djtfei1ly3');
  for (const p of plans) {
    // BACKUP FIRST — reversible before anything is contemplated.
    const f = `scripts/_backup-amit-${p.id}-2026-08-26.json`;
    fs.writeFileSync(f, JSON.stringify(p, null, 1));
    console.log('backup written:', f);

    const days = (p.data && p.data.days) || [];
    let fillableV = 0, unfillableV = 0, fillableN = 0, unfillableN = 0;
    const cannot = [];
    days.forEach((d, di) => {
      const list = (d.exercises && d.exercises.length) ? d.exercises : (d.ex || []);
      list.forEach((ex, xi) => {
        const title = ex.title || ex.name || '';
        const eid = ex.exerciseId || ex.eid;
        const hit = (eid && byId.get(eid)) || byName.get(norm(title));
        const vid = ex.videoUrl != null ? ex.videoUrl : ex.video;
        const note = ex.notes != null ? ex.notes : ex.n;
        if (blank(vid)) {
          const lv = hit && (hit.videoLink || hit.video);
          if (!blank(lv)) fillableV++; else { unfillableV++; cannot.push(`day${di+1}#${xi+1} "${title}" ${hit ? 'library entry has no video' : 'NOT IN LIBRARY'}`); }
        }
        if (blank(note)) {
          const lc = hit && (hit.cues || hit.notes);
          if (!blank(lc)) fillableN++; else unfillableN++;
        }
      });
    });
    console.log(`\n${p.name}: videos fillable ${fillableV}, NOT fillable ${unfillableV} | notes fillable ${fillableN}, NOT fillable ${unfillableN}`);
    cannot.forEach((c) => console.log('   - ' + c));
  }
})();
