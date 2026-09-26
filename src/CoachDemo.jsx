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
import { C, FN, FB, FH, CTRL_H } from './theme';
import { EXPOMark } from './expoMark';
import { SideRail } from './SideRail';
import TrainingLineageV2 from './TrainingLineageV2';
import { tr, readLang, daysAgoHe, sessionsLeftHe } from './i18n';
import { taxoHe } from './taxonomyHe';
import { YouTubeLite } from './VideoEmbed';

// The demo is many small function components and a few module-level label
// tables; one module-level helper (no hook) serves them all. Reads the
// language per call, so a ?lang=he link and the stored choice both apply.
const T = (s) => tr(readLang(), s);
// A counted phrase whose word ORDER differs by language ("18d ago" is
// "לפני 18 ימים"): the key carries a {n} slot, the number is dropped in after.
const TN = (key, n) => T(key).replace('{n}', n);
// Phones: the real app collapses every filter rail into a FILTERS toggle at
// <= 760px and stacks it above the content (TraineesView). The demo's rails
// were a fixed 204px side column, which crushed the cards off a phone screen.
function useNarrowRail() {
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 760);
  const [railOpen, setRailOpen] = useState(false);
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth <= 760);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return { narrow, railOpen, setRailOpen };
}
// Mock times are English phrases ("32 min ago", "Today 09:14", "25 Jul · 08:00").
// In Hebrew they are composed, not looked up: the number moves and 1/2 get
// their own words (daysAgoHe: 1 = אתמול, 2 = שלשום).
const MON_HE = { Jan: 'בינו׳', Feb: 'בפבר׳', Mar: 'במרץ', Apr: 'באפר׳', May: 'במאי', Jun: 'ביוני', Jul: 'ביולי', Aug: 'באוג׳', Sep: 'בספט׳', Oct: 'באוק׳', Nov: 'בנוב׳', Dec: 'בדצמ׳' };
const RT = (s) => {
  if (typeof s !== 'string' || readLang() !== 'he') return s;
  let m;
  if ((m = s.match(/^(\d+) min ago$/))) return `לפני ${m[1]} דק׳`;
  if ((m = s.match(/^(\d+) hr ago$/))) return m[1] === '1' ? 'לפני שעה' : m[1] === '2' ? 'לפני שעתיים' : `לפני ${m[1]} שעות`;
  if ((m = s.match(/^(\d+) days? ago$/))) return daysAgoHe(Number(m[1]));
  if ((m = s.match(/^(\d+) weeks? ago$/))) return m[1] === '1' ? 'לפני שבוע' : m[1] === '2' ? 'לפני שבועיים' : `לפני ${m[1]} שבועות`;
  if ((m = s.match(/^Today ([0-9]{2}:[0-9]{2})$/))) return `היום ${m[1]}`;
  if ((m = s.match(/^(\d+) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) · ([0-9]{2}:[0-9]{2})$/))) return `${m[1]} ${MON_HE[m[2]]} · ${m[3]}`;
  return T(s);
};

// Uniform dashboard title-strip height — mirrors the real app's RefinedHeaderStrip
// (minHeight 46, content vertically centred) so EVERY demo section header
// (Active Athletes / Revenue / Tasks / Messages / Expiring …) is the SAME
// vertical height. Parity with DashboardView's #261 fix (Ohad).
const DEMO_STRIP_H = { minHeight: 41, boxSizing: 'border-box', display: 'flex', alignItems: 'center' };

// THE DEMO MUST NEVER LOOK STALE.
//
// Every date in here used to be a literal: last payment 2026-04-01, payment
// requests dated June 2026. On the night before his first client demo that
// reads as a product nobody has touched since spring, and a coach shown
// "last payment: April" in September draws exactly one conclusion. Dates are
// now expressed as "N days ago" and resolved when the screen renders, so the
// tour is current whenever he opens it.
// en-GB abbreviates September as "Sept", four letters where every other month
// gets three, so a date column wobbled between "26 Aug" and "16 Sept". Fixed
// three-letter months instead of a locale that changes width on one month.
const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const backDate = (daysAgo) => {
  const d = new Date();
  d.setDate(d.getDate() - Number(daysAgo || 0));
  return d;
};
// שירה's card said 5 programs while her plans array held 3, so her row, the
// Programs rail and her own drill-in disagreed about the same athlete. The
// count was a second copy of a fact the plans array already carries; it is
// derived now and cannot drift again.
const planCount = (t) => ((t && t.plans) ? t.plans.length : 0);
const dAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - Number(n || 0)); return d.toISOString().slice(0, 10); };

// HEBREW HAS A DUAL. daysAgoHe() already knows היום / אתמול / שלשום and
// the demo was bypassing it, printing "לפני 1 ימים" — one, plural.
// ─── Mock data ────────────────────────────────────────────────────────────
// Three mock trainees — one per format type (Online / Gym Single / Gym Couple)
// with Israeli names. Enough variety to show every kind of card + filter
// without padding the demo to feel like marketing fluff.
const MOCK_TRAINEES = [
  { id: 't1', name: 'נועה לוי', short: 'Noa', email: 'noa.levi@example.co.il', phone: '+972544123456', status: 'Active', sessionsLeft: 6, monthly: 1800, format: 'Gym, Single', startDate: '2025-09-01', dormantDays: null, lastWorkout: '2 days ago', payment: 'PAID', paidDaysAgo: 12, online: true, age: 31, weight: 64, height: 168, injuries: 'L4-L5 disc bulge', goals: 'Stronger bench, fix overhead', ev: { vj: 38, bj: 185, dl: 95,  bp: 47.5 }, plans: ['Block #4 — Push/Pull Volume', 'Block #3 — Strength Base', 'Block #2 — Reset'] },
  { id: 't2', name: 'גל מזרחי', short: 'Gal', email: 'gal.mizrahi@example.co.il', phone: '+972526789012', status: 'Active', sessionsLeft: 2, monthly: 1800, format: 'Online', startDate: '2024-11-15', dormantDays: 18, lastWorkout: '18 days ago', payment: 'OVERDUE', overdueDays: 21, online: false, age: 27, weight: 78, height: 182, injuries: 'R shoulder impingement', goals: 'First muscle-up by summer', ev: { vj: 52, bj: 235, dl: 150, bp: 75 }, plans: ['Block #4 — Pull Specialization', 'Block #3 — Volume', 'Block #2 — Hypertrophy', 'Block #1 — Intake'] },
  { id: 't3', name: 'יעל ועידן כהן', short: 'Yael+Idan', email: 'yael.cohen@example.co.il', phone: '+972503334455', status: 'Active', sessionsLeft: 8, monthly: 2700, format: 'Gym, Couple', startDate: '2025-01-15', dormantDays: null, lastWorkout: '4 days ago', payment: 'PAID', paidDaysAgo: 14, online: false, isCouple: true, age: 35, weight: 72, height: 175, injuries: 'None', goals: 'Body comp + first chin-up (Yael)', ev: { vj: 45, bj: 210, dl: 120, bp: 65 }, plans: ['Block #4 — Couple Volume', 'Block #3 — Couple Base', 'Block #2 — Onboarding', 'Block #1 — Intake'] },
  { id: 't4', name: 'דניאל אבני', short: 'Daniel', email: 'daniel.avni@example.co.il', phone: '+972545556677', status: 'Active', sessionsLeft: 7, monthly: 2000, format: 'Gym, Single', startDate: '2025-03-10', dormantDays: null, lastWorkout: '1 day ago', payment: 'PAID', paidDaysAgo: 21, online: true, age: 29, weight: 81, height: 179, injuries: 'None', goals: 'Add 10kg to squat', ev: { vj: 55, bj: 245, dl: 175, bp: 95 }, plans: ['Block #2 — Strength', 'Block #1 — Base'] },
  { id: 't5', name: 'מאיה רוזן', short: 'Maya', email: 'maya.rozen@example.co.il', phone: '+972528889900', status: 'On Hold', sessionsLeft: 0, monthly: 1600, format: 'Online', startDate: '2024-12-01', dormantDays: 9, lastWorkout: '9 days ago', payment: 'OVERDUE', overdueDays: 6, online: false, age: 33, weight: 60, height: 165, injuries: 'R knee — patellofemoral', goals: 'Return to running pain-free', ev: { vj: 30, bj: 160, dl: 80,  bp: 40 }, plans: ['Block #3 — Rehab', 'Block #2 — Base', 'Block #1 — Intake'] },
  { id: 't6', name: 'איתי כץ', short: 'Itai', email: 'itai.katz@example.co.il', phone: '+972541112233', status: 'Trial', sessionsLeft: 1, monthly: 0, format: 'Gym, Single', startDate: '2025-06-12', dormantDays: null, lastWorkout: '3 days ago', payment: 'NEVER PAID', online: false, age: 24, weight: 70, height: 176, injuries: 'None', goals: 'Learn the lifts, build a base', ev: { vj: 48, bj: 220, dl: 100, bp: 55 }, plans: ['Block #1 — Onboarding'] },
  { id: 't7', name: 'שירה לוין', short: 'Shira', email: 'shira.levin@example.co.il', phone: '+972502223344', status: 'Inactive', sessionsLeft: 0, monthly: 1800, format: 'Online', startDate: '2024-08-20', dormantDays: 41, lastWorkout: '41 days ago', payment: 'OVERDUE', overdueDays: 62, online: false, age: 38, weight: 67, height: 170, injuries: 'Lower-back stiffness', goals: 'Re-engage after travel', ev: { vj: 34, bj: 175, dl: 85,  bp: 42.5 }, plans: ['Block #5 — Volume', 'Block #4 — Strength', 'Block #3 — Base'] },
  { id: 't8', name: 'עומר דגן', short: 'Omer', email: 'omer.dagan@example.co.il', phone: '+972544445566', status: 'Active', sessionsLeft: 5, monthly: 2200, format: 'Gym, Single', startDate: '2025-02-05', dormantDays: null, lastWorkout: 'Today', payment: 'PAID', paidDaysAgo: 5, online: true, age: 26, weight: 88, height: 185, injuries: 'None', goals: 'Powerlifting meet prep', ev: { vj: 50, bj: 240, dl: 210, bp: 130 }, plans: ['Block #3 — Peaking', 'Block #2 — Volume', 'Block #1 — Base'] },
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
// Enriched with the exercise-DB sheet params (primaryJoints / jointMovements /
// primaryMuscles / secondaryMuscles / cues) so the demo table/compare populate
// like the real app — parity with the redesigned ExercisesView.
const MOCK_EXERCISES = [
  { name: 'BB Bench Press',     category: 'Chest',     resistanceType: 'Barbell',    bodyPosition: 'Supine',       movementType: 'Push',          pattern: 'Horizontal Push',         laterality: 'Bilateral',  primaryJoints: 'Shoulder, Elbow', jointMovements: 'Shoulder Horizontal Adduction, Elbow Extension', primaryMuscles: 'Pectoralis Major', secondaryMuscles: 'Anterior Deltoid, Triceps', cues: 'Retract the scapula, drive the feet, bar to mid-chest.' },
  { name: 'DB Incline Press',   category: 'Chest',     resistanceType: 'Dumbbell',   bodyPosition: 'Supine',       movementType: 'Push',          pattern: 'Horizontal Push',         laterality: 'Bilateral',  primaryJoints: 'Shoulder, Elbow', jointMovements: 'Shoulder Flexion, Elbow Extension', primaryMuscles: 'Upper Pectoralis', secondaryMuscles: 'Anterior Deltoid, Triceps', cues: 'Slight arch, stack the dumbbells over the elbows.' },
  { name: 'Cable Fly',          category: 'Chest',     resistanceType: 'Cable',      bodyPosition: 'Standing',     movementType: 'Push',          pattern: 'Isolation',               laterality: 'Bilateral',  primaryJoints: 'Shoulder', jointMovements: 'Shoulder Horizontal Adduction', primaryMuscles: 'Pectoralis Major', secondaryMuscles: 'Anterior Deltoid', cues: 'Soft elbows, hug a barrel, squeeze at the midline.' },
  { name: 'Standing OHP',       category: 'Shoulders', resistanceType: 'Barbell',    bodyPosition: 'Standing',     movementType: 'Push',          pattern: 'Vertical Push',           laterality: 'Bilateral',  primaryJoints: 'Shoulder, Elbow', jointMovements: 'Shoulder Flexion, Elbow Extension', primaryMuscles: 'Anterior Deltoid', secondaryMuscles: 'Triceps, Upper Traps', cues: 'Brace hard, bar over mid-foot, head through at the top.' },
  { name: 'Lateral Raise',      category: 'Shoulders', resistanceType: 'Dumbbell',   bodyPosition: 'Standing',     movementType: 'Lateral Raise', pattern: 'Isolation',               laterality: 'Bilateral',  primaryJoints: 'Shoulder', jointMovements: 'Shoulder Abduction', primaryMuscles: 'Lateral Deltoid', secondaryMuscles: 'Supraspinatus', cues: 'Lead with the elbows, no shrug, control the lowering.' },
  { name: 'BB Deadlift',        category: 'Legs',      resistanceType: 'Barbell',    bodyPosition: 'Standing',     movementType: 'Hinge',         pattern: 'Hip Hinge',               laterality: 'Bilateral',  primaryJoints: 'Hip, Knee', jointMovements: 'Hip Extension, Knee Extension', primaryMuscles: 'Gluteus Maximus, Hamstrings', secondaryMuscles: 'Erector Spinae, Quadriceps', cues: 'Wedge in, lats tight, push the floor away.' },
  { name: 'Romanian Deadlift',  category: 'Legs',      resistanceType: 'Barbell',    bodyPosition: 'Standing',     movementType: 'Hinge',         pattern: 'Hip Hinge',               laterality: 'Bilateral',  primaryJoints: 'Hip', jointMovements: 'Hip Extension', primaryMuscles: 'Hamstrings, Gluteus Maximus', secondaryMuscles: 'Erector Spinae', cues: 'Soft knees, hinge back, keep the bar close.' },
  { name: 'Pull-Up',            category: 'Back',      resistanceType: 'Bodyweight', bodyPosition: 'Hanging',      movementType: 'Pull',          pattern: 'Vertical Pull',           laterality: 'Bilateral',  primaryJoints: 'Shoulder, Elbow', jointMovements: 'Shoulder Adduction, Elbow Flexion', primaryMuscles: 'Latissimus Dorsi', secondaryMuscles: 'Biceps, Rhomboids', cues: 'Depress + retract the scapula, chest to the bar.' },
  { name: 'Bent-Over BB Row',   category: 'Back',      resistanceType: 'Barbell',    bodyPosition: 'Standing',     movementType: 'Row',           pattern: 'Horizontal Pull',         laterality: 'Bilateral',  primaryJoints: 'Shoulder, Elbow', jointMovements: 'Shoulder Extension, Elbow Flexion', primaryMuscles: 'Latissimus Dorsi, Rhomboids', secondaryMuscles: 'Biceps, Posterior Deltoid', cues: 'Flat back, pull to the lower ribs, elbows in.' },
  { name: 'Back Squat',         category: 'Legs',      resistanceType: 'Barbell',    bodyPosition: 'Standing',     movementType: 'Squat',         pattern: 'Squat',                   laterality: 'Bilateral',  primaryJoints: 'Hip, Knee, Ankle', jointMovements: 'Hip Extension, Knee Extension', primaryMuscles: 'Quadriceps, Gluteus Maximus', secondaryMuscles: 'Hamstrings, Erector Spinae', cues: 'Brace, knees track the toes, hips + chest rise together.' },
  { name: 'Front Squat',        category: 'Legs',      resistanceType: 'Barbell',    bodyPosition: 'Standing',     movementType: 'Squat',         pattern: 'Squat',                   laterality: 'Bilateral',  primaryJoints: 'Hip, Knee, Ankle', jointMovements: 'Hip Extension, Knee Extension', primaryMuscles: 'Quadriceps', secondaryMuscles: 'Gluteus Maximus, Upper Back', cues: 'Elbows high, upright torso, full depth.' },
  { name: 'Walking Lunge',      category: 'Legs',      resistanceType: 'Dumbbell',   bodyPosition: 'Standing',     movementType: 'Lunge',         pattern: 'Lunge',                   laterality: 'Alternating', primaryJoints: 'Hip, Knee, Ankle', jointMovements: 'Hip Extension, Knee Extension', primaryMuscles: 'Quadriceps, Gluteus Maximus', secondaryMuscles: 'Hamstrings, Adductors', cues: 'Long step, vertical shin, drive through the front heel.' },
  { name: 'Leg Curl',           category: 'Legs',      resistanceType: 'Machine',    bodyPosition: 'Prone',        movementType: 'Curl',          pattern: 'Isolation',               laterality: 'Bilateral',  primaryJoints: 'Knee', jointMovements: 'Knee Flexion', primaryMuscles: 'Hamstrings', secondaryMuscles: 'Gastrocnemius', cues: 'Hips down, curl to full range, control the eccentric.' },
  { name: 'Hip Thrust',         category: 'Glutes',    resistanceType: 'Barbell',    bodyPosition: 'Supine',       movementType: 'Hinge',         pattern: 'Hip Hinge',               laterality: 'Bilateral',  primaryJoints: 'Hip', jointMovements: 'Hip Extension', primaryMuscles: 'Gluteus Maximus', secondaryMuscles: 'Hamstrings', cues: 'Chin tucked, ribs down, full lockout squeeze.' },
  { name: 'Face Pull',          category: 'Back',      resistanceType: 'Cable',      bodyPosition: 'Standing',     movementType: 'Pull',          pattern: 'Horizontal Pull',         laterality: 'Bilateral',  primaryJoints: 'Shoulder', jointMovements: 'Shoulder External Rotation, Horizontal Abduction', primaryMuscles: 'Posterior Deltoid, Rhomboids', secondaryMuscles: 'Rotator Cuff', cues: 'High elbows, pull to the eyes, rotate at the end.' },
  { name: 'DB Bicep Curl',      category: 'Arms',      resistanceType: 'Dumbbell',   bodyPosition: 'Standing',     movementType: 'Curl',          pattern: 'Isolation',               laterality: 'Bilateral',  primaryJoints: 'Elbow', jointMovements: 'Elbow Flexion', primaryMuscles: 'Biceps Brachii', secondaryMuscles: 'Brachialis', cues: 'Elbows pinned, supinate, no swing.' },
  { name: 'Tricep Pushdown',    category: 'Arms',      resistanceType: 'Cable',      bodyPosition: 'Standing',     movementType: 'Extend',        pattern: 'Isolation',               laterality: 'Bilateral',  primaryJoints: 'Elbow', jointMovements: 'Elbow Extension', primaryMuscles: 'Triceps Brachii', secondaryMuscles: '', cues: 'Elbows fixed at the sides, full lockout, control up.' },
  { name: 'Hanging Leg Raise',  category: 'Core',      resistanceType: 'Bodyweight', bodyPosition: 'Hanging',      movementType: 'Isometric',     pattern: 'Isolation',               laterality: 'Bilateral',  primaryJoints: 'Hip', jointMovements: 'Hip Flexion', primaryMuscles: 'Rectus Abdominis, Hip Flexors', secondaryMuscles: 'Obliques', cues: 'Posterior tilt first, control the swing, legs toward the bar.' },
  { name: 'Plank',              category: 'Core',      resistanceType: 'Bodyweight', bodyPosition: 'Prone',        movementType: 'Isometric',     pattern: 'Isolation',               laterality: 'Bilateral',  primaryJoints: 'Trunk', jointMovements: 'Trunk Anti-Extension', primaryMuscles: 'Rectus Abdominis', secondaryMuscles: 'Transverse Abdominis', cues: 'Ribs down, squeeze the glutes, one straight line.' },
  { name: 'Cable Pallof Press', category: 'Core',      resistanceType: 'Cable',      bodyPosition: 'Standing',     movementType: 'Anti-Rotation', pattern: 'Rotation/Anti-Rotation',  laterality: 'Unilateral', primaryJoints: 'Trunk', jointMovements: 'Trunk Anti-Rotation', primaryMuscles: 'Obliques', secondaryMuscles: 'Transverse Abdominis', cues: 'Resist the rotation, press straight out, breathe.' },
];

// ─── Shared bits ──────────────────────────────────────────────────────────
const baseBtn = {
  // minHeight, not height: a fixed height breaks the moment a Hebrew label
  // wraps, and the vertical padding is zero so the flex centring sets the box.
  // Before this a single coach tab could show 32px, 38px and 40px controls at
  // once, and 40 only at phone width.
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  minHeight: CTRL_H, boxSizing: 'border-box',
  padding: '0 14px', borderRadius: 0, border: 'none',
  fontFamily: FB, fontSize: 12, fontWeight: 700, letterSpacing: 1.2,
  cursor: 'pointer', transition: 'all 0.15s', textDecoration: 'none',
};

// Shared input look for demo text/search fields (mirrors the coach app's
// baseInput; CoachDemo has no import of the real one).
const baseInput = {
  background: 'var(--c-sf)', border: `1px solid ${C.bd2}`, borderRadius: 0,
  padding: '0 12px', minHeight: CTRL_H, color: C.tx, fontFamily: FB, fontSize: 13, outline: 'none',
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
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
      fontFamily: FN, fontSize: 9, letterSpacing: 1.2, fontWeight: 700,
      color, background: 'transparent', border: 'none',
      borderRadius: 0, padding: '2px 0', whiteSpace: 'nowrap',
    }}>{children}</span>
  );
}

// Matches the real DashboardView summary card spec: 0.25px ac-dimmed
// border, 10px radius, 14px×18px padding, 22px value, 10px FN label.
// Mirrors DashboardView's KPI tile: cyan strip header (RefinedHeaderStrip
// grammar) + 6px status dot + white 13/0.08em/700 label; big value in NEUTRAL
// C.tx (the `accent` only colors the dot, never the number).
function StatCard({ label, value, sub, subColor, accent = C.ac, total }) {
  return (
    <div style={{
      background: C.sf, border: `1px solid ${C.cardBd}`, borderRadius: 0,
      padding: '16px 20px', boxShadow: C.cardShadow,
    }}>
      <div style={{ background: 'color-mix(in srgb, var(--c-stripBg, var(--c-sf)) 90%, var(--c-ac))', margin: '-16px -20px 12px', padding: '0 20px', borderBottom: `1px solid ${C.cardBd}`, ...DEMO_STRIP_H }}>
        {/* TITLE ON THE BODY'S EDGE, DOT AT THE FAR END (Ohad, 26.9: title boxes whose
          text "doesnt start at the same horizontal spot as the rest of the text").
          The status dot used to lead the title, so the words started 13px in from
          the number below them. The dot now sits at the strip's other end, the
          same margin from that edge. */}
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 7, minHeight: 30, width: '100%' }}>
          <span style={{ fontFamily: FN, fontSize: 13, letterSpacing: '0.08em', fontWeight: 700, color: 'var(--c-stripTx)', textTransform: 'uppercase' }}>{label}</span>
          <span title={T('status')} style={{ width: 6, height: 6, borderRadius: '50%', background: accent, flexShrink: 0, boxShadow: `0 0 5px ${accent}66` }} />
        </span>
      </div>
      {/* The number needs direction:ltr so "5 / 8" and the shekel sign keep
          their order — but that used to sit on the BOX, and `textAlign: start`
          inside an ltr box always resolves to LEFT. So on the Hebrew dashboard
          every card's label sat right and its big number sat left. The
          isolation belongs on the numeral, not on the box: the box now
          inherits the page direction and aligns with its own label. */}
      <div style={{ fontSize: C.kpiNumberSize || 30, fontWeight: 800, fontFamily: FN, color: C.tx, lineHeight: 1.05, letterSpacing: '-0.015em', textAlign: 'start' }}>
        <span style={{ direction: 'ltr', unicodeBidi: 'isolate', display: 'inline-block' }}>
          {value}
          {total !== undefined && <span style={{ fontSize: 13, color: C.td, fontWeight: 400, letterSpacing: 0 }}> / {total}</span>}
        </span>
      </div>
      {sub && (
        <div style={{ fontSize: 10, fontFamily: FN, color: subColor || C.td, marginTop: 6, letterSpacing: '0.04em' }}>{sub}</div>
      )}
    </div>
  );
}

// ─── Tab: Dashboard ───────────────────────────────────────────────────────
// The lead fixture and its state went with the New Leads panel below. Making
// its ✓ / ✕ / RESET actually work was right at the time — a control that looks
// clickable and does nothing is the thing he objected to — but the panel
// itself should never have been on a screen shown to a buyer.

