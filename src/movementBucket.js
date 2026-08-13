// movementBucket.js — classify a lift into one of the exercise-library's six
// catalog buckets: {upper,lower} × {bilateral,unilateral,plyo}. The Analysis
// "main movements" view groups an athlete's lifts this way (Ohad #170), the same
// spine the library uses (upper/lower uni/bi/plyo), so the coach reads the block
// the way the library is organised instead of one flat list.
//
// Pure + title-heuristic (the staple rows carry a title, not always a library
// join). Region + modality are derived from the name; PLYO reuses the same
// ballistic test the bar-speed gate uses so the two stay consistent.
import { isVelocityLossLift } from './poseMetricsStore.js';

// LOWER-body signals (legs/glutes/hinge/squat + the plyo landings that are lower).
// NOTE: the final plyo-landing token is `landing`, NOT a bare `land` — a bare
// `land` also matched "LANDmine" and sent every Landmine Press/Row to LOWER
// (flipping Upper to a false "not trained" gap). With `landing`, the real
// movement word decides landmine variants (press/row→upper, squat/rdl→lower).
const LOWER_RE = /\b(squat|deadlift|dead\s?lift|\bdl\b|rdl|sldl|hinge|swing|lunge|step[\s-]?up|hip[\s-]?thrust|glute|ham|leg\s?curl|leg\s?ext|leg\s?press|calf|split[\s-]?squat|rfess|ffess|bulgarian|nordic|shrimp|pistol|good[\s-]?morning|thrust|kickback|adduction|abduction|sissy|jump|pogo|hop|bound|snap[\s-]?down|depth|broad|vert|landing)/i;
// UPPER-body signals (chest/back/shoulders/arms + upper-body throws/push-ups).
// Olympic lifts (clean/snatch/jerk) are deliberately NOT here — they're full-body
// / lower-dominant and belong in the 'Other · Olympic' catch-all, not "upper".
const UPPER_RE = /\b(bench|chest|press|push[\s-]?up|push[\s-]?press|\brow\b|rows|pull[\s-]?up|pull[\s-]?down|pulldown|chin[\s-]?up|chin|curl|tricep|bicep|pull[\s-]?over|fly|flye|shrug|lat(?:eral)?\s?raise|front\s?raise|face[\s-]?pull|\bdip\b|overhead|ohp|shoulder|delt|pushup|throw|slam|toss|wall\s?ball)/i;
// UNILATERAL signals (one side works / alternates).
const UNI_RE = /\b(sl\b|single[\s-]?leg|single[\s-]?arm|\bsa\b|one[\s-]?arm|1[\s-]?arm|uni|unilateral|split|rfess|ffess|bulgarian|pistol|shrimp|step[\s-]?up|lunge|b[\s-]?stance|staggered|offset|alternating|alt\b|1[\s-]?leg|skater|cossack)/i;

// region: 'upper' | 'lower' | 'other' (core/full-body/carry don't map to the six)
export function movementRegion(title) {
  const t = String(title || '').toLowerCase();
  if (!t) return 'other';
  const lower = LOWER_RE.test(t);
  const upper = UPPER_RE.test(t);
  // If both fire (e.g. "DB Squat + Press" combo), prefer the LEADING word's side.
  if (lower && upper) {
    const li = t.search(LOWER_RE); const ui = t.search(UPPER_RE);
    return li <= ui ? 'lower' : 'upper';
  }
  if (lower) return 'lower';
  if (upper) return 'upper';
  return 'other';
}

// modality: 'plyo' | 'unilateral' | 'bilateral'
export function movementModality(title) {
  const t = String(title || '').toLowerCase();
  if (!t) return 'bilateral';
  if (!isVelocityLossLift(title)) return 'plyo'; // ballistic/reactive = plyo (shared test)
  if (UNI_RE.test(t)) return 'unilateral';
  return 'bilateral';
}

export const BUCKETS = [
  { key: 'upper-bilateral', region: 'upper', modality: 'bilateral', label: 'Upper · Bilateral' },
  { key: 'upper-unilateral', region: 'upper', modality: 'unilateral', label: 'Upper · Unilateral' },
  { key: 'upper-plyo', region: 'upper', modality: 'plyo', label: 'Upper · Plyo' },
  { key: 'lower-bilateral', region: 'lower', modality: 'bilateral', label: 'Lower · Bilateral' },
  { key: 'lower-unilateral', region: 'lower', modality: 'unilateral', label: 'Lower · Unilateral' },
  { key: 'lower-plyo', region: 'lower', modality: 'plyo', label: 'Lower · Plyo' },
];

// The bucket key for a lift, or null when it doesn't map to the six (core/carry/
// full-body/other-region) — the caller shows those in a small "Other" catch-all.
export function movementBucket(title) {
  const region = movementRegion(title);
  if (region === 'other') return null;
  return `${region}-${movementModality(title)}`;
}

// Group an array of {title,...} lifts into the six buckets (+ an `other` list).
export function groupByBucket(lifts) {
  const out = { other: [] };
  for (const b of BUCKETS) out[b.key] = [];
  for (const l of (lifts || [])) {
    const k = movementBucket(l && (l.title || l.name || l));
    (out[k] || out.other).push(l);
  }
  return out;
}
