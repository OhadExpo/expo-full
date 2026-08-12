// Fixtures for the auto-analyze collector (src/autoAnalyzeVideos.js).
// The coach ACTS on the bar-speed + symmetry this feeds, so WHICH clips get
// collected (and which are correctly excluded / de-duped) is safety-relevant:
// a clip attributed to the wrong athlete, or the same clip counted twice, would
// skew a velocity trend or an injury-watch read. These pin the STABLE invariants
// of collectAthleteFormVideos / pendingCount / isAnalyzed. (Couples-attribution
// semantics are pinned separately once the adversarial review lands.)
// Run: node scripts/verify-auto-analyze.mjs

// --- minimal browser shims so the module's import chain loads under Node ---
const _mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (_mem.has(k) ? _mem.get(k) : null),
  setItem: (k, v) => { _mem.set(k, String(v)); },
  removeItem: (k) => { _mem.delete(k); },
  clear: () => { _mem.clear(); },
};

const { collectAthleteFormVideos, pendingCount, isAnalyzed } = await import('../src/autoAnalyzeVideos.js');

let pass = 0, fail = 0;
const check = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); cond ? pass++ : fail++; };

// ── Fixture: one athlete "amit" with two logged workouts, each carrying a form video.
const cw = [
  {
    clientId: 'amit', date: '2026-05-01',
    exercises: [
      { title: 'Back Squat', sets: [{ load: '100' }, { load: '120' }, { load: '90' }] },
      { title: 'Bench Press', sets: [{ load: '80' }] },
    ],
    formVideos: [{ cloudUrl: 'https://x/sq1.mp4' }, { cloudUrl: 'https://x/bp1.mp4' }],
  },
  {
    clientId: 'amit', date: '2026-05-08',
    exercises: [{ name: 'Deadlift', sets: [{ load: '150' }] }],
    formVideos: [{ cloudUrl: 'https://x/dl1.mp4' }],
  },
  // A DIFFERENT athlete's workout — must never be attributed to amit.
  {
    clientId: 'ron', date: '2026-05-02',
    exercises: [{ title: 'Row', sets: [{ load: '60' }] }],
    formVideos: [{ cloudUrl: 'https://x/row1.mp4' }],
  },
];

const got = collectAthleteFormVideos(cw, 'amit');

// --- collection + exclusion ---
check('collects only amit\'s 3 clips (ron excluded)', got.length === 3);
check('no ron clip leaked in', !got.some((v) => v.url === 'https://x/row1.mp4'));
check('urls are the cloudUrls', got.map((v) => v.url).join(',') === 'https://x/sq1.mp4,https://x/bp1.mp4,https://x/dl1.mp4');

// --- title resolution: ex.title, then ex.name, then fallback ---
check('title from ex.title', got[0].title === 'Back Squat');
check('title from ex.name', got[2].title === 'Deadlift');

// --- load = MAX finite positive logged set load (keys velocity-by-load) ---
check('load = max of logged sets (120, not 100/90)', got[0].load === 120);
check('single-set load', got[1].load === 80);

// --- title fallback + null load when the exercise row is missing ---
const cw2 = [{ clientId: 'a', date: 'd', formVideos: [{ cloudUrl: 'u1' }], exercises: [] }];
const g2 = collectAthleteFormVideos(cw2, 'a');
check('missing exercise -> fallback title "Exercise 1"', g2[0].title === 'Exercise 1');
check('missing exercise -> load null', g2[0].load === null);

// --- non-positive / non-finite loads are ignored -> load null ---
const cw3 = [{ clientId: 'a', date: 'd', formVideos: [{ cloudUrl: 'u1' }], exercises: [{ title: 'T', sets: [{ load: '0' }, { load: 'x' }, { load: '-5' }] }] }];
check('all-invalid loads -> null', collectAthleteFormVideos(cw3, 'a')[0].load === null);

// --- dedup by cloudUrl (same clip logged twice never double-counts) ---
const cwDup = [
  { clientId: 'a', date: 'd1', formVideos: [{ cloudUrl: 'dup' }], exercises: [{ title: 'T' }] },
  { clientId: 'a', date: 'd2', formVideos: [{ cloudUrl: 'dup' }], exercises: [{ title: 'T' }] },
];
check('same cloudUrl across workouts -> collected once', collectAthleteFormVideos(cwDup, 'a').length === 1);

// --- skip a form video with no cloudUrl / skip workouts with no formVideos array ---
const cwHoles = [
  { clientId: 'a', date: 'd', formVideos: [{ cloudUrl: '' }, null, { cloudUrl: 'real' }], exercises: [] },
  { clientId: 'a', date: 'd', exercises: [{ title: 'T' }] }, // no formVideos
  { clientId: 'a', date: 'd', formVideos: 'nope', exercises: [] }, // formVideos not an array
];
const gh = collectAthleteFormVideos(cwHoles, 'a');
check('only the one real cloudUrl survives the holes', gh.length === 1 && gh[0].url === 'real');

// --- empty / guard inputs ---
check('null clientWorkouts -> []', collectAthleteFormVideos(null, 'a').length === 0);
check('no traineeId -> []', collectAthleteFormVideos(cw, '').length === 0);
check('undefined traineeId -> []', collectAthleteFormVideos(cw, undefined).length === 0);

// --- pendingCount + isAnalyzed round-trip via the localStorage shim ---
_mem.clear();
check('pendingCount = all 3 before any analyzed', pendingCount(cw, 'amit') === 3);
check('isAnalyzed false before marking', isAnalyzed('https://x/sq1.mp4') === false);
// simulate the runner marking one done
localStorage.setItem('expo-autopose-done-v1', JSON.stringify({ 'https://x/sq1.mp4': 1 }));
check('isAnalyzed true after marking', isAnalyzed('https://x/sq1.mp4') === true);
check('pendingCount drops to 2 after one analyzed', pendingCount(cw, 'amit') === 2);

console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ FAILURES'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
