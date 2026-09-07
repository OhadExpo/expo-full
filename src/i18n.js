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

  // ---- programs / review / billing / intake / sessions -------------------
  // Composed from the meaning, not mapped off the English. Where a word had
  // to stay a noun phrase for a label, it stays one; where it is an
  // instruction, it takes his future-imperative.
  Empty: 'ריק',
  Uploaded: 'הועלה',
  'Last edited': 'עודכן לאחרונה',
  '+ New Program': '+ תוכנית חדשה',
  ANALYSIS: 'ניתוח',
  previous: 'קודם',
  'NEVER LOGGED': 'לא נרשם אף פעם',
  exercises: 'תרגילים',
  'WORKOUT REVIEW': 'בדיקת אימונים',
  'WEEKLY FOCUS · NO UPLOAD NEEDED': 'פוקוס שבועי · בלי העלאה',
  'Athlete page': 'לעמוד המתאמן',
  sets: 'סטים',
  'Start a Session': 'התחל אימון',
  initial: 'ראשוני',
  assessment: 'הערכה',
  progress: 'התקדמות',
  total: 'סה״כ',
  '+ Generate Link': '+ קישור חדש',
  'Hide reviewed': 'הסתר שנבדקו',
  'Copy URL': 'העתק קישור',
  'No date': 'בלי תאריך',
  'By status': 'לפי סטטוס',
  'By category': 'לפי קטגוריה',
  'Enter to save': 'אנטר לשמירה',
  'Click to expand': 'לחץ להרחבה',
  'Collected · This month': 'נכנס · החודש',
  received: 'התקבל',
  'PAYMENT REQUESTS': 'בקשות תשלום',
  '+ NEW REQUEST': '+ בקשה חדשה',
  'ROSTER STATUS': 'מצב המתאמנים',
  'NO REQUEST': 'אין בקשה',
  'GROUP SESSION': 'אימון קבוצתי',
  'START A GROUP SESSION': 'התחלת אימון קבוצתי',
  '+ START SESSION': '+ התחל אימון',
  'BACK': 'חזרה',
  board: 'לוח',
  'No payment requests yet': 'עוד אין בקשות תשלום',
  'Add the athletes training now, check them in as they arrive, and log all their sets in one grid. Built to run on a big screen on the floor.': 'תוסיף את מי שמתאמן עכשיו, תסמן נוכחות כשהם מגיעים, ותרשום את כל הסטים במסך אחד. בנוי למסך גדול על הרצפה.',
  'Review completed workouts, watch client form videos, and set weekly focus for next week.': 'תעבור על האימונים שנסגרו, תראה סרטוני טכניקה, ותקבע פוקוס לשבוע הבא.',
  'Review completed workouts, watch client form videos, and write focus notes for next week.': 'תעבור על האימונים שנסגרו, תראה סרטוני טכניקה, ותכתוב פוקוס לשבוע הבא.',
  'TRAINED TODAY': 'התאמן היום',
  'Search programs…': 'חיפוש תוכנית',
  Table: 'טבלה',
  Grid: 'רשת',
  Flags: 'סימונים',
  'Showing reviewed': 'מציג שנבדקו',
  '+ NEW CHALLENGE': '+ אתגר חדש',
  'No challenges yet': 'עוד אין אתגרים. תנסה "רצף סקוואט ל-30 יום" או "נפח קבוצתי כולל".',
  SUPERSET: 'סופרסט',
  'alternate each round': 'מתחלפים בכל סבב',
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
  // ---- the install prompt: the first modal an athlete meets on a phone ----
  // Composed, not mapped: a coach telling an athlete to put the app on their
  // phone. Short, spoken, masculine singular, future-as-imperative.
  'GET THE EXPO APP': 'תתקין את EXPO',
  'OPEN THE EXPO APP': 'תפתח את EXPO',
  'GO TO APP': 'לאפליקציה',
  'MAYBE LATER': 'אחר כך',
  'GOT IT': 'הבנתי',
  "Add EXPO to your home screen — one tap, and it's always there, full-screen and ready.":
    'תוסיף את EXPO למסך הבית — לחיצה אחת, והיא תמיד שם, על כל המסך.',
  'You already have EXPO installed — open it from your': 'EXPO כבר מותקנת אצלך — תפתח אותה מהאייקון',
  'home screen': 'במסך הבית',
  'icon for the full-screen app.': 'כדי לקבל את האפליקציה על כל המסך.',
  'To add EXPO to your home screen, open this page in': 'כדי להוסיף את EXPO למסך הבית, תפתח את הדף הזה ב',
  'first, then Share →': 'ואז שיתוף ←',
  'Add to Home Screen': 'הוספה למסך הבית',
  'Add EXPO to your home screen for the full app:': 'תוסיף את EXPO למסך הבית בשביל האפליקציה המלאה:',
  'Tap the': 'תלחץ על',
  'button in the browser bar.': 'בסרגל הדפדפן.',
  Choose: 'תבחר',
  Tap: 'תלחץ',
  Add: 'הוספה',
  'EXPO opens full-screen from your home screen.': 'EXPO נפתחת על כל המסך מהמסך הבית.',

  // ---- athlete portal: the workout flow ----------------------------------
  // What an athlete reads mid-session, phone in hand, between sets.
  'Warm-Up': 'חימום',
  // 'Check-In' and 'Complete' already exist above with their own wording
  // ('בדיקה', 'הושלם') and are used elsewhere. One key, one translation - a
  // second entry would silently win or lose depending on order, which is
  // exactly what the no-dupe-keys gate exists to stop.
  'Start Check-In': 'לצ׳ק-אין',
  'Next Warm-Up': 'החימום הבא',

  // ---- athlete portal: messages -------------------------------------------
  // The athlete's MESSAGES tab. COACH/ATHLETE label the two sides of a thread.
  COACH: 'מאמן',
  ATHLETE: 'מתאמן',
  'No messages yet.': 'עוד אין הודעות.',
  'Your coach will message you here.': 'המאמן ישלח לך הודעות כאן.',
  'Drop a voice note or a quick check-in below.': 'תשאיר הודעה קולית או שורה למטה.',
  'Reply to your coach…': 'תענה למאמן…',
  'Type a note to your athlete…': 'תכתוב למתאמן…',

  // ---- athlete portal: the meal log ---------------------------------------
  // A whole athlete page that had no translator at all. Composed as a coach
  // talking to one athlete: short, spoken, future-as-imperative.
  'SNAP A MEAL': 'תצלם ארוחה',
  'UPLOADING…': 'מעלה…',
  'ANALYZING…': 'מנתח…',
  ANALYZE: 'נתח',
  NEXT: 'הבא',
  'No meals yet. Snap a photo above and the AI will estimate macros.':
    'עוד אין ארוחות. תצלם למעלה והמערכת תעריך את המאקרו.',
  'No meals on this day.': 'אין ארוחות ביום הזה.',
  'No meals logged yet today.': 'עוד לא נרשמו ארוחות היום.',

  // ---- athlete portal: headings and the bodyweight tab -------------------
  SESSION: 'אימון',
  SESSIONS: 'אימונים',
  // NOT the existing `LOG` key: that one is 'התחלה' (start) for the button that
  // begins a session. This is a heading over the bodyweight field - a record,
  // not a start - and one word cannot be both.
  'Log week': 'רישום שבוע',
  'Log at least 2 weigh-ins to see your trend': 'תרשום לפחות שתי שקילות כדי לראות מגמה',

  // ---- athlete portal: chrome the athlete sees on every visit ------------
  // Wired up 2026-09-06, when the portal could finally render Hebrew at all.
  // The arrow points the way the reader is going.
  'READINESS GRAPH →': 'גרף מוכנות ←',
  'LOG OUT': 'יציאה',
  LEFT: 'נותרו',              // "9 נותרו" - weeks left in the block
  RECORDS: 'שיאים',

  // ---- athlete portal: the six tabs ------------------------------------
  PROGRAM: 'תוכנית',
  BW: 'משקל',
  'MEAL LOG': 'יומן אוכל',
  // The rest of the meal log (2026-09-07): its error strings, day labels and
  // totals were still English on the branch after the 09-06 pass.
  'Preview only — meal logging is disabled here.': 'תצוגה מקדימה בלבד — אי אפשר לתעד ארוחות כאן.',
  'Photo is too large (max 8 MB).': 'התמונה גדולה מדי (עד 8MB).',
  'Could not get public URL for the photo.': 'לא הצלחנו לקבל כתובת לתמונה.',
  'Upload failed.': 'ההעלאה נכשלה.',
  'Could not analyze the photo.': 'לא הצלחנו לנתח את התמונה.',
  'Save failed.': 'השמירה נכשלה.',
  'Server error': 'שגיאת שרת',
  'AI call failed': 'הניתוח נכשל',
  'Previous day': 'יום קודם',
  'Next day': 'יום הבא',
  'TODAY · TOTAL': 'היום · סה"כ',
  'DAY TOTAL': 'סה"כ ליום',
  KCAL: 'קק"ל',
  PROTEIN: 'חלבון',
  CARB: 'פחמימה',
  FAT: 'שומן',
  g: 'ג׳',
  MEAL: 'ארוחה',
  MEALS: 'ארוחות',
  'Optional hint (e.g. "1 tbsp olive oil")': 'רמז, לא חובה (למשל "כף שמן זית")',
  'SAVING…': 'שומר…',
  'SAVE MEAL': 'שמור ארוחה',
  // The unread-notes banner on the program tab, and its link. The arrow is in
  // the key so it turns with the text, like 'READINESS GRAPH →'.
  'new note from Ohad': 'הערה חדשה מאוהד',
  'new notes from Ohad': 'הערות חדשות מאוהד',
  'View in History →': 'לצפייה בהיסטוריה ←',
  // The cue expander under an exercise on the program tab.
  '▼ MORE': '▼ עוד',
  '▲ LESS': '▲ פחות',
  "CLEAR ALL": 'נקה הכל',
  "PATTERN COVERAGE:": 'כיסוי תבניות:',
  EDITOR: 'עורך',
  OVERVIEW: 'סקירה',
  "← BACK": '→ חזרה',
  "DAILY ✓": 'יומי ✓',
  MORE: 'עוד',
  "Update the exercise database": 'עדכן את מאגר התרגילים',
  "Save new exercise": 'שמור תרגיל חדש',
  "● REC": '● הקלט',
  "SENDING…": 'שולח…',
  "SEND →": 'שלח ←',
  "No workouts yet.": 'עוד אין אימונים.',
  "NO RECORDS YET": 'עוד אין שיאים',
  "Log a few sessions with weights and your records will show up here.": 'רשום כמה אימונים עם משקלים והשיאים שלך יופיעו כאן.',
  NOTIFICATIONS: 'התראות',
  "On. You'll get a push when an athlete messages you or finishes a workout.": 'פועל. תקבל התראה כשמתאמן שולח לך הודעה או מסיים אימון.',
  "On. You'll get a push when your coach messages you.": 'פועל. תקבל התראה כשהמאמן שולח לך הודעה.',
  "Off. Tap Enable to get a push when an athlete messages you or finishes a workout.": 'כבוי. לחץ על הפעל כדי לקבל התראה כשמתאמן שולח לך הודעה או מסיים אימון.',
  "Off. Tap Enable to get a push when your coach messages you.": 'כבוי. לחץ על הפעל כדי לקבל התראה כשהמאמן שולח לך הודעה.',
  "Add EXPO to your home screen first, then enable from the installed app.": 'קודם הוסף את EXPO למסך הבית, ואז הפעל מתוך האפליקציה המותקנת.',
  "(Apple requires this for push.)": '(אפל דורשת את זה בשביל התראות.)',
  "Blocked in browser settings. Re-allow notifications for this site, then refresh.": 'חסום בהגדרות הדפדפן. אפשר מחדש התראות לאתר הזה, ואז רענן.',
  "TURN OFF": 'כבה',
  ENABLE: 'הפעל',
  EX: 'תרגילים',
  "DEMO · ATHLETE PORTAL · CHANGES DON'T PERSIST": 'דמו · פורטל המתאמן · שינויים לא נשמרים',
  "Search…": 'חיפוש…',
  "Add a task…": 'הוסף משימה…',
  "Search tasks…": 'חפש משימות…',
  "Auto-Alerts": 'התראות אוטומטיות',
  "Task title — Enter to add, Esc to close": 'כותרת משימה — Enter להוספה, Esc לסגירה',
  "Could not reach the server. The roster appears when the connection returns.": 'אין חיבור לשרת. הרשימה תופיע כשהחיבור יחזור.',
  "No archived athletes.": 'אין מתאמנים בארכיון.',
  "No athletes yet. Add your first one.": 'עוד אין מתאמנים. הוסף את הראשון.',
  "not in": 'לא נכנס',
  W: 'שבוע ',
  "Compare with…": 'השווה עם…',
  "SETS DONE": 'סטים שבוצעו',
  "READINESS CHECK-IN": 'צ׳ק-אין מוכנות',
  "Workouts logged in the Athlete Portal will appear here": 'אימונים שנרשמו בפורטל המתאמן יופיעו כאן',
  "No workouts waiting on your review.": 'אין אימונים שמחכים לבדיקה שלך.',
  "Loading chat logs…": 'טוען יומני צ׳אט…',
  "CHAT AUDIT": 'ביקורת צ׳אט',
  "ERRORS ONLY": 'שגיאות בלבד',
  VISITOR: 'מבקר',
  ERROR: 'שגיאה',
  BOT: 'בוט',
  "Loading waitlist…": 'טוען רשימת המתנה…',
  "MULTI-TENANT GATE": 'שער רב-לקוחות',
  Funnel: 'משפך',
  Leads: 'לידים',
  "Contact rate": 'שיעור יצירת קשר',
  "Median t→contact": 'חציון זמן עד קשר',
  "Signed up": 'נרשם',
  "Source mix": 'תמהיל מקורות',
  "Avg intent": 'כוונה ממוצעת',
  "Filter by email, source, or notes…": 'סנן לפי אימייל, מקור או הערות…',
  Email: 'אימייל',
  Intent: 'כוונה',
  "AI summary of the chat conversation": 'סיכום AI של שיחת הצ׳אט',
  NEW: 'חדש',
  "What did they say in DM?": 'מה הוא כתב בהודעה?',
  "saving…": 'שומר…',
  "Undo contacted": 'בטל "נוצר קשר"',
  "Mark contacted": 'סמן שנוצר קשר',
  "DM notes…": 'הערות מההודעות…',
  CUE: 'קיו',
  Completed: 'הושלם',
  "Complete Workout": 'סיים אימון',
  "Create a plan first.": 'קודם צור תוכנית.',
  "No athletes match.": 'אין מתאמנים תואמים.',
  "LOG INTO": 'רישום אל',
  "No reports.": 'אין דיווחים.',
  "No open reports.": 'אין דיווחים פתוחים.',
  "No triaged reports.": 'אין דיווחים שטופלו.',
  "No fixed reports.": 'אין דיווחים שתוקנו.',
  "✓ IN": '✓ נכנס',
  "CHECK IN": 'כניסה',
  DONE: 'בוצע',
  "Drop a file here": 'זרוק קובץ כאן',
  "Reading…": 'קורא…',
  "Replace File": 'החלף קובץ',
  "Pick File": 'בחר קובץ',
  FILE: 'קובץ',
  "Buffer (min)": 'מרווח (דק׳)',
  "Lead time (hrs)": 'זמן מקדים (שעות)',
  "Zoom URL": 'קישור זום',
  "Booking slug": 'כתובת ההזמנה',
  "Display name": 'שם לתצוגה',
  "Duration (min)": 'משך (דק׳)',
  "CANCELLATION POLICY": 'מדיניות ביטול',
  "PUBLIC URL:": 'כתובת ציבורית:',
  "Weekly Availability": 'זמינות שבועית',
  "+ ADD RULE": '+ הוסף כלל',
  "No availability rules. Add one to allow bookings.": 'אין כללי זמינות. הוסף אחד כדי לאפשר הזמנות.',
  UPCOMING: 'קרובים',
  "No bookings yet. Share the public URL above.": 'עוד אין הזמנות. שתף את הכתובת הציבורית למעלה.',
  Settings: 'הגדרות',
  "Unused Links": 'קישורים שלא נוצלו',
  "ON THE FLOOR": 'על הרצפה',
  "CHECKED IN": 'נכנסו',
  FINISH: 'סיים',
  "ADD ATHLETES": 'הוסף מתאמנים',
  "BUG REPORTS": 'דיווחי באגים',
  REFRESH: 'רענן',
  "REFRESHING…": 'מרענן…',
  TRIAGED: 'טופל',
  FIXED: 'תוקן',
  "SMART IMPORT": 'ייבוא חכם',
  "XLSX · CSV · TSV · PDF · PNG · JPG · screenshot · text. AI maps it into the EXPO schema and previews before commit.": 'XLSX · CSV · TSV · PDF · PNG · JPG · צילום מסך · טקסט. ה-AI ממפה את זה לסכמה של EXPO ומציג תצוגה מקדימה לפני השמירה.',
  "Drop any document — XLSX, CSV, PDF, image, screenshot. AI reads it, maps it to EXPO's schema, previews before commit.": 'זרוק כל מסמך — XLSX, CSV, PDF, תמונה, צילום מסך. ה-AI קורא, ממפה לסכמה של EXPO ומציג תצוגה מקדימה לפני השמירה.',
  Library: 'ספרייה',
  Matching: 'התאמה',
  Classify: 'סיווג',
  Cleanup: 'ניקוי',
  // ---- the library cleanup tool (2026-09-07)
  "Library Cleanup": 'ניקוי הספרייה',
  flagged: 'סומנו',
  selected: 'נבחרו',
  "Select all": 'בחר הכול',
  Clear: 'נקה',
  "SCANNING…": 'סורק…',
  "Library is clean — no trash-looking entries detected.": 'הספרייה נקייה — לא נמצאו רשומות שנראות כמו זבל.',
  Title: 'שם',
  "Why flagged": 'למה סומן',
  "Plan rows": 'שורות בתוכניות',
  Has: 'יש',
  "has video": 'יש וידאו',
  "has cues/notes": 'יש קיוז/הערות',
  definite: 'ודאי',
  suspicious: 'חשוד',
  "Entries that look like set/rep prescriptions, warmup notes or markers — not real exercises.": 'רשומות שנראות כמו הוראות סטים/חזרות, הערות חימום או סימונים — לא תרגילים אמיתיים.',
  "Pre-checked = definite AND unreferenced AND no video/cues; everything else waits for your eye. Deleting sends any plan rows that used them to the Matching screen to be re-pointed at real exercises.": 'מסומן מראש = ודאי, בלי הפניות ובלי וידאו/קיוז; כל השאר מחכה לעין שלך. מחיקה שולחת שורות תוכנית שהשתמשו בהן למסך ההתאמה כדי להצביע מחדש על תרגילים אמיתיים.',
  "Delete trash entries?": 'למחוק את רשומות הזבל?',
  "Permanently removes": 'מוחק לצמיתות',
  "library entry": 'רשומה בספרייה',
  "library entries": 'רשומות בספרייה',
  "Plan rows that used them lose their link and will appear in the Matching screen for re-pointing. A dated backup of the library exists from today.": 'שורות תוכנית שהשתמשו בהן מאבדות את הקישור ויופיעו במסך ההתאמה להצבעה מחדש. גיבוי מתוארך של הספרייה קיים מהיום.',
  "trash entry deleted": 'רשומת זבל נמחקה',
  "trash entries deleted": 'רשומות זבל נמחקו',
  "affected plan rows now appear in Matching": 'שורות התוכנית שנפגעו מופיעות עכשיו בהתאמה',
  "empty title": 'שם ריק',
  "superset combo — real pairing?": 'צירוף סופרסט — זוג אמיתי?',
  "set/rep numbers": 'מספרי סטים/חזרות',
  "superset marker": 'סימון סופרסט',
  "warmup / % note": 'הערת חימום / %',
  "RPE note": 'הערת RPE',
  "backoff prefix": 'קידומת backoff',
  "set-count note": 'הערת מספר סטים',
  "instruction wording": 'ניסוח של הוראה',
  "tempo prescription": 'הוראת טמפו',
  marker: 'סימון',
  "instruction note": 'הערת הוראה',
  "time note": 'הערת זמן',
  "mostly numbers/symbols": 'בעיקר מספרים/סימנים',
  "contains % / @": 'מכיל % / @',
  "looks like sets×reps": 'נראה כמו סטים×חזרות',
  "references a plan day": 'מפנה ליום בתוכנית',
  "too short": 'קצר מדי',
  Coaching: 'אימון אישי',
  "Payments recorded per client": 'תשלומים שנרשמו לפי לקוח',
  "Payments on record": 'תשלומים ברשומה',
  Rate: 'תעריף',
  "In EXPO": 'ב-EXPO',
  "Gym · transfer": 'חדר כושר · העברה',
  "Gym · cash": 'חדר כושר · מזומן',
  "Via parents": 'דרך ההורים',
  "more done · view all in the history": 'עוד הושלמו · הכול בהיסטוריה',
  "Showing latest": 'מציג את האחרונים',
  Oldest: 'הישן ביותר',
  "Shared — Ohad + Yuval": 'משותף — אוהד + יובל',
  "+ ASSIGN PROGRAM": '+ הקצה תוכנית',
  "Last Payment": 'תשלום אחרון',
  "From the sheets": 'מהגיליונות',
  month: 'חודש',
  months: 'חודשים',
  clients: 'לקוחות',
  "Auto-tasks": 'משימות אוטומטיות',
  "Leave a focus for a day the athlete didn't log in-app (e.g. videos came via WhatsApp). It saves to the exact same place the in-app review writes to — the athlete sees it on that exercise.": 'השאר פוקוס ליום שהמתאמן לא תיעד באפליקציה (למשל, סרטונים שהגיעו בוואטסאפ). זה נשמר בדיוק לאותו מקום שהבדיקה באפליקציה כותבת אליו — המתאמן רואה את זה על התרגיל.',
  // ---- coach app, the labels the 2026-09-07 coverage sweep found rendering English
  Monthly: 'חודשי',
  Couple: 'זוג',
  Custom: 'מותאם',
  Gym: 'חדר כושר',
  Client: 'לקוח',
  "Total Paid": 'סה"כ שולם',
  "NO LOGS": 'אין רישומים',
  "SHOW REVIEWED": 'הצג שנבדקו',
  showing: 'מוצגים',
  linked: 'מקושר',
  "no record": 'אין רשומה',
  Cancelled: 'בוטל',
  "NO PROGRAM ASSIGNED": 'לא הוקצתה תוכנית',
  Whose: 'של מי',
  Soonest: 'הקרוב ביותר',
  Newest: 'החדש ביותר',
  Urgency: 'דחיפות',
  Manual: 'ידני',
  List: 'רשימה',
  Date: 'תאריך',
  View: 'תצוגה',
  Due: 'יעד',
  "Change urgency": 'שנה דחיפות',
  Archive: 'ארכיון',
  PENDING: 'ממתין',
  CANCELLED: 'בוטל',
  "Amounts come from ניהול פיננסי. Dates come from רשימת מתאמנים, which keeps only the latest one per client — the earlier ones were recovered from the sheet's own revision history. Per-client amounts are deliberately not shown: the sheet records a rate and the sessions performed since a payment, which is not what was paid.": 'הסכומים מגיעים מ"ניהול פיננסי". התאריכים מ"רשימת מתאמנים", ששומרת רק את האחרון לכל לקוח — הקודמים שוחזרו מהיסטוריית הגרסאות של הגיליון. סכומים לפי לקוח לא מוצגים בכוונה: הגיליון רושם תעריף ואת האימונים שבוצעו מאז תשלום, וזה לא מה ששולם.',
  // ---- /coach/review-tools, the page behind the camera tools (2026-09-07)
  'MEASURE THE LIFT': 'מדידת ההרמה',
  "Camera & pose tools to read a set you're reviewing — bar speed, range of motion, jump power, live coaching. Owner trial; nothing is saved to the athlete.": 'כלי מצלמה ופוזה לקריאת סט שאתה בודק — מהירות מוט, טווח תנועה, כוח קפיצה, אימון חי. ניסיון לבעלים; שום דבר לא נשמר למתאמן.',
  'Load a reviewed clip': 'טען קליפ שנבדק',
  "Pick an athlete's already-recorded set — only exercises with a video are listed — and the tools analyse it directly, no re-upload.": 'בחר סט שכבר צולם — מופיעים רק תרגילים עם וידאו — והכלים מנתחים אותו ישירות, בלי העלאה מחדש.',
  "No recorded form videos yet — athletes' uploaded clips will appear here to analyse.": 'עוד אין סרטוני טכניקה — קליפים שמתאמנים מעלים יופיעו כאן לניתוח.',
  'Athlete…': 'מתאמן…', 'Block…': 'בלוק…', 'Week…': 'שבוע…', 'Day…': 'יום…', 'Exercise…': 'תרגיל…',
  TOOLS: 'כלים',
  'Lift being analysed': 'ההרמה שמנותחת',
  'Detected from the clip. Change it only if the auto-detect is off.': 'זוהה מהקליפ. שנה רק אם הזיהוי האוטומטי טעה.',
  '…or type any lift': '…או כתוב כל הרמה',
  LIVE: 'חי', CLIP: 'קליפ', 'NEEDS CAMERA': 'צריך מצלמה', 'OPEN →': 'פתח ←',
  'MOVEMENT LAB': 'מעבדת תנועה', 'JUMP TEST': 'מבחן קפיצה', 'LIVE COACH': 'מאמן חי', 'SHOT ANALYZER': 'ניתוח זריקה',
  'Rotatable 3D skeleton rebuilt from the lift': 'שלד תלת-ממדי מסתובב שנבנה מההרמה',
  'Bar speed (VBT) + per-goal stop-set cutoff · ROM/tempo/collapse · L/R symmetry': 'מהירות מוט (VBT) + נקודת עצירה לפי מטרה · טווח/טמפו/קריסה · סימטריה ימין/שמאל',
  'Jump height from flight time · estimated peak power': 'גובה קפיצה מזמן מעוף · הספק שיא מוערך',
  'Real-time reps + depth target + bar-path drift on the live feed': 'חזרות בזמן אמת + יעד עומק + סטיית מסלול המוט בשידור חי',
  'Jump-shot mechanics, phase by phase · does the release repeat across the set': 'מכניקת זריקה, שלב אחרי שלב · האם השחרור חוזר על עצמו לאורך הסט',
  // ---- the login screen, the unauthorized screen, the password modal (auth.jsx, 2026-09-07)
  'Sign-in': 'כניסה',
  'Sign in': 'כניסה',
  'Continue with Google': 'המשך עם Google',
  OR: 'או',
  password: 'סיסמה',
  "Don't have an account? Contact your coach.": 'אין לך חשבון? דבר עם המאמן.',
  'sign-in is not configured yet.': '- הכניסה עוד לא מוגדרת.',
  'Could not reach the server. An ad-blocker or privacy extension, a VPN, or a stale offline cache can block it — try an incognito window, or clear this site’s data.': 'אין חיבור לשרת. חוסם פרסומות, VPN או מטמון ישן יכולים לחסום — נסה חלון גלישה בסתר, או נקה את נתוני האתר.',
  'Connection error:': 'שגיאת חיבור:',
  'Connection error. Try again.': 'שגיאת חיבור. נסה שוב.',
  "Couldn't Verify Account": 'לא הצלחנו לאמת את החשבון',
  'Access Denied': 'אין גישה',
  "we couldn't reach the server to verify your account.": 'לא הצלחנו להגיע לשרת כדי לאמת את החשבון.',
  'Check your connection and try again.': 'בדוק את החיבור ונסה שוב.',
  'is not registered.': 'לא רשום.',
  'Contact your coach to get access.': 'דבר עם המאמן כדי לקבל גישה.',
  'Try Again': 'נסה שוב',
  'Sign Out': 'יציאה',
  'CHANGE PASSWORD': 'שינוי סיסמה',
  'Password updated ✓': 'הסיסמה עודכנה ✓',
  'Current password': 'סיסמה נוכחית',
  'New password': 'סיסמה חדשה',
  'Confirm new password': 'אימות הסיסמה החדשה',
  'Password changes are disabled in preview.': 'אי אפשר לשנות סיסמה בתצוגה מקדימה.',
  'Enter your current password.': 'הכנס את הסיסמה הנוכחית.',
  'New password must be at least 4 characters.': 'הסיסמה החדשה צריכה לפחות 4 תווים.',
  "Passwords don't match.": 'הסיסמאות לא תואמות.',
  'Session lost. Sign out and back in, then retry.': 'החיבור אבד. צא, היכנס שוב ונסה עוד פעם.',
  'Current password is incorrect.': 'הסיסמה הנוכחית שגויה.',
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
  // Ohad picked התחלה / START from the 40-option sheet (2026-08-30): the
  // button OPENS the day rather than recording it, so a verbal noun reads as a
  // label on a door instead of an order to write something down.
  START: 'התחלה',
  LOG: 'התחלה',
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
  // The floor grid, when a session belongs to somebody this screen's roster does
  // not contain. It never shows the internal id.
  'Athlete not on this roster': 'מתאמן שלא ברשימה הזו',
  OFFLINE: 'אופליין',
  "Showing your last saved program. New logs are kept on this phone and sent when you're back online.":
    'מוצגת התוכנית האחרונה שנשמרה. מה שתרשום נשמר בטלפון ויישלח כשתחזור לרשת.',
  "We can't reach the server right now. Your program will be here when you're back online.":
    'אין כרגע חיבור לשרת. התוכנית תחזור ברגע שתהיה שוב ברשת.',
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

