// EMERGENCY RESTORE — rebuild Omer Sadeh's deleted "Block #9" from the surviving
// client_workouts (the prescription — eid/title/sets/reps/order — is baked into
// each logged workout). Reconstructs the plan row and upserts it back to `plans`.
const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36) + Math.floor(Math.random()*1e4);
const TRAINEE = 'tr_omer';

// prescribed "Nx<reps>" → reps=<reps>; else reps=whole string. sets = logged-set count.
function parsePrescribed(prescribed, setCount) {
  const p = String(prescribed || '').trim();
  const m = p.match(/^(\d+)\s*[xX]\s*(.+)$/);
  return { sets: setCount || (m ? parseInt(m[1], 10) : 3), reps: (m ? m[2] : p).trim() };
}
const dayNum = (name) => { const m = String(name).match(/day\s*(\d+)/i); return m ? parseInt(m[1], 10) : 99; };

(async () => {
  const { error: aErr } = await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  if (aErr) { console.error('AUTH FAILED:', aErr.message); process.exit(1); }

  // Abort if a Block #9 already exists (don't double-create)
  const { data: existing } = await s.from('plans').select('id,name').eq('trainee_id', TRAINEE);
  if ((existing || []).some(p => /block\s*#?\s*9\b/i.test(p.name))) {
    console.log('Block #9 ALREADY EXISTS — aborting to avoid a duplicate.'); process.exit(0);
  }

  const { data: cw } = await s.from('client_workouts').select('*').eq('client_id', TRAINEE);
  const cw9 = (cw || []).filter(w => /block\s*#?\s*9\b|#9\b/i.test(w.plan_name || ''));
  if (!cw9.length) { console.error('No Block #9 workouts found — cannot reconstruct.'); process.exit(1); }

  // Best (most complete, else most recent) logged instance per day
  const byDay = {};
  for (const w of cw9) {
    const k = w.day_name;
    const cur = byDay[k];
    if (!cur || (w.exercises||[]).length > (cur.exercises||[]).length ||
        ((w.exercises||[]).length === (cur.exercises||[]).length && new Date(w.date) > new Date(cur.date))) byDay[k] = w;
  }

  const days = Object.values(byDay)
    .sort((a, b) => dayNum(a.day_name) - dayNum(b.day_name))
    .map(w => ({
      id: 'd_' + uid(),
      name: w.day_name,
      exercises: (w.exercises || []).map((ex, i) => {
        const { sets, reps } = parsePrescribed(ex.prescribed, (ex.sets || []).length);
        return {
          id: 'ex_' + uid(),
          exerciseId: ex.eid,
          title: ex.title,            // preserve for dyn_ custom exercises
          sets, reps,
          load: '', rpe: '', tempo: '', rest: '90', notes: '',
          order: i, superset: '', wk: null, wkS: null,
        };
      }),
    }));

  const plan = {
    id: 'pl_' + uid(),
    name: 'Block #9',
    trainee_id: TRAINEE,
    phase: '',
    notes: '',
    active: true,
    created_at: '2026-06-18T00:00:00.000Z',  // before the first logged session (Jun 19)
    updated_at: new Date().toISOString(),
    data: { days, warmup: [], weeks: 4, isTemplatePurchase: false },
  };

  console.log('RECONSTRUCTED:');
  days.forEach(d => console.log(`  ${d.name}: ${d.exercises.length} exercises`));
  console.log(`  plan id = ${plan.id}, weeks = 4 (CONFIRM with Ohad)`);

  const { error } = await s.from('plans').upsert({ ...plan, is_template_purchase: false });
  if (error) { console.error('UPSERT FAILED:', error.message); process.exit(1); }

  // Verify read-back
  const { data: check } = await s.from('plans').select('id,name,data').eq('id', plan.id).single();
  const exCount = (check?.data?.days || []).reduce((a, d) => a + d.exercises.length, 0);
  console.log(`\n✅ RESTORED — "${check.name}" [${check.id}] with ${check.data.days.length} days, ${exCount} exercises total.`);
  process.exit(0);
})();
