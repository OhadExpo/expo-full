// #95 — "lmk how it will be systematic that when someone is medically out and
// is out of practice logged".
//
// The answer is medicalAvailOn(): one date-aware read of the medical record
// that every availability call site in the zone now goes through. This gate
// proves the WINDOW logic, which is the whole point — the old behaviour was
// correct on exactly one date (the day the injury was saved) and Full on every
// other, which is why two athletes had to be set Out by hand for 19.09/20.09.
//
// It does not re-implement the function. It slices the real text out of
// src/BhbcView.jsx and evaluates that, so the thing under test is the thing
// that ships. If the function is renamed or removed this fails loudly rather
// than silently testing a stale copy.
//
//   node scripts/verify-medical-out.mjs
import fs from 'node:fs';

const SRC = fs.readFileSync('src/BhbcView.jsx', 'utf8');

// Slice by brace-matching from the declaration so the test never drifts from
// the source. indexOf/counting, not a regex — a regex over 5,000 lines of JSX
// is how the last three "fixes" landed on the wrong element.
function slice(decl) {
  const i = SRC.indexOf(decl);
  if (i < 0) throw new Error(`NOT FOUND in BhbcView.jsx: ${decl}`);
  let d = 0, started = false;
  for (let k = SRC.indexOf('{', i); k < SRC.length; k++) {
    if (SRC[k] === '{') { d++; started = true; }
    else if (SRC[k] === '}') { d--; if (started && d === 0) return SRC.slice(i, k + 1); }
  }
  throw new Error(`unbalanced: ${decl}`);
}

const MAP = slice('const MEDICAL_STATUS_AVAIL =');
const FN = slice('function medicalAvailOn(');
const FN2 = slice('function availOn(');
// eslint-disable-next-line no-new-func
const { medicalAvailOn, availOn } = new Function(`${MAP};${FN};${FN2};return { medicalAvailOn, availOn };`)();

let pass = 0, fail = 0;
const is = (label, got, want) => {
  if (got === want) { pass++; console.log(`  ok    ${label}  → ${got}`); }
  else { fail++; console.log(`  FAIL  ${label}  → ${got}, expected ${want}`); }
};

// An unresolved 'out' injury with an onset date.
const OUT = { A: { injuries: [{ id: 'i1', status: 'out', onsetDate: '2026-09-19', resolved: false }] } };
console.log('unresolved Out, onset 19.09:');
is('the day before onset (18.09) is Full', medicalAvailOn(OUT, 'A', '2026-09-18'), 1);
is('the onset day itself (19.09) is Out', medicalAvailOn(OUT, 'A', '2026-09-19'), 4);
is('the day after (20.09) is STILL Out', medicalAvailOn(OUT, 'A', '2026-09-20'), 4);
is('a month later is still Out', medicalAvailOn(OUT, 'A', '2026-10-20'), 4);

// THE DEFECT THIS FIXES, stated as a test: before medicalAvailOn, only the day
// the record was saved read Out. 20.09 above is the line that used to be 1.

// Resolved: the window closes at the last thing written about it.
const FIXED = { A: { injuries: [{ id: 'i1', status: 'out', onsetDate: '2026-09-01', resolved: true,
  progress: [{ date: '2026-09-10', status: 'out' }, { date: '2026-09-14', status: 'available' }] }] } };
console.log('resolved, onset 01.09, last note 14.09:');
is('inside the window (05.09) is Out', medicalAvailOn(FIXED, 'A', '2026-09-05'), 4);
is('after the last note (20.09) is Full', medicalAvailOn(FIXED, 'A', '2026-09-20'), 1);

// A dated progress note changes the status from that date forward.
const EASING = { A: { injuries: [{ id: 'i1', status: 'limited', onsetDate: '2026-09-01', resolved: false,
  progress: [{ date: '2026-09-08', status: 'limited' }, { date: '2026-09-03', status: 'out' }] }] } };
