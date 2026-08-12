// Dashboard widget — global Tasks/Notes feed (pinned first, then recent).
// Click a note → routes back to its context via the onNavigate callback.
//
// Filter pills along the top scope the feed by target_kind (ALL / TRAINEE
// / INTAKE / REVIEW / GENERAL) so the coach can quickly drill into where
// a note came from.
//
// Same data source as NotesInline (useCoachNotes); the dashboard widget
// is unscoped, pulling across all target_kind/target_id combos.

import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { fmtPrettyDate } from './dates';
import { C, FN, FB, FH } from './theme';
import { isRefined5b, RefinedHeaderStrip, confirmToast, usePersistentState, useIsMobile } from './ui';
import { useCoachNotes, setPendingTaskPlanLink } from './coachNotes';
import useDraftAutosave from './hooks/useDraftAutosave';
import { AUTO_KIND_LABEL, AUTO_KIND_ACTION, whatsappMessageForTask, throttleWhatsAppTasks } from './autoTasks';
import { AutoTaskExplainModal } from './components/AutoTaskExplain';
import { normalizePhoneIL } from './whatsappButton';
import { displayBodyOf, ownerFromBody, priorityFromBody, visibleTags, PRIORITY_TONE } from './taskFormat';
import { CommentsThread, EventTimeline } from './TasksV8View';

const isHebrew = (s) => /[֐-׿]/.test(s || '');

// No emojis in UI labels (Ohad) — icons intentionally blank; the text label
// carries the meaning. Kept as a map so any render referencing it stays valid.
const TARGET_ICON = {
  trainee: '',
  intake: '',
  review: '',
  general: '',
};

const TARGET_LABEL = {
  trainee: 'ATHLETE',   // Ohad: we say "athlete", never "trainee"
  intake: 'INTAKE',
  review: 'REVIEW',
  general: 'GENERAL',
};

const FILTER_OPTIONS = [
  { id: 'all',      label: 'ALL' },
  { id: 'trainee',  label: 'ATHLETE' },
  { id: 'intake',   label: 'INTAKE' },
  { id: 'review',   label: 'REVIEW' },
  { id: 'general',  label: 'GENERAL' },
];

// Severity color per auto-kind — drives the pill border/left-stripe
// so the dashboard reads at a glance: red for safety/payment issues,
// orange for missed-week/at-risk, cyan for plan/intake/eval, green
// for everything else (manual).
const AUTO_KIND_TONE = {
  next_block_due:            'cyan',
  week_missed:               'orange',
  at_risk_silent:            'orange',
  form_video_pending_review: 'cyan',
  new_intake_pending:        'cyan',
  payment_overdue:           'red',
  eval_due_first_session:    'cyan',
  whatsapp_combined:         'purple',   // NEEDS OUTREACH — distinct from the cyan SHARED badge (Ohad)
};

const TONE_COLOR = {
  cyan:   'var(--c-ac)',
  orange: 'var(--c-or)',
  red:    'var(--c-rd)',
  green:  'var(--c-gn)',
  purple: 'var(--c-pu)',
};

// ── Coaching-alert grouping ────────────────────────────────────────────
// The 10 auto_kinds (autoTasks.js AUTO_KIND_LABEL) cluster into the coach's
// mental buckets so the dashboard can separate "the system's nags" from
// Ohad's own tasks. Calls = every outreach-resolved kind (incl. the
// throttled whatsapp_combined), Reviews = form-video review, Builds = ship
// a program, Intake = onboarding/eval gates. A task is AUTO iff it carries
// an auto_kind; manual tasks (logged by Ohad/Yuval) have none.
const ALERT_GROUPS = [
  { id: 'calls',   icon: '', label: 'CALLS',   kinds: ['week_missed', 'at_risk_silent', 'payment_overdue', 'lead_callback_pending', 'whatsapp_combined'] },
  { id: 'reviews', icon: '', label: 'REVIEWS', kinds: ['form_video_pending_review'] },
  { id: 'builds',  icon: '', label: 'BUILDS',  kinds: ['next_block_due', 'plan_due_after_eval'] },
  { id: 'intake',  icon: '', label: 'INTAKE',  kinds: ['new_intake_pending', 'eval_due_first_session'] },
];
const KIND_TO_GROUP = {};
ALERT_GROUPS.forEach(g => g.kinds.forEach(k => { KIND_TO_GROUP[k] = g.id; }));
const groupOfKind = (k) => KIND_TO_GROUP[k] || 'calls';

// Bucket a list of auto rows into { calls:[], reviews:[], builds:[], intake:[] }.
const groupAlerts = (autoRows) => {
  const map = {};
  ALERT_GROUPS.forEach(g => { map[g.id] = []; });
  for (const r of autoRows) (map[groupOfKind(r.auto_kind)] || map.calls).push(r);
  return map;
};

