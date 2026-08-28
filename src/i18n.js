// EXPO in Hebrew — the shared core.
//
// COMPOSED IN HEBREW, NOT TRANSLATED. The failure mode this whole file exists
// to avoid is writing English and mapping it word by word; that is what
// produced `נקרא מהקליפ` ("is called from the clip") for "read from the clip".
// Every string below was written by asking what Ohad would SAY to an athlete,
// then checked against his own corpus.
//
// His measured register:
//   - masculine singular, second person — he talks to ONE athlete
//   - median sentence: SIX words. Fragments are correct.
//   - future-as-imperative: תרשום, תבחר, תשמור — never the infinitive as an
//     instruction (לרשום, לבחור)
//   - spoken Israeli: no אנא, no נא, no יש לבחור, no ניתן ל…
//
// NEVER TRANSLATED, by his rules:
//   - exercise NAMES — they stay English unless a widely-used Hebrew term
//     exists, and the plan row's own title is the source of truth
//   - coaching cues / notes — his to author, and already Hebrew where he wrote
//     them
//   - athlete names, block names, and anything an athlete or coach typed
import { createContext, useContext } from 'react';

export const LangCtx = createContext('en');
export const LANG_KEY = 'expo-lang';

export const HE = {


  // ---- the roster: filter rail + athlete card --------------------------
  // Measured 2026-08-28: 246 strings on the core coach screens still rendered
  // Latin while the app was in Hebrew. That — not phrasing — is why he said
  // "hebrew still sucks, its 15%". Half a screen in English is not an accent
  // problem, it is an untranslated screen.
  'Bnei Herzliya': 'בני הרצליה',
  'vs prev 30d': 'מול 30 הימים הקודמים',
  Close: 'סגור',
  '+ Task': '+ משימה',
  Storage: 'אחסון',
  'form videos': 'סרטוני טכניקה',
  'No payments marked collected in the last 6 months': 'לא נכנסו תשלומים בחצי השנה האחרונה',
  Answered: 'נענו',
  Sent: 'נשלח',
  'Hide answered': 'הסתר הודעות שנענו',
  'Open full tasks': 'לכל המשימות',
  Filters: 'סינון',
  'Search athletes…': 'חיפוש מתאמנים',
  Status: 'סטטוס',
  Format: 'סוג אימון',
  'Needs attention': 'דורש טיפול',
  Sort: 'מיון',
  All: 'הכל',
  'On Hold': 'מוקפא',
  Inactive: 'לא פעיל',
  Trial: 'ניסיון',
  Online: 'אונליין',
  'Payment due': 'ממתין לתשלום',
  'No program': 'בלי תוכנית',
  'Last trained': 'אימון אחרון',
  Payment: 'תשלום',
  Name: 'שם',
  '+ Add Athlete': '+ מתאמן חדש',
  'All Athletes': 'כל המתאמנים',
  // Card sections. "כספים" and not "תשלומים" — תשלומים is already the BILLING
  // tab, and two screens must not answer to the same word.
  Financials: 'כספים',
  Training: 'אימונים',
  'Not billable': 'ללא חיוב',
  'No logs yet': 'עדיין אין מדידות',
  Restore: 'שחזור',
  'Permanently Delete': 'מחיקה סופית',
  'Sessions left': 'אימונים שנותרו',
  'Last workout': 'אימון אחרון',
  'Gym, Single': 'חדר כושר · יחיד',
  'Gym, Couple': 'חדר כושר · זוג',
  'Gym · Single': 'חדר כושר · יחיד',
  'Gym · Couple': 'חדר כושר · זוג',
  'Online client': 'מתאמן אונליין',

  // ---- dashboard tiles --------------------------------------------------
  // Tile captions are NOUN PHRASES, not sentences. That is also what keeps
  // them on one line — a wrapped caption pushed two tiles' numbers out of
  // line with their neighbours, which is the fault he photographed.
  Revenue: 'הכנסות',
  'Recurring committed': 'התחייבות חודשית',
  'Per paying client': 'ללקוח משלם',
  'Per payment row': 'לכל תשלום',
  'Pending requests': 'בקשות פתוחות',
  'Open debt': 'חוב פתוח',
  General: 'כללי',
  'Auto-alerts': 'התראות אוטומטיות',
  History: 'היסטוריה',
  Inbound: 'נכנס',
  Open: 'פתוח',
  'Voice note': 'הודעה קולית',
  done: 'בוצע',

  // ---- coach app: the nav ----------------------------------------------
  // A coach reads this row all day, so these are the words Ohad uses out
  // loud, not dictionary equivalents.
  Dashboard: 'ראשי',
  Athletes: 'מתאמנים',
  Roster: 'רשימה',
  Programs: 'תוכניות',
  Exercises: 'תרגילים',
  Sessions: 'אימונים',
  Group: 'קבוצתי',
  Single: 'אישי',
  Review: 'בדיקה',
  Workouts: 'אימונים',
  Tools: 'כלים',
  Tasks: 'משימות',
  Billing: 'תשלומים',
  Incoming: 'פניות',
  Intake: 'קליטה',
  Waitlist: 'רשימת המתנה',
  Challenges: 'אתגרים',
  Portal: 'פורטל',

  // ---- coach dashboard --------------------------------------------------
  'Active Athletes': 'מתאמנים פעילים',
  'Low Sessions': 'מעט אימונים שנותרו',
  'Estimated Monthly': 'צפוי החודש',
  'Collected MTD': 'נכנס החודש',
  REVENUE: 'הכנסות',
  'MRR (ACTIVE)': 'הכנסה קבועה',
  'RECURRING COMMITTED': 'התחייבות חודשית',
  '30D COLLECTED': 'נכנס · 30 יום',
  '90D COLLECTED': 'נכנס · 90 יום',
  OUTSTANDING: 'חוב פתוח',
  'AVG LTV': 'שווי לקוח',
  'AVG TICKET': 'תשלום ממוצע',
  'PER PAYING CLIENT': 'ללקוח משלם',
  'PER PAYMENT ROW': 'לכל תשלום',
  'TRAILING 3 MONTHS': '3 חודשים',
  'INCL. VAT · 6 MO TREND': 'כולל מע״מ · 6 חודשים',
  'LAST 6 MONTHS · COLLECTED': 'נכנס · 6 חודשים',
  'NO PAYMENTS MARKED COLLECTED IN THE LAST 6 MONTHS': 'לא נכנסו תשלומים ב-6 החודשים האחרונים',
  STORAGE: 'אחסון',
  TASKS: 'משימות',
  'MARK ALL READ': 'סמן הכל כנקרא',
  'TO DO': 'לביצוע',
  'To Do': 'לביצוע',
  'In Progress': 'בתהליך',
  Waiting: 'ממתין',
  Stuck: 'תקוע',
  Done: 'בוצע',
  Urgent: 'דחוף',
  Normal: 'רגיל',
  Low: 'נמוך',
  Shared: 'משותף',
  Overdue: 'באיחור',
  Today: 'היום',
  Tomorrow: 'מחר',
  'IN PROGRESS': 'בתהליך',
  WAITING: 'ממתין',
  STUCK: 'תקוע',
  'AUTO-ALERTS': 'התראות אוטומטיות',
  GENERAL: 'כללי',
  ALL: 'הכל',
  'OPEN FULL TASKS': 'פתח את כל המשימות',
  INBOUND: 'נכנסת',
  'VOICE NOTE': 'הודעה קולית',
  ANSWERED: 'נענה',
  'Overdue Payment': 'חוב',
  Dormant: 'רדומים',
  'Online Now': 'מחוברים עכשיו',
  'Expiring Packages': 'חבילות שעומדות להסתיים',
  'New Leads': 'פניות חדשות',
  Expiring: 'עומדת להסתיים',
  'Never trained': 'לא התאמן',
  'Never paid': 'לא שילם',
  'CHAT SESSIONS': 'שיחות צ׳אט',
  'MESSAGES SENT': 'הודעות שנשלחו',
  'EMAIL CAPTURES': 'מיילים שנאספו',
  WAITLIST: 'רשימת המתנה',
  'INCOMING · 30D': 'פניות · 30 יום',

  // ---- athlete page (coach view) ----------------------------------------
  'View All': 'הכל',
  Vitals: 'נתונים',
  Bodyweight: 'משקל גוף',
  Readiness: 'מוכנות',
  'Coach History': 'היסטוריית המאמן',
  Evaluation: 'הערכה',
  Overload: 'העמסה',
  Archived: 'בארכיון',
  Paid: 'שולם',
  Delete: 'מחיקה',
  Cancel: 'ביטול',
  Save: 'שמירה',
  Package: 'חבילה',
  Active: 'פעיל',

  // ---- program editor ---------------------------------------------------
  // A coach lives in this screen. Short labels, the words he says.
  'Warm-up': 'חימום',
  'WARM-UP': 'חימום',
  Video: 'וידאו',
  'VIDEO URL': 'קישור לווידאו',
  Share: 'שיתוף',
  Preview: 'תצוגה מקדימה',
  Duplicate: 'שכפול',
  PORTAL: 'פורטל',
  Athlete: 'מתאמן',
  Unassigned: 'לא משויך',
  UNDO: 'ביטול פעולה',
  REDO: 'ביצוע מחדש',
  'FROM LIBRARY': 'מהספרייה',
  'EXERCISE DATABASE': 'מאגר התרגילים',
  VOLUME: 'נפח',
  'Volume (sets)': 'נפח (סטים)',
  'Total sets': 'סה״כ סטים',
  'SAVE PROGRAM': 'שמירת התוכנית',
  'ADD DAY': 'הוספת יום',
  'ADD EXERCISE': 'הוספת תרגיל',
  'ADD WARM-UP': 'הוספת חימום',
  'Saving...': 'שומר...',
  'EXPAND ALL': 'פתח הכל',
  'COLLAPSE ALL': 'סגור הכל',
  DAILY: 'יומי',
  EXERCISE: 'תרגיל',
  GRP: 'קבוצה',
  TEMPO: 'קצב',
  LOAD: 'עומס',
  RPE: 'RPE',
  WEEKS: 'שבועות',
  'PROGRAM NAME': 'שם התוכנית',
  'PHASE / BLOCK': 'שלב / בלוק',

  // ---- workout review ---------------------------------------------------
  'ALL CAUGHT UP': 'הכל מעודכן',
  'ATHLETE NOTES': 'הערות המתאמן',
  COMMENT: 'תגובה',
  'DELETE WORKOUT': 'מחיקת האימון',
  DRAW: 'ציור',
  'LIFT METRICS': 'נתוני הרמה',
  'FORM VIDEO SUBMITTED': 'וידאו טכניקה נשלח',
  'No completed workouts yet': 'עוד אין אימונים שהושלמו',
  'No form video submitted': 'וידאו טכניקה לא נשלח',
  ELBOW: 'מרפק',
  KNEE: 'ברך',

  // ---- exercise library -------------------------------------------------
  Edit: 'עריכה',
  Media: 'מדיה',
  Show: 'הצג',
  'SHOW ALL': 'הצג הכל',
  'No coaching cues': 'אין דגשים',
  'No values in library': 'אין ערכים בספרייה',

  // ---- waitlist / intake ------------------------------------------------
  'COACH WAITLIST': 'רשימת המתנה למאמנים',
  CONTACTED: 'נוצר קשר',
  'NO COACH SIGNUPS YET': 'עוד לא נרשמו מאמנים',
  Notes: 'הערות',
  Source: 'מקור',
  Actions: 'פעולות',

  // ---- athlete portal, remaining ----------------------------------------
  BODYWEIGHT: 'משקל גוף',
  CANCEL: 'ביטול',
  CHANGE: 'שינוי',
  RESUMED: 'המשך',
  Left: 'נותרו',
  Week: 'שבוע',
  BLOCK: 'בלוק',
  Block: 'בלוק',
  // ---- athlete portal: the six tabs ------------------------------------
  PROGRAM: 'תוכנית',
  BW: 'משקל',
  'MEAL LOG': 'יומן אוכל',
  HISTORY: 'היסטוריה',
  PRs: 'שיאים',
  MESSAGES: 'הודעות',

  // ---- the workout screen ----------------------------------------------
  WEEK: 'שבוע',
  'This Week': 'השבוע',
  SETS: 'סטים',
  REPS: 'חזרות',
  REST: 'מנוחה',
  NOTES: 'הערות',
  NOTE: 'הערה',
  'EXERCISE NOTE': 'הערה לתרגיל',
  FOCUS: 'פוקוס',
  VIDEO: 'וידאו',
  'FORM CHECK': 'בדיקת טכניקה',
  SAVE: 'שמור',
  DELETE: 'מחק',
  'DELETE ENTRY': 'מחיקת רשומה',
  RETRY: 'נסה שוב',
  EXIT: 'יציאה',
  LOG: 'תרשום',            // future-as-imperative, his register
  AGAIN: 'שוב',
  Complete: 'הושלם',
  LATEST: 'אחרון',
  TREND: 'מגמה',
  ENTRIES: 'רשומות',
  Gallery: 'גלריה',
  Record: 'הקלטה',
  'Readiness Check-In': 'בדיקת מוכנות',
  'Check-In': 'בדיקה',

  // ---- readiness scale --------------------------------------------------
  SLEEP: 'שינה',
  ENERGY: 'אנרגיה',
  PAIN: 'כאב',
  GREAT: 'מצוין',
  GOOD: 'טוב',
  POOR: 'חלש',
  NONE: 'אין',
  MILD: 'קל',
  MODERATE: 'בינוני',
  HIGH: 'גבוה',

  // ---- empty and error states ------------------------------------------
  'NO ACTIVE PROGRAM': 'אין תוכנית פעילה',
  'NO ACTIVE BLOCK': 'אין בלוק פעיל',
  'No video for this exercise': 'אין וידאו לתרגיל הזה',
  'No bodyweight entries yet': 'עוד אין רישומי משקל',
  'VIDEO COULD NOT BE EMBEDDED': 'אי אפשר להטמיע את הווידאו',
  "Couldn't load programs": 'לא הצלחנו לטעון את התוכניות',
  'Failed to load video': 'הווידאו לא נטען',
  'Upload failed': 'ההעלאה נכשלה',
  'Upload timed out': 'פג הזמן להעלאה',
  'Upload network error': 'תקלת רשת בהעלאה',
  'Session saved locally': 'האימון נשמר במכשיר',
};

