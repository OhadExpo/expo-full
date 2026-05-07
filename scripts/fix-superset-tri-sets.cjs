// Targeted fix for plans where the import bug produced corrupted patterns
// involving tri-sets (2a/2b/2c, 3a/3b/3c) — those broke the strict
// alternating-A/B fingerprint, so the bulk fix-superset-corruption.cjs
// run missed them. Each entry below carries the verified-against-Drive
// target sequence; applying writes the new supersets onto the plan's
// matching day.
//
// Usage: node scripts/fix-superset-tri-sets.cjs           (dry-run)
//        node scripts/fix-superset-tri-sets.cjs --apply

const { createClient } = require('@supabase/supabase-js');

const SUPA_URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const SUPA_PUBLISHABLE_KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
const APPLY = process.argv.includes('--apply');
const sb = createClient(SUPA_URL, SUPA_PUBLISHABLE_KEY);

// Drive-verified target supersets, position-by-position. Empty string =
// standalone (no superset). Each FIX matches a single day in a plan.
const FIXES = [
  // Shalev Lugashi · Block #1 · Day B - Pull (L) · source: 1a 1b 2a 2b 2c 3a 3b 4
  { planId: 'plan_h5y38bf72h4mo91erk6', dayName: 'Day B - Pull (L)',
    target: ['A','A','B','B','B','C','C',''] },
  // Shalev Lugashi · Block #1 · Day C - Core & Mobility · source: 1a 1b 2a 2b 3a 3b 3c
  { planId: 'plan_h5y38bf72h4mo91erk6', dayName: 'Day C - Core & Mobility',
    target: ['A','A','B','B','C','C','C'] },
];

const exsOf = (day) => day?.exercises || day?.ex || [];
const exsKeyOf = (day) => (day?.exercises ? 'exercises' : 'ex');
const ssOf = (ex) => ex?.superset ?? ex?.ss ?? '';
const ssKeyOf = (ex) => (ex && Object.prototype.hasOwnProperty.call(ex, 'superset') ? 'superset'
                       : ex && Object.prototype.hasOwnProperty.call(ex, 'ss') ? 'ss'
                       : 'superset');

(async () => {
  const { error: authErr } = await sb.auth.signInWithPassword({
    email: 'ohadyproductions@gmail.com', password: '1234',
  });
  if (authErr) { console.error('auth failed:', authErr.message); process.exit(1); }

  console.log(`mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);

  for (const fix of FIXES) {
    const { data: plan, error } = await sb.from('plans').select('id, name, data').eq('id', fix.planId).maybeSingle();
    if (error || !plan) { console.error(`✗ ${fix.planId}: not found`); continue; }
    const days = plan.data?.days || [];
    const dayIdx = days.findIndex(d => d?.name === fix.dayName);
    if (dayIdx < 0) { console.error(`✗ ${fix.planId} day "${fix.dayName}": not found`); continue; }
    const day = days[dayIdx];
    const exs = exsOf(day);
    if (exs.length !== fix.target.length) {
      console.error(`✗ ${fix.planId} ${fix.dayName}: count mismatch — plan has ${exs.length} exercises, target has ${fix.target.length}`);
      continue;
    }
    const before = exs.map(ssOf).join(',');
    const newExs = exs.map((ex, i) => {
      const target = fix.target[i];
      const key = ssKeyOf(ex);
      if ((ex[key] || '') === target) return ex;
      return { ...ex, [key]: target };
    });
    const after = newExs.map(ssOf).join(',');
    console.log(`[${plan.name}] ${fix.dayName}`);
    console.log(`   before: ${before}`);
    console.log(`   after:  ${after}`);
    if (!APPLY) continue;
    const newDays = days.slice();
    newDays[dayIdx] = { ...day, [exsKeyOf(day)]: newExs };
    const { error: uErr } = await sb.from('plans').update({ data: { ...plan.data, days: newDays }, updated_at: new Date().toISOString() }).eq('id', plan.id);
    if (uErr) console.error(`   ✗ apply failed: ${uErr.message}`);
    else console.log(`   ✓ applied`);
  }

  await sb.auth.signOut();
})();
