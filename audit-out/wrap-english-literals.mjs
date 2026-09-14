// Wrap the JSX literals the widened gate finds, in place, with each file's own
// translator - and print the strings that now need Hebrew WRITTEN for them.
// Nothing here writes Hebrew: that is composed by hand, per the rule in i18n.js.
//
// It re-runs the gate's own scan rather than reading its report, because a
// literal can span several source lines and a line-based patch cannot see it.
import fs from 'node:fs';
import path from 'node:path';

const CALL = {
  'App.jsx': 'tt', 'BhbcView.jsx': 'tr', 'BugsView.jsx': 'tt', 'ChallengesView.jsx': 'tt',
  'CoachDemo.jsx': 'T', 'DashboardView.jsx': 'tt', 'IntakeView.jsx': 'tt', 'NotesWidget.jsx': 'tt',
  'PlansView.jsx': 'tt', 'SessionsView.jsx': 'tt', 'TasksV8View.jsx': 'tt', 'TraineeDetail.jsx': 't',
  'TraineePRsView.jsx': 'tt', 'TraineesView.jsx': 'tt', 'WeeklyFocusTool.jsx': 'tt', 'WorkoutReview.jsx': 'tt',
  'BookingPublic.jsx': 'RL', 'NotesInline.jsx': 'RL',
};
const SKIP_FILES = new Set(['ClientPortal.jsx', 'MealLogger.jsx', 'DemoTraineePortal.jsx', 'TrySandbox.jsx', 'auth.jsx']);
const ALLOW = new Set(['EXPO', 'RPE', 'ROM', 'VBT', 'BW', 'KG', 'PR', 'PRS', 'MRR', 'LTV', 'VAT', 'AI', 'OK', 'ID', 'URL', 'MP4', 'MOV', 'WEBM', 'CSV', 'PDF', 'PNG', 'JPG', 'XLSX', 'TSV', 'GB', 'MB', 'KB', 'FPS', 'HD', 'RDL', 'SLDL', 'OHP', 'DB', 'BB', 'TRX', 'BHBC', 'ACWR', 'HRV', 'RTP', 'MD', 'PPG', 'EN', 'HE', 'LIVE', 'REC', 'A', 'B', 'C', 'D', 'E', 'W', 'L', 'R', 'X', 'N', 'Y', 'M', 'J', 'S', 'Δ', 'ATH', 'POS', 'ISO', 'SA', 'SL', 'BP', 'ECC', 'CON', 'AMRAP', 'EMOM', 'TUT', 'RIR', '1RM', 'E1RM', 'NCAA', 'CMU', 'OUI', 'TAU', 'NIS', 'ILS', 'USD', 'YT', 'GPS', 'API', 'RLS', 'SW', 'PWA', 'IOS', 'MEDIAPIPE', 'LITE', 'LOG', 'W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8', 'W9', 'W10', 'W11', 'W12']);
const EXERCISE_SHAPE = /\b(?:DB|BB|SA|KB|TRX|RDL|SLDL|OHP|ISO|POS|ATH)\b|\d+\s*[x×]\s*\d+/i;
const LITERAL = />(\s*)([A-Z][A-Za-z0-9 ·+→←✓%&/()'’.…\-–—:]{2,48}?)(\s*)</g;
const PLACEHOLDER = /placeholder=(?:"([A-Za-z][^"]{2,80})"|'([A-Za-z][^']{2,80})')/g;
const RE_ESC = /[.*+?^${}()|[\]\\]/g;
const stripComments = (s) => s
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, (m) => ' '.repeat(m.length))
  .replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length))
  .replace(/^\s*\/\/.*$/gm, (m) => ' '.repeat(m.length));
const isAllowed = (t) => {
  const s = t.trim();
  if (!/[A-Za-z]{3,}/.test(s)) return true;
  if (s.split(/[\s·]+/).every((w) => ALLOW.has(w.replace(/[^A-Z0-9Δ]/g, '')) || /^[\d.,%₪+-]+$/.test(w) || w === '' || /^[·+→←✓%&/()'’.\-–—:]+$/.test(w))) return true;
  if (EXERCISE_SHAPE.test(s)) return true;
  return false;
};
const q = (s) => (s.includes("'") ? JSON.stringify(s) : "'" + s + "'");
const call = (file, s) => (CALL[file] === 'RL' ? 'tr(readLang(), ' + q(s) + ')' : CALL[file] + '(' + q(s) + ')');

const need = { 'bhbcHe.js': [], 'i18n.js': [] };
let total = 0;
for (const f of fs.readdirSync('src').filter((x) => x.endsWith('.jsx') && !SKIP_FILES.has(x))) {
  const raw = fs.readFileSync(path.join('src', f), 'utf8');
  if (!/from '\.\/i18n'/.test(raw) && !/from '\.\/bhbcHe'/.test(raw)) continue;
  if (!CALL[f]) continue;
  const src = stripComments(raw);
  const edits = [];
  for (const m of src.matchAll(LITERAL)) {
    if (isAllowed(m[2])) continue;
    edits.push({ i: m.index, len: m[0].length, text: m[2].trim(), out: '>{' + call(f, m[2].trim()) + '}<' });
  }
  for (const m of src.matchAll(PLACEHOLDER)) {
    const t = m[1] || m[2];
    if (/[֐-׿]/.test(t) || /\{/.test(t)) continue;
    if (/@|https?:|^e\.g\.|^\d|kg\/%|^reps$|delete|remove|^ohad\b|zoom\.us|\d{4}/i.test(t)) continue;
    edits.push({ i: m.index, len: m[0].length, text: t, out: 'placeholder={' + call(f, t) + '}' });
  }
  if (!edits.length) continue;
  let out = raw;
  for (const e of edits.sort((a, b) => b.i - a.i)) {
    out = out.slice(0, e.i) + e.out + out.slice(e.i + e.len);
    need[f === 'BhbcView.jsx' ? 'bhbcHe.js' : 'i18n.js'].push(e.text);
    total++;
  }
  fs.writeFileSync(path.join('src', f), out);
  console.log(String(edits.length).padStart(3), f);
}
console.log('wrapped', total);
for (const [dict, list] of Object.entries(need)) {
  const have = fs.readFileSync('src/' + dict, 'utf8');
  const esc = (k) => k.replace(RE_ESC, '\\$&');
  const missing = [...new Set(list)].filter((k) => {
    const bare = /^[A-Za-z_$][\w$]*$/.test(k) ? '|' + esc(k) : '';
    return !new RegExp("^\\s*(?:'" + esc(k) + "'|\"" + esc(k) + '"' + bare + ")\\s*:", 'm').test(have);
  });
  fs.writeFileSync('audit-out/need-hebrew-' + dict + '.txt', missing.join('\n') + '\n');
  console.log(dict, 'needs', missing.length, 'new keys');
}
