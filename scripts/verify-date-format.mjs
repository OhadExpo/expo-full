// EVERY DATE A HUMAN READS IS DAY / MONTH / YEAR.
//
// Ohad 2026-09-03: "on bhbc and expo make sure dates are displayed as
// day/month/year" ... "everywhere!!!!!!!".
//
// The trap is that `toLocaleDateString()` with no locale follows the MACHINE.
// On this Windows box that is en-US, so 3 September renders "9/3/2026" — the
// exact string an Israeli reads as 9 March. It looks right to whoever wrote it
// and wrong to whoever uses it, which is why it needs a gate rather than care.
//
// Flags, in src/ only:
//   1. toLocaleDateString/toLocaleString with NO locale, or `undefined`
//   2. a date-display locale of 'en-US'
//   3. an options object that lists `month` before `day`
//
// Exempt: Intl.DateTimeFormat used with formatToParts (timezone maths, where
// the field order is irrelevant), and 'en-CA'/ISO keys, which are storage.
import fs from 'node:fs';
import path from 'node:path';

const SRC = 'src';
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(jsx?|tsx?)$/.test(e.name)) files.push(p);
  }
})(SRC);

const hits = [];
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const lines = src.split(/\r?\n/);
  lines.forEach((line, i) => {
    const at = { file: f, line: i + 1, text: line.trim().slice(0, 120) };
    // A comment that NAMES the trap is not the trap. The first version of this
    // gate reported four defects and all four were false - two month-only chart
    // labels and two comments in dates.js - which is how a gate gets ignored.
    const t = line.trim();
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;
    // A `month` with no `day` is a chart label ("Sep"), not a date.
    const hasDay = /day\s*:/.test(line);
    // formatToParts callers are doing timezone maths, not display.
    const partsNearby = /formatToParts/.test(lines.slice(i, i + 3).join(' '));

    if (/toLocaleDateString\s*\(\s*\)/.test(line)) hits.push({ ...at, why: 'toLocaleDateString() with no locale follows the machine (en-US here) → M/D/Y' });
    if (/toLocaleDateString\s*\(\s*undefined/.test(line)) hits.push({ ...at, why: "locale `undefined` follows the machine → M/D/Y" });

    if (!partsNearby && hasDay && /toLocale(Date)?String\s*\(\s*'en-US'/.test(line) && /month\s*:/.test(line)) {
      hits.push({ ...at, why: "'en-US' puts the month before the day" });
    }
    if (!partsNearby && hasDay && /Intl\.DateTimeFormat\s*\(\s*'en-US'/.test(line) && /month\s*:/.test(line)) {
      hits.push({ ...at, why: "'en-US' DateTimeFormat puts the month before the day" });
    }
    // An options object that names month before day renders month-first.
    const m = line.match(/\{[^{}]*\bmonth\s*:[^{}]*\bday\s*:[^{}]*\}/);
    if (m && !partsNearby && !/formatToParts/.test(line)) {
      hits.push({ ...at, why: 'options list `month` before `day`, so it renders month-first' });
    }
  });
}

for (const h of hits) console.log(`FAIL ${h.file}:${h.line}\n       ${h.why}\n       ${h.text}`);
console.log(hits.length
  ? `\n${hits.length} date(s) that do not read day/month/year`
  : `\n0 — every date in ${files.length} source files reads day/month/year`);
process.exit(hits.length ? 1 : 0);
