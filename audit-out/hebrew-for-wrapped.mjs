// The Hebrew for the 104 strings the widened gate exposed.
//
// COMPOSED, NOT TRANSLATED - the rule at the top of i18n.js. Masculine
// singular, spoken, short: what Ohad would SAY standing in the gym. Empty
// states are fragments ("עוד אין תוכניות"), instructions are future-as-
// imperative ("תבחר", "תגרור", "תרענן"), never the infinitive.
import fs from 'node:fs';

const BHBC = [
  ['Logs this session for', 'רושם את האימון ל'],
  ['available athlete', 'מתאמן זמין'],
  ['available athletes', 'מתאמנים זמינים'],
  ['skips anyone Out.', 'מדלג על מי שבחוץ.'],
  ['Mark resolved / cleared to play', 'סימון כנפתר / חוזר לשחק'],
  ['Fixtures load as the league publishes them.', 'המשחקים ייטענו כשהליגה תפרסם אותם.'],
  ['No games yet.', 'עוד אין משחקים.'],
  ['Bnei Herzliya', 'בני הרצליה'],
  ['Form', 'פורמה'],
  ['Team', 'קבוצה'],
  ['No upcoming sessions.', 'אין אימונים קרובים.'],
  ['Focus — e.g. Lower INT + landing mechanics', 'פוקוס — למשל עצימות נמוכה + מכניקת נחיתה'],
  ['Trained', 'התאמן'],
  ['Plan', 'תוכנית'],
  ['All clear', 'הכול תקין'],
  ['No game scheduled.', 'אין משחק מתוכנן.'],
  ['Home / Away', 'בית / חוץ'],
  ['Save plan', 'שמירת התוכנית'],
  ['Save check-in', 'שמירת הדיווח'],
  ['Pain', 'כאב'],
  ['Baseline all OK', 'הכול תקין לכולם'],
  ['Current block', 'הבלוק הנוכחי'],
  ['Loading session logger…', 'טוען את רישום האימון…'],
  ['Exit preview', 'יציאה מהתצוגה'],
];

