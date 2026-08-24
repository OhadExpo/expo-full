// Read-only cue-coverage census for the exercise library. Feeds the cue
// authoring plan with real numbers instead of estimates.
const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');

const has = (v) => !!(v && String(v).trim());

(async () => {
  const { error: authErr } = await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  if (authErr) { console.log('AUTH FAIL', authErr.message); process.exit(1); }
  const { data, error } = await s.from('store').select('value').eq('key', 'expo-exercises').single();
  if (error) { console.log('READ FAIL', error.message); process.exit(1); }
  const lib = data.value || [];
  const n = lib.length;

  let withCues = 0, withNotes = 0, withEither = 0, withVideo = 0, withCat = 0;
  const catCount = {}, patCount = {};
  const phaseShaped = [];
  for (const e of lib) {
    const c = e.cues, nt = e.notes;
    if (has(c)) withCues++;
    if (has(nt)) withNotes++;
    if (has(c) || has(nt)) withEither++;
    if (has(e.videoLink)) withVideo++;
    if (has(e.category)) { withCat++; catCount[e.category] = (catCount[e.category] || 0) + 1; }
    if (has(e.movementPattern)) patCount[e.movementPattern] = (patCount[e.movementPattern] || 0) + 1;
    // Ohad's cue format is PHASE-structured (setup / execution / finish style
    // headers). Count how many existing cue blocks already look like that.
    // The LOCKED format uses exactly two Hebrew phase labels (STYLE_GUIDE.md).
    if (has(c) && /(\u05e0\u05e7\u05d5\u05d3\u05ea \u05d4\u05ea\u05d7\u05dc\u05d4:|\u05e0\u05e7\u05d5\u05d3\u05ea \u05d0\u05de\u05e6\u05e2:)/.test(String(c))) phaseShaped.push(e.title || e.t);
  }

  // Style-guide conformance on the cues that DO exist.
  let latinInCue = 0, legacyPhase = 0, trailingDot = 0;
  for (const e of lib) {
    const c = String(e.cues || '');
    if (!has(c)) continue;
    if (/[A-Za-z]/.test(c)) latinInCue++;
    if (/(\u05d4\u05e8\u05e4\u05d9\u05d9\u05d4 \u05de\u05dc\u05d0\u05d4:|\u05d1\u05e9\u05d9\u05d0 \u05d4\u05db\u05d9\u05d5\u05d5\u05e5:|\u05db\u05d9\u05d5\u05d5\u05e5 \u05de\u05dc\u05d0:|\u05d1\u05e9\u05d9\u05d0 \u05d4\u05d2\u05d5\u05d1\u05d4:)/.test(c)) legacyPhase++;
    if (/\.\s*(\n|$)/.test(c)) trailingDot++;
  }
  const pct = (x) => Math.round((x / Math.max(1, n)) * 100);
  console.log(JSON.stringify({
    total: n,
    withCues, withCuesPct: pct(withCues),
    withNotes, withNotesPct: pct(withNotes),
    withEither, withEitherPct: pct(withEither),
    withVideo, withVideoPct: pct(withVideo),
    withCategory: withCat,
    phaseShapedCues: phaseShaped.length,
    cuesContainingLatin: latinInCue,
    cuesWithLegacyPhaseLabels: legacyPhase,
    cuesWithTrailingPeriods: trailingDot,
  }, null, 1));

  // Where the gap is, by category — that is the order to author in.
  const gapByCat = {};
  for (const e of lib) {
    const cat = has(e.category) ? e.category : '(uncategorised)';
    gapByCat[cat] = gapByCat[cat] || { total: 0, missing: 0 };
    gapByCat[cat].total++;
    if (!has(e.cues) && !has(e.notes)) gapByCat[cat].missing++;
  }
  const rows = Object.entries(gapByCat).sort((a, b) => b[1].missing - a[1].missing);
  console.log('\nCUE GAP BY CATEGORY (missing / total)');
  for (const [cat, v] of rows) console.log(`  ${String(cat).padEnd(22)} ${String(v.missing).padStart(5)} / ${String(v.total).padStart(5)}`);

  console.log('\nSAMPLE of 3 existing cue blocks:');
  let shown = 0;
  for (const e of lib) {
    if (shown >= 3) break;
    if (!has(e.cues)) continue;
    console.log(`--- ${e.title || e.t}\n${String(e.cues).slice(0, 320)}`);
    shown++;
  }
})();
