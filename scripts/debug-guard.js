// Standalone debug runner for the bare-CSS-fn guard parser.
// Reproduces the false-negative seen on ClientPortal.jsx:1517.
import fs from 'fs';

const content = `function X() {
  return <div style={{
    border: \`\${done?'0.25px':'1px'} solid \${done?rgba(46,213,115,0.251):C.ac}\`
  }}/>;
}`;

const FN_RE = /\b(rgba|rgb|hsla|hsl)\(\s*\d/g;
let sq = false, dq = false, bqDepth = 0, teDepth = 0;
let i = 0;
const events = [];

while (i < content.length) {
  const ch = content[i];
  const prev = i > 0 ? content[i - 1] : '';
  const inText = bqDepth > teDepth;
  if (inText) {
    if (prev !== '\\' && ch === '$' && content[i + 1] === '{') {
      teDepth++; i += 2; continue;
    }
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
  if (ch === '/' && content[i + 1] === '/') { while (i < content.length && content[i] !== '\n') i++; continue; }
  if (ch === '/' && content[i + 1] === '*') {
    const end = content.indexOf('*/', i + 2);
    i = end === -1 ? content.length : end + 2;
    continue;
  }
  FN_RE.lastIndex = i;
  const m = FN_RE.exec(content);
  if (m && m.index === i) {
    const before = i > 0 ? content[i - 1] : ' ';
    if (!/[a-zA-Z0-9_$]/.test(before)) {
      console.log('FOUND bare match at idx', i, '→', content.slice(i, i + 30), 'state:', { sq, dq, bq: bqDepth, te: teDepth });
    }
    i = m.index + m[0].length;
    continue;
  }
  i++;
}
console.log('Final state:', { sq, dq, bq: bqDepth, te: teDepth });
