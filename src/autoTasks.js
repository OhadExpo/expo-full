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
import { traineeIdsFor } from './traineeUtils';

// ─────────────────────────────────────────────────────────────────────
// Helper utilities shared across rules
// ─────────────────────────────────────────────────────────────────────
const DAY_MS = 86400000;

// Wrap a value in Unicode FSI (U+2068) ... PDI (U+2069) so the browser's
// bidi algorithm treats it as an isolated unit. Hebrew names embedded in
// English task bodies otherwise pull neighboring numbers/punctuation into
// their RTL run, scrambling output like "CHASE PAYMENT FROM <heb> · 4850
// SINCE SIGNUP" on the dashboard. The isolate chars are invisible.
const bidi = (v) => `⁨${v == null ? '' : String(v)}⁩`;

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

// "Ghost" trainees — imported into the roster but never engaged with
// the system. No workouts logged via the portal, no manual activity
// rows, no intake submission. For these, the auto-task engine is
// noise: every rule would either no-op or fire a "re-engage" task that
// the coach already knows is a dead lead. Skip them entirely at
// detect-time so the dashboard stays focused on live clients.
function isGhostTrainee(t, ctx) {
  const ids = new Set(traineeIdsFor(t.id));
  const { workouts = [], activityRows = [], intakeSubmissions = [] } = ctx || {};
  if (workouts.some(w => ids.has(w.clientId))) return false;
  if (activityRows.some(a => ids.has(a.trainee_id))) return false;
  if (intakeSubmissions.some(s => s.trainee_id && ids.has(s.trainee_id))) return false;
  return true;
}

// ─────────────────────────────────────────────────────────────────────
// Rules
// ─────────────────────────────────────────────────────────────────────

