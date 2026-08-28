import { createContext, useContext } from 'react';
// Hebrew for the BHBC zone.
//
// COMPOSED IN HEBREW, NOT TRANSLATED. That distinction is the whole reason the
// `hebrew-voice` skill exists: writing the English first and mapping it word by
// word is what produced `נקרא מהקליפ` ("is called from the clip") for "read
// from the clip". Every line below was written by asking what a coach standing
// in the gym would SAY, then checking it against Ohad's own corpus.
//
// The register, from his measured writing:
//   - masculine singular, second person
//   - short — his median sentence is SIX words
//   - spoken Israeli: no אנא, no נא, no יש לבחור, no ניתן ל…
//   - future-as-imperative (תבחר, תסמן), never the infinitive as an instruction
//
// Basketball vocabulary is the coach's, not the dictionary's:
//   סגל      the squad — not "רשימת שחקנים"
//   לו"ז     what a coach calls the schedule — not "לוח זמנים"
//   אימון    a practice; כוח is a weights session
//   זריקה    a shot — never קליעה (counted in his corpus: קליעה is zero)
//   עומס     training load — his word, used constantly in his marketing
//
// Names stay as they are: BNEI HERZLIYA, EXPO, and opponent clubs are read as
// names by Hebrew speakers and look wrong transliterated.

