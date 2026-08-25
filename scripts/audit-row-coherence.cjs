// Every exercise row in every block, every day: does the NOTE match the URL,
// and do both match the EXERCISE NAME?
//
// A row is a little bundle of four things — title, exerciseId, videoUrl, notes —
// and they can drift apart silently. A copy that carried the wrong id, a swap
// that updated the title but not the cues, a video pasted onto the wrong row:
// the athlete then reads cues for one exercise while watching another.
//
// The check works by REVERSE-LOOKUP rather than by judging text. The library is
// the dictionary: each entry has a title, a videoLink and cues. So for a row we
// can ask a precise question — does this row's video belong to a DIFFERENT
// library exercise than its title does? Same for its notes. That is a fact, not
// an opinion, and it is what makes this checkable across 4,000 rows.
//
// Usage: node scripts/audit-row-coherence.cjs [--json out.json]
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
const jsonIdx = process.argv.indexOf('--json');
const JSON_OUT = jsonIdx > -1 ? process.argv[jsonIdx + 1] : null;

const clean = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
const norm = (t) => clean(t).toLowerCase().replace(/[^a-z0-9֐-׿]+/g, ' ').trim();
// Singular/plural and a few house synonyms are the SAME exercise:
// "Elevated-Heel"/"Elevated-Heels", "Lying"/"Laying", "Facepull"/"Face-Pull".
// Without this the audit reports naming style as a data defect.
const SYN = { lying: 'laying', seated: 'sitting', bicep: 'biceps', tricep: 'triceps' };
const canon = (t) => norm(t).split(' ').filter(Boolean)
  .map((w) => SYN[w] || w)
  .map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w))
  .map((w) => w.slice(0, 5)).sort().join('|');
const ytId = (u) => { const m = String(u).match(/(?:youtu\.be\/|\/shorts\/|[?&]v=|\/embed\/)([A-Za-z0-9_-]{11})/); return m ? m[1] : null; };
const vidKey = (u) => ytId(u) || clean(u).replace(/[?&]+$/, '');
const cueKey = (c) => norm(c).slice(0, 220);   // cues are long; a prefix is identity enough
// How related are two exercise names? "Walking DB Lunge" vs "DB Walking Lunge
// (w Straps)" is the same movement written differently; "Wide-Grip Deficit
// Push-Up" vs "Single Leg Hip Thrust" is a genuine mix-up. Token overlap
// separates the two, so phrasing is not reported as a data defect.
const toks = (t) => new Set(norm(t).split(' ').filter((w) => w.length > 2).map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w).slice(0, 5)));
const overlap = (a, b) => {
  const A = toks(a), B = toks(b);
  if (!A.size || !B.size) return 0;
  let hit = 0; for (const x of A) if (B.has(x)) hit++;
  return hit / Math.min(A.size, B.size);
};
const RELATED = 0.5;   // at or above this they are the same movement, differently written

