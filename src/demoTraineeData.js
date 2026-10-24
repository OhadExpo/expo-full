import { todayLocalISO } from './dates';
import { readLang } from './i18n';
// the demo's run prescriptions in the page's language (#866: the Hebrew demo read '1 km' / 'easy'), as the real Hebrew
// presets write them; the demo reloads when its language changes, so the language at load is the page's
const HE_RUN = (() => { try { return readLang() === 'he'; } catch { return false; } })();
const KM1 = HE_RUN ? '1 ק״מ' : '1 km', EASY = HE_RUN ? 'קל' : 'easy';
// ...and titled as the Hebrew presets title them (an English title before a Hebrew prescription read backwards - #789)
const WU = HE_RUN ? 'חימום' : 'Warm-up', INT = HE_RUN ? 'חזרות' : 'Intervals', CD = HE_RUN ? 'שחרור' : 'Cool-down';
// Mock dataset for /demo/trainee. Mirrors the real ClientPortal data shape so
// the page renders the actual production component — no separate demo UI.
// Exercise IDs reference real seeded library entries so videos resolve.

const today = new Date();
// Local calendar date, not UTC. toISOString() here made every demo fixture jump
// back a day between local midnight and 03:00 in Israel (audit 08-22 #80), so
// the demo showed "yesterday" as today to anyone browsing late at night.
const daysAgo = n => { const d = new Date(today); d.setDate(d.getDate() - n); return todayLocalISO(d); };

export const DEMO_CLIENT_ID = 'tr_demo';

