// EVERY JSX COMPONENT TAG IS DEFINED.
//
// ESLint's no-undef does not look at JSX tag names, and this repo has no
// eslint-plugin-react (react/jsx-no-undef). So <RefinedHeaderStrip …/> in the
// BHBC zone's back-from-injury alert shipped without an import and sat on
// production until the first athlete tripped the 28-day ramp — at which point
// it would have thrown a ReferenceError and the error boundary would have
// replaced the whole club zone (found in the 26.9 pre-deploy review).
//
// Babel's scope analysis, not a regex: a capitalised tag must resolve to a
// binding in scope (import, declaration, parameter, destructure).
//
//   node scripts/verify-jsx-defined.mjs        (exit 1 on any)
import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';
import traverseMod from '@babel/traverse';

const traverse = traverseMod.default || traverseMod;
const ROOTS = ['src', 'expo-il/src'];
const files = [];
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); } else if (/\.(jsx|js)$/.test(e.name)) files.push(p);
  }
};
ROOTS.filter((r) => fs.existsSync(r)).forEach(walk);

let tags = 0;
const bad = [];
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  if (!/<[A-Z]/.test(src)) continue;
  let ast;
  try { ast = parse(src, { sourceType: 'module', plugins: ['jsx'] }); } catch (e) { bad.push(`${f}: does not parse (${e.message})`); continue; }
  traverse(ast, {
    JSXOpeningElement(p) {
      const n = p.node.name;
      if (n.type !== 'JSXIdentifier' || !/^[A-Z]/.test(n.name)) return;
      tags++;
      if (!p.scope.hasBinding(n.name)) bad.push(`${f.replace(/\\/g, '/')}:${n.loc.start.line}  <${n.name}> is not defined in scope`);
    },
  });
}
for (const b of bad) console.log(`FAIL  ${b}`);
console.log(`\nJSX-DEFINED GATE — ${files.length} files, ${tags} component tags, ${bad.length} undefined`);
if (!tags) { console.log('FAIL  no component tags were checked'); process.exit(1); }
process.exit(bad.length ? 1 : 0);
