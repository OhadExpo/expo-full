// For every trainee, simulate the fixed trainerPlanToPortal against each
// visible plan in Supabase. Report: trainee → visible plans → days × exercises,
// and flag any plan/day that resolves to 0 exercises or exercises whose library
// lookup fails (title === 'Exercise N').
const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co','sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');

const EX = {}; const EX_BY_TITLE = {};
function convert(plan, lib) {
  return {
    name: plan.name,
    warmup: plan.warmup || [],
    days: (plan.days || []).map(d => {
      const rawList = Array.isArray(d.exercises) ? d.exercises : (Array.isArray(d.ex) ? d.ex : []);
      return { name: d.name, ex: rawList.map((pe, peIdx) => {
        const libId = pe.exerciseId || pe.eid || null;
        let exData = libId ? lib.find(e => e.id === libId) : null;
        if (!exData && pe.title) {
          const needle = pe.title.toLowerCase().trim();
          exData = lib.find(e => (e.title || '').toLowerCase().trim() === needle) || null;
        }
        const title = (pe.title || exData?.title || 'Exercise ' + (peIdx + 1)).trim();
        const broken = /^Exercise \d+$/.test(title);
        return { title, _resolved: !!exData, _vid: !!exData?.videoLink, _broken: broken, _hasTitleOnly: !exData && !!pe.title };
      })};
    })
  };
}

const memberIndexFromId = (traineeId, parentId) => {
  if (!traineeId || !parentId || traineeId === parentId) return null;
  const m = /__(\d+)$/.exec(traineeId);
  return m ? parseInt(m[1], 10) : null;
};
const parentOf = id => id.replace(/__\d+$/, '');

(async () => {
  const [{ data: tr }, { data: plansRows }, { data: libStore }, { data: visStore }] = await Promise.all([
    s.from('store').select('value').eq('key','expo-trainees').maybeSingle(),
    s.from('plans').select('id,name,trainee_id,data'),
    s.from('store').select('value').eq('key','expo-exercises').maybeSingle(),
    s.from('store').select('value').eq('key','expo-portal-vis').maybeSingle(),
  ]);
  const trainees = tr?.value || [];
  const lib = libStore?.value || [];
  const vis = visStore?.value || {};

  const byParent = {};
  for (const p of plansRows) {
    const parent = parentOf(p.trainee_id);
    byParent[parent] = byParent[parent] || [];
    byParent[parent].push(p);
  }

  let trainee_ok = 0, trainee_warn = 0;
  const warnings = [];

  for (const t of trainees) {
    if (t.status === 'Archived') continue;
    const plans = byParent[t.id] || [];
    if (plans.length === 0) continue;
    const visiblePlans = plans.filter(p => {
      const mi = memberIndexFromId(p.trainee_id, t.id);
      const suffix = mi == null ? '' : `:m${mi}`;
      const key = `${t.name}:${p.name}${suffix}`;
      return vis[key] !== false;
    });

    if (visiblePlans.length === 0) {
      warnings.push(`${t.name} (${t.id}): 0 visible plans (of ${plans.length} total)`);
      trainee_warn++;
      continue;
    }

    const lines = [];
    let anyEmpty = false, anyBroken = 0, totalEx = 0, titleOnly = 0;
    for (const p of visiblePlans) {
      const plan = { name: p.name, days: p.data?.days || [], warmup: p.data?.warmup || [] };
      const conv = convert(plan, lib);
      const dayTotals = conv.days.map(d => d.ex.length);
      const broken = conv.days.flatMap(d => d.ex.filter(e => e._broken)).length;
      const tOnly = conv.days.flatMap(d => d.ex.filter(e => e._hasTitleOnly)).length;
      const noVid = conv.days.flatMap(d => d.ex.filter(e => e._resolved && !e._vid)).length;
      totalEx += dayTotals.reduce((a,b)=>a+b,0);
      anyBroken += broken;
      titleOnly += tOnly;
      if (dayTotals.some(n => n === 0) || dayTotals.length === 0) anyEmpty = true;
      lines.push(`    "${p.name}" days=[${dayTotals.join(',')}] broken=${broken} title-only=${tOnly} no-vid=${noVid}`);
    }
    const tag = (anyEmpty || anyBroken > 0 || totalEx === 0) ? 'WARN' : 'ok  ';
    if (tag === 'WARN') {
      trainee_warn++;
      warnings.push(`${t.name} — visible=${visiblePlans.length} totalEx=${totalEx} broken=${anyBroken} titleOnly=${titleOnly} emptyDay=${anyEmpty}`);
    } else {
      trainee_ok++;
    }
    console.log(`[${tag}] ${t.name} (${t.id}) visible=${visiblePlans.length}/${plans.length} totalEx=${totalEx}`);
    lines.forEach(l => console.log(l));
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`ok: ${trainee_ok}, warn: ${trainee_warn}`);
  if (warnings.length) {
    console.log('\nWARNINGS:');
    warnings.forEach(w => console.log('  ' + w));
  }
})();
