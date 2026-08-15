// exerciseClassify.js — infer an exercise's taxonomy from its title, so the
// ~91%-unclassified library can be filled at scale with the coach confirming.
// Pure + heuristic. Taxonomy is the canonical CLAUDE.md set (do not invent).
// Every guess carries a confidence; a blank field means "couldn't tell — leave".

const norm = (s) => ` ${String(s || '').toLowerCase().replace(/[^a-z0-9/ -]+/g, ' ').replace(/\s+/g, ' ').trim()} `;
const has = (t, ...words) => words.some((w) => t.includes(` ${w} `) || t.includes(`${w}-`) || t.includes(`-${w}`));

// ---- Resistance type (equipment) — first match wins, most specific first.
export function guessResistance(title) {
  const t = norm(title);
  if (has(t, 'kb', 'kettlebell')) return 'Kettlebell';
  if (has(t, 'med-ball', 'medball', 'medicine', 'med ball')) return 'Medicine Ball';
  if (has(t, 'landmine', 'trap-bar', 'trap bar')) return 'Landmine';
  if (has(t, 'trx', 'suspension', 'rings', 'ring')) return 'TRX/Suspension';
  if (has(t, 'band', 'banded')) return 'Band';
  if (has(t, 'cable', 'pulley')) return 'Cable';
  if (has(t, 'machine', 'smith', 'hack', 'pendulum', 'leg-press', 'leg press', 'pec-deck', 'lat-pulldown', 'pulldown')) return 'Machine';
  if (has(t, 'bb', 'barbell', 'ez-bar', 'ez bar')) return 'Barbell';
  if (has(t, 'db', 'dumbbell', 'dumbell')) return 'Dumbbell';
  if (has(t, 'bw', 'bodyweight', 'push-up', 'pushup', 'pull-up', 'pullup', 'chin-up', 'chinup', 'dip', 'plank', 'hang', 'pogo', 'bound', 'hop', 'jump', 'sprint', 'crawl', 'sit-up', 'situp')) return 'Bodyweight';
  return '';
}

// ---- Movement type — the action verb.
export function guessMovement(title) {
  const t = norm(title);
  if (has(t, 'clean', 'snatch', 'jerk')) return 'Olympic Lift';
  if (has(t, 'lateral-raise', 'lateral raise', 'lat-raise', 'lat raise', 'y-raise', 'l-raise')) return 'Lateral Raise';
  if (has(t, 'front-raise', 'front raise')) return 'Front Raise';
  if (has(t, 'pullover')) return 'Pullover';
  if (has(t, 'slam')) return 'Slam';
  if (has(t, 'toss')) return 'Toss';
  if (has(t, 'throw')) return 'Throw';
  if (has(t, 'jump', 'pogo', 'bound', 'hop', 'leap', 'depth')) return 'Jump';
  if (has(t, 'carry', 'walk', 'farmer', 'suitcase')) return 'Carry';
  if (has(t, 'anti-rotation', 'anti rotation', 'pallof', 'chop', 'lift')) return 'Anti-Rotation';
  if (has(t, 'rotation', 'rotational', 'russian-twist', 'twist', 'windmill')) return 'Rotation';
  if (has(t, 'lunge', 'split-squat', 'split squat', 'rfess', 'step-up', 'step up', 'stepup')) return 'Lunge';
  if (has(t, 'squat', 'sissy', 'pistol')) return 'Squat';
  if (has(t, 'deadlift', 'rdl', 'sldl', 'hinge', 'good-morning', 'good morning', 'hip-thrust', 'hip thrust', 'thrust', 'swing', 'kickback')) return 'Hinge';
  if (has(t, 'curl')) return 'Curl';
  if (has(t, 'extension', 'tricep', 'triceps', 'pushdown', 'skullcrusher', 'leg-extension', 'leg extension', 'kickdown')) return 'Extend';
  if (has(t, 'row', 'renegade')) return 'Row';
  if (has(t, 'pulldown', 'pull-up', 'pullup', 'chin-up', 'chinup', 'pull-down', 'lat')) return 'Pull';
  if (has(t, 'ohp', 'overhead', 'shoulder-press', 'shoulder press', 'press', 'bench', 'push-up', 'pushup', 'dip', 'push')) return 'Push';
  if (has(t, 'iso', 'plank', 'hold', 'hang', 'dead-bug', 'dead bug', 'bird-dog')) return 'Isometric';
  return '';
}

// ---- Body position — the stance.
export function guessPosition(title) {
  const t = norm(title);
  if (has(t, 'half-kneeling', 'half kneeling', 'tall-kneeling', 'tall kneeling', 'kneeling')) return has(t, 'half-kneeling', 'half kneeling') ? 'Half-Kneeling' : 'Kneeling';
  if (has(t, 'quadruped', 'bird-dog', 'bird dog', 'bear', 'crawl')) return 'Quadruped';
  if (has(t, 'side-lying', 'side lying', 'side-plank', 'side plank')) return 'Side-Lying';
  if (has(t, 'hang', 'hanging', 'pull-up', 'pullup', 'chin-up', 'chinup')) return 'Hanging';
  if (has(t, 'prone', 'prone-laying', 'push-up', 'pushup', 'plank', 'superman')) return 'Prone';
  if (has(t, 'supine', 'laying', 'lying', 'floor-press', 'floor press', 'glute-bridge', 'glute bridge', 'hip-thrust', 'hip thrust', 'sit-up', 'situp', 'dead-bug', 'crunch')) return 'Supine';
  if (has(t, 'seated', 'sitting')) return 'Seated';
  if (has(t, 'standing', 'stand')) return 'Standing';
  return '';
}

// Classify all three fields at once. Returns { resistanceType, movementType,
// bodyPosition, filled } — filled = how many fields we could infer (0–3).
export function classify(title) {
  const resistanceType = guessResistance(title);
  const movementType = guessMovement(title);
  const bodyPosition = guessPosition(title);
  const filled = [resistanceType, movementType, bodyPosition].filter(Boolean).length;
  return { resistanceType, movementType, bodyPosition, filled };
}

// Is a library exercise unclassified (missing any of the three)?
export const isUnclassified = (ex) => !((ex.resistanceType || '') && (ex.movementType || '') && (ex.bodyPosition || ''));
