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
  "Bnei Herzliya BC": "מועדון הכדורסל בני הרצליה",
  "Log a practice for this athlete": "רישום אימון לשחקן הזה",
  "League points per game": "נקודות למשחק בליגה",
  "Bodyweight (kg) — optional, shows in the athlete's history + BW trend": "משקל גוף (ק\"ג) — לא חובה, מופיע בהיסטוריה ובגרף המשקל",
  "Wellness check-in": "דיווח תחושה",
  "Open this athlete in EXPO": "פתיחת השחקן ב-EXPO",
  "See exactly what your BHBC coaches see": "תראה בדיוק מה שהמאמנים של המועדון רואים",
  "Team load trend appears here once sessions are logged.": "מגמת העומס של הקבוצה תופיע כאן אחרי שיירשמו אימונים.",
  "No game scheduled — running a general prep block. Add a fixture to anchor the training week.": "אין משחק מתוכנן — עובדים על בלוק הכנה כללי. תוסיף משחק כדי לבנות את השבוע סביבו.",
  "Last game": "המשחק האחרון",
  "Logs this session for": "רושם את האימון ל",
  "available athlete": "מתאמן זמין",
  "available athletes": "מתאמנים זמינים",
  "skips anyone Out.": "מדלג על מי שבחוץ.",
  "Mark resolved / cleared to play": "סימון: הטיפול הסתיים / כשיר לשחק",
  "Fixtures load as the league publishes them.": "המשחקים ייטענו כשהליגה תפרסם אותם.",
  "No games yet.": "עוד אין משחקים.",
  "Bnei Herzliya": "בני הרצליה",
  "Form": "פורמה",
  "Team": "קבוצה",
  "No upcoming sessions.": "אין אימונים קרובים.",
  // "Lower INT" is HIS day-naming convention, not a level: his own plans read
  // "Day 1 - Lower INT + Upper VOL" and "Day 4 - Lower INT + Pull & Unilateral
  // VOL" - lower body on an INTENSITY day, upper body on a VOLUME day. The
  // Hebrew said "low intensity", which is the opposite instruction.
  "Trained": "התאמן",
  "Plan": "תוכנית",
  "All clear": "הכול תקין",
  "— no active injuries.": "— אין פציעות פעילות.",
  "REPORT": "דיווח",
  "League Stats": "סטטיסטיקות ליגה",
  "Switch to a vertical list of days": "מעבר לרשימת ימים אנכית",
  "Switch to seven day columns": "מעבר לשבע עמודות של ימים",
  "Sort ascending": "מיון בסדר עולה",
  "Sort descending": "מיון בסדר יורד",
  "Sort by": "מיון לפי",
  "Logs each athlete’s work to their history & portal — synced with EXPO.": "רושם את העבודה של כל שחקן בהיסטוריה ובפורטל שלו — מסונכרן עם EXPO.",
  "MED ✎": "רפואי ✎",
  "+ MED": "+ רפואי",
  "Sleep": "שינה",
  "Energy": "אנרגיה",
  "Session": "אימון",
  "Latest": "עדכון אחרון",
  "What we did": "מה עשינו",
  "What we did (optional)": "מה עשינו (לא חובה)",
  "e.g. Dynamic Warm-Up (Quick Feet, Coordination) + Ladders & Hurdles (Hip Mobility)": "למשל: חימום דינמי (רגליים מהירות, קואורדינציה) + סולמות ומשוכות (מוביליות ירך)",
  "Open": "פתיחה",
  "Program": "תוכנית",
  "No EXPO program assigned yet": "עוד לא שויכה תוכנית EXPO",
  "previous": "קודמים",
  "1 previous": "בלוק קודם אחד",
  "Hide earlier blocks": "הסתרת הבלוקים הקודמים",
  "Show earlier blocks": "הצגת הבלוקים הקודמים",
  "Loading": "טוען",
  "This block has no days yet": "עוד אין ימים בבלוק הזה",
  "Day": "יום",
  "SET": "סט",
  "REPS": "חזרות",
  "Delete": "מחיקה",
  "This is exactly what your BHBC coaches see — no roster management, medical is view-only.": "זה בדיוק מה שהמאמנים של BHBC רואים — בלי ניהול סגל, והמידע הרפואי לצפייה בלבד.",
  "No game scheduled.": "אין משחק מתוכנן.",
  "Home / Away": "בית / חוץ",
  "Save plan": "שמירת התוכנית",
  "Save check-in": "שמירת הדיווח",
  "Pain": "כאב",
  "Baseline all OK": "הכול תקין לכולם",
  "Current block": "הבלוק הנוכחי",
  "Loading session logger…": "טוען את רישום האימון…",
  "Exit preview": "יציאה מהתצוגה",
  'Gym': 'חדר כוח',
  'View program': 'תוכנית האימון',
  'All': "הכול",
  'Practices': "אימונים",
  'Weight room': "חדר כוח",
  'attended': "נכח",
  'lift': "תרגיל",
  'lifts': "תרגילים",
  'set': "סט",
  'sets': "סטים",
  'Bodyweight': "משקל גוף",
  'kg': "ק\"ג",
  'Nothing of this kind yet.': 'אין עדיין כלום מהסוג הזה.',
  'No history logged yet.': 'עוד לא נרשמה היסטוריה.',
  'Notes': 'הערות',
  'games': 'משחקים',
  'game': 'משחק',
  'Bilateral': 'דו-צדדי',
  'Tag athletes into Bnei Herzliya. They keep their normal athlete portal — this scopes who appears in the BHBC zone.': 'סמן מתאמנים כשייכים לבני הרצליה. הפורטל האישי שלהם לא משתנה — זה רק קובע מי מופיע באזור המועדון.',
  'Add a new athlete — full name': 'הוספת מתאמן — שם מלא',
  '+ Add': '+ הוספה',
  'Lands': 'נוחת',
  'Landing / arrival date': 'תאריך נחיתה / הגעה',
  'Scrimmage': 'משחק אימון',
  'Shootaround': 'שוטאראונד',
  'TBD': 'עוד לא נקבע',
  Group: 'קבוצתי',
  Single: 'יחיד',
  'available#1': 'זמין',
  h: ' ש׳',
  'limited#1': 'מוגבל',
  'lifted today#1': 'התאמן היום',
  'lifted#1': 'התאמן',
  '→': '←',
  'HaYovel, Herzliya': 'היובל, הרצליה',
  'Show {n} more': 'עוד {n}',
  'GAME': 'משחק',
  // A LIFT is one athlete's own weight-room session (24.9); the team block
  // before a practice is 'אימון כוח'. Two words, two things.
  'Lift': 'הרמה',
  'Conditioning': 'קונדישן',
  'Recovery': 'התאוששות',
  'The {season} season has not started yet.': 'עונת {season} עוד לא נפתחה.',
  'TODAY': 'היום',
  'Month': 'חודש',
  'Week': 'שבוע',
  'List': 'רשימה',
  'Player': 'שחקן',
  'Margin': 'הפרש',
  'Live': 'עונה נוכחית',
  'Champions League': 'ליגת האלופות',
  'Injury': 'פציעה',
  'Status': 'סטטוס',
  'Since · pain': 'מאז · כאב',
  'Reported by': 'דווח ע״י',
  'Point Guard': 'פוינט גארד',
  'Shooting Guard': 'שוטינג גארד',
  'Guard': 'גארד',
  'Small Forward': 'סמול פורוורד',
  'Power Forward': 'פאוור פורוורד',
  'Forward': 'פורוורד',
  'Center': 'סנטר',
  'Guard-Forward': 'גארד-פורוורד',
  'Forward-Center': 'פורוורד-סנטר',
  'No team sessions scheduled this week.': 'אין אימוני קבוצה מתוכננים השבוע.',
  'Load anchored to the game: heaviest far out (MD-4/-3), taper MD-1 (hold intensity, cut volume), regenerate MD+1.': 'העומס נבנה סביב המשחק: הכי כבד רחוק ממנו (MD-4/-3), הורדה ב-MD-1 (שומרים עצימות, חותכים נפח), התאוששות ב-MD+1.',
  'No games played yet this season — team stats fill in automatically after tip-off.': 'עוד לא היו משחקים העונה — נתוני הקבוצה יתמלאו לבד אחרי המשחק הראשון.',
  'No {season} games played yet — per-player league numbers appear here after tip-off.': 'עוד לא היו משחקים ב-{season} — מספרי הליגה של כל שחקן יופיעו כאן אחרי המשחק הראשון.',
  'ROM → Tempo → Intensity → Volume → Frequency': 'טווח תנועה ← טמפו ← עצימות ← נפח ← תדירות',
  // ---- navigation -------------------------------------------------------
  Overview: 'סקירה',
  Roster: 'סגל',
  Schedule: 'לו"ז',
  Medical: 'רפואי',
  Sessions: 'אימונים',
  Games: 'משחקים',

  // ---- header controls --------------------------------------------------
  'Sign out': 'יציאה',              // spoken; התנתקות is bureaucratic
  Offline: 'אופליין',
  'Showing the last data saved on this device. It may be out of date, and anything you log will be sent when the connection returns.':
    'מוצג המידע האחרון שנשמר במכשיר. יכול להיות שהוא לא מעודכן, וכל מה שתרשום יישלח כשהחיבור יחזור.',
  'Preview as coach': 'תצוגת מאמן',
  'Preview': 'כמאמן',
  'Back': 'חזרה',
  'Coach view': 'תצוגת מאמן',
  'Back to EXPO coach': 'חזרה ל-EXPO',

  // ---- head coach report ------------------------------------------------
  'Head coach report': 'דוח למאמן הראשי',
  'Next game': 'המשחק הבא',
  Availability: 'זמינות',
  'This week': 'השבוע',
  // Added 2026-09-03 with the merged report and the playoff stages. A string
  // that reaches the screen without an entry here renders in English inside a
  // Hebrew zone, which is the coverage gap he has called out before.
  Focus: 'פוקוס',
  // The COPY control moved into the head-coach report header when the two
  // reports merged; it had been rendering in English inside a Hebrew zone.
  Copy: 'העתק',
  Copied: 'הועתק',
  // S&C brief row kinds. Game / Medical / Sessions already had entries; these
  // four did not, so a Hebrew brief mixed scripts down its own label column.
  Setup: 'הקמה',
  // The two S&C brief lines that were still built from hardcoded English.
  'Taper into': 'הורדת עומס לקראת המשחק',
  'the game': 'הקרוב',
  // Lower-case 'today' is a separate key from the capitalised label.
  today: 'היום',
  'hold intensity, cut volume ~40–60%.': 'שמור על העצימות ותוריד בערך 40–60 אחוז מהנפח.',
  Congestion: 'צפיפות משחקים',
  '-day turnaround between games - rotate minutes and protect MD+1 recovery.': ' ימים בין המשחקים — תעשה רוטציה בדקות ושמור על ההתאוששות ביום שאחרי.',
  '1-day turnaround between games - rotate minutes and protect MD+1 recovery.': 'יום אחד בין המשחקים — תעשה רוטציה בדקות ושמור על ההתאוששות ביום שאחרי.',
  '2-day turnaround between games - rotate minutes and protect MD+1 recovery.': 'יומיים בין המשחקים — תעשה רוטציה בדקות ושמור על ההתאוששות ביום שאחרי.',
  d: ' ימים',
  Load: 'עומס',
  Readiness: 'מוכנות',
  Fixtures: 'משחקים',
  // Competition stages, from the league feed's own board names.
  'Quarter Final': 'רבע גמר',
  'Semi Final': 'חצי גמר',
  'Final Series': 'סדרת הגמר',
  'Winner Cup': 'גביע וינר',
  'League': 'ליגה',
  'Update injury': 'עדכון פציעה',
  'Report injury': 'דיווח פציעה',
  'Logged for 1 athlete': 'נרשם אימון לשחקן אחד',
  'Logged for {n} athletes': 'נרשם אימון ל-{n} שחקנים',
  // fixture sync writes these as the venue when the hall is not known yet
  'away': 'חוץ',
  'away #TBD': 'חוץ · אולם עוד לא נקבע',
  'Home': 'בית',
  'Away': 'חוץ',
  'Ohad + PT': 'אוהד + פיזיו',
  'Play-In': 'פליי-אין',
  Supercup: 'הסופרקאף',
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
  'No sessions': 'אין אימונים',
  'Log a session': 'תוסיף אימון',        // future-as-imperative, his register
  'Previous injuries': 'פציעות קודמות',
  '+ Log': '+ רישום',
  'No athletes on the roster yet': 'עוד אין שחקנים בסגל',
  'Add athletes': 'הוספת שחקנים',
  // Athlete-card metric strip: says why a tile is empty instead of a bare dash.
  'needs sRPE': 'חסר sRPE',
  'none logged': 'לא נרשם',
  'sRPE × min': 'sRPE × דקות',
  '4-week base': 'בסיס 4 שבועות',
  // Concussion — graduated return to sport. Coaching register, masculine
  // singular, and nothing here decides anyone is fit to play.
  'Concussion — Graduated Return to Sport': 'זעזוע מוח — חזרה מדורגת למשחק',
  'Symptom-limited activity': 'פעילות בגבולות התסמינים',
  'Daily activities that do not provoke symptoms. No training.': 'פעולות יום-יום שלא מעוררות תסמינים. בלי אימונים.',
  'Light aerobic': 'אירובי קל',
  'Walking or stationary bike, low intensity. No resistance training.': 'הליכה או אופניים נייחים בעצימות נמוכה. בלי אימוני כוח.',
  'Sport-specific': 'ספציפי לכדורסל',
  'Running and court movement, alone. No head-impact activity.': 'ריצה ותנועה על המגרש, לבד. בלי שום דבר עם סיכון למכה בראש.',
  'Non-contact drills': 'תרגילים ללא מגע',
  'Harder drills, passing, change of direction. Resistance training may resume.': 'תרגילים קשים יותר, מסירות, שינויי כיוון. אפשר לחזור לאימוני כוח.',
  'Full-contact practice': 'אימון מלא עם מגע',
  'Only after written medical clearance. Normal training activities.': 'רק אחרי אישור רפואי בכתב. אימון רגיל.',
  'Return to play': 'חזרה למשחק',
  'Normal game play.': 'משחק רגיל.',
  'Pacing': 'קצב',
  'At least 24 hours per step. If symptoms come back, go back one step and try again after 24 hours symptom-free.': 'לפחות 24 שעות בכל שלב. אם התסמינים חוזרים, חזור שלב אחד אחורה ונסה שוב אחרי 24 שעות בלי תסמינים.',
  'Deteriorating consciousness · repeated vomiting · seizure · worsening headache · neck pain · weakness or tingling · out-of-character behaviour — emergency assessment, same day.': 'ירידה במצב ההכרה · הקאות חוזרות · פרכוס · כאב ראש שמחמיר · כאב צוואר · חולשה או נימול · התנהגות לא אופיינית — פנייה מיידית למיון.',
  'Steps 5 and 6 need medical clearance. This screen tracks the plan; it does not clear anyone to play.': 'שלבים 5 ו-6 דורשים אישור רפואי. המסך הזה עוקב אחרי התוכנית — הוא לא מאשר לאף אחד לשחק.',
  'A head injury has no side.': 'לחבלת ראש אין צד.',
  'ACWR danger zone': 'ACWR מעל 1.5 — תוריד עומס היום, הסיכון לפציעה עולה כאן.',
  'ACWR elevated': 'ACWR בין 1.3 ל-1.5 — תשאיר את העומס כמו שהוא, אל תוסיף.',
  'monotony high': 'מונוטוניות 2 ומעלה — תגדיל את ההבדל בין ימים קשים לקלים.',
  'ACWR undertrained': 'ACWR מתחת ל-0.8 — תעלה בערך 10 אחוז בשבוע, בלי קפיצה.',
  'band sweet spot': '0.8 עד 1.3 · טווח טוב',
  'band elevated': 'מעל 1.3 · מוגבר',
  'band danger': '1.5 ומעלה · סכנה',
  'band undertrained': 'מתחת ל-0.8 · תת-עומס',
  'Pull back': 'תוריד עומס אצל',
  Regress: 'תוריד רמה אצל',
  'readiness red': 'מוכנות אדומה',
  'reassess before loading': 'תבדוק שוב לפני שאתה מעמיס',
  'in rehab': 'בשיקום',
  'check the medical board': 'תיכנס ללוח הרפואי — חזרה למשחק והגבלות.',
  Watch: 'עקוב אחרי',
  'Vary the stimulus for': 'תגוון את הגירוי אצל',
  'Ramp up': 'תעלה עומס בהדרגה אצל',
  'Chase check-ins': 'תזכיר לשחקנים לדווח',
  'Start tracking the roster': 'תתחיל לעקוב אחרי הסגל',
  // Once attendance exists, "start tracking" is stale advice; the gap is RPE.
  'Add an RPE to your sessions': 'תוסיף RPE לאימונים',
  'attendance is logged, intensity is not': 'הנוכחות נרשמת, העצימות לא — בלי RPE אין עומס ואין ACWR.',
  'pre-season start': 'טרום עונה — תרשום את האימונים הראשונים וצ׳ק-אין יומי, ואז ACWR ומוכנות מתחילים לעבוד.',
  'Start session': 'התחל אימון',
  'None today · next': 'אין היום · הבא',
  Edit: 'עריכה',
  'Off / general prep': 'מנוחה / הכנה כללית',
  'General strength base': 'בסיס כוח כללי',
  'Max strength + power (heaviest, far from game)': 'כוח מקסימלי ועוצמה — הכי כבד, רחוק מהמשחק',
  'Strength + power': 'כוח ועוצמה',
  'Power / speed · moderate volume': 'עוצמה ומהירות · נפח בינוני',
  'Activation + taper — hold intensity, cut volume': 'הפעלה והורדת נפח — שמור על העצימות, תוריד נפח',
  'Game day': 'יום משחק',
  'Recovery / regeneration': 'התאוששות',
  'Reload — build back up': 'חזרה לעומס — בונים בחזרה',
  Elbow: 'מרפק',
  Foot: 'כף רגל',
  'Head / Concussion': 'ראש / זעזוע מוח',
  Ankle: 'קרסול',
  Knee: 'ברך',
  Hip: 'מפרק הירך',
  Hamstring: 'המסטרינג',
  Groin: 'מפשעה',
  Quad: 'ארבע ראשי',
  Calf: 'תאומים',
  Achilles: 'אכילס',
  'Lower back': 'גב תחתון',
  Shoulder: 'כתף',
  Wrist: 'שורש כף היד',
  Hand: 'כף יד',
  Left: 'שמאל',
  Right: 'ימין',
  Strain: 'מתיחת שריר',
  Sprain: 'נקע',
  Contusion: 'חבלה',
  Tendinopathy: 'טנדינופתיה',
  Overuse: 'שימוש יתר',
  Fracture: 'שבר',
  Dislocation: 'פריקה',
  Illness: 'מחלה',
  Other: 'אחר',
  'From calendar': 'מהיומן',
  Type: 'סוג',
  'Readiness (optional)': 'מוכנות (לא חובה)',
  'Energy 0–10': 'אנרגיה 0–10',
  'Pain 0–10': 'כאב 0–10',
  'Sleep 0–10': 'שינה 0–10',
  'Body part': 'אזור בגוף',
  Side: 'צד',
  'Current status': 'סטטוס נוכחי',
  'Mechanism / how it happened': 'מנגנון · איך זה קרה',
  'Pain (0–10)': 'כאב (0–10)',
  'Rehab progress': 'התקדמות בשיקום',
  'Save record': 'שמירת הרשומה',
  Add: 'הוספה',
  'Progress note for today…': 'מה קרה היום בשיקום',
  'e.g. landed awkwardly on a rebound': 'לדוגמה: נחת לא טוב אחרי ריבאונד',
  pain: 'כאב',
  'BW kg': 'משקל ק״ג',
  Intensity: 'עצימות',
  Microcycle: 'מיקרו-מחזור',
  Note: 'הערה',
  'This slot': 'המשבצת הזו',
  'Which session': 'איזה אימון',
  note: 'הערה',
  Round: 'מחזור',
  'logged by': 'נרשם על ידי',
  'team S&C': 'כוח קבוצתי',
  'individual lift': 'אימון כוח אישי',
  'Brief for the staff': 'תקציר לצוות',
  'no load yet': 'עוד אין עומס',
  // A card that has attendance but no RPE says what it knows: how many sessions.
  // An RTP target the squad has already sailed past.
  overdue: 'באיחור',
  session: 'אימון',
  sessions: 'אימונים',
  'view only': 'צפייה בלבד',
  active: 'פעילות',
  'season not started': 'העונה עוד לא נפתחה — נתוני הקבוצה יופיעו כאן אחרי המשחק הראשון.',
  Record: 'מאזן',
  Points: 'נקודות',
  Allowed: 'ספגה',
  'per game': 'למשחק',
  'Last season': 'העונה שעברה',
  'Last season results': 'תוצאות מהעונה שעברה',
  'avg load': 'עומס ממוצע',
  '+ PLAN': '+ תכנון',
  '+ Log practice': '+ רישום אימון',
  'Log practice': 'רישום אימון',
  'BNEI HERZLIYA': 'בני הרצליה',
  'Session load · RPE x minutes': 'עומס אימון · RPE כפול דקות',
  'No load logged yet': 'עוד לא נרשם עומס',
  '7 days': '7 ימים',
  'Log session': 'הוספת אימון',
  'Back from injury, loading too fast': 'חזר מפציעה ועולה בעומס מהר מדי',
  'back': 'חזר לפני',
  'days': 'ימים',
  'this week': 'השבוע',
  'of his own pre-injury week': 'מהשבוע שלו לפני הפציעה',
  'guide': 'המלצה',
  'CUT TODAY': 'להוריד עומס היום',
  'WATCH': 'לעקוב',
  'Minutes played': 'דקות משחק',
  'ADD MINUTES': 'הוספת דקות',
  'logged': 'נרשמו',
  'DNP': 'לא שיחק',
  'played': 'שיחקו',
  'min total': 'דקות בסך הכל',
  'Game': 'משחק',
  'Edit session': 'עריכת אימון',
  'Remove session': 'מחיקת אימון',
  'Delete session': 'מחיקת אימון',
  'Edit minutes': 'עריכת דקות',
  'Session plan': 'תוכנית האימון',
  // The owner-only ACTIVITY tab: who works in the zone and what they changed.
  'Activity': 'פעילות',
  'Who has been in, last 30 days': 'מי נכנס ב-30 הימים האחרונים',
  'What changed': 'מה השתנה',
  'Signed in': 'כניסה',
  'Check-in': 'צ׳ק-אין',
  'action': 'פעולה',
  'actions': 'פעולות',
  'opened the club zone': 'נכנס לאזור המועדון',
  Practice: 'אימון',
  Weights: 'כוח',
  Rows: 'שורות',
  Columns: 'עמודות',
  min: 'דק׳',

  // ---- roster / medical -------------------------------------------------
  'Manage roster': 'ניהול הסגל',
  'Load & Injury Risk': 'עומס וסיכון לפציעה',
  'Return-to-Play Protocol': 'חזרה למשחק',
  'Return-to-play target': 'יעד לחזרה',
  'Update this medical report': 'עדכון הדוח הרפואי',
  'Onset date': 'תאריך הפציעה',

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
  // ---- 17.9 O11: runs the literal gate could not see (a comma, or a lowercase start)
  'Add the roster to start tracking load, availability and readiness.': 'תוסיף את הסגל כדי להתחיל לעקוב אחרי עומס, זמינות ומוכנות.',
  'All clear — no load, readiness or medical flags today.': 'הכול תקין — אין היום התראות על עומס, מוכנות או מצב רפואי.',
  'Notes (assessment, plan, PT observations)': 'הערות (הערכה, תוכנית, מה הפיזיותרפיסט ראה)',
  'total': 'בסך הכול',
  '{n} of {m} filled': '{n} מתוך {m} מילאו',
  '1 day after the previous game': 'יום אחרי המשחק הקודם',
  '2 days after the previous game': 'יומיים אחרי המשחק הקודם',
  '{n} days after the previous game': '{n} ימים אחרי המשחק הקודם',
  '1d turnaround': 'יום בין משחקים',
  '2d turnaround': 'יומיים בין משחקים',
  '{n}d turnaround': '{n} ימים בין משחקים',
  '28d ago': 'לפני 28 ימים',
  'nobody logged': 'אף אחד לא רשם',
  'optional': 'רשות',
  '+{n} more': 'ועוד {n}',
  'tap a column to sort': 'לחץ על עמודה למיון',
  '— select —': '— בחר —',
  '— add roster first —': '— קודם תוסיף סגל —',
  'Gym session — minutes only, no RPE': 'אימון בחדר הכושר — רק דקות, בלי RPE',
  'units': 'יחידות',
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
// For module-level helpers that build text outside a component (no hook to call).
export const zoneT = (s) => bhbcT(_dateLang, s);
// Counts composed at the call site ('1 מוגבלים', '22d באיחור' on the Hebrew screen, 17.9).
// A key may carry a singular form as HE['key#1'].
export const countWord = (n, key) => (_dateLang === 'he' && n === 1 && HE[key + '#1']) ? HE[key + '#1'] : bhbcT(_dateLang, key);
export const daysFor = (n) => (_dateLang === 'he' ? (n === 1 ? 'יום אחד' : `${n} ימים`) : `${n}d`);
export const overdueFor = (n) => (_dateLang === 'he' ? (n === 1 ? 'באיחור של יום' : `באיחור של ${n} ימים`) : `${n}d overdue`);

