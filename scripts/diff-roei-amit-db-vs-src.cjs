const { createClient } = require('@supabase/supabase-js');
const XLSX = require('xlsx');
const fs = require('fs');
const { parseSingleSheet } = require('./drive-import-core.cjs');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co','sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');

(async () => {
  const { data: libStore } = await s.from('store').select('value').eq('key','expo-exercises').maybeSingle();
  const lib = libStore?.value || [];
  const titleById = {};
  lib.forEach(e => titleById[e.id] = e.title);

  const wb = XLSX.read(fs.readFileSync('sheets/roei.xlsx'));
  const parse = (tabName) => {
    const ws = wb.Sheets[tabName];
    if (!ws) return null;
    const parsed = parseSingleSheet(ws, tabName);
    const titles = parsed.days.map(d => d.ex.map(e => {
      const orig = parsed.exercises.find(x => x.id === e.eid);
      return orig?.title || '?';
    }));
    return { days: parsed.days.map((d,i) => ({ name: d.name, ex: titles[i] })) };
  };

  const { data: plans } = await s.from('plans').select('id,name,trainee_id,data').or(
    'and(trainee_id.eq.tr_amit,name.ilike.%Block #16%),and(trainee_id.eq.tr_roei,name.ilike.%Block #16%),and(trainee_id.eq.tr_roei,name.ilike.%Block #24%)'
  );

  const dump = (label, days) => {
    console.log(`\n--- ${label} ---`);
    days.forEach((d,i) => {
      console.log(`Day ${i+1} "${d.name}"`);
      (d.ex || []).forEach((t,j) => console.log(`  [${j+1}] ${typeof t === 'string' ? t : (t.title || titleById[t.exerciseId || t.eid] || '?')}`));
    });
  };

  const amitBlock16 = plans.find(p => p.trainee_id === 'tr_amit' && /Block #16/.test(p.name));
  const roeiBlock16 = plans.find(p => p.trainee_id === 'tr_roei' && /Block #16/.test(p.name));
  const roeiBlock24 = plans.find(p => p.trainee_id === 'tr_roei' && /Block #24/.test(p.name));

  if (amitBlock16) dump(`DB tr_amit / "${amitBlock16.name}"`, amitBlock16.data.days.map(d => ({ name: d.name, ex: d.ex || d.exercises })));
  if (roeiBlock16) dump(`DB tr_roei / "${roeiBlock16.name}"`, roeiBlock16.data.days.map(d => ({ name: d.name, ex: d.ex || d.exercises })));
  if (roeiBlock24) dump(`DB tr_roei / "${roeiBlock24.name}"`, roeiBlock24.data.days.map(d => ({ name: d.name, ex: d.ex || d.exercises })));

  const src16 = parse('Block #16');
  const src24 = parse('Block #24');
  if (src16) dump(`SRC roei.xlsx / "Block #16"`, src16.days);
  if (src24) dump(`SRC roei.xlsx / "Block #24"`, src24.days);
})();