/** Translate one label; falls back to the English so a missing key renders
 *  readable rather than blank. Blank is worse than English. */
// Case-insensitive second lookup, and it earns its place: this codebase
// renders the same words in several casings — a card shows NOT BILLABLE, the
// map holds 'Not billable'; the rail passes 'Needs Attention', the map holds
// 'Needs attention'. An exact-match miss does not throw, it silently ships
// ENGLISH, which is invisible until someone photographs the screen. Both of
// those were live when this was written.
const HE_CI = new Map(Object.keys(HE).map((k) => [k.toLowerCase(), HE[k]]));

export function tr(lang, s) {
  if (lang !== 'he' || typeof s !== 'string') return s;
  const hit = HE[s];
  if (hit !== undefined) return hit;
  const ci = HE_CI.get(s.toLowerCase());
  return ci !== undefined ? ci : s;
}

/** `const t = useT();` then `t('PROGRAM')`. */
export function useT() {
  const lang = useContext(LangCtx);
  return (s) => tr(lang, s);
}

/** True when the app is in Hebrew — for the few places that compose a
 *  sentence rather than look up a label. */
export function useHe() {
  return useContext(LangCtx) === 'he';
}

export function readLang() {
  try { return localStorage.getItem(LANG_KEY) === 'he' ? 'he' : 'en'; } catch { return 'en'; }
}

// Relative days. A map cannot hold these: Hebrew does not say "לפני 1 ימים",
// it says "אתמול". English "2d ago" collapses all of that into one shape.
export function daysAgoHe(n) {
  if (n <= 0) return 'היום';
  if (n === 1) return 'אתמול';
  if (n === 2) return 'שלשום';
  return `לפני ${n} ימים`;
}
export function daysOverdueHe(n) {
  if (n === 1) return 'באיחור יום';
  return `באיחור ${n} ימים`;
}
