// lineageAnalysis.js — the "plan vs reality" engine behind Training Lineage v2.
//
// Every read here is computed from what the athlete ACTUALLY logged
// (client_workouts per-set load/reps/rpe/done) measured against what was
// prescribed — never from the plan alone. Grounded in the S&C corpus
// (SYNTHESIS-programming-reference): Epley e1RM, Gabbett ACWR bands,
// RP autoregulation / RPE-drift deload trigger, Prilepin/MRV miss-rate,
// Sánchez-Medina velocity-loss (camera tier).
//
// Design rule from the spec: a blunt read that's always populated beats a
// perfect one with no data. So every analysis returns an explicit
// { state: 'ok' | 'thin', ... } and thin states are surfaced, never faked.
// Nothing in here mutates a plan — it analyses and advises.
//
// INPUT CONTRACT (produced by the glue in PlansView from plans + client_workouts):
//   sessions: [{
//     date:  Date | ms,            // session date
//     week:  number,               // block week (1-based) if known
//     exercises: [{
//       title:  string,            // resolved exercise title (plan-row title)
//       pattern: string | null,    // movement pattern from library meta, if tagged
//       sets: [{ load:number|null, reps:number|null, rpe:number|null,
//                done:boolean, prescribedReps:number|null, prescribedRpe:number|null }]
//     }]
//   }]
// All analyses tolerate missing fields (null) and degrade to a thin state.