// Same person who shows up on the coach-side demo roster (CoachDemo.jsx)
// so the two demos feel like one cohesive tour, not two unrelated personas.
//
// AND SPELLED THE SAME WAY. The roster calls him גל מזרחי and the athlete
// portal called him "Gal Mizrahi", so on the Hebrew demo the one Latin word
// left on the screen was the athlete's own name — in the greeting, at the top.
// Names are data: they are not translated, they are simply his real spelling,
// in both UI languages, exactly as the coach demo already does it.
export const DEMO_TRAINEE = {
  id: 'tr_demo',
  name: 'גל מזרחי',
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
  // Relative, like every other date in here — a demo athlete whose start
  // date is fixed in the past ages a little more every week it is shown.
  startDate: daysAgo(200),
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
    // Two weeks back, which is where the bodyweight log puts week 2.
    createdAt: new Date(Date.now() - 16 * 86400000).toISOString(),
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
        // `wk` IS THE PER-WEEK REPS WAVE, NOT A LOAD WAVE. ClientPortal reads
        // it as reps (pickWk -> repsForDisplay), so filling it with kg made every
        // plan card read "3 sets x 82.5kg reps" and the logger hero read
        // "4 sets x +5KG reps" -- while History for the same exercise said 3x5
        // two taps away. The plan shape has no per-week LOAD field: load is what
        // the athlete logs per set, and DEMO_WORKOUTS already carries the priors.
          ex('e221', 3, '5', { tempo: '3-1-X', wk: ['5','5','4','3'] }),
          ex('e33',  3, '8',  { tempo: '2-1-1', wk: ['8','8','6','6'] }),
          ex('ex_d8yxfmm21mhmo7afevn', 3, '10', { tempo: '2-0-1' }),
          ex('ex_d4vfns0625pmo7afevm', 3, '15'),
        ],
      },
      {
        name: 'Day B — Pull',
        exercises: [
          ex('e201', 4, '5 E', { tempo: '5-5-5 ISO', wk: ['5 E','5 E','4 E','4 E'], superset: 'A' }),
          ex('e63', 3, '12 E', { superset: 'A' }),
          ex('e61',  3, '10 E'),
          ex('ex_jba6g9hgk7kmo7afevm', 3, '6 E'),
        ],
      },
      {
        name: 'Day C — Legs',
        exercises: [
          ex('ex_aiqevttcg7umobz1x89', 4, '5', { tempo: '2-1-X', wk: ['5','5','4','3'] }),
          ex('e69',  3, '10 E'),
          ex('e63',  3, '12', { tempo: '3-0-1' }),
        ],
      },
    ],
  },
  // A SECOND PLAN, as real athletes carry (a block + a morning routine): the
  // portal draws a centred divider over each plan, and with one plan a
  // prospect never saw it (29.9 #448 audit).
  {
    id: 'plan_demo_morning',
    name: 'Morning Routine',
    traineeId: 'tr_demo',
    phase: '',
    notes: '',
    active: true,
    createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
    weeks: 4,
    days: [
      {
        name: 'Activation',
        exercises: [
          ex('e63', 2, '10 E'),
          ex('e61', 2, '8 E'),
          ex('ex_d4vfns0625pmo7afevm', 2, '12'),
        ],
      },
    ],
  },
  // A RUNNING PROGRAM (14.10 #769): the coach builds runs in the same editor (Program type: Running) and the athlete
  // logs each rep's distance, time and heart rate - the demo shows the run logger a prospect would otherwise never see.
  {
    id: 'plan_demo_run',
    name: 'Conditioning Runs',
    traineeId: 'tr_demo',
    phase: '',
    notes: '',
    active: true,
    sport: 'running',
    createdAt: new Date(Date.now() - 20 * 86400000).toISOString(),
    weeks: 4,
    days: [
      {
        name: HE_RUN ? 'חזרות' : 'Intervals',
        exercises: [
          { title: WU, s: 1, r: KM1, tempo: EASY },
          { title: INT, s: 5, r: KM1, tempo: '5:00-5:05', rest: HE_RUN ? '2.5 דק׳ הליכה' : '2.5 min walk', load: '165' },
          { title: CD, s: 1, r: KM1, tempo: EASY },
        ],
      },
    ],
  },
];

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
  // ONE LOGGED RUN (15.10 #799): the PRs tab now reads a runner's records (longest run, fastest km, 5 km+ pace) from the
  // logged distance + time of each rep - the demo shows them from this interval session of the Conditioning Runs program.
  {
    id: 'cw_demo_run_1',
    clientId: 'tr_demo',
    planName: 'Conditioning Runs',
    dayName: HE_RUN ? 'חזרות' : 'Intervals',
    week: 1,
    date: daysAgo(4),
    notes: 'Reps 3 and 4 hardest. HR under the cap.',
    reviewedAt: null,
    autoregulation: { pain: 'none', sleep: 'good', energy: 'good' },
    formVideos: [],
    exercises: [
      { eid: 'run_demo_wu', title: WU, prescribed: `1x${KM1}`, substitution: null,
        sets: [ { reps: '1', load: '', rpe: '', done: true, time: '6:20', hr: '128' } ] },
      { eid: 'run_demo_int', title: INT, prescribed: `5x${KM1}`, substitution: null,
        sets: [ ['5:04', '152'], ['5:02', '158'], ['4:58', '161'], ['5:01', '163'], ['4:59', '164'] ].map(([time, hr]) => ({ reps: '1', load: '', rpe: '', done: true, time, hr })) },
      { eid: 'run_demo_cd', title: CD, prescribed: `1x${KM1}`, substitution: null,
        sets: [ { reps: '1', load: '', rpe: '', done: true, time: '6:45', hr: '139' } ] },
    ],
  },
];

