// WHICH SCRIPT IS THIS TEXT IN, in one place.
//
// `const isHebrew = (s) => /[֐-׿]/.test(s || '')` was written out
// FOURTEEN times across src — once per file that needed it — which is how a
// rule ends up applied in thirteen places and missed in the fourteenth.
//
// Ohad, 22.9: "on sign in menu if my name name is herbrew it should say
// היי אוהד not hey אוהד. follow and adjust the language rules every anywhere to
// be perfect."
//
// The rule that follows from that: a sentence that WRAPS a name belongs to the
// name's script, not to the UI language. "Hey אוהד" is two languages in four
// characters; "היי אוהד" is a greeting. The UI language decides the UI; the
// NAME decides the sentence built around the name.

const HE = /[֐-׿]/;      // Hebrew block, letters and points
const LATIN = /[A-Za-z]/;

// Does this string contain any Hebrew at all? (The historical predicate — kept
// with exactly its old meaning so the fourteen call sites behave identically.)
export const isHebrew = (s) => HE.test(s || '');

// Which script does this string actually READ as? Hebrew wins when both are
// present, because a Hebrew name with a Latin initial ("א. Cohen") is still a
// Hebrew name. Returns null when there is nothing to judge — an empty field, a
// phone number, an emoji — so the caller can fall back instead of guessing.
export function scriptOf(s) {
  const t = String(s || '');
  if (HE.test(t)) return 'he';
  if (LATIN.test(t)) return 'en';
  return null;
}

// The language a sentence built AROUND this name should be written in.
// Falls back to the UI language when the name says nothing.
export function langForName(name, uiLang = 'en') {
  return scriptOf(name) || (uiLang === 'he' ? 'he' : 'en');
}

// ...and the direction that sentence's line box needs, so the greeting does not
// come out "אוהד היי" (17.9: it did).
export const dirForName = (name, uiLang = 'en') => (langForName(name, uiLang) === 'he' ? 'rtl' : 'ltr');

// A LINE MUST NOT END ON A SEPARATOR.
//
// Ohad's DANGLE rule, and the OCD sweep counts them: "THIS MONTH ·" wrapping so
// the dot is the last glyph on the line, "BB Zercher RDL (W1-2) |", "Gym ·".
// Twenty across the platform at 390.
//
// The fix is a break OPPORTUNITY, not a rewrite: bind the separator to the word
// that FOLLOWS it by making the space after it non-breaking. "A · B" can then
// still wrap — before the dot — but can never leave the dot stranded at the end
// of a line. The text reads identically; only where it may break changes.
//
// Display only. It puts U+00A0 in the string, so never feed the result to
// anything that compares, searches or stores text — pass the original there.
const SEPARATORS = '·|/–—';
export function noDangle(text) {
  const t = String(text == null ? '' : text);
  if (!t) return t;
  return t.replace(new RegExp('([' + SEPARATORS + '])[ \t]+', 'g'), '$1 ');
}

export default isHebrew;
