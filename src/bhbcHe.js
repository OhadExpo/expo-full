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
  'Past practices': 'אימונים שהיו',
  Microcycle: 'מיקרו-מחזור',
  'No sessions': 'אין אימונים',
  'Log a session': 'תוסיף אימון',        // future-as-imperative, his register
  'Log session': 'תוסיף אימון',
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
  PRE_SEASON: 'טרום עונה',
});

/** `const he = useHe();` — true when the zone is in Hebrew. For the few places
 *  that compose a sentence ("בעוד 3 ימים") rather than look up a label. */
export function useHe() {
  return useContext(BhbcLangCtx) === 'he';
}