// THE COACH DEMO'S RUNNER (#866): an athlete whose blocks are RUNNING programs, so a prospect sees what the coach app
// shows for a runner - the real editor in running mode and the real run analysis (RunReview). His own plans and runs,
// never another athlete's renamed (a strength athlete made to run read his strength history as runs - reverted 17.10).
// Plans chronological; runs in the logged shape (per set: km, the set's time, HR), clientId 'demo' like the lineage.
// The story: week 1 the intervals ran at pace but over the 165 cap, by week 3 the same pace sits under it.
const KM = (n) => (HE_RUN ? `${n} ק״מ` : `${n} km`);
// Day A / B / C as the house names run days ('יום A' - a Hebrew letter reads as a weekday; the weekdays go in the note)
const RD = {
  a: HE_RUN ? 'יום A · חזרות' : 'Day A · Intervals',
  b: HE_RUN ? 'יום B · ריצה קלה' : 'Day B · Easy run',
  c: HE_RUN ? 'יום C · ריצה ארוכה' : 'Day C · Long run',
  aEasy: HE_RUN ? 'יום A · ריצה קלה' : 'Day A · Easy run',
  tempo: HE_RUN ? 'יום B · טמפו' : 'Day B · Tempo',
};
const EASYRUN = HE_RUN ? 'ריצה קלה' : 'Easy run', LONGRUN = HE_RUN ? 'ריצה ארוכה' : 'Long run', TEMPO = HE_RUN ? 'טמפו' : 'Tempo';
const WALK = HE_RUN ? '2.5 דק׳ הליכה' : '2.5 min walk';
const RUNNER_PLANS = [
  {
    id: 'demo-run-blk-1', name: 'Block #1 — Base Miles', sport: 'running', weeks: 4, createdAt: null,
    days: [
      { name: RD.aEasy, exercises: [{ title: EASYRUN, sets: 1, reps: KM(6), tempo: EASY, load: '150' }] },
      { name: RD.tempo, exercises: [{ title: WU, sets: 1, reps: KM1, tempo: EASY }, { title: TEMPO, sets: 1, reps: KM(3), tempo: '5:20-5:30', load: '165' }, { title: CD, sets: 1, reps: KM1, tempo: EASY }] },
      { name: RD.c, exercises: [{ title: LONGRUN, sets: 1, reps: KM(8), wk: [KM(8), KM(8), KM(9), KM(10)], tempo: '6:10-6:30', load: '155' }] },
      // the block closes with a 3 km time trial: one continuous all-out effort that prices the next block (#914)
      { name: HE_RUN ? 'מבחן · 3 ק״מ' : 'Test · 3 km', onlyWeek: 4, exercises: [{ title: WU, sets: 1, reps: KM(2), tempo: EASY }, { title: HE_RUN ? 'מבחן 3 ק״מ' : '3 km time trial', sets: 1, reps: KM(3), tempo: HE_RUN ? 'מאמץ מלא' : 'all-out' }, { title: CD, sets: 1, reps: KM1, tempo: EASY }] },
    ],
  },
  {
    id: 'demo-run-blk-2', name: 'Block #2 — 10K Build', sport: 'running', weeks: 4, createdAt: null,
    days: [
      { name: RD.a, exercises: [{ title: WU, sets: 1, reps: KM1, tempo: EASY }, { title: INT, sets: 5, reps: KM1, tempo: '5:00-5:05', wkT: ['5:00-5:05', '4:55-5:00', '4:50-4:55', '5:05-5:10'] /* #898: pace by week - build, then the deload */, rest: WALK, load: '165' }, { title: CD, sets: 1, reps: KM1, tempo: EASY }] },
      { name: RD.b, exercises: [{ title: EASYRUN, sets: 1, reps: KM(6), tempo: EASY, load: '150' }] },
      { name: RD.c, exercises: [{ title: LONGRUN, sets: 1, reps: KM(10), wk: [KM(10), KM(11), KM(12), KM(8)], tempo: '6:00-6:20', load: '155' }] },
    ],
  },
];
const runSet = (km, time, hr) => ({ reps: String(km), load: '', rpe: '', done: true, time, hr: String(hr) });
// each block-week is one calendar week (Sunday to Saturday, as the analysis counts weekly km), finished: Sunday, Tuesday,
// Thursday of 1-5 weeks back, whatever day the demo is opened on (days-ago put two block-weeks in one week on some days
// and the analysis read a 77% jump)
// from Friday on, this week's Sunday / Tuesday / Thursday runs are done: the latest block-week is this week (his last run
// is never more than 6 days old)
const WEEK_SHIFT = today.getDay() >= 5 ? 1 : 0;
const onWeek = (weeksBack, dow) => { const d = new Date(today); d.setDate(d.getDate() - d.getDay() - 7 * (weeksBack - WEEK_SHIFT) + dow); return todayLocalISO(d); };
const runLog = (id, plan, day, week, [weeksBack, dow], exercises, extra = {}) => ({ id, clientId: 'demo', planName: plan, dayName: day, week, date: onWeek(weeksBack, dow), reviewedAt: null, notes: '', autoregulation: {}, formVideos: [], exercises, ...extra });
const intervals = (reps) => [
  { title: WU, sets: [runSet(1, '6:20', 128)] },
  { title: INT, sets: reps.map(([t, hr]) => runSet(1, t, hr)) },
  { title: CD, sets: [runSet(1, '6:40', 135)] },
];
const B1 = RUNNER_PLANS[0].name, B2 = RUNNER_PLANS[1].name;
const RUNNER_WORKOUTS = [
  // the base block, every week: 18, 19, 20, 21 km - so the 10K block's first week (23 km) is a gentle step up
  runLog('dr-1-b1', B1, RD.aEasy, 1, [7, 0], [{ title: EASYRUN, sets: [runSet(5, '32:10', 149)] }]),
  runLog('dr-1-t1', B1, RD.tempo, 1, [7, 2], [{ title: WU, sets: [runSet(1, '6:30', 131)] }, { title: TEMPO, sets: [runSet(3, '16:30', 168)] }, { title: CD, sets: [runSet(1, '6:50', 140)] }]),
  runLog('dr-1-c1', B1, RD.c, 1, [7, 4], [{ title: LONGRUN, sets: [runSet(8, '52:00', 153)] }]),
  runLog('dr-1-b2', B1, RD.aEasy, 2, [6, 0], [{ title: EASYRUN, sets: [runSet(6, '38:30', 149)] }]),
  runLog('dr-1-t2', B1, RD.tempo, 2, [6, 2], [{ title: WU, sets: [runSet(1, '6:28', 130)] }, { title: TEMPO, sets: [runSet(3, '16:21', 167)] }, { title: CD, sets: [runSet(1, '6:48', 139)] }]),
  runLog('dr-1-c2', B1, RD.c, 2, [6, 4], [{ title: LONGRUN, sets: [runSet(8, '51:40', 152)] }]),
  runLog('dr-1-b3', B1, RD.aEasy, 3, [5, 0], [{ title: EASYRUN, sets: [runSet(6, '38:10', 148)] }]),
  runLog('dr-1-t3', B1, RD.tempo, 3, [5, 2], [{ title: WU, sets: [runSet(1, '6:25', 130)] }, { title: TEMPO, sets: [runSet(3, '16:12', 166)] }, { title: CD, sets: [runSet(1, '6:45', 138)] }]),
  runLog('dr-1-c3', B1, RD.c, 3, [5, 4], [{ title: LONGRUN, sets: [runSet(9, '57:40', 151)] }]),
  runLog('dr-1-b4', B1, RD.aEasy, 4, [4, 0], [{ title: EASYRUN, sets: [runSet(6, '37:50', 146)] }]),
  runLog('dr-1-t4', B1, RD.tempo, 4, [4, 2], [{ title: WU, sets: [runSet(1, '6:22', 129)] }, { title: TEMPO, sets: [runSet(3, '16:03', 163)] }, { title: CD, sets: [runSet(1, '6:42', 137)] }]),
  runLog('dr-1-c4', B1, RD.c, 4, [4, 4], [{ title: LONGRUN, sets: [runSet(10, '63:40', 152)] }]),
  runLog('dr-1-tt', B1, HE_RUN ? 'מבחן · 3 ק״מ' : 'Test · 3 km', 4, [4, 6], [{ title: WU, sets: [runSet(2, '13:10', 132)] }, { title: HE_RUN ? 'מבחן 3 ק״מ' : '3 km time trial', sets: [runSet(3, '14:45', 179)] }, { title: CD, sets: [runSet(1, '7:05', 141)] }]),
  runLog('dr-2-a1', B2, RD.a, 1, [3, 0], intervals([['5:08', 163], ['5:06', 166], ['5:05', 168], ['5:07', 169], ['5:04', 171]]),
    { notes: HE_RUN ? 'הדופק עלה מהר מהחזרה השלישית' : 'HR climbed fast from rep 3', autoregulation: { pain: 'none', sleep: 'ok', energy: 'ok' } }),
  runLog('dr-2-b1', B2, RD.b, 1, [3, 2], [{ title: EASYRUN, sets: [runSet(6, '37:30', 146)] }]),
  runLog('dr-2-c1', B2, RD.c, 1, [3, 4], [{ title: LONGRUN, sets: [runSet(10, '62:30', 150)] }]),
  runLog('dr-2-a2', B2, RD.a, 2, [2, 0], intervals([['5:03', 160], ['5:02', 163], ['5:01', 164], ['5:02', 166], ['5:00', 167]])),
  runLog('dr-2-b2', B2, RD.b, 2, [2, 2], [{ title: EASYRUN, sets: [runSet(6, '37:00', 143)] }]),
  runLog('dr-2-c2', B2, RD.c, 2, [2, 4], [{ title: LONGRUN, sets: [runSet(11, '68:20', 152)] }]),
  runLog('dr-2-a3', B2, RD.a, 3, [1, 0], intervals([['4:59', 158], ['5:00', 160], ['4:58', 162], ['5:00', 163], ['4:57', 164]]),
    { notes: HE_RUN ? 'אותו קצב, דופק מתחת לתקרה כל החזרות' : 'Same pace, HR under the cap on every rep', autoregulation: { pain: 'none', sleep: 'good', energy: 'good' } }),
  runLog('dr-2-b3', B2, RD.b, 3, [1, 2], [{ title: EASYRUN, sets: [runSet(6, '36:24', 141)] }]),
  runLog('dr-2-c3', B2, RD.c, 3, [1, 4], [{ title: LONGRUN, sets: [runSet(12, '74:10', 153)] }]),
];
// days since his last run (the roster's 'last workout', his messages) and since the 10K block started (its PLAN row)
const agoOf = (iso) => Math.round((new Date(todayLocalISO(today) + 'T12:00:00') - new Date(iso + 'T12:00:00')) / 86400000);
export const DEMO_RUNNER = { plans: RUNNER_PLANS, workouts: RUNNER_WORKOUTS, lastAgo: agoOf(RUNNER_WORKOUTS[RUNNER_WORKOUTS.length - 1].date), blockAgo: agoOf(RUNNER_WORKOUTS.find((w) => w.planName === B2).date) + 1 };

