// RUN ANALYSIS - a running block read against its own prescription (16.10 #814, Ohad: "make the analysis way better").
// The training analysis was a strength report for everyone: on a runner it said "loads and effort are holding", asked
// for RPE on his sets and offered bar-speed / ROM cards - and never read a run. This reads what a running coach looks at:
// did he run the block so far; each run's main work against its prescribed pace range and heart-rate cap; how the reps
// held (spread, fade, the opening rep); how easy the easy days really were - heart rate decides what a fast easy pace
// means, and only against a cap HE set (no invented ceiling); weekly km in Israeli weeks; a single run far longer than
// anything in the month before it. Pure - no React, no Supabase; the view composes the words. It reads and advises,
// the coach builds.
import { runSeconds } from './runPace.js';
import { dayInWeek, plannedSessions } from './planWeek.js';

const fin = (n) => typeof n === 'number' && isFinite(n);
const num = (s) => { const n = parseFloat(String(s == null ? '' : s).replace(',', '.')); return isFinite(n) ? n : null; };
// a prescription's distance in km: '1 ק״מ', '1.5 km', '400 מ׳', '400 m', a bare '400' (metres) or '5' (km);
// a duration ('40 דק׳', '8 שנ׳', '40 min') -> null
export const presKm = (s) => {
  const t = String(s || '').trim();
  if (!t || /(דק|שנ|min|sec)/i.test(t) || /\d\s*s(?=\s|$)/i.test(t)) return null;
  const n = num(t); if (n == null) return null;
  if (/(ק״מ|ק"מ|קמ|km)/i.test(t)) return n;
  if (/(מ׳|מ'|מטר|\dm|\sm)(?=\s|$)/i.test(t)) return n / 1000;
  if (/^\d+(\.\d+)?$/.test(t)) return n > 60 ? n / 1000 : n;   // a bare number: metres above 60
  return null;
};
// a pace range in s/km: '5:00–5:05' / '5:00-5:05' / '5:30' -> [lo, hi]; 'קל' / 'easy' / blank -> null
export const presPace = (s) => {
  const ps = String(s || '').match(/\d{1,2}:\d{2}/g);
  if (!ps || !ps.length) return null;
  const v = ps.map(runSeconds).filter((x) => x > 0).sort((a, b) => a - b);
  return v.length ? [v[0], v[v.length - 1]] : null;
};
export const presEasy = (s) => /קל|easy|recovery|שיחה|conversational/i.test(String(s || ''));
// a heart-rate cap: 'HR 142' / '142' / 'דופק עד 142' / a range '135-145' -> its TOP (the cap)
export const presHr = (s) => { const ns = (String(s || '').match(/\d{2,3}/g) || []).map(Number).filter((v) => v >= 90 && v <= 210); return ns.length ? Math.max(...ns) : null; };
const HR_TOL = 2;   // bpm over the cap before it counts
const PACE_TOL = 3; // s/km either side of a range still counts as in it
// the run's kind from the day's name (the builder's words, Hebrew or English)
export const runKind = (name) => {
  const t = String(name || '');
  if (/מבחן|test|time[\s-]?trial/i.test(t)) return 'test';
  if (/חזרות|interval|reps|אינטרוול/i.test(t)) return 'intervals';
  if (/טמפו|tempo|threshold|סף/i.test(t)) return 'tempo';
  if (/ארוכה|long/i.test(t)) return 'long';
  if (/קלה|easy|recovery|התאוששות/i.test(t)) return 'easy';
  return 'run';
};
const isWarm = (title) => /חימום|warm/i.test(String(title || ''));
const isCool = (title) => /שחרור|cool/i.test(String(title || ''));
// a set that can be a run: 2:30-15:00 /km, up to 60 km (the records' rule - a typo never becomes a read)
const plausible = (km, sec) => km > 0 && km <= 60 && sec > 0 && sec / km >= 150 && sec / km <= 900;
// a week's prescription: per-week overrides (wk / wkS) win over the base
const presFor = (ex, week) => {
  const w = Math.max(1, Number(week) || 1) - 1;
  const reps = Array.isArray(ex.wk) && ex.wk[w] != null && ex.wk[w] !== '' ? ex.wk[w] : ex.reps;
  const sets = Array.isArray(ex.wkS) && ex.wkS[w] != null && ex.wkS[w] !== '' ? ex.wkS[w] : ex.sets;
  return { reps, sets, tempo: ex.tempo, load: ex.load, title: ex.title };
};
const weeksOf = (plan) => { const w = Array.isArray(plan.weeks) ? plan.weeks.length : Number(plan.weeks); return isFinite(w) && w > 0 ? w : 1; };

// One logged run against its day in the plan.
function readRun(w, day) {
  const plEx = (day && day.exercises) || [];
  const used = new Set();
  const segs = [];
  (w.exercises || []).forEach((ex, i) => {
    const title = String(ex.title || '').trim();
    let pi = plEx.findIndex((p, k) => !used.has(k) && String(p.title || '').trim() === title);
    if (pi < 0 && i < plEx.length && !used.has(i)) pi = i;
    if (pi >= 0) used.add(pi);
    const pl = pi >= 0 ? presFor(plEx[pi], w.week) : null;
    const reps = [];
    let timeOnly = 0;
    for (const s of ex.sets || []) {
      if (!s || !s.done) continue;
      const km = num(s.reps), sec = runSeconds(s.time);
      if (km != null && sec && plausible(km, sec)) reps.push({ km, sec, pace: sec / km, hr: num(s.hr) });
      else if (sec) timeOnly += sec;   // a duration run logged with a time and no km still counts as run
    }
    const km = reps.reduce((a, r) => a + r.km, 0), sec = reps.reduce((a, r) => a + r.sec, 0);
    const hrs = reps.map((r) => r.hr).filter(fin);
    const prescCount = pl ? Math.max(1, parseInt(pl.sets, 10) || 1) : null;
    const prescKm = pl ? presKm(pl.reps) : null;
    segs.push({
      title, plan: pl,
      role: isWarm(title) ? 'warm' : isCool(title) ? 'cool' : 'main',
      reps, km, sec, timeOnly, pace: km > 0 ? sec / km : null,
      hrMax: hrs.length ? Math.max(...hrs) : null,
      target: pl ? presPace(pl.tempo) : null, easyTarget: pl ? presEasy(pl.tempo) : false, hrCap: pl ? presHr(pl.load) : null,
      prescKm: prescKm != null && prescCount ? prescKm * prescCount : null, prescTimed: !!pl && prescKm == null,
      logged: reps.length > 0 || timeOnly > 0,
    });
  });
  // the main work: the segments that are not warm-up / cool-down - or, on a day that is ALL warm-up / cool-down words
  // (a recovery run titled 'שחרור'), the longest segment
  let main = segs.filter((s) => s.role === 'main' && s.logged);
  if (!main.length) { const longest = segs.filter((s) => s.logged).sort((a, b) => b.km - a.km)[0]; if (longest) main = [longest]; }
  // the kind: the day's name, else what its main segment's prescription says
  let kind = runKind(day ? day.name : w.dayName);
  let guess = null;
  if (kind === 'run' && main.length) {
    const m = main[0];
    if (m.easyTarget) kind = 'easy';
    else if (m.target) guess = { lo: m.target[0], multi: (parseInt(m.plan && m.plan.sets, 10) || 1) > 1 || main.length > 1 };   // decided against the block (analyzeRunner)
  }
  // the reps of the main work: the biggest main segment's own reps, or a run of same-target segments (a tempo day logged
  // one segment per rep) - strides or extra segments do not join them
  const big = main.slice().sort((a, b) => b.km - a.km)[0] || null;
  let repList = [];
  if (big && big.reps.length > 1) repList = big.reps;
  else if (big && big.target) repList = main.filter((s) => s.target && s.target[0] === big.target[0] && s.target[1] === big.target[1] && s.km > 0).map((s) => ({ km: s.km, sec: s.sec, pace: s.pace, hr: s.hrMax }));
  const target = big ? big.target : null;
  const hrCap = main.map((s) => s.hrCap).find(fin) || null;
  const km = segs.reduce((a, s) => a + s.km, 0), sec = segs.reduce((a, s) => a + s.sec, 0);
  const mainSegs = target ? main.filter((s) => s.target && s.target[0] === target[0]) : main;
  const mainKm = mainSegs.reduce((a, s) => a + s.km, 0), mainSec = mainSegs.reduce((a, s) => a + s.sec, 0);
  const mainPace = mainKm > 0 ? mainSec / mainKm : null;
  let paceVs = null;
  if (target && mainPace) {
    const [lo, hi] = target;
    paceVs = mainPace < lo - PACE_TOL ? { dir: 'fast', by: Math.round(lo - mainPace) } : mainPace > hi + PACE_TOL ? { dir: 'slow', by: Math.round(mainPace - hi) } : { dir: 'in', by: 0 };
  }
  const hrMaxAll = main.map((s) => s.hrMax).filter(fin);
  const hrVs = hrCap && hrMaxAll.length ? { over: Math.max(0, Math.round(Math.max(...hrMaxAll) - hrCap - HR_TOL)), max: Math.max(...hrMaxAll), cap: hrCap } : null;
  let reps = null;
  if (repList.length >= 2) {
    const ps = repList.map((r) => r.pace);
    const hr = repList.map((r) => r.hr).filter(fin);
    reps = { paces: ps, spread: Math.round(Math.max(...ps) - Math.min(...ps)), fade: Math.round(ps[ps.length - 1] - ps[0]), firstVs: target ? Math.round(ps[0] - target[0]) : null, hrRise: hr.length >= 2 ? Math.round(hr[hr.length - 1] - hr[0]) : null };
  }
  return { id: w.id, date: w.date, week: Number(w.week) || 1, dayName: w.dayName, kind, guess, segs, km, sec, mainKm, mainPace, target, hrCap, paceVs, hrVs, reps, logged: segs.some((s) => s.logged) };
}

// an Israeli week (Sunday to Saturday), keyed in Israel's own date
const IL = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' });
const ilDate = (d) => { const x = new Date(d); if (!isFinite(x)) return null; const p = Object.fromEntries(IL.formatToParts(x).map((q) => [q.type, q.value])); return p.year && p.month && p.day ? `${p.year}-${p.month}-${p.day}` : null; };
const weekKey = (d) => { const iso = ilDate(d); if (!iso) return null; const x = new Date(iso + 'T12:00:00Z'); if (!isFinite(x)) return null; x.setUTCDate(x.getUTCDate() - x.getUTCDay()); return x.toISOString().slice(0, 10); };

// plans: the athlete's plans (with days); viewedId: the block to read (else the latest running block)
// sameBlock(w, plan): whether a logged workout belongs to a plan (default: the plan's name - the strength report also
// matches the block number; pass its rule so both halves of the page count the same runs)
export function analyzeRunner(clientWorkouts, traineeId, plans, { viewedId = null, now = Date.now(), sameBlock = null } = {}) {
  const runPlans = (plans || []).filter((p) => p && p.sport === 'running' && (p.days || []).length);
  if (!runPlans.length) return null;
  const plan = (viewedId && runPlans.find((p) => p.id === viewedId)) || runPlans[runPlans.length - 1];
  const belongs = sameBlock || ((w, p) => w.planName === p.name);
  const mineAll = (clientWorkouts || []).filter((w) => String(w.clientId) === String(traineeId));
  const dayIn = (p, name, week) => (p.days || []).find((d) => d.name === name && dayInWeek(d, week)) || (p.days || []).find((d) => d.name === name) || null;   // week 2's Day A is not week 1's (#850)
  // every logged run of every running block, read once
  const readAll = mineAll.map((w) => { const p = runPlans.find((q) => belongs(w, q)); return p ? { w, p, r: readRun(w, dayIn(p, w.dayName, Number(w.week) || 1)) } : null; }).filter((x) => x && x.r.logged);
  const runs = readAll.filter((x) => x.p === plan).map((x) => x.r).sort((a, b) => new Date(a.date) - new Date(b.date));
  {
    const los = [...new Set((plan.days || []).flatMap((d) => (d.exercises || []).map((ex) => { const t = presPace(ex.tempo); return t ? t[0] : null; }).filter((v) => v != null)))];
    const slowest = los.length ? Math.max(...los) : null;
    for (const r of runs) {
      if (!r.guess) continue;
      r.kind = los.length < 2 ? 'run' : r.guess.lo >= slowest - 15 ? 'easy' : r.guess.multi ? 'intervals' : 'tempo';
    }
  }
  const weeksN = weeksOf(plan);
  const plannedTotal = plannedSessions(plan.days, weeksN);   // #850: each week's own days
  // due SO FAR: the weeks he has reached (the highest logged week), not the whole block - week 1 of 4 is not 'missing'
  const weekReached = Math.min(weeksN, Math.max(1, ...runs.map((r) => r.week)));
  const isLatest = plan === runPlans[runPlans.length - 1];
  const plannedDue = runs.length && isLatest ? plannedSessions(plan.days, weekReached) : plannedTotal;
  // planned km for the weeks reached (per-week prescriptions), and whether any day is time-based (km then a floor)
  let plannedKm = 0, kmPartial = false;
  for (let wk = 1; wk <= weekReached; wk++) for (const d of plan.days || []) for (const ex of (dayInWeek(d, wk) ? d.exercises || [] : [])) {
    const pr = presFor(ex, wk); const k = presKm(pr.reps);
    if (k == null) { if (String(pr.reps || '').trim()) kmPartial = true; continue; }
    plannedKm += k * Math.max(1, parseInt(pr.sets, 10) || 1);
  }
  const doneKm = runs.reduce((a, r) => a + r.km, 0);
  // weekly km over every running block; the ramp only between two FINISHED, ADJACENT weeks
  const byWeek = new Map();
  for (const x of readAll) { const k = weekKey(x.w.date); if (k) byWeek.set(k, (byWeek.get(k) || 0) + x.r.km); }
  const thisWeek = weekKey(now);
  const weeks = [...byWeek.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([wk, km]) => ({ wk, km: Math.round(km * 10) / 10, current: wk === thisWeek }));
  const done = weeks.filter((w) => !w.current);
  let ramp = null;
  if (done.length >= 2) {
    const a = done[done.length - 2], b = done[done.length - 1];
    if (Date.parse(b.wk) - Date.parse(a.wk) === 7 * 86400000 && a.km > 0) ramp = Math.round(((b.km - a.km) / a.km) * 100);
  }
  // a single run more than 10% longer than his longest in the 30 days before it (with 3+ runs of history) - the
  // research's injury signal; the weekly 10% rule stays too (Ohad's own)
  const hist = readAll.map((x) => ({ t: Date.parse(x.w.date), km: x.r.km })).filter((x) => x.km > 0);
  const spikes = [];
  for (const r of runs) {
    const t = Date.parse(r.date); const prior = hist.filter((x) => x.t < t && x.t >= t - 30 * 86400000);
    const mx = Math.max(0, ...prior.map((x) => x.km));
    if (prior.length >= 3 && mx > 0 && r.km > mx * 1.1) spikes.push({ run: r, prevMax: mx, pct: Math.round(((r.km - mx) / mx) * 100) });
  }
  const hard = runs.filter((r) => ['intervals', 'tempo', 'test'].includes(r.kind));
  const easy = runs.filter((r) => ['easy', 'long'].includes(r.kind));
  // an easy run faster than the block's HARD targets (interval / tempo / test days only) is a mis-log or a race
  const hardTargets = [];
  for (const d of plan.days || []) { if (!['intervals', 'tempo', 'test'].includes(runKind(d.name))) continue; for (const ex of d.exercises || []) { const t = presPace(ex.tempo); if (t) hardTargets.push(t[0]); } }
  for (const r of hard) if (r.target) hardTargets.push(r.target[0]);
  const fastestHard = hardTargets.length ? Math.min(...hardTargets) : null;
  const flags = [];
  if (fastestHard != null) for (const r of easy) if (r.mainPace && r.mainPace < fastestHard - 5) flags.push({ kind: 'easy-faster-than-hard', run: r, pace: r.mainPace, fastestTarget: fastestHard });
  // easy discipline: heart rate decides, and only against a cap he set
  const easyReads = easy.map((r) => ({ run: r, paceVs: r.paceVs, hrOk: r.hrVs ? r.hrVs.over === 0 : null, hr: r.hrVs ? r.hrVs.max : null }));
  const easyFastHrOk = easyReads.filter((e) => e.paceVs && e.paceVs.dir === 'fast' && e.hrOk === true && !flags.some((f) => f.run === e.run));
  const easyFastHrHigh = easyReads.filter((e) => e.hrOk === false);
  const hardReads = hard.map((r) => ({ run: r, fastStart: r.reps && r.reps.firstVs != null && r.reps.firstVs < -PACE_TOL ? -r.reps.firstVs : 0, fade: r.reps ? r.reps.fade : null }));
  const fastStarts = hardReads.filter((h) => h.fastStart >= 10 && h.fade != null && h.fade >= 15);
  const capHits = runs.filter((r) => r.hrVs && r.hrVs.over > 0 && ['intervals', 'tempo', 'test'].includes(r.kind));
  const upcoming = (plan.days || []).filter((d) => !runs.some((r) => r.dayName === d.name && (d.onlyWeek == null || d.onlyWeek === '' || Number(d.onlyWeek) === r.week)));   // #850
  const upcomingTest = upcoming.find((d) => runKind(d.name) === 'test') || null;
  const anyTarget = runs.some((r) => r.target);
  // the verdict, in the order a coach acts on it
  let tone = 'ok', headline = 'onPlan';
  if (!runs.length) { tone = 'info'; headline = 'none'; }
  else if (runs.length < plannedDue - 1 && runs.length / plannedDue < 0.6) { tone = 'warn'; headline = 'missing'; }
  else if (fastStarts.length) { tone = 'warn'; headline = 'hardTooHard'; }
  else if (capHits.length) { tone = 'warn'; headline = 'capHit'; }
  else if (flags.length) { tone = 'warn'; headline = 'checkLog'; }
  else if (easyFastHrHigh.length) { tone = 'warn'; headline = 'easyTooFast'; }
  else if (easyFastHrOk.length) { tone = 'info'; headline = 'easyTargetSlow'; }
  else if (!anyTarget) { tone = 'info'; headline = 'noTargets'; }
  return {
    plan: { id: plan.id, name: plan.name, weeks: weeksN, days: (plan.days || []).map((d) => d.name) },
    runs, plannedTotal, plannedDue, weekReached, plannedKm: Math.round(plannedKm * 10) / 10, kmPartial, doneKm: Math.round(doneKm * 10) / 10,
    weeks, ramp, spikes, hardReads, easyReads, fastStarts, capHits, easyFastHrOk, easyFastHrHigh, flags, anyTarget,
    upcomingTest: upcomingTest ? upcomingTest.name : null,
    verdict: { tone, headline },
  };
}
