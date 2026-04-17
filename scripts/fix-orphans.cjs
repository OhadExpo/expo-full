const { createClient } = require('@supabase/supabase-js');
const s = createClient(
  'https://gtcbfglttoiyfsnfbhdy.supabase.co',
  'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv'
);
const APPLY = process.argv[2] === 'apply';

const TEST_ACCOUNT_ID = 'tr_ylc4i7edmnxqyj3j';  // אוהד

const CLUSTER1_OWNER = 'tr_xy6f5i5lmnxulyhy';   // DELETE all under this
const CLUSTER2_OWNER = 'tr_xmx51m6omnxusfgr';   // REASSIGN all to test account
const UNASSIGNED_DELETE = ['portal_t1_block_9', 'fosm8tx4mnxvtznt'];

console.log('='.repeat(60));
console.log(APPLY ? 'APPLY MODE' : 'DRY RUN');
console.log('='.repeat(60));

(async () => {
  const { data: pr } = await s.from('store').select('value').eq('key','expo-plans').maybeSingle();
  const plans = pr?.value || [];
  console.log('\nLoaded ' + plans.length + ' plans');

  const actions = [];
  plans.forEach(p => {
    if (p.traineeId === CLUSTER1_OWNER) {
      actions.push({ type: 'DELETE', planId: p.id, name: p.name, reason: 'cluster 1 - dup of test account' });
    } else if (p.traineeId === CLUSTER2_OWNER) {
      actions.push({ type: 'REASSIGN', planId: p.id, name: p.name, from: p.traineeId, to: TEST_ACCOUNT_ID, reason: 'cluster 2 - unique data, reassign to test account' });
    } else if (!p.traineeId && UNASSIGNED_DELETE.includes(p.id)) {
      actions.push({ type: 'DELETE', planId: p.id, name: p.name, reason: 'unassigned - old/dup' });
    }
  });

  console.log('\n--- PLANNED ACTIONS (' + actions.length + ') ---');
  actions.forEach(a => {
    if (a.type === 'REASSIGN') console.log('  REASSIGN  ' + a.planId + '  "' + a.name + '"  ' + a.from + ' -> ' + a.to);
    else console.log('  DELETE    ' + a.planId + '  "' + a.name + '"  (' + a.reason + ')');
  });

  if (!APPLY) { console.log('\n(dry run - rerun with "apply")'); return; }

  const deleteIds = new Set(actions.filter(a => a.type === 'DELETE').map(a => a.planId));
  const reassign = new Map(actions.filter(a => a.type === 'REASSIGN').map(a => [a.planId, a.to]));
  const newPlans = plans
    .filter(p => !deleteIds.has(p.id))
    .map(p => reassign.has(p.id) ? Object.assign({}, p, { traineeId: reassign.get(p.id) }) : p);

  const { error: wErr } = await s.from('store').update({ value: newPlans }).eq('key','expo-plans');
  if (wErr) throw wErr;
  console.log('\nstore.expo-plans updated: ' + newPlans.length + ' plans (was ' + plans.length + ')');

  console.log('\nUpdating plans table (row-per-plan)...');
  for (const a of actions) {
    if (a.type === 'REASSIGN') {
      const { error } = await s.from('plans').update({ trainee_id: a.to }).eq('id', a.planId);
      console.log(error ? '  FAIL ' + a.planId + ': ' + error.message : '  ok reassign ' + a.planId);
    } else {
      const { error } = await s.from('plans').delete().eq('id', a.planId);
      console.log(error ? '  FAIL ' + a.planId + ': ' + error.message : '  ok delete ' + a.planId);
    }
  }

  // Verify
  const { data: after } = await s.from('store').select('value').eq('key','expo-plans').maybeSingle();
  const pa = after?.value || [];
  console.log('\nVerify:');
  console.log('  cluster 1 remaining: ' + pa.filter(p=>p.traineeId===CLUSTER1_OWNER).length + ' (expect 0)');
  console.log('  cluster 2 remaining: ' + pa.filter(p=>p.traineeId===CLUSTER2_OWNER).length + ' (expect 0)');
  console.log('  test account total: ' + pa.filter(p=>p.traineeId===TEST_ACCOUNT_ID).length);
  console.log('  unassigned total: ' + pa.filter(p=>!p.traineeId).length);
  console.log('\nDone.');
})().catch(e => { console.error('ERROR:', e); process.exit(1); });
