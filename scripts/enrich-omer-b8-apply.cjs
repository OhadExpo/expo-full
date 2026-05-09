// Enrich Omer's Block #8 with videoUrl overrides + Hebrew notes pulled from
// three sources, in priority order:
//
//   1. Source xlsx ("omer Block #8.xlsx") — Ohad-curated cell hyperlinks per
//      exercise row. Authoritative for this block.
//   2. Other trainees' plans — same-title exercises where Ohad already filled
//      ex.videoUrl OR ex.notes (Hebrew cues). Used only for exercises that
//      have no source-xlsx hyperlink AND no library-side videoLink.
//   3. (Cues only) Cross-plan ex.notes. Library cues are off-limits — applied
//      per-plan only.
//
// Library entries are NEVER modified (per the exercise-library off-limits
// rule). All enrichment lands as per-plan ex.videoUrl + ex.notes overrides
// on plan_3a55ef962099rwed.
//
// Run:
//   node scripts/enrich-omer-b8-apply.cjs        # dry-run, prints diff
//   node scripts/enrich-omer-b8-apply.cjs apply  # writes the plan row

const path = require('path');
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

const SUPA_URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const SUPA_KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
const PLAN_ID = 'pl_3a55ef962099rwed';
const APPLY = process.argv[2] === 'apply';

// -------- step 1: extract per-exercise hyperlinks from the source xlsx -----

function readSourceXlsxLinks() {
  const wb = XLSX.readFile(path.join(__dirname, '..', 'omer Block #8.xlsx'));
  const ws = wb.Sheets['Block #8'];
  const range = XLSX.utils.decode_range(ws['!ref']);
  // Each day's table starts with a "# | Day X | | Vid | Tempo | ..." header
  // row, then rows of "<n> | <title> | | <Vid n> | ...". The hyperlink we
  // want lives in the column-D ("Vid") cell of the *exercise* row.
  // We collect by walking rows: when col-A is a small integer 1..N AND col-B
  // is a non-empty title, the row is an exercise. The hyperlink (if any) is
  // in column D of that row.
  const result = []; // [{ day: 'A'|'B'|'C', idx: 1, title, url }]
  let currentDay = null;
  for (let r = range.s.r; r <= range.e.r; r++) {
    const aCell = ws[XLSX.utils.encode_cell({ r, c: 0 })];
    const bCell = ws[XLSX.utils.encode_cell({ r, c: 1 })];
    const dCell = ws[XLSX.utils.encode_cell({ r, c: 3 })];
    const aVal = String(aCell?.v ?? '').trim();
    const bVal = String(bCell?.v ?? '').trim();
    if (/^Day [ABC]$/.test(bVal)) {
      currentDay = bVal.slice(-1);
      continue;
    }
    if (currentDay && /^\d+$/.test(aVal) && bVal) {
      const url = dCell?.l?.Target || '';
      result.push({ day: currentDay, idx: parseInt(aVal, 10), title: bVal, url });
    }
  }
  return result;
}

// -------- step 2: pull cross-plan title → {url, notes} for fallback --------

const norm = (s) => String(s || '').toLowerCase()
  .replace(/[–—]/g, '-')
  .replace(/\bpro[-\/]ret\b/gi, 'protraction retraction')
  .replace(/[^\w\s-+&()/]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();
const SYN = { lying: 'laying' };
const tok = (s) => norm(s).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).map(t => SYN[t] || t);
const tokenSetKey = (s) => [...new Set(tok(s))].sort().join(' ');