const APP = [
  ['Loading data...', 'טוען נתונים…'],
  ['No available slots this week. Try next week →', 'אין זמנים פנויים השבוע. תנסה בשבוע הבא ←'],
  ['Theme:', 'ערכת נושא:'],
  ['Viewport:', 'גודל מסך:'],
  ['No participants yet.', 'עוד אין משתתפים.'],
  ['Exercise · for Lab / Metrics / Live', 'תרגיל · ל-Lab / מדדים / Live'],
  ['Measure the lift', 'מדידת ההרמה'],
  ['Start Workout from Plan', 'התחלת אימון מהתוכנית'],
  ['Athlete page →', 'עמוד המתאמן ←'],
  ['Reference demo · library', 'הדגמה · מהספרייה'],
  ['Athlete · this set', 'המתאמן · הסט הזה'],
  ['Draw · comment at any timestamp', 'ציור · הערה בכל נקודה בסרטון'],
  ['No values', 'אין נתונים'],
  ['No other programs for this athlete', 'אין תוכניות אחרות למתאמן הזה'],
  ['Program Filter', 'סינון תוכניות'],
  ['Athlete Filter', 'סינון מתאמנים'],
  ['Tempo', 'טמפו'],
  ['EST · BASED ON 90s REST', 'הערכה · לפי 90 שניות מנוחה'],
  ['Save Program', 'שמירת התוכנית'],
  ['No programs match your search.', 'אין תוכניות שמתאימות לחיפוש.'],
  ['Total Collected · All Time', 'סה"כ שנגבה · מאז ומעולם'],
  ['No clients yet. Import your trainee list.', 'עוד אין לקוחות. תייבא את רשימת המתאמנים.'],
  ['VISITS in Vercel Analytics', 'כניסות ב-Vercel Analytics'],
  ['Generate', 'יצירה'],
  ['LABEL (optional)', 'תווית (לא חובה)'],
  ['TRAINEE (optional)', 'מתאמן (לא חובה)'],
  ['Hebrew (HE)', 'עברית'],
  ['Progress check-in', 'דיווח התקדמות'],
  ['Physical assessment', 'הערכה גופנית'],
  ['Initial intake', 'שאלון פתיחה'],
  ['Generate another', 'יצירת עוד אחד'],
  ['Link generated and copied to clipboard.', 'הקישור נוצר והועתק.'],
  ['Loading intake…', 'טוען את השאלון…'],
  ['Nothing queued. Add one below.', 'אין כלום בתור. תוסיף למטה.'],
  ['No coaching alerts — all clear.', 'אין התראות אימון — הכול תקין.'],
  ["No open tasks — you're all clear.", 'אין משימות פתוחות — אתה נקי.'],
  ['Share program to…', 'שיתוף התוכנית עם…'],
  ['No program assigned', 'לא שויכה תוכנית'],
  ['Loading program...', 'טוען תוכנית…'],
  ['No programs yet', 'עוד אין תוכניות'],
  ['Intensity (%1RM from reps)', 'עצימות (%1RM לפי חזרות)'],
  ['Primary-pattern coverage · latest block', 'כיסוי דפוסי תנועה · הבלוק האחרון'],
  ['Push : Pull', 'דחיפה : משיכה'],
  ['Load ratio', 'יחס עומס'],
  ['Suggested phase', 'שלב מוצע'],
  ['Block composition · latest', 'הרכב הבלוק · האחרון'],
  ['Pattern', 'דפוס תנועה'],
  ['Periodization wave', 'גל פריודיזציה'],
  ['Current phase', 'השלב הנוכחי'],
  ['Training Analysis ·', 'ניתוח אימון ·'],
  ['No block content to trace yet for this athlete.', 'עוד אין תוכן בלוק למתאמן הזה.'],
  ['Block name', 'שם הבלוק'],
  ['No logged workouts for this block yet.', 'עוד לא נרשמו אימונים בבלוק הזה.'],
  ['Drop here to move into this day', 'תגרור לכאן כדי להעביר ליום הזה'],
  ['No exercises.', 'אין תרגילים.'],
  ['No video.', 'אין סרטון.'],
  ['Pick a program from the filter above to compare.', 'תבחר תוכנית מהסינון למעלה כדי להשוות.'],
  ['No programs for this athlete yet.', 'עוד אין תוכניות למתאמן הזה.'],
  ['Pick an athlete from the filter above to compare.', 'תבחר מתאמן מהסינון למעלה כדי להשוות.'],
  ['No warm-ups.', 'אין חימומים.'],
  ['Block notes', 'הערות הבלוק'],
  ['Add to session', 'הוספה לאימון'],
  ['No exercises on this day.', 'אין תרגילים ביום הזה.'],
  ['No one on the floor yet', 'עוד אף אחד לא על הפרקט'],
  ['Drop here', 'תגרור לכאן'],
  ['Sync lost — reconnecting', 'הסנכרון נפל — מתחבר מחדש'],
  ['Performance Center', 'מרכז ביצועים'],
  ['Read-only — belongs to the other coach', 'לקריאה בלבד — שייך למאמן השני'],
  ['Comments + audit log pending', 'תגובות ויומן שינויים — בקרוב'],
  ['Enter to add', 'אנטר להוספה'],
  ['Club athlete — no billing', 'שחקן מועדון — בלי חיוב'],
  ['This cannot be undone.', 'אי אפשר לבטל את זה.'],
  ['This will permanently remove', 'זה ימחק לצמיתות'],
  ['This will unassign', 'זה יבטל את השיוך של'],
  ['No programs assigned.', 'לא שויכו תוכניות.'],
  ['No completed workouts.', 'אין אימונים שהושלמו.'],
  ['Only', 'רק זו'],
  ['Add weigh-in', 'הוספת שקילה'],
  ['Open →', 'פתיחה ←'],
  ['Includes sessions from mid-session swaps.', 'כולל אימונים מהחלפות באמצע.'],
  ['No matches — try a different word.', 'אין תוצאות — תנסה מילה אחרת.'],
  ['Video player crashed — reload to retry', 'נגן הווידאו קרס — תרענן כדי לנסות שוב'],
];

const RE_ESC = /[.*+?^${}()|[\]\\]/g;
const add = (file, pairs) => {
  let h = fs.readFileSync(file, 'utf8');
  const esc = (k) => k.replace(RE_ESC, '\\$&');
  const has = (k) => {
    const bare = /^[A-Za-z_$][\w$]*$/.test(k) ? '|' + esc(k) : '';
    return new RegExp("^\\s*(?:'" + esc(k) + "'|\"" + esc(k) + '"' + bare + ")\\s*:", 'm').test(h);
  };
  const fresh = pairs.filter(([k]) => !has(k));
  const i = h.indexOf('export const HE = {');
  const nl = h.indexOf('\n', i) + 1;
  const block = fresh.map(([k, v]) => '  ' + JSON.stringify(k) + ': ' + JSON.stringify(v) + ',').join('\n');
  h = h.slice(0, nl) + (block ? block + '\n' : '') + h.slice(nl);
  fs.writeFileSync(file, h);
  console.log(file, '+' + fresh.length, 'of', pairs.length);
};
add('src/bhbcHe.js', BHBC);
add('src/i18n.js', APP);
