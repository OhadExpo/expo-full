// HEBREW VOICE GATE — every Hebrew string this platform ships, checked against
// the register Ohad actually writes in.
//
// WHY THIS EXISTS. Ohad, on `נקרא מהקליפ`: "shows we're at 1% with hebrew
// knowledge." He was right, and the diagnosis matters: `נקרא` is not a style
// slip, it is a WRONG WORD. I wrote "Read from the clip" in English and mapped
// it word-for-word; `נקרא` reads as "is called" or "we will read", never
// "was detected". That is what translating instead of writing produces.
//
// Patching the strings I already know about fixes today and nothing else. This
// file is the part that lasts: every error CLASS found, encoded as a check that
// runs on every build, so the same mistake cannot ship twice.
//
// Every rule below is grounded in evidence — a string Ohad rejected, a native
// speaker's judgement on THIS text, or his own writing contradicting mine.
// None of them are invented from taste.
//
// GROUND TRUTH is his: 2,147 lines of his own coaching cues (src/exerciseData.js
// plus the cue text in his plan rows). Those files are never flagged — they ARE
// the standard. Only text I wrote is judged.
import fs from 'node:fs';
import path from 'node:path';

const HEB = /[\u0590-\u05FF]/;
// Hebrew has no \b in JS regex: /קיו/ matches inside נקיות. Bound on both sides.
const NB = (w) => new RegExp('(?<![\u0590-\u05FF])(?:' + w + ')(?![\u0590-\u05FF])', 'g');

// Files that are HIS writing, not mine. Off-limits: cue authoring is his.
const HIS = [/^src\/exerciseData\.js$/, /^src\/demoTraineeData\.js$/];

const RULES = [
  {
    id: 'calque-verb',
    why: 'wrong word from word-for-word translation, not a style slip',
    // `נקרא` for "detected" — Ohad flagged this one by name.
    test: NB('נקרא') , when: (s) => /נקרא\s+מ/.test(s),
    fix: 'זוהה / מזוהה — נקרא means "is called" or "we will read", never "was detected"',
  },
  {
    id: 'bookish-imperative',
    why: 'form-filling register; he writes future-as-imperative (תזין, תבחר)',
    test: NB('הזן|הזיני|בצע|הקש|אנא|נא'),
    fix: 'תזין / תבצע / תקיש; drop אנא and נא entirely',
  },
  {
    id: 'impersonal-instruction',
    why: 'manual voice; he speaks to one person',
    test: /(?<![\u0590-\u05FF])(?:יש|ניתן)\s+ל[\u0590-\u05FF]{3,}/g,
    fix: 'address him directly: תבחר, תעלה, אפשר ל…',
  },
  {
    id: 'slash-gender',
    why: 'coaching text is masculine singular; slash-gender is form-speak',
    // SCOPED ON PURPOSE. Slash-gender is not always an error. On the intake
    // form and the coach waitlist the reader is a stranger of unknown gender,
    // and the split form is a deliberate choice - Ohad has female clients. His
    // masculine-singular rule governs COACHING content: cues, plans, the tools
    // he points at an athlete he already knows. That is where this applies.
    // Widening it would degender a public form on my own authority. His call.
    files: (f) => !/IntakeForm|intakeFormSchemas|CoachLanding|expo-il/.test(f),
    test: /[\u0590-\u05FF]\/[\u0590-\u05FF]{1,3}(?![\u0590-\u05FF])/g,
    // Real fractions and pairs are not gender slashes.
    // Not gender slashes: the unit m/s writes as mem-geresh slash shin-geresh,
    // and geresh sits inside the Hebrew block, so a naive test flags it.
    when: (s) => !/[׳′']\s*\/|\/\s*[֐-׿][׳′']|\d\s*\//.test(s),
    fix: 'masculine singular only: מלא/י → תמלא, את/ה → אתה',
  },
  {
    id: 'term-drift-shot',
    why: 'this app calls a shot זריקה everywhere else; קליעה is a second word for one thing',
    test: NB('קליעה|הקליעה'),
    fix: 'זריקה',
  },
  {
    id: 'politeness-periphrasis',
    why: 'English "could you…?" politeness; he asks straight',
    test: /(?<![\u0590-\u05FF])תוכל\s+ל[\u0590-\u05FF]+|(?<![\u0590-\u05FF])רוצה\s+לתאם/g,
    fix: 'direct future-imperative: תסגור, תתאם',
  },
  {
    id: 'spelling-drift',
    why: 'one word, two spellings - the platform writes תוכנית 44 times to 1',
    // Objective, not taste: the minority spelling is a slip, and a form that
    // says תכנית next to 44 תוכנית reads careless to a client.
    test: /(?<![֐-׿])[והבלמשכ]{0,2}תכני(?:ת|ות)(?![֐-׿])/g,
    fix: 'תוכנית / תוכניות',
  },
  {
    id: 'space-before-punctuation',
    why: 'shipped once already — a stray space before a comma read as a dangling comma',
    test: /[\u0590-\u05FF]\s+[,.;](?:\s|$)/g,
    fix: 'no space before , . ;',
  },
];

