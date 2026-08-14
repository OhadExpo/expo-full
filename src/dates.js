// Date-format helpers. Canonical display format across the app is
// "1st of May 2026" / "21st of March 2025" — i.e. ordinal day + "of" +
// full month name + 4-digit year. Replaces ad-hoc `toLocaleDateString()`
// calls and raw ISO date strings throughout the UI.

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// 1 → 1st, 2 → 2nd, 3 → 3rd, 4 → 4th, 11 → 11th (not 11st), 21 → 21st.
function ordinalSuffix(n) {
  const v = n % 100;
  if (v >= 11 && v <= 13) return 'th';
  switch (n % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}
export const ordinal = (n) => `${n}${ordinalSuffix(n)}`;

// Accepts:
//   - a Date instance
//   - an ISO string ("2026-03-18", "2026-03-18T12:34:56.789Z")
//   - a date-like string parseable by `new Date()`
//   - falsy → returns the `fallback` string (default em-dash)
//
// Returns "18th of March 2026". On unparseable input, returns the
// original value so corrupt data doesn't disappear from the UI.
export function fmtPrettyDate(input, fallback = '—') {
  if (input == null || input === '') return fallback;
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) return String(input);
  return `${ordinal(d.getDate())} of ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

// Compact variant for tight rows: "18 Mar 2026" (no ordinal, abbrev
// month, no "of"). Used where pretty form is too long — e.g. inside
// a 200px-wide card row that already shows other meta on the same
// line. Same input-type tolerance as fmtPrettyDate.
const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export function fmtCompactDate(input, fallback = '—') {
  if (input == null || input === '') return fallback;
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) return String(input);
  return `${d.getDate()} ${MONTH_ABBR[d.getMonth()]} ${d.getFullYear()}`;
}

// Age in whole years from a date-of-birth (ISO string / Date). Returns null for
// missing/unparseable input or an implausible result, so a blank DOB never
// fabricates an age. Used to prefill the Evaluation's AGE from intake DOB.
export function ageFromDob(dob) {
  if (dob == null || dob === '') return null;
  const d = dob instanceof Date ? dob : new Date(dob);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return a >= 0 && a < 130 ? a : null;
}
