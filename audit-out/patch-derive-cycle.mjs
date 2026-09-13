// derive-payments, seen on the card: (1) when he reset the counter BEFORE
// writing the new date, the "cycle" read 0 - walk back past zero/"שולם" runs
// to the last positive counter (medium confidence); (2) "(פחות 60 ש"ח)" in the
// counter is a discount he wrote down - subtract it.
// parse-roster-timeline: the online section's "תצ" column is a date beside
// the monthly price - kept under its own name instead of a slug.
import fs from 'node:fs';
const rep = (f, a, b, l) => { let s = fs.readFileSync(f, 'utf8'); const n = s.split(a).length - 1; if (n !== 1) throw new Error(l + ' x' + n); fs.writeFileSync(f, s.replace(a, b)); console.log('ok', l); };

rep('scripts/derive-payments.mjs',
  `      const counterBefore = parseCounter(before && before.last_rev < rev ? before.value : null);`,
  `      let counterBefore = parseCounter(before && before.last_rev < rev ? before.value : null);
      // He sometimes zeroes the counter first and writes the date a revision or
      // two later; the cycle is then the last POSITIVE counter before the zero.
      let walkedBack = false;
      if (counterBefore && (counterBefore.total === 0 || counterBefore.paidWord) && f.sessions_done) {
        const runs = f.sessions_done;
        let i = runs.indexOf(before);
        for (let k = 0; k < 3 && i > 0; k++) {
          i--;
          const c2 = parseCounter(runs[i].value);
          if (c2 && c2.total > 0) { counterBefore = c2; walkedBack = true; break; }
        }
      }`, 'walk back past zero');

rep('scripts/derive-payments.mjs',
  `      const isFirst = run === (f[df] || [])[0];`,
  `      // "(פחות 60 ש"ח)" - a discount written into the counter cell.
      const less = counterBefore ? counterBefore.notes.map((n) => n.match(/פחות\\s*(\\d+)/)).find(Boolean) : null;
      if (less && est.amount != null) { est = { ...est, amount: est.amount - Number(less[1]), basis: est.basis + ' − ' + less[1] }; }
      if (walkedBack && est.confidence === 'high') est = { ...est, confidence: 'medium', basis: est.basis + ' · counter read before the reset' };
      const isFirst = run === (f[df] || [])[0];`, 'discount + walked-back confidence');

rep('scripts/parse-roster-timeline.py',
  `    'סוג כרטיסייה - כניסות לחודש': 'card_type',`,
  `    'סוג כרטיסייה - כניסות לחודש': 'card_type',
    'תצ': 'expected_payment',  # the online section's date beside the monthly price`, 'תצ label');