// Single condensed task row for the compact dashboard board + the alerts
// section — SAME markup the mini-kanban already used, factored out so
// every variant (board cell, grouped alert, collapsed-summary expansion)
// renders identical rows. Click routes through the shared handleClick →
// task popup. Manual rows get the neutral card-border stripe; auto rows
// get their kind tone.
function MiniTaskRow({ n, stackBoard, onClick, stripe }) {
  const body = displayBodyOf(n.body);
  const heb = isHebrew(body);
  // In the status kanban, `stripe` = the column's status colour so each card
  // reads as belonging to its column; grouped-alert rows fall back to the kind
  // tone / neutral border.
  const tone = stripe || TONE_COLOR[AUTO_KIND_TONE[n.auto_kind]] || 'var(--c-cardBd)';
  return (
    <div onClick={onClick} title={body} className="mini-task-row"
      style={{ border: `1px solid var(--c-cardBd)`, borderLeft: `3px solid ${tone}`, padding: '6px 8px', fontFamily: heb ? FH : FB, fontSize: stackBoard ? 12 : 11, lineHeight: 1.3, color: 'var(--c-tx)', cursor: 'pointer', direction: heb ? 'rtl' : 'ltr', textAlign: heb ? 'right' : 'left', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', transition: 'border-color 120ms ease, background 120ms ease' }}>
      {body}
    </div>
  );
}

// Grouped coaching-alerts list — used by Variant 1 (each group collapsible)
// and Variant 3 (flat, revealed by the single summary toggle). Empty groups
// are dropped so the section only shows buckets that actually have alerts.
function AlertGroupList({ grouped, collapsible, collapsedMap, onToggle, onRowClick, stackBoard }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {ALERT_GROUPS.map(g => {
        const rows = grouped[g.id] || [];
        if (rows.length === 0) return null;
        const collapsed = collapsible && !!collapsedMap[g.id];
        return (
          <div key={g.id} style={{ border: `1px solid var(--c-cardBd)` }}>
            <div onClick={collapsible ? () => onToggle(g.id) : undefined}
              role={collapsible ? 'button' : undefined} tabIndex={collapsible ? 0 : undefined}
              onKeyDown={collapsible ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(g.id); } } : undefined}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, padding: '5px 8px', background: 'var(--c-sf)', cursor: collapsible ? 'pointer' : 'default', userSelect: 'none', borderBottom: collapsed ? 'none' : `1px solid var(--c-cardBd)` }}>
              <span style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--c-tm)' }}>{g.icon} {g.label}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, color: 'var(--c-td)' }}>{rows.length}</span>
                {collapsible && <span aria-hidden style={{ fontSize: 10, color: 'var(--c-td)', transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 160ms ease' }}>▾</span>}
              </span>
            </div>
            {!collapsed && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 4 }}>
                {rows.map(n => <MiniTaskRow key={n.id} n={n} stackBoard={stackBoard} onClick={() => onRowClick(n)} />)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Single task card. Header row carries the auto-kind pill + target +
// timestamp (right-aligned). Body is the task description. Footer row
// carries the contextual action button (NEW PROGRAM / WHATSAPP / etc.)
// plus the ✓ done / 📌 pin / ✏️ edit / × delete controls. Three-row
// rhythm is identical across compact (dashboard) and full views so
// nothing visually drifts between surfaces.
function TaskCard({ note, heb, trainee, allowEdit, isEditing, editBody, onEditBody, onSaveEdit, onCancelEdit, onStartEdit, onToggleDone, onTogglePin, onRemove, actionButton }) {
  const n = note;
  // Every card now renders a colored meta-strip badge — auto-tasks
  // get their kind-specific tone (cyan/orange/red); manual tasks
  // (Ohad's coach-created TODOs) get green, matching the original
  // design comment ("green for everything else (manual)"). Before
  // this, manual cards had a gray fallback stripe AND no badge, so
  // the second row was visually empty and the card read shorter
  // than its auto-task neighbors — Ohad's "not OCD" callout.
  const isAuto = !!n.auto_kind;
  const tone = isAuto ? (AUTO_KIND_TONE[n.auto_kind] || 'cyan') : 'green';
  const stripeColor = TONE_COLOR[tone];
  const kindLabel = isAuto ? (AUTO_KIND_LABEL[n.auto_kind] || 'AUTO') : 'TASK';
  const kindIcon = isAuto ? '⚙' : '✎';
  const targetIcon = TARGET_ICON[n.target_kind] || '·';
  const targetLabel = TARGET_LABEL[n.target_kind] || 'NOTE';
  // The body encodes owner + priority + due inline ("Ohad: [HIGH] title · due …")
  // and ships machine tags (gevent:/glink:/getag:/approved:) — render the clean
  // human title + a priority chip instead of dumping the raw wire format, and
  // drop the calendar-sync tag soup from the chip row.
  const cleanBody = displayBodyOf(n.body);
  const owner = ownerFromBody(n.body);
  const priority = priorityFromBody(n.body);
  const userTags = visibleTags(n.tags);
  const [showExplain, setShowExplain] = useState(false);
  return (
    <div style={{
      background: 'var(--c-sf)',
      border: `1px solid var(--c-cardBd)`,
      borderLeft: `3px solid ${stripeColor}`,
      borderRadius: 0,
      // Compact-pass per Ohad — every inner spacing trimmed so
      // multiple cards fit in a viewport without losing legibility.
      padding: '7px 10px',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header row — auto-kind pill + target + timestamp, then × on
          the far right so the destructive control sits where you'd
          expect to dismiss a card. */}
      {/* Row 1 — trainee NAME first + big. The screenshot test made it
          obvious that scanning a long task list, "WHO IS THIS ABOUT"
          is the first question, not "what kind of task". Name leads,
          everything else is meta. Falls back to a target-kind chip when
          no trainee is linked (general / intake / review tasks). */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5, flexWrap: 'wrap' }}>
        <input type="checkbox" checked={false} onChange={onToggleDone}
          title="Mark done"
          style={{ width: 14, height: 14, accentColor: 'var(--c-gn)', cursor: 'pointer', flexShrink: 0 }} />
        <button onClick={onTogglePin} title={n.pinned ? 'Unpin' : 'Pin'}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: n.pinned ? 'var(--c-or)' : 'var(--c-td)', fontSize: 11,
            padding: 0, flexShrink: 0, lineHeight: 1,
            width: 26, minWidth: 26, textAlign: 'center',
          }}>{n.pinned ? '📌' : '○'}</button>
        {n.target_label ? (() => {
          // Hebrew renders ~3px smaller than Nord at the same fontSize — Heebo's
          // x-height + missing ascenders/descenders make 13px Hebrew look
          // visibly smaller than 13px Nord. Per feedback_new_ui_box_dimensions
          // rule: "Hebrew bumps +3px INSIDE the box, never resizes the box".
          const heb = isHebrew(n.target_label);
          return (
            <span style={{
              fontFamily: heb ? FH : FN, fontSize: heb ? 16 : 13, color: 'var(--c-ac)',
              letterSpacing: heb ? 0 : '0.02em', fontWeight: 800,
              textTransform: heb ? 'none' : 'uppercase',
              flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              lineHeight: 1.1,
            }} title={n.target_label}>
              {n.target_label}
            </span>
          );
        })() : (
          <span style={{
            fontFamily: FN, fontSize: 12, color: 'var(--c-tx)',
            letterSpacing: '0.04em', fontWeight: 700, flex: 1, minWidth: 0,
            lineHeight: 1.1,
          }}>
            {targetIcon} {targetLabel}
          </span>
        )}
        <button onClick={onRemove} title="Remove"
          style={{
            background: 'none', border: 'none', color: 'var(--c-td)', cursor: 'pointer',
            fontSize: 13, padding: '0 4px', flexShrink: 0, lineHeight: 1,
          }}>×</button>
      </div>

      {/* Row 2 — meta strip: kind badge + ⓘ (auto-only) + timestamp.
          Same vertical rhythm on every card — auto and manual alike —
          so the dashboard reads as a uniform stack rather than a row
          of variable-height fragments. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4, flexWrap: 'wrap' }}>
        <span title={isAuto ? `Auto-generated: ${kindLabel}` : 'Manual task'}
          style={{
            fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
            color: stripeColor, border: `1px solid ${stripeColor}`,
            padding: '1px 6px', lineHeight: 1.3,
          }}>{kindIcon} {kindLabel}</span>
        {priority !== 'normal' && (
          <span title={`Priority: ${priority}`} style={{
            fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
            color: PRIORITY_TONE[priority] || 'var(--c-tm)', border: `1px solid ${PRIORITY_TONE[priority] || 'var(--c-cardBd)'}`,
            padding: '1px 6px', lineHeight: 1.3, textTransform: 'uppercase',
          }}>{priority}</span>
        )}
        {owner === 'shared' && (
          <span title="Shared task — needs both Ohad & Yuval" style={{
            fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
            color: 'var(--c-ac)', border: '1px solid var(--c-ac)', padding: '1px 6px', lineHeight: 1.3,
          }}>SHARED</span>
        )}
        {isAuto && (
          <button onClick={() => setShowExplain(true)} title="Why is this task here?"
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: stripeColor, fontSize: 12, padding: '0 2px',
              lineHeight: 1, flexShrink: 0, fontWeight: 700,
            }}>ⓘ</button>
        )}
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: FN, fontSize: 9, color: 'var(--c-td)', letterSpacing: '0.04em' }}>
          {fmtPrettyDate(n.created_at)}
        </span>
      </div>

      {/* Body — task description. Edit mode shows the textarea. */}
      {isEditing ? (
        <textarea value={editBody} onChange={e => onEditBody(e.target.value)} dir="auto"
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) onSaveEdit();
            if (e.key === 'Escape') onCancelEdit();
          }}
          onBlur={onSaveEdit} autoFocus rows={Math.max(2, editBody.split('\n').length)}
          style={{
            width: '100%', background: 'var(--c-sf)', border: `1px solid var(--c-ac)`,
            borderRadius: 0, padding: '6px 8px', color: 'var(--c-tx)', fontSize: 13,
            outline: 'none', boxSizing: 'border-box', resize: 'vertical', marginBottom: 8,
            direction: isHebrew(editBody) ? 'rtl' : 'ltr',
            fontFamily: isHebrew(editBody) ? FH : FB,
          }} />
      ) : (
        // dir="auto" — let the browser's bidi algorithm flow mixed
        // HE/EN sentences (auto-task bodies often embed Hebrew names
        // in English prose). Computed `direction` flipped the entire
        // line when one Hebrew char appeared.
        <div dir="auto" style={{
          fontSize: 12, color: 'var(--c-tx)', lineHeight: 1.4, whiteSpace: 'pre-wrap',
          marginBottom: actionButton || allowEdit ? 6 : 0,
          fontFamily: FB,
        }}>{cleanBody}</div>
      )}

      {/* F-35 — tag chips. Read-only on the card; the composer is
          where they get added/edited. Click-through could be added if
          we expose a per-card "search by this tag" hook later. */}
      {userTags.length > 0 && !isEditing && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: actionButton || allowEdit ? 8 : 0 }}>
          {userTags.map(t => (
            <span key={t} style={{
              fontFamily: FN, fontSize: 9, color: 'var(--c-tm)', letterSpacing: '0.08em', fontWeight: 700,
              border: `1px solid var(--c-cardBd)`, padding: '1px 7px',
            }}>#{t}</span>
          ))}
        </div>
      )}

      {/* Footer — EDIT on bottom-left, contextual action on
          bottom-right. space-between fully separates them so the
          two controls never visually collide. marginTop:'auto'
          pushes the footer to the card's bottom regardless of how
          much body text precedes it — so action buttons sit at the
          same Y across cards in the same grid row. */}
      {(actionButton || (allowEdit && !isEditing)) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 'auto', paddingTop: 6 }}>
          {allowEdit && !isEditing ? (
            <button onClick={onStartEdit} title="Edit task"
              style={{
                background: 'transparent', border: `1px solid var(--c-cardBd)`, color: 'var(--c-tm)',
                cursor: 'pointer', fontSize: 10, padding: '2px 8px', borderRadius: 0,
                fontFamily: FN, fontWeight: 700, letterSpacing: '0.1em', height: 22,
                display: 'inline-flex', alignItems: 'center',
              }}>EDIT</button>
          ) : <span />}
          {actionButton || <span />}
        </div>
      )}

      {showExplain && (
        <AutoTaskExplainModal note={n} trainee={trainee} accent={TONE_COLOR[tone] || 'var(--c-ac)'} onClose={() => setShowExplain(false)} />
      )}
    </div>
  );
}

