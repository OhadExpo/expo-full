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

  const lifts = [...byLift.values()].map(({ title, idxs }) => {
    // longest unbroken run of consecutive block indices, and the run ending at
    // the LATEST block the lift was in.
    let longest = 1, cur = 1;
    for (let j = 1; j < idxs.length; j++) {
      cur = (idxs[j] === idxs[j - 1] + 1) ? cur + 1 : 1;
      if (cur > longest) longest = cur;
    }
    // currentRun: unbroken run counting back from the lift's most-recent block —
    // only "current" if that most-recent block IS the latest block overall.
    let currentRun = 0;
    if (idxs[idxs.length - 1] === totalBlocks - 1) {
      currentRun = 1;
      for (let j = idxs.length - 1; j > 0; j--) {
        if (idxs[j] === idxs[j - 1] + 1) currentRun++; else break;
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