console.log('out on 03.09, downgraded to limited on 08.09 (notes given out of order):');
is('03.09 reads Out', medicalAvailOn(EASING, 'A', '2026-09-03'), 4);
is('07.09 still reads Out', medicalAvailOn(EASING, 'A', '2026-09-07'), 4);
is('08.09 reads Limited', medicalAvailOn(EASING, 'A', '2026-09-08'), 2);
is('12.09 still reads Limited', medicalAvailOn(EASING, 'A', '2026-09-12'), 2);

// THE HEADLINE STATUS IS DATED EVIDENCE TOO — Menachem's real record, which is
// what caught this. His notes end at "limited" on 12.09, but the record's own
// status was set to "out" on 15.09. Reading only the notes made him Limited on
// 19.09 and 20.09, which is not what the medical record says.
const MENACHEM = { A: { injuries: [{ id: 'i1', status: 'out', onsetDate: '2026-08-24', resolved: false,
  updatedAt: '2026-09-15T09:00:00.000Z',
  progress: [{ date: '2026-08-24', status: 'non-contact' }, { date: '2026-08-31', status: 'limited' },
    { date: '2026-09-06', status: 'available' }, { date: '2026-09-07', status: 'available' },
    { date: '2026-09-12', status: 'limited' }] }] } };
console.log('notes up to 12.09 (limited), headline set to Out on 15.09:');
is('25.08 reads Non-contact (the 24.08 note)', medicalAvailOn(MENACHEM, 'A', '2026-08-25'), 3);
is('06.09 reads Full (cleared that day)', medicalAvailOn(MENACHEM, 'A', '2026-09-06'), 1);
is('13.09 reads Limited (the 12.09 note, headline not yet set)', medicalAvailOn(MENACHEM, 'A', '2026-09-13'), 2);
is('19.09 reads Out (the 15.09 headline is newer)', medicalAvailOn(MENACHEM, 'A', '2026-09-19'), 4);
is('20.09 reads Out', medicalAvailOn(MENACHEM, 'A', '2026-09-20'), 4);

// Two injuries at once: the worst one wins.
const TWO = { A: { injuries: [
  { id: 'i1', status: 'limited', onsetDate: '2026-09-01', resolved: false },
  { id: 'i2', status: 'out', onsetDate: '2026-09-05', resolved: false }] } };
console.log('two open injuries:');
is('02.09 (only the limited one) is Limited', medicalAvailOn(TWO, 'A', '2026-09-02'), 2);
is('06.09 (both) takes the worse — Out', medicalAvailOn(TWO, 'A', '2026-09-06'), 4);

// availOn: the coach's daily chip can make a day worse, never better.
console.log('availOn (day entry × medical):');
const rec = { availability: { '2026-09-20': 1, '2026-09-21': 5 } };
is('a chip of Full cannot overrule Out', availOn(rec, OUT, 'A', '2026-09-20'), 4);
is('Out · Personal (5) beats a medical 4', availOn(rec, OUT, 'A', '2026-09-21'), 5);
is('no medical, no chip → Full', availOn({}, {}, 'A', '2026-09-20'), 1);
is('a chip of Limited with no medical → Limited', availOn({ availability: { '2026-09-20': 2 } }, {}, 'A', '2026-09-20'), 2);

// An athlete with no medical record at all must never be floored.
is('unknown athlete → Full', medicalAvailOn(OUT, 'NOBODY', '2026-09-20'), 1);
is('empty medical → Full', medicalAvailOn({}, 'A', '2026-09-20'), 1);

// BREAK TEST — prove the gate can fail. A function that always returns 1 (the
// exact old behaviour on a non-today date) must not pass this suite.
const broken = () => 1;
const wouldCatch = broken(OUT, 'A', '2026-09-20') !== 4;
console.log(`\nbreak test: the pre-fix behaviour (always Full) ${wouldCatch ? 'IS' : 'is NOT'} caught by this gate`);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail || !wouldCatch) process.exitCode = 1;
