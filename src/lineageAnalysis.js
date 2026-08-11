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
  if (L == null || R == null || R < 1) return null;
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
  const rpes = last3.map((s) => s.rpe).filter((x) => x != null);
  let mode = 'unknown';
  if (rpes.length >= 2) mode = (rpes[rpes.length - 1] - rpes[0] >= 0.5) ? 'hard' : 'easy';
  return { state: 'ok', stale: true, mode, load: base, sessions: last3.length };
}

// ---- #2 e1RM trend ------------------------------------------------------
// Linear slope of e1RM across the block. Returns direction + pts for spark.
export function e1rmTrend(series) {
  const pts = (series || []).map((s) => s.e1).filter((x) => x != null);
  if (pts.length < 3) return { state: 'thin', have: pts.length, need: 3 };
  // least-squares slope over index
  const n = pts.length;
  const xs = pts.map((_, i) => i);
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = pts.reduce((a, b) => a + b, 0) / n;
  let numr = 0, den = 0;
  for (let i = 0; i < n; i++) { numr += (xs[i] - mx) * (pts[i] - my); den += (xs[i] - mx) ** 2; }
  const slope = den ? numr / den : 0;
  const pctPerStep = my ? (slope / my) * 100 : 0;
  let dir = 'flat';
  if (pctPerStep > 1.2) dir = 'up'; else if (pctPerStep < -1.2) dir = 'down';
  return { state: 'ok', dir, latest: Math.round(pts[pts.length - 1]), pts, slopePct: pctPerStep };
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
        total++;
        const pr = num(s.prescribedReps);
        if (s.done === false) { short++; continue; }
        if (pr != null && num(s.reps) != null && s.reps < pr) short++;
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
        bucket.total++;
        const pr = num(s.prescribedReps);
        if (s.done === false) { bucket.short++; continue; }
        if (pr != null && num(s.reps) != null && s.reps < pr) bucket.short++;
      }
    }
  }
  const pct = (b) => (b.total ? Math.round((b.short / b.total) * 100) : null);
  return { lower: { ...agg.lower, pct: pct(agg.lower) }, upper: { ...agg.upper, pct: pct(agg.upper) } };
}

