// shotI18n.js — English + Hebrew for the Shot Analyzer (Ohad 08-24: "i want it
// to have a hebrew version clickable as well").
//
// Two layers:
//   UI    — every label the tool renders (top bar, player, scorecard chrome).
//   checks — the coaching content per checkpoint (label / target / why / how),
//           keyed by the engine's checkpoint key so shotAnalysis.js stays a
//           pure, language-free engine. Anything missing falls back to the
//           English the engine already returned, so a new checkpoint can never
//           render blank.
//
// Hebrew is written in the masculine-singular coaching register Ohad uses with
// athletes, not literary Hebrew, and the technical nouns stay in the words
// Israeli coaches actually say.

const armBand = (t) => `${t.arm[0]}–${t.arm[1]}°`;

export const SHOT_I18N = {
  en: {
    dir: 'ltr',
    // One label everywhere the toggle appears: the coach app header uses
    // EN / עב, and the analyzer said עברית / ENGLISH, so the same control
    // read differently depending on the screen (Ohad 08-30).
    langBtn: 'עב',
    langTitle: 'Switch the tool to Hebrew',
    back: '← BACK',
    hand: 'Hand', right: 'RIGHT', left: 'LEFT', auto: 'AUTO',
    // The trace toggle. It shipped reading T.wholeClip / T.thisShot with an
    // English fallback and no entry in either table, so a Hebrew user saw
    // "WHOLE CLIP" - caught by verify-shot-i18n.
    wholeClip: 'WHOLE CLIP',
    thisShot: 'THIS SHOT',
    handHint: 'Read from the clip — tap to set it yourself',
    autoHint: 'Back to reading it from the clip',
    shot: 'Shot',
    shotHint: 'Release-angle band — pick the shot distance',
    shotTypes: { ft: 'Free throw', mid: 'Mid-range', three: 'Three' },
    // the court's own short forms, shown only where the full word would not fit
    shotTypesShort: { ft: 'FT', mid: 'Mid', three: '3PT' },
    height: 'Height', cmPlaceholder: 'cm', saveBtn: 'SAVE',
    savedCm: '✓ SAVED', rescored: '✓ RESCORED', cmUnit: 'CM', forCm: 'FOR CM',

    idleTitle: 'Analyse a jump shot, frame by frame.',
    idleBlurb: 'EXPO tracks the body on every frame, finds the dip, set point, release, jump apex and follow-through, scores 10 mechanical checkpoints, and writes the fix guide — what to change, why it matters, how to train it.',
    tips: [
      ['SIDE VIEW', 'Film from the shooting-arm side, camera at chest height, 4–6 m away.'],
      ['WHOLE BODY', 'Feet to fingertips in frame through the release and the follow-through.'],
      ['ONE SHOT PER CLIP', 'Several shots in one clip are fine — each is scored and compared for consistency.'],
      ['60 FPS IF YOU CAN', 'Slow-mo / 60 fps gives sharper release timing. Steady phone, good light.'],
    ],
    record: 'RECORD →', gallery: 'FROM GALLERY', stopAnalyse: 'STOP & ANALYSE',
    progress: { 'checking the clip': 'checking the clip', 'loading the model': 'loading the model', 'loading the clip': 'loading the clip', 'finding the athlete': 'finding the athlete', 'filling the dropped frames': 'filling the dropped frames', 'loading the detailed model': 'loading the detailed model', 'reading the shots': 'reading the shots', 'following the ball': 'following the ball', done: 'done', '': 'reading the shot' },
    // The phone path (27.9, "stuck at 40%"): the watchdog line, its button, the
    // keep-the-screen-on line under the bar, and every capture failure by code
    // (shotCapture.js codeErr) - each says what to do next, never just "failed".
    stalled: (stage, s) => `still ${stage} — no progress for ${s}s`,
    stopRun: 'STOP',
    keepOn: 'Keep this screen on and this app in front until it finishes — the phone pauses the analysis when the screen locks or you switch apps.',
    liteModel: 'The detailed model did not load in time, so the shots were read with the fast model and the angles are less precise. Analyse again on Wi-Fi for the detailed read.',
    errors: {
      read: 'This video could not be opened. Pick it again, or film a new clip with the phone camera.',
      readTimeout: 'The video did not open within 45 seconds. Pick it again. If it lives in the cloud (Google Photos, Drive), download it to the phone first.',
      codec: 'This phone cannot play this video format (usually HEVC / HDR from another phone). Film it on this phone, or export it as a standard MP4 (H.264) and pick it again.',
      decode: 'The phone stopped decoding this video partway through. Export it as a standard MP4 (H.264), or film it again on this phone.',
      seek: 'The phone could not step through this video. Analyse again with the screen on, or film a shorter clip.',
      model: 'The body-tracking model did not load on this phone. Check the connection and analyse again.',
      noDuration: 'The length of this video could not be read. Pick it again, or film a new clip.',
      noPerson: 'I could not find a person in this clip. Film the whole body, side-on, in good light.',
      failed: 'The analysis stopped. Analyse the clip again.',
    },

    // The twelve-frame preflight. Every line names the phone action that
    // fixes it - the point is that he can still do something about it.
    preflight: {
      title: 'THIS CLIP CANNOT BE MEASURED PROPERLY',
      lede: 'Read off twelve frames, before the long analysis. Here is what the footage is missing.',
      measuredLabel: 'MEASURED',
      refilm: 'FILM IT AGAIN',
      anyway: 'ANALYSE ANYWAY',
      keys: {
        'no-body': 'NOBODY TRACKED',
        'rarely-seen': 'IN SHOT TOO LITTLE',
        'no-headroom': 'NO ROOM ABOVE HIS HEAD',
        'head-cut': 'HEAD CUT OFF',
        'too-far': 'TOO FAR AWAY',
        'low-res': 'TOO FEW PIXELS',
        'too-dark': 'TOO DARK',
      },
    },

    status: { ok: 'OK', watch: 'WATCH', fix: 'FIX', na: 'N/A' },
    phases: { stance: 'STANCE', dip: 'DIP', set: 'SET', release: 'RELEASE', apex: 'APEX', follow: 'FOLLOW', landing: 'LAND' },
    back10: 'Back 10 frames', prev1: 'Previous frame', next1: 'Next frame', fwd10: 'Forward 10 frames',
    phaseJump: (l) => `Jump to ${String(l).toLowerCase()} — stays on this moment when you switch shots`,
    metrics: { knee: 'Knee', hip: 'Hip', elbow: 'Elbow', armElev: 'Arm lift', forearm: 'Forearm', trunk: 'Trunk lean', wristEye: 'Wrist-eye', elbowOffset: 'Wrist-elbow' },

    save: 'SAVE SESSION', copy: 'COPY SUMMARY', print: 'PRINT REPORT', newClip: '↺ NEW CLIP',
    savedTitle: 'SAVED SESSIONS', savedNone: 'Nothing saved yet.', savedDrop: 'Remove',
    savedRow: (d, score, reps) => `${d} · ${score}/100 · ${reps} reps`,
    savedToast: 'Shot analysis saved', saveFail: 'Could not save', copiedToast: 'Summary copied', copyFail: 'Copy failed',

    verdictNa: 'Shot read', verdictOk: 'Clean mechanics', verdictMid: 'Solid base — a few things to tighten', verdictLow: 'Rebuild the chain from the legs up',
    quality: { good: 'good', fair: 'fair', poor: 'poor' },
    summary: (f, w, o, q, p, fps) => `${f} to fix · ${w} to watch · ${o} OK · tracking ${q} (${p}% of shot frames) · ${fps} fps`,
    shotOf: (i, n) => `VIEWING SHOT ${i} OF ${n} DETECTED`,
    // The one-row rep picker: SHOT 10 / 11 between two arrows.
    shotWord: 'SHOT', prevShot: 'Previous shot', nextShot: 'Next shot',
    tabShot: 'THIS SHOT', tabSession: 'SESSION', tabSaved: 'SAVED', sessionOne: 'One shot in this clip - the session view needs two or more.',
    autoBtn: 'AUTO MAKES - TAP THE RIM', rimTapL: 'TAP THE LEFT EDGE OF THE RIM ON THE VIDEO', rimTapR: 'NOW THE RIGHT EDGE', cancel: 'CANCEL',
    autoRunning: (p) => `CHECKING THE RIM · ${p}%`, autoDone: (m, x, u) => `AUTO: ${m} MADE · ${x} MISSED · ${u} TO CHECK`,
    autoTag: (c) => `AUTO · ${c}%`, autoCheck: 'AUTO · CHECK IT', autoUnsure: 'NOT SURE - MARK IT', rimRedo: 'REDO THE RIM', autoFail: 'COULD NOT READ THE RIM IN THIS VIDEO - MARK THE SHOTS BY HAND',
    // The dot on the option AUTO is using - detected, or the default when the
    // clip could not show it. Never both called a detection.
    autoPicked: 'AUTO: read from the clip',
    autoFallback: 'AUTO: the clip does not show it, so this is the default',
    // The clip-warning line, collapsed: the finding's title and this phrase.
    warnShort: {
      'no-body': 'film him in frame', 'rarely-seen': 'keep him in frame',
      'no-headroom': 'the ball leaves the frame', 'head-cut': 'tilt the phone up',
      'too-far': 'move closer', 'low-res': 'film at normal quality', 'too-dark': 'more light',
    },
    warnOpen: 'Show what the clip is missing', warnDismiss: 'Hide for this clip',
    atSec: (t) => `at ${t}s`,
    scopeHint: (n) => `scorecard = this shot · session = all ${n}`,
    shotTip: (i, t, s) => `Shot ${i} at ${t}s, score ${s}`,

    info: { dipToRelease: 'Dip → release', jumpRise: 'Jump rise', releaseHeight: 'Release height', armAtRelease: 'Arm at release', ballLaunch: 'Ball launch', ballSpeed: 'Release speed', ballRise: 'Arc height', releaseVsApex: 'Release vs apex', chain: 'Chain (from dip)', tracked: 'Tracked' },
    enterHeight: 'enter height', eyeHeight: '× eye', ofFrames: (p) => `${p}% of frames`,
    chainVal: (k, s, e) => `knee ${k} · arm ${s} · elbow ${e} ms`,
    consistencyLbl: (n) => `Consistency (${n} shots)`,
    consistencyVal: (r, a, se, t) => `rhythm ±${r}% · release arm ±${a}° · set elbow ±${se}° · timing ±${t} ms`,

    sessionTitle: (n) => `Session · ${n} shots detected`,
    // 'Release ht' replaced 'Fix first': that column said the same words on
    // every row of a real session, because the deviation pick behind it needs
    // three shots and most clips are shorter. Release height is on every rep.
    cols: ['#', 'At', 'Score', 'Dip', 'Set', 'Release', 'Timing', 'Release ht', 'Make'],
    toolTitle: 'SHOT ANALYZER',
    unitMs: ' ms', unitS: 's', unitMps: ' m/s', unitM: ' m', unitCm: ' cm', sideShort: { R: 'R', L: 'L' },
    // Ohad, 2026-09-07: "what does elbow offset and wrist vs eye measure? what's
    // the units? it doesnt say anything". Both are in TORSO lengths (shoulder
    // to hip), so the reading does not depend on how far the camera stood.
    unitTorso: ' torso',
    metricsHelp: {
      elbowOffset: 'How far the wrist sits sideways from directly above the elbow, in torso lengths. 0 = stacked; the target at the set is 0.25 or less.',
      wristEye: 'How far the wrist sits above (+) or below (−) the eye line, in torso lengths.',
    },
    frameOf: (i, n, sec) => `F${i}/${n} · ${sec}s`,
    // Makes are MARKED by the coach - the analyser has never seen the rim.
    made: 'MADE', missed: 'MISSED', markShot: 'THIS SHOT',
    makes: (m, n) => `${m}/${n} MAKES`, unmarked: (u) => `${u} not marked`,
    savedRowMakes: (m, n) => ` · ${m}/${n} makes`,
    cleanRow: 'clean',
    sessionAvg: 'Session average',
    launchSpread: 'Ball launch',
    spreadSpeed: 'Release speed',
    spreadRise: 'Arc',
    verdictSpeed: 'the force behind the shot is moving rep to rep — that is what misses long and short',
    verdictAngle: 'the release angle is moving rep to rep',
    sessionRepeatable: 'repeatable across the session',
    launchSpreadOn: (n, total) => `measured on ${n} of ${total}`,
    worstRep: (i, v, unit) => `watch rep ${i} — it released at ${v}${unit}`,
    verdictOutlier: (n) => `${n} of the reps repeat — one does not`,
    mmTitle: 'MAKES VS MISSES',
    mmNeed: (mk, ms, nMk, nMs, minMk, minMs) => `${mk} made and ${ms} missed marked. Comparing them needs at least ${minMk} made and ${minMs} missed - ${[nMk ? `${nMk} more made` : '', nMs ? `${nMs} more missed` : ''].filter(Boolean).join(' and ')} to go.`,
    mmMisses: (name) => `On your misses, ${name}`,
    mmMakes: 'on your makes',
    mmCounts: (x, y) => `${x} missed, ${y} made`,
    mmLeadNote: 'A lead to check on the video, not proof.',
    mmNone: (n) => `Nothing separates your makes from your misses on this clip (${n} readings compared).`,
    mmThirds: 'Makes by third of the clip',
    mmNames: { dip: 'the dip', set: 'the set elbow', releaseArm: 'the release arm', timing: 'the release timing', launch: 'the ball launch', speed: 'the release speed', rise: 'the arc', releaseHt: 'the release height' },
    gainPts: (n) => `+${n} pts if fixed`,
    vsLastHead: (d) => `vs the last analysis you SAVED (${d})`,
    vsScore: (was, now) => `${was} → ${now}`,
    vsBetter: 'fixed since then',
    vsWorse: 'slipped since then',
    vsSame: 'nothing changed status since then',
    vsNoPrev: '',
    unitSpeedProse: ' m/s',
    displayUnits: { torso: ' torso', ms: ' ms', inOrder: ' in order' },
    legendOnly: (k) => `Show only ${k}`,
    legendAll: 'Show all four',
    axisSolo: (label, side, unit) => `Y ${label} (${side})${unit ? ` ${unit}` : ''} · X time, seconds`,
    axisAll: 'Y each trace on its own scale · X time, seconds',
    measuredOnSide: (side) => `Measured on the shooting side · ${side}`,
    // The session read: what is solid, what is broken, what merely wanders.
    // Distinct from ballUnread: the ball WAS followed, it simply had already
    // left the hand before the tracker locked on, so the release angle is not
    // measurable on that rep. Saying 'could not be followed' there was wrong.
    ballAscent: 'The ball was already above the hand when tracking began, so the release angle and speed cannot be read on this rep.',
    ballFlat: 'The tracked flight barely rises, so it cannot be the shot — the angle would be wrong, and is not shown.',
    // The framing, not the tracker. Measured: the shooting wrist is at or above
    // the top edge at the instant of release, so the ball leaves the hand
    // outside the picture. Tilting up is the only fix, so say that.
    ballAboveFrame: 'The release happened above the top of the frame, so the ball readings are blank. Tilt the camera up — the hand must stay in shot at full extension. Everything measured from the body still stands.',
    onNorm: 'on his norm',
    sessionReadTitle: (n) => `ACROSS ALL ${n} REPS`,
    sessionSpan: 'best {b} · worst {w} · spread {s}',
    sessionSolid: 'HOLDING UP',
    sessionSolidLine: (label, ok, n) => `${label} — right on ${ok} of ${n}`,
    sessionBroken: 'WRONG ON MOST REPS',
    sessionBrokenLine: (label, bad, n) => `${label} — off on ${bad} of ${n}`,
    sessionWander: 'INCONSISTENT — REPEAT IT, DO NOT CHANGE IT',
    sessionWanderLine: (label, pct) => `${label} — right ${pct} of the time`,
    sessionFocus: 'FOCUS NEXT SESSION',
    // #424: ONE fault + ONE drill per session (the coaching research: one cue at a time)
    focusChange: (n, reps) => `Off on ${n} of ${reps} reps - a technical change, not more reps.`,
    focusRepeat: 'Right on some reps, off on others - repetition, not a change.',
    oneDrill: 'ONE DRILL',
    focusThen: 'After that:',
    trendFlat: 'Held the same level from the first reps to the last.',
    trendMoved: (dir, first, last, delta) => `Score ${dir} across the clip: ${first} to ${last}, ${delta} points.`,
    oblique: 'This shot was filmed at an angle — the ball moved AWAY from the camera, not across it. The rep-to-rep comparison and the angle spread still hold; the launch angle itself reads too steep, and the metres and m/s read low. Film square to the shot for those.',
    starved: (fps, n) => `The analysis only read ${fps} frames a second (${n} frames) — the rest were dropped while the model was still busy on the previous one. Shots can be MISSED at that rate. Close other tabs, keep this one in front, and analyse again.`,
    reanalysePrecise: 'ANALYSE FRAME BY FRAME (SLOWER, SEES EVERY FRAME)',
    ballUnread: 'The ball could not be followed on this rep, so the three ball readings are blank. Everything measured from the body still stands.',
    tight: 'repeatable',
    loose: 'inconsistent — the release angle is moving rep to rep',
    repeats: 'repeats across the session',
    noRepeats: 'no checkpoint failed on more than one shot.',

    checksTitle: (i, n) => `Checkpoints · shot ${i}${n > 1 ? ' of ' + n : ''}`,
    what: 'What ', why: 'Why ', how: 'How ', drills: 'Drills',
    measuredOk: (d) => `Measured ${d} — inside the target band.`,
    measuredBad: (d, t) => `Measured ${d}; target ${t}.`,
    jumpFrame: 'Jump to this frame',
    footnote: 'Targets are coach-readable bands, not laws — read them with the athlete in front of you. Release arm angle is the ARM; when the ball itself could be tracked, its true launch angle is shown beside it. Side-on filming is assumed for the trunk, elbow-offset and ball-launch reads.',
    legend: { knee: 'Knee', elbow: 'Elbow', armElev: 'Arm lift', hipHeight: 'Hip height' },
    copyHead: (s, h) => `EXPO Shot Analyzer — score ${s}/100 (${h} hand)`,
    copyFixFirst: 'FIX FIRST:',
    handWordR: 'right', handWordL: 'left',
    checks: {},
  },

  he: {
    dir: 'rtl',
    langBtn: 'EN',
    langTitle: 'חזרה לאנגלית',
    back: '→ חזרה',
    hand: 'יד', right: 'ימין', left: 'שמאל', auto: 'אוטומטי',
    wholeClip: 'כל הקליפ',
    thisShot: 'הזריקה הזאת',
    handHint: 'זוהתה בקליפ — לחץ כדי לקבוע בעצמך',
    autoHint: 'חזרה לזיהוי האוטומטי בקליפ',
    shot: 'סוג זריקה',
    shotHint: 'טווח זווית השחרור — תבחר את מרחק הזריקה',
    shotTypes: { ft: 'עונשין', mid: 'טווח בינוני', three: 'שלשה' },
    shotTypesShort: { ft: 'עונשין', mid: 'בינוני', three: 'שלשה' },
    height: 'גובה', cmPlaceholder: 'ס״מ', saveBtn: 'שמור',
    savedCm: '✓ נשמר', rescored: '✓ החישוב עודכן', cmUnit: 'ס״מ', forCm: 'לחישוב ס״מ',

    idleTitle: 'ניתוח זריקה, פריים אחר פריים.',
    idleBlurb: 'EXPO עוקב אחרי הגוף בכל פריים. הוא מסמן דיפ, נקודת סט, שחרור, שיא וליווי, ונותן ציון ל-10 נקודות בדיקה. בסוף אתה מקבל מדריך תיקון: מה לשנות, למה, ואיך לאמן את זה.',
    tips: [
      ['צילום מהצד', 'צלם מצד יד הזריקה, המצלמה בגובה החזה, במרחק 4–6 מ׳.'],
      ['כל הגוף בפריים', 'מכפות הרגליים עד קצות האצבעות, לאורך השחרור והליווי.'],
      ['זריקה אחת לקליפ', 'גם כמה זריקות בקליפ אחד זה בסדר — כל אחת מקבלת ציון, ומשווים ביניהן כדי לבדוק עקביות.'],
      ['60 פריימים לשנייה אם אפשר', 'סלואו-מושן / 60fps נותן תזמון שחרור מדויק יותר. טלפון יציב, תאורה טובה.'],
    ],
    // Forward CTA arrow points LEFT in RTL and sits at the logical end of the
    // string, so it renders on the visual left (Ohad's RTL arrow rule).
    record: 'צלם ←', gallery: 'מהגלריה', stopAnalyse: 'עצור ונתח',
    stalled: (stage, s) => `עדיין ${stage} — ${s} שניות בלי התקדמות`,
    stopRun: 'עצור',
    keepOn: 'תשאיר את המסך דלוק ואת האפליקציה פתוחה עד הסוף — הטלפון עוצר את הניתוח כשהמסך ננעל או כשאתה עובר לאפליקציה אחרת.',
    liteModel: 'המודל המפורט לא נטען בזמן, אז הזריקות נותחו עם המודל המהיר והזוויות פחות מדויקות. תנתח שוב על Wi-Fi כדי לקבל ניתוח מפורט.',
    errors: {
      read: 'לא הצלחתי לפתוח את הסרטון. תבחר אותו שוב, או צלם קליפ חדש במצלמה של הטלפון.',
      readTimeout: 'הסרטון לא נפתח תוך 45 שניות. תבחר אותו שוב. אם הוא שמור בענן (Google Photos, Drive), תוריד אותו קודם לטלפון.',
      codec: 'הטלפון לא יודע לנגן את הפורמט של הסרטון הזה (בדרך כלל HEVC / HDR מטלפון אחר). צלם אותו בטלפון הזה, או תייצא אותו כ-MP4 רגיל (H.264) ותבחר אותו שוב.',
      decode: 'הטלפון הפסיק לפענח את הסרטון באמצע. תייצא אותו כ-MP4 רגיל (H.264), או צלם אותו שוב בטלפון הזה.',
      seek: 'הטלפון לא הצליח לעבור על הסרטון פריים אחרי פריים. תנתח שוב כשהמסך דלוק, או צלם קליפ קצר יותר.',
      model: 'מודל מעקב הגוף לא נטען בטלפון הזה. תבדוק את החיבור ותנתח שוב.',
      noDuration: 'לא הצלחתי לזהות את האורך של הסרטון. תבחר אותו שוב, או צלם קליפ חדש.',
      noPerson: 'לא מצאתי אדם בקליפ. צלם את כל הגוף, מהצד, בתאורה טובה.',
      failed: 'הניתוח נעצר. תנתח את הקליפ שוב.',
    },
    progress: { 'checking the clip': 'בודק את הקליפ', 'loading the model': 'טוען את המודל', 'loading the clip': 'טוען את הקליפ', 'finding the athlete': 'מאתר את השחקן', 'filling the dropped frames': 'משלים פריימים חסרים', 'loading the detailed model': 'טוען את המודל המפורט', 'reading the shots': 'מנתח את הזריקות', 'following the ball': 'עוקב אחרי הכדור', done: 'סיום', '': 'מנתח את הזריקה' },

    preflight: {
      title: 'אי אפשר למדוד את הקליפ הזה כמו שצריך',
      lede: 'בדקנו 12 פריימים לפני הניתוח המלא. זה מה שחסר בצילום.',
      measuredLabel: 'מדדנו',
      refilm: 'לצלם שוב',
      anyway: 'לנתח בכל זאת',
      keys: {
        'no-body': 'לא זוהה אף אחד',
        'rarely-seen': 'כמעט לא בפריים',
        'no-headroom': 'אין מקום מעל הראש',
        'head-cut': 'הראש חתוך',
        'too-far': 'רחוק מדי',
        'low-res': 'מעט מדי פיקסלים',
        'too-dark': 'חשוך מדי',
      },
    },

    status: { ok: 'תקין', watch: 'במעקב', fix: 'לתיקון', na: 'אין' },
    phases: { stance: 'עמידה', dip: 'דיפ', set: 'סט', release: 'שחרור', apex: 'שיא', follow: 'ליווי', landing: 'נחיתה' },
    back10: 'אחורה 10 פריימים', prev1: 'פריים קודם', next1: 'פריים הבא', fwd10: 'קדימה 10 פריימים',
    phaseJump: (l) => `קפיצה ל${l} — נשאר על אותו רגע גם כשמחליפים זריקה`,
    metrics: { knee: 'ברך', hip: 'ירך', elbow: 'מרפק', armElev: 'זווית זרוע', forearm: 'זווית אמה', trunk: 'נטיית גו', wristEye: 'יד מול עין', elbowOffset: 'סטיית מרפק' },

    save: 'שמור את האימון', copy: 'העתקת סיכום', print: 'הדפסת דוח', newClip: '↺ קליפ חדש',
    savedTitle: 'אימונים שנשמרו', savedNone: 'עדיין לא שמרת כלום.', savedDrop: 'מחק',
    savedRow: (d, score, reps) => `${d} · ${score}/100 · ${reps === 1 ? 'זריקה אחת' : `${reps} זריקות`}`,
    savedToast: 'ניתוח הזריקה נשמר', saveFail: 'השמירה נכשלה', copiedToast: 'הסיכום הועתק', copyFail: 'ההעתקה נכשלה',

    verdictNa: 'הזריקה נותחה', verdictOk: 'מכניקה נקייה', verdictMid: 'בסיס טוב — יש כמה דברים להדק', verdictLow: 'בונים את השרשרת מחדש מהרגליים למעלה',
    quality: { good: 'טוב', fair: 'בינוני', poor: 'חלש' },
    summary: (f, w, o, q, p, fps) => `${f} לתיקון · ${w} למעקב · ${o === 1 ? 'אחת תקינה' : `${o} תקינות`} · מעקב ${q} (${p}% מפריימי הזריקה) · ${fps} פריימים לשנייה`,
    shotOf: (i, n) => `צופה בזריקה ${i} מתוך ${n} שזוהו`,
    shotWord: 'זריקה', prevShot: 'הזריקה הקודמת', nextShot: 'הזריקה הבאה',
    tabShot: 'הזריקה הזאת', tabSession: 'האימון', tabSaved: 'שמורים', sessionOne: 'בקליפ יש רק זריקה אחת — לתצוגת האימון צריך לפחות שתיים.',
    autoBtn: 'זיהוי קליעות אוטומטי — סמן את החישוק', rimTapL: 'גע בקצה השמאלי של החישוק בווידאו', rimTapR: 'עכשיו בקצה הימני', cancel: 'ביטול',
    autoRunning: (p) => `בודק את החישוק · ${p}%`, autoDone: (m, x, u) => `אוטומטי: קליעות ${m} · החטאות ${x} · לבדיקה ${u}`,
    autoTag: (c) => `אוטומטי · ${c}%`, autoCheck: 'אוטומטי · כדאי לבדוק', autoUnsure: 'לא בטוח - סמן בעצמך', rimRedo: 'סמן את החישוק מחדש', autoFail: 'לא הצלחתי לזהות את החישוק בווידאו — סמן את הזריקות בעצמך',
    autoPicked: 'אוטומטי: זוהה בקליפ',
    autoFallback: 'אוטומטי: לא רואים את זה בקליפ, אז זו ברירת המחדל',
    warnShort: {
      'no-body': 'צלם אותו בתוך הפריים', 'rarely-seen': 'תשאיר אותו בפריים',
      'no-headroom': 'הכדור יוצא מהפריים', 'head-cut': 'תטה את הטלפון למעלה',
      'too-far': 'תתקרב', 'low-res': 'צלם באיכות רגילה', 'too-dark': 'צריך יותר אור',
    },
    warnOpen: 'מה חסר בצילום', warnDismiss: 'הסתר בקליפ הזה',
    atSec: (t) => `בשנייה ${t}`,
    scopeHint: (n) => `כרטיס הניקוד = הזריקה הזאת · האימון = כל ${n}`,
    shotTip: (i, t, s) => `זריקה ${i} בשנייה ${t}, ניקוד ${s}`,

    info: { dipToRelease: 'דיפ ← שחרור', jumpRise: 'גובה קפיצה', releaseHeight: 'גובה שחרור', armAtRelease: 'זווית יד בשחרור', ballLaunch: 'זווית שיגור הכדור', ballSpeed: 'מהירות שחרור', ballRise: 'גובה הקשת', releaseVsApex: 'שחרור מול שיא', chain: 'שרשרת (מהדיפ)', tracked: 'מעקב' },
    enterHeight: 'תכניס גובה', eyeHeight: '× גובה עין', ofFrames: (p) => `${p}% מהפריימים`,
    chainVal: (k, s, e) => `ברך ${k} · זרוע ${s} · מרפק ${e} מ״ש`,
    consistencyLbl: (n) => `עקביות (${n} זריקות)`,
    consistencyVal: (r, a, se, t) => `סטייה בין הזריקות — קצב ${r}% · יד בשחרור ${a} מעלות · מרפק בסט ${se} מעלות · תזמון ${t} מ״ש`,

    sessionTitle: (n) => `אימון · ${n === 1 ? 'זוהתה זריקה אחת' : `זוהו ${n} זריקות`}`,
    cols: ['#', 'זמן', 'ניקוד', 'דיפ', 'סט', 'שחרור', 'תזמון', 'גובה שחרור', 'נכנס?'],
    // Ohad, 2026-09-07, on this screen: "i want everything in hebrew here".
    toolTitle: 'ניתוח זריקה',
    // The last Latin on the Hebrew screen was units: MS, S and the (R) legend.
    unitMs: ' מ״ש', unitS: ' שנ׳', unitMps: ' מ׳/שנ׳', unitM: ' מ׳', unitCm: ' ס״מ', sideShort: { R: 'ימ׳', L: 'שמ׳' },
    unitTorso: ' גו',
    metricsHelp: {
      elbowOffset: 'כמה שורש כף היד זז הצידה מקו ישר מעל המרפק, ביחידות אורך גו (כתף עד ירך). 0 = מיושר; היעד בסט הוא עד 0.25.',
      wristEye: 'כמה שורש כף היד מעל (+) או מתחת (−) לקו העיניים, ביחידות אורך גו.',
    },
    frameOf: (i, n, sec) => `פריים ${i}/${n} · ${sec} שנ׳`,
    made: 'נכנס', missed: 'החטאה', markShot: 'הזריקה הזאת',
    makes: (m, n) => `${m}/${n} קליעות`, unmarked: (u) => (u === 1 ? 'אחת לא סומנה' : `${u} לא סומנו`),
    savedRowMakes: (m, n) => ` · ${m}/${n} קליעות`,
    cleanRow: 'נקי',
    sessionAvg: 'ממוצע האימון',
    launchSpread: 'זווית שיגור',
    spreadSpeed: 'מהירות שחרור',
    spreadRise: 'קשת',
    verdictSpeed: 'הכוח בזריקה משתנה מחזרה לחזרה — בגלל זה הכדור נופל פעם ארוך ופעם קצר',
    verdictAngle: 'זווית השחרור זזה בין חזרה לחזרה',
    sessionRepeatable: 'עקבי לאורך האימון',
    launchSpreadOn: (n, total) => `נמדדה ב-${n} מתוך ${total}`,
    worstRep: (i, v, unit) => `תסתכל על חזרה ${i}: שחררת שם ב-${v}${unit}`,
    verdictOutlier: (n) => `${n} חזרות יצאו אותו דבר. אחת לא`,
    mmTitle: 'קליעות מול החטאות',
    mmNeed: (mk, ms, nMk, nMs, minMk, minMs) => {
      const more = [nMk ? (nMk === 1 ? 'זריקה אחת שנכנסה' : `${nMk} קליעות`) : '', nMs ? (nMs === 1 ? 'החטאה אחת' : `${nMs} החטאות`) : ''].filter(Boolean).join(' ועוד ');
      return `סימנת עד עכשיו: קליעות ${mk}, החטאות ${ms}. כדי להשוות ביניהן צריך לפחות ${minMk} קליעות ו-${minMs} החטאות. נשאר לסמן עוד ${more}.`;
    },
    mmMisses: (name) => `בהחטאות, ${name}`,
    mmMakes: 'בקליעות',
    mmCounts: (x, y) => `החטאות ${x}, קליעות ${y}`,
    mmLeadNote: 'זה כיוון לבדוק בווידאו, לא הוכחה.',
    mmNone: (n) => `בקליפ הזה אין מדד שמבדיל בין הקליעות להחטאות שלך (בדקתי ${n} מדדים).`,
    mmThirds: 'קליעות בכל שליש של הקליפ',
    mmNames: { dip: 'הדיפ', set: 'המרפק בסט', releaseArm: 'היד בשחרור', timing: 'תזמון השחרור', launch: 'זווית השיגור', speed: 'מהירות השחרור', rise: 'הקשת', releaseHt: 'גובה השחרור' },
    gainPts: (n) => `${n === 1 ? 'עוד נקודה אחת' : `עוד ${n} נקודות`} אם מתקנים`,
    vsLastHead: (d) => `מול הניתוח האחרון ששמרת (${d})`,
    vsScore: (was, now) => `${was} ← ${now}`,
    vsBetter: 'השתפר מאז',
    vsWorse: 'ירד מאז',
    vsSame: 'שום נקודה לא שינתה סטטוס מאז',
    vsNoPrev: '',
    unitSpeedProse: ' מ׳/שנ׳',
    displayUnits: { torso: ' גו', ms: ' מ״ש', inOrder: ' בסדר הנכון' },
    legendOnly: (k) => `הצג רק ${k}`,
    legendAll: 'הצג הכל',
    axisSolo: (label, side, unit) => `ציר Y ${label} (${side})${unit ? ` ${unit}` : ''} · ציר X זמן בשניות`,
    axisAll: 'כל קו בסקלה שלו · ציר X זמן בשניות',
    measuredOnSide: (side) => `נמדד בצד הזורק · ${side}`,
    ballAscent: 'הכדור כבר היה מעל היד כשהמעקב התחיל, אז אי אפשר לקרוא זווית ומהירות שחרור בזריקה הזאת.',
    ballFlat: 'המסלול שעקבנו אחריו כמעט לא עולה, אז זה לא יכול להיות מסלול של זריקה. הזווית שלו הייתה יוצאת שגויה, ולכן היא לא מוצגת.',
    ballAboveFrame: 'השחרור יצא מעל הפריים, ולכן נתוני הכדור ריקים. תטה את המצלמה למעלה — היד צריכה להישאר בתמונה ביישור מלא. כל מה שנמדד מהגוף עדיין תקף.',
    onNorm: 'בטווח הרגיל שלו',
    sessionReadTitle: (n) => (n === 1 ? 'הזריקה' : `כל ${n} הזריקות`),
    sessionSpan: 'הכי טוב {b} · הכי חלש {w} · פער {s}',
    sessionSolid: 'יציב',
    sessionSolidLine: (label, ok, n) => `${label} — תקין ב-${ok} מתוך ${n}`,
    sessionBroken: 'שגוי ברוב הזריקות',
    sessionBrokenLine: (label, bad, n) => `${label} — חורג ב-${bad} מתוך ${n}`,
    sessionWander: 'לא עקבי — חזור על זה, אל תשנה',
    sessionWanderLine: (label, pct) => `${label} — תקין ב-${pct} מהזריקות`,
    sessionFocus: 'פוקוס לאימון הבא',
    focusChange: (n, reps) => `לא תקין ב-${n} מתוך ${reps} חזרות - צריך שינוי טכני, לא עוד חזרות.`,
    focusRepeat: 'בחלק מהחזרות תקין ובחלק לא — צריך לחזור על זה, לא לשנות.',
    oneDrill: 'תרגיל אחד',
    focusThen: 'אחר כך:',
    trendFlat: 'שמר על אותה רמה מהזריקות הראשונות עד האחרונות.',
    trendMoved: (dir, first, last, delta) => (dir === 'declined'
      ? `הציון ירד לאורך הקליפ: מ-${first} ל-${last}, ${delta} נקודות.`
      : `הציון עלה לאורך הקליפ: מ-${first} ל-${last}, ${delta} נקודות.`),
    oblique: 'הזריקה הזאת צולמה בזווית — הכדור התרחק מהמצלמה במקום לנוע לרוחב. ההשוואה בין החזרות והפיזור של הזווית עדיין אמינים. זווית הזריקה עצמה יוצאת תלולה מדי, והמרחק והמהירות יוצאים נמוכים מדי. כדי למדוד אותם נכון, צלם מהצד, בניצב לכיוון הזריקה.',
    starved: (fps, n) => `הניתוח הספיק לקרוא רק ${fps} פריימים לשנייה (${n} פריימים) — השאר נפלו כשהמודל עוד עבד על הקודם. בקצב כזה אפשר לפספס זריקות. סגור לשוניות אחרות, תשאיר את זו מלפנים ונתח שוב.`,
    reanalysePrecise: 'ניתוח פריים אחר פריים (איטי יותר, רואה כל פריים)',
    ballUnread: 'לא הצלחנו לעקוב אחרי הכדור בחזרה הזאת, אז נתוני הכדור ריקים. מה שנמדד מהגוף עדיין תקף.',
    tight: 'עקבי',
    loose: 'לא עקבי — זווית השחרור זזה בין חזרה לחזרה',
    repeats: 'חוזר על עצמו לאורך האימון',
    noRepeats: 'אף נקודת בדיקה לא נכשלה ביותר מזריקה אחת.',

    checksTitle: (i, n) => `נקודות בקרה · זריקה ${i}${n > 1 ? ' מתוך ' + n : ''}`,
    what: 'מה ', why: 'למה ', how: 'איך ', drills: 'תרגילים',
    measuredOk: (d) => `נמדד ${d} — בתוך טווח היעד.`,
    measuredBad: (d, t) => `נמדד ${d}; היעד ${t}.`,
    jumpFrame: 'קפיצה לפריים הזה',
    footnote: 'היעדים הם טווחים לשיקול של המאמן, לא חוקים — בדוק אותם מול השחקן שעומד לפניך. זווית היד בשחרור מודדת את היד, לא את הכדור. כשאפשר לעקוב אחרי הכדור עצמו, זווית השיגור האמיתית שלו מוצגת לידה. המדידות של הגו, סטיית המרפק וזווית שיגור הכדור נכונות רק בצילום מהצד.',
    legend: { knee: 'ברך', elbow: 'מרפק', armElev: 'זווית זרוע', hipHeight: 'גובה ירך' },
    copyHead: (s, h) => `EXPO מנתח זריקה — ניקוד ${s}/100 (יד ${h})`,
    copyFixFirst: 'לתקן קודם:',
    handWordR: 'ימין', handWordL: 'שמאל',

    // Coaching content — same bands, Hebrew words.
    checks: {
      dip: {
        label: 'עומק הדיפ',
        target: '105–140 מעלות בברך בתחתית הדיפ',
        why: 'הרגליים הן המנוע. דיפ רדוד מדי מכריח את היד לייצר את כל הכוח — זריקה שטוחה שיוצאת רק מהידיים ונופלת קצרה מרחוק. דיפ עמוק מדי מאט את הקצב ונותן להגנה להתקרב. כיפוף ברך בינוני שומר גם על דחיפת רגליים וגם על קצב.',
        how: ['פול-אפ אחרי כדרור אחד: ספור בקול "למטה-למעלה" — ה"למטה" זה הדיפ, ה"למעלה" זו העלייה.', 'זריקות פורמה מ-2–3 מ׳: 10 חזרות בלי לשנות כלום חוץ מדיפ קבוע של רבע סקוואט.', 'צלם 5 עונשין מהצד ותשווה את פריים הדיפ — אותו עומק בכל חזרה.'],
      },
      setHeight: {
        label: 'גובה נקודת הסט',
        target: 'שורש כף היד בגובה קו העיניים או מעליו בנקודת הסט',
        why: 'נקודת סט גבוהה מעלה את גובה השחרור, ולכן הכדור נכנס לחישוק בזווית תלולה יותר — מרווח טעות גדול יותר. וגם הרבה יותר קשה לחסום זריקה כזאת.',
        how: ['זריקות פורמה לקיר: עמוד 30 ס״מ מהקיר, תביא את הכדור למצח ותיישר את היד למעלה בלי שהמרפק ייגע בקיר.', 'זריקה עם עצירה: תחזיק את הסט שנייה, בדוק ששורש כף היד בגובה הגבה, ואז שחרר.', 'דימוי: "כדור למצח, לא לסנטר".'],
      },
      setElbow: {
        label: 'מרפק בסט',
        target: 'זווית מרפק של 75–105 מעלות בערך בנקודת הסט (צורת L)',
        why: 'מרפק בצורת L בנקודת הסט משאיר מספיק טווח ליישור — ככה השחרור יוצא חלק וישר. מרפק שכבר פתוח (מעל 120 מעלות) דוחף את הכדור. מרפק סגור מאוד (מתחת ל-65 מעלות) מוריד את נקודת הסט ומאריך את השחרור.',
        how: ['חזרות מול מראה: תביא את הכדור לסט וחפש את ה-L — אמה אנכית, זרוע עליונה מקבילה לרצפה.', 'זריקות פורמה ביד אחת, יד תומכת מחוץ לכדור, מ-2 מ׳, 20 חזרות.'],
      },
      elbowAlign: {
        label: 'מרפק מתחת לכדור',
        target: 'שורש כף היד בערך מעל המרפק בסט (סטייה עד 0.25 גו)',
        why: 'כשהמרפק מתחת לשורש כף היד, היישור דוחף את הכדור ישר לחישוק. מרפק שנפתח החוצה או נגרר מוסיף רכיב צידי שהיד צריכה לתקן — זו החטאת הימין/שמאל הקלאסית.',
        how: ['תרגיל החלקה בקיר: כתף יד הזריקה לקיר, המרפק נוגע קלות בקיר לאורך כל היישור.', 'דימוי: "מרפק לחישוק" — הוא מצביע על המטרה לפני שהיד יוצאת.', 'שליטה ביד התומכת: היד השנייה נשארת בצד הכדור עד השחרור, ואז עוזבת אותו בלי לדחוף.'],
      },
      releaseExt: {
        label: 'יישור מרפק בשחרור',
        target: '160 מעלות ויותר בשחרור (יישור מלא)',
        why: 'יישור מלא נותן את המנוף הארוך ביותר ואת נקודת השחרור הגבוהה ביותר, ומאפשר לשורש כף היד להצליף כחוליה האחרונה בשרשרת. יד קצרה (מתחת ל-145 מעלות) דוחפת את הכדור מהכתף — קשת נמוכה ומרחק לא עקבי.',
        how: ['"תיכנס עם היד לחישוק" — האצבעות מסיימות מכוונות אליו, המרפק נעול.', 'זריקות מכיסא: זריקות פורמה בישיבה, כך שהכוח חייב להגיע מהיישור ומשורש כף היד ולא מהרגליים.', 'חזרות צל בחצי מהירות — תחזיק את הסיום המיושר 2 שניות.'],
      },
      releaseArm: {
        label: 'זווית היד בשחרור',
        target: null, // built from the shot-type band in localiseCheck()
        why: 'זווית האמה בשחרור קובעת את זווית השיגור של הכדור. שטוחה מדי — חלון הכניסה לחישוק מצטמצם. תלולה מדי — מפסידים מרחק ותזמון. זו זווית היד. את הזווית האמיתית של הכדור אפשר למדוד רק כשעוקבים אחרי הכדור עצמו.',
        how: ['תרגיל קשת: זרוק מעל מטרה 30–40 ס״מ מעל החישוק (יד של שותף על ארגז) — רק סוויש.', 'דימוי: "זרוק למעלה, לא ישר לחישוק" — כוון לנקודה הגבוהה של הקשת, לא לחישוק.', 'צלם מהצד: אצבעות הליווי מסיימות גבוה, לא מצביעות שטוח על החישוק.'],
      },
      timing: {
        label: 'שחרור מול שיא הקפיצה',
        target: 'שחרור בין 120 מ״ש לפני השיא ל-60 מ״ש אחריו',
        why: 'שחרור בשיא הקפיצה או רגע לפניו מנצל את דחיפת הרגליים ואת נקודת השחרור הגבוהה ביותר. שחרור בדרך למטה מוסיף מהירות גוף כלפי מטה שהיד צריכה להתגבר עליה, ומוריד את השחרור.',
        how: ['זריקות בקצב: "1-2-מעלה" — השחרור מסתיים על ה"מעלה".', 'ג׳אמפ-סטופ לזריקה אחרי מסירה. שותף קורא "מאוחר" כשהרגליים כבר יורדות.', 'אם השחרור תמיד מאוחר — קצר את הדיפ, הקפיצה לוקחת יותר מדי זמן.'],
      },
      sequence: {
        label: 'סדר השרשרת הקינטית',
        target: 'רגליים ← כתף ← מרפק, בסדר הזה',
        why: 'הכוח עולה מהרצפה למעלה: הברכיים מסיימות להתיישר קודם, אחר כך הכתף עולה, ואז המרפק נפתח ושורש כף היד מצליף. כשהיד יוצאת לפני שהרגליים סיימו, כל הזריקה באה מהיד — אין לה כוח מרחוק, והיא מתפרקת כשאתה מתעייף.',
        how: ['חזרות איטיות "למטה-למעלה-החוצה": תרגיש שהרגליים מסיימות לפני שהיד יוצאת.', 'זריקות פורמה בתנועה אחת קרוב לחישוק, ותתרחק בהדרגה — אותו סדר בכל מרחק.', 'דימוי: "דחוף את הרצפה, ואז את הכדור".'],
      },
      follow: {
        label: 'החזקת הליווי',
        target: 'יד מוחזקת גבוה 300 מ״ש ומעלה אחרי השחרור, שורש כף יד כפוף',
        why: 'הליווי מעיד על יישור מלא ועל הצלפה מלאה של שורש כף היד. אם היד יורדת מוקדם, כמעט תמיד ההצלפה נקטעה, ואז אתה מפסיד את הסיבוב האחורי שמרכך את הכדור.',
        how: ['"תחזיק עד שהכדור נוגע" — תקפיא את הסיום עד שהכדור מגיע לחישוק, בכל חזרה, אימון שלם.', 'דימוי: "יד בתוך צנצנת העוגיות" — אצבעות יורדות מעל החישוק בסיום.'],
      },
      trunk: {
        label: 'הגו בשחרור',
        target: 'כמעט אנכי (נטייה עד 10 מעלות) בשחרור',
        why: 'גו אנכי שומר על כתפיים מיושרות למטרה ועל שחרור כמה שיותר גבוה. נטייה או פייד מזיזים את נקודת השחרור בכל חזרה (אלא אם הפייד מכוון). נטייה קדימה בקבלת הכדור בדרך כלל אומרת שהרגליים איחרו.',
        how: ['רגליים קודם: תנחת בג׳אמפ-סטופ עם רגליים מסודרות וחזה זקוף לפני שהכדור מגיע.', 'זריקות בכריעה גבוהה (טול-נילינג), 10 חזרות — הגו לא יכול לנטות.', 'החזקות RDL על רגל אחת 3×20 שניות לשיווי המשקל ולבסיס היציב.'],
      },
    },
  },
};

