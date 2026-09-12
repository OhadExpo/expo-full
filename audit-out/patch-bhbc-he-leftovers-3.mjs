// Third pass: the "Show 12 more" button on past practices, the GAME chips on
// the week view and the list's GAME DAY - found with probe-bhbc-find-text.mjs.
import fs from 'node:fs';
const V = 'src/BhbcView.jsx';
let s = fs.readFileSync(V, 'utf8');
const rep = (from, to, label) => { const n = s.split(from).length - 1; if (n !== 1) throw new Error((label || from.slice(0, 50)) + ' ×' + n); s = s.replace(from, to); console.log('ok', label || from.slice(0, 50)); };

rep("          Show {Math.min(12, past.length - limit)} more\n", "          {tr('Show {n} more').replace('{n}', Math.min(12, past.length - limit))}\n", 'show n more');
rep("const gdLabel = gd == null ? null : gd === 0 ? 'GAME DAY' : gd < 0 ? `GD${gd}` : `GD+${gd}`;", "const gdLabel = gd == null ? null : gd === 0 ? tr('GAME DAY') : gd < 0 ? `GD${gd}` : `GD+${gd}`;", 'list GAME DAY');
rep("color: '#fff', background: ORANGE, padding: '1px 4px' }}>GAME</div>}", "color: '#fff', background: ORANGE, padding: '1px 4px' }}>{tr('GAME')}</div>}", 'week GAME chip');
{
  const i = s.indexOf('function ScheduleWeek(');
  if (i < 0) throw new Error('ScheduleWeek');
  const nl = s.indexOf('\n', i);
  s = s.slice(0, nl + 1) + '  const tr = useT();\n' + s.slice(nl + 1);
  console.log('ok ScheduleWeek: const tr = useT()');
}
fs.writeFileSync(V, s);

const H = 'src/bhbcHe.js';
let h = fs.readFileSync(H, 'utf8');
const keys = [['Show {n} more', 'עוד {n}'], ['GAME', 'משחק']];
const start = h.indexOf('export const HE = {');
const esc = (k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const has = (k) => new RegExp("^\\s*(?:'" + esc(k) + "'|\"" + esc(k) + '"|' + esc(k) + ')\\s*:', 'm').test(h);
const fresh = keys.filter(([k]) => !has(k));
const nl = h.indexOf('\n', start);
h = h.slice(0, nl + 1) + fresh.map(([k, v]) => `  '${k}': '${v}',`).join('\n') + '\n' + h.slice(nl + 1);
fs.writeFileSync(H, h);
console.log('keys added', fresh.length, fresh.map(([k]) => k).join(' | '));
