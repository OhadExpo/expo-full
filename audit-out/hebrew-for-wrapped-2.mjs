// The Hebrew for the second batch - the runs that sit NEXT TO an expression
// ("ON THE FLOOR · {n} CHECKED IN"), which the old bounds could not see.
// Composed, not translated; same register as batch one.
import fs from 'node:fs';

const BHBC = [
  ['Last game', 'המשחק האחרון'],
];

const APP = [
  ['Couldn’t load billing data:', 'לא הצלחתי לטעון את נתוני החיוב:'],
  ['CONFIRM ·', 'אישור ·'],
  ['WEEK OF', 'שבוע של'],
  ['Console errors (', 'שגיאות קונסול ('],
  ['ENTRY', 'רשומה'],
  ['ENTRIES', 'רשומות'],
  ['PARTICIPANTS (', 'משתתפים ('],
  ['GOAL ·', 'יעד ·'],
  ['Two check-ins are needed to see a trend', 'צריך שני דיווחים כדי לראות מגמה ב{metric}'],
  ['ON THE FLOOR ·', 'על הפרקט ·'],
  ['In Progress (', 'בתהליך ('],
  ['Form Video ·', 'סרטון טכניקה ·'],
  ['Nothing matches', 'אין התאמות'],
  ['CLEAR ·', 'ניקוי ·'],
  ['WARM-UP (', 'חימום ('],
  ['MIN', 'דק׳'],
  ['EXERCISES', 'תרגילים'],
  ['TOTAL', 'סה"כ'],
  ['SUPERSET', 'סופרסט'],
  ['DONE', 'הושלם'],
  ['LEFT', 'נותרו'],
  ['PENDING', 'ממתין'],
  ['PAYMENT REQUESTS', 'בקשות תשלום'],
  ['CHECKED IN', 'נכנסו'],
  ['SETS DONE', 'סטים שבוצעו'],
  ['Shared household ·', 'משק בית משותף ·'],
  ['OLDER THREADS', 'שיחות ישנות'],
  ['MORE →', 'עוד ←'],
  ['DAYS ·', 'ימים ·'],
  ['Load more (', 'טעינת עוד ('],
  ['Build the next block', 'בניית הבלוק הבא'],
  ['Movement patterns ·', 'דפוסי תנועה ·'],
  ['HISTORY ·', 'היסטוריה ·'],
  ['Saved on another device', 'נשמר במכשיר אחר'],
  ['Printed', 'הודפס'],
  ['LOADING', 'טוען'],
  ['SELECTED', 'נבחרו'],
  ['Empty editor for', 'עורך ריק ל'],
  ['SESSION HISTORY ·', 'היסטוריית אימונים ·'],
  ['Client note:', 'הערת מתאמן:'],
  ['File:', 'קובץ:'],
  ['MOTION SEES', 'התנועה מזהה'],
  ['AUTO (', 'אוטומטי ('],
  ['READING THE MOVEMENT…', 'קורא את התנועה…'],
  ['SETS ·', 'סטים ·'],
  ['SETS · EXPAND', 'סטים · הרחבה'],
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
