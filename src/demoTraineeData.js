// Mock dataset for /demo/trainee. Mirrors the real ClientPortal data shape so
// the page renders the actual production component — no separate demo UI.
// Exercise IDs reference real seeded library entries so videos resolve.

export const DEMO_CLIENT_ID = 'tr_demo';

// Same person who shows up on the coach-side demo roster (CoachDemo.jsx)
// so the two demos feel like one cohesive tour, not two unrelated personas.
export const DEMO_TRAINEE = {
  id: 'tr_demo',
  name: 'Gal Mizrahi',
  email: 'gal.mizrahi@example.co.il',
  phone: '+972526789012',
  age: 32,
  height: 178,
  weight: 78,
  goals: 'Gain 4-6 kg of lean mass over the next two blocks while keeping conditioning. Get back into competition shape by Q3.',
  injuries: 'Old right ACL repair (2019). Cleared to load fully.',
  notes: 'Trains 4 days/week. Mornings preferred.',
  status: 'Active',
  format: 'Remote',
  package: '8 Sessions',
  sessionsRemaining: 5,
  startDate: '2026-03-01',
  monthlyPrice: 0,
  packagePrice: 1490,
  sessionPrice: 186,
};

// Compact exercise-library snapshot the demo portal needs for title + video
// lookup. Subset of the real library — just the eids referenced by demo days.
export const DEMO_EXERCISES = [
  { id: 'e33',  title: 'BB Bench Press',                                 videoLink: 'https://www.youtube.com/shorts/bvaCXyXeBvU', cues: 'כפות רגליים מתחת לישבן. עקב נדחף לרצפה.' },
  { id: 'e61',  title: 'SA Cable Pulldown',                              videoLink: 'https://www.youtube.com/watch?v=bCjRRJ2lI8Y', cues: 'סיבוב מלא של כף היד. משוך כתף + מרפק לרצפה' },
  { id: 'e63',  title: 'Machine Leg Extension',                          videoLink: 'https://www.youtube.com/shorts/fP6uMgfwqOA', cues: 'ישיבה עם זווית סקוואט. משקל תמיד באוויר. פלקס חזק' },
  { id: 'e69',  title: 'Walking DB Lunge',                               videoLink: 'https://www.youtube.com/watch?v=VG12H7tYnZ8', cues: 'משקולת בכל יד. בית חזה לרצפה. כף רגל עוברת על הרצפה כמו צעד רגיל' },
  { id: 'e201', title: 'MID-POS Chin-Up',                                videoLink: 'https://www.youtube.com/shorts/LMDKMvNuB6s', cues: 'חמש שניות תלייה במצב רפוי. חמש שניות החזקה למעלה, כשהכתפיים נוגעות במוט.' },
  { id: 'e221', title: 'ISO BB Bench Press',                             videoLink: 'https://www.youtube.com/shorts/HrHTP04jKCU', cues: 'כפות רגליים מתחת לישבן. עקב נדחף לרצפה. שכמות כמה שיותר קרובות אחת לשנייה.' },
  { id: 'ex_d8yxfmm21mhmo7afevn', title: 'Tall-Kneeling DB OHP',         videoLink: 'https://www.youtube.com/watch?v=HHcdtGABMjY' },
  { id: 'ex_aiqevttcg7umobz1x89', title: 'Deficit/Low-Handles Trap-Bar Deadlift', videoLink: 'https://www.youtube.com/shorts/ecaWP3EcTl4' },
  { id: 'ex_jba6g9hgk7kmo7afevm', title: 'Standing MED-Ball Rotational OHP "Fake Slam"', videoLink: 'https://www.youtube.com/shorts/beg-rb3_Ig8' },
  { id: 'ex_d4vfns0625pmo7afevm', title: 'Seated Cable Facepull',        videoLink: 'https://www.youtube.com/shorts/Lgj7qV7yrmo' },
];

const ex = (eid, sets, reps, extras = {}) => ({ eid, s: sets, r: reps, ...extras });

