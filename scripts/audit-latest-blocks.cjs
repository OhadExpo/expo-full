// One-off: for every active trainee, identify their latest block and report
// completeness — exercise/warmup video URL coverage, title match against the
// library, basic plan-shape sanity.
//
// Output (stdout, table-ish):
//   trainee · plan name (id) · days · ex count · missing urls · notes
//
// Does NOT modify anything. Run with no args.

const { createClient } = require('@supabase/supabase-js');
const SB = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const ANON = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
const s = createClient(SB, ANON);

// Extract a numeric block index from the plan name. Most blocks are
// "Block #N" or "Block #N - something" — pull the integer. Plans without
// a numeric ordinal fall back to plan.updated_at for "latest" sorting.
function blockOrdinal(name) {
  const m = String(name || '').match(/block\s*#?\s*(\d+)/i);
  return m ? parseInt(m[1], 10) : -1;
}

// Date proxy for sorting when ordinal is absent or tied. Higher = newer.
function dateOrd(p) {
  const t = p.updated_at || p.created_at;
  return t ? new Date(t).getTime() : 0;
}

// Two plans share "latest" candidacy by ordinal first, then date.
function isLater(a, b) {
  const oa = blockOrdinal(a.name);
  const ob = blockOrdinal(b.name);
  if (oa !== ob) return oa > ob;
  return dateOrd(a) > dateOrd(b);
}

(async () => {
  const { error: aErr } = await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  if (aErr) { console.error('auth failed:', aErr.message); process.exit(1); }

  // Pull trainees (from store) + library + all plans in parallel.
  const [{ data: trRow }, { data: libRow }, { data: plans }] = await Promise.all([
    s.from('store').select('value').eq('key', 'expo-trainees').maybeSingle(),
    s.from('store').select('value').eq('key', 'expo-exercises').maybeSingle(),
    s.from('plans').select('id, trainee_id, name, active, created_at, updated_at, data'),
  ]);
  const trainees = trRow?.value || [];
  const lib = libRow?.value || [];
  const libById = Object.fromEntries(lib.map(e => [e.id, e]));
  // Title → eid lookup for fuzzy-match fallback when a row has no eid.
  const libByTitle = {};
  for (const e of lib) {
    const t = (e.title || '').toLowerCase().trim();
    if (t) libByTitle[t] = e;
  }

  // Group plans by trainee_id, pick latest per group.
  const byTrainee = new Map();
  for (const p of (plans || [])) {
    if (p.active === false) continue;
    const cur = byTrainee.get(p.trainee_id);
    if (!cur || isLater(p, cur)) byTrainee.set(p.trainee_id, p);
  }

  // Trainees to skip — archived only. Couples (parent + members) all have
  // their own plan rows so the per-member "latest block" surfaces here
  // exactly the same as a solo athlete.
  const activeTrainees = trainees.filter(t => t.status !== 'Archived');
  // Couple member IDs (synthetic: tr_couple__0 / tr_couple__1) — these
  // don't appear in the trainees array directly but DO appear in
  // plans.trainee_id. Surface them too.
  const memberIds = new Set();
  for (const t of activeTrainees) {
    if (Array.isArray(t.members)) {
      for (let i = 0; i < t.members.length; i++) memberIds.add(`${t.id}__${i}`);
    }
  }
  // Union: every trainee + every member id that has at least one plan.
  const allIds = new Set();
  for (const t of activeTrainees) allIds.add(t.id);
  for (const id of memberIds) allIds.add(id);
  for (const tid of byTrainee.keys()) allIds.add(tid); // include orphans

  const nameFor = (id) => {
    const t = trainees.find(x => x.id === id);
    if (t) return t.name;
    if (id.includes('__')) {
      const [parentId, midx] = id.split('__');
      const parent = trainees.find(x => x.id === parentId);
      const m = parent?.members?.[Number(midx)];
      return m?.name ? `${parent?.name || parentId} · ${m.name}` : (parent?.name || parentId);
    }
    return id;
  };

  // Coach-side bug NOTE: ClientPortal.jsx (post a69af68) backfills EX
  // from library on known-eid hits, so a library videoLink will surface
  // even when the static EX baseline lacks vid. So for THIS audit, a
  // row that resolves to a library entry with videoLink counts as "has
  // url". A row with NEITHER row-level videoUrl NOR library videoLink
  // is the actionable gap.

  const summary = [];
  const detail = [];

  for (const tid of [...allIds].sort()) {
    const plan = byTrainee.get(tid);
    if (!plan) {
      summary.push({ tid, name: nameFor(tid), plan: '(no active plans)', issues: 0 });
      continue;
    }
    const days = plan.data?.days || [];
    const warmup = plan.data?.warmup || [];

    let exCount = 0;
    let missingEx = 0;
    let missingWu = 0;
    const gaps = [];

    for (const w of warmup) {
      const u = w.vid || w.videoUrl || '';
      if (!u) { missingWu++; gaps.push({ kind: 'warmup', title: w.t || w.name || '?' }); }
    }
    for (const d of days) {
      for (const ex of (d.exercises || d.ex || [])) {
        exCount++;
        const eid = ex.exerciseId || ex.eid;
        const libEx = libById[eid] || (ex.title ? libByTitle[(ex.title || '').toLowerCase().trim()] : null);
        const rowUrl = ex.videoUrl ?? ex.vid;
        const libUrl = libEx?.videoLink || '';
        // A row with explicit videoUrl: '' counts as MISSING because
        // that's "I cleared the video" — same outcome to the athlete.
        const hasUrl = !!(rowUrl || libUrl);
        if (!hasUrl) {
          missingEx++;
          gaps.push({ kind: 'ex', day: d.name, title: libEx?.title || ex.title || `(eid=${eid})` });
        }
      }
    }

    summary.push({
      tid, name: nameFor(tid),
      plan: `${plan.name} (${plan.id})`,
      days: days.length, ex: exCount, warmup: warmup.length,
      missingEx, missingWu,
      updated: plan.updated_at?.slice(0, 10),
    });
    if (missingEx + missingWu > 0) detail.push({ tid, name: nameFor(tid), plan, gaps });
  }

  // Print summary table.
  console.log('\\n=== SUMMARY ===');
  console.log('trainee'.padEnd(35), 'plan'.padEnd(30), 'days', 'ex', 'wu', 'gap-ex', 'gap-wu', 'updated');
  console.log(''.padEnd(110, '-'));
  for (const r of summary.sort((a, b) => (b.missingEx + b.missingWu) - (a.missingEx + a.missingWu))) {
    const gap = (r.missingEx || 0) + (r.missingWu || 0);
    console.log(
      String(r.name || '').slice(0, 33).padEnd(35),
      String(r.plan || '').slice(0, 28).padEnd(30),
      String(r.days || '—').padStart(4),
      String(r.ex || '—').padStart(3),
      String(r.warmup || '—').padStart(3),
      String(r.missingEx || 0).padStart(6),
      String(r.missingWu || 0).padStart(6),
      r.updated || '—',
    );
  }

  console.log('\\n=== GAPS DETAIL ===');
  for (const d of detail) {
    console.log('\\n· ' + d.name + ' — ' + d.plan.name + ' (' + d.plan.id + ')');
    for (const g of d.gaps) {
      console.log('   ' + (g.kind === 'warmup' ? 'WARMUP' : `[${g.day}]`) + ' ' + g.title);
    }
  }

  console.log('\\nTotals: ' + detail.length + ' plans with gaps, ' +
    detail.reduce((a, d) => a + d.gaps.length, 0) + ' missing URLs.');
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