(async () => {
  await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  const { data: libRow } = await s.from('store').select('value').eq('key', 'expo-exercises').single();
  const lib = libRow.value || [];
  const byId = new Map(lib.map((e) => [e.id, e]));
  const byCanonTitle = new Map();
  for (const e of lib) { const k = canon(e.title); if (k && !byCanonTitle.has(k)) byCanonTitle.set(k, e); }

  // Reverse dictionaries: which exercise does this video / this cue text belong to?
  // A clip or a cue block can legitimately belong to SEVERAL entries — the same
  // exercise written two ways ("BB DL" / "BB Deadlift") shares both. Only a
  // video or cue owned by exactly ONE exercise identifies that exercise, so
  // anything shared is ambiguous and must not be called a mismatch.
  const videoOwners = new Map(), cueOwners = new Map();
  for (const e of lib) {
    if (e.videoLink) { const k = vidKey(e.videoLink); if (k) (videoOwners.get(k) || videoOwners.set(k, []).get(k)).push(e); }
    if (clean(e.cues)) { const k = cueKey(e.cues); if (k) (cueOwners.get(k) || cueOwners.set(k, []).get(k)).push(e); }
  }
  const soleOwner = (map, k) => { const a = map.get(k); return a && a.length === 1 ? a[0] : null; };
  const ownerOfVideo = { get: (k) => soleOwner(videoOwners, k) };
  const ownerOfCue = { get: (k) => soleOwner(cueOwners, k) };
  const sharedVideos = [...videoOwners.values()].filter((a) => a.length > 1).length;
  const sharedCues = [...cueOwners.values()].filter((a) => a.length > 1).length;

  const { data: tr } = await s.from('store').select('value').eq('key', 'expo-trainees').single();
  const names = new Map((tr.value || []).map((t) => [t.id, t.name]));
  const { data: plans } = await s.from('plans').select('id,name,trainee_id,data');

  const F = { titleVsId: [], videoBelongsElsewhere: [], cueBelongsElsewhere: [], videoVsCueDisagree: [], idNotInLibrary: [], noIdentity: [] };
  let rows = 0, checkedVideo = 0, checkedCue = 0;

  for (const p of plans || []) {
    const who = names.get(String(p.trainee_id || '').replace(/__\d+$/, '')) || p.trainee_id;
    for (const d of p.data?.days || []) {
      const dayName = clean(d.name || d.n);
      for (const e of d.exercises || d.ex || []) {
        rows++;
        const title = clean(e.title);
        const eid = clean(e.exerciseId || e.eid);
        const where = `${who} / ${clean(p.name)} / ${dayName} / ${title || '(untitled)'}`;
        const L = eid ? byId.get(eid) : null;

        if (!title && !eid) { F.noIdentity.push(where); continue; }
        if (eid && !L) { F.idNotInLibrary.push(`${where}  eid=${eid}`); }

        // 1) does the row's TITLE match the library entry it points at?
        if (L && title && canon(title) !== canon(L.title)) {
          F.titleVsId.push(`${where}\n      row title : ${title}\n      its eid is: ${L.title}`);
        }

        // The exercise this row is REALLY about: prefer the library entry it
        // points at, else the entry whose title matches.
        const self = L || (title ? byCanonTitle.get(canon(title)) : null);

        // 2) does the VIDEO belong to a different exercise?
        const v = clean(e.videoUrl);
        if (v) {
          checkedVideo++;
          const owner = ownerOfVideo.get(vidKey(v));
          if (owner && self && owner.id !== self.id && canon(owner.title) !== canon(self.title)
              && overlap(owner.title, self.title) < RELATED) {
            F.videoBelongsElsewhere.push(`${where}\n      video is the library clip for: ${owner.title}`);
          }
        }

        // 3) do the NOTES belong to a different exercise?
        const n = clean(e.notes ?? e.n);
        if (n) {
          checkedCue++;
          const owner = ownerOfCue.get(cueKey(n));
          if (owner && self && owner.id !== self.id && canon(owner.title) !== canon(self.title)
              && overlap(owner.title, self.title) < RELATED) {
            F.cueBelongsElsewhere.push(`${where}\n      notes are the library cues for: ${owner.title}`);
          }
        }

        // 4) do the video and the notes point at two DIFFERENT exercises?
        if (v && n) {
          const vo = ownerOfVideo.get(vidKey(v));
          const co = ownerOfCue.get(cueKey(n));
          if (vo && co && vo.id !== co.id && canon(vo.title) !== canon(co.title)
              && overlap(vo.title, co.title) < RELATED) {
            F.videoVsCueDisagree.push(`${where}\n      video: ${vo.title}\n      notes: ${co.title}`);
          }
        }
      }
    }
  }

  console.log(`rows examined: ${rows} (videos ${checkedVideo}, notes ${checkedCue})\n`);
  const order = ['titleVsId', 'videoBelongsElsewhere', 'cueBelongsElsewhere', 'videoVsCueDisagree', 'idNotInLibrary', 'noIdentity'];
  const label = {
    titleVsId: 'row title disagrees with the exercise its id points at',
    videoBelongsElsewhere: 'VIDEO is another exercise\'s clip',
    cueBelongsElsewhere: 'NOTES are another exercise\'s cues',
    videoVsCueDisagree: 'video and notes describe DIFFERENT exercises',
    idNotInLibrary: 'exerciseId is not in the library',
    noIdentity: 'row has neither a title nor an id',
  };
  let total = 0;
  for (const k of order) { total += F[k].length; console.log(`  ${String(F[k].length).padStart(4)}  ${label[k]}`); }
  console.log(`  ${String(total).padStart(4)}  TOTAL`);
  for (const k of order) {
    if (!F[k].length) continue;
    console.log(`\n--- ${label[k]} (${F[k].length}) ---`);
    F[k].slice(0, 10).forEach((x) => console.log('  ' + x));
    if (F[k].length > 10) console.log(`  … and ${F[k].length - 10} more`);
  }
  if (JSON_OUT) { fs.writeFileSync(JSON_OUT, JSON.stringify(F, null, 2)); console.log('\nfull report:', JSON_OUT); }
  process.exit(0);
})();
