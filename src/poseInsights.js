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
  // positive that erodes trust).
  const isPlyo = /jump|pogo|plyo|bound|hop|depth[-\s]?drop|snap[-\s]?down/.test(t);
  const isSquat = !isPlyo && /squat|lunge|split|step[-\s]?up|pistol|rfess|bulgarian/.test(t);
  const isPress = /press|push[-\s]?up|dip|bench|ohp|overhead/.test(t);
  const isPull = /pull[-\s]?up|chin|row|pulldown|lat[-\s]?pull/.test(t);
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

// ---- Movement Asymmetry / Injury Screen ---------------------------------
const PAIRS = [
  ['Shoulders', 'L SHO', 'R SHO'],
  ['Elbows', 'L ELB', 'R ELB'],
  ['Hips', 'L HIP', 'R HIP'],
  ['Knees', 'L KNE', 'R KNE'],
];
// jointRom = analyzeClip().jointRom = [{ name, maxDeg, minDeg, romDeg, samples }]
export function detectAsymmetry(jointRom) {
  if (!jointRom || !jointRom.length) return null;
  const byName = Object.fromEntries(jointRom.map((j) => [j.name, j]));
  const rows = [];
  for (const [label, ln, rn] of PAIRS) {
    const L = byName[ln], R = byName[rn];
    if (!L || !R) continue;
    const mx = Math.max(L.romDeg, R.romDeg);
    if (mx < 25) continue; // ignore joints barely moving (not the working joint)
    const asymPct = Math.round((Math.abs(L.romDeg - R.romDeg) / mx) * 100);
    const severity = asymPct >= 20 ? 'high' : asymPct >= 12 ? 'mod' : 'ok';
    rows.push({ joint: label, left: L.romDeg, right: R.romDeg, asymPct, severity, weaker: L.romDeg < R.romDeg ? 'Left' : 'Right' });
  }
  if (!rows.length) return null;
  const worst = rows.reduce((m, r) => (r.asymPct > m.asymPct ? r : m), rows[0]);
  const flagged = rows.filter((r) => r.severity !== 'ok');
  return { rows, worst, flagged, note: '2D pose reads in-plane travel only — a real flag is worth screening in person, not a diagnosis.' };
}
