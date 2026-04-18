const { createClient } = require('@supabase/supabase-js');
const s = createClient(
  'https://gtcbfglttoiyfsnfbhdy.supabase.co',
  'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv'
);
const APPLY = process.argv[2] === 'apply';

const TRAINEE_ID = 'tr_amit';
const PLAN_NAME = 'Block #17';

// Proper warmup using the schema the system actually uses
const NEW_WARMUP = [
  { t: 'Plate-Supported Hip Airplane', rx: '1x10 E' },
  { t: 'BW Step-Down', rx: '1x10 E' },
  { t: 'Alternating Supinated to Pronated Dead Hang', rx: '1x 4 + 4' },
];

// Keep only the rest rule in notes - clean and short like Ron's Block #13
const NEW_NOTES = 'Rest: BB + Chin-Ups: 2:00-3:30 | Else: 1:30-2:30';

console.log(APPLY ? 'APPLY MODE' : 'DRY RUN');
console.log('='.repeat(60));
console.log('Warmup → plan.warmup:');
NEW_WARMUP.forEach(w => console.log('  •', w.t, '—', w.rx));
console.log('\nNotes:', JSON.stringify(NEW_NOTES));

(async () => {
  // Fix store.expo-plans blob
  const { data: pr } = await s.from('store').select('value').eq('key', 'expo-plans').maybeSingle();
  const plans = pr?.value || [];
  const idx = plans.findIndex(p => p.traineeId === TRAINEE_ID && p.name === PLAN_NAME);
  if (idx < 0) { console.error('Block #17 not found in blob'); process.exit(1); }
  const p = plans[idx];
  console.log('\nCurrent blob state:');
  console.log('  warmup:', JSON.stringify(p.warmup));
  console.log('  notes length:', p.notes?.length);

  if (!APPLY) { console.log('\n(dry run — rerun with "apply")'); return; }

  plans[idx] = { ...p, warmup: NEW_WARMUP, notes: NEW_NOTES };
  const { error: e1 } = await s.from('store').update({ value: plans }).eq('key', 'expo-plans');
  if (e1) throw e1;
  console.log('\n✓ Updated store.expo-plans blob');

  // Fix plans table
  const { data: row } = await s.from('plans').select('id,name,trainee_id,phase,notes,data').eq('id', p.id).maybeSingle();
  if (!row) {
    console.log('  WARN: plans table row for', p.id, 'not found');
  } else {
    const newData = { ...(row.data || {}), warmup: NEW_WARMUP };
    const { error: e2 } = await s.from('plans')
      .update({ notes: NEW_NOTES, data: newData })
      .eq('id', p.id);
    if (e2) throw e2;
    console.log('✓ Updated plans table row');
  }

  // Verify round-trip
  const { data: prV } = await s.from('store').select('value').eq('key', 'expo-plans').maybeSingle();
  const after = prV.value.find(x => x.id === p.id);
  console.log('\nVerified blob after:');
  console.log('  warmup count:', after.warmup.length);
  console.log('  notes:', JSON.stringify(after.notes));
  const { data: rowV } = await s.from('plans').select('data,notes').eq('id', p.id).maybeSingle();
  console.log('Verified plans table after:');
  console.log('  data.warmup count:', rowV.data?.warmup?.length);
  console.log('  notes:', JSON.stringify(rowV.notes));
})().catch(e => { console.error('ERROR:', e); process.exit(1); });
