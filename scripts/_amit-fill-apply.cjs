// Fill Amit Gershon's Block #1 from the library. FILL-EMPTY-ONLY: never
// overwrites a value the coach put there. Backup was written by the dry run.
//
// Days are addressed by INDEX, never by id — plans.data.days contains duplicate
// day ids, and addressing by id has written to the wrong day before.
const { createClient } = require('@supabase/supabase-js');
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

  const { data: plans } = await s.from('plans').select('id,name,data').eq('trainee_id', 'tr_bh_4djtfei1ly3');
  for (const p of plans) {
    const data = JSON.parse(JSON.stringify(p.data));
    let vFilled = 0, nFilled = 0;
    (data.days || []).forEach((d, di) => {
      const compact = !(d.exercises && d.exercises.length);
      const list = compact ? (d.ex || []) : d.exercises;
      list.forEach((ex, xi) => {
        const title = ex.title || ex.name || '';
        const hit = (ex.exerciseId || ex.eid ? byId.get(ex.exerciseId || ex.eid) : null) || byName.get(norm(title));
        if (!hit) return;
        const curV = ex.videoUrl != null ? ex.videoUrl : ex.video;
        if (blank(curV)) {
          const lv = hit.videoLink || hit.video;
          if (!blank(lv)) { if (compact) ex.v = lv; ex.videoUrl = lv; vFilled++; }
        }
        const curN = ex.notes != null ? ex.notes : ex.n;
        if (blank(curN)) {
          const lc = hit.cues || hit.notes;
          if (!blank(lc)) { if (compact) ex.n = lc; else ex.notes = lc; nFilled++; }
        }
      });
    });
    if (!vFilled && !nFilled) { console.log(p.name + ': nothing to fill'); continue; }
    const { error } = await s.from('plans').update({ data }).eq('id', p.id);
    console.log(`${p.name}: filled ${vFilled} videos, ${nFilled} notes ${error ? 'ERROR ' + error.message : '(written)'}`);
  }
})();
