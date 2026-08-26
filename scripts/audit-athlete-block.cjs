// Is an athlete's programming complete? Ohad, 2026-08-26, about Amit Gershon:
// "full notes, videos for every exercise."
//
//   node scripts/audit-athlete-block.cjs            → every athlete
//   node scripts/audit-athlete-block.cjs amit       → name match, any language
//
// Reports, per plan and per row: a missing title, a missing video, a missing
// note, and missing sets/reps. Reads only — it changes nothing.
//
// IMPORTANT: a row with no videoUrl is NOT automatically a gap. The portal
// treats videoUrl as three-state (ClientPortal.jsx:252) — undefined means "no
// override, show the library's videoLink for this eid". So the number that
// matters is what the ATHLETE SEES: a row is only a gap when it has no override
// AND its eid resolves to no library video (or has no eid at all).
//
// The first version of this script counted row-level blanks and reported 16
// gaps on an athlete who could see all 24 videos. Counting the wrong thing and
// printing it confidently is worse than not checking.
const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');

const blank = (v) => v == null || String(v).trim() === '';

(async () => {
  await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });

  // Who is Amit?
  const { data: libRow } = await s.from('store').select('value').eq('key', 'expo-exercises').single();
  const LIB = new Map(((libRow && libRow.value) || []).map((e) => [e.id, e]));
  const { data: store } = await s.from('store').select('value').eq('key', 'expo-trainees').single();
  const trainees = (store && store.value) || [];
  // Names are stored as the coach typed them, which for most athletes is
  // HEBREW — "עמית גרשון", not "Amit Gershon". A Latin query therefore matches
  // nothing, and saying so beats printing a clean "0 findings" that reads like
  // a pass. The id is searched too, since ids are Latin.
  const q = (process.argv[2] || '').toLowerCase();
  const hit = (t) => String(t.name || '').toLowerCase().includes(q) || String(t.id || '').toLowerCase().includes(q);
  const amit = q ? trainees.filter(hit) : trainees;
  console.log(`matched ${amit.length} trainee(s)` + (q ? ` for "${q}"` : ' (all)'));
  if (!amit.length) {
    console.log(`  NOTHING MATCHED — this is not a clean bill of health.`);
    console.log(`  Names are mostly Hebrew. Try the Hebrew spelling, an id, or no argument for all.`);
    console.log('  first few on file: ' + trainees.slice(0, 5).map((t) => `${t.name} (${t.id})`).join(' | '));
    return;
  }

  for (const t of amit) {
    const { data: plans } = await s.from('plans').select('id,name,updated_at,data').eq('trainee_id', t.id);
    console.log(`\n=== ${t.name} — ${(plans || []).length} plans ===`);
    for (const p of (plans || []).sort((a, b) => String(a.name).localeCompare(String(b.name)))) {
      const days = (p.data && p.data.days) || [];
      let rows = 0, noTitle = 0, noVideo = 0, noNote = 0, noSets = 0, viaLib = 0;
      const examples = [];
      days.forEach((d, di) => {
        // Both plan shapes: d.exercises[] and the compact d.ex[].
        const list = (d.exercises && d.exercises.length) ? d.exercises : (d.ex || []);
        list.forEach((ex, xi) => {
          rows++;
          const title = ex.title || ex.name || '';
          // videoUrl is 3-state: undefined = inherit from library, '' = deliberately none.
          const vid = ex.videoUrl != null ? ex.videoUrl : ex.video;
          const note = ex.notes != null ? ex.notes : ex.n;
          const sets = ex.sets != null ? ex.sets : ex.s;
          const reps = ex.reps != null ? ex.reps : ex.r;
          if (blank(title)) { noTitle++; }
          if (blank(vid)) {
            // No override — what would the portal show?
            const eid = ex.exerciseId || ex.eid;
            const le = eid ? LIB.get(eid) : null;
            const libUrl = le && (le.videoLink || le.video);
            if (!blank(libUrl)) viaLib++;
            else { noVideo++; if (examples.length < 6) examples.push(`day${di + 1}#${xi + 1} "${title}" NO VIDEO ANYWHERE${eid ? '' : ' (row has no exercise id)'}`); }
          }
          if (blank(note)) { noNote++; if (examples.length < 6) examples.push(`day${di + 1}#${xi + 1} "${title}" NO NOTE`); }
          if (blank(sets) || blank(reps)) { noSets++; }
        });
      });
      const flag = (noVideo || noNote || noTitle || noSets) ? 'X' : 'ok';
      console.log(`  [${flag}] ${p.name} — ${days.length} days, ${rows} rows | athlete sees NO video ${noVideo} (${viaLib} via library) | no note ${noNote} | no title ${noTitle} | no sets/reps ${noSets}`);
      examples.forEach((e) => console.log('        - ' + e));
    }
  }
})();
