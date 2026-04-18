const { createClient } = require('@supabase/supabase-js');
const s = createClient(
  'https://gtcbfglttoiyfsnfbhdy.supabase.co',
  'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv'
);
const APPLY = process.argv[2] === 'apply';

console.log('='.repeat(60));
console.log(APPLY ? 'APPLY MODE' : 'DRY RUN');
console.log('='.repeat(60));

(async () => {
  const { data: pr } = await s.from('store').select('value').eq('key', 'expo-plans').maybeSingle();
  const plans = pr?.value || [];
  const { data: rows } = await s.from('plans').select('id');
  const tableIds = new Set((rows || []).map(r => r.id));

  // Every plan in blob with traineeId that isn't in the plans table
  const missing = plans.filter(p => p.traineeId && !tableIds.has(p.id));

  console.log(`Total plans in blob: ${plans.length}`);
  console.log(`Total rows in plans table: ${tableIds.size}`);
  console.log(`Blob plans missing from plans table: ${missing.length}`);

  // Breakdown by trainee
  const byTrainee = {};
  missing.forEach(p => { byTrainee[p.traineeId] = (byTrainee[p.traineeId] || 0) + 1; });
  Object.entries(byTrainee).forEach(([tid, n]) => console.log(`  ${tid}: ${n} plan(s) missing`));

  if (!APPLY) { console.log('\n(dry run - rerun with "apply")'); return; }

  console.log('\nBackfilling ' + missing.length + ' plan row(s)...');
  for (const p of missing) {
    const row = {
      id: p.id,
      name: p.name || '',
      trainee_id: p.traineeId,
      phase: p.phase || '',
      notes: p.notes || '',
      data: { days: p.days || [], warmup: p.warmup || [] },
      created_at: p.createdAt || new Date().toISOString(),
    };
    const { error } = await s.from('plans').insert(row);
    if (error) console.log(`  FAIL ${p.id} (${p.name}): ${error.message}`);
    else console.log(`  ok ${p.id} (${p.name}) → ${p.traineeId}`);
  }

  const { data: after } = await s.from('plans').select('id');
  console.log(`\nVerify: plans table now has ${after.length} rows.`);
  console.log('Done.');
})().catch(e => { console.error('ERROR:', e); process.exit(1); });
