// Full-coverage COACH-side interactive demo at expo-app.co.il/try.
// Replaces the earlier engine-sandbox-with-banner approach. A coach prospect
// can click through every major surface of the platform — Dashboard, Trainees,
// Programs, Exercises, Review — with plausible mock data, no backend.
//
// All state is local React state. No Supabase, no useStore, nothing that the
// running product depends on. The Review tab embeds the existing /demo engine
// in an iframe to show the rep counter + pose overlay live, with a fake
// comments sidebar around it that hints at the production review surface.
//
// Companion to /demo (TrySandbox pov="trainee") which stays as the simple
// trainee-side engine sandbox. Both end-CTAs converge at /demo#waitlist.

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { fmtPrettyDate } from './dates';
import { C, FN, FB, FH, CATEGORIES, RESISTANCE_TYPES, BODY_POSITIONS, MOVEMENT_TYPES, MOVEMENT_PATTERNS, LATERALITY } from './theme';
import { EXPOMark } from './expoMark';

// ─── Mock data ────────────────────────────────────────────────────────────
// Three mock trainees — one per format type (Online / Gym Single / Gym Couple)
// with Israeli names. Enough variety to show every kind of card + filter
// without padding the demo to feel like marketing fluff.
const MOCK_TRAINEES = [
  { id: 't1', name: 'נועה לוי', short: 'Noa', email: 'noa.levi@example.co.il', phone: '+972544123456', status: 'Active', sessionsLeft: 6, monthly: 800, format: 'Gym, Single', startDate: '2025-09-01', dormantDays: null, lastWorkout: '2 days ago', programs: 3, payment: 'PAID', online: true, age: 31, weight: 64, height: 168, injuries: 'L4-L5 disc bulge', goals: 'Stronger bench, fix overhead', plans: ['Block #4 — Push/Pull Volume', 'Block #3 — Strength Base', 'Block #2 — Reset'] },
  { id: 't2', name: 'גל מזרחי', short: 'Gal', email: 'gal.mizrahi@example.co.il', phone: '+972526789012', status: 'Active', sessionsLeft: 2, monthly: 800, format: 'Online', startDate: '2024-11-15', dormantDays: 18, lastWorkout: '18 days ago', programs: 4, payment: 'OVERDUE', online: false, age: 27, weight: 78, height: 182, injuries: 'R shoulder impingement', goals: 'First muscle-up by summer', plans: ['Block #4 — Pull Specialization', 'Block #3 — Volume', 'Block #2 — Hypertrophy', 'Block #1 — Intake'] },
  { id: 't3', name: 'יעל ועידן כהן', short: 'Yael+Idan', email: 'yael.cohen@example.co.il', phone: '+972503334455', status: 'Active', sessionsLeft: 8, monthly: 1200, format: 'Gym, Couple', startDate: '2025-01-15', dormantDays: null, lastWorkout: '4 days ago', programs: 4, payment: 'PAID', online: false, isCouple: true, age: 35, weight: 72, height: 175, injuries: 'None', goals: 'Body comp + first chin-up (Yael)', plans: ['Block #4 — Couple Volume', 'Block #3 — Couple Base', 'Block #2 — Onboarding', 'Block #1 — Intake'] },
  { id: 't4', name: 'דניאל אבני', short: 'Daniel', email: 'daniel.avni@example.co.il', phone: '+972545556677', status: 'Active', sessionsLeft: 10, monthly: 900, format: 'Gym, Single', startDate: '2025-03-10', dormantDays: null, lastWorkout: '1 day ago', programs: 2, payment: 'PAID', online: true, age: 29, weight: 81, height: 179, injuries: 'None', goals: 'Add 10kg to squat', plans: ['Block #2 — Strength', 'Block #1 — Base'] },
  { id: 't5', name: 'מאיה רוזן', short: 'Maya', email: 'maya.rozen@example.co.il', phone: '+972528889900', status: 'On Hold', sessionsLeft: 0, monthly: 700, format: 'Online', startDate: '2024-12-01', dormantDays: 9, lastWorkout: '9 days ago', programs: 3, payment: 'OVERDUE', online: false, age: 33, weight: 60, height: 165, injuries: 'R knee — patellofemoral', goals: 'Return to running pain-free', plans: ['Block #3 — Rehab', 'Block #2 — Base', 'Block #1 — Intake'] },
  { id: 't6', name: 'איתי כץ', short: 'Itai', email: 'itai.katz@example.co.il', phone: '+972541112233', status: 'Trial', sessionsLeft: 1, monthly: 0, format: 'Gym, Single', startDate: '2025-06-12', dormantDays: null, lastWorkout: '3 days ago', programs: 1, payment: 'NEVER PAID', online: false, age: 24, weight: 70, height: 176, injuries: 'None', goals: 'Learn the lifts, build a base', plans: ['Block #1 — Onboarding'] },
  { id: 't7', name: 'שירה לוין', short: 'Shira', email: 'shira.levin@example.co.il', phone: '+972502223344', status: 'Inactive', sessionsLeft: 0, monthly: 800, format: 'Online', startDate: '2024-08-20', dormantDays: 41, lastWorkout: '41 days ago', programs: 5, payment: 'OVERDUE', online: false, age: 38, weight: 67, height: 170, injuries: 'Lower-back stiffness', goals: 'Re-engage after travel', plans: ['Block #5 — Volume', 'Block #4 — Strength', 'Block #3 — Base'] },
  { id: 't8', name: 'עומר דגן', short: 'Omer', email: 'omer.dagan@example.co.il', phone: '+972544445566', status: 'Active', sessionsLeft: 5, monthly: 950, format: 'Gym, Single', startDate: '2025-02-05', dormantDays: null, lastWorkout: 'Today', programs: 3, payment: 'PAID', online: true, age: 26, weight: 88, height: 185, injuries: 'None', goals: 'Powerlifting meet prep', plans: ['Block #3 — Peaking', 'Block #2 — Volume', 'Block #1 — Base'] },
];

// Per-block plan content. Block #4 is the active block (Week 2 of 4 wave);
// older blocks are completed and shown read-only when picked from the
// sidebar. Each block has its own day list + exercises so clicking through
// the block-history actually swaps the editor pane (not just styling).
const BLOCK_DATA = {
  'Block #4': {
    title: 'Block #4 — Push/Pull Volume',
    when: 'WEEK 2 OF 4',
    warmup: [
      { t: 'Cat-Cow + Thread the Needle', rx: '8 each side' },
      { t: 'Banded Pull-Apart',           rx: '2 × 12'      },
      { t: 'Glute Bridge w/ Pause',       rx: '2 × 10'      },
      { t: 'World\'s Greatest Stretch',   rx: '5 / side'    },
    ],
    days: [
      { name: 'Day A · Push', exercises: [
        { name: 'BB Bench Press',          sets: 4, reps: '6-8',  tempo: '3-1-1', superset: '', wk: ['57.5kg', '60kg', '62.5kg', '65kg'] },
        { name: 'DB Incline Press',        sets: 3, reps: '8-10', tempo: '',      superset: 'A' },
        { name: 'Cable Fly',               sets: 3, reps: '12',   tempo: '',      superset: 'A' },
        { name: 'Standing OHP',            sets: 4, reps: '6-8',  tempo: '',      superset: '', wk: ['32.5kg', '35kg', '37.5kg', '40kg'] },
        { name: 'Lateral Raise',           sets: 3, reps: '12-15',tempo: '',      superset: 'B' },
        { name: 'Tricep Pushdown',         sets: 3, reps: '12',   tempo: '',      superset: 'B' },
      ]},
      { name: 'Day B · Pull', exercises: [
        { name: 'BB Deadlift',             sets: 4, reps: '5',    tempo: '',      superset: '' },
        { name: 'Pull-Up',                 sets: 4, reps: '6-8',  tempo: '',      superset: 'A' },
        { name: 'Bent-Over BB Row',        sets: 4, reps: '8',    tempo: '',      superset: 'A' },
        { name: 'Face Pull',               sets: 3, reps: '15',   tempo: '',      superset: 'B' },
        { name: 'DB Bicep Curl',           sets: 3, reps: '10-12',tempo: '',      superset: 'B' },
        { name: 'Hammer Curl',             sets: 3, reps: '10',   tempo: '',      superset: '' },
      ]},
      { name: 'Day C · Legs', exercises: [
        { name: 'Back Squat',              sets: 5, reps: '5',    tempo: '3-0-X', superset: '', wk: ['90kg', '95kg', '100kg', '105kg'] },
        { name: 'Romanian Deadlift',       sets: 4, reps: '8',    tempo: '',      superset: 'A' },
        { name: 'Walking Lunge',           sets: 3, reps: '10 E', tempo: '',      superset: 'A' },
        { name: 'Leg Curl',                sets: 3, reps: '12',   tempo: '',      superset: 'B' },
        { name: 'Standing Calf Raise',     sets: 4, reps: '15',   tempo: '',      superset: 'B' },
      ]},
    ],
  },
  'Block #3': {
    title: 'Block #3 — Strength Base',
    when: 'COMPLETED · APR · 4 WEEKS',
    warmup: [
      { t: 'Foam Roll Quads + T-Spine', rx: '60s each' },
      { t: 'Hip 90/90',                 rx: '6 / side' },
      { t: 'Goblet Squat',              rx: '2 × 8'    },
    ],
    days: [
      { name: 'Day A · Lower', exercises: [
        { name: 'Back Squat',              sets: 5, reps: '5',    tempo: '3-1-1', superset: '', wk: ['80kg', '82.5kg', '85kg', '87.5kg'] },
        { name: 'Romanian Deadlift',       sets: 4, reps: '6',    tempo: '',      superset: '', wk: ['70kg', '75kg', '80kg', '82.5kg'] },
        { name: 'Bulgarian Split Squat',   sets: 3, reps: '8 E',  tempo: '',      superset: 'A' },
        { name: 'Hip Thrust',              sets: 3, reps: '10',   tempo: '',      superset: 'A' },
        { name: 'Standing Calf Raise',     sets: 4, reps: '12',   tempo: '',      superset: '' },
      ]},
      { name: 'Day B · Upper', exercises: [
        { name: 'BB Bench Press',          sets: 5, reps: '5',    tempo: '3-1-1', superset: '', wk: ['52.5kg', '55kg', '57.5kg', '60kg'] },
        { name: 'Bent-Over BB Row',        sets: 5, reps: '5',    tempo: '',      superset: '', wk: ['50kg', '52.5kg', '55kg', '57.5kg'] },
        { name: 'Standing OHP',            sets: 4, reps: '6',    tempo: '',      superset: 'A' },
        { name: 'Pull-Up',                 sets: 4, reps: '5-6',  tempo: '',      superset: 'A' },
        { name: 'Hanging Leg Raise',       sets: 3, reps: '8',    tempo: '',      superset: '' },
      ]},
    ],
  },
  'Block #2': {
    title: 'Block #2 — Reset',
    when: 'COMPLETED · MAR · 3 WEEKS',
    days: [
      { name: 'Day A · Full Body', exercises: [
        { name: 'Goblet Squat',            sets: 3, reps: '10',   tempo: '3-0-2', superset: '' },
        { name: 'DB Bench Press',          sets: 3, reps: '10',   tempo: '',      superset: 'A' },
        { name: 'Lat Pulldown',            sets: 3, reps: '10',   tempo: '',      superset: 'A' },
        { name: 'Plank',                   sets: 3, reps: '30s',  tempo: '',      superset: '' },
      ]},
      { name: 'Day B · Mobility', exercises: [
        { name: 'KB Deadlift',             sets: 3, reps: '8',    tempo: '',      superset: '' },
        { name: 'Cable Row',               sets: 3, reps: '12',   tempo: '',      superset: 'A' },
        { name: 'Push-Up',                 sets: 3, reps: '10',   tempo: '',      superset: 'A' },
        { name: 'Cable Pallof Press',      sets: 3, reps: '10 E', tempo: '',      superset: '' },
      ]},
    ],
  },
  'Block #1': {
    title: 'Block #1 — Intake',
    when: 'COMPLETED · FEB · 2 WEEKS',
    days: [
      { name: 'Day A · Movement Screen', exercises: [
        { name: 'Bodyweight Squat',        sets: 2, reps: '10',   tempo: '',      superset: '' },
        { name: 'Hip Hinge (Dowel)',       sets: 2, reps: '10',   tempo: '',      superset: '' },
        { name: 'Wall Push-Up',            sets: 2, reps: '10',   tempo: '',      superset: '' },
        { name: 'Dead Bug',                sets: 2, reps: '8 E',  tempo: '',      superset: '' },
      ]},
    ],
  },
};

// Each entry carries the same six taxonomy fields the real coach app's
// ExercisesView filters on (category / resistance / body position / movement
// type / pattern / laterality) so the demo's filter row mirrors production
// 1:1 instead of just exposing category.
const MOCK_EXERCISES = [
  { name: 'BB Bench Press',     category: 'Chest',     resistanceType: 'Barbell',    bodyPosition: 'Supine',       movementType: 'Push',          pattern: 'Horizontal Push',         laterality: 'Bilateral'  },
  { name: 'DB Incline Press',   category: 'Chest',     resistanceType: 'Dumbbell',   bodyPosition: 'Supine',       movementType: 'Push',          pattern: 'Horizontal Push',         laterality: 'Bilateral'  },
  { name: 'Cable Fly',          category: 'Chest',     resistanceType: 'Cable',      bodyPosition: 'Standing',     movementType: 'Push',          pattern: 'Isolation',               laterality: 'Bilateral'  },
  { name: 'Standing OHP',       category: 'Shoulders', resistanceType: 'Barbell',    bodyPosition: 'Standing',     movementType: 'Push',          pattern: 'Vertical Push',           laterality: 'Bilateral'  },
  { name: 'Lateral Raise',      category: 'Shoulders', resistanceType: 'Dumbbell',   bodyPosition: 'Standing',     movementType: 'Lateral Raise', pattern: 'Isolation',               laterality: 'Bilateral'  },
  { name: 'BB Deadlift',        category: 'Legs',      resistanceType: 'Barbell',    bodyPosition: 'Standing',     movementType: 'Hinge',         pattern: 'Hip Hinge',               laterality: 'Bilateral'  },
  { name: 'Romanian Deadlift',  category: 'Legs',      resistanceType: 'Barbell',    bodyPosition: 'Standing',     movementType: 'Hinge',         pattern: 'Hip Hinge',               laterality: 'Bilateral'  },
  { name: 'Pull-Up',            category: 'Back',      resistanceType: 'Bodyweight', bodyPosition: 'Hanging',      movementType: 'Pull',          pattern: 'Vertical Pull',           laterality: 'Bilateral'  },
  { name: 'Bent-Over BB Row',   category: 'Back',      resistanceType: 'Barbell',    bodyPosition: 'Standing',     movementType: 'Row',           pattern: 'Horizontal Pull',         laterality: 'Bilateral'  },
  { name: 'Back Squat',         category: 'Legs',      resistanceType: 'Barbell',    bodyPosition: 'Standing',     movementType: 'Squat',         pattern: 'Squat',                   laterality: 'Bilateral'  },
  { name: 'Front Squat',        category: 'Legs',      resistanceType: 'Barbell',    bodyPosition: 'Standing',     movementType: 'Squat',         pattern: 'Squat',                   laterality: 'Bilateral'  },
  { name: 'Walking Lunge',      category: 'Legs',      resistanceType: 'Dumbbell',   bodyPosition: 'Standing',     movementType: 'Lunge',         pattern: 'Lunge',                   laterality: 'Alternating'},
  { name: 'Leg Curl',           category: 'Legs',      resistanceType: 'Machine',    bodyPosition: 'Prone',        movementType: 'Curl',          pattern: 'Isolation',               laterality: 'Bilateral'  },
  { name: 'Hip Thrust',         category: 'Glutes',    resistanceType: 'Barbell',    bodyPosition: 'Supine',       movementType: 'Hinge',         pattern: 'Hip Hinge',               laterality: 'Bilateral'  },
  { name: 'Face Pull',          category: 'Back',      resistanceType: 'Cable',      bodyPosition: 'Standing',     movementType: 'Pull',          pattern: 'Horizontal Pull',         laterality: 'Bilateral'  },
  { name: 'DB Bicep Curl',      category: 'Arms',      resistanceType: 'Dumbbell',   bodyPosition: 'Standing',     movementType: 'Curl',          pattern: 'Isolation',               laterality: 'Bilateral'  },
  { name: 'Tricep Pushdown',    category: 'Arms',      resistanceType: 'Cable',      bodyPosition: 'Standing',     movementType: 'Extend',        pattern: 'Isolation',               laterality: 'Bilateral'  },
  { name: 'Hanging Leg Raise',  category: 'Core',      resistanceType: 'Bodyweight', bodyPosition: 'Hanging',      movementType: 'Isometric',     pattern: 'Isolation',               laterality: 'Bilateral'  },
  { name: 'Plank',              category: 'Core',      resistanceType: 'Bodyweight', bodyPosition: 'Prone',        movementType: 'Isometric',     pattern: 'Isolation',               laterality: 'Bilateral'  },
  { name: 'Cable Pallof Press', category: 'Core',      resistanceType: 'Cable',      bodyPosition: 'Standing',     movementType: 'Anti-Rotation', pattern: 'Rotation/Anti-Rotation',  laterality: 'Unilateral' },
];

// ─── Shared bits ──────────────────────────────────────────────────────────
const baseBtn = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  padding: '8px 14px', borderRadius: 0, border: 'none',
  fontFamily: FB, fontSize: 12, fontWeight: 700, letterSpacing: 1.2,
  cursor: 'pointer', transition: 'all 0.15s', textDecoration: 'none',
};

// Glowing dot identical to the real coach app's OnlineDot — pulses green
// when a trainee is currently signed into their portal. Demo shows it on
// the one trainee whose `online: true` flag is set in the mock data.
function OnlineDot() {
  return (
    <span style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
      background: C.gn, boxShadow: `0 0 6px ${C.gn}`, flexShrink: 0,
    }} />
  );
}

function Badge({ color = C.tm, children }) {
  return (
    <span style={{
      fontFamily: FN, fontSize: 9, letterSpacing: 1.2, fontWeight: 700,
      color, background: color + '20', border: `1px solid ${color}40`,
      borderRadius: 0, padding: '2px 6px', whiteSpace: 'nowrap',
    }}>{children}</span>
  );
}

// Matches the real DashboardView summary card spec: 0.25px ac-dimmed
// border, 10px radius, 14px×18px padding, 22px value, 10px FN label.
function StatCard({ label, value, sub, accent = C.ac, total }) {
  return (
    <div style={{
      background: C.sf, border: `1px solid ${C.cardBd}`, borderRadius: 0,
      padding: '14px 18px', flex: '1 1 170px', minWidth: 170,
    }}>
      <div style={{
        fontSize: 10, fontFamily: FN, color: C.td, textTransform: 'uppercase',
        letterSpacing: '0.06em', marginBottom: 6,
      }}>{label}</div>
      <div style={{
        fontSize: 22, fontWeight: 700, fontFamily: FN, color: accent,
      }}>
        {value}
        {total !== undefined && <span style={{ fontSize: 12, color: C.td, fontWeight: 400 }}> / {total}</span>}
      </div>
      {sub && (
        <div style={{ fontSize: 10, fontFamily: FN, color: C.td, marginTop: 4 }}>{sub}</div>
      )}
    </div>
  );
}

