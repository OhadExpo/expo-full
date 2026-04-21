// For every trainee, keep only the plan with the highest "#N" in its name visible
// on the client portal. Writes portalVis[`${traineeName}:${planName}[:mN]`] = false
// for all other plans. Existing explicit true/false flags are preserved unless we
// flip them for this rule.
//
// visKey format mirrors ClientPortal.jsx:
//   solo:   `${clientName}:${p.name}`
//   couple: `${clientName}:${p.name}:m${memberIndex}`

const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co','sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');

const blockNum = n => { const m = /#(\d+)/.exec(n || ''); return m ? parseInt(m[1], 10) : -Infinity; };
// A "Comeback" block replaces the numbered progression — it's the restart
// after a long break. "Post INJ" stays excluded because it's often just a
// tag on a numbered block that later blocks follow.
const isComeback = n => /comeback/i.test(n || '');
const memberIndexFromId = (traineeId, parentId) => {
  if (!traineeId || !parentId || traineeId === parentId) return null;
  const m = /__(\d+)$/.exec(traineeId);
  return m ? parseInt(m[1], 10) : null;
};

(async () => {
  const [{ data: traineesStore }, { data: plansRows }, { data: visStore }] = await Promise.all([
    s.from('store').select('value').eq('key','expo-trainees').maybeSingle(),
    s.from('plans').select('id,name,trainee_id,created_at'),
    s.from('store').select('value').eq('key','expo-portal-vis').maybeSingle(),
  ]);
  const trainees = traineesStore?.value || [];
  const vis = { ...(visStore?.value || {}) };

  // parentId resolver: given tr_foo__1, return tr_foo (the trainee record key)
  const parentOf = id => id.replace(/__\d+$/, '');

  // Group plans by parent trainee id
  const byParent = {};
  for (const p of plansRows) {
    const parent = parentOf(p.trainee_id);
    byParent[parent] = byParent[parent] || [];
    byParent[parent].push(p);
  }

  let flipped = 0;
  for (const [parentId, plans] of Object.entries(byParent)) {
    const trainee = trainees.find(t => t.id === parentId);
    if (!trainee) { console.log(`  skip ${parentId}: trainee not found`); continue; }
    const clientName = trainee.name;

    // Couples: visKey is scoped per member. Pick latest per member.
    const members = {};
    for (const p of plans) {
      const mi = memberIndexFromId(p.trainee_id, parentId);
      const memberKey = mi == null ? 'solo' : String(mi);
      members[memberKey] = members[memberKey] || [];
      members[memberKey].push(p);
    }

    for (const [memberKey, memberPlans] of Object.entries(members)) {
      const sorted = memberPlans.slice().sort((a, b) => {
        const cb = (isComeback(b.name) ? 1 : 0) - (isComeback(a.name) ? 1 : 0);
        if (cb !== 0) return cb;
        const bn = blockNum(b.name) - blockNum(a.name);
        if (bn !== 0) return bn;
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      });
      const keep = sorted[0];
      const suffix = memberKey === 'solo' ? '' : `:m${memberKey}`;
      console.log(`\n${clientName}${suffix} — keep: "${keep.name}"`);
      for (const p of sorted) {
        const key = `${clientName}:${p.name}${suffix}`;
        const desired = p.id === keep.id ? true : false;
        if (vis[key] !== desired) {
          vis[key] = desired;
          flipped++;
          console.log(`   ${desired ? 'show' : 'hide'}: ${key}`);
        }
      }
    }
  }

  console.log(`\nFlipped ${flipped} keys. Writing expo-portal-vis...`);
  const { error } = await s.from('store').upsert({ key: 'expo-portal-vis', value: vis });
  if (error) { console.error('ERROR:', error); process.exit(1); }
  console.log('Done.');
})().catch(e => { console.error(e); process.exit(1); });
