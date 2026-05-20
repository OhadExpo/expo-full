// Patch row-level videoUrl on the LATEST block of every active trainee,
// pulling URLs you've already used for the same exercise elsewhere in the
// plans table. Strict rule: only fill from your own historical data —
// never substitute a different exercise's URL.
//
// Run with no args for a dry-run; pass `apply` to actually patch.

const { createClient } = require('@supabase/supabase-js');
const SB = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const ANON = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
const APPLY = process.argv[2] === 'apply';

function blockOrdinal(name) {
  const m = String(name || '').match(/block\s*#?\s*(\d+)/i);
  return m ? parseInt(m[1], 10) : -1;
}
function dateOrd(p) { return new Date(p.updated_at || p.created_at || 0).getTime(); }
function isLater(a, b) {
  const oa = blockOrdinal(a.name), ob = blockOrdinal(b.name);
  if (oa !== ob) return oa > ob;
  return dateOrd(a) > dateOrd(b);
}
// Canonical-ize: youtube URLs in the DB sometimes carry `&amp;` from xlsx/HTML
// encoding. Real URLs use `&`. Decode so the inserted value plays cleanly.
const clean = (u) => String(u || '').replace(/&amp;/g, '&').trim();

(async () => {
  const s = createClient(SB, ANON);
  await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  const [{ data: libRow }, { data: plans }] = await Promise.all([
    s.from('store').select('value').eq('key', 'expo-exercises').maybeSingle(),
    s.from('plans').select('id, trainee_id, name, active, updated_at, created_at, data'),
  ]);
  const libById = Object.fromEntries((libRow?.value || []).map(e => [e.id, e]));

  // Harvest: for each eid AND each title, count URLs used across all plans.
  // Pick the most-frequent URL as the canonical one.
  const byEid = new Map();
  const byTitle = new Map();
  for (const p of plans || []) {
    for (const d of (p.data?.days || [])) {
      for (const ex of (d.exercises || d.ex || [])) {
        const raw = ex.videoUrl ?? ex.vid;
        if (!raw || typeof raw !== 'string' || raw.startsWith('blob:') || raw.startsWith('data:')) continue;
        const u = clean(raw);
        const eid = ex.exerciseId || ex.eid;
        const title = (ex.title || libById[eid]?.title || '').trim().toLowerCase();
        if (eid) {
          if (!byEid.has(eid)) byEid.set(eid, new Map());
          byEid.get(eid).set(u, (byEid.get(eid).get(u) || 0) + 1);
        }
        if (title) {
          if (!byTitle.has(title)) byTitle.set(title, new Map());
          byTitle.get(title).set(u, (byTitle.get(title).get(u) || 0) + 1);
        }
      }
    }
  }
  const top = (m) => { if (!m) return null; let best = null, n = 0; for (const [u, c] of m.entries()) if (c > n) { best = u; n = c; } return best; };

  // Latest block per trainee.
  const byTrainee = new Map();
  for (const p of plans || []) { if (p.active === false) continue; const c = byTrainee.get(p.trainee_id); if (!c || isLater(p, c)) byTrainee.set(p.trainee_id, p); }

  let patches = 0;
  const planPatches = new Map();
  for (const [tid, p] of byTrainee.entries()) {
    const newDays = JSON.parse(JSON.stringify(p.data?.days || []));
    let touched = false;
    for (const d of newDays) {
      for (const ex of (d.exercises || d.ex || [])) {
        const eid = ex.exerciseId || ex.eid;
        if (!eid) continue;
        const libEx = libById[eid];
        if (!libEx) continue;
        const rowUrl = ex.videoUrl ?? ex.vid;
        if (rowUrl || libEx.videoLink) continue;
        if (eid === 'ex_rvi8ifq11zsmo8nlmzm') continue;
        // gap. try harvest.
        const t = (ex.title || libEx.title || '').trim().toLowerCase();
        const url = top(byEid.get(eid)) || top(byTitle.get(t));
        if (!url) continue;
        // Patch — write on the correct shape (new-shape uses videoUrl, old-shape uses vid).
        const onNewShape = 'exerciseId' in ex || 'sets' in ex || 'reps' in ex;
        if (onNewShape) ex.videoUrl = url; else ex.vid = url;
        touched = true;
        patches++;
        console.log('  ' + (libEx.title || ex.title || eid).padEnd(40), '←', url.slice(0, 70));
      }
    }
    if (touched) planPatches.set(p.id, { ...p.data, days: newDays });
  }

  console.log('\\n' + patches + ' rows patched across ' + planPatches.size + ' plans.');
  if (!APPLY) { console.log('(dry-run — re-run with `apply` to write)'); return; }
  for (const [planId, newData] of planPatches.entries()) {
    const { error } = await s.from('plans').update({ data: newData, updated_at: new Date().toISOString() }).eq('id', planId);
    if (error) { console.error('FAIL ' + planId + ':', error.message); continue; }
    console.log('✓ ' + planId);
  }
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
