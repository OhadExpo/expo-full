// autoTaskCards.js — how auto-tasks are LABELLED, what action each one points
// at, and how several outreach reasons for one athlete collapse into a single
// dashboard card.
//
// Split out of autoTasks.js so it can be unit-tested: autoTasks.js imports the
// browser supabase client at module scope, which node cannot resolve, so none
// of this could be asserted while it lived there. Nothing here touches the
// network — it is pure presentation logic over rows that already exist.

// Wrap a value in Unicode isolate marks. A Hebrew name embedded in an English
// task body otherwise pulls neighbouring numbers and punctuation into its RTL
// run and scrambles the line on the dashboard.
const bidi = (v) => `\u2068${v == null ? '' : String(v)}\u2069`;

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
// TAKES RAW ROWS. It is deliberately NOT idempotent: a combined card maps back to
// a WHATSAPP action, so feeding this its own output would wrap the card in a new
// seed and lose the __sources the mark-done fan-out closes. The single call site
// (NotesWidget) passes freshly filtered store rows, which is the contract.
export function throttleWhatsAppTasks(rows) {
  const out = [];
  const seenByTrainee = new Map(); // target_id → index in out
  for (const r of rows || []) {
    const isWhatsApp = AUTO_KIND_ACTION[r.auto_kind] === 'WHATSAPP';
    // 'cancelled' is terminal like 'done' — a cancelled reason must never be
    // folded into a live outreach card. The call site filters both out already;
    // this makes the function safe on its own terms.
    const terminal = r.status === 'done' || r.status === 'cancelled';
    if (!isWhatsApp || terminal || !r.target_id) {
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
