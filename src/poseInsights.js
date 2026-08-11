// poseInsights.js — turns raw analyzeClip() metrics into coaching insight.
//
// Two camera-only tools a generic app structurally can't offer:
//   detectFaults(result, title)  — plain-language technique flags per set
//   detectAsymmetry(jointRom)    — left/right ROM imbalance (injury screen)
//
// Both are geometry-grounded from the pose the camera already produces. Honest
// limit surfaced everywhere: 2D markerless pose gives approximate in-plane
// angles — these are flags to eyeball, never diagnoses.

const med = (arr) => {
  const a = (arr || []).filter((x) => typeof x === 'number' && isFinite(x)).sort((p, q) => p - q);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

// ---- Auto Form-Fault Detector -------------------------------------------
// result = analyzeClip output { kind, romTempo, velocity, jointRom, repCount }
export function detectFaults(result, title) {
  if (!result || !result.ok) return null;
  const faults = [], good = [];
  const t = (title || '').toLowerCase();
  const rt = result.romTempo, vel = result.velocity, jr = result.jointRom;
  const jn = jr ? Object.fromEntries(jr.map((j) => [j.name, j])) : {};
  const reps = (rt && rt.perRep ? rt.perRep.filter(Boolean) : []);

  // ROM collapse across the set (fatigue / cheat reps)
  if (rt && rt.collapsedCount >= 2) {
    faults.push({ sev: 'warn', msg: `${rt.collapsedCount} reps lost >15% of range`, why: 'depth is fading — the last reps aren\'t the same lift as the first. Fatigue or cheating range.' });
  } else if (reps.length >= 3 && rt && rt.collapsedCount === 0) {
    good.push('Full range held on every rep.');
  }

  // Eccentric control
  const eccs = reps.map((r) => r.ecc).filter((x) => x > 0);
  const medEcc = med(eccs);
  if (medEcc != null && medEcc < 0.55 && reps.length >= 3) {
    faults.push({ sev: 'warn', msg: `Dropping fast (~${medEcc.toFixed(1)}s lowering)`, why: 'almost no eccentric control — slow the negative for more stimulus and safer joints.' });
  } else if (medEcc != null && medEcc >= 1.0) {
    good.push(`Controlled ${medEcc.toFixed(1)}s eccentric.`);
  }

  // Velocity cliff (VBT junk-volume signal). Loss % can read >100 when a late
  // rep's net concentric goes negative (bounce/landing noise) — clamp the shown
  // number so it never claims a physically-impossible ">100% slower".
  if (vel && vel.finalLossPct >= 30) {
    const shown = Math.min(99, vel.finalLossPct);
    faults.push({ sev: 'bad', msg: `Last rep ${shown}% slower than the best`, why: 'past ~20–30% velocity loss the set is junk fatigue, not power — stop earlier if speed is the goal.' });
  } else if (vel && vel.finalLossPct != null && vel.finalLossPct < 20 && vel.perRep && vel.perRep.filter(Boolean).length >= 3) {
    good.push(`Bar speed held (${vel.finalLossPct}% loss) — quality reps throughout.`);
  }

  // Exercise-family geometry checks
  // Depth check is for grinding strength squats — NOT plyometrics, where a
  // short, stiff knee bend is the intended stimulus (flagging it is a false
  // positive that erodes trust). All families use \b word boundaries so a bare
  // substring can't misfire — "chin" must NOT match "maCHINe", "row" must NOT
  // match "naRROW", and a leg/calf/hack "press" is not an elbow-lockout lift.
  const isPlyo = /\b(jump|pogo|plyo|bound|hop|depth[-\s]?drop|snap[-\s]?down)\b/.test(t);
  const isSquat = !isPlyo && /\b(squat|lunge|split[-\s]?squat|step[-\s]?up|pistol|rfess|bulgarian)\b/.test(t);
  const isPress = (/\b(bench|ohp|overhead|shoulder\s*press|chest\s*press|push[-\s]?up|dip)\b/.test(t) || (/\bpress\b/.test(t) && !/\b(leg|calf|hack)\b/.test(t)));
  const isPull = /\bpull[-\s]?up|\bchin[-\s]?up|\brow\b|pull[-\s]?down|lat[-\s]?pull/.test(t);
  if (isSquat && jn['L KNE'] && jn['R KNE']) {
    const kneeMin = Math.min(jn['L KNE'].minDeg, jn['R KNE'].minDeg);
    if (kneeMin > 100) faults.push({ sev: 'warn', msg: `Stopping high (knee bends to ~${kneeMin}°)`, why: 'below parallel is roughly a 90° knee angle — he\'s cutting depth. Mobility or intent.' });
    else if (kneeMin <= 95) good.push('Hitting depth (below parallel).');
  }
  if (isPress && (jn['L ELB'] || jn['R ELB'])) {
    const elbMax = Math.max(jn['L ELB']?.maxDeg || 0, jn['R ELB']?.maxDeg || 0);
    if (elbMax && elbMax < 155) faults.push({ sev: 'warn', msg: `Short lockout (elbow to ~${elbMax}°)`, why: 'not finishing the press — cue full lockout or drop the load.' });
    else if (elbMax >= 165) good.push('Full lockout at the top.');
  }
  if (isPull && (jn['L ELB'] || jn['R ELB'])) {
    const elbMin = Math.min(jn['L ELB']?.minDeg ?? 180, jn['R ELB']?.minDeg ?? 180);
    if (elbMin > 60) faults.push({ sev: 'warn', msg: `Partial pull (elbow only to ~${elbMin}°)`, why: 'not pulling to full contraction — half reps at the top.' });
  }

  return { faults, good, note: '2D phone pose — angles are approximate. Flags to eyeball, not diagnoses.' };
}

// ---- VBT auto-regulation — the "Perch from a phone" read ----------------
// Velocity-loss within the set tells you where it stopped being the quality it
// was intended to be. Corpus cutoffs (Pareja-Blanco / Sánchez-Medina): ≤~20%
// velocity-loss preserves power + type-IIx and gives better jump/strength
// carry-over; ~20–30% is the general strength/hypertrophy band; >~35–40% only
// if you're deliberately chasing hypertrophy/junk volume. So for each goal we
// report the rep where his speed had dropped past that line — i.e. where he
// should have stopped for that goal. No hardware, from one filmed set.
export function velocityAutoreg(velocity) {
  if (!velocity || !Array.isArray(velocity.perRep)) return null;
  // Keep each rep's ORIGINAL physical position so "stop @ rep N" names the real
  // rep, matching the Set-Breakdown strip even when early reps went undetected.
  const reps = velocity.perRep.map((r, idx) => (r ? { ...r, _i: idx } : null)).filter(Boolean);
  if (reps.length < 3) return null;
  const vels = reps.map((r) => r.meanConcentric).filter((x) => typeof x === 'number' && x > 0);
  if (vels.length < 3) return null;
  // Reference = mean of the TWO fastest reps = fresh capacity, robust to a
  // single noisy spike (a lone fast late rep can't hijack the baseline).
  const top = [...vels].sort((a, b) => b - a);
  const ref = (top[0] + top[1]) / 2;
  if (!(ref > 0)) return null;
  // Skip the ramp-up: start scanning at the first rep actually up to speed
  // (within 8% of ref) so a sub-max opening rep never reads as "stop @ rep 1" —
  // but any real velocity dip AFTER he's up to speed is still caught (we scan
  // every rep from there, not just after a global peak that could mask a dip).
  let startScan = 0;
  for (let i = 0; i < reps.length; i++) { const v = reps[i].meanConcentric; if (typeof v === 'number' && v >= ref * 0.92) { startScan = i; break; } }
  const lossOf = (v) => (typeof v === 'number' && v > 0 ? (1 - v / ref) * 100 : null);
  const crossAt = (thr) => { for (let i = startScan; i < reps.length; i++) { const l = lossOf(reps[i].meanConcentric); if (l != null && l >= thr) return reps[i]._i + 1; } return null; };
  const finalLoss = typeof velocity.finalLossPct === 'number' ? velocity.finalLossPct : null;
  return {
    total: reps.length,
    powerRep: crossAt(20),      // stop here to keep it a POWER set
    generalRep: crossAt(30),    // strength/general
    hyperRep: crossAt(40),      // only worth it for hypertrophy past here
    finalLoss,
    bestMean: velocity.bestMean,
  };
}

// ---- Movement Asymmetry / Injury Screen ---------------------------------
const PAIRS = [
  ['Shoulders', 'L SHO', 'R SHO'],
  ['Elbows', 'L ELB', 'R ELB'],
  ['Hips', 'L HIP', 'R HIP'],
  ['Knees', 'L KNE', 'R KNE'],
];
// Only screen the joints that actually DRIVE the movement — a passive joint
// (elbows on a deadlift, that just hold the bar) reads noisy 2D asymmetry and
// would fire a false "screen this limb" flag. Lower lifts → hips/knees; upper
// push/pull → shoulders/elbows; unknown/full-body → screen all (safe default).
// A single-side lift (split squat, RFESS, single-arm/leg, pistol) works one side
// per set BY DESIGN — comparing L vs R within one clip flags the stance, not a
// deficit. The honest read there is the SAME side over time (the injury trend),
// not within-clip L/R. So we skip the symmetry screen entirely for these.
function isUnilateral(title) {
  const t = (title || '').toLowerCase();
  return /\b(single[-\s]?arm|single[-\s]?leg|one[-\s]?arm|one[-\s]?leg|unilateral|split[-\s]?squat|bulgarian|rfess|pistol|staggered|b[-\s]?stance|skater|1[-\s]?arm|1[-\s]?leg)\b/.test(t)
    || /\bsl\b/.test(t) || /\bsa\b/.test(t)
    || /(חד[-\s]?צדדי|רגל אחת|יד אחת)/.test(t); // Hebrew: unilateral / single-leg / single-arm
}
function relevantJoints(title) {
  const t = (title || '').toLowerCase();
  if (!t) return null;
  const plyo = /\b(jump|pogo|plyo|bound|hop|depth|snap[-\s]?down|leap|skip)\b/.test(t) || /(קפיצ|ניתור)/.test(t);
  const lower = plyo || /\b(squat|lunge|split|pistol|rfess|bulgarian|step[-\s]?up|deadlift|rdl|hinge|hip[-\s]?thrust|glute|leg[-\s]?press|leg[-\s]?curl|leg[-\s]?ext|calf|good[-\s]?morning|nordic)\b/.test(t)
    || /(סקוואט|פיתה|דדליפט|לאנג|מתפרק|ירך|תאום)/.test(t); // Hebrew lower-body cues
  const upper = (/\b(bench|ohp|overhead|shoulder[-\s]?press|chest[-\s]?press|push[-\s]?up|dip|\brow\b|pull[-\s]?up|chin[-\s]?up|pull[-\s]?down|lat[-\s]?pull|\bfly\b|lateral[-\s]?raise|front[-\s]?raise|shrug|face[-\s]?pull|bicep|tricep)\b/.test(t)
    || /(לחיצת חזה|לחיצת כתפ|חתירה|מתח|פרפר|כפיפת מרפק|יד)/.test(t)) && !/\bleg\b/.test(t); // Hebrew upper-body cues
  if (lower && !upper) return new Set(['Hips', 'Knees']);
  if (upper && !lower) return new Set(['Shoulders', 'Elbows']);
  return null; // ambiguous or full-body → screen everything
}

// jointRom = analyzeClip().jointRom = [{ name, maxDeg, minDeg, romDeg, samples }]
export function detectAsymmetry(jointRom, title) {
  if (!jointRom || !jointRom.length) return null;
  if (isUnilateral(title)) return { rows: [], worst: null, flagged: [], unilateral: true, note: 'Single-side lift — comparing left vs right in one clip isn\'t fair (one side is the working side by design). Track the working side over time in the injury trend instead.' };
  const byName = Object.fromEntries(jointRom.map((j) => [j.name, j]));
  const isFin = (x) => typeof x === 'number' && isFinite(x);
  const relevant = relevantJoints(title);
  const rows = [];
  for (const [label, ln, rn] of PAIRS) {
    if (relevant && !relevant.has(label)) continue; // skip joints not driving this lift
    const L = byName[ln], R = byName[rn];
    if (!L || !R || !isFin(L.romDeg) || !isFin(R.romDeg)) continue;
    const mx = Math.max(L.romDeg, R.romDeg), mn = Math.min(L.romDeg, R.romDeg);
    // A left/right read is only meaningful when BOTH sides are actively working
    // (a bilateral movement). A near-static side — single-arm/leg press, pistol,
    // split squat, walking lunge, alternating curl — is not an imbalance and must
    // never fabricate a 90% "injury" flag. Require both sides moving (mn≥30) and
    // reject implausible gaps that can only be a laterality/measurement artifact.
    if (mn < 30 || mx < 25) continue;
    const asymPct = Math.round((Math.abs(L.romDeg - R.romDeg) / mx) * 100);
    if (asymPct >= 55) continue; // no true bilateral imbalance is this large — it's one side not working
    const severity = asymPct >= 20 ? 'high' : asymPct >= 12 ? 'mod' : 'ok';
    rows.push({ joint: label, left: L.romDeg, right: R.romDeg, asymPct, severity, weaker: L.romDeg < R.romDeg ? 'Left' : 'Right' });
  }
  if (!rows.length) return null;
  const worst = rows.reduce((m, r) => (r.asymPct > m.asymPct ? r : m), rows[0]);
  const flagged = rows.filter((r) => r.severity !== 'ok');
  return { rows, worst, flagged, note: '2D pose reads in-plane travel only — a real flag is worth screening in person, not a diagnosis.' };
}
