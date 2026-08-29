// Measure the Exercise Matching queue on REAL data: list every unmatched title
// group, its top suggestion under the CURRENT matcher, and the token diffs —
// so the synonym/canon layer is built from actual gaps. Read-only.
const { createClient } = require('@supabase/supabase-js');
const SB = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';

const normTitle = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9֐-׿ ]+/g, ' ').replace(/\s+/g, ' ').trim();
const tokenSet = (s) => new Set(normTitle(s).split(' ').filter(Boolean));
const CORRUPT_ID = 'ex_rvi8ifq11zsmo8nlmzm';
const MISSING_RX = /חסר תרגיל|superset\s*[—-]|missing exercise|\(unresolved\)/i;

(async () => {
  const s = createClient(SB, KEY);
  await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  const { data: exRow, error: e1 } = await s.from('store').select('value').eq('key', 'expo-exercises').single();
  if (e1) throw e1;
  const library = exRow.value;
  const { data: plans, error: e2 } = await s.from('plans').select('id,name,trainee_id,data');
  if (e2) throw e2;

  const byId = new Set(library.map((e) => e.id));
  const byNorm = new Map(library.map((e) => [normTitle(e.title || e.t), e]));

  const groups = new Map();
  for (const p of plans) {
    const days = (p.data && p.data.days) || [];
    days.forEach((d) => {
      const list = Array.isArray(d.exercises) ? d.exercises : (Array.isArray(d.ex) ? d.ex : []);
      list.forEach((ex) => {
        const libId = ex.exerciseId || ex.eid || '';
        const title = (ex.title || ex.t || '').trim();
        const note = (ex.notes || ex.n || '').trim();
        let reason = null;
        if (libId === CORRUPT_ID) reason = 'corrupt';
        else if (MISSING_RX.test(title) || MISSING_RX.test(note)) reason = 'missing';
        else {
          const idOk = libId && byId.has(libId);
          const titleOk = title && byNorm.has(normTitle(title));
          if (!idOk && !titleOk && (libId || title)) reason = 'unresolved';
        }
        if (reason) {
          const key = normTitle(title) || ('∅:' + reason);
          if (!groups.has(key)) groups.set(key, { title, count: 0 });
          groups.get(key).count++;
        }
      });
    });
  }

  // For each group, nearest library title by token symmetric diff
  const lib = library.map((e) => ({ t: e.title || e.t || '', toks: tokenSet(e.title || e.t) })).filter((x) => x.toks.size);
  const rows = [...groups.values()].sort((a, b) => b.count - a.count);
  const diffTally = {};
  console.log(`groups: ${rows.length}, total rows: ${rows.reduce((a, g) => a + g.count, 0)}`);
  for (const g of rows) {
    const ts = tokenSet(g.title);
    let best = null;
    for (const L of lib) {
      let inter = 0; ts.forEach((x) => { if (L.toks.has(x)) inter++; });
      const diff = (ts.size - inter) + (L.toks.size - inter);
      if (!best || diff < best.diff) best = { diff, t: L.t, toks: L.toks, inter };
    }
    if (!best) continue;
    const only1 = [...ts].filter((x) => !best.toks.has(x));
    const only2 = [...best.toks].filter((x) => !ts.has(x));
    console.log(`${String(g.count).padStart(3)}x  "${g.title}"  ->  "${best.t}"  [plan-only: ${only1.join(',') || '-'} | lib-only: ${only2.join(',') || '-'}]`);
    if (only1.length === 1 && only2.length === 1) {
      const k = `${only1[0]} <-> ${only2[0]}`;
      diffTally[k] = (diffTally[k] || 0) + 1;
    } else {
      for (const w of only1) diffTally[`(plan-extra) ${w}`] = (diffTally[`(plan-extra) ${w}`] || 0) + 1;
      for (const w of only2) diffTally[`(lib-extra) ${w}`] = (diffTally[`(lib-extra) ${w}`] || 0) + 1;
    }
  }
  console.log('\n=== token diff tally ===');
  Object.entries(diffTally).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(String(n).padStart(3), k));
})().catch((e) => { console.error(e); process.exit(1); });