// Pre-built solution pill — cyan border, narrow chip, label like
// "→ NEW PROGRAM" / "→ REVIEW" / "→ INTAKE" / "→ ATHLETE". Used by every
// non-WhatsApp task action so the row reads uniformly.
// Fixed width across every variant so → WHATSAPP, → NEW PROGRAM, → REVIEW,
// → INTAKE, → ATHLETE all render as one button shape and align column-wise
// in the Tasks pool. 124px comfortably fits "→ NEW PROGRAM" (the longest
// label) at fontSize 10 + 0.1em tracking, with a hair of side gutter.
function ActionPill({ label, onClick, color, title, disabled }) {
  const c = color || 'var(--c-ac)';
  return (
    <button onClick={disabled ? undefined : onClick} title={title} disabled={disabled}
      style={{
        background: 'transparent', border: `1px solid ${c}`, color: c,
        fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
        padding: '2px 9px', borderRadius: 0, cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        whiteSpace: 'nowrap', height: 22, width: 124,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}>{label}</button>
  );
}

// Per-task action button — switches on auto_kind. WhatsApp variant uses
// WA brand green to differentiate from the cyan-bordered NEW PROGRAM /
// REVIEW family. Returns null when the task has no actionable handler
// (manual general task, or trainee data missing for WhatsApp).
function TaskActionButton({ note, trainee, onCreatePlan, onOpenReview, onOpenIntake, onOpenAthlete, onOpenWaitlist }) {
  const kind = note?.auto_kind;
  const action = kind ? AUTO_KIND_ACTION[kind] : null;
  // Manual task with a trainee target — same NEW PROGRAM affordance.
  if (!kind && note?.target_kind === 'trainee' && note?.target_id && onCreatePlan) {
    return <ActionPill label="→ NEW PROGRAM" title="Build a program from this task" onClick={() => onCreatePlan(note)} />;
  }
  switch (action) {
    case 'NEW_PROGRAM':
      if (!onCreatePlan) return null;
      return <ActionPill label="→ NEW PROGRAM" title="Open the plan editor pre-bound to this trainee" onClick={() => onCreatePlan(note)} />;
    case 'REVIEW': {
      if (!onOpenReview) return null;
      const woId = String(note.auto_ref || '').split('|')[0];
      if (!woId) return null;
      return <ActionPill label="→ REVIEW" title="Open this workout's review session" onClick={() => onOpenReview(woId)} />;
    }
    case 'WHATSAPP': {
      const phone = normalizePhoneIL(trainee?.phone);
      if (!phone) return <ActionPill color="var(--c-td)" label="→ WHATSAPP" title="No phone on file" disabled />;
      const msg = whatsappMessageForTask(note, trainee);
      return <ActionPill color="#128C7E"
        label="→ WHATSAPP"
        title={`Open WhatsApp to ${trainee?.name || 'trainee'}`}
        onClick={() => {
          try { window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener'); } catch {}
        }} />;
    }
    case 'OPEN_INTAKE':
      if (!onOpenIntake) return null;
      return <ActionPill label="→ INTAKE" title="Open the intake review surface" onClick={onOpenIntake} />;
    case 'OPEN_ATHLETE':
      if (!onOpenAthlete || !note.target_id) return null;
      return <ActionPill label="→ ATHLETE" title="Open the trainee card" onClick={() => onOpenAthlete(note.target_id)} />;
    case 'OPEN_WAITLIST':
      if (!onOpenWaitlist) return null;
      return <ActionPill label="→ WAITLIST" title="Open the /coach/waitlist surface to consume this lead" onClick={onOpenWaitlist} />;
    default:
      return null;
  }
}

export default function NotesWidget({ onNavigate, onOpenFullTasks, onCreatePlanForTask, onOpenIntakeTab, onOpenWaitlist, compact = false, trainees = [], viewerOwner = 'ohad' }) {
  const { rows, create, update, togglePin, toggleDone, remove } = useCoachNotes({ limit: 60 });
  // Phone-narrow: the compact dashboard mini-board (a 4-col status kanban) is
  // cramped side-by-side at ~140px/col and scrolls sideways with clipped text.
  // Below this width we stack the status columns vertically full-width instead
  // (same colored-header + card style, just readable). (Ohad, 2026-07-22)
  const stackBoard = useIsMobile(560);
  // Collapsible on the dashboard (compact). Full /coach/tasks view ignores it.
  const [open, setOpen] = usePersistentState('dash-tasks', true);
  // Compact-board scope toggle — MINE (my tasks in the status kanban) /
  // ALERTS (coaching auto-tasks grouped by kind) / ALL (kanban + grouped
  // alerts below). Coaching alerts have no meaningful In-Progress/Waiting/Stuck
  // status, so they never sit in the kanban — the ALERTS view groups them by
  // kind instead. Selection persists; default MINE.
  const [v2Sub, setV2Sub] = usePersistentState('dash-tasks-v2sub', 'mine');
  // Per-kind collapse for the grouped alerts list (ALERTS + ALL views).
  // Local-only (not persisted) — groups default open so nothing hides.
  const [alertCollapsed, setAlertCollapsed] = useState({});
  const toggleAlertGroup = (gid) => setAlertCollapsed(m => ({ ...m, [gid]: !m[gid] }));
  const [adding, setAdding] = useState(false);
  const [body, setBody] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [linkTraineeId, setLinkTraineeId] = useState('');
  const [filter, setFilter] = useState('all');
  const [editingId, setEditingId] = useState(null);
  const [editBody, setEditBody] = useState('');
  // F-35 — search box across body + tags. Empty string = no filter.
  const [search, setSearch] = useState('');

  // Parse #tag1 #tag2 OR comma-separated lists. Returns normalized
  // lowercase strings, deduped.
  const parseTags = (s) => {
    if (!s) return [];
    const out = [];
    const seen = new Set();
    String(s).split(/[\s,#]+/).forEach(raw => {
      const t = raw.trim().toLowerCase();
      if (!t || seen.has(t)) return;
      seen.add(t);
      out.push(t);
    });
    return out;
  };

  const startEdit = (n) => { setEditingId(n.id); setEditBody(n.body); };
  const cancelEdit = () => { setEditingId(null); setEditBody(''); };
  const saveEdit = async () => {
    const trimmed = editBody.trim();
    if (trimmed && editingId) {
      await update(editingId, { body: trimmed });
    }
    cancelEdit();
  };

  const onAdd = async () => {
    const b = body.trim();
    if (!b) return;
    // Suppress the imminent blur-fired flush — the explicit SAVE/Enter
    // already creates the row. Both firing produces a duplicate.
    draft.suppressNext();
    const tags = parseTags(tagsInput);
    setBody(''); setTagsInput(''); setLinkTraineeId(''); setAdding(false);
    if (linkTraineeId) {
      const t = trainees.find(x => x.id === linkTraineeId);
      await create({
        body: b,
        targetKind: 'trainee',
        targetId: linkTraineeId,
        targetLabel: t?.name || null,
        tags,
      });
    } else {
      await create({ body: b, targetKind: 'general', tags });
    }
  };

  // Draft autosave on the "+ TASK" textbox — typing then clicking away,
  // switching tabs, or unmounting commits the draft as a task instead of
  // losing it.
  const draft = useDraftAutosave(body, setBody, async (draftBody) => {
    if (linkTraineeId) {
      const t = trainees.find(x => x.id === linkTraineeId);
      const r = await create({ body: draftBody, targetKind: 'trainee', targetId: linkTraineeId, targetLabel: t?.name || null });
      if (r) setLinkTraineeId('');
      return !!r;
    }
    const r = await create({ body: draftBody, targetKind: 'general' });
    return !!r;
  });

  // Dashboard policy: each viewer's widget shows only THEIR queue. A task
  // owned solely by the other party (body prefix "Yuval: …" on Ohad's
  // dashboard, or "Ohad: …" on Yuval's) is hidden; shared tasks
  // ("Ohad + Yuval: …") show on both. Unprefixed legacy rows are Ohad's.
  // Same parser as TasksV8View.ownerFromBody so the surfaces never disagree.
  const ownerOf = (body) => {
    const b = (body || '').trim();
    if (/^(ohad\s*\+\s*yuval|yuval\s*\+\s*ohad)\s*:/i.test(b)) return 'shared';
    if (/^yuval\s*:/i.test(b)) return 'yuval';
    return 'ohad';
  };
  const belongsToViewer = (body) => {
    const o = ownerOf(body);
    return o === 'shared' || o === viewerOwner;
  };

  const filtered = useMemo(() => {
    let base = rows.filter(r => belongsToViewer(r.body));
    if (filter !== 'all') {
      base = filter === 'general'
        ? base.filter(r => !r.target_kind || r.target_kind === 'general')
        : base.filter(r => r.target_kind === filter);
    }
    // F-35 — knowledge-base search. A leading '#' is a tag-only query;
    // bare text matches body OR tag.
    const q = search.trim().toLowerCase();
    if (!q) return base;
    const tagQuery = q.startsWith('#') ? q.slice(1) : null;
    return base.filter(r => {
      const tags = Array.isArray(r.tags) ? r.tags : [];
      if (tagQuery) return tags.some(t => t === tagQuery || t.includes(tagQuery));
      const inBody = (r.body || '').toLowerCase().includes(q);
      const inTags = tags.some(t => t.includes(q));
      const inTarget = (r.target_label || '').toLowerCase().includes(q);
      return inBody || inTags || inTarget;
    });
  }, [rows, filter, search, viewerOwner]);

  // All known tags — for autocomplete + tag-cloud chips above the list.
  const allTags = useMemo(() => {
    const set = new Set();
    rows.forEach(r => (r.tags || []).forEach(t => set.add(t)));
    return Array.from(set).sort();
  }, [rows]);

  // Pill counts reflect OPEN tasks only — "TASKS (3)" matching the visible
  // unchecked list reads correctly. The earlier counter included done
  // rows, inflating the badge against what the eye sees.
  const counts = useMemo(() => {
    const open = rows.filter(r => r.status !== 'done' && r.status !== 'cancelled' && belongsToViewer(r.body));
    const c = { all: open.length, trainee: 0, intake: 0, review: 0, general: 0 };
    for (const r of open) {
      if (!r.target_kind || r.target_kind === 'general') c.general++;
      else if (c[r.target_kind] != null) c[r.target_kind]++;
    }
    return c;
  }, [rows, viewerOwner]); // viewerOwner read via belongsToViewer — must be a dep

  // Open tasks float to the top; done tasks pool at the bottom under a
  // collapsed "DONE" group. Pinned-open before unpinned-open.
  //
  // F-39 throttling: multiple WhatsApp-action auto-tasks for the same
  // trainee collapse into ONE synthetic "needs outreach" card. The card
  // carries the underlying rows in `__sources`, so mark-done fans out
  // and closes every contributing row.
  // 'cancelled' is terminal like 'done' — it belongs in history, not the
  // active list. (Cancelling used to hard-delete; now it archives here.)
  const isTerminal = (r) => r.status === 'done' || r.status === 'cancelled';
  const openRowsRaw = filtered.filter(r => !isTerminal(r));
  const openRows = throttleWhatsAppTasks(openRowsRaw);
  const doneRows = filtered.filter(isTerminal);
  const pinned = openRows.filter(r => r.pinned);
  const recent = openRows.filter(r => !r.pinned).slice(0, compact ? 3 : 10);
  const visible = compact
    ? [...pinned, ...recent].slice(0, 5)
    : [...pinned, ...recent];
  const visibleDone = compact ? doneRows.slice(0, 2) : doneRows.slice(0, 20);

  // Mark-done that respects the merged card. If the row is a
  // synthetic "whatsapp_combined", close every underlying source.
  const toggleDoneSmart = async (note) => {
    const sources = note.__sources;
    if (sources && sources.length > 1) {
      for (const src of sources) {
        if (src.status !== 'done') await toggleDone(src.id);
      }
      return;
    }
    await toggleDone(note.id);
  };

  const startCreatePlan = (n) => {
    if (!onCreatePlanForTask || n.target_kind !== 'trainee' || !n.target_id) return;
    setPendingTaskPlanLink({
      taskId: n.id,
      traineeId: n.target_id,
      traineeLabel: n.target_label || '',
      taskBody: n.body,
    });
    onCreatePlanForTask(n.target_id);
  };

  // Dashboard mini-board: clicking a task opens its full card as a dismissible
  // POPUP right here (comments + activity), staying open until dismissed; the
  // ⤢ button jumps to the full Tasks page with the row focused (Ohad 2026-08-01,
  // superseding the 2026-07-05 straight-navigate behaviour).
  const [popupNote, setPopupNote] = useState(null);
  const openInTasks = (n) => {
    try { sessionStorage.setItem('expo-pendingFocusTask', n.id); } catch { /* noop */ }
    setPopupNote(null);
    if (onOpenFullTasks) onOpenFullTasks();
  };
  const handleClick = (n) => {
    if (compact) { setPopupNote(n); return; }
    if (!onNavigate) return;
    if (n.target_kind && n.target_id) onNavigate(n.target_kind, n.target_id);
  };

  const refined = isRefined5b();
  const PAD = 14;

  return (
    <div style={{
      background: 'var(--c-sf)',
      border: `1px solid var(--c-cardBd)`, borderRadius: 0, padding: PAD,
      boxShadow: C.cardShadow,
    }}>
      {popupNote && createPortal(
        <div onClick={() => setPopupNote(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,0.62)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ width: 'min(560px, 96vw)', maxHeight: '86vh', overflowY: 'auto', background: 'var(--c-sf)', border: `1px solid var(--c-ac)`, borderRadius: 0, boxShadow: '0 18px 60px rgba(0,0,0,0.6)', padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
              <div style={{ flex: 1, minWidth: 0, fontFamily: /[֐-׿]/.test(displayBodyOf(popupNote.body)) ? FH : FB, fontSize: 15, fontWeight: 700, color: 'var(--c-tx)', lineHeight: 1.4, direction: /[֐-׿]/.test(displayBodyOf(popupNote.body)) ? 'rtl' : 'ltr' }}>{displayBodyOf(popupNote.body)}</div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                {onOpenFullTasks && (
                  <button onClick={() => openInTasks(popupNote)} title="Open in the full Tasks page"
                    style={{ background: 'transparent', border: `1px solid var(--c-ac)`, color: 'var(--c-ac)', width: 28, height: 28, boxSizing: 'border-box', borderRadius: 0, cursor: 'pointer', fontSize: 14, lineHeight: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>⤢</button>
                )}
                <button onClick={() => setPopupNote(null)} title="Close"
                  style={{ background: 'transparent', border: `1px solid var(--c-cardBd)`, color: 'var(--c-tm)', width: 28, height: 28, boxSizing: 'border-box', borderRadius: 0, cursor: 'pointer', fontSize: 14, lineHeight: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
              </div>
            </div>
            <CommentsThread noteId={popupNote.id} viewer={viewerOwner} />
            <EventTimeline noteId={popupNote.id} />
          </div>
        </div>,
        document.body
      )}
      {compact ? (
        // Compact (Dashboard) — header lives in the cyan strip on top to
        // match the visual rhythm of every other dashboard card.
        <RefinedHeaderStrip padY={PAD} padX={PAD} marginBottom={open ? 10 : 0}>
          <div onClick={() => setOpen(o => !o)} role="button" tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(o => !o); } }}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}>
            <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: '0.04em', textTransform: 'uppercase', color: refined ? '#FFFFFF' : 'var(--c-tx)' }}>
              Tasks ({counts.all})
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={(e) => { e.stopPropagation(); setOpen(true); setAdding(a => !a); }}
                style={{
                  background: 'transparent',
                  border: `1px solid ${refined ? '#FFFFFF' : 'var(--c-ac)'}`,
                  color: refined ? '#FFFFFF' : 'var(--c-ac)',
                  padding: '3px 10px', borderRadius: 0, fontFamily: 'inherit', fontSize: 10,
                  fontWeight: 700, letterSpacing: '0.12em', cursor: 'pointer',
                  minWidth: 72, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}>{adding ? 'CLOSE' : '+ TASK'}</button>
              <span aria-hidden style={{ color: refined ? '#FFFFFF' : 'var(--c-tx)', fontSize: 12, lineHeight: 1, transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 180ms ease' }}>▾</span>
            </div>
          </div>
        </RefinedHeaderStrip>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
          <div style={{ fontSize: 10, fontFamily: FN, color: 'var(--c-ac)', letterSpacing: '0.18em', fontWeight: 700 }}>
            TASKS ({counts.all})
          </div>
          <button onClick={() => setAdding(!adding)}
            style={{
              background: 'transparent', border: `1px solid var(--c-ac)`, color: 'var(--c-ac)',
              padding: '3px 8px', borderRadius: 0, fontFamily: FN, fontSize: 9,
              fontWeight: 700, letterSpacing: '0.08em', cursor: 'pointer',
              minWidth: 58, textAlign: 'center', display: 'inline-flex', justifyContent: 'center',
            }}>{adding ? 'CLOSE' : '+ TASK'}</button>
        </div>
      )}

      {/* Collapse body on the dashboard (compact) when closed; full view always shows it. */}
      <div style={{ display: 'grid', gridTemplateRows: (!compact || open) ? '1fr' : '0fr', transition: 'grid-template-rows 260ms ease' }}>
      <div style={{ overflow: 'hidden', minHeight: 0 }}>
      {/* F-35 — knowledge-base search. Hidden in compact (dashboard
          widget) mode; the full /coach/tasks view exposes the box. A
          leading "#" scopes to tags; bare text searches body + tags +
          target_label. */}
      {!compact && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
          <input type="search" value={search} onChange={e => setSearch(e.target.value)}
            placeholder='Search notes / tags  (try "#rehab" or "shoulder")'
            style={{
              flex: 1, background: 'var(--c-sf)', border: `1px solid var(--c-cardBd)`,
              borderRadius: 0, padding: '6px 10px', color: 'var(--c-tx)', fontFamily: FN, fontSize: 11,
              outline: 'none', boxSizing: 'border-box', letterSpacing: '0.04em',
            }} />
          {search && (
            <button onClick={() => setSearch('')} title="Clear search"
              style={{
                padding: '6px 10px', background: 'transparent',
                border: `1px solid var(--c-cardBd)`, color: 'var(--c-tm)',
                fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
                cursor: 'pointer', borderRadius: 0,
              }}>CLEAR</button>
          )}
        </div>
      )}

      {/* Tag cloud — quick-click any known tag to filter. Hidden in
          compact mode, and hidden when there are no tags yet so the
          surface doesn't look empty/broken. */}
      {!compact && allTags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
          {allTags.slice(0, 16).map(t => {
            const active = search.trim().toLowerCase().replace(/^#/, '') === t;
            return (
              <button key={t} onClick={() => setSearch(active ? '' : `#${t}`)}
                style={{
                  padding: '2px 8px', borderRadius: 0,
                  border: `1px solid ${active ? 'var(--c-ac)' : 'var(--c-cardBd)'}`,
                  background: active ? 'rgba(57,189,255,0.094)' : 'transparent',
                  color: active ? 'var(--c-ac)' : 'var(--c-tm)',
                  fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
                  cursor: 'pointer',
                }}>#{t}</button>
            );
          })}
        </div>
      )}

      {/* Context filter pills — full view only; the compact Dashboard
          surface stays summary-only and routes to the full view via the
          OPEN FULL TASKS button at the bottom. */}
      {!compact && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
          {FILTER_OPTIONS.map(opt => {
            const active = filter === opt.id;
            const n = counts[opt.id] ?? 0;
            return (
              <button key={opt.id} onClick={() => setFilter(opt.id)}
                style={{
                  padding: '3px 8px', borderRadius: 0,
                  border: `1px solid ${active ? 'var(--c-ac)' : 'var(--c-cardBd)'}`,
                  background: active ? 'rgba(57,189,255,0.094)' : 'transparent',
                  color: active ? 'var(--c-ac)' : 'var(--c-tm)',
                  fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
                  cursor: 'pointer',
                }}>{opt.label} {n > 0 ? `· ${n}` : ''}</button>
            );
          })}
        </div>
      )}

      {adding && (
        <div style={{ marginBottom: 12 }}>
          <textarea value={body} onChange={e => setBody(e.target.value)} dir="auto"
            onBlur={draft.onBlur}
            onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) onAdd(); }}
            placeholder="Quick thought… (⌘/Ctrl + Enter to save · auto-saves on blur)"
            rows={2}
            style={{
              width: '100%', background: 'var(--c-sf)', border: `1px solid var(--c-cardBd)`,
              borderRadius: 0, padding: '8px 10px', color: 'var(--c-tx)', fontSize: 13,
              outline: 'none', boxSizing: 'border-box', resize: 'vertical',
              direction: isHebrew(body) ? 'rtl' : 'ltr',
              fontFamily: isHebrew(body) ? FH : FB,
            }} />
          {/* F-35 — tags input. Space- or comma-separated keywords let
              this note doubles as a knowledge-base entry (e.g. "#rehab
              #shoulder" or "post-surgery, glute-bridge progression"). */}
          <input type="text" value={tagsInput} onChange={e => setTagsInput(e.target.value)}
            placeholder="#tags  (e.g. rehab, shoulder, post-surgery — saves with note)"
            style={{
              width: '100%', background: 'var(--c-sf)', border: `1px solid var(--c-cardBd)`,
              borderRadius: 0, padding: '6px 10px', color: 'var(--c-tx)', fontFamily: FN, fontSize: 11,
              outline: 'none', boxSizing: 'border-box', marginTop: 6, letterSpacing: '0.04em',
            }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, gap: 8 }}>
            {trainees.length > 0 ? (
              <select value={linkTraineeId} onChange={e => setLinkTraineeId(e.target.value)}
                style={{
                  flex: '0 1 220px', height: 32, boxSizing: 'border-box', background: 'var(--c-sf)', border: `1px solid var(--c-cardBd)`,
                  borderRadius: 0, padding: '0 8px', color: 'var(--c-tx)',
                  fontFamily: FN, fontSize: 11, outline: 'none',
                }}>
                <option value="">— Link to trainee (optional) —</option>
                {trainees.filter(t => t.status !== 'Archived').map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            ) : <span />}
            <button onClick={onAdd} disabled={!body.trim()}
              style={{
                height: 32, boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                padding: '0 14px', borderRadius: 0,
                border: `1px solid ${body.trim() ? 'var(--c-ac)' : 'var(--c-cardBd)'}`,
                background: 'transparent', color: body.trim() ? 'var(--c-ac)' : 'var(--c-td)',
                fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
                cursor: body.trim() ? 'pointer' : 'default',
              }}>SAVE</button>
          </div>
        </div>
      )}

      {visible.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--c-td)', padding: '14px 0', textAlign: 'center' }}>
          {filter === 'all'
            ? 'Nothing yet. Drop a task above, or add from trainee cards / intake / review.'
            : `No tasks in ${filter}. Try a different filter or "+ TASK" above.`}
        </div>
      ) : (
        // Responsive grid — locks to 2 columns at typical desktop widths
        // and collapses to 1 column on phone-narrow surfaces. The
        // `min(520px, 100%)` floor caps at 520 on wide viewports (so the
        // widget never tips to a 3-col layout on 1366–1920) but scales
        // with the container under ~520px so the column doesn't blow past
        // the viewport on phones (414px portrait used to scroll horizontally
        // because a bare `minmax(520px, 1fr)` forced the single column to
        // stay 520px wide).
        <>
        {/* Dashboard mini-board (compact) — a condensed status kanban so the
            dashboard Tasks widget mirrors the /coach/tasks board (Ohad). The full
            view keeps the card grid below (hidden in compact). */}
        {compact && (() => {
          // Auto vs manual split — a task is a coaching ALERT iff it carries an
          // auto_kind (autoTasks.js); manual = Ohad/Yuval's own logged tasks.
          // (whatsapp_combined synthetic cards from throttleWhatsAppTasks keep
          // an auto_kind, so they read as alerts too.)
          const autoRows = openRows.filter(r => !!r.auto_kind);
          const manualRows = openRows.filter(r => !r.auto_kind);
          const grouped = groupAlerts(autoRows);

          const COLS = [
            { id:'open',    label:'To Do',       color:'#5B6B7A' },
            { id:'working', label:'In Progress', color:'#2C82C9' },
            { id:'waiting', label:'Waiting',     color:'#C9851E' },
            { id:'stuck',   label:'Stuck',       color:'#C0392B' },
          ];
          // Status kanban of MANUAL tasks only — coaching alerts never sit here
          // (they carry no meaningful In-Progress/Waiting/Stuck state). Feeds the
          // MINE view and the top half of ALL.
          const cap = stackBoard ? 6 : 12;
          const kanban = manualRows.length === 0 ? (
            <div style={{ padding:'18px 8px', textAlign:'center', color:'var(--c-td)', fontFamily:FN, fontSize:10, letterSpacing:'0.06em' }}>No open tasks — you're all clear.</div>
          ) : (
            <div style={{ display:'flex', flexDirection: stackBoard ? 'column' : 'row', gap:8, overflowX: stackBoard ? 'visible' : 'auto', paddingBottom:4, alignItems:'flex-start' }}>
              {COLS.map(col => {
                const rows = col.id==='open'
                  ? manualRows.filter(r => !['working','waiting','stuck'].includes(r.status))
                  : manualRows.filter(r => r.status === col.id);
                // Drop empty columns entirely (desktop + mobile) — an empty "—"
                // column just wastes width and reads sparse; the populated columns
                // expand to fill (Ohad: make it comfortable, not a sparse grid).
                if (rows.length === 0) return null;
                return (
                  <div key={col.id} style={{ flex: stackBoard ? '1 1 auto' : '1 1 200px', minWidth: stackBoard ? 0 : 160, border:`1px solid var(--c-cardBd)`, display:'flex', flexDirection:'column' }}>
                    {/* Column header matches the tasks-page BOARD column header
                        EXACTLY (TasksV8View: saturated fill + white text, label
                        left · count right, padding 10/12, 11px/0.12em label).
                        Same STATUS colours (open #5B6B7A … stuck #C0392B), so the
                        dashboard status-board and the tasks-page board read as one
                        system (Ohad: same language as the tasks page). */}
                    <div style={{ background:col.color, color:'#FFFFFF', padding:'10px 12px', display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:`1px solid var(--c-cardBd)` }}>
                      <span style={{ fontFamily:FN, fontSize:11, fontWeight:700, letterSpacing:'0.12em', textTransform:'uppercase' }}>{col.label}</span>
                      <span style={{ fontFamily:FN, fontSize:10, fontWeight:700, letterSpacing:'0.06em', opacity:0.85 }}>{rows.length}</span>
                    </div>
                    <div style={{ padding:4, display:'flex', flexDirection:'column', gap:4, maxHeight: stackBoard ? 'none' : 300, overflowY: stackBoard ? 'visible' : 'auto' }}>
                      {rows.slice(0, cap).map(n => (
                        <MiniTaskRow key={n.id} n={n} stackBoard={stackBoard} stripe={col.color} onClick={()=>handleClick(n)} />
                      ))}
                      {rows.length > cap && <div onClick={()=>{ if(onOpenFullTasks) onOpenFullTasks(); }} style={{ padding:'4px', textAlign:'center', color:'var(--c-ac)', fontSize:9, fontFamily:FN, fontWeight:700, letterSpacing:'0.08em', cursor:'pointer' }}>+{rows.length-cap} MORE →</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          );

          // Grouped coaching-alerts list — 📞 Calls · 🎥 Reviews · 🏗 Builds ·
          // 📋 Intake, each group collapsible with a count. Reused by ALERTS
          // (the comfortable view) and by the bottom of ALL.
          const alertsList = autoRows.length === 0 ? (
            <div style={{ fontFamily:FN, fontSize:9, color:'var(--c-td)', letterSpacing:'0.04em', padding:'4px 0' }}>No coaching alerts — all clear.</div>
          ) : (
            <AlertGroupList grouped={grouped} collapsible collapsedMap={alertCollapsed} onToggle={toggleAlertGroup} onRowClick={handleClick} stackBoard={stackBoard} />
          );

          const btnBase = { borderRadius:0, fontFamily:FN, fontWeight:700, cursor:'pointer' };
          const SEGS = [
            { id:'mine',   label:'GENERAL',     n:manualRows.length },
            { id:'alerts', label:'AUTO-ALERTS', n:autoRows.length },
            { id:'all',    label:'ALL',         n:openRows.length },
          ];
          return (
            <div>
              {/* Hover affordance for the clickable task cards (open the popup). */}
              <style>{`.mini-task-row:hover{ border-color: var(--c-tm); background: var(--c-sf); }`}</style>
              {/* Compact scope toggle — a single left-aligned segmented control
                  (GENERAL · AUTO-TASKS · ALL — the tasks-page's own vocabulary).
                  Counts ride beside each label; the active segment gets the cyan
                  fill + cyan text. Left-aligned to sit under the section title. */}
              <div style={{ display:'flex', justifyContent:'flex-start', marginBottom:6 }}>
                <div style={{ display:'inline-flex', border:`1px solid var(--c-cardBd)` }}>
                  {SEGS.map((s, i) => {
                    const active = v2Sub === s.id;
                    return (
                      <button key={s.id} onClick={()=>setV2Sub(s.id)}
                        style={{ ...btnBase, height:28, fontSize:10, letterSpacing:'0.1em', padding:'0 12px',
                          border:'none', borderLeft: i ? `1px solid var(--c-cardBd)` : 'none',
                          background: active?'rgba(57,189,255,0.094)':'transparent',
                          color: active?'var(--c-ac)':'var(--c-tm)',
                          display:'inline-flex', alignItems:'center', gap:5 }}>
                        {/* count in parens, vertically centred with the label (Ohad). */}
                        <span style={{ display:'inline-flex', alignItems:'center', lineHeight:1 }}>{s.label}</span>{s.n>0 && <span style={{ display:'inline-flex', alignItems:'center', fontSize:10, fontWeight:700, lineHeight:1, opacity: active?0.9:0.5 }}>({s.n})</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              {v2Sub === 'alerts' ? (
                // ALERTS — the comfortable view: grouped by kind, NO status kanban.
                alertsList
              ) : v2Sub === 'all' ? (
                // ALL — manual status kanban, then the grouped coaching alerts below.
                <>
                  {kanban}
                  <div style={{ marginTop:12 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                      <span style={{ fontFamily:FN, fontSize:9, color:'var(--c-td)', letterSpacing:'0.14em', fontWeight:700 }}>AUTO-ALERTS ({autoRows.length})</span>
                      <span style={{ flex:1, height:1, background:'var(--c-cardBd)' }} />
                    </div>
                    {alertsList}
                  </div>
                </>
              ) : (
                // MINE — manual tasks in the status kanban (default).
                kanban
              )}
            </div>
          );
        })()}
        <div style={{
          display: compact ? 'none' : 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(520px, 100%), 1fr))',
          gap: 8,
        }}>
          {visible.map(n => {
            const heb = isHebrew(n.body);
            const allowEdit = !compact;
            const trainee = (n.target_kind === 'trainee' && n.target_id)
              ? trainees.find(t => t.id === n.target_id)
              : null;
            return (
              <TaskCard
                key={n.id}
                note={n}
                heb={heb}
                trainee={trainee}
                allowEdit={allowEdit}
                isEditing={editingId === n.id && allowEdit}
                editBody={editBody}
                onEditBody={setEditBody}
                onSaveEdit={saveEdit}
                onCancelEdit={cancelEdit}
                onStartEdit={() => startEdit(n)}
                onToggleDone={() => toggleDoneSmart(n)}
                onTogglePin={() => togglePin(n.id)}
                onRemove={async () => {
                  // Cancel ≠ delete. The × on an ACTIVE task now ARCHIVES it
                  // as 'cancelled' (kept in history below), instead of the old
                  // hard-delete that lost it forever. Permanent deletion is
                  // still available from the history pool's × on demand.
                  if (await confirmToast('Cancel this task? It moves to history (not deleted).', { okLabel: 'Cancel task', cancelLabel: 'Keep' })) {
                    update(n.id, { status: 'cancelled', completed_at: new Date().toISOString() });
                  }
                }}
                actionButton={
                  <TaskActionButton
                    note={n}
                    trainee={trainee}
                    onCreatePlan={onCreatePlanForTask ? () => startCreatePlan(n) : null}
                    onOpenReview={onNavigate ? (woId) => onNavigate('review', woId) : null}
                    onOpenIntake={onOpenIntakeTab || null}
                    onOpenAthlete={onNavigate ? (id) => onNavigate('trainee', id) : null}
                    onOpenWaitlist={onOpenWaitlist || null}
                  />
                }
              />
            );
          })}
        </div>
        </>
      )}

      {/* DONE pool */}
      {visibleDone.length > 0 && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px dashed var(--c-cardBd)` }}>
          <div style={{ fontFamily: FN, fontSize: 9, color: 'var(--c-td)', letterSpacing: '0.18em', fontWeight: 700, marginBottom: 4 }}>
            ✓ HISTORY ({doneRows.length}{visibleDone.length < doneRows.length ? ` · showing ${visibleDone.length}` : ''})
          </div>
          {visibleDone.map(n => {
            const heb = isHebrew(n.body);
            return (
              <div key={n.id} style={{
                // No wrapper opacity — line-through + muted color (--c-tm)
                // are already enough "this is closed" signal in both themes.
                // The prior opacity:0.55 was double-dimming and made the
                // strikethrough body unreadable on white in light mode.
                display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 0',
                borderBottom: `1px solid var(--c-cardBd)`,
              }}>
                <input type="checkbox" checked={true}
                  title={n.status === 'cancelled' ? 'Reopen (un-cancel)' : 'Reopen'}
                  onChange={() => n.status === 'cancelled'
                    ? update(n.id, { status: 'open', completed_at: null })
                    : toggleDone(n.id)}
                  style={{ width: 14, height: 14, accentColor: n.status === 'cancelled' ? 'var(--c-tm)' : 'var(--c-gn)', cursor: 'pointer', flexShrink: 0, marginTop: 3 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: FN, fontSize: 9, color: 'var(--c-td)', letterSpacing: '0.08em', marginBottom: 2 }}>
                    {TARGET_ICON[n.target_kind] || '·'} {TARGET_LABEL[n.target_kind] || 'NOTE'}
                    {n.target_label && <span style={{ color: 'var(--c-ac)', marginLeft: 6 }}>· {n.target_label}</span>}
                    {n.status === 'cancelled' && <span style={{ color: 'var(--c-or)', marginLeft: 6, fontWeight: 700 }}>· CANCELLED</span>}
                    {n.completed_at && <span style={{ color: 'var(--c-tm)', marginLeft: 6 }}>· {n.status === 'cancelled' ? 'cancelled' : 'done'} {fmtPrettyDate(n.completed_at)}</span>}
                  </div>
                  <div style={{
                    fontSize: 12, color: 'var(--c-tm)', lineHeight: 1.4, whiteSpace: 'pre-wrap', textDecoration: 'line-through',
                    direction: heb ? 'rtl' : 'ltr',
                    // Center-align DONE rows so mixed Hebrew/English content
                    // doesn't split the eye between right-anchored and
                    // left-anchored rows (Ohad spec 2026-05-24).
                    textAlign: 'center',
                    // FB (Nord-first with Heebo fallback) for BOTH Hebrew and English
          // bodies so the type renders with the same sharp Nord weight
          // as the action pills (REVIEW / NEW PROGRAM) and label strips —
          // no more Hebrew-Heebo / English-Nord mismatch inside a card.
          fontFamily: FB,
                  }}>{displayBodyOf(n.body)}</div>
                  {n.linked_plan_id && (
                    <div style={{ fontFamily: FN, fontSize: 9, color: 'var(--c-ac)', letterSpacing: '0.08em', marginTop: 2, fontWeight: 700 }}>
                      ✓ COMPLETED BY PLAN
                    </div>
                  )}
                </div>
                <button onClick={async () => {
                    if (await confirmToast('Delete this completed task? This cannot be undone.', { okLabel: 'Delete', cancelLabel: 'Cancel' })) {
                      remove(n.id);
                    }
                  }} title="Remove" aria-label="Delete task"
                  style={{ background: 'none', border: 'none', color: 'var(--c-td)', cursor: 'pointer', fontSize: 14, padding: '0 4px', flexShrink: 0 }}>×</button>
              </div>
            );
          })}
        </div>
      )}

      {compact && onOpenFullTasks && (counts.all > visible.length || counts.all > 0) && (
        <button onClick={onOpenFullTasks}
          style={{
            width: '100%', marginTop: 10, padding: '8px 0', background: 'transparent',
            border: `1px solid var(--c-ac)`, color: 'var(--c-ac)',
            fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', cursor: 'pointer',
          }}>OPEN FULL TASKS ({counts.all}) →</button>
      )}
      </div>
      </div>
    </div>
  );
}
