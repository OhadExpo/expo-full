// THE DEMO SEASON ON A HEBREW SCREEN (team version #904). The seeds write their text in English (session notes, the
// physio's notes, opponents, venues, warm-up cues, programs); a Hebrew director saw "COURT WARM-UP" under a Hebrew
// header. These map the seed's OWN strings to Hebrew for display - anything a visitor types passes through as typed.
// Exercise and drill names stay English (the house rule: an exercise keeps its English name unless Hebrew has one).

const HE = {
  // sessions
  'Court warm-up': 'חימום במגרש',
  'Acceleration + change of direction': 'האצה ושינויי כיוון',
  'Landing mechanics + reactive jumps': 'טכניקת נחיתה וקפיצות ריאקטיביות',
  'Repeat sprint ability': 'ספרינטים חוזרים',
  'Deceleration + closeouts': 'האטות וקלוז-אאוטים',
  'Lower body strength': 'כוח פלג גוף תחתון',
  'Upper body + trunk': 'פלג גוף עליון ומרכז הגוף',
  'Power: jumps + trap bar': 'כוח מתפרץ: קפיצות וטראפ בר',
  'Recovery flush + mobility': 'שחרור ומוביליטי',
  'No contact - modified volume': 'בלי מגע - נפח מותאם',
  'Speed + change of direction': 'מהירות ושינויי כיוון',
  'Repeated sprints': 'ספרינטים חוזרים',
  'Small-sided games 4v4': 'משחקונים 4 על 4',
  'Aerobic intervals': 'אינטרוולים אירוביים',
  'Power + injury prevention': 'כוח מתפרץ ומניעת פציעות',
  'Modified - no long passing': 'מותאם - בלי מסירות ארוכות',
  // calendar
  'Practice': 'אימון', 'Weights': 'כוח', 'Recovery + mobility': 'שחרור ומוביליטי', 'Shootaround': 'שוטאראונד',
  'Training': 'אימון', 'Activation': 'אקטיבציה', 'Recovery': 'שחרור', 'Gym': 'חדר כושר',
  'Club gym': 'חדר הכושר של המועדון', 'Training ground': 'מגרש האימונים', 'Away': 'חוץ',
  // basketball medical
  'Landed on a foot in a rebound': 'נחת על רגל של שחקן בריבאונד',
  'Felt it on a sprint in transition': 'הרגיש את זה בספרינט במעבר',
  'Overuse - jump volume': 'עומס יתר - נפח קפיצות',
  'Push-off on a closeout': 'בהדיפה מהרצפה בקלוז-אאוט',
  'Lateral ankle sprain, grade 1-2. Taping for court work; single-leg balance and hop progression.': 'נקע קרסול לטרלי, דרגה 1-2. טייפינג לעבודה במגרש; שיווי משקל על רגל אחת והתקדמות בניתורים.',
  'Posterior thigh pain on sprinting, tender mid-belly. Isometrics from day 2; running progression when pain-free.': 'כאב בירך האחורית בספרינט, רגישות במרכז השריר. איזומטריה מהיום השני; התקדמות בריצה כשאין כאב.',
  'Patellar tendon, managed. Heavy slow resistance twice a week; jump volume capped in practice.': 'גיד הפיקה, במעקב. עבודה איטית בעומס כבד פעמיים בשבוע; נפח הקפיצות באימון מוגבל.',
  'Medial gastrocnemius strain. Returned after 12 days.': 'מתיחה בראש הפנימי של שריר התאומים. חזר אחרי 12 ימים.',
  'Swelling, painful weight bearing. Ice, compression, protected walking.': 'נפיחות, כאב בדריכה. קרח, חבישה לוחצת והליכה מוגנת.',
  'Full weight bearing. Bike + straight-line jog; balance work.': 'דריכה מלאה. אופניים וריצה בקו ישר; עבודת שיווי משקל.',
  'Cutting at 80%. Practice without 5-on-5 contact.': 'שינויי כיוון ב-80%. מתאמן בלי מגע ב-5 על 5.',
  'Hop tests 92% of the other side. Full practice Sunday if no reaction.': 'מבחני ניתור: 92% מהרגל השנייה. אימון מלא ביום ראשון אם אין החמרה.',
  'Stopped practice. No sprinting; isometric bridges, walking.': 'עצר את האימון. בלי ספרינטים; גשרים איזומטריים והליכה.',
  'Pain-free walking. Starting long-lever isometrics.': 'הולך בלי כאב. מתחיל איזומטריה במנוף ארוך.',
  'Pain on landing. Jump volume halved.': 'כאב בנחיתה. נפח הקפיצות ירד בחצי.',
  'Full practice, HSR program twice a week.': 'אימון מלא, תוכנית HSR פעמיים בשבוע.',
  'Stable. Keep monitoring morning pain.': 'יציב. ממשיכים לעקוב אחרי הכאב בבוקר.',
  'Tender, painful heel raise.': 'רגיש, הרמת עקב כואבת.',
  'Running progression.': 'התקדמות בריצה.',
  'Cleared. Full practice.': 'אושר. אימון מלא.',
  // football medical
  'Long pass under fatigue': 'מסירה ארוכה בעייפות',
  'Adductor longus strain, grade 1. Copenhagen progression; long passing reintroduced.': 'מתיחה במקרב הארוך, דרגה 1. התקדמות בקופנהגן; חוזר בהדרגה למסירות ארוכות.',
  'Pain on squeeze test 4/10.': 'כאב 4 מתוך 10 במבחן הלחיצה.',
  'Running straight lines, no long passing.': 'ריצה בקו ישר, בלי מסירות ארוכות.',
  'Joined team work without small-sided games.': 'הצטרף לעבודה הקבוצתית, בלי משחקונים.',
  'Squeeze test pain-free. Full training Sunday if no reaction.': 'מבחן הלחיצה בלי כאב. אימון מלא ביום ראשון אם אין החמרה.',
  'Sprint in behind, 70th minute': 'ספרינט לעומק, בדקה ה-70',
  'Biceps femoris, mid-belly. Isometrics, then the running ladder.': 'הדו-ראשי של הירך, במרכז השריר. איזומטריה, ואחר כך התקדמות בריצה.',
  'Came off in the match. Ice and protected walking.': 'ירד מהמגרש במשחק. קרח והליכה מוגנת.',
  'Pain-free walking, isometric bridges.': 'הולך בלי כאב, גשרים איזומטריים.',
  'Overuse': 'עומס יתר',
  'Mid-portion, managed. Heavy calf loading 3x a week; morning stiffness tracked.': 'אמצע הגיד, במעקב. עבודה בעומס כבד לתאומים 3 פעמים בשבוע; מעקב אחרי נוקשות בבוקר.',
  'Morning stiffness, pain on hopping.': 'נוקשות בבוקר, כאב בניתורים.',
  'Full training with calf program.': 'אימון מלא עם תוכנית חיזוק לתאומים.',
  'Stable.': 'יציב.',
  'Tackle': 'תיקול',
  'Lateral sprain, grade 1. Returned after 12 days.': 'נקע לטרלי, דרגה 1. חזר אחרי 12 ימים.',
  'Swelling.': 'נפיחות.', 'Running.': 'ריצה.', 'Cleared.': 'אושר.',
  // warm-ups
  'Warm-Up': 'חימום',
  'Sidelines': 'קווי הצד', 'Baseline': 'קו הסיום', '2 Lines Facing the Basket': '2 טורים מול הסל', 'Baseline + Top': 'קו הסיום וראש הקשת',
  'Running': 'ריצה', 'Running, fast': 'ריצה מהירה', 'Strength, plyometrics, balance': 'כוח, פליומטריקה ושיווי משקל',
  '1 Way': 'כיוון אחד', '1 Way each side': 'כיוון אחד לכל צד', '5 reps': '5 חזרות', '3 each side': '3 לכל צד', '10 each': '10 לכל צד',
  '3 trips': '3 סבבים', '2 each': '2 לכל צד', '2 x 15s': '2 × 15 שניות', '2 lengths': '2 אורכים', '3 x 20 s': '3 × 20 שניות',
  '3 x 20 s each': '3 × 20 שניות לכל צד', '2 x 30 s each': '2 × 30 שניות לכל רגל', '2 x 30 s': '2 × 30 שניות',
  'Easy pace, tall posture': 'קצב קל, גב זקוף', 'Knee up, toe up, punch the ground': 'ברך למעלה, אצבעות למעלה, תכה ברצפה',
  'Extend and paw back': 'תיישר ותמשוך אחורה', 'Hips turn, shoulders stay square': 'האגן מסתובב, כתפיים מול הכיוון',
  'Low hips, no heel clicks': 'אגן נמוך, הרגליים לא נפגשות', 'Back knee kisses the floor': 'הברך האחורית נוגעת ברצפה',
  'Hands walk out to plank': 'הידיים הולכות קדימה עד פלאנק', 'Elbow to instep, rotate open': 'מרפק לכף הרגל, ואז פתיחה בסיבוב',
  'Hold the baseline': 'תחזיק יציבות', 'Hips square': 'אגן ישר', 'Stiff ankles, quick contacts': 'קרסוליים נוקשים, מגע קצר',
  'Chest over toes': 'חזה מעל האצבעות', 'Relax the face': 'פנים רפויות', 'Accelerate through the line': 'תאיץ עד אחרי הקו',
  'Chop the feet, high hands': 'צעדים קצרים ומהירים, ידיים גבוהות', 'Land balanced, chin over knees': 'נחיתה מאוזנת, סנטר מעל הברכיים',
  'React, do not guess': 'תגיב, אל תנחש',
  'Easy, relaxed': 'קל ורפוי', 'Open the knee, stay tall': 'פתח את הברך, גב זקוף', 'Close the knee across': 'תסגור את הברך פנימה',
  'Small steps, low hips': 'צעדים קטנים, אגן נמוך', 'Jump and meet the shoulder': 'קפיצה ומגע כתף בכתף', 'Short steps back': 'צעדים קצרים אחורה',
  'Straight line head to heel': 'קו ישר מהראש עד העקב', 'Hips high': 'אגן גבוה', 'Hold the fall as long as you can': 'תעכב את הנפילה כמה שאפשר',
  'Knee over toes': 'ברך מעל האצבעות', 'Knee never caves in': 'הברך לא נופלת פנימה', 'Land softly': 'נחיתה רכה',
  '75-80% of top speed': '75-80% מהמהירות המרבית', 'Knee up, land on the forefoot': 'ברך למעלה, נחיתה על כרית כף הרגל',
  'Cut off the outside foot': 'שינוי כיוון מהרגל החיצונית',
  // programs
  'In-season Block #2': 'בלוק בעונה #2', 'In-season Block #3': 'בלוק בעונה #3',
  'Day A - Lower': 'יום A - פלג גוף תחתון', 'Day B - Upper': 'יום B - פלג גוף עליון', 'Day C - Power': 'יום C - כוח מתפרץ',
  'MD-4 - Strength': 'MD-4 - כוח', 'MD-2 - Power': 'MD-2 - כוח מתפרץ',
  'Explode up, control down': 'למעלה בפיצוץ, למטה בשליטה', '3 s down': '3 שניות למטה', 'Hold the line as long as you can': 'תחזיק את הקו כמה שאפשר',
  'Quick ground contacts': 'מגע קצר עם הרצפה', 'Squeeze 1 s at the top': 'כיווץ של שנייה למעלה', 'Full hang to chin over': 'מתלייה מלאה עד סנטר מעל המוט',
  'Ribs down': 'צלעות למטה', 'Fast elbows': 'מרפקים מהר', 'Stick the landing': 'נחיתה יציבה', 'Adductor protection': 'הגנה על המקרבים',
  '6 each': '6 לכל צד', '20 s each': '20 שניות לכל צד', '5 each': '5 לכל צד', '8 each': '8 לכל צד', '12 each': '12 לכל צד',
};
// opponents: the calendar's English -> the league's Hebrew (the seeds' own club lists)
const TEAM = {
  'Hapoel Kfar Saba': 'הפועל כפר סבא', 'Maccabi Haifa': 'מכבי חיפה', 'Elitzur Yavne': 'אליצור יבנה', 'Hapoel Ramat Gan': 'הפועל רמת גן',
  'Hapoel Afula': 'הפועל עפולה', 'Maccabi Hod HaSharon': 'מכבי הוד השרון', 'Ironi Kiryat Ata': 'עירוני קריית אתא', 'Hapoel Haifa': 'הפועל חיפה',
  'Maccabi Kiryat Gat': 'מכבי קריית גת', "Hapoel Ra'anana": 'הפועל רעננה', "Hapoel Be'er Sheva": 'הפועל באר שבע',
  'Hapoel Even Yehuda': 'הפועל אבן יהודה', "Maccabi Ra'anana": 'מכבי רעננה', 'Hapoel Hadera': 'הפועל חדרה',
  'Hapoel Hadera FC': 'הפועל חדרה', 'Ironi Kiryat Shmona': 'עירוני קריית שמונה', 'Hapoel Nof HaGalil': 'הפועל נוף הגליל', 'Hapoel Jerusalem FC': 'הפועל ירושלים',
  'Hapoel Ramat Gan FC': 'הפועל רמת גן', 'Hapoel Kfar Saba FC': 'הפועל כפר סבא', 'Maccabi Jaffa': 'מכבי יפו', 'Hapoel Afula FC': 'הפועל עפולה',
  'Hapoel Rishon LeZion': 'הפועל ראשון לציון', 'Hapoel Umm al-Fahm': 'הפועל אום אל פאחם', 'Ironi Tiberias': 'עירוני טבריה', 'Hapoel Akko': 'הפועל עכו',
  'Maccabi Kabilio Jaffa': 'מכבי קביליו יפו', 'Hapoel Petah Tikva': 'הפועל פתח תקווה', 'Sektzia Ness Ziona': 'סקציה נס ציונה',
};
const CITY = { 'Kfar Saba': 'כפר סבא', Haifa: 'חיפה', Yavne: 'יבנה', 'Ramat Gan': 'רמת גן', Afula: 'עפולה', 'Hod HaSharon': 'הוד השרון', 'Kiryat Ata': 'קריית אתא', 'Kiryat Gat': 'קריית גת', "Ra'anana": 'רעננה', "Be'er Sheva": 'באר שבע' };