// Localised copy of a scored checkpoint — falls back to the engine's English.
export function localiseCheck(check, L, typeSpec) {
  const t = L && L.checks && L.checks[check.key];
  if (!t) return check;
  let target = t.target;
  if (check.key === 'releaseArm' && typeSpec) {
    const name = (L.shotTypes && L.shotTypes[typeSpec.key]) || typeSpec.label;
    target = L.dir === 'rtl'
      ? `אמה ${typeSpec.arm[0]}–${typeSpec.arm[1]} מעלות מעל האופק בשחרור (${name})`
      : `Forearm ${armBand(typeSpec)} above horizontal at release (${String(name).toLowerCase()})`;
  }
  // The display string is built by the analysis engine in English (" torso",
  // " ms", " in order"), which then rendered untranslated inside the Hebrew
  // panel — "TORSO 0.27" in the middle of a Hebrew row. Swap the unit here,
  // where the language is known, rather than threading it through the engine.
  let display = check.display;
  const U = L.displayUnits;
  if (U && typeof display === 'string') {
    display = display.replace(' torso', U.torso).replace(' ms', U.ms).replace(' in order', U.inOrder);
  }
  return { ...check, display, label: t.label || check.label, target: target || check.target, why: t.why || check.why, how: t.how || check.how };
}
