// Periodization-balance engine — a pure read over blockHistory() output.
//
// The coach-need it serves: managing ~20 athletes, you lose the long view of any
// one person's PERIODIZATION. Have they cycled the training qualities, or quietly
// camped in one? Which quality hasn't been touched in months? The block-history
// strip shows the sequence; this quantifies it into one glanceable read.
//
// SCOPE (deliberate): this OBSERVES the pattern — distribution, the current run,
// the longest camp, which qualities are absent from the recent window. It does
// NOT prescribe loads or auto-progress weight (that's the coach's value-add). It
// states facts a coach can act on, the same phase-level altitude nextBlockText
// already works at. Novel: no commercial coaching tool auto-reads an athlete's
// periodization balance from their logged block history.
//
// Pure + fixture-tested (scripts/verify-periodization-balance.mjs). Engine only —
// UI awaits Ohad's greenlight, same pattern as the Velocity-Profile 1RM engine.

const QUALITIES = ['power', 'strength', 'hypertrophy', 'endurance'];
// Human phrasing for the read (never leaks the internal lowercase token).
const LABEL = { power: 'power', strength: 'strength', hypertrophy: 'hypertrophy', endurance: 'endurance' };

// blocks = blockHistory() output (oldest→newest), each { num, name, character, ... }.
// opts.recentN = size of the "recent window" (default 6 blocks ≈ a training year).
// Returns { enough:false } when there's too little history to say anything honest.
export function periodizationBalance(blocks, opts = {}) {
  // Guard recentN: 0/undefined -> default 6; a negative would flip slice(-n) into
  // "all but the first n" and print "last -2 blocks" (review finding #7).
  const recentN = Math.max(1, Math.floor(opts.recentN) || 6);
  const valid = (Array.isArray(blocks) ? blocks : []).filter((b) => b && QUALITIES.includes(b.character));
  if (valid.length < 4) return { enough: false, n: valid.length };

  const total = valid.length;
  const counts = Object.fromEntries(QUALITIES.map((q) => [q, valid.filter((b) => b.character === q).length]));
  const pct = Object.fromEntries(QUALITIES.map((q) => [q, Math.round((counts[q] / total) * 100)]));
  const qualitiesUsed = QUALITIES.filter((q) => counts[q] > 0).length;

  // Recent window — the actionable horizon. Which qualities are ABSENT from it?
  const recent = valid.slice(-recentN);
  const recentCounts = Object.fromEntries(QUALITIES.map((q) => [q, recent.filter((b) => b.character === q).length]));
  const neglected = QUALITIES.filter((q) => recentCounts[q] === 0);

  // Longest consecutive same-quality run anywhere in history (the deepest camp),
  // and the CURRENT run (are they camping right now?).
  let longest = { character: valid[0].character, length: 1 };
  let run = { character: valid[0].character, length: 1 };
  for (let i = 1; i < valid.length; i++) {
    if (valid[i].character === run.character) run = { character: run.character, length: run.length + 1 };
    else run = { character: valid[i].character, length: 1 };
    if (run.length > longest.length) longest = { ...run };
  }
  const currentRun = { character: run.character, length: run.length };

  // Dominant quality overall + whether one quality swamps the mix (>50%).
  const dominant = QUALITIES.reduce((a, b) => (counts[b] > counts[a] ? b : a));
  const lopsided = pct[dominant] > 50;

  // A neutral, factual read — states the pattern, never prescribes a load.
  const read = buildRead({ total, recentN: Math.min(recentN, total), currentRun, longest, neglected, dominant, lopsided, pct, qualitiesUsed, recentlySkewed: currentRun.length >= 4 || neglected.length >= 2 });

  // A soft "balanced?" verdict for a badge. Must also consult the RECENT window,
  // not just whole-history distribution — else the badge says "balanced" while the
  // read in the same object flags qualities missing from the last N blocks (review
  // finding #4). Allow at most one quality absent recently (endurance often isn't
  // every cycle); more than that isn't "balanced".
  const balanced = qualitiesUsed >= 3 && currentRun.length < 4 && !lopsided && neglected.length <= 1;

  return { enough: true, n: total, counts, pct, qualitiesUsed, dominant, lopsided, neglected, recentCounts, currentRun, longest, balanced, read };
}

function buildRead({ total, recentN, currentRun, longest, neglected, dominant, lopsided, pct, qualitiesUsed, recentlySkewed }) {
  const parts = [];
  if (qualitiesUsed === 1) {
    parts.push(`Every one of the last ${total} blocks emphasized ${LABEL[dominant]} — no variation in training quality at all.`);
  } else if (lopsided) {
    parts.push(`${LABEL[dominant]} dominates the history (${pct[dominant]}% of ${total} blocks).`);
  } else if (recentlySkewed) {
    // Whole-history looks spread, but the ACTIONABLE recent window has narrowed —
    // don't lead with "varied" and let a coach relax (review finding #1). The
    // current-run / neglected clauses below give the specifics.
    parts.push(`Varied across ${qualitiesUsed} qualities overall, but the recent stretch has narrowed.`);
  } else {
    parts.push(`Fairly varied across ${qualitiesUsed} qualities over ${total} blocks.`);
  }
  if (currentRun.length >= 3) {
    parts.push(`Currently ${currentRun.length} straight ${LABEL[currentRun.character]} blocks — a long run of one colour is the cue to change phase.`);
  }
  if (neglected.length && neglected.length < 4) {
    const names = neglected.map((q) => LABEL[q]);
    const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
    parts.push(`No ${list} phase in the last ${recentN} blocks.`);
  }
  // Surface the deepest historical camp when it's a real run (≥4) and isn't just
  // re-describing the current run the clause above already covered (finding #6).
  if (longest.length >= 4 && !(longest.character === currentRun.character && longest.length === currentRun.length)) {
    parts.push(`Deepest camp on record: ${longest.length} straight ${LABEL[longest.character]} blocks.`);
  }
  if (parts.length === 1 && currentRun.length < 3 && !neglected.length) {
    parts.push('Every quality has been touched recently — a well-rounded rotation.');
  }
  return parts.join(' ');
}
