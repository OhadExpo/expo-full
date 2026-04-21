// Scan all plans for junk "header" rows that got parsed as exercises:
//   "Super Set:" (xlsx superset labels), bare day markers, empty titles, etc.
const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co','sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');

const JUNK_TITLES = [
  /^super\s*set\s*:?$/i,
  /^exercise$/i,
  /^name$/i,
  /^rest$/i,
  /^off$/i,
  /^warm[- ]?up$/i,
  /^instructions?$/i,
  /^notes?$/i,
  /^week\s*\d+$/i,
  /^date:?$/i,
  /^bb\s*-\s*barbell$/i,
  /^bb exercises$/i,
];

(async () => {
  const { data: plans } = await s.from('plans').select('id,name,trainee_id,data');
  const { data: libStore } = await s.from('store').select('value').eq('key','expo-exercises').maybeSingle();
  const lib = libStore?.value || [];
  const titleById = {};
  lib.forEach(e => titleById[e.id] = e.title);

  const hits = [];
  for (const p of plans) {
    const days = p.data?.days || [];
    days.forEach((d, di) => {
      const list = d.exercises || d.ex || [];
      list.forEach((e, ei) => {
        const id = e.exerciseId || e.eid;
        const title = (e.title || titleById[id] || '').trim();
        if (JUNK_TITLES.some(rx => rx.test(title))) {
          hits.push({ plan: p.id, trainee: p.trainee_id, planName: p.name, day: di, dayName: d.name, ex: ei, title, eid: id });
        }
      });
    });
  }
  console.log(`Found ${hits.length} junk rows across ${new Set(hits.map(h=>h.plan)).size} plans:\n`);
  hits.forEach(h => console.log(`  ${h.trainee} / "${h.planName}" / day${h.day}="${h.dayName}" / ex[${h.ex}] title="${h.title}" eid=${h.eid}`));
})();