// א׳-ש׳ with a geresh, which is how an Israeli coach writes a weekday short.
const DOW_HE = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
// "27 באוג׳" — the ב prefix is not optional in Hebrew; "27 אוג׳" reads broken.
const MON_HE = ['ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני', 'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳'];

export const dowFor = (d, en) => (_dateLang === 'he' ? DOW_HE[d.getDay()] : en);
// The same by weekday index, for a header row that is not a date.
export const dowIdxFor = (i, en) => (_dateLang === 'he' ? DOW_HE[i] : en);
export const monDayFor = (d, en) => (_dateLang === 'he' ? `${d.getDate()} ב${MON_HE[d.getMonth()]}` : en);

// Month heading on the calendar ("Sep 2026"); index 0 = January.
export const monFor = (monthIndex, en) => (_dateLang === 'he' ? MON_HE[monthIndex] : en);

/** Fixture kind → what a coach calls it. */
export const fxLabelFor = (kind, en) => {
  if (_dateLang !== 'he') return en;
  // __min is the minutes unit, routed through the same helper so the one
  // language switch covers labels and units together.
  return { game: 'משחק', practice: 'אימון', lift: 'כוח', scrimmage: 'משחק אימון', shootaround: 'שוטאראונד', __min: 'דק׳' }[kind] ?? en;
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
  'Venue TBD': 'האולם עוד לא נקבע',
  UPDATE: 'עדכון',
  'Opponent TBD': 'היריבה עוד לא נקבעה',
  Tomorrow: 'מחר',
  'Time TBD': 'השעה עוד לא נקבעה',
  // 'מול' is what a coach says before an opponent — 'נגד' is combative.
  vs: 'מול',
  'Pre-season': 'טרום עונה',
  'no focus yet': 'עוד אין פוקוס',
  // ---- medical board ----------------------------------------------------
  'Medical · Injury Board': 'רפואי · לוח פציעות',
  'Active Injuries': 'פציעות פעילות',
  'Roster Health': 'מצב הסגל',
  Out: 'בחוץ',
  'Non-contact': 'ללא מגע',
  Cleared: 'כשירים',
  Available: 'זמין',

  'No sessions scheduled.': 'אין אימונים מתוכננים.',

  // ---- availability + readiness -----------------------------------------
  // The physio reads this board in Hebrew; these were the last English words
  // left on it. The readiness headlines are composed in readinessAutoreg.js,
  // which the athlete app shares - so they are translated HERE, at the club
  // zone render, and that file stays untouched.
  'Full': 'מלא',
  'Out · Med': 'בחוץ · רפואי',
  'Out · Pers': 'בחוץ · אישי',
  'baseline': 'בסיס',
  'no check-in': 'אין דיווח',
  'Click to change availability': 'תלחץ כדי לשנות זמינות',
  'comes from the medical record. Open Medical to change it — an injured athlete can still be Limited.': 'מגיע מהתיק הרפואי. תיכנס לרפואי כדי לשנות — שחקן פצוע יכול עדיין להיות מוגבל.',
  'No check-in logged': 'לא נרשם דיווח',
  'Pain 6+ — don\'t load today': 'כאב 6 ומעלה — לא מעמיסים היום',
  'Pain 4–5 — modify the session': 'כאב 4–5 — משנים את האימון',
  'Pain not logged — confirm first': 'כאב לא נרשם — תוודא קודם',
  'Mild pain — train pain-free': 'כאב קל — מתאמנים בלי כאב',
  'Pain clear — train as planned': 'אין כאב — מתאמנים לפי התוכנית',
  'Good markers — confirm pain first': 'מדדים טובים — קודם תבדוק רמת כאב',
  'Recovered — train pain-free': 'התאושש — מתאמנים בלי כאב',
  'Looks good — train as planned': 'נראה טוב — לפי התוכנית',
  'Recovered — full send': 'התאושש — אפשר ללחוץ',
  'A bit under — trim, don\'t grind': 'קצת מתחת — מקצרים, לא טוחנים',
  'Run down — back off today': 'שחוק — מורידים עומס היום',
  // ---- return-to-play ladder + the two safety rules under it -----------
  'Full history': 'היסטוריה מלאה',
  'Acute · protect': 'חריף · הגנה',
  'Offload the tissue, manage pain + swelling. Pain-free daily movement only.': 'תוריד עומס מהרקמה ותטפל בכאב ובנפיחות. רק תנועה יומיומית בלי כאב.',
  'Pain-free ROM': 'טווח בלי כאב',
  'Restore full range with no symptoms before adding load.': 'תחזיר טווח תנועה מלא בלי תסמינים לפני שאתה מוסיף עומס.',
  'Loaded rehab': 'שיקום בעומס',
  'Re-load progressively — isometrics → tempo → full-ROM strength.': 'תעמיס בהדרגה — איזומטרי ← טמפו ← כוח בטווח תנועה מלא.',
  'Running, change-of-direction and court work, no contact.': 'ריצה, שינויי כיוון ועבודה על הפרקט, בלי מגע.',
  'Contact · modified': 'מגע · מותאם',
  'Full-speed contact drills with minutes capped.': 'תרגילי מגע במהירות מלאה עם תקרת דקות.',
  'Full training → cleared': 'אימון מלא ← כשיר',
  'Complete sessions, no restrictions, then clear to play.': 'אימונים מלאים בלי הגבלות, ואז אישור לשחק.',
  'Pain gate': 'סף כאב',
  'Refer out': 'הפניה רפואית',
  '0–3/10 progress · 4–5 hold & modify (regress ': 'ב-0–3/10 מתקדמים · ב-4–5 נשארים בשלב ומתאימים (מורידים ',
  ', cut frequency last) · 6+ stop & reassess.': ', תדירות אחרונה) · מ-6 ומעלה עוצרים ובודקים מחדש.',
  'Saddle anaesthesia · bowel/bladder change · drop foot · unexplained weight loss · night pain unrelated to position — never manage through these.': 'חוסר תחושה באזור האוכף · שינוי בתפקוד השתן או היציאות · צניחת כף רגל · ירידה לא מוסברת במשקל · כאב לילי שלא תלוי בתנוחה — אם יש אחד מאלה, לא ממשיכים לאמן.',

  // ---- the medical row action ------------------------------------------
  // The chevron turns with the text: it points the way the reader is going.
  'Update ›': 'עדכון ‹',
  'record': 'רשומה',
  'records': 'רשומות',
  'Update the medical report': 'עדכון הדוח הרפואי',
  'Report an injury': 'דיווח על פציעה',

  // "Head / Concussion" splits at the slash on a squad card.
  Head: 'ראש',

  // ---- the weight-room board -------------------------------------------
  'Weight Room': 'חדר כוח',
  'due': 'בפיגור',
  'everyone is current': 'כולם מעודכנים',
  'in 7 days': 'ב-7 ימים',
  'in 28': 'ב-28',
  'nothing logged yet': 'עוד לא נרשם כלום',
  'never': 'אף פעם',
  'yesterday': 'אתמול',
  'days ago': 'ימים',
  'lifted today': 'התאמנו היום',
  'Two weight-room sessions a week is the standard here — amber at 4 days, red at 7.': 'שני אימוני כוח בשבוע זה הסטנדרט כאן — כתום אחרי 4 ימים, אדום אחרי 7.',

  // ---- practice attendance: who trained basketball and who did not -----
  // Ohad 20.9: "i want an easy way to view the history of who trained
  // (basketball) and who didn't like the weight room view".
  'Practice Attendance': 'נוכחות באימונים',
  'A bar is a session he was at. A red box is a session he was available for and missed. A dash is a scheduled session nobody logged.':
    'פס זה אימון שהוא היה בו. ריבוע אדום זה אימון שהיה זמין אליו ולא הגיע. מקף זה אימון שנקבע ואף אחד לא רשם.',
  'attended this month': 'נוכחויות החודש',
  'nothing logged this month': 'לא נרשם כלום החודש',
  'nobody logged this session': 'אף אחד לא רשם את האימון הזה',
  // Two words in Hebrew for one in English. The banner over the list of names
  // needs a NOUN ("absences"); the cell tooltip and the legend need the verb
  // said about one athlete ("did not turn up"), masculine singular.
  'absences': 'חיסורים',
  'missed': 'לא הגיע',
  'Practice': 'אימון',
  'there': 'הגיעו',
  'none': 'אין',

  // ---- the weight-room tab --------------------------------------------
  'Previous month': 'החודש הקודם',
  'Next month': 'החודש הבא',
  'Orange is an individual lift, navy is team S&C. The tint is the restriction on the day.': 'כתום זה אימון כוח אישי, כחול זה כוח קבוצתי. הגוון זה ההגבלה של אותו יום.',
  'nobody has lifted today': 'אף אחד לא עשה כוח היום',
  'Due for the weight room': 'מחכים לאימון כוח',
  'Everyone has lifted in the last three days.': 'כולם עשו כוח בשלושת הימים האחרונים.',
  'lift session': 'אימון כוח',
  'lift logged': 'נרשמה הרמה',
  'Jan': 'ינואר',
  'Feb': 'פברואר',
  'Mar': 'מרץ',
  'Apr': 'אפריל',
  'May': 'מאי',
  'Jun': 'יוני',
  'Jul': 'יולי',
  'Aug': 'אוגוסט',
  'Sep': 'ספטמבר',
  'Oct': 'אוקטובר',
  'Nov': 'נובמבר',
  'Dec': 'דצמבר',

  // ---- the load board ---------------------------------------------------
  'last lift': 'אימון אחרון',
  'Athlete': 'שחקן',
  '7d': '7 ימים',
  '14-day': '14 יום',

  // ---- practice density, his own bands ---------------------------------
  'contact': 'מגע',
  'Contact minutes': 'דקות מגע',
  'Low Intensity': 'עצימות נמוכה',
  'Moderate Intensity': 'עצימות בינונית',
  'High Intensity': 'עצימות גבוהה',
  'Very High Intensity': 'עצימות גבוהה מאוד',
  'high volume': 'נפח גבוה',

  // ---- his S&C quadrant, derived ---------------------------------------
  'Low volume & low intensity': 'נפח נמוך ועצימות נמוכה',
  'High volume & low intensity': 'נפח גבוה ועצימות נמוכה',
  'Low volume & high intensity': 'נפח נמוך ועצימות גבוהה',
  'High volume & high intensity': 'נפח גבוה ועצימות גבוהה',

  'What the room did': 'מה עשו בחדר הכוח',
  'nothing written': 'לא נרשם כלום',

  lifted: 'התאמנו',

  // ---- 24.9: S&C sessions and lifts are two different things -----------
  // Ohad: "lifts should say log lift", "sc sessions should say log S&C
  // Session". The team block before a practice is אימון כוח; a player's own
  // weight-room session is הרמה.
  'Log S&C Session': 'רישום אימון כוח',
  'Log lift': 'רישום הרמה',
  'Lifts': 'הרמות',
  'S&C session': 'אימון כוח',
  'S&C sessions': 'אימוני כוח',
  'S&C': 'כוח',
  'S&C minutes': 'דקות כוח',
  'Which practice': 'איזה אימון',
  'This practice': 'האימון הזה',
  'In': 'נוכח',
  'at this practice': 'באימון הזה',
  'Out for the whole day': 'בחוץ כל היום',
  'At this practice — click to mark absent': 'היה באימון — לחץ לסמן שלא הגיע',
  'Absent from this practice — click to mark present': 'לא הגיע לאימון — לחץ לסמן שהגיע',
  'No practice on the schedule for this date — it is saved to the day.': 'אין אימון בתאריך הזה — נשמר על היום.',
  'Team S&C · minutes only, no RPE. In/Out is who was at THIS practice; the day’s availability is separate.': 'כוח קבוצתי — רק דקות, בלי RPE. נוכח/בחוץ זה מי שהיה באימון הזה; הזמינות היומית נפרדת.',
  'Lift — minutes only, no RPE. Personal, any day, not tied to a practice.': 'הרמה — רק דקות, בלי RPE. אישי, בכל יום, לא קשור לאימון.',
  'Note (optional)': 'הערה (לא חובה)',
  'e.g. lower body · 4 lifts': 'למשל תחתון · 4 תרגילים',
  'A bar is a lift he logged. The tint is the restriction on the day.': 'פס זה הרמה שנרשמה לו. הגוון זה ההגבלה של אותו יום.',
  'Log a lift for this athlete': 'רישום הרמה לשחקן הזה',
  'no S&C session logged': 'לא נרשם אימון כוח',

  PRE_SEASON: 'טרום עונה',
});

/** `const he = useHe();` — true when the zone is in Hebrew. For the few places
 *  that compose a sentence ("בעוד 3 ימים") rather than look up a label. */
export function useHe() {
  return useContext(BhbcLangCtx) === 'he';
}
