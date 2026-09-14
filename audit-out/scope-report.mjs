// For each "translator is not defined" site, print the enclosing declaration so
// the hook is added to a real component and never to a plain helper.
import fs from 'node:fs';
const SITES = {
  'App.jsx': [1544],
  'BhbcView.jsx': [1873, 1878, 1895, 1917, 1934, 1938, 1946, 2141, 4040, 4042],
  'ChallengesView.jsx': [45],
  'PlansView.jsx': [779, 5211, 5234, 5245],
  'TasksV8View.jsx': [1151, 1494, 1505, 1506],
  'TraineeDetail.jsx': [96, 101, 127, 137],
  'WorkoutReview.jsx': [107],
};
for (const [f, lines] of Object.entries(SITES)) {
  const src = fs.readFileSync('src/' + f, 'utf8').split(/\r?\n/);
  const seen = new Set();
  for (const ln of lines) {
    for (let i = ln - 1; i >= 0; i--) {
      const L = src[i];
      if (/^(export\s+)?(default\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/.test(L) || /^(export\s+)?const\s+[A-Za-z_$][\w$]*\s*=\s*(\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/.test(L)) {
        const key = f + ':' + (i + 1);
        if (!seen.has(key)) { seen.add(key); console.log(f.padEnd(20), 'site', String(ln).padStart(5), '→ decl', String(i + 1).padStart(5), L.trim().slice(0, 100)); }
        break;
      }
    }
  }
}
