// Apply the 4 verified deltas from scripts/verify-supersets-all.cjs.
// Each entry was directly compared against the local source xlsx — these
// are the authoritative correct supersets per the user's documented rule.
//
// Run: node scripts/fix-supersets-verified-deltas.cjs           (dry-run)
//      node scripts/fix-supersets-verified-deltas.cjs --apply

const { createClient } = require('@supabase/supabase-js');

const SUPA_URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const SUPA_PUBLISHABLE_KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
const APPLY = process.argv.includes('--apply');
const sb = createClient(SUPA_URL, SUPA_PUBLISHABLE_KEY);

// One entry per (plan, day). Targets verified against local source xlsx.
const FIXES = [
  // Tal Sionov · Block #8 · source had 6a/6b at the end, both → A (since
  // group 6 mod-5 = position 0 = A). EXPO had A,B — only the second is wrong.
  // Need plan id from verify-all.json — fill in dynamically by name+day.
  { traineeName: 'טל סיאונוב', planNameContains: 'Block #8', dayName: 'Day A',
    target: ['','','','','','A','A'] },
  { traineeName: 'טל סיאונוב', planNameContains: 'Block #8', dayName: 'Day B',
    target: ['','','','','','A','A'] },
  // Yuval Gotlib · Block #21 · "1" stored as superset value (raw label
  // leaked into the field instead of being interpreted). Source has just
  // numbered exercises, no a/b suffix — should all be empty.
  { traineeName: 'יובל גוטליב', planNameContains: 'Block #21', dayName: 'Day 1',
    target: ['','','','','','',''] },
  // Neta+Tom · Block #6 · same family of corruption — "6" leaked into
  // superset for two exercises. Source has them as standalones.
  { traineeNameContains: 'נטע', planNameContains: 'Block #6', dayName: 'Day B',
    target: ['','','','','','',''] },
];

const exsOf = (day) => day?.exercises || day?.ex || [];
const exsKeyOf = (day) => (day?.exercises ? 'exercises' : 'ex');
const ssOf = (ex) => ex?.superset ?? ex?.ss ?? '';
const ssKeyOf = (ex) => (ex && Object.prototype.hasOwnProperty.call(ex, 'superset') ? 'superset'
                       : ex && Object.prototype.hasOwnProperty.call(ex, 'ss') ? 'ss'
                       : 'superset');

(async () => {
  await sb.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  const { data: tr } = await sb.from('store').select('value').eq('key', 'expo-trainees').maybeSingle();
  const trainees = tr?.value || [];
  const findTraineeIds = (matchName) => {
    const ids = [];
    for (const t of trainees) {
      if ((t.name || '').includes(matchName)) ids.push(t.id);
      if (t.members) {
        t.members.forEach((m, i) => {
          if ((m?.name || '').includes(matchName)) ids.push(`${t.id}__${i}`);
        });
      }
    }
    return ids;
  };

  const { data: plans } = await sb.from('plans').select('id, name, trainee_id, data');

  console.log(`mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);

  for (const fix of FIXES) {
    const matchName = fix.traineeName || fix.traineeNameContains;
    const tids = findTraineeIds(matchName);
    if (!tids.length) { console.error(`✗ no trainee matched "${matchName}"`); continue; }
    // Couples may be tr_xxx parent + sub-ids. The plans table stores
    // plans against either parent or sub. Match any.
    const baseSet = new Set();
    tids.forEach(t => { baseSet.add(t); baseSet.add(t.split('__')[0]); });
    const candidatePlans = plans.filter(p => baseSet.has(p.trainee_id) && (p.name || '').includes(fix.planNameContains));
    if (!candidatePlans.length) { console.error(`✗ no plan matched "${fix.planNameContains}" for ${matchName}`); continue; }
    if (candidatePlans.length > 1) {
      console.error(`✗ ambiguous plan match for "${matchName}" / "${fix.planNameContains}" — ${candidatePlans.length} candidates`);
      candidatePlans.forEach(p => console.error(`     ${p.id} :: ${p.name}`));
      continue;
    }
    const plan = candidatePlans[0];
    const days = plan.data?.days || [];
    const dayIdx = days.findIndex(d => d?.name === fix.dayName);
    if (dayIdx < 0) { console.error(`✗ ${plan.id}: day "${fix.dayName}" not found`); continue; }
    const day = days[dayIdx];
    const exs = exsOf(day);
    if (exs.length !== fix.target.length) {
      console.error(`✗ ${plan.id} ${fix.dayName}: count mismatch — plan ${exs.length}, target ${fix.target.length}`);
      continue;
    }
    const before = exs.map(ssOf).join(',');
    const newExs = exs.map((ex, i) => {
      const t = fix.target[i];
      const key = ssKeyOf(ex);
      if ((ex[key] || '') === t) return ex;
      return { ...ex, [key]: t };
    });
    const after = newExs.map(ssOf).join(',');
    console.log(`[${matchName}] ${plan.name} · ${fix.dayName}`);
    console.log(`   before: ${before}`);
    console.log(`   after:  ${after}`);
    if (!APPLY) continue;
    const newDays = days.slice();
    newDays[dayIdx] = { ...day, [exsKeyOf(day)]: newExs };
    const { error } = await sb.from('plans').update({ data: { ...plan.data, days: newDays }, updated_at: new Date().toISOString() }).eq('id', plan.id);
    if (error) console.error(`   ✗ ${error.message}`);
    else console.log(`   ✓ applied`);
  }

  await sb.auth.signOut();
})();
