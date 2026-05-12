// Run the actual guard parser on the historical bare-rgba pattern
// to confirm whether it's a true false-negative or my fix is fine.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Inline the parser (copy from check-bare-css-fns.js).
const FN_RE = /\b(rgba|rgb|hsla|hsl)\(\s*\d/g;

function findBareCalls(src, content) {
  const errors = [];
  let sq = false, dq = false, bqDepth = 0, teDepth = 0;
  let i = 0; const n = content.length;
  while (i < n) {
    const ch = content[i], prev = i > 0 ? content[i - 1] : '';
    const inText = bqDepth > teDepth;
    if (inText) {
      if (prev !== '\\' && ch === '$' && content[i + 1] === '{') { teDepth++; i += 2; continue; }
      if (prev !== '\\' && ch === '`') { bqDepth--; i++; continue; }
      i++; continue;
    }
    if (prev !== '\\') {
      if (!dq && ch === "'") { sq = !sq; i++; continue; }
      if (!sq && ch === '"') { dq = !dq; i++; continue; }
      if (!sq && !dq && ch === '`') { bqDepth++; i++; continue; }
    }
    if (sq || dq) { i++; continue; }
    if (ch === '}' && teDepth > 0) { teDepth--; i++; continue; }
    if (ch === '/' && content[i + 1] === '/') { while (i < n && content[i] !== '\n') i++; continue; }
    if (ch === '/' && content[i + 1] === '*') { const end = content.indexOf('*/', i + 2); i = end === -1 ? n : end + 2; continue; }
    FN_RE.lastIndex = i;
    const m = FN_RE.exec(content);
    if (m && m.index === i) {
      const before = i > 0 ? content[i - 1] : ' ';
      if (!/[a-zA-Z0-9_$]/.test(before)) {
        let l = 1, c = 0;
        for (let k = 0; k < m.index; k++) { if (content[k] === '\n') { l++; c = 0; } else c++; }
        errors.push({ src, line: l, col: c, snippet: content.slice(m.index, Math.min(m.index + 60, n)) });
      }
      i = m.index + m[0].length;
      continue;
    }
    i++;
  }
  return errors;
}

// Read the actual current file, splice in the bare-form line at 1517.
const file = path.join(__dirname, '..', 'src', 'ClientPortal.jsx');
const orig = fs.readFileSync(file, 'utf8');

const bareLine = "          return <div key={vp.name+'-'+di} style={{background:'var(--c-sf)',border:`${done?'0.25px':'1px'} solid ${done?rgba(46,213,115,0.251):C.ac}`,borderRadius:0,marginBottom:12,padding:'14px 18px'}}>";

// Replace the whole hoist block + new line with the historical bare form.
const lines = orig.split('\n');
// Find the line that starts the hoist comment (sentinel: "doneBorderColor hoisted")
const startIdx = lines.findIndex(l => l.includes('doneBorderColor hoisted'));
const endIdx = lines.findIndex((l, i) => i > startIdx && l.includes('return <div key={vp.name'));
if (startIdx === -1 || endIdx === -1) { console.error('sentinels not found'); process.exit(1); }
const synthetic = [...lines.slice(0, startIdx), bareLine, ...lines.slice(endIdx + 1)].join('\n');

const errors = findBareCalls('src/ClientPortal.jsx (synthetic bare)', synthetic);
console.log('errors detected on bare-form:', errors.length);
for (const e of errors) console.log(`  line ${e.line}: ${e.snippet}`);