function DemoDashboard({ onJumpToTrainee }) {
  // Messages: MARK ALL READ clears the unread dots, as on the real card.
  const [msgsRead, setMsgsRead] = useState(false);
  // Tasks: the real NotesWidget's scope toggle. GENERAL (default) = the status
  // board of tasks people wrote; AUTO-ALERTS = what the rules engine raised;
  // ALL = the board with the alerts under it.
  const [taskScope, setTaskScope] = useState('mine');
  const dormant = MOCK_TRAINEES.filter(t => t.dormantDays != null);
  const expiring = MOCK_TRAINEES.filter(t => t.sessionsLeft > 0 && t.sessionsLeft <= 2);
  const lowSessions = MOCK_TRAINEES.filter(t => t.sessionsLeft <= 2);
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
  const TENURE_MONTHS = 10;              // the assumption, named on screen
  const avgLtv = avgTicket * TENURE_MONTHS;
  // The axis is the LAST six months, ending with the month he is standing in,
  // named in the reader's language. It used to be a fixed Jan–Jun, so on the
  // night before the first client demo the revenue chart ran out in June and
  // the newest bar on screen was three months old.
  const nowM = new Date().getMonth();
  // More than double the original 2,900..3,400 (Ohad, 24.9), keeping the
  // same shape: a June dip, a July high, a strong current month.
  const prior = [6700, 7400, 6200, 8300, 7800];
  const months6 = prior.map((v, k) => [T(MON3[(nowM - 5 + k + 12) % 12]), v])
    .concat([[T(MON3[nowM]), collected30]]);
  const barMax = Math.max(...months6.map(m => m[1]));
  const collected90 = months6.slice(-3).reduce((s, m) => s + m[1], 0);
  const prevMonth = months6[months6.length - 2]?.[1] || 0;
  const momPct = prevMonth ? Math.round(((collected30 - prevMonth) / prevMonth) * 100) : 0;
  const momPctText = `${momPct >= 0 ? '+' : ''}${momPct}%`;
  const momLabel = <span dir="ltr" style={{ unicodeBidi: 'isolate' }}>{momPctText}</span>;
  return (
    <section>

      {/* Summary card grid — same shape as the real DashboardView's
          repeat(auto-fit, minmax(170px, 1fr)) at 10px gap. */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
        gap: 10, marginBottom: 20,
      }}>
        <StatCard label={T('Active Athletes')} value={String(active.length)} total={String(MOCK_TRAINEES.length)} accent={C.gn} />
        <StatCard label={T('Low Sessions')} value={String(lowSessions.length)} sub={T('≤ 2 LEFT')} accent={C.or} />
        <StatCard label={T('Estimated Monthly')} value={nis(mrr)} accent={C.ac} />
        <StatCard label={T('Collected MTD')} value={nis(collected30)} sub={<>{momLabel}{' '}{T('vs last month')}</>} subColor={momPct >= 0 ? C.gn : C.rd} accent={C.gn} />
      </div>

      {/* INCOMING · 30D IS DELIBERATELY NOT HERE.
          It used to sit between the stat row and revenue, reporting EXPO's own
          acquisition funnel — chat sessions, messages sent, email captures,
          waitlist signups — with the owner's real current counts hardcoded
          into the demo. Two things wrong with that on a screen shown to a
          prospect. It is EXPO's funnel, not the buyer's: a coach who signs up
          does not get an EXPO waitlist, so the panel sold a feature that does
          not transfer. And early-stage counts read to a buyer as "nobody else
          wants this".
          This repo is PUBLIC, so the figures themselves are not repeated here.
          The parity audit had recorded Incoming as deliberately out of the
          demo; the nav honoured it and this panel did not. Now both do. */}

      {/* Revenue panel — mirrors the real DashboardView RevenueCard (F-36):
          six metric tiles + a 6-month collected bar chart. Static demo data. */}
      <div style={{ border: `1px solid ${C.cardBd}`, marginBottom: 20 }}>
        <div style={{ background: 'color-mix(in srgb, var(--c-stripBg, var(--c-sf)) 90%, var(--c-ac))', color: 'var(--c-stripTx)', padding: '0 14px', fontFamily: FN, fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', borderBottom: `1px solid ${C.cardBd}`, ...DEMO_STRIP_H, justifyContent: 'space-between' }}>
          <span>{T('REVENUE')}</span><span style={{ opacity: 0.85, fontSize: 10 }}>{T('6 MO TREND')}</span>
        </div>
        <div style={{ padding: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginBottom: 16 }}>
            {[
              [T('MRR (ACTIVE)'), num(mrr), T('recurring committed'), C.ac],
              [T('30D COLLECTED'), num(collected30), <>{momLabel}{' '}{T('vs prev month')}</>, C.gn],
              [T('90D COLLECTED'), num(collected90), T('trailing 3 months'), C.gn],
              [T('OUTSTANDING'), num(outstandingAmt), `${overdue.length} ${overdue.length === 1 ? T('overdue client') : T('overdue clients')}`, outstandingAmt > 0 ? C.or : C.ac],
              [T('AVG LTV'), num(avgLtv), TN('over {n} months, est.', TENURE_MONTHS), C.ac],
              [T('AVG TICKET'), num(avgTicket), T('per paying client, per month'), C.ac],
            ].map(([lab, val, sub, col], i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '10px 14px', border: `1px solid ${C.cardBd}`, background: C.sf }}>
                <span style={{ fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: '0.18em', fontWeight: 700 }}>{lab}</span>
                <span style={{ fontFamily: FN, fontSize: 18, fontWeight: 800, color: C.tx, letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums' }}><span style={{ color: col }}>₪</span>{val}</span>
                <span style={{ fontFamily: FN, fontSize: 9, color: C.td, marginTop: 2 }}>{sub}</span>
              </div>
            ))}
          </div>
          <div>
            <div style={{ fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: '0.18em', fontWeight: 700, marginBottom: 8 }}>{T('LAST 6 MONTHS · COLLECTED')}</div>
            {/* A CHART A COACH CAN READ.
                Before: six solid cyan blocks the full width of their column,
                scaled to the MAXIMUM so the shortest was still 75% of the
                tallest, with no axis and no numbers — 2,900 to 3,850 is a 25%
                spread drawn as near-identical slabs. Ohad, an hour before the
                demo: "the demo top screen... is horrible."
                Now: the bars are scaled from a floor a little under the
                smallest month so the differences are visible, each carries its
                value, the current month is solid and the rest are ghosted so
                the eye lands on it, and the bars are slim with real gaps. */}
            {/* WHY A LINE AND NOT BARS.
                It was bars scaled to the MAXIMUM: 2,900 to 3,850 is a 33%
                spread drawn as six near-identical slabs. Ohad, an hour before
                the demo: "the demo top screen... is horrible." So I re-scaled
                the bars from a floor under the smallest month — which fixed the
                look and introduced a worse fault. A bar's LENGTH is its value,
                so a floor that is not zero lies about it: the tallest bar drew
                3.3x the shortest on data that differs by 1.43x. Tufte's lie
                factor for that is 2.34, against an integrity band of 0.95-1.05.
                This is the screen the run sheet tells him to lead with, where
                the pitch is "every figure reconciles" — a chart a buyer can
                catch exaggerating is worse than a dull one.
                A line is read as a TREND, not as a length, so a floor above
                zero is sanctioned for it (Datawrapper; FT's rule is specific to
                bar and column). The floor is printed on the axis rather than
                left implied, every month still carries its own value, and the
                current month keeps the solid dot. Grid children get
                minmax(0, 1fr): a bare 1fr floors at the label's own width, so
                six 42px labels plus five 14px gaps painted 23px past the card
                edge at 360. */}
            {(() => {
              const vals = months6.map((x) => x[1]);
              const step = 500;
              const floor = Math.floor(Math.min(...vals) / step) * step;
              const ceil = Math.ceil(Math.max(...vals) / step) * step;
              const y = (v) => 100 - ((v - floor) / Math.max(1, ceil - floor)) * 100;
              const pts = months6.map(([, v], i) => `${((i + 0.5) / months6.length) * 100},${y(v)}`).join(' ');
              // The month labels sit in a CSS grid, which mirrors itself in
              // Hebrew — Sep ends up leftmost. The plot is positioned, and
              // `left` is physical, so it did NOT mirror: the leftmost label
              // read the highest month while the leftmost point was the lowest.
              // The chart contradicted its own axis in Hebrew. Dots now use the
              // logical inset and the polyline is flipped to match.
              const rtl = readLang() === 'he';
              return (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: FN, fontSize: 9, color: C.td, letterSpacing: '0.08em', fontWeight: 700, marginBottom: 4 }}>
                    <span dir="ltr">{nis(ceil)}</span>
                    <span>{T('SCALE FROM')} <span dir="ltr" style={{ unicodeBidi: 'isolate' }}>{nis(floor)}</span></span>
                  </div>
                  <div style={{ position: 'relative', height: 96, borderBottom: `1px solid ${C.cardBd}`, borderTop: `1px dashed color-mix(in srgb, var(--c-bd) 60%, transparent)` }}>
                    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', transform: rtl ? 'scaleX(-1)' : undefined }} aria-hidden="true">
                      <polyline points={pts} fill="none" stroke="var(--c-ac)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
                    </svg>
                    {months6.map(([m, v], i) => {
                      const current = i === months6.length - 1;
                      return (
                        <div key={i} title={`${m} · ${nis(v)}`} style={{ position: 'absolute', insetInlineStart: `${((i + 0.5) / months6.length) * 100}%`, top: `${y(v)}%`, transform: 'translate(-50%, -50%)', width: current ? 9 : 7, height: current ? 9 : 7, borderRadius: '50%', background: current ? C.ac : C.sf, border: `2px solid ${C.ac}`, boxSizing: 'border-box' }} />
                      );
                    })}
                  </div>
                  <div className="cd-revline" style={{ display: 'grid', gridTemplateColumns: `repeat(${months6.length}, minmax(0, 1fr))`, gap: 4, marginTop: 6 }}>
                    {months6.map(([m, v], i) => {
                      const current = i === months6.length - 1;
                      return (
                        <div key={i} style={{ textAlign: 'center', minWidth: 0 }}>
                          <div style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, color: current ? C.ac : C.tm, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }} dir="ltr">{nis(v)}</div>
                          <div style={{ fontFamily: FN, fontSize: 9, color: current ? C.tx : C.td, letterSpacing: '0.06em', fontWeight: 700, whiteSpace: 'nowrap', marginTop: 2 }}>{m}</div>
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Tasks mini-board — mirrors the real DashboardView's NotesWidget: the
          strip with + TASK, the ALL / GENERAL / AUTO-ALERTS scope toggle, the
          status board of written tasks and the auto-alerts list. */}
      {(() => {
        const openTasks = DEMO_TASKS.filter(t => t.status !== 'done');
        const general = openTasks.filter(t => t.src !== 'auto');
        const alerts = openTasks.filter(t => t.src === 'auto');
        const SEGS = [['all', 'All', openTasks.length], ['mine', 'General', general.length], ['alerts', 'Auto-alerts', alerts.length]];
        const board = (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-start' }}>
            {STATUS_COLS.slice(0, 4).map(col => {
              const rows = DEMO_TASKS.filter(t => t.status === col.id && t.src !== 'auto');
              return (
                <div key={col.id} style={{ flex: '1 1 150px', minWidth: 140, border: `1px solid ${C.cardBd}`, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ background: 'var(--c-sf2)', color: C.tx, padding: '5px 8px', fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${C.cardBd}`, boxShadow: `inset 3px 0 0 ${col.color}` }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: col.color, flexShrink: 0 }} />{T(col.label)}</span><span style={{ color: C.tm }}>{rows.length}</span>
                  </div>
                  <div style={{ padding: 4, display: 'flex', flexDirection: 'column', gap: 4, minHeight: 40 }}>
                    {rows.map(t => {
                      const meta = TASK_SRC[t.src];
                      // A bordered tile 26px tall among 36px controls. It has a
                      // border, so it stands at the one control height; a title
                      // that wraps makes it taller, which the rule allows.
                      return (
                        <div key={t.id} style={{ border: `1px solid ${meta.color}`, minHeight: CTRL_H, boxSizing: 'border-box', display: 'flex', alignItems: 'center', padding: '4px 7px', fontFamily: FB, fontSize: 11, lineHeight: 1.3, color: C.tx }}>{taskTitle(t)}</div>
                      );
                    })}
                    {rows.length === 0 && <div style={{ padding: '6px 4px', textAlign: 'center', color: C.td, fontSize: 9, fontFamily: FN }}>—</div>}
                  </div>
                </div>
              );
            })}
          </div>
        );
        const alertList = alerts.length === 0
          ? <div style={{ fontFamily: FN, fontSize: 9, color: C.td, letterSpacing: '0.04em', padding: '4px 0' }}>{T('No coaching alerts — all clear.')}</div>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {alerts.map(t => (
                <div key={t.id} style={{ border: `1px solid ${TASK_SRC[t.src].color}`, minHeight: CTRL_H, boxSizing: 'border-box', display: 'flex', alignItems: 'center', padding: '4px 9px', fontFamily: FB, fontSize: 11, lineHeight: 1.3, color: C.tx }}>{taskTitle(t)}</div>
              ))}
            </div>
          );
        return (
          <div style={{ border: `1px solid ${C.cardBd}`, marginBottom: 20 }}>
            <div style={{ background: 'color-mix(in srgb, var(--c-stripBg, var(--c-sf)) 90%, var(--c-ac))', color: 'var(--c-stripTx)', padding: '0 14px', fontFamily: FN, fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', borderBottom: `1px solid ${C.cardBd}`, ...DEMO_STRIP_H, justifyContent: 'space-between', gap: 10 }}>
              <span>{T('TASKS')} ({openTasks.length})</span>
              <button title={T('Demo only')} style={{ minHeight: CTRL_H, minWidth: 58, boxSizing: 'border-box', padding: '0 10px', borderRadius: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', cursor: 'default', whiteSpace: 'nowrap', background: 'transparent', border: '1px solid var(--c-ac)', color: 'var(--c-ac)' }}>{T('+ Task')}</button>
            </div>
            {/* 14 = the strip's inset: at 10 the toggle and the board's columns
                started 4px outside the TASKS title (26.9, #215). */}
            <div style={{ padding: 14 }}>
              <div className="rail-scroll" style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 8 }}>
                <div style={{ display: 'inline-flex', flexShrink: 0, border: `1px solid ${C.cardBd}` }}>
                  {SEGS.map(([id, label, n], i) => {
                    const on = taskScope === id;
                    return (
                      <button key={id} onClick={() => setTaskScope(id)}
                        style={{ minHeight: CTRL_H - 2, boxSizing: 'border-box', borderRadius: 0, fontFamily: FN, fontWeight: 700, fontSize: 10, letterSpacing: '0.1em', padding: '0 12px', cursor: 'pointer', border: 'none', borderInlineStart: i ? `1px solid ${C.cardBd}` : 'none', background: on ? 'rgba(57,189,255,0.094)' : 'transparent', color: on ? 'var(--c-ac)' : 'var(--c-tm)', display: 'inline-flex', alignItems: 'center', gap: 5, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', lineHeight: 1 }}>{T(label)}</span>{n > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 10, fontWeight: 700, lineHeight: 1, opacity: on ? 0.9 : 0.5 }}>({n})</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
              {taskScope === 'alerts' ? alertList : taskScope === 'all' ? (
                <>
                  {board}
                  <div style={{ marginTop: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ fontFamily: FN, fontSize: 9, color: C.td, letterSpacing: '0.14em', fontWeight: 700 }}>{T('AUTO-ALERTS')} ({alerts.length})</span>
                      <span style={{ flex: 1, height: 1, background: C.cardBd }} />
                    </div>
                    {alertList}
                  </div>
                </>
              ) : board}
            </div>
          </div>
        );
      })()}

      {/* Messages inbox — athlete↔coach messaging surfaced on the dashboard
          (the real DashboardView renders <MessagesCard> between Tasks and the
          alert rail). Mock threads for the demo. */}
      <div style={{ border: `1px solid ${C.cardBd}`, marginBottom: 20 }}>
        <div style={{ background: 'color-mix(in srgb, var(--c-stripBg, var(--c-sf)) 90%, var(--c-ac))', color: 'var(--c-stripTx)', padding: '0 14px', fontFamily: FN, fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', borderBottom: `1px solid ${C.cardBd}`, ...DEMO_STRIP_H, justifyContent: 'space-between' }}>
          {/* The real MessagesCard header: MESSAGES (unread), and MARK ALL READ
              while anything is unread. */}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>{T('Messages')}<span style={{ fontFamily: FN, fontSize: 10, letterSpacing: '0.12em', opacity: 0.85 }}>({msgsRead ? 0 : 2})</span></span>
          {!msgsRead && <button onClick={() => setMsgsRead(true)} style={{ minHeight: CTRL_H, boxSizing: 'border-box', padding: '0 10px', borderRadius: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', cursor: 'pointer', whiteSpace: 'nowrap', background: 'transparent', border: '1px solid color-mix(in srgb, var(--c-stripTx) 55%, transparent)', color: 'var(--c-stripTx)' }}>{T('MARK ALL READ')}</button>}
        </div>
        <div>
          {[
            { name: MOCK_TRAINEES[0]?.name || 'נועה לוי', msg: T('Felt strong on bench today — hit all 4 sets'), when: T('2m'), unread: true },
            { name: MOCK_TRAINEES[3]?.name || 'דניאל אבני', msg: T('Can we move tomorrow to 18:00?'), when: T('1h'), unread: true },
            { name: MOCK_TRAINEES[1]?.name || 'גל מזרחי', msg: T('Sent the deadlift clip for review'), when: T('Yesterday'), unread: false },
          ].map((m) => ({ ...m, unread: m.unread && !msgsRead })).map((m, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderTop: i ? `1px solid ${C.cardBd}` : 'none' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: m.unread ? C.ac : 'transparent', border: m.unread ? 'none' : `1px solid ${C.td}`, flexShrink: 0 }} />
              <span style={{ fontFamily: FB, fontWeight: 600, fontSize: 13, color: C.tx, flexShrink: 0, minWidth: 0, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
              <span style={{ fontFamily: FB, fontSize: 12, color: m.unread ? C.tx : C.tm, flex: 1, minWidth: 0, overflowWrap: 'break-word' }}>{m.msg}</span>
              <span style={{ fontFamily: FN, fontSize: 10, color: C.td, flexShrink: 0 }}>{RT(m.when)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Alert rail — horizontal flex (overflowX auto, cursor grab), mirroring
          the real DashboardView. Order: Online Now → Expiring Packages →
          Overdue Payment → Dormant → New Leads. */}
      {/* flex-start, not stretch: on a phone one tile whose Hebrew names wrap to
      three lines grew to 270px and STRETCHED every short tile to match,
      leaving 224-256px of measured dead air under two-row tiles. Desktop
      never showed it because the heights are close there. Ohad: get rid of
      those empty spaces on cards, full-wide-all-platforms. */}
      {/* .alert-rail is the real dashboard's class for this strip: 280px cards, and
          stacked under 620px (themes.css). Same class, same behaviour. */}
      <div className="alert-rail" style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'flex-start', overflowX: 'auto', cursor: 'grab', paddingBottom: 4 }}>
        {onlineNow.length > 0 && (
          <Panel title={`${T('Online Now')} (${onlineNow.length})`} tint={C.gn} icon="dot">
            {onlineNow.map(t => (
              <Row key={t.id} onClick={() => onJumpToTrainee(t.id, 'dashboard')}>
                <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: C.gn, boxShadow: `0 0 4px ${C.gn}`, flexShrink: 0 }} />
                <span style={{ color: C.tx, flex: 1 }}>{t.name}</span>
              </Row>
            ))}
          </Panel>
        )}

        {expiring.length > 0 && (
          <Panel title={`${T('Expiring Packages')} (${expiring.length})`} tint={C.or} icon="alert">
            {expiring.map(t => (
              <Row key={t.id} onClick={() => onJumpToTrainee(t.id, 'dashboard')}>
                <span style={{ color: C.tx, flex: 1 }}>{t.name}</span>
                <span style={{ fontFamily: FN, fontWeight: 700, color: C.rd, fontSize: 12 }}>{readLang() === 'he' ? sessionsLeftHe(t.sessionsLeft) : `${t.sessionsLeft} ${T('LEFT')}`}</span>
              </Row>
            ))}
          </Panel>
        )}

        <Panel title={`${T('Overdue Payment')} (${overdue.length})`} tint={C.rd} icon="dollar">
          {overdue.map((t) => (
            <Row key={t.id} onClick={() => onJumpToTrainee(t.id, 'dashboard')}>
              <span style={{ color: C.tx, flex: 1 }}>{t.name}</span>
              {/* Was: the first row said "Never paid" and the rest counted
                  (i+1)*32 days — 64, 96 — by POSITION. גל is a paying client
                  who lapsed, and his own card said 21 days on the next tab. */}
              <span style={{ fontFamily: FN, color: C.rd, fontSize: 11 }}>{t.payment === 'NEVER PAID' ? T('Never paid') : TN('{n}d overdue', t.overdueDays || 0)}</span>
            </Row>
          ))}
        </Panel>

        <Panel title={`${T('Dormant')} (${dormant.length})`} tint={C.or} icon="moon">
          {dormant.map(t => (
            <Row key={t.id} onClick={() => onJumpToTrainee(t.id, 'dashboard')}>
              <span style={{ color: C.tx, flex: 1 }}>{t.name}</span>
              <span style={{ fontFamily: FN, color: C.or, fontSize: 11, marginInlineEnd: 8 }}>{t.dormantDays == null ? T('Never trained') : (readLang() === 'he' ? daysAgoHe(t.dormantDays) : TN('{n}d ago', t.dormantDays))}</span>
              <FakeWaButton />
            </Row>
          ))}
        </Panel>

        {/* NEW LEADS IS DELIBERATELY NOT HERE, for the same reason
            INCOMING · 30D is not: it is EXPO's funnel, not the buyer's. Its
            rows carried source "expo-il" and contexts like "pricing CTA" and
            "exit-intent" — leads from the marketing site a coach who signs up
            does not own, so the panel sold a feature that does not transfer.
            The audit also found its ✓ and ✕ buttons painted on top of the
            email, rendering as A[✕][✓]EXAMPLE.CO.IL, and the run sheet already
            told him to steer around the panel. Nothing to steer around now. */}
      </div>

      {/* Client roster table — same shape as the real DashboardView's
          sortable client list. Border is 0.25px ac-dimmed, headers are
          10px FN with 0.05em tracking, body rows hover-tinted. */}
      <div style={{
        background: C.sf, border: `1px solid ${C.cardBd}`, borderRadius: 0,
        overflowX: 'auto', marginBottom: 8,
      }}>
          {/* Strip header — mirrors the real DashboardView "All Athletes — N". */}
          <div style={{ background: 'color-mix(in srgb, var(--c-stripBg, var(--c-sf)) 90%, var(--c-ac))', borderBottom: `1px solid ${C.cardBd}`, padding: '0 14px', fontFamily: FN, fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--c-stripTx)', textTransform: 'uppercase', ...DEMO_STRIP_H }}>{T('All Athletes')} · {MOCK_TRAINEES.length}</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: FB, fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.bd}` }}>
                {['Athlete', 'Status', 'Format', 'Package', 'Sessions', 'Total Paid', 'Last Payment', 'Workouts', 'Programs'].map(h => (
                  <th key={h} style={{
                    textAlign: 'center', padding: '10px 12px', whiteSpace: 'nowrap',
                    fontSize: 9, fontFamily: FN, color: C.tm, textTransform: 'uppercase', letterSpacing: '0.18em', fontWeight: 700,
                  }}>{h === 'Athlete' ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>{T(h)} <span style={{ fontSize: 8 }}>↑</span></span> : (h === 'Sessions' && readLang() === 'he' ? 'נותרו' : T(h))}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MOCK_TRAINEES.map((t, i) => {
                const totalPaid = (t.monthly || 0) * (t.payment === 'OVERDUE' ? 2 : 3);
                // Off the trainee, and relative: two fixed spring dates meant
                // every PAID athlete claimed the same last payment, and in
                // September that date was five months old.
                const lastPay = t.payment === 'NEVER PAID' ? '—' : dAgo(t.payment === 'PAID' ? (t.paidDaysAgo || 0) : (t.overdueDays || 0) + 30);
                const workouts = t.dormantDays != null ? 4 : 12;
                return (
                  <tr key={t.id} onClick={() => onJumpToTrainee(t.id, 'dashboard')}
                    onMouseEnter={e => e.currentTarget.style.background = C.sf2}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    // Ohad, 24.9: "no way the rows borders in the table are smaller
                    // vertically than the universal button vertical size. either the
                    // same for minimum or bigger" — and the text centred in them. A
                    // <tr> height is a floor, not a fixed size, so wrapped text still
                    // grows the row; it just never goes under the control height.
                    style={{ borderBottom: `1px solid ${C.bd}`, cursor: 'pointer', transition: 'background 0.1s', height: CTRL_H }}>
                    <td style={{ padding: '12px', textAlign: 'center', fontWeight: 600, color: C.tx, verticalAlign: 'middle' }}>{t.name}</td>
                    <td style={{ padding: '12px', textAlign: 'center' }}><Badge color={t.dormantDays != null ? C.tm : C.ac}>{T(t.status)}</Badge></td>
                    <td style={{ padding: '12px', textAlign: 'center', color: C.tm, fontSize: 12 }}>{T(t.format)}</td>
                    <td style={{ padding: '12px', textAlign: 'center', color: C.tm, fontSize: 12 }}>{t.isCouple ? T('12 Sessions') : T('8 Sessions')}</td>
                    <td style={{ padding: '12px', textAlign: 'center' }}><span style={{ fontFamily: FN, fontWeight: 700, fontSize: 14, color: t.sessionsLeft <= 2 ? C.rd : C.gn }}>{t.sessionsLeft}</span></td>
                    <td style={{ padding: '12px', textAlign: 'center', fontFamily: FN, fontWeight: 600, color: C.gn }}>₪{totalPaid.toLocaleString()}</td>
                    <td style={{ padding: '12px', textAlign: 'center', color: t.payment === 'OVERDUE' ? C.rd : C.tm, fontSize: 12 }}>{lastPay}</td>
                    <td style={{ padding: '12px', textAlign: 'center', fontFamily: FN, color: C.tx }}>{workouts}</td>
                    <td style={{ padding: '12px', textAlign: 'center', fontFamily: FN, color: C.tx }}>{planCount(t)}</td>
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
// White-stroke 14px icons mirroring ui.jsx SectionIcon kinds, so the demo
// alert strips carry the same iconography as the real DashboardView.
function DemoSectionIcon({ kind }) {
  const common = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: '#FFFFFF', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', style: { marginInlineEnd: 6, verticalAlign: -2, flexShrink: 0 }, 'aria-hidden': true };
  const paths = {
    dot: <circle cx="12" cy="12" r="5" fill="#FFFFFF" stroke="none" />,
    alert: <><path d="M12 3 2 21h20L12 3z" /><path d="M12 10v5" /><circle cx="12" cy="18" r="0.6" fill="#FFFFFF" stroke="#FFFFFF" /></>,
    dollar: <><path d="M12 3v18" /><path d="M16 7.5a3.5 3.5 0 0 0-3.5-2.5h-1A3 3 0 0 0 11 11h2a3 3 0 0 1 .5 6h-1A3.5 3.5 0 0 1 8 15.5" /></>,
    moon: <path d="M20 14a8 8 0 0 1-10-10 8 8 0 1 0 10 10z" />,
    mail: <><rect x="3" y="5" width="18" height="14" rx="1" /><path d="m3 7 9 6 9-6" /></>,
  };
  return <svg {...common}>{paths[kind] || paths.dot}</svg>;
}

// Alert card = real DashboardView grammar: 3px colored LEFT border (or full
// cyan border for Leads), cyan RefinedHeaderStrip with a white icon + label.
function Panel({ title, tint, icon, children, cyanBorder }) {
  return (
    <div style={{
      background: C.sf,
      border: cyanBorder ? `1px solid ${C.ac}` : `1px solid ${C.cardBd}`,
      borderInlineStart: cyanBorder ? `1px solid ${C.ac}` : `3px solid ${tint}`,
      borderRadius: 0, padding: '14px 18px',
      boxShadow: cyanBorder ? undefined : C.cardShadow,
      flex: '0 0 auto', width: 300, boxSizing: 'border-box',
    }}>
      <div style={{ background: 'color-mix(in srgb, var(--c-stripBg, var(--c-sf)) 90%, var(--c-ac))', margin: '-14px -18px 12px', padding: '0 18px', borderBottom: `1px solid ${C.cardBd}`, ...DEMO_STRIP_H }}>
        <span style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', color: 'var(--c-stripTx)', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center' }}>
          {icon && <DemoSectionIcon kind={icon} />}{title}
        </span>
      </div>
      <div>{children}</div>
    </div>
  );
}

// Real DashboardView alert rows are flat 6px-padded lines with no separator
// — the panel itself is the bounded chrome. Mirror that here so the demo
// panels read identically to the real ones.
function Row({ onClick, children, style }) {
  return (
    <div onClick={onClick} style={{
      padding: '6px 0', display: 'flex', alignItems: 'center', gap: 8,
      cursor: onClick ? 'pointer' : 'default', fontSize: 13,
      transition: 'opacity 160ms ease',
      ...style,
    }}>{children}</div>
  );
}

function FakeWaButton() {
  return (
    <button onClick={e => { e.stopPropagation(); }} title={T('Send WhatsApp check-in')} style={{
      background: '#25d36620', border: `1px solid #25d36655`, color: '#25d366',
      // An icon-only control is still a control: it sits in a row beside
      // labelled ones and has to match their height. It was 32px against 36.
      borderRadius: 0, minHeight: CTRL_H, boxSizing: 'border-box', padding: '0 8px', cursor: 'pointer',
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
  const rail = useNarrowRail();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [formatFilter, setFormatFilter] = useState('All');
  const [attnFlags, setAttnFlags] = useState({});
  const [sortKey, setSortKey] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  if (selected) {
    const t = MOCK_TRAINEES.find(x => x.id === selected);
    // An unknown id used to render NOTHING — a deep link to a stale athlete id
    // left the visitor staring at a blank tab (audit 08-22 #77). Fall back to
    // the roster instead of a white page.
    if (!t) { onClear && onClear(); return null; }
    return <DemoTraineeDetail trainee={t} onBack={onClear} backLabel={T('← BACK')} />;
  }
  const q = search.trim().toLowerCase();
  // Format label parity with the real TraineesView rail (data uses commas).
  const fmtOf = (t) => t.format === 'Gym, Single' ? 'Gym · Single' : t.format === 'Gym, Couple' ? 'Gym · Couple' : (t.format || 'Online');
  const attnOf = (t) => ({
    pay: t.payment === 'OVERDUE' || t.payment === 'NEVER PAID',
    dormant: (t.dormantDays || 0) >= 14,
    // <= 2, not <= 1. The real TraineesView's flagLow is `sessionsRemaining
    // <= 2` and the dashboard tile counts the same way under a label that
    // literally reads "2 or fewer" — so the demo's <= 1 was both a parity gap
    // and a contradiction a buyer could see: the dashboard said 4 low-session
    // athletes and this rail said 3.
    lowSessions: (t.sessionsLeft ?? 0) <= 2,
    noProgram: planCount(t) === 0,
  });
  const activeAttn = Object.keys(attnFlags).filter(k => attnFlags[k]);
  let filtered = MOCK_TRAINEES.filter(t => {
    if (q) { const hay = `${t.name || ''} ${t.email || ''} ${t.format || ''}`.toLowerCase(); if (!hay.includes(q)) return false; }
    if (statusFilter !== 'All' && t.status !== statusFilter) return false;
    if (formatFilter !== 'All' && fmtOf(t) !== formatFilter) return false;
    if (activeAttn.length) { const a = attnOf(t); if (!activeAttn.every(k => a[k])) return false; }
    return true;
  });
  filtered = filtered.slice().sort((a, b) => {
    let cmp = 0;
    if (sortKey === 'name') cmp = (a.name || '').localeCompare(b.name || '');
    else if (sortKey === 'status') cmp = (a.status || '').localeCompare(b.status || '');
    else if (sortKey === 'lastTrained') cmp = (a.dormantDays || 0) - (b.dormantDays || 0);
    else if (sortKey === 'payment') cmp = (a.payment || '').localeCompare(b.payment || '');
    return sortDir === 'asc' ? cmp : -cmp;
  });
  const statusCounts = { All: MOCK_TRAINEES.length };
  ['Active', 'On Hold', 'Inactive', 'Trial', 'Archived'].forEach(s => { statusCounts[s] = MOCK_TRAINEES.filter(t => t.status === s).length; });
  const formatCounts = { All: MOCK_TRAINEES.length };
  ['Online', 'Gym · Single', 'Gym · Couple', 'Bnei Herzliya'].forEach(f => { formatCounts[f] = MOCK_TRAINEES.filter(t => fmtOf(t) === f).length; });
  const flagCounts = { pay: 0, dormant: 0, lowSessions: 0, noProgram: 0 };
  MOCK_TRAINEES.forEach(t => { const a = attnOf(t); Object.keys(flagCounts).forEach(k => { if (a[k]) flagCounts[k]++; }); });
  return (
    <section>
      {/* Header — Athletes title (mirrors TraineesView top row). */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontFamily: FN, fontSize: 13, fontWeight: 700, letterSpacing: '0.18em', color: C.tx, textTransform: 'uppercase' }}>{T('Athletes')}</h2>
      </div>
      {/* Two-column: shared SideRail (identical to the real TraineesView rail) + card grid. */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <SideRail className="cd-rail" narrow={rail.narrow} railOpen={rail.railOpen} setRailOpen={rail.setRailOpen} width={204} top={64} maxHeight="calc(100vh - 76px)"
          search={search} onSearch={setSearch}
          searchPlaceholder={T('Search athletes…')}
          groups={[
            {
              label: T('Status'),
              opts: ['All', 'Active', 'On Hold', 'Inactive', 'Trial', 'Archived'].map(s => ({
                key: s, label: T(s), count: statusCounts[s], active: statusFilter === s,
                accent: s === 'Archived' ? C.rd : undefined, onClick: () => setStatusFilter(s),
              })),
            },
            {
              label: T('Format'),
              opts: ['All', 'Online', 'Gym · Single', 'Gym · Couple', 'Bnei Herzliya'].map(f => ({
                key: f, label: T(f), count: formatCounts[f], active: formatFilter === f, onClick: () => setFormatFilter(f),
              })),
            },
            {
              label: T('Needs Attention'),
              opts: [
                // "Payment due" was 'ממתין לתשלום' — awaiting payment — which
                // reads as the same measure as billing's "3 ממתינות" while
                // counting 4. The predicate is OVERDUE *or* NEVER PAID, which
                // matches the real app and must not change; the label is what
                // was wrong. 'בעיית תשלום' covers both and collides with nothing.
                { key: 'pay', label: T('Payment issue') },
                { key: 'dormant', label: T('Dormant') },
                { key: 'lowSessions', label: T('Low sessions') },
                { key: 'noProgram', label: T('No program') },
              ].map(o => ({ key: o.key, label: o.label, count: flagCounts[o.key], active: !!attnFlags[o.key], accent: C.or, onClick: () => setAttnFlags(m => ({ ...m, [o.key]: !m[o.key] })) })),
            },
            {
              label: T('Sort'),
              opts: [
                { id: 'name', label: T('Name') },
                { id: 'status', label: T('Status') },
                { id: 'lastTrained', label: T('Last trained') },
                { id: 'payment', label: T('Payment') },
              ].map(o => {
                const on = sortKey === o.id;
                const desc = on && sortDir === 'desc';
                // The real rail's active label (TraineesView): the direction in
                // the key's own words, then the key — "A→Z · Name", not "↑ Name".
                const heL = readLang() === 'he';
                const dirLbl = o.id === 'name' ? (heL ? (desc ? 'ת←א' : 'א←ת') : (desc ? 'Z→A' : 'A→Z'))
                  : o.id === 'status' ? (desc ? `↑ ${T('Inactive')}` : `↓ ${T('Active')}`)
                  : o.id === 'lastTrained' ? (desc ? `↓ ${T('Newest')}` : `↑ ${T('Oldest')}`)
                  : (desc ? `↑ ${T('Overdue')}` : `↓ ${T('Paid')}`);
                return { key: o.id, title: on ? (heL ? `היפוך כיוון המיון (${o.label})` : `Flip ${o.label} direction`) : `${T('Sort by')} ${o.label}`, active: on, label: on ? `${dirLbl} · ${o.label}` : o.label,
                  onClick: () => { if (on) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortKey(o.id); setSortDir('asc'); } } };
              }),
            },
          ]}
          footer={<button title={T('Demo only')} style={{ ...baseBtn, background: '#39BDFF', color: '#06131b', border: '1px solid #39BDFF', width: '100%', boxSizing: 'border-box', padding: '0 14px', height: 'var(--btn-h)', marginTop: 'auto', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{T('+ Add Athlete')} ▾</button>}
        />
        {/* RIGHT: the card grid. */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {filtered.length === 0 ? (
            <div style={{
              background: C.sf, border: `1px dashed ${C.bd2}`, borderRadius: 0,
              padding: 40, textAlign: 'center',
            }}>
              <div style={{ fontFamily: FN, fontSize: 11, color: C.td, letterSpacing: 2, fontWeight: 700, marginBottom: 8 }}>{T('NO MATCHES')}</div>
              <div style={{ fontFamily: FB, fontSize: 13, color: C.tm }}>{T('No athlete matches your filters. Clear them to see the full roster.')}</div>
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
        </div>{/* /right column */}
      </div>{/* /two-column layout */}
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
      <span dir="ltr" style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: 1, color: deltaColor, flexShrink: 0, unicodeBidi: 'isolate' }}>
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
        fontFamily: FN, fontSize: 9, color: C.acText, letterSpacing: 1.5, fontWeight: 700,
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
    <CardSection label={T('Training')} center={center}>
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', alignItems: 'center', justifyContent: justify }}>
          <span style={{ fontFamily: FN, fontSize: 11, color: C.tm, letterSpacing: 1, fontWeight: 700, textTransform: 'uppercase' }}>{T(t.format)}</span>
          <MidDot />
          <span style={{ fontFamily: FN, fontSize: 11, color: t.sessionsLeft <= 2 ? C.rd : C.gn, fontWeight: 700 }}>{readLang() === 'he' && t.sessionsLeft === 1 ? 'נותר אימון אחד' : readLang() === 'he' ? (t.sessionsLeft === 0 ? 'לא נותרו אימונים' : `נותרו ${t.sessionsLeft} אימונים`) : `${t.sessionsLeft} ${T('SESSIONS LEFT')}`}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: justify }}>
          <span style={{ fontFamily: FN, fontSize: 11, color: C.tx, fontWeight: 700 }}>{readLang() === 'he' && planCount(t) === 1 ? 'תוכנית אחת' : `${planCount(t)} ${T('PROGRAMS')}`}</span>
        </div>
        {t.lastWorkout && (
          <div style={{ fontFamily: FN, fontSize: 10, color: C.tm, letterSpacing: 1, fontWeight: 600, textAlign: center ? 'center' : 'start' }}>
            {T('LAST WORKOUT')} · {RT(t.lastWorkout).toUpperCase()}
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
    // The age comes off the trainee. It was 34 hard-coded, so three athletes
    // with different stories all claimed the same 34 days, and the dashboard's
    // overdue panel invented a fourth number for the same people.
    items.push(<span key="ov" style={{ fontFamily: FN, fontSize: 11, color: C.rd, fontWeight: 700, letterSpacing: 1 }}>{T('OVERDUE')} · {TN('{n}D', t.overdueDays || 0)}</span>);
  } else if (t.payment === 'PAID') {
    items.push(<span key="pd" style={{ fontFamily: FN, fontSize: 11, color: C.gn, fontWeight: 700, letterSpacing: 1 }}>{T('PAID')} · {(readLang() === 'he' ? daysAgoHe(t.paidDaysAgo || 0) : TN('{n}D AGO', t.paidDaysAgo || 0))}</span>);
  }
  if (t.monthly > 0) {
    items.push(<span key="mo" style={{ fontFamily: FN, fontSize: 11, color: C.td, fontWeight: 700, letterSpacing: 1 }}>{TN('₪{n}/MO', t.monthly)}</span>);
  }
  if (t.dormantDays != null) {
    items.push(<span key="dm" style={{ fontFamily: FN, fontSize: 11, color: C.tm, fontWeight: 700, letterSpacing: 1 }}>{readLang() === 'he' ? 'רדום' : T('DORMANT')} · {TN('{n}D', t.dormantDays)}</span>);
  }
  if (items.length === 0) {
    return (
      <CardSection label={T('Financials')} center={center}>
        <span style={{ fontFamily: FN, fontSize: 11, color: C.tm, fontWeight: 700, letterSpacing: 1, opacity: 0.55 }}>{T('NOT BILLABLE')}</span>
      </CardSection>
    );
  }
  const interleaved = items.flatMap((n, i) => i === 0 ? [n] : [<MidDot key={`d${i}`} />, n]);
  return <CardSection label={T('Financials')} center={center}>{interleaved}</CardSection>;
}

function BodyweightBlock({ weight, center = false }) {
  if (!weight) return null;
  return (
    <CardSection label={T('Bodyweight')} center={center}>
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
  const heb = isHeb(t.name);
  return (
    <div onClick={onClick} style={cardStyle} onMouseEnter={cardEnter} onMouseLeave={cardLeave}>
      {/* Header strip — name (+ online dot) LEFT, status pill RIGHT; mirrors the
          real TraineesView Card header/headerRight. Name is NOT repeated in the
          body (the body is the 80px contact slot + stat blocks). */}
      <div style={{ background: 'color-mix(in srgb, var(--c-stripBg, var(--c-sf)) 90%, var(--c-ac))', margin: '-18px -18px 12px', padding: '8px 18px', borderBottom: `1px solid ${C.cardBd}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0, fontFamily: heb ? FH : FN, fontWeight: 700, fontSize: heb ? 15 : 14, letterSpacing: heb ? 0 : '0.04em', textTransform: heb ? 'none' : 'uppercase', color: 'var(--c-stripTx)' }}>
          <bdi style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</bdi>{t.online && <OnlineDot />}
        </span>
        <span style={{ flexShrink: 0 }} onClick={e => e.stopPropagation()}><DemoStatusMenu initial={t.status} /></span>
      </div>
      {/* 80px contact slot — WhatsApp / phone / email, centered. */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: 80, justifyContent: 'flex-start', paddingTop: 4, overflow: 'hidden' }}>
        <FakeWaButton />
        {t.phone && <div style={{ fontFamily: FN, fontSize: 11, color: C.tm, letterSpacing: 0.5, textAlign: 'center' }}><span dir="ltr" style={{ unicodeBidi: 'isolate' }}>{t.phone}</span></div>}
        <div style={{ fontSize: 12, color: C.tm, textAlign: 'center', whiteSpace: 'normal', overflowWrap: 'break-word', maxWidth: '100%' }}>{t.email}</div>
      </div>
      <FinancialsBlock t={t} center />
      <TrainingBlock t={t} center />
      <BodyweightBlock weight={t.weight} center />
      {/* Bottom action row — PORTAL / EDIT (demo, mirrors the real card). */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'auto', paddingTop: 8, gap: 8 }}>
        <button onClick={e => e.stopPropagation()} title={T("Preview this athlete's portal (demo only)")} style={{ background: 'transparent', border: `1px solid ${C.ac}`, color: C.ac, cursor: 'pointer', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', padding: '0 14px', minHeight: CTRL_H, boxSizing: 'border-box', borderRadius: 0, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>{T('PORTAL')}
        </button>
        <button onClick={e => e.stopPropagation()} style={{ background: 'transparent', border: `1px solid ${C.ac}`, color: C.ac, cursor: 'pointer', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', padding: '0 14px', minHeight: CTRL_H, boxSizing: 'border-box', borderRadius: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{T('EDIT')}</button>
      </div>
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
          {last.toFixed(1)}<span style={{ fontSize: 13, color: C.tm, marginInlineStart: 2 }}>kg</span>
        </span>
        <span style={{
          fontFamily: FN, fontSize: 11, color: parseFloat(delta) <= 0 ? C.gn : C.or, letterSpacing: 1, fontWeight: 700,
        }}><span dir="ltr" style={{ unicodeBidi: 'isolate' }}>{parseFloat(delta) > 0 ? '+' : ''}{delta}</span> {T('kg / 8W')}</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 80, display: 'block' }} aria-label={T('Bodyweight 8-week sparkline')}>
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
      {/* Header strip — full couple name LEFT (white) + status pill RIGHT, the
          IDENTICAL grammar to the single TraineeCard so couple and single cards
          align across the grid (Ohad: name colour + status pill were missing). */}
      <div style={{ background: 'color-mix(in srgb, var(--c-stripBg, var(--c-sf)) 90%, var(--c-ac))', margin: '-18px -18px 12px', padding: '8px 18px', borderBottom: `1px solid ${C.cardBd}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0, fontFamily: isHeb(t.name) ? FH : FN, fontWeight: 700, fontSize: isHeb(t.name) ? 15 : 14, letterSpacing: isHeb(t.name) ? 0 : '0.04em', textTransform: isHeb(t.name) ? 'none' : 'uppercase', color: 'var(--c-stripTx)' }}>
          <bdi style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</bdi>
        </span>
        <span style={{ flexShrink: 0 }} onClick={e => e.stopPropagation()}><DemoStatusMenu initial={t.status} /></span>
      </div>
      {/* 80px member contact slot — two columns, SAME height as the single card's
          contact slot so WhatsApp icons, phones, emails and every divider below
          line up flush across every card (Ohad: alignment rules). */}
      <div style={{ display: 'flex', height: 80, paddingTop: 4, overflow: 'hidden', alignItems: 'stretch' }}>
        {(parsed ? [parsed.a, parsed.b] : [t.name]).map((member, mi) => (
          <React.Fragment key={mi}>
            {mi === 1 && <div style={{ width: 1, background: C.bd, margin: '0 12px', alignSelf: 'stretch' }} />}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, textAlign: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', minHeight: 22 }}>
                <div style={{ fontFamily: FB, fontWeight: 600, fontSize: 13, color: C.tx, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{parsed ? `${member} ${parsed.surname}` : member}</div>
                <FakeWaButton />
              </div>
              {/* isolate LTR: an international number's leading + is bidi-neutral
                  and paints at the WRONG END inside an RTL card — measured,
                  "+972503334455" came out as "972503334455+". The single card
                  above already does this; the couple card did not. */}
              {parsed && <div style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, color: C.tm, letterSpacing: 0.5, whiteSpace: 'normal', overflowWrap: 'anywhere', minWidth: 0, maxWidth: '100%' }}><span dir="ltr" style={{ unicodeBidi: 'isolate' }}>{memberMeta[mi].phone}</span></div>}
              {/* An address wraps rather than being sliced: it was cut by up to
                  60px, and half an email is not an email. */}
              {parsed && <div style={{ fontSize: 12, color: C.tm, whiteSpace: 'normal', overflowWrap: 'anywhere', minWidth: 0, maxWidth: '100%' }}>{memberMeta[mi].email}</div>}
            </div>
          </React.Fragment>
        ))}
      </div>

      <FinancialsBlock t={t} center />
      <TrainingBlock t={t} center />

      {/* BODYWEIGHT — per member, since each has their own curve. Centered
          and split into two mini blocks under one shared label. */}
      <CardSection label={T('Bodyweight')} center>
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
function DemoStatusMenu({ initial = 'Active' } = {}) {
  const [status, setStatus] = useState(initial);
  const [open, setOpen] = useState(false);
  const COLORS = { Active: C.ac, 'On Hold': C.or, Inactive: C.td, Trial: C.ac };
  const color = COLORS[status] || C.tm;
  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <button onClick={() => setOpen(o => !o)} title={T('Change status')} style={{ ...baseBtn, minHeight: CTRL_H, boxSizing: 'border-box', background: 'transparent', border: `1px solid ${color}`, color, padding: '0 12px', fontSize: 11, letterSpacing: '0.12em', display: 'inline-flex', alignItems: 'center', gap: 6 }}>{T(status).toUpperCase()} <span style={{ fontSize: 9, transform: open ? 'rotate(180deg)' : 'none' }}>▾</span></button>
      {open && (
        <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 60, background: C.bg, minWidth: 124 }}>
          {['Active', 'On Hold', 'Inactive', 'Trial'].map(s => (
            <button key={s} onClick={() => { setStatus(s); setOpen(false); }} style={{ display: 'block', width: '100%', textAlign: 'start', minHeight: CTRL_H, boxSizing: 'border-box', padding: '0 12px', background: s === status ? C.acD : 'transparent', border: `1px solid ${s === status ? (COLORS[s] || C.ac) : 'transparent'}`, color: COLORS[s] || C.tx, fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}>{T(s)}</button>
          ))}
        </div>
      )}
    </span>
  );
}

// Card that mirrors the real app's Card + RefinedHeaderStrip look: a faint
// cyan strip header (white title, cyan hairline bottom) over an sf body, so
// the demo athlete-detail reads like the real TraineeDetail instead of the
// old two-column key/value panels.
function DemoDetailCard({ header, headerRight, children, padding = 18, style }) {
  const pad = padding;
  return (
    <div style={{ background: C.sf, border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: pad, ...style }}>
      {header && (
        <div style={{
          background: 'color-mix(in srgb, var(--c-stripBg, var(--c-sf)) 90%, var(--c-ac))',
          // Header-only card: strip bleeds to bottom edge too (no dead band) — real Card parity.
          margin: `-${pad}px -${pad}px ${children ? 12 : -pad}px`,
          // The real strip's box (RefinedHeaderStrip): one 41px height, the
          // title centred in it. 8px padding made these 36px and their titles
          // rode 1-2px low (26.9, #215).
          padding: `0 ${pad}px`, minHeight: 41, boxSizing: 'border-box',
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
          borderBottom: '1px solid var(--c-cardBd)',
          color: '#FFFFFF',
        }}>
          {headerRight ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div style={{ minWidth: 0, flex: '1 1 auto', color: '#FFFFFF' }}>{header}</div>
              <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 8, color: '#FFFFFF' }}>{headerRight}</div>
            </div>
          ) : <div style={{ color: '#FFFFFF' }}>{header}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

// Per-athlete NOTIFICATION mute toggle — matches the real TraineeDetail
// header control (green = on, grey = muted). Demo-only: local state, no
// backend, so a prospect can flip it and see the switch animate.
function DemoNotifToggle() {
  const [off, setOff] = useState(false);
  return (
    <button onClick={() => setOff(o => !o)} title={T("Demo only — mute this athlete's notifications")}
      style={{ background: 'transparent', border: `1px solid ${C.bd}`, borderRadius: 0, cursor: 'pointer', padding: '0 12px', minHeight: CTRL_H, boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', gap: 9 }}>
      <span style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: off ? C.td : C.tx }}>{T('NOTIFICATION')}</span>
      <span style={{ width: 36, height: 20, borderRadius: 10, background: off ? C.sf3 : 'rgba(46,213,115,0.251)', border: `1px solid ${off ? C.bd2 : 'rgba(46,213,115,0.376)'}`, position: 'relative', transition: 'all .15s' }}>
        <span style={{ width: 16, height: 16, borderRadius: 8, background: off ? C.td : C.gn, position: 'absolute', top: 1, left: off ? 1 : 18, transition: 'all .15s' }} />
      </span>
    </button>
  );
}

// ─── Athlete-detail deep sections — demo mocks of the real TraineeDetail
//     sub-surfaces (Messages, CRM, Readiness trends, Evaluation + Intake,
//     Progressive Overload). Static mock data shaped to mirror each real
//     component so the demo shows the platform's true depth. ───────────────

// Readiness metric scales — best→worst; best gets green (mirrors ReadinessRow).
const DEMO_READINESS = {
  pain:   ['none', 'mild', 'moderate', 'high'],
  sleep:  ['great', 'good', 'ok', 'poor'],
  energy: ['high', 'good', 'ok', 'low'],
};
const READ_COLORS = ['#35C36A', '#F2CE1E', '#F0862A', '#E23B3B']; // best→worst
const readColor = (metric, val) => READ_COLORS[Math.max(0, DEMO_READINESS[metric].indexOf(val))] || C.td;

// Filled area+line trend chart, stretched to fill width (preserveAspectRatio
// none). Reused by readiness trends and the overload lift-detail.
function DemoTrendChart({ values, color, height = 90 }) {
  const uid = React.useId().replace(/[:]/g, '');
  const W = 600, H = 100, pad = 6;
  const min = Math.min(...values), max = Math.max(...values), span = (max - min) || 1, n = values.length;
  const xStep = n > 1 ? (W - pad * 2) / (n - 1) : 0;
  const xy = values.map((v, i) => [pad + i * xStep, H - pad - ((v - min) / span) * (H - pad * 2)]);
  const line = xy.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const area = `${pad},${H} ${line} ${(pad + (n - 1) * xStep).toFixed(1)},${H}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height, display: 'block' }}>
      <defs><linearGradient id={`tg${uid}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity="0.22" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      {[0.25, 0.5, 0.75].map(f => <line key={f} x1="0" y1={(H * f).toFixed(1)} x2={W} y2={(H * f).toFixed(1)} stroke={C.bd} strokeWidth="0.5" strokeDasharray="4 4" />)}
      <polygon points={area} fill={`url(#tg${uid})`} />
      <polyline points={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// MESSAGES — coach↔athlete thread (bubbles) + static composer.
// Three faults in three lines, all on the Hebrew screen too because none of
// this text ever went through T(): the thread was dated two months ago, and
// the athlete replied "Knee held up fine on legs day" on the page of a woman
// whose own record says L4-L5 disc bulge and on the page of a man whose says
// shoulder impingement. The reply is now injury-neutral — it cannot contradict
// a record it does not name — and the timestamps resolve from today.
const msgTime = (daysAgo, hhmm) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${hhmm}`;
};
const DEMO_MESSAGES = [
  { role: 'coach',   time: msgTime(4, '09:14'), text: 'Great work on the bench this week — those ISO holds are paying off. Keep the eccentric controlled on the trap-bar pulls.' },
  { role: 'athlete', time: msgTime(4, '18:02'), text: 'Thanks! Felt strong — no niggles this week.' },
  { role: 'coach',   time: msgTime(3, '08:40'), text: 'Perfect. Bumping the Day A top set next week — log your readiness (pain / sleep / energy) before you start so I can autoregulate it.' },
];
function DemoMessages() {
  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto', marginBottom: 12 }}>
        {DEMO_MESSAGES.map((m, i) => {
          const self = m.role === 'coach';
          return (
            <div key={i} style={{ display: 'flex', justifyContent: self ? 'flex-end' : 'flex-start' }}>
              <div style={{ maxWidth: '78%', minWidth: 0, borderRadius: 0, padding: '8px 10px', background: self ? 'rgba(57,189,255,0.094)' : 'var(--c-sf)', border: `1px solid ${self ? C.ac : C.cardBd}` }}>
                <div style={{ fontFamily: FN, fontSize: 9, color: C.td, letterSpacing: '0.08em', marginBottom: 3 }}>{self ? T('COACH') : T('ATHLETE')} · <span dir="ltr" style={{ unicodeBidi: 'isolate' }}>{m.time}</span></div>
                {/* overflowWrap so a pasted URL or a long word cannot push past the
                    bubble. Defensive only: I first added this believing the gate's
                    "SPILLING by 4px" on this bubble was real. It was not - that was
                    a trailing space measured under pre-wrap, in a DIFFERENT component
                    (TrySandbox), and the gate now ends its range on the last letter. */}
                <div style={{ fontSize: 13, color: C.tx, lineHeight: 1.4, overflowWrap: 'anywhere' }}>{T(m.text)}</div>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input title={T('Demo only')} placeholder={T('Type a note to your athlete…')} style={{ ...baseInput, flex: 1, minWidth: 0, fontSize: 13 }} />
        <button title={T('Demo only')} style={{ ...baseBtn, background: 'transparent', color: C.rd, border: '1px solid rgba(255,71,87,0.4)', fontSize: 11 }}>● {T('REC')}</button>
        <button title={T('Demo only')} style={{ ...baseBtn, background: C.ac, color: '#00121c', fontSize: 11 }}>{T('SEND →')}</button>
      </div>
    </div>
  );
}

// CRM — health strip + coach-history (ACTIONS / ACTIVITY tabs).
// The coach-history feed was identical on every athlete and quoted two facts
// that belonged to nobody on the page: ₪1,200, which is only the couple's
// monthly, and "Block #12", which appears in no athlete's plan list at all.
// It also opened with "check in re: right shoulder" and "checked in about
// knee" on the records of people whose injuries are a lumbar disc, a
// patellofemoral knee, and none — and it was dated two months ago.
// Now: the amount is the athlete's own monthly, the block is the newest one in
// their own plans array, the note names their own injury, and every timestamp
// resolves from today.
function DemoCRM({ trainee }) {
  const [tab, setTab] = useState('activity');
  const t = trainee || {};
  const hurt = t.injuries && t.injuries !== 'None' ? t.injuries : null;
  const block = (t.plans && t.plans[0]) || '—';
  const when = (d, hhmm) => `${dAgoLabel(d).replace(/ \d{4}$/, '')} · ${hhmm}`;
  const actions = [
    hurt ? `${T('Check in re:')} ${T(hurt)}` : T('Check in after the last session'),
    T('Send updated nutrition targets'),
    T('Confirm payment for next month'),
  ];
  const activity = [
    { kind: T('SESSION'), color: C.gn, when: when(2, '14:20'), auto: true,  text: T('Completed Upper A — 6 exercises logged') },
    { kind: T('WHATSAPP'), color: C.gn, when: when(3, '09:10'), auto: false, text: hurt ? `${T('Checked in about')} ${T(hurt)}` : T('Checked in — feeling good') },
    { kind: T('PAYMENT'), color: C.gn, when: when(t.paidDaysAgo != null ? t.paidDaysAgo : 30, '08:00'), auto: true,  text: <><span dir="ltr" style={{ unicodeBidi: 'isolate' }}>{'₪' + (t.monthly || 0).toLocaleString()}</span> — {T('monthly package')}</> },
    { kind: T('PLAN'), color: C.ac, when: when(12, '17:45'), auto: true,  text: `${T('Assigned')} ${block}` },
  ];
  return (
    <div>
      {/* Health strip (TRAINING/LAST CONTACT/PAYMENT/CLIENT) removed for parity
          with the real app — those facts live in their own sections. */}
      <div style={{ display: 'flex', gap: 18, borderBottom: `1px solid ${C.cardBd}`, marginBottom: 10 }}>
        {[['actions', T('ACTIONS')], ['activity', T('ACTIVITY')]].map(([id, l]) => (
          <button key={id} onClick={() => setTab(id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 8px', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', color: tab === id ? C.ac : C.tm, borderBottom: tab === id ? `2px solid ${C.ac}` : '2px solid transparent' }}>{l}</button>
        ))}
      </div>
      {tab === 'actions' ? (
        <div>{actions.map((a, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 0', borderBottom: i < actions.length - 1 ? `1px solid ${C.cardBd}` : 'none' }}>
            <span style={{ width: 15, height: 15, border: `1px solid ${C.tm}`, flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: C.tx }}>{a}</span>
          </div>
        ))}</div>
      ) : (
        <div>{activity.map((a, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0', alignItems: 'center', borderBottom: i < activity.length - 1 ? `1px solid ${C.cardBd}` : 'none' }}>
            {/* Dot in a 15px slot matching the Actions checkbox so text starts at the
                same x across both tabs. */}
            <span style={{ width: 15, display: 'inline-flex', justifyContent: 'center', flexShrink: 0 }}><span style={{ width: 7, height: 7, borderRadius: 4, background: a.color }} /></span>
            {/* summary + when on ONE row (parity with the real app) */}
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: C.tx }}>{a.text}</span>
            <span style={{ flexShrink: 0, fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}><span style={{ color: a.color }}>{a.kind}</span><span style={{ color: C.td }}> · {RT(a.when)}{a.auto ? ` · ${T('AUTO')}` : ''}</span></span>
          </div>
        ))}</div>
      )}
    </div>
  );
}

// READINESS TRENDS — metric toggle + area chart + summary tiles (CheckinTrends).
const DEMO_READINESS_LOG = [
  { week: 1, pain: 'moderate', sleep: 'ok',    energy: 'ok'   },
  { week: 2, pain: 'mild',     sleep: 'good',  energy: 'ok'   },
  { week: 3, pain: 'mild',     sleep: 'good',  energy: 'good' },
  { week: 4, pain: 'none',     sleep: 'great', energy: 'good' },
  { week: 5, pain: 'mild',     sleep: 'good',  energy: 'high' },
  { week: 6, pain: 'none',     sleep: 'great', energy: 'high' },
  { week: 7, pain: 'none',     sleep: 'good',  energy: 'high' },
];
function DemoReadinessTrends() {
  const [metric, setMetric] = useState('pain');
  const scale = DEMO_READINESS[metric]; // best→worst
  const rank = (v) => scale.length - 1 - scale.indexOf(v); // best → high (top)
  const values = DEMO_READINESS_LOG.map(r => rank(r[metric]));
  const latest = DEMO_READINESS_LOG[DEMO_READINESS_LOG.length - 1][metric];
  const first = values[0], last = values[values.length - 1];
  const trend = last > first ? 'BETTER' : last < first ? 'WORSE' : 'SAME';
  const trendColor = trend === 'BETTER' ? C.gn : trend === 'WORSE' ? C.rd : C.tm;
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {['pain', 'sleep', 'energy'].map(m => (
          <button key={m} onClick={() => setMetric(m)} style={{ flex: 1, minHeight: CTRL_H, boxSizing: 'border-box', borderRadius: 0, cursor: 'pointer', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', background: metric === m ? 'rgba(57,189,255,0.12)' : 'transparent', border: `1px solid ${metric === m ? C.ac : C.cardBd}`, boxShadow: metric === m ? `inset 0 2px 0 ${C.ac}` : 'none', color: metric === m ? C.ac : C.tm }}>{T(m)}</button>
        ))}
      </div>
      <div style={{ border: `1px solid ${C.ac}`, padding: 14, marginBottom: 10 }}>
        <div style={{ fontFamily: FN, fontSize: 10, color: C.ac, letterSpacing: '0.15em', fontWeight: 700, marginBottom: 8 }}>{T(metric).toUpperCase()} {T('TREND')}</div>
        <DemoTrendChart values={values} color="#39BDFF" height={120} />
        <div style={{ display: 'flex', marginTop: 6 }}>
          {DEMO_READINESS_LOG.map((r) => (
            <div key={r.week} style={{ flex: 1, textAlign: 'center', fontFamily: FN, fontSize: 8, color: C.tm }}>{T('W')}{r.week}</div>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {[[T('LATEST'), T(latest).toUpperCase(), readColor(metric, latest)], [T('TREND'), T(trend), trendColor], [T('CHECK-INS'), String(DEMO_READINESS_LOG.length), C.tx]].map(([l, v, c]) => (
          <div key={l} style={{ flex: 1, border: `1px solid ${C.cardBd}`, padding: '11px 6px', textAlign: 'center' }}>
            <div style={{ fontFamily: FN, fontSize: 8, color: C.td, letterSpacing: '0.14em', fontWeight: 700 }}>{l}</div>
            <div style={{ fontFamily: FN, fontSize: 16, fontWeight: 700, color: c, marginTop: 3 }}>{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// EVALUATION + INTAKE — collapsed eval rows + one intake card.
// EVERY athlete used to show this same assessment: a 34-year-old man, 178cm,
// 82kg, with a right ACL reconstruction — printed a few hundred pixels under
// נועה's own record, which says 31, 64kg, L4-L5 disc bulge. His 1RMs were hers
// too. The drill-in is the deepest screen in the demo and the one a coach
// studies hardest, so a fabricated assessment contradicting the athlete's own
// injury field is the fastest way to be caught.
// It is now derived from the athlete's record: their age, height and weight,
// their injury, their goal, and lifts scaled to their bodyweight rather than
// to one invented man's.
// The first attempt at fixing this scaled the lifts off bodyweight. That is a
// male-normed formula, and it handed a 64kg woman a 1.3x-bodyweight bench —
// one wrong traded for another, and one a coach spots faster. Each athlete's
// numbers are written into the fixture instead, chosen against their own
// bodyweight, goal and injury: the athlete with a lumbar disc deadlifts
// conservatively, the one with patellofemoral knee pain jumps least, the one
// prepping a powerlifting meet is the strongest in the room.
// "15 Jul 2026" and "20 Apr 2026" were typed into the assessment card, so in
// September they read as the future and the recent past at the same time.
// Every other date in this demo resolves from today; these now do too.
const dAgoLabel = (n) => {
  const d = backDate(n);
  return `${d.getDate()} ${MON3[d.getMonth()]} ${d.getFullYear()}`;
};
const demoEvalFor = (t) => {
  const e = t.ev || {};
  const n = (v) => (v == null ? '—' : String(v));
  return {
    age: t.age, height: t.height, weight: t.weight, fields: 26,
    injuries: t.injuries, goals: t.goals,
    sections: [
      { title: 'Lower Body Power', rows: [['Standing Vertical Jump', 'cm', n(e.vj)], ['Broad Jump', 'cm', n(e.bj)]] },
      { title: 'Max Strength', rows: [
        ['Trap-Bar Deadlift 1RM', 'kg', n(e.dl)],
        ['Bench Press 1RM', 'kg', n(e.bp)],
        ['Back Squat 1RM', 'kg', '—'],
      ] },
    ],
  };
};
function DemoEvalIntake({ trainee }) {
  const DEMO_EVAL = demoEvalFor(trainee || {});
  const [open, setOpen] = useState(true);
  return (
    <div>
      <div style={{ border: `1px solid ${C.ac}`, marginBottom: 8 }}>
        <div onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '10px 14px', cursor: 'pointer' }}>
          <span style={{ fontFamily: FN, fontSize: 13, color: C.ac, fontWeight: 700 }} dir="ltr">{dAgoLabel(74)}</span>
          <span style={{ fontFamily: FN, fontSize: 11, color: C.tm, flex: 1 }}><span style={{ color: C.td }}>{T('AGE')} </span>{DEMO_EVAL.age} · <span style={{ color: C.td }}>{T('HT')} </span>{DEMO_EVAL.height}cm · <span style={{ color: C.td }}>{T('WT')} </span>{DEMO_EVAL.weight}kg · <span style={{ color: C.td }}>{T('FIELDS')} </span>{DEMO_EVAL.fields}</span>
          <span style={{ color: C.tm, fontSize: 12 }}>{open ? '▾' : '▸'}</span>
        </div>
        {open && (
          <div style={{ padding: '0 14px 14px' }}>
            {DEMO_EVAL.sections.map((s, si) => (
              <div key={si} style={{ marginTop: 10 }}>
                <div style={{ fontFamily: FN, fontSize: 10, color: C.ac, letterSpacing: '0.2em', fontWeight: 700, borderBottom: `1px solid ${C.cardBd}`, paddingBottom: 4, marginBottom: 4 }}>{T(s.title).toUpperCase()}</div>
                {s.rows.map(([test, unit, score], ri) => (
                  <div key={ri} style={{ display: 'grid', gridTemplateColumns: '1fr 60px 70px', gap: 8, padding: '5px 0', fontSize: 12 }}>
                    <span style={{ color: C.tx }}>{test}</span>
                    <span style={{ color: C.td, textAlign: 'end' }}>{unit}</span>
                    <span style={{ color: score === '—' ? C.td : C.tx, fontWeight: 700, textAlign: 'end' }}>{score}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
      <div style={{ border: `1px solid ${C.cardBd}`, padding: '12px 14px' }}>
        <div style={{ textAlign: 'center', marginBottom: 10 }}>
          <Badge color={C.ac}>{T('INITIAL')}</Badge>
          <span style={{ fontFamily: FN, fontSize: 11, color: C.tm, marginInlineStart: 8 }}>· <span dir="ltr" style={{ unicodeBidi: 'isolate' }}>{dAgoLabel(156)}</span></span>
        </div>
        {[[T('Primary goal'), T(DEMO_EVAL.goals || '—')], [T('Injuries'), T(DEMO_EVAL.injuries || 'None')], [T('Days/week available'), '4'], [T('Equipment'), T(/Gym/.test(trainee?.format || '') ? 'Full commercial gym' : 'Home / minimal kit')]].map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '5px 0', borderBottom: `1px solid ${C.cardBd}`, fontSize: 12 }}>
            <span style={{ color: C.tm }}>{k}</span>
            <span style={{ color: C.tx, textAlign: 'end' }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// PROGRESSIVE OVERLOAD — searchable per-exercise table, one row expands into
// PR + trend chart + session history. The showpiece section.
const DEMO_OVERLOAD = [
  { eid: 'e1', name: 'Barbell Bench Press', loads: [100, 102.5, 105, 107.5, 110], reps: [5, 5, 4, 3, 3], ago: [28, 21, 14, 7, 0] },
  { eid: 'e2', name: 'Trap-Bar Deadlift',   loads: [150, 155, 160, 165, 180], reps: [5, 5, 5, 4, 3], ago: [28, 21, 14, 7, 0] },
  { eid: 'e3', name: 'Back Squat',          loads: [140, 142.5, 140, 140, 138], reps: [5, 5, 5, 5, 5], ago: [28, 21, 14, 7, 0] },
  { eid: 'e4', name: 'Overhead Press',      loads: [60, 60, 60], reps: [6, 6, 6], ago: [21, 7, 0] },
  { eid: 'e5', name: 'Barbell Row',         loads: [80, 85], reps: [8, 8], ago: [14, 0] },
];
// The table above is one athlete's training history, and it was rendered on
// EVERY athlete's page: a 110kg bench and a 180kg trap-bar deadlift shown on
// the record of a 64kg woman whose own row says L4-L5 disc bulge. The showpiece
// section of the deepest screen, contradicting the athlete it belongs to.
// Scaled per athlete by their own assessed deadlift against the 200kg 1RM this
// series implies, so the PROGRESSION — which is what the section is for — is
// preserved while the weights belong to the person.
// The session dates were typed as '2 Jun'..'30 Jun', so by September the
// showpiece progression table was three months stale — the loads had been
// scaled to the athlete but the history still said June. They are weekly
// offsets now and resolve from today, like every other date in the demo.
const ovDate = (daysAgo) => {
  const d = backDate(daysAgo);
  return `${d.getDate()} ${MON3[d.getMonth()]}`;
};
const demoOverloadFor = (t) => {
  const f = (t?.ev?.dl ?? 200) / 200;
  if (Math.abs(f - 1) < 0.01) return DEMO_OVERLOAD;
  const r = (n) => Math.round((n * f) / 2.5) * 2.5;
  return DEMO_OVERLOAD.map((ex) => ({ ...ex, loads: ex.loads.map(r) }));
};
const ovStats = (ex) => {
  const s = ex.loads, last = s[s.length - 1], base = s.length >= 4 ? s[s.length - 4] : s[0];
  const pct = base ? Math.round((last - base) / base * 1000) / 10 : 0;
  const trend = pct > 2 ? 'up' : pct < -2 ? 'down' : 'flat';
  return { last, pct, pr: Math.max(...s), prIdx: s.indexOf(Math.max(...s)), trend, sessions: s.length };
};
const OV_COLOR = { up: C.gn, down: C.rd, flat: C.tm, all: C.ac };
function DemoOverload({ trainee }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [openEid, setOpenEid] = useState('e2');
  const table = demoOverloadFor(trainee);
  const rows = table.map(ex => ({ ex, st: ovStats(ex) }))
    .filter(({ ex, st }) => (!search || ex.name.toLowerCase().includes(search.toLowerCase())) && (filter === 'all' || st.trend === filter));
  const counts = { all: table.length, up: 0, flat: 0, down: 0 };
  table.forEach(ex => { counts[ovStats(ex).trend]++; });
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder={T('search exercise')} style={{ ...baseInput, flex: '1 1 200px', minWidth: 160, height: 30, boxSizing: 'border-box', padding: '0 10px', fontSize: 12 }} />
        {[['all', T('ALL')], ['up', '↑'], ['flat', '→'], ['down', '↓']].map(([id, lbl]) => (
          <button key={id} onClick={() => setFilter(id)} style={{ background: filter === id ? 'transparent' : 'transparent', border: `1px solid ${filter === id ? OV_COLOR[id] : C.cardBd}`, color: filter === id ? OV_COLOR[id] : C.tm, borderRadius: 0, minHeight: CTRL_H, boxSizing: 'border-box', cursor: 'pointer', padding: '0 10px', fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em' }}>{lbl} {counts[id]}</button>
        ))}
      </div>
      <div style={{ overflowX: 'auto', border: `1px solid ${C.cardBd}`, background: 'var(--c-sf)' }}>
        <table style={{ width: '100%', minWidth: 460, borderCollapse: 'collapse', fontFamily: FB, fontSize: 13 }}>
          <thead><tr style={{ borderBottom: `1px solid ${C.cardBd}` }}>{['Exercise', 'Last', 'Δ Recent', 'Sess', 'Last Date'].map((h, i) => <th key={h} style={{ textAlign: i === 0 ? 'left' : 'center', padding: '8px 10px', fontFamily: FN, fontSize: 9, color: C.td, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700 }}>{T(h)}</th>)}</tr></thead>
          <tbody>
            {rows.map(({ ex, st }) => {
              const open = openEid === ex.eid;
              const arrow = st.trend === 'up' ? `↑ +${st.pct}%` : st.trend === 'down' ? `↓ ${st.pct}%` : `→ ${st.pct}%`;
              const values = ex.loads;
              return (
                <React.Fragment key={ex.eid}>
                  <tr onClick={() => setOpenEid(open ? '' : ex.eid)} style={{ borderBottom: `1px solid ${C.cardBd}`, cursor: 'pointer' }}>
                    <td style={{ padding: '9px 10px', color: C.tx, fontWeight: 600 }}>{open ? '▾' : '▸'} {ex.name}</td>
                    <td style={{ padding: '9px 10px', textAlign: 'center', fontFamily: FN, fontWeight: 700, color: C.tx }}>{st.last}kg</td>
                    {/* The sign is class ES: with nothing numeric before it,
                        UAX#9 hands it the paragraph direction and it jumps to
                        the other end — "+10.5%" painted as "10.5%+" on every
                        row of the showpiece table. Isolated. */}
                    <td style={{ padding: '9px 10px', textAlign: 'center', fontFamily: FN, fontWeight: 700, color: OV_COLOR[st.trend] }}><span dir="ltr" style={{ unicodeBidi: 'isolate' }}>{arrow}</span></td>
                    <td style={{ padding: '9px 10px', textAlign: 'center', color: C.tm }}>{st.sessions}</td>
                    <td style={{ padding: '9px 10px', textAlign: 'center', color: C.td, fontFamily: FN, fontSize: 11 }}><span dir="ltr" style={{ unicodeBidi: 'isolate' }}>{ovDate(ex.ago[ex.ago.length - 1])}</span></td>
                  </tr>
                  {open && (
                    <tr><td colSpan={5} style={{ background: 'var(--c-sf2, var(--c-sf))', padding: '14px 16px 18px 30px' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, marginBottom: 12 }}>
                        <div>
                          <div style={{ fontFamily: FN, fontSize: 9, color: C.ac, letterSpacing: '0.18em', fontWeight: 700 }}>{T('ALL-TIME PR')}</div>
                          <div style={{ fontFamily: FB, fontSize: 22, fontWeight: 800, color: C.ac, marginTop: 2 }}>{st.pr}kg × {ex.reps[st.prIdx]}</div>
                          <div style={{ fontFamily: FN, fontSize: 10, color: C.tm, marginTop: 2 }}><span dir="ltr" style={{ unicodeBidi: 'isolate' }}>{ovDate(ex.ago[st.prIdx])}</span></div>
                        </div>
                        <div style={{ display: 'flex', gap: 18 }}>
                          {[[T('LATEST'), `${st.last}kg`, C.tx], [T('Δ ALL-TIME'), <span dir="ltr" style={{ unicodeBidi: 'isolate' }}>{`${st.last - ex.loads[0] >= 0 ? '+' : ''}${st.last - ex.loads[0]}kg`}</span>, st.last - ex.loads[0] >= 0 ? C.gn : C.rd], [T('SESSIONS'), String(st.sessions), C.tx]].map(([l, v, c]) => (
                            <div key={l} style={{ textAlign: 'center' }}><div style={{ fontFamily: FN, fontSize: 8, color: C.td, letterSpacing: '0.14em', fontWeight: 700 }}>{l}</div><div style={{ fontFamily: FN, fontSize: 14, fontWeight: 700, color: c, marginTop: 2 }}>{v}</div></div>
                          ))}
                        </div>
                      </div>
                      <DemoTrendChart values={values} color={OV_COLOR[st.trend] === C.tm ? C.ac : OV_COLOR[st.trend]} height={72} />
                      <div style={{ fontFamily: FN, fontSize: 9, color: C.td, letterSpacing: '0.14em', fontWeight: 700, margin: '12px 0 6px' }}>{T('SESSION HISTORY')}</div>
                      {ex.loads.map((ld, i) => i).reverse().map(i => {
                        const isPr = ex.loads[i] === st.pr;
                        return (
                          <div key={i} style={{ display: 'grid', gridTemplateColumns: '70px 1fr auto', gap: 8, padding: '5px 0', borderBottom: `1px solid ${C.cardBd}`, alignItems: 'center', fontSize: 12 }}>
                            <span style={{ color: C.td, fontFamily: FN, fontSize: 11 }}><span dir="ltr" style={{ unicodeBidi: 'isolate' }}>{ovDate(ex.ago[i])}</span></span>
                            <span><span style={{ color: C.tx, fontWeight: 700 }}>{ex.loads[i]}kg</span> <span style={{ color: C.tm }}>× {ex.reps[i]}</span></span>
                            {isPr ? <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, fontFamily: FN, fontSize: 9, fontWeight: 700, color: C.ac, border: `1px solid ${C.ac}`, padding: '2px 6px', letterSpacing: '0.1em' }}>{T('PR')}</span> : <span />}
                          </div>
                        );
                      })}
                    </td></tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DemoTraineeDetail({ trainee, onBack, backLabel = '← BACK' }) {
  // How many days back the LAST payment was, off the trainee's own record:
  // a paying client's last cycle, an overdue one's last cycle before the
  // one they missed. Every date on this card is measured from it.
  const paidAgo = trainee.payment === 'OVERDUE' ? (trainee.overdueDays || 0) + 30 : (trainee.paidDaysAgo || 0);
  // The action row was four dead buttons carrying a `title` tooltip. A title
  // is invisible on a phone (no mobile browser renders one) and unreachable by
  // keyboard, so on the two surfaces that matter the buttons simply did
  // nothing — and the run sheet had a line telling him not to click them.
  // They now say what the full app does, the same way Review → Tools does.
  const [actionNote, setActionNote] = useState(null);
  const ACTION_NOTE = {
    log: 'Demo only — in the full app this opens the session logger for this athlete.',
    portal: 'Demo only — in the full app this opens what the athlete sees in their portal.',
    edit: 'Demo only — in the full app this opens the athlete’s record for editing.',
    archive: 'Demo only — in the full app this archives the athlete and stops their billing.',
  };
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
  // Section-filter tabs (solo layout) — multi-select show/hide, mirrors the
  // real TraineeDetail. Empty set = View All. Hooks stay at component top level
  // (the solo body is an IIFE, so state can't live inside it).
  const [activeSecs, setActiveSecs] = useState(() => new Set());
  const FILTERABLE_SECS = ['billing', 'bw', 'readiness', 'workouts', 'programs', 'overload'];
  // SINGLE-SELECT (Ohad): each section tab isolates to ONLY that section;
  // clicking the active tab again returns to View All. Mirrors TraineeDetail.jsx.
  const toggleSec = (id) => setActiveSecs(prev => (prev.size === 1 && prev.has(id)) ? new Set() : new Set([id]));
  const showSec = (id) => activeSecs.size === 0 || activeSecs.has(id);
  return (
    <section>
      {/* Mobile: the Vitals grid's fixed repeat(3,132px) (396px + gaps)
          overflows a 390px viewport — collapse it to 3 fluid columns below
          760px, matching the real TraineeDetail's .td-vitals-grid rule. */}
      <style>{`
        @media (max-width: 760px) {
          .demo-td-vitals { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; max-width: 100% !important; gap: 10px 6px !important; }
        }
      `}</style>
      {/* Back + action bar. Left-aligned BACK then the action cluster —
          same layout + button set as the real coach app's TraineeDetail
          (LOG SESSION / PORTAL / EDIT / NOTIFICATION toggle / ARCHIVE).
          Demo-only: clicks are no-ops, tooltipped "Demo only". For a solo
          athlete the status menu lives inside the identity card strip (as in
          the real app); couples keep it here since their layout has no strip. */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 18 }}>
        <button onClick={onBack} style={{
          ...baseBtn, background: 'transparent', color: C.tm,
          border: `1px solid ${C.bd}`,
        }}>{backLabel}</button>
        {isCouple && <DemoStatusMenu />}
        <button onClick={() => setActionNote('log')} style={{
          ...baseBtn, background: 'transparent', color: C.tx,
          border: `1px solid ${C.bd}`, padding: '0 14px', fontSize: 11,
        }}>{T('LOG SESSION')}</button>
        <button onClick={() => setActionNote('portal')} style={{
          ...baseBtn, background: 'transparent', color: C.tx,
          border: `1px solid ${C.bd}`, padding: '0 14px', fontSize: 11,
        }}>{T('PORTAL')}</button>
        <button onClick={() => setActionNote('edit')} style={{
          ...baseBtn, background: 'transparent', color: C.tx,
          border: `1px solid ${C.bd}`, padding: '0 14px', fontSize: 11,
        }}>{T('EDIT')}</button>
        <DemoNotifToggle />
        <button onClick={() => setActionNote('archive')} style={{
          ...baseBtn, background: 'transparent', color: C.rd,
          border: `1px solid rgba(255,71,87,0.251)`, padding: '0 14px', fontSize: 11,
        }}>{T('ARCHIVE')}</button>
        {actionNote && (
          <div style={{ flex: '1 1 100%', fontFamily: FB, fontSize: 11.5, color: C.ac, borderTop: `1px solid ${C.cardBd}`, paddingTop: 8, marginTop: 2 }}>
            {T(ACTION_NOTE[actionNote])}
          </div>
        )}
      </div>

      {/* Couple branch: per-member columns first (name/email/phone/age/
          weight/height/goals/injuries/BW), then a row of SHARED panels
          below (Household terms, Programs, Payments, Recent Workouts). */}
      {isCouple && coupleSplit ? <>
        {/* Identity header strip — same grammar as the solo detail (cyan glow
            name + status dropdown) so couples don't look like a stale build. */}
        {(() => { const heb = isHeb(trainee.name); return (
          <DemoDetailCard style={{ marginBottom: 14 }}
            headerRight={<DemoStatusMenu />}
            header={<span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 10, minWidth: 0, fontWeight: 700, fontSize: heb ? 16 : 14, fontFamily: heb ? FH : undefined, letterSpacing: heb ? 0 : '0.04em', textTransform: heb ? 'none' : 'uppercase' }}>
              <span style={{ color: C.ac, textShadow: '0 0 12px rgba(57,189,255,0.45)' }}>{trainee.name}</span>
              <span style={{ fontSize: 11, opacity: 0.78, letterSpacing: '0.02em', textTransform: 'none', fontWeight: 500 }}>{trainee.format}{trainee.phone ? ` · ${trainee.phone}` : ''}</span>
            </span>}>
            <div style={{ fontFamily: FN, fontSize: 10, color: C.tm, letterSpacing: '0.14em', textTransform: 'uppercase', paddingTop: 8, fontWeight: 700 }}>{T('Shared household ·')}{coupleSplit.length} {T('members')}</div>
          </DemoDetailCard>
        ); })()}

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
                <div style={{ fontFamily: FN, fontSize: 11, color: C.tm, letterSpacing: 1, marginBottom: 12 }}>{m.email} · <span dir="ltr" style={{ unicodeBidi: 'isolate' }}>{m.phone}</span></div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, textAlign: 'center', marginBottom: 12 }}>
                  {[['AGE', `${m.age}y`], ['WEIGHT', `${m.weight}kg`], ['HEIGHT', `${m.height}cm`]].map(([l, v]) => (
                    <div key={l}>
                      <div style={{ fontFamily: FN, fontSize: 9, color: C.td, letterSpacing: 1.5, fontWeight: 700 }}>{l}</div>
                      <div style={{ fontFamily: FB, fontSize: 14, color: C.tx, fontWeight: 600, marginTop: 2 }}>{v}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontFamily: FN, fontSize: 10, color: C.ac, letterSpacing: 1.5, fontWeight: 700, marginBottom: 4 }}>{T('GOAL')}</div>
                  <div style={{ fontFamily: FB, fontSize: 13, color: C.tx, opacity: 0.85, lineHeight: 1.45 }}>{m.goals}</div>
                </div>
                <div>
                  <div style={{ fontFamily: FN, fontSize: 10, color: C.or, letterSpacing: 1.5, fontWeight: 700, marginBottom: 4 }}>{T('INJURIES')}</div>
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
          <Panel title={T('SHARED · HOUSEHOLD TERMS')} tint={C.tm}>
            <Row><span style={{ flex: 1, color: C.tm, fontSize: 11, fontFamily: FN, letterSpacing: 1 }}>{T('FORMAT')}</span><span style={{ color: C.tx, fontWeight: 600 }}>{T(String(trainee.format || '').replace(', ', ' · '))}</span></Row>
            <Row><span style={{ flex: 1, color: C.tm, fontSize: 11, fontFamily: FN, letterSpacing: 1 }}>{T('PACKAGE')}</span><span style={{ color: C.tx, fontWeight: 600 }}>{trainee.isCouple ? T('12 Sessions') : T('8 Sessions')}</span></Row>
            <Row><span style={{ flex: 1, color: C.tm, fontSize: 11, fontFamily: FN, letterSpacing: 1 }}>{T('SESSIONS')}</span><span style={{ color: trainee.sessionsLeft <= 2 ? C.rd : C.tx, fontWeight: 700 }}>{readLang() === 'he' ? sessionsLeftHe(trainee.sessionsLeft) : `${trainee.sessionsLeft} ${T('LEFT')}`}</span></Row>
            <Row><span style={{ flex: 1, color: C.tm, fontSize: 11, fontFamily: FN, letterSpacing: 1 }}>{T('MONTHLY')}</span><span style={{ color: C.tx, fontWeight: 600 }}>₪{trainee.monthly}</span></Row>
            <Row><span style={{ flex: 1, color: C.tm, fontSize: 11, fontFamily: FN, letterSpacing: 1 }}>{T('PER SESSION')}</span><span style={{ color: C.tx, fontWeight: 600 }}>₪{Math.round(trainee.monthly / 12)}</span></Row>
            <Row><span style={{ flex: 1, color: C.tm, fontSize: 11, fontFamily: FN, letterSpacing: 1 }}>{T('LAST PAYMENT')}</span><span style={{ color: C.tx, fontWeight: 600 }} dir="ltr">{trainee.payment === 'NEVER PAID' ? '—' : fmtPrettyDate(dAgo(paidAgo))}</span></Row>
            <Row><span style={{ flex: 1, color: C.tm, fontSize: 11, fontFamily: FN, letterSpacing: 1 }}>{T('SINCE')}</span><span style={{ color: C.tx, fontWeight: 600 }} dir="ltr">{fmtPrettyDate(trainee.startDate)}</span></Row>
          </Panel>

          <Panel title={T('SHARED · PROGRAMS')} tint={C.ac}>
            {trainee.plans.map((name, i) => (
              <Row key={i}>
                <span style={{ flex: 1, color: C.tx, fontWeight: 600 }}>{name}</span>
                <Badge color={i === 0 ? C.gn : C.td}>{tr(readLang(), i === 0 ? 'ACTIVE' : 'ARCHIVED')}</Badge>
              </Row>
            ))}
          </Panel>

          <Panel title={<span>{T('SHARED · PAYMENTS (3)')} <span style={{ color: C.gn, marginInlineStart: 8 }}>₪{(trainee.monthly * 3).toLocaleString()}{T('TOTAL')}</span></span>} tint={C.ac}>
            {[
              { date: dAgo(paidAgo), method: 'Bank Transfer' },
              { date: dAgo(paidAgo + 30), method: 'Bank Transfer' },
              { date: dAgo(paidAgo + 61), method: 'Cash' },
            ].map((p, i) => (
              <Row key={i}>
                <span style={{ flex: 1, color: C.tx, fontWeight: 600 }}>₪{trainee.monthly}</span>
                <span style={{ fontFamily: FN, fontSize: 11, color: C.tm, letterSpacing: 1 }}>{p.method.toUpperCase()}</span>
                <span style={{ fontFamily: FN, fontSize: 11, color: C.tm, letterSpacing: 1 }}>{p.date}</span>
                <Badge color={C.gn}>{T('PAID')}</Badge>
              </Row>
            ))}
          </Panel>

          <Panel title={T('SHARED · RECENT WORKOUTS')} tint={C.ac}>
            {[
              { day: 'Day A · Push', date: trainee.lastWorkout || '2 days ago', vol: '4,820 kg' },
              { day: 'Day C · Legs', date: '5 days ago', vol: '6,210 kg' },
              { day: 'Day B · Pull', date: '1 week ago', vol: '4,180 kg' },
            ].map((w, i) => (
              <Row key={i}>
                <span style={{ flex: 1, color: C.tx, fontWeight: 600 }}>{w.day}</span>
                <span style={{ fontFamily: FN, fontSize: 11, color: C.tm, letterSpacing: 1 }}>{RT(w.date)}</span>
                <span style={{ fontFamily: FN, fontSize: 11, color: C.ac, fontWeight: 700, letterSpacing: 1 }}>{w.vol}</span>
              </Row>
            ))}
          </Panel>
        </div>
      </> : (() => {
        // Solo athlete — mirror the real TraineeDetail: identity header strip
        // (name + email·phone left, status dropdown right) → horizontal stat
        // cluster → section cards (Vitals·Injuries·Goals, Bodyweight, Billing,
        // Programs, Recent Workouts) stacked full-width, not the old 2-col
        // key/value panels.
        const isHeb = /[֐-׿]/.test(trainee.name || '');
        const overdue = trainee.payment === 'OVERDUE';
        const workoutsCount = trainee.dormantDays != null ? 4 : 12;
        const perSession = trainee.monthly ? Math.round(trainee.monthly / 8) : 0;
        // THE LEDGER IS BUILT FIRST, AND "LAST PAYMENT" IS READ OFF IT.
        // It used to be computed separately as dAgo(paidAgo) — but for an
        // OVERDUE athlete that very row is the one the ledger drops (they
        // missed it), so the card printed a payment date that appeared nowhere
        // in the table directly beneath it. Two facts, one truth: derive the
        // date from the rows instead of computing it a second way.
        const payments = [
          !overdue && { date: dAgo(paidAgo), amount: trainee.monthly || 800, status: 'Paid', notes: 'Monthly package' },
          { date: dAgo(paidAgo + 30), amount: trainee.monthly || 800, status: 'Paid', notes: 'Monthly package' },
          { date: dAgo(paidAgo + 61), amount: trainee.monthly || 800, status: 'Paid', notes: 'Bank transfer' },
        ].filter(Boolean);
        const lastPay = trainee.payment === 'NEVER PAID' ? '—' : (payments[0] ? payments[0].date : '—');
        // Billing terms (moved out of the removed header cluster → into Billing, #139 parity).
        const billingTerms = [
          ['Package', trainee.isCouple ? '12 Sessions' : '8 Sessions'],
          ['Sessions Left', trainee.sessionsLeft],
          ['Monthly', trainee.monthly ? `₪${trainee.monthly}` : '—'],
          ['Per Session', perSession ? `₪${perSession}` : '—'],
          ['Last Payment', lastPay === '—' ? '—' : fmtPrettyDate(lastPay)],
          ['Since', fmtPrettyDate(trainee.startDate)],
        ];
        const totalPaid = payments.reduce((a, p) => a + p.amount, 0);
        // THROUGH T(). Hebrew is the DEFAULT for an Israeli visitor — readLang()
        // falls back to the browser language and /demo/coach has no toggle — and
        // every one of these ten athlete-detail card headers was a bare English
        // literal. The first screen a prospect opens on an athlete was captioned
        // in English over Hebrew content.
        const secTitle = (t) => <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{T(t)}</span>;
        return (
        <div>
          {/* Identity header strip — name (cyan, glow) + email·phone on the
              left, interactive status dropdown on the right (real app parity). */}
          <DemoDetailCard style={{ marginBottom: 8 }}
            headerRight={<DemoStatusMenu />}
            header={<span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 10, minWidth: 0, fontWeight: 700, fontSize: isHeb ? 16 : 14, fontFamily: isHeb ? FH : undefined, letterSpacing: isHeb ? 0 : '0.04em', textTransform: isHeb ? 'none' : 'uppercase' }}>
              <span style={{ color: C.ac, textShadow: '0 0 12px rgba(57,189,255,0.45)' }}>{trainee.name}</span>
              <span style={{ fontSize: 11, opacity: 0.78, letterSpacing: '0.02em', textTransform: 'none', fontWeight: 500, minWidth: 0 }}>{trainee.email}{trainee.phone ? ` · ${trainee.phone}` : ''}</span>
            </span>}>
            {/* Header stat cluster removed (#139 parity): its facts live in their
                real homes — billing terms in Billing, Format in Vitals. Header is
                just identity + status. */}
          </DemoDetailCard>

          {/* Section-filter tab bar — WRAPS to fit (real parity): every tag stays
              visible, no horizontal scroll. Empty = everything shows. */}
          <div style={{ margin: '0 0 16px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {[['all', 'View All'], ['vitals', 'Vitals'], ['billing', 'Billing'], ['bw', 'Bodyweight'], ['readiness', 'Readiness'], ['workouts', 'Workouts'], ['programs', 'Programs'], ['messages', 'Messages'], ['crm', 'Coach History'], ['eval', 'Evaluation'], ['overload', 'Overload']].map(([id, l]) => {
                const active = id === 'all' ? activeSecs.size === 0 : activeSecs.has(id);
                return <button key={id} onClick={() => id === 'all' ? setActiveSecs(new Set()) : toggleSec(id)} style={{ minHeight: CTRL_H, boxSizing: 'border-box', padding: '0 14px', borderRadius: 0, cursor: 'pointer', fontFamily: FN, fontSize: 11, fontWeight: active ? 800 : 700, letterSpacing: '0.09em', textTransform: 'uppercase', whiteSpace: 'nowrap', background: active ? 'color-mix(in srgb, var(--c-ac) 16%, transparent)' : 'transparent', border: `1px solid ${active ? C.ac : C.cardBd}`, color: active ? 'var(--c-ac)' : C.tm }}>{T(l)}</button>;
              })}
            </div>
          </div>

          {/* VITALS · INJURIES · GOALS (context — shown in View All) */}
          {showSec('vitals') && <DemoDetailCard style={{ marginBottom: 16 }} header={secTitle('Vitals · Injuries · Goals')}>
            <div className="demo-td-vitals" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, 132px)', justifyContent: 'center', gap: 12, maxWidth: 558, margin: '0 auto', textAlign: 'center' }}>
              {[['Age', trainee.age ? `${trainee.age}` : '—'], ['Weight', trainee.weight ? `${trainee.weight}kg` : '—'], ['Height', trainee.height ? `${trainee.height}cm` : '—'], ['Format', trainee.format || '—']].map(([l, v]) => {
                const empty = v === '—';
                return <div key={l}><div style={{ fontSize: 9, fontFamily: FN, color: C.tm, textTransform: 'uppercase', letterSpacing: '0.18em', fontWeight: 700 }}>{l}</div><div style={{ fontSize: 14, color: empty ? C.td : C.tx, marginTop: 2 }}>{v}</div></div>;
              })}
            </div>
            {trainee.injuries && <div style={{ marginTop: 12, padding: 10, background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0 }}><div style={{ fontSize: 10, fontFamily: FN, color: C.or, textTransform: 'uppercase', marginBottom: 4, textAlign: 'center' }}>{T('Injuries / Conditions')}</div><div style={{ fontSize: 13, color: C.tx, textAlign: 'center', direction: /[֐-׿]/.test(trainee.injuries) ? 'rtl' : 'ltr', fontFamily: /[֐-׿]/.test(trainee.injuries) ? FH : undefined }}>{trainee.injuries}</div></div>}
            {trainee.goals && <div style={{ marginTop: 8, padding: 10, background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0 }}><div style={{ fontSize: 10, fontFamily: FN, color: C.ac, textTransform: 'uppercase', marginBottom: 4, textAlign: 'center' }}>{T('Goals')}</div><div style={{ fontSize: 13, color: C.tx, textAlign: 'center', direction: /[֐-׿]/.test(trainee.goals) ? 'rtl' : 'ltr', fontFamily: /[֐-׿]/.test(trainee.goals) ? FH : undefined }}>{trainee.goals}</div></div>}
          </DemoDetailCard>}

          {/* BILLING — Date / Amount / Status / Notes (matches real; no "Method"). */}
          {showSec('billing') && <DemoDetailCard style={{ marginBottom: 16 }} header={secTitle(`Billing (${payments.length})`)}
            headerRight={<span style={{ fontFamily: FB, fontSize: 12, color: '#FFFFFF', opacity: 0.85, whiteSpace: 'nowrap' }}>₪{totalPaid.toLocaleString()} {T('paid')}</span>}>
            {/* Contract terms strip (moved from the removed header cluster, #139 parity). */}
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '12px 32px', margin: '0 auto 16px', textAlign: 'center' }}>
              {billingTerms.map(([l, v]) => {
                const empty = v === undefined || v === null || v === '' || v === '—';
                return <div key={l} style={{ whiteSpace: 'nowrap' }}><div style={{ fontSize: 9, fontFamily: FN, color: C.tm, textTransform: 'uppercase', letterSpacing: '0.18em', fontWeight: 700 }}>{l}</div><div style={{ fontSize: 14, color: empty ? C.td : C.tx, marginTop: 2 }}>{empty ? '—' : v}</div></div>;
              })}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: FB, fontSize: 13 }}>
                <thead><tr style={{ borderBottom: `1px solid ${C.cardBd}` }}>{['Date', 'Amount', 'Status', 'Notes'].map(h => <th key={h} style={{ textAlign: 'center', padding: '6px 10px', fontSize: 9, fontFamily: FN, color: C.tm, textTransform: 'uppercase', letterSpacing: '0.18em', fontWeight: 700 }}>{T(h)}</th>)}</tr></thead>
                <tbody>{payments.map((p, i) => (<tr key={i} style={{ borderBottom: `1px solid ${C.cardBd}` }}>
                  <td style={{ padding: '8px 10px', color: C.tm, textAlign: 'center' }}>{fmtPrettyDate(p.date)}</td>
                  <td style={{ padding: '8px 10px', color: C.gn, fontWeight: 600, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>₪{p.amount.toLocaleString()}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'center' }}><Badge color={C.gn}>{T(p.status).toUpperCase()}</Badge></td>
                  <td style={{ padding: '8px 10px', color: C.td, textAlign: 'center' }}>{T(p.notes)}</td>
                </tr>))}</tbody>
              </table>
            </div>
          </DemoDetailCard>}

          {/* MESSAGES */}
          {showSec('messages') && <DemoDetailCard style={{ marginBottom: 16 }} header={secTitle(`Messages (${DEMO_MESSAGES.length})`)}><DemoMessages /></DemoDetailCard>}

          {/* CRM · COACH HISTORY */}
          {showSec('crm') && <DemoDetailCard style={{ marginBottom: 16 }} header={secTitle('Coach History')} headerRight={<button title={T('Demo only')} style={{ ...baseBtn, background: 'transparent', color: C.ac, border: `1px solid ${C.ac}`, minHeight: CTRL_H, boxSizing: 'border-box', padding: '0 12px', fontSize: 10 }}>+ LOG</button>}><DemoCRM trainee={trainee} /></DemoDetailCard>}

          {/* BODYWEIGHT */}
          {showSec('bw') && <DemoDetailCard style={{ marginBottom: 16 }} header={secTitle('Bodyweight · 8W')}>
            <BWSparkline weight={trainee.weight || 70} />
          </DemoDetailCard>}

          {/* READINESS · CHECK-IN TRENDS */}
          {showSec('readiness') && <DemoDetailCard style={{ marginBottom: 16 }} header={secTitle(`Readiness (${DEMO_READINESS_LOG.length})`)}><DemoReadinessTrends /></DemoDetailCard>}

          {/* RECENT WORKOUTS */}
          {showSec('workouts') && <DemoDetailCard style={{ marginBottom: 16 }} header={secTitle('Recent Workouts')}>
            {[
              { day: 'Day A · Push', date: trainee.lastWorkout || '2 days ago', vol: '4,820 kg' },
              { day: 'Day C · Legs', date: '5 days ago', vol: '6,210 kg' },
              { day: 'Day B · Pull', date: '1 week ago', vol: '4,180 kg' },
            ].map((w, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: i < 2 ? `1px solid ${C.cardBd}` : 'none' }}>
                <span style={{ color: C.tx, fontWeight: 600, fontSize: 13, flex: 1, minWidth: 0 }}>{w.day}</span>
                <span style={{ fontFamily: FN, fontSize: 11, color: C.tm, letterSpacing: 1, whiteSpace: 'nowrap' }}>{RT(w.date)}</span>
                <span style={{ fontFamily: FN, fontSize: 11, color: C.ac, fontWeight: 700, letterSpacing: 1, whiteSpace: 'nowrap' }}>{w.vol}</span>
              </div>
            ))}
          </DemoDetailCard>}

          {/* PROGRAMS */}
          {showSec('programs') && <DemoDetailCard style={{ marginBottom: 16 }} header={secTitle(`Programs (${trainee.plans.length})`)}>
            {trainee.plans.map((name, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: i < trainee.plans.length - 1 ? `1px solid ${C.cardBd}` : 'none' }}>
                {/* Was nowrap + ellipsis, so at 360 "Block #4 — Pull
                    Specialization" lost 36px of itself to a "…". A program's
                    NAME is the one thing a coach reads on this row, and his
                    standing rule is that a word never gets cut. It wraps. */}
                <span style={{ color: C.tx, fontWeight: 600, fontSize: 13, minWidth: 0, whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{name}</span>
                <Badge color={i === 0 ? C.gn : C.td}>{tr(readLang(), i === 0 ? 'ACTIVE' : 'ARCHIVED')}</Badge>
              </div>
            ))}
          </DemoDetailCard>}

          {/* EVALUATION · INTAKE (context — shown in View All) */}
          {showSec('eval') && <DemoDetailCard style={{ marginBottom: 16 }} header={secTitle('Evaluation · Intake')}><DemoEvalIntake trainee={trainee} /></DemoDetailCard>}

          {/* PROGRESSIVE OVERLOAD — the showpiece */}
          {showSec('overload') && <DemoDetailCard header={secTitle('Progressive Overload')}><DemoOverload trainee={trainee} /></DemoDetailCard>}
        </div>
        );
      })()}
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
// Days since each athlete's last session, taken from the ROSTER rather than a
// two-entry map: the tag was blank for six of the eight.
const MOCK_LAST_SESSION_DAYS = Object.fromEntries(MOCK_TRAINEES.map((t) => {
  const m = /(\d+)\s*day/.exec(String(t.lastWorkout || ''));
  return [t.id, /today/i.test(String(t.lastWorkout || '')) ? 0 : (m ? Number(m[1]) : (t.dormantDays ?? null))];
}));

// Trimmed deliberately: 2 athletes, 3 programs total (Noa: 2, Gal: 1).
// Two athletes is the minimum that lets the filter dropdown demonstrate
// switching between clients; the 2/1 split makes the Compare picker
// instructive — Gal's lone program forces the visitor to switch the
// Athlete picker to Noa to see anything in Compare, which is precisely
// the cross-athlete feature this demo is meant to showcase.
// DERIVED FROM THE ROSTER, like the billing ledger.
//
// This was three hand-written rows for an eight-athlete roster whose own cards
// advertise twenty-five programs, so the Programs tab showed 2 while the tab
// beside it said 4 for one of the same people. Every trainee already carries
// its `plans` array — the block names it is meant to have — so the index is
// built from that and the two can no longer disagree.
// Sum of the id's character codes: defined for an id of any length, and
// stable, so the demo shows the same numbers on every load.
const idSeed = (id) => String(id || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);

const MOCK_PROGRAM_INDEX = MOCK_TRAINEES.flatMap((t) => (t.plans || []).map((name, i) => ({
  // i = 0 is the CURRENT block, and each older one is a block further back.
  id: `${t.id}-p${i}`,
  name,
  traineeId: t.id,
  // A STABLE HASH OF THE ID, not charCodeAt(2) — the ids are 't1'..'t8', two
  // characters, so index 2 is undefined and every card printed "NaN תרגילים".
  dayCount: 3 + ((i + idSeed(t.id)) % 2),
  exerciseCount: 18 + ((i * 4 + idSeed(t.id)) % 10),
  phase: ['Volume', 'Strength', 'Base', 'Intake'][Math.min(i, 3)],
  created: dAgo(24 + i * 31),
  updated: dAgo(i === 0 ? 3 + (idSeed(t.id) % 5) : 24 + i * 31 - 4),
})));

// ─── Training Lineage (demo) ───────────────────────────────────────────────
// Mirrors the real Programs → Lineage view (src/PlansView.jsx TrainingLineage):
// per-block working-sets wave + a matrix of staple lifts across blocks. All
// mock — the demo has no plan history — but shaped like a real periodized log
// so a prospect sees exactly what the live feature does. cells[i] aligns to
// DEMO_LINEAGE_BLOCKS[i]; null = the lift wasn't in that block.
const DEMO_LINEAGE_BLOCKS = [
  { n: 1, name: 'Block #1 · GPP',     sets: 58 },
  { n: 2, name: 'Block #2 · Base',    sets: 66 },
  { n: 3, name: 'Block #3 · Str I',   sets: 74 },
  { n: 4, name: 'Block #4 · Deload',  sets: 52 },
  { n: 5, name: 'Block #5 · Str II',  sets: 80 },
  { n: 6, name: 'Block #6 · Peak',    sets: 86 },
  { n: 7, name: 'Block #7 · Realize', sets: 70 },
];
const DEMO_LINEAGE_LIFTS = [
  { name: 'BB Back Squat',      cells: [{ s: 4, r: '5' }, { s: 4, r: '5' }, { s: 5, r: '3' }, null, { s: 5, r: '3' }, { s: 3, r: '2' }, { s: 3, r: '3' }] },
  { name: 'BB Bench Press',     cells: [{ s: 4, r: '6' }, { s: 4, r: '5' }, { s: 5, r: '4' }, null, { s: 5, r: '3' }, { s: 3, r: '2' }, { s: 3, r: '4' }] },
  { name: 'Trap-Bar Deadlift',  cells: [{ s: 3, r: '5' }, { s: 3, r: '5' }, { s: 4, r: '4' }, { s: 2, r: '5' }, { s: 4, r: '3' }, { s: 3, r: '2' }, null] },
  { name: 'Weighted Pull-Up',   cells: [{ s: 4, r: '6' }, { s: 4, r: '6' }, { s: 4, r: '5' }, null, { s: 5, r: '4' }, { s: 4, r: '3' }, { s: 3, r: '6' }] },
  { name: 'DB Reverse Lunge',   cells: [{ s: 3, r: '8' }, { s: 3, r: '8' }, { s: 3, r: '6' }, { s: 2, r: '8' }, { s: 3, r: '6' }, null, { s: 3, r: '8' }] },
  { name: 'Standing OHP',       cells: [null, { s: 3, r: '6' }, { s: 4, r: '5' }, null, { s: 4, r: '4' }, { s: 3, r: '3' }, { s: 3, r: '5' }] },
  { name: 'Barbell Row',        cells: [{ s: 4, r: '8' }, { s: 4, r: '8' }, { s: 4, r: '6' }, null, { s: 4, r: '6' }, { s: 3, r: '5' }, { s: 3, r: '8' }] },
  { name: 'Hanging Leg Raise',  cells: [{ s: 3, r: '12' }, { s: 3, r: '12' }, { s: 3, r: '10' }, { s: 2, r: '12' }, { s: 3, r: '10' }, { s: 2, r: '8' }, { s: 2, r: '12' }] },
  { name: 'Depth Box Jump',     cells: [null, { s: 3, r: '5' }, { s: 4, r: '4' }, null, { s: 4, r: '3' }, { s: 5, r: '3' }, { s: 3, r: '5' }] },
];

// Earlier blocks (#1–#6) exist only so the athlete reads as "7 blocks deep".
// The latest block (#7) is fully detailed — 2 days × 4 weeks — and carries the
// prescription the logged workouts below are measured against.
const DEMO_LINEAGE_PLANS = DEMO_LINEAGE_BLOCKS.slice(0, 6).map((b, i) => ({
  id: 'demo-blk-' + b.n, name: b.name, createdAt: null,
  weeks: 4,
  days: [{ name: 'Day 1', exercises: DEMO_LINEAGE_LIFTS.filter(l => l.cells[i]).map(l => ({ title: l.name, sets: l.cells[i].s, reps: l.cells[i].r })) }],
}));
DEMO_LINEAGE_PLANS.push({
  id: 'demo-blk-7', name: 'Block #7 · Realize', createdAt: null, weeks: 4,
  days: [
    { name: 'Day 1 · Upper', exercises: [
      { title: 'BB Bench Press', sets: 4, reps: '5' },
      { title: 'Weighted Pull-Up', sets: 4, reps: '6' },
      { title: 'Standing OHP', sets: 3, reps: '5' },
    ] },
    { name: 'Day 2 · Lower', exercises: [
      { title: 'BB Back Squat', sets: 4, reps: '5' },
      { title: 'Trap-Bar Deadlift', sets: 3, reps: '4' },
    ] },
  ],
});

// Logged workouts for Block #7 — the "deload the squat" story. Squat is flat
// at a hard, failing effort (STALE·HARD); deadlift is dropping; upper body is
// progressing; Day 2 (lower) gets skipped in week 4. Shaped so the real
// TrainingLineageV2 renders a full plan-vs-reality read from mock data.
const DEMO_LINEAGE_WORKOUTS = (() => {
  const base = Date.parse('2026-06-01T09:00:00');
  const day = 86400000;
  const set = (load, reps, rpe) => ({ load: String(load), reps: String(reps), rpe: String(rpe), done: true });
  // per-week top sets (weeks 1–4)
  const upper = {
    'BB Bench Press': [set(70, 5, 7), set(72.5, 5, 7.5), set(75, 5, 8), set(77.5, 5, 8)],
    'Weighted Pull-Up': [set(5, 6, 7), set(5, 6, 7), set(7.5, 6, 7.5), set(7.5, 7, 7)],
    'Standing OHP': [set(45, 5, 7.5), set(47.5, 5, 8), set(50, 5, 8), set(50, 4, 8.5)],
  };
  const lower = {
    'BB Back Squat': [set(105, 5, 8.5), set(105, 4, 9), set(105, 3, 9.5)],          // stale·hard + failing
    'Trap-Bar Deadlift': [set(145, 4, 8.5), set(140, 4, 9), set(132.5, 3, 9.5)],    // dropping
  };
  const rows = [];
  for (let w = 0; w < 4; w++) {
    rows.push({ id: `d-u${w}`, clientId: 'demo', planName: 'Block #7 · Realize', dayName: 'Day 1 · Upper', week: w + 1, date: new Date(base + w * 7 * day).toISOString(),
      exercises: Object.keys(upper).map((t, i) => ({ eid: `u${i}`, title: t, sets: [upper[t][w]] })) });
    if (w < 3) rows.push({ id: `d-l${w}`, clientId: 'demo', planName: 'Block #7 · Realize', dayName: 'Day 2 · Lower', week: w + 1, date: new Date(base + (w * 7 + 3) * day).toISOString(),
      exercises: Object.keys(lower).map((t, i) => ({ eid: `l${i}`, title: t, sets: [lower[t][w]] })) });
  }
  return rows;
})();

// Seed a demo Bar-Speed Vault (localStorage, 'demo' client only) so the Lineage
// "Bar speed" card shows the moat in action — a filmed-set velocity-loss trend
// climbing on the squat (fatigue building on the bar) — instead of the empty
// "not stored yet" nudge. Runs once at import, before DemoLineage renders, and
// never touches a real athlete's key. Idempotent.
(() => {
  try {
    if (typeof localStorage === 'undefined') return;
    const KEY = 'expo-pose-metrics';
    const all = JSON.parse(localStorage.getItem(KEY) || '{}') || {};
    const base = Date.parse('2026-06-01T09:00:00'), day = 86400000;
    // asym = [kneeGap%, hipGap%] so the "Symmetry / injury watch" card shows the
    // moat too: a right-knee gap widening across filmed squats (a limb pulling
    // away before it's pain), hip staying balanced.
    const e = (i, loss, best, rom, asym) => ({ date: new Date(base + i * 7 * day).toISOString(), kind: 'knee', reps: 5, bestMean: best, lossPct: loss, maxRom: rom, asymRows: asym ? [{ joint: 'Knees', pct: asym[0], weaker: 'Right' }, { joint: 'Hips', pct: asym[1], weaker: 'Right' }] : null });
    all.demo = {
      'bb back squat': { title: 'BB Back Squat', entries: [e(0, 12, 0.62, 118, [6, 4]), e(1, 16, 0.58, 116, [10, 5]), e(2, 20, 0.55, 114, [15, 5]), e(3, 26, 0.49, 110, [20, 6])] }, // fatiguing + knee gap widening
      'bb bench press': { title: 'BB Bench Press', entries: [e(0, 14, 0.44, 92), e(1, 13, 0.46, 93), e(2, 12, 0.47, 93)] }, // holding
    };
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch { /* demo seed is best-effort */ }
})();

// The analysis panel fed the SAME seven-block history whoever it was naming,
// so it read "TRAINING ANALYSIS · נועה לוי — 7 BLOCKS" with the filter rail two
// columns to its left saying she has 3, and block names (GPP, Str I, Realize)
// that appear in nobody's record. A contradiction visible without scrolling.
// The blocks are now the athlete's OWN, newest last: the demo history supplies
// the shape — the logged sets, the per-lift cells, the trend — and the athlete
// supplies how many blocks there are and what they are called. An athlete with
// three plans gets a three-block lineage that matches their row.
function DemoLineage({ athleteName }) {
  const subject = MOCK_TRAINEES.find((t) => t.name === athleteName);
  const own = (subject && subject.plans) ? subject.plans.slice().reverse() : null;   // chronological
  const plans = (!own || !own.length)
    ? DEMO_LINEAGE_PLANS
    : DEMO_LINEAGE_PLANS.slice(-own.length).map((p, i) => ({ ...p, name: own[i] }));
  return <TrainingLineageV2 traineeId="demo" traineeName={athleteName} exercises={[]} plans={plans} clientWorkouts={DEMO_LINEAGE_WORKOUTS} loading={false} onOpenPlan={() => {}} />;
}

function DemoPrograms({ resetToken = 0 }) {
  const rail = useNarrowRail();
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

  // Clicking the PROGRAMS nav tab while inside a program detail used to rewrite
  // the URL to the bare list and leave the detail on screen (audit #76):
  // setTab('programs') is a no-op when already on that tab, and nothing cleared
  // this component's selection. The visitor then saw the p1 editor under a list
  // URL, and pressing Back popped to the detail path with no visible change —
  // so Back looked broken, and a copied URL described a page nobody was on.
  useEffect(() => { if (resetToken) setSelectedProgramId(null); }, [resetToken]);
  // Sync selection FROM the URL on back/forward.
  useEffect(() => {
    const onPop = () => setSelectedProgramId(programIdFromPath(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const [search, setSearch] = useState('');
  const [filterTrainee, setFilterTrainee] = useState('');
  // The real rail's Flags group (PlansView): programs with no athlete, and
  // programs with no exercises or no days.
  const [flags, setFlags] = useState({ unassigned: false, empty: false });
  const [progView, setProgView] = useState('table'); // 'table' | 'grid' | 'lineage'
  // Preview / Duplicate / Share / Delete were `onClick={e => e.stopPropagation()}`
  // — they looked live, had a handler, and did nothing, with only a `title`
  // tooltip to say so. A title is invisible on a phone and to a keyboard. Same
  // explainer the rest of the demo uses. Keyed by program id so opening one
  // row's note does not light up every other row.
  const [progNote, setProgNote] = useState(null); // `${id}:${action}`
  const PROG_NOTE = {
    Preview: 'Demo only — in the full app this opens the program exactly as the athlete sees it.',
    Duplicate: 'Demo only — in the full app this copies the program into a new block you can edit.',
    Share: 'Demo only — in the full app this assigns a copy of the program to another athlete.',
    Delete: 'Demo only — in the full app this deletes the program after asking you to confirm.',
  };
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
      if (flags.unassigned && p.traineeId) return false;
      if (flags.empty && p.exerciseCount && p.dayCount) return false;
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

        {/* Header — Programs title + TABLE/GRID/LINEAGE toggle (mirrors PlansView top row). */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontFamily: FN, fontSize: 13, fontWeight: 700, letterSpacing: '0.18em', color: C.tx, textTransform: 'uppercase' }}>{T('Programs')}</h2>
          <div style={{ display: 'flex', gap: 6, width: 252 }}>
            {[['table', 'Table'], ['grid', 'Grid'], ['lineage', 'Analysis']].map(([v, label]) => {
              const on = progView === v;
              return <button key={v} onClick={() => setProgView(v)} style={{ flex: 1, minHeight: CTRL_H, boxSizing: 'border-box', borderRadius: 0, cursor: 'pointer', border: `1px solid ${on ? '#39BDFF' : C.cardBd}`, background: on ? '#39BDFF' : C.sf, color: on ? '#FFFFFF' : C.tm, fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{T(label)}</button>;
            })}
          </div>
        </div>
        {/* Two-column: shared SideRail (identical to the real PlansView rail) + list. */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <SideRail className="cd-rail" narrow={rail.narrow} railOpen={rail.railOpen} setRailOpen={rail.setRailOpen} width={204} top={64} maxHeight="calc(100vh - 76px)"
          search={search} onSearch={setSearch}
          searchPlaceholder={T('Search programs…')}
          groups={[
            {
              label: 'Athlete',
              opts: [
                { key: 'all', label: T('All'), count: MOCK_PROGRAM_INDEX.length, active: !filterTrainee, onClick: () => setFilterTrainee('') },
                ...[...new Set(MOCK_PROGRAM_INDEX.map(p => p.traineeId).filter(Boolean))]
                  .map(id => ({ id, name: MOCK_TRAINEES.find(t => t.id === id)?.name || id, count: MOCK_PROGRAM_INDEX.filter(p => p.traineeId === id).length }))
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map(a => ({ key: a.id, label: a.name, count: a.count, title: a.name, active: filterTrainee === a.id, onClick: () => setFilterTrainee(a.id) })),
              ],
            },
            {
              label: 'Flags',
              opts: [
                { key: 'unassigned', label: T('Unassigned'), count: MOCK_PROGRAM_INDEX.filter(p => !p.traineeId).length, title: T('Programs with no athlete assigned'), accent: C.or, active: flags.unassigned, onClick: () => setFlags(m => ({ ...m, unassigned: !m.unassigned })) },
                { key: 'empty', label: `∅ ${T('Empty')}`, count: MOCK_PROGRAM_INDEX.filter(p => !p.exerciseCount || !p.dayCount).length, title: T('Programs with no exercises or no days'), accent: C.or, active: flags.empty, onClick: () => setFlags(m => ({ ...m, empty: !m.empty })) },
              ],
            },
            {
              label: 'Sort',
              opts: [
                ['created', 'Uploaded', 'Sort by when the program was created/imported. Click again to flip newest/oldest.'],
                ['name', 'Name', 'Sort by program name. Click again to flip A–Z / Z–A.'],
                ['updated', 'Last edited', 'Sort by when the program was last edited. Click again to flip newest/oldest.'],
              ].map(([field, label, tip]) => {
                const active = sortField === field;
                return { key: field, title: T(tip), active, label: active ? `${sortDir === 'asc' ? '↑' : '↓'} ${T(label)}` : T(label), onClick: () => { if (active) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else setSortField(field); } };
              }),
            },
          ]}
          footer={<button onClick={e => e.stopPropagation()} style={{ ...baseBtn, background: '#39BDFF', color: '#06131b', border: '1px solid #39BDFF', width: '100%', boxSizing: 'border-box', padding: '0 14px', height: 'var(--btn-h)', marginTop: 'auto', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>+ {tr(readLang(), 'New Program')}</button>}
        />
        {/* RIGHT: the program list. */}
        <div style={{ flex: 1, minWidth: 0, boxSizing: 'border-box' }}>

        {/* Athlete-grouped list, mirroring src/PlansView.jsx. Each visible
            athlete = ONE row showing their current (highest block#) program.
            An expand chevron reveals earlier blocks inline. The same
            transparent border + sparse styling as the real coach app. */}
        {progView === 'lineage' && (
          <div style={{ flex: 1, minWidth: 0 }}>
            <DemoLineage athleteName={filterTrainee ? traineeName(filterTrainee) : (MOCK_TRAINEES.find(t => t.id === 't1')?.name || 'Athlete')} />
          </div>
        )}
        {progView !== 'lineage' && (() => {
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

          const meta = readLang() === 'he'
            ? `${rows.length === 1 ? 'מתאמן אחד' : `${rows.length} מתאמנים`} · ${filtered.length === 1 ? 'תוכנית אחת' : `${filtered.length} תוכניות`} בסך הכל`
            : `${rows.length} athlete${rows.length === 1 ? '' : 's'} · ${filtered.length} program${filtered.length === 1 ? '' : 's'} total`;

          if (rows.length === 0) return (
            <>
              <div style={{ fontSize: 12, color: C.td, marginBottom: 12, fontFamily: FN }}>{meta}</div>
              <div style={{ background: C.sf, border: `1px dashed ${C.bd2}`, borderRadius: 0, padding: 40, textAlign: 'center', color: C.tm, fontFamily: FB, fontSize: 13 }}>{T('No programs match your search.')}</div>
            </>
          );

          return (
            <>
              {/* Light text actions (Ohad: the boxed-button pile was ugly).
                  Underline on hover; at narrow width the spacer collapses so they
                  flow left and wrap gracefully instead of stacking boxes. */}
              <style>{`
                .cd-txtbtn:hover { text-decoration: underline; }
                @keyframes cdProgReveal { 0% { opacity: 0; transform: translateY(-10px); } 40% { opacity: 0.5; } 100% { opacity: 1; transform: none; } }
                .cd-prog-reveal { animation: cdProgReveal 0.38s cubic-bezier(0.22,0.61,0.36,1) both; transform-origin: top; }
                @media (prefers-reduced-motion: reduce) { .cd-prog-reveal { animation: none; } }
                @media (max-width: 620px) { .cd-prog-actions .cd-spacer { display: none !important; } }
              `}</style>
              {/* Count-line removed from the main-column top so the first program
                  card top-aligns with the rail's Search box (Ohad OCD: left rail +
                  right first box must start at the same vertical height). */}
              {/* GRID actually has to look different from TABLE. The toggle
                  lit up and re-rendered the identical single column, which is
                  the same "looks live, does nothing" fault as a dead button —
                  worse, because the control reports a state change. Grid lays
                  the same programs out in columns, the way the real
                  PlansView does (repeat(auto-fill, minmax(...))). */}
              <div style={{ display: 'grid', gap: 8, gridTemplateColumns: progView === 'grid' ? 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))' : undefined, alignItems: 'start' }}>
                {rows.map(row => {
                  const expanded = expandedAthletes.has(row.tid);
                  const cur = row.current;
                  const tagColor = row.daysSince == null ? C.td
                    : row.daysSince <= 3 ? C.gn
                    : row.daysSince <= 7 ? C.tm
                    : row.daysSince <= 14 ? C.or
                    : C.rd;
                  const tagText = row.daysSince == null ? T('NEVER LOGGED')
                    : row.daysSince === 0 ? T('TRAINED TODAY')
                    : (readLang() === 'he' ? daysAgoHe(row.daysSince) : TN('{n}D AGO', row.daysSince));
                  const portalKey = (id) => 'pv_' + id;
                  const isVis = (id) => portalVis[portalKey(id)] !== false;
                  const togglePortal = (id) => setPortalVis(v => ({ ...v, [portalKey(id)]: !isVis(id) }));
                  // minWidth 0: a grid item defaults to min-width auto, so it
                  // refuses to shrink below its content's min-content width. At
                  // 360 the card stayed 335px inside a 328px track and
                  // everything in it painted 7px past the edge.
                  return (
                    <div key={row.tid} style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, minWidth: 0 }}>
                      {/* Redesigned card (Ohad: the boxed-button pile was ugly) —
                          now uses the app's card grammar: cyan STRIP HEADER
                          (athlete + recency dot), calm clickable body (block name +
                          spelled-out meta), and LIGHT text actions. */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', rowGap: 6, background: 'color-mix(in srgb, var(--c-stripBg, var(--c-sf)) 90%, var(--c-ac))', borderBottom: `1px solid ${C.cardBd}`, padding: '8px 14px' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                          <span aria-hidden style={{ width: 3, height: 14, background: C.ac, flexShrink: 0, marginInlineStart: -8.5, marginInlineEnd: -3.5 }} /* hangs in the 14px gutter so the name starts on the body's edge (26.9) */ />
                          <bdi style={{ fontWeight: 700, fontSize: 13, letterSpacing: '0.04em', color: 'var(--c-stripTx)', overflowWrap: 'break-word' }}>{row.name}</bdi>
                        </span>
                        {/* Recency: colour on the DOT, muted text, fixed min-width so
                            all read the same size — parity with the real Programs
                            page (Ohad #195). */}
                        <span title={tr(readLang(), 'Last session: {x}').replace('{x}', tr(readLang(), tagText).toLowerCase())} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, minWidth: 104, flexShrink: 0, fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--c-tm)', whiteSpace: 'nowrap' }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: tagColor, flexShrink: 0 }} />{tagText}
                        </span>
                      </div>
                      <div onClick={() => setSelectedProgramId(cur.id)} style={{ cursor: 'pointer', padding: '12px 14px 4px' }}>
                        {/* minHeight reserves the "N previous" pill's height (the control height) so a
                            card WITHOUT the pill is the same height as one WITH it —
                            parity with the real Programs card-height fix (PlansView). */}
                        <div className="cd-prog-title" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', minHeight: CTRL_H }}>
                          <span style={{ fontWeight: 700, fontSize: 15, color: C.ac, fontFamily: FN, letterSpacing: '0.04em', minWidth: 0, whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{cur.name || 'Untitled'}</span>
                          {row.earlier.length > 0 && (
                            <button onClick={e => { e.stopPropagation(); toggleAthlete(row.tid); }}
                              title={readLang() === 'he' ? (expanded ? 'הסתרת הבלוקים הקודמים' : (row.earlier.length === 1 ? 'הצגת הבלוק הקודם' : `הצגת ${row.earlier.length} הבלוקים הקודמים`)) : (expanded ? `Hide ${row.earlier.length} previous` : `Show ${row.earlier.length} previous block${row.earlier.length === 1 ? '' : 's'}`)}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minHeight: CTRL_H, boxSizing: 'border-box', padding: '0 9px', background: expanded ? 'rgba(57,189,255,0.10)' : 'transparent', border: `1px solid ${C.cardBd}`, borderRadius: 0, color: C.ac, cursor: 'pointer', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', whiteSpace: 'nowrap', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                              {readLang() === 'he' ? (row.earlier.length === 1 ? 'בלוק קודם אחד' : `${row.earlier.length} קודמים`) : `${row.earlier.length} previous`}
                              <span aria-hidden style={{ display: 'inline-block', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform .15s', fontSize: 8, lineHeight: 1 }}><svg aria-hidden viewBox="0 0 9 6" fill="none" width="0.95em" height="0.63em" style={{ display: 'inline-block', verticalAlign: 'middle' }}><path d="M1 1l3.5 3.5L8 1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
                            </button>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: C.tm, fontFamily: FN, letterSpacing: '0.04em', marginTop: 5 }}>{readLang() === 'he' ? `${cur.dayCount === 1 ? 'יום אחד' : `${cur.dayCount} ימים`} · ${cur.exerciseCount === 1 ? 'תרגיל אחד' : `${cur.exerciseCount} תרגילים`}` : `${cur.dayCount} days · ${cur.exerciseCount} exercises`}</div>
                      </div>
                      {(() => {
                        const txt = (color) => ({ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', color });
                        const on = isVis(cur.id);
                        return (
                          <div className="cd-prog-actions" style={{ padding: '8px 14px 12px', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                            <button className="cd-onportal" onClick={e => { e.stopPropagation(); togglePortal(cur.id); }}
                              title={tr(readLang(), on ? 'On the athlete portal — click to hide' : 'Hidden — click to show')}
                              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: on ? C.gn : C.td }}>{T('PORTAL')}</span>
                              <span style={{ width: 32, height: 18, borderRadius: 9, background: on ? 'rgba(46,213,115,0.35)' : 'rgba(127,127,138,0.25)', position: 'relative', transition: 'background .15s', flexShrink: 0 }}>
                                <span style={{ width: 14, height: 14, borderRadius: 7, background: on ? C.gn : C.tm, position: 'absolute', top: 2, left: on ? 16 : 2, transition: 'left .15s' }} />
                              </span>
                            </button>
                            <div className="cd-spacer" style={{ flex: 1, minWidth: 8 }} />
                            <button className="cd-crud cd-txtbtn" onClick={e => { e.stopPropagation(); setProgNote(`${cur.id}:Preview`); }} title={T('Preview as trainee (demo only)')} style={txt(C.ac)}>{T('Preview')}</button>
                            <button className="cd-crud cd-txtbtn" onClick={e => { e.stopPropagation(); setProgNote(`${cur.id}:Duplicate`); }} title={T('Duplicate program (demo only)')} style={txt(C.ac)}>{tr(readLang(), 'Duplicate')}</button>
                            <button className="cd-crud cd-txtbtn" onClick={e => { e.stopPropagation(); setProgNote(`${cur.id}:Share`); }} title={T('Share to another athlete (demo only)')} style={txt(C.ac)}>{tr(readLang(), 'Share')}</button>
                            <button className="cd-crud cd-txtbtn" onClick={e => { e.stopPropagation(); setProgNote(`${cur.id}:Delete`); }} title={T('Delete program (demo only)')} style={txt(C.rd)}>{tr(readLang(), 'Delete')}</button>
                            {String(progNote || '').startsWith(`${cur.id}:`) && (
                              <div style={{ flex: '1 1 100%', fontFamily: FB, fontSize: 11, color: C.ac, borderTop: `1px solid ${C.cardBd}`, paddingTop: 8 }}>
                                {T(PROG_NOTE[String(progNote).split(':')[1]] || '')}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                      {/* Expanded earlier blocks — slightly compressed look. */}
                      {expanded && row.earlier.length > 0 && (
                        <div className="cd-prog-reveal" style={{ borderTop: `1px solid ${C.cardBd}`, padding: '4px 0' }}>
                          {row.earlier.map(p => (
                            <div key={p.id} onClick={() => setSelectedProgramId(p.id)}
                              style={{ cursor: 'pointer', padding: '7px 14px 7px 32px', display: 'flex', alignItems: 'center', gap: 8, opacity: 0.78, borderTop: `1px solid rgba(57,189,255,0.102)` }}>
                              <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: C.ac, opacity: 0.72, fontWeight: 700, whiteSpace: 'normal', overflowWrap: 'anywhere', letterSpacing: '0.04em', fontFamily: FN }}>{p.name || 'Untitled'}</div>
                              <div style={{ fontSize: 11, color: C.td, fontFamily: FN, letterSpacing: '0.04em', fontWeight: 500, flexShrink: 0, whiteSpace: 'nowrap' }}>{p.dayCount}d · {p.exerciseCount}ex</div>
                              {(() => {
                                const txt = (color) => ({ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', color });
                                const on = isVis(p.id);
                                return <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
                                  <button className="cd-txtbtn" onClick={e => { e.stopPropagation(); togglePortal(p.id); }}
                                    title={tr(readLang(), on ? 'On the athlete portal — click to hide' : 'Hidden — click to show')}
                                    style={{ ...txt(on ? C.gn : C.td), display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 5, height: 5, borderRadius: '50%', background: on ? C.gn : C.td }} />{tr(readLang(), on ? 'On portal' : 'Hidden')}</button>
                                  <button className="cd-txtbtn" onClick={e => e.stopPropagation()} title={T('Preview as trainee (demo only)')} style={txt(C.ac)}>{T('Preview')}</button>
                                  <button className="cd-txtbtn" onClick={e => e.stopPropagation()} title={T('Duplicate program (demo only)')} style={txt(C.ac)}>{tr(readLang(), 'Duplicate')}</button>
                                  <button className="cd-txtbtn" onClick={e => e.stopPropagation()} title={T('Share to another athlete (demo only)')} style={txt(C.ac)}>{tr(readLang(), 'Share')}</button>
                                  <button className="cd-txtbtn" onClick={e => e.stopPropagation()} title={T('Delete program (demo only)')} style={txt(C.rd)}>{tr(readLang(), 'Delete')}</button>
                                </div>;
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
        </div>{/* /right column */}
        </div>{/* /two-column layout */}
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
          }}>← {tr(readLang(), 'Back')}</button>
          {athletePrograms.length >= 2 && (
            <div style={{ position: 'relative', display: 'flex', minWidth: 0, flex: '1 1 240px', maxWidth: 360 }}>
              <select value={selectedProgramId || ''} onChange={e => {
                const nextId = e.target.value;
                if (nextId && nextId !== selectedProgramId) setSelectedProgramId(nextId);
              }}
                title={T('Switch to another program for this athlete')}
                style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, minHeight: CTRL_H, padding: '0 36px 0 18px', lineHeight: '42px', color: C.tm, fontFamily: FN, fontSize: 13, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', outline: 'none', appearance: 'none', WebkitAppearance: 'none', flex: 1, minWidth: 0, boxSizing: 'border-box', cursor: 'pointer', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {athletePrograms.map(p => <option key={p.id} value={p.id}>{p.name || 'Untitled'}</option>)}
              </select>
              <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: C.tm, fontSize: 12, lineHeight: 1 }}>▾</span>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'stretch', flexWrap: 'wrap', justifyContent: 'center' }}>
          {(() => {
            const tbBtn = (color = C.ac) => ({ background: 'var(--c-sf)', border: `1px solid ${color}`, borderRadius: 0, minHeight: CTRL_H, padding: '0 16px', color, cursor: 'pointer', fontFamily: FN, fontSize: 13, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', whiteSpace: 'nowrap' });
            return <>
              <button onClick={() => setCompareOpen(v => !v)} title={T('Compare with a previous program (read-only)')}
                style={{ ...tbBtn(), background: compareActive ? `${C.ac}1f` : 'var(--c-sf)' }}>{compareActive ? '✓ COMPARE' : '↔ COMPARE'}</button>
              <button onClick={e => e.stopPropagation()} title={T('Open in the athlete portal view (demo only)')} style={tbBtn()}>◉ {tr(readLang(), 'PORTAL')}</button>
              <button onClick={e => e.stopPropagation()} title={T('Share to another athlete (demo only)')} style={tbBtn()}>⤴ {tr(readLang(), 'SHARE')}</button>
              <button onClick={e => e.stopPropagation()} title={T('Duplicate program (demo only)')} style={tbBtn()}>⎘ {tr(readLang(), 'DUPLICATE')}</button>
              <button onClick={e => e.stopPropagation()} title={T('Show only this program on the athlete portal (demo only)')} style={tbBtn()}>{T('SHOW ONLY')}</button>
              <button onClick={e => e.stopPropagation()} title={T('Delete program (demo only)')} style={tbBtn(C.rd)}>🗑 {tr(readLang(), 'DELETE')}</button>
            </>;
          })()}
          <button onClick={e => e.stopPropagation()} title={T('Demo only')}
            style={{ ...baseBtn, background: C.ac, color: '#0a0a0b', height: 42, padding: '0 18px', lineHeight: '42px', fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{T('Save Program')}</button>
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
              <label style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, color: C.td, letterSpacing: '0.08em', textTransform: 'uppercase', textAlign: 'center' }}>{T(field.label)}</label>
              <input value={field.value} readOnly tabIndex={-1}
                style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, height: 42, padding: '0 14px', color: C.tx, fontFamily: FB, fontSize: 13, outline: 'none', textAlign: 'center', cursor: 'default' }} />
            </div>
          ))}
        </div>

        {/* PATTERN COVERAGE chart (mock) — mirrors the real PlanEditor's
            PatternCoverage component. */}
        <div style={{ border: `1px solid rgba(255,165,2,0.4)`, padding: 12, marginBottom: 16 }}>
          <div style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, color: C.or, letterSpacing: '0.06em', marginBottom: 8 }}>{T('PATTERN COVERAGE: 5/8')}</div>
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
                <span style={{ fontSize: 10, color: C.or, fontFamily: FN, fontWeight: 700, width: 10, textAlign: 'center' }}>{<svg aria-hidden viewBox="0 0 9 6" fill="none" width="0.95em" height="0.63em" style={{ display: 'inline-block', verticalAlign: 'middle', transition: 'transform 150ms ease', transform: (warmOpen) ? 'none' : 'rotate(-90deg)' }}><path d="M1 1l3.5 3.5L8 1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>}</span>
                <span style={{ fontSize: 11, fontFamily: FN, fontWeight: 700, color: C.or, letterSpacing: '0.06em' }}>{T('WARM-UP (')}{block.warmup.length})</span>
              </button>
              <button onClick={e => e.stopPropagation()} title={T('Demo only')}
                style={{ background: 'var(--c-sf)', border: `1px solid rgba(255,165,2,0.4)`, borderRadius: 0, minHeight: CTRL_H, boxSizing: 'border-box', padding: '0 10px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: C.or, cursor: 'pointer', fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.18em' }}>+ {tr(readLang(), 'ADD WARM-UP')}</button>
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
              <DayChip>{exCount}{T('EXERCISES')}</DayChip>
              <DayChip>{ssCount}{T('SUPERSET')}{ssCount === 1 ? '' : 'S'}</DayChip>
              <DayChip>~{estMin}{T('MIN')}</DayChip>
              <DayChip muted>{T('EST · BASED ON 90s REST')}</DayChip>
            </div>
          );
        })()}

        {/* Per-day-name input — mirrors the real PlanEditor `Day N Name`
            field that sits above the per-exercise cards in detail mode. */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, color: C.td, letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 4, textAlign: 'center' }}>{readLang() === 'he' ? `שם יום ${dayIdx + 1}` : `Day ${dayIdx + 1} Name`}</label>
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
              <div key={ei} style={{ background: 'var(--c-sf)', border: `1px solid ${cardBorderColor}`, borderRadius: 0, padding: 12, marginBottom: 8 }}>
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
                        <label style={labelStyle}>{tr(readLang(), 'Exercise')}</label>
                        <input value={e.name || ''} readOnly tabIndex={-1} style={inputStyleRO} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                        <label style={labelStyle}>{tr(readLang(), 'Superset')}</label>
                        <input value={e.superset || '—'} readOnly tabIndex={-1} style={{ ...inputStyleRO, background: e.superset ? `color-mix(in srgb, ${sc} 20%, var(--c-sf))` : undefined, border: e.superset ? `1px solid ${sc}` : inputStyleRO.border, color: e.superset ? C.tx : C.td, fontWeight: e.superset ? 800 : 700, fontFamily: FN, textAlign: 'center' }} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                        <label style={labelStyle}>{tr(readLang(), 'Sets')}</label>
                        <input value={e.sets ?? ''} readOnly tabIndex={-1} style={inputStyleRO} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                        <label style={labelStyle}>{tr(readLang(), 'Reps')}</label>
                        <input value={e.reps || ''} readOnly tabIndex={-1} style={inputStyleRO} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                        <label style={labelStyle}>{tr(readLang(), 'Load')}</label>
                        <input value={mockLoad} readOnly tabIndex={-1} placeholder="kg/%" style={inputStyleRO} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                        <label style={labelStyle}>{T('RPE')}</label>
                        <input value={mockRpe} readOnly tabIndex={-1} placeholder="7-8" style={inputStyleRO} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                        <label style={labelStyle}>{T('Tempo')}</label>
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
                        <label style={labelStyle}>{tr(readLang(), 'Load / Wk')}</label>
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
                      placeholder={T('Notes / modifications...')}
                      style={{ ...inputStyleRO, marginTop: 8, minHeight: 64, padding: '10px 12px', lineHeight: 1.5, resize: 'none', fontSize: 13 }} />
                    <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr auto', gap: 6, alignItems: 'stretch' }}>
                      <input value="https://youtu.be/demo" readOnly tabIndex={-1}
                        placeholder={T('Insert video URL')}
                        style={inputStyleRO} />
                      {/* alignItems:'stretch' on the parent + display:'inline-flex'
                          here makes the LIB pill match the URL input's exact
                          height instead of being a hair shorter (6px padding +
                          10px font vs 8px padding + 13px font). */}
                      <a href="#" onClick={ev => ev.preventDefault()} title={T('Demo only')}
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
                    title={T('Open this day in the detail editor')}
                    style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: '3px 10px', minHeight: CTRL_H, boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: C.ac, cursor: 'pointer', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', marginInlineStart: 'auto' }}>DETAIL ▸</button>
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
                        <div key={hi} style={{ fontSize: 9, fontFamily: FN, color: C.td, minWidth: 0, borderInlineStart: '3px solid transparent', paddingInlineStart: 6 }}>{h}</div>
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
                          style={{ color: C.tx, fontFamily: FB, fontSize: 12, minWidth: 0, overflowWrap: 'break-word', wordBreak: 'break-word', border: `1px solid ${ex.superset ? sc : 'transparent'}`, paddingInlineStart: 6 }}>{ex.name}</div>
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
              <button onClick={() => setCompareOpen(false)} title={T('Close compare panel')}
                style={{ position: 'absolute', top: -2, right: -2, background: C.bg, border: `1px solid ${C.cardBd}`, color: C.tm, cursor: 'pointer', padding: '1px 6px', borderRadius: 0, fontSize: 11, lineHeight: 1, zIndex: 2 }}>✕</button>
              {/* Dual picker: Athlete + Program. STACKED single-column to
                  mirror the real PlansView CompareSidebar layout (each
                  filter is a full-width input). Same number of pre-day
                  rows as the editor's left half (4 inputs vs 2) so the
                  DAY A boxes line up vertically. */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                  <label style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, color: C.td, letterSpacing: '0.08em', textTransform: 'uppercase', textAlign: 'center' }}>{T('Athlete Filter')}</label>
                  <div style={{ position: 'relative', display: 'flex' }}>
                    <select value={compareAthleteId} onChange={e => setCompareAthleteId(e.target.value)} style={pickerStyle(false)}>
                      {cmpAthleteOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: C.tm, fontSize: 14, lineHeight: 1 }}>▾</span>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                  <label style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, color: C.td, letterSpacing: '0.08em', textTransform: 'uppercase', textAlign: 'center' }}>{T('Program Filter')}</label>
                  <div style={{ position: 'relative', display: 'flex' }}>
                    <select value={comparePickedId} onChange={e => setComparePickedId(e.target.value)} disabled={noCandidates} style={pickerStyle(noCandidates)}>
                      {noCandidates
                        ? <option value="">{T('No other programs for this athlete')}</option>
                        : cmpCandidates.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: noCandidates ? C.td : C.tm, fontSize: 14, lineHeight: 1 }}>▾</span>
                  </div>
                </div>
              </div>

              {/* PATTERN COVERAGE chart on the compare side too — matches the
                  left half so the WARM-UP + DAY A boxes line up vertically. */}
              <div style={{ border: `1px solid rgba(255,165,2,0.4)`, padding: 12, marginBottom: 16 }}>
                <div style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, color: C.or, letterSpacing: '0.06em', marginBottom: 8 }}>{T('PATTERN COVERAGE: 4/8')}</div>
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
                    <span style={{ fontSize: 10, color: C.or, fontFamily: FN, fontWeight: 700, width: 10, textAlign: 'center' }}>{<svg aria-hidden viewBox="0 0 9 6" fill="none" width="0.95em" height="0.63em" style={{ display: 'inline-block', verticalAlign: 'middle', transition: 'transform 150ms ease', transform: (cmpWarmOpen) ? 'none' : 'rotate(-90deg)' }}><path d="M1 1l3.5 3.5L8 1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>}</span>
                    <span style={{ fontSize: 11, fontFamily: FN, fontWeight: 700, color: C.or, letterSpacing: '0.06em' }}>{T('WARM-UP (')}{cmpBlock.warmup.length})</span>
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
                          <div key={hi} style={{ fontSize: 9, fontFamily: FN, color: C.td, minWidth: 0, borderInlineStart: '3px solid transparent', paddingInlineStart: 6 }}>{h}</div>
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
                            style={{ color: C.tx, fontFamily: FB, fontSize: 12, minWidth: 0, overflowWrap: 'break-word', wordBreak: 'break-word', border: `1px solid ${ex.superset ? sc : 'transparent'}`, paddingInlineStart: 6 }}>{ex.name}</div>
                          <input value={ex.superset || ''} readOnly tabIndex={-1} style={{ ...tinyRO, background: ex.superset ? `color-mix(in srgb, ${sc} 20%, var(--c-sf))` : undefined, border: ex.superset ? `1px solid ${sc}` : tinyRO.border, color: ex.superset ? C.tx : C.td, fontFamily: FN, fontWeight: ex.superset ? 800 : 600, textAlign: 'center' }} />
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

      {/* Add-exercise is the only real editor action; DUPLICATE BLOCK / IMPORT
          XLSX / EXPORT were phantom (no such buttons in PlansView) — removed so
          the demo doesn't advertise features the product lacks. */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button title={T('Demo only')} style={{ ...baseBtn, background: C.ac, color: '#000' }}>+ {tr(readLang(), 'ADD EXERCISE')}</button>
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
      // The non-muted branch was the literal text ${C.cardBd} in quotes, so the
      // border was invalid CSS and the chip rendered with none (audit 08-22 #75).
      border: `1px solid ${muted ? C.bd : C.cardBd}`,
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
      padding: '8px 12px', textAlign: 'start',
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
// The real library's media flags (src/ExercisesView.jsx hasVideo / hasNotes /
// isUnclassified), on the mock rows: every mock carries cues; three simple
// isolation moves have no demo video, so the Video filter narrows something.
const DEMO_NO_VIDEO = new Set(['Leg Curl', 'Tricep Pushdown', 'Plank']);
const demoHasVideo = (e) => !DEMO_NO_VIDEO.has(e.name);
const demoHasNotes = (e) => !!(e.cues && String(e.cues).trim());
const demoUnclassified = (e) => !((e.resistanceType || '') && (e.movementType || '') && (e.bodyPosition || ''));

function DemoExercises() {
  // 1:1 with src/ExercisesView.jsx: a SHOW row of flag chips (video / notes /
  // unclassified) and a FILTER BY row over the library sheet's own columns
  // (Resistance, Position, Movement, Joints, Joint Movements, Primary and
  // Secondary Muscles). Single-value fields OR together; the four multi-value
  // anatomy fields require ALL picked values (AND). Until 26.9 the demo offered
  // Category / Pattern / Laterality — filters the product does not have — and
  // none of the anatomy ones it does (verify-demo-parity).
  const [search, setSearch] = useState('');
  const emptyFilters = { resistanceType: [], bodyPosition: [], movementType: [], primaryJoints: [], jointMovements: [], primaryMuscles: [], secondaryMuscles: [] };
  const [filters, setFilters] = useState(emptyFilters);
  const [flags, setFlags] = useState({ video: false, notes: false, missing: false });
  const [openKey, setOpenKey] = useState(null); // which filter pill's menu is open
  const toggleFilter = (k, v) => setFilters(prev => { const cur = prev[k] || []; return { ...prev, [k]: cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v] }; });
  const clearFilter = (k) => setFilters(prev => ({ ...prev, [k]: [] }));
  const toggleFlag = (k) => setFlags(m => ({ ...m, [k]: !m[k] }));
  const activeFilterCount = Object.values(filters).reduce((n, a) => n + (a && a.length ? 1 : 0), 0) + Object.values(flags).filter(Boolean).length;
  const clearFilters = () => { setSearch(''); setFilters(emptyFilters); setFlags({ video: false, notes: false, missing: false }); setOpenKey(null); };
  const [view, setView] = useState('table'); // 'table' | 'grid' — mirrors real ExercisesView

  // Close the open filter menu on Escape (a click-catcher backdrop handles outside
  // clicks) — same affordance as the real ExercisesView.
  useEffect(() => {
    if (!openKey) return;
    const onKey = (e) => { if (e.key === 'Escape') setOpenKey(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openKey]);

  const FILTER_KEYS = ['resistanceType', 'bodyPosition', 'movementType', 'primaryJoints', 'jointMovements', 'primaryMuscles', 'secondaryMuscles'];
  const MULTI_VALUE = new Set(['primaryJoints', 'jointMovements', 'primaryMuscles', 'secondaryMuscles']);
  const splitVals = (v) => String(v || '').split(',').map(x => x.trim()).filter(Boolean);
  const q = search.trim().toLowerCase();
  // The filter predicate shared by the list and the faceted counts; `skip`
  // leaves one dimension out so its own options keep switchable counts.
  const pass = (e, skip) => {
    if (q) {
      const hay = [e.name, e.resistanceType, e.bodyPosition, e.movementType, e.primaryJoints, e.jointMovements, e.primaryMuscles, e.secondaryMuscles].filter(Boolean).join(' ').toLowerCase();
      if (!q.split(/\s+/).filter(Boolean).every(t => hay.includes(t))) return false;
    }
    for (const k of FILTER_KEYS) {
      if (k === skip) continue;
      const sel = filters[k] || [];
      if (!sel.length) continue;
      if (MULTI_VALUE.has(k)) { const v = splitVals(e[k]); if (!sel.every(x => v.includes(x))) return false; }
      else if (!sel.includes(e[k])) return false;
    }
    if (skip !== 'video' && flags.video && !demoHasVideo(e)) return false;
    if (skip !== 'notes' && flags.notes && !demoHasNotes(e)) return false;
    if (skip !== 'missing' && flags.missing && !demoUnclassified(e)) return false;
    return true;
  };
  const filtered = MOCK_EXERCISES.filter(e => pass(e, null));
  // Faceted option list [value, count]: OR facets skip their own dimension, AND
  // facets count inside the current selection — the real counts rule.
  const dynOpts = (k) => {
    const cm = {};
    for (const e of MOCK_EXERCISES) {
      if (MULTI_VALUE.has(k)) { if (pass(e, null)) new Set(splitVals(e[k])).forEach(v => { cm[v] = (cm[v] || 0) + 1; }); }
      else if (e[k] && pass(e, k)) cm[e[k]] = (cm[e[k]] || 0) + 1;
    }
    const keys = new Set([...Object.keys(cm), ...(filters[k] || [])]);
    return [...keys].sort((a, b) => (cm[b] || 0) - (cm[a] || 0) || a.localeCompare(b)).map(v => [v, cm[v] || 0]);
  };
  const flagCount = (k, fn) => MOCK_EXERCISES.filter(e => fn(e) && pass(e, k)).length;

  // Underline-trigger base (filters = underline text, not solid boxes).
  const railBase = { display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: CTRL_H, boxSizing: 'border-box', padding: '0 1px', background: 'transparent', border: 'none', borderBottom: '2px solid transparent', color: C.tm, fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', whiteSpace: 'nowrap' };

  // Carded multi-select menu — cyan strip header + OCD checkbox grid + tabular
  // faceted counts. 1:1 with src/ExercisesView.jsx FilterPill (#212 redesign).
  const FilterPill = ({ label, k }) => {
    const options = dynOpts(k);
    const sel = filters[k] || [];
    const active = sel.length > 0;
    const isOpen = openKey === k;
    const faceLabel = sel.length === 1 ? taxoHe(sel[0], readLang()) : (sel.length > 1 ? `${T(label)} · ${sel.length}` : T(label));
    return (
      <div style={{ position: 'relative' }}>
        {/* Inactive filters: no underline (calm plain text), cyan only when active/open — matches ExercisesView (#230). */}
        <button onClick={() => setOpenKey(isOpen ? null : k)} title={T(label)}
          style={{ ...railBase, borderBottomColor: (active || isOpen) ? C.ac : 'transparent', color: active ? C.ac : C.tx }}>
          <span style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>{faceLabel}</span>
          {active
            ? <span onClick={e => { e.stopPropagation(); clearFilter(k); }} title={tr(readLang(), 'Clear')} style={{ fontSize: 13, lineHeight: 1, opacity: 0.85 }}>×</span>
            : <span style={{ color: (active || isOpen) ? C.ac : C.tm, fontSize: 9 }}><svg aria-hidden viewBox="0 0 9 6" fill="none" width="0.95em" height="0.63em" style={{ display: 'inline-block', verticalAlign: 'middle' }}><path d="M1 1l3.5 3.5L8 1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg></span>}
        </button>
        {isOpen && (
          <div style={{ position: 'absolute', top: 32, left: 0, minWidth: 'max(100%, 248px)', maxHeight: 366, overflowY: 'auto', background: C.sf, border: `1px solid ${C.ac}`, zIndex: 50, boxShadow: '0 12px 30px rgba(0,0,0,0.55)' }}>
            <div style={{ position: 'sticky', top: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, height: 28, padding: '0 11px', background: 'color-mix(in srgb, var(--c-ac) 15%, var(--c-sf))', borderBottom: `1px solid ${C.ac}`, zIndex: 1 }}>
              <span style={{ fontFamily: FN, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.16em', color: C.ac, textTransform: 'uppercase' }}>{T(label)}</span>
              {sel.length > 0
                ? <span onClick={e => { e.stopPropagation(); clearFilter(k); }} title={T('Clear selection')} style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: C.tm, cursor: 'pointer' }}>{T('CLEAR ·')}{sel.length}</span>
                : <span style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: C.td, fontVariantNumeric: 'tabular-nums' }}>{options.length}</span>}
            </div>
            {options.length === 0 && <div style={{ padding: '10px 12px', color: C.td, fontFamily: FN, fontSize: 10, letterSpacing: '0.04em' }}>{T('No values')}</div>}
            {options.map(([v, c], idx) => {
              const on = sel.includes(v);
              return (
                <div key={v} onClick={() => toggleFilter(k, v)}
                  style={{ display: 'grid', gridTemplateColumns: '14px 1fr auto', gap: 10, alignItems: 'center', minHeight: CTRL_H, boxSizing: 'border-box', padding: '0 11px', cursor: 'pointer', fontFamily: FN, fontSize: 11, fontWeight: 600, letterSpacing: '0.02em', color: on ? C.ac : C.tx, background: on ? 'color-mix(in srgb, var(--c-ac) 12%, transparent)' : 'transparent', borderTop: idx === 0 ? 'none' : `1px solid ${C.cardBd}`, whiteSpace: 'nowrap' }}
                  onMouseEnter={e => { if (!on) e.currentTarget.style.background = 'rgba(127,127,138,0.08)'; }}
                  onMouseLeave={e => { if (!on) e.currentTarget.style.background = 'transparent'; }}>
                  <span style={{ width: 13, height: 13, boxSizing: 'border-box', border: `1px solid ${on ? C.ac : C.cardBd}`, background: on ? C.ac : 'transparent', color: '#0a0a0b', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, lineHeight: 1 }}>{on ? '✓' : ''}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{taxoHe(v, readLang())}</span>
                  <span style={{ color: on ? C.ac : C.tm, fontSize: 10, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{c}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <section>
      {/* Header — title + live count (left) + TABLE/GRID toggle (right), mirroring
          the redesigned real ExercisesView. */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontFamily: FN, fontSize: 13, fontWeight: 700, letterSpacing: '0.18em', color: C.tx, textTransform: 'uppercase' }}>
          {tr(readLang(), 'Exercises')} <span style={{ color: C.tm, fontWeight: 700 }}>· {filtered.length}</span>
        </h2>
        <div style={{ display: 'flex', gap: 6, width: 200 }}>
          {[['table', 'Table'], ['grid', 'Grid']].map(([v, label]) => {
            const on = view === v;
            return <button key={v} onClick={() => setView(v)} style={{ flex: 1, minHeight: CTRL_H, boxSizing: 'border-box', borderRadius: 0, cursor: 'pointer', border: `1px solid ${on ? '#39BDFF' : C.cardBd}`, background: on ? '#39BDFF' : C.sf, color: on ? '#FFFFFF' : C.tm, fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{T(label)}</button>;
          })}
        </div>
      </div>

      {/* Search + Add Exercise — mirrors the real ExercisesView top row: cyan
          search + Add Exercise both h30, Add = toggle width (200), one line. */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 18, alignItems: 'stretch', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200, display: 'flex' }}>
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={T('Search exercises (title, muscle, joint, position…)')}
            style={{
              width: '100%', boxSizing: 'border-box', background: C.sf, border: `1px solid ${C.ac}`, borderRadius: 0,
              height: 30, padding: '0 14px', color: C.tx, fontFamily: FB, fontSize: 13, lineHeight: '30px', outline: 'none',
            }}
          />
        </div>
        <button style={{ minHeight: CTRL_H, boxSizing: 'border-box', width: 200, flexShrink: 0, padding: '0 18px', background: 'transparent', border: `1px solid ${C.ac}`, color: C.ac, fontFamily: FN, fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', cursor: 'pointer', borderRadius: 0, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>+ {tr(readLang(), 'Add Exercise')}</button>
      </div>

      {/* Two rows like the real ExercisesView: SHOW (flag chips) and FILTER BY
          (the sheet's columns), each led by a muted role label. */}
      <div style={{ marginBottom: 16, borderBottom: `1px solid ${C.cardBd}` }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 14px', padding: '0 1px 6px' }}>
          <span style={{ flexShrink: 0, width: 58, fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', color: C.td, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{T('Show')}</span>
          {[['video', `▶ ${T('Video')} (${flagCount('video', demoHasVideo)})`, C.ac], ['notes', `☰ ${T('Notes')} (${flagCount('notes', demoHasNotes)})`, C.or], ['missing', `∅ ${T('Unclassified')} (${flagCount('missing', demoUnclassified)})`, C.or]].map(([k, label, color]) => (
            <button key={k} onClick={() => toggleFlag(k)} style={{ ...railBase, borderBottomColor: flags[k] ? color : 'transparent', color: flags[k] ? color : C.tm }}>{label}</button>
          ))}
          {(activeFilterCount > 0 || q) && <button onClick={clearFilters} title={T('Clear all filters')} style={{ ...railBase, marginInlineStart: 'auto', color: C.rd, letterSpacing: '0.1em', borderBottomColor: 'transparent' }}>× {tr(readLang(), 'Clear all')}</button>}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 14px', padding: '6px 1px 12px', borderTop: `1px solid ${C.cardBd}` }}>
          <span style={{ flexShrink: 0, width: 58, fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', color: C.td, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{T('Filter by')}</span>
          <FilterPill label="Resistance" k="resistanceType" />
          <FilterPill label="Position" k="bodyPosition" />
          <FilterPill label="Movement" k="movementType" />
          <FilterPill label="Joints" k="primaryJoints" />
          <FilterPill label="Joint Movements" k="jointMovements" />
          <FilterPill label="Primary Muscles" k="primaryMuscles" />
          <FilterPill label="Secondary Muscles" k="secondaryMuscles" />
        </div>
      </div>
      {/* Click-catcher backdrop: an outside click closes the open menu. */}
      {openKey && <div onClick={() => setOpenKey(null)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />}

      <div style={{ fontSize: 11, color: C.tm, marginBottom: 10, fontFamily: FN }}>
        {readLang() === 'he' ? (filtered.length === 1 ? 'תרגיל אחד' : `${filtered.length} תרגילים`) : `${filtered.length} exercise${filtered.length !== 1 ? 's' : ''}`}
      </div>

      {filtered.length === 0 ? (
        <div style={{
          background: C.sf, border: `1px dashed ${C.bd2}`, borderRadius: 0,
          padding: 40, textAlign: 'center',
        }}>
          <div style={{ fontFamily: FN, fontSize: 11, color: C.td, letterSpacing: 2, fontWeight: 700, marginBottom: 8 }}>{T('NO MATCHES')}</div>
          <div style={{ fontFamily: FB, fontSize: 13, color: C.tm }}>{T('Nothing matches')}{q ? <>{readLang() === 'he' ? ' ל־' : ' '}"<span style={{ color: C.tx, fontWeight: 700 }}>{search}</span>"</> : (readLang() === 'he' ? ' לסינון הזה' : ' this filter')}{readLang() === 'he' ? '. נקה את החיפוש או בחר קטגוריה אחרת.' : '. Clear search or pick another category.'}
          </div>
        </div>
      ) : view === 'grid' ? (
        // GRID — card per exercise, mirroring the real ExercisesView card grammar.
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(min(300px, 100%), 1fr))' }}>
          {filtered.map((e, i) => {
            const tags = [...String(e.primaryMuscles || '').split(',').map(x => x.trim()).filter(Boolean).slice(0, 4), ...String(e.primaryJoints || '').split(',').map(x => x.trim()).filter(Boolean).slice(0, 3)];
            return (
              <div key={i} className="ex-card" style={{ background: C.sf, border: `1px solid ${C.cardBd}`, borderRadius: 0, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, background: 'color-mix(in srgb, var(--c-stripBg, var(--c-sf)) 90%, var(--c-ac))', borderBottom: `1px solid ${C.cardBd}`, padding: '8px 14px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                    <span aria-hidden style={{ width: 3, height: 14, background: C.ac, flexShrink: 0, marginInlineStart: -8.5, marginInlineEnd: -3.5 }} /* hangs in the 14px gutter so the name starts on the body's edge (26.9) */ />
                    <span title={e.name} style={{ fontWeight: 700, fontSize: 13, letterSpacing: '0.04em', color: 'var(--c-stripTx)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.name}</span>
                  </span>
                  {demoHasVideo(e) && <span style={{ color: C.ac, fontSize: 12 }}>▶</span>}
                </div>
                <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
                  <div style={{ fontFamily: FN, fontSize: 11, fontWeight: 600, letterSpacing: '0.03em', color: C.tm }}>{[e.resistanceType, e.bodyPosition, e.movementType].filter(Boolean).join('  ·  ')}</div>
                  {tags.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>{tags.map((x, j) => <span key={j} style={{ display: 'inline-block', minWidth: 0, flexShrink: 1, overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1, fontFamily: FN, fontSize: 9.5, fontWeight: 600, letterSpacing: '0.02em', color: C.tm, background: 'var(--c-sf2)', border: `1px solid ${C.cardBd}`, padding: '2px 6px', whiteSpace: 'nowrap' }}>{x}</span>)}</div>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        // TABLE — full-width, every sheet parameter a column (real ExercisesView).
        <div className="cd-ex-table-wrap" style={{ background: C.sf, border: `1px solid ${C.cardBd}`, borderRadius: 0, overflowX: 'auto' }}>
          <style>{`
            /* The real ExercisesView's phone rules (below 701px): the seven
               taxonomy columns go, leaving name, MEDIA and the two actions;
               the name cell is capped so the actions stay on screen. */
            /* The real tablet band (701-1200): taxonomy hidden, name + MEDIA +
               actions, the name column taking the width. */
            @media (min-width: 701px) and (max-width: 1200px) {
              .cd-ex-table-wrap .cd-ex-taxo { display: none !important; }
              .cd-ex-table-wrap table { display: table !important; table-layout: auto !important; width: 100% !important; }
              .cd-ex-table-wrap col:first-child { width: auto !important; }
              .cd-ex-table-wrap td:first-child { max-width: none !important; }
            }
            @media (max-width: 700px) {
              .cd-ex-table-wrap { overflow-x: visible !important; }
              .cd-ex-table-wrap .cd-ex-taxo { display: none !important; }
              /* index.html turns EVERY table into display:block under 769px;
                 the real .ex-table opts back out, and so must this one — as a
                 block, an anonymous table box sized to its content sat inside
                 it and every row stopped short of the edge (26.9). */
              .cd-ex-table-wrap table { display: table !important; table-layout: auto !important; width: 100% !important; white-space: normal !important; }
              .cd-ex-table-wrap th, .cd-ex-table-wrap td { white-space: normal !important; }
              .cd-ex-table-wrap td:first-child, .cd-ex-table-wrap th:first-child { max-width: none !important; }
              /* The real table's long names fill the name column; the demo's short
                 ones left 30% of the width to it and the rest to MEDIA and the
                 actions (125 / 121px). As on the real tablet rule, the name column
                 is auto and takes what is left. */
              .cd-ex-table-wrap col:first-child { width: auto !important; }
              /* Edit + delete stay side by side (the real column measures 63px
                 and holds both); wrapping stacked them and doubled every row. */
              .cd-ex-table-wrap td:last-child { white-space: nowrap !important; }
            }
          `}</style>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: FB, fontSize: 13 }}>
            {/* The real table's column structure. Its percentage widths are left
                out: with the demo's short names they gave Joint Movements 138px at
                1440 and every value broke one word per line (overflow gate, 26.9). */}
            <colgroup>
              <col />
              {Array.from({ length: 7 }, (_, j) => <col key={j} className="cd-ex-taxo" />)}
              <col style={{ width: '58px' }} />
              <col style={{ width: '56px' }} />
            </colgroup>
            <thead>
              <tr>
                {['Exercise', 'Resistance', 'Position', 'Movement', 'Joints', 'Joint Movements', 'Primary Muscles', 'Secondary Muscles'].map(h => (
                  <th key={h} className={h === 'Exercise' ? undefined : 'cd-ex-taxo'} style={{ textAlign: 'start', padding: '9px 12px', fontSize: 9, fontFamily: FN, color: C.tm, textTransform: 'uppercase', letterSpacing: '0.13em', fontWeight: 700, whiteSpace: 'nowrap', borderBottom: `1px solid ${C.cardBd}`, background: 'var(--c-sf2)' }}>{T(h)}</th>
                ))}
                <th style={{ padding: '9px 12px', fontSize: 9, fontFamily: FN, color: C.tm, textTransform: 'uppercase', letterSpacing: '0.13em', fontWeight: 700, textAlign: 'center', whiteSpace: 'nowrap', borderBottom: `1px solid ${C.cardBd}`, background: 'var(--c-sf2)' }}>{T('Media')}</th>
                <th style={{ borderBottom: `1px solid ${C.cardBd}`, background: 'var(--c-sf2)' }} />
              </tr>
            </thead>
            <tbody>
              {filtered.map((e, i) => {
                // taxo: the six CLOSED lists get their Hebrew name; the anatomy
                // columns pass through taxoHe untouched and stay English,
                // which is what an Israeli S&C coach actually says.
                const cell = (v, max = 210) => <td className="cd-ex-taxo" style={{ padding: '9px 12px', fontSize: 10.5, fontFamily: FN, fontWeight: 600, color: v ? C.tm : C.td, whiteSpace: 'normal', overflowWrap: 'break-word', maxWidth: max }}>{taxoHe(v, readLang()) || '·'}</td>;
                return (
                  <tr key={i} style={{ borderBottom: `1px solid ${C.cardBd}`, background: i % 2 ? 'rgba(127,127,138,0.04)' : 'transparent', height: CTRL_H }}>
                    <td style={{ padding: '9px 12px 9px 14px', maxWidth: 260 }}>
                      {/* The real row's status dot: cyan = video, orange = cues only. */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                        <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: demoHasVideo(e) ? C.ac : demoHasNotes(e) ? C.or : 'transparent', border: (demoHasVideo(e) || demoHasNotes(e)) ? 'none' : `1px solid ${C.td}` }} />
                        <span style={{ fontWeight: 600, fontSize: 13, color: C.tx, whiteSpace: 'normal', overflowWrap: 'break-word', minWidth: 0 }}>{e.name}</span>
                      </div>
                    </td>
                    {cell(e.resistanceType)}{cell(e.bodyPosition)}{cell(e.movementType)}{cell(e.primaryJoints, 160)}{cell(e.jointMovements, 200)}{cell(e.primaryMuscles, 200)}{cell(e.secondaryMuscles, 190)}
                    <td style={{ padding: '9px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                      {demoHasVideo(e) && <span title={T('Has a demo video')} style={{ color: C.ac, marginInlineEnd: demoHasNotes(e) ? 8 : 0, fontSize: 12 }}>▶</span>}
                      {demoHasNotes(e) && <span title={T('Has coaching cues')} style={{ color: C.or, fontSize: 12 }}>☰</span>}
                    </td>
                    {/* Edit / delete, as on the real row — inert in the demo. */}
                    <td style={{ padding: '9px 8px', whiteSpace: 'nowrap', textAlign: 'end' }}>
                      <button title={T('Demo only')} style={{ background: 'none', border: 'none', color: C.tm, cursor: 'default', padding: 4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                      </button>
                      <button title={T('Demo only')} style={{ background: 'none', border: 'none', color: C.rd, cursor: 'default', padding: 4, opacity: 0.7, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                      </button>
                    </td>
                  </tr>
                );
              })}
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
// ONE WEEK NUMBER FOR THE WHOLE DEMO. The sessions tab hardcoded W4 while the
// review queue said week 2 and the athlete portal highlighted W2 — the same
// three athletes, in the same Block #4, in three different weeks depending on
// which tab you were looking at.
const DEMO_WEEK = 2;
const MOCK_REVIEW_QUEUE = [
  {
    id: 'rv1', traineeName: 'נועה לוי', initials: 'NL',
    dayName: 'Day A · Push', planName: 'Block #4 — Push/Pull Volume', week: DEMO_WEEK,
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
    dayName: 'Day B · Pull', planName: 'Block #4 — Couple Volume', week: 4,   // = 1 + idSeed('t3') % 4, the week the picker auto-selects for her
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
    dayName: 'Day C · Legs', planName: 'Block #4 — Pull Specialization', week: 3,   // = 1 + idSeed('t2') % 4
    date: 'Yesterday', doneSets: 14, totalSets: 14,
    exercises: [
      { name: 'Back Squat',         prescribed: '4×5 · 100kg',  done: 4, sets: 4, hasVideo: false, comments: 0, focus: false },
      { name: 'Romanian Deadlift',  prescribed: '3×8 · 90kg',   done: 3, sets: 3, hasVideo: false, comments: 0, focus: false },
      { name: 'Walking Lunge',      prescribed: '3×10 E',       done: 3, sets: 3, hasVideo: false, comments: 0, focus: false },
      { name: 'Leg Curl',           prescribed: '3×12',         done: 3, sets: 3, hasVideo: false, comments: 0, focus: false },
      { name: 'Hip Thrust',         prescribed: '1×AMRAP',      done: 1, sets: 1, hasVideo: false, comments: 0, focus: false },
    ],
  },
  // Already reviewed — the archive behind the real queue's SHOW REVIEWED.
  {
    id: 'rv4', traineeName: 'נועה לוי', initials: 'NL', reviewed: true,
    dayName: 'Day C · Legs', planName: 'Block #4 — Push/Pull Volume', week: DEMO_WEEK,
    date: '2 days ago', doneSets: 15, totalSets: 15,
    exercises: [
      { name: 'Back Squat',         prescribed: '4×5 · 70kg',   done: 4, sets: 4, hasVideo: true,  comments: 2, focus: true  },
      { name: 'Romanian Deadlift',  prescribed: '3×8 · 60kg',   done: 3, sets: 3, hasVideo: false, comments: 0, focus: false },
      { name: 'Walking Lunge',      prescribed: '3×10 E',       done: 3, sets: 3, hasVideo: false, comments: 0, focus: false },
      { name: 'Hip Thrust',         prescribed: '3×10',         done: 3, sets: 3, hasVideo: false, comments: 1, focus: false },
      { name: 'Plank',              prescribed: '2×45s',        done: 2, sets: 2, hasVideo: false, comments: 0, focus: false },
    ],
  },
  {
    id: 'rv5', traineeName: 'גל מזרחי', initials: 'GM', reviewed: true,
    dayName: 'Day B · Pull', planName: 'Block #4 — Pull Specialization', week: 3,
    date: '3 days ago', doneSets: 16, totalSets: 16,
    exercises: [
      { name: 'Pull-Up',            prescribed: '4×6',          done: 4, sets: 4, hasVideo: true,  comments: 1, focus: true  },
      { name: 'Bent-Over BB Row',   prescribed: '4×8 · 60kg',   done: 4, sets: 4, hasVideo: false, comments: 0, focus: false },
      { name: 'Face Pull',          prescribed: '3×15',         done: 3, sets: 3, hasVideo: false, comments: 0, focus: false },
      { name: 'DB Bicep Curl',      prescribed: '3×12',         done: 3, sets: 3, hasVideo: false, comments: 0, focus: false },
      { name: 'Hanging Leg Raise',  prescribed: '2×10',         done: 2, sets: 2, hasVideo: false, comments: 0, focus: false },
    ],
  },
];

function DemoReview() {
  // Two-screen mirror of src/WorkoutReview.jsx:
  //   1. Queue list — sub-nav + REVIEW QUEUE banner + per-athlete workout cards
  //   2. Workout detail — exercise rows with the same 📹💬🎯 icons + bottom
  //      action row (DELETE / UNMARK / BACK TO REVIEW / NEXT PENDING) the
  //      real coach sees.
  const [selectedId, setSelectedId] = useState(null);
  const [vsDemo, setVsDemo] = useState(false); // Body-Match: form clip vs library reference demo
  const selected = MOCK_REVIEW_QUEUE.find(w => w.id === selectedId);
  // The real queue (WorkoutReview): pending athletes first; the reviewed
  // archive stays behind a SHOW REVIEWED (n) toggle under the last of them.
  const [showReviewed, setShowReviewed] = useState(false);
  const groupOf = (list) => {
    const by = {};
    for (const wo of list) {
      if (!by[wo.traineeName]) by[wo.traineeName] = { name: wo.traineeName, workouts: [] };
      by[wo.traineeName].workouts.push(wo);
    }
    return by;
  };
  const byClient = groupOf(MOCK_REVIEW_QUEUE.filter(w => !w.reviewed));
  const reviewedList = MOCK_REVIEW_QUEUE.filter(w => w.reviewed);
  const byClientReviewed = groupOf(reviewedList);

  // Weekly-focus strip — mirrors the real WorkoutReview's WeeklyFocusTool
  // header. The "Log In-Person Session" subtab was removed from the real app
  // 2026-05-28 (in-person logging moved out), so Review is a SINGLE surface —
  // the demo drops the invented subtab + "REVIEW QUEUE" banner to match.
  const weeklyFocus = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'color-mix(in srgb, var(--c-stripBg, var(--c-sf)) 90%, var(--c-ac))', border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: '0 14px', minHeight: CTRL_H, boxSizing: 'border-box', marginBottom: 14 }}>
      <span style={{ fontFamily: FN, fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--c-stripTx)' }}>{T('WEEKLY FOCUS · NO UPLOAD NEEDED')}</span>
      <span style={{ color: C.tm, fontSize: 12 }}>▾</span>
    </div>
  );

  if (selected) {
    return (
      <section>
        <button onClick={() => setSelectedId(null)} style={{
          background: 'none', border: 'none', color: C.ac,
          cursor: 'pointer', fontFamily: FB, fontSize: 13, padding: 0, marginBottom: 12,
        }}>← {tr(readLang(), 'Back')}</button>

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
              <span dir="ltr" style={{ unicodeBidi: 'isolate' }}>{selected.doneSets}/{selected.totalSets}</span>{' '}{T('SETS DONE')}</div>
          </div>
        </div>

        {/* Readiness check-in — the athlete's pre-session autoregulation
            (sleep / energy / soreness / pain), surfaced in the real Review detail
            so the coach programs around it. */}
        <div style={{ background: C.sf, border: `1px solid ${C.cardBd}`, borderRadius: 0, marginBottom: 12, overflow: 'hidden' }}>
          <div style={{ background: 'color-mix(in srgb, var(--c-stripBg, var(--c-sf)) 90%, var(--c-ac))', borderBottom: `1px solid ${C.cardBd}`, padding: '8px 14px', fontFamily: FN, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--c-stripTx)', textTransform: 'uppercase' }}>{T('Readiness Check-In')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 12, padding: 14 }}>
            {[['Sleep', '7.5h', null, C.gn], ['Energy', '8 / 10', null, C.gn], ['Soreness', null, 'Low', C.gn], ['Pain', '2 / 10', 'L knee', C.or]].map(([l, num, word, c]) => (
              <div key={l} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', color: C.td, textTransform: 'uppercase' }}>{T(l)}</span>
                <span style={{ fontFamily: FN, fontSize: 15, fontWeight: 700, color: c }}>
                  {num && <span dir="ltr" style={{ unicodeBidi: 'isolate' }}>{num}</span>}
                  {num && word ? ' · ' : ''}
                  {word ? T(word) : ''}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Form-video review — the flagship of the real Review detail
            (WorkoutReview FormVideoPlayer): watch the athlete's clip + comment at
            any timestamp. Mocked frame + timestamped comments for the demo. */}
        {selected.exercises.some(e => e.hasVideo) && (() => {
          const vidEx = selected.exercises.find(e => e.hasVideo);
          return (
            <div style={{ background: C.sf, border: `1px solid ${C.cardBd}`, borderRadius: 0, marginBottom: 12, overflow: 'hidden' }}>
              <div style={{ background: 'color-mix(in srgb, var(--c-stripBg, var(--c-sf)) 90%, var(--c-ac))', borderBottom: `1px solid ${C.cardBd}`, padding: '8px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: FN, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--c-stripTx)', textTransform: 'uppercase' }}>{T('Form Video ·')}{vidEx.name}</span>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <button onClick={e => { e.stopPropagation(); setVsDemo(v => !v); }} title={T("Play the athlete's rep next to the branded reference demo")}
                    style={{ background: vsDemo ? '#39BDFF' : 'transparent', border: `1px solid ${vsDemo ? '#39BDFF' : 'rgba(255,255,255,0.35)'}`, color: vsDemo ? '#06131b' : '#fff', fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', padding: '3px 9px', borderRadius: 0, cursor: 'pointer', textTransform: 'uppercase' }}>{T('◫ vs Demo')}</button>
                  <span style={{ fontFamily: FN, fontSize: 9, color: '#fff', opacity: 0.7, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{T('Draw · comment at any timestamp')}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, padding: 14, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
                  <div>
                    {vsDemo && <div style={{ fontFamily: FN, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.tm, marginBottom: 4 }}>{T('Athlete · this set')}</div>}
                    <div style={{ position: 'relative', width: 168, aspectRatio: '9 / 16', background: '#000', border: `1px solid ${C.cardBd}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 12, textAlign: 'center' }}>
                      <span style={{ fontFamily: FN, fontSize: 9, lineHeight: 1.5, letterSpacing: '0.06em', color: C.tm }}>{T("The athlete's own clip plays here")}</span>
                      <a href="/try?embed=1" target="_blank" rel="noopener" onClick={e => e.stopPropagation()} style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', color: C.ac, border: `1px solid ${C.ac}`, padding: '6px 9px', textDecoration: 'none' }}>{T('TRY IT WITH YOUR OWN CLIP')}{readLang() === 'he' ? ' ←' : ' →'}</a>
                      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, background: 'rgba(255,255,255,0.15)' }}><div style={{ width: '38%', height: '100%', background: '#39BDFF' }} /></div>
                    </div>
                  </div>
                  {vsDemo && (
                    <div>
                      <div style={{ fontFamily: FN, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.ac, marginBottom: 4 }}>{T('Reference demo · library')}</div>
                      <div style={{ position: 'relative', width: 168, aspectRatio: '9 / 16', background: '#000', border: `1px solid ${C.ac}`, overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
                        <YouTubeLite id={DEMO_REFERENCE_CLIP} short eager />
                        <span style={{ position: 'absolute', top: 6, left: 6, fontFamily: FN, fontSize: 8, letterSpacing: '0.06em', color: '#fff', background: 'rgba(0,0,0,0.55)', padding: '2px 5px' }}>{vidEx.name}</span>
                      </div>
                    </div>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 180, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[['0:04', 'Brace before you unrack — ribs down.'], ['0:11', 'Depth is good; drive the knees out on the way up.']].map(([ts, c], j) => (
                    <div key={j} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, color: C.ac, flexShrink: 0, marginTop: 1 }}>{ts}</span>
                      <span style={{ fontFamily: FB, fontSize: 12, color: C.tm, lineHeight: 1.4 }}>{c}</span>
                    </div>
                  ))}
                  <div style={{ marginTop: 'auto', display: 'flex', gap: 8, alignItems: 'center', borderTop: `1px solid ${C.cardBd}`, paddingTop: 8 }}>
                    <input placeholder={T('Comment at 0:04…')} readOnly style={{ flex: 1, minWidth: 0, background: 'var(--c-sf2)', border: `1px solid ${C.cardBd}`, color: C.tm, fontFamily: FB, fontSize: 12, padding: '7px 10px', borderRadius: 0, outline: 'none' }} />
                    <button onClick={e => e.stopPropagation()} style={{ ...baseBtn, background: '#39BDFF', color: '#06131b', border: '1px solid #39BDFF', padding: '0 14px', fontSize: 11 }}>{tr(readLang(), 'Send')}</button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

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
                {ex.prescribed} · {ex.done}/{ex.sets} {T('sets')}
                {ex.hasVideo && <span title={T('Form video submitted')} style={{ color: C.gn, marginInlineStart: 6, display: 'inline-flex', alignItems: 'center', verticalAlign: '-2px' }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg></span>}
                {ex.comments > 0 && (
                  <span title={readLang() === 'he' ? (ex.comments === 1 ? 'הערה אחת על התרגיל' : `${ex.comments} הערות על התרגיל`) : `${ex.comments} comment${ex.comments === 1 ? '' : 's'} on this exercise`} style={{ color: C.ac, marginInlineStart: 6 }}>
                    💬{ex.comments > 1 ? <sup style={{ fontSize: 8 }}>{ex.comments}</sup> : null}
                  </span>
                )}
                {ex.focus && (
                  <span title={T('Weekly focus written')} style={{ color: C.or, marginInlineStart: 6 }}>🎯</span>
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
          }}>{T('DELETE')}</button>
          <button onClick={e => e.stopPropagation()} style={{
            padding: '12px 16px', borderRadius: 0, border: `1px solid ${C.bd}`,
            background: 'transparent', color: C.tm,
            fontFamily: FN, fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}>{T('UNMARK')}</button>
          <button onClick={() => setSelectedId(null)} title={T('Return to the review queue')} style={{
            flex: 1, padding: '12px 0', borderRadius: 0, border: `1px solid ${C.bd2}`,
            background: 'transparent', color: C.tx,
            fontFamily: FN, fontSize: 13, fontWeight: 700, letterSpacing: 0.5, cursor: 'pointer',
          }}>← {tr(readLang(), 'BACK')}</button>
          <button onClick={() => setSelectedId(null)} title={T('Mark reviewed and return to the queue (demo only)')} style={{
            flex: 1, padding: '12px 0', borderRadius: 0, border: `1px solid ${C.ac}`,
            background: C.ac, color: '#0a0a0b',
            fontFamily: FN, fontSize: 13, fontWeight: 700, letterSpacing: 0.5, cursor: 'pointer',
          }}>✓ {tr(readLang(), 'MARK REVIEWED — BACK')}</button>
        </div>
      </section>
    );
  }

  return (
    <section>
      {weeklyFocus}

      {(() => {
        const renderGroup = ([cid, data]) => (
        <div key={cid} style={{ marginBottom: 20 }}>
          {/* Athlete group header — solid cyan strip: name + (n) pending +
              · planName (cyan) + current-stage week boxes + Athlete page →.
              Mirrors WorkoutReview's CollapsibleSection group header. */}
          {/* The real bare section strip's box: 0 14px, one 41px height, the
              row centred (was 8px padding around a 36px button = 54px, and the
              name rode 1.3px high; 26.9, #215). It still wraps on a phone,
              where the plan name and weeks need their own line. */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', rowGap: 4, background: 'color-mix(in srgb, var(--c-stripBg, var(--c-sf)) 90%, var(--c-ac))', border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: '2px 14px', minHeight: 41, boxSizing: 'border-box', marginBottom: 8 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, fontSize: isHeb(data.name) ? 15 : 12, fontFamily: isHeb(data.name) ? FH : FN, color: 'var(--c-stripTx)', fontWeight: 700 }}>
              <span style={{ lineHeight: 1, transform: isHeb(data.name) ? 'translateY(1.3px)' /* Heebo's Hebrew rides 1.3px high in a 1.0 line box — measured on the ink, 26.9 */ : undefined }}>{isHeb(data.name) ? data.name : data.name.toUpperCase()} ({data.workouts.length})</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                <span style={{ fontFamily: FN, fontSize: 11, lineHeight: 1, color: 'var(--c-ac)', fontWeight: 700, letterSpacing: '0.04em' }}>· {data.workouts[0].planName}</span>
                <span style={{ display: 'inline-flex', gap: 3, verticalAlign: 'middle' }}>
                  {Array.from({ length: 4 }, (_, i) => <span key={i} style={{ width: 13, height: 5, background: i < Math.min(data.workouts[0].week, 4) ? 'var(--c-ac)' : 'var(--c-tm)', opacity: i < Math.min(data.workouts[0].week, 4) ? 1 : 0.35 }} />)}
                </span>
              </span>
            </span>
            <button onClick={e => e.stopPropagation()} title={T("Open this athlete's page (demo only)")} style={{ background: 'transparent', border: '1px solid color-mix(in srgb, var(--c-stripTx) 55%, transparent)', color: 'var(--c-stripTx)', borderRadius: 0, minHeight: CTRL_H, boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 10px', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer', whiteSpace: 'nowrap', lineHeight: 1 }}>{T('Athlete page →')}</button>
          </div>
          {data.workouts.map(wo => {
            const hasFormVids = wo.exercises.some(e => e.hasVideo);
            return (
              <div key={wo.id} onClick={() => setSelectedId(wo.id)} style={{
                background: C.sf, border: `1px solid ${C.cardBd}`, borderRadius: 0,
                padding: '12px 14px', marginBottom: 6, cursor: 'pointer', // 14 = the group strip's inset (26.9)
                transition: 'border-color .15s', display: 'flex',
                // WRAP AT PHONE WIDTH. The two actions are flexShrink 0 and
                // took ~210px of a 360 screen, leaving the title block 102px —
                // enough to break "Block #4 — Pull Specialization" over four
                // lines and push "Day A · Push" 2px past its own edge. Wrapped,
                // the title gets the full row and the actions sit under it.
                flexWrap: 'wrap', rowGap: 8,
                justifyContent: 'space-between', alignItems: 'center',
              }}
                onMouseEnter={e => e.currentTarget.style.borderColor = C.ac}
                onMouseLeave={e => e.currentTarget.style.borderColor = C.cardBd}>
                <div style={{ minWidth: 0, flex: '1 1 190px' }}>
                  <div className="cd-rv-title" style={{ fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {/* A bare text node inside a flex row is an anonymous flex
                        item and shrinks to its minimum content width: "Day A ·
                        Push" came out over five lines in 102px. A day title is
                        four short words and should never break. */}
                    <span style={{ whiteSpace: 'nowrap' }}>{wo.dayName}</span>
                    <span style={{ fontWeight: 400, color: C.tm, fontSize: 12, minWidth: 0, overflowWrap: 'anywhere' }}>{wo.planName}</span>
                  </div>
                  <div style={{ fontSize: 11, color: C.tm, marginTop: 2 }}>
                    W{wo.week} · {RT(wo.date)} · {wo.doneSets}/{wo.totalSets} {T('sets')}
                    {hasFormVids && <span style={{ color: C.gn, marginInlineStart: 4, display: 'inline-flex', alignItems: 'center', verticalAlign: '-2px' }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg></span>}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginInlineStart: 12, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                  <button onClick={() => setSelectedId(wo.id)} title={T('Review this workout')} style={{ background: 'transparent', border: `1px solid ${C.ac}`, color: C.ac, borderRadius: 0, minHeight: CTRL_H, boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 12px', fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', cursor: 'pointer', whiteSpace: 'nowrap' }}>{T('REVIEW →')}</button>
                  <button onClick={e => e.stopPropagation()} title={T('Delete this workout (demo only)')} style={{ background: 'transparent', border: `1px solid color-mix(in srgb, ${C.rd} 40%, transparent)`, color: C.rd, borderRadius: 0, minHeight: CTRL_H, boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 10px', fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', cursor: 'pointer' }}>{T('DELETE')}</button>
                </div>
              </div>
            );
          })}
        </div>
        );
        const reviewedCount = reviewedList.length;
        return (<>
          {Object.entries(byClient).map(renderGroup)}
          {/* Queue divider, as on the real queue: under the last pending
              athlete, the reviewed archive behind a toggle. */}
          {reviewedCount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'center', margin: '4px 0 20px' }}>
              <button onClick={() => setShowReviewed(v => !v)}
                style={{ background: showReviewed ? `${C.ac}1f` : 'transparent', border: `1px solid ${showReviewed ? C.ac : C.cardBd}`, color: showReviewed ? C.ac : C.tm, borderRadius: 0, minHeight: CTRL_H, boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', padding: '0 16px', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
                {showReviewed ? <>✕ {T('HIDE REVIEWED')} ({reviewedCount})</> : <>{T('SHOW REVIEWED')} ({reviewedCount})</>}
              </button>
            </div>
          )}
          {showReviewed && Object.entries(byClientReviewed).map(renderGroup)}
        </>);
      })()}
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

// Mirrors the REAL coach nav (App.jsx: Dashboard › Athletes ▾ › Sessions ›
// Review ▾ › Tasks › Billing). Programs and Exercises are NOT top-level in the
// real app — they live under Athletes ▾ — so showing them as top-level tabs
// here sold a nav shape the product does not have (parity pass 08-25). They now
// appear in a sub-row, exactly like the Review ▾ WORKOUTS | TOOLS row already
// did. Tabs the demo genuinely has no content for (Incoming, Challenges, BHBC,
// Portal) stay out: a dead click is worse drift than a missing one.
const TABS = [
  { key: 'dashboard', label: 'DASHBOARD', count: null },
  { key: 'trainees',  label: 'ATHLETES',  count: MOCK_TRAINEES.length },
  { key: 'sessions',  label: 'SESSIONS',  count: null },
  { key: 'review',    label: 'REVIEW',    count: null },
  { key: 'tasks',     label: 'TASKS',     count: 8 },
  { key: 'billing',   label: 'BILLING',   count: null },
];
// Athletes ▾ — the real app's grouping.
const ATHLETE_SUBTABS = [
  ['trainees',  'ROSTER'],
  ['programs',  'PROGRAMS'],
  ['exercises', 'EXERCISES'],
];
const ATHLETE_GROUP = ATHLETE_SUBTABS.map(([k]) => k);

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
      <h3 style={{ ...sectionH, marginBottom: 12 }}>{T('Start Workout from Plan')}</h3>
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
                  border: `1px solid ${C.bd}`, padding: '0 12px', fontSize: 12, fontWeight: 600,
                }}>▶ {dn}</button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* 2. In Progress */}
      {MOCK_IN_PROGRESS.length > 0 && (
        <>
          <h3 style={{ ...sectionH, color: C.or, marginBottom: 12 }}>{T('In Progress (')}{MOCK_IN_PROGRESS.length})</h3>
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
        <h3 style={sectionH}>{readLang() === 'he' ? 'הושלמו' : 'Completed'} ({completed.length})</h3>
        <select value={filterTrainee} onChange={e => setFilterTrainee(e.target.value)} style={{
          background: C.sf, border: `1px solid ${C.bd2}`, borderRadius: 0,
          padding: '4px 8px', color: C.tx, fontFamily: FB, fontSize: 12, outline: 'none',
          width: 180,
        }}>
          <option value="">{tr(readLang(), 'All Athletes')}</option>
          {MOCK_TRAINEES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
      {completed.length === 0 ? (
        <div style={{
          background: C.sf, border: `1px dashed ${C.bd2}`, borderRadius: 0,
          padding: 36, textAlign: 'center', color: C.tm, fontFamily: FB, fontSize: 13,
        }}>📊 {tr(readLang(), 'No completed workouts yet.')}</div>
      ) : (
        completed.map((w, i) => (
          <div key={i} style={demoCardStyle({ marginBottom: 8 })}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontFamily: FB, fontWeight: 600, fontSize: 14, color: C.tx }}>
                  {w.day} <span style={{ fontWeight: 400, color: C.td, fontSize: 12 }}>({w.who})</span>
                </div>
                <div style={{ fontFamily: FB, fontSize: 12, color: C.tm }}>
                  {w.who} · {RT(w.when)}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Badge color={C.gn}>{tr(readLang(), 'Completed')}</Badge>
                <button onClick={e => e.stopPropagation()} title={T('Demo only')} style={{ background: 'none', border: 'none', color: C.tm, cursor: 'pointer', padding: 4 }}>✏️</button>
                <button onClick={e => e.stopPropagation()} title={T('Demo only')} style={{ background: 'none', border: 'none', color: C.rd, cursor: 'pointer', padding: 4, opacity: 0.6 }}>🗑</button>
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
  { id: 'sx1', title: 'Back Squat', prescribed: '4 × 5', tempo: '30X1', cue: 'דחוף ברכיים קדימה · טווח תנועה מלא בירידה · נשיפה בעלייה', sets: [{ kg: '100', reps: '5', rpe: '8', done: true }, { kg: '102.5', reps: '5', rpe: '8', done: true }, { kg: '102.5', reps: '5', rpe: '9', done: false }, { kg: '', reps: '', rpe: '', done: false }] },
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
      <div style={{ width: 44, height: 44, borderRadius: '50%', border: `2px solid ${C.ac}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.ac, fontSize: 16, paddingInlineStart: 3 }}>▶</div>
      <div style={{ fontFamily: FN, fontSize: 9, letterSpacing: '0.14em', color: C.tm }}>{title} · {tr(readLang(), 'FORM VIDEO')}</div>
      <div style={{ fontFamily: FN, fontSize: 8, letterSpacing: '0.1em', color: C.td }}>{T('PLAYS INLINE — NO CLICK-THROUGH')}</div>
    </div>
  );
}

// `doneUpTo` is how many of this exercise's sets this ATHLETE has finished.
// Every card used to render the same DEMO_SESSION_DAY object, so all three
// athletes on the floor showed byte-identical progress — and the one who had
// not checked in yet still showed two sets of squats done. A coach reads that
// in a second.
function DemoSessionExercise({ ex, open, onToggle, doneUpTo }) {
  const sets = doneUpTo == null ? ex.sets : ex.sets.map((x, i) => ({ ...x, done: i < doneUpTo }));
  const doneCount = sets.filter(s => s.done).length;
  const allDone = doneCount === sets.length && sets.length > 0;
  const COLS = '16px 1fr 1fr 0.8fr 30px';
  return (
    <div style={{ border: `1px solid ${allDone ? C.gn : open ? C.ac : C.cardBd}`, background: open ? 'rgba(57,189,255,0.04)' : 'transparent', marginBottom: 6 }}>
      <div onClick={onToggle} style={{ padding: 8, cursor: 'pointer' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <span style={{ fontFamily: FB, fontSize: 12.5, color: C.tx, fontWeight: 600, minWidth: 0, whiteSpace: 'normal', overflowWrap: 'break-word', lineHeight: 1.3 }}>
            {allDone && <span style={{ color: C.gn, marginInlineEnd: 4 }}>✓</span>}{ex.title}
          </span>
          <span style={{ color: 'var(--c-tx)', fontSize: 12, flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>▾</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
          <span dir="ltr" style={{ fontFamily: FN, fontSize: 13, fontWeight: 700, letterSpacing: '0.02em', color: C.ac, unicodeBidi: 'isolate' }}>{ex.prescribed}</span>
          <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: allDone ? C.gn : C.tm }}><span dir="ltr" style={{ unicodeBidi: 'isolate' }}>{doneCount}/{sets.length}</span>{' '}{T('DONE')}</span>
        </div>
      </div>
      {open && (
        <div style={{ padding: '0 8px 8px' }} onClick={e => e.stopPropagation()}>
          {ex.tempo && <div style={{ fontFamily: FN, fontSize: 11, color: C.or, letterSpacing: '0.04em', marginBottom: 4 }}>⏱ {ex.tempo}</div>}
          {ex.cue && <div style={{ fontSize: 11.5, color: C.tx, lineHeight: 1.45, marginBottom: 6, background: 'rgba(57,189,255,0.06)', border: `1px solid ${C.ac}`, padding: '6px 8px', direction: isHeb(ex.cue) ? 'rtl' : 'ltr', fontFamily: isHeb(ex.cue) ? FH : FB }}>{ex.cue}</div>}
          <DemoInlineVideo title={ex.title} />
          <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 4, marginTop: 8, marginBottom: 2 }}>
            {['', 'REPS', 'KG', 'RPE', '✓'].map((h, i) => <span key={i} style={{ fontFamily: FN, fontSize: 8, fontWeight: 700, letterSpacing: '0.06em', color: C.tm, textAlign: 'center' }}>{h}</span>)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {sets.map((s, si) => (
              <div key={si} style={{ display: 'grid', gridTemplateColumns: COLS, gap: 4, alignItems: 'center' }}>
                <span style={{ fontFamily: FN, fontSize: 10, color: C.td, textAlign: 'center' }}>{si + 1}</span>
                <input defaultValue={s.reps} placeholder="reps" style={dCell} />
                <input defaultValue={s.kg} placeholder="kg" style={dCell} />
                <input defaultValue={s.rpe} placeholder="—" style={dCell} />
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <input type="checkbox" key={`${si}-${s.done}`} defaultChecked={s.done} style={{ width: 18, height: 18, accentColor: C.gn, cursor: 'pointer' }} />
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
  // slice(0, 3) put גל on the gym floor — a man whose own card says dormant
  // 18 days and whose format is Online. Three tabs then disagreed about the
  // same athlete on the same afternoon. The floor is whoever actually trains
  // in the gym and is not dormant.
  const roster = MOCK_TRAINEES.filter(t => /Gym/.test(t.format || '') && !t.dormantDays).slice(0, 3);
  const [open, setOpen] = useState({}); // `${athleteIdx}:${exId}` -> bool
  const [checkedIn, setCheckedIn] = useState({ 0: true, 1: true });
  return (
    <div>
      {/* Floor bar */}
      <div style={{ background: C.sf, border: `1px solid ${C.cardBd}`, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: `1px solid ${C.cardBd}` }}>
          <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: '0.04em', textTransform: 'uppercase', color: C.ac, fontFamily: FN }}>{T('ON THE FLOOR ·')}{Object.values(checkedIn).filter(Boolean).length}/{roster.length} {T('CHECKED IN')}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ ...baseBtn, background: 'transparent', color: C.tm, border: `1px solid ${C.bd}`, padding: '0 12px', fontSize: 11 }}>+ {tr(readLang(), 'ADD')}</button>
            <button style={{ ...baseBtn, background: 'transparent', color: C.tm, border: `1px solid ${C.bd}`, padding: '0 12px', fontSize: 11 }}>■ {tr(readLang(), 'FINISH')}</button>
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
                  <div style={{ fontFamily: FN, fontSize: 10, color: C.tm, letterSpacing: '0.04em' }}>{tr(readLang(), 'Day A')} · {readLang() === 'he' ? `${tr('he', 'W')}${1 + (idSeed(t.id) % 4)}` : <span dir="ltr" style={{ unicodeBidi: 'isolate' }}>{`W${1 + (idSeed(t.id) % 4)}`}</span>}</div>
                </div>
                <button onClick={() => setCheckedIn(p => ({ ...p, [ai]: !p[ai] }))} style={{ ...baseBtn, background: inFloor ? C.gn : 'transparent', color: inFloor ? '#FFF' : C.tm, border: `1px solid ${inFloor ? C.gn : C.bd}`, padding: '0 10px', fontSize: 10 }}>{T(inFloor ? '✓ IN' : 'CHECK IN')}</button>
              </div>
              <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {DEMO_SESSION_DAY.map(ex => {
                  const k = `${ai}:${ex.id}`;
                  // Different athletes are at different points in the same
                  // session, and nobody has lifted anything before checking in.
                  const pace = [ex.sets.length, Math.max(0, ex.sets.length - 2), 1][ai] ?? 0;
                  return <DemoSessionExercise key={ex.id} ex={ex} open={!!open[k]} doneUpTo={inFloor ? pace : 0} onToggle={() => setOpen(p => ({ ...p, [k]: !p[k] }))} />;
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
          <button onClick={() => setActive(null)} style={{ background: 'none', border: 'none', color: C.ac, cursor: 'pointer', fontFamily: FN, fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', padding: 0, marginBottom: 8 }}>← {tr(readLang(), 'BACK')}</button>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontFamily: FN, color: C.tm, marginBottom: 4 }}>
            <span>{active.day} · {active.name}</span>
            <span style={{ color: C.tx, fontWeight: 700 }} dir="ltr"><span style={{ unicodeBidi: 'isolate' }}>{`W${active.week || DEMO_WEEK}`}</span> · {doneSets}/{totalSets} · {pct}%</span>
          </div>
          <div style={{ background: C.sf, border: `1px solid ${C.cardBd}`, height: 6, overflow: 'hidden' }}><div style={{ background: C.gn, height: '100%', width: `${pct}%` }} /></div>
        </div>
        {/* (Camera/movement tools live under Review › Tools in the real app, not
            inside the 1-on-1 logger — removed here to match.) */}
        {DEMO_SESSION_DAY.map(ex => (
          <div key={ex.id} style={{ background: C.sf, border: `1px solid ${ex.sets.every(s => s.done) && ex.sets.length ? C.gn : C.cardBd}`, marginBottom: 10, padding: 4 }}>
            <DemoSessionExercise ex={ex} open={!!openEx[ex.id]} onToggle={() => setOpenEx(p => ({ ...p, [ex.id]: !p[ex.id] }))} />
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
          <button style={{ ...baseBtn, background: C.gn, color: '#06251a', padding: '0 48px', fontSize: 14, fontWeight: 700 }}>{tr(readLang(), 'Complete Workout')}</button>
        </div>
      </div>
    );
  }
  return (
    <div>
      <h3 style={{ fontFamily: FN, fontSize: 12, color: C.td, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 12px', fontWeight: 600 }}>{T('Start a Session')}</h3>
      <div style={{ display: 'flex', flexDirection: 'column', border: `1px solid ${C.cardBd}` }}>
        {/* slice(0, 6) offered מאיה, who is On Hold with zero sessions left,
            and left out עומר, who is active and trained today. You cannot
            start a session with someone frozen and out of sessions. The list
            is whoever you actually could start one with. */}
        {MOCK_TRAINEES.filter(t => (t.status === 'Active' || t.status === 'Trial') && t.sessionsLeft > 0).map((t, i) => {
          const isOpen = openAthlete === t.id;
          const dayNames = (MOCK_PLAN_INDEX.find(p => p.traineeId === t.id)?.dayNames) || ['Day A', 'Day B', 'Day C'];
          return (
            <div key={t.id} style={{ borderTop: i === 0 ? 'none' : `1px solid ${C.cardBd}` }}>
              <button onClick={() => setOpenAthlete(isOpen ? null : t.id)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: isOpen ? C.sf : 'transparent', border: 'none', cursor: 'pointer', minHeight: CTRL_H, boxSizing: 'border-box', padding: '0 14px', textAlign: 'start' }}>
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <span style={{ fontFamily: isHeb(t.name) ? FH : FB, fontSize: 14, fontWeight: 600, color: C.tx }}>{t.name}</span>
                  {/* every row said BLOCK #4; each athlete has their own */}
                  <span style={{ fontFamily: FN, fontSize: 11, color: C.tm }} dir="ltr">{((t.plans && t.plans[0]) || '').split(' — ')[0] || 'BLOCK #1'}</span>
                </span>
                <span style={{ fontFamily: FN, fontSize: 12, color: 'var(--c-tx)', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>▾</span>
              </button>
              {isOpen && (
                <div style={{ padding: '0 14px 14px' }}>
                  {/* EVERY ATHLETE OPENED ON W4 / DAY A. Ohad, 24.9: "every single
                      person should have a different day and week that it
                      auto-selects". Week and day now come from the athlete —
                      seeded off their id so they are stable across reloads and
                      differ from row to row. The W pills were bordered spans
                      20px tall beside 36px buttons; they are controls and now
                      stand at the one control height. */}
                  {(() => {
                    const seed = idSeed(t.id);
                    const autoWeek = 1 + (seed % 4);
                    const autoDay = seed % dayNames.length;
                    return (<>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
                        <span style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', color: C.tm, marginInlineEnd: 2 }}>{T('LOG INTO')}</span>
                        {[1, 2, 3, 4].map(wn => <span key={wn} dir="ltr" style={{ minWidth: 40, minHeight: CTRL_H, boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 8px', border: `1px solid ${wn === autoWeek ? C.ac : C.bd}`, background: wn === autoWeek ? 'rgba(57,189,255,0.1)' : 'transparent', color: wn === autoWeek ? C.ac : C.tm, fontFamily: FN, fontSize: 10, fontWeight: 700, lineHeight: 1 }}>W{wn}</span>)}
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {dayNames.map((dn, di) => (
                          <button key={di} onClick={() => setActive({ name: t.name, day: dn, week: autoWeek })} style={{ ...baseBtn, background: di === autoDay ? 'rgba(57,189,255,0.1)' : 'transparent', color: di === autoDay ? C.ac : C.tm, border: `1px solid ${di === autoDay ? C.ac : C.bd}`, padding: '0 12px', fontSize: 12 }}>▶ {dn}</button>
                        ))}
                      </div>
                    </>);
                  })()}
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
  const pill = (active) => ({ ...baseBtn, background: active ? C.acD : 'transparent', color: active ? C.ac : C.tm, border: `1px solid ${active ? C.ac : C.bd}`, padding: '0 18px', fontSize: 12, letterSpacing: 1.5 });
  return (
    <section>
      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        <button onClick={() => setMode('group')} style={pill(mode === 'group')}>{T('GROUP FLOOR')}</button>
        <button onClick={() => setMode('single')} style={pill(mode === 'single')}>{T('1-ON-1')}</button>
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
  { key: 'metrics', label: 'LIFT METRICS', measures: 'Bar speed (VBT) + per-goal stop-set cutoff · ROM/tempo/collapse · L/R symmetry', live: false },
  { key: 'jump', label: 'JUMP TEST', measures: 'Jump height from flight time · estimated peak power', live: false },
  { key: 'live', label: 'LIVE COACH', measures: 'Real-time reps + depth target + bar-path drift on the live feed', live: true },
  // Basketball. Parity with ReviewToolsView's registry — the demo listed four
  // tools while the real launcher shipped five (parity rule, 08-24).
  // SHOT ANALYZER removed from the demo, 24.9. Ohad: "take the shot analysis
  // off the sales site (it's for me only right now); it shouldn't be in the
  // demo either." It stays in the real app behind the owner seat.
];
function DemoReviewTools() {
  const [title, setTitle] = useState('Back Squat');
  const [note, setNote] = useState(false);
  const [hover, setHover] = useState(null);
  return (
    <div>
      <div style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, color: C.tm, textTransform: 'uppercase', letterSpacing: '0.2em', marginBottom: 8 }}>{T('REVIEW · TOOLS')}</div>
      <h2 style={{ fontFamily: FB, fontSize: 24, fontWeight: 800, letterSpacing: '-0.01em', color: C.tx, margin: '0 0 8px' }}>{T('Measure the lift')}</h2>
      <div style={{ color: C.tm, fontSize: 13, marginBottom: 20, fontFamily: FB, maxWidth: 560, lineHeight: 1.5 }}>
        {/* A dotted key returns ITSELF from tr() when there is no entry, so an
            English visitor would have read the literal string "tools.blurb".
            Every dotted key in this codebase needs its English side written out. */}
        {readLang() === 'he'
          ? T('tools.blurb')
          : 'Camera and pose tools that read a set — bar speed, range of motion, jump power, jump-shot mechanics, live coaching. Nothing is saved in the demo.'}
      </div>
      <div style={{ marginBottom: 20, maxWidth: 380 }}>
        <label style={{ display: 'block', fontFamily: FN, fontSize: 9, color: C.td, letterSpacing: '0.16em', fontWeight: 700, marginBottom: 7, textTransform: 'uppercase' }}>{T('Exercise · for Lab / Metrics / Live')}</label>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder={T('e.g. Back Squat')} style={{ width: '100%', boxSizing: 'border-box', background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, color: C.tx, fontFamily: FB, fontSize: 14, padding: '11px 13px', borderRadius: 0, outline: 'none' }} />
      </div>
      <div style={{ borderBottom: `1px solid ${C.cardBd}` }}>
        {DEMO_REVIEW_TOOLS.map(t => {
          const active = hover === t.key;
          return (
            <div key={t.key} role="button" tabIndex={0} onClick={() => setNote(true)} onMouseEnter={() => setHover(t.key)} onMouseLeave={() => setHover(null)}
              style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 12px', borderTop: `1px solid ${C.cardBd}`, cursor: 'pointer', background: active ? 'rgba(57,189,255,0.05)' : 'transparent', transition: 'background .15s' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: FN, fontSize: 14, fontWeight: 700, letterSpacing: '0.03em', color: C.tx }}>{T(t.label)}</div>
                <div style={{ fontFamily: FB, fontSize: 12, color: C.tm, marginTop: 3, lineHeight: 1.4 }}>{T(t.measures)}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, fontFamily: FN, fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', color: t.live ? '#FF7A7A' : C.tm, border: 'none', padding: '2px 6px', whiteSpace: 'nowrap' }}>{tr(readLang(), t.live ? 'LIVE' : 'CLIP')}</span>
                <span style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: C.ac, transform: active ? 'translateX(3px)' : 'none', transition: 'transform .15s', whiteSpace: 'nowrap' }}>{T('OPEN →')}</span>
              </div>
            </div>
          );
        })}
      </div>
      {note && (
        <div style={{ marginTop: 16, background: C.acD, border: `1px solid ${C.ac}`, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <span style={{ fontFamily: FB, fontSize: 13, color: C.tx }}>{T('The camera + pose tools run live in the full app — disabled in this demo. Join the waitlist to use them on your own clips.')}</span>
          <button onClick={() => setNote(false)} style={{ ...baseBtn, background: 'transparent', color: C.tm, border: `1px solid ${C.bd}`, padding: '0 12px', fontSize: 10, flexShrink: 0 }}>{T('DISMISS')}</button>
        </div>
      )}
    </div>
  );
}

// A task's visible line. Rows that name an athlete carry a roster id and a
// template key instead of a baked English sentence, so the name is spelled the
// way the roster spells it and the NUMBER is the roster's number.
const TASK_LINE = {
  deload:      { en: (n) => `${n} — deload week, cut volume 30%`,             he: (n) => `${n} — שבוע דילואד, תוריד נפח ב-30%` },
  checkInjury: { en: (n, t) => `${n} — check the ${t} after the last session`, he: (n, t) => `${n} — תבדוק את ${t} אחרי האימון האחרון` },
  dormant:     { en: (n, d) => `${n} — no workout logged in ${d} days`,       he: (n, d) => `${n} — לא נרשם אימון כבר ${d} ימים` },
  overdue:     { en: (n, d) => `${n} — payment overdue ${d} days`,            he: (n, d) => `${n} — תשלום באיחור של ${d} ימים` },
};
// The roster stores the clinical note in English and it is not translated
// anywhere else, so the body part gets its own pair rather than a T() lookup.
const INJURY_WORD = { en: { t2: 'right shoulder' }, he: { t2: 'הכתף הימנית' } };
function taskTitle(t) {
  if (!t.titleKey) return T(t.title);
  const lang = readLang() === 'he' ? 'he' : 'en';
  const subject = MOCK_TRAINEES.find((x) => x.id === t.who_);
  const name = subject ? subject.name : '';
  const fn = TASK_LINE[t.titleKey][lang];
  if (t.titleKey === 'checkInjury') return fn(name, (INJURY_WORD[lang] || {})[t.who_] || '');
  if (t.titleKey === 'dormant') return fn(name, subject?.dormantDays || 0);
  if (t.titleKey === 'overdue') return fn(name, subject?.overdueDays || 0);
  return fn(name);
}

// ── TASKS — mirrors src/TasksV8View.jsx. Owner tabs + source-grouped board +
// status pills + GCal embed + composer. Static mock, no writes. ──────────────
const DEMO_TASKS = [
  { id: 1, src: 'center', title: 'Renew gym insurance policy', due: 'Today', status: 'working', who: 'OHAD' },
  { id: 2, src: 'center', title: 'Order bumper plates (20kg × 4)', due: 'Tomorrow', status: 'open', who: 'OHAD' },
  // Athlete names come off the ROSTER, in the roster's spelling. These rows
  // said "Noa — …" and "Gal — …" in Latin on a board whose every other person
  // is נועה לוי and גל מזרחי two tabs away — and row 4 told the coach to
  // check גל's KNEE when his record says right shoulder impingement.
  { id: 3, src: 'athlete', who_: 't1', titleKey: 'deload', due: 'Today', status: 'open', who: 'OHAD' },
  { id: 4, src: 'athlete', who_: 't2', titleKey: 'checkInjury', due: 'OVERDUE · YESTERDAY', status: 'waiting', who: 'YUVAL' },
  { id: 5, src: 'manual', title: 'Film 3 exercise demos for the library', due: 'This week', status: 'open', who: 'SHARED' },
  // Was 'Amit — …' and 'Roey — …': two of Ohad's REAL athletes, on a board
  // where every other person is an invented Hebrew name — and one of them
  // labelled as not paying. Swapped to the demo roster (t8 and t2).
  // The two AUTO rows are what the rules engine would actually have produced,
  // so they are computed from the roster instead of typed. They used to say
  // "Omer — no workout logged in 6 days" (עומר trained TODAY and is online)
  // and "Gal — payment overdue 12 days" (his own card says 21).
  { id: 6, src: 'auto', who_: 't5', titleKey: 'dormant', due: 'Auto', status: 'open', who: 'OHAD' },
  { id: 7, src: 'auto', who_: 't2', titleKey: 'overdue', due: 'Auto', status: 'stuck', who: 'OHAD' },
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
  const rail = useNarrowRail();
  // THE BOARD OPENED ON ONE OWNER AND THE TAB BADGE COUNTED ALL EIGHT.
  // Photographed at 390: the nav says 8, the board shows 5, and two of its
  // five columns stand empty with a dash in them - because the Whose rail
  // defaulted to OHAD and had no "All" option at all, so nothing could ever
  // fill them. A prospect reads an empty column as a feature that does not work.
  const [owner, setOwner] = useState('ALL');
  const [view, setView] = useState('board');
  const [quickFilter, setQuickFilter] = useState('all');
  const [sortBy, setSortBy] = useState('soonest');
  const [boardGroup, setBoardGroup] = useState('status');
  // THE RAIL HAS TO ACTUALLY FILTER.
  //
  // quickFilter, sortBy and boardGroup were written and never read, and the
  // search box was a controlled input fed search="" with a no-op onSearch — so
  // it swallowed every keystroke. Fourteen controls that highlight when you
  // press them and change nothing, on a screen a prospect WILL poke at. Found
  // auditing for his first client demo, 22.9.
  const [search, setSearch] = useState('');
  const DUE_RANK = { Today: 0, Auto: 1 };
  const visible = React.useMemo(() => {
    let rows = DEMO_TASKS.filter(t => owner === 'ALL' ? true : (t.who === owner || (owner === 'SHARED' && t.who === 'SHARED')));
    const q = search.trim().toLowerCase();
    if (q) rows = rows.filter(t => (taskTitle(t) + ' ' + t.due + ' ' + t.who).toLowerCase().includes(q));
    if (quickFilter === 'today')   rows = rows.filter(t => /today/i.test(t.due));
    if (quickFilter === 'overdue') rows = rows.filter(t => t.status === 'stuck' || t.titleKey === 'overdue' || /overdue/i.test(t.title || ''));
    if (quickFilter === 'stuck')   rows = rows.filter(t => t.status === 'stuck');
    if (quickFilter === 'nodate')  rows = rows.filter(t => !t.due || t.due === 'Auto');
    const rank = (t) => (DUE_RANK[t.due] != null ? DUE_RANK[t.due] : 2);
    if (sortBy === 'soonest') rows = [...rows].sort((a, b) => rank(a) - rank(b));
    if (sortBy === 'newest')  rows = [...rows].sort((a, b) => b.id - a.id);
    if (sortBy === 'urgency') rows = [...rows].sort((a, b) => (a.status === 'stuck' ? -1 : 0) - (b.status === 'stuck' ? -1 : 0));
    if (sortBy === 'status')  rows = [...rows].sort((a, b) => a.status.localeCompare(b.status));
    if (sortBy === 'az')      rows = [...rows].sort((a, b) => T(a.title).localeCompare(T(b.title)));
    // 'manual' is the order they were entered in — no sort, honestly.
    return rows;
  }, [owner, search, quickFilter, sortBy]);
  const counts = { ALL: DEMO_TASKS.length, OHAD: DEMO_TASKS.filter(t => t.who === 'OHAD').length, YUVAL: DEMO_TASKS.filter(t => t.who === 'YUVAL').length, SHARED: DEMO_TASKS.filter(t => t.who === 'SHARED').length };
  const bySrc = (s) => visible.filter(t => t.src === s);
  return (
    <section>
      {/* Header — TASKS title + List/Board segmented toggle (mirrors TasksV8View). */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontFamily: FN, fontSize: 13, fontWeight: 700, letterSpacing: '0.18em', color: C.tx, textTransform: 'uppercase' }}>{T('Tasks')}</h2>
        <div style={{ display: 'inline-flex', border: `1px solid ${C.bd}` }}>
          {['list', 'board'].map(v => <button key={v} onClick={() => setView(v)} style={{ ...baseBtn, background: view === v ? C.ac : 'transparent', color: view === v ? '#0E0F12' : C.tm, border: 'none', padding: '0 20px', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{T(v === 'list' ? 'List' : 'Board')}</button>)}
        </div>
      </div>
      {/* Two-column: the shared SideRail (identical to the real Tasks rail) + content. */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <SideRail className="cd-rail" narrow={rail.narrow} railOpen={rail.railOpen} setRailOpen={rail.setRailOpen} width={204} top={64} maxHeight="calc(100vh - 76px)"
          search={search} onSearch={setSearch} searchPlaceholder={T('Search tasks…')}
          groups={[
            { label: T('Whose'), opts: ['ALL', 'OHAD', 'YUVAL', 'SHARED'].map(o => ({ key: o, label: o === 'ALL' ? T('All') : T(o.charAt(0) + o.slice(1).toLowerCase()), count: counts[o], active: owner === o, onClick: () => setOwner(o) })) },
            { label: T('Show'), opts: [['all', 'All'], ['today', 'Today'], ['overdue', 'Overdue'], ['stuck', 'Stuck'], ['nodate', 'No date']].map(([k, l]) => ({ key: k, label: T(l), active: quickFilter === k, onClick: () => setQuickFilter(k) })) },
            { label: T('Sort'), opts: [['soonest', '↓ Soonest'], ['newest', 'Newest'], ['urgency', 'Urgency'], ['status', 'Status'], ['az', 'A→Z'], ['manual', 'Manual']].map(([k, l]) => ({ key: k, label: l.startsWith('↓ ') ? `↓ ${T(l.slice(2))}` : T(l), active: sortBy === k, onClick: () => setSortBy(k) })) },
            { label: T('Group by'), opts: [['status', 'By status'], ['category', 'By category']].map(([k, l]) => ({ key: k, label: T(l), active: boardGroup === k, onClick: () => setBoardGroup(k) })) },
          ]}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
      {/* Composer (collapsed affordance) */}
      {/* An input in all but tag, and 57px tall beside 36px controls. */}
      <div style={{ ...demoCardStyle({ marginBottom: 16, cursor: 'text', display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', minHeight: CTRL_H, boxSizing: 'border-box' }) }}>
        <span style={{ color: C.ac, fontSize: 16, fontWeight: 700 }}>+</span>
        <span style={{ fontFamily: FB, fontSize: 13, color: C.tm }}>{T('Add a task…')}</span>
      </div>
      {/* BOARD = status kanban (mirrors the real board); LIST = source-grouped */}
      {view === 'board' ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-start' }}>
          {(boardGroup === 'category'
            ? [{ id: 'auto', label: 'AUTO-ALERTS', color: '#2C82C9' }, { id: 'manual', label: 'MANUAL', color: '#5B6B7A' }]
            : STATUS_COLS
          ).map(col => {
            const rows = visible.filter(t => (boardGroup === 'category' ? t.src : t.status) === col.id);
            return (
              <div key={col.id} style={{ flex: '1 1 175px', minWidth: 175, border: `1px solid ${C.bd}`, display: 'flex', flexDirection: 'column' }}>
                <div style={{ background: 'var(--c-sf2)', color: C.tx, padding: '7px 10px', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${C.cardBd}`, boxShadow: `inset 3px 0 0 ${col.color}` }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><span aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', background: col.color, flexShrink: 0 }} />{T(col.label)}</span><span style={{ color: C.tm }}>{rows.length}</span>
                </div>
                <div style={{ padding: 6, display: 'flex', flexDirection: 'column', gap: 6, minHeight: 46 }}>
                  {rows.map(t => {
                    const meta = TASK_SRC[t.src];
                    const overdue = /OVERDUE/i.test(t.due);
                    return (
                      <div key={t.id} style={demoCardStyle({ border: `1px solid ${meta.color}`, padding: 9, display: 'flex', flexDirection: 'column', gap: 5, justifyContent: 'center', minHeight: CTRL_H, boxSizing: 'border-box' })}>
                        <span style={{ fontFamily: FB, fontSize: 12, color: C.tx, lineHeight: 1.3 }}>{taskTitle(t)}</span>
                        <span style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.04em', color: overdue ? C.tx : C.tm, border: 'none', padding: 0, alignSelf: 'flex-start' }}>{T(t.due)}</span>
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
                <span style={{ width: 8, height: 8, background: meta.color, display: 'inline-block' }} />{T(meta.label)} <span style={{ color: C.td }}>{rows.length}</span>
              </div>
              {rows.map(t => {
                const col = STATUS_COLS.find(c => c.id === t.status) || STATUS_COLS[0];
                const overdue = /OVERDUE/i.test(t.due);
                return (
                  <div key={t.id} style={demoCardStyle({ marginBottom: 6, border: `1px solid ${meta.color}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 12 })}>
                    <span style={{ fontFamily: FB, fontSize: 13, color: C.tx, textDecoration: t.status === 'done' ? 'line-through' : 'none', opacity: t.status === 'done' ? 0.6 : 1 }}>{taskTitle(t)}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                      <span style={{ fontFamily: FN, fontSize: 10, color: overdue ? C.tx : C.tm }}>{T(t.due)}</span>
                      <span style={{ fontFamily: FN, fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', color: '#FFFFFF', background: col.color, padding: '3px 7px' }}>{T(col.label)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })
      )}
        </div>{/* /right column */}
      </div>{/* /two-column layout */}
    </section>
  );
}

// ── BILLING — mirrors src/BillingView.jsx (bit_payment_requests ledger).
// Static mock, no writes. VAT removed from billing (Ohad: "vat is useless"). ──
// Names + statuses mirror the roster (MOCK_TRAINEES): Hebrew names like the
// rest of the demo (was Latin — the same people appeared in two scripts across
// tabs), and each row's status matches that athlete's payment state (Noa PAID,
// Gal OVERDUE→pending, the Yael+Idan couple PAID, split 600+600 = their ₪1,200).
//
// DERIVED FROM THE ROSTER, not typed out beside it. The hand-written version
// held four rows against a roster of eight, so Billing's OUTSTANDING tile read
// ₪800 / 1 client while the dashboard next door read ₪2,300 / 3 clients off
// the same people. It also billed עידן and יעל as two athletes when the roster
// carries them as one couple — that split stays, because the couple really is
// invoiced twice, but the 600+600 now comes from their 1,200.
const DEMO_PAYMENTS = (() => {
  const rows = [];
  let id = 0;
  for (const t of MOCK_TRAINEES) {
    if (!t.monthly) continue;                       // a trial is not billable
    const pending = t.payment !== 'PAID';
    const days = pending ? (t.overdueDays || 0) : (t.paidDaysAgo || 0);
    const base = {
      status: pending ? 'pending' : 'paid',
      date: dAgo(days),
      overdueDays: pending ? days : 0,
      ref: t.isCouple ? 'Monthly coaching (couple)' : planCount(t) > 2 ? 'Monthly coaching + plan' : 'Monthly coaching',   // through T() at the render site
    };
    if (t.isCouple) {
      // One couple, two invoices — which is how he actually bills them.
      const half = Math.round(t.monthly / 2);
      rows.push({ ...base, id: ++id, name: 'יעל כהן', amount: half });
      rows.push({ ...base, id: ++id, name: 'עידן כהן', amount: t.monthly - half });
    } else {
      rows.push({ ...base, id: ++id, name: t.name, amount: t.monthly });
    }
  }
  return rows;
})();
// The library reference clip the review panel plays. A real short from the
// exercise library — the same one demoTraineeData carries for this lift —
// so the screen shows a video that genuinely exists in the product.
const DEMO_REFERENCE_CLIP = 'bvaCXyXeBvU';

const PAY_STATUS = { pending: { label: 'PENDING', color: C.or }, paid: { label: 'PAID', color: C.gn }, canceled: { label: 'CANCELED', color: C.td }, trial: { label: 'TRIAL', color: C.td } };
const fmtIls = (n) => `₪${Number(n).toLocaleString()}`;
function DemoBilling() {
  // CHASE and MARK PAID were inert — no onClick at all — on the screen the run
  // sheet calls his strongest, where he invites the buyer to add the column up.
  // A control that looks live and does nothing is the exact thing he objected
  // to ("this type of shit shouldnt happen anywhere"), and a dead button
  // clicked in front of a buyer is worse here than anywhere else in the demo.
  // The demo has no backend, so they say what the real one would do — the same
  // explainer pattern Review → Tools already uses. Deliberately NOT changing
  // the amounts: the reconciliation he walks the buyer through has to hold
  // still while he is talking over it.
  const [acted, setActed] = useState({});
  // THE PAYMENT ROW HAS TO WRAP ON A PHONE.
  //
  // Photographed at 390 for the client demo (22.9): the actions block is
  // flexShrink:0 and holds four things — the overdue badge, the status pill,
  // the WhatsApp button and MARK PAID — so it kept its full width and squeezed
  // the name/reference block to almost nothing. The row came out as
  // "JUNE / + / 21D OVERDUE / PENDING / PLAN / · / 15TH / OF / JUNE / 2026",
  // one word per line, with the athlete's name broken mid-name above it. That
  // is the phone fault he called "unusable" in August, on the screen he plans
  // to show a client.
  const { narrow } = useNarrowRail();
  const [showReq, setShowReq] = useState(false);
  const [amount, setAmount] = useState('600');
  const pending = DEMO_PAYMENTS.filter(p => p.status === 'pending');
  const panel = (children) => <div style={{ background: C.sf, border: `1px solid ${C.cardBd}`, marginBottom: 16 }}>{children}</div>;
  const stripH = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: `1px solid ${C.cardBd}` };
  const outstanding = pending.reduce((s, p) => s + p.amount, 0);
  const collected = DEMO_PAYMENTS.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0);
  // OUTSTANDING and OVERDUE printed the identical figure side by side, which
  // reads as a bug even when it is arithmetically true. Overdue is the ≥14-day
  // subset, so the two tiles now answer two different questions.
  const lateRows = pending.filter(p => (p.overdueDays || 0) >= 14);
  const lateAmt = lateRows.reduce((s, p) => s + p.amount, 0);
  const sumTile = (label, value, sub, accent) => (
    <div style={{ background: C.sf, border: `1px solid ${C.cardBd}`, borderRadius: 0 }}>
      {/* As the real billing tile (BillingView): the title on the body's edge,
          the status dot at the strip's far end, one 41px strip, 18px sides. */}
      <div style={{ background: 'color-mix(in srgb, var(--c-stripBg, var(--c-sf)) 90%, var(--c-ac))', borderBottom: `1px solid ${C.cardBd}`, padding: '0 18px', minHeight: 41, boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 7 }}>
        <span style={{ fontFamily: FN, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--c-stripTx)', textTransform: 'uppercase' }}>{T(label)}</span>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: accent, boxShadow: `0 0 5px ${accent}66`, flexShrink: 0 }} />
      </div>
      <div style={{ padding: '14px 18px' }}>
        {/* Same rule as StatCard: direction:ltr isolates the NUMERAL, it does
            not get to decide which side of the card the number sits on. */}
        <div style={{ fontFamily: FN, fontSize: 26, fontWeight: 800, color: C.tx, letterSpacing: '-0.015em', textAlign: 'start' }}>
          <span style={{ direction: 'ltr', unicodeBidi: 'isolate', display: 'inline-block' }}>{value}</span>
        </div>
        <div style={{ fontFamily: FN, fontSize: 10, color: C.td, marginTop: 4, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{sub}</div>
      </div>
    </div>
  );
  return (
    <section>
      {/* At-a-glance summary tiles — mirrors the real BillingView redesign
          (Outstanding / Overdue / Collected this month). */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
        {sumTile('Outstanding', fmtIls(outstanding), `${pending.length} ${T('pending')}`, C.or)}
        {sumTile('Overdue', fmtIls(lateAmt), readLang() === 'he' ? `${lateRows.length} · מעל 14 יום` : `${lateRows.length} · ≥ 14d`, C.rd)}
        {sumTile('Collected MTD', fmtIls(collected), T('received'), C.gn)}
      </div>
      {panel(<>
        <div style={stripH}>
          <span style={{ fontFamily: FN, fontSize: 13, fontWeight: 700, letterSpacing: '0.04em', color: C.ac }}>{T('PAYMENT REQUESTS')}{pending.length > 0 && <span style={{ color: C.or }}>{' · '}{readLang() === 'he' ? (pending.length === 1 ? 'אחת ממתינה' : `${pending.length} ממתינות`) : `${pending.length} ${T('PENDING')}`}</span>}</span>
          <button onClick={() => setShowReq(true)} style={{ ...baseBtn, background: 'transparent', color: C.ac, border: `1px solid ${C.ac}`, minHeight: CTRL_H, boxSizing: 'border-box', padding: '0 12px', fontSize: 10 }}>+ {tr(readLang(), 'NEW REQUEST')}</button>
        </div>
        <div>
          {DEMO_PAYMENTS.map(p => {
            const st = PAY_STATUS[p.status];
            return (
              <div key={p.id} style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: narrow ? 'flex-start' : 'center', gap: narrow ? 8 : 12, rowGap: 8, padding: '12px 14px', borderTop: `1px solid ${C.cardBd}`, borderInlineStart: p.status === 'pending' ? `3px solid ${C.rd}` : '3px solid transparent' }}>
                <div style={{ minWidth: 0, flex: narrow ? '1 1 100%' : '1 1 auto' }}>
                  <div style={{ fontFamily: FB, fontSize: 13, fontWeight: 600, color: p.status === 'pending' ? C.rd : C.tx }}>{p.name} · {fmtIls(p.amount)}</div>
                  <div style={{ fontFamily: FB, fontSize: 11, color: C.tm, marginTop: 2 }}>{T(p.ref)} · {fmtPrettyDate(p.date)}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
                  {p.status === 'pending' && <span style={{ fontFamily: FN, fontSize: 8, fontWeight: 700, letterSpacing: '0.08em', color: C.rd }}>{readLang() === 'he' ? `באיחור של ${p.overdueDays} ימים` : `${p.overdueDays}D OVERDUE`}</span>}
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, fontFamily: FN, fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', color: st.color, border: 'none', padding: '2px 0' }}>{T(st.label)}</span>
                  {p.status === 'pending' && <button onClick={() => setActed(m => ({ ...m, [p.id || p.name]: 'chase' }))} style={{ ...baseBtn, background: 'transparent', color: '#25D366', border: '1px solid rgba(37,211,102,0.45)', padding: '0 8px', fontSize: 9 }}>◔ {tr(readLang(), 'CHASE')}</button>}
                  {p.status === 'pending' && <button onClick={() => setActed(m => ({ ...m, [p.id || p.name]: 'paid' }))} style={{ ...baseBtn, background: 'transparent', color: C.gn, border: '1px solid rgba(46,213,115,0.45)', padding: '0 8px', fontSize: 9 }}>{T('MARK PAID')}</button>}
                </div>
                {/* The row already wraps, so the explainer takes its own full
                    width line under the buttons rather than squeezing them. */}
                {acted[p.id || p.name] && (
                  <div style={{ flex: '1 1 100%', fontFamily: FB, fontSize: 11, color: C.ac, borderTop: `1px solid ${C.cardBd}`, paddingTop: 8 }}>
                    {acted[p.id || p.name] === 'chase'
                      ? T('Demo only — in the full app this sends a WhatsApp reminder with a payment link.')
                      : T('Demo only — in the full app this marks the request paid and updates the ledger.')}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </>)}
      {panel(<>
        <div style={stripH}><span style={{ fontFamily: FN, fontSize: 13, fontWeight: 700, letterSpacing: '0.04em', color: C.ac }}>{T('ROSTER STATUS')}</span></div>
        <div>
          {/* ALL of them. It showed the first five of eight under a heading
              that says ROSTER STATUS, so three paying athletes were simply
              missing from the only panel that claims to list the roster. */}
          {MOCK_TRAINEES.map((t) => {
            // READ THE ROSTER, do not hard-code by row index. This array said
            // דניאל = PENDING while his own card said PAID, and מאיה = PAID while she
            // is OVERDUE everywhere else. A coach comparing two tabs in a demo
            // spots that immediately, and it makes the whole product look like
            // it cannot agree with itself.
            // איתי is on a trial with no monthly fee, and the panel called him
            // PENDING — pending on an invoice that does not exist. Three states.
            const st = PAY_STATUS[t.payment === 'PAID' ? 'paid' : (!t.monthly ? 'trial' : 'pending')];
            return (
              <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderTop: `1px solid ${C.cardBd}` }}>
                <span style={{ fontFamily: FB, fontSize: 13, color: C.tx }}>{t.name}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, fontFamily: FN, fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', color: st.color, border: 'none', padding: '2px 0' }}>{T(st.label)}</span>
              </div>
            );
          })}
        </div>
      </>)}
      {showReq && createPortal((
        <div onClick={() => setShowReq(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.bg, border: `1px solid ${C.cardBd}`, padding: 24, maxWidth: 380, width: '100%' }}>
            <div style={{ fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: '0.18em', fontWeight: 700, marginBottom: 14, textAlign: 'center' }}>{T('NEW PAYMENT REQUEST')}</div>
            <select style={{ width: '100%', background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, color: C.tx, fontFamily: FB, fontSize: 14, padding: '11px 13px', marginBottom: 10, outline: 'none' }}>
              {MOCK_TRAINEES.map(t => <option key={t.id}>{t.name}</option>)}
            </select>
            <div style={{ marginBottom: 14 }}>
              <input value={amount} onChange={e => setAmount(e.target.value)} type="number" placeholder={T('Amount (₪)')} style={{ width: '100%', boxSizing: 'border-box', background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, color: C.tx, fontFamily: FB, fontSize: 14, padding: '11px 13px', outline: 'none' }} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowReq(false)} style={{ ...baseBtn, flex: 1, background: 'transparent', color: C.tm, border: `1px solid ${C.cardBd}`, padding: '0', fontSize: 11 }}>{T('CANCEL')}</button>
              <button onClick={() => setShowReq(false)} style={{ ...baseBtn, flex: 1, background: 'transparent', color: C.ac, border: `1px solid ${C.ac}`, padding: '0', fontSize: 11 }}>{T('CREATE')}</button>
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
// Deep links still resolve for the grouped sub-tabs even though they are no
// longer top-level buttons.
const TAB_KEYS = [...TABS.map(t => t.key), ...ATHLETE_GROUP];
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
  const [programsReset, setProgramsReset] = useState(0);
  const navigateToTab = (key) => {
    setTab(key);
    setSelectedTrainee(null);
    // Clearing selectedTrainee is not enough: DemoPrograms holds its own
    // selection and stays mounted when the tab does not actually change.
    setProgramsReset((n) => n + 1);
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
    // while the live coach app's light-mode rollout is gated. dir follows the
    // language like the real app's .app-root - Hebrew text in a left-to-right
    // layout was the demo's state until 17.9.
    <div data-theme="dark" dir={readLang() === 'he' ? 'rtl' : 'ltr'} style={{
      background: C.bg, color: C.tx, minHeight: '100vh', fontFamily: FB,
      display: 'flex', flexDirection: 'column',
    }}>
      <style>{`
        @media (max-width: 760px) {
          .cd-rail { width: 100% !important; position: static !important; top: auto !important; max-height: none !important; overflow: visible !important; }
        }
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
        /* THE MENU MUST NOT HIDE HALF OF ITSELF ON A PHONE.
           Measured at 390: in Hebrew, בדיקה sat at x=-6, משימות at -88,
           תשלומים at -164 and the language switch at -217 — four of seven
           controls off the left edge. In English the same four ran off the
           right. It was a horizontal scroller, so nothing looked broken to a
           gate and everything was invisible to a person. It wraps now: the
           brand row on top, the full tab strip under it, nothing hidden. */
        /* 860, not 760: the tightened page gate caught the waitlist CTA at
           x -157..-8 on a 768 tablet — fully off-screen. The nav's own
           content is ~823px wide, so anything narrower than that plus its
           padding has to wrap. */
        /* The note is a whole sentence or nothing: at 1440 it clipped to
           "MOCK DATA —" beside the nav. */
        @media (max-width: 1559px) { .cd-pov-note { display: none !important; } }
        @media (max-width: 860px) {
          .cd-hdr { flex-wrap: wrap !important; height: auto !important; overflow-x: visible !important; padding-top: 8px !important; padding-bottom: 8px !important; row-gap: 8px !important; }
          /* A GRID, NOT A RAGGED WRAP. Letting it wrap put five tabs on one
             row and תשלומים dangling alone on a second — measurably visible
             and still ugly. Two tidy rows of three read as a designed menu.
             1 1 100% with min-width 0, because with shrink 0 the strip kept
             its content width (426px in Hebrew, 541 in English) and simply
             hung off the edge again. */
          .cd-hdr > nav { order: 3; flex: 1 1 100% !important; min-width: 0 !important; max-width: 100% !important; display: grid !important; grid-template-columns: repeat(3, 1fr) !important; gap: 6px !important; overflow-x: visible !important; }
          /* EVERY CELL GETS A BOUNDARY. With only the active tab boxed, the
             other five were bare words floating in a dark field with
             invisible gaps between them — six labels that read as a jumble
             rather than as a menu. A hairline on each turns the grid into a
             segmented control you can see the shape of, and one height means
             the two rows line up instead of sizing themselves to their text. */
          .cd-hdr > nav > * {
            width: 100% !important; justify-content: center !important;
            border: 1px solid var(--c-cardBd) !important;
            min-height: 36px !important;   /* the one control height, not a second one */
          }
          .cd-hdr > nav > [aria-selected="true"] { border-color: var(--c-ac) !important; }
          /* Logo first, actions after it, nav on its own row underneath —
             the same reading order as the desktop bar. */
          .cd-hdr > a:first-child { order: 0; }
          .cd-hdr > button { order: 1; }
          .cd-cta-waitlist { order: 2; margin-inline-start: auto !important; }
          /* the demo-identity cluster takes the row after the nav; the sentence
             has no room on a phone and the chip says enough */
          .cd-pov { order: 4; flex: 1 1 100% !important; margin-inline-start: 0 !important; justify-content: space-between; }
          .cd-pov-note { display: none !important; }
        }
        /* On a phone the waitlist button was wider than the EXPO logo and the
           brightest thing above the fold — a marketing CTA out-weighing both
           the brand and the product's own navigation. It stays reachable and
           stops competing. */
        @media (max-width: 560px) {
          .cd-cta-waitlist { padding: 0 10px !important; font-size: 10px !important; letter-spacing: 0.06em !important; }
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
        {/* ONE ROW, LIKE THE REAL COACH APP. The demo ran two: a 60px bar
            holding the logo, six tabs and two controls, and under it a 61px
            banner holding a chip, a sentence and a third control. At 1440 the
            bar had ~430px of nothing between the last tab and the language
            switch, and the banner repeated the same emptiness one row down.
            Ohad, three times: "the top menu is horrible". The banner's
            content now lives in the bar's middle — where the void was — and
            the bar is the real app's 56px. */}
        <div className="cd-hdr" style={{
          maxWidth: 1280, margin: '0 auto', padding: '0 16px',
          display: 'flex', alignItems: 'center', height: 56, gap: 12, overflowX: 'auto',
        }}>
          <a href="/" style={{ display: 'flex', alignItems: 'center', flex: '0 0 auto', textDecoration: 'none' }}>
            <EXPOMark theme="dark" height={36} style={{ marginBottom: 0 }} />
          </a>
          {/* The COACH DEMO chip lived here and said the same thing as the
              banner directly beneath it ("COACH VIEW · your side of the
              platform · mock data"), 40px lower and in the same cyan. Two
              chips for one fact, stealing the room the nav needed. */}
          {/* THE NAV HAS TO SIT NEXT TO THE LOGO.
              It was flex:1 with justifyContent:center, so at 1440 it centred
              itself in the leftover space and left ~700px of empty bar between
              the logo and the first tab — six 11px words adrift in the middle
              of a wide dark strip, reading as fine print rather than as the
              product's navigation. The real coach app puts the logo and the
              nav side by side at the start and pushes its actions to the far
              end; this now does the same. */}
          <nav role="tablist" aria-label={T('Coach demo tabs')} style={{
            display: 'flex', gap: 6, flex: '1 1 auto', justifyContent: 'flex-start',
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
                  // COPIED FROM THE REAL COACH NAV (App.jsx), not styled by eye:
                  // fontSize 10 / weight 700 / letterSpacing 0.06em / uppercase,
                  // padding 0 8px, label and count on one centre line, active =
                  // transparent fill with a 1px cyan border and cyan text,
                  // inactive = transparent with an invisible border so nothing
                  // shifts when the state changes. The one deliberate
                  // difference is height: the real bar runs its buttons at 32
                  // while every other control in the product is 36, and his
                  // rule is one height — so this is 36, and the real bar is
                  // being brought up to it too.
                  alignItems: 'center', lineHeight: 1,
                  background: 'transparent',
                  border: `1px solid ${tab === t.key ? C.ac : 'transparent'}`,
                  color: tab === t.key ? C.ac : C.tm,
                  padding: '0 8px', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                  whiteSpace: 'nowrap', gap: 4,
                }}>
                <span>{T(t.label)}</span>
                {t.count != null && (
                  <span style={{ fontSize: 10, color: tab === t.key ? C.ac : C.td, fontFamily: FN }}>{t.count}</span>
                )}
              </button>
            ))}
          </nav>
          {/* THE DEMO HAD NO WAY TO CHANGE LANGUAGE.
              Parity check against the signed-in coach app, 23.9: the real nav
              carries a language switch and the demo did not, so a prospect
              could not see the product in Hebrew — on the one thing Ohad
              cares most about, in front of an Israeli buyer, with no way to
              show it but to edit the URL.
              A reload rather than state: the demo reads readLang() at dozens
              of call sites instead of through a context, so flipping a state
              would leave half the screen in the old language. */}
          {/* The demo's identity, in the space the nav does not need. The
              chip is a bordered control and stands at the one control height;
              the note is the banner sentence cut to what a buyer must know. */}
          <div className="cd-pov" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginInlineStart: 'auto', flex: '0 1 auto', minWidth: 0 }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, flex: '0 0 auto',
              fontFamily: FN, fontSize: 10, color: C.ac, letterSpacing: 1.8, fontWeight: 700,
              background: C.acD, border: `1px solid ${C.cardBd}`,
              borderRadius: 0, padding: '0 9px', minHeight: CTRL_H, boxSizing: 'border-box', whiteSpace: 'nowrap',
            }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              {T('COACH VIEW')}
            </div>
            <span className="cd-pov-note" style={{ fontFamily: FB, fontSize: 12, color: C.tm, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'clip', minWidth: 0 }}>
              {T('Mock data — nothing here writes to your account.')}
            </span>
            <a href="/demo/trainee" className="cd-pov-link" style={{
              ...baseBtn, background: 'transparent', color: C.tm,
              border: `1px solid ${C.bd}`, padding: '0 12px', fontSize: 10, letterSpacing: 1.5,
              flex: '0 0 auto', minHeight: CTRL_H, boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}>{T('SEE ATHLETE VIEW →')}</a>
          </div>
          <button
            onClick={() => {
              const next = readLang() === 'he' ? 'en' : 'he';
              try { localStorage.setItem('expo-lang', next); } catch (e) { /* private mode */ }
              try { window.location.reload(); } catch (e) { /* noop */ }
            }}
            title={readLang() === 'he' ? 'Switch to English' : 'עברית'}
            // The visible label is two stacked spans for width reservation, so
            // textContent reads "ENעב". Screen readers and tests need a real name.
            aria-label={readLang() === 'he' ? 'Switch to English' : 'Switch to Hebrew'}
            style={{
              ...baseBtn, background: 'transparent', color: C.tm,
              border: `1px solid ${C.cardBd}`, padding: '0 10px', fontSize: 10,
              letterSpacing: '0.12em', flex: '0 0 auto',
            }}>
            {/* Both labels stacked so the button does not resize when it
                flips — a control that changes width on click reads as a bug. */}
            <span style={{ display: 'inline-grid', justifyItems: 'center' }}>
              <span aria-hidden="true" style={{ gridArea: '1 / 1', visibility: 'hidden' }}>{readLang() === 'he' ? 'עב' : 'EN'}</span>
              <span style={{ gridArea: '1 / 1' }}>{readLang() === 'he' ? 'EN' : 'עב'}</span>
            </span>
          </button>
          {/* Solid cyan made this the brightest object in the header — a
              marketing button shouting over the navigation of the product it
              is selling, and on a phone it was physically larger than the
              logo. Outlined: still unmistakably the call to action, no longer
              the first thing the eye lands on. */}
          <a href="/demo#waitlist" className="cd-cta-waitlist" style={{
            ...baseBtn, background: 'transparent', color: C.ac,
            border: `1px solid ${C.ac}`,
            padding: '0 14px', fontSize: 11, flex: '0 0 auto',
          }}>{T('JOIN WAITLIST →')}</a>
        </div>
      </header>

      {/* The POV banner that sat here — chip, sentence, athlete-view link —
          moved up into the header bar (see .cd-pov). One row, 56px, no void. */}

      <main style={{ flex: 1, padding: '28px 16px 80px', maxWidth: 1280, margin: '0 auto', width: '100%' }}>
        {/* THE SUB-NAV GOES ABOVE THE CONTENT IT SWITCHES.
            It was rendered AFTER every tab body, so on ROSTER it sat at the
            bottom of the page under eight athlete cards — and PROGRAMS and
            EXERCISES are in no other nav, so two of the biggest surfaces in
            the product were effectively undiscoverable in the demo. Found
            auditing for his first client meeting, 22.9. */}
        {/* Athletes ▾ — ROSTER | PROGRAMS | EXERCISES, the real app's grouping. */}
        {ATHLETE_GROUP.includes(tab) && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {ATHLETE_SUBTABS.map(([k, l]) => (
              <button key={k} onClick={() => navigateToTab(k)} style={{ ...baseBtn, background: tab === k ? C.acD : 'transparent', color: tab === k ? C.ac : C.tm, border: `1px solid ${tab === k ? C.ac : C.bd}`, padding: '0 18px', fontSize: 12, letterSpacing: 1.5 }}>{T(l)}</button>
            ))}
          </div>
        )}
        {/* Review ▾ — WORKOUTS (engine review) | TOOLS (camera/pose launcher). */}
        {tab === 'review' && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {[['workouts', 'WORKOUTS'], ['tools', 'TOOLS']].map(([k, l]) => (
              <button key={k} onClick={() => setReviewSub(k)} style={{ ...baseBtn, background: reviewSub === k ? C.acD : 'transparent', color: reviewSub === k ? C.ac : C.tm, border: `1px solid ${reviewSub === k ? C.ac : C.bd}`, padding: '0 18px', fontSize: 12, letterSpacing: 1.5 }}>{T(l)}</button>
            ))}
          </div>
        )}
        {tab === 'dashboard' && <DemoDashboard onJumpToTrainee={onJumpToTrainee} />}
        {tab === 'trainees'  && <DemoTrainees selected={selectedTrainee} onSelect={(id) => selectTrainee(id, 'trainees')} onClear={onClearTrainee} returnTab={returnTab} />}
        {tab === 'programs'  && <DemoPrograms resetToken={programsReset} />}
        {tab === 'exercises' && <DemoExercises />}
        {tab === 'sessions'  && <DemoSessions />}
        {tab === 'tasks'     && <DemoTasks />}
        {tab === 'billing'   && <DemoBilling />}
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
          }}>{T('FOUNDING-COACH WAITLIST')}</div>
          <h3 style={{
            fontFamily: FB, fontSize: 'clamp(20px, 2.6vw, 24px)', fontWeight: 700,
            margin: '0 0 10px', letterSpacing: -0.2,
          }}>{T('Run your roster on this stack. Locked-in pricing for the first wave.')}</h3>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <a href="/demo#waitlist" style={{
              ...baseBtn, background: C.ac, color: C.acOnSurface, padding: '0 22px', fontSize: 12,
            }}>{T('JOIN THE WAITLIST')}</a>
            <a href="/demo/trainee" style={{
              ...baseBtn, background: 'transparent', color: C.tx,
              border: `1px solid ${C.bd2}`, padding: '0 22px', fontSize: 12,
            }}>{T('NOW SEE THE ATHLETE VIEW →')}</a>
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
          <span>· {T('COACH DEMO · MOCK DATA · NOTHING WRITES BACK')}</span>
        </span>
        <span style={{ fontFamily: FN, fontSize: 10, color: C.td, letterSpacing: 1 }}>
          <a href="/demo" style={{ color: C.td, textDecoration: 'none', minHeight: 32, display: 'inline-flex', alignItems: 'center', padding: '0 6px' }}>{T('← BACK')}</a>
        </span>
      </footer>
    </div>
  );
}
