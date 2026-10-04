// blockEnding.js - the athletes whose current block is in its LAST WEEK, with
// what actually happened in that block (5.10 #565, Ohad approved offer 3:
// "Add 3 but no need for flags"). Pure + framework-free (node-tested by
// scripts/verify-block-ending.mjs).
//
// What it never does: write or suggest the next program - programming is the
// coach's value-add. It only puts the right athletes in front of him a week
// before they would open the app to a finished block.
//
// The CURRENT block is chosen the way the next_block_due auto-task chooses it
// (autoTasks.js): the plan named by the athlete's most recent workout, else the
// newest plan. A block is "ending" when the athlete has logged a session in its
// last week, or finished the last day of the week before it - and no newer plan
// exists for the family yet (a couple's blocks are filed under member ids).
import { traineeIdsFor } from './traineeUtils.js';

const num = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
const family = (tid) => String(tid || '').split('__')[0];

// The heaviest completed set of a logged exercise: { load, reps } or null.
function bestSet(ex) {
  let best = null;
  for (const s of (ex && Array.isArray(ex.sets) ? ex.sets : [])) {
    if (!s || s.done === false) continue;
    const load = num(s.load), reps = num(s.reps);
    if (load == null || load <= 0 || reps == null || reps <= 0) continue;
    if (!best || load > best.load || (load === best.load && reps > best.reps)) best = { load, reps };
  }
  return best;
}

export function blockEndingRows({ trainees, plans, workouts }) {
  const out = [];
  for (const t of trainees || []) {
    if (!t || (t.status !== 'Active' && t.status !== 'Trial')) continue;
    const ids = traineeIdsFor(t.id);
    const tPlans = (plans || []).filter((p) => p && ids.includes(p.traineeId));
    if (!tPlans.length) continue;
    const tWorkouts = (workouts || []).filter((w) => w && ids.includes(w.clientId));
    let current = null;
    if (tWorkouts.length) {
      const latest = tWorkouts.reduce((a, b) => (new Date(b.date) > new Date(a.date) ? b : a));
      current = tPlans.find((p) => p.name === latest.planName) || null;
    }
    if (!current) current = tPlans.slice().sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0];
    if (!current) continue;
    const weeks = Number(current.weeks) || 4;
    const dayNames = (current.days || []).map((d) => d && d.name).filter(Boolean);
    if (weeks < 2 || !dayNames.length) continue;
    // a newer block already written: nothing to do
    const newer = (plans || []).some((p) => p && p.id !== current.id && family(p.traineeId) === family(current.traineeId)
      && new Date(p.createdAt || 0) > new Date(current.createdAt || 0));
    if (newer) continue;
    const logs = tWorkouts.filter((w) => w.planName === current.name);
    const inLastWeek = logs.some((w) => Number(w.week) >= weeks);
    const lastDay = dayNames[dayNames.length - 1];
    const finishedPrev = logs.some((w) => Number(w.week) === weeks - 1 && w.dayName === lastDay);
    if (!inLastWeek && !finishedPrev) continue;
    // completion: distinct (week, day) logged out of weeks x days
    const done = new Set(logs.map((w) => `${Number(w.week) || 1}|${w.dayName}`));
    const planned = weeks * dayNames.length;
    const logged = Math.min(done.size, planned);
    // the best numbers: the most-logged lift's heaviest set in this block, and its first
    const byLift = new Map();
    for (const w of logs.slice().sort((a, b) => new Date(a.date) - new Date(b.date))) {
      for (const ex of (Array.isArray(w.exercises) ? w.exercises : [])) {
        const key = String(ex.eid || ex.title || '').replace(/#\d+$/, '');
        const bs = bestSet(ex);
        if (!key || !bs) continue;
        const cur = byLift.get(key) || { title: ex.title || key, n: 0, first: bs, best: bs };
        cur.n += 1;
        if (bs.load > cur.best.load || (bs.load === cur.best.load && bs.reps > cur.best.reps)) cur.best = bs;
        byLift.set(key, cur);
      }
    }
    const main = [...byLift.values()].sort((a, b) => b.n - a.n || b.best.load - a.best.load)[0] || null;
    const maxWeek = logs.reduce((m, w) => Math.max(m, Number(w.week) || 0), 0);
    out.push({
      traineeId: t.id, name: t.name || '', planId: current.id, planName: current.name || '',
      week: Math.min(Math.max(maxWeek, weeks - 1), weeks), weeks, logged, planned,
      pct: planned ? Math.round((logged / planned) * 100) : 0,
      best: main ? { title: main.title, load: main.best.load, reps: main.best.reps, from: main.first.load !== main.best.load ? main.first.load : null } : null,
    });
  }
  // the lowest completion first: those are the blocks to talk about
  return out.sort((a, b) => a.pct - b.pct || a.name.localeCompare(b.name));
}
