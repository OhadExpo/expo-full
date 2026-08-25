// Lift auto-detection for the review tools (#19).
//
// PROBLEM (measured against the real library, 2026-07-19):
//   repCounter.detectChannels() is a 5-rule title regex whose final line is
//   `return knee` for anything unrecognised. Across 1472 library exercises,
//   354 (24%) matched no rule and were silently counted on the KNEE angle —
//   57% of everything the old classifier called "knee" was really "unknown".
//   Library typos defeat it outright ("SL Hip-Thurst", "Bouding", "SLDL").
//
// APPROACH — fuse two independent signals (Ohad's call, "both"):
//   NAME  : library taxonomy where it exists (only 6.4% of rows carry
//           movementPattern today), else a much wider title lexicon that is
//           tolerant of the library's spelling. Returns null, never a guess.
//   MOTION: which joint actually swings. Derived from the recorded per-frame
//           angle series, so it is immune to titles and typos entirely.
//
// The two disagree in useful ways: NAME knows a paused squat is still a squat;
// MOTION knows a mislabelled row is really a hinge. Fusion prefers NAME when
// they agree or when MOTION is ambiguous, and lets MOTION override only on a
// decisive margin — always reporting `source` and `disagreement` so the coach
// sees why, and can still force a channel with the existing override control.

import { medianFilter, findPeaks, isReal } from './repCounter.js';

export const CHANNELS = {
  none:  [],
  hip:   ['L HIP', 'R HIP'],
  knee:  ['L KNE', 'R KNE'],
  elbow: ['L ELB', 'R ELB'],
  sho:   ['L SHO', 'R SHO'],
};

const pack = (kind, source, confidence, why) => ({
  kind, channels: CHANNELS[kind] || [], source, confidence, why,
});

// ── NAME signal ─────────────────────────────────────────────────────────────

// Taxonomy → channel. Only ~6% of the library carries these fields, but where
// present they are authored rather than inferred, so they outrank the lexicon.
const PATTERN_TO_KIND = {
  'hip hinge': 'hip',
  'squat': 'knee',
  'lunge': 'knee',
  'horizontal push': 'elbow',
  'horizontal pull': 'elbow',
  'vertical push': 'elbow',
  'vertical pull': 'elbow',
  'carry/loaded locomotion': 'none',
  'carry': 'none',
  'olympic': 'hip',
};
const TYPE_TO_KIND = {
  'hinge': 'hip', 'squat': 'knee', 'lunge': 'knee',
  'push': 'elbow', 'pull': 'elbow', 'row': 'elbow', 'curl': 'elbow', 'extend': 'elbow',
  'lateral raise': 'sho', 'front raise': 'sho', 'pullover': 'sho',
  'throw': 'sho', 'slam': 'sho', 'toss': 'sho',
  'jump': 'knee', 'olympic lift': 'hip',
  'isometric': 'none', 'carry': 'none',
};

export function channelFromTaxonomy(ex) {
  if (!ex) return null;
  const mt = String(ex.movementType || '').trim().toLowerCase();
  const mp = String(ex.movementPattern || '').trim().toLowerCase();
  // Movement TYPE is the more specific of the two (a "Lateral Raise" typed as
  // pattern "Isolation" is still a shoulder movement), so consult it first.
  if (mt && TYPE_TO_KIND[mt]) return pack(TYPE_TO_KIND[mt], 'library', 0.95, `taxonomy: ${ex.movementType}`);
  if (mp && PATTERN_TO_KIND[mp]) return pack(PATTERN_TO_KIND[mp], 'library', 0.9, `taxonomy: ${ex.movementPattern}`);
  return null;
}

// Isometric markers OUTRANK taxonomy. Caught in audit: "ISO Kneeling Push-Up"
// and "ISO SL Superman Plank" carry movementPattern "Horizontal Push", so
// taxonomy alone turned holds — including a plank — into rep-countable presses.
// A hold is a hold no matter how the pattern field classifies the shape.
const ISOMETRIC_RX = /(^|\s)(iso|isometric|plank|hold|dead\s?hang|wall\s?sit|l\s?sit)(\s|$)/;
export const isIsometricTitle = (title) => ISOMETRIC_RX.test(norm(title));