// A link may carry the language: expo-il.co.il (another origin, so its own
// storage is out of reach) sends a Hebrew reader to the demo with ?lang=he.
// The hint is kept, so the next visit without it stays Hebrew.
export function readLang() {
  try {
    const hint = new URLSearchParams(window.location.search).get('lang');
    if (hint === 'he' || hint === 'en') { try { localStorage.setItem(LANG_KEY, hint); } catch { /* private mode */ } return hint; }
  } catch { /* no window */ }
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

// Counted nouns. English builds "3 days" by appending an s; Hebrew does not
// pluralise that way, and a number glued to an English word also breaks
// direction inside an RTL line. So the NOUN is chosen per language.
const COUNT_HE = {
  day: ['יום', 'ימים'],
  exercise: ['תרגיל', 'תרגילים'],
  set: ['סט', 'סטים'],
  rep: ['חזרה', 'חזרות'],
  week: ['שבוע', 'שבועות'],
  program: ['תוכנית', 'תוכניות'],
  athlete: ['מתאמן', 'מתאמנים'],
  session: ['אימון', 'אימונים'],
};
export function countIn(lang, n, word) {
  const k = String(word).toLowerCase();
  if (lang === 'he' && COUNT_HE[k]) return `${n} ${COUNT_HE[k][Number(n) === 1 ? 0 : 1]}`;
  return `${n} ${word}${Number(n) === 1 ? '' : 's'}`;
}
