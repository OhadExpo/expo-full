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
  'Low Sessions': 'אימונים נגמרים',
  'Estimated Monthly': 'צפוי החודש',
  'Collected MTD': 'נכנס החודש',
  REVENUE: 'הכנסות',
  'MRR (ACTIVE)': 'הכנסה קבועה',
  'RECURRING COMMITTED': 'התחייבות חודשית',
  '30D COLLECTED': 'נכנס ב-30 הימים האחרונים',
  '90D COLLECTED': 'נכנס ב-90 הימים האחרונים',
  OUTSTANDING: 'חוב פתוח',
  'AVG LTV': 'שווי לקוח',
  'AVG TICKET': 'תשלום ממוצע',
  'PER PAYING CLIENT': 'ללקוח משלם',
  'PER PAYMENT ROW': 'לכל תשלום',
  'TRAILING 3 MONTHS': '3 חודשים אחרונים',
  'INCL. VAT · 6 MO TREND': 'כולל מע״מ · 6 חודשים',
  'LAST 6 MONTHS · COLLECTED': '6 חודשים אחרונים · נכנס',
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
  'Expiring Packages': 'חבילות נגמרות',
  'New Leads': 'פניות חדשות',
  Expiring: 'עומד להסתיים',
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
  Format: 'פורמט',
  Package: 'חבילה',
  Active: 'פעיל',
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
  'Upload timed out': 'ההעלאה נתקעה',
  'Upload network error': 'תקלת רשת בהעלאה',
  'Session saved locally': 'האימון נשמר במכשיר',
};

/** Translate one label; falls back to the English so a missing key renders
 *  readable rather than blank. Blank is worse than English. */
export function tr(lang, s) {
  if (lang !== 'he' || typeof s !== 'string') return s;
  return HE[s] ?? s;
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
