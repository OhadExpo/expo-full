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
  const rows = (series || []).filter((s) => s.e1 != null);
  if (rows.length < 3) return { state: 'thin', have: rows.length, need: 3 };
  const pts = rows.map((s) => s.e1);
  // least-squares slope over index
  const n = pts.length;
  const xs = pts.map((_, i) => i);
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = pts.reduce((a, b) => a + b, 0) / n;
  let numr = 0, den = 0;
  for (let i = 0; i < n; i++) { numr += (xs[i] - mx) * (pts[i] - my); den += (xs[i] - mx) ** 2; }
  const slope = den ? numr / den : 0;
  const pctPerStep = my ? (slope / my) * 100 : 0;
  // Rep-scheme guard: e1RM conflates load with reps, so an intensification block
  // (5→3→1 at RISING load — real strength UP) yields a NEGATIVE e1RM slope and
  // would fire a false "slipping → back off". If the top-set reps swing widely
  // across the series, the slope is a rep artifact, not a strength change — don't
  // call a direction; the UI reads it as "reps varied, e1RM trend unreliable".
  const repsArr = rows.map((s) => s.reps).filter((x) => typeof x === 'number');
  const repNoisy = repsArr.length >= 3 && (Math.max(...repsArr) - Math.min(...repsArr)) >= 3;
  let dir = 'flat';
  if (!repNoisy) { if (pctPerStep > 1.2) dir = 'up'; else if (pctPerStep < -1.2) dir = 'down'; }
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
  const pct = (b) => (b.total ? Math.round((b.short / b.total) * 100) : null);
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
  if (!sessTon.length) return { state: 'thin', haveDays: 0, need: 28 };
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
  if (inSpan < 21 || recent.length < 4 || chronicSessions.length < 3) return { state: 'thin', haveDays: Math.round(inSpan), need: 28 };
  const acute = recent.filter((s) => now - s.date <= 7 * dayMs).reduce((a, b) => a + b.t, 0);
  const chronicTotal = recent.reduce((a, b) => a + b.t, 0);
  const chronicWeekly = chronicTotal / Math.max(1, inSpan / 7); // divide by weeks with actual data
  if (!chronicWeekly) return { state: 'thin', haveDays: Math.round(inSpan), need: 28 };
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
  const anyHardStale = staples.some((s) => !s.ballistic && s.stale?.stale && s.stale.mode === 'hard');
  // Ballistic lifts are meant to be moved light + fast — a falling e1RM on a
  // filmed speed-squat/jump is correct programming, NOT a fatigue signal. Never
  // let it drive a "deload him" verdict (the row already reads EXPLOSIVE).
  const anyDropping = staples.some((s) => !s.ballistic && s.trend?.dir === 'down');
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
    if (anyDropping) bits.push(`${staples.find((s) => !s.ballistic && s.trend?.dir === 'down')?.title} e1RM is regressing`);
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
  return worst;
}

// One-call analysis producing everything the view renders.
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
  // staples: lifts logged 3+ times across blocks, richest first (cap series
  // to the most recent 6 logs so an old block doesn't drown the current read)
  // Ballistic lifts progress by height/speed, not linear load — so a flat load
  // is NOT a stall for them, and e1RM on a jump is meaningless. Flag them so the
  // view reads them right and they don't dominate the worst-first sort.
  const BALLISTIC = /\b(jump|pogo|hop|bound|plyo|skip|slam|toss|throw|snap[-\s]?down|bounce|leap|clean|snatch|jerk|swing|high[-\s]?pull)\b/i;
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
      const firstMs = sAll.length ? ms(sAll[0].date) : null;
      const lastMs = last ? ms(last.date) : null;
      const spanWeeks = (firstMs && lastMs && lastMs > firstMs) ? Math.round((lastMs - firstMs) / (7 * 86400000)) : 0;
      const firstE1 = e1All.length ? e1All[0] : null;
      const lastE1 = e1All.length ? e1All[e1All.length - 1] : null;
      const arcGainPct = (firstE1 && lastE1) ? Math.round(((lastE1 - firstE1) / firstE1) * 100) : null;
      return {
        title, series: s, count: sAll.length,          // total times he's logged it
        ballistic: BALLISTIC.test(title),
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
  // clean/snatch/jerk/swing now classify as POWER (ballistic), not strength.
  const STRENGTH_RX = /squat|deadlift|\bdl\b|rdl|hinge|good[-\s]?morning|press|bench|ohp|overhead|row|pull[-\s]?up|chin|pulldown|lunge|split|rfess|bulgarian|thrust/i;
  // MEDIAN slope per side — robust to a single jumpy low-load accessory that a
  // mean would let dominate (dividing %/step by a small e1RM amplifies it).
  const groupSlope = (lifts) => {
    const sl = lifts.map((l) => l.trend?.slopePct).filter((x) => typeof x === 'number' && isFinite(x)).sort((a, b) => a - b);
    return sl.length ? sl[Math.floor(sl.length / 2)] : null;
  };
  const strengthLifts = staples.filter((x) => !x.ballistic && STRENGTH_RX.test(x.title) && x.count >= 3);
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
  return { ...built, empty: false, adh, region, acwr, staples, bodyweightLifts, transfer, verdict, rpeCoverage, skip };
}
