// Second pass, 2026-09-11 evening ("hebrew still sucks"): the labels as they
// sit on the deployed coach screens, read in context, rewritten the way a
// coach labels his own board. Exact substrings, one match each.
import fs from 'node:fs';
const DRY = process.argv.includes('--dry');
const FIX = {
  'src/i18n.js': [
    ["'Low Sessions': 'נשארו מעט אימונים'", "'Low Sessions': 'מעט אימונים בחבילה'"],
    ["'Estimated Monthly': 'צפוי החודש'", "'Estimated Monthly': 'צפי החודש'"],
    ["'RECURRING COMMITTED': 'התחייבות חודשית'", "'RECURRING COMMITTED': 'מנויים חודשיים'"],
    ["'Recurring committed': 'התחייבות חודשית'", "'Recurring committed': 'מנויים חודשיים'"],
    ["לא נכנסו תשלומים ב-6 החודשים האחרונים", "אין תשלומים בחצי השנה האחרונה"],
    ["לא נכנסו תשלומים בחצי השנה האחרונה", "אין תשלומים בחצי השנה האחרונה"],
    ["Inbound: 'נכנס'", "Inbound: 'מהמתאמן'"],
    ["INBOUND: 'נכנסת'", "INBOUND: 'מהמתאמן'"],
    ["'Needs attention': 'דורש טיפול'", "'Needs attention': 'צריך טיפול'"],
    ["Financials: 'כספים'", "Financials: 'תשלומים'"],
    ["'No logs yet': 'עדיין אין מדידות'", "'No logs yet': 'אין שקילות עדיין'"],
    ["\"NO LOGS\": 'אין רישומים'", "\"NO LOGS\": 'עוד לא התאמן'"],
    ["'NEVER LOGGED': 'לא נרשם אף פעם'", "'NEVER LOGGED': 'לא רשם אף אימון'"],
    ["\"ON THE FLOOR\": 'על הרצפה'", "\"ON THE FLOOR\": 'מתאמנים עכשיו'"],
    ["\"Payments on record\": 'תשלומים ברשומה'", "\"Payments on record\": 'תשלומים שנרשמו'"],
    ["\"no record\": 'אין רשומה'", "\"no record\": 'אין רישום'"],
    ["Whose: 'של מי'", "Whose: 'אחראי'"],
    ["Soonest: 'הקרוב ביותר'", "Soonest: 'הכי קרוב'"],
    ["Newest: 'החדש ביותר'", "Newest: 'הכי חדש'"],
    ["Oldest: 'הישן ביותר'", "Oldest: 'הכי ישן'"],
    ["Custom: 'מותאם'", "Custom: 'מותאם אישית'"],
    ["Add: 'הוספה'", "Add: 'הוסף'"],
    ["\"REVIEW →\": 'בדיקה ←',", "\"REVIEW →\": 'בדיקה ←',"],
  ],
};
let bad = 0, n = 0;
for (const [file, list] of Object.entries(FIX)) {
  let s = fs.readFileSync(file, 'utf8');
  for (const [from, to] of list) {
    if (from === to) continue; // placeholder rows
    const c = s.split(from).length - 1;
    if (c !== 1) { bad++; console.log(`✗ ${file}: ${c}× ${from.slice(0, 60)}`); continue; }
    s = s.split(from).join(to); n++;
  }
  if (!DRY && !bad) fs.writeFileSync(file, s);
}
console.log(`${n} repairs${DRY ? ' (dry)' : ' written'}, ${bad} misses`);
if (bad) process.exit(1);
