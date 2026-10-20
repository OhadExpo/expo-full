// Wrong-keyboard-layout search. Typing a Hebrew name with Windows still on
// English puts "hhjb" in the box instead of "ייחנ" — and Nord draws lowercase
// Latin as capitals, so it reads as the box refusing Hebrew (Ohad, 20.10).
// Every search also tries the same KEYS read on the other layout (standard
// Israeli SI-1452), both directions, so the wrong layout still finds the row.
const EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,./";
const HE = "/'קראטוןםפ][שדגכעיחלךף,זסבהנמצתץ.";
const toHe = new Map([...EN].map((c, i) => [c, HE[i]]));
const toEn = new Map([...HE].map((c, i) => [c, EN[i]]));
const HEB = /[֐-׿]/;
const LAT = /[a-z]/;

// The lower-cased query, plus its other-layout reading when it is ONE script
// and long enough to mean something (a single key would match half the list).
export function searchVariants(query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  const out = [q];
  if (q.replace(/\s/g, '').length < 2) return out;
  const heb = HEB.test(q), lat = LAT.test(q);
  if (lat && !heb) out.push([...q].map(c => toHe.get(c) ?? c).join(''));
  else if (heb && !lat) out.push([...q].map(c => toEn.get(c) ?? c).join(''));
  return out;
}

// true when `hay` contains the query as typed or as its other-layout reading.
export function layoutIncludes(hay, query) {
  const h = String(hay || '').toLowerCase();
  return searchVariants(query).some(v => h.includes(v));
}

// Token form: every whitespace-separated word must appear, in ONE layout.
export function layoutIncludesAll(hay, query) {
  const h = String(hay || '').toLowerCase();
  return searchVariants(query).some(v => v.split(/\s+/).filter(Boolean).every(t => h.includes(t)));
}
