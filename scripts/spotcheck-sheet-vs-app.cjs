// ADVERSARIAL spot-check of the reconciliation.
//
// The audit was made progressively more forgiving — ditto marks, date serials,
// typo-tolerant joins, leading-number comparison, label rows. Each relaxation
// was justified, and every one of them is also a way to HIDE a real gap. So
// this checks the claim a different way: pick sheet rows at random, and ask a
// deliberately dumb question — does SOME row in that athlete's app plans carry
// this exact YouTube video id?
//
// It shares no matching logic with the reconciler. If the reconciler is lying,
// these numbers disagree with it.
//
// Usage: node scripts/spotcheck-sheet-vs-app.cjs <sheetsDir> [sampleSize]
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
const DIR = process.argv[2];
const N = Number(process.argv[3] || 40);

const ytId = (u) => { const m = String(u).match(/(?:youtu\.be\/|\/shorts\/|[?&]v=|\/embed\/)([A-Za-z0-9_-]{11})/); return m ? m[1] : null; };

// trainee ids keyed by the slug the batch runner used
const MAP = JSON.parse(fs.readFileSync(path.join(__dirname, 'sheet-trainee-map.json'), 'utf8'));

(async () => {
  await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  const { data: libRow } = await s.from('store').select('value').eq('key', 'expo-exercises').single();
  const libVid = new Map((libRow.value || []).map((e) => [e.id, e.videoLink || '']));

  // Every hyperlink in every sheet, with its athlete.
  const all = [];
  for (const [slug, trainee] of Object.entries(MAP)) {
    const f = path.join(DIR, `${slug}.xlsx`);
    if (!fs.existsSync(f)) continue;
    const wb = XLSX.readFile(f);
    for (const tab of wb.SheetNames) {
      if (/^(history|log|archive|records?|maxes|testing)\b/i.test(tab.trim())) continue;
      const ws = wb.Sheets[tab];
      for (const addr of Object.keys(ws)) {
        if (addr[0] === '!') continue;
        const c = ws[addr];
        const id = c && c.l && c.l.Target ? ytId(c.l.Target) : null;
        if (id) all.push({ slug, trainee, tab, addr, id, label: String(c.v || '').slice(0, 30) });
      }
    }
  }
  console.log(`hyperlinked YouTube cells across all sheets: ${all.length}`);

  // Deterministic spread rather than random, so a re-run is comparable.
  const step = Math.max(1, Math.floor(all.length / N));
  const sample = all.filter((_, i) => i % step === 0).slice(0, N);

  const byTrainee = new Map();
  for (const t of new Set(sample.map((x) => x.trainee))) {
    const { data: plans } = await s.from('plans').select('name,data').in('trainee_id', [t, t + '__0', t + '__1']);
    const ids = new Set();
    for (const p of plans || []) {
      // Warm-up steps hang off the PLAN, not off a day — the first version of
      // this check missed them entirely and reported six false gaps.
      for (const w of p.data?.warmup || []) { const wv = ytId(w.vid || ''); if (wv) ids.add(wv); }
      for (const d of p.data?.days || []) {
        for (const e of d.exercises || d.ex || []) {
          const direct = ytId(e.videoUrl || '');
          if (direct) ids.add(direct);
          const viaLib = ytId(libVid.get(e.exerciseId || e.eid || '') || '');
          if (viaLib) ids.add(viaLib);
        }
      }
    }
    byTrainee.set(t, ids);
  }

  let present = 0; const missing = [];
  for (const x of sample) {
    if ((byTrainee.get(x.trainee) || new Set()).has(x.id)) present++;
    else missing.push(x);
  }
  console.log(`\nSPOT CHECK: ${present}/${sample.length} sampled sheet videos are present in that athlete's app plans`);
  if (missing.length) {
    console.log('\nNOT FOUND (each is either a real remaining gap or a warm-up link the app does not carry):');
    missing.slice(0, 15).forEach((m) => console.log(`  ${m.slug.padEnd(18)} ${m.tab.slice(0, 22).padEnd(23)} ${m.addr.padEnd(5)} ${m.label}`));
  }
  process.exit(0);
})();
