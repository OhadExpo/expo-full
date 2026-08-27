// Catalog of training programs sold via the EXPO landing page.
// Editing this file is the canonical way to add / remove / rewrite offerings.
// No DB migration needed for the catalog itself; after a purchase the matching
// template plan from the main expo-app.co.il library is duplicated onto the
// new trainee.
//
// ───────────────────────────────────────────────────────────────────────────
// Schema (every field is required unless marked optional):
//
//   id          string   Stable slug. Used in URLs (/programs/<id>) and in
//                        the matching plan name on the main app side.
//   tag         string   Chip label. Drives the filter pills at the top of
//                        the catalog. Adding a new tag automatically adds
//                        a chip.
//   title       string   Card heading. Keep short — one or two words.
//   duration    string   Free-form, displayed as e.g. "12 weeks · 3 days/week".
//   audience    string   One-line "who is this for". Shows under the title.
//   summary     string   1–2 sentence description. The pitch.
//   highlights  string[] 2–4 bullet points. What's distinctive about this block.
//   price       number   In NIS. Displayed as the bold price on the card.
//   currency    string   Defaults to 'NIS'. Set explicitly in case you ever
//                        sell in USD/EUR.
//   accent      string   Hex colour for the chip + price + Buy button + card
//                        hover border. Pick from the palette below for visual
//                        consistency. Mixing freely also works.
//
// Optional (used by /programs/<id> sample-week page — when you add real
// content, fill these in; cards work without them):
//
//   sampleWeek  object?  { dayA: [{title, prescribed, tempo?, notes?}, ...],
//                          dayB: [...], dayC?: [...] }
//                        Lets the sample-week preview page render the actual
//                        first week so buyers see what they're getting.
//   equipment   string[]?  e.g. ['Barbell', 'Dumbbells', 'Bench']
//   level       string?    'Beginner' | 'Intermediate' | 'Advanced'
//
//   quiz        object?    Routing tags consumed by the on-site quiz.
//                          {
//                            levels: ['beginner'|'intermediate'|'advanced'],
//                            goals:  ['general_health'|'lose_weight'|'muscle'|
//                                     'strength'|'sport'|'rehab'],
//                            daysPerWeek: [3, 4, ...],
//                            forRehab: 'no' | 'either' | 'only',
//                            couplesOnly?: boolean,
//                          }
//
// ───────────────────────────────────────────────────────────────────────────
// Accent palette (so cards stay visually coherent):
//   '#3BA0FF'  primary blue (default for most)
//   '#39BDFF'  brighter blue (variant)
//   '#28d95b'  green   (rehab / mobility / wellness leaning)
//   '#ff9c44'  orange  (specialty / niche)
//   '#ff5e5e'  red     (rehab / load-management — caution-themed)
// ───────────────────────────────────────────────────────────────────────────

