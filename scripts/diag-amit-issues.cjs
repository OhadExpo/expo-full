// Diagnose two issues:
//   (1) Form videos not showing on review > Amit Day A
//   (2) Block #17 Day C exercises 1 & 3 wrong/missing
const { createClient } = require('@supabase/supabase-js');
const s = createClient(
  'https://gtcbfglttoiyfsnfbhdy.supabase.co',
  'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv'
);

(async () => {
  const { error: sErr } = await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  if (sErr) { console.error('AUTH:', sErr.message); process.exit(1); }

  // ---- Issue 2: Block #17 Day C contents ----
  console.log('========= ISSUE 2: BLOCK #17 DAY C =========');
  const { data: pr } = await s.from('store').select('value').eq('key','expo-plans').maybeSingle();
  const plans = pr?.value || [];
  const b17 = plans.find(p => p.traineeId === 'tr_amit' && p.name === 'Block #17');
  if (!b17) { console.log('Block #17 NOT FOUND in store'); }
  else {
    console.log(`Block #17 id=${b17.id}  days=${b17.days?.length}`);
    b17.days.forEach(d => {
      console.log(`\n  -- ${d.name} (${d.exercises.length} ex) --`);
      d.exercises.forEach((ex, i) => {
        console.log(`   ${i+1}. "${ex.title || '(empty)'}" eid=${ex.exerciseId||'-'} sets=${ex.sets} rx=${ex.reps||ex.rx||'-'} order=${ex.order}`);
      });
    });
  }

  // also check plans table (canonical) — in case store blob is stale
  const { data: planRow } = await s.from('plans').select('*').eq('trainee_id', 'tr_amit');
  console.log('\n-- plans table for tr_amit --');
  (planRow||[]).forEach(p => console.log(`  id=${p.id}  name=${p.name}  days=${p.data?.days?.length}`));
  const tblB17 = (planRow||[]).find(p => p.name === 'Block #17');
  if (tblB17) {
    console.log('\nplans-table Block #17 (full) days=' + tblB17.data?.days?.length);
    console.log('  data keys:', Object.keys(tblB17.data || {}));
    (tblB17.data?.days || []).forEach(d => {
      console.log(`\n  ## ${d.name}  (${d.exercises?.length} ex)`);
      (d.exercises || []).forEach((ex, i) => {
        console.log(`   ${i+1}. "${ex.title}" eid=${ex.exerciseId||'-'} sets=${ex.sets} rx=${ex.reps||ex.rx||'-'} order=${ex.order}`);
      });
    });
  }

  // ---- Issue 1: form videos for Amit Day A workouts ----
  console.log('\n\n========= ISSUE 1: FORM VIDEOS — AMIT DAY A =========');
  const { data: cw, error: cwErr } = await s.from('client_workouts').select('*')
    .eq('client_id', 'tr_amit')
    .order('date', { ascending: false })
    .limit(20);
  if (cwErr) { console.error('cw err:', cwErr.message); }
  console.log(`client_workouts rows for tr_amit: ${(cw||[]).length}`);
  (cw||[]).slice(0, 12).forEach(w => {
    const fvs = w.form_videos || [];
    const cloud = fvs.filter(fv => fv?.cloudUrl);
    const has = fvs.filter(fv => fv?.has);
    const pending = fvs.filter(fv => fv?.pendingBlobId);
    console.log(`  ${w.date} | ${w.plan_name} W${w.week} ${w.day_name} | fv=${fvs.length} cloud=${cloud.length} has=${has.length} pending=${pending.length}`);
    cloud.slice(0,3).forEach((fv,i) => console.log(`     · "${w.exercises?.[i]?.title}" → ${fv.cloudUrl}`));
  });

  // Probe one cloudUrl with a HEAD to see if Storage actually serves it
  const dayA = (cw||[]).find(w => /Day\s*A/i.test(w.day_name));
  const sampleUrl = dayA?.form_videos?.find(fv => fv?.cloudUrl)?.cloudUrl;
  if (sampleUrl) {
    console.log('\nProbing sample Day A cloudUrl:', sampleUrl);
    try {
      const r = await fetch(sampleUrl, { method: 'HEAD' });
      console.log(`  status=${r.status}  ct=${r.headers.get('content-type')}  len=${r.headers.get('content-length')}`);
    } catch (e) {
      console.log('  fetch threw:', e.message);
    }
  } else {
    console.log('\nNo Day A workout with cloudUrl found.');
  }

  // List storage objects under form-videos/tr_amit (if signed in caller can see)
  const { data: list, error: listErr } = await s.storage.from('form-videos').list('tr_amit', { limit: 50 });
  console.log('\nstorage form-videos/tr_amit listing:');
  if (listErr) console.log('  err:', listErr.message);
  else (list||[]).forEach(o => console.log(`  ${o.name}  size=${o.metadata?.size}  ct=${o.metadata?.mimetype}`));
})().catch(e => console.error('FATAL', e));
