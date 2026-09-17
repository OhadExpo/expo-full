// English literals on the Hebrew athlete-detail page: NotesInline's history
// header and done-date, BwChart's delta label, TraineeIntake's NEW badge.
// These components have no translator hook; they read the language directly.
import fs from 'node:fs';
const rep = (s, from, to, n = 1) => { const c = s.split(from).length - 1; if (c !== n) throw new Error(`expected ${n}, got ${c}: ${from.slice(0, 60)}`); return s.split(from).join(to); };
const addImport = (s, file) => {
  if (/from '\.\/i18n'/.test(s)) return s;
  const m = s.match(/^import [^\n]*from '\.\/theme';\r?\n/m);
  if (!m) throw new Error('no theme import in ' + file);
  return s.replace(m[0], m[0] + "import { tr, readLang } from './i18n';\n");
};
const files = {
  'src/NotesInline.jsx': (s) => {
    s = addImport(s, 'NotesInline');
    s = rep(s, "            ✓ HISTORY ({doneRows.length}{done.length < doneRows.length ? ` · showing ${done.length}` : ''})", "            ✓ {tr(readLang(), 'HISTORY')} ({doneRows.length}{done.length < doneRows.length ? ` · ${tr(readLang(), 'showing')} ${done.length}` : ''})");
    s = rep(s, "<span>done {fmtPrettyDate(n.completed_at)}</span>", "<span>{tr(readLang(), 'done')} {fmtPrettyDate(n.completed_at)}</span>");
    return s;
  },
  'src/BwChart.jsx': (s) => {
    s = addImport(s, 'BwChart');
    return rep(s, ">Δ from first</div>", ">{tr(readLang(), 'Δ from first')}</div>");
  },
  'src/TraineeIntake.jsx': (s) => {
    s = addImport(s, 'TraineeIntake');
    return rep(s, ">· NEW<", ">· {tr(readLang(), 'NEW')}<");
  },
};
for (const [f, fn] of Object.entries(files)) {
  const s0 = fs.readFileSync(f, 'utf8');
  const crlf = s0.includes('\r\n');
  let s = crlf ? s0.replace(/\r\n/g, '\n') : s0;
  s = fn(s);
  fs.writeFileSync(f, crlf ? s.replace(/\n/g, '\r\n') : s);
  console.log('patched', f);
}