export const PROGRAMS = [
  {
    id: 'foundation-12',
    tag: 'Beginner',
    title: 'Foundation Block',
    titleHe: 'בלוק יסודות',
    tagHe: 'מתחילים',
    audienceHe: 'אימון מובנה ראשון',
    durationHe: '12 שבועות · 3 ימים בשבוע',
    duration: '12 weeks · 3 days/week',
    audience: 'First-time structured training',
    summary:
      'Learn the seven primary movement patterns. The base every other program assumes.',
    summaryHe:
      'ללמוד את שבעת תבניות התנועה העיקריות. הבסיס שכל תוכנית אחרת מניחה.',
    highlights: [
      'Hinge / squat / push / pull / carry / rotation in every microcycle',
      'Tempo + ROM emphasis before load',
      'Barbell + dumbbells, no machines required',
    ],
    highlightsHe: [
      'ציר/סקוואט/דחיפה/משיכה/נשיאה/סיבוב בכל מיקרוסייקל',
      'דגש על טמפו וטווח תנועה לפני עומס',
      'מוט ומשקולות יד, בלי מכונות',
    ],
    price: 290,
    currency: 'NIS',
    accent: '#3BA0FF',
    level: 'Beginner',
    equipment: ['Barbell', 'Dumbbells', 'Bench'],
    quiz: {
      levels: ['beginner'],
      goals: ['general_health', 'lose_weight', 'muscle'],
      daysPerWeek: [3],
      forRehab: 'either',
    },
    // Reference shape — replace these exercises with the real first-week
    // microcycle once you decide the template content. The detail page at
    // /#/programs/foundation-12 reads this to render the SAMPLE WEEK section.
    sampleWeek: {
      dayA: [
        { title: 'Goblet Squat',          prescribed: '3 × 8',    tempo: '3-1-1' },
        { title: 'DB Bench Press',        prescribed: '3 × 8',    tempo: '3-0-1' },
        { title: 'Single-Arm DB Row',     prescribed: '3 × 10/side' },
        { title: 'DB Romanian Deadlift',  prescribed: '3 × 8',    tempo: '3-1-1' },
        { title: 'Plank',                 prescribed: '3 × 30s' },
      ],
      dayB: [
        { title: 'Trap-Bar Deadlift',     prescribed: '3 × 5',    tempo: '2-1-1' },
        { title: 'DB Overhead Press',     prescribed: '3 × 8' },
        { title: 'Lat Pulldown',          prescribed: '3 × 10' },
        { title: 'Walking DB Lunge',      prescribed: '3 × 10/leg' },
        { title: 'Dead Bug',              prescribed: '3 × 8/side' },
      ],
      dayC: [
        { title: 'Front-Foot-Elevated Split Squat', prescribed: '3 × 8/leg' },
        { title: 'Push-Up',                prescribed: '3 × AMRAP', notes: 'stop 1–2 reps shy of failure' },
        { title: 'Chest-Supported Row',    prescribed: '3 × 10' },
        { title: 'DB Hip Thrust',          prescribed: '3 × 10' },
        { title: 'Farmer Carry',           prescribed: '3 × 30m' },
      ],
    },
  },
  {
    id: 'hypertrophy-16',
    tag: 'Hypertrophy',
    title: 'Hypertrophy 16',
    titleHe: 'היפרטרופיה 16',
    tagHe: 'היפרטרופיה',
    audienceHe: 'שנה+ של ניסיון, מטרה היא מסה',
    durationHe: '16 שבועות · 4 ימים בשבוע',
    duration: '16 weeks · 4 days/week',
    audience: '1+ year base, goal is size',
    summary:
      'Block-periodised hypertrophy with auto-regulated volume. Push/pull/legs split with calves and abs as priority work.',
    summaryHe:
      'היפרטרופיה בבלוקים עם נפח מותאם בזמן אמת. פיצול דחיפה/משיכה/רגליים עם תעדוף שוקיים ובטן.',
    highlights: [
      'Volume escalation 60→90% week-on-week',
      'Push/Pull/Legs/Upper-Lower hybrid',
      'Optional BFR finishers',
    ],
    highlightsHe: [
      'עליית נפח 60→90% משבוע לשבוע',
      'פיצול משולב — דחיפה/משיכה/רגליים + עליון/תחתון',
      'סיומות BFR אופציונליות',
    ],
    price: 390,
    currency: 'NIS',
    accent: '#39BDFF',
    level: 'Intermediate',
    equipment: ['Barbell', 'Dumbbells', 'Cables', 'Machines'],
    quiz: {
      levels: ['intermediate', 'advanced'],
      goals: ['muscle'],
      daysPerWeek: [4],
      forRehab: 'no',
    },
    // Week 1 — volume escalation starts at ~60%. Week 4 hits 90% before
    // a deload week. PPL/Upper-Lower hybrid with BFR finishers optional.
    sampleWeek: {
      dayA: [
        { title: 'Bench Press',                 prescribed: '4 × 8 @ RPE 7' },
        { title: 'Standing Overhead Press',     prescribed: '3 × 10' },
        { title: 'Incline DB Press',            prescribed: '3 × 12' },
        { title: 'Cable Fly',                   prescribed: '3 × 15', notes: 'last set drop' },
        { title: 'Tricep Pushdown',             prescribed: '3 × 12-15' },
        { title: 'Lateral Raise',               prescribed: '3 × 15', notes: 'BFR optional' },
      ],
      dayB: [
        { title: 'Pull-Up',                     prescribed: '4 × AMRAP', notes: 'stop 1 rep shy' },
        { title: 'Bent-Over BB Row',            prescribed: '3 × 10' },
        { title: 'Lat Pulldown',                prescribed: '3 × 12' },
        { title: 'Chest-Supported Row',         prescribed: '3 × 12' },
        { title: 'DB Bicep Curl',               prescribed: '3 × 12' },
        { title: 'Face Pull',                   prescribed: '3 × 15' },
      ],
      dayC: [
        { title: 'Back Squat',                  prescribed: '4 × 8 @ RPE 7', tempo: '3-1-1' },
        { title: 'Romanian Deadlift',           prescribed: '3 × 10' },
        { title: 'Walking DB Lunge',            prescribed: '3 × 10/leg' },
        { title: 'Leg Curl',                    prescribed: '3 × 12' },
        { title: 'Standing Calf Raise',         prescribed: '4 × 12-15' },
        { title: 'Hanging Leg Raise',           prescribed: '3 × 8-10' },
      ],
      dayD: [
        { title: 'Incline Bench Press',         prescribed: '4 × 8' },
        { title: 'Seated Cable Row',            prescribed: '4 × 10' },
        { title: 'DB Shoulder Press',           prescribed: '3 × 10' },
        { title: 'EZ-Bar Curl',                 prescribed: '3 × 10' },
        { title: 'Cable Tricep Extension',      prescribed: '3 × 12' },
        { title: 'Cable Pallof Press',          prescribed: '3 × 10/side' },
      ],
    },
  },
  {
    id: 'powerbuild-12',
    tag: 'Powerbuild',
    title: 'PowerBuild',
    titleHe: 'פאוורבילד',
    tagHe: 'כוח+מסה',
    audienceHe: 'כוח עם מסה, בלי להתחרות',
    durationHe: '12 שבועות · 4 ימים בשבוע',
    duration: '12 weeks · 4 days/week',
    audience: 'Want strength + size, no competing',
    summary:
      "Heavy compound work followed by hypertrophy assistance. Hybrid template that doesn't force you to pick a lane.",
    summaryHe:
      'תרגילים מורכבים כבדים ואחריהם עזר היפרטרופי. תבנית היברידית שלא מאלצת אותך לבחור מסלול.',
    highlights: [
      'Top sets 80–90% 1RM on the main lifts',
      'Backoff sets for size',
      'Built-in deload week',
    ],
    highlightsHe: [
      'סטים מובילים 80-90% מ-1RM בתרגילים המרכזיים',
      'סטי המשך להגדלת מסה',
      'שבוע דילוד מובנה',
    ],
    price: 350,
    currency: 'NIS',
    accent: '#3BA0FF',
    level: 'Intermediate',
    equipment: ['Barbell', 'Dumbbells'],
    quiz: {
      levels: ['intermediate', 'advanced'],
      goals: ['strength', 'muscle'],
      daysPerWeek: [4],
      forRehab: 'no',
    },
    // Top set at 80-90% 1RM, then 3 backoff sets at 70% for hypertrophy.
    // 4-day split, one main lift per day. Built-in deload at W6 + W12.
    sampleWeek: {
      dayA: [
        { title: 'Back Squat',                  prescribed: '1 × 3 @ 85% · 3 × 6 @ 70%', tempo: '3-1-1', notes: 'top + 3 backoffs' },
        { title: 'Bulgarian Split Squat',       prescribed: '3 × 8/leg' },
        { title: 'Leg Press',                   prescribed: '3 × 10-12' },
        { title: 'Standing Calf Raise',         prescribed: '4 × 12' },
        { title: 'Cable Pallof Press',          prescribed: '3 × 10/side' },
      ],
      dayB: [
        { title: 'Bench Press',                 prescribed: '1 × 3 @ 85% · 3 × 6 @ 70%', tempo: '3-1-1', notes: 'top + 3 backoffs' },
        { title: 'Weighted Pull-Up',            prescribed: '3 × 6' },
        { title: 'Incline DB Press',            prescribed: '3 × 8-10' },
        { title: 'Seated Cable Row',            prescribed: '3 × 10' },
        { title: 'Tricep Pushdown',             prescribed: '3 × 12' },
      ],
      dayC: [
        { title: 'Conventional Deadlift',       prescribed: '1 × 3 @ 85% · 2 × 5 @ 70%', tempo: '2-0-1', notes: 'top + 2 backoffs' },
        { title: 'Front Squat',                 prescribed: '3 × 6' },
        { title: 'Romanian Deadlift',           prescribed: '3 × 8' },
        { title: 'Hip Thrust',                  prescribed: '3 × 10' },
        { title: 'Hanging Leg Raise',           prescribed: '3 × 8' },
      ],
      dayD: [
        { title: 'Standing Overhead Press',     prescribed: '1 × 3 @ 85% · 3 × 6 @ 70%', tempo: '3-1-1', notes: 'top + 3 backoffs' },
        { title: 'Bent-Over BB Row',            prescribed: '4 × 6-8' },
        { title: 'Push-Up',                     prescribed: '3 × AMRAP', notes: 'stop 1 rep shy' },
        { title: 'EZ-Bar Curl',                 prescribed: '3 × 10' },
        { title: 'Lateral Raise',               prescribed: '3 × 12-15' },
      ],
    },
  },
  {
    id: 'couples-12',
    tag: 'Couples',
    title: 'Couples · Same Block',
    titleHe: 'זוגות · אותו בלוק',
    tagHe: 'זוגות',
    audienceHe: 'שניים, אותו חדר כושר, מטרות דומות',
    durationHe: '12 שבועות · 3 ימים בשבוע לכל אחד',
    duration: '12 weeks · 3 days/week each',
    audience: 'Two people, same gym, similar goals',
    summary:
      'Two coordinated copies of the same block. Synchronised so you can warm up together and use each other as spotters.',
    summaryHe:
      'שני עותקים מתואמים של אותו בלוק. מסונכרן כדי שתוכלו להתחמם יחד ולעזור זה לזה.',
    highlights: [
      'Synchronised supersets where possible',
      'Different absolute loads, same %RM',
      'One purchase = two accounts',
    ],
    highlightsHe: [
      'סופרסטים מסונכרנים היכן שאפשר',
      'עומסים שונים, אותו אחוז 1RM',
      'רכישה אחת = שני חשבונות',
    ],
    price: 540,
    currency: 'NIS',
    accent: '#39BDFF',
    level: 'Intermediate',
    equipment: ['Barbell', 'Dumbbells'],
    quiz: {
      levels: ['beginner', 'intermediate', 'advanced'],
      goals: ['general_health', 'muscle', 'strength', 'lose_weight'],
      daysPerWeek: [3],
      forRehab: 'no',
      couplesOnly: true,
    },
    // 3 days/week each, both copies run the same template at different
    // absolute loads. Synchronised supersets (A1/A2) where both partners
    // can share or swap equipment cleanly.
    sampleWeek: {
      dayA: [
        { title: 'Goblet Squat',                prescribed: '4 × 8',     tempo: '3-1-1', notes: 'A1 — alternate with partner' },
        { title: 'DB Bench Press',              prescribed: '4 × 10',                   notes: 'A2 — alternate with partner' },
        { title: 'Single-Arm DB Row',           prescribed: '3 × 10/side',               notes: 'B1' },
        { title: 'Hip Thrust',                  prescribed: '3 × 10',                   notes: 'B2' },
        { title: 'Plank',                       prescribed: '3 × 30s' },
      ],
      dayB: [
        { title: 'Trap-Bar Deadlift',           prescribed: '4 × 5',     tempo: '2-1-1' },
        { title: 'DB Overhead Press',           prescribed: '3 × 8',                    notes: 'A1' },
        { title: 'Lat Pulldown',                prescribed: '3 × 10',                   notes: 'A2' },
        { title: 'Walking DB Lunge',            prescribed: '3 × 10/leg' },
        { title: 'Dead Bug',                    prescribed: '3 × 8/side' },
      ],
      dayC: [
        { title: 'Front-Foot-Elevated Split Squat', prescribed: '3 × 10/leg', notes: 'A1' },
        { title: 'Push-Up',                     prescribed: '3 × AMRAP',                notes: 'A2 — stop 2 reps shy' },
        { title: 'Chest-Supported Row',         prescribed: '3 × 12' },
        { title: 'DB Romanian Deadlift',        prescribed: '3 × 10' },
        { title: 'Farmer Carry',                prescribed: '3 × 30m',                  notes: 'race or relay 😉' },
      ],
    },
  },
  {
    id: 'rehab-return',
    tag: 'Rehab',
    title: 'Return to Training',
    titleHe: 'חזרה לאימונים',
    tagHe: 'שיקום',
    audienceHe: 'חזרה מפציעה, אישור לעמיסה',
    durationHe: '8 שבועות · ימים משתנים',
    duration: '8 weeks · variable days/week',
    audience: 'Coming back from injury, cleared to load',
    summary:
      'Load-management hierarchy: ROM → Tempo → Intensity → Volume → Frequency. You log pain (0–10), the program adapts the load.',
    summaryHe:
      'ניהול עומס בהיררכיה: טווח תנועה ← טמפו ← עצימות ← נפח ← תדירות. את/ה רושמ/ת רמת כאב (0-10), התוכנית מתאימה את העומס.',
    highlights: [
      'Per-exercise pain gate (0–3 OK, 4–5 modify, 6+ stop)',
      'Two-week reassess windows',
      'Coach-style cues built into each set',
    ],
    highlightsHe: [
      'סף כאב לכל תרגיל (0-3 בסדר, 4-5 שינוי, 6 ומעלה עצירה)',
      'חלונות הערכה כל שבועיים',
      'רמזי מאמן מובנים בכל סט',
    ],
    price: 320,
    currency: 'NIS',
    accent: '#ff5e5e',
    level: 'Beginner',
    equipment: ['Bands', 'Dumbbells'],
    quiz: {
      levels: ['beginner', 'intermediate', 'advanced'],
      goals: ['rehab', 'general_health'],
      daysPerWeek: [3, 4],
      forRehab: 'only',
    },
    // Pain-gated, ROM-first work. Bands + DBs only. Pain ≥4 on any set
    // pulls the load regression hierarchy automatically (ROM → Tempo →
    // Intensity → Volume). 0-3 OK, 4-5 modify, 6+ stop and reassess.
    sampleWeek: {
      dayA: [
        { title: 'Bodyweight Box Squat',        prescribed: '3 × 10', tempo: '3-1-1', notes: 'pain gate ≤3/10' },
        { title: 'Wall Push-Up',                prescribed: '3 × 12', tempo: '3-1-1' },
        { title: 'Band Row',                    prescribed: '3 × 12',                 notes: 'pinch shoulder blades, hold 1s' },
        { title: 'Glute Bridge',                prescribed: '3 × 10', tempo: '2-2-2' },
        { title: 'Dead Bug',                    prescribed: '3 × 6/side',             notes: 'breathe, don\'t brace hard' },
      ],
      dayB: [
        { title: 'DB Romanian Deadlift',        prescribed: '3 × 10', tempo: '3-1-1', notes: 'light · feel hamstrings' },
        { title: 'Half-Kneeling DB Press',      prescribed: '3 × 8/arm' },
        { title: 'Band Pull-Apart',             prescribed: '3 × 15' },
        { title: 'Side Plank',                  prescribed: '3 × 20s/side' },
        { title: 'Suitcase Carry',              prescribed: '3 × 20m/side',           notes: 'rib stack, no lean' },
      ],
      dayC: [
        { title: 'Walk',                        prescribed: '20-30 min',              notes: 'easy pace, nasal breathing' },
        { title: 'Goblet Squat',                prescribed: '3 × 8', tempo: '3-1-1' },
        { title: 'Bird Dog',                    prescribed: '3 × 6/side' },
        { title: 'Farmer Carry',                prescribed: '3 × 30m' },
      ],
    },
  },
  {
    id: 'athlete-conditioning-12',
    tag: 'Athletic',
    title: 'Athlete · Strength + Conditioning',
    titleHe: 'ספורטאי · כוח + מאמץ',
    tagHe: 'ספורטאי',
    audienceHe: 'ענפי שדה/קלעים, עונה או חוץ-עונה',
    durationHe: '12 שבועות · 4 ימים בשבוע',
    duration: '12 weeks · 4 days/week',
    audience: 'Field/court sport, in-season or off-season',
    summary:
      'Concurrent strength and conditioning template. Lift-day pairings keep aerobic and alactic work from cannibalising the strength block.',
    summaryHe:
      'תבנית כוח ומאמץ במקביל. שילוב חכם של ימי הרמה כדי שהעבודה האירובית והאלאקטית לא תגרע מבלוק הכוח.',
    highlights: [
      'Two strength + two conditioning days',
      'Sport-day RPE caps for in-season',
      'Sprint and change-of-direction blocks',
    ],
    highlightsHe: [
      'שני ימי כוח + שני ימי מאמץ',
      'תקרת RPE בימי משחק בעונה',
      'בלוקי ספרינט ושינוי כיוון',
    ],
    price: 380,
    currency: 'NIS',
    accent: '#ff9c44',
    level: 'Intermediate',
    equipment: ['Barbell', 'Dumbbells', 'Track or open space'],
    quiz: {
      levels: ['intermediate', 'advanced'],
      goals: ['sport', 'strength'],
      daysPerWeek: [4],
      forRehab: 'no',
    },
    // 2 strength + 2 conditioning days per week. Sport-day RPE caps
    // when in-season (lift only at RPE ≤7). Sprint and change-of-direction
    // blocks rotate every 2 weeks.
    sampleWeek: {
      dayA: [
        { title: 'Box Jump',                    prescribed: '5 × 3',                  notes: 'soft landings, full reset' },
        { title: 'Trap-Bar Deadlift',           prescribed: '4 × 5 @ RPE 7' },
        { title: 'Bulgarian Split Squat',       prescribed: '3 × 6/leg' },
        { title: 'Single-Leg RDL',              prescribed: '3 × 8/leg' },
        { title: 'Cable Pallof Press',          prescribed: '3 × 8/side' },
      ],
      dayB: [
        { title: 'A-Skip + High-Knee Drill',    prescribed: '3 × 20m',                notes: 'warm-up' },
        { title: '20m Sprint',                  prescribed: '6 × 20m',                notes: 'full recovery between reps' },
        { title: '5-10-5 Pro Agility',          prescribed: '6 reps',                 notes: 'change-of-direction' },
        { title: 'Sled Push',                   prescribed: '4 × 20m',                notes: 'moderate load' },
        { title: 'Side Plank',                  prescribed: '3 × 30s/side' },
      ],
      dayC: [
        { title: 'Push Press',                  prescribed: '4 × 5 @ RPE 7' },
        { title: 'Bench Press',                 prescribed: '4 × 6' },
        { title: 'Weighted Pull-Up',            prescribed: '4 × 5' },
        { title: 'DB Row',                      prescribed: '3 × 10/arm' },
        { title: 'Hanging Leg Raise',           prescribed: '3 × 8' },
      ],
      dayD: [
        { title: 'Easy Bike or Run',            prescribed: '20 min @ Z2',            notes: 'aerobic base, can hold conversation' },
        { title: 'Tempo Intervals',             prescribed: '6 × 1 min @ Z3 / 1 min walk' },
        { title: 'Farmer Carry',                prescribed: '4 × 40m' },
        { title: 'Dead Bug',                    prescribed: '3 × 8/side' },
      ],
    },
  },
];

