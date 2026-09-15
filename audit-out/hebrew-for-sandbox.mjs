// The Hebrew for /try. It is a public page whose embedded portal was already
// Hebrew, so the chrome around it read as a different product. Composed in the
// same voice: short, spoken, masculine singular.
import fs from 'node:fs';

const APP = [
  ['VIDEO STAYS ON YOUR DEVICE', 'הסרטון נשאר אצלך במכשיר'],
  ['MEDIAPIPE LITE · 33 LANDMARKS', 'MEDIAPIPE LITE · 33 נקודות'],
  ['REP CHANNEL ·', 'ערוץ החזרות ·'],
  ['REP', 'חזרה'],
  ['LOADING POSE MODEL…', 'טוען את מודל התנועה…'],
  ['SPEED', 'מהירות'],
  ['MP4 · MOV · WEBM · stays on this device', 'MP4 · MOV · WEBM · נשאר במכשיר הזה'],
  ['Tap to browse · or drop here', 'לחיצה בוחרת קובץ · או גרירה לכאן'],
  ['Drop in a clip of your', 'תזרוק לכאן קליפ של'],
  ["Drop in your client's", 'תזרוק לכאן קליפ של המתאמן שלך'],
  ['STEP 2 ·', 'שלב 2 ·'],
  ['MANUAL OVERRIDE — pick the lift instead', 'בחירה ידנית — תבחר את התרגיל בעצמך'],
  ['CONTINUE → UPLOAD', 'המשך ← העלאה'],
  ['FROM PATTERN:', 'לפי הדפוס:'],
  ['JOINT TRACKING', 'מעקב מפרקים'],
  ["We already know — it's your", 'אנחנו כבר יודעים — זה'],
  ["You're reviewing", 'אתה בודק'],
  ['STEP 1 ·', 'שלב 1 ·'],
  ['RECENT WORKOUTS', 'אימונים אחרונים'],
  ["Today's weight (kg)", 'המשקל היום (ק"ג)'],
  ['FILM SET', 'לצלם סט'],
  ['EXERCISES LOGGED ·', 'תרגילים שנרשמו ·'],
  ['YOUR PORTAL · MOCK DATA', 'הפורטל שלך · נתוני דמו'],
  ['The review tool', 'כלי הבדיקה'],
  ['WEEK 2 OF 4 · EXERCISE 1 OF 8', 'שבוע 2 מתוך 4 · תרגיל 1 מתוך 8'],
  ['Start over', 'להתחיל מחדש'],
  ['DEMO', 'דמו'],
  ['Back to EXPO', 'חזרה ל-EXPO'],
  ['Tap to view in History →', 'לחיצה פותחת בהיסטוריה ←'],
  ['Ohad left', 'אוהד השאיר'],
  ['COACH NOTE', 'הערת מאמן'],
  ['FORM VIDEO', 'סרטון טכניקה'],
  ['History (', 'היסטוריה ('],
  ['Personal Records (', 'שיאים אישיים ('],
  ['PHOTO OR TEXT · THE COACH SEES IT WITH THE TRAINING', 'תמונה או טקסט · המאמן רואה את זה יחד עם האימון'],
  ['Meal log', 'יומן אוכל'],
  ['Bodyweight Tracking', 'מעקב משקל'],
  ['Hey', 'היי'],
  ['Log Out →', 'יציאה ←'],
  ['Change password (demo)', 'שינוי סיסמה (בדמו)'],
  ['Film a set', 'לצלם סט'],
  ['PRE-WORKOUT CHECK', 'בדיקה לפני אימון'],
];

const RE_ESC = /[.*+?^${}()|[\]\\]/g;
let h = fs.readFileSync('src/i18n.js', 'utf8');
const esc = (k) => k.replace(RE_ESC, '\\$&');
const has = (k) => new RegExp("^\\s*(?:'" + esc(k) + "'|\"" + esc(k) + '")\\s*:', 'm').test(h);
const fresh = APP.filter(([k]) => !has(k));
const i = h.indexOf('export const HE = {');
const nl = h.indexOf('\n', i) + 1;
h = h.slice(0, nl) + fresh.map(([k, v]) => '  ' + JSON.stringify(k) + ': ' + JSON.stringify(v) + ',').join('\n') + '\n' + h.slice(nl);
fs.writeFileSync('src/i18n.js', h);
console.log('i18n +' + fresh.length, 'of', APP.length);
