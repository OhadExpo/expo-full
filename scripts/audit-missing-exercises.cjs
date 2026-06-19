// Read-only audit: find every plan/program with a "missing exercise" —
// unresolved library reference, blank, or the SuperSet corruption placeholder.
// Reports to stdout. Does NOT modify anything.
const { createClient } = require('@supabase/supabase-js');
const sb = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');

const MISSING_RX = /חסר תרגיל|superset\s*[—-]|missing exercise|\(unresolved\)/i;
const CORRUPT_ID = 'ex_rvi8ifq11zsmo8nlmzm';

(async () => {
  const { error: authErr } = await sb.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  if (authErr) { console.error('auth failed', authErr.message); process.exit(1); }

  // exercise library (store key) → id set + title set
  const { data: exRows } = await sb.from('store').select('value').eq('key', 'expo-exercises').maybeSingle();
  const lib = Array.isArray(exRows?.value) ? exRows.value : [];
  const byId = new Set(lib.map(e => e.id));
  const byTitle = new Set(lib.map(e => (e.title || e.t || '').toLowerCase().trim()).filter(Boolean));
  console.log(`library: ${lib.length} exercises`);

  const { data: plans, error: pErr } = await sb.from('plans').select('id,name,trainee_id,data').order('created_at', { ascending: false });
  if (pErr) { console.error('plans fetch failed', pErr.message); process.exit(1); }
  console.log(`plans: ${plans.length}`);

  let plansWithMissing = 0, totalMissing = 0;
  const report = [];
  for (const p of plans) {
    const days = p.data?.days || [];
    const issues = [];
    days.forEach((d, di) => {
      const list = Array.isArray(d.exercises) ? d.exercises : (Array.isArray(d.ex) ? d.ex : []);
      list.forEach((ex, xi) => {
        const libId = ex.exerciseId || ex.eid || '';
        const title = (ex.title || '').trim();
        const note = (ex.notes || ex.n || '').trim();
        let reason = null;
        if (libId === CORRUPT_ID) reason = 'corrupt-superset-id';
        else if (MISSING_RX.test(title) || MISSING_RX.test(note)) reason = 'missing-title';
        else {
          const idOk = libId && byId.has(libId);
          const titleOk = title && byTitle.has(title.toLowerCase());
          if (!idOk && !titleOk) {
            // truly unresolved: no valid id AND title not in library.
            // ignore rows that are intentionally blank placeholders (no id, no title, no note)
            if (libId || title) reason = 'unresolved';
          }
        }
        if (reason) issues.push({ day: d.name || d.n || `Day ${di + 1}`, idx: xi, libId, title, note: note.slice(0, 40), reason });
      });
    });
    if (issues.length) {
      plansWithMissing++; totalMissing += issues.length;
      report.push({ plan: p.name, trainee: p.trainee_id, id: p.id, issues });
    }
  }

  console.log(`\n=== ${plansWithMissing} plans with missing exercises · ${totalMissing} total missing entries ===\n`);
  // group reason counts
  const reasonCounts = {};
  report.forEach(r => r.issues.forEach(i => { reasonCounts[i.reason] = (reasonCounts[i.reason] || 0) + 1; }));
  console.log('by reason:', JSON.stringify(reasonCounts));
  console.log('');
  report.slice(0, 60).forEach(r => {
    console.log(`\n[${r.trainee}] ${r.plan}  (${r.id})`);
    r.issues.forEach(i => console.log(`   · ${r.reason || i.reason} | ${i.day} #${i.idx} | id=${i.libId || '∅'} | title="${i.title || '∅'}" | note="${i.note}"`));
  });
  if (report.length > 60) console.log(`\n…and ${report.length - 60} more plans.`);
  process.exit(0);
})();