// ─── Tab: Dashboard ───────────────────────────────────────────────────────
function DemoDashboard({ onJumpToTrainee }) {
  const dormant = MOCK_TRAINEES.filter(t => t.dormantDays != null);
  const expiring = MOCK_TRAINEES.filter(t => t.sessionsLeft > 0 && t.sessionsLeft <= 2);
  const onlineNow = MOCK_TRAINEES.filter(t => t.online);
  const overdue = MOCK_TRAINEES.filter(t => t.payment === 'OVERDUE');
  // Derive every headline number from the roster so the dashboard is internally
  // consistent with the 8-athlete fixture (no hardcoded "3/4 · ₪2,800" that
  // silently drifts when the roster changes). Active = status Active; collected
  // = the PAID clients' monthly; outstanding = the OVERDUE clients' monthly.
  const active = MOCK_TRAINEES.filter(t => t.status === 'Active');
  const paying = MOCK_TRAINEES.filter(t => t.payment === 'PAID');
  const num = n => Math.round(n).toLocaleString('en-US');
  const nis = n => '₪' + num(n);
  const mrr = active.reduce((s, t) => s + (t.monthly || 0), 0);
  const collected30 = paying.reduce((s, t) => s + (t.monthly || 0), 0);
  const outstandingAmt = overdue.reduce((s, t) => s + (t.monthly || 0), 0);
  const avgTicket = paying.length ? collected30 / paying.length : 0;
  const avgLtv = avgTicket * 10; // ~10-month mean tenure, plenty for a demo
  const months6 = [['Jan', 2900], ['Feb', 3200], ['Mar', 2700], ['Apr', 3600], ['May', 3400], ['Jun', collected30]];
  const barMax = Math.max(...months6.map(m => m[1]));
  const collected90 = months6.slice(-3).reduce((s, m) => s + m[1], 0);
  return (
    <section>

      {/* Summary card grid — same shape as the real DashboardView's
          repeat(auto-fit, minmax(170px, 1fr)) at 10px gap. */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
        gap: 10, marginBottom: 20,
      }}>
        <StatCard label="Active Athletes" value={String(active.length)} total={String(MOCK_TRAINEES.length)} accent={C.gn} />
        <StatCard label="Low Sessions" value={String(expiring.length)} sub="≤ 2 LEFT" accent={C.or} />
        <StatCard label="Estimated Monthly" value={nis(mrr)} accent={C.ac} />
        <StatCard label="Collected MTD" value={nis(collected30)} sub="+12% vs last month" accent={C.gn} />
      </div>

      {/* Incoming · 30D — funnel summary, mirrors the real dashboard section. */}
      <div style={{ border: `1px solid ${C.cardBd}`, marginBottom: 20 }}>
        <div style={{ background: C.ac, color: '#FFFFFF', padding: '8px 14px', fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em' }}>INCOMING · 30D</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, padding: 14 }}>
          {[['NEW LEADS', '12', C.ac, 'last 30 days'], ['INTAKE FORMS', '7', C.ac, 'submitted'], ['TRIALS STARTED', '3', C.gn, 'this month'], ['CONVERTED', '2', C.gn, 'to paying']].map(([l, v, c, sub], i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '10px 14px', border: `1px solid ${C.cardBd}`, background: C.sf }}>
              <span style={{ fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: '0.18em', fontWeight: 700 }}>{l}</span>
              <span style={{ fontFamily: FN, fontSize: 18, fontWeight: 800, color: c, fontVariantNumeric: 'tabular-nums' }}>{v}</span>
              <span style={{ fontFamily: FN, fontSize: 9, color: C.td, marginTop: 2 }}>{sub}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Revenue panel — mirrors the real DashboardView RevenueCard (F-36):
          six metric tiles + a 6-month collected bar chart. Static demo data. */}
      <div style={{ border: `1px solid ${C.cardBd}`, marginBottom: 20 }}>
        <div style={{ background: C.ac, color: '#FFFFFF', padding: '8px 14px', fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>REVENUE</span><span style={{ opacity: 0.85, fontSize: 10 }}>INCL. VAT · 6 MO TREND</span>
        </div>
        <div style={{ padding: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginBottom: 16 }}>
            {[
              ['MRR (ACTIVE)', num(mrr), 'recurring committed', C.ac],
              ['30D COLLECTED', num(collected30), '+12% vs prev month', C.gn],
              ['90D COLLECTED', num(collected90), 'trailing 3 months', C.gn],
              ['OUTSTANDING', num(outstandingAmt), `${overdue.length} overdue client${overdue.length === 1 ? '' : 's'}`, outstandingAmt > 0 ? C.or : C.ac],
              ['AVG LTV', num(avgLtv), 'per paying client', C.ac],
              ['AVG TICKET', num(avgTicket), 'per paying client', C.ac],
            ].map(([lab, val, sub, col], i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '10px 14px', border: `1px solid ${C.cardBd}`, background: C.sf }}>
                <span style={{ fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: '0.18em', fontWeight: 700 }}>{lab}</span>
                <span style={{ fontFamily: FN, fontSize: 18, fontWeight: 800, color: C.tx, letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums' }}><span style={{ color: col }}>₪</span>{val}</span>
                <span style={{ fontFamily: FN, fontSize: 9, color: C.td, marginTop: 2 }}>{sub}</span>
              </div>
            ))}
          </div>
          <div>
            <div style={{ fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: '0.18em', fontWeight: 700, marginBottom: 8 }}>LAST 6 MONTHS · COLLECTED</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, alignItems: 'end', height: 90 }}>
              {months6.map(([m, v], i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4, height: '100%' }}>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end' }}>
                    <div style={{ width: '100%', height: `${Math.round(v / barMax * 100)}%`, background: C.ac }} title={`${m} · ₪${num(v)}`} />
                  </div>
                  <div style={{ textAlign: 'center', fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: '0.08em', fontWeight: 700 }}>{m}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Tasks mini-board — mirrors the real DashboardView's NotesWidget status
          columns (To Do / In Progress / Waiting / Stuck) so the demo dashboard
          shows the tasks-at-a-glance feature. */}
      <div style={{ border: `1px solid ${C.cardBd}`, marginBottom: 20 }}>
        <div style={{ background: C.ac, color: '#FFFFFF', padding: '8px 14px', fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em' }}>
          TASKS ({DEMO_TASKS.filter(t => t.status !== 'done').length})
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: 10 }}>
          {STATUS_COLS.slice(0, 4).map(col => {
            const rows = DEMO_TASKS.filter(t => t.status === col.id);
            return (
              <div key={col.id} style={{ flex: '1 1 150px', minWidth: 140, border: `1px solid ${C.cardBd}`, display: 'flex', flexDirection: 'column' }}>
                <div style={{ background: col.color, color: '#FFFFFF', padding: '5px 8px', fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>{col.label}</span><span style={{ opacity: 0.85 }}>{rows.length}</span>
                </div>
                <div style={{ padding: 4, display: 'flex', flexDirection: 'column', gap: 4, minHeight: 40 }}>
                  {rows.map(t => {
                    const meta = TASK_SRC[t.src];
                    return (
                      <div key={t.id} style={{ border: `1px solid ${C.cardBd}`, borderLeft: `3px solid ${meta.color}`, padding: '5px 7px', fontFamily: FB, fontSize: 11, lineHeight: 1.3, color: C.tx }}>{t.title}</div>
                    );
                  })}
                  {rows.length === 0 && <div style={{ padding: '6px 4px', textAlign: 'center', color: C.td, fontSize: 9, fontFamily: FN }}>—</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Alert grid — same shape as the real DashboardView. Overdue + Leads
          are stacked vertically as one cell so leads sits directly beneath
          overdue; dormant + online + expiring fill the remaining tracks. */}
      <div style={{
        display: 'grid', gap: 14, marginBottom: 20, alignItems: 'start',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))',
      }}>
        {onlineNow.length > 0 && (
          <Panel
            title={<span><span style={{ color: C.gn }}></span> ONLINE NOW ({onlineNow.length})</span>}
            tint={C.gn}
          >
            {onlineNow.map(t => (
              <Row key={t.id} onClick={() => onJumpToTrainee(t.id, 'dashboard')}>
                <span style={{ fontWeight: 600, color: C.tx, flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {t.name}<OnlineDot />
                </span>
                <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, color: C.td, letterSpacing: 1 }}>IN PORTAL</span>
                <FakeWaButton />
              </Row>
            ))}
          </Panel>
        )}

        {expiring.length > 0 && (
          <Panel
            title={<span><span style={{ color: C.or }}>⏳</span> EXPIRING SESSIONS ({expiring.length})</span>}
            tint={C.or}
          >
            {expiring.map(t => (
              <Row key={t.id} onClick={() => onJumpToTrainee(t.id, 'dashboard')}>
                <span style={{ fontWeight: 600, color: C.tx, flex: 1 }}>{t.name}</span>
                <span style={{ fontFamily: FN, fontSize: 11, color: C.or, fontWeight: 700, letterSpacing: 1 }}>
                  {t.sessionsLeft} LEFT
                </span>
              </Row>
            ))}
          </Panel>
        )}

        {/* Stacked column: overdue on top, leads directly below — mirrors
            the real DashboardView grouping so the inbound funnel lives
            next to the money-out queue. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Panel
            title={<span><span style={{ color: C.rd }}></span> OVERDUE PAYMENT ({overdue.length})</span>}
            tint={C.rd}
          >
            {overdue.map((t, i) => (
              <Row key={t.id} onClick={() => onJumpToTrainee(t.id, 'dashboard')}>
                <span style={{ fontWeight: 600, color: C.tx, flex: 1 }}>{t.name}</span>
                <span style={{ fontFamily: FN, fontSize: 11, color: C.rd, fontWeight: 700, letterSpacing: 1 }}>
                  {i === 0 ? 'NEVER PAID' : `${(i+1)*32}D OVERDUE`}
                </span>
              </Row>
            ))}
          </Panel>

          <Panel
            title={<span><span style={{ color: C.ac }}></span> NEW LEADS (3)</span>}
            tint={C.ac}
          >
            {[
              { email: 'avi.shahar@example.co.il',  source: 'coaches',  context: 'pricing CTA',   when: '32 min ago', coach: true },
              { email: 'maor.k@example.co.il',      source: 'expo-il',  context: 'exit-intent',  when: '4 hr ago' },
              { email: 'tomer.ben@example.co.il',   source: 'expo-il',  context: 'quiz-finish',  when: 'Yesterday' },
            ].map((l, i) => (
              <Row key={i}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    {l.coach && <span style={{ fontFamily: FN, fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', color: '#A855F7', border: '1px solid #A855F7', padding: '1px 5px', flexShrink: 0 }}>COACH</span>}
                    <div style={{ fontWeight: 600, color: C.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.email}</div>
                  </div>
                  <div style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, color: C.tm, letterSpacing: 1 }}>{l.source.toUpperCase()} · {l.context.toUpperCase()}</div>
                </div>
                <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, color: C.td, letterSpacing: 1, marginRight: 8 }}>{l.when}</span>
                <button onClick={e => e.stopPropagation()} title="Mark contacted (demo only)" style={{ background: 'var(--c-sf)', border: `1px solid ${C.gn}`, color: C.gn, borderRadius: 0, padding: '2px 7px', fontFamily: FN, fontSize: 10, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>✓</button>
                <button onClick={e => e.stopPropagation()} title="Delete lead (demo only)" style={{ background: 'var(--c-sf)', border: `1px solid ${C.rd}`, color: C.rd, borderRadius: 0, padding: '2px 7px', fontFamily: FN, fontSize: 10, fontWeight: 700, cursor: 'pointer', marginLeft: 4, flexShrink: 0 }}>✕</button>
              </Row>
            ))}
          </Panel>
        </div>

        <Panel
          title={<span><span style={{ color: C.tm }}></span> DORMANT ({dormant.length})</span>}
          tint={C.tm}
        >
          {dormant.map(t => (
            <Row key={t.id} onClick={() => onJumpToTrainee(t.id, 'dashboard')}>
              <span style={{ fontWeight: 600, color: C.tx, flex: 1 }}>{t.name}</span>
              <span style={{ fontFamily: FN, fontSize: 11, color: C.tm, fontWeight: 700, letterSpacing: 1 }}>
                {t.dormantDays}D
              </span>
              <FakeWaButton />
            </Row>
          ))}
        </Panel>
      </div>

      {/* Client roster table — same shape as the real DashboardView's
          sortable client list. Border is 0.25px ac-dimmed, headers are
          10px FN with 0.05em tracking, body rows hover-tinted. */}
      <div style={{
        background: C.sf, border: `1px solid ${C.cardBd}`, borderRadius: 0,
        overflowX: 'auto', marginBottom: 8,
      }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: FB, fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${C.bd}` }}>
                {['Athlete', 'Status', 'Format', 'Package', 'Sessions', 'Total Paid', 'Last Payment', 'Workouts', 'Programs'].map(h => (
                  <th key={h} style={{
                    textAlign: 'center', padding: '10px 12px',
                    fontSize: 10, fontFamily: FN, color: C.td, textTransform: 'uppercase', letterSpacing: '0.05em',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MOCK_TRAINEES.map((t, i) => {
                const totalPaid = (t.monthly || 0) * (t.payment === 'OVERDUE' ? 2 : 3);
                const lastPay = t.payment === 'OVERDUE' ? '2026-03-01' : '2026-04-01';
                const workouts = t.dormantDays != null ? 4 : 12;
                return (
                  <tr key={t.id} onClick={() => onJumpToTrainee(t.id, 'dashboard')}
                    onMouseEnter={e => e.currentTarget.style.background = C.sf2}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    style={{ borderBottom: `1px solid ${C.bd}`, cursor: 'pointer', transition: 'background 0.1s' }}>
                    <td style={{ padding: '12px', fontWeight: 600, color: C.tx }}>{t.name}</td>
                    <td style={{ padding: '12px' }}><Badge color={t.dormantDays != null ? C.tm : C.gn}>{t.status}</Badge></td>
                    <td style={{ padding: '12px', color: C.tm, fontSize: 12 }}>{t.format}</td>
                    <td style={{ padding: '12px', color: C.tm, fontSize: 12 }}>{t.isCouple ? '12 Sessions' : '8 Sessions'}</td>
                    <td style={{ padding: '12px' }}><span style={{ fontFamily: FN, fontWeight: 700, fontSize: 14, color: t.sessionsLeft <= 2 ? C.rd : C.gn }}>{t.sessionsLeft}</span></td>
                    <td style={{ padding: '12px', fontFamily: FN, fontWeight: 600, color: C.gn }}>₪{totalPaid.toLocaleString()}</td>
                    <td style={{ padding: '12px', color: t.payment === 'OVERDUE' ? C.rd : C.tm, fontSize: 12 }}>{lastPay}</td>
                    <td style={{ padding: '12px', fontFamily: FN, color: C.ac }}>{workouts}</td>
                    <td style={{ padding: '12px', fontFamily: FN, color: C.ac }}>{t.programs}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
      </div>
    </section>
  );
}

// Matches real DashboardView alert panel: tinted hairline border, 10px
// radius, no separate header band — title is just an FN line at the top
// of the panel padding so the panel feels lighter and matches the real
// DashboardView's `border: 1px solid {tint}30` style.
function Panel({ title, tint, children }) {
  return (
    <div style={{
      background: C.sf, border: `1px solid ${tint}30`, borderRadius: 0,
      padding: '14px 18px',
    }}>
      <div style={{
        fontSize: 10, fontFamily: FN, color: tint, textTransform: 'uppercase',
        letterSpacing: '0.05em', fontWeight: 700, marginBottom: 8,
      }}>{title}</div>
      <div>{children}</div>
    </div>
  );
}

// Real DashboardView alert rows are flat 6px-padded lines with no separator
// — the panel itself is the bounded chrome. Mirror that here so the demo
// panels read identically to the real ones.
function Row({ onClick, children }) {
  return (
    <div onClick={onClick} style={{
      padding: '6px 0', display: 'flex', alignItems: 'center', gap: 8,
      cursor: onClick ? 'pointer' : 'default', fontSize: 13,
    }}>{children}</div>
  );
}

function FakeWaButton() {
  return (
    <button onClick={e => { e.stopPropagation(); }} title="Send WhatsApp check-in" style={{
      background: '#25d36620', border: `1px solid #25d36655`, color: '#25d366',
      borderRadius: 0, padding: '4px 6px', cursor: 'pointer',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="#25d366" aria-hidden="true">
        <path d="M19.05 4.91A9.82 9.82 0 0 0 12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.91-7.01zM12.04 20.15h-.01a8.23 8.23 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.18 8.18 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.19 8.19 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.24 8.23z"/>
      </svg>
    </button>
  );
}

// ─── Tab: Trainees ────────────────────────────────────────────────────────
function DemoTrainees({ selected, onSelect, onClear, returnTab }) {
  const [search, setSearch] = useState('');
  if (selected) {
    const t = MOCK_TRAINEES.find(x => x.id === selected);
    if (!t) return null;
    return <DemoTraineeDetail trainee={t} onBack={onClear} backLabel="← BACK" />;
  }
  const q = search.trim().toLowerCase();
  const filtered = MOCK_TRAINEES.filter(t => {
    if (!q) return true;
    const haystack = `${t.name || ''} ${t.email || ''} ${t.format || ''}`.toLowerCase();
    return haystack.includes(q);
  });
  return (
    <section>
      <div style={{
        display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14,
      }}>
        <input
          type="search" value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, email, format…"
          style={{
            background: C.sf, border: `1px solid ${C.bd2}`, borderRadius: 0,
            padding: '8px 12px', color: C.tx, fontFamily: FB, fontSize: 13,
            outline: 'none', minWidth: 200, flex: '1 1 200px', maxWidth: 320,
          }}
        />
        <button title="Demo only" style={{
          ...baseBtn, background: 'transparent', color: C.tm,
          border: `1px solid ${C.bd}`, padding: '8px 14px', fontSize: 11,
        }}>📦 ARCHIVE (0)</button>
        <button title="Demo only" style={{
          ...baseBtn, background: C.ac, color: C.acOnSurface,
          padding: '8px 14px', fontSize: 11,
        }}>+ ADD ATHLETE ▾</button>
        <span style={{
          fontFamily: FN, fontSize: 10, fontWeight: 700, color: C.td, letterSpacing: 1.5,
        }}>{filtered.length} / {MOCK_TRAINEES.length}</span>
      </div>
      {filtered.length === 0 ? (
        <div style={{
          background: C.sf, border: `1px dashed ${C.bd2}`, borderRadius: 0,
          padding: 40, textAlign: 'center',
        }}>
          <div style={{ fontFamily: FN, fontSize: 11, color: C.td, letterSpacing: 2, fontWeight: 700, marginBottom: 8 }}>NO MATCHES</div>
          <div style={{ fontFamily: FB, fontSize: 13, color: C.tm }}>No athlete matches "<span style={{ color: C.tx, fontWeight: 700 }}>{search}</span>". Clear the search to see the full roster.</div>
        </div>
      ) : (
        <div style={{
          display: 'grid', gap: 12,
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))',
        }}>
          {filtered.map(t => (
            <TraineeCard key={t.id} t={t} onClick={() => onSelect(t.id)} />
          ))}
        </div>
      )}
    </section>
  );
}

// Tiny BW sparkline for cards — same shape as the real-app card sparkline.
// Generates 8 deterministic points off the trainee's baseline weight so
// each card has a stable trend without backing data. Real app pulls from
// bw_logs.
function MiniBWSparkline({ weight }) {
  if (!weight) return null;
  const seed = Math.floor(weight);
  const points = Array.from({ length: 8 }, (_, i) => {
    const trend = -i * 0.18;
    const wobble = Math.sin(seed + i * 1.7) * 1.2;
    return weight + trend + wobble;
  });
  const W = 96, H = 22, PAD = 2;
  const min = Math.min(...points) - 0.3;
  const max = Math.max(...points) + 0.3;
  const span = max - min;
  const xStep = (W - PAD * 2) / (points.length - 1);
  const polyline = points.map((v, i) => {
    const x = PAD + i * xStep;
    const y = PAD + (1 - (v - min) / span) * (H - PAD * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const last = points[points.length - 1];
  const delta = last - points[0];
  const deltaColor = delta < 0 ? C.gn : delta > 0 ? C.or : C.tm;
  // Layout: kg + delta hold their natural widths; the sparkline svg fills
  // the leftover space and shrinks (preserveAspectRatio=none) when the
  // parent column is too narrow — needed for couple-member columns where
  // a fixed 96px svg would push the delta outside the card.
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
        style={{ display: 'block', height: H, width: '100%', maxWidth: W, minWidth: 32, flexShrink: 1 }}
        aria-hidden="true">
        <polyline points={polyline} fill="none" stroke={C.ac} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: 1, color: C.tx, flexShrink: 0 }}>
        {last.toFixed(1)}<span style={{ color: C.tm }}>kg</span>
      </span>
      <span style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: 1, color: deltaColor, flexShrink: 0 }}>
        {delta > 0 ? '+' : ''}{delta.toFixed(1)}
      </span>
    </div>
  );
}

// Card layout uses 4 labeled blocks: IDENTITY (who) · TRAINING (relationship)
// · BODYWEIGHT (one living metric) · FINANCIALS (revenue risk). Each block
// answers one scan question, separated by a thin hairline so the eye anchors
// on labels rather than parsing a single dense row.

function CardSection({ label, children, center = false, dense = false }) {
  return (
    <div style={{ marginTop: dense ? 8 : 12, paddingTop: dense ? 8 : 10, borderTop: `1px solid rgba(57,189,255,0.149)` }}>
      <div style={{
        fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: 1.5, fontWeight: 700,
        textTransform: 'uppercase', marginBottom: 6,
        textAlign: center ? 'center' : 'left',
      }}>{label}</div>
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: '4px 10px', alignItems: 'center',
        justifyContent: center ? 'center' : 'flex-start',
      }}>{children}</div>
    </div>
  );
}

function CardSectionFirst({ children, center = false }) {
  // Same shape as CardSection minus the top border — used for the first
  // (IDENTITY) block so the card doesn't start with a divider line.
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 4,
      alignItems: center ? 'center' : 'stretch',
    }}>{children}</div>
  );
}

function MidDot() {
  return <span style={{ color: C.tm, opacity: 0.5, fontSize: 11 }}>·</span>;
}

function TrainingBlock({ t, center = false }) {
  // Two fixed rows so card structure is uniform regardless of text length:
  //   row 1 — FORMAT · SESSIONS LEFT
  //   row 2 — N PROGRAMS
  //   row 3 (optional) — LAST WORKOUT · ...
  // Programs always starts on its own row even when there's space on row 1,
  // so neighbouring cards line up vertically.
  const justify = center ? 'center' : 'flex-start';
  return (
    <CardSection label="Training" center={center}>
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', alignItems: 'center', justifyContent: justify }}>
          <span style={{ fontFamily: FN, fontSize: 11, color: C.tm, letterSpacing: 1, fontWeight: 700, textTransform: 'uppercase' }}>{t.format}</span>
          <MidDot />
          <span style={{ fontFamily: FN, fontSize: 11, color: t.sessionsLeft <= 2 ? C.rd : C.gn, fontWeight: 700 }}>{t.sessionsLeft} SESSIONS LEFT</span>
        </div>
        <div style={{ display: 'flex', justifyContent: justify }}>
          <span style={{ fontFamily: FN, fontSize: 11, color: C.ac, fontWeight: 700 }}>{t.programs} PROGRAMS</span>
        </div>
        {t.lastWorkout && (
          <div style={{ fontFamily: FN, fontSize: 10, color: C.tm, letterSpacing: 1, fontWeight: 600, textAlign: center ? 'center' : 'left' }}>
            LAST WORKOUT · {t.lastWorkout.toUpperCase()}
          </div>
        )}
      </div>
    </CardSection>
  );
}

function FinancialsBlock({ t, center = false }) {
  // Always render — empty trainees still show a "NOT BILLABLE" placeholder
  // so cards line up section-for-section across the grid.
  const items = [];
  if (t.payment === 'OVERDUE') {
    items.push(<span key="ov" style={{ fontFamily: FN, fontSize: 11, color: C.rd, fontWeight: 700, letterSpacing: 1 }}>OVERDUE · 34D</span>);
  } else if (t.payment === 'PAID') {
    items.push(<span key="pd" style={{ fontFamily: FN, fontSize: 11, color: C.gn, fontWeight: 700, letterSpacing: 1 }}>PAID · 12D AGO</span>);
  }
  if (t.monthly > 0) {
    items.push(<span key="mo" style={{ fontFamily: FN, fontSize: 11, color: C.td, fontWeight: 700, letterSpacing: 1 }}>₪{t.monthly}/MO</span>);
  }
  if (t.dormantDays != null) {
    items.push(<span key="dm" style={{ fontFamily: FN, fontSize: 11, color: C.tm, fontWeight: 700, letterSpacing: 1 }}>DORMANT · {t.dormantDays}D</span>);
  }
  if (items.length === 0) {
    return (
      <CardSection label="Financials" center={center}>
        <span style={{ fontFamily: FN, fontSize: 11, color: C.tm, fontWeight: 700, letterSpacing: 1, opacity: 0.55 }}>NOT BILLABLE</span>
      </CardSection>
    );
  }
  const interleaved = items.flatMap((n, i) => i === 0 ? [n] : [<MidDot key={`d${i}`} />, n]);
  return <CardSection label="Financials" center={center}>{interleaved}</CardSection>;
}

function BodyweightBlock({ weight, center = false }) {
  if (!weight) return null;
  return (
    <CardSection label="Bodyweight" center={center}>
      <div style={{ width: '100%', display: 'flex', justifyContent: center ? 'center' : 'flex-start' }}>
        <div style={{ width: '100%', maxWidth: 220 }}>
          <MiniBWSparkline weight={weight} />
        </div>
      </div>
    </CardSection>
  );
}

const cardStyle = {
  background: C.sf, border: `1px solid ${C.cardBd}`, borderRadius: 0,
  padding: 18, cursor: 'pointer', transition: 'all 0.2s',
  // height:100% makes every card stretch to the tallest in its grid row,
  // so a row of 1 single + 1 couple lines up flush. flex-column lets future
  // bottom-pinned controls (edit, footer) use marginTop:auto.
  height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box',
};
const cardEnter = (e) => { e.currentTarget.style.borderColor = C.ac; e.currentTarget.style.background = C.sf2; };
const cardLeave = (e) => { e.currentTarget.style.borderColor = C.cardBd; e.currentTarget.style.background = C.sf; };

function TraineeCard({ t, onClick }) {
  if (t.isCouple) return <CoupleCard t={t} onClick={onClick} />;
  return (
    <div onClick={onClick} style={cardStyle} onMouseEnter={cardEnter} onMouseLeave={cardLeave}>
      {/* IDENTITY — name centered as the card banner; status badge + WA
          button on a centered row beneath; email + phone centered below. */}
      <CardSectionFirst center>
        <div style={{ fontFamily: FB, fontWeight: 700, fontSize: 15, color: C.tx, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, textAlign: 'center' }}>
          {t.name}{t.online && <OnlineDot />}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10 }}>
          <Badge color={t.dormantDays != null ? C.tm : C.gn}>{t.status}</Badge>
          <FakeWaButton />
        </div>
        <div style={{
          fontSize: 12, color: C.tm, marginTop: 4, textAlign: 'center',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%',
        }}>{t.email}</div>
        {t.phone && (
          <div style={{ fontFamily: FN, fontSize: 11, color: C.tm, marginTop: 2, letterSpacing: 0.5, textAlign: 'center' }}>
            {t.phone}
          </div>
        )}
      </CardSectionFirst>
      <FinancialsBlock t={t} center />
      <TrainingBlock t={t} center />
      <BodyweightBlock weight={t.weight} center />
    </div>
  );
}

// 8-week bodyweight sparkline — mocked relative-to-baseline so the curve is
// proportionate to the trainee's actual weight. Real app pulls from bw_logs.
function BWSparkline({ weight }) {
  // Generate 8 deterministic points around the baseline weight: small wobble
  // ±1.5kg with a gentle downward trend over the 8 weeks. Deterministic so
  // re-renders don't reshuffle the chart.
  const seed = Math.floor(weight);
  const W = 8;
  const points = Array.from({ length: W }, (_, i) => {
    const trend = -i * 0.18; // gentle cut over 8w
    const wobble = Math.sin(seed + i * 1.7) * 1.2;
    return weight + trend + wobble;
  });
  const min = Math.min(...points) - 0.5;
  const max = Math.max(...points) + 0.5;
  const span = max - min || 1;
  const w = 320, h = 80, pad = 8;
  const xStep = (w - pad * 2) / (W - 1);
  const polyline = points.map((v, i) => {
    const x = pad + i * xStep;
    const y = h - pad - ((v - min) / span) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const last = points[points.length - 1];
  const lastX = pad + (W - 1) * xStep;
  const lastY = h - pad - ((last - min) / span) * (h - pad * 2);
  const delta = (last - points[0]).toFixed(1);
  return (
    <div style={{ padding: 14 }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6,
      }}>
        <span style={{ fontFamily: FB, fontSize: 22, fontWeight: 700, color: C.tx, letterSpacing: -0.3 }}>
          {last.toFixed(1)}<span style={{ fontSize: 13, color: C.tm, marginLeft: 2 }}>kg</span>
        </span>
        <span style={{
          fontFamily: FN, fontSize: 11, color: parseFloat(delta) <= 0 ? C.gn : C.or, letterSpacing: 1, fontWeight: 700,
        }}>{parseFloat(delta) > 0 ? '+' : ''}{delta} kg / 8W</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 80, display: 'block' }} aria-label="Bodyweight 8-week sparkline">
        <polyline fill="none" stroke={C.ac} strokeWidth="2" points={polyline} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={lastX} cy={lastY} r="3.5" fill={C.ac} />
      </svg>
    </div>
  );
}