// ---- #5 Completed-tonnage ACWR ------------------------------------------
// tonnage = Σ(load*reps) per session. Acute=7d, Chronic=28d avg weekly.
export function tonnageACWR(sessions, nowMs) {
  const now = nowMs || Math.max(...sessions.map((s) => ms(s.date)), 0);
  const dayMs = 86400000;
  const sessTon = sessions.map((s) => {
    let t = 0;
    for (const ex of s.exercises || []) for (const st of ex.sets || []) {
      if (num(st.load) != null && num(st.reps) != null && st.done !== false) t += st.load * st.reps;
    }
    return { t, date: ms(s.date) };
  });
  const spanDays = (now - Math.min(...sessTon.map((s) => s.date))) / dayMs;
  if (spanDays < 28) return { state: 'thin', haveDays: Math.round(spanDays), need: 28 };
  const acute = sessTon.filter((s) => now - s.date <= 7 * dayMs).reduce((a, b) => a + b.t, 0);
  const chronicTotal = sessTon.filter((s) => now - s.date <= 28 * dayMs).reduce((a, b) => a + b.t, 0);
  const chronicWeekly = chronicTotal / 4;
  if (!chronicWeekly) return { state: 'thin', haveDays: Math.round(spanDays), need: 28 };
  const acwr = acute / chronicWeekly;
  let band = 'ok';
  if (acwr >= 1.5) band = 'high'; else if (acwr < 0.8) band = 'low';
  return { state: 'ok', acwr: +acwr.toFixed(2), band };
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
  const anyHardStale = staples.some((s) => s.stale?.stale && s.stale.mode === 'hard');
  const anyDropping = staples.some((s) => s.trend?.dir === 'down');
  const highAcwr = acwr?.state === 'ok' && acwr.band === 'high';
  const velHigh = velocity?.state === 'ok' && velocity.lossPct >= 20;

  if (lowerGrind || anyHardStale || anyDropping || highAcwr || velHigh) {
    flags.push('fatigue');
  }
  const lowAdh = adh?.sessionPct != null && adh.sessionPct < 80;

  let headline, sub, tone = 'warn';
  if (flags.includes('fatigue')) {
    const hardStaleLift = staples.find((s) => s.stale?.stale && s.stale.mode === 'hard');
    headline = hardStaleLift
      ? `Deload — then change the ${hardStaleLift.title}, don't just add weight.`
      : `Deload him — he's accumulating more fatigue than he's recovering from.`;
    const bits = [];
    if (lowerGrind) bits.push(`missing ${region.lower.pct}% of lower-body top sets`);
    if (anyDropping) bits.push(`${staples.find((s) => s.trend?.dir === 'down')?.title} e1RM is regressing`);
    if (velHigh) bits.push(`bar speed down ${velocity.lossPct}% on the last filmed set`);
    if (highAcwr) bits.push(`load ratio spiked to ${acwr.acwr}`);
    sub = bits.length ? `${bits.join(', ')} — that's fatigue, not laziness.` : 'Multiple fatigue signals are stacking up.';
  } else if (lowAdh) {
    tone = 'info';
    headline = `Before programming — get him training. He logged ${adh.sessionPct}% of sessions.`;
    sub = 'Low adherence makes every load signal below unreliable. This is a check-in conversation first, a programming decision second.';
  } else {
    tone = 'ok';
    const progressing = staples.filter((s) => s.trend?.dir === 'up').map((s) => s.title);
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
  const { blockNum, classifyPattern, repsTop, exMap } = deps;
  const { allBlocks = false } = opts;
  const pf = (x) => { const n = parseFloat(x); return isFinite(n) ? n : null; };
  const norm = (s) => (s || '').trim().toLowerCase();

  const withDays = (plans || []).filter((p) => (p.days || []).some((d) => (d.exercises || []).length));
  if (!withDays.length) return { sessions: [], plannedSessionCount: 0, blockName: null, blockNumber: null, hasPlans: false };
  // latest block = highest block number, else last in query order
  const ordered = [...withDays].sort((a, b) => {
    const an = blockNum(a.name), bn = blockNum(b.name);
    if (an != null && bn != null) return an - bn;
    if (an != null) return -1; if (bn != null) return 1; return 0;
  });
  const latest = ordered[ordered.length - 1];
  const latestNum = blockNum(latest.name);

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
        const rec = { prescribedReps: repsTop ? repsTop(ex.reps) : null, prescribedRpe: pf(ex.rpe), pattern, title };
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
  const weeks = Array.isArray(latest.weeks) ? latest.weeks.length : (num(latest.weeks) || 1);
  const plannedSessionCount = (latest.days || []).length * weeks;

  const plannedDays = (latest.days || []).map((d) => d.name || 'Day');
  return { sessions, plannedSessionCount, plannedDays, weeks, blockName: latest.name, blockNumber: latestNum, hasPlans: true, totalBlocks: withDays.length };
}

// Which planned day is the athlete skipping? Returns the day with the biggest
// (expected − logged) gap, so "always Day 4" reads as a pattern, not noise.
export function skipPattern(sessions, plannedDays, weeks) {
  if (!plannedDays || !plannedDays.length || !weeks) return null;
  const logged = {};
  for (const s of sessions) { const d = (s.day || '').trim(); if (d) logged[d] = (logged[d] || 0) + 1; }
  let worst = null;
  for (const d of plannedDays) {
    const gap = weeks - (logged[d] || 0);
    if (gap > 0 && (!worst || gap > worst.gap)) worst = { day: d, gap, logged: logged[d] || 0, expected: weeks };
  }
  return worst;
}

// One-call analysis producing everything the view renders.
export function analyzeAthlete(clientWorkouts, traineeId, plans, deps) {
  const built = buildBlockSessions(clientWorkouts, traineeId, plans, deps);
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
  const coverage = patternCoverage(sessions);
  // staples: lifts logged 3+ times across blocks, richest first (cap series
  // to the most recent 6 logs so an old block doesn't drown the current read)
  const staples = [...series.entries()]
    .map(([title, sAll]) => {
      const s = sAll.slice(-6);
      return {
        title, series: s, count: s.length,
        stale: staleWeight(s), trend: e1rmTrend(s),
        drift: rpeDrift(s, null), miss: missRate(allSessions, title),
        loads: s.map((x) => x.load),
      };
    })
    // 3+ logs AND at least one real external load — the staple table is a
    // load/e1RM read, so pure-bodyweight lifts (all loads 0/null) don't belong
    // here; they'd render a meaningless "0·0·0 · STALE" row.
    .filter((x) => x.count >= 3 && x.loads.some((l) => l != null && l > 0))
    .sort((a, b) => b.count - a.count);
  const skip = skipPattern(sessions, built.plannedDays, built.weeks);
  const verdict = synthesizeVerdict({ adh, region, staples, acwr, velocity: { state: 'thin' } });
  // readiness density (rpe on sets, autoreg on sessions) for the honest thin card
  let setsWithRpe = 0, totalSets = 0;
  for (const s of sessions) for (const ex of s.exercises) for (const st of ex.sets) { totalSets++; if (st.rpe != null) setsWithRpe++; }
  const rpeCoverage = totalSets ? Math.round((setsWithRpe / totalSets) * 100) : 0;
  return { ...built, empty: false, adh, region, acwr, coverage, staples, verdict, rpeCoverage, skip };
}