// 1) NEXT_BLOCK_DUE — last day of W(N-1) of an N-week plan completed
const ruleNextBlockDue = {
  kind: 'next_block_due',
  detect(ctx) {
    const { trainees, plans, workouts } = ctx;
    const out = [];
    for (const t of trainees) {
      if (t.status !== 'Active' && t.status !== 'Trial') continue;
      if (isGhostTrainee(t, ctx)) continue;
      // Active plans for this trainee (current block — most recent)
      const tPlans = plans.filter(p => traineeIdsFor(t.id).includes(p.traineeId));
      if (tPlans.length === 0) continue;
      // Pick the plan that has the most-recent workout — that's the
      // current block. If no workout, the most-recently-created plan.
      const tWorkouts = workouts.filter(w => traineeIdsFor(t.id).includes(w.clientId));
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
        body: `Build ${bidi(nextBlockName(current.name))} for ${bidi(t.name)}`,
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
      // Couple-aware: the successor block may be filed under the parent id or
      // the other member suffix — match the same FAMILY, not the exact id
      // (audit 08-22).
      const familyOf = (tid) => String(tid || '').split('__')[0];
      const newer = plans.find(p =>
        familyOf(p.traineeId) === familyOf(currentPlan.traineeId) &&
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
  detect(ctx) {
    const { trainees, plans, workouts } = ctx;
    const out = [];
    for (const t of trainees) {
      if (t.status !== 'Active') continue;
      if (isGhostTrainee(t, ctx)) continue;
      const tWorkouts = workouts.filter(w => traineeIdsFor(t.id).includes(w.clientId));
      if (tWorkouts.length === 0) continue;
      const latest = tWorkouts.reduce((a, b) =>
        new Date(b.date) > new Date(a.date) ? b : a);
      const since = daysAgo(latest.date);
      // Trigger when more than 7 days elapsed past expected next workout.
      // For 2x/week (3.5d expected), 11+ days = week missed.
      const expectedGap = 7 / sessionsPerWeek(t.format);
      if (since < expectedGap + 7) continue;
      const currentBlock = plans.find(p =>
        traineeIdsFor(t.id).includes(p.traineeId) && p.name === latest.planName);
      if (!currentBlock) continue;
      const weeks = currentBlock.weeks || 4;
      const nextWeek = (latest.week || 1) + 1;
      if (nextWeek > weeks) continue; // Block already over — handled by next_block_due
      out.push({
        ref: `${currentBlock.id}|w${nextWeek}`,
        body: `Call ${bidi(t.name)} — skipped W${nextWeek} of ${bidi(currentBlock.name)}`,
        target_id: t.id,
        target_label: t.name,
        pinned: true, // safety/retention signal — float to top
      });
    }
    return out;
  },
  // Auto-completes when a workout is logged for THIS plan in or after
  // the missed week. Plan-aware match: client_workouts carry planName
  // (not plan.id), so we look up the plan id → planName via the ctx
  // plans list, then require both the trainee AND the plan name to
  // match before considering the week. The earlier shape resolved on
  // (trainee, week) alone — a trainee on two concurrent plans would
  // have plan A's "week missed" task closed by a plan B logged workout.
  resolve({ workouts, plans }, existing) {
    const closing = new Set();
    for (const row of existing) {
      const [planId, wPart] = (row.auto_ref || '').split('|w');
      const wNum = parseInt(wPart, 10);
      if (!planId || !wNum) continue;
      const plan = (plans || []).find(p => p.id === planId);
      const planName = plan?.name;
      const wkIds = traineeIdsFor(row.target_id);   // couple-aware, matching detect
      const wkLogged = workouts.some(w =>
        wkIds.includes(w.clientId)
        && (planName ? w.planName === planName : true)
        && w.week >= wNum);
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
  detect(ctx) {
    const { trainees, workouts, activityRows } = ctx;
    const out = [];
    for (const t of trainees) {
      if (t.status !== 'Active') continue;
      // Skip trainees who just joined — they haven't had time to be silent.
      // Without this guard a fresh import day triggers a task per trainee
      // labeled "never trained, never contacted" since both signals read
      // Infinity (no rows = quiet by definition).
      const sinceStart = daysAgo(t.startDate);
      if (sinceStart < 14) continue;
      // Never-engaged trainees (no workout, no activity, no intake) are
      // ghosts — coach already knows they're inert; don't generate a
      // re-engage task that adds nothing.
      if (isGhostTrainee(t, ctx)) continue;
      const tWorkouts = workouts.filter(w => traineeIdsFor(t.id).includes(w.clientId));
      // Match the workout filter's couple-aware scoping — activity logged under a
      // couple sub-member id (tr__0/__1) was missed by the parent-only compare,
      // which could flag a recently-contacted couple as "never contacted".
      const tActivity = (activityRows || []).filter(a => traineeIdsFor(t.id).includes(a.trainee_id));
      const latestWorkoutAgo = tWorkouts.length
        ? Math.min(...tWorkouts.map(w => daysAgo(w.date)))
        : Infinity;
      const latestActivityAgo = tActivity.length
        ? Math.min(...tActivity.map(a => daysAgo(a.occurred_at)))
        : Infinity;
      // Both signals must be quiet — hysteresis: fire at ≥21d so the task
      // doesn't flicker around the 14d resolve boundary in the resolver
      // below. A trainee who crosses 14d→21d sits silent until either
      // touch crosses 21d (open) or any touch is fresher than 14d (close).
      if (latestWorkoutAgo < 21 || latestActivityAgo < 21) continue;
      const wkLabel = tWorkouts.length === 0 ? 'never trained'
                                              : `${latestWorkoutAgo}d no workout`;
      const acLabel = tActivity.length === 0 ? 'never contacted'
                                              : `${latestActivityAgo}d no contact`;
      out.push({
        ref: t.id,
        body: `Reach out to ${bidi(t.name)} — ${wkLabel}, ${acLabel}`,
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
      const ids = traineeIdsFor(tid);   // couple-aware, matching detect
      const sinceWk = workouts
        .filter(w => ids.includes(w.clientId))
        .reduce((min, w) => Math.min(min, daysAgo(w.date)), Infinity);
      const sinceAc = (activityRows || [])
        .filter(a => ids.includes(a.trainee_id))
        .reduce((min, a) => Math.min(min, daysAgo(a.occurred_at)), Infinity);
      // Resolve when either signal goes fresh again — sync matches against
      // auto_ref (the rule's canonical key), not target_id. They happen to
      // match for this rule, but returning auto_ref keeps the contract
      // explicit and protects future rule authors who change the shape.
      if (sinceWk < 14 || sinceAc < 14) closing.add(row.auto_ref);
    }
    return closing;
  },
};

// 4) FORM_VIDEO_PENDING_REVIEW — one task per WORKOUT that has any
//    cloud-uploaded videos with zero review notes. (Earlier shape emitted
//    one task per video, which buried the dashboard under N near-identical
//    rows whenever a trainee filmed every exercise.) The task's
//    "→ REVIEW" action navigates to the workout review session where
//    every pending video lives, so one click drains them all.
const ruleFormVideoPending = {
  kind: 'form_video_pending_review',
  // Helper — does this trainee have ANY unreviewed form video (past the 24h
  // grace)? Couple-aware via traineeIdsFor. Shared by detect + resolve so the
  // two never drift.
  _unreviewedCount(trainee, workouts) {
    let n = 0;
    for (const w of workouts) {
      if (!Array.isArray(w.formVideos) || w.reviewedAt) continue;
      if (daysAgo(w.date) < 1) continue;         // give the coach 24h
      if (!traineeIdsFor(trainee.id).includes(w.clientId)) continue;
      for (const fv of w.formVideos) {
        if (!fv?.cloudUrl) continue;
        const notes = Array.isArray(fv.reviewNotes) ? fv.reviewNotes : [];
        if (notes.length === 0) n++;
      }
    }
    return n;
  },
  detect(ctx) {
    const { trainees, workouts } = ctx;
    // AGGREGATE per trainee (Ohad: "don't need a notification for every single
    // video"). One task per athlete listing their TOTAL unreviewed form videos,
    // instead of one per workout/day. ref = trainee id → the (auto_kind,auto_ref)
    // index keeps exactly one row per athlete, and the old per-workout rows
    // (ref = workout id) fall through resolve() below and auto-close.
    const out = [];
    for (const t of trainees) {
      const unreviewed = this._unreviewedCount(t, workouts);
      if (unreviewed === 0) continue;
      out.push({
        ref: t.id,
        body: `Review ${unreviewed} form video${unreviewed === 1 ? '' : 's'} from ${bidi(t.name)}`,
        target_id: t.id,
        target_label: t.name,
      });
    }
    return out;
  },
  resolve({ trainees, workouts }, existing) {
    const closing = new Set();
    for (const row of existing) {
      // New rows key on trainee id; legacy per-workout rows key on a workout id
      // (no matching trainee) → close them so they collapse into the aggregate.
      const t = trainees.find(tt => tt.id === row.auto_ref);
      if (!t) { closing.add(row.auto_ref); continue; }
      if (this._unreviewedCount(t, workouts) === 0) closing.add(row.auto_ref);
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
        body: `Onboard ${bidi(s.name || s.email || 'new intake')}`,
        target_id: s.trainee_id || s.id,
        target_label: s.name || null,
        // INTAKE filter pill expects target_kind === 'intake'. Without this
        // override, sync falls back to the s.trainee_id ternary and lands
        // most rows in 'general' (since intake's trainee_id is usually
        // null pre-onboarding).
        target_kind: 'intake',
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
  detect(ctx) {
    const { trainees, payments } = ctx;
    const out = [];
    for (const t of trainees) {
      if (t.status !== 'Active') continue;
      if (isGhostTrainee(t, ctx)) continue;
      const tPay = (payments || []).filter(p => traineeIdsFor(t.id).includes(p.traineeId) && p.status === 'Paid');
      const monthly = parseFloat(t.monthly) || 0;
      if (tPay.length === 0) {
        // "Never paid" after 21d since start
        const since = daysAgo(t.startDate);
        // Missing startDate → daysAgo returns Infinity: still chase, but never
        // interpolate 'Infinityd since signup' (audit 08-22).
        if (since >= 21) {
          out.push({
            ref: t.id,
            body: `Chase payment from ${bidi(t.name)} · never paid${Number.isFinite(since) ? ` · ${since}d since signup` : ''}${monthly ? ` · ₪${monthly}/mo` : ''}`,
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
          body: `Chase payment from ${bidi(t.name)} · last paid ${since}d ago${amount ? ` · ₪${amount} due` : ''}`,
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
      // Resolve via auto_ref — the rule's canonical key — not target_id.
      // They match today (auto_ref === t.id) but the sync layer compares
      // against auto_ref; future rule changes mustn't drift the two apart.
      if (!t) { closing.add(row.auto_ref); continue; }
      const tPay = (payments || []).filter(p => traineeIdsFor(t.id).includes(p.traineeId) && p.status === 'Paid');
      if (tPay.length === 0) continue;
      const latest = tPay.reduce((a, b) =>
        new Date(b.date) > new Date(a.date) ? b : a);
      const since = daysAgo(latest.date);
      const monthly = parseFloat(t.monthly) || 0;
      const threshold = monthly > 0 ? 44 : 14;
      if (since < threshold) closing.add(row.auto_ref);
    }
    return closing;
  },
};

// 7) EVAL_DUE_FIRST_SESSION — intake reviewed but trainee has zero
//    athletic evaluations. Ohad runs evals in-person; intake is the
//    client's self-report. This bridges them.
const ruleEvalDueFirstSession = {
  kind: 'eval_due_first_session',
  detect(ctx) {
    const { trainees, intakeSubmissions, evaluations } = ctx;
    if (!intakeSubmissions) return [];
    const out = [];
    for (const s of intakeSubmissions) {
      if (!s.reviewed_at) continue;
      if (!s.trainee_id) continue;
      const t = trainees.find(x => x.id === s.trainee_id);
      if (!t) continue;
      if (t.status === 'Archived' || t.status === 'Inactive') continue;
      // Submitted+reviewed intake counts as engagement, so isGhost is
      // false here regardless. No filter needed.
      const hasEval = (evaluations || []).some(e => e.trainee_id === t.id);
      if (hasEval) continue;
      out.push({
        ref: t.id,
        body: `Run athletic eval on ${bidi(t.name)} · first-session baseline`,
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

// 8) LEAD_CALLBACK_PENDING — a leads row landed and Ohad/Yuval haven't
//    converted it yet. Yuval's spec (2026-05-28) calls this the #1
//    automation: every new prospect generates a callback task so no
//    inbound goes silently into the queue. Window: ≥1 day old (give a
//    short grace so we don't ping for a contact that just landed) and
//    ≤30 days old (older leads stop generating new tasks — Ohad can
//    chase them from /coach/waitlist if he wants to).
const ruleLeadCallbackPending = {
  kind: 'lead_callback_pending',
  detect(ctx) {
    const { leads } = ctx;
    if (!Array.isArray(leads)) return [];
    const out = [];
    for (const l of leads) {
      if (l.consumed_at) continue;
      const age = daysAgo(l.created_at);
      if (age < 1 || age > 30) continue;
      const handle = (l.email || '').trim() || 'unknown lead';
      const ctxLabel = l.context && l.context !== 'unknown' ? ` via ${l.context}` : '';
      const summary = l.notes ? ` — ${String(l.notes).slice(0, 80)}` : '';
      out.push({
        ref: l.id,
        body: `Call back ${bidi(handle)} · ${age}d since signup${ctxLabel}${summary}`,
        target_id: null,
        target_label: handle,
        target_kind: 'general',
      });
    }
    return out;
  },
  resolve({ leads }, existing) {
    const closing = new Set();
    for (const row of existing) {
      const l = (leads || []).find(x => x.id === row.auto_ref);
      // Resolve when Ohad sets consumed_at on the lead (reply / convert),
      // OR the lead row vanished (manual delete from /coach/waitlist).
      if (!l || l.consumed_at) closing.add(row.auto_ref);
    }
    return closing;
  },
};

// 9) PLAN_DUE_AFTER_EVAL — trainee has a completed athletic evaluation
//    but no training plan yet. Yuval's spec calls this the #2 automation:
//    the eval is the gate that produces the first program; the moment
//    the eval is done, "build the first plan" should appear in Ohad's
//    queue without him having to remember.
const rulePlanDueAfterEval = {
  kind: 'plan_due_after_eval',
  detect(ctx) {
    const { trainees, plans, evaluations } = ctx;
    if (!Array.isArray(evaluations) || evaluations.length === 0) return [];
    const out = [];
    for (const t of trainees) {
      if (t.status === 'Archived' || t.status === 'Inactive') continue;
      const hasEval = evaluations.some(e => e.trainee_id === t.id);
      if (!hasEval) continue;
      const hasPlan = plans.some(p => traineeIdsFor(t.id).includes(p.traineeId));
      if (hasPlan) continue;
      out.push({
        ref: t.id,
        body: `Build first training program for ${bidi(t.name)} · eval is done`,
        target_id: t.id,
        target_label: t.name,
      });
    }
    return out;
  },
  resolve({ plans }, existing) {
    const closing = new Set();
    for (const row of existing) {
      const hasPlan = (plans || []).some(p => traineeIdsFor(row.target_id).includes(p.traineeId));
      if (hasPlan) closing.add(row.auto_ref);
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
  ruleLeadCallbackPending,
  rulePlanDueAfterEval,
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
  // trainee activity log + unconverted leads).
  let intakeSubmissions = [];
  let evaluations = [];
  let activityRows = [];
  let leads = [];
  try {
    const [i, e, a, l] = await Promise.all([
      // Newest-first on every one of these: they feed a RULES engine, and an
      // unordered cap hands it an arbitrary slice — the rules then fire, or fail
      // to fire, on rows chosen at random. trainee_activity in particular grows
      // monotonically and will reach the cap.
      supabase.from('intake_submissions').select('id, name, email, trainee_id, form_type, reviewed_at, created_at').order('created_at', { ascending: false }).limit(500),
      supabase.from('trainee_evaluations').select('id, trainee_id, eval_date').order('eval_date', { ascending: false }).limit(500),
      supabase.from('trainee_activity').select('id, trainee_id, occurred_at, kind').order('occurred_at', { ascending: false }).limit(500),
      supabase.from('leads').select('id, email, source, context, notes, consumed_at, created_at').is('consumed_at', null).limit(200),
    ]);
    intakeSubmissions = i.data || [];
    evaluations = e.data || [];
    activityRows = a.data || [];
    leads = l.data || [];
  } catch {
    /* gracefully degrade — relevant rules just return [] */
  }

  // Read existing auto-tasks (one query, all kinds)
  // body IS selected (the diff below reads it) and open rows sort first so the
  // 2000-row window can never hide an open task once done-history piles up
  // (audit 08-22).
  const { data: existingRows, error: rdErr } = await supabase
    .from('coach_notes')
    .select('id, auto_kind, auto_ref, target_id, target_label, status, body')
    .not('auto_kind', 'is', null)
    .order('status', { ascending: false })
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

  const ctx = { trainees, plans, workouts, payments, intakeSubmissions, evaluations, activityRows, leads };

  // Phase A: compute desired open-task set
  const inserts = [];
  const bodyPatches = [];
  // In-batch dedupe: `byKey` only reflects rows already in the DB, so two
  // desired items with the SAME (kind, ref) this sync — e.g. a trainee with two
  // reviewed intakes both emitting (eval_due_first_session, id) — would both be
  // queued and collide on the unique index, and a multi-row INSERT aborts
  // ENTIRELY on one 23505. That silently dropped every new auto-task across all
  // rules. Guard so each key is queued at most once per sync.
  const queuedKeys = new Set();
  for (const rule of RULES) {
    let desired = [];
    try { desired = rule.detect(ctx) || []; }
    catch (e) { console.warn(`rule ${rule.kind} detect threw:`, e); }
    for (const d of desired) {
      const key = `${rule.kind}|${d.ref}`;
      if (byKey.has(key)) {
        // Row already exists — if the detected body differs (the copy
        // template changed since last sync, or one of the embedded
        // values shifted), patch the body so the card reflects the
        // current state. Skip if the row is done — closed tasks
        // shouldn't get retroactively rewritten.
        const existing = byKey.get(key);
        if (existing.status === 'open') {
          // Preserve coach decorations: compare/patch only the detector core,
          // re-attaching any '[URGENT]/[HIGH]' bracket and trailing '· due …'
          // suffix the coach added in the tasks view (audit 08-22).
          const m = String(existing.body || '').match(/^(\s*\[[A-Z]+\]\s*)?([\s\S]*?)(\s*·\s*due\s+\S[\s\S]*)?$/) || [];
          const pri = m[1] || ''; const core = (m[2] || '').trim(); const due = m[3] || '';
          if (core !== d.body) bodyPatches.push({ id: existing.id, body: `${pri}${d.body}${due}` });
        }
        continue;
      }
      if (queuedKeys.has(key)) continue; // already queued this sync — see note above
      queuedKeys.add(key);
      inserts.push({
        id: newAutoId(),
        body: d.body,
        target_kind: d.target_kind || (d.target_id ? 'trainee' : 'general'),
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
    // Non-terminal statuses (working/waiting/stuck) still auto-close when the
    // condition clears — an In-Progress 'chase payment' must die when the
    // athlete pays (audit 08-22).
    const openOfKind = (existingRows || [])
      .filter(r => r.auto_kind === rule.kind && ['open', 'working', 'waiting', 'stuck'].includes(r.status));
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

  // Execute — insert PER ROW, not as one batch. A multi-row INSERT is atomic, so
  // a single duplicate-key (23505 against the partial unique index
  // coach_notes_auto_unique_idx on auto_kind,auto_ref) rolls back the ENTIRE
  // batch — and because dup errors are swallowed below, that silently dropped
  // every fresh task whenever a second dashboard raced the same (auto_kind,
  // auto_ref) between our existing-rows read and this write. Per-row isolates the
  // collision: the duplicate is skipped, the rest land. (Partial index means a
  // plain onConflict upsert can't reliably infer the target, so per-row it is.)
  for (const row of inserts) {
    const { error } = await supabase.from('coach_notes').insert(row);
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
  // Body-patch pass — rewrite stale auto-task copy in place when the
  // detector renders a different body for an existing row. Single
  // upsert per row; PostgREST doesn't support bulk-update with
  // per-row values, so we issue one PATCH per id (small N in practice).
  for (const p of bodyPatches) {
    try {
      await supabase.from('coach_notes').update({ body: p.body }).eq('id', p.id);
    } catch (e) { /* swallow — non-critical */ }
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
  lead_callback_pending: 'NEW LEAD',
  plan_due_after_eval: 'PLAN DUE',
  whatsapp_combined: 'NEEDS OUTREACH',
};

// Solution-action per auto-task kind. The dashboard task cards render
// the matching button so every task points at its actual remedy:
//   NEW_PROGRAM   — open the plan editor pre-bound to the trainee
//   WHATSAPP      — wa.me deeplink with a pre-filled message
//   REVIEW        — open the workout review session for that workout id
//   OPEN_INTAKE   — route to /coach/intake (review the submission)
//   OPEN_ATHLETE  — route to the trainee card (run the eval there)
export const AUTO_KIND_ACTION = {
  next_block_due:            'NEW_PROGRAM',
  week_missed:               'WHATSAPP',
  at_risk_silent:            'WHATSAPP',
  form_video_pending_review: 'REVIEW',
  new_intake_pending:        'OPEN_INTAKE',
  payment_overdue:           'WHATSAPP',
  eval_due_first_session:    'OPEN_ATHLETE',
  lead_callback_pending:     'OPEN_WAITLIST',
  plan_due_after_eval:       'NEW_PROGRAM',
  whatsapp_combined:         'WHATSAPP',
};

// Task throttling — multiple auto-tasks for one trainee that all resolve
// to a WhatsApp outreach (week_missed + at_risk_silent + payment_overdue)
// would otherwise read as 3 separate cards. The coach opens ONE
// WhatsApp conversation and addresses all of them. Collapse the
// underlying rows into a synthetic card with the combined reasoning so
// the dashboard reads as "Diego needs outreach" not three rows.
//
// The synthetic card carries the raw rows in `__sources` so the mark-
// done path can fan out the close to every underlying row in one shot.
export function throttleWhatsAppTasks(rows) {
  const out = [];
  const seenByTrainee = new Map(); // target_id → index in out
  for (const r of rows || []) {
    const isWhatsApp = AUTO_KIND_ACTION[r.auto_kind] === 'WHATSAPP';
    if (!isWhatsApp || r.status === 'done' || !r.target_id) {
      out.push(r);
      continue;
    }
    const existingIdx = seenByTrainee.get(r.target_id);
    if (existingIdx === undefined) {
      // First WhatsApp task for this trainee — push as the seed.
      out.push({ ...r, __sources: [r] });
      seenByTrainee.set(r.target_id, out.length - 1);
    } else {
      // Merge into the synthetic card.
      const seed = out[existingIdx];
      seed.__sources.push(r);
      // Body becomes a combined summary. Preserve newest timestamp +
      // strongest pin so the merged card floats correctly.
      const sources = seed.__sources;
      seed.body = `Reach out to ${bidi(seed.target_label || 'trainee')} · ${sources.length} reasons:\n` +
        sources.map(s => `• ${AUTO_KIND_LABEL[s.auto_kind] || s.auto_kind}`).join('\n');
      seed.pinned = seed.pinned || r.pinned;
      seed.auto_kind = 'whatsapp_combined';
      // Keep the most-recent created_at so the sort places the merged
      // card at the freshest row's spot.
      if (new Date(r.created_at) > new Date(seed.created_at)) {
        seed.created_at = r.created_at;
      }
    }
  }
  return out;
}

// Hebrew WhatsApp templates per kind. The trainee's first name is
// extracted from `name` for a personal tone. Days-since values pulled
// out of the task body when present so the message doesn't say "X days"
// when the system actually knows the number.
export function whatsappMessageForTask(note, trainee) {
  const first = (trainee?.name || '').split(/\s+/)[0] || trainee?.name || '';
  const body = String(note?.body || '');
  switch (note?.auto_kind) {
    case 'week_missed': {
      const m = body.match(/W(\d+)/);
      const wk = m ? `שבוע ${m[1]} ` : '';
      return `היי ${first}. ראיתי שדילגנו על ${wk}בבלוק הנוכחי. הכל בסדר? בוא נתאם משהו לפני שזה מצטבר.`;
    }
    case 'at_risk_silent': {
      const m = body.match(/(\d+)d no workout/);
      const ago = m ? `${m[1]} ימים מאז האימון האחרון. ` : '';
      return `היי ${first}. ${ago}הכל בסדר אצלך? בוא נתאם אימון או שיחה השבוע.`;
    }
    case 'payment_overdue': {
      const never = /never paid/i.test(body);
      if (never) return `היי ${first}. רק תזכורת — עוד לא נסגר תשלום מאז ההרשמה. תוכל לסגור את זה השבוע?`;
      const m = body.match(/(\d+)d ago/);
      const ago = m ? `${m[1]} ימים מאז התשלום האחרון. ` : '';
      return `היי ${first}. ${ago}תוכל לסגור את התשלום הנוכחי השבוע?`;
    }
    case 'whatsapp_combined': {
      // The throttled card stacks several reasons. Open ONE conversation
      // that pulls them together — the coach can edit the prefilled
      // text before sending if any reason needs softening.
      const sources = Array.isArray(note?.__sources) ? note.__sources : [];
      const parts = sources.map(s => whatsappMessageForTask(s, trainee)).filter(Boolean);
      if (parts.length === 0) return `היי ${first}. רוצה לתאם איתך משהו השבוע.`;
      if (parts.length === 1) return parts[0];
      return `היי ${first}. צריך לתאם איתך כמה דברים:\n\n` + parts.map((p, i) => `${i + 1}. ${p.replace(/^היי \S+\.\s*/, '')}`).join('\n\n');
    }
    default:
      return `היי ${first}. מה קורה?`;
  }
}

// F-26 — Explainability: for any auto_kind, return the WHY behind the
// task (what rule fired + what inputs the rule looked at + when it
// will auto-close). The ⓘ modal in NotesWidget/NotesInline renders
// this. It's intentionally human-readable, not machine-readable —
// the coach should understand the system's reasoning at a glance.
export function explainAutoTask(note, trainee) {
  const body = String(note?.body || '');
  const kind = note?.auto_kind;
  const traineeName = trainee?.name || note?.target_label || 'this trainee';

  const base = {
    title: AUTO_KIND_LABEL[kind] || (kind || '').toUpperCase(),
    rule: '',
    inputs: [],
    closes: '',
    confidence: 'high',
  };

  switch (kind) {
    case 'next_block_due': {
      return {
        ...base,
        rule: 'Current block is near completion. A new block should ship before the runway runs out.',
        inputs: ['Active block is near complete (most weeks logged)'],
        closes: 'Auto-closes when a newer plan is published for this trainee.',
      };
    }
    case 'week_missed': {
      const m = body.match(/W(\d+)/);
      return {
        ...base,
        rule: 'A week looks skipped inside the current block — the gap since the last logged session exceeded the expected training cadence.',
        inputs: m ? [`Missed week: W${m[1]}`, 'Gap exceeded the expected session cadence'] : ['Week skipped'],
        closes: 'Auto-closes when the missed week gets a logged session.',
        confidence: 'medium',
      };
    }
    case 'at_risk_silent': {
      const m = body.match(/(\d+)d no workout/);
      const days = m ? m[1] : '14+';
      return {
        ...base,
        rule: 'No workouts logged for ≥14 days. Higher-risk silent client.',
        inputs: [`Days since last logged workout: ${days}`, 'Days since last review activity: ≥14', 'Trainee status: Active'],
        closes: 'Auto-closes once a workout is logged or a review session is recorded.',
        confidence: 'high',
      };
    }
    case 'form_video_pending_review': {
      return {
        ...base,
        rule: 'A logged set carries a form video that you have not opened in WorkoutReview.',
        inputs: ['form video URL present', 'workout.reviewedAt = null'],
        closes: 'Auto-closes when you open the workout in WorkoutReview (reviewedAt timestamp is set), or when every set with a video has a coach comment.',
      };
    }
    case 'new_intake_pending': {
      return {
        ...base,
        rule: 'A new intake submission landed and has not been reviewed yet.',
        inputs: ['intake_submissions row exists', 'reviewed_at = null'],
        closes: 'Auto-closes when reviewed_at is set on the intake row.',
      };
    }
    case 'payment_overdue': {
      const never = /never paid/i.test(body);
      const m = body.match(/(\d+)d ago/);
      return {
        ...base,
        rule: never
          ? 'Trainee was created but no payment row exists for them yet.'
          : 'Most recent payment is older than the trainee\'s monthly cadence + 7-day grace.',
        inputs: never ? ['No payment rows', 'Trainee.status = Active'] : [`Last payment: ${m ? m[1] : '?'} days ago`, 'Cadence threshold: monthly + 7d grace'],
        closes: 'Auto-closes when a fresh payment row lands for this trainee.',
        confidence: 'medium',
      };
    }
    case 'eval_due_first_session': {
      return {
        ...base,
        rule: 'Trainee has logged ≥1 session but has no Athletic Evaluation on file.',
        inputs: ['client_workouts count ≥1', 'evaluation row missing'],
        closes: 'Auto-closes when the Athletic Evaluation is filled out from the trainee card.',
      };
    }
    case 'lead_callback_pending': {
      const m = body.match(/(\d+)d since signup/);
      return {
        ...base,
        rule: 'A lead landed via the landing page or chat and was not consumed (no reply / conversion) within the callback window.',
        inputs: [
          m ? `Lead age: ${m[1]} days` : 'Lead age: 1–30 days',
          'consumed_at IS NULL',
        ],
        closes: 'Auto-closes when consumed_at gets set on the lead (Ohad marks it from /coach/waitlist).',
      };
    }
    case 'plan_due_after_eval': {
      return {
        ...base,
        rule: 'Athletic Evaluation is on file but no training plan exists yet — the eval-to-plan handoff is the moment the first block ships.',
        inputs: ['trainee_evaluations count ≥1', 'plans for this trainee = 0'],
        closes: 'Auto-closes once a plan is created for this trainee.',
      };
    }
    case 'whatsapp_combined': {
      const n = Array.isArray(note?.__sources) ? note.__sources.length : 1;
      const reasons = (note?.__sources || []).map(s => `• ${AUTO_KIND_LABEL[s.auto_kind] || s.auto_kind}`);
      return {
        ...base,
        title: 'NEEDS OUTREACH',
        rule: `${n} separate outreach-resolved tasks for ${traineeName} were merged into one card so you only open ONE WhatsApp thread.`,
        inputs: reasons.length ? reasons : ['multiple WhatsApp-action auto-tasks for this trainee'],
        closes: 'Marking this card done closes all underlying tasks at once.',
        confidence: 'high',
      };
    }
    default:
      return {
        ...base,
        rule: 'Manual task — no automated reasoning.',
        inputs: [],
        closes: 'Auto-tasks close themselves when their input condition flips. Manual tasks close when you check them off.',
        confidence: 'n/a',
      };
  }
}
