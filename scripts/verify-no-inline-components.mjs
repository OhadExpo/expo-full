// A React component defined INSIDE another component's render body.
//
// WHY THIS EXISTS. React compares elements by their `type`. A component
// declared inside a render gets a brand new function identity on every render,
// so `type` never matches the previous one and React unmounts the whole subtree
// and mounts a fresh one — every render, for every instance.
//
// This has bitten this codebase twice:
//   - audit finding #10: "Outer component defined inside render — entire card
//     remounts every keystroke, composer loses focus per character"
//   - BhbcView WellnessModal's `Seg`: ~60 button remounts per character typed
//     on a 15-athlete roster
//
// The damage ranges from wasted work to losing an input's focus mid-word,
// depending on whether a focusable element sits inside the inlined component.
// Both are avoidable by hoisting it to module scope and passing props.
//
// DETECTION. Deliberately narrow, because a noisy rule gets ignored: a name
// starting with a capital letter, assigned an arrow function, indented (so it
// is nested inside something), whose body clearly returns JSX. Plain constants
// like `const W = 96` or `const T = SHOT_I18N[lang]` are not flagged, and a
// component at module scope (indent 0) is exactly what we want people to write.
import fs from 'node:fs';
import path from 'node:path';

const files = [];
function walk(d) {
  if (!fs.existsSync(d)) return;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const f = path.join(d, e.name);
    if (e.isDirectory()) { if (!/node_modules|dist|\.git/.test(e.name)) walk(f); }
    else if (/\.jsx$/.test(e.name)) files.push(f.split(path.sep).join('/'));
  }
}
walk('src'); walk('expo-il/src');

// BASELINE. These nine already existed when this gate was written. Each was
// checked for a focusable child (<input>, <textarea>, <select>, contentEditable,
// <Input>) and none has one, so the cost is a wasted remount rather than an
// athlete losing focus mid-word. Hoisting all nine would touch eight files for
// a micro-optimisation; the point of this gate is to stop NEW ones.
//
// If you add a focusable element inside any of these, remove it from this list
// and hoist it — that is the moment it starts eating keystrokes.
const ALLOW = new Set([
  'src/auth.jsx:Card',                 // role picker, two static cards
  'src/BhbcView.jsx:Section',          // layout wrapper
  'src/CoachLanding.jsx:Col',          // marketing column
  'src/LineageLiftReport.jsx:Legend',  // colour swatch + label
  'src/PlansView.jsx:LabeledBtn',      // icon button
  'src/PlansView.jsx:PortalPill',      // toggle pill
  'src/TraineeCRM.jsx:TabBtn',         // tab button
  'src/TrainingLineageV2.jsx:Col',     // board column
  'expo-il/src/App.jsx:Tile',          // demo tile
]);

const hits = [];
for (const f of files) {
  // Strip the CR. These files are CRLF, and in a JS regex `.` does not match
  // \r — it is a line terminator. That silently broke every `(.*)$` anchor
  // below and made this gate report almost nothing.
  const lines = fs.readFileSync(f, 'utf8').split('\n').map((l) => l.replace(/\r$/, ''));
  lines.forEach((line, i) => {
    // Must be an actual FUNCTION definition, not an alias. `const Outer =
    // bareMode ? BareOuter : CardOuter` and `const Body = cfg.Body` point at
    // components defined elsewhere, so their identity is stable and React is
    // happy — flagging those was noise.
    const arrow = /^(\s+)(?:const|let)\s+([A-Z][A-Za-z0-9_]*)\s*=\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>(.*)$/.exec(line);
    const decl = /^(\s+)function\s+([A-Z][A-Za-z0-9_]*)\s*\(/.exec(line);
    const m = arrow || decl;
    if (!m) return;
    const indent = m[1].length;
    const name = m[2];
    if (indent === 0) return;
    if (ALLOW.has(`${f}:${name}`)) return;

    // Does it return JSX? Check the expression that actually belongs to this
    // definition, not "the next six lines", which swept in unrelated code and
    // flagged `const W = Math.max(...)` as a component.
    let returnsJsx = false;
    if (arrow) {
      const rest = (arrow[3] || '').trim();
      if (rest.startsWith('<')) returnsJsx = true;
      else if (rest === '(' || rest === '') {
        const next = (lines[i + 1] || '').trim();
        returnsJsx = next.startsWith('<');
      } else if (rest.startsWith('{')) {
        // Block body: look for a return of JSX before the block closes.
        for (let k = i; k < Math.min(i + 25, lines.length); k++) {
          if (/\breturn\s*\(?\s*</.test(lines[k])) { returnsJsx = true; break; }
          if (k > i && new RegExp(`^\\s{0,${indent}}\\}`).test(lines[k])) break;
        }
      }
    } else {
      for (let k = i; k < Math.min(i + 40, lines.length); k++) {
        if (/\breturn\s*\(?\s*</.test(lines[k])) { returnsJsx = true; break; }
        if (k > i && new RegExp(`^\\s{0,${indent}}\\}`).test(lines[k])) break;
      }
    }
    if (!returnsJsx) return;

    hits.push({ file: f, line: i + 1, name, snippet: line.trim().slice(0, 78) });
  });
}

console.log(`INLINE COMPONENTS — ${files.length} .jsx files scanned\n`);
for (const h of hits) {
  console.log(`  x ${h.file}:${h.line}  <${h.name}> defined inside a render`);
  console.log(`      ${h.snippet}`);
}
if (hits.length) {
  console.log(`\n${hits.length} component(s) defined inside a render.`);
  console.log('Hoist each to module scope and pass what it needs as props.');
  console.log('React remounts these subtrees on EVERY render — focus is lost if one contains an input.');
} else {
  console.log('  no components defined inside a render.');
}
process.exit(hits.length ? 1 : 0);
