// EVERY CALL SITE PASSES THE DATA ITS COMPONENT READS.
//
// 27.9, Ohad: "scheduele is not updated (should be automatic)" — then
// "horrible mistake", "learn from it", "make sure obvious shit like this is
// always automatically scanned for and fixed". The BHBC SCHEDULE card's month
// and week views were EMPTY for ten days: 2abd4fa dropped `fixtures` from
// <ScheduleTool fx={fx} …/>, the views iterated `(fixtures || [])`, and drew a
// clean, plausible, empty calendar. Every layout gate passed, because an empty
// grid is perfectly aligned.
//
// The class: a component destructures a prop with no default, uses it as DATA
// (.map / .filter / .length / Object.entries / for-of / spread …), and a call
// site in the same file never passes it. Babel, not a regex.
//
//   node scripts/verify-data-props.mjs        (exit 1 on any)
//   node scripts/verify-data-props.mjs --list (print every checked pair)
import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';
import traverseMod from '@babel/traverse';

const traverse = traverseMod.default || traverseMod;
const ROOTS = ['src', 'expo-il/src'];
const LIST = process.argv.includes('--list');
const files = [];
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); } else if (/\.jsx$/.test(e.name)) files.push(p);
  }
};
ROOTS.filter((r) => fs.existsSync(r)).forEach(walk);

const DATA_MEMBERS = new Set(['map', 'filter', 'forEach', 'reduce', 'find', 'findIndex', 'some', 'every', 'slice', 'length', 'flatMap', 'sort', 'includes', 'indexOf', 'join', 'byDay']);
const DATA_CALLS = new Set(['entries', 'keys', 'values', 'fromEntries']);

// Is `id` (an Identifier path for the prop) used as data?
const dataUse = (refPath) => {
  let p = refPath;
  // step through `(x || [])`, `(x ?? {})`
  while (p.parentPath && p.parentPath.isLogicalExpression() && p.parentPath.node.left === p.node) p = p.parentPath;
  const par = p.parentPath;
  if (!par) return false;
  if (par.isMemberExpression() && par.node.object === p.node) {
    const k = par.node.property;
    return !par.node.computed && k.type === 'Identifier' && DATA_MEMBERS.has(k.name);
  }
  if (par.isCallExpression() && par.node.arguments[0] === p.node) {
    const c = par.node.callee;
    if (c.type === 'MemberExpression' && c.object.type === 'Identifier' && c.object.name === 'Object' && c.property.type === 'Identifier' && DATA_CALLS.has(c.property.name)) return true;
  }
  if (par.isForOfStatement() && par.node.right === p.node) return true;
  if (par.isSpreadElement() && par.parentPath && par.parentPath.isArrayExpression()) return true;
  return false;
};

