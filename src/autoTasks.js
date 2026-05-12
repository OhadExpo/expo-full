// Auto-fill task engine — runs on Dashboard mount, scans the data the
// dashboard already loaded (trainees, plans, workouts, payments, intakes),
// and inserts coach_notes rows for any "system knows about" condition
// that doesn't already have a task. Idempotency is enforced by the
// (auto_kind, auto_ref) unique partial index on coach_notes.
//
// Each rule has:
//   kind        — string used as coach_notes.auto_kind
//   detect(ctx) — returns [{ ref, body, target_id, target_label, pinned? }, ...]
//   resolve(ctx, existing) — returns Set<ref> of refs whose condition no
//                            longer applies (so the open task can auto-close)
//
// The sync function INSERTs missing rows (ON CONFLICT DO NOTHING via the
// unique index) and UPDATEs existing-open rows to done if resolve() lists
// their ref.

import { supabase } from './supabase';
import { toast } from './ui';

// ─────────────────────────────────────────────────────────────────────
// Helper utilities shared across rules
// ─────────────────────────────────────────────────────────────────────
const DAY_MS = 86400000;

const daysAgo = (iso) => {
  if (!iso) return Infinity;
  return Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS);
};

// Parse "2x/week" / "Couple 1x/week" / "Online 3x" → integer sessions per week.
// Falls back to 2 when unparseable.
const sessionsPerWeek = (format) => {
  const m = String(format || '').toLowerCase().match(/(\d+(?:\.\d+)?)\s*x/);
  const n = m ? parseFloat(m[1]) : 2;
  return n > 0 ? n : 2;
};