function CoupleCard({ t, onClick }) {
  // Split "יעל ועידן כהן" → ["יעל", "עידן", surname "כהן"]. Falls back to a
  // single column if the name doesn't parse — better to show one row than
  // crash on an unfamiliar name shape.
  const parseCouple = (full) => {
    const m = (full || '').match(/^(.+?)\s+ו(.+?)\s+(\S+)$/);
    if (!m) return null;
    return { a: m[1], b: m[2], surname: m[3] };
  };
  const parsed = parseCouple(t.name);
  // Per-member identity facts (emails / phones / weights) match the split in
  // DemoTraineeDetail so the card and the detail view stay consistent.
  const memberMeta = [
    { email: 'yael.cohen@example.co.il', phone: '+972503334455', weight: 62 },
    { email: 'idan.cohen@example.co.il', phone: '+972503334456', weight: 82 },
  ];
  return (
    <div onClick={onClick} style={cardStyle} onMouseEnter={cardEnter} onMouseLeave={cardLeave}>
      {/* IDENTITY — combined name banner (centered) + status badge centered
          below + per-member sub-columns underneath. Each member's contact
          details (name, email, phone, WA) live together in their own column
          so a coach reading "who do I message" doesn't jump back and forth
          across the divider. */}
      <CardSectionFirst center>
        <div style={{ fontFamily: FB, fontWeight: 700, fontSize: 14, color: C.tx, textAlign: 'center' }}>{t.name}</div>
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 10 }}>
          <Badge color={t.dormantDays != null ? C.tm : C.gn}>{t.status}</Badge>
        </div>
        {parsed && (
          <div style={{ display: 'flex', marginTop: 8, width: '100%', alignSelf: 'stretch' }}>
            {[parsed.a, parsed.b].map((member, mi) => (
              <React.Fragment key={mi}>
                {mi === 1 && <div style={{ width: 1, background: C.bd, margin: '0 12px', alignSelf: 'stretch' }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{
                      fontFamily: FB, fontWeight: 600, fontSize: 13, color: C.tx,
                      flex: 1, minWidth: 0,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>{member} {parsed.surname}</div>
                    <FakeWaButton />
                  </div>
                  <div style={{
                    fontSize: 11, color: C.tm, marginTop: 2,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>{memberMeta[mi].email}</div>
                  <div style={{
                    fontFamily: FN, fontSize: 10, fontWeight: 700, color: C.tm, marginTop: 2, letterSpacing: 0.5,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>{memberMeta[mi].phone}</div>
                </div>
              </React.Fragment>
            ))}
          </div>
        )}
      </CardSectionFirst>

      <FinancialsBlock t={t} center />
      <TrainingBlock t={t} center />

      {/* BODYWEIGHT — per member, since each has their own curve. Centered
          and split into two mini blocks under one shared label. */}
      <CardSection label="Bodyweight" center>
        {parsed && [parsed.a, parsed.b].map((member, mi) => (
          <div key={mi} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div style={{ fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: 1, fontWeight: 700 }}>{member.toUpperCase()}</div>
            <div style={{ width: '100%', maxWidth: 160 }}>
              <MiniBWSparkline weight={memberMeta[mi].weight} />
            </div>
          </div>
        ))}
      </CardSection>
    </div>
  );
}

// Interactive status menu for the demo trainee detail — clicking actually
// changes the (local) status so a prospect can demo a status change. Mirrors
// the real TraineeDetail StatusMenu.
function DemoStatusMenu() {
  const [status, setStatus] = useState('Active');
  const [open, setOpen] = useState(false);
  const COLORS = { Active: C.gn, 'On Hold': C.or, Inactive: C.td, Trial: C.ac };
  const color = COLORS[status] || C.tm;
  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <button onClick={() => setOpen(o => !o)} title="Change status" style={{ ...baseBtn, height: 34, boxSizing: 'border-box', background: 'transparent', border: `1px solid ${color}`, color, padding: '0 12px', fontSize: 11, letterSpacing: '0.12em', display: 'inline-flex', alignItems: 'center', gap: 6 }}>{status.toUpperCase()} <span style={{ fontSize: 9, transform: open ? 'rotate(180deg)' : 'none' }}>▾</span></button>
      {open && (
        <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 60, background: C.bg, border: `1px solid ${C.cardBd}`, minWidth: 124 }}>
          {['Active', 'On Hold', 'Inactive', 'Trial'].map(s => (
            <button key={s} onClick={() => { setStatus(s); setOpen(false); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', background: s === status ? C.acD : 'transparent', border: 'none', borderLeft: `3px solid ${s === status ? (COLORS[s] || C.ac) : 'transparent'}`, color: COLORS[s] || C.tx, fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}>{s}</button>
          ))}
        </div>
      )}
    </span>
  );
}

function DemoTraineeDetail({ trainee, onBack, backLabel = '← BACK' }) {
  // Couple detail: split each member into their own card column. Real app's
  // ruling — SHARED for the household: format, package, sessions, monthly,
  // per-session, last payment, since, payments ledger, programs (assigned
  // to parent), recent in-person workouts. PER MEMBER: name, email, phone,
  // age/weight/height, BW log, goals, injuries.
  const isCouple = !!trainee.isCouple;
  const coupleSplit = (() => {
    if (!isCouple) return null;
    const m = (trainee.name || '').match(/^(.+?)\s+ו(.+?)\s+(\S+)$/);
    if (!m) return null;
    return [
      { first: m[1], surname: m[3], email: 'yael.cohen@example.co.il', phone: '+972503334455', age: 33, weight: 62, height: 168, goals: 'First chin-up by August',          injuries: 'None' },
      { first: m[2], surname: m[3], email: 'idan.cohen@example.co.il', phone: '+972503334456', age: 37, weight: 82, height: 182, goals: 'Body comp + bench plateau break', injuries: 'L knee — meniscus 2024' },
    ];
  })();
  return (
    <section>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 18 }}>
        <button onClick={onBack} style={{
          ...baseBtn, background: 'transparent', color: C.tm,
          border: `1px solid ${C.bd}`,
        }}>{backLabel}</button>
        <div style={{ flex: 1 }} />
        {/* Interactive status menu — actually changes (local) status so the
            prospect can demo a status change, like the real TraineeDetail. */}
        <DemoStatusMenu />
        {/* Action affordances on the trainee detail. Same set of operations
            as the real coach app's TraineeDetail (Assign Plan / Add Payment /
            Edit / Archive). Demo-only — clicks are no-ops, button.disabled
            tooltips them as "demo-only" so the visitor knows. */}
        <button title="Demo only" style={{
          ...baseBtn, background: C.ac, color: C.acOnSurface,
          padding: '8px 14px', fontSize: 11,
        }}>+ ASSIGN PLAN</button>
        <button title="Demo only" style={{
          ...baseBtn, background: 'transparent', color: C.tx,
          border: `1px solid ${C.bd}`, padding: '8px 14px', fontSize: 11,
        }}>+ ADD PAYMENT</button>
        <button title="Demo only" style={{
          ...baseBtn, background: 'transparent', color: C.tm,
          border: `1px solid ${C.bd}`, padding: '8px 14px', fontSize: 11,
        }}>EDIT</button>
        <button title="Demo only" style={{
          ...baseBtn, background: 'transparent', color: C.rd,
          border: `1px solid rgba(255,71,87,0.251)`, padding: '8px 14px', fontSize: 11,
        }}>📦 ARCHIVE</button>
      </div>

      {/* Couple branch: per-member columns first (name/email/phone/age/
          weight/height/goals/injuries/BW), then a row of SHARED panels
          below (Household terms, Programs, Payments, Recent Workouts). */}
      {isCouple && coupleSplit ? <>
        <h2 style={{ fontFamily: FB, fontSize: 24, fontWeight: 700, margin: '0 0 4px', letterSpacing: -0.3 }}>{trainee.name}</h2>
        <div style={{ fontFamily: FN, fontSize: 12, color: C.tm, letterSpacing: 1, marginBottom: 14 }}>{trainee.format} · {trainee.phone}</div>

        <div style={{
          display: 'grid', gap: 14, marginBottom: 14,
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))',
        }}>
          {coupleSplit.map((m, i) => (
            <div key={i}>
              <div style={{
                background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 0,
                padding: 14, marginBottom: 14,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <div style={{ fontFamily: FB, fontWeight: 700, fontSize: 16, color: C.tx }}>{m.first} {m.surname}</div>
                  <FakeWaButton />
                </div>
                <div style={{ fontFamily: FN, fontSize: 11, color: C.tm, letterSpacing: 1, marginBottom: 12 }}>{m.email} · {m.phone}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, textAlign: 'center', marginBottom: 12 }}>
                  {[['AGE', `${m.age}y`], ['WEIGHT', `${m.weight}kg`], ['HEIGHT', `${m.height}cm`]].map(([l, v]) => (
                    <div key={l}>
                      <div style={{ fontFamily: FN, fontSize: 9, color: C.td, letterSpacing: 1.5, fontWeight: 700 }}>{l}</div>
                      <div style={{ fontFamily: FB, fontSize: 14, color: C.tx, fontWeight: 600, marginTop: 2 }}>{v}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontFamily: FN, fontSize: 10, color: C.ac, letterSpacing: 1.5, fontWeight: 700, marginBottom: 4 }}>GOAL</div>
                  <div style={{ fontFamily: FB, fontSize: 13, color: C.tx, opacity: 0.85, lineHeight: 1.45 }}>{m.goals}</div>
                </div>
                <div>
                  <div style={{ fontFamily: FN, fontSize: 10, color: C.or, letterSpacing: 1.5, fontWeight: 700, marginBottom: 4 }}>INJURIES</div>
                  <div style={{ fontFamily: FB, fontSize: 13, color: C.tx, opacity: 0.85, lineHeight: 1.45 }}>{m.injuries}</div>
                </div>
              </div>
              <Panel title={`${m.first.toUpperCase()} · BODYWEIGHT · 8W`} tint={C.tm}>
                <BWSparkline weight={m.weight} />
              </Panel>
            </div>
          ))}
        </div>

        {/* SHARED panels — one row, full width */}
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))' }}>
          <Panel title="SHARED · HOUSEHOLD TERMS" tint={C.tm}>
            <Row><span style={{ flex: 1, color: C.tm, fontSize: 11, fontFamily: FN, letterSpacing: 1 }}>FORMAT</span><span style={{ color: C.tx, fontWeight: 600 }}>{trainee.format}</span></Row>
            <Row><span style={{ flex: 1, color: C.tm, fontSize: 11, fontFamily: FN, letterSpacing: 1 }}>PACKAGE</span><span style={{ color: C.tx, fontWeight: 600 }}>12 Sessions</span></Row>
            <Row><span style={{ flex: 1, color: C.tm, fontSize: 11, fontFamily: FN, letterSpacing: 1 }}>SESSIONS</span><span style={{ color: trainee.sessionsLeft <= 2 ? C.rd : C.tx, fontWeight: 700 }}>{trainee.sessionsLeft} LEFT</span></Row>
            <Row><span style={{ flex: 1, color: C.tm, fontSize: 11, fontFamily: FN, letterSpacing: 1 }}>MONTHLY</span><span style={{ color: C.tx, fontWeight: 600 }}>₪{trainee.monthly}</span></Row>
            <Row><span style={{ flex: 1, color: C.tm, fontSize: 11, fontFamily: FN, letterSpacing: 1 }}>PER SESSION</span><span style={{ color: C.tx, fontWeight: 600 }}>₪{Math.round(trainee.monthly / 12)}</span></Row>
            <Row><span style={{ flex: 1, color: C.tm, fontSize: 11, fontFamily: FN, letterSpacing: 1 }}>LAST PAYMENT</span><span style={{ color: C.tx, fontWeight: 600 }}>2026-04-01</span></Row>
            <Row><span style={{ flex: 1, color: C.tm, fontSize: 11, fontFamily: FN, letterSpacing: 1 }}>SINCE</span><span style={{ color: C.tx, fontWeight: 600 }}>{trainee.startDate}</span></Row>
          </Panel>

          <Panel title="SHARED · PROGRAMS" tint={C.ac}>
            {trainee.plans.map((name, i) => (
              <Row key={i}>
                <span style={{ flex: 1, color: C.tx, fontWeight: 600 }}>{name}</span>
                <Badge color={i === 0 ? C.gn : C.td}>{i === 0 ? 'ACTIVE' : 'ARCHIVED'}</Badge>
              </Row>
            ))}
          </Panel>

          <Panel title={<span>SHARED · PAYMENTS (3) <span style={{ color: C.gn, marginLeft: 8 }}>₪{(trainee.monthly * 3).toLocaleString()} TOTAL</span></span>} tint={C.ac}>
            {[
              { date: '2026-04-01', method: 'Bank Transfer' },
              { date: '2026-03-01', method: 'Bank Transfer' },
              { date: '2026-02-01', method: 'Cash' },
            ].map((p, i) => (
              <Row key={i}>
                <span style={{ flex: 1, color: C.tx, fontWeight: 600 }}>₪{trainee.monthly}</span>
                <span style={{ fontFamily: FN, fontSize: 11, color: C.tm, letterSpacing: 1 }}>{p.method.toUpperCase()}</span>
                <span style={{ fontFamily: FN, fontSize: 11, color: C.tm, letterSpacing: 1 }}>{p.date}</span>
                <Badge color={C.gn}>PAID</Badge>
              </Row>
            ))}
          </Panel>

          <Panel title="SHARED · RECENT WORKOUTS" tint={C.ac}>
            {[
              { day: 'Day A · Push', date: trainee.lastWorkout || '2 days ago', vol: '4,820 kg' },
              { day: 'Day C · Legs', date: '5 days ago', vol: '6,210 kg' },
              { day: 'Day B · Pull', date: '1 week ago', vol: '4,180 kg' },
            ].map((w, i) => (
              <Row key={i}>
                <span style={{ flex: 1, color: C.tx, fontWeight: 600 }}>{w.day}</span>
                <span style={{ fontFamily: FN, fontSize: 11, color: C.tm, letterSpacing: 1 }}>{w.date}</span>
                <span style={{ fontFamily: FN, fontSize: 11, color: C.ac, fontWeight: 700, letterSpacing: 1 }}>{w.vol}</span>
              </Row>
            ))}
          </Panel>
        </div>
      </> : (
      <div style={{
        display: 'grid', gap: 14,
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))',
      }}>
        <div>
          <h2 style={{ fontFamily: FB, fontSize: 24, fontWeight: 700, margin: '0 0 4px', letterSpacing: -0.3 }}>{trainee.name}</h2>
          <div style={{ fontFamily: FN, fontSize: 12, color: C.tm, letterSpacing: 1, marginBottom: 14 }}>{trainee.email} · {trainee.phone}</div>

          <Panel title="PROGRAMS" tint={C.ac}>
            {trainee.plans.map((name, i) => (
              <Row key={i}>
                <span style={{ flex: 1, color: C.tx, fontWeight: 600 }}>{name}</span>
                <Badge color={i === 0 ? C.gn : C.td}>{i === 0 ? 'ACTIVE' : 'ARCHIVED'}</Badge>
              </Row>
            ))}
          </Panel>

          <div style={{ height: 14 }} />

          {(() => {
            const isOverdue = trainee.payment === 'OVERDUE';
            const payments = [
              !isOverdue && { date: '2026-04-01', amount: trainee.monthly || 800, method: 'Bank Transfer', status: 'Paid' },
              { date: '2026-03-01', amount: trainee.monthly || 800, method: 'Bank Transfer', status: 'Paid' },
              { date: '2026-02-01', amount: trainee.monthly || 800, method: 'Cash',          status: 'Paid' },
            ].filter(Boolean);
            const totalPaid = payments.reduce((a, p) => a + p.amount, 0);
            return (
              <Panel
                title={<span>PAYMENTS ({payments.length}) <span style={{ color: C.gn, marginLeft: 8 }}>₪{totalPaid.toLocaleString()} TOTAL</span></span>}
                tint={C.ac}
              >
                {payments.map((p, i) => (
                  <Row key={i}>
                    <span style={{ flex: 1, color: C.tx, fontWeight: 600 }}>₪{p.amount}</span>
                    <span style={{ fontFamily: FN, fontSize: 11, color: C.tm, letterSpacing: 1 }}>{p.method.toUpperCase()}</span>
                    <span style={{ fontFamily: FN, fontSize: 11, color: C.tm, letterSpacing: 1 }}>{p.date}</span>
                    <Badge color={C.gn}>{p.status.toUpperCase()}</Badge>
                  </Row>
                ))}
              </Panel>
            );
          })()}

          <div style={{ height: 14 }} />

          <Panel title="RECENT WORKOUTS" tint={C.ac}>
            {[
              { day: 'Day A · Push', date: trainee.lastWorkout || '2 days ago', vol: '4,820 kg' },
              { day: 'Day C · Legs', date: '5 days ago', vol: '6,210 kg' },
              { day: 'Day B · Pull', date: '1 week ago', vol: '4,180 kg' },
            ].map((w, i) => (
              <Row key={i}>
                <span style={{ flex: 1, color: C.tx, fontWeight: 600 }}>{w.day}</span>
                <span style={{ fontFamily: FN, fontSize: 11, color: C.tm, letterSpacing: 1 }}>{w.date}</span>
                <span style={{ fontFamily: FN, fontSize: 11, color: C.ac, fontWeight: 700, letterSpacing: 1 }}>{w.vol}</span>
              </Row>
            ))}
          </Panel>
        </div>

        <div>
          <Panel title="PROFILE" tint={C.tm}>
            {trainee.age && (
              <Row>
                <span style={{ flex: 1, color: C.tm, fontSize: 11, fontFamily: FN, letterSpacing: 1 }}>AGE / WEIGHT / HEIGHT</span>
                <span style={{ color: C.tx, fontWeight: 600 }}>{trainee.age}y · {trainee.weight}kg · {trainee.height}cm</span>
              </Row>
            )}
            <Row><span style={{ flex: 1, color: C.tm, fontSize: 11, fontFamily: FN, letterSpacing: 1 }}>FORMAT</span><span style={{ color: C.tx, fontWeight: 600 }}>{trainee.format}</span></Row>
            <Row><span style={{ flex: 1, color: C.tm, fontSize: 11, fontFamily: FN, letterSpacing: 1 }}>PACKAGE</span><span style={{ color: C.tx, fontWeight: 600 }}>8 Sessions</span></Row>
            <Row><span style={{ flex: 1, color: C.tm, fontSize: 11, fontFamily: FN, letterSpacing: 1 }}>SESSIONS</span><span style={{ color: trainee.sessionsLeft <= 2 ? C.rd : C.tx, fontWeight: 700 }}>{trainee.sessionsLeft} LEFT</span></Row>
            <Row><span style={{ flex: 1, color: C.tm, fontSize: 11, fontFamily: FN, letterSpacing: 1 }}>MONTHLY</span><span style={{ color: C.tx, fontWeight: 600 }}>₪{trainee.monthly}</span></Row>
            <Row><span style={{ flex: 1, color: C.tm, fontSize: 11, fontFamily: FN, letterSpacing: 1 }}>PER SESSION</span><span style={{ color: C.tx, fontWeight: 600 }}>₪{Math.round(trainee.monthly / 8)}</span></Row>
            <Row><span style={{ flex: 1, color: C.tm, fontSize: 11, fontFamily: FN, letterSpacing: 1 }}>LAST PAYMENT</span><span style={{ color: C.tx, fontWeight: 600 }}>2026-04-01</span></Row>
            <Row><span style={{ flex: 1, color: C.tm, fontSize: 11, fontFamily: FN, letterSpacing: 1 }}>SINCE</span><span style={{ color: C.tx, fontWeight: 600 }}>{trainee.startDate}</span></Row>
          </Panel>

          <div style={{ height: 14 }} />

          <Panel title="BODYWEIGHT · 8W" tint={C.tm}>
            <BWSparkline weight={trainee.weight || 70} />
          </Panel>

          <div style={{ height: 14 }} />

          <Panel title="GOALS / INJURIES" tint={C.tm}>
            <div style={{ padding: 14, fontSize: 13, lineHeight: 1.55, color: C.tx, opacity: 0.85 }}>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, color: C.tm, letterSpacing: 1.5, marginBottom: 4 }}>GOALS</div>
                {trainee.goals}
              </div>
              <div>
                <div style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, color: C.tm, letterSpacing: 1.5, marginBottom: 4 }}>INJURIES</div>
                {trainee.injuries}
              </div>
            </div>
          </Panel>
        </div>
      </div>
      )}
    </section>
  );
}

// ─── Tab: Programs ────────────────────────────────────────────────────────
// 12 mock programs spread across the 3 mock trainees — same shape as the
// real planIndex (id, name, traineeId, dayCount, exerciseCount, phase,
// created, updated) so the demo list view mirrors PlansView 1:1.
// Mock days-since-last-workout per athlete — drives the recency tag color
// in the athlete-grouped list view (≤3 green, ≤7 amber-yellow, ≤14 orange,
// >14 red, missing = never trained). Picked to make Noa & Gal visibly
// different so the visitor sees the gradient, not a uniform color.
const MOCK_LAST_SESSION_DAYS = { t1: 2, t2: 9 };

// Trimmed deliberately: 2 athletes, 3 programs total (Noa: 2, Gal: 1).
// Two athletes is the minimum that lets the filter dropdown demonstrate
// switching between clients; the 2/1 split makes the Compare picker
// instructive — Gal's lone program forces the visitor to switch the
// Athlete picker to Noa to see anything in Compare, which is precisely
// the cross-athlete feature this demo is meant to showcase.
const MOCK_PROGRAM_INDEX = [
  { id: 'p1', name: 'Block #4 — Push/Pull Volume',    traineeId: 't1', dayCount: 3, exerciseCount: 22, phase: 'Volume',   created: '2026-04-12', updated: '2026-04-29' },
  { id: 'p2', name: 'Block #3 — Strength Base',       traineeId: 't1', dayCount: 3, exerciseCount: 18, phase: 'Strength', created: '2026-03-15', updated: '2026-04-09' },
  { id: 'p3', name: 'Block #4 — Pull Specialization', traineeId: 't2', dayCount: 4, exerciseCount: 26, phase: 'Volume',   created: '2026-04-14', updated: '2026-04-28' },
];

