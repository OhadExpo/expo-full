// A JSX element with the same prop twice keeps the LAST one, silently.
//
// 24.9: the real dashboard's attention rail got a second `className` in an
// edit — `className="alert-rail" … className="dash-attn"` on one <div> — and
// the browser saw only the second. Every `.alert-rail` rule (the 280px card
// basis, the phone stacking) stopped applying. eslint's `no-dupe-keys` covers
// object literals, not JSX attributes, and eslint-plugin-react is not
// installed; an adversarial review found it, not the build. This does what
// that rule would: parse every JSX file and refuse a duplicated attribute.
//
//   node scripts/verify-no-duplicate-jsx-props.mjs        (exit 1 on any)
import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';

const ROOTS = ['src', 'expo-il/src'];
const files = [];
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (e.name !== 'dist' && e.name !== 'node_modules') walk(p); }
    else if (/\.(jsx|js)$/.test(e.name) && !/sw\.js$/.test(e.name)) files.push(p);
  }
};
for (const r of ROOTS) if (fs.existsSync(r)) walk(r);

let elements = 0, findings = 0, parsed = 0;
const visit = (node, file, src) => {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const n of node) visit(n, file, src); return; }
  if (node.type === 'JSXOpeningElement') {
    elements++;
    const seen = new Map();
    for (const a of node.attributes || []) {
      if (a.type !== 'JSXAttribute' || !a.name) continue;
      const name = a.name.type === 'JSXNamespacedName' ? `${a.name.namespace.name}:${a.name.name.name}` : a.name.name;
      if (seen.has(name)) {
        findings++;
        const line = a.loc ? a.loc.start.line : '?';
        console.log(`DUPLICATE ${file}:${line}  <${src.slice(node.name.start, node.name.end)} … ${name}=… twice (first at line ${seen.get(name)}) — JSX keeps the last one`);
      } else seen.set(name, a.loc ? a.loc.start.line : '?');
    }
  }
  for (const k of Object.keys(node)) {
    if (k === 'loc' || k === 'start' || k === 'end' || k === 'extra' || k === 'leadingComments' || k === 'trailingComments') continue;
    const v = node[k];
    if (v && typeof v === 'object') visit(v, file, src);
  }
};

for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  if (!/<[A-Za-z]/.test(src)) continue;
  let ast;
  try {
    ast = parse(src, { sourceType: 'module', plugins: ['jsx'], errorRecovery: true, allowReturnOutsideFunction: true });
  } catch (e) {
    console.log(`UNPARSED ${f}: ${String(e.message || e).slice(0, 100)}`);
    findings++;
    continue;
  }
  parsed++;
  visit(ast.program, f, src);
}
console.log(`${parsed} JSX files parsed, ${elements} elements checked, ${findings} duplicated prop${findings === 1 ? '' : 's'}`);
if (parsed === 0) { console.log('FAIL: parsed nothing — that is not a pass'); process.exit(1); }
process.exit(findings ? 1 : 0);
