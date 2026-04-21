// Final audit: for every active trainee, confirm exactly ONE latest block is
// visible and report every day's exercise count + any rendering issues.
const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co','sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');

const memberIndexFromId = (traineeId, parentId) => {
  if (!traineeId || !parentId || traineeId === parentId) return null;
  const m = /__(\d+)$/.exec(traineeId);
  return m ? parseInt(m[1], 10) : null;
};
const parentOf = id => id.replace(/__\d+$/, '');
const blockNum = n => { const m = /#(\d+)/.exec(n || ''); return m ? parseInt(m[1], 10) : -Infinity; };
const isComeback = n => /comeback/i.test(n || '');

function convert(plan, lib) {
  return (plan.days || []).map(d => {
    const rawList = Array.isArray(d.exercises) ? d.exercises : (Array.isArray(d.ex) ? d.ex : []);
    return { name: d.name, ex: rawList.map((pe, peIdx) => {
      const libId = pe.exerciseId || pe.eid || null;
      let exData = libId ? lib.find(e => e.id === libId) : null;
      if (!exData && pe.title) {
        const needle = pe.title.toLowerCase().trim();
        exData = lib.find(e => (e.title || '').toLowerCase().trim() === needle) || null;
      }
      const title = (pe.title || exData?.title || 'Exercise ' + (peIdx + 1)).trim();
      return { title, broken: /^Exercise \d+$/.test(title) };
    })};
  });
}

(async () => {
  const [{ data: tr }, { data: plansRows }, { data: libStore }, { data: visStore }] = await Promise.all([
    s.from('store').select('value').eq('key','expo-trainees').maybeSingle(),
    s.from('plans').select('id,name,trainee_id,data,created_at'),
    s.from('store').select('value').eq('key','expo-exercises').maybeSingle(),
    s.from('store').select('value').eq('key','expo-portal-vis').maybeSingle(),
  ]);
  const trainees = tr?.value || [];
  const lib = libStore?.value || [];
  const vis = { ...(visStore?.value || {}) };

  const byParent = {};
  for (const p of plansRows) {
    const parent = parentOf(p.trainee_id);
    byParent[parent] = byParent[parent] || [];
    byParent[parent].push(p);
  }

  const perMember = (plans, parentId) => {
    const members = {};
    for (const p of plans) {
      const mi = memberIndexFromId(p.trainee_id, parentId);
      const key = mi == null ? 'solo' : String(mi);
      members[key] = members[key] || [];
      members[key].push(p);
    }
    return members;
  };

  const pickLatest = arr => arr.slice().sort((a, b) => {
    const cb = (isComeback(b.name) ? 1 : 0) - (isComeback(a.name) ? 1 : 0);
    if (cb !== 0) return cb;
    const bn = blockNum(b.name) - blockNum(a.name);
    if (bn !== 0) return bn;
    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
  })[0];

  let fixed = 0;
  const issues = [];

  for (const t of trainees) {
    if (t.status === 'Archived') continue;
    const plans = byParent[t.id] || [];
    if (plans.length === 0) continue;
    const members = perMember(plans, t.id);

    const visibleSummary = [];
    for (const [memberKey, memberPlans] of Object.entries(members)) {
      const latest = pickLatest(memberPlans);
      const suffix = memberKey === 'solo' ? '' : `:m${memberKey}`;

      const wantShow = new Set([latest.id]);
      const wantHide = memberPlans.filter(p => p.id !== latest.id).map(p => p.id);

      // Enforce desired vis state and remediate any drift
      for (const p of memberPlans) {
        const key = `${t.name}:${p.name}${suffix}`;
        const desired = wantShow.has(p.id);
        const current = vis[key] !== false;
        if (current !== desired) {
          vis[key] = desired;
          fixed++;
          issues.push(`drift: ${key} was ${current?'show':'hide'} → ${desired?'show':'hide'}`);
        }
      }

      // Simulate rendering of visible block
      const conv = convert({ days: latest.data?.days || [] }, lib);
      const dayCounts = conv.map(d => d.ex.length);
      const broken = conv.flatMap(d => d.ex.filter(e => e.broken)).length;
      const warmup = (latest.data?.warmup || []).length;
      visibleSummary.push(`${t.name}${suffix} → "${latest.name}" days=[${dayCounts.join(',')}] warmup=${warmup} broken=${broken}`);

      if (dayCounts.length === 0 || dayCounts.some(n => n === 0)) {
        issues.push(`${t.name}${suffix}: "${latest.name}" has empty days [${dayCounts.join(',')}]`);
      }
      if (broken > 0) {
        issues.push(`${t.name}${suffix}: "${latest.name}" has ${broken} exercises with no title and no library ID`);
      }
    }
    visibleSummary.forEach(l => console.log(l));
  }

  if (fixed > 0) {
    console.log(`\nRemediating ${fixed} drifted visibility keys...`);
    const { error } = await s.from('store').upsert({ key: 'expo-portal-vis', value: vis });
    if (error) { console.error('ERROR writing vis:', error); process.exit(1); }
    console.log('Written.');
  } else {
    console.log('\nVisibility state already correct — no writes needed.');
  }

  console.log(`\n=== FINAL ===`);
  if (issues.length === 0) {
    console.log('All active trainees: 1 block visible, all exercises render with titles.');
  } else {
    console.log(`${issues.length} issue(s):`);
    issues.forEach(i => console.log('  ' + i));
  }
})();