// ---- small helpers -------------------------------------------------------
const num = (x) => (typeof x === 'number' && isFinite(x) ? x : null);
const ms = (d) => (d instanceof Date ? d.getTime() : (typeof d === 'number' ? d : Date.parse(d)));
const median = (arr) => {
  const a = arr.filter((x) => x != null).sort((p, q) => p - q);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

// Epley e1RM, capped at 12 reps (Epley error compounds badly above that).
export function e1RM(load, reps) {
  const L = num(load), R = num(reps);
  if (L == null || R == null || R < 1 || L <= 0) return null; // a 0-load bodyweight rep is not a strength data point
  if (R > 12) return null; // suppress false precision; caller greys it out
  return L * (1 + R / 30);
}

// Top set of an exercise-instance: max load, ties broken by reps
// (same rule as OverloadChart). Returns the set object or null.
export function topSet(sets) {
  let best = null;
  for (const s of sets || []) {
    if (num(s.load) == null) continue;
    if (!best || s.load > best.load || (s.load === best.load && (num(s.reps) || 0) > (num(best.reps) || 0))) best = s;
  }
  return best;
}

// Group session-exercises into per-lift time series (chronological top sets).
export function perLiftSeries(sessions) {
  const byLift = new Map();
  const ordered = [...sessions].sort((a, b) => ms(a.date) - ms(b.date));
  for (const sess of ordered) {
    for (const ex of sess.exercises || []) {
      const ts = topSet(ex.sets);
      if (!ts) continue;
      if (!byLift.has(ex.title)) byLift.set(ex.title, []);
      byLift.get(ex.title).push({
        date: ms(sess.date), week: sess.week,
        load: num(ts.load), reps: num(ts.reps), rpe: num(ts.rpe),
        prescribedReps: num(ts.prescribedReps),   // for the rep-scheme trend guard (H2b)
        e1: e1RM(ts.load, ts.reps),
      });
    }
  }
  return byLift;
}

// ---- #8 Adherence (the gate) --------------------------------------------
export function adherence(sessions, plannedSessionCount) {
  let setsDone = 0, setsPrescribed = 0, exWithPlan = 0;
  const perWeekSkips = {};
  for (const sess of sessions) {
    for (const ex of sess.exercises || []) {
      const done = (ex.sets || []).filter((s) => s.done).length;
      setsDone += done;
      // prescribed set count: use prescribed if any set carries it, else set count
      const presc = (ex.sets || []).length;
      setsPrescribed += presc;
      if (presc) exWithPlan++;
    }
  }
  const loggedSessions = sessions.length;
  const sessionPct = plannedSessionCount ? Math.round((loggedSessions / plannedSessionCount) * 100) : null;
  const setsPct = setsPrescribed ? Math.round((setsDone / setsPrescribed) * 100) : null;
  return {
    state: loggedSessions ? 'ok' : 'thin',
    loggedSessions, plannedSessionCount: plannedSessionCount || null,
    sessionPct, setsPct, setsDone, setsPrescribed,
  };
}

// ---- #1 Stale-weight (+ RPE hard/easy split) ----------------------------
// series: chronological [{load, rpe, e1}]. Stale = top-set load unchanged
// (±2.5%) across >=3 consecutive sessions. Split by RPE trend.
export function staleWeight(series) {
  if (!series || series.length < 3) return { state: 'thin', have: series ? series.length : 0, need: 3 };
  const last3 = series.slice(-3);
  const loads = last3.map((s) => s.load).filter((x) => x != null);
  if (loads.length < 3) return { state: 'thin', have: loads.length, need: 3 };
  const base = loads[0];
  const flat = loads.every((l) => Math.abs(l - base) <= base * 0.025);
  if (!flat) return { state: 'ok', stale: false };
  // Flat LOAD but RISING reps = rep-progression (adding reps at a held weight — a
  // normal way to progress, often by design), NOT a stuck lift. Don't brand it
  // stale (which feeds a "deload / change the lift" verdict); e1RM/weeksSincePr
  // already credit the rep gain.
  const repsSeq = last3.map((s) => s.reps).filter((x) => typeof x === 'number');
  if (repsSeq.length >= 2 && repsSeq[repsSeq.length - 1] - repsSeq[0] >= 1) return { state: 'ok', stale: false };
  const rpes = last3.map((s) => s.rpe).filter((x) => x != null);
  let mode = 'unknown';
  if (rpes.length >= 2) mode = (rpes[rpes.length - 1] - rpes[0] >= 0.5) ? 'hard' : 'easy';
  return { state: 'ok', stale: true, mode, load: base, sessions: last3.length };
}

// ---- #2 e1RM trend ------------------------------------------------------
// Linear slope of e1RM across the block. Returns direction + pts for spark.
export function e1rmTrend(series) {
  const rows = (series || []).filter((s) => s.e1 != null);
  if (rows.length < 3) return { state: 'thin', have: rows.length, need: 3 };
  const pts = rows.map((s) => s.e1);
  // least-squares slope-per-step as a % of the mean, over an arbitrary series.
  const slopePctOf = (arr) => {
    const m = arr.length;
    if (m < 2) return 0;
    const axs = arr.map((_, i) => i);
    const amx = axs.reduce((a, b) => a + b, 0) / m;
    const amy = arr.reduce((a, b) => a + b, 0) / m;
    let nu = 0, de = 0;
    for (let i = 0; i < m; i++) { nu += (axs[i] - amx) * (arr[i] - amy); de += (axs[i] - amx) ** 2; }
    const sl = de ? nu / de : 0;
    return amy ? (sl / amy) * 100 : 0;
  };
  const pctPerStep = slopePctOf(pts);
  // Rep-scheme guard: e1RM conflates load with reps, so an intensification block
  // (5→3→1 at RISING load — real strength UP) yields a NEGATIVE e1RM slope and
  // would fire a false "slipping → back off". If the top-set reps swing widely
  // across the series, the slope is a rep artifact, not a strength change — don't
  // call a direction; the UI reads it as "reps varied, e1RM trend unreliable".
  const repsArr = rows.map((s) => s.reps).filter((x) => typeof x === 'number');
  const repNoisy = repsArr.length >= 3 && (Math.max(...repsArr) - Math.min(...repsArr)) >= 3;
  let dir = 'flat';
  if (!repNoisy) { if (pctPerStep > 1.2) dir = 'up'; else if (pctPerStep < -1.2) dir = 'down'; }
  // Single-outlier robustness (review H2, load noise): a direction that REVERSES
  // when any one log is dropped rests on a single back-off/PR day, not a trend —
  // don't call it. Only sign-reversal suppresses (a modest real trend keeps its
  // sign when one point goes), so this never over-flattens genuine slips.
  if (dir !== 'flat' && pts.length >= 4) {
    for (let k = 0; k < pts.length; k++) {
      const loo = slopePctOf(pts.filter((_, i) => i !== k));
      if (Math.sign(loo) !== Math.sign(pctPerStep)) { dir = 'flat'; break; }
    }
  }
  // Rep-scheme intensification (review H2, rep-shift half): an e1RM 'down' while the
  // LOAD isn't falling AND he's HITTING his prescribed reps = the drop is fewer
  // PRESCRIBED reps (intensification / peaking), not the athlete weakening. Catches
  // the 2-rep scheme shift that slips past repNoisy. Guarded both ways: if the load
  // is falling it may be real weakening (keep 'down'); if he's MISSING prescribed
  // reps it's real (keep 'down'). Only the unambiguous case flips to flat.
  if (dir === 'down') {
    const hits = rows.map((s) => (typeof s.reps === 'number' && typeof s.prescribedReps === 'number') ? s.reps >= s.prescribedReps : null).filter((x) => x != null);
    const loads = rows.map((s) => s.load).filter((x) => typeof x === 'number' && x > 0);
    const loadPct = loads.length >= 3 ? slopePctOf(loads) : null;
    if (hits.length >= 2 && hits.every(Boolean) && loadPct != null && loadPct > -1.2) dir = 'flat';
  }
  return { state: 'ok', dir, latest: Math.round(pts[pts.length - 1]), pts, slopePct: pctPerStep, repNoisy };
}

// ---- #3 RPE drift (autoregulation) --------------------------------------
// drift = logged RPE - target RPE, trend across sessions. Target from plan,
// else inferred zone (caller passes inferredTarget).
export function rpeDrift(series, plannedTarget) {
  const withRpe = (series || []).filter((s) => s.rpe != null);
  if (withRpe.length < 2) return { state: 'thin', have: withRpe.length, need: 2 };
  const target = num(plannedTarget);
  if (target == null) {
    // no target: report raw RPE trend direction only
    const first = withRpe[0].rpe, last = withRpe[withRpe.length - 1].rpe;
    return { state: 'ok', hasTarget: false, rising: last - first >= 1, delta: +(last - first).toFixed(1) };
  }
  const drifts = withRpe.map((s) => s.rpe - target);
  const avg = drifts.reduce((a, b) => a + b, 0) / drifts.length;
  const rising = drifts[drifts.length - 1] - drifts[0] >= 0.5;
  return { state: 'ok', hasTarget: true, avgDrift: +avg.toFixed(1), rising, target };
}

// ---- #4 Failed-reps / miss-rate -----------------------------------------
// % of top sets where reps < prescribedReps (or done=false). Per lift.
export function missRate(sessions, title) {
  let short = 0, total = 0;
  for (const sess of sessions) {
    for (const ex of sess.exercises || []) {
      if (ex.title !== title) continue;
      for (const s of ex.sets || []) {
        const reps = num(s.reps);
        if (reps == null) continue; // only sets actually attempted (reps logged)
        total++;
        const pr = num(s.prescribedReps);
        if (pr != null && reps < pr) short++;
      }
    }
  }
  if (!total) return { state: 'thin' };
  return { state: 'ok', pct: Math.round((short / total) * 100), short, total };
}

// Roster/block-wide miss-rate split into upper vs lower (rough pattern guess).
export function missRateByRegion(sessions) {
  const lowerRx = /squat|lunge|deadlift|rdl|hinge|leg|glute|hip thrust|calf|step[-\s]?up|split/i;
  const agg = { lower: { short: 0, total: 0 }, upper: { short: 0, total: 0 } };
  for (const sess of sessions) {
    for (const ex of sess.exercises || []) {
      const bucket = lowerRx.test(ex.title || '') ? agg.lower : agg.upper;
      for (const s of ex.sets || []) {
        // "Grinding" = he ATTEMPTED the set and fell short of target. Only
        // count sets with real reps logged. A done=false set with no reps is
        // non-completion (an adherence issue, already in the gate) — counting
        // it as a "miss" fabricated a fatigue/deload verdict on athletes who
        // simply prefill a whole block and log it partially.
        const reps = num(s.reps);
        if (reps == null) continue;
        bucket.total++;
        const pr = num(s.prescribedReps);
        if (pr != null && reps < pr) bucket.short++;
      }
    }
  }
  // Need a real denominator before a "grinding %" means anything — 1 short set of
  // 2 logged is noise, not fatigue (fresh-context review H4). Below ~4 top sets in
  // the region, return null so it can't fabricate a deload contributor.
  const pct = (b) => (b.total >= 4 ? Math.round((b.short / b.total) * 100) : null);
  return { lower: { ...agg.lower, pct: pct(agg.lower) }, upper: { ...agg.upper, pct: pct(agg.upper) } };
}

// ---- #5 Completed-tonnage ACWR ------------------------------------------
// tonnage = Σ(load*reps) per session. Acute=7d, Chronic=28d avg weekly.
export function tonnageACWR(sessions, nowMs) {
  const dayMs = 86400000;
  const sessTon = sessions.map((s) => {
    let t = 0;
    for (const ex of s.exercises || []) for (const st of ex.sets || []) {
      if (num(st.load) != null && num(st.reps) != null && st.done !== false) t += st.load * st.reps;
    }
    return { t, date: ms(s.date) };
  }).filter((s) => isFinite(s.date));
  // Trailing per-session tonnage (Σ load×reps), chronological — so the UI can graph
  // the VOLUME trend even before there's enough history for a real ACWR ratio.
  const series = sessTon.slice().sort((a, b) => a.date - b.date).slice(-14).map((s) => Math.round(s.t)).filter((t) => t > 0);
  if (!sessTon.length) return { state: 'thin', haveDays: 0, need: 28, series };
  const now = nowMs || Math.max(...sessTon.map((s) => s.date));
  // Only the trailing 28 days form the chronic baseline. Measure coverage
  // WITHIN that window (now − oldest in-window session), NOT since the athlete's
  // first-ever session — otherwise a single recent week beside an old block
  // divides ~acute by 4 and fabricates a ~4.0 spike (the spec's cardinal sin).
  const recent = sessTon.filter((s) => now - s.date <= 28 * dayMs);
  const inSpan = (now - Math.min(...recent.map((s) => s.date))) / dayMs;
  // The chronic baseline must be built from sessions OUTSIDE the acute week —
  // otherwise a returning logger (one old session + a busy current week) has a
  // baseline made of this week's own load, which inflates the ratio into a fake
  // "load spiked → deload him". Require ≥3 sessions in days 8–28.
  const chronicSessions = recent.filter((s) => now - s.date > 7 * dayMs);
  if (inSpan < 21 || recent.length < 4 || chronicSessions.length < 3) return { state: 'thin', haveDays: Math.round(inSpan), need: 28, series };
  const acute = recent.filter((s) => now - s.date <= 7 * dayMs).reduce((a, b) => a + b.t, 0);
  const chronicTotal = recent.reduce((a, b) => a + b.t, 0);
  const chronicWeekly = chronicTotal / Math.max(1, inSpan / 7); // divide by weeks with actual data
  if (!chronicWeekly) return { state: 'thin', haveDays: Math.round(inSpan), need: 28, series };
  const acwr = acute / chronicWeekly;
  let band = 'ok';
  if (acwr >= 1.5) band = 'high'; else if (acwr < 0.8) band = 'low';
  return { state: 'ok', acwr: +acwr.toFixed(2), band, series };
}

// ---- #7 Movement-pattern coverage ---------------------------------------
const CORE_PATTERNS = ['Hip Hinge', 'Squat', 'Horizontal Push', 'Horizontal Pull', 'Vertical Push', 'Vertical Pull', 'Carry/Loaded Locomotion', 'Rotation/Anti-Rotation'];
export function patternCoverage(sessions) {
  const counts = {}; let unclassified = 0;
  for (const p of CORE_PATTERNS) counts[p] = 0;
  for (const sess of sessions) {
    for (const ex of sess.exercises || []) {
      const setsDone = (ex.sets || []).filter((s) => s.done !== false).length;
      if (ex.pattern && counts[ex.pattern] != null) counts[ex.pattern] += setsDone;
      else if (ex.pattern) { counts[ex.pattern] = (counts[ex.pattern] || 0) + setsDone; }
      else unclassified += setsDone;
    }
  }
  const gaps = CORE_PATTERNS.filter((p) => counts[p] === 0);
  return { state: 'ok', counts, gaps, unclassified };
}

// ---- Verdict synthesis ---------------------------------------------------
// Turn the reads into the one-line "if you read one thing" call + confidence.
export function synthesizeVerdict({ adh, region, staples, acwr, velocity }) {
  const flags = [];
  const lowerGrind = region?.lower?.pct != null && region.lower.pct >= 25;
  const anyHardStale = staples.some((s) => !s.ballistic && s.isMain && s.stale?.stale && s.stale.mode === 'hard');
  // Ballistic lifts are meant to be moved light + fast — a falling e1RM on a
  // filmed speed-squat/jump is correct programming, NOT a fatigue signal. Never
  // let it drive a "deload him" verdict (the row already reads EXPLOSIVE).
  // Systemic fatigue shows in the MAIN compound lifts — a lone accessory (curl,
  // raise, fly) drifting down is not a reason to deload a progressing athlete
  // (fresh-context review H1). Require a primary lift regressing.
  const anyDropping = staples.some((s) => !s.ballistic && s.isMain && s.trend?.dir === 'down');
  const highAcwr = acwr?.state === 'ok' && acwr.band === 'high';
  const velHigh = velocity?.state === 'ok' && velocity.lossPct >= 20;

  if (lowerGrind || anyHardStale || anyDropping || highAcwr || velHigh) {
    flags.push('fatigue');
  }
  const lowAdh = adh?.sessionPct != null && adh.sessionPct < 80;
  // A "deload him" verdict needs enough logged data to trust the fatigue read. With
  // <3 logged sessions the signal (often an accessory-lift e1RM dip that's noise or
  // one light day) can't justify deloading — he may simply not be LOGGING, not
  // over-reaching. Below this bar the honest call is "get him logging first", never
  // "deload him". (Confidence is already 'low' here too.)
  const tooThinToDeload = (adh?.loggedSessions || 0) < 3;

  const fatigueBits = () => {
    const bits = [];
    if (lowerGrind) bits.push(`missing ${region.lower.pct}% of lower-body top sets`);
    if (anyDropping) bits.push(`${staples.find((s) => !s.ballistic && s.isMain && s.trend?.dir === 'down')?.title} e1RM slipping`);
    if (velHigh) bits.push(`bar speed down ${velocity.lossPct}% on the last filmed set`);
    if (highAcwr) bits.push(`load ratio spiked to ${acwr.acwr}`);
    return bits;
  };

  let headline, sub, tone = 'warn';
  if (flags.includes('fatigue') && !tooThinToDeload) {
    const hardStaleLift = staples.find((s) => !s.ballistic && s.isMain && s.stale?.stale && s.stale.mode === 'hard');
    headline = hardStaleLift
      ? `Deload — then change the ${hardStaleLift.title}, don't just add weight.`
      : `Deload him — he's accumulating more fatigue than he's recovering from.`;
    const bits = fatigueBits();
    sub = bits.length ? `${bits.join(', ')} — that's fatigue, not laziness.` : 'Multiple fatigue signals are stacking up.';
  } else if (flags.includes('fatigue') && tooThinToDeload) {
    // Fatigue signals exist but on too little data to act on — surface them, but
    // point the coach at logging, not a deload.
    tone = 'info';
    const n = adh?.loggedSessions || 0;
    headline = `Get him logging before you deload — only ${n} session${n === 1 ? '' : 's'} in, the fatigue read isn't trustworthy yet.`;
    const bits = fatigueBits();
    sub = `${bits.length ? `${bits.join(', ')} — but ` : ''}off this little data that could be noise or one light day. Confirm with a few more logs before backing load off.`;
  } else if (lowAdh) {
    tone = 'info';
    headline = `Before programming — get him training. He logged ${adh.sessionPct}% of sessions.`;
    sub = 'Low adherence makes every load signal below unreliable. This is a check-in conversation first, a programming decision second.';
  } else {
    tone = 'ok';
    // "Progressing" must match the responding-split's ✓Working exactly (main,
    // non-ballistic, up AND not stale) — else the headline can say "keep adding
    // load on X" while the responding section lists the same X as "stuck". A
    // stale-but-up lift isn't climbing, and kg isn't the read on a ballistic lift.
    const progressing = staples.filter((s) => !s.ballistic && s.isMain && !s.stale?.stale && s.trend?.dir === 'up').map((s) => s.title);
    headline = progressing.length ? `He's responding — keep progressing.` : `Steady block — nothing's flashing red.`;
    sub = progressing.length
      ? `${progressing.slice(0, 3).join(', ')} climbing at an on-target effort. Keep adding load next block.`
      : 'Loads and effort are holding. Progress where he has room, hold where he doesn\'t.';
  }
  // confidence from data density
  const conf = (adh?.sessionPct >= 70 && adh?.setsPct >= 60) ? 'high' : (adh?.loggedSessions >= 3 ? 'medium' : 'low');
  return { headline, sub, tone, confidence: conf, logs: !!adh?.loggedSessions };
}

export { CORE_PATTERNS };

// ---- GLUE: raw plans + client_workouts → normalized sessions --------------
// Isolates the app's data shapes from the pure analyses above. Aligns logged
// workouts to the athlete's LATEST block and joins each logged set to its
// prescribed reps/RPE via (planName/dayName/week + eid). Pass in the app's
// helpers (blockNum, classifyPattern, repsTop, exMap) so this module stays
// framework-free and testable.
//   plans:          [{ id, name, weeks, days:[{ name, exercises:[{exerciseId, title, sets, reps, rpe }] }] }]
//   clientWorkouts: [{ clientId, planName, dayName, week, date, exercises:[{ eid, title, sets:[{reps,load,rpe,done}] }] }]
export function buildBlockSessions(clientWorkouts, traineeId, plans, deps, opts = {}) {
  const { blockNum, classifyPattern, exMap } = deps;
  const { allBlocks = false, targetBlockNum = null } = opts;
  const pf = (x) => { const n = parseFloat(x); return isFinite(n) ? n : null; };
  const norm = (s) => (s || '').trim().toLowerCase();
  // Prescribed-reps threshold for the failed-reps read = the LOW end of the
  // range, not the top. "8–10" is HIT at 8; "10/8/6" descending is hit at 6.
  // Using the top (repsTop) counted every on-target sub-ceiling rep as a miss,
  // inflating the "grinding" signal into a false deload verdict.
  const minReps = (r) => { const ns = String(r == null ? '' : r).match(/\d+(?:\.\d+)?/g); return ns && ns.length ? Math.min(...ns.map(Number)) : null; };

  const withDays = (plans || []).filter((p) => (p.days || []).some((d) => (d.exercises || []).length));
  if (!withDays.length) return { sessions: [], plannedSessionCount: 0, blockName: null, blockNumber: null, hasPlans: false, blocks: [] };
  // latest block = highest block number, else last in query order
  const ordered = [...withDays].sort((a, b) => {
    const an = blockNum(a.name), bn = blockNum(b.name);
    if (an != null && bn != null) return an - bn;
    if (an == null && bn == null) return 0;
    return an == null ? -1 : 1; // un-numbered plans sort as OLDEST (front), so the highest-numbered block is "latest"
  });
  // The block to analyse: the requested one (previous-block viewing), else the
  // latest. The full ordered list is returned so the UI can offer a block picker.
  const latest = (targetBlockNum != null ? ordered.find((p) => blockNum(p.name) === targetBlockNum) : null) || ordered[ordered.length - 1];
  const latestNum = blockNum(latest.name);
  const blocks = ordered.map((p) => ({ num: blockNum(p.name), name: p.name })).reverse(); // newest first for the picker

  // prescription lookup: (dayName, eid|title) → { prescribedReps, prescribedRpe, pattern }.
  // For staples we want cross-block history, so allBlocks pulls prescriptions
  // from every plan; the latest-block view only needs the current block.
  const presc = new Map();
  const prescPlans = allBlocks ? withDays : [latest];
  for (const p of prescPlans) {
    for (const d of p.days || []) {
      for (const ex of d.exercises || []) {
        const lib = ex.exerciseId && exMap ? exMap.get(ex.exerciseId) : null;
        const title = (ex.title || lib?.title || '').trim();
        const pattern = classifyPattern ? classifyPattern(title, lib) : null;
        const keyEid = ex.exerciseId ? `${norm(d.name)}|${ex.exerciseId}` : null;
        const keyTitle = `${norm(d.name)}|t:${norm(title)}`;
        const rec = { prescribedReps: minReps(ex.reps), prescribedRpe: pf(ex.rpe), pattern, title };
        if (keyEid && !presc.has(keyEid)) presc.set(keyEid, rec);
        if (!presc.has(keyTitle)) presc.set(keyTitle, rec);
      }
    }
  }

  // workouts for this athlete — latest block only, or all blocks for staples
  const mine = (clientWorkouts || []).filter((w) => {
    if (String(w.clientId) !== String(traineeId)) return false;
    if (allBlocks) return true;
    if (w.planName === latest.name) return true;
    return latestNum != null && blockNum(w.planName) === latestNum;
  });

  const sessions = mine.map((w) => ({
    date: w.date, week: w.week, day: w.dayName,
    exercises: (w.exercises || []).map((ex) => {
      const title = (ex.title || '').trim();
      const p = (ex.eid && presc.get(`${norm(w.dayName)}|${ex.eid}`)) || presc.get(`${norm(w.dayName)}|t:${norm(title)}`) || null;
      return {
        title: title || p?.title || 'Exercise',
        pattern: p?.pattern || (classifyPattern ? classifyPattern(title, null) : null),
        sets: (ex.sets || []).map((s) => ({
          load: pf(s.load), reps: pf(s.reps), rpe: pf(s.rpe),
          done: s.done !== false && (pf(s.load) != null || pf(s.reps) != null),
          prescribedReps: p?.prescribedReps ?? null, prescribedRpe: p?.prescribedRpe ?? null,
        })),
      };
    }),
  }));

  // planned session count for the block: days × weeks
  // weeks may be an array, a number, or a numeric STRING ("4") — Number() handles
  // all three; num() rejected the string and collapsed it to 1, undercounting
  // plannedSessionCount and letting sessionPct exceed 100%.
  const wRaw = Array.isArray(latest.weeks) ? latest.weeks.length : Number(latest.weeks);
  const weeks = (isFinite(wRaw) && wRaw > 0) ? wRaw : 1;
  const plannedSessionCount = (latest.days || []).length * weeks;

  const plannedDays = (latest.days || []).map((d) => d.name || 'Day');
  return { sessions, plannedSessionCount, plannedDays, weeks, blockName: latest.name, blockNumber: latestNum, hasPlans: true, totalBlocks: withDays.length, blocks };
}

// Which planned day is the athlete skipping? Returns the day with the biggest
// (expected − logged) gap, so "always Day 4" reads as a pattern, not noise.
export function skipPattern(sessions, plannedDays, weeks) {
  if (!plannedDays || !plannedDays.length || !weeks) return null;
  const logged = {};
  for (const s of sessions) { const d = (s.day || '').trim(); if (d) logged[d] = (logged[d] || 0) + 1; }
  // If NO planned day name matches any logged day name, the two naming schemes
  // diverge — every day would read as "0 logged" and we'd falsely brand an
  // athlete who trained daily as skipping. Suppress rather than fabricate.
  if (!plannedDays.some((d) => logged[d] != null)) return null;
  let worst = null;
  for (const d of plannedDays) {
    const gap = weeks - (logged[d] || 0);
    if (gap > 0 && (!worst || gap > worst.gap)) worst = { day: d, gap, logged: logged[d] || 0, expected: weeks };
  }
  // A skip PATTERN means he attends his other days but consistently misses THIS
  // one — so the worst day must be logged clearly LESS than his best-attended day.
  // If every day is missed about equally, he's just under-logging globally (an
  // adherence story, already in the gate) — don't single a day out as "a pattern"
  // (that misreads a sparse logger as selectively avoiding one day). Needs a real
  // differential: best-attended day logged ≥2 more times than the worst.
  const maxLogged = Math.max(0, ...plannedDays.map((d) => logged[d] || 0));
  if (worst && (maxLogged - worst.logged) < 2) return null;
  return worst;
}

// One-call analysis producing everything the view renders.
// Per-block character over the athlete's whole history — the "lineage" of the
// PROGRAMMING (not just the lifts). Groups his logged sets by block and reads
// each block's emphasis from the reps he actually did: low = strength, mid =
// hypertrophy, high = volume/endurance. Lets the coach see the periodization arc
// and decide what phase should come next.
export function blockHistory(plans, deps) {
  const { blockNum } = deps;
  // Read each block's INTENDED character from the PRESCRIBED plan (always
  // present, spans every block) — not from logged reps, which for a sparse
  // logger concentrate in the current block and would hide the arc. Character =
  // the block's typical prescribed rep range: <6 strength, 6-10 hypertrophy,
  // 10+ volume. This is the periodization Ohad actually PROGRAMMED, block over
  // block — the true "programming arc".
  // Compound/primary movements carry a block's periodization intent; accessories
  // (curls, raises, planks) sit at 10-15 reps in EVERY block regardless of phase,
  // so averaging them in paints every block "hypertrophy". Read character off the
  // main lifts only. Same inclusion-list the transfer map uses.
  const PRIMARY_RX = /squat|deadlift|\bdl\b|rdl|hinge|good[-\s]?morning|press|bench|ohp|overhead|\brow|pull[-\s]?up|\bchin|pulldown|lunge|split|rfess|bulgarian|thrust|clean|snatch|jerk/i;
  // Isolation / machine accessories that must NEVER count as a block's "main" even
  // when they brush a PRIMARY token ("leg PRESS", "MACHINE row", "leg curl"). Without
  // this, high-rep machine work dilutes the mean and flips a 90% strength block to
  // "endurance" (fresh-context review, finding #1 — the "chin" in "Ma-chin-e" bug).
  const ACCESSORY_RX = /machine|leg[-\s]*press|leg[-\s]*ext|extension|leg[-\s]*curl|\bcalf|pushdown|push[-\s]?down|kickback|\bfly|flye|lateral[-\s]*raise|front[-\s]*raise|rear[-\s]*delt|face[-\s]*pull|shrug|\bcurl\b/i;
  // Explosive / speed-strength movements. A block built around these is a POWER
  // block regardless of rep count — a 3-rep power clean and a 3-rep max deadlift
  // read identically on reps alone; the MOVEMENT is what separates them. Covers
  // the Olympic lifts + variations, jumps/plyos, throws/slams, ballistic swings,
  // and sprint/speed work. (NSCA/Bompa: power/conversion phase = high-velocity intent.)
  const BALLISTIC_RX = /clean|snatch|jerk|\bjump|\bhop\b|bound|pogo|plyo|depth[-\s]*jump|box[-\s]*jump|broad[-\s]*jump|vert(ical)?[-\s]*jump|throw|toss|\bslam|push[-\s]*press|jump[-\s]*squat|med(icine)?[-\s]*ball|\bmb\b|kb[-\s]*swing|kettlebell[-\s]*swing|\bswing\b|sprint|\bdash\b|acceleration|speed[-\s]*(squat|pull|bench|dead)|ballistic/i;
  const rpeMid = (v) => { const m = String(v == null ? '' : v).match(/\d+(?:\.\d+)?/); return m ? Number(m[0]) : null; };
  // %1RM from a load field, only when it's a percentage ("80%", "85 %"). A bare
  // "kg" load carries no intensity info without the athlete's 1RM, so ignore it.
  const loadPct = (l) => { const m = String(l == null ? '' : l).match(/(\d+(?:\.\d+)?)\s*%/); return m ? Number(m[1]) : null; };
  // Explosive-INTENT tempo: an "X" in the tempo code (30X0 / 10X0 = explode the
  // concentric) or an all-fast prescription is speed/power intent, not hypertrophy.
  // A slow eccentric ("40X0", "3110") is time-under-tension = hypertrophy/control.
  const explosiveTempo = (t) => {
    // Only an explicit "X" in a real tempo code (e.g. 30X0 / 10X0 — explode the
    // concentric) counts. The X must sit at position ≥2 in an otherwise all-digit
    // string, so a reps typo like "3x8" (X at index 1) and controlled tempos like
    // "1010" are NOT misread as power (fresh-context review, finding #5).
    const s = String(t == null ? '' : t).toLowerCase().trim();
    const xi = s.indexOf('x');
    return xi >= 2 && /^[0-9x]+$/.test(s);
  };
  const repMid = (r) => {
    const str = String(r == null ? '' : r).trim();
    if (!str) return null;
    // Timed holds/carries ("40s", "60 sec", "1 min", "30\"") are a DURATION, not
    // reps — a 45s plank must not read as 45 reps and drag the block to endurance.
    if (/\d\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes)\b/i.test(str) || /\d\s*["']/.test(str)) return null;
    // "3x8" / "3×8" = sets×reps → the REPS is the second part, not an average of
    // both (averaging would call a 3×8 hypertrophy set a ~5-rep strength set).
    const sxr = str.match(/^\s*\d+\s*[x×*]\s*(\d+(?:[-–]\d+)?)/i);
    const target = sxr ? sxr[1] : str;
    const ns = target.match(/\d+(?:\.\d+)?/g);
    return ns && ns.length ? ns.map(Number).reduce((a, c) => a + c, 0) / ns.length : null;
  };
  // Prefer the direct reps field; fall back to per-week reps (ex.wk) ONLY when the
  // direct field is a wave-load placeholder (">") or empty — mixing both inflated
  // the average and dragged strength blocks to "endurance".
  const repsOf = (ex) => {
    const direct = repMid(ex.reps);
    if (direct != null && direct > 0) return direct;
    // Wave-load fallback: drop values >40 — a real rep count that high is almost
    // certainly a leaked load/kg or a mistyped cell, and it would flip a strength
    // block to endurance (fresh-context review, finding #4).
    if (Array.isArray(ex.wk) && ex.wk.length) { const rs = ex.wk.map(repMid).filter((x) => typeof x === 'number' && x > 0 && x <= 40); return rs.length ? rs.reduce((a, c) => a + c, 0) / rs.length : null; }
    return null;
  };
  // The coach's own phase label in the block name — a strong PRIOR. Used only to
  // break ties in the ambiguous 6–12-rep middle, never to override clear data.
  const namePhase = (nm) => {
    const s = String(nm || '');
    if (/deload|de-?load|\btaper\b|unload|\brecover/i.test(s)) return 'deload';
    if (/\bpwr\b|power|explos|ballistic|\bcmj\b|plyo|reactive|\bspeed\b/i.test(s)) return 'power';
    if (/\bmax\b|maximal|\bstr\b|strength|\bpeak/i.test(s)) return 'strength';
    if (/\bhyp\b|hypertroph|\bmav\b|\bmev\b|\bmrv\b|\bvol\b|volume|accumulat/i.test(s)) return 'hypertrophy';
    if (/\bgpp\b|\baa\b|general|\bprep\b|\bbase\b|foundation|condition|work[-\s]?cap/i.test(s)) return 'base';
    if (/\bint\b|intens/i.test(s)) return 'strength';   // an intensification block = heavy
    if (/endur|aerobic|\bmet[-\s]?con\b/i.test(s)) return 'endurance';
    return null;
  };
  const round1 = (x) => (x != null ? Math.round(x * 10) / 10 : null);
  const avg = (arr) => (arr.length ? arr.reduce((a, c) => a + c, 0) / arr.length : null);

  const withDays = (plans || []).filter((p) => (p.days || []).some((d) => (d.exercises || []).length));
  return withDays.map((p) => {
    const all = [];   // every parseable rep, for the coverage count + fallback
    const main = [];  // {reps, rpe, pct, explosive} for the primary compound / explosive lifts
    for (const d of p.days || []) for (const ex of d.exercises || []) {
      const title = String(ex.title || ex.name || '');
      const accessory = ACCESSORY_RX.test(title);
      // A "snatch/clean-grip deadlift/RDL/pull/row" is a slow strength lift, not an
      // Olympic lift; jump rope / jumping jacks are conditioning, not power.
      const gripOrCardio = /(snatch|clean)[-\s]*grip/i.test(title)
        || (/(snatch|clean)/i.test(title) && /deadlift|\brdl\b|\bdl\b|good[-\s]?morning|\brow/i.test(title))
        || /jump[-\s]*rope|jumping[-\s]*jack|skipping/i.test(title);
      const ballistic = BALLISTIC_RX.test(title) && !gripOrCardio;
      const explosive = ballistic || explosiveTempo(ex.tempo);   // movement OR tempo intent
      const r = repsOf(ex);
      const isMain = (PRIMARY_RX.test(title) || ballistic) && !accessory;
      if (r != null && r > 0) all.push(r);
      // A ballistic main with no clean rep number (a depth jump logs "contacts",
      // not reps) still counts toward POWER — keep it in the basis without a rep.
      if (isMain) main.push({ reps: (r != null && r > 0) ? r : null, rpe: rpeMid(ex.rpe), pct: loadPct(ex.load), explosive });
    }
    // Keep a block if it has enough rep-rows OR ≥2 identifiable main lifts.
    if (all.length < 3 && main.length < 2) return null;
    // Prefer the main lifts (≥2) as the character signal; fall back to all rows.
    const useMain = main.length >= 2;
    const basis = useMain ? main : all.map((r) => ({ reps: r, rpe: null, pct: null, explosive: false }));
    const fromMains = useMain;
    const avgReps = avg(basis.map((b) => b.reps).filter((x) => typeof x === 'number' && x > 0));
    const avgRpe = avg(basis.map((b) => b.rpe).filter((x) => typeof x === 'number' && x > 0));
    const avgPct = avg(basis.map((b) => b.pct).filter((x) => typeof x === 'number' && x > 0));
    const explosiveShare = basis.length ? basis.filter((b) => b.explosive).length / basis.length : 0;
    // ── Periodization zones (NSCA Essentials 4e ch.17 · Bompa · Zatsiorsky) ──
    // rep count ALONE can't separate a 3-rep power clean from a 3-rep max deadlift,
    // nor an 8-rep strength set from an 8-rep pump set — so use movement + tempo +
    // intensity together:
    //   POWER      — high-velocity intent: explosive movements / tempo dominate.
    //   STRENGTH   — ≤6 reps, or 6–12 reps taken heavy (≥85% 1RM or RPE ≥8.5).
    //   HYPERTROPHY— 6–12 reps at sub-maximal loads.
    //   ENDURANCE  — 13+ reps / low intensity (GPP base).
    const heavy = (avgPct != null && avgPct >= 85) || (avgRpe != null && avgRpe >= 8.5);
    // POWER is a LOW-REP quality — NSCA power loading is 1-2 @ 80-90% / 3-5 @ 75-85%,
    // kept low-rep so bar velocity (the whole point) doesn't decay. So explosive
    // movements only read POWER when the block's avg reps stay in that window
    // (<=8, generous for ballistic accessories). A high-rep explosive block is
    // power-ENDURANCE / conditioning, not power development — it reads by its rep
    // zone instead. (Source-verified vs NSCA Essentials Ch.17, 2026-08-12.)
    const powerReps = avgReps == null || avgReps <= 8;
    let dataChar = null;
    if (explosiveShare >= 0.4 && powerReps) dataChar = 'power';
    else if (avgReps == null) dataChar = null;
    else if (avgReps <= 6) dataChar = 'strength';
    else if (avgReps <= 12) dataChar = heavy ? 'strength' : 'hypertrophy';
    else dataChar = heavy ? 'strength' : 'endurance';          // heavy high-rep (accessory-diluted) still strength-leaning
    const nc = namePhase(p.name);
    // Reconcile: an overwhelming explosive share is power no matter the name;
    // otherwise trust the DATA, but let a CLEAR name (strength/power) override in the
    // fuzzy 6–12-rep middle OR whenever the block is heavy — a named max-strength
    // block whose mean got dragged up must never read hypertrophy/endurance.
    let character;
    if (explosiveShare >= 0.6 && powerReps) character = 'power';
    else if (dataChar && nc && dataChar !== nc && ((avgReps != null && avgReps > 6 && avgReps <= 12 && !heavy) || (heavy && (nc === 'strength' || nc === 'power')))) character = nc;
    else character = dataChar || nc || 'hypertrophy';
    return { num: blockNum(p.name), name: p.name, character, avgReps: round1(avgReps), avgRpe: round1(avgRpe), avgPct: round1(avgPct), explosiveShare: Math.round(explosiveShare * 100) / 100, exercises: all.length, fromMains };
  }).filter(Boolean)
    // Numbered blocks sort by number; un-numbered ones keep insertion order at the
    // front (stable key = -1) so the comparator stays transitive and "current
    // block" = the last numbered one, never a stray "Deload Week".
    .sort((a, b) => (a.num == null ? -1 : a.num) - (b.num == null ? -1 : b.num));
}

export function analyzeAthlete(clientWorkouts, traineeId, plans, deps) {
  const built = buildBlockSessions(clientWorkouts, traineeId, plans, deps, { targetBlockNum: deps.targetBlockNum ?? null });
  const { sessions, plannedSessionCount } = built;
  if (!sessions.length) {
    return { ...built, empty: true };
  }
  // Cross-block history for staples + ACWR: Ohad programs with near-total
  // exercise variety, so a lift rarely repeats 3+ times inside ONE block — the
  // real progression story lives across blocks (that's the whole point of a
  // "lineage"). Adherence/skip/region stay scoped to the CURRENT block.
  const allBuilt = buildBlockSessions(clientWorkouts, traineeId, plans, deps, { allBlocks: true });
  const allSessions = allBuilt.sessions;
  const series = perLiftSeries(allSessions);
  const adh = adherence(sessions, plannedSessionCount);
  const region = missRateByRegion(sessions);
  const acwr = tonnageACWR(allSessions);
  // Journey = the whole-history context that frames the report (the "lineage"):
  // how long he's been logging, across how many blocks + sessions.
  // Drop implausible dates (1970 epoch zeros, blank→0) before spanning, and cap
  // the result — one mistyped year shouldn't render the header as "· 260W ·".
  const MIN_MS = Date.UTC(2015, 0, 1);
  const jDates = allSessions.map((s) => ms(s.date)).filter((n) => isFinite(n) && n >= MIN_MS);
  const journey = jDates.length ? {
    weeks: Math.min(400, (Math.max(...jDates) - Math.min(...jDates)) > 0 ? Math.round((Math.max(...jDates) - Math.min(...jDates)) / (7 * 86400000)) : 0),
    loggedSessions: allSessions.length,
  } : null;
  // staples: lifts logged 3+ times across blocks, richest first (cap series
  // to the most recent 6 logs so an old block doesn't drown the current read)
  // Ballistic lifts progress by height/speed, not linear load — so a flat load
  // is NOT a stall for them, and e1RM on a jump is meaningless. Flag them so the
  // view reads them right and they don't dominate the worst-first sort.
  const BALLISTIC = /\b(jump|pogo|hop|bound|plyo|skip|slam|toss|throw|snap[-\s]?down|bounce|leap|clean|snatch|jerk|swing|high[-\s]?pull)\b/i;
  // Primary/compound movements — the lifts whose regression signals SYSTEMIC
  // fatigue. Accessories (curl, raise, fly, extension, pushdown, calf, pullover,
  // facepull) don't match, so a single accessory wobbling can't drive a "deload
  // him" verdict (fresh-context review H1). Same inclusion-list the transfer map +
  // block-character reads use.
  const PRIMARY = /squat|deadlift|\bdl\b|rdl|hinge|good[-\s]?morning|press|bench|ohp|overhead|\brow|pull[-\s]?up|\bchin|pulldown|lunge|split|rfess|bulgarian|thrust|clean|snatch|jerk/i;
  // Isolation/machine accessories that brush a PRIMARY token ("MACHINE row", "leg
  // PRESS", "leg curl") must NOT count as a compound whose regression = systemic
  // fatigue; and a "snatch/clean-GRIP" pull is a slow strength lift, not ballistic.
  // (fresh-context review — the same regex bugs as blockHistory, applied here too.)
  const ACCESSORY = /machine|leg[-\s]*press|leg[-\s]*ext|extension|leg[-\s]*curl|\bcalf|pushdown|push[-\s]?down|kickback|\bfly|flye|lateral[-\s]*raise|front[-\s]*raise|rear[-\s]*delt|face[-\s]*pull|shrug|\bcurl\b/i;
  const gripStrength = (t) => /(snatch|clean)[-\s]*grip/i.test(t) || (/(snatch|clean)/i.test(t) && /deadlift|\brdl\b|\bdl\b|good[-\s]?morning|\brow/i.test(t)) || /jump[-\s]*rope|jumping[-\s]*jack|skipping/i.test(t);
  const allLifts = [...series.entries()]
    .map(([title, sAll]) => {
      const s = sAll.slice(-6);
      const loadsAll = sAll.map((x) => x.load).filter((l) => l != null && l > 0);
      const e1All = sAll.map((x) => x.e1).filter((x) => x != null);
      const last = sAll[sAll.length - 1];
      const pr = loadsAll.length ? Math.max(...loadsAll) : null;
      // Weeks since he last hit that PR — the honest stall signal. "3 flat
      // sessions" misses a lift that's been below its best for two months; this
      // catches it. Find the most recent session at (or within 1% of) the PR.
      let weeksSincePr = null;
      const prE1max = e1All.length ? Math.max(...e1All) : null;
      if (pr != null) {
        // A PR is either a load PR OR an e1RM PR — adding reps at submax load
        // (rising e1RM) is real progress and must reset the clock, else an
        // improving lift gets told to "rotate the variation".
        const prSessions = sAll.filter((x) => (x.load != null && x.load >= pr * 0.99) || (prE1max != null && x.e1 != null && x.e1 >= prE1max * 0.99));
        const lastPr = prSessions.length ? Math.max(...prSessions.map((x) => ms(x.date))) : null;
        const nowMs = Math.max(...sAll.map((x) => ms(x.date)).filter((n) => isFinite(n)), 0);
        if (lastPr && isFinite(lastPr) && nowMs) weeksSincePr = Math.round((nowMs - lastPr) / (7 * 86400000));
      }
      // The ARC = the full cross-block journey (every log, not the last 6) — the
      // actual "lineage": where this lift started and where it is now.
      // Anchor the span to the SCORED logs (the ones that produced firstE1/lastE1),
      // not the raw first/last — else "e78 → e110 · over 30 weeks" misdates the
      // baseline when the earliest logs were high-rep (unscored, e1 = null).
      const firstScored = sAll.find((x) => x.e1 != null);
      const lastScored = sAll.length ? [...sAll].reverse().find((x) => x.e1 != null) : null;
      const firstMs = firstScored ? ms(firstScored.date) : null;
      const lastMs = lastScored ? ms(lastScored.date) : null;
      const spanWeeks = (firstMs && lastMs && lastMs > firstMs) ? Math.round((lastMs - firstMs) / (7 * 86400000)) : 0;
      const firstE1 = e1All.length ? e1All[0] : null;
      const lastE1 = e1All.length ? e1All[e1All.length - 1] : null;
      const arcGainPct = (firstE1 && lastE1) ? Math.round(((lastE1 - firstE1) / firstE1) * 100) : null;
      return {
        title, series: s, count: sAll.length,          // total times he's logged it
        ballistic: BALLISTIC.test(title) && !gripStrength(title),
        isMain: PRIMARY.test(title) && !ACCESSORY.test(title),   // compound lift → its regression means systemic fatigue

        stale: staleWeight(s), trend: e1rmTrend(s),
        drift: rpeDrift(s, null), miss: missRate(allSessions, title),
        loads: s.map((x) => x.load), hasLoad: loadsAll.length > 0,
        pr, prE1: e1All.length ? Math.round(Math.max(...e1All)) : null, weeksSincePr,
        lastDate: last ? last.date : null, lastLoad: last ? last.load : null, lastReps: last ? last.reps : null,
        arc: e1All, firstE1: firstE1 != null ? Math.round(firstE1) : null, arcGainPct, spanWeeks,
      };
    });
  // Show every lift he actually LOADED (bodyweight-only lifts can't trend on a
  // load/e1RM table — counted separately below). Rank by what needs attention:
  // dropping first, then stuck-and-hard, then stuck, then climbing, then too-few.
  const rank = (x) => {
    if (x.count < 3) return 6;                                   // not enough to call
    if (x.ballistic) return 5;                                  // load isn't the story for jumps/throws — de-prioritise
    if (x.trend?.dir === 'down') return 0;                      // going backwards — look first
    if (x.stale?.stale && x.stale.mode === 'hard') return 1;    // stuck + grinding
    if (x.stale?.stale) return 2;                               // stuck
    if (x.trend?.dir === 'up') return 3;                        // climbing
    return 4;
  };
  const staples = allLifts.filter((x) => x.hasLoad).sort((a, b) => rank(a) - rank(b) || b.count - a.count);
  const bodyweightLifts = allLifts.filter((x) => !x.hasLoad).length; // accessory/bodyweight, no load to trend
  // STRENGTH → POWER transfer (the flagship read — no competitor does per-
  // athlete strength↔power diagnosis). Is his max-strength converting to
  // explosive output, or is one side the limiter? Group his lifts, compare the
  // e1RM slope of each side. Grounded in the DSI / force-deficit literature —
  // presented as a RELATIONSHIP TO WATCH (squat→jump r≈0.5 is population-level,
  // not this athlete's causal law), a bias for the next block, not a mandate.
  // The strength side = the MAIN, non-ballistic compounds. Use the already-correct
  // `isMain` (PRIMARY && !ACCESSORY, with \bchin word-boundary) rather than a bare
  // regex — a bare `chin`/`row`/`press` matched "Ma-chin-e"/"Machine Row"/"Leg
  // Press", letting isolation accessories pollute the flagship strength↔power read
  // (same bug-class the blockHistory classifier had). clean/snatch/jerk are
  // ballistic, so !ballistic already keeps them on the power side.
  // MEDIAN slope per side — robust to a single jumpy low-load accessory that a
  // mean would let dominate (dividing %/step by a small e1RM amplifies it).
  const groupSlope = (lifts) => {
    const sl = lifts.map((l) => l.trend?.slopePct).filter((x) => typeof x === 'number' && isFinite(x)).sort((a, b) => a - b);
    return sl.length ? sl[Math.floor(sl.length / 2)] : null;
  };
  const strengthLifts = staples.filter((x) => !x.ballistic && x.isMain && x.count >= 3);
  // Power side = LOADED explosive lifts only (clean/loaded jump/swing) — their
  // load trend IS meaningful. A bodyweight jump (POGO/box jump) has no load to
  // trend, so it would drag the power slope to ~0 and fake "power not moving";
  // its progress lives in the JUMP TEST (height/RSI), not here.
  const powerLifts = staples.filter((x) => x.ballistic && x.hasLoad && x.count >= 3);
  const sT = groupSlope(strengthLifts), pT = groupSlope(powerLifts);
  let transfer = null;
  // Flagship needs real data on BOTH sides — never emit a directional
  // "add max-strength / bias to velocity" call off a single lift per side.
  if (sT != null && pT != null && strengthLifts.length >= 2 && powerLifts.length >= 2) {
    const up = (x) => x > 0.8;
    let side, read, move;
    if (up(sT) && !up(pT)) { side = 'strength-ahead'; read = 'his strength is climbing but his explosive work isn\'t following it up'; move = 'the strength isn\'t converting to output — bias next block toward velocity + plyo / speed-strength (move lighter loads fast), less grinding'; }
    else if (up(pT) && !up(sT)) { side = 'power-ahead'; read = 'his jumps/throws are moving but his base strength has stalled'; move = 'power\'s ahead of his strength base — add max-strength work (heavy squat/hinge/press) to raise the ceiling under the power'; }
    else if (up(sT) && up(pT)) { side = 'balanced'; read = 'strength and power are both climbing together'; move = 'transfer\'s working — hold the balance, don\'t over-rotate to one side'; }
    else { side = 'stalled'; read = 'neither strength nor power is moving right now'; move = 'both flat — this is a stimulus-change or a deload block, not a "push harder" one'; }
    transfer = { side, read, move, sT: Math.round(sT * 10) / 10, pT: Math.round(pT * 10) / 10, strengthN: strengthLifts.length, powerN: powerLifts.length };
  }
  const skip = skipPattern(sessions, built.plannedDays, built.weeks);
  const verdict = synthesizeVerdict({ adh, region, staples, acwr, velocity: { state: 'thin' } });
  // readiness density (rpe on sets, autoreg on sessions) for the honest thin card
  let setsWithRpe = 0, totalSets = 0;
  for (const s of sessions) for (const ex of s.exercises) for (const st of ex.sets) { totalSets++; if (st.rpe != null) setsWithRpe++; }
  const rpeCoverage = totalSets ? Math.round((setsWithRpe / totalSets) * 100) : 0;
  return { ...built, empty: false, adh, region, acwr, staples, bodyweightLifts, transfer, verdict, rpeCoverage, skip, journey, blockHistory: blockHistory(plans, deps) };
}
