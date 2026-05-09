// Discovery pass for Block #8 enrichment.
// For each Block #8 exercise that's missing videoLink and/or cues, scan:
//   1. The exercise library — second-pass search by token containment
//   2. Every plan in the system — for matching titles where another
//      trainee's plan has ex.videoUrl filled OR ex.notes prefilled
//
// Output: per-exercise candidate report. Nothing is written.

const { createClient } = require('@supabase/supabase-js');
const sb = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');

const norm = (s) => String(s || '')
  .toLowerCase()
  .replace(/[–—]/g, '-')
  .replace(/\bpro[-\/]ret\b/gi, 'protraction retraction')
  .replace(/[^\w\s-+&()/]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();
const SYN = { lying: 'laying' };
const tok = (s) => norm(s).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).map(t => SYN[t] || t);
const tokenSetKey = (s) => [...new Set(tok(s))].sort().join(' ');
const jaccard = (a, b) => { const A = new Set(a), B = new Set(b); if (!A.size || !B.size) return 0; let i = 0; for (const x of A) if (B.has(x)) i++; return i / (A.size + B.size - i); };

(async () => {
  await sb.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });

  const { data: libRow } = await sb.from('store').select('value').eq('key', 'expo-exercises').maybeSingle();
  const lib = libRow?.value || [];
  const { data: traineesRow } = await sb.from('store').select('value').eq('key', 'expo-trainees').maybeSingle();
  const trainees = traineesRow?.value || [];
  const traineeName = (id) => (trainees.find(t => t.id === id)?.name) || id;

  const { data: planRows } = await sb.from('plans').select('id,name,trainee_id,data,active');
  console.log(`scope: ${planRows.length} plans across ${new Set(planRows.map(p => p.trainee_id)).size} trainees · library = ${lib.length}`);

  // The Block #8 plan we just inserted.
  const b8 = planRows.find(p => p.id === 'pl_3a55ef962099rwed');
  if (!b8) { console.error('Block #8 not found'); process.exit(1); }

  // For each Block #8 exercise, look at:
  //   - library entry (videoLink + cues)
  //   - cross-plan exercise rows where title (token-set) matches AND another
  //     plan has either an ex.videoUrl override or ex.notes prefilled.
  const allExRows = [];
  for (const p of planRows) {
    if (p.id === b8.id) continue; // skip self
    const days = p.data?.days || [];
    for (const d of days) {
      for (const e of d.exercises || []) {
        if (!e.title) continue;
        allExRows.push({
          planId: p.id,
          planName: p.name,
          traineeId: p.trainee_id,
          dayName: d.name,
          title: e.title,
          videoUrl: e.videoUrl,           // per-plan override (3-state: undefined / '' / url)
          exerciseId: e.exerciseId,
          notes: e.notes,
          cues: e.cues,                   // some shapes use ex.cues directly
        });
      }
    }
  }

  console.log(`\ncross-plan exercise rows: ${allExRows.length}`);

  // Iterate B8's exercises.
  for (const d of b8.data.days) {
    console.log(`\n══════ ${d.name} ══════`);
    for (const ex of d.exercises) {
      const wantKey = tokenSetKey(ex.title);
      const wantTok = tok(ex.title);

      // Library lookup — re-derive by token-set.
      let libHit = lib.find(L => tokenSetKey(L.title) === wantKey);
      if (!libHit) libHit = lib.find(L => norm(L.title) === norm(ex.title));
      const libVideo = libHit?.videoLink || '';
      const libCues = libHit?.cues || '';

      const haveVideo = !!libVideo;
      const haveCues = !!libCues;
      if (haveVideo && haveCues) continue; // nothing missing

      console.log(`\n• ${ex.title}`);
      console.log(`    library: ${libHit ? libHit.title + ' (' + libHit.id + ')' : '— not linked —'}`);
      console.log(`    libVideoLink=${haveVideo ? 'YES (already set)' : 'MISSING'}  libCues=${haveCues ? 'YES' : 'MISSING'}`);

      // Cross-plan exact (token-set) hits with a per-plan videoUrl OR notes filled.
      const exactHits = allExRows.filter(r => tokenSetKey(r.title) === wantKey);
      const withVideo = exactHits.filter(r => typeof r.videoUrl === 'string' && r.videoUrl.length > 0);
      const withNotes = exactHits.filter(r => typeof r.notes === 'string' && r.notes.trim().length > 0);

      if (exactHits.length) {
        console.log(`    cross-plan exact-title rows: ${exactHits.length}  · with videoUrl override: ${withVideo.length}  · with notes: ${withNotes.length}`);
      }
      for (const r of withVideo.slice(0, 5)) {
        console.log(`      [URL] ${traineeName(r.traineeId)} / ${r.planName} / ${r.dayName} → ${r.videoUrl}`);
      }
      for (const r of withNotes.slice(0, 5)) {
        console.log(`      [NOTE] ${traineeName(r.traineeId)} / ${r.planName} / ${r.dayName} → ${JSON.stringify(r.notes).slice(0, 140)}`);
      }

      // If library link is missing entirely, also propose close fuzzy.
      if (!libHit) {
        const ranked = lib.map(L => ({ L, s: jaccard(wantTok, tok(L.title)) }))
          .sort((a, b) => b.s - a.s)
          .slice(0, 4);
        console.log(`    library fuzzy candidates:`);
        for (const r of ranked) {
          const tags = [];
          if (r.L.videoLink) tags.push('video');
          if (r.L.cues) tags.push('cues');
          console.log(`      ${r.s.toFixed(2)}  ${r.L.title}${tags.length ? '  (' + tags.join('+') + ')' : ''}`);
        }
      }
    }
  }
})();
