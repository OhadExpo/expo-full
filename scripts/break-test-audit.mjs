// BREAK THE AUDIT ON PURPOSE.
//
// A gate that has never failed has proven nothing — Ohad's rule, and it has
// already caught three versions of one gate passing a visibly broken page.
//
// This plants one lie per pass, runs the audit, and records whether the audit
// noticed. It restores every file afterwards, whatever happens.
//
//   node scripts/break-test-audit.mjs
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const DOC = 'docs/HANDOFF-2026-09-06.md';
const MEM = 'C:/Users/Administrator/.claude/projects/C--Users-Administrator-Desktop-expo-full/memory/MEMORY.md';
const LENS = 'docs/handoff/05-data.md';

const backup = new Map();
const save = (p) => { if (!backup.has(p)) backup.set(p, fs.readFileSync(p, 'utf8')); };
const restoreAll = () => { for (const [p, v] of backup) fs.writeFileSync(p, v); };

const auditFails = () => {
  try { execSync('node scripts/audit-handoff.mjs', { stdio: 'pipe' }); return false; }
  catch { return true; }
};

const LIES = [
  // Derive the lie from what the document actually SAYS. A hardcoded "520"
  // silently stopped planting anything once the real count moved to 531, and
  // the test then reported the GATE as blind when nothing had been planted.
  ['1  git facts', () => {
    save(DOC);
    const d = fs.readFileSync(DOC, 'utf8');
    const m = d.match(/\*\*([0-9,]+) files\*\*/);
    if (!m) throw new Error('no file count in the document to falsify');
    fs.writeFileSync(DOC, d.replace(m[0], '**999 files**'));
  }],
  ['2  a path that does not exist', () => { save(DOC); fs.writeFileSync(DOC, fs.readFileSync(DOC, 'utf8') + '\n\nSee `scripts/this-does-not-exist.mjs`.\n'); }],
  ['5  a database number', () => { save(DOC); fs.writeFileSync(DOC, fs.readFileSync(DOC, 'utf8').replace('roster 10 · fixtures 33', 'roster 11 · fixtures 33')); }],
  ['8  a value quoted from his sheet', () => { save(DOC); fs.writeFileSync(DOC, fs.readFileSync(DOC, 'utf8').replace('| August | 24 | 1 |', '| August | 24 | 6 |')); }],
  ['9  a claim about the code', () => { save(DOC); fs.writeFileSync(DOC, fs.readFileSync(DOC, 'utf8').replace(/not touched tonight/gi, 'rewritten tonight')); }],
  ['11 a missing lens handoff', () => { save(LENS); fs.rmSync(LENS); }],
  ['12 a request with no status', () => {
    save(DOC);
    const d = fs.readFileSync(DOC, 'utf8');
    fs.writeFileSync(DOC, d.replace(/\| 16 \| "the pdf design[^|]*\| \*\*done\*\* \|/, '| 16 | "the pdf design is still too spacious and ugly, not branded enough as well" | |'));
  }],
  ['13 the resume word unregistered', () => { save(MEM); fs.writeFileSync(MEM, fs.readFileSync(MEM, 'utf8').split('\n').slice(1).join('\n')); }],
  ['14 a weasel word asserted', () => { save(DOC); fs.writeFileSync(DOC, fs.readFileSync(DOC, 'utf8') + '\n\nThe grid probably works on a phone.\n'); }],
  ['15 a command naming a ghost script', () => { save(DOC); fs.writeFileSync(DOC, fs.readFileSync(DOC, 'utf8') + '\n```bash\nnode scripts/ghost-runner.mjs\n```\n'); }],
];

console.log('planting one lie at a time; the audit should fail on every line\n');
const results = [];
for (const [name, plant] of LIES) {
  try {
    plant();
    const caught = auditFails();
    results.push([name, caught]);
    console.log(`${caught ? 'caught  ' : 'MISSED  '} ${name}`);
  } finally {
    restoreAll();
  }
}

// and the truth must pass, or the whole exercise means nothing
const clean = !auditFails();
console.log(`\n${clean ? 'ok      ' : 'BROKEN  '} the restored, true document passes`);

const missed = results.filter(([, c]) => !c);
console.log(`\n${results.length - missed.length}/${results.length} lies caught`);
for (const [n] of missed) console.log(`  MISSED: ${n}`);
process.exit(missed.length === 0 && clean ? 0 : 1);
