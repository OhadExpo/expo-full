// The Hebrew for the athlete's own screen. This is the surface he cares about
// most - "it was on an actual athlete screen" - so the register is his coaching
// voice speaking to ONE athlete: short, spoken, masculine singular.
import fs from 'node:fs';

const APP = [
  ['Loading your program…', 'טוען את התוכנית שלך…'],
  ['LOGGED', 'נרשם'],
  ['Completed this week', 'הושלם השבוע'],
  ['Contact your coach to start training.', 'תדבר עם המאמן שלך כדי להתחיל להתאמן.'],
  ['Loading player…', 'טוען את הנגן…'],
  ['CHECK-IN', 'דיווח'],
  ['Delete entry', 'מחיקת הרשומה'],
  ['Assign an active program to log bodyweight.', 'צריך תוכנית פעילה כדי לרשום משקל.'],
  ['Weight in kg', 'משקל בק"ג'],
  ['Video failed to load.', 'הסרטון לא נטען.'],
  ["Coach's video feedback ·", 'משוב וידאו מהמאמן ·'],
  ['Undo swap', 'ביטול ההחלפה'],
  ['SWAPPED FROM', 'הוחלף מ'],
  ['Find an alternate exercise', 'למצוא תרגיל חלופי'],
  ['Check back once your coach adds them.', 'תבדוק שוב אחרי שהמאמן יוסיף.'],
  ['This day has no exercises yet.', 'עוד אין תרגילים ביום הזה.'],
  ['How did it feel? Pain? Modifications?', 'איך הרגיש? כאב? שינויים?'],
  ['SAVE FAILED — YOUR LAST EDITS ARE NOT SAVED YET', 'השמירה נכשלה — מה שרשמת עדיין לא נשמר'],
  ['Restored from your last session', 'שוחזר מהאימון הקודם שלך'],
  ['OPEN IN GOOGLE PHOTOS →', 'פתיחה ב-Google Photos ←'],
  ['LOADING VIDEO…', 'טוען סרטון…'],
  ['AI ESTIMATE · CONFIDENCE:', 'הערכת AI · רמת ביטחון:'],
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
