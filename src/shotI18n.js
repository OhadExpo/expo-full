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
    handHint: 'Read from the clip — tap to set it yourself',
    autoHint: 'Back to reading it from the clip',
    shot: 'Shot',
    shotHint: 'Release-angle band — pick the shot distance',
    shotTypes: { ft: 'Free throw', mid: 'Mid-range', three: 'Three' },
    height: 'Height', cmPlaceholder: 'cm',
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
    progress: { 'finding the athlete': 'finding the athlete', 'reading the shots': 'reading the shots', done: 'done', '': 'reading the shot' },

    status: { ok: 'OK', watch: 'WATCH', fix: 'FIX', na: 'N/A' },
    phases: { stance: 'STANCE', dip: 'DIP', set: 'SET', release: 'RELEASE', apex: 'APEX', follow: 'FOLLOW', landing: 'LAND' },
    back10: 'Back 10 frames', prev1: 'Previous frame', next1: 'Next frame', fwd10: 'Forward 10 frames',
    phaseJump: (l) => `Jump to ${String(l).toLowerCase()} — stays on this moment when you switch shots`,
    metrics: { knee: 'Knee', hip: 'Hip', elbow: 'Elbow', armElev: 'Arm elev.', forearm: 'Forearm ∠', trunk: 'Trunk lean', wristEye: 'Wrist vs eye', elbowOffset: 'Elbow offset' },

    save: 'SAVE SESSION', copy: 'COPY SUMMARY', print: 'PRINT REPORT', newClip: '↺ NEW CLIP',
    savedTitle: 'SAVED SESSIONS', savedNone: 'Nothing saved yet.', savedDrop: 'Remove',
    savedRow: (d, score, reps) => `${d} · ${score}/100 · ${reps} reps`,
    savedToast: 'Shot analysis saved', saveFail: 'Could not save', copiedToast: 'Summary copied', copyFail: 'Copy failed',

    verdictNa: 'Shot read', verdictOk: 'Clean mechanics', verdictMid: 'Solid base — a few things to tighten', verdictLow: 'Rebuild the chain from the legs up',
    quality: { good: 'good', fair: 'fair', poor: 'poor' },
    summary: (f, w, o, q, p, fps) => `${f} to fix · ${w} to watch · ${o} OK · tracking ${q} (${p}% of shot frames) · ${fps} fps`,
    shotOf: (i, n) => `VIEWING SHOT ${i} OF ${n} DETECTED`,
    atSec: (t) => `at ${t}s`,
    scopeHint: (n) => `scorecard = this shot · session = all ${n}`,
    shotTip: (i, t, s) => `Shot ${i} at ${t}s, score ${s}`,

    info: { dipToRelease: 'Dip → release', jumpRise: 'Jump rise', releaseHeight: 'Release height', armAtRelease: 'Arm at release', ballLaunch: 'Ball launch', ballSpeed: 'Release speed', ballRise: 'Arc above release', releaseVsApex: 'Release vs apex', chain: 'Chain (from dip)', tracked: 'Tracked' },
    enterHeight: 'enter height', eyeHeight: '× eye height', ofFrames: (p) => `${p}% of frames`,
    chainVal: (k, s, e) => `knee ${k} · arm ${s} · elbow ${e} ms`,
    consistencyLbl: (n) => `Consistency (${n} shots)`,
    consistencyVal: (r, a, se, t) => `rhythm ±${r}% · release arm ±${a}° · set elbow ±${se}° · timing ±${t} ms`,

    sessionTitle: (n) => `Session · ${n} shots detected`,
    cols: ['#', 'At', 'Score', 'Dip', 'Set', 'Release', 'Timing', 'Fix first'],
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
    trendFlat: 'Held the same level from the first reps to the last.',
    trendMoved: (dir, first, last, delta) => `Score ${dir} across the clip: ${first} to ${last}, ${delta} points.`,
    oblique: 'This shot was filmed at an angle — the ball moved AWAY from the camera, not across it. The angle and the rep-to-rep comparison are still good; the metres and m/s read low. Film square to the shot for those.',
    starved: (fps, n) => `The analysis only read ${fps} frames a second (${n} frames) — the rest were dropped while the model was still busy on the previous one. Shots can be MISSED at that rate. Close other tabs, keep this one in front, and analyse again.`,
    ballUnread: 'The ball could not be followed on this rep, so the three ball readings are blank. Everything measured from the body still stands.',
    tight: 'repeatable',
    loose: 'inconsistent — the release angle is moving rep to rep',
    repeats: 'repeats across the session',
    noRepeats: 'no checkpoint failed on more than one shot.',

    checksTitle: (i, n) => `Checkpoints · shot ${i}${n > 1 ? ' of ' + n : ''}`,
    what: 'What ', why: 'Why ', how: 'How ',
    measuredOk: (d) => `Measured ${d} — inside the target band.`,
    measuredBad: (d, t) => `Measured ${d}; target ${t}.`,
    jumpFrame: 'Jump to this frame',
    footnote: 'Targets are coach-readable bands, not laws — read them with the athlete in front of you. Release arm angle is the ARM; when the ball itself could be tracked, its true launch angle is shown beside it. Side-on filming is assumed for the trunk, elbow-offset and ball-launch reads.',
    legend: { knee: 'Knee', elbow: 'Elbow', armElev: 'Arm elev.', hipHeight: 'Hip height' },
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
    handHint: 'זוהה מהקליפ — לחץ כדי לקבוע בעצמך',
    autoHint: 'חזרה לזיהוי אוטומטי מהקליפ',
    shot: 'סוג זריקה',
    shotHint: 'טווח זווית השחרור — תבחר את מרחק הזריקה',
    shotTypes: { ft: 'עונשין', mid: 'טווח בינוני', three: 'שלוש' },
    height: 'גובה', cmPlaceholder: 'ס״מ',
    savedCm: '✓ נשמר', rescored: '✓ חושב מחדש', cmUnit: 'ס״מ', forCm: 'לחישוב ס״מ',

    idleTitle: 'ניתוח זריקה, פריים אחר פריים.',
    idleBlurb: 'EXPO עוקב אחרי הגוף בכל פריים. הוא מסמן דיפ, נקודת סט, שחרור, שיא וליווי, ונותן ציון ל-10 נקודות בדיקה. בסוף אתה מקבל מדריך תיקון: מה לשנות, למה, ואיך לאמן את זה.',
    tips: [
      ['צילום מהצד', 'צלם מצד יד הזריקה, המצלמה בגובה החזה, במרחק 4–6 מ׳.'],
      ['כל הגוף בפריים', 'מכפות הרגליים עד קצות האצבעות, לאורך השחרור והליווי.'],
      ['זריקה אחת לקליפ', 'גם כמה זריקות בקליפ אחד בסדר — כל אחת מנוקדת ומושווית לעקביות.'],
      ['60 פריימים אם אפשר', 'סלואו-מושן / 60fps נותן תזמון שחרור מדויק יותר. טלפון יציב, תאורה טובה.'],
    ],
    // Forward CTA arrow points LEFT in RTL and sits at the logical end of the
    // string, so it renders on the visual left (Ohad's RTL arrow rule).
    record: 'צלם ←', gallery: 'מהגלריה', stopAnalyse: 'עצור ונתח',
    progress: { 'finding the athlete': 'מאתר את השחקן', 'reading the shots': 'קורא את הזריקות', done: 'סיום', '': 'קורא את הזריקה' },

    status: { ok: 'תקין', watch: 'במעקב', fix: 'לתיקון', na: 'אין' },
    phases: { stance: 'עמידה', dip: 'דיפ', set: 'סט', release: 'שחרור', apex: 'שיא', follow: 'ליווי', landing: 'נחיתה' },
    back10: 'אחורה 10 פריימים', prev1: 'פריים קודם', next1: 'פריים הבא', fwd10: 'קדימה 10 פריימים',
    phaseJump: (l) => `קפיצה ל${l} — נשאר על אותו רגע גם כשמחליפים זריקה`,
    metrics: { knee: 'ברך', hip: 'ירך', elbow: 'מרפק', armElev: 'זווית הזרוע', forearm: 'זווית אמה', trunk: 'נטיית גו', wristEye: 'שורש מול עין', elbowOffset: 'סטיית מרפק' },

    save: 'שמור את האימון', copy: 'העתק סיכום', print: 'הדפסת דוח', newClip: '↺ קליפ חדש',
    savedTitle: 'אימונים שנשמרו', savedNone: 'עדיין לא שמרת כלום.', savedDrop: 'מחק',
    savedRow: (d, score, reps) => `${d} · ${score}/100 · ${reps} זריקות`,
    savedToast: 'ניתוח הזריקה נשמר', saveFail: 'השמירה נכשלה', copiedToast: 'הסיכום הועתק', copyFail: 'ההעתקה נכשלה',

    verdictNa: 'הזריקה נקראה', verdictOk: 'מכניקה נקייה', verdictMid: 'בסיס טוב — יש כמה דברים להדק', verdictLow: 'בונים את השרשרת מחדש מהרגליים למעלה',
    quality: { good: 'טוב', fair: 'בינוני', poor: 'חלש' },
    summary: (f, w, o, q, p, fps) => `${f} לתיקון · ${w} למעקב · ${o} תקין · מעקב ${q} (${p}% מפריימי הזריקה) · ${fps} fps`,
    shotOf: (i, n) => `צופה בזריקה ${i} מתוך ${n} שזוהו`,
    atSec: (t) => `בשנייה ${t}`,
    scopeHint: (n) => `כרטיס הניקוד = הזריקה הזאת · האימון = כל ${n}`,
    shotTip: (i, t, s) => `זריקה ${i} בשנייה ${t}, ניקוד ${s}`,

    info: { dipToRelease: 'דיפ ← שחרור', jumpRise: 'גובה קפיצה', releaseHeight: 'גובה שחרור', armAtRelease: 'זווית יד בשחרור', ballLaunch: 'זווית שיגור הכדור', ballSpeed: 'מהירות שחרור', ballRise: 'גובה הקשת מעל השחרור', releaseVsApex: 'שחרור מול שיא', chain: 'שרשרת (מהדיפ)', tracked: 'מעקב' },
    enterHeight: 'תזין גובה', eyeHeight: '× גובה עיניים', ofFrames: (p) => `${p}% מהפריימים`,
    chainVal: (k, s, e) => `ברך ${k} · זרוע ${s} · מרפק ${e} מ״ש`,
    consistencyLbl: (n) => `עקביות (${n} זריקות)`,
    consistencyVal: (r, a, se, t) => `קצב ±${r}% · יד בשחרור ±${a}° · מרפק בסט ±${se}° · תזמון ±${t} מ״ש`,

    sessionTitle: (n) => `אימון · זוהו ${n} זריקות`,
    cols: ['#', 'זמן', 'ניקוד', 'דיפ', 'סט', 'שחרור', 'תזמון', 'לתקן קודם'],
    cleanRow: 'נקי',
    sessionAvg: 'ממוצע האימון',
    launchSpread: 'זווית שיגור',
    spreadSpeed: 'מהירות שחרור',
    spreadRise: 'קשת',
    verdictSpeed: 'הכוח בזריקה זז בין חזרה לחזרה — זה מה שמפספס ארוך וקצר',
    verdictAngle: 'זווית השחרור זזה בין חזרה לחזרה',
    sessionRepeatable: 'עקבי לאורך האימון',
    launchSpreadOn: (n, total) => `נמדדה ב-${n} מתוך ${total}`,
    worstRep: (i, v, unit) => `תסתכל על חזרה ${i}: שחררת שם ב-${v}${unit}`,
    verdictOutlier: (n) => `${n} חזרות יצאו אותו דבר. אחת לא`,
    gainPts: (n) => `+${n} נקודות אם מתקנים`,
    vsLastHead: (d) => `מול הניתוח האחרון ששמרת (${d})`,
    vsScore: (was, now) => `${was} ← ${now}`,
    vsBetter: 'השתפר מאז',
    vsWorse: 'ירד מאז',
    vsSame: 'שום נקודה לא שינתה סטטוס מאז',
    vsNoPrev: '',
    unitSpeedProse: ' מ׳/ש׳',
    displayUnits: { torso: ' גו', ms: ' מ״ש', inOrder: ' בסדר' },
    legendOnly: (k) => `להציג רק ${k}`,
    legendAll: 'להציג את כולם',
    axisSolo: (label, side, unit) => `ציר Y ${label} (${side})${unit ? ` ${unit}` : ''} · ציר X זמן בשניות`,
    axisAll: 'כל קו בסקלה שלו · ציר X זמן בשניות',
    measuredOnSide: (side) => `נמדד בצד הזורק · ${side}`,
    ballAscent: 'הכדור כבר היה מעל היד כשהמעקב התחיל, אז אי אפשר לקרוא זווית ומהירות שחרור בזריקה הזאת.',
    onNorm: 'על הנורמה שלו',
    sessionReadTitle: (n) => `כל ${n} הזריקות`,
    sessionSpan: 'הכי טוב {b} · הכי חלש {w} · פער {s}',
    sessionSolid: 'יציב',
    sessionSolidLine: (label, ok, n) => `${label} — תקין ב-${ok} מתוך ${n}`,
    sessionBroken: 'שגוי ברוב הזריקות',
    sessionBrokenLine: (label, bad, n) => `${label} — חורג ב-${bad} מתוך ${n}`,
    sessionWander: 'לא עקבי — תחזור, אל תשנה',
    sessionWanderLine: (label, pct) => `${label} — תקין ב-${pct} מהזריקות`,
    sessionFocus: 'פוקוס לאימון הבא',
    trendFlat: 'שמר על אותה רמה מהזריקות הראשונות עד האחרונות.',
    trendMoved: (dir, first, last, delta) => (dir === 'declined'
      ? `הציון ירד לאורך הקליפ: מ-${first} ל-${last}, ${delta} נקודות.`
      : `הציון עלה לאורך הקליפ: מ-${first} ל-${last}, ${delta} נקודות.`),
    oblique: 'הזריקה הזאת צולמה בזווית — הכדור התרחק מהמצלמה במקום לנוע לרוחב. הזווית וההשוואה בין החזרות עדיין טובות. המטרים והמ׳/ש׳ יוצאים נמוכים. למדידה מדויקת תצלם מול הזריקה.',
    starved: (fps, n) => `הניתוח הספיק לקרוא רק ${fps} פריימים לשנייה (${n} פריימים) — השאר נפלו כשהמודל עוד עבד על הקודם. בקצב כזה אפשר לפספס זריקות — תסגור לשוניות אחרות, תשאיר את זו מלפנים, ותנתח שוב.`,
    ballUnread: 'לא הצלחנו לעקוב אחרי הכדור בחזרה הזאת, אז נתוני הכדור ריקים. מה שנמדד מהגוף עדיין תקף.',
    tight: 'עקבי',
    loose: 'לא עקבי — זווית השחרור זזה בין חזרה לחזרה',
    repeats: 'חוזר על עצמו לאורך האימון',
    noRepeats: 'אף נקודת בקרה לא נכשלה ביותר מזריקה אחת.',

    checksTitle: (i, n) => `נקודות בקרה · זריקה ${i}${n > 1 ? ' מתוך ' + n : ''}`,
    what: 'מה ', why: 'למה ', how: 'איך ',
    measuredOk: (d) => `נמדד ${d} — בתוך טווח היעד.`,
    measuredBad: (d, t) => `נמדד ${d}; היעד ${t}.`,
    jumpFrame: 'קפיצה לפריים הזה',
    footnote: 'היעדים הם טווחים לקריאה של מאמן, לא חוקים — קרא אותם מול השחקן שעומד מולך. זווית היד בשחרור היא של היד. כשאפשר לעקוב אחרי הכדור עצמו, זווית השיגור האמיתית שלו מוצגת לצידה. הקריאות של הגו, סטיית המרפק וזווית שיגור הכדור מניחות צילום מהצד.',
    legend: { knee: 'ברך', elbow: 'מרפק', armElev: 'זווית הזרוע', hipHeight: 'גובה ירך' },
    copyHead: (s, h) => `EXPO מנתח זריקה — ניקוד ${s}/100 (יד ${h})`,
    copyFixFirst: 'לתקן קודם:',
    handWordR: 'ימין', handWordL: 'שמאל',

    // Coaching content — same bands, Hebrew words.
    checks: {
      dip: {
        label: 'עומק הדיפ',
        target: '105–140° בברך בתחתית הדיפ',
        why: 'הרגליים הן המנוע. דיפ רדוד מדי משאיר ליד לייצר את הכוח — זריקה שטוחה וידנית שנופלת קצר מטווח. דיפ עמוק מדי מאט את הקצב ונותן להגנה להתקרב. כיפוף ברך בינוני שומר גם על דחיפת רגליים וגם על קצב.',
        how: ['פול-אפ אחרי כדרור אחד: תספור בקול "למטה-למעלה" — ה"למטה" זה הדיפ, ה"למעלה" זו העלייה.', 'זריקות פורמה מ-2–3 מ׳: 10 חזרות בלי לשנות כלום חוץ מדיפ קבוע של רבע סקוואט.', 'צלם 5 עונשין מהצד והשווה את פריים הדיפ — אותו עומק בכל חזרה.'],
      },
      setHeight: {
        label: 'גובה נקודת הסט',
        target: 'שורש כף היד בגובה קו העיניים או מעליו בנקודת הסט',
        why: 'נקודת סט גבוהה מעלה את גובה השחרור, ולכן הכדור נכנס לחישוק בזווית תלולה יותר — מרווח טעות גדול יותר. היא גם הופכת את הזריקה להרבה יותר קשה לחסימה.',
        how: ['זריקות פורמה לקיר: עמוד 30 ס״מ מהקיר, הבא את הכדור למצח והתמתח ישר למעלה בלי שהמרפק ייגע בקיר.', 'זריקה עם עצירה: החזק את הסט שנייה, בדוק ששורש כף היד בגובה הגבה, ואז שחרר.', 'דימוי: "כדור למצח, לא לסנטר".'],
      },
      setElbow: {
        label: 'מרפק בסט',
        target: 'זווית מרפק של 75–105° בערך בנקודת הסט (צורת L)',
        why: 'מרפק בצורת L בסט אוגר את טווח היישור שמייצר שחרור חלק וישר. מרפק שכבר פתוח (מעל 120°) דוחף את הכדור. מרפק סגור מאוד (מתחת ל-65°) מוריד את נקודת הסט ומאריך את השחרור.',
        how: ['חזרות מול מראה: העמס את הכדור בסט וחפש את ה-L — אמה אנכית, זרוע עליונה מקבילה לרצפה.', 'זריקות פורמה ביד אחת, יד מכוונת מחוץ לכדור, מ-2 מ׳, 20 חזרות.'],
      },
      elbowAlign: {
        label: 'מרפק מתחת לכדור',
        target: 'שורש כף היד בערך מעל המרפק בסט (סטייה עד 0.25 גו)',
        why: 'כשהמרפק מתחת לשורש כף היד, היישור דוחף את הכדור ישר לחישוק. מרפק שנפתח החוצה או נגרר מוסיף רכיב צידי שהיד צריכה לתקן — זו החטאת הימין/שמאל הקלאסית.',
        how: ['תרגיל החלקה בקיר: כתף יד הזריקה לקיר, המרפק מלטף את הקיר לאורך כל היישור.', 'דימוי: "מרפק לחישוק" — הוא מצביע על המטרה לפני שהיד יורה.', 'משמעת יד מכוונת: היד השנייה עוזבת את הכדור בסט, אף פעם לא דוחפת.'],
      },
      releaseExt: {
        label: 'יישור מרפק בשחרור',
        target: '160° ומעלה בשחרור (יישור מלא)',
        why: 'יישור מלא נותן את המנוף הארוך ביותר ואת נקודת השחרור הגבוהה ביותר, ומאפשר לשורש כף היד לפרוק כחוליה האחרונה בשרשרת. יד קצרה (מתחת ל-145°) דוחפת את הכדור מהכתף — קשת נמוכה ומרחק לא עקבי.',
        how: ['"תיכנס עם היד לחישוק" — האצבעות מסיימות מכוונות לטבעת, המרפק נעול.', 'זריקות מכיסא: זריקות פורמה בישיבה, כך שהכוח חייב להגיע מהיישור ומשורש כף היד ולא מהרגליים.', 'חזרות צל ב-50% מהמהירות, עם החזקת הסיום המיושר 2 שניות.'],
      },
      releaseArm: {
        label: 'זווית היד בשחרור',
        target: null, // built from the shot-type band in localiseCheck()
        why: 'זווית האמה בשחרור קובעת את זווית השיגור של הכדור. שטוח מדי — חלון הכניסה לחישוק מצטמצם. תלול מדי — עולה במרחק ובתזמון. זו זווית היד. זווית הכדור האמיתית דורשת מעקב אחרי הכדור.',
        how: ['תרגיל קשת: תזרוק מעל מטרה 30–40 ס״מ מעל החישוק (יד של שותף על ארגז) — רק סוויש.', 'דימוי: "תזרוק למעלה, לא לכיוון" — כוון לנקודה הגבוהה של הקשת, לא לחישוק.', 'צלם מהצד: אצבעות הליווי מסיימות גבוה, לא מצביעות שטוח על החישוק.'],
      },
      timing: {
        label: 'שחרור מול שיא הקפיצה',
        target: 'שחרור בין 120 מ״ש לפני השיא ל-60 מ״ש אחריו',
        why: 'שחרור בשיא הקפיצה או רגע לפניו מנצל את דחיפת הרגליים ואת נקודת השחרור הגבוהה ביותר. שחרור בדרך למטה מוסיף מהירות גוף כלפי מטה שהיד צריכה להתגבר עליה, ומוריד את השחרור.',
        how: ['זריקות בקצב: "1-2-מעלה" — השחרור מסתיים על ה"מעלה".', 'ג׳אמפ-סטופ לזריקה אחרי מסירה. שותף קורא "מאוחר" כשהרגליים כבר יורדות.', 'אם השחרור תמיד מאוחר — תקצר את הדיפ, הקפיצה לוקחת יותר מדי זמן.'],
      },
      sequence: {
        label: 'סדר השרשרת הקינטית',
        target: 'רגליים ← כתף ← מרפק, בסדר הזה',
        why: 'הכוח עולה מהקרקע למעלה: הברכיים מסיימות ליישר קודם, אחר כך הכתף עולה, ואז המרפק יורה ושורש כף היד פורק. כשהיד יורה לפני שהרגליים סיימו, כל הזריקה היא יד — היא מתרוקנת מטווח ומתפרקת בעייפות.',
        how: ['חזרות איטיות "למטה-למעלה-דרך": תרגיש שהרגליים מסיימות לפני שהיד יוצאת.', 'זריקות פורמה בתנועה אחת קרוב לחישוק, עם נסיגה הדרגתית — אותו סדר בכל מרחק.', 'דימוי: "תדחוף את הרצפה, ואז את הכדור".'],
      },
      follow: {
        label: 'החזקת הליווי',
        target: 'יד מוחזקת גבוה 300 מ״ש ומעלה אחרי השחרור, שורש כף יד כפוף',
        why: 'הליווי מעיד על יישור מלא ועל פריקה של שורש כף היד. הורדת היד מוקדם כמעט תמיד אומרת שהפריקה נקטעה, וזה עולה בסיבוב האחורי שמרכך את הכדור.',
        how: ['"תחזיק עד שהכדור נוגע" — הקפא את הסיום עד שהכדור מגיע לחישוק, בכל חזרה, אימון שלם.', 'דימוי: "יד בתוך צנצנת העוגיות" — אצבעות יורדות מעל החישוק בסיום.'],
      },
      trunk: {
        label: 'הגו בשחרור',
        target: 'כמעט אנכי (נטייה עד 10°) בשחרור',
        why: 'גו אנכי שומר על כתפיים מיושרות למטרה ועל גובה שחרור מקסימלי. נטייה או פייד מזיזים את נקודת השחרור בכל חזרה (אלא אם הפייד מכוון). נטייה קדימה בקבלת הכדור בדרך כלל אומרת שהרגליים איחרו.',
        how: ['רגליים קודם: נחת בג׳אמפ-סטופ עם רגליים מסודרות וחזה זקוף לפני שהכדור מגיע.', 'זריקות בכריעה גבוהה (טול-נילינג), 10 חזרות — הגו לא יכול לנטות.', 'החזקות RDL על רגל אחת 3×20 שניות לשיווי המשקל שמתחת.'],
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
      ? `אמה ${armBand(typeSpec)} מעל האופק בשחרור (${name})`
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
