// Library entries whose CUES were copied from an unrelated exercise.
//
// The cues are Hebrew and the titles English, so this does not try to read them.
// It uses an objective signal instead: the SAME cue text appearing on two
// exercises whose names have nothing in common. Two variants of one movement
// sharing cues is fine and expected. "Seated Arnold DB OHP" sharing cues with
// "BB Close-Grip Bench Press" is a copy-paste error — and the text is
// bench-press coaching, so one of them is telling the athlete the wrong thing.
//
// Same reasoning for videoLink: one clip on two unrelated exercises.
//
// Usage: node scripts/audit-library-cue-coherence.cjs [--json out.json]
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
const jsonIdx = process.argv.indexOf('--json');
const JSON_OUT = jsonIdx > -1 ? process.argv[jsonIdx + 1] : null;

const clean = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
// TITLES are English, so a-z0-9 is right for them.
const norm = (t) => clean(t).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
// CUES are Hebrew. Stripping non-Latin collapsed every Hebrew cue block to just
// its digits — "2", "90", "45" — and made 31 unrelated exercises look like they
// shared one cue block. Keep the Hebrew range.
const normCue = (t) => clean(t).toLowerCase().replace(/[^a-z0-9֐-׿]+/g, ' ').trim();
// Some library TITLES are Hebrew too. Using the Latin-only norm here scored
// every Hebrew-vs-Hebrew pair at 0 overlap and reported seven related mobility
// drills as unrelated.
const toks = (t) => new Set(normCue(t).split(' ').filter((w) => w.length > 2)
  .map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w)).map((w) => w.slice(0, 5)));
const overlap = (a, b) => {
  const A = toks(a), B = toks(b);
  if (!A.size || !B.size) return 0;
  let hit = 0; for (const x of A) if (B.has(x)) hit++;
  return hit / Math.min(A.size, B.size);
};
const ytId = (u) => { const m = String(u).match(/(?:youtu\.be\/|\/shorts\/|[?&]v=|\/embed\/)([A-Za-z0-9_-]{11})/); return m ? m[1] : null; };

(async () => {
  await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  const { data: row } = await s.from('store').select('value').eq('key', 'expo-exercises').single();
  const lib = row.value || [];

  const group = (keyFn, valFn) => {
    const m = new Map();
    for (const e of lib) { const k = keyFn(e); if (!k) continue; if (!m.has(k)) m.set(k, []); m.get(k).push(e); }
    return [...m.entries()].filter(([, a]) => a.length > 1);
  };

  const cueGroups = group((e) => (clean(e.cues) ? normCue(e.cues).slice(0, 200) : ''));
  const vidGroups = group((e) => (e.videoLink ? (ytId(e.videoLink) || clean(e.videoLink)) : ''));

  // Within a group, flag the pairs whose NAMES are unrelated.
  const suspect = (groups, what) => {
    const out = [];
    for (const [, arr] of groups) {
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          const o = overlap(arr[i].title, arr[j].title);
          if (o < 0.25) out.push({ what, a: arr[i].title, b: arr[j].title, ida: arr[i].id, idb: arr[j].id, overlap: +o.toFixed(2), n: arr.length });
        }
      }
    }
    return out;
  };

  const cueBad = suspect(cueGroups, 'cues');
  const vidBad = suspect(vidGroups, 'video');

  console.log(`library: ${lib.length} exercises`);
  console.log(`  cue blocks shared by 2+ entries : ${cueGroups.length}  -> unrelated-name pairs: ${cueBad.length}`);
  console.log(`  clips shared by 2+ entries      : ${vidGroups.length}  -> unrelated-name pairs: ${vidBad.length}`);

  // Report by GROUP, not by pair: one cue block shared across 40 exercises is
  // ONE problem, not 780. Pairwise counting made it look like hundreds.
  const byGroup = (groups, kind) => {
    const out = [];
    for (const [key, arr] of groups) {
      let unrelated = 0;
      for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) if (overlap(arr[i].title, arr[j].title) < 0.25) unrelated++;
      if (!unrelated) continue;
      out.push({ kind, n: arr.length, sample: arr.slice(0, 4).map((e) => e.title), key: String(key).slice(0, 70) });
    }
    return out.sort((a, b) => b.n - a.n);
  };
  const cueG = byGroup(cueGroups, 'cues'), vidG = byGroup(vidGroups, 'video');
  console.log(`
=== shared CUE blocks spanning unrelated exercises: ${cueG.length} groups ===`);
  cueG.slice(0, 8).forEach((g) => {
    console.log(`  ${String(g.n).padStart(4)} exercises share one cue block`);
    console.log(`       text: ${g.key}`);
    console.log(`       e.g.: ${g.sample.map((t) => String(t).slice(0, 28)).join(' | ')}`);
  });
  console.log(`
=== shared CLIPS spanning unrelated exercises: ${vidG.length} groups ===`);
  vidG.slice(0, 8).forEach((g) => console.log(`  ${String(g.n).padStart(4)}x  ${g.sample.map((t) => String(t).slice(0, 26)).join(' | ')}`));

  const show = (list, label) => {
    if (!list.length) return;
    console.log(`\n--- ${label} (${list.length}) ---`);
    list.sort((x, y) => x.overlap - y.overlap).slice(0, 25).forEach((x) =>
      console.log(`  ${String(x.a).slice(0, 38).padEnd(39)} <-> ${String(x.b).slice(0, 38)}`));
    if (list.length > 25) console.log(`  … and ${list.length - 25} more`);
  };


  if (JSON_OUT) { fs.writeFileSync(JSON_OUT, JSON.stringify({ cueBad, vidBad }, null, 2)); console.log('\nfull report:', JSON_OUT); }
  process.exit(0);
})();
