// The Hebrew for the long copy - whole sentences, which the gate's 48-character
// cap had been hiding. Empty states and notices, in his register: short, spoken,
// masculine singular, no אנא / נא / יש ל.
import fs from 'node:fs';

const BHBC = [
  ['Team load trend appears here once sessions are logged.', 'מגמת העומס של הקבוצה תופיע כאן אחרי שיירשמו אימונים.'],
  ['No game scheduled — running a general prep block. Add a fixture to anchor the training week.',
    'אין משחק מתוכנן — רץ בלוק הכנה כללי. תוסיף משחק כדי לעגן את שבוע האימונים.'],
];

const APP = [
  ["PARTNER PREVIEW · you're viewing the real EXPO with live data — anything you change isn't saved",
    'תצוגת שותף · אתה רואה את EXPO האמיתי עם נתונים חיים — שום שינוי שתעשה לא נשמר'],
  ['No bodyweight logged yet — appears once the trainee logs weight from their portal.',
    'עוד לא נרשם משקל — יופיע ברגע שהמתאמן ישקול את עצמו מהפורטל שלו.'],
  ['Run your roster on this stack. Locked-in pricing for the first wave.',
    'תנהל את כל המתאמנים שלך על המערכת הזאת. מחיר נעול לגל הראשון.'],
  ['The camera + pose tools run live in the full app — disabled in this demo. Join the waitlist to use them on your own clips.',
    'כלי המצלמה וניתוח התנועה עובדים באפליקציה המלאה — בדמו הם כבויים. תירשם לרשימת ההמתנה כדי להריץ אותם על הסרטונים שלך.'],
  ['Generate a link from the button above and send it to a prospect or trainee.',
    'תייצר קישור מהכפתור למעלה ותשלח אותו למתעניין או למתאמן.'],
  ['No messages yet. Athlete replies and your sent messages will appear here.',
    'עוד אין הודעות. התשובות של המתאמנים וההודעות ששלחת יופיעו כאן.'],
  ["Pick an athlete from the rail to trace every lift's load & volume",
    'תבחר מתאמן מהרשימה כדי לעקוב אחרי העומס והנפח של כל תרגיל'],
  ['No exercises found. Try relaxing filters or the search term.',
    'לא נמצאו תרגילים. תשחרר קצת את הסינון או תשנה את מילת החיפוש.'],
  ['Add the athletes training now — check them in as they arrive and log every set from this one screen.',
    'תוסיף את מי שמתאמן עכשיו — תסמן כל אחד כשהוא מגיע ותרשום כל סט מהמסך הזה.'],
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