// Bump "Block #17 - GPP" → "Block #18 - GPP" if the current name has a
// "#N" segment we can increment. Returns the raw name when no parseable
// block number is present.
const nextBlockName = (currentName) => {
  if (!currentName) return 'next block';
  const m = currentName.match(/#(\d+)/);
  if (!m) return `${currentName} (next)`;
  const next = parseInt(m[1], 10) + 1;
  return currentName.replace(/#\d+/, `#${next}`);
};

// ─────────────────────────────────────────────────────────────────────
// Rules
// ─────────────────────────────────────────────────────────────────────

// 1) NEXT_BLOCK_DUE — last day of W(N-1) of an N-week plan completed
const ruleNextBlockDue = {
  kind: 'next_block_due',
  detect({ trainees, plans, workouts }) {
    const out = [];
    for (const t of trainees) {
      if (t.status !== 'Active' && t.status !== 'Trial') continue;
      // Active plans for this trainee (current block — most recent)
      const tPlans = plans.filter(p => p.traineeId === t.id);
      if (tPlans.length === 0) continue;
      // Pick the plan that has the most-recent workout — that's the
      // current block. If no workout, the most-recently-created plan.
      const tWorkouts = workouts.filter(w => w.clientId === t.id);
      let current = null;
      if (tWorkouts.length > 0) {
        const latestWk = tWorkouts.reduce((a, b) =>
          new Date(b.date) > new Date(a.date) ? b : a);
        current = tPlans.find(p => p.name === latestWk.planName) || null;
      }
      if (!current) {
        current = tPlans.slice().sort((a, b) =>
          new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0];
      }
      if (!current) continue;
      const weeks = current.weeks || (current.days ? 4 : null);
      if (!weeks || weeks < 2) continue;
      const planDays = current.days || [];
      if (planDays.length === 0) continue;
      const lastDayName = planDays[planDays.length - 1].name;
      // Did the trainee finish last day of W(weeks-1)?
      const milestoneHit = tWorkouts.some(w =>
        w.planName === current.name &&
        w.week === (weeks - 1) &&
        w.dayName === lastDayName);
      if (!milestoneHit) continue;
      out.push({
        ref: current.id,
        body: `Build ${nextBlockName(current.name)} for ${t.name} — ${current.name} ends in 1 week`,
        target_id: t.id,
        target_label: t.name,
      });
    }
    return out;
  },
  // Auto-completes when a NEWER plan exists for this trainee (created
  // after the current one).
  resolve({ trainees, plans }, existing) {
    const closing = new Set();
    for (const row of existing) {
      const currentPlanId = row.auto_ref;
      const currentPlan = plans.find(p => p.id === currentPlanId);
      if (!currentPlan) { closing.add(currentPlanId); continue; }
      const newer = plans.find(p =>
        p.traineeId === currentPlan.traineeId &&
        p.id !== currentPlanId &&
        new Date(p.createdAt || 0) > new Date(currentPlan.createdAt || 0));
      if (newer) closing.add(currentPlanId);
    }
    return closing;
  },
};

// 2) WEEK_MISSED — an entire training week elapsed with zero logged
//    sessions for the current plan. Trigger window: 14d since the last
//    workout (one full week missed, gives some grace).
const ruleWeekMissed = {
  kind: 'week_missed',
  detect({ trainees, plans, workouts }) {
    const out = [];
    for (const t of trainees) {
      if (t.status !== 'Active') continue;
      const tWorkouts = workouts.filter(w => w.clientId === t.id);
      if (tWorkouts.length === 0) continue;
      const latest = tWorkouts.reduce((a, b) =>
        new Date(b.date) > new Date(a.date) ? b : a);
      const since = daysAgo(latest.date);
      // Trigger when more than 7 days elapsed past expected next workout.
      // For 2x/week (3.5d expected), 11+ days = week missed.
      const expectedGap = 7 / sessionsPerWeek(t.format);
      if (since < expectedGap + 7) continue;
      const currentBlock = plans.find(p =>
        p.traineeId === t.id && p.name === latest.planName);
      if (!currentBlock) continue;
      const weeks = currentBlock.weeks || 4;
      const nextWeek = (latest.week || 1) + 1;
      if (nextWeek > weeks) continue; // Block already over — handled by next_block_due
      out.push({
        ref: `${currentBlock.id}|w${nextWeek}`,
        body: `${t.name} skipped W${nextWeek} of ${currentBlock.name} — call before next session`,
        target_id: t.id,
        target_label: t.name,
        pinned: true, // safety/retention signal — float to top
      });
    }
    return out;
  },
  // Auto-completes when a workout is logged for THIS plan in or after
  // the missed week.
  resolve({ workouts }, existing) {
    const closing = new Set();
    for (const row of existing) {
      const [planId, wPart] = (row.auto_ref || '').split('|w');
      const wNum = parseInt(wPart, 10);
      if (!planId || !wNum) continue;
      // Workouts for this plan — we don't have plan.id on workout row, so
      // we match by trainee + week + ≥ skip-week. The resolver just needs
      // any workout in that week or later.
      const wkLogged = workouts.some(w =>
        w.clientId === row.target_id && w.week >= wNum);
      if (wkLogged) closing.add(row.auto_ref);
    }
    return closing;
  },
};

// 3) AT_RISK_SILENT — no trainee touch in 14d. Merged dormant +
//    no-communication: a trainee is at risk only when BOTH signals
//    align (no workout AND no review note AND no manual activity).
//    One trainee → one task at a time.
const ruleAtRiskSilent = {
  kind: 'at_risk_silent',
  detect({ trainees, workouts, activityRows }) {
    const out = [];
    for (const t of trainees) {
      if (t.status !== 'Active') continue;
      const tWorkouts = workouts.filter(w => w.clientId === t.id);
      const tActivity = (activityRows || []).filter(a => a.trainee_id === t.id);
      const latestWorkoutAgo = tWorkouts.length
        ? Math.min(...tWorkouts.map(w => daysAgo(w.date)))
        : Infinity;
      const latestActivityAgo = tActivity.length
        ? Math.min(...tActivity.map(a => daysAgo(a.occurred_at)))
        : Infinity;
      // Both signals must be quiet
      if (latestWorkoutAgo < 14 || latestActivityAgo < 14) continue;
      const wkLabel = tWorkouts.length === 0 ? 'never trained'
                                              : `${latestWorkoutAgo}d no workout`;
      const acLabel = tActivity.length === 0 ? 'never contacted'
                                              : `${latestActivityAgo}d no contact`;
      out.push({
        ref: t.id,
        body: `Re-engage ${t.name} — ${wkLabel}, ${acLabel}. Expected ${sessionsPerWeek(t.format)}×/week.`,
        target_id: t.id,
        target_label: t.name,
      });
    }
    return out;
  },
  resolve({ workouts, activityRows }, existing) {
    const closing = new Set();
    for (const row of existing) {
      const tid = row.target_id;
      const sinceWk = workouts
        .filter(w => w.clientId === tid)
        .reduce((min, w) => Math.min(min, daysAgo(w.date)), Infinity);
      const sinceAc = (activityRows || [])
        .filter(a => a.trainee_id === tid)
        .reduce((min, a) => Math.min(min, daysAgo(a.occurred_at)), Infinity);
      if (sinceWk < 14 || sinceAc < 14) closing.add(tid);
    }
    return closing;
  },
};

// 4) FORM_VIDEO_PENDING_REVIEW — video uploaded, no review notes in 24h+
const ruleFormVideoPending = {
  kind: 'form_video_pending_review',
  detect({ trainees, workouts }) {
    const out = [];
    for (const w of workouts) {
      if (!Array.isArray(w.formVideos)) continue;
      const t = trainees.find(tt => tt.id === w.clientId);
      if (!t) continue;
      w.formVideos.forEach((fv, i) => {
        if (!fv?.cloudUrl) return;
        const notes = Array.isArray(fv.reviewNotes) ? fv.reviewNotes : [];
        if (notes.length > 0) return;
        if (daysAgo(w.date) < 1) return; // give the coach 24h
        const exTitle = (w.exercises?.[i]?.title) || `Exercise #${i + 1}`;
        out.push({
          ref: `${w.id}|${i}`,
          body: `Review ${t.name}'s form video — ${exTitle}, W${w.week} ${w.dayName} from ${new Date(w.date).toLocaleDateString()}`,
          target_id: t.id,
          target_label: t.name,
        });
      });
    }
    return out;
  },
  resolve({ workouts }, existing) {
    const closing = new Set();
    for (const row of existing) {
      const [woId, idxPart] = (row.auto_ref || '').split('|');
      const idx = parseInt(idxPart, 10);
      const wo = workouts.find(w => w.id === woId);
      if (!wo) { closing.add(row.auto_ref); continue; }
      const fv = wo.formVideos?.[idx];
      if (fv?.reviewNotes && fv.reviewNotes.length > 0) closing.add(row.auto_ref);
    }
    return closing;
  },
};

// 5) NEW_INTAKE_PENDING — intake_submissions with reviewed_at IS NULL
const ruleNewIntakePending = {
  kind: 'new_intake_pending',
  detect({ intakeSubmissions }) {
    if (!intakeSubmissions) return [];
    return intakeSubmissions
      .filter(s => !s.reviewed_at)
      .map(s => ({
        ref: s.id,
        body: `New intake from ${s.name || s.email || 'unknown'} — review & onboard`,
        target_id: s.trainee_id || null,
        target_label: s.name || null,
      }));
  },
  resolve({ intakeSubmissions }, existing) {
    const closing = new Set();
    for (const row of existing) {
      const s = (intakeSubmissions || []).find(x => x.id === row.auto_ref);
      if (!s || s.reviewed_at) closing.add(row.auto_ref);
    }
    return closing;
  },
};

// 6) PAYMENT_OVERDUE — last payment 14d+ overdue OR Never Paid after 21d
const rulePaymentOverdue = {
  kind: 'payment_overdue',
  detect({ trainees, payments }) {
    const out = [];
    for (const t of trainees) {
      if (t.status !== 'Active') continue;
      const tPay = (payments || []).filter(p => p.traineeId === t.id);
      const monthly = parseFloat(t.monthly) || 0;
      if (tPay.length === 0) {
        // "Never paid" after 21d since start
        const since = daysAgo(t.startDate);
        if (since >= 21) {
          out.push({
            ref: t.id,
            body: `Chase ${t.name}'s payment — never paid, ${since}d since signup${monthly ? ` (${monthly}/mo)` : ''}`,
            target_id: t.id,
            target_label: t.name,
          });
        }
        continue;
      }
      const latest = tPay.reduce((a, b) =>
        new Date(b.date) > new Date(a.date) ? b : a);
      const since = daysAgo(latest.date);
      // For monthly plans, "overdue" = 14d+ past the 30d window since last
      // payment (so ≥ 44d since last paid for a monthly).
      const overdueThreshold = monthly > 0 ? 44 : 14;
      if (since >= overdueThreshold) {
        const amount = monthly || latest.amount || 0;
        out.push({
          ref: t.id,
          body: `Chase ${t.name}'s payment — last paid ${since}d ago${amount ? ` (₪${amount} due)` : ''}`,
          target_id: t.id,
          target_label: t.name,
        });
      }
    }
    return out;
  },
  resolve({ trainees, payments }, existing) {
    const closing = new Set();
    for (const row of existing) {
      const t = trainees.find(x => x.id === row.target_id);
      if (!t) { closing.add(row.target_id); continue; }
      const tPay = (payments || []).filter(p => p.traineeId === t.id);
      if (tPay.length === 0) continue;
      const latest = tPay.reduce((a, b) =>
        new Date(b.date) > new Date(a.date) ? b : a);
      const since = daysAgo(latest.date);
      const monthly = parseFloat(t.monthly) || 0;
      const threshold = monthly > 0 ? 44 : 14;
      if (since < threshold) closing.add(row.target_id);
    }
    return closing;
  },
};

// 7) EVAL_DUE_FIRST_SESSION — intake reviewed but trainee has zero
//    athletic evaluations. Ohad runs evals in-person; intake is the
//    client's self-report. This bridges them.
const ruleEvalDueFirstSession = {
  kind: 'eval_due_first_session',
  detect({ trainees, intakeSubmissions, evaluations }) {
    if (!intakeSubmissions) return [];
    const out = [];
    for (const s of intakeSubmissions) {
      if (!s.reviewed_at) continue;
      if (!s.trainee_id) continue;
      const t = trainees.find(x => x.id === s.trainee_id);
      if (!t) continue;
      if (t.status === 'Archived' || t.status === 'Inactive') continue;
      const hasEval = (evaluations || []).some(e => e.trainee_id === t.id);
      if (hasEval) continue;
      out.push({
        ref: t.id,
        body: `Run athletic eval for ${t.name} — first session, baseline needed (intake reviewed)`,
        target_id: t.id,
        target_label: t.name,
      });
    }
    return out;
  },
  resolve({ evaluations }, existing) {
    const closing = new Set();
    for (const row of existing) {
      const has = (evaluations || []).some(e => e.trainee_id === row.target_id);
      if (has) closing.add(row.target_id);
    }
    return closing;
  },
};

const RULES = [
  ruleNextBlockDue,
  ruleWeekMissed,
  ruleAtRiskSilent,
  ruleFormVideoPending,
  ruleNewIntakePending,
  rulePaymentOverdue,
  ruleEvalDueFirstSession,
];

// ─────────────────────────────────────────────────────────────────────
// Sync entrypoint — call once per Dashboard mount.
// ─────────────────────────────────────────────────────────────────────
let lastSyncAt = 0;
const SYNC_THROTTLE_MS = 30_000; // don't re-sync within 30s

const newAutoId = () =>
  'note_auto_' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36).slice(-4);

export async function syncAutoTasks({ trainees, plans, workouts, payments } = {}) {
  if (!Array.isArray(trainees) || trainees.length === 0) return;
  const now = Date.now();
  if (now - lastSyncAt < SYNC_THROTTLE_MS) return;
  lastSyncAt = now;

  // Lazy-load the supporting data the rules need but the dashboard
  // doesn't already have (intake submissions + athletic evals +
  // trainee activity log).
  let intakeSubmissions = [];
  let evaluations = [];
  let activityRows = [];
  try {
    const [i, e, a] = await Promise.all([
      supabase.from('intake_submissions').select('id, name, email, trainee_id, form_type, reviewed_at, created_at').limit(500),
      supabase.from('trainee_evaluations').select('id, trainee_id, eval_date').limit(500),
      supabase.from('trainee_activity').select('id, trainee_id, occurred_at, kind').limit(500),
    ]);
    intakeSubmissions = i.data || [];
    evaluations = e.data || [];
    activityRows = a.data || [];
  } catch {
    /* gracefully degrade — relevant rules just return [] */
  }

  // Read existing auto-tasks (one query, all kinds)
  const { data: existingRows, error: rdErr } = await supabase
    .from('coach_notes')
    .select('id, auto_kind, auto_ref, target_id, target_label, status')
    .not('auto_kind', 'is', null)
    .limit(2000);
  if (rdErr) {
    // Migration not applied yet — silently bail so the dashboard still works
    if (/column .* does not exist/i.test(rdErr.message)) return;
    console.warn('autoTasks read failed:', rdErr.message);
    return;
  }
  const byKey = new Map();
  for (const r of existingRows || []) {
    byKey.set(`${r.auto_kind}|${r.auto_ref}`, r);
  }

  const ctx = { trainees, plans, workouts, payments, intakeSubmissions, evaluations, activityRows };

  // Phase A: compute desired open-task set
  const inserts = [];
  for (const rule of RULES) {
    let desired = [];
    try { desired = rule.detect(ctx) || []; }
    catch (e) { console.warn(`rule ${rule.kind} detect threw:`, e); }
    for (const d of desired) {
      const key = `${rule.kind}|${d.ref}`;
      if (byKey.has(key)) continue; // already exists (open or done)
      inserts.push({
        id: newAutoId(),
        body: d.body,
        target_kind: d.target_id ? 'trainee' : 'general',
        target_id: d.target_id || null,
        target_label: d.target_label || null,
        pinned: !!d.pinned,
        status: 'open',
        auto_kind: rule.kind,
        auto_ref: d.ref,
      });
    }
  }

  // Phase B: resolve open tasks whose condition no longer applies
  const updates = [];
  for (const rule of RULES) {
    const openOfKind = (existingRows || [])
      .filter(r => r.auto_kind === rule.kind && r.status === 'open');
    if (openOfKind.length === 0) continue;
    let closing = new Set();
    try { closing = rule.resolve(ctx, openOfKind) || new Set(); }
    catch (e) { console.warn(`rule ${rule.kind} resolve threw:`, e); }
    for (const row of openOfKind) {
      if (closing.has(row.auto_ref)) {
        updates.push({ id: row.id });
      }
    }
  }

  // Execute
  if (inserts.length > 0) {
    const { error } = await supabase.from('coach_notes').insert(inserts);
    if (error && !/duplicate key/i.test(error.message)) {
      console.warn('autoTasks insert failed:', error.message);
      toast(`Auto-task sync warning: ${error.message}`, 'warning', { ttl: 6000 });
    }
  }
  if (updates.length > 0) {
    const ids = updates.map(u => u.id);
    const { error } = await supabase
      .from('coach_notes')
      .update({ status: 'done', completed_at: new Date().toISOString() })
      .in('id', ids);
    if (error) console.warn('autoTasks resolve failed:', error.message);
  }
}

// Expose the rule kinds + their human-readable label for the ⚙ AUTO badge
export const AUTO_KIND_LABEL = {
  next_block_due: 'BLOCK ENDING',
  week_missed: 'WEEK SKIPPED',
  at_risk_silent: 'AT RISK',
  form_video_pending_review: 'VIDEO PENDING',
  new_intake_pending: 'NEW INTAKE',
  payment_overdue: 'PAYMENT OVERDUE',
  eval_due_first_session: 'EVAL DUE',
};