export const HE = {
  // ---- navigation -------------------------------------------------------
  Overview: 'סקירה',
  Roster: 'סגל',
  Schedule: 'לו"ז',
  Medical: 'רפואי',
  Sessions: 'אימונים',
  Games: 'משחקים',

  // ---- header controls --------------------------------------------------
  'Sign out': 'יציאה',              // spoken; התנתקות is bureaucratic
  'Preview as coach': 'תצוגת מאמן',
  'Coach view': 'תצוגת מאמן',
  'Back to EXPO coach': 'חזרה ל-EXPO',

  // ---- head coach report ------------------------------------------------
  'Head coach report': 'דוח למאמן הראשי',
  'Next game': 'המשחק הבא',
  Availability: 'זמינות',
  'This week': 'השבוע',
  'Today’s focus': 'הפוקוס להיום',
  "Today's focus": 'הפוקוס להיום',
  Today: 'היום',
  'Road ahead': 'המשחקים הבאים',
  Upcoming: 'הבאים',

  // Availability states. Plural — they label counts of players.
  available: 'זמינים',
  limited: 'מוגבלים',
  out: 'בחוץ',
  Limited: 'מוגבל',

  // ---- schedule ---------------------------------------------------------
  'Week Planner': 'תכנון השבוע',
  Microcycle: 'מיקרו-מחזור',
  'No sessions': 'אין אימונים',
  'Log a session': 'תוסיף אימון',        // future-as-imperative, his register
  'Previous injuries': 'פציעות קודמות',
  '+ Log': '+ רישום',
  'No athletes on the roster yet': 'עוד אין שחקנים בסגל',
  'Add athletes': 'הוספת שחקנים',
  'ACWR danger zone': 'ACWR מעל 1.5 — תוריד עומס היום, הסיכון לפציעה עולה כאן.',
  'ACWR elevated': 'ACWR בין 1.3 ל-1.5 — תחזיק, אל תוסיף עומס.',
  'monotony high': 'מונוטוניות 2 ומעלה — תוסיף ניגוד בין קשה לקל.',
  'ACWR undertrained': 'ACWR מתחת ל-0.8 — תעלה בערך 10 אחוז בשבוע, בלי קפיצה.',
  'band sweet spot': '0.8 עד 1.3 · טווח טוב',
  'band elevated': 'מעל 1.3 · מוגבר',
  'band danger': '1.5 ומעלה · סכנה',
  'band undertrained': 'מתחת ל-0.8 · תת-עומס',
  'Pull back': 'תוריד עומס ל',
  Regress: 'תרד עם',
  'readiness red': 'מוכנות אדומה',
  'reassess before loading': 'תבדוק שוב לפני שאתה מעמיס',
  'in rehab': 'בשיקום',
  'check the medical board': 'תבדוק בלוח הרפואי חזרה למשחק והגבלות.',
  Watch: 'שים לב ל',
  'Vary the stimulus for': 'תגוון את הגירוי ל',
  'Ramp up': 'תעלה בהדרגה את',
  'Chase check-ins': 'תרדוף אחרי הצ׳ק-אין',
  'Start tracking the roster': 'תתחיל לעקוב אחרי הסגל',
  'pre-season start': 'טרום עונה — תרשום את האימונים הראשונים וצ׳ק-אין יומי, ואז ACWR ומוכנות מתחילים לעבוד.',
  'Start session': 'התחל אימון',
  'None today · next': 'אין היום · הבא',
  Edit: 'עריכה',
  'plan this session': 'תכנן את האימון',
  'Off / general prep': 'מנוחה / הכנה כללית',
  'General strength base': 'בסיס כוח כללי',
  'Max strength + power (heaviest, far from game)': 'כוח מקסימלי ועוצמה — הכי כבד, רחוק מהמשחק',
  'Strength + power': 'כוח ועוצמה',
  'Power / speed · moderate volume': 'עוצמה ומהירות · נפח בינוני',
  'Activation + taper — hold intensity, cut volume': 'הפעלה והורדת נפח — תשמור על העצימות, תוריד נפח',
  'Game day': 'יום משחק',
  'Recovery / regeneration': 'התאוששות',
  'Reload — build back up': 'טעינה מחדש — בונים בחזרה',
  Elbow: 'מרפק',
  Foot: 'כף רגל',
  'Head / Concussion': 'ראש / זעזוע מוח',
  Ankle: 'קרסול',
  Knee: 'ברך',
  Hip: 'ירך',
  Hamstring: 'מיתר הברך',
  Groin: 'מפשעה',
  Quad: 'ארבע ראשי',
  Calf: 'תאום',
  Achilles: 'אכילס',
  'Lower back': 'גב תחתון',
  Shoulder: 'כתף',
  Wrist: 'שורש כף היד',
  Hand: 'כף יד',
  Left: 'שמאל',
  Right: 'ימין',
  Strain: 'מתיחה',
  Sprain: 'נקע',
  Contusion: 'חבלה',
  Tendinopathy: 'דלקת גיד',
  Overuse: 'שימוש יתר',
  Fracture: 'שבר',
  Dislocation: 'פריקה',
  Illness: 'מחלה',
  Other: 'אחר',
  'Log a session': 'רישום אימון',
  'From calendar': 'מהיומן',
  Type: 'סוג',
  'Session RPE (0–10)': 'RPE של האימון (0–10)',
  'Readiness (optional)': 'מוכנות (לא חובה)',
  'Energy 0–10': 'אנרגיה 0–10',
  'Pain 0–10': 'כאב 0–10',
  'Sleep 0–10': 'שינה 0–10',
  'Body part': 'איזור',
  Side: 'צד',
  'Current status': 'סטטוס נוכחי',
  'Mechanism / how it happened': 'מנגנון · איך זה קרה',
  'Pain (0–10)': 'כאב (0–10)',
  'Rehab progress': 'התקדמות בשיקום',
  'Save record': 'שמירת הרשומה',
  Add: 'הוספה',
  'Onset date': 'תאריך הפציעה',
  'Return-to-play target': 'יעד לחזרה למשחק',
  'Progress note for today…': 'מה קרה היום בשיקום',
  'e.g. landed awkwardly on a rebound': 'לדוגמה: נחת לא טוב אחרי ריבאונד',
  pain: 'כאב',
  'avg load': 'עומס ממוצע',
  '+ PLAN': '+ תכנון',
  '+ Log practice': '+ רישום אימון',
  'Log practice': 'רישום אימון',
  'BNEI HERZLIYA': 'בני הרצליה',
  'Session load · RPE x minutes': 'עומס אימון · RPE כפול דקות',
  'No load logged yet': 'עוד לא נרשם עומס',
  '7 days': '7 ימים',
  'Log session': 'הוספת אימון',
  'Edit session': 'עריכת אימון',
  'Remove session': 'מחיקת אימון',
  'Delete session': 'מחיקת אימון',
  'Edit minutes': 'עריכת דקות',
  'Session plan': 'תוכנית האימון',
  Practice: 'אימון',
  Weights: 'כוח',
  Rows: 'שורות',
  Columns: 'עמודות',
  days: 'ימים',
  min: 'דק׳',

  // ---- roster / medical -------------------------------------------------
  'Manage roster': 'ניהול הסגל',
  'Load & Injury Risk': 'עומס וסיכון לפציעה',
  'Return-to-Play Protocol': 'חזרה למשחק',
  'Return-to-play target': 'יעד לחזרה',
  'Update this medical report': 'עדכון הדוח הרפואי',
  'Onset date': 'תאריך הפציעה',
  'Team RPE': 'RPE קבוצתי',

  // ---- games ------------------------------------------------------------
  'Team stats': 'נתוני קבוצה',
  'Player stats': 'נתוני שחקנים',
  'Game details': 'פרטי המשחק',
  Opponent: 'יריבה',
  Travel: 'נסיעה',
  Date: 'תאריך',
  Minutes: 'דקות',
  HOME: 'בית',
  AWAY: 'חוץ',


  // ---- card titles, exactly as the components spell them ----------------
  'Head Coach Report': 'דוח למאמן הראשי',
  'Next Game': 'המשחק הבא',
  'Road Ahead': 'המשחקים הבאים',
  'Team Snapshot': 'תמונת מצב',
  'S&C Brief': 'תקציר כוח וכושר',
  'Team Stats': 'נתוני קבוצה',
  'Player Stats': 'נתוני שחקנים',
  'Past practices': 'אימונים שהיו',
  // ---- generic ----------------------------------------------------------
  Save: 'שמור',
  Cancel: 'ביטול',
};

