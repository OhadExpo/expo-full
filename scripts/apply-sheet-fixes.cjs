// Apply the reconciler's machine-applicable fixes to the plans table.
//
// Only two fields are written, both of which the sheet is unambiguously
// authoritative for and neither of which changes the PROGRAMMING:
//   videoUrl  — the clip this program links to (a per-row override; the shared
//               exercise library is never touched)
//   superset  — the A..E grouping the sheet encodes as 3a/3b row numbers
//
// Sets, reps and tempo are deliberately NOT auto-written: those are the actual
// prescription, and a parser that is 95% right would silently corrupt an
// athlete's programming. They stay in the report for Ohad to rule on.
//
// Every affected plan is backed up to disk before the first write.
// Usage: node scripts/apply-sheet-fixes.cjs <fixes.json> [--apply]
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
const FIXES = process.argv[2];
const APPLY = process.argv.includes('--apply');

(async () => {
  await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  const fixes = JSON.parse(fs.readFileSync(FIXES, 'utf8'));
  const byPlan = new Map();
  for (const f of fixes) { if (!byPlan.has(f.planId)) byPlan.set(f.planId, []); byPlan.get(f.planId).push(f); }
  console.log(`fixes: ${fixes.length} across ${byPlan.size} plans`);

  const stamp = new Date().toISOString().slice(0, 10);
  const backupDir = path.join(path.dirname(FIXES), `_plan-backups-${stamp}`);
  fs.mkdirSync(backupDir, { recursive: true });

  let applied = 0, skipped = 0, planWrites = 0;
  for (const [planId, list] of byPlan) {
    const { data: plan } = await s.from('plans').select('*').eq('id', planId).single();
    if (!plan) { console.log('  MISSING PLAN', planId); skipped += list.length; continue; }
    const bak = path.join(backupDir, `${planId}.json`);
    if (!fs.existsSync(bak)) fs.writeFileSync(bak, JSON.stringify(plan, null, 2));

    const data = JSON.parse(JSON.stringify(plan.data));
    let touched = 0;
    for (const f of list) {
      // By INDEX — plan data contains duplicate day ids.
      const day = (data.days || [])[f.dayIdx];
      if (!day) { skipped++; continue; }
      const rows = day.exercises || day.ex || [];
      const row = rows[f.rowIdx];
      if (!row) { skipped++; continue; }
      if (f.field === 'videoUrl') { row.videoUrl = f.value; touched++; }
      else if (f.field === 'superset') { row.superset = f.value; touched++; }
      else skipped++;
    }
    if (!touched) continue;
    if (APPLY) {
      const { error } = await s.from('plans').update({ data }).eq('id', planId);
      if (error) { console.log('  WRITE FAILED', planId, error.message); skipped += touched; continue; }
      planWrites++;
    }
    applied += touched;
  }
  console.log(`${APPLY ? 'APPLIED' : 'WOULD APPLY'} ${applied} fixes across ${byPlan.size} plans (skipped ${skipped})`);
  console.log('backups:', backupDir);
  if (!APPLY) { console.log('DRY RUN — pass --apply to write.'); process.exit(0); }

  // ---- verify from the database, not from memory ----
  let ok = 0, bad = 0;
  for (const [planId, list] of byPlan) {
    const { data: plan } = await s.from('plans').select('data').eq('id', planId).single();
    if (!plan) { bad += list.length; continue; }
    for (const f of list) {
      const day = (plan.data.days || [])[f.dayIdx];
      const row = day && (day.exercises || day.ex || [])[f.rowIdx];
      if (!row) { bad++; continue; }
      const got = f.field === 'videoUrl' ? row.videoUrl : row.superset;
      if (String(got || '') === String(f.value || '')) ok++; else bad++;
    }
  }
  console.log(`VERIFIED FROM DB: ${ok} correct, ${bad} not matching (plans written: ${planWrites})`);
  process.exit(bad ? 1 : 0);
})();