// ───────────────────────────────────────────────────────────────────────────
// _TEMPLATE — copy this object as a starting point when adding a new program.
// Not exported, so it doesn't render. Just here as a fill-in-the-blanks form
// you can paste into PROGRAMS above.
// ───────────────────────────────────────────────────────────────────────────
//
// const _TEMPLATE = {
//   id: 'kebab-case-slug',
//   tag: 'Hypertrophy',                        // Chip label — adds a filter pill
//   title: 'Program Title',
//   duration: 'N weeks · X days/week',
//   audience: 'Who this is for, in one line',
//   summary: 'One or two sentences. The hook.',
//   highlights: [
//     'Distinct point #1',
//     'Distinct point #2',
//     'Distinct point #3',
//   ],
//   price: 0,                                  // NIS
//   currency: 'NIS',
//   accent: '#3BA0FF',                         // From the palette in the header comment
//   level: 'Intermediate',                     // 'Beginner' | 'Intermediate' | 'Advanced'
//   equipment: ['Barbell', 'Dumbbells'],       // Free-form
//   // Fill in once the program is real and you want a sample-week preview:
//   // sampleWeek: {
//   //   dayA: [
//   //     { title: 'Back Squat',     prescribed: '4×6 @ RPE 7', tempo: '3-1-1', notes: '' },
//   //     { title: 'Bench Press',    prescribed: '4×8 @ RPE 7' },
//   //     { title: 'Pendlay Row',    prescribed: '3×10' },
//   //   ],
//   //   dayB: [ /* ... */ ],
//   //   dayC: [ /* ... */ ],
//   // },
// };
