// Mock dataset for /demo/trainee. Mirrors the real ClientPortal data shape so
// the page renders the actual production component — no separate demo UI.
// Exercise IDs reference real seeded library entries so videos resolve.

export const DEMO_CLIENT_ID = 'tr_demo';

export const DEMO_TRAINEE = {
  id: 'tr_demo',
  name: 'Diego Day',
  email: 'diego@diegoday.com',
  phone: '+972541234567',
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

export const DEMO_CLIENT_WORKOUTS = [
  {
    id: 'cw_demo_1',
    client_id: 'tr_demo',
    plan_id: 'plan_demo_active',
    plan_name: 'Block #4 — Hypertrophy',
    day_name: 'Day A — Push',
    week: 2,
    date: daysAgo(2),
    notes: 'Felt strong on bench. ISO sets really cooked the chest.',
    reviewed_at: null,
    created_at: new Date(today - 2 * 86400000).toISOString(),
    sets: [
      { eid: 'e221', s_idx: 0, reps: '5', load: '85kg', rpe: '8' },
      { eid: 'e221', s_idx: 1, reps: '5', load: '85kg', rpe: '8.5' },
      { eid: 'e221', s_idx: 2, reps: '4', load: '85kg', rpe: '9' },
      { eid: 'e33',  s_idx: 0, reps: '8', load: '75kg', rpe: '7' },
      { eid: 'e33',  s_idx: 1, reps: '8', load: '75kg', rpe: '7.5' },
    ],
    form_videos: [],
    autoregulation: { painScore: '0', energyLevel: '4', sleepQuality: '4' },
  },
  {
    id: 'cw_demo_2',
    client_id: 'tr_demo',
    plan_id: 'plan_demo_active',
    plan_name: 'Block #4 — Hypertrophy',
    day_name: 'Day C — Legs',
    week: 2,
    date: daysAgo(5),
    notes: 'Trap-bar deficit feeling smoother. Knee no issues.',
    reviewed_at: new Date(today - 4 * 86400000).toISOString(),
    created_at: new Date(today - 5 * 86400000).toISOString(),
    sets: [
      { eid: 'ex_aiqevttcg7umobz1x89', s_idx: 0, reps: '5', load: '125kg', rpe: '7' },
      { eid: 'ex_aiqevttcg7umobz1x89', s_idx: 1, reps: '5', load: '125kg', rpe: '7.5' },
      { eid: 'e69',                     s_idx: 0, reps: '10 E', load: '20kg/hand', rpe: '8' },
    ],
    form_videos: [],
    autoregulation: { painScore: '1', energyLevel: '5', sleepQuality: '4' },
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

export const DEMO_WEEKLY_FOCUS = {
  'Block #4 — Hypertrophy|Day A — Push|e221|W2': 'Pause longer at lockout — really squeeze the lats',
  'Block #4 — Hypertrophy|Day B — Pull|e201|W2': 'Slow the eccentric to a true 5 sec',
  'Block #4 — Hypertrophy|Day C — Legs|ex_aiqevttcg7umobz1x89|W2': 'Knee tracks toe — keep the hinge dominant',
};

export const DEMO_PORTAL_VIS = {};
