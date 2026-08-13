// Challenge progress predicates — shared between ChallengesView (coach
// leaderboard) and AthleteChallengesWidget (athlete portal tile).
//
// Each entry maps `goal_type` → { label, unit, compute(ctx) }.
// `ctx` is { challenge, traineeId, workouts, bwLog, meals }.
//
// Templates below are pre-built challenge presets the coach picks from
// in the "+ New Challenge" modal — see TEMPLATES export.

import { traineeIdsFor } from './traineeUtils';

// ----- shared helpers ------------------------------------------------

// Day key in the athlete's LOCAL calendar day — e.g. "2026-05-16". Must match how
// the meal logger + workout screens bucket days (local, not UTC) so a streak agrees
// with what the athlete sees: a meal logged at 01:00 local counts for THAT local day,
// not the prior UTC day (all athletes are in Israel, UTC+2/+3). en-CA gives YYYY-MM-DD.
const dayKey = (iso) => { const d = new Date(iso); return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-CA'); };

// ISO-week key — "2026-W20". Year-week pair so consecutive checks work
// across year boundaries.
function isoWeekKey(iso) {
  const d = new Date(iso);
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  // Thursday in current week decides the year (ISO 8601).
  const dayNum = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const diffDays = (t - firstThursday) / 86400000;
  const week = 1 + Math.round((diffDays - 3 + (firstThursday.getUTCDay() + 6) % 7) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

// Step forward one ISO week — keys are "YYYY-Www".
function nextIsoWeek(key) {
  const [y, w] = key.split('-W').map(Number);
  // Convert "year + week" back to a date (Monday of that ISO week),
  // add 7 days, re-derive.
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const jan4Day = (jan4.getUTCDay() + 6) % 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - jan4Day + (w - 1) * 7);
  monday.setUTCDate(monday.getUTCDate() + 7);
  return isoWeekKey(monday.toISOString());
}

function inWindow(iso, start, end) {
  const t = new Date(iso).getTime();
  return t >= start && t <= end;
}

// Longest consecutive-key streak. Receives a sorted unique array of
// keys and a stepper(k) → next-key. Returns max-length run.
function longestConsecutive(keys, stepper) {
  if (keys.length === 0) return 0;
  const set = new Set(keys);
  let best = 0;
  for (const k of keys) {
    // start of run if k-1 not in set
    let prev = null;
    try { prev = stepper(stepBack(k, stepper)); } catch {} // optional reverse
    // simpler: iterate forward only — start at k iff (prev-of-k) not in set
    if (isRunStart(k, set, stepper)) {
      let cur = 1, cursor = k;
      while (set.has(stepper(cursor))) { cur++; cursor = stepper(cursor); }
      if (cur > best) best = cur;
    }
  }
  return best;
}
function isRunStart(k, set, stepper) {
  // run starts here if there is no earlier key that steps to k
  // (we don't have a back-stepper; check via brute over set)
  for (const m of set) { if (m === k) continue; if (stepper(m) === k) return false; }
  return true;
}
function stepBack() { throw new Error('no-op'); } // unused, kept for type symmetry

// Detect a "new PR" set within a workout: top-set load × reps > any
// prior top-set for the same exercise title across the athlete's history.
// Cheap path: track running max load by exercise across the sorted
// workout sequence. Returns { weekKey → true } for weeks where any new PR landed.
function prWeeks(traineeWorkouts) {
  const sorted = [...traineeWorkouts].sort((a, b) => new Date(a.date) - new Date(b.date));
  const bestByEx = new Map(); // key → best load × reps proxy (use e1RM Epley)
  const weeks = new Set();
  for (const w of sorted) {
    const wk = isoWeekKey(w.date);
    for (const ex of (w.exercises || [])) {
      const title = (ex.title || '').trim().toLowerCase();
      if (!title) continue;
      let best = 0;
      for (const s of (ex.sets || [])) {
        if (!s.done) continue;
        const reps = parseFloat(s.reps) || 0;
        const load = parseFloat(s.load) || 0;
        if (reps <= 0 || load <= 0) continue;
        // Epley e1RM: load * (1 + reps/30)
        const e1rm = load * (1 + reps / 30);
        if (e1rm > best) best = e1rm;
      }
      if (best <= 0) continue;
      const prior = bestByEx.get(title) || 0;
      if (best > prior) {
        bestByEx.set(title, best);
        weeks.add(wk);
      }
    }
  }
  return weeks;
}

// Big-Three detector: which of {squat, bench, deadlift} hit a new e1RM
// PR within the window. Returns a Set of pattern names matched.
function bigThreePRs(traineeWorkouts, start, end) {
  // NOTE: JS \b is only a boundary between a \w and non-\w char. Hebrew
  // letters are non-\w, so \b never forms next to them — anchoring Hebrew
  // alternatives with \b makes them un-matchable. Anchor the Latin words
  // only; match the Hebrew substrings bare.
  const PATTERNS = {
    squat:    /\bsquat\b/i,
    bench:    /\bbench\b|חזה/i,                       // hebrew "chest" → close enough
    deadlift: /\bdeadlift\b|\bdead\b|רומני|דדליפט/i,
  };
  const sorted = [...traineeWorkouts].sort((a, b) => new Date(a.date) - new Date(b.date));
  const baseline = {}; // best e1RM before window per pattern
  const inside = {};   // best e1RM within window per pattern
  for (const w of sorted) {
    const isIn = inWindow(w.date, start, end);
    for (const ex of (w.exercises || [])) {
      const title = ex.title || '';
      for (const [pat, rx] of Object.entries(PATTERNS)) {
        if (!rx.test(title)) continue;
        let best = 0;
        for (const s of (ex.sets || [])) {
          if (!s.done) continue;
          const reps = parseFloat(s.reps) || 0;
          const load = parseFloat(s.load) || 0;
          if (reps <= 0 || load <= 0) continue;
          const e1rm = load * (1 + reps / 30);
          if (e1rm > best) best = e1rm;
        }
        if (best <= 0) continue;
        if (isIn) inside[pat] = Math.max(inside[pat] || 0, best);
        else      baseline[pat] = Math.max(baseline[pat] || 0, best);
      }
    }
  }
  const hits = new Set();
  for (const pat of Object.keys(PATTERNS)) {
    if ((inside[pat] || 0) > (baseline[pat] || 0)) hits.add(pat);
  }
  return hits;
}

// ----- the engine ----------------------------------------------------

// Each entry: { label, unit, compute({ challenge, traineeId, workouts, bwLog, meals }) }
export const GOAL_TYPES_NEW = {

  workouts_count: {
    label: 'Most workouts',
    unit: 'workouts',
    compute({ challenge, traineeId, workouts }) {
      const ids = new Set(traineeIdsFor(traineeId));
      const start = new Date(challenge.start_at).getTime();
      const end   = new Date(challenge.end_at).getTime();
      return (workouts || []).filter(w => ids.has(w.clientId) && inWindow(w.date, start, end)).length;
    },
  },

  total_volume: {
    label: 'Most volume (Σ reps × load)',
    unit: 'kg',
    compute({ challenge, traineeId, workouts }) {
      const ids = new Set(traineeIdsFor(traineeId));
      const start = new Date(challenge.start_at).getTime();
      const end   = new Date(challenge.end_at).getTime();
      const wos = (workouts || []).filter(w => ids.has(w.clientId) && inWindow(w.date, start, end));
      let v = 0;
      for (const w of wos) for (const ex of (w.exercises || [])) for (const s of (ex.sets || [])) {
        if (!s.done) continue;
        v += (parseFloat(s.reps) || 0) * (parseFloat(s.load) || 0);
      }
      return Math.round(v);
    },
  },

  longest_streak: {
    label: 'Longest streak (days)',
    unit: 'days',
    compute({ challenge, traineeId, workouts }) {
      const ids = new Set(traineeIdsFor(traineeId));
      const start = new Date(challenge.start_at).getTime();
      const end   = new Date(challenge.end_at).getTime();
      const wos = (workouts || []).filter(w => ids.has(w.clientId) && inWindow(w.date, start, end));
      const days = [...new Set(wos.map(w => dayKey(w.date)))].sort();
      if (days.length === 0) return 0;
      let best = 1, cur = 1;
      for (let i = 1; i < days.length; i++) {
        const prev = new Date(days[i - 1] + 'T00:00:00Z').getTime();
        const here = new Date(days[i]     + 'T00:00:00Z').getTime();
        if (here - prev === 86400000) { cur++; best = Math.max(best, cur); } else cur = 1;
      }
      return best;
    },
  },

  bw_drop: {
    label: 'BW drop',
    unit: 'kg',
    compute({ challenge, traineeId, bwLog }) {
      const ids = new Set(traineeIdsFor(traineeId));
      const start = new Date(challenge.start_at).getTime();
      const end   = new Date(challenge.end_at).getTime();
      const bws = (bwLog || [])
        .filter(b => ids.has(b.clientId) && inWindow(b.date, start, end))
        .map(b => ({ d: new Date(b.date).getTime(), v: parseFloat(b.bw) }))
        .filter(b => Number.isFinite(b.v))
        .sort((a, b) => a.d - b.d);
      if (bws.length < 2) return 0;
      return Math.round((bws[0].v - bws[bws.length - 1].v) * 10) / 10;
    },
  },

  // === NEW (Ohad picks 2026-05-16) ===================================

  // #1 — N consecutive ISO weeks where workouts.count ≥ goal_value.
  // goal_value = required workouts per week (default 3).
  weekly_attendance_streak: {
    label: 'Weekly attendance streak',
    unit: 'weeks',
    compute({ challenge, traineeId, workouts }) {
      const ids = new Set(traineeIdsFor(traineeId));
      const start = new Date(challenge.start_at).getTime();
      const end   = new Date(challenge.end_at).getTime();
      const target = Math.max(1, Number(challenge.goal_value) || 3);
      const perWeek = new Map();
      for (const w of (workouts || [])) {
        if (!ids.has(w.clientId) || !inWindow(w.date, start, end)) continue;
        const k = isoWeekKey(w.date);
        perWeek.set(k, (perWeek.get(k) || 0) + 1);
      }
      const hitWeeks = [...perWeek.entries()].filter(([_, n]) => n >= target).map(([k]) => k).sort();
      return longestConsecutive(hitWeeks, nextIsoWeek);
    },
  },

  // #2 — Total skipped sets within window. 0 = perfect block (no skips).
  no_skip_block: {
    label: 'No-skip block (skipped sets)',
    unit: 'skips',
    compute({ challenge, traineeId, workouts }) {
      const ids = new Set(traineeIdsFor(traineeId));
      const start = new Date(challenge.start_at).getTime();
      const end   = new Date(challenge.end_at).getTime();
      let skips = 0;
      for (const w of (workouts || [])) {
        if (!ids.has(w.clientId) || !inWindow(w.date, start, end)) continue;
        for (const ex of (w.exercises || [])) {
          for (const s of (ex.sets || [])) {
            if (!s.done) skips++;
          }
        }
      }
      // We surface the count; coach can read "0 = best". Sort still
      // works (lower wins) when the leaderboard inverts for this type.
      return skips;
    },
    sortDir: 'asc',
  },

  // #3 — N consecutive ISO weeks with ≥1 BW entry.
  bw_weekly_streak: {
    label: 'Weekly BW log streak',
    unit: 'weeks',
    compute({ challenge, traineeId, bwLog }) {
      const ids = new Set(traineeIdsFor(traineeId));
      const start = new Date(challenge.start_at).getTime();
      const end   = new Date(challenge.end_at).getTime();
      const weeks = new Set();
      for (const b of (bwLog || [])) {
        if (!ids.has(b.clientId) || !inWindow(b.date, start, end)) continue;
        if (!Number.isFinite(parseFloat(b.bw))) continue;
        weeks.add(isoWeekKey(b.date));
      }
      return longestConsecutive([...weeks].sort(), nextIsoWeek);
    },
  },

  // #4 — Longest run of consecutive calendar days with ≥1 meal logged.
  meal_log_streak: {
    label: 'Daily meal log streak',
    unit: 'days',
    compute({ challenge, traineeId, meals }) {
      const ids = new Set(traineeIdsFor(traineeId));
      const start = new Date(challenge.start_at).getTime();
      const end   = new Date(challenge.end_at).getTime();
      const days = new Set();
      for (const m of (meals || [])) {
        if (!ids.has(m.trainee_id)) continue;
        // athlete_meals is keyed by trainee_id + created_at (no meal_date col).
        // Bucket by LOCAL day (dayKey) so the streak agrees with the meal logger —
        // a 01:00-local meal counts for that local day, not the prior UTC day.
        const d = m.created_at && dayKey(m.created_at);
        if (!d) continue;
        const t = new Date(d + 'T12:00:00').getTime();
        if (t < start || t > end) continue;
        days.add(d);
      }
      const sorted = [...days].sort();
      if (sorted.length === 0) return 0;
      let best = 1, cur = 1;
      for (let i = 1; i < sorted.length; i++) {
        const prev = new Date(sorted[i - 1] + 'T00:00:00Z').getTime();
        const here = new Date(sorted[i]     + 'T00:00:00Z').getTime();
        if (here - prev === 86400000) { cur++; best = Math.max(best, cur); } else cur = 1;
      }
      return best;
    },
  },

  // #5 — Consecutive workouts (chronological order) with ≥1 form video.
  form_video_streak: {
    label: 'Form video streak',
    unit: 'sessions',
    compute({ challenge, traineeId, workouts }) {
      const ids = new Set(traineeIdsFor(traineeId));
      const start = new Date(challenge.start_at).getTime();
      const end   = new Date(challenge.end_at).getTime();
      const wos = (workouts || [])
        .filter(w => ids.has(w.clientId) && inWindow(w.date, start, end))
        .sort((a, b) => new Date(a.date) - new Date(b.date));
      let best = 0, cur = 0;
      for (const w of wos) {
        const hasVid = Array.isArray(w.formVideos) && w.formVideos.some(fv => fv && fv.cloudUrl);
        if (hasVid) { cur++; if (cur > best) best = cur; } else cur = 0;
      }
      return best;
    },
  },

  // #6 — N consecutive ISO weeks with at least one new e1RM PR.
  stacking_prs: {
    label: 'Stacking PRs (weeks)',
    unit: 'weeks',
    compute({ challenge, traineeId, workouts }) {
      const ids = new Set(traineeIdsFor(traineeId));
      const start = new Date(challenge.start_at).getTime();
      const end   = new Date(challenge.end_at).getTime();
      const traineeWos = (workouts || []).filter(w => ids.has(w.clientId));
      const allPrWeeks = prWeeks(traineeWos);
      // Filter to weeks that fall inside the window.
      const inWin = [...allPrWeeks].filter(wk => {
        // Lower-bound: pick a date in that ISO week and test.
        const [y, w] = wk.split('-W').map(Number);
        const monday = isoWeekMonday(y, w);
        return inWindow(monday, start, end);
      });
      return longestConsecutive(inWin.sort(), nextIsoWeek);
    },
  },

  // #7 — Big Three: 0–3 (squat / bench / deadlift PRs within window).
  big_three_block: {
    label: 'Big Three block (squat·bench·deadlift)',
    unit: '/ 3',
    compute({ challenge, traineeId, workouts }) {
      const ids = new Set(traineeIdsFor(traineeId));
      const start = new Date(challenge.start_at).getTime();
      const end   = new Date(challenge.end_at).getTime();
      const traineeWos = (workouts || []).filter(w => ids.has(w.clientId));
      return bigThreePRs(traineeWos, start, end).size;
    },
  },

  // #10 — Perfect Week: 1 if ALL of (≥goal_value workouts that week,
  // ≥1 BW entry that week, 0 skipped sets across those workouts).
  // Default goal_value=3 workouts/week. Returns 0 or 1.
  perfect_week: {
    label: 'Perfect Week',
    unit: '',
    compute({ challenge, traineeId, workouts, bwLog }) {
      const ids = new Set(traineeIdsFor(traineeId));
      const start = new Date(challenge.start_at).getTime();
      const end   = new Date(challenge.end_at).getTime();
      const target = Math.max(1, Number(challenge.goal_value) || 3);
      // Use the LATEST ISO week within the challenge window.
      const endDate = new Date(Math.min(end, Date.now()));
      const wk = isoWeekKey(endDate.toISOString());
      let wos = 0, skips = 0, bws = 0;
      for (const w of (workouts || [])) {
        if (!ids.has(w.clientId)) continue;
        if (isoWeekKey(w.date) !== wk) continue;
        wos++;
        for (const ex of (w.exercises || [])) {
          for (const s of (ex.sets || [])) if (!s.done) skips++;
        }
      }
      for (const b of (bwLog || [])) {
        if (!ids.has(b.clientId)) continue;
        if (isoWeekKey(b.date) !== wk) continue;
        if (Number.isFinite(parseFloat(b.bw))) bws++;
      }
      return (wos >= target && bws >= 1 && skips === 0) ? 1 : 0;
    },
  },

  // #11 — Perfect Block: count of perfect weeks within the window.
  perfect_block: {
    label: 'Perfect Block (weeks)',
    unit: 'weeks',
    compute({ challenge, traineeId, workouts, bwLog }) {
      const ids = new Set(traineeIdsFor(traineeId));
      const start = new Date(challenge.start_at).getTime();
      const end   = new Date(challenge.end_at).getTime();
      const target = Math.max(1, Number(challenge.goal_value) || 3);
      // Enumerate all ISO weeks in the window.
      const allWeeks = new Set();
      for (let t = start; t <= end; t += 86400000) {
        allWeeks.add(isoWeekKey(new Date(t).toISOString()));
      }
      const wosByWk = new Map(), skipsByWk = new Map(), bwsByWk = new Map();
      for (const w of (workouts || [])) {
        if (!ids.has(w.clientId)) continue;
        if (!inWindow(w.date, start, end)) continue;
        const k = isoWeekKey(w.date);
        wosByWk.set(k, (wosByWk.get(k) || 0) + 1);
        let skips = 0;
        for (const ex of (w.exercises || [])) {
          for (const s of (ex.sets || [])) if (!s.done) skips++;
        }
        skipsByWk.set(k, (skipsByWk.get(k) || 0) + skips);
      }
      for (const b of (bwLog || [])) {
        if (!ids.has(b.clientId)) continue;
        if (!inWindow(b.date, start, end)) continue;
        if (!Number.isFinite(parseFloat(b.bw))) continue;
        const k = isoWeekKey(b.date);
        bwsByWk.set(k, (bwsByWk.get(k) || 0) + 1);
      }
      let perfect = 0;
      for (const k of allWeeks) {
        if ((wosByWk.get(k) || 0) >= target
            && (bwsByWk.get(k) || 0) >= 1
            && (skipsByWk.get(k) || 0) === 0) perfect++;
      }
      return perfect;
    },
  },

  custom: {
    label: 'Custom (manual)',
    unit: '',
    compute() { return null; }, // coach-set, read from participants.progress
  },
};

// ----- helpers exposed -----------------------------------------------

function isoWeekMonday(year, week) {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = (jan4.getUTCDay() + 6) % 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - jan4Day + (week - 1) * 7);
  return monday.toISOString();
}

export const GOAL_TYPES = Object.entries(GOAL_TYPES_NEW).map(([id, def]) => ({
  id, label: def.label, unit: def.unit, sortDir: def.sortDir || 'desc',
}));

export function computeProgress(challenge, traineeId, workouts, bwLog, meals) {
  const def = GOAL_TYPES_NEW[challenge.goal_type];
  if (!def) return null;
  try {
    return def.compute({ challenge, traineeId, workouts, bwLog, meals });
  } catch {
    return 0;
  }
}

// ----- templates -----------------------------------------------------

// Each template prefills the Create modal with sensible defaults so the
// coach hits "+ Add Challenge" → picks a tile → adjusts → saves.
//
// `durationDays` defines end_at = today + N days. `goalValue` populates
// the goal_value field. `description` shows in the athlete-side card.

export const TEMPLATES = [
  {
    id: 'attendance',
    icon: '🔥',
    label: 'Attendance Streak',
    blurb: 'N weeks in a row hitting the workout target',
    goalType: 'weekly_attendance_streak',
    goalValue: 3,
    durationDays: 28,
    name: 'Attendance Streak (4 weeks · 3/week)',
    description: 'Hit at least 3 workouts a week for 4 weeks running.',
  },
  {
    id: 'no_skip',
    icon: '🎯',
    label: 'No-Skip Block',
    blurb: 'Zero skipped sets for an entire block',
    goalType: 'no_skip_block',
    goalValue: 0,
    durationDays: 28,
    name: 'No-Skip Block (4 weeks)',
    description: 'Mark every prescribed set as done for the full block. Lower is better — 0 = perfect.',
  },
  {
    id: 'bw_weekly',
    icon: '⚖️',
    label: 'Weekly BW Streak',
    blurb: 'Log bodyweight every week',
    goalType: 'bw_weekly_streak',
    goalValue: null,
    durationDays: 56,
    name: 'Weekly BW Log (8 weeks)',
    description: 'Log your bodyweight at least once every week.',
  },
  {
    id: 'meal_streak',
    icon: '🥗',
    label: 'Meal Log Streak',
    blurb: 'Snap a meal photo every day',
    goalType: 'meal_log_streak',
    goalValue: null,
    durationDays: 30,
    name: 'Daily Meal Log (30 days)',
    description: 'Log at least one meal every day. Longest unbroken run wins.',
  },
  {
    id: 'video_streak',
    icon: '🎥',
    label: 'Form Video Streak',
    blurb: 'Submit a video every session',
    goalType: 'form_video_streak',
    goalValue: null,
    durationDays: 28,
    name: 'Form Video Streak (4 weeks)',
    description: 'Submit at least one form video on every logged workout.',
  },
  {
    id: 'stacking_prs',
    icon: '🏆',
    label: 'Stacking PRs',
    blurb: 'Set a PR each week, weeks in a row',
    goalType: 'stacking_prs',
    goalValue: null,
    durationDays: 42,
    name: 'Stacking PRs (6 weeks)',
    description: 'Hit at least one new estimated-1RM PR each week. Longest run wins.',
  },
  {
    id: 'big_three',
    icon: '💪',
    label: 'Big Three Block',
    blurb: 'PR squat + bench + deadlift in one block',
    goalType: 'big_three_block',
    goalValue: null,
    durationDays: 28,
    name: 'Big Three Block (4 weeks)',
    description: 'Set new estimated-1RM PRs on squat, bench, AND deadlift inside the block.',
  },
  {
    id: 'perfect_week',
    icon: '⭐',
    label: 'Perfect Week',
    blurb: 'All sessions + BW + zero skipped sets',
    goalType: 'perfect_week',
    goalValue: 3,
    durationDays: 7,
    name: 'Perfect Week',
    description: 'Hit every workout target, log your BW, and complete every prescribed set — all in one week.',
  },
  {
    id: 'perfect_block',
    icon: '🌟',
    label: 'Perfect Block',
    blurb: 'Perfect Week × full block length',
    goalType: 'perfect_block',
    goalValue: 3,
    durationDays: 28,
    name: 'Perfect Block (4 weeks)',
    description: 'Every week of the block: target workouts hit, BW logged, zero skips.',
  },
  {
    id: 'session_count',
    icon: '📈',
    label: 'Session Milestone',
    blurb: 'Total sessions logged this period',
    goalType: 'workouts_count',
    goalValue: 100,
    durationDays: 90,
    name: 'Session Milestone (90 days)',
    description: 'Hit a total session count over the next quarter. Default target = 100.',
  },
  {
    id: 'coach_pick',
    icon: '👑',
    label: 'Coach Pick',
    blurb: 'Custom challenge — you score it manually',
    goalType: 'custom',
    goalValue: null,
    durationDays: 28,
    name: 'Coach Pick (4 weeks)',
    description: 'A coach-defined goal. Update progress manually on the leaderboard.',
  },
];