// Flat array — ClientPortal calls bwLog.filter(b => b.clientId === ci).
// Each row: { date, clientId, week, bw, blockName, planId }.
// ONE WEIGH-IN PER BLOCK-WEEK. The log held FOUR week-2 rows, and the save
// handler correctly replaces every row for (client, block, week) -- so the
// moment a visitor typed a weight and pressed SAVE, three of the six points
// vanished from the chart in front of them: 6 records -> 3, +0.9kg -> +4.0kg.
// The handler is right; the fixture was modelling something that cannot happen.
export const DEMO_BW_LOG = [
  { date: daysAgo(27), clientId: DEMO_CLIENT_ID, week: 1, bw: 77.4, blockName: 'Block #3 — Volume',      planId: 'plan_demo_prev' },
  { date: daysAgo(20), clientId: DEMO_CLIENT_ID, week: 2, bw: 77.6, blockName: 'Block #3 — Volume',      planId: 'plan_demo_prev' },
  { date: daysAgo(13), clientId: DEMO_CLIENT_ID, week: 1, bw: 77.9, blockName: 'Block #4 — Hypertrophy', planId: 'plan_demo_active' },
  { date: daysAgo(6),  clientId: DEMO_CLIENT_ID, week: 2, bw: 78.3, blockName: 'Block #4 — Hypertrophy', planId: 'plan_demo_active' },
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

// Today's meals for the demo Meal Log tab (athlete_meals columns). demoMode
// bypasses Supabase, so MealLogger seeds these directly. photo_url is null —
// MealThumb renders a neutral tile rather than a broken image.
const mealAt = (h, m) => new Date(daysAgo(0) + `T${h}:${m}:00`).toISOString();
export const DEMO_MEALS = [
  { id: 'meal_demo_1', trainee_id: 'tr_demo', created_at: mealAt('08', '15'), photo_url: null, kcal: 640, protein_g: 48, carbs_g: 70, fat_g: 18, notes: 'Oats, whey, banana, peanut butter', items: [{ name: 'Oats' }, { name: 'Whey' }, { name: 'Banana' }, { name: 'Peanut butter' }] },
  { id: 'meal_demo_2', trainee_id: 'tr_demo', created_at: mealAt('13', '10'), photo_url: null, kcal: 820, protein_g: 55, carbs_g: 85, fat_g: 22, notes: 'Chicken, rice, salad', items: [{ name: 'Chicken breast' }, { name: 'White rice' }, { name: 'Salad + olive oil' }] },
  { id: 'meal_demo_3', trainee_id: 'tr_demo', created_at: mealAt('16', '40'), photo_url: null, kcal: 320, protein_g: 30, carbs_g: 35, fat_g: 6, notes: 'Greek yogurt + berries', items: [{ name: 'Greek yogurt' }, { name: 'Mixed berries' }] },
  { id: 'meal_demo_4', trainee_id: 'tr_demo', created_at: mealAt('20', '05'), photo_url: null, kcal: 780, protein_g: 52, carbs_g: 60, fat_g: 30, notes: 'Salmon, potatoes, veg', items: [{ name: 'Salmon fillet' }, { name: 'Roasted potatoes' }, { name: 'Steamed veg' }] },
];

// Coach<->athlete thread for the demo Messages tab (coach_messages columns:
// sender_role/body_text/audio_url/duration_sec/created_at). demoMode bypasses
// Supabase, so CoachMessages seeds these directly.
const hoursAgo = n => new Date(today.getTime() - n * 3600000).toISOString();
// ...in the page's language (#1029: the Hebrew demo showed three English bubbles), written in Hebrew, not translated
const HE_MSG = HE_RUN;
export const DEMO_MESSAGES = [
  { id: 'msg_demo_1', trainee_id: 'tr_demo', sender_role: 'coach', body_text: HE_MSG ? 'עבודה טובה בלחיצת חזה השבוע, ההחזקות האיזומטריות משתלמות. שמור על ירידה מבוקרת בדדליפט טראפ בר.' : 'Great work on the bench this week — those ISO holds are paying off. Keep the eccentric controlled on the trap-bar pulls.', audio_url: null, duration_sec: null, created_at: hoursAgo(50) },
  { id: 'msg_demo_2', trainee_id: 'tr_demo', sender_role: 'athlete', body_text: HE_MSG ? 'תודה! הרגשתי חזק. הברך החזיקה מעולה ביום רגליים.' : 'Thanks! Felt strong. Knee held up fine on legs day.', audio_url: null, duration_sec: null, created_at: hoursAgo(49) },
  { id: 'msg_demo_3', trainee_id: 'tr_demo', sender_role: 'coach', body_text: HE_MSG ? 'מעולה. בשבוע הבא אני מעלה את הסט הכבד ביום A. תמלא דיווח מוכנות (כאב / שינה / אנרגיה) לפני שאתה מתחיל, ככה אני מתאים לך את העומס.' : 'Perfect. Bumping the Day A top set next week — log your readiness (pain / sleep / energy) before you start so I can autoregulate it.', audio_url: null, duration_sec: null, created_at: hoursAgo(26) },
];

export const DEMO_PORTAL_VIS = {};
