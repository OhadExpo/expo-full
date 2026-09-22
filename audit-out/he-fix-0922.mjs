// APPLY THE 22.9 HEBREW VOICE PASS.
//
// #151, Ohad: "progress on the hebrew words and langugage learning skills and
// re-writing everything to be way more israeli."
//
// Six native readers read all 2,483 shipped Hebrew strings against his corpus
// and proposed exact-substring repairs; every pair below was then vetted by
// hand against the English and the rest of the file. The ones NOT applied, and
// why, are listed at the bottom — a rejected proposal is evidence too.
//
// Exact substrings, never a regex over the dictionary. Each `old` must occur at
// least once across the five string files, and every occurrence is replaced:
// two strings ship twice (the same billing sentence renders as a label and as a
// heading), so a once-only assertion would be wrong here.
//
//   node audit-out/he-fix-0922.mjs [--dry]
import fs from 'node:fs';

const FILES = [
  'src/i18n.js',
  'expo-il/src/i18n.js',
  'src/shotI18n.js',
  'src/autoTaskHe.js',
  'src/intakeFormSchemas.js',
];
const DRY = process.argv.includes('--dry');

const P = JSON.parse(fs.readFileSync(process.env.PAIRS || 'audit-out/he-pairs-0922.json', 'utf8'));

const text = new Map(FILES.map((f) => [f, fs.readFileSync(f, 'utf8')]));
let applied = 0, missing = 0, total = 0, ambiguous = 0;
const seen = new Set();

for (const p of P) {
  if (seen.has(p.old)) continue;            // the same string proposed twice
  seen.add(p.old);
  if (p.old === p.new) { console.log(`SKIP identical: ${p.old.slice(0, 40)}`); continue; }
  // WHOLE STRING LITERALS ONLY, AND WHEN THE VALUE IS NOT UNIQUE, BY KEY.
  //
  // A plain substring replace is how this pass would have corrupted the
  // dictionary: `הצד` ("Your") occurs inside 22 other strings, `ביטול` inside
  // 20, `תעריף` inside 3. Requiring the quotes on both sides fixes that — but
  // it is still not enough: `'ביטול'` is the WHOLE value of four different
  // keys, and the repair here is for "Keep" only. Applying it to all four would
  // have turned every Cancel button in the app into "Keep". So a value that
  // appears more than once is replaced only on the line whose KEY is the
  // English string that was judged.
  const count = (s, sub) => s.split(sub).length - 1;
  const QUOTES = ['\'', '"', '`'];
  // ESCAPED QUOTES COUNT TOO. One intake label ends in `וכו')`, so the literal
  // in the file carries a backslash the exported string does not.
  //
  // DEDUPED, and that matters: the first version returned [v, v] for every
  // string without an apostrophe, so it counted every literal TWICE, decided
  // every repair was ambiguous, and fell back to key-matching for all of them —
  // which then failed on the expo-il file, where key and value sit on different
  // lines. Eleven correct repairs were reported as "not found" by that bug.
  const esc = (v) => v.split("'").join("\\'");
  const forms = (o, n) => (o === esc(o) && n === esc(n) ? [[o, n]] : [[o, n], [esc(o), esc(n)]]);
  let hits = 0;
  let occurrences = 0;
  for (const f of FILES) for (const q of QUOTES) for (const [v] of forms(p.old, p.new)) occurrences += count(text.get(f), q + v + q);
  const byKey = occurrences > 1;
  if (byKey && !p.en) { console.log(`AMBIGUOUS (${occurrences}x, no key): ${p.old.slice(0, 50)}`); ambiguous++; continue; }
  for (const f of FILES) {
    let s = text.get(f);
    if (!byKey) {
      for (const q of QUOTES) for (const [v, w] of forms(p.old, p.new)) {
        const from = q + v + q;
        const n = count(s, from);
        if (!n) continue;
        hits += n;
        s = s.split(from).join(q + w + q);
      }
    } else {
      const lines = s.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const L = lines[i];
        // A KEY IS NOT ALWAYS QUOTED. i18n.js writes `Workouts: 'אימונים',` for
        // any key that is a valid identifier, so looking only for "Workouts"
        // found nothing and the repair silently did not apply.
        const bare = new RegExp('^\\s*' + p.en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*:');
        const hasKey = QUOTES.some((q) => L.includes(q + p.en + q)) || bare.test(L);
        if (!hasKey) continue;
        for (const q of QUOTES) for (const [v, w] of forms(p.old, p.new)) {
          const from = q + v + q;
          if (!lines[i].includes(from)) continue;
          hits += count(lines[i], from);
          lines[i] = lines[i].split(from).join(q + w + q);
        }
      }
      s = lines.join('\n');
    }
    text.set(f, s);
  }
  if (byKey && !hits) { console.log(`NOT ON ITS KEY LINE (${occurrences}x elsewhere): ${(p.en || '').slice(0, 40)}`); }
  total++;
  if (!hits) { console.log(`MISSING  ${p.old.slice(0, 60)}`); missing++; continue; }
  applied += hits;
  if (hits > 1) console.log(`x${hits}     ${p.old.slice(0, 50)}`);
}

if (!DRY) for (const f of FILES) fs.writeFileSync(f, text.get(f));
console.log(`\n${total} distinct repair(s); ${applied} occurrence(s) ${DRY ? 'would be' : ''} replaced; ${missing} not found.`);
process.exit(missing || ambiguous ? 1 : 0);
