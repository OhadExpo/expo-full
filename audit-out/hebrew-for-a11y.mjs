// The Hebrew for the accessibility labels. A screen reader is the one reader
// who gets nothing but these strings, so an English aria-label on a Hebrew
// screen is the whole control, not a detail.
import fs from 'node:fs';

const BHBC = [
  ['Bnei Herzliya BC', 'מועדון הכדורסל בני הרצליה'],
];

const APP = [
  ['New payment request', 'בקשת תשלום חדשה'],
  ['Bodyweight chart', 'גרף משקל גוף'],
  ['Coach demo tabs', 'לשוניות הדמו למאמן'],
  ['Delete link', 'מחיקת הקישור'],
  ['Delete task', 'מחיקת המשימה'],
  ['Cancel task', 'ביטול המשימה'],
  ['Close history', 'סגירת ההיסטוריה'],
  ['Remove exercise', 'הורדת התרגיל'],
  ['Delete day', 'מחיקת היום'],
  ['Copy day to another program', 'העתקת היום לתוכנית אחרת'],
  ['Copy warm-up to another program', 'העתקת החימום לתוכנית אחרת'],
  ['Toggle done history', 'הצגה או הסתרה של מה שבוצע'],
  ['Toggle auto-alerts', 'הצגה או הסתרה של ההתראות האוטומטיות'],
  ['Expand task for comments + detail', 'פתיחת המשימה לתגובות ופרטים'],
  ['Discard task draft', 'זריקת הטיוטה'],
  ['Permanent deletion', 'מחיקה לצמיתות'],
  ['Archive athlete', 'העברת המתאמן לארכיון'],
  ['Remove program', 'הורדת התוכנית'],
  ['Delete payment', 'מחיקת התשלום'],
  ['Edit payment', 'עריכת התשלום'],
  ['Filter sections', 'סינון המקטעים'],
  ['Bodyweight trend (no data)', 'מגמת משקל (אין נתונים)'],
  ['Bodyweight trend', 'מגמת משקל'],
  ['Pick a video to compare', 'בחירת סרטון להשוואה'],
  ['Delete workout', 'מחיקת האימון'],
  ['Both videos', 'שני הסרטונים'],
  ['Compare videos', 'השוואת סרטונים'],
];

const RE_ESC = /[.*+?^${}()|[\]\\]/g;
const add = (file, pairs) => {
  let h = fs.readFileSync(file, 'utf8');
  const esc = (k) => k.replace(RE_ESC, '\\$&');
  const has = (k) => new RegExp("^\\s*(?:'" + esc(k) + "'|\"" + esc(k) + '")\\s*:', 'm').test(h);
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