/**
 * Translate one label. Falls back to the English, so a string that has not been
 * written in Hebrew yet renders readable rather than blank or as a raw key —
 * "blank > wrong", and a visible English word is honest about what is missing.
 */
export function bhbcT(lang, s) {
  if (lang !== 'he') return s;
  if (typeof s !== 'string') return s;
  if (HE[s]) return HE[s];
  // Titles are composed at the call site — `Today · THU 27 AUG`. Translate the
  // part that is a label and leave the date alone; a date is read fine as-is
  // and inventing a Hebrew date format here would be worse than leaving it.
  const dot = s.indexOf(' · ');
  if (dot > 0) {
    const head = s.slice(0, dot);
    if (HE[head]) return HE[head] + s.slice(dot);
  }
  return s;
}

// The zone's sub-components (WeekPlanner, PastPractices, the games board) are
// separate functions in the same file, so a `t` closed over in BhbcView is out
// of scope for them. Context rather than a module-level variable: a module
// variable set during render happens to work because React renders parent
// before child, but it breaks the moment one of these is memoised or moved.

export const BhbcLangCtx = createContext('en');

/** `const t = useT();` then `t('Roster')`. */
export function useT() {
  const lang = useContext(BhbcLangCtx);
  return (s) => bhbcT(lang, s);
}

// ---------------------------------------------------------------------------
// Dates and the fixture labels are formatted by MODULE-LEVEL helpers that are
// called from ~30 places, so they cannot read React context. A module variable
// set during BhbcView's render is the honest trade here: React renders the
// parent before its children, the value only changes on an explicit click, and
// the alternative — threading a lang argument through thirty call sites — is
// where a missed one silently ships English.
let _dateLang = 'en';
export function setBhbcDateLang(l) { _dateLang = l === 'he' ? 'he' : 'en'; }

// א׳-ש׳ with a geresh, which is how an Israeli coach writes a weekday short.
const DOW_HE = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
// "27 באוג׳" — the ב prefix is not optional in Hebrew; "27 אוג׳" reads broken.
const MON_HE = ['ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני', 'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳'];

export const dowFor = (d, en) => (_dateLang === 'he' ? DOW_HE[d.getDay()] : en);
export const monDayFor = (d, en) => (_dateLang === 'he' ? `${d.getDate()} ב${MON_HE[d.getMonth()]}` : en);

/** Fixture kind → what a coach calls it. */
export const fxLabelFor = (kind, en) => {
  if (_dateLang !== 'he') return en;
  // __min is the minutes unit, routed through the same helper so the one
  // language switch covers labels and units together.
  return { game: 'משחק', practice: 'אימון', lift: 'כוח', __min: 'דק׳' }[kind] ?? en;
};

/** Availability state → the word for one player. */
export const availFor = (key, en) => {
  if (_dateLang !== 'he') return en;
  return { available: 'זמין', limited: 'מוגבל', out: 'בחוץ' }[key] ?? en;
};

// Late additions, kept with the rest so there is ONE place to read the zone's
// Hebrew rather than two.
Object.assign(HE, {
  'GAME DAY': 'יום משחק',
  'in progress': 'מתקיים עכשיו',
  'Venue TBD': 'אולם טרם נקבע',
  UPDATE: 'עדכון',
  'Opponent TBD': 'יריבה טרם נקבעה',
  Tomorrow: 'מחר',
  'Time TBD': 'שעה טרם נקבעה',
  // 'מול' is what a coach says before an opponent — 'נגד' is combative.
  vs: 'מול',
  'Pre-season': 'טרום עונה',
  'no focus yet': 'עוד אין פוקוס',
  logged: 'נרשמו',
  // ---- medical board ----------------------------------------------------
  'Medical · Injury Board': 'רפואי · לוח פציעות',
  'Active Injuries': 'פציעות פעילות',
  'Roster Health': 'מצב הסגל',
  Out: 'בחוץ',
  'Non-contact': 'ללא מגע',
  Cleared: 'כשירים',
  Available: 'זמין',

  'No sessions scheduled.': 'אין אימונים מתוכננים.',
  PRE_SEASON: 'טרום עונה',
});

/** `const he = useHe();` — true when the zone is in Hebrew. For the few places
 *  that compose a sentence ("בעוד 3 ימים") rather than look up a label. */
export function useHe() {
  return useContext(BhbcLangCtx) === 'he';
}
