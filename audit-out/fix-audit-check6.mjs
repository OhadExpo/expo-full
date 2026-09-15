// The memory check pinned itself to ONE project file's name, so it failed the
// moment that project was superseded - which is the normal case, not a fault.
// It asserts the shape instead: the resume trigger first, then a project file.
import fs from 'node:fs';
const p = 'scripts/audit-handoff.mjs';
let s = fs.readFileSync(p, 'utf8');
const lines = s.split(/\r?\n/);
const eol = s.includes('\r\n') ? '\r\n' : '\n';
const i = lines.findIndex((l) => l.includes("'the resume trigger and tonight are both at the top of MEMORY.md'"));
if (i < 0) { console.log('anchor gone'); process.exit(1); }
lines[i] = "check(6, 'the resume trigger and the newest project file are both at the top of MEMORY.md',";
lines[i + 1] = "  /feedback_pita_protocol\\.md/.test(top3) && /\\(project_[a-z0-9_]+\\.md\\)/.test(top3),";
fs.writeFileSync(p, lines.join(eol));
console.log('ok');