function DemoPrograms() {
  // List view first (mirrors PlansView root) — clicking a card opens the
  // existing block-detail panel as the editor view, with a back-link to
  // return. The block editor below is unchanged from before; it just lives
  // behind the list now instead of being the default surface.
  // Deep-link the open program: /demo/coach/programs/<id>. Initial state reads
  // the URL so a shared/refreshed link opens the right program.
  const [selectedProgramId, setSelectedProgramId] = useState(() => typeof window === 'undefined' ? null : programIdFromPath(window.location.pathname));
  // One effect keeps the URL in lockstep with the selection (any of the 4
  // set-sites), so opening/closing a program gets its own URL + back button,
  // without touching each click handler. The startsWith guard means it only
  // rewrites while the Programs tab owns the path.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const base = '/demo/coach/programs';
    if (!window.location.pathname.startsWith(base)) return;
    const target = selectedProgramId ? `${base}/${encodeURIComponent(selectedProgramId)}` : base;
    if (window.location.pathname !== target) window.history.pushState({ program: selectedProgramId || null }, '', target + window.location.hash);
  }, [selectedProgramId]);
  // Sync selection FROM the URL on back/forward.
  useEffect(() => {
    const onPop = () => setSelectedProgramId(programIdFromPath(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const [search, setSearch] = useState('');
  const [filterTrainee, setFilterTrainee] = useState('');
  const [sortField, setSortField] = useState('updated');
  const [sortDir, setSortDir] = useState('desc');
  const [selectedDayIdx, setSelectedDayIdx] = useState(0);
  const [openExIdx, setOpenExIdx] = useState(null);
  const [activeBlock, setActiveBlock] = useState('Block #4');
  // Parity with the real PlanEditor — Overview multi-day grid + read-only
  // Compare against an earlier block (only available in Overview mode).
  // Mirrors src/PlansView.jsx PlanEditor exactly.
  const [overview, setOverview] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const compareActive = compareOpen;   // real COMPARE is always available (no Overview mode)
  // Compare panel = dual-dropdown (athlete + program), mirroring the real
  // PlansView CompareSidebar so visitors can pivot between athletes' prior
  // programs the same way the live coach app does.
  const [compareAthleteId, setCompareAthleteId] = useState('');
  const [comparePickedId, setComparePickedId] = useState('');
  const [warmOpen, setWarmOpen] = useState(false);
  const [cmpWarmOpen, setCmpWarmOpen] = useState(false);
  // Athlete-grouped list state — which athlete rows are expanded to show
  // their earlier blocks, and which program ids are visible on the (mock)
  // athlete portal. Both stay local to the demo; nothing persists.
  const [expandedAthletes, setExpandedAthletes] = useState(() => new Set());
  const toggleAthlete = (id) => setExpandedAthletes(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  // Default-visible: every program shown unless explicitly toggled off.
  const [portalVis, setPortalVis] = useState({});
  // (Overview mode removed — the real editor has no Overview toggle.)
  const block = BLOCK_DATA[activeBlock];

  const traineeName = (id) => MOCK_TRAINEES.find(t => t.id === id)?.name || 'Unassigned';

  // Selected program → derive athlete + block-history dynamically. Each
  // athlete's programs map onto the shared BLOCK_DATA content underneath
  // (the demo only has one set of blocks), but headings, history sidebar,
  // and compare candidates pivot on the chosen athlete so the visitor
  // experience matches the real multi-athlete coach app.
  const blockNumOf = (name) => parseInt(name?.match(/Block\s*#(\d+)/i)?.[1] || '0', 10);
  const blockKeyOf = (name) => {
    const n = blockNumOf(name);
    return (n >= 1 && n <= 4) ? `Block #${n}` : 'Block #4';
  };
  const monthLabel = (iso) => {
    try { return new Date(iso).toLocaleString('en-US', { month: 'short' }); } catch { return ''; }
  };
  const selectedProgram = selectedProgramId ? MOCK_PROGRAM_INDEX.find(p => p.id === selectedProgramId) : null;
  const selectedTraineeId = selectedProgram?.traineeId || '';
  const selectedAthleteName = traineeName(selectedTraineeId);

  // When the visitor opens a program, jump activeBlock to that program's
  // block number. Prevents the header label and the rendered block from
  // disagreeing (e.g. opening "Block #1 — Intake" should show Block #1).
  React.useEffect(() => {
    if (!selectedProgramId || !selectedProgram) return;
    const key = blockKeyOf(selectedProgram.name);
    setActiveBlock(key);
    setSelectedDayIdx(0);
    setOpenExIdx(null);
  }, [selectedProgramId]);

  // Compare panel state defaults. Athlete pivots to the current program's
  // athlete every time the visitor opens a new program (so Compare on Gal's
  // editor doesn't sticky-stay on Noa). When the current athlete has no
  // OTHER programs to compare against (e.g. Gal in the trimmed demo data),
  // default to the first different athlete who does have candidates — that
  // way Compare opens useful instead of in a "No other programs" dead-end.
  React.useEffect(() => {
    const currHasComparables = MOCK_PROGRAM_INDEX.some(p =>
      p.traineeId === selectedTraineeId && p.id !== selectedProgramId);
    let nextAthlete = selectedTraineeId;
    if (!nextAthlete || !currHasComparables) {
      const otherWithPrograms = [...new Set(MOCK_PROGRAM_INDEX.map(p => p.traineeId).filter(Boolean))]
        .find(id => id !== selectedTraineeId);
      nextAthlete = otherWithPrograms || selectedTraineeId || MOCK_TRAINEES[0]?.id || '';
    }
    setCompareAthleteId(nextAthlete);
    setComparePickedId(''); // forces the program useEffect to re-pick a default
  }, [selectedProgramId]);
  const cmpCandidates = React.useMemo(() => {
    if (!compareAthleteId) return [];
    return MOCK_PROGRAM_INDEX
      .filter(p => p.traineeId === compareAthleteId && p.id !== selectedProgramId)
      .slice()
      .sort((a, b) => blockNumOf(b.name) - blockNumOf(a.name));
  }, [compareAthleteId, selectedProgramId]);
  React.useEffect(() => {
    if (cmpCandidates.length === 0) { if (comparePickedId) setComparePickedId(''); return; }
    if (!comparePickedId || !cmpCandidates.some(c => c.id === comparePickedId)) {
      // Prefer a program with a different block # than the currently-edited
      // one — guarantees the compare panel actually shows different content
      // even when switching to a new athlete (since the demo's BLOCK_DATA is
      // shared across athletes and keyed only by block number).
      const curN = blockNumOf(selectedProgram?.name || '');
      const diff = cmpCandidates.find(c => blockNumOf(c.name) !== curN);
      setComparePickedId((diff || cmpCandidates[0]).id);
    }
  }, [cmpCandidates, comparePickedId]);
  const cmpProgram = MOCK_PROGRAM_INDEX.find(p => p.id === comparePickedId);
  const cmpBlockData = BLOCK_DATA[blockKeyOf(cmpProgram?.name || '')] || BLOCK_DATA['Block #3'];
  // Compare picker athlete options — same source as the list-view filter:
  // only athletes who actually have programs in MOCK_PROGRAM_INDEX. Sorted
  // alphabetically. Avoids dead-end picks where visitor selects an athlete
  // with zero programs and lands on a "No other programs" message.
  const cmpAthleteOptions = [...new Set(MOCK_PROGRAM_INDEX.map(p => p.traineeId).filter(Boolean))]
    .map(id => ({ value: id, label: MOCK_TRAINEES.find(t => t.id === id)?.name || id }))
    .sort((a, b) => a.label.localeCompare(b.label));

  if (!selectedProgramId) {
    // ─── LIST view (matches src/PlansView.jsx root) ───
    const q = search.trim().toLowerCase();
    let filtered = MOCK_PROGRAM_INDEX.filter(p => {
      if (filterTrainee && p.traineeId !== filterTrainee) return false;
      if (q && !p.name.toLowerCase().includes(q)) return false;
      return true;
    });
    filtered = filtered.slice().sort((a, b) => {
      const va = a[sortField] || '';
      const vb = b[sortField] || '';
      const cmp = String(va).localeCompare(String(vb));
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return (
      <section>

        {/* Mirrors PlansView's filter row: stretch alignment, height:42 inputs,
            custom ▾ chevron over the select, centered text. */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 12, alignItems: 'stretch', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 180, display: 'flex' }}>
            <input placeholder="Search programs..." value={search} onChange={e => setSearch(e.target.value)} style={{
              background: C.sf, border: `1px solid ${C.bd2}`, borderRadius: 0,
              height: 42, padding: '0 14px', lineHeight: '42px',
              color: C.tx, fontFamily: FB, fontSize: 13,
              outline: 'none', width: '100%', boxSizing: 'border-box',
              textAlign: 'center',
            }} />
          </div>
          <div style={{ position: 'relative', width: 200, display: 'flex' }}>
            <select value={filterTrainee} onChange={e => setFilterTrainee(e.target.value)} style={{
              background: C.sf, border: `1px solid ${C.bd2}`, borderRadius: 0,
              height: 42, padding: '0 36px 0 14px',
              color: C.tx, fontFamily: FB, fontSize: 13, outline: 'none',
              appearance: 'none', WebkitAppearance: 'none',
              textAlign: 'center', textAlignLast: 'center',
              flex: 1, boxSizing: 'border-box',
            }}>
              <option value="">All Athletes ({MOCK_PROGRAM_INDEX.length})</option>
              {/* Mirrors PlansView traineeOptions — only athletes who actually
                  have programs show up, sorted by name. Keeps the picker
                  honest when MOCK_PROGRAM_INDEX is trimmed. */}
              {[...new Set(MOCK_PROGRAM_INDEX.map(p => p.traineeId).filter(Boolean))]
                .map(id => ({ id, name: MOCK_TRAINEES.find(t => t.id === id)?.name || id }))
                .sort((a, b) => a.name.localeCompare(b.name))
                .map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: C.tm, fontSize: 16, lineHeight: 1 }}>▾</span>
          </div>
          <button onClick={e => e.stopPropagation()} style={{
            ...baseBtn, background: C.ac, color: C.acOnSurface,
            height: 42, padding: '0 18px', fontSize: 13, lineHeight: '42px', fontWeight: 700,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}>+ New Program</button>
        </div>

        {/* Sort controls — mirrors the real PlansView sort row exactly */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap', fontFamily: FN, fontSize: 11 }}>
          {[['name', 'Name'], ['created', 'Uploaded'], ['updated', 'Last edited']].map(([f, l]) => {
            const active = sortField === f;
            return (
              <button key={f} onClick={() => {
                if (active) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
                else setSortField(f);
              }} style={{
                padding: '4px 10px', borderRadius: 0,
                border: `${active ? '1px' : '0.25px'} solid ${active ? C.ac : C.cardBd}`,
                background: 'transparent',
                color: active ? C.ac : C.tm,
                fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase',
                cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
              }}>
                {l}{active && <span style={{ fontSize: 10 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>}
              </button>
            );
          })}
        </div>

        {/* Athlete-grouped list, mirroring src/PlansView.jsx. Each visible
            athlete = ONE row showing their current (highest block#) program.
            An expand chevron reveals earlier blocks inline. The same
            transparent border + sparse styling as the real coach app. */}
        {(() => {
          // Bucket the filtered programs by athlete id, then derive a row
          // per athlete with current + earlier programs.
          const buckets = new Map();
          for (const p of filtered) {
            const tid = p.traineeId || '__unassigned__';
            if (!buckets.has(tid)) buckets.set(tid, []);
            buckets.get(tid).push(p);
          }
          const rows = [];
          for (const [tid, plans] of buckets.entries()) {
            const sorted = plans.slice().sort((a, b) => blockNumOf(b.name) - blockNumOf(a.name));
            // Headline prefers the on-portal block (matches the real app) — a
            // hidden block shouldn't be the athlete's "current".
            const current = sorted.find(p => portalVis['pv_' + p.id] !== false) || sorted[0];
            const earlier = sorted.filter(p => p.id !== current.id);
            const daysSince = MOCK_LAST_SESSION_DAYS[tid] ?? null;
            rows.push({
              tid,
              name: traineeName(tid),
              current,
              earlier,
              daysSince,
              totalCount: plans.length,
            });
          }
          rows.sort((a, b) => {
            const aT = a.daysSince ?? 999;
            const bT = b.daysSince ?? 999;
            if (aT !== bT) return aT - bT;
            return (a.name || '').localeCompare(b.name || '');
          });

          const meta = `${rows.length} athlete${rows.length === 1 ? '' : 's'} · ${filtered.length} program${filtered.length === 1 ? '' : 's'} total`;

          if (rows.length === 0) return (
            <>
              <div style={{ fontSize: 12, color: C.td, marginBottom: 12, fontFamily: FN }}>{meta}</div>
              <div style={{ background: C.sf, border: `1px dashed ${C.bd2}`, borderRadius: 0, padding: 40, textAlign: 'center', color: C.tm, fontFamily: FB, fontSize: 13 }}>
                No programs match your search.
              </div>
            </>
          );

          return (
            <>
              <div style={{ fontSize: 12, color: C.td, marginBottom: 12, fontFamily: FN }}>{meta}</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {rows.map(row => {
                  const expanded = expandedAthletes.has(row.tid);
                  const cur = row.current;
                  const tagColor = row.daysSince == null ? C.td
                    : row.daysSince <= 3 ? C.gn
                    : row.daysSince <= 7 ? C.tm
                    : row.daysSince <= 14 ? C.or
                    : C.rd;
                  const tagText = row.daysSince == null ? 'NEVER LOGGED'
                    : row.daysSince === 0 ? 'TRAINED TODAY'
                    : `${row.daysSince}D AGO`;
                  const portalKey = (id) => 'pv_' + id;
                  const isVis = (id) => portalVis[portalKey(id)] !== false;
                  const togglePortal = (id) => setPortalVis(v => ({ ...v, [portalKey(id)]: !isVis(id) }));
                  return (
                    <div key={row.tid} style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderLeft: `3px solid ${C.ac}`, borderRadius: 0 }}>
                      {/* Two-line card — mirrors the real programs list (parity):
                          identity line (clickable) over a hairline, then actions. */}
                      <div onClick={() => setSelectedProgramId(cur.id)}
                        style={{ cursor: 'pointer', padding: '13px 16px 11px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                        <div style={{ fontWeight: 700, fontSize: 16, color: C.tx, whiteSpace: 'nowrap', letterSpacing: '0.01em', flexShrink: 0 }}><bdi>{row.name}</bdi></div>
                        <div style={{ fontWeight: 700, fontSize: 15, color: C.ac, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '0.04em', fontFamily: FN, minWidth: 0, flex: '0 1 auto' }}>{cur.name || 'Untitled'}</div>
                        {row.earlier.length > 0 && (
                          <button onClick={e => { e.stopPropagation(); toggleAthlete(row.tid); }}
                            title={expanded ? `Hide ${row.earlier.length} earlier block${row.earlier.length === 1 ? '' : 's'}` : `Show ${row.earlier.length} earlier block${row.earlier.length === 1 ? '' : 's'}`}
                            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: 24, minWidth: 44, padding: '0 10px', background: expanded ? C.ac : 'transparent', border: `1px solid ${C.ac}`, borderRadius: 0, color: expanded ? '#0a0a0b' : C.ac, cursor: 'pointer', fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', whiteSpace: 'nowrap', flexShrink: 0, boxSizing: 'border-box', fontVariantNumeric: 'tabular-nums', transition: 'background .15s, color .15s' }}>
                            {expanded ? `−${row.earlier.length}` : `+${row.earlier.length}`}
                          </button>
                        )}
                        <div style={{ fontSize: 11, color: C.tm, fontFamily: FN, letterSpacing: '0.04em', fontWeight: 500, flexShrink: 0, whiteSpace: 'nowrap' }}>{cur.dayCount}d · {cur.exerciseCount}ex</div>
                        <div style={{ flex: 1, minWidth: 12 }} />
                        <span title={`Last session: ${tagText.toLowerCase()}`} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: 26, padding: '0 12px', fontSize: 10, fontFamily: FN, color: tagColor, letterSpacing: '0.06em', fontWeight: 600, border: `1px solid ${tagColor}`, whiteSpace: 'nowrap', flexShrink: 0, boxSizing: 'border-box' }}>{tagText.toLowerCase()}</span>
                      </div>
                      {/* ACTION line — ON PORTAL left, CRUD cluster right, under a hairline. */}
                      {(() => {
                        const lbl = (color) => ({ height: 30, minWidth: 76, padding: '0 8px', background: 'transparent', border: `1px solid ${color}`, borderRadius: 0, color, fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', cursor: 'pointer', whiteSpace: 'nowrap' });
                        const on = isVis(cur.id);
                        return (
                          <div style={{ borderTop: `1px solid ${C.cardBd}`, padding: '10px 16px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                            <button onClick={e => { e.stopPropagation(); togglePortal(cur.id); }}
                              title={on ? 'On the athlete portal — click to hide' : 'Hidden — click to show'}
                              style={{ height: 30, minWidth: 108, padding: '0 10px', background: 'transparent', border: `1px solid ${on ? C.gn : C.cardBd}`, borderRadius: 0, color: on ? C.gn : C.td, fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: on ? C.gn : C.td }} />{on ? 'ON PORTAL' : 'HIDDEN'}</button>
                            <div style={{ flex: 1, minWidth: 12 }} />
                            <button onClick={e => e.stopPropagation()} title="Preview as trainee (demo only)" style={lbl(C.ac)}>PREVIEW</button>
                            <button onClick={e => e.stopPropagation()} title="Duplicate program (demo only)" style={lbl(C.ac)}>DUPLICATE</button>
                            <button onClick={e => e.stopPropagation()} title="Share to another athlete (demo only)" style={lbl(C.ac)}>SHARE</button>
                            <button onClick={e => e.stopPropagation()} title="Delete program (demo only)" style={lbl(C.rd)}>DELETE</button>
                          </div>
                        );
                      })()}
                      {/* Expanded earlier blocks — slightly compressed look. */}
                      {expanded && row.earlier.length > 0 && (
                        <div style={{ borderTop: `1px solid ${C.cardBd}`, padding: '4px 0' }}>
                          {row.earlier.map(p => (
                            <div key={p.id} onClick={() => setSelectedProgramId(p.id)}
                              style={{ cursor: 'pointer', padding: '7px 14px 7px 32px', display: 'flex', alignItems: 'center', gap: 8, opacity: 0.78, borderTop: `1px solid rgba(57,189,255,0.102)` }}>
                              <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: C.tm, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '0.04em', fontFamily: FN }}>{p.name || 'Untitled'}</div>
                              <div style={{ fontSize: 11, color: C.td, fontFamily: FN, letterSpacing: '0.04em', fontWeight: 500, flexShrink: 0, whiteSpace: 'nowrap' }}>{p.dayCount}d · {p.exerciseCount}ex</div>
                              {(() => {
                                const lbl = (color) => ({ height: 28, minWidth: 70, padding: '0 8px', background: 'transparent', border: `1px solid ${color}`, borderRadius: 0, color, fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 });
                                const on = isVis(p.id);
                                return <>
                                  <button onClick={e => { e.stopPropagation(); togglePortal(p.id); }}
                                    title={on ? 'On the athlete portal — click to hide' : 'Hidden — click to show'}
                                    style={{ height: 28, minWidth: 100, padding: '0 10px', background: 'transparent', border: `1px solid ${on ? C.gn : C.cardBd}`, borderRadius: 0, color: on ? C.gn : C.td, fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, flexShrink: 0 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: on ? C.gn : C.td }} />{on ? 'ON PORTAL' : 'HIDDEN'}</button>
                                  <button onClick={e => e.stopPropagation()} title="Preview as trainee (demo only)" style={lbl(C.ac)}>PREVIEW</button>
                                  <button onClick={e => e.stopPropagation()} title="Duplicate program (demo only)" style={lbl(C.ac)}>DUPLICATE</button>
                                  <button onClick={e => e.stopPropagation()} title="Share to another athlete (demo only)" style={lbl(C.ac)}>SHARE</button>
                                  <button onClick={e => e.stopPropagation()} title="Delete program (demo only)" style={lbl(C.rd)}>DELETE</button>
                                </>;
                              })()}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          );
        })()}
      </section>
    );
  }
  // ─── DETAIL view: existing block-data editor, only shown after a card click ───
  // Clamp the selected-day index when the active block changes — older
  // blocks have fewer days, so without this the user can fall off the end
  // and crash on `day.exercises`.
  const dayIdx = Math.min(selectedDayIdx, block.days.length - 1);
  const day = block.days[dayIdx];
  // BLOCK_HISTORY = the chosen athlete's programs from MOCK_PROGRAM_INDEX,
  // sorted by block # desc. Falls back to a single-row history of just the
  // selected program when the athlete has no other programs (e.g. unassigned
  // template). Each row maps back to a key in BLOCK_DATA via blockKeyOf so
  // clicking the sidebar swaps the editor pane just like before.
  const athletePrograms = MOCK_PROGRAM_INDEX
    .filter(p => p.traineeId === selectedTraineeId)
    .slice()
    .sort((a, b) => blockNumOf(b.name) - blockNumOf(a.name));
  const BLOCK_HISTORY = (athletePrograms.length > 0 ? athletePrograms : (selectedProgram ? [selectedProgram] : []))
    .map((p, i) => {
      const blockMatch = p.name.match(/Block\s*#\d+/);
      const isBlock = !!blockMatch;
      // For real blocks: row name = "Block #N", tag = the second half of
      // "Block #N — Phase Name" (or fall back to p.phase). For stand-alone
      // programs (templates etc.): row name = the full program name, tag =
      // the phase. Avoids the "Template / Template" duplication that happens
      // when name and tag both fall back to the same string.
      const blkLabel = isBlock ? blockMatch[0] : p.name;
      const tag = isBlock ? ((p.name.split('—')[1] || '').trim() || p.phase || '') : (p.phase || '');
      return {
        name: blkLabel,
        tag,
        when: i === 0
          ? (isBlock ? 'Active · Week 2/4' : 'Stand-alone')
          : `${monthLabel(p.created)} · ${Math.max(2, p.dayCount)} weeks`,
        key: blockKeyOf(p.name),
      };
    });
  const isActiveBlock = BLOCK_HISTORY[0]?.key === activeBlock;
  // Title shown above the block contents — pivots on the selected program
  // (e.g. "Block #4 — Pull Specialization") so each athlete's view feels
  // distinct, even though the underlying block data is shared in this demo.
  const headingTitle = selectedProgram?.name || block.title;
  // Subtitle clock label — show "TEMPLATE" instead of "WEEK 2 OF 4" when the
  // selected program isn't a numbered block. Otherwise the visitor reads a
  // wave-week label on a one-off template, which feels off.
  const isCurrentBlock = !!selectedProgram?.name?.match(/Block\s*#\d+/);
  const headingWhen = isCurrentBlock ? block.when : 'TEMPLATE';
  return (
    <section>
      {/* Editor top row — mirrors PlansView's PlanEditor: BACK / program-switch
          dropdown / COMPARE / OVERVIEW / SAVE PROGRAM. Drops the previous
          BLOCK HISTORY sidebar in favour of the dropdown so the editor uses
          the full width like the real app. */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 0, flex: '1 1 240px' }}>
          <button onClick={() => setSelectedProgramId(null)} style={{
            background: 'none', border: 'none', color: C.ac,
            cursor: 'pointer', fontFamily: FB, fontSize: 13, padding: 0, whiteSpace: 'nowrap',
          }}>← Back</button>
          {athletePrograms.length >= 2 && (
            <div style={{ position: 'relative', display: 'flex', minWidth: 0, flex: '1 1 240px', maxWidth: 360 }}>
              <select value={selectedProgramId || ''} onChange={e => {
                const nextId = e.target.value;
                if (nextId && nextId !== selectedProgramId) setSelectedProgramId(nextId);
              }}
                title="Switch to another program for this athlete"
                style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, height: 42, padding: '0 36px 0 18px', lineHeight: '42px', color: C.tm, fontFamily: FN, fontSize: 13, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', outline: 'none', appearance: 'none', WebkitAppearance: 'none', flex: 1, minWidth: 0, boxSizing: 'border-box', cursor: 'pointer', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {athletePrograms.map(p => <option key={p.id} value={p.id}>{p.name || 'Untitled'}</option>)}
              </select>
              <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: C.tm, fontSize: 12, lineHeight: 1 }}>▾</span>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'stretch', flexWrap: 'wrap', justifyContent: 'center' }}>
          {(() => {
            const tbBtn = (color = C.ac) => ({ background: 'var(--c-sf)', border: `1px solid ${color}`, borderRadius: 0, height: 42, padding: '0 16px', color, cursor: 'pointer', fontFamily: FN, fontSize: 13, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', whiteSpace: 'nowrap' });
            return <>
              <button onClick={() => setCompareOpen(v => !v)} title="Compare with a previous program (read-only)"
                style={{ ...tbBtn(), background: compareActive ? `${C.ac}1f` : 'var(--c-sf)' }}>{compareActive ? '✓ COMPARE' : '↔ COMPARE'}</button>
              <button onClick={e => e.stopPropagation()} title="Open in the athlete portal view (demo only)" style={tbBtn()}>◉ PORTAL</button>
              <button onClick={e => e.stopPropagation()} title="Share to another athlete (demo only)" style={tbBtn()}>⤴ SHARE</button>
              <button onClick={e => e.stopPropagation()} title="Duplicate program (demo only)" style={tbBtn()}>⎘ DUPLICATE</button>
              <button onClick={e => e.stopPropagation()} title="Show only this program on the athlete portal (demo only)" style={tbBtn()}>SHOW ONLY</button>
              <button onClick={e => e.stopPropagation()} title="Delete program (demo only)" style={tbBtn(C.rd)}>🗑 DELETE</button>
            </>;
          })()}
          <button onClick={e => e.stopPropagation()} title="Demo only"
            style={{ ...baseBtn, background: C.ac, color: '#0a0a0b', height: 42, padding: '0 18px', lineHeight: '42px', fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>Save Program</button>
        </div>
      </div>

      {/* Compare-mode flex wrapper opens AT THE TOP — mirrors the real
          PlanEditor exactly. Input grid + Pattern Coverage + Warm-up all
          live INSIDE the left half so when Compare opens, the right half
          (which has its own filter row + Pattern Coverage + warmup) lines
          up vertically with the left. Otherwise the days drift apart. */}
      <div style={{ display: compareActive ? 'flex' : 'block', gap: 16, alignItems: 'flex-start' }}>
      <div style={{ flex: compareActive ? 1 : 'unset', width: compareActive ? '50%' : 'auto', minWidth: 0 }}>
        {/* Row 2: 4-cell input grid mirroring PlansView's PROGRAM NAME /
            ATHLETE / PHASE / WEEKS row. Read-only since the demo doesn't
            write. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Program Name', value: selectedProgram?.name || '' },
            { label: 'Assign to Athlete', value: selectedAthleteName },
            { label: 'Phase / Block', value: selectedProgram?.phase || '' },
            { label: 'Weeks', value: '4 weeks' },
          ].map((field, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, color: C.td, letterSpacing: '0.08em', textTransform: 'uppercase', textAlign: 'center' }}>{field.label}</label>
              <input value={field.value} readOnly tabIndex={-1}
                style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, height: 42, padding: '0 14px', color: C.tx, fontFamily: FB, fontSize: 13, outline: 'none', textAlign: 'center', cursor: 'default' }} />
            </div>
          ))}
        </div>

        {/* PATTERN COVERAGE chart (mock) — mirrors the real PlanEditor's
            PatternCoverage component. */}
        <div style={{ border: `1px solid rgba(255,165,2,0.4)`, padding: 12, marginBottom: 16 }}>
          <div style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, color: C.or, letterSpacing: '0.06em', marginBottom: 8 }}>PATTERN COVERAGE: 5/8</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[
              { label: 'Horizontal Push', hit: true },
              { label: 'Horizontal Pull', hit: true },
              { label: 'Vertical Push', hit: true },
              { label: 'Vertical Pull', hit: false },
              { label: 'Hip Hinge', hit: true },
              { label: 'Squat', hit: true },
              { label: 'Lunge', hit: false },
              { label: 'Carry/Loaded Locomotion', hit: false },
            ].map((p, i) => (
              <span key={i} style={{
                fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                padding: '4px 10px', borderRadius: 0,
                border: `1px solid ${p.hit ? 'rgba(46,213,115,0.502)' : C.bd2}`,
                color: p.hit ? C.gn : C.td,
                background: 'transparent',
              }}>{p.hit ? '✓' : 'x'} {p.label.toUpperCase()}</span>
            ))}
          </div>
        </div>

        {/* Foldable warm-up — same shape the real PlanEditor uses. */}
        {Array.isArray(block.warmup) && block.warmup.length > 0 && (
          <div style={{ border: `1px solid ${C.cardBd}`, padding: 10, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={() => setWarmOpen(o => !o)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                <span style={{ fontSize: 10, color: C.or, fontFamily: FN, fontWeight: 700, width: 10, textAlign: 'center' }}>{warmOpen ? '▾' : '▸'}</span>
                <span style={{ fontSize: 11, fontFamily: FN, fontWeight: 700, color: C.or, letterSpacing: '0.06em' }}>WARM-UP ({block.warmup.length})</span>
              </button>
              <button onClick={e => e.stopPropagation()} title="Demo only"
                style={{ background: 'var(--c-sf)', border: `1px solid rgba(255,165,2,0.4)`, borderRadius: 0, padding: '3px 10px', color: C.or, cursor: 'pointer', fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.18em' }}>+ ADD WARM-UP</button>
            </div>
            {warmOpen && (
              <div style={{ marginTop: 8 }}>
                {block.warmup.map((w, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '24px 2fr 1fr', gap: 8, padding: '4px 0', alignItems: 'center', borderTop: i === 0 ? 'none' : `1px solid rgba(57,189,255,0.102)` }}>
                    <div style={{ fontFamily: FN, fontSize: 11, color: C.tm, fontWeight: 700, textAlign: 'center' }}>{i + 1}</div>
                    <div style={{ fontSize: 13, color: C.tx, fontFamily: FB }}>{w.t}</div>
                    <div style={{ fontSize: 12, color: C.tm, fontFamily: FN }}>{w.rx}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {!overview && (<>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {block.days.map((d, i) => (
            <button key={i} onClick={() => { setSelectedDayIdx(i); setOpenExIdx(null); }} style={{
              ...baseBtn,
              background: i === dayIdx ? C.acD : 'transparent',
              color: i === dayIdx ? C.ac : C.tm,
              border: `1px solid ${i === dayIdx ? C.ac : C.bd}`,
              padding: '6px 14px', fontSize: 11,
            }}>{d.name}</button>
          ))}
        </div>

        {/* Day-summary chips: ex count, superset count, est duration. The
            duration estimate is rough — sum of (sets × ~45s working set + 90s
            rest), capped to whole minutes. Not load-bearing math, just gives
            the visitor a feel for the workout's shape. */}
        {(() => {
          const exCount = day.exercises.length;
          const ssCount = new Set(day.exercises.filter(e => e.superset).map(e => e.superset)).size;
          const estSec = day.exercises.reduce((acc, e) => {
            const sets = parseInt(e.sets) || 3;
            return acc + sets * (45 + 90);
          }, 0);
          const estMin = Math.round(estSec / 60);
          return (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
              <DayChip>{exCount} EXERCISES</DayChip>
              <DayChip>{ssCount} SUPERSET{ssCount === 1 ? '' : 'S'}</DayChip>
              <DayChip>~{estMin} MIN</DayChip>
              <DayChip muted>EST · BASED ON 90s REST</DayChip>
            </div>
          );
        })()}

        {/* Per-day-name input — mirrors the real PlanEditor `Day N Name`
            field that sits above the per-exercise cards in detail mode. */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, color: C.td, letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 4, textAlign: 'center' }}>Day {dayIdx + 1} Name</label>
          <input value={day.name} readOnly tabIndex={-1}
            style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, height: 42, padding: '0 14px', color: C.tx, fontFamily: FB, fontSize: 13, outline: 'none', textAlign: 'center', cursor: 'default', width: '100%', boxSizing: 'border-box' }} />
        </div>

        {/* Per-exercise cards — mirrors PlansView PlanEditor's per-exercise
            card layout (detail mode). Each card has the multi-input grid
            (EXERCISE / SUPERSET / SETS / REPS / LOAD / RPE / TEMPO) plus
            notes textarea + video link row. Read-only in the demo. */}
        <div>
          {day.exercises.map((e, ei) => {
            const sc = e.superset === 'A' ? C.ac : e.superset === 'B' ? C.pu : e.superset === 'C' ? C.or : 'transparent';
            const cardBorderColor = e.superset ? sc : C.cardBd;
            const labelStyle = { fontSize: 10, fontWeight: 700, color: C.td, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: FN };
            // Mirrors `baseInput` in src/ui.jsx (the style PlansView's
            // <Input> renders) so the demo's read-only inputs match the
            // real card pixel-for-pixel — same padding, font, letter
            // spacing. Demo-only additions: cursor:'default' (read-only)
            // and explicit transition removed (no hover state needed).
            const inputStyleRO = { background: 'var(--c-sf2)', border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: '9px 14px', color: C.tx, fontFamily: FB, fontSize: 13, fontWeight: 400, letterSpacing: '0.01em', outline: 'none', textAlign: 'center', cursor: 'default', width: '100%', boxSizing: 'border-box' };
            const tinyStyleRO = { ...inputStyleRO, padding: '4px 6px', fontSize: 11 };
            // Mock load + rpe per row so the inputs aren't all empty (matches
            // the look of a populated real-app card). Derived deterministically
            // from index so re-renders stay stable.
            const mockLoad = e.wk?.[1] || ['60kg', '50%', '20kg', 'BW', '15kg', 'BW'][ei % 6];
            const mockRpe = ['7', '8', '7-8', 'RIR 2', '8-9', 'RIR 1'][ei % 6];
            return (
              <div key={ei} style={{ background: 'var(--c-sf)', border: `1px solid ${cardBorderColor}`, borderLeft: `3px solid ${cardBorderColor}`, borderRadius: 0, padding: 12, marginBottom: 8 }}>
                {/* Outer grid mirrors PlansView line 707 exactly: 54px drag,
                    1fr content, 54px right gutter. Without the right gutter
                    the inner inputs visually shift left (off-center inside
                    the card). */}
                <div style={{ display: 'grid', gridTemplateColumns: '54px 1fr 54px', gap: 12, alignItems: 'start' }}>
                  {/* Drag handle + exercise index. Visual only in the demo. */}
                  <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 22, userSelect: 'none' }}>
                    <span style={{ fontFamily: FN, fontSize: 11, color: C.tm, lineHeight: 1, fontWeight: 400 }}>⇕</span>
                    <span style={{ fontFamily: FN, fontSize: 12, color: C.tm, fontWeight: 700, lineHeight: 1 }}>{ei + 1}</span>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    {/* Multi-input grid mirroring PlansView line 720:
                        EXERCISE / SUPERSET / SETS / REPS / LOAD / RPE / TEMPO / trash. */}
                    <div style={{ display: 'grid', gridTemplateColumns: '4.4fr 1fr 1fr 1.5fr 1fr 1fr 1.6fr auto', minWidth: 780, gap: 12, alignItems: 'end' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                        <label style={labelStyle}>Exercise</label>
                        <input value={e.name || ''} readOnly tabIndex={-1} style={inputStyleRO} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                        <label style={labelStyle}>Superset</label>
                        <input value={e.superset || '—'} readOnly tabIndex={-1} style={{ ...inputStyleRO, color: e.superset ? sc : C.td, fontWeight: 700, fontFamily: FN }} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                        <label style={labelStyle}>Sets</label>
                        <input value={e.sets ?? ''} readOnly tabIndex={-1} style={inputStyleRO} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                        <label style={labelStyle}>Reps</label>
                        <input value={e.reps || ''} readOnly tabIndex={-1} style={inputStyleRO} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                        <label style={labelStyle}>Load</label>
                        <input value={mockLoad} readOnly tabIndex={-1} placeholder="kg/%" style={inputStyleRO} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                        <label style={labelStyle}>RPE</label>
                        <input value={mockRpe} readOnly tabIndex={-1} placeholder="7-8" style={inputStyleRO} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                        <label style={labelStyle}>Tempo</label>
                        <input value={e.tempo || ''} readOnly tabIndex={-1} placeholder="3010" style={inputStyleRO} />
                      </div>
                      {/* Trash slot mirrors PlansView line 777 so the 7 input
                          columns get the same widths under `auto`. Demo is
                          read-only — the icon is a non-interactive span. */}
                      <span aria-hidden="true" style={{ color: C.rd, padding: 4, marginBottom: 4, opacity: 0.4, fontSize: 14, lineHeight: 1, alignSelf: 'end' }}>🗑</span>
                    </div>
                    {/* Wave loads (per-week) — present when ex.wk is set, just
                        like the real PlanEditor's per-week reps grid. */}
                    {Array.isArray(e.wk) && e.wk.length > 0 && (
                      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={labelStyle}>Load / Wk</label>
                        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${e.wk.length}, minmax(40px, 1fr))`, gap: 3 }}>
                          {e.wk.map((load, wi) => (
                            <input key={wi} value={load} readOnly tabIndex={-1}
                              placeholder={`W${wi + 1}`}
                              style={{ ...tinyStyleRO, color: wi === 1 ? C.ac : C.tx, borderColor: wi === 1 ? C.ac : C.cardBd }} />
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Notes textarea + video URL row, matching the real card. */}
                    <textarea value={['Pause 1s on chest, drive heels.', 'Glutes locked, ribs down.', '', 'Lead with elbows, soft thumb.', '', 'Squeeze cuff at top, no swing.'][ei % 6]} readOnly tabIndex={-1}
                      placeholder="Notes / modifications..."
                      style={{ ...inputStyleRO, marginTop: 8, minHeight: 64, padding: '10px 12px', lineHeight: 1.5, resize: 'none', fontSize: 13 }} />
                    <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr auto', gap: 6, alignItems: 'stretch' }}>
                      <input value="https://youtu.be/demo" readOnly tabIndex={-1}
                        placeholder="📹 Insert video URL"
                        style={inputStyleRO} />
                      {/* alignItems:'stretch' on the parent + display:'inline-flex'
                          here makes the LIB pill match the URL input's exact
                          height instead of being a hair shorter (6px padding +
                          10px font vs 8px padding + 13px font). */}
                      <a href="#" onClick={ev => ev.preventDefault()} title="Demo only"
                        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontFamily: FN, fontWeight: 700, letterSpacing: '0.18em', color: C.tm, textDecoration: 'none', padding: '0 10px', border: `1px solid ${C.cardBd}`, borderRadius: 0, whiteSpace: 'nowrap', boxSizing: 'border-box' }}>
                        LIB ▸
                      </a>
                    </div>
                  </div>
                  {/* Right gutter mirrors PlansView line 861 (<div /> after
                      content). Without this, the inner inputs are visually
                      shifted left and the card looks off-center. */}
                  <div />
                </div>
              </div>
            );
          })}
        </div>
        </>)}
        {overview && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
            {block.days.map((d, dayIdx) => (
              <div key={dayIdx} style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8, gap: 10 }}>
                  <input value={d.name} readOnly tabIndex={-1}
                    style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: '4px 8px', color: C.tx, fontFamily: FB, fontWeight: 700, fontSize: 14, outline: 'none', maxWidth: 260, height: 30, boxSizing: 'border-box', textAlign: 'center', cursor: 'default' }} />
                  <span style={{ color: C.td, fontSize: 12, whiteSpace: 'nowrap' }}>({d.exercises.length} ex)</span>
                  <button onClick={() => { setSelectedDayIdx(dayIdx); setOverview(false); }}
                    title="Open this day in the detail editor"
                    style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: '3px 10px', height: 30, boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: C.ac, cursor: 'pointer', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', marginLeft: 'auto' }}>DETAIL ▸</button>
                </div>
                <div style={{ overflowX: 'auto', margin: '0 -12px', padding: '0 12px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '36px minmax(180px,3.3fr) 56px minmax(50px,0.8fr) minmax(60px,1fr) minmax(80px,1.3fr) minmax(56px,72px) 24px', gap: '6px 8px', fontSize: 12, alignItems: 'center', minWidth: 560 }}>
                    {['#', 'EXERCISE', 'GRP', 'SETS', 'REPS', 'TEMPO', 'WAVE', ''].map((h, hi) =>
                      hi === 0 ? (
                        <div key={hi} style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                          <span style={{ fontFamily: FN, fontSize: 12, lineHeight: 1, fontWeight: 400, opacity: 0 }}>⇕</span>
                          <span style={{ fontSize: 9, fontFamily: FN, color: C.td }}>{h}</span>
                        </div>
                      ) : hi === 1 ? (
                        <div key={hi} style={{ fontSize: 9, fontFamily: FN, color: C.td, minWidth: 0, borderLeft: '3px solid transparent', paddingLeft: 6 }}>{h}</div>
                      ) : (
                        <div key={hi} style={{ fontSize: 9, fontFamily: FN, color: C.td, minWidth: 0 }}>{h}</div>
                      )
                    )}
                    {d.exercises.map((ex, ei) => {
                      const sc = ex.superset === 'A' ? C.ac : ex.superset === 'B' ? C.pu : ex.superset === 'C' ? C.or : C.td;
                      const tinyRO = { background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: '3px 6px', color: C.tm, fontFamily: FB, fontSize: 11, outline: 'none', width: '100%', boxSizing: 'border-box', textAlign: 'center', cursor: 'default' };
                      return <React.Fragment key={ei}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0, padding: 0 }}>
                          <span style={{ fontFamily: FN, fontSize: 12, fontWeight: 400, opacity: 0 }}>⇕</span>
                          <span style={{ color: C.tm, fontFamily: FN, fontWeight: 700, fontSize: 12 }}>{ei + 1}</span>
                        </div>
                        <div title={ex.name}
                          style={{ color: C.tx, fontFamily: FB, fontSize: 12, minWidth: 0, overflowWrap: 'anywhere', wordBreak: 'break-word', borderLeft: `3px solid ${ex.superset ? sc : 'transparent'}`, paddingLeft: 6 }}>{ex.name}</div>
                        <input value={ex.superset || ''} readOnly tabIndex={-1} style={{ ...tinyRO, color: ex.superset ? sc : C.td, fontFamily: FN, fontWeight: 600 }} />
                        <input value={ex.sets ?? ''} readOnly tabIndex={-1} style={tinyRO} />
                        <input value={ex.reps || ''} readOnly tabIndex={-1} style={tinyRO} />
                        <input value={ex.tempo || ''} readOnly tabIndex={-1} style={tinyRO} />
                        <input value={Array.isArray(ex.wk) ? ex.wk.join(' › ') : ''} readOnly tabIndex={-1} style={tinyRO} title={Array.isArray(ex.wk) ? ex.wk.join(' / ') : ''} />
                        <div />
                      </React.Fragment>;
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        </div>
        {compareActive && (() => {
          const cmpBlock = cmpBlockData;
          const noCandidates = cmpCandidates.length === 0;
          // Tiny styled select factory — same border + height + centered text
          // as the main filter row, so the compare pickers feel like they
          // belong to the same control family.
          const pickerStyle = (disabled) => ({
            background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0,
            height: 36, padding: '0 32px 0 12px',
            color: disabled ? C.td : C.tx, fontFamily: FB, fontSize: 13,
            flex: 1, minWidth: 0, outline: 'none',
            appearance: 'none', WebkitAppearance: 'none',
            textAlign: 'center', textAlignLast: 'center',
            cursor: disabled ? 'not-allowed' : 'pointer',
            boxSizing: 'border-box',
          });
          return (
            <div style={{ flex: 1, minWidth: 0, border: 'none', padding: 0, background: 'transparent', alignSelf: 'stretch', position: 'relative' }}>
              {/* Close button = absolute corner-button only, mirrors PlansView
                  CompareSidebar (no header text row above the filters; that
                  was pushing the right side's content down by ~30px and
                  misaligning the days vs the editor's left half). */}
              <button onClick={() => setCompareOpen(false)} title="Close compare panel"
                style={{ position: 'absolute', top: -2, right: -2, background: C.bg, border: `1px solid ${C.cardBd}`, color: C.tm, cursor: 'pointer', padding: '1px 6px', borderRadius: 0, fontSize: 11, lineHeight: 1, zIndex: 2 }}>✕</button>
              {/* Dual picker: Athlete + Program. STACKED single-column to
                  mirror the real PlansView CompareSidebar layout (each
                  filter is a full-width input). Same number of pre-day
                  rows as the editor's left half (4 inputs vs 2) so the
                  DAY A boxes line up vertically. */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                  <label style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, color: C.td, letterSpacing: '0.08em', textTransform: 'uppercase', textAlign: 'center' }}>Athlete Filter</label>
                  <div style={{ position: 'relative', display: 'flex' }}>
                    <select value={compareAthleteId} onChange={e => setCompareAthleteId(e.target.value)} style={pickerStyle(false)}>
                      {cmpAthleteOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: C.tm, fontSize: 14, lineHeight: 1 }}>▾</span>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                  <label style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, color: C.td, letterSpacing: '0.08em', textTransform: 'uppercase', textAlign: 'center' }}>Program Filter</label>
                  <div style={{ position: 'relative', display: 'flex' }}>
                    <select value={comparePickedId} onChange={e => setComparePickedId(e.target.value)} disabled={noCandidates} style={pickerStyle(noCandidates)}>
                      {noCandidates
                        ? <option value="">No other programs for this athlete</option>
                        : cmpCandidates.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: noCandidates ? C.td : C.tm, fontSize: 14, lineHeight: 1 }}>▾</span>
                  </div>
                </div>
              </div>

              {/* PATTERN COVERAGE chart on the compare side too — matches the
                  left half so the WARM-UP + DAY A boxes line up vertically. */}
              <div style={{ border: `1px solid rgba(255,165,2,0.4)`, padding: 12, marginBottom: 16 }}>
                <div style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, color: C.or, letterSpacing: '0.06em', marginBottom: 8 }}>PATTERN COVERAGE: 4/8</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {[
                    { label: 'Horizontal Push', hit: false },
                    { label: 'Horizontal Pull', hit: true },
                    { label: 'Vertical Push', hit: false },
                    { label: 'Vertical Pull', hit: true },
                    { label: 'Hip Hinge', hit: true },
                    { label: 'Squat', hit: true },
                    { label: 'Lunge', hit: false },
                    { label: 'Carry/Loaded Locomotion', hit: false },
                  ].map((p, i) => (
                    <span key={i} style={{
                      fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                      padding: '4px 10px', borderRadius: 0,
                      border: `1px solid ${p.hit ? 'rgba(46,213,115,0.502)' : C.bd2}`,
                      color: p.hit ? C.gn : C.td,
                      background: 'transparent',
                    }}>{p.hit ? '✓' : 'x'} {p.label.toUpperCase()}</span>
                  ))}
                </div>
              </div>
              {Array.isArray(cmpBlock.warmup) && cmpBlock.warmup.length > 0 && (
                <div style={{ border: `1px solid ${C.cardBd}`, padding: 10, marginBottom: 12 }}>
                  <button onClick={() => setCmpWarmOpen(o => !o)}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 10, color: C.or, fontFamily: FN, fontWeight: 700, width: 10, textAlign: 'center' }}>{cmpWarmOpen ? '▾' : '▸'}</span>
                    <span style={{ fontSize: 11, fontFamily: FN, fontWeight: 700, color: C.or, letterSpacing: '0.06em' }}>WARM-UP ({cmpBlock.warmup.length})</span>
                  </button>
                  {cmpWarmOpen && (
                    <div style={{ marginTop: 8 }}>
                      {cmpBlock.warmup.map((w, i) => (
                        <div key={i} style={{ display: 'grid', gridTemplateColumns: '24px 2fr 1fr', gap: 8, padding: '4px 0', alignItems: 'center', borderTop: i === 0 ? 'none' : `1px solid rgba(57,189,255,0.102)` }}>
                          <div style={{ fontFamily: FN, fontSize: 11, color: C.tm, fontWeight: 700, textAlign: 'center' }}>{i + 1}</div>
                          <div style={{ fontSize: 13, color: C.tx, fontFamily: FB }}>{w.t}</div>
                          <div style={{ fontSize: 12, color: C.tm, fontFamily: FN }}>{w.rx}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {cmpBlock.days.map((d, dayIdx) => (
                <div key={dayIdx} style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: 12, marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8, gap: 10 }}>
                    <input value={d.name} readOnly tabIndex={-1}
                      style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: '4px 8px', color: C.tx, fontFamily: FB, fontWeight: 700, fontSize: 14, outline: 'none', maxWidth: 260, boxSizing: 'border-box', textAlign: 'center', cursor: 'default' }} />
                    <span style={{ color: C.td, fontSize: 12, whiteSpace: 'nowrap' }}>({d.exercises.length} ex)</span>
                  </div>
                  <div style={{ overflowX: 'auto', margin: '0 -12px', padding: '0 12px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '36px minmax(180px,3.3fr) 56px minmax(50px,0.8fr) minmax(60px,1fr) minmax(80px,1.3fr) minmax(56px,72px) 24px', gap: '6px 8px', fontSize: 12, alignItems: 'center', minWidth: 560 }}>
                      {['#', 'EXERCISE', 'GRP', 'SETS', 'REPS', 'TEMPO', 'WAVE', ''].map((h, hi) =>
                        hi === 0 ? (
                          <div key={hi} style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                            <span style={{ fontFamily: FN, fontSize: 12, lineHeight: 1, fontWeight: 400, opacity: 0 }}>⇕</span>
                            <span style={{ fontSize: 9, fontFamily: FN, color: C.td }}>{h}</span>
                          </div>
                        ) : hi === 1 ? (
                          <div key={hi} style={{ fontSize: 9, fontFamily: FN, color: C.td, minWidth: 0, borderLeft: '3px solid transparent', paddingLeft: 6 }}>{h}</div>
                        ) : (
                          <div key={hi} style={{ fontSize: 9, fontFamily: FN, color: C.td, minWidth: 0 }}>{h}</div>
                        )
                      )}
                      {d.exercises.map((ex, ei) => {
                        const sc = ex.superset === 'A' ? C.ac : ex.superset === 'B' ? C.pu : ex.superset === 'C' ? C.or : C.td;
                        const tinyRO = { background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: '3px 6px', color: C.tm, fontFamily: FB, fontSize: 11, outline: 'none', width: '100%', boxSizing: 'border-box', textAlign: 'center', cursor: 'default' };
                        return <React.Fragment key={ei}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0, padding: 0 }}>
                            <span style={{ fontFamily: FN, fontSize: 12, fontWeight: 400, opacity: 0 }}>⇕</span>
                            <span style={{ color: C.tm, fontFamily: FN, fontWeight: 700, fontSize: 12 }}>{ei + 1}</span>
                          </div>
                          <div title={ex.name}
                            style={{ color: C.tx, fontFamily: FB, fontSize: 12, minWidth: 0, overflowWrap: 'anywhere', wordBreak: 'break-word', borderLeft: `3px solid ${ex.superset ? sc : 'transparent'}`, paddingLeft: 6 }}>{ex.name}</div>
                          <input value={ex.superset || ''} readOnly tabIndex={-1} style={{ ...tinyRO, color: ex.superset ? sc : C.td, fontFamily: FN, fontWeight: 600 }} />
                          <input value={ex.sets ?? ''} readOnly tabIndex={-1} style={tinyRO} />
                          <input value={ex.reps || ''} readOnly tabIndex={-1} style={tinyRO} />
                          <input value={ex.tempo || ''} readOnly tabIndex={-1} style={tinyRO} />
                          <input value={Array.isArray(ex.wk) ? ex.wk.join(' › ') : ''} readOnly tabIndex={-1} style={tinyRO} title={Array.isArray(ex.wk) ? ex.wk.join(' / ') : ''} />
                          <div />
                        </React.Fragment>;
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button title="Demo only" style={{ ...baseBtn, background: C.ac, color: '#000' }}>+ ADD EXERCISE</button>
        <button title="Demo only" style={{ ...baseBtn, background: 'transparent', color: C.tx, border: `1px solid ${C.bd}` }}>📋 DUPLICATE BLOCK</button>
        <button title="Demo only" style={{ ...baseBtn, background: 'transparent', color: C.tx, border: `1px solid ${C.bd}` }}>📥 IMPORT XLSX</button>
        <button title="Demo only" style={{ ...baseBtn, background: 'transparent', color: C.tx, border: `1px solid ${C.bd}` }}>📤 EXPORT</button>
      </div>
    </section>
  );
}

const tdStyle = () => ({
  padding: '10px', fontFamily: FB, fontSize: 13, color: C.tm,
  borderBottom: `1px solid ${C.bd}`, verticalAlign: 'middle',
});

function DayChip({ children, muted }) {
  return (
    <span style={{
      fontFamily: FN, fontSize: 9, letterSpacing: 1.5, fontWeight: 700,
      color: muted ? C.td : C.ac,
      background: muted ? 'transparent' : C.acD,
      border: `1px solid ${muted ? C.bd : '${C.cardBd}'}`,
      borderRadius: 0, padding: '3px 8px', whiteSpace: 'nowrap',
    }}>{children}</span>
  );
}

// Per-exercise inline action chip — Watch / Swap / Note / Progression.
// Non-functional in the demo; click bubbles back up to the row toggle so
// the visitor doesn't double-click and accidentally collapse the panel.
function ExerciseAction({ icon, label, sub }) {
  return (
    <button onClick={e => e.stopPropagation()} style={{
      background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 0,
      padding: '8px 12px', textAlign: 'left',
      cursor: 'pointer', display: 'flex', flexDirection: 'column',
      gap: 3, minWidth: 180, transition: 'border-color 0.15s',
    }}
      onMouseEnter={ev => ev.currentTarget.style.borderColor = C.ac}
      onMouseLeave={ev => ev.currentTarget.style.borderColor = C.bd}
    >
      <div style={{
        fontFamily: FN, fontSize: 11, color: C.ac, letterSpacing: 1.5, fontWeight: 700,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span>{icon}</span>{label}
      </div>
      <div style={{
        fontFamily: FB, fontSize: 11.5, color: C.tx, opacity: 0.72,
      }}>{sub}</div>
    </button>
  );
}

// ─── Tab: Exercises ───────────────────────────────────────────────────────
function DemoExercises() {
  // Mirrors src/ExercisesView.jsx filter shape: a search box + a 6-up grid
  // of selects (Category / Resistance / Body Position / Movement Type /
  // Pattern / Laterality), with an active-count chip and a Clear all link.
  // Anything dropped here would also land on the real coach app.
  const [search, setSearch] = useState('');
  const emptyFilters = { category: '', resistanceType: '', bodyPosition: '', movementType: '', movementPattern: '', laterality: '' };
  const [filters, setFilters] = useState(emptyFilters);
  const setF = (k, v) => setFilters(prev => ({ ...prev, [k]: v }));
  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const clearFilters = () => setFilters(emptyFilters);

  const q = search.trim().toLowerCase();
  const filtered = MOCK_EXERCISES.filter(e => {
    if (q) {
      const haystack = [e.name, e.category, e.resistanceType, e.bodyPosition, e.movementType, e.pattern, e.laterality].filter(Boolean).join(' ').toLowerCase();
      if (!q.split(/\s+/).filter(Boolean).every(tok => haystack.includes(tok))) return false;
    }
    if (filters.category && e.category !== filters.category) return false;
    if (filters.resistanceType && e.resistanceType !== filters.resistanceType) return false;
    if (filters.bodyPosition && e.bodyPosition !== filters.bodyPosition) return false;
    if (filters.movementType && e.movementType !== filters.movementType) return false;
    if (filters.movementPattern && e.pattern !== filters.movementPattern) return false;
    if (filters.laterality && e.laterality !== filters.laterality) return false;
    return true;
  });

  // Match the real coach-app baseInput look so the demo selects don't drift.
  const selectStyle = {
    background: C.sf, border: `1px solid ${C.bd2}`, borderRadius: 0,
    padding: '6px 10px', color: C.tx, fontFamily: FB, fontSize: 12, outline: 'none',
  };

  return (
    <section>

      {/* Search + count */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search exercises (title, muscle, pattern...)"
          style={{
            background: C.sf, border: `1px solid ${C.bd2}`, borderRadius: 0,
            padding: '8px 12px', color: C.tx, fontFamily: FB, fontSize: 13,
            outline: 'none', flex: '1 1 200px', minWidth: 200,
          }}
        />
        <span style={{
          fontFamily: FN, fontSize: 10, color: C.td, letterSpacing: 1.5, marginLeft: 'auto',
        }}>{filtered.length} / {MOCK_EXERCISES.length}</span>
      </div>

      {/* Filter pane — same 6-col grid of selects as the real ExercisesView */}
      <div style={{ background: C.sf, border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: 10, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 10, fontFamily: FN, fontWeight: 700, color: C.td, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Filters {activeFilterCount > 0 && <span style={{ color: C.ac, marginLeft: 6 }}>({activeFilterCount} active)</span>}
          </div>
          {activeFilterCount > 0 && (
            <button onClick={clearFilters} style={{ background: 'none', border: 'none', color: C.tm, cursor: 'pointer', fontSize: 11, fontFamily: FN, textDecoration: 'underline' }}>Clear all</button>
          )}
        </div>
        <div className="cd-ex-filters" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          <select value={filters.category} onChange={e => setF('category', e.target.value)} style={selectStyle}>
            <option value="">Category</option>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filters.resistanceType} onChange={e => setF('resistanceType', e.target.value)} style={selectStyle}>
            <option value="">Resistance</option>{RESISTANCE_TYPES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filters.bodyPosition} onChange={e => setF('bodyPosition', e.target.value)} style={selectStyle}>
            <option value="">Body Position</option>{BODY_POSITIONS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filters.movementType} onChange={e => setF('movementType', e.target.value)} style={selectStyle}>
            <option value="">Movement Type</option>{MOVEMENT_TYPES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filters.movementPattern} onChange={e => setF('movementPattern', e.target.value)} style={selectStyle}>
            <option value="">Pattern</option>{MOVEMENT_PATTERNS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filters.laterality} onChange={e => setF('laterality', e.target.value)} style={selectStyle}>
            <option value="">Laterality</option>{LATERALITY.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <div style={{ fontSize: 12, color: C.td, marginBottom: 10, fontFamily: FN }}>
        {filtered.length} exercise{filtered.length !== 1 ? 's' : ''}
      </div>

      {filtered.length === 0 ? (
        <div style={{
          background: C.sf, border: `1px dashed ${C.bd2}`, borderRadius: 0,
          padding: 40, textAlign: 'center',
        }}>
          <div style={{ fontFamily: FN, fontSize: 11, color: C.td, letterSpacing: 2, fontWeight: 700, marginBottom: 8 }}>NO MATCHES</div>
          <div style={{ fontFamily: FB, fontSize: 13, color: C.tm }}>
            Nothing matches {q ? <>"<span style={{ color: C.tx, fontWeight: 700 }}>{search}</span>"</> : 'this filter'}. Clear search or pick another category.
          </div>
        </div>
      ) : (
        // Same table shape as src/ExercisesView.jsx so the demo mirrors what
        // a coach actually sees in the real app: Title / Category / Resistance
        // / Pattern / Laterality, hover-tinted rows, badges per cell.
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: FB, fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.bd}` }}>
                {['Title', 'Category', 'Resistance', 'Pattern', 'Laterality'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 10px', fontSize: 10, fontFamily: FN, color: C.td, textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((e, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${C.bd}` }}
                  onMouseEnter={ev => ev.currentTarget.style.background = C.sf2}
                  onMouseLeave={ev => ev.currentTarget.style.background = 'transparent'}>
                  <td style={{ padding: '10px', color: C.tx, fontWeight: 600 }}>{e.name}</td>
                  <td style={{ padding: '10px' }}><Badge>{e.category}</Badge></td>
                  <td style={{ padding: '10px', color: C.tm }}>{e.resistanceType || '—'}</td>
                  <td style={{ padding: '10px' }}>{e.pattern ? <Badge color={C.gn}>{e.pattern}</Badge> : '—'}</td>
                  <td style={{ padding: '10px', color: C.tm }}>{e.laterality || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ─── Tab: Review ──────────────────────────────────────────────────────────
// The /demo iframe pulls ~6MB of MediaPipe wasm + lite model on first mount.
// CoachDemo always-mounts DemoReview (hidden via display:none on other tabs)
// so the iframe starts loading the moment the visitor lands on Dashboard. By
// the time they click Review, the wasm + model are usually already warm.
// Mock review queue — same shape as src/WorkoutReview.jsx's clientWorkouts
// list: 3 pending workouts, 2 with form videos, 1 with prior comments and a
// weekly-focus note. Click into one to open a detail mirror that shows the
// same exercise rows + bottom action row the real coach sees.
const MOCK_REVIEW_QUEUE = [
  {
    id: 'rv1', traineeName: 'נועה לוי', initials: 'NL',
    dayName: 'Day A · Push', planName: 'Block #4 — Push/Pull Volume', week: 2,
    date: 'Today 09:14', doneSets: 18, totalSets: 20,
    exercises: [
      { name: 'BB Bench Press',     prescribed: '4×6-8 · 60kg', done: 4, sets: 4, hasVideo: true,  comments: 3, focus: true  },
      { name: 'DB Incline Press',   prescribed: '3×8-10',       done: 3, sets: 3, hasVideo: false, comments: 0, focus: false },
      { name: 'Cable Fly',          prescribed: '3×12',         done: 3, sets: 3, hasVideo: true,  comments: 1, focus: false },
      { name: 'Standing OHP',       prescribed: '4×6-8 · 35kg', done: 4, sets: 4, hasVideo: false, comments: 0, focus: true  },
      { name: 'Tricep Pushdown',    prescribed: '3×12',         done: 3, sets: 3, hasVideo: false, comments: 0, focus: false },
      { name: 'Cable Pallof Press', prescribed: '3×10 E',       done: 1, sets: 3, hasVideo: false, comments: 0, focus: false },
    ],
  },
  {
    id: 'rv2', traineeName: 'יעל כהן', initials: 'YK',
    dayName: 'Day B · Pull', planName: 'Block #4 — Couple Volume', week: 2,
    date: 'Today 08:02', doneSets: 17, totalSets: 21,
    exercises: [
      { name: 'Pull-Up',            prescribed: '4×AMRAP',      done: 4, sets: 4, hasVideo: true,  comments: 2, focus: true  },
      { name: 'Bent-Over BB Row',   prescribed: '4×8',          done: 4, sets: 4, hasVideo: false, comments: 0, focus: false },
      { name: 'Face Pull',          prescribed: '3×15',         done: 3, sets: 3, hasVideo: false, comments: 0, focus: false },
      { name: 'DB Bicep Curl',      prescribed: '3×12',         done: 3, sets: 3, hasVideo: true,  comments: 0, focus: false },
      { name: 'Hanging Leg Raise',  prescribed: '3×8',          done: 2, sets: 3, hasVideo: false, comments: 0, focus: false },
      { name: 'Plank',              prescribed: '3×60s',        done: 1, sets: 3, hasVideo: false, comments: 0, focus: false },
    ],
  },
  {
    id: 'rv3', traineeName: 'גל מזרחי', initials: 'GM',
    dayName: 'Day C · Legs', planName: 'Block #4 — Pull Specialization', week: 2,
    date: 'Yesterday', doneSets: 14, totalSets: 14,
    exercises: [
      { name: 'Back Squat',         prescribed: '4×5 · 100kg',  done: 4, sets: 4, hasVideo: false, comments: 0, focus: false },
      { name: 'Romanian Deadlift',  prescribed: '3×8 · 90kg',   done: 3, sets: 3, hasVideo: false, comments: 0, focus: false },
      { name: 'Walking Lunge',      prescribed: '3×10 E',       done: 3, sets: 3, hasVideo: false, comments: 0, focus: false },
      { name: 'Leg Curl',           prescribed: '3×12',         done: 3, sets: 3, hasVideo: false, comments: 0, focus: false },
      { name: 'Hip Thrust',         prescribed: '1×AMRAP',      done: 1, sets: 1, hasVideo: false, comments: 0, focus: false },
    ],
  },
];

function DemoReview() {
  // Two-screen mirror of src/WorkoutReview.jsx:
  //   1. Queue list — sub-nav + REVIEW QUEUE banner + per-athlete workout cards
  //   2. Workout detail — exercise rows with the same 📹💬🎯 icons + bottom
  //      action row (DELETE / UNMARK / BACK TO REVIEW / NEXT PENDING) the
  //      real coach sees.
  const [subTab, setSubTab] = useState('review');
  const [selectedId, setSelectedId] = useState(null);
  const selected = MOCK_REVIEW_QUEUE.find(w => w.id === selectedId);
  const queue = MOCK_REVIEW_QUEUE;
  const withVideo = queue.filter(w => w.exercises.some(e => e.hasVideo)).length;
  const byClient = {};
  for (const wo of queue) {
    if (!byClient[wo.traineeName]) byClient[wo.traineeName] = { name: wo.traineeName, workouts: [] };
    byClient[wo.traineeName].workouts.push(wo);
  }

  const subNav = (
    <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
      {[['review', 'Review Athlete Workouts'], ['log', 'Log In-Person Session']].map(([k, l]) => (
        <button key={k} onClick={() => { setSubTab(k); setSelectedId(null); }} style={{
          flex: 1, padding: '10px 0', borderRadius: 0,
          border: `1px solid ${subTab === k ? C.ac : C.bd}`,
          background: subTab === k ? C.acD : 'transparent',
          color: subTab === k ? C.ac : C.tm,
          fontFamily: FB, fontSize: 13, fontWeight: 600, cursor: 'pointer',
        }}>{l}</button>
      ))}
    </div>
  );

  if (subTab === 'log') {
    return <section>{subNav}<DemoWorkouts /></section>;
  }

  if (selected) {
    return (
      <section>
        {subNav}
        <button onClick={() => setSelectedId(null)} style={{
          background: 'none', border: 'none', color: C.ac,
          cursor: 'pointer', fontFamily: FB, fontSize: 13, padding: 0, marginBottom: 12,
        }}>← Back</button>

        <div style={{
          background: C.sf, border: `1px solid rgba(57,189,255,0.251)`, borderRadius: 0,
          padding: '14px 18px', marginBottom: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              background: C.acD, border: `1px solid rgba(57,189,255,0.251)`, color: C.ac,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: FB, fontWeight: 700, fontSize: 13, flex: '0 0 auto',
            }}>{selected.initials}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: FB, fontWeight: 700, fontSize: 16, color: C.tx }}>{selected.traineeName}</div>
              <div style={{ fontFamily: FN, fontSize: 11, color: C.tm, letterSpacing: 1, marginTop: 2 }}>
                {selected.dayName.toUpperCase()} · {selected.planName} · W{selected.week} · {selected.date.toUpperCase()}
              </div>
            </div>
            <div style={{ fontFamily: FN, fontSize: 11, color: C.gn, letterSpacing: 1, fontWeight: 700 }}>
              {selected.doneSets}/{selected.totalSets} SETS
            </div>
          </div>
        </div>

        {selected.exercises.map((ex, i) => (
          <div key={i} style={{
            background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 0,
            marginBottom: 8, padding: '12px 14px',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <div style={{
              width: 26, height: 26, borderRadius: 0,
              background: ex.done === ex.sets ? C.gnD : C.acD,
              color: ex.done === ex.sets ? C.gn : C.ac,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: FN, fontSize: 11, fontWeight: 700, flexShrink: 0,
            }}>{i + 1}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: FB, fontWeight: 600, fontSize: 13, color: C.tx }}>{ex.name}</div>
              <div style={{ fontSize: 11, color: C.tm, marginTop: 2 }}>
                {ex.prescribed} · {ex.done}/{ex.sets} sets
                {ex.hasVideo && <span title="Form video submitted" style={{ color: C.gn, marginLeft: 6 }}>📹</span>}
                {ex.comments > 0 && (
                  <span title={`${ex.comments} comment${ex.comments === 1 ? '' : 's'} on this exercise`} style={{ color: C.ac, marginLeft: 6 }}>
                    💬{ex.comments > 1 ? <sup style={{ fontSize: 8 }}>{ex.comments}</sup> : null}
                  </span>
                )}
                {ex.focus && (
                  <span title="Weekly focus written" style={{ color: C.or, marginLeft: 6 }}>🎯</span>
                )}
              </div>
            </div>
            <span style={{ color: C.td, fontSize: 11 }}>▼</span>
          </div>
        ))}

        <div style={{ display: 'flex', gap: 8, marginTop: 20, marginBottom: 8 }}>
          <button onClick={e => e.stopPropagation()} style={{
            padding: '12px 16px', borderRadius: 0, border: `1px solid ${C.rd || '#c94444'}`,
            background: 'transparent', color: C.rd || '#ff6b6b',
            fontFamily: FN, fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}>DELETE</button>
          <button onClick={e => e.stopPropagation()} style={{
            padding: '12px 16px', borderRadius: 0, border: `1px solid ${C.bd}`,
            background: 'transparent', color: C.tm,
            fontFamily: FN, fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}>UNMARK</button>
          <button onClick={() => setSelectedId(null)} title="Return to the review queue" style={{
            flex: 1, padding: '12px 0', borderRadius: 0, border: `1px solid ${C.bd2}`,
            background: 'transparent', color: C.tx,
            fontFamily: FN, fontSize: 13, fontWeight: 700, letterSpacing: 0.5, cursor: 'pointer',
          }}>← BACK</button>
          <button onClick={() => {
            const idx = queue.findIndex(w => w.id === selected.id);
            const next = queue[(idx + 1) % queue.length];
            setSelectedId(next.id);
          }} title="Jump to next pending workout" style={{
            flex: 1, padding: '12px 0', borderRadius: 0, border: `1px solid ${C.ac}`,
            background: C.ac, color: '#0a0a0b',
            fontFamily: FN, fontSize: 13, fontWeight: 700, letterSpacing: 0.5, cursor: 'pointer',
          }}>→ NEXT PENDING ({queue.length - 1})</button>
        </div>
      </section>
    );
  }

  return (
    <section>
      {subNav}

      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: C.sf, border: `1px solid rgba(57,189,255,0.251)`, borderRadius: 0,
        padding: '10px 14px', marginBottom: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 0, background: C.acD,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: FN, fontSize: 12, fontWeight: 700, color: C.ac,
          }}>{queue.length}</div>
          <div>
            <div style={{ fontFamily: FN, fontSize: 11, color: C.ac, letterSpacing: 1.2, fontWeight: 700 }}>REVIEW QUEUE</div>
            <div style={{ fontFamily: FB, fontSize: 11, color: C.tm, marginTop: 2 }}>
              {queue.length} pending · {withVideo} with form video{withVideo === 1 ? '' : 's'}
            </div>
          </div>
        </div>
      </div>

      {Object.entries(byClient).map(([cid, data]) => (
        <div key={cid} style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontFamily: FN, color: C.ac, fontWeight: 700, marginBottom: 8 }}>
            {data.name.toUpperCase()} ({data.workouts.length})
          </div>
          {data.workouts.map(wo => {
            const hasFormVids = wo.exercises.some(e => e.hasVideo);
            return (
              <div key={wo.id} onClick={() => setSelectedId(wo.id)} style={{
                background: C.sf, border: `1px solid ${C.cardBd}`, borderRadius: 0,
                padding: '12px 16px', marginBottom: 6, cursor: 'pointer',
                transition: 'border-color .15s', display: 'flex',
                justifyContent: 'space-between', alignItems: 'center',
              }}
                onMouseEnter={e => e.currentTarget.style.borderColor = C.ac}
                onMouseLeave={e => e.currentTarget.style.borderColor = C.cardBd}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {wo.dayName}
                    <span style={{ fontWeight: 400, color: C.tm, fontSize: 12 }}>{wo.planName}</span>
                  </div>
                  <div style={{ fontSize: 11, color: C.tm, marginTop: 2 }}>
                    W{wo.week} · {wo.date} · {wo.doneSets}/{wo.totalSets} sets
                    {hasFormVids && <span style={{ color: C.gn, marginLeft: 4 }}>📹</span>}
                  </div>
                </div>
                <span style={{ color: C.ac, fontSize: 12, marginLeft: 8, flexShrink: 0 }}>Review →</span>
              </div>
            );
          })}
        </div>
      ))}
    </section>
  );
}

// Legacy iframe + sidebar demo Review was retired; the current
// DemoReview above mirrors /coach/review with a queue + detail view.
// ~130 lines of unused JSX deleted here, plus the unused
// MOCK_REVIEW_COMMENTS constant earlier in the file.

// ─── Layout ───────────────────────────────────────────────────────────────
function SectionHeader({ tag, title, body }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{
        fontFamily: FN, color: C.ac, fontSize: 11, letterSpacing: 3, fontWeight: 700,
        marginBottom: 8,
      }}>{tag}</div>
      <h1 style={{
        fontFamily: FB, fontSize: 'clamp(22px, 3.2vw, 28px)', fontWeight: 700,
        margin: '0 0 10px', letterSpacing: -0.3,
      }}>{title}</h1>
      <p style={{
        fontFamily: FB, color: C.tx, opacity: 0.85, fontSize: 14.5, lineHeight: 1.55,
        maxWidth: 720, margin: 0,
      }}>{body}</p>
    </div>
  );
}

// Recent workout logs across all clients — mirrors what a trainer sees in
// the real WorkoutsView, just with mock data. Volume + intensity per
// session so the visitor reads it as "real workout, real numbers".
// Declared BEFORE TABS so the tab-count initializer doesn't trip the TDZ.
const MOCK_WORKOUTS = [
  { who: 'נועה לוי',     day: 'Day A · Push',    when: 'Today 09:14',   vol: '4,820 kg', topSet: 'BB Bench · 60kg × 6', flagged: 'pending review' },
  { who: 'יעל כהן',      day: 'Day B · Pull',    when: 'Today 08:02',   vol: '4,180 kg', topSet: 'Pull-Up · BW × 8',     flagged: 'pending review' },
  { who: 'גל מזרחי',     day: 'Day C · Legs',    when: 'Yesterday',     vol: '6,210 kg', topSet: 'Back Squat · 100kg × 5' },
  { who: 'נועה לוי',     day: 'Day C · Legs',    when: '5 days ago',    vol: '6,010 kg', topSet: 'Back Squat · 95kg × 5' },
  { who: 'עידן כהן',     day: 'Day A · Push',    when: '6 days ago',    vol: '5,420 kg', topSet: 'BB Bench · 80kg × 5' },
  { who: 'יעל כהן',      day: 'Day A · Push',    when: '6 days ago',    vol: '3,180 kg', topSet: 'BB Bench · 35kg × 8' },
  { who: 'נועה לוי',     day: 'Day B · Pull',    when: '1 week ago',    vol: '4,180 kg', topSet: 'BB Row · 50kg × 8' },
];

const TABS = [
  { key: 'dashboard', label: 'DASHBOARD', count: null },
  { key: 'trainees',  label: 'ATHLETES',  count: MOCK_TRAINEES.length },
  { key: 'programs',  label: 'PROGRAMS',  count: MOCK_PROGRAM_INDEX.length },
  { key: 'exercises', label: 'EXERCISES', count: MOCK_EXERCISES.length },
  { key: 'workouts',  label: 'WORKOUTS',  count: MOCK_WORKOUTS.length },
  { key: 'sessions',  label: 'SESSIONS',  count: null },
  { key: 'review',    label: 'REVIEW',    count: null },
  { key: 'tasks',     label: 'TASKS',     count: 8 },
  { key: 'billing',   label: 'BILLING',   count: null },
];

// Card style matches src/ui.jsx Card — 0.25px ac-dimmed border, 10px
// radius, 18px padding. Used inline so the demo doesn't pull in the
// real-app's authed Card component.
const demoCardStyle = (extra = {}) => ({
  background: C.sf, border: `1px solid ${C.cardBd}`, borderRadius: 0,
  padding: 18, transition: 'all 0.2s', ...extra,
});

// Mock plans the trainer can start workouts from — same shape as the real
// app's planIndex (id, name, traineeId, dayNames). Ties to MOCK_TRAINEES.
const MOCK_PLAN_INDEX = [
  { id: 'p_noa_b4',   name: 'Block #4 — Push/Pull Volume', traineeId: 't1', dayNames: ['Day A · Push', 'Day B · Pull', 'Day C · Legs'] },
  { id: 'p_gal_b4',   name: 'Block #4 — Pull Specialization', traineeId: 't2', dayNames: ['Day A · Push', 'Day B · Pull', 'Day C · Legs'] },
  { id: 'p_couple_b4', name: 'Block #4 — Couple Volume', traineeId: 't3', dayNames: ['Day A · Push', 'Day B · Pull', 'Day C · Legs'] },
];

const MOCK_IN_PROGRESS = [
  { id: 'wip1', traineeId: 't1', dayName: 'Day A · Push', planName: 'Block #4 — Push/Pull Volume', date: new Date().toISOString() },
];

function DemoWorkouts() {
  // Same structure as src/WorkoutsView.jsx:
  //   1. "Start Workout from Plan" — list of plans with day-buttons
  //   2. "In Progress (N)" — orange-bordered cards
  //   3. "Completed (N)" — athlete filter on the right + cards list
  const [filterTrainee, setFilterTrainee] = useState('');
  const traineeName = (id) => MOCK_TRAINEES.find(t => t.id === id)?.name || '—';
  const completed = MOCK_WORKOUTS.filter(w => !filterTrainee || (w.who === traineeName(filterTrainee)));

  const sectionH = {
    fontFamily: FN, fontSize: 12, color: C.td, textTransform: 'uppercase',
    letterSpacing: '0.05em', margin: 0, fontWeight: 600,
  };

  return (
    <section>

      {/* 1. Start Workout from Plan */}
      <h3 style={{ ...sectionH, marginBottom: 12 }}>Start Workout from Plan</h3>
      <div style={{ display: 'grid', gap: 8, marginBottom: 24 }}>
        {MOCK_PLAN_INDEX.map(p => (
          <div key={p.id} style={demoCardStyle()}>
            <div style={{ fontFamily: FB, fontWeight: 600, fontSize: 14, color: C.tx, marginBottom: 8 }}>
              {p.name} <span style={{ fontWeight: 400, color: C.tm }}>— {traineeName(p.traineeId)}</span>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {p.dayNames.map((dn, i) => (
                <button key={i} onClick={e => e.stopPropagation()} style={{
                  ...baseBtn, background: 'transparent', color: C.tm,
                  border: `1px solid ${C.bd}`, padding: '4px 12px', fontSize: 12, fontWeight: 600,
                }}>▶ {dn}</button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* 2. In Progress */}
      {MOCK_IN_PROGRESS.length > 0 && (
        <>
          <h3 style={{ ...sectionH, color: C.or, marginBottom: 12 }}>In Progress ({MOCK_IN_PROGRESS.length})</h3>
          {MOCK_IN_PROGRESS.map(w => (
            <div key={w.id} style={{ ...demoCardStyle({ marginBottom: 8, borderColor: 'rgba(255,165,2,0.251)', cursor: 'pointer' }) }}>
              <div style={{ fontFamily: FB, fontWeight: 600, fontSize: 14, color: C.tx }}>{w.dayName}</div>
              <div style={{ fontFamily: FB, fontSize: 12, color: C.tm }}>
                {traineeName(w.traineeId)} · {fmtPrettyDate(w.date)}
              </div>
            </div>
          ))}
        </>
      )}

      {/* 3. Completed */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, marginBottom: 12 }}>
        <h3 style={sectionH}>Completed ({completed.length})</h3>
        <select value={filterTrainee} onChange={e => setFilterTrainee(e.target.value)} style={{
          background: C.sf, border: `1px solid ${C.bd2}`, borderRadius: 0,
          padding: '4px 8px', color: C.tx, fontFamily: FB, fontSize: 12, outline: 'none',
          width: 180,
        }}>
          <option value="">All Athletes</option>
          {MOCK_TRAINEES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
      {completed.length === 0 ? (
        <div style={{
          background: C.sf, border: `1px dashed ${C.bd2}`, borderRadius: 0,
          padding: 36, textAlign: 'center', color: C.tm, fontFamily: FB, fontSize: 13,
        }}>📊 No completed workouts yet.</div>
      ) : (
        completed.map((w, i) => (
          <div key={i} style={demoCardStyle({ marginBottom: 8 })}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontFamily: FB, fontWeight: 600, fontSize: 14, color: C.tx }}>
                  {w.day} <span style={{ fontWeight: 400, color: C.td, fontSize: 12 }}>({w.who})</span>
                </div>
                <div style={{ fontFamily: FB, fontSize: 12, color: C.tm }}>
                  {w.who} · {w.when}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Badge color={C.gn}>Completed</Badge>
                <button onClick={e => e.stopPropagation()} title="Demo only" style={{ background: 'none', border: 'none', color: C.tm, cursor: 'pointer', padding: 4 }}>✏️</button>
                <button onClick={e => e.stopPropagation()} title="Demo only" style={{ background: 'none', border: 'none', color: C.rd, cursor: 'pointer', padding: 4, opacity: 0.6 }}>🗑</button>
              </div>
            </div>
          </div>
        ))
      )}
    </section>
  );
}

// ── SESSIONS (Group + Single) — mirrors src/SessionsView.jsx +
// src/WorkoutsView.jsx. The flagship for the EXPO Performance Center gym: live
// 1-on-1 and group floor logging. Static mock; no writes. ──────────────────
const DEMO_SESSION_DAY = [
  { id: 'sx1', title: 'Back Squat', prescribed: '4 × 5', tempo: '30X1', cue: 'ברך מעל אצבעות · ירידה לעומק מלא · נשיפה בעלייה', sets: [{ kg: '100', reps: '5', rpe: '8', done: true }, { kg: '102.5', reps: '5', rpe: '8', done: true }, { kg: '102.5', reps: '5', rpe: '9', done: false }, { kg: '', reps: '', rpe: '', done: false }] },
  { id: 'sx2', title: 'Bench Press', prescribed: '4 × 6', tempo: '', cue: 'Retract the scapulae, bar to mid-chest, drive through the floor.', sets: [{ kg: '70', reps: '6', rpe: '7', done: true }, { kg: '72.5', reps: '6', rpe: '8', done: false }, { kg: '', reps: '', rpe: '', done: false }, { kg: '', reps: '', rpe: '', done: false }] },
  { id: 'sx3', title: 'Weighted Pull-Up', prescribed: '3 × 8', tempo: '', cue: 'Full hang, chin over the bar, controlled negative.', sets: [{ kg: 'BW+10', reps: '8', rpe: '7', done: false }, { kg: 'BW+10', reps: '8', rpe: '8', done: false }, { kg: 'BW+10', reps: '7', rpe: '9', done: false }] },
];
const isHeb = (s) => /[֐-׿]/.test(s || '');
const dCell = { background: C.sf2 || C.sf, border: `1px solid ${C.bd2}`, borderRadius: 0, padding: '5px 6px', color: C.tx, fontFamily: FB, fontSize: 12, textAlign: 'center', width: '100%', boxSizing: 'border-box', outline: 'none' };

function DemoInlineVideo({ title }) {
  // Demo stand-in for the real inline player (sandboxed YT iframe / <video>
  // nofullscreen). Avoids loading external media on the sales page; communicates
  // the "plays in place, no click-through" behaviour.
  return (
    <div style={{ marginTop: 8, marginBottom: 8, aspectRatio: '16/9', background: '#000', border: `1px solid ${C.cardBd}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      <div style={{ width: 44, height: 44, borderRadius: '50%', border: `2px solid ${C.ac}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.ac, fontSize: 16, paddingLeft: 3 }}>▶</div>
      <div style={{ fontFamily: FN, fontSize: 9, letterSpacing: '0.14em', color: C.tm }}>{title} · FORM VIDEO</div>
      <div style={{ fontFamily: FN, fontSize: 8, letterSpacing: '0.1em', color: C.td }}>PLAYS INLINE — NO CLICK-THROUGH</div>
    </div>
  );
}

function DemoSessionExercise({ ex, open, onToggle }) {
  const doneCount = ex.sets.filter(s => s.done).length;
  const allDone = doneCount === ex.sets.length && ex.sets.length > 0;
  const COLS = '16px 1fr 1fr 0.8fr 30px';
  return (
    <div style={{ border: `1px solid ${open ? C.ac : C.cardBd}`, borderLeft: `3px solid ${allDone ? C.gn : open ? C.ac : C.cardBd}`, background: open ? 'rgba(57,189,255,0.04)' : 'transparent', marginBottom: 6 }}>
      <div onClick={onToggle} style={{ padding: 8, cursor: 'pointer' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <span style={{ fontFamily: FB, fontSize: 12.5, color: C.tx, fontWeight: 600, minWidth: 0, whiteSpace: 'normal', overflowWrap: 'break-word', lineHeight: 1.3 }}>
            {allDone && <span style={{ color: C.gn, marginRight: 4 }}>✓</span>}{ex.title}
          </span>
          <span style={{ color: '#FFF', fontSize: 12, flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>▾</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
          <span style={{ fontFamily: FN, fontSize: 13, fontWeight: 700, letterSpacing: '0.02em', color: C.ac }}>{ex.prescribed}</span>
          <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: allDone ? C.gn : C.tm }}>{doneCount}/{ex.sets.length} DONE</span>
        </div>
      </div>
      {open && (
        <div style={{ padding: '0 8px 8px' }} onClick={e => e.stopPropagation()}>
          {ex.tempo && <div style={{ fontFamily: FN, fontSize: 11, color: C.or, letterSpacing: '0.04em', marginBottom: 4 }}>⏱ {ex.tempo}</div>}
          {ex.cue && <div style={{ fontSize: 11.5, color: C.tx, lineHeight: 1.45, marginBottom: 6, background: 'rgba(57,189,255,0.06)', borderInlineStart: `3px solid ${C.ac}`, padding: '6px 8px', direction: isHeb(ex.cue) ? 'rtl' : 'ltr', fontFamily: isHeb(ex.cue) ? FH : FB }}>{ex.cue}</div>}
          <DemoInlineVideo title={ex.title} />
          <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 4, marginTop: 8, marginBottom: 2 }}>
            {['', 'REPS', 'KG', 'RPE', '✓'].map((h, i) => <span key={i} style={{ fontFamily: FN, fontSize: 8, fontWeight: 700, letterSpacing: '0.06em', color: C.tm, textAlign: 'center' }}>{h}</span>)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {ex.sets.map((s, si) => (
              <div key={si} style={{ display: 'grid', gridTemplateColumns: COLS, gap: 4, alignItems: 'center' }}>
                <span style={{ fontFamily: FN, fontSize: 10, color: C.td, textAlign: 'center' }}>{si + 1}</span>
                <input defaultValue={s.reps} placeholder="reps" style={dCell} />
                <input defaultValue={s.kg} placeholder="kg" style={dCell} />
                <input defaultValue={s.rpe} placeholder="—" style={dCell} />
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <input type="checkbox" defaultChecked={s.done} style={{ width: 18, height: 18, accentColor: C.gn, cursor: 'pointer' }} />
                </label>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DemoGroupFloor() {
  const roster = MOCK_TRAINEES.slice(0, 3);
  const [open, setOpen] = useState({}); // `${athleteIdx}:${exId}` -> bool
  const [checkedIn, setCheckedIn] = useState({ 0: true, 1: true });
  return (
    <div>
      {/* Floor bar */}
      <div style={{ background: C.sf, border: `1px solid ${C.cardBd}`, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: `1px solid ${C.cardBd}` }}>
          <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: '0.04em', textTransform: 'uppercase', color: C.ac, fontFamily: FN }}>
            ON THE FLOOR · {Object.values(checkedIn).filter(Boolean).length}/{roster.length} CHECKED IN
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ ...baseBtn, background: 'transparent', color: C.tm, border: `1px solid ${C.bd}`, padding: '4px 12px', fontSize: 11 }}>+ ADD</button>
            <button style={{ ...baseBtn, background: 'transparent', color: C.tm, border: `1px solid ${C.bd}`, padding: '4px 12px', fontSize: 11 }}>■ FINISH</button>
          </div>
        </div>
      </div>
      {/* Athlete cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
        {roster.map((t, ai) => {
          const inFloor = !!checkedIn[ai];
          return (
            <div key={t.id} style={{ background: C.sf, border: `1px solid ${inFloor ? C.ac : C.cardBd}`, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderBottom: `1px solid ${C.cardBd}` }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: FN, fontSize: 13, fontWeight: 700, color: C.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</div>
                  <div style={{ fontFamily: FN, fontSize: 10, color: C.tm, letterSpacing: '0.04em' }}>Day A · W4</div>
                </div>
                <button onClick={() => setCheckedIn(p => ({ ...p, [ai]: !p[ai] }))} style={{ ...baseBtn, background: inFloor ? C.gn : 'transparent', color: inFloor ? '#FFF' : C.tm, border: `1px solid ${inFloor ? C.gn : C.bd}`, padding: '4px 10px', fontSize: 10 }}>{inFloor ? '✓ IN' : 'CHECK IN'}</button>
              </div>
              <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {DEMO_SESSION_DAY.map(ex => {
                  const k = `${ai}:${ex.id}`;
                  return <DemoSessionExercise key={ex.id} ex={ex} open={!!open[k]} onToggle={() => setOpen(p => ({ ...p, [k]: !p[k] }))} />;
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DemoSingle() {
  const [openAthlete, setOpenAthlete] = useState(null);
  const [active, setActive] = useState(null); // {name, day}
  const [openEx, setOpenEx] = useState({ sx1: true });
  if (active) {
    const doneSets = DEMO_SESSION_DAY.reduce((a, ex) => a + ex.sets.filter(s => s.done).length, 0);
    const totalSets = DEMO_SESSION_DAY.reduce((a, ex) => a + ex.sets.length, 0);
    const pct = Math.round((doneSets / totalSets) * 100);
    return (
      <div>
        <div style={{ position: 'sticky', top: 60, zIndex: 20, background: C.bg, paddingBottom: 10, marginBottom: 8, borderBottom: `1px solid ${C.cardBd}` }}>
          <button onClick={() => setActive(null)} style={{ background: 'none', border: 'none', color: C.ac, cursor: 'pointer', fontFamily: FN, fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', padding: 0, marginBottom: 8 }}>← BACK</button>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontFamily: FN, color: C.tm, marginBottom: 4 }}>
            <span>{active.day} · {active.name}</span>
            <span style={{ color: C.tx, fontWeight: 700 }}>W4 · {doneSets}/{totalSets} · {pct}%</span>
          </div>
          <div style={{ background: C.sf, border: `1px solid ${C.cardBd}`, height: 6, overflow: 'hidden' }}><div style={{ background: C.gn, height: '100%', width: `${pct}%` }} /></div>
        </div>
        {/* Camera/Movement tools — real 1-on-1 mode pairs the logger with these. */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          {['◉ MOVEMENT LAB', '◉ AR FORM', '◉ JUMP TEST'].map((t, i) => (
            <button key={i} onClick={e => e.stopPropagation()} title="Camera tool (demo only)" style={{ flex: '1 1 auto', background: 'var(--c-sf)', border: `1px solid ${C.ac}`, color: C.ac, borderRadius: 0, padding: '8px 12px', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer', whiteSpace: 'nowrap' }}>{t}</button>
          ))}
        </div>
        {DEMO_SESSION_DAY.map(ex => (
          <div key={ex.id} style={{ background: C.sf, border: `1px solid ${C.cardBd}`, borderLeft: `3px solid ${ex.sets.every(s => s.done) && ex.sets.length ? C.gn : C.cardBd}`, marginBottom: 10, padding: 4 }}>
            <DemoSessionExercise ex={ex} open={!!openEx[ex.id]} onToggle={() => setOpenEx(p => ({ ...p, [ex.id]: !p[ex.id] }))} />
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
          <button style={{ ...baseBtn, background: C.gn, color: '#06251a', padding: '14px 48px', fontSize: 14, fontWeight: 700 }}>Complete Workout</button>
        </div>
      </div>
    );
  }
  return (
    <div>
      <h3 style={{ fontFamily: FN, fontSize: 12, color: C.td, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 12px', fontWeight: 600 }}>Start a Session</h3>
      <div style={{ display: 'flex', flexDirection: 'column', border: `1px solid ${C.cardBd}` }}>
        {MOCK_TRAINEES.slice(0, 6).map((t, i) => {
          const isOpen = openAthlete === t.id;
          const dayNames = (MOCK_PLAN_INDEX.find(p => p.traineeId === t.id)?.dayNames) || ['Day A', 'Day B', 'Day C'];
          return (
            <div key={t.id} style={{ borderTop: i === 0 ? 'none' : `1px solid ${C.cardBd}` }}>
              <button onClick={() => setOpenAthlete(isOpen ? null : t.id)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: isOpen ? C.sf : 'transparent', border: 'none', cursor: 'pointer', padding: '12px 14px', textAlign: 'left' }}>
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <span style={{ fontFamily: isHeb(t.name) ? FH : FB, fontSize: 14, fontWeight: 600, color: C.tx }}>{t.name}</span>
                  <span style={{ fontFamily: FN, fontSize: 11, color: C.tm }}>BLOCK #4</span>
                </span>
                <span style={{ fontFamily: FN, fontSize: 12, color: '#FFF', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>▾</span>
              </button>
              {isOpen && (
                <div style={{ padding: '0 14px 14px' }}>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
                    <span style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', color: C.tm, marginRight: 2 }}>LOG INTO</span>
                    {[1, 2, 3, 4].map(wn => <span key={wn} style={{ minWidth: 32, textAlign: 'center', padding: '3px 0', border: `${wn === 4 ? '2px' : '1px'} solid ${wn === 4 ? C.ac : C.bd}`, background: wn === 4 ? 'rgba(57,189,255,0.1)' : 'transparent', color: wn === 4 ? C.ac : C.tm, fontFamily: FN, fontSize: 10, fontWeight: 700 }}>W{wn}</span>)}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {dayNames.map((dn, di) => (
                      <button key={di} onClick={() => setActive({ name: t.name, day: dn })} style={{ ...baseBtn, background: di === 0 ? 'rgba(57,189,255,0.1)' : 'transparent', color: di === 0 ? C.ac : C.tm, border: `1px solid ${di === 0 ? 'rgba(57,189,255,0.45)' : C.bd}`, padding: '5px 12px', fontSize: 12 }}>▶ {dn}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DemoSessions() {
  const [mode, setMode] = useState('group');
  const pill = (active) => ({ ...baseBtn, background: active ? C.acD : 'transparent', color: active ? C.ac : C.tm, border: `1px solid ${active ? C.ac : C.bd}`, padding: '6px 18px', fontSize: 12, letterSpacing: 1.5 });
  return (
    <section>
      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        <button onClick={() => setMode('group')} style={pill(mode === 'group')}>GROUP FLOOR</button>
        <button onClick={() => setMode('single')} style={pill(mode === 'single')}>1-ON-1</button>
      </div>
      {mode === 'group' ? <DemoGroupFloor /> : <DemoSingle />}
    </section>
  );
}

// ── REVIEW · TOOLS launcher — mirrors src/ReviewToolsView.jsx. The owner-only
// camera/pose suite. In the demo we show the real launcher but DON'T load
// MediaPipe/three.js — clicking a tool explains it runs live in the full app. ──
const DEMO_REVIEW_TOOLS = [
  { key: 'lab', label: 'MOVEMENT LAB', measures: 'Rotatable 3D skeleton rebuilt from the lift', live: false },
  { key: 'metrics', label: 'LIFT METRICS', measures: 'Bar speed (VBT) + velocity-loss · ROM + tempo + collapse flags', live: false },
  { key: 'jump', label: 'JUMP TEST', measures: 'Jump height from flight time · estimated peak power', live: false },
  { key: 'live', label: 'LIVE COACH', measures: 'Real-time reps + depth target + bar-path drift on the live feed', live: true },
];
function DemoReviewTools() {
  const [title, setTitle] = useState('Back Squat');
  const [note, setNote] = useState(false);
  const [hover, setHover] = useState(null);
  return (
    <div>
      <div style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, color: C.tm, textTransform: 'uppercase', letterSpacing: '0.2em', marginBottom: 8 }}>REVIEW · TOOLS</div>
      <h2 style={{ fontFamily: FB, fontSize: 24, fontWeight: 800, letterSpacing: '-0.01em', color: C.tx, margin: '0 0 8px' }}>Measure the lift</h2>
      <div style={{ color: C.tm, fontSize: 13, marginBottom: 20, fontFamily: FB, maxWidth: 560, lineHeight: 1.5 }}>
        Camera &amp; pose tools to read a set — bar speed, range of motion, jump power, live coaching. Owner trial; nothing is saved to the athlete.
      </div>
      <div style={{ marginBottom: 20, maxWidth: 380 }}>
        <label style={{ display: 'block', fontFamily: FN, fontSize: 9, color: C.td, letterSpacing: '0.16em', fontWeight: 700, marginBottom: 7, textTransform: 'uppercase' }}>Exercise · for Lab / Metrics / Live</label>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Back Squat" style={{ width: '100%', boxSizing: 'border-box', background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, color: C.tx, fontFamily: FB, fontSize: 14, padding: '11px 13px', borderRadius: 0, outline: 'none' }} />
      </div>
      <div style={{ borderBottom: `1px solid ${C.cardBd}` }}>
        {DEMO_REVIEW_TOOLS.map(t => {
          const active = hover === t.key;
          return (
            <div key={t.key} role="button" tabIndex={0} onClick={() => setNote(true)} onMouseEnter={() => setHover(t.key)} onMouseLeave={() => setHover(null)}
              style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 12px', borderTop: `1px solid ${C.cardBd}`, cursor: 'pointer', background: active ? 'rgba(57,189,255,0.05)' : 'transparent', transition: 'background .15s' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: FN, fontSize: 14, fontWeight: 700, letterSpacing: '0.03em', color: C.tx }}>{t.label}</div>
                <div style={{ fontFamily: FB, fontSize: 12, color: C.tm, marginTop: 3, lineHeight: 1.4 }}>{t.measures}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                <span style={{ fontFamily: FN, fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', color: t.live ? '#FF7A7A' : C.tm, border: `1px solid ${t.live ? 'rgba(255,90,90,0.5)' : C.cardBd}`, padding: '2px 6px', whiteSpace: 'nowrap' }}>{t.live ? 'LIVE' : 'CLIP'}</span>
                <span style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: C.ac, transform: active ? 'translateX(3px)' : 'none', transition: 'transform .15s', whiteSpace: 'nowrap' }}>OPEN →</span>
              </div>
            </div>
          );
        })}
      </div>
      {note && (
        <div style={{ marginTop: 16, background: C.acD, border: `1px solid ${C.cardBd}`, borderLeft: `3px solid ${C.ac}`, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <span style={{ fontFamily: FB, fontSize: 13, color: C.tx }}>The camera + pose tools run live in the full app — disabled in this demo. Join the waitlist to use them on your own clips.</span>
          <button onClick={() => setNote(false)} style={{ ...baseBtn, background: 'transparent', color: C.tm, border: `1px solid ${C.bd}`, padding: '5px 12px', fontSize: 10, flexShrink: 0 }}>DISMISS</button>
        </div>
      )}
    </div>
  );
}

// ── TASKS — mirrors src/TasksV8View.jsx. Owner tabs + source-grouped board +
// status pills + GCal embed + composer. Static mock, no writes. ──────────────
const DEMO_TASKS = [
  { id: 1, src: 'center', title: 'Renew gym insurance policy', due: 'Today', status: 'working', who: 'OHAD' },
  { id: 2, src: 'center', title: 'Order bumper plates (20kg × 4)', due: 'Tomorrow', status: 'open', who: 'OHAD' },
  { id: 3, src: 'athlete', title: 'Noa — deload week, cut volume 30%', due: 'Today', status: 'open', who: 'OHAD' },
  { id: 4, src: 'athlete', title: 'Gal — check knee after last squat session', due: 'OVERDUE · YESTERDAY', status: 'waiting', who: 'YUVAL' },
  { id: 5, src: 'manual', title: 'Film 3 exercise demos for the library', due: 'This week', status: 'open', who: 'SHARED' },
  { id: 6, src: 'auto', title: 'Amit — no workout logged in 6 days', due: 'Auto', status: 'open', who: 'OHAD' },
  { id: 7, src: 'auto', title: 'Roey — payment overdue 12 days', due: 'Auto', status: 'stuck', who: 'OHAD' },
  { id: 8, src: 'manual', title: 'Plan Q3 athlete testing day', due: 'Aug 1', status: 'done', who: 'SHARED' },
  { id: 9, src: 'center', title: 'Fix the cable machine pulley', due: 'This week', status: 'working', who: 'YUVAL' },
];
const TASK_SRC = { center: { label: 'PERFORMANCE CENTER', color: C.ac }, athlete: { label: 'ATHLETE FLAGS', color: C.or }, manual: { label: 'MANUAL', color: C.rd }, auto: { label: 'AUTO-ALERTS', color: '#2DD4BF' } };
// 5 status columns — mirrors the real board's STATUS_HEAD (To Do→Done kanban).
const STATUS_COLS = [
  { id: 'open',    label: 'TO DO',       color: '#5B6B7A' },
  { id: 'working', label: 'IN PROGRESS', color: '#2C82C9' },
  { id: 'waiting', label: 'WAITING',     color: '#C9851E' },
  { id: 'stuck',   label: 'STUCK',       color: '#C0392B' },
  { id: 'done',    label: 'DONE',        color: '#2E9E5B' },
];
function DemoTasks() {
  const [owner, setOwner] = useState('OHAD');
  const [view, setView] = useState('board');
  const visible = DEMO_TASKS.filter(t => owner === 'ALL' ? true : (t.who === owner || (owner === 'SHARED' && t.who === 'SHARED')));
  const counts = { OHAD: DEMO_TASKS.filter(t => t.who === 'OHAD').length, YUVAL: DEMO_TASKS.filter(t => t.who === 'YUVAL').length, SHARED: DEMO_TASKS.filter(t => t.who === 'SHARED').length };
  const pill = (active) => ({ ...baseBtn, background: active ? C.acD : 'transparent', color: active ? C.ac : C.tm, border: `1px solid ${active ? C.ac : C.bd}`, padding: '5px 14px', fontSize: 11, letterSpacing: 1 });
  const bySrc = (s) => visible.filter(t => t.src === s);
  return (
    <section>
      {/* Owner tabs + view toggle */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {['OHAD', 'YUVAL', 'SHARED'].map(o => <button key={o} onClick={() => setOwner(o)} style={pill(owner === o)}>{o} <span style={{ opacity: 0.7, fontSize: 9 }}>{counts[o]}</span></button>)}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['list', 'board'].map(v => <button key={v} onClick={() => setView(v)} style={pill(view === v)}>{v.toUpperCase()}</button>)}
        </div>
      </div>
      {/* Quick filter chips (visual) */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        {['TODAY', 'OVERDUE', 'STUCK', 'NO DATE'].map(c => <span key={c} style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: C.tm, border: `1px solid ${C.bd}`, padding: '4px 10px' }}>{c}</span>)}
      </div>
      {/* Composer (collapsed affordance) */}
      <div style={{ ...demoCardStyle({ marginBottom: 16, cursor: 'text', display: 'flex', alignItems: 'center', gap: 10 }) }}>
        <span style={{ color: C.ac, fontSize: 16, fontWeight: 700 }}>+</span>
        <span style={{ fontFamily: FB, fontSize: 13, color: C.tm }}>Add a task…</span>
      </div>
      {/* BOARD = status kanban (mirrors the real board); LIST = source-grouped */}
      {view === 'board' ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-start' }}>
          {STATUS_COLS.map(col => {
            const rows = visible.filter(t => t.status === col.id);
            return (
              <div key={col.id} style={{ flex: '1 1 175px', minWidth: 175, border: `1px solid ${C.bd}`, display: 'flex', flexDirection: 'column' }}>
                <div style={{ background: col.color, color: '#FFFFFF', padding: '7px 10px', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>{col.label}</span><span style={{ opacity: 0.85 }}>{rows.length}</span>
                </div>
                <div style={{ padding: 6, display: 'flex', flexDirection: 'column', gap: 6, minHeight: 46 }}>
                  {rows.map(t => {
                    const meta = TASK_SRC[t.src];
                    const overdue = /OVERDUE/i.test(t.due);
                    return (
                      <div key={t.id} style={demoCardStyle({ borderLeft: `3px solid ${meta.color}`, padding: 9, display: 'flex', flexDirection: 'column', gap: 5 })}>
                        <span style={{ fontFamily: FB, fontSize: 12, color: C.tx, lineHeight: 1.3 }}>{t.title}</span>
                        <span style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.04em', color: overdue ? C.tx : C.tm, border: overdue ? `1px solid ${C.bd}` : 'none', padding: overdue ? '2px 6px' : 0, alignSelf: 'flex-start' }}>{t.due}</span>
                      </div>
                    );
                  })}
                  {rows.length === 0 && <div style={{ padding: '8px 4px', textAlign: 'center', color: C.td, fontSize: 9, fontFamily: FN }}>—</div>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        ['center', 'athlete', 'manual', 'auto'].map(s => {
          const rows = bySrc(s);
          if (!rows.length) return null;
          const meta = TASK_SRC[s];
          return (
            <div key={s} style={{ marginBottom: 18 }}>
              <div style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', color: meta.color, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, background: meta.color, display: 'inline-block' }} />{meta.label} <span style={{ color: C.td }}>{rows.length}</span>
              </div>
              {rows.map(t => {
                const col = STATUS_COLS.find(c => c.id === t.status) || STATUS_COLS[0];
                const overdue = /OVERDUE/i.test(t.due);
                return (
                  <div key={t.id} style={demoCardStyle({ marginBottom: 6, borderLeft: `3px solid ${meta.color}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 12 })}>
                    <span style={{ fontFamily: FB, fontSize: 13, color: C.tx, textDecoration: t.status === 'done' ? 'line-through' : 'none', opacity: t.status === 'done' ? 0.6 : 1 }}>{t.title}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                      <span style={{ fontFamily: FN, fontSize: 10, color: overdue ? C.tx : C.tm }}>{t.due}</span>
                      <span style={{ fontFamily: FN, fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', color: '#FFFFFF', background: col.color, padding: '3px 7px' }}>{col.label}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })
      )}
      {/* Google Calendar embed strip (collapsed, demo-disabled connect) */}
      <div style={{ ...demoCardStyle({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 8 }) }}>
        <div>
          <div style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: C.tx }}>📅 GOOGLE CALENDAR</div>
          <div style={{ fontFamily: FB, fontSize: 12, color: C.tm, marginTop: 3 }}>Your appointments alongside tasks.</div>
        </div>
        <button style={{ ...baseBtn, background: 'transparent', color: C.td, border: `1px solid ${C.bd}`, padding: '5px 12px', fontSize: 10, cursor: 'not-allowed', opacity: 0.6 }}>CONNECT</button>
      </div>
    </section>
  );
}

// ── BILLING — mirrors src/BillingView.jsx (bit_payment_requests ledger).
// Israeli VAT 18% → pre-VAT multiplier 0.8475. Static mock, no writes. ───────
// Names + statuses mirror the roster (MOCK_TRAINEES): Hebrew names like the
// rest of the demo (was Latin — the same people appeared in two scripts across
// tabs), and each row's status matches that athlete's payment state (Noa PAID,
// Gal OVERDUE→pending, the Yael+Idan couple PAID, split 600+600 = their ₪1,200).
const DEMO_PAYMENTS = [
  { id: 1, name: 'נועה לוי', amount: 800, status: 'paid', date: '2026-06-20', ref: 'June coaching' },
  { id: 2, name: 'גל מזרחי', amount: 800, status: 'pending', date: '2026-06-15', ref: 'June + plan' },
  { id: 3, name: 'עידן כהן', amount: 600, status: 'paid', date: '2026-06-10', ref: 'June coaching (couple)' },
  { id: 4, name: 'יעל כהן', amount: 600, status: 'paid', date: '2026-06-08', ref: 'June coaching (couple)' },
];
const PAY_STATUS = { pending: { label: 'PENDING', color: C.or }, paid: { label: 'PAID', color: C.gn }, canceled: { label: 'CANCELED', color: C.td } };
const fmtIls = (n) => `₪${Number(n).toLocaleString()}`;
function DemoBilling() {
  const [showReq, setShowReq] = useState(false);
  const [amount, setAmount] = useState('600');
  const [vatPct, setVatPct] = useState('18');   // editable VAT %, like the real Billing
  const pending = DEMO_PAYMENTS.filter(p => p.status === 'pending');
  const preVat = Math.round((Number(amount) || 0) / (1 + (Number(vatPct) || 0) / 100));
  const panel = (children) => <div style={{ background: C.sf, border: `1px solid ${C.cardBd}`, marginBottom: 16 }}>{children}</div>;
  const stripH = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: `1px solid ${C.cardBd}` };
  return (
    <section>
      {panel(<>
        <div style={stripH}>
          <span style={{ fontFamily: FN, fontSize: 13, fontWeight: 700, letterSpacing: '0.04em', color: C.ac }}>PAYMENT REQUESTS {pending.length > 0 && <span style={{ color: C.or }}>· {pending.length} PENDING</span>}</span>
          <button onClick={() => setShowReq(true)} style={{ ...baseBtn, background: 'transparent', color: C.ac, border: `1px solid ${C.ac}`, padding: '5px 12px', fontSize: 11 }}>+ NEW REQUEST</button>
        </div>
        <div>
          {DEMO_PAYMENTS.map(p => {
            const st = PAY_STATUS[p.status];
            return (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '12px 14px', borderTop: `1px solid ${C.cardBd}` }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: FB, fontSize: 13, fontWeight: 600, color: C.tx }}>{p.name} · {fmtIls(p.amount)}</div>
                  <div style={{ fontFamily: FB, fontSize: 11, color: C.tm, marginTop: 2 }}>{p.ref} · {fmtPrettyDate(p.date)}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <span style={{ fontFamily: FN, fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', color: st.color, border: `1px solid ${st.color}55`, padding: '2px 6px' }}>{st.label}</span>
                  {p.status === 'pending' && <button style={{ ...baseBtn, background: 'transparent', color: C.gn, border: `1px solid ${C.gn}55`, padding: '3px 8px', fontSize: 9 }}>MARK PAID</button>}
                </div>
              </div>
            );
          })}
        </div>
      </>)}
      {panel(<>
        <div style={stripH}><span style={{ fontFamily: FN, fontSize: 13, fontWeight: 700, letterSpacing: '0.04em', color: C.ac }}>ROSTER STATUS</span></div>
        <div>
          {MOCK_TRAINEES.slice(0, 5).map((t, i) => {
            const st = PAY_STATUS[['paid', 'pending', 'paid', 'pending', 'paid'][i] || 'paid'];
            return (
              <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderTop: `1px solid ${C.cardBd}` }}>
                <span style={{ fontFamily: FB, fontSize: 13, color: C.tx }}>{t.name}</span>
                <span style={{ fontFamily: FN, fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', color: st.color, border: `1px solid ${st.color}55`, padding: '2px 6px' }}>{st.label}</span>
              </div>
            );
          })}
        </div>
      </>)}
      {showReq && createPortal((
        <div onClick={() => setShowReq(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.bg, border: `1px solid ${C.cardBd}`, padding: 24, maxWidth: 380, width: '100%' }}>
            <div style={{ fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: '0.18em', fontWeight: 700, marginBottom: 14, textAlign: 'center' }}>NEW PAYMENT REQUEST</div>
            <select style={{ width: '100%', background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, color: C.tx, fontFamily: FB, fontSize: 14, padding: '11px 13px', marginBottom: 10, outline: 'none' }}>
              {MOCK_TRAINEES.map(t => <option key={t.id}>{t.name}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input value={amount} onChange={e => setAmount(e.target.value)} type="number" placeholder="Amount (₪, VAT incl.)" style={{ flex: 2, minWidth: 0, boxSizing: 'border-box', background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, color: C.tx, fontFamily: FB, fontSize: 14, padding: '11px 13px', outline: 'none' }} />
              <input value={vatPct} onChange={e => setVatPct(e.target.value)} type="number" placeholder="VAT %" title="VAT %" style={{ width: 80, flexShrink: 0, boxSizing: 'border-box', background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, color: C.tx, fontFamily: FB, fontSize: 14, padding: '11px 13px', outline: 'none', textAlign: 'center' }} />
            </div>
            <div style={{ fontFamily: FN, fontSize: 11, color: C.tm, marginBottom: 14, textAlign: 'center' }}>VAT {vatPct || 0}% incl. · pre-VAT <span style={{ color: C.ac, fontWeight: 700 }}>{fmtIls(preVat)}</span></div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowReq(false)} style={{ ...baseBtn, flex: 1, background: 'transparent', color: C.tm, border: `1px solid ${C.cardBd}`, padding: '10px 0', fontSize: 11 }}>CANCEL</button>
              <button onClick={() => setShowReq(false)} style={{ ...baseBtn, flex: 1, background: 'transparent', color: C.ac, border: `1px solid ${C.ac}`, padding: '10px 0', fontSize: 11 }}>CREATE</button>
            </div>
          </div>
        </div>
      ), document.body)}
    </section>
  );
}

// Pull a tab key out of the URL path. Valid keys come from TABS; an unknown
// or empty trailing segment falls back to dashboard so /demo/coach itself
// renders the dashboard without forcing a redirect.
const TAB_KEYS = TABS.map(t => t.key);
function tabFromPath(p) {
  const m = (p || '').match(/^\/demo\/coach\/([^/?#]+)/);
  if (!m) return 'dashboard';
  return TAB_KEYS.includes(m[1]) ? m[1] : 'dashboard';
}
// Deep-link the selected item so every navigational click has its own URL:
//   /demo/coach/trainees/<id>   → trainee detail
//   /demo/coach/programs/<id>   → program open
function traineeIdFromPath(p) {
  const m = (p || '').match(/^\/demo\/coach\/trainees\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}
function programIdFromPath(p) {
  const m = (p || '').match(/^\/demo\/coach\/programs\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export default function CoachDemo() {
  const [tab, setTab] = useState(() => typeof window === 'undefined' ? 'dashboard' : tabFromPath(window.location.pathname));
  // Deep-link support: if the URL already points at a trainee, open it.
  const [selectedTrainee, setSelectedTrainee] = useState(() => typeof window === 'undefined' ? null : traineeIdFromPath(window.location.pathname));
  // Track where the trainee-detail view was reached from so the back button
  // returns to the source surface instead of always landing on the Trainees tab.
  const [returnTab, setReturnTab] = useState('trainees');
  // Review sub-view: WORKOUTS (the engine sandbox, always mounted to warm up) vs
  // TOOLS (the camera/pose launcher) — mirrors the real Review ▾ dropdown.
  const [reviewSub, setReviewSub] = useState('workouts');

  // Tab → URL: each tab gets its own path under /demo/coach/<key> so users
  // can deep-link, refresh, and use browser back/forward. Dashboard sits at
  // the bare /demo/coach for shareability.
  const navigateToTab = (key) => {
    setTab(key);
    setSelectedTrainee(null);
    if (typeof window === 'undefined') return;
    const target = key === 'dashboard' ? '/demo/coach' : `/demo/coach/${key}`;
    if (window.location.pathname !== target) {
      window.history.pushState({ tab: key }, '', target + window.location.hash);
    }
  };

  // Browser back/forward: keep the React tab in sync with the URL the user
  // navigated to. popstate fires on both back and forward, plus on any
  // external pushState (e.g. nav from another component).
  // Open a trainee's detail AND give it its own URL so the click is
  // deep-linkable + back-button correct. (navigateToTab clears the selection,
  // so selecting must push its own path rather than route through it — that
  // ordering also fixes the old onJumpToTrainee, which set the trainee then
  // immediately had navigateToTab null it out.)
  const selectTrainee = (id, sourceTab = 'trainees') => {
    setReturnTab(sourceTab);
    setTab('trainees');
    setSelectedTrainee(id);
    if (typeof window === 'undefined') return;
    const target = `/demo/coach/trainees/${encodeURIComponent(id)}`;
    if (window.location.pathname !== target) {
      window.history.pushState({ tab: 'trainees', trainee: id }, '', target + window.location.hash);
    }
  };

  // Keep BOTH tab and selected trainee in sync with the URL on back/forward.
  useEffect(() => {
    const onPop = () => {
      setTab(tabFromPath(window.location.pathname));
      setSelectedTrainee(traineeIdFromPath(window.location.pathname));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const onJumpToTrainee = (id, sourceTab = 'trainees') => selectTrainee(id, sourceTab);
  const onClearTrainee = () => {
    setSelectedTrainee(null);
    const back = returnTab !== 'trainees' ? returnTab : 'trainees';
    setReturnTab('trainees');
    if (back !== 'trainees') setTab(back);
    if (typeof window !== 'undefined') {
      const target = back === 'dashboard' ? '/demo/coach' : `/demo/coach/${back}`;
      if (window.location.pathname !== target) window.history.pushState({ tab: back }, '', target + window.location.hash);
    }
  };


  return (
    // /demo/coach — public marketing demo of the coach app. Force dark
    // while the live coach app's light-mode rollout is gated.
    <div data-theme="dark" style={{
      background: C.bg, color: C.tx, minHeight: '100vh', fontFamily: FB,
      display: 'flex', flexDirection: 'column',
    }}>
      <style>{`
        a:focus-visible, button:focus-visible {
          outline: 2px solid ${C.ac}; outline-offset: 2px; border-radius: 4px;
        }
        /* Hide horizontal scrollbar on the header so the tab strip glides
           on phones without showing a chunky scrollbar track. */
        .cd-hdr::-webkit-scrollbar { display: none; }
        .cd-hdr { -ms-overflow-style: none; scrollbar-width: none; }
        /* Hide the COACH DEMO badge under 640px — the EXPO logo + tab labels
           already convey context, and the badge takes valuable phone width. */
        @media (max-width: 640px) {
          .cd-badge { display: none !important; }
          .cd-cta-waitlist { padding: 6px 10px !important; }
        }
        /* Programs table on phones — let it scroll horizontally instead of
           cramping every column. */
        @media (max-width: 540px) {
          .cd-prog-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
          .cd-prog-table { min-width: 520px; }
        }
        /* Programs block-history sidebar collapses to a single row on phones
           so the editor still gets full width. */
        @media (max-width: 720px) {
          .cd-prog-grid { grid-template-columns: 1fr !important; }
        }
        /* Exercise filter row collapses to 2 cols on phones so labels stay
           readable. Default is 3 cols, matching the real coach app. */
        @media (max-width: 540px) {
          .cd-ex-filters { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>

      {/* Header */}
      <header style={{
        background: C.sf, borderBottom: `1px solid ${C.bd}`,
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div className="cd-hdr" style={{
          maxWidth: 1280, margin: '0 auto', padding: '0 16px',
          display: 'flex', alignItems: 'center', height: 60, gap: 12, overflowX: 'auto',
        }}>
          <a href="/" style={{ display: 'flex', alignItems: 'center', flex: '0 0 auto', textDecoration: 'none' }}>
            <EXPOMark theme="dark" height={36} style={{ marginBottom: 0 }} />
          </a>
          <span className="cd-badge" style={{
            fontFamily: FN, fontSize: 10, color: C.ac, letterSpacing: 2, fontWeight: 700,
            padding: '4px 8px', background: C.acD, borderRadius: 0,
            border: `1px solid ${C.cardBd}`, whiteSpace: 'nowrap',
          }}>COACH DEMO</span>
          <nav role="tablist" aria-label="Coach demo tabs" style={{
            display: 'flex', gap: 2, flex: '1 1 auto', justifyContent: 'center',
            minWidth: 'max-content',
          }}>
            {TABS.map((t, i) => (
              <button key={t.key} role="tab" aria-selected={tab === t.key}
                tabIndex={tab === t.key ? 0 : -1}
                onClick={() => navigateToTab(t.key)}
                onKeyDown={e => {
                  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return;
                  e.preventDefault();
                  let nextIdx = i;
                  if (e.key === 'ArrowRight') nextIdx = (i + 1) % TABS.length;
                  else if (e.key === 'ArrowLeft') nextIdx = (i - 1 + TABS.length) % TABS.length;
                  else if (e.key === 'Home') nextIdx = 0;
                  else if (e.key === 'End') nextIdx = TABS.length - 1;
                  const nextKey = TABS[nextIdx].key;
                  navigateToTab(nextKey);
                  // focus moves to the newly-active tab so screen-readers track
                  setTimeout(() => {
                    const el = document.querySelector(`[role="tab"][data-key="${nextKey}"]`);
                    if (el) el.focus();
                  }, 0);
                }}
                data-key={t.key}
                style={{
                  ...baseBtn,
                  // baseBtn has alignItems:'center', which centers the LINE
                  // BOXES of label (font-size 11) and count (font-size 10).
                  // Visually that floats the count above the label's baseline
                  // because digits in JetBrains Mono align to cap-height, not
                  // x-height. Switching to baseline pins both glyphs' baselines
                  // to the same line — the count tucks right next to the label.
                  alignItems: 'baseline',
                  background: tab === t.key ? C.acD : 'transparent',
                  color: tab === t.key ? C.ac : C.tm,
                  padding: '6px 12px', fontSize: 11, letterSpacing: 1.5,
                  whiteSpace: 'nowrap', gap: 4,
                }}>
                <span>{t.label}</span>
                {t.count != null && (
                  <span style={{ fontSize: 10, color: tab === t.key ? C.ac : C.td, fontFamily: FN }}>{t.count}</span>
                )}
              </button>
            ))}
          </nav>
          <a href="/demo#waitlist" className="cd-cta-waitlist" style={{
            ...baseBtn, background: C.ac, color: C.acOnSurface,
            padding: '6px 14px', fontSize: 11, flex: '0 0 auto',
          }}>JOIN WAITLIST →</a>
        </div>
      </header>

      {/* POV banner — same shape as the engine sandbox to keep UX coherent */}
      <div style={{
        borderBottom: `1px solid ${C.bd}`,
        background: `linear-gradient(180deg, ${C.sf} 0%, ${C.bg} 100%)`,
      }}>
        <div style={{
          maxWidth: 1280, margin: '0 auto', padding: '12px 16px',
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontFamily: FN, fontSize: 10, color: C.ac, letterSpacing: 1.8, fontWeight: 700,
            background: C.acD, border: `1px solid ${C.cardBd}`,
            borderRadius: 0, padding: '4px 9px', whiteSpace: 'nowrap',
          }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            COACH VIEW
          </div>
          <div style={{
            fontFamily: FB, fontSize: 13, color: C.tx, opacity: 0.85, lineHeight: 1.45,
            flex: '1 1 auto', minWidth: 200,
          }}>
            <b style={{ opacity: 1 }}>Your</b> side of the platform. Click through the tabs above. Mock data — nothing here writes to your account.
          </div>
          <a href="/demo/trainee" style={{
            ...baseBtn,
            background: 'transparent', color: C.tm,
            border: `1px solid ${C.bd}`, padding: '5px 12px', fontSize: 10, letterSpacing: 1.5,
            flex: '0 0 auto',
          }}>SEE ATHLETE VIEW →</a>
        </div>
      </div>

      <main style={{ flex: 1, padding: '28px 16px 80px', maxWidth: 1280, margin: '0 auto', width: '100%' }}>
        {tab === 'dashboard' && <DemoDashboard onJumpToTrainee={onJumpToTrainee} />}
        {tab === 'trainees'  && <DemoTrainees selected={selectedTrainee} onSelect={(id) => selectTrainee(id, 'trainees')} onClear={onClearTrainee} returnTab={returnTab} />}
        {tab === 'programs'  && <DemoPrograms />}
        {tab === 'exercises' && <DemoExercises />}
        {tab === 'workouts'  && <DemoWorkouts />}
        {tab === 'sessions'  && <DemoSessions />}
        {tab === 'tasks'     && <DemoTasks />}
        {tab === 'billing'   && <DemoBilling />}
        {/* Review ▾ — WORKOUTS (engine review) | TOOLS (camera/pose launcher). */}
        {tab === 'review' && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {[['workouts', 'WORKOUTS'], ['tools', 'TOOLS']].map(([k, l]) => (
              <button key={k} onClick={() => setReviewSub(k)} style={{ ...baseBtn, background: reviewSub === k ? C.acD : 'transparent', color: reviewSub === k ? C.ac : C.tm, border: `1px solid ${reviewSub === k ? C.ac : C.bd}`, padding: '6px 18px', fontSize: 12, letterSpacing: 1.5 }}>{l}</button>
            ))}
          </div>
        )}
        {/* Review WORKOUTS is ALWAYS mounted — display:none otherwise — so the
            /demo iframe loads its wasm + pose model in the background while the
            visitor explores. By the time they click Review, the engine is warm. */}
        <div style={{ display: tab === 'review' && reviewSub === 'workouts' ? 'block' : 'none' }}>
          <DemoReview />
        </div>
        {tab === 'review' && reviewSub === 'tools' && <DemoReviewTools />}

        {/* End CTA — every tab funnels back to the waitlist */}
        <div style={{
          marginTop: 48,
          background: `linear-gradient(135deg, ${C.sf2} 0%, ${C.sf} 100%)`,
          border: `1px solid ${C.cardBd}`, borderRadius: 0,
          padding: '24px 20px', textAlign: 'center',
        }}>
          <div style={{
            fontFamily: FN, color: C.ac, fontSize: 11, letterSpacing: 3, fontWeight: 700,
            marginBottom: 8,
          }}>FOUNDING-COACH WAITLIST</div>
          <h3 style={{
            fontFamily: FB, fontSize: 'clamp(20px, 2.6vw, 24px)', fontWeight: 700,
            margin: '0 0 10px', letterSpacing: -0.2,
          }}>Run your roster on this stack. Locked-in pricing for the first wave.</h3>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <a href="/demo#waitlist" style={{
              ...baseBtn, background: C.ac, color: C.acOnSurface, padding: '11px 22px', fontSize: 12,
            }}>JOIN THE WAITLIST</a>
            <a href="/demo/trainee" style={{
              ...baseBtn, background: 'transparent', color: C.tx,
              border: `1px solid ${C.bd2}`, padding: '11px 22px', fontSize: 12,
            }}>NOW SEE THE ATHLETE VIEW →</a>
          </div>
        </div>
      </main>

      <footer style={{
        borderTop: `1px solid ${C.bd}`, padding: '18px 16px',
        maxWidth: 1280, margin: '0 auto', width: '100%',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontFamily: FN, fontSize: 10, color: C.td, letterSpacing: 1,
        }}>
          <EXPOMark theme="dark" height={14} style={{ opacity: 0.55 }} />
          <span>· COACH DEMO · MOCK DATA · NOTHING WRITES BACK</span>
        </span>
        <span style={{ fontFamily: FN, fontSize: 10, color: C.td, letterSpacing: 1 }}>
          <a href="/demo" style={{ color: C.td, textDecoration: 'none' }}>← BACK</a>
        </span>
      </footer>
    </div>
  );
}
