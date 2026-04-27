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
    highlights: [
      'Hinge / squat / push / pull / carry / rotation in every microcycle',
      'Tempo + ROM emphasis before load',
      'Barbell + dumbbells, no machines required',
    ],
    price: 290,
    currency: 'NIS',
    accent: '#3BA0FF',
    level: 'Beginner',
    equipment: ['Barbell', 'Dumbbells', 'Bench'],
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
    highlights: [
      'Volume escalation 60→90% week-on-week',
      'Push/Pull/Legs/Upper-Lower hybrid',
      'Optional BFR finishers',
    ],
    price: 390,
    currency: 'NIS',
    accent: '#39BDFF',
    level: 'Intermediate',
    equipment: ['Barbell', 'Dumbbells', 'Cables', 'Machines'],
  },
  {
    id: 'powerbuild-12',
    tag: 'Powerbuild',
    title: 'PowerBuild',
    titleHe: 'פאוורבילד',
    tagHe: 'כוח+מסה',
    audienceHe: 'כוח עם מסה, בלי לתחרות',
    durationHe: '12 שבועות · 4 ימים בשבוע',
    duration: '12 weeks · 4 days/week',
    audience: 'Want strength + size, no competing',
    summary:
      "Heavy compound work followed by hypertrophy assistance. Hybrid template that doesn't force you to pick a lane.",
    highlights: [
      'Top sets 80–90% 1RM on the main lifts',
      'Backoff sets for size',
      'Built-in deload week',
    ],
    price: 350,
    currency: 'NIS',
    accent: '#3BA0FF',
    level: 'Intermediate',
    equipment: ['Barbell', 'Dumbbells'],
  },
  {
    id: 'couples-12',
    tag: 'Couples',
    title: 'Couples · Same Block',
    titleHe: 'זוגות · אותו בלוק',
    tagHe: 'זוגות',
    audienceHe: 'שניים, אותה חדר כושר, מטרות דומות',
    durationHe: '12 שבועות · 3 ימים בשבוע לכל אחד',
    duration: '12 weeks · 3 days/week each',
    audience: 'Two people, same gym, similar goals',
    summary:
      'Two coordinated copies of the same block. Synchronised so you can warm up together and use each other as spotters.',
    highlights: [
      'Synchronised supersets where possible',
      'Different absolute loads, same %RM',
      'One purchase = two accounts',
    ],
    price: 540,
    currency: 'NIS',
    accent: '#39BDFF',
    level: 'Intermediate',
    equipment: ['Barbell', 'Dumbbells'],
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
    highlights: [
      'Per-exercise pain gate (0–3 OK, 4–5 modify, 6+ stop)',
      'Two-week reassess windows',
      'Coach-style cues built into each set',
    ],
    price: 320,
    currency: 'NIS',
    accent: '#ff5e5e',
    level: 'Beginner',
    equipment: ['Bands', 'Dumbbells'],
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
    highlights: [
      'Two strength + two conditioning days',
      'Sport-day RPE caps for in-season',
      'Sprint and change-of-direction blocks',
    ],
    price: 380,
    currency: 'NIS',
    accent: '#ff9c44',
    level: 'Intermediate',
    equipment: ['Barbell', 'Dumbbells', 'Track or open space'],
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
