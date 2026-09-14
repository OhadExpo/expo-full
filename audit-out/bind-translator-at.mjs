// Bind the translator in whatever component encloses each reported line.
// Walks up to the nearest PascalCase function declaration and puts the hook on
// its first line - a hook is only legal in a component, so a non-component
// enclosure is reported instead of patched.
import fs from 'node:fs';

const SITES = JSON.parse(process.env.SITES);
const HOOK = { 'BhbcView.jsx': 'useT()', 'PlansView.jsx': 'useAppT()', 'ChallengesView.jsx': 'useAppT()', 'WorkoutReview.jsx': 'useAppT()', 'ExercisesView.jsx': 'useAppT()', 'TraineePRsView.jsx': 'useAppT()', 'SessionsView.jsx': 'useAppT()' };
const NAME = { 'TraineeDetail.jsx': 't', 'BhbcView.jsx': 'tr' };

for (const [f, lines] of Object.entries(SITES)) {
  const p = 'src/' + f;
  let src = fs.readFileSync(p, 'utf8');
  const eol = src.includes('\r\n') ? '\r\n' : '\n';
  const rows = src.split(/\r?\n/);
  const decls = new Set();
  for (const ln of lines) {
    let found = null;
    for (let i = ln - 1; i >= 0; i--) {
      const L = rows[i];
      if (/^(export\s+)?(default\s+)?function\s+[A-Z][\w$]*\s*\(/.test(L)) { found = i; break; }
      if (/^(export\s+)?const\s+[A-Z][\w$]*\s*=\s*(\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/.test(L)) { found = i; break; }
      if (/^(export\s+)?(async\s+)?function\s+[a-z]/.test(L) || /^(export\s+)?const\s+[a-z][\w$]*\s*=\s*\(/.test(L)) { console.log('NOT A COMPONENT', f, ln, L.trim().slice(0, 70)); break; }
    }
    if (found != null) decls.add(found);
  }
  const name = NAME[f] || 'tt';
  const hook = HOOK[f] || 'useT()';
  for (const i of [...decls].sort((a, b) => b - a)) {
    if ((rows[i + 1] || '').includes('const ' + name + ' =')) { console.log('have', f, rows[i].trim().slice(0, 50)); continue; }
    rows.splice(i + 1, 0, '  const ' + name + ' = ' + hook + ';');
    console.log('ok  ', f, rows[i].trim().slice(0, 60));
  }
  fs.writeFileSync(p, rows.join(eol));
}
