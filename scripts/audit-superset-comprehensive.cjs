// Stage 1 of the comprehensive audit: inventory every athlete + every
// non-active plan, so we can see the verification scope before pulling
// 21 Drive sheets. Excludes:
//   - plans flagged active=true (the trainee's currently-loaded block)
//   - the most recent block per athlete by created_at as a fallback when
//     no plan is explicitly marked active.
//
// Run: node scripts/audit-superset-comprehensive.cjs
// Output: scripts/audit-superset-comprehensive.json + console summary.

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const SUPA_URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const SUPA_PUBLISHABLE_KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
const sb = createClient(SUPA_URL, SUPA_PUBLISHABLE_KEY);

(async () => {
  const { error: authErr } = await sb.auth.signInWithPassword({
    email: 'ohadyproductions@gmail.com',
    password: '1234',
  });
  if (authErr) { console.error('auth failed:', authErr.message); process.exit(1); }

  const { data: tr } = await sb.from('store').select('value').eq('key', 'expo-trainees').maybeSingle();
  const trainees = tr?.value || [];

  // Flatten couples to per-member rows so each athlete is one inventory entry.
  const athletes = [];
  for (const t of trainees) {
    if (t.members && t.members.length === 2) {
      t.members.forEach((m, i) => athletes.push({ id: t.id + '__' + i, name: m.name || ('Member ' + (i + 1)), parent: t.id }));
    } else {
      athletes.push({ id: t.id, name: t.name });
    }
  }

  const { data: plans } = await sb.from('plans').select('id, name, trainee_id, active, data, created_at, updated_at');

  // Bucket plans per athlete; pick the "current" one to exclude.
  const inventory = athletes.map(a => {
    const mine = plans.filter(p => p.trainee_id === a.id);
    if (!mine.length) return { ...a, currentId: null, oldPlans: [] };
    // Prefer plans flagged active=true. If none, fall back to the most
    // recently-created.
    const active = mine.filter(p => p.active === true);
    let currentId = null;
    if (active.length === 1) currentId = active[0].id;
    else {
      const sorted = mine.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      currentId = sorted[0]?.id || null;
    }
    const oldPlans = mine
      .filter(p => p.id !== currentId)
      .map(p => ({
        id: p.id,
        name: p.name,
        days: (p.data?.days || []).length,
        exercisesWithSs: (p.data?.days || []).reduce((acc, d) => acc + (d.exercises || d.ex || []).filter(e => (e?.superset || e?.ss || '')).length, 0),
        totalExercises: (p.data?.days || []).reduce((acc, d) => acc + (d.exercises || d.ex || []).length, 0),
      }))
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'he'));
    return { ...a, currentId, oldPlans };
  });

  const totalAthletes = inventory.length;
  const athletesWithOld = inventory.filter(a => a.oldPlans.length).length;
  const totalOldPlans = inventory.reduce((acc, a) => acc + a.oldPlans.length, 0);

  console.log(`\n=== INVENTORY ===`);
  console.log(`Athletes total: ${totalAthletes}`);
  console.log(`Athletes with old plans (need Drive verification): ${athletesWithOld}`);
  console.log(`Total old plans to verify: ${totalOldPlans}\n`);

  console.log(`--- per athlete ---`);
  inventory
    .filter(a => a.oldPlans.length)
    .sort((a, b) => b.oldPlans.length - a.oldPlans.length)
    .forEach(a => {
      console.log(`  ${a.name.padEnd(28)}  ${String(a.oldPlans.length).padStart(3)} old plans  (current: ${a.currentId || '—'})`);
    });

  console.log(`\n--- athletes WITHOUT current plans (no exclusion needed; verify all) ---`);
  inventory
    .filter(a => a.oldPlans.length && !a.currentId)
    .forEach(a => console.log(`  ${a.name}`));

  fs.writeFileSync('scripts/audit-superset-comprehensive.json', JSON.stringify({ generatedAt: new Date().toISOString(), inventory }, null, 2));
  console.log('\nwrote scripts/audit-superset-comprehensive.json');

  await sb.auth.signOut();
})();