let checked = 0;
const bad = [];
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  if (!/<[A-Z]/.test(src)) continue;
  let ast;
  try { ast = parse(src, { sourceType: 'module', plugins: ['jsx'] }); } catch (e) { bad.push(`${f}: does not parse (${e.message})`); continue; }
  // 1. components: Capitalised function whose first param is an object pattern
  const comps = new Map(); // name -> Set(data props without default)
  const fns = [];          // [name, fnPath] for the transitive pass
  const collect = (name, fnPath) => {
    const prm = fnPath.node.params[0];
    if (!prm || prm.type !== 'ObjectPattern') return;
    fns.push([name, fnPath]);
    const required = [];
    for (const prop of prm.properties) {
      if (prop.type !== 'ObjectProperty') continue;
      // A default of [] or {} is a SILENT EMPTY, not a default: 19.9 the week
      // planner lost `fixtures`, fell back to `fixtures = []` and drew seven
      // empty days. Only a real default (a value) exempts a prop.
      let local = prop.value;
      if (local.type === 'AssignmentPattern') {
        const r = local.right;
        const emptyLit = (r.type === 'ArrayExpression' && r.elements.length === 0) || (r.type === 'ObjectExpression' && r.properties.length === 0);
        if (!emptyLit) continue;
        local = local.left;
      }
      if (local.type !== 'Identifier' || prop.key.type !== 'Identifier') continue;
      required.push([prop.key.name, local.name]);
    }
    const data = new Set();
    for (const [key, local] of required) {
      const b = fnPath.scope.getBinding(local);
      if (b && b.referencePaths.some(dataUse)) data.add(key);
    }
    if (data.size) comps.set(name, data);
  };
  traverse(ast, {
    FunctionDeclaration(p) { if (p.node.id && /^[A-Z]/.test(p.node.id.name)) collect(p.node.id.name, p); },
    VariableDeclarator(p) {
      const init = p.node.init;
      if (p.node.id.type === 'Identifier' && /^[A-Z]/.test(p.node.id.name) && init && (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression')) collect(p.node.id.name, p.get('init'));
    },
  });
  // FORWARDED DATA IS DATA. <ScheduleTool> never iterated `fixtures` itself - it
  // handed it to <ScheduleMonth fixtures={fixtures}/>, which did. So a prop
  // passed as `attr={local}` into a component whose `attr` is data is data too,
  // to a fixpoint (the break test of the first version passed the bug).
  const isForwardedData = (refPath) => {
    const c = refPath.parentPath;
    if (!c || !c.isJSXExpressionContainer()) return false;
    const attr = c.parentPath;
    if (!attr || !attr.isJSXAttribute()) return false;
    const el = attr.parentPath && attr.parentPath.node;
    const tag = el && el.name && el.name.type === 'JSXIdentifier' ? el.name.name : null;
    return !!(tag && comps.has(tag) && comps.get(tag).has(attr.node.name.name));
  };
  for (let changed = true, guard = 0; changed && guard < 10; guard++) {
    changed = false;
    for (const [name, fnPath] of fns) {
      const prm = fnPath.node.params[0];
      for (const prop of prm.properties) {
        if (prop.type !== 'ObjectProperty' || prop.key.type !== 'Identifier') continue;
        let lv = prop.value;
        if (lv.type === 'AssignmentPattern') {
          const r = lv.right;
          if (!((r.type === 'ArrayExpression' && r.elements.length === 0) || (r.type === 'ObjectExpression' && r.properties.length === 0))) continue;
          lv = lv.left;
        }
        if (lv.type !== 'Identifier') continue;
        const set = comps.get(name) || new Set();
        if (set.has(prop.key.name)) continue;
        const b = fnPath.scope.getBinding(lv.name);
        if (b && b.referencePaths.some(isForwardedData)) { set.add(prop.key.name); comps.set(name, set); changed = true; }
      }
    }
  }
  if (!comps.size) continue;
  // 2. call sites in the same file
  traverse(ast, {
    JSXOpeningElement(p) {
      const n = p.node.name;
      if (n.type !== 'JSXIdentifier' || !comps.has(n.name)) return;
      if (p.node.attributes.some((a) => a.type === 'JSXSpreadAttribute')) return;
      const given = new Set(p.node.attributes.map((a) => a.name && a.name.name));
      for (const need of comps.get(n.name)) {
        checked++;
        if (LIST) console.log(`  ${path.basename(f)}:${n.loc.start.line} <${n.name}> ${need}`);
        if (!given.has(need)) bad.push(`${f}:${n.loc.start.line}  <${n.name}> is not given \`${need}\`, which it reads as data — it will render EMPTY`);
      }
    },
  });
}

console.log(`DATA-PROPS GATE — ${files.length} files, ${checked} data props checked at their call sites, ${bad.length} missing`);
for (const b of bad) console.log('  MISSING ' + b);
if (checked === 0) { console.log('  FAIL: checked nothing — the gate is measuring nothing'); process.exit(1); }
process.exit(bad.length ? 1 : 0);
