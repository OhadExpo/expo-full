// exerciseContinuity.js — how long has each main lift RUN across the athlete's
// blocks? A read the coach can't get anywhere else: EXPO already knows every
// block's exercises, so it can show "BB Back Squat: 6 blocks straight" or "the
// main squat pattern changed every block (never owned one)" — a mirror on the
// coach's OWN programming continuity.
//
// DELIBERATELY neutral: it reports the CONTINUITY (runs + churn), it does NOT
// prescribe rotate-vs-keep — that's a goal call (specificity for strength vs
// novel stimulus for hypertrophy) the coach makes. It just surfaces the data.
// Pure + honest; GREENLIGHT-GATED (no UI until Ohad approves).

const norm = (t) => String(t || '').trim().toLowerCase().replace(/\s+/g, ' ');

// blocks: ORDERED oldest→newest, each { num, mains: [title,...] } (the block's
// main lifts). Returns per-lift continuity + a couple of headline reads.
//   { lifts: [{ title, blocks:[nums], count, currentRun, longestRun, static }],
//     staticNow: [...],   // running ≥ STATIC_RUN blocks unbroken up to the latest
//     totalBlocks }
export function exerciseContinuity(blocks, opts = {}) {
  const STATIC_RUN = opts.staticRun || 4; // ≥4 blocks unbroken = a "static" run
  const list = (blocks || []).filter((b) => b && Array.isArray(b.mains));
  const totalBlocks = list.length;
  if (totalBlocks === 0) return { lifts: [], staticNow: [], totalBlocks: 0 };

  // Map each normalized lift → the ordered list of block indices it appears in.
  const byLift = new Map(); // key -> { title, idxs:Set }
  list.forEach((b, i) => {
    const seen = new Set();
    for (const m of b.mains) {
      const k = norm(m);
      if (!k || seen.has(k)) continue; // one credit per block
      seen.add(k);
      if (!byLift.has(k)) byLift.set(k, { title: m, idxs: [] });
      byLift.get(k).idxs.push(i);
    }
  });

    // Two appearances are "in a row" only if their blocks are adjacent in the
    // list AND the block NUMBERS are consecutive. The list can have blocks
    // dropped upstream (near-empty/note-only blocks are filtered before this
    // engine sees them), so pure array-index adjacency would collapse a real
    // gap — e.g. blocks 1,2,4,5,6 (3 dropped) would read as 5-in-a-row and earn
    // a false "static, rotate it" flag. Using the num gap breaks the run at the
    // missing block. When either num is unknown we fall back to array-adjacency
    // (never penalize the athlete for un-numbered blocks — under-report is the
    // safe direction here, a false streak is not).
  const adjacent = (a, b) => {
    if (a !== b - 1) return false; // not even next-to-each-other in the list
    const na = list[a].num, nb = list[b].num;
    return (Number.isFinite(na) && Number.isFinite(nb)) ? (nb - na === 1) : true;
  };

  const lifts = [...byLift.values()].map(({ title, idxs }) => {
    // longest unbroken run, and the run ending at the LATEST block the lift was in.
    let longest = 1, cur = 1;
    for (let j = 1; j < idxs.length; j++) {
      cur = adjacent(idxs[j - 1], idxs[j]) ? cur + 1 : 1;
      if (cur > longest) longest = cur;
    }
    // currentRun: unbroken run counting back from the lift's most-recent block —
    // only "current" if that most-recent block IS the latest block overall.
    let currentRun = 0;
    if (idxs[idxs.length - 1] === totalBlocks - 1) {
      currentRun = 1;
      for (let j = idxs.length - 1; j > 0; j--) {
        if (adjacent(idxs[j - 1], idxs[j])) currentRun++; else break;
      }
    }
    return {
      title,
      blocks: idxs.map((i) => list[i].num ?? i + 1),
      count: idxs.length,
      currentRun,
      longestRun: longest,
      static: currentRun >= STATIC_RUN,
    };
  }).sort((a, b) => b.currentRun - a.currentRun || b.count - a.count);

  return {
    lifts,
    staticNow: lifts.filter((l) => l.static).map((l) => ({ title: l.title, run: l.currentRun })),
    totalBlocks,
  };
}