const t = (s) => (typeof s === 'string' && HE[s]) || s;
const place = (s) => {
  if (typeof s !== 'string') return s;
  if (HE[s]) return HE[s];
  let m = s.match(/^(.*) Sports Hall$/); if (m && CITY[m[1]]) return `אולם הספורט ${CITY[m[1]]}`;
  m = s.match(/^(.*) Stadium$/); if (m && (TEAM[m[1]] || TEAM[`${m[1]} FC`])) return `אצטדיון ${TEAM[m[1]] || TEAM[`${m[1]} FC`]}`;
  return s;
};
const team = (s) => (typeof s === 'string' && TEAM[s]) || s;

const scrim = (s) => { const m = typeof s === 'string' && s.match(/^Scrimmage vs (.+)$/); return m ? `משחק אימון מול ${team(m[1])}` : t(s); };
export const hebrewFixtures = (fx, club = null) => {
  const home = (s) => (club && s === club.venue && club.venueHe ? club.venueHe : place(s));
  return (fx || []).map((f) => (f ? { ...f, title: scrim(f.title), opponent: team(f.opponent), location: home(f.location), venue: home(f.venue) } : f));
};
export const hebrewLoads = (loads) => Object.fromEntries(Object.entries(loads || {}).map(([id, rec]) => [id, !rec || !rec.sessions ? rec : {
  ...rec, sessions: Object.fromEntries(Object.entries(rec.sessions).map(([d, rows]) => [d, (rows || []).map((r) => (r ? { ...r, note: t(r.note), teamNote: t(r.teamNote), ownNote: t(r.ownNote), opp: team(r.opp) } : r))])),
}]));
export const hebrewMedical = (med) => Object.fromEntries(Object.entries(med || {}).map(([id, m]) => [id, !m || !m.injuries ? m : {
  ...m, injuries: m.injuries.map((i) => ({ ...i, notes: t(i.notes), mechanism: t(i.mechanism), progress: (i.progress || []).map((p) => ({ ...p, note: t(p.note) })) })),
}]));
export const hebrewWarmup = (w) => (!w || !w.sections ? w : { ...w, title: t(w.title), sections: w.sections.map((s) => ({ ...s, name: t(s.name), drills: (s.drills || []).map((d) => ({ ...d, dose: t(d.dose), cue: t(d.cue) })) })) });
export const hebrewPlanIndex = (idx) => (idx || []).map((p) => ({ ...p, name: t(p.name) }));
export const hebrewPlans = (plans) => Object.fromEntries(Object.entries(plans || {}).map(([id, p]) => [id, { ...p, name: t(p.name), days: (p.days || []).map((d) => ({ ...d, name: t(d.name), exercises: (d.exercises || []).map((e) => ({ ...e, reps: t(e.reps), notes: t(e.notes) })) })) }]));
