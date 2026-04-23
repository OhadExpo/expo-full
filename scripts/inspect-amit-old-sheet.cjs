// Read-only: parse the old Amit xlsx and diff against Amit's current plans in Supabase.
// Prints what would be imported, what collides by name, so Ohad can approve before --apply.
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const { parseSpreadsheet } = require('./drive-import-core.cjs');

const SUPA_URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const SUPA_KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
const XLSX_PATH = 'C:/Users/Administrator/Downloads/מעקב עמית יהודאי (ישן).xlsx';
const TRAINEE_ID = 'tr_amit';

const s = createClient(SUPA_URL, SUPA_KEY);

(async () => {
  const bytes = fs.readFileSync(XLSX_PATH);
  const { plans, exercises } = parseSpreadsheet(new Uint8Array(bytes));
  console.log(`Old xlsx: parsed ${plans.length} blocks, ${exercises.length} unique exercise entries.\n`);

  console.log('Old-sheet plans:');
  plans.forEach(p => {
    const ec = p.days.reduce((a, d) => a + d.ex.length, 0);
    console.log(`  "${p.name}" — ${p.days.length} days, ${ec} ex, warmup=${p.warmup.length}`);
  });

  const { data: dbPlans, error } = await s.from('plans')
    .select('id,name,active,created_at')
    .eq('trainee_id', TRAINEE_ID)
    .order('created_at', { ascending: true });
  if (error) { console.error(error); process.exit(1); }
  console.log(`\nAmit has ${dbPlans.length} plans currently in DB:`);
  dbPlans.forEach(p => console.log(`  [${p.id.slice(0, 12)}…] "${p.name}" active=${p.active}`));

  const dbNames = new Set(dbPlans.map(p => p.name));
  const toImport = plans.filter(p => !dbNames.has(p.name));
  const collisions = plans.filter(p => dbNames.has(p.name));

  console.log(`\n=== Diff ===`);
  console.log(`Would import (no name collision): ${toImport.length}`);
  toImport.forEach(p => console.log(`  + "${p.name}"`));
  console.log(`Collides with existing plan name: ${collisions.length}`);
  collisions.forEach(p => console.log(`  = "${p.name}"  (skip; already in DB)`));
})();