(async () => {
  const sb = createClient(SUPA_URL, SUPA_KEY);
  const { error: aErr } = await sb.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  if (aErr) { console.error('auth failed:', aErr); process.exit(1); }

  const { data: libRow } = await sb.from('store').select('value').eq('key', 'expo-exercises').maybeSingle();
  const lib = libRow?.value || [];
  const libByKey = new Map(lib.map(L => [tokenSetKey(L.title), L]));

  const { data: planRows } = await sb.from('plans').select('id,name,trainee_id,data');
  const targetPlan = planRows.find(p => p.id === PLAN_ID);
  if (!targetPlan) { console.error(`plan ${PLAN_ID} not found`); process.exit(1); }

  // Cross-plan map: tokenSetKey → { urls: Map<url, count>, notes: [{plan, text}] }
  const crossplan = new Map();
  for (const p of planRows) {
    if (p.id === PLAN_ID) continue;
    for (const d of p.data?.days || []) {
      for (const e of d.exercises || []) {
        if (!e.title) continue;
        const k = tokenSetKey(e.title);
        if (!crossplan.has(k)) crossplan.set(k, { urls: new Map(), notes: [] });
        const slot = crossplan.get(k);
        if (typeof e.videoUrl === 'string' && e.videoUrl.length > 0) {
          slot.urls.set(e.videoUrl, (slot.urls.get(e.videoUrl) || 0) + 1);
        }
        if (typeof e.notes === 'string' && e.notes.trim().length > 0) {
          slot.notes.push({ plan: p.name, traineeId: p.trainee_id, text: e.notes.trim() });
        }
      }
    }
  }

  const sourceLinks = readSourceXlsxLinks();
  console.log(`source xlsx exercises: ${sourceLinks.length}, with hyperlinks: ${sourceLinks.filter(s => s.url).length}`);

  // Walk Block #8 day-by-day and decide what to apply.
  const plan = targetPlan;
  const proposed = []; // [{path, before, after, source}]
  const newDays = plan.data.days.map(d => {
    const dayLetter = d.name.replace('Day ', '');
    return {
      ...d,
      exercises: d.exercises.map((ex, idx) => {
        const src = sourceLinks.find(s => s.day === dayLetter && s.idx === idx + 1);
        const k = tokenSetKey(ex.title);
        const lib = libByKey.get(k);
        const libVideo = lib?.videoLink || '';
        const libCues = lib?.cues || '';

        let newVideoUrl = ex.videoUrl;     // keep current state by default
        let newNotes = ex.notes;
        let videoSource = null;
        let notesSource = null;

        // ---- video URL decision ----
        // Source xlsx is highest priority — it is what Ohad just gave us.
        // We override even when library has a (potentially stale) link.
        if (src?.url) {
          if (newVideoUrl !== src.url) {
            newVideoUrl = src.url;
            videoSource = `source xlsx (Day ${dayLetter} #${idx + 1})`;
          }
        } else if (!libVideo) {
          // No library link; try cross-plan consensus (highest count wins).
          const slot = crossplan.get(k);
          if (slot && slot.urls.size > 0) {
            const [topUrl] = [...slot.urls.entries()].sort((a, b) => b[1] - a[1])[0];
            newVideoUrl = topUrl;
            videoSource = `cross-plan consensus (${[...slot.urls.values()].reduce((a, b) => a + b, 0)} hits)`;
          }
        }

        // ---- notes decision ----
        // Library cues auto-prefill at render time, so don't override when
        // library already has cues. When it doesn't, prefer the cross-plan
        // notes block (most-frequent text wins).
        if (!libCues && (typeof newNotes !== 'string' || newNotes.trim() === '')) {
          const slot = crossplan.get(k);
          if (slot && slot.notes.length > 0) {
            const counts = new Map();
            for (const n of slot.notes) counts.set(n.text, (counts.get(n.text) || 0) + 1);
            const [topText] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
            newNotes = topText;
            notesSource = `cross-plan (${slot.notes.length} hits)`;
          }
        }

        if (videoSource || notesSource) {
          proposed.push({
            day: d.name,
            idx: idx + 1,
            title: ex.title,
            beforeUrl: ex.videoUrl,
            afterUrl: newVideoUrl,
            videoSource,
            beforeNotes: ex.notes,
            afterNotes: newNotes,
            notesSource,
          });
        }

        return { ...ex, videoUrl: newVideoUrl, notes: newNotes };
      }),
    };
  });

  console.log(`\nproposed enrichments: ${proposed.length}`);
  for (const p of proposed) {
    console.log(`\n• ${p.day} #${p.idx}  ${p.title}`);
    if (p.videoSource) {
      console.log(`    video [${p.videoSource}]`);
      console.log(`      before: ${p.beforeUrl ?? '(unset)'}`);
      console.log(`      after:  ${p.afterUrl}`);
    }
    if (p.notesSource) {
      console.log(`    notes [${p.notesSource}]`);
      const a = (p.afterNotes || '').slice(0, 140);
      console.log(`      before: ${p.beforeNotes ? '(set)' : '(empty)'}`);
      console.log(`      after:  ${a}${p.afterNotes && p.afterNotes.length > 140 ? '…' : ''}`);
    }
  }

  if (!APPLY) {
    console.log('\n[DRY RUN] re-run with `apply` to write.');
    process.exit(0);
  }

  const newData = { ...plan.data, days: newDays };
  const { error: uErr } = await sb.from('plans').update({
    data: newData,
    updated_at: new Date().toISOString(),
  }).eq('id', PLAN_ID);
  if (uErr) { console.error('update failed:', uErr); process.exit(1); }
  console.log(`\n✓ updated plan ${PLAN_ID} with ${proposed.length} enrichments.`);
})();