export const DEMO_PLANS = [
  {
    id: 'plan_demo_active',
    name: 'Block #4 — Hypertrophy',
    traineeId: 'tr_demo',
    phase: 'Accumulation',
    notes: '',
    active: true,
    createdAt: '2026-04-15T08:00:00.000Z',
    weeks: 4,
    warmup: [
      { t: 'BW Floating-RFSS', rx: '1x10 E', vid: 'https://www.youtube.com/watch?v=4qMLnvW9rq8' },
      { t: 'Standing SA Cable Facepull', rx: '2x12 E', vid: 'https://www.youtube.com/watch?v=rG0PaDoX9Lw' },
      { t: 'SA Dead Hang', rx: '2x10 SEC E' },
    ],
    days: [
      {
        name: 'Day A — Push',
        exercises: [
          ex('e221', 3, '5', { tempo: '3-1-X', wk: ['80kg','82.5kg','85kg','87.5kg'] }),
          ex('e33',  3, '8',  { tempo: '2-1-1', wk: ['70kg','72.5kg','75kg','77.5kg'] }),
          ex('ex_d8yxfmm21mhmo7afevn', 3, '10', { tempo: '2-0-1' }),
          ex('ex_d4vfns0625pmo7afevm', 3, '15'),
        ],
      },
      {
        name: 'Day B — Pull',
        exercises: [
          ex('e201', 4, '5 E', { tempo: '5-5-5 ISO', wk: ['BW','+5kg','+7.5kg','+10kg'] }),
          ex('e61',  3, '10 E'),
          ex('ex_jba6g9hgk7kmo7afevm', 3, '6 E'),
        ],
      },
      {
        name: 'Day C — Legs',
        exercises: [
          ex('ex_aiqevttcg7umobz1x89', 4, '5', { tempo: '2-1-X', wk: ['120kg','125kg','130kg','135kg'] }),
          ex('e69',  3, '10 E'),
          ex('e63',  3, '12', { tempo: '3-0-1' }),
        ],
      },
    ],
  },
];

const today = new Date();
const daysAgo = n => { const d = new Date(today); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };

// These rows are already in the CONSUMED (post-normalization) shape that
// ClientPortal reads — camelCase keys, `exercises[]` each with per-set
// {reps,load,rpe,done}, and autoregulation as {pain,sleep,energy} WORD levels
// (ReadinessRow.CHECKIN_METRICS scale) — because demoMode bypasses Supabase and
// the useSupaStore snake_case→camelCase mapper (which builds this shape from the
// server row) never runs on demo data. The old snake_case + flat `sets` fixture
// matched nothing: `w.clientId === ci` was false for every row, so History,
// the Week-2 default, readiness rows and CheckinTrends were all empty.
const sett = (reps, load, rpe) => ({ reps, load, rpe, done: true });

