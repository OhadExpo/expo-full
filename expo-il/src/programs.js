// Catalog of training programs sold via the EXPO landing page.
// Each entry maps to a plan template that lives in the main expo-app.co.il
// Supabase. After payment, the trainee row is created (manually for now,
// auto-onboarded later) and a copy of the matching template plan is assigned.
//
// Editing this file is the canonical way to add/remove offerings — no DB
// migration needed for the catalog itself.

export const PROGRAMS = [
  {
    id: 'foundation-12',
    tag: 'Beginner',
    title: 'Foundation Block',
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
  },
  {
    id: 'fullbody-3day',
    tag: 'General',
    title: 'Full Body · 3-Day',
    duration: '12 weeks · 3 days/week',
    audience: 'Busy schedule, broad goals',
    summary:
      'Three full-body sessions hitting every primary pattern. Shortest path to a strong, capable body when time is tight.',
    highlights: [
      '~60 minutes per session',
      'Each primary pattern hit 3× weekly',
      'Cardio guidance for the off-days',
    ],
    price: 270,
    currency: 'NIS',
    accent: '#3BA0FF',
  },
  {
    id: 'hypertrophy-16',
    tag: 'Hypertrophy',
    title: 'Hypertrophy 16',
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
  },
  {
    id: 'powerbuild-12',
    tag: 'Powerbuild',
    title: 'PowerBuild',
    duration: '12 weeks · 4 days/week',
    audience: 'Want strength + size, no competing',
    summary:
      'Heavy compound work followed by hypertrophy assistance. Hybrid template that doesn\'t force you to pick a lane.',
    highlights: [
      'Top sets 80–90% 1RM on the main lifts',
      'Backoff sets for size',
      'Built-in deload week',
    ],
    price: 350,
    currency: 'NIS',
    accent: '#3BA0FF',
  },
  {
    id: 'glutes-8',
    tag: 'Specialty',
    title: 'Glutes Focused',
    duration: '8 weeks · 3 days/week',
    audience: 'Grow glutes without skipping the rest',
    summary:
      'Hinge-dominant training with hip thrust and abduction frequency. Upper body and core kept minimal but real.',
    highlights: [
      'Hip thrust + abduction 3×/week',
      'Single-leg work each session',
      'Bodyweight finishers',
    ],
    price: 240,
    currency: 'NIS',
    accent: '#ff9c44',
  },
  {
    id: 'home-minimal',
    tag: 'At-home',
    title: 'Home · Minimal Kit',
    duration: '12 weeks · 4 days/week',
    audience: 'Dumbbells + a bench, that\'s it',
    summary:
      'No barbell required. Built around adjustable dumbbells (or any pair) and a stable surface.',
    highlights: [
      'Tempo + pause work to compensate for low load',
      'No machines',
      'Mobility integrated into warm-ups',
    ],
    price: 220,
    currency: 'NIS',
    accent: '#28d95b',
  },
  {
    id: 'cut-lean-12',
    tag: 'Cut',
    title: 'Cut · Lean Phase',
    duration: '12 weeks · 4 days/week',
    audience: 'Training during a calorie deficit',
    summary:
      'Programming that respects the deficit: lower volume, intensity preserved, designed to keep your hard-earned muscle while you lose fat.',
    highlights: [
      'RPE-capped loads to manage fatigue',
      'Intensity sustained, volume reduced',
      'Step-loading deload every 4 weeks',
    ],
    price: 320,
    currency: 'NIS',
    accent: '#3BA0FF',
  },
  {
    id: 'rehab-return',
    tag: 'Rehab',
    title: 'Return to Training',
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
  },
  {
    id: 'couples-12',
    tag: 'Couples',
    title: 'Couples · Same Block',
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
  },
  {
    id: 'strength-peak-10',
    tag: 'Powerlifting',
    title: 'Peak Strength 10',
    duration: '10 weeks · 4 days/week',
    audience: 'Powerlifting prep · meet in 10 weeks',
    summary:
      'Volume → intensity → realisation peaking. Squat / bench / deadlift specialisation with minimal accessory.',
    highlights: [
      'Linear intensity ramp 70→95%',
      'Mock meet at week 8',
      'Dynamic effort day in the volume block',
    ],
    price: 420,
    currency: 'NIS',
    accent: '#3BA0FF',
  },
  {
    id: 'mobility-strength-8',
    tag: 'Mobility',
    title: 'Mobility + Strength',
    duration: '8 weeks · 3 days/week',
    audience: 'Stiff, desk-bound, want to feel athletic again',
    summary:
      'Loaded mobility and tempo work as the primary tool — not stretching. End-range strength for the hips, ankles, thoracic spine, and shoulders.',
    highlights: [
      'CARs + tempo squat/hinge as the main work',
      'Per-joint progressions you can keep using forever',
      'Low equipment requirement',
    ],
    price: 250,
    currency: 'NIS',
    accent: '#28d95b',
  },
  {
    id: 'athlete-conditioning-12',
    tag: 'Athletic',
    title: 'Athlete · Strength + Conditioning',
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
  },
];
