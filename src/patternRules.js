// Block numbers, the top of a rep scheme and a lift's movement pattern from its title - moved out of PlansView (16.10
// #826) so the athlete portal's progress page can read them without pulling the coach editor into its bundle.
// PlansView re-exports all three.
export function blockNum(name) {
  const m = (name || '').match(/(?:block|בלוק)\s*#?\s*(\d+)|#\s*(\d+)/i);
  return m ? Number(m[1] || m[2]) : null;
}

// Reps can be "8", "8-10", "8/6/4", "12,12,10", "AMRAP". Return a representative
// integer (the max prescribed rep) for volume math, plus the raw label.
export function repsTop(reps) {
  const r = (reps == null ? '' : String(reps)).trim();
  const nums = (r.match(/\d+/g) || []).map(Number);
  return nums.length ? Math.max(...nums) : null;
}

// Classify an exercise into a movement pattern from its TITLE (the library
// taxonomy is only ~9% populated, so title keywords are the reliable signal).
// Order = priority: more specific patterns first, so e.g. "SL Pogo Jump" →
// Jump, "Split Squat" → Lunge (not Squat), "Hip Thrust" → Hinge (not Squat).
// Used for the pattern-lane lineage. Falls back to library category if present.
const PATTERN_RULES = [
  ['Jump / Plyo', /jump|pogo|\bhop|bound|plyo|depth|broad|box\s*jump|reactive|throw|slam|toss|med[\s-]*ball|medicine\s*ball|wall\s*ball|skip|snap[\s-]*down|\bcmj\b|\bdj\b|rebound|\btuck\b|scissor|elastic|ankle\s*stiff|stiff[\s-]*ness|bounce|drop\s*(jump|land)|landing/],
  ['Olympic', /snatch|\bclean\b|jerk|power\s*(clean|snatch)|hang\s*(clean|snatch|pull)|high\s*pull|\bc&j\b/],
  ['Conditioning', /sprint|\brun\b|\bjog|bike|assault|\berg\b|\bski\b|rower|shuttle|tempo\s*run|interval|conditioning|\bmile\b|prowler\s*(push|sprint)|sled\s*(sprint|push|drag)/],
  ['Hinge', /deadlift|\bdl\b|\brdl\b|\bsldl\b|romanian|stiff[\s-]*leg|hip\s*thrust|thrust|good\s*morning|\bgm\b|\bswing|kettlebell\s*swing|\bkb\s*swing|hinge|pull[\s-]*through|back\s*ext|hip\s*ext|glute\s*(bridge|ham)|\bham(string)?\b|nordic|\bghr\b|reverse\s*hyper|hyperext|kickback|\brack\s*pull/],
  ['Squat', /squat|\bhack\b|leg\s*press|goblet|kossac|pistol|sissy|wall\s*sit|step[\s-]*down|leg\s*ext|knee\s*ext|\bzercher\b|front\s*squat|back\s*squat/],
  ['Lunge / SL', /lunge|split\s*squat|\brfess\b|bulgarian|step[\s-]*up|single[\s-]*leg|1[\s-]*leg|skater|shrimp|\bcossac|cossack|copenhagen|reverse\s*lunge|walking\s*lunge|\bsl\s/],
  ['Vertical Pull', /pull[\s-]*up|chin[\s-]*up|pull[\s-]*down|pulldown|\blat\s*(pull|raise)?|muscle[\s-]*up|\blat\b/],
  ['Horizontal Pull', /\brow\b|face[\s-]*pull|rear\s*delt|inverted|seal\s*row|t[\s-]*bar|ring\s*row|pull[\s-]*apart|\brow(ing)?\b|meadows|pendlay|chest[\s-]*support/],
  ['Vertical Push', /overhead|\bohp\b|shoulder\s*press|military|\bz[\s-]*press|pike|handstand|landmine\s*press|arnold|push\s*press|bradford|cuban/],
  ['Horizontal Push', /bench|chest\s*press|push[\s-]*up|\bdip\b|chest\s*fly|\bpec\b|floor\s*press|db\s*press|dumbbell\s*press|incline\s*press|\bcgbp\b|close[\s-]*grip\s*bench/],
  ['Core / Carry', /plank|\bab\b|\bcore\b|leg\s*raise|knee\s*raise|pallof|rollout|carry|farmer|suitcase|waiter|crunch|hollow|dead\s*bug|bird\s*dog|anti[\s-]|rotation|twist|woodchop|chop|sit[\s-]*up|\bl[\s-]*sit|hang|sled\s*(drag|pull)?|prowler|crawl|bear|get[\s-]*up|turkish|copenhagen\s*plank|side\s*plank|\bohc\b/],
  ['Arms / Iso', /curl|tricep|bicep|extension|pushdown|skull|preacher|hammer|forearm|wrist|lateral\s*raise|front\s*raise|\bfly\b|reverse\s*fly|\bcalf\b|shrug|adduction|abduction|delt\s*raise|\braise\b/],
];
export function classifyPattern(title, lib) {
  const t = (title || '').toLowerCase();
  for (const [name, re] of PATTERN_RULES) if (re.test(t)) return name;
  // Fall back to a library movement/category hint if the title had no keyword.
  const cat = (lib?.movementPattern || lib?.movementType || lib?.category || '').toLowerCase();
  if (cat) {
    if (/squat/.test(cat)) return 'Squat';
    if (/hinge|deadlift/.test(cat)) return 'Hinge';
    if (/push/.test(cat)) return /vert/.test(cat) ? 'Vertical Push' : 'Horizontal Push';
    if (/pull|row/.test(cat)) return /vert/.test(cat) ? 'Vertical Pull' : 'Horizontal Pull';
    if (/lunge/.test(cat)) return 'Lunge / SL';
    if (/olympic/.test(cat)) return 'Olympic';
    if (/carry|core|rotation|anti/.test(cat)) return 'Core / Carry';
  }
  return 'Other';
}
