// Simulate the fixed trainerPlanToPortal against Yuval's Comeback Block
const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co','sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');

const EX = {}; const EX_BY_TITLE = {};

function trainerPlanToPortal(plan, trainerExercises) {
  return {
    name: plan.name,
    warmup: plan.warmup || [],
    days: (plan.days || []).map(d => {
      const rawList = Array.isArray(d.exercises) ? d.exercises : (Array.isArray(d.ex) ? d.ex : []);
      return {
        name: d.name,
        ex: rawList.map((pe, peIdx) => {
          const libId = pe.exerciseId || pe.eid || null;
          let exData = libId ? trainerExercises.find(e => e.id === libId) : null;
          if (!exData && pe.title) {
            const needle = pe.title.toLowerCase().trim();
            exData = trainerExercises.find(e => (e.title || '').toLowerCase().trim() === needle) || null;
          }
          const title = (pe.title || exData?.title || 'Exercise ' + (peIdx + 1)).trim();
          let eid = EX_BY_TITLE[title.toLowerCase()];
          if (!eid) {
            const stableKey = pe.id || libId || title.toLowerCase().replace(/[^a-z0-9]+/g, '_');
            eid = 'dyn_' + stableKey;
            if (!EX[eid]) EX[eid] = { t: title, vid: exData?.videoLink || '', q: exData?.cues || '' };
          }
          const sets = pe.sets ?? pe.s ?? 3;
          const reps = pe.reps ?? pe.r ?? '8-12';
          const out = { eid, s: sets, r: reps, _title: title, _vid: exData?.videoLink };
          if (pe.tempo) out.tempo = pe.tempo;
          if (pe.superset) out.superset = pe.superset;
          return out;
        })
      };
    })
  };
}

(async () => {
  const { data: cb } = await s.from('plans').select('*').eq('id','plan_8cis0opbphkmo7afjj6').maybeSingle();
  const { data: libStore } = await s.from('store').select('value').eq('key','expo-exercises').maybeSingle();
  const lib = libStore.value;
  const plan = { name: cb.name, days: cb.data.days, warmup: cb.data.warmup, notes: cb.notes };
  const portal = trainerPlanToPortal(plan, lib);
  console.log(`=== ${portal.name} ===`);
  console.log(`Warmup: ${portal.warmup.length}`);
  portal.days.forEach((d,i) => {
    console.log(`\nDay ${i+1}: "${d.name}" (${d.ex.length} exercises)`);
    d.ex.forEach((e,ei) => {
      console.log(`  [${ei+1}] "${e._title}" ${e.s}x${e.r}${e.tempo?' @'+e.tempo:''}${e.superset?' SS:'+e.superset:''} vid=${e._vid?'Y':''}`);
    });
  });
})();