const files = [];
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const f = path.join(d, e.name);
    if (e.isDirectory()) { if (!/node_modules|dist|\.git/.test(e.name)) walk(f); }
    else if (/\.(js|jsx)$/.test(e.name)) files.push(f.split(path.sep).join('/'));
  }
}
walk('src'); walk('expo-il/src');

const hits = [];
let scanned = 0;
for (const f of files) {
  if (HIS.some((re) => re.test(f))) continue;
  const src = fs.readFileSync(f, 'utf8');
  if (!HEB.test(src)) continue;
  src.split('\n').forEach((line, i) => {
    if (!HEB.test(line)) return;
    // A COMMENT never reaches a user, and any file documenting this gate has to
    // quote the bad Hebrew in order to explain the rule — src/bhbcHe.js cites
    // `נקרא מהקליפ` for exactly that reason and got flagged for it. Skipping
    // comment-only lines drops that false positive without losing coverage:
    // user-visible Hebrew is never inside a `//` line. A Hebrew string with a
    // trailing comment is still scanned, because the line does not START here.
    const lead = line.trim();
    if (lead.startsWith('//') || lead.startsWith('*') || lead.startsWith('/*')) return;
    const re = /'([^'\n]*)'|"([^"\n]*)"|`([^`\n]*)`/g;
    let m;
    while ((m = re.exec(line))) {
      const s = m[1] ?? m[2] ?? m[3];
      if (!s || !HEB.test(s)) continue;
      scanned++;
      for (const r of RULES) {
        r.test.lastIndex = 0;
        const found = s.match(r.test);
        if (!found) continue;
        if (r.when && !r.when(s)) continue;
        if (r.files && !r.files(f)) continue;
        hits.push({ file: f, line: i + 1, rule: r.id, why: r.why, fix: r.fix, hit: found[0], s });
      }
    }
  });
}

const byRule = {};
for (const h of hits) (byRule[h.rule] = byRule[h.rule] || []).push(h);

console.log(`HEBREW VOICE GATE — ${scanned} shipped Hebrew strings scanned\n`);
for (const r of RULES) {
  const list = byRule[r.id] || [];
  console.log(`${list.length ? '✗' : '✓'} ${r.id.padEnd(26)} ${String(list.length).padStart(3)}  ${r.why}`);
  for (const h of list.slice(0, 12)) {
    console.log(`      ${h.file}:${h.line}  «${h.hit}»  ${h.s.slice(0, 78)}`);
  }
  if (list.length > 12) console.log(`      … ${list.length - 12} more`);
  if (list.length) console.log(`      → ${r.fix}\n`);
}
console.log(`\n${hits.length} violation(s) across ${new Set(hits.map((h) => h.file)).size} file(s).`);
process.exit(hits.length ? 1 : 0);
