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

// Movement-suggesting tokens that appear in exercise titles. Used by the
// title-fallback path when classification fields are empty (the current state
// of ~all exercises in the Supabase library as of 2026-04-26 — until that
// classification gets populated, we still need substitution to produce
// reasonable alternates from title alone).
const MOVEMENT_HINTS = [
  'squat', 'deadlift', 'press', 'bench', 'row', 'pulldown', 'pull-up', 'pullup', 'chinup', 'chin-up',
  'curl', 'extension', 'fly', 'flye', 'raise', 'shrug', 'thrust', 'lunge', 'split', 'step-up',
  'stepup', 'rdl', 'good morning', 'rotation', 'pallof', 'carry', 'farmer', 'dip', 'push-up',
  'pushup', 'rear delt', 'lateral', 'face pull', 'pullover', 'kickback', 'crunch', 'sit-up',
  'situp', 'plank', 'hip thrust', 'glute bridge', 'calf', 'hamstring', 'quad', 'chest', 'back',
  'shoulder', 'tricep', 'bicep', 'core', 'abs', 'oblique',
];

const EQUIPMENT_HINTS = [
  'bb', 'barbell', 'db', 'dumbbell', 'kb', 'kettlebell', 'cable', 'machine', 'smith',
  'band', 'banded', 'bodyweight', 'bw', 'sled', 'trx', 'ring', 'sandbag', 'medball', 'medicine ball',
];

function findHints(title, hints) {
  const t = (title || '').toLowerCase();
  const found = new Set();
  for (const h of hints) {
    if (t.includes(h)) found.add(h);
  }
  return found;
}

function setOverlap(a, b) {
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n;
}

function setDifference(a, b) {
  let n = 0;
  for (const x of a) if (!b.has(x)) n++;
  return n;
}

export function scoreSimilarity(target, candidate) {
  if (!target || !candidate) return 0;
  if (target.id === candidate.id) return -Infinity;
  if (!candidate.title) return 0;

  let score = 0;

  // ─── Classification-based path (preferred when populated) ─────────
  let classificationSignal = false;
  if (target.movementPattern && candidate.movementPattern === target.movementPattern) {
    score += 40; classificationSignal = true;
  }
  if (target.category && candidate.category === target.category) {
    score += 20; classificationSignal = true;
  }
  if (target.movementType && candidate.movementType === target.movementType) {
    score += 15; classificationSignal = true;
  }
  // The whole point of substitution: prefer DIFFERENT equipment so the
  // trainee actually solves their busy-machine problem.
  if (target.resistanceType && candidate.resistanceType
      && candidate.resistanceType !== target.resistanceType) {
    score += 15; classificationSignal = true;
  }
  if (target.bodyPosition && candidate.bodyPosition === target.bodyPosition) {
    score += 10; classificationSignal = true;
  }
  if (target.laterality && candidate.laterality === target.laterality) {
    score += 10; classificationSignal = true;
  }
  if (target.primaryMuscles) {
    const muscleHits = overlapCount(target.primaryMuscles, candidate.primaryMuscles);
    if (muscleHits > 0) { score += muscleHits * 10; classificationSignal = true; }
  }
  if (target.secondaryMuscles) {
    score += overlapCount(target.secondaryMuscles, candidate.secondaryMuscles) * 5;
  }
  if (target.jointMovements && candidate.jointMovements === target.jointMovements) {
    score += 5; classificationSignal = true;
  }

  // ─── Title-token fallback (always contributes a smaller weight) ───
  // This makes the algorithm useful even when the library is unclassified.
  // Same movement keyword in title = strong signal. Different equipment
  // keyword in title = the substitution we want.
  const tMove = findHints(target.title, MOVEMENT_HINTS);
  const cMove = findHints(candidate.title, MOVEMENT_HINTS);
  const tEquip = findHints(target.title, EQUIPMENT_HINTS);
  const cEquip = findHints(candidate.title, EQUIPMENT_HINTS);

  // Same movement keyword(s) → 25 per match (capped at 50).
  score += Math.min(50, setOverlap(tMove, cMove) * 25);
  // Different equipment keyword(s) on the candidate → 10 per (capped at 20).
  score += Math.min(20, setDifference(cEquip, tEquip) * 10);
  // Penalise candidates that share NO movement keyword with the target —
  // unless classification gave us a strong signal.
  if (!classificationSignal && setOverlap(tMove, cMove) === 0) {
    return 0;
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