export const DEMO_CLIENT_WORKOUTS = [
  {
    id: 'cw_demo_1',
    clientId: 'tr_demo',
    planName: 'Block #4 — Hypertrophy',
    dayName: 'Day A — Push',
    week: 2,
    date: daysAgo(2),
    notes: 'Felt strong on bench. ISO sets really cooked the chest.',
    reviewedAt: null,
    autoregulation: { pain: 'none', sleep: 'good', energy: 'good' },
    formVideos: [],
    exercises: [
      { eid: 'e221', title: 'ISO BB Bench Press', prescribed: '3x5', substitution: null,
        sets: [ sett('5', '82.5kg', '8'), sett('5', '82.5kg', '8.5'), sett('4', '82.5kg', '9') ] },
      { eid: 'e33', title: 'BB Bench Press', prescribed: '3x8', substitution: null,
        sets: [ sett('8', '72.5kg', '7'), sett('8', '72.5kg', '7.5'), sett('8', '72.5kg', '8') ] },
      { eid: 'ex_d8yxfmm21mhmo7afevn', title: 'Tall-Kneeling DB OHP', prescribed: '3x10', substitution: null,
        sets: [ sett('10', '22.5kg', '7'), sett('10', '22.5kg', '7.5'), sett('9', '22.5kg', '8') ] },
      { eid: 'ex_d4vfns0625pmo7afevm', title: 'Seated Cable Facepull', prescribed: '3x15', substitution: null,
        sets: [ sett('15', '25kg', '6'), sett('15', '25kg', '6.5'), sett('15', '27.5kg', '7') ] },
    ],
  },
  {
    id: 'cw_demo_2',
    clientId: 'tr_demo',
    planName: 'Block #4 — Hypertrophy',
    dayName: 'Day C — Legs',
    week: 2,
    date: daysAgo(5),
    notes: 'Trap-bar deficit feeling smoother. Knee no issues.',
    reviewedAt: new Date(today - 4 * 86400000).toISOString(),
    autoregulation: { pain: 'mild', sleep: 'good', energy: 'high' },
    formVideos: [],
    exercises: [
      { eid: 'ex_aiqevttcg7umobz1x89', title: 'Deficit/Low-Handles Trap-Bar Deadlift', prescribed: '4x5', substitution: null,
        sets: [ sett('5', '125kg', '7'), sett('5', '125kg', '7.5'), sett('5', '127.5kg', '8'), sett('5', '127.5kg', '8.5') ] },
      { eid: 'e69', title: 'Walking DB Lunge', prescribed: '3x10 E', substitution: null,
        sets: [ sett('10 E', '20kg/hand', '7'), sett('10 E', '20kg/hand', '7.5'), sett('10 E', '20kg/hand', '8') ] },
      { eid: 'e63', title: 'Machine Leg Extension', prescribed: '3x12', substitution: null,
        sets: [ sett('12', '60kg', '7'), sett('12', '65kg', '8'), sett('11', '65kg', '9') ] },
    ],
  },
];

// Flat array — ClientPortal calls bwLog.filter(b => b.clientId === ci).
// Each row: { date, clientId, week, bw, blockName, planId }.
export const DEMO_BW_LOG = [
  { date: daysAgo(13), clientId: DEMO_CLIENT_ID, week: 1, bw: 77.4, blockName: 'Block #4 — Hypertrophy', planId: 'plan_demo_active' },
  { date: daysAgo(11), clientId: DEMO_CLIENT_ID, week: 1, bw: 77.6, blockName: 'Block #4 — Hypertrophy', planId: 'plan_demo_active' },
  { date: daysAgo(8),  clientId: DEMO_CLIENT_ID, week: 2, bw: 77.8, blockName: 'Block #4 — Hypertrophy', planId: 'plan_demo_active' },
  { date: daysAgo(6),  clientId: DEMO_CLIENT_ID, week: 2, bw: 78.0, blockName: 'Block #4 — Hypertrophy', planId: 'plan_demo_active' },
  { date: daysAgo(4),  clientId: DEMO_CLIENT_ID, week: 2, bw: 78.1, blockName: 'Block #4 — Hypertrophy', planId: 'plan_demo_active' },
  { date: daysAgo(1),  clientId: DEMO_CLIENT_ID, week: 2, bw: 78.3, blockName: 'Block #4 — Hypertrophy', planId: 'plan_demo_active' },
];

// Focus is keyed by its SOURCE week = (display human week − 1), 0-based
// (ClientPortal.jsx:1579 `fwk = weekNum`). The demo default view is human
// week 2 (weekNum 1) → the guidance shown there lives under W1, not W2. Keyed
// W2, none of these ever rendered.
export const DEMO_WEEKLY_FOCUS = {
  'Block #4 — Hypertrophy|Day A — Push|e221|W1': 'Pause longer at lockout — really squeeze the lats',
  'Block #4 — Hypertrophy|Day B — Pull|e201|W1': 'Slow the eccentric to a true 5 sec',
  'Block #4 — Hypertrophy|Day C — Legs|ex_aiqevttcg7umobz1x89|W1': 'Knee tracks toe — keep the hinge dominant',
};

export const DEMO_PORTAL_VIS = {};
