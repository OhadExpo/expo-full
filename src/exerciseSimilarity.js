// Exercise substitution scoring — finds N similar exercises to swap in when a
// trainee can't access the prescribed equipment (busy machine, missing kit).
//
// Designed for the "template programs" funnel only — when an EXPO template is
// purchased and duplicated onto a new trainee, that trainee should be able to
// hit "Find alternate" on any exercise and pick a similar movement. Trainees
// on Ohad's manually-coached private plans see no swap UI — Ohad picks
// substitutions manually for them as part of the coaching relationship.
//
// Gating is done at the call site (ClientPortal.jsx will check whether the
// active plan was duplicated from the template library). This file just
// returns the candidates.
//
// ───────────────────────────────────────────────────────────────────────────
// Scoring
//
//   Same Movement Pattern        +40   (the strongest equivalence signal)
//   Same Category                +20
//   Same Movement Type           +15
//   DIFFERENT Resistance Type    +15   (the whole point — alternate equipment)
//   Same Body Position           +10
//   Same Laterality              +10
//   Primary muscle overlap       +10   (per overlapping primary)
//   Secondary muscle overlap     +5    (per overlapping secondary)
//   Same Joint Movements         +5
//
// An exercise can never substitute for itself.
// ───────────────────────────────────────────────────────────────────────────

const TOKEN_RE = /[\s,/&·;]+/;

function tokens(value) {
  if (!value) return [];
  return String(value)
    .toLowerCase()
    .split(TOKEN_RE)
    .filter(Boolean);
}

function overlapCount(a, b) {
  if (!a || !b) return 0;
  const ta = tokens(a);
  if (ta.length === 0) return 0;
  const tb = new Set(tokens(b));
  let n = 0;
  for (const t of ta) if (tb.has(t)) n++;
  return n;
}

export function scoreSimilarity(target, candidate) {
  if (!target || !candidate) return 0;
  if (target.id === candidate.id) return -Infinity;
  if (!candidate.title) return 0;

  let score = 0;

  if (target.movementPattern && candidate.movementPattern === target.movementPattern) {
    score += 40;
  }
  if (target.category && candidate.category === target.category) {
    score += 20;
  }
  if (target.movementType && candidate.movementType === target.movementType) {
    score += 15;
  }
  // The whole point of substitution: prefer DIFFERENT equipment so the
  // trainee actually solves their busy-machine problem.
  if (target.resistanceType && candidate.resistanceType
      && candidate.resistanceType !== target.resistanceType) {
    score += 15;
  }
  if (target.bodyPosition && candidate.bodyPosition === target.bodyPosition) {
    score += 10;
  }
  if (target.laterality && candidate.laterality === target.laterality) {
    score += 10;
  }
  score += overlapCount(target.primaryMuscles, candidate.primaryMuscles) * 10;
  score += overlapCount(target.secondaryMuscles, candidate.secondaryMuscles) * 5;
  if (target.jointMovements && candidate.jointMovements === target.jointMovements) {
    score += 5;
  }

  return score;
}

export function findAlternates(target, library, n = 5) {
  if (!target || !Array.isArray(library)) return [];
  const scored = [];
  for (const ex of library) {
    const s = scoreSimilarity(target, ex);
    if (s > 0) scored.push({ exercise: ex, score: s });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, n);
}

// ───────────────────────────────────────────────────────────────────────────
// Worked examples (to make the scoring feel concrete; consult before edits).
//
// Target: Lat Pulldown — Cable
//   { movementPattern: 'Vertical Pull', category: 'Back',
//     movementType: 'Pull', resistanceType: 'Cable',
//     bodyPosition: 'Seated', laterality: 'Bilateral',
//     primaryMuscles: 'Lats', secondaryMuscles: 'Biceps' }
//
// Candidate A: Pull-Up — Bodyweight
//   { Vertical Pull, Back, Pull, Bodyweight, Hanging, Bilateral, Lats, Biceps }
//   Pattern +40, Category +20, MovementType +15, Diff resistance +15,
//   Same laterality +10, Lats overlap +10, Biceps overlap +5  →  115 (top)
//
// Candidate B: Single-Arm Cable Row
//   { Horizontal Pull, Back, Row, Cable, Standing, Unilateral, Lats, Biceps }
//   Category +20, Lats +10, Biceps +5  →  35
//   (loses pattern + same equipment cancels diff-resistance bonus)
//
// Candidate C: DB Bench Press
//   { Horizontal Push, Chest, Push, Dumbbell, Supine, Bilateral, Pecs, Triceps }
//   Diff resistance +15, Same laterality +10  →  25
//   (irrelevant, but just to show the algorithm degrades gracefully)
// ───────────────────────────────────────────────────────────────────────────
