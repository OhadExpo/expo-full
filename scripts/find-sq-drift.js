// Walk the parser over ClientPortal and report each line where sq flips
// state, so we can spot where it goes "true" and never comes back.
import fs from 'fs';

const content = fs.readFileSync('src/ClientPortal.jsx', 'utf8');
let sq = false, dq = false, bqDepth = 0, teDepth = 0;
let i = 0; const n = content.length;
let line = 1;
let prevSq = false;
const flips = [];

while (i < n) {
  const ch = content[i], prev = i > 0 ? content[i - 1] : '';
  if (ch === '\n') line++;
  const inText = bqDepth > teDepth;
  if (inText) {
    if (prev !== '\\' && ch === '$' && content[i + 1] === '{') { teDepth++; i += 2; continue; }
    if (prev !== '\\' && ch === '`') { bqDepth--; i++; continue; }
    i++; continue;
  }
  if (prev !== '\\') {
    if (!dq && ch === "'") {
      sq = !sq;
      if (sq !== prevSq) {
        flips.push({ line, sq, ctx: content.slice(Math.max(0, i - 40), i + 20).replace(/\n/g, '⏎') });
        prevSq = sq;
      }
      i++; continue;
    }
    if (!sq && ch === '"') { dq = !dq; i++; continue; }
    if (!sq && !dq && ch === '`') { bqDepth++; i++; continue; }
  }
  if (sq || dq) { i++; continue; }
  if (ch === '}' && teDepth > 0) { teDepth--; i++; continue; }
  if (ch === '/' && content[i + 1] === '/') { while (i < n && content[i] !== '\n') { if (content[i] === '\n') line++; i++; } continue; }
  if (ch === '/' && content[i + 1] === '*') {
    const end = content.indexOf('*/', i + 2);
    while (i < (end === -1 ? n : end + 2)) { if (content[i] === '\n') line++; i++; }
    continue;
  }
  i++;
}

// Print only lines where sq stayed in same state across multiple flips
// (rare events) and a tail of the most recent flips before line 1517.
const before1517 = flips.filter(f => f.line <= 1517).slice(-30);
console.log('Last 30 sq-flips before line 1517:');
for (const f of before1517) console.log(`  L${f.line}  sq→${f.sq}    ${f.ctx}`);
console.log('---');
console.log('total flips:', flips.length, 'final sq:', sq);
