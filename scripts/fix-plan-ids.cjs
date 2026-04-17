// fix-plan-ids.js
// DRY RUN by default. Pass "apply" to write.
const { createClient } = require('@supabase/supabase-js');

const s = createClient(
  'https://gtcbfglttoiyfsnfbhdy.supabase.co',
  'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv'
);
const APPLY = process.argv[2] === 'apply';

console.log('='.repeat(60));
console.log(APPLY ? 'APPLY MODE - WRITING CHANGES' : 'DRY RUN - NO CHANGES');
console.log('='.repeat(60));

(async () => {
  const { data: storeRow, error: storeErr } = await s
    .from('store').select('key,value').eq('key', 'expo-plans').maybeSingle();
  if (storeErr) throw storeErr;

  const plans = storeRow?.value || [];
  console.log('\nLoaded ' + plans.length + ' plans from store.expo-plans');

  const byId = (id) => plans.filter(p => p.traineeId === id);
  const amitWrong = byId('tr_amit_yehudai');
  const amitRight = byId('tr_amit');
  const roeyWrong = byId('tr_roey_hatzvi');
  const roeyRight = byId('tr_roei');

  console.log('\n--- AMIT ---');
  console.log('  tr_amit_yehudai (wrong): ' + amitWrong.length);
  amitWrong.forEach(p => console.log('    * ' + p.id + '  "' + p.name + '"'));
  console.log('  tr_amit (correct): ' + amitRight.length);
  amitRight.forEach(p => console.log('    * ' + p.id + '  "' + p.name + '"'));

  console.log('\n--- ROEY ---');
  console.log('  tr_roey_hatzvi (wrong): ' + roeyWrong.length);
  roeyWrong.forEach(p => console.log('    * ' + p.id + '  "' + p.name + '"'));
  console.log('  tr_roei (correct): ' + roeyRight.length);
  roeyRight.forEach(p => console.log('    * ' + p.id + '  "' + p.name + '"'));

  const actions = [];
  for (const p of amitWrong) {
    const dup = amitRight.find(r => r.name === p.name);
    if (dup) actions.push({ type: 'DELETE', planId: p.id, reason: 'dup of ' + dup.id + ' ("' + p.name + '")' });
    else actions.push({ type: 'REASSIGN', planId: p.id, from: 'tr_amit_yehudai', to: 'tr_amit', name: p.name });
  }
  for (const p of roeyWrong) {
    const dup = roeyRight.find(r => r.name === p.name);
    if (dup) actions.push({ type: 'DELETE', planId: p.id, reason: 'dup of ' + dup.id + ' ("' + p.name + '")' });
    else actions.push({ type: 'REASSIGN', planId: p.id, from: 'tr_roey_hatzvi', to: 'tr_roei', name: p.name });
  }

  console.log('\n--- PLANNED ACTIONS (' + actions.length + ') ---');
  actions.forEach(a => {
    if (a.type === 'REASSIGN') console.log('  REASSIGN  ' + a.planId + '  "' + a.name + '"  ' + a.from + ' -> ' + a.to);
    else console.log('  DELETE    ' + a.planId + '  (' + a.reason + ')');
  });

  if (actions.length === 0) { console.log('\nNothing to do.'); return; }
  if (!APPLY) { console.log('\n(dry run - rerun with "apply")'); return; }

  const deleteIds = new Set(actions.filter(a => a.type === 'DELETE').map(a => a.planId));
  const reassign = new Map(actions.filter(a => a.type === 'REASSIGN').map(a => [a.planId, a.to]));
  const newPlans = plans
    .filter(p => !deleteIds.has(p.id))
    .map(p => reassign.has(p.id) ? Object.assign({}, p, { traineeId: reassign.get(p.id) }) : p);

  const { error: wErr } = await s.from('store').update({ value: newPlans }).eq('key', 'expo-plans');
  if (wErr) throw wErr;
  console.log('\nstore.expo-plans updated: ' + newPlans.length + ' plans (was ' + plans.length + ')');

  console.log('\nUpdating plans table (row-per-plan)...');
  for (const a of actions) {
    if (a.type === 'REASSIGN') {
      const { error } = await s.from('plans').update({ trainee_id: a.to }).eq('id', a.planId);
      console.log(error ? '  FAIL ' + a.planId + ': ' + error.message : '  ok reassign ' + a.planId + ' -> ' + a.to);
    } else {
      const { error } = await s.from('plans').delete().eq('id', a.planId);
      console.log(error ? '  FAIL ' + a.planId + ': ' + error.message : '  ok delete ' + a.planId);
    }
  }

  const { data: after } = await s.from('store').select('value').eq('key', 'expo-plans').maybeSingle();
  const plansAfter = after?.value || [];
  console.log('\nVerify:');
  console.log('  tr_amit_yehudai remaining: ' + plansAfter.filter(p=>p.traineeId==='tr_amit_yehudai').length + ' (expect 0)');
  console.log('  tr_roey_hatzvi remaining:  ' + plansAfter.filter(p=>p.traineeId==='tr_roey_hatzvi').length + ' (expect 0)');
  console.log('  tr_amit total: ' + plansAfter.filter(p=>p.traineeId==='tr_amit').length);
  console.log('  tr_roei total: ' + plansAfter.filter(p=>p.traineeId==='tr_roei').length);
  console.log('\nDone.');
})().catch(e => { console.error('ERROR:', e); process.exit(1); });