// Normalise the library's punctuation so one lexicon covers "Dead-Bug",
// "Dead Bug", "DEADBUG", "90/90 POS", "Hip-Thurst".
const norm = (s) => String(s || '')
  .toLowerCase()
  .replace(/[’']/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

// Token matching: long tokens (>=5 chars) match as substrings so plurals and
// suffixes come free ("squat" catches "squats"/"squatting", "deadlift" catches
// "deadlifts"). Short tokens MUST match as whole words — the library is full of
// abbreviations like "DL", "SQ", "OHP", and a bare substring "dl" would fire on
// "saddle". Normalisation already reduced the title to space-separated words,
// so padding both sides gives word-boundary semantics without a regex.
const SUBSTRING_MIN = 5;
function hasToken(paddedTitle, tok) {
  return tok.length >= SUBSTRING_MIN
    ? paddedTitle.includes(tok)
    : paddedTitle.includes(` ${tok} `);
}

// Ordered lexicon — first hit wins, so isometric/carry sits ahead of the joint
// rules (a "Wall-Sit" must not be counted as a squat) and specific compounds
// sit ahead of the generic tokens they contain ("leg extension" before
// "extension", "hip thrust" before "thrust").
//
// Each entry is [kind, [tokens], confidence].
const LEXICON = [
  ['none', [
    'hold', 'plank', 'l sit', 'dead hang', 'hanging', 'carry', 'farmer', 'iso',
    'wall sit', 'bear crawl', 'stretch', 'breath', 'scap', 'position', 'pos to',
    'sprint', 't step', 'crossover step', 'crossunder step', 'march', 'walk',
    'pallof', 'mobility', 'core work', 'core exercise', 'drill', 'circle',
  ], 0.8],

  ['hip', [
    'hip thrust', 'hip thurst', 'glute bridge', 'deadlift', 'dead lift', 'sldl',
    'rdl', 'romanian', 'hinge', 'good morning', 'jefferson', 'clean', 'snatch',
    'swing', 'crab', 'reverse tabletop', 'hip march', 'kickback', 'pull through',
    'back extension', 'hyperextension', 'ghd raise', 'bridge',
    // Abbreviations the library leans on — whole-word matched (see hasToken).
    'dl', 'sldl', 'trap bar', 'hip airplane',
  ], 0.85],

  ['knee', [
    'squat', 'lunge', 'step up', 'rfess', 'ffess', 'rfss', 'bulgarian', 'pistol',
    'leg press', 'leg extension', 'knee extension', 'knee ext', 'jump', 'bounce',
    'bound', 'bouding', 'goblet', 'thruster', 'pogo', 'calf', 'sled', 'depth drop',
    'depth landing', 'landing', 'snap down', 'heel click', 'get up', 'skater',
    'shrimp', 'step down', 'sq', 'leg curl',
  ], 0.85],

  ['elbow', [
    'bench', 'push up', 'pushup', 'ohp', 'overhead press', 'pull up',
    'chin up', 'pulldown', 'pull down', 'curl', 'tricep', 'skull', 'dip',
    'pushdown', 'push down', 'press', 'floor slide', 'wall slide',
    'facepull', 'face pull', 'row', 'rowing',
  ], 0.8],

  ['sho', [
    'lateral raise', 'front raise', 'rear delt', 'raise',
    'external rotation', 'internal rotation', 'around the world',
    'pullover', 'pull over', 'slam', 'throw', 'toss', 'shoulder tap',
    'y raise', 'a raise', 't raise', 'protraction', 'retraction', 'rotation',
    'fly', 'flye', 'flies', 'chest fly',
  ], 0.8],

  // Trunk-driven work has no usable limb-angle rep cycle — counting it on a
  // knee or elbow produces noise. Treat as uncountable rather than guess.
  ['none', [
    'sit up', 'situp', 'crunch', 'hollow', 'dead bug', 'deadbug', 'twist',
    'shawarma', 'abs', 'oblique', 'russian', 'core',
  ], 0.75],
];

// Specificity weights. First-match-wins was wrong: EXPO titles routinely name
// the stance before the movement ("Cable Squatting Bicep Curl" is a curl;
// "SLDL POS SA DB Row" is a row), so a generic or stance token would win over
// the actual movement noun. Highest weight wins instead. Default weight favours
// multi-word compounds; these overrides encode the conflicts found by auditing
// all 82 reclassified exercises against the old classifier.
const DEFAULT_WEIGHT = (tok) => tok.trim().split(' ').length * 10 + tok.length;
const WEIGHT = {
  calf: 60,          // "Squatting Calf Raise" is a calf raise, not a squat/raise
  curl: 45,          // "Cable Squatting Bicep Curl" reps on the elbow
  tricep: 45,        // "Tricep Kickback" reps on the ELBOW — 'kickback' lives in
                     // the hip group and was winning, so the counter watched a
                     // joint that barely moves and reps stuck at 0 (audit #86)
  row: 40,           // "SLDL POS SA DB Row" reps on the elbow, SLDL is the stance
  squat: 30,         // must beat "trap bar", which only implies a hinge for DLs
  'trap bar': 25,
  sldl: 20,          // stance qualifier when a movement noun is also present
  raise: 15,         // very generic — loses to calf/lateral raise/front raise
  march: 10,
  walk: 10,
  sprint: 12,
  position: 8,
  'pos to': 8,
};
const weightOf = (tok) => WEIGHT[tok] ?? DEFAULT_WEIGHT(tok);

export function channelFromTitle(title) {
  const t = norm(title);
  if (!t) return null;
  const padded = ` ${t} `;
  let best = null;
  for (const [kind, tokens, conf] of LEXICON) {
    for (const tok of tokens) {
      if (!hasToken(padded, tok)) continue;
      const w = weightOf(tok);
      // Ties go to the earlier (more specific) lexicon group.
      if (!best || w > best.w) best = { kind, conf, tok, w };
    }
  }
  return best ? pack(best.kind, 'name', best.conf, `title: "${best.tok}"`) : null;
  // returning null is deliberate — the old blind `knee` default IS the bug
}

// ── MOTION signal ───────────────────────────────────────────────────────────

// Robust range of a smoothed signal: p95 − p5 rejects landmark spikes that a
// raw min/max would swallow.
function robustRange(sig) {
  const v = sig.filter(isReal).sort((a, b) => a - b);
  if (v.length < 8) return 0;
  return v[Math.floor(v.length * 0.95)] - v[Math.floor(v.length * 0.05)];
}

// How rhythmic are the peaks? Repetitions are near-periodic, so a low spread of
// inter-peak gaps means this joint is carrying the rep cycle rather than just
// jitter. Returns 0..1.
function rhythm(sig, rom) {
  if (rom < 10) return 0;
  const peaks = findPeaks(sig, rom * 0.4, 5);
  if (peaks.length < 2) return peaks.length === 1 ? 0.3 : 0;
  const gaps = [];
  for (let i = 1; i < peaks.length; i++) gaps.push(peaks[i].idx - peaks[i - 1].idx);
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  if (mean <= 0) return 0;
  const sd = Math.sqrt(gaps.reduce((a, g) => a + (g - mean) ** 2, 0) / gaps.length);
  return Math.max(0, Math.min(1, 1 - sd / mean));   // CV → regularity
}

// Below this, a joint is holding position rather than repping.
const STATIC_ROM_DEG = 18;

/**
 * Score every channel pair from the recorded angle series.
 * @param {Object} seriesByName e.g. { 'L KNE': [deg,…], 'R KNE': [...], … }
 * @returns {{kind:string, confidence:number, why:string, scores:Object}|null}
 */
export function channelFromPose(seriesByName) {
  if (!seriesByName) return null;
  const scores = {};
  let anyData = false;

  for (const kind of ['hip', 'knee', 'elbow', 'sho']) {
    const [ln, rn] = CHANNELS[kind];
    const sides = [seriesByName[ln], seriesByName[rn]]
      .filter(s => Array.isArray(s) && s.filter(isReal).length >= 8)
      .map(s => medianFilter(s));
    if (!sides.length) { scores[kind] = { rom: 0, rhythm: 0, score: 0 }; continue; }
    anyData = true;
    // Use the livelier side: unilateral work only moves one limb, and averaging
    // would halve its signal and lose to a bilateral joint that barely moved.
    const roms = sides.map(robustRange);
    const rom = Math.max(...roms);
    const best = sides[roms.indexOf(rom)];
    const rhy = rhythm(best, rom);
    scores[kind] = { rom, rhythm: rhy, score: rom * (0.35 + 0.65 * rhy) };
  }

  if (!anyData) return null;

  const ranked = Object.entries(scores).sort((a, b) => b[1].score - a[1].score);
  const [topKind, top] = ranked[0];
  const second = ranked[1] ? ranked[1][1].score : 0;

  // Everything static → an isometric / hold, not a failure to detect.
  if (top.rom < STATIC_ROM_DEG) {
    return { kind: 'none', confidence: 0.7, why: `all joints static (max ${top.rom.toFixed(0)}°)`, scores };
  }

  // Confidence from the margin over the runner-up: a clear winner is a clear
  // movement, a photo-finish means two joints moved together (e.g. a thruster).
  const margin = top.score <= 0 ? 0 : (top.score - second) / top.score;
  const confidence = Math.max(0.25, Math.min(0.9, 0.35 + margin));
  return {
    kind: topKind,
    confidence,
    why: `motion: ${topKind} ROM ${top.rom.toFixed(0)}°, rhythm ${(top.rhythm * 100).toFixed(0)}%`,
    scores,
  };
}

// ── FUSION ──────────────────────────────────────────────────────────────────

// A motion override needs to beat the name by this margin, so an ambiguous
// clip never overrules an authored title.
const OVERRIDE_MARGIN = 0.25;

/**
 * Fuse both signals into one decision.
 * @returns {{kind, channels, source, confidence, why, disagreement}}
 *   source: 'library' | 'name' | 'motion' | 'name+motion' | 'unknown'
 */
export function detectLift({ title, exercise, seriesByName } = {}) {
  // Isometric first — ahead of BOTH taxonomy and the lexicon. See
  // isIsometricTitle: authored taxonomy marks "ISO SL Superman Plank" as a
  // Horizontal Push, which would otherwise make a plank rep-countable.
  const name = isIsometricTitle(title)
    ? pack('none', 'name', 0.9, 'title: isometric/hold')
    : (channelFromTaxonomy(exercise) || channelFromTitle(title));
  const pose = channelFromPose(seriesByName);

  if (!name && !pose) {
    // Honest unknown. Callers should offer the manual override rather than
    // silently counting on an arbitrary joint (the old behaviour).
    return { ...pack('none', 'unknown', 0, 'no title match and no motion data'), disagreement: false };
  }
  if (!pose) return { ...name, disagreement: false };
  if (!name) return { ...pack(pose.kind, 'motion', pose.confidence, pose.why), disagreement: false };

  if (name.kind === pose.kind) {
    return {
      ...pack(name.kind, 'name+motion', Math.min(0.99, name.confidence + 0.1 * pose.confidence),
        `${name.why} + ${pose.why}`),
      disagreement: false,
    };
  }

  // Disagreement. Motion wins only when it is both confident AND materially
  // better than the name's own channel in the recorded signal.
  const nameScore = pose.scores?.[name.kind]?.score ?? 0;
  const poseScore = pose.scores?.[pose.kind]?.score ?? 0;
  const decisive = poseScore > 0
    && (nameScore <= 0 || (poseScore - nameScore) / poseScore >= OVERRIDE_MARGIN)
    && pose.confidence >= 0.5;

  return decisive
    ? { ...pack(pose.kind, 'motion', pose.confidence, `${pose.why} (overrode ${name.why})`), disagreement: true }
    : { ...pack(name.kind, 'name', name.confidence, `${name.why} (motion suggested ${pose.kind})`), disagreement: true };
}
