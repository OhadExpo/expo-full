// THE ATHLETE PORTAL MAY NOT BE HANDED A COACH'S PEN.
//
// 26.9: an athlete was shown "SAVE FAILED — EXPO-TRAINEES" because a coach-side
// setter reached the portal through props and, on a no-op update, upserted the
// staff-only roster row from the athlete's seat. The runtime guard
// (src/seatWrite.js) now stops that write; this stops the class at build time:
//
//   1. The portal components in src/App.jsx may receive only the setters an
//      athlete owns. Any other `set*` / `on*` prop that names a store writer is
//      a finding.
//   2. Portal files may not write the `store` table at all, except the one
//      presence row an athlete is allowed (key expo-presence-<id>).
//
//   node scripts/verify-portal-write-boundary.mjs        (exit 1 on any)
import fs from 'node:fs';
import { parse } from '@babel/parser';

const PORTAL_COMPONENTS = ['ClientPortal', 'MealLogger', 'TrySandbox', 'DemoTraineePortal'];
// Setters an athlete legitimately owns (their workouts, their bodyweight, their
// weekly focus, their form videos). Everything else is the coach's.
const ALLOWED_SETTERS = new Set([
  'setClientWorkouts', 'setBwLog', 'setWeeklyFocus', 'updateFormVideos', 'setMeals', 'setMealLog',
  // onDecrementSession is guarded to a no-op off the coach seat (App.jsx) and
  // kept for the coach's in-person flow; it is listed here on purpose.
  'onDecrementSession',
]);
const PORTAL_FILES = ['src/ClientPortal.jsx', 'src/MealLogger.jsx', 'src/TrySandbox.jsx', 'src/DemoTraineePortal.jsx'];

let findings = 0, checkedProps = 0, checkedElements = 0;

// 1. props handed to the portal components in App.jsx
const app = fs.readFileSync('src/App.jsx', 'utf8');
const ast = parse(app, { sourceType: 'module', plugins: ['jsx'], errorRecovery: true });
const visit = (node) => {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach(visit); return; }
  if (node.type === 'JSXOpeningElement' && node.name && node.name.type === 'JSXIdentifier' && PORTAL_COMPONENTS.includes(node.name.name)) {
    checkedElements++;
    for (const a of node.attributes || []) {
      if (a.type !== 'JSXAttribute' || !a.name) continue;
      const n = a.name.name;
      checkedProps++;
      const looksLikeWriter = /^set[A-Z]/.test(n) || /^(update|remove|delete|save)[A-Z]/.test(n);
      if (looksLikeWriter && !ALLOWED_SETTERS.has(n)) {
        findings++;
        console.log(`BOUNDARY  src/App.jsx:${a.loc.start.line}  <${node.name.name} ${n}=…> — a writer the athlete does not own reaches the portal`);
      }
    }
  }
  for (const k of Object.keys(node)) {
    if (k === 'loc' || k === 'start' || k === 'end' || k === 'extra') continue;
    const v = node[k];
    if (v && typeof v === 'object') visit(v);
  }
};
visit(ast.program);

// 2. direct store writes inside portal files
for (const f of PORTAL_FILES) {
  if (!fs.existsSync(f)) continue;
  const src = fs.readFileSync(f, 'utf8');
  const lines = src.split('\n');
  lines.forEach((line, i) => {
    if (!/from\(['"]store['"]\)/.test(line)) return;
    if (!/\.(upsert|insert|update|delete)\(/.test(line)) return;
    // the one write an athlete owns: their presence row
    const window = lines.slice(Math.max(0, i - 6), i + 1).join('\n');
    if (/expo-presence-/.test(window)) return;
    findings++;
    console.log(`BOUNDARY  ${f}:${i + 1}  a portal file writes the store table outside its presence row`);
  });
}

console.log(`${checkedElements} portal elements, ${checkedProps} props, ${PORTAL_FILES.filter((f) => fs.existsSync(f)).length} portal files checked, ${findings} boundary finding${findings === 1 ? '' : 's'}`);
if (checkedElements === 0) { console.log('FAIL: found no portal element in src/App.jsx — that is not a pass'); process.exit(1); }
process.exit(findings ? 1 : 0);
