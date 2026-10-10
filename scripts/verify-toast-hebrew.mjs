// EVERY TOAST HAS HEBREW - a build gate (9.10 #589).
//
// A toast is invisible to verify-english-literals: the message is an argument,
// not JSX. On 9.10 the athlete portal still raised English toasts in Hebrew
// ("Video is 63MB - too large", "Could not save your video on this device"),
// and the 17.9 scanner that should have listed them skipped the athlete files
// from the days the portal was held at production.
//
// What counts as translated is exactly what renders: ToastHost's toastText (ui.jsx)
// looks the whole message up, then the head up to ": " - so a static toast needs a
// key and "Update failed: ${msg}" needs a key for "Update failed:". BhbcView wraps
// toast() in zoneT, so its toasts are looked up in the club dictionary too. A
// template with ${...} before any ": " can only be translated at the call site
// (tt(...).replace), so it is a finding unless that line has a Hebrew branch.
//
// Ratchet: scripts/toast-hebrew-baseline.json holds the count per file; a file may
// only go down. Exit 1 when one grows.
//   node scripts/verify-toast-hebrew.mjs            (gate)
//   node scripts/verify-toast-hebrew.mjs --report   (list everything)
//   node scripts/verify-toast-hebrew.mjs --write-baseline
import fs from 'node:fs';
import { tr } from '../src/i18n.js';
import { bhbcT } from '../src/bhbcHe.js';

const SKIP = /^TrySandbox\.jsx$/;   // held at production by the cut
const RX = /(?<![\w.])(confirmToast|toast)\(\s*(?:'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`)/g;
const unesc = (v) => v.replace(/\\n/g, '\n').replace(/\\(['"`\\])/g, '$1');
// the club dictionary counts only for a club toast(): BhbcView wraps toast() in zoneT,
// but imports confirmToast straight from ./ui (1008e review)
const he = (file, m, fn = 'toast') => {
  const look = (k) => { const a = tr('he', k); if (a !== k) return a; if (/^Bhbc/.test(file) && fn === 'toast') { const b = bhbcT('he', k); if (b !== k) return b; } return k; };
  if (look(m) !== m) return true;
  const i = m.indexOf(': ');
  return i > 0 && look(m.slice(0, i + 1)) !== m.slice(0, i + 1);
};

const per = {}; const all = [];
// toast(tt('...')) / toast(tr(readLang(), '...')): the key itself must exist exactly -
// a typo there ships English while the line looks translated (1008e review)
const RX_TT = /(?<![\w.])(?:confirmToast|toast)\(\s*(?:tt\(|tr\(\s*readLang\(\)\s*,)\s*(?:'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)")/g;
for (const f of fs.readdirSync('src').filter((x) => /\.(jsx|js)$/.test(x) && !SKIP.test(x))) {
  const s = fs.readFileSync('src/' + f, 'utf8');
  for (const m of s.matchAll(RX)) {
    const fn = m[1];
    const raw = m[2] ?? m[3] ?? m[4];
    const v = unesc(raw);
    if (!/^[A-Z✓⚠]/.test(v) || /[֐-׿]/.test(v)) continue;     // Hebrew already, or not a sentence
    const ln = s.slice(0, m.index).split('\n').length;
    const line = s.split('\n')[ln - 1];
    if (/readLang\(\)\s*===\s*'he'|\bhe\s*\?|\bheCtx\s*\?/.test(line)) continue;   // a Hebrew branch on the line
    let ok;
    if (m[4] !== undefined && v.includes('${')) {
      const i = v.indexOf(': ');
      const dollar = v.indexOf('${');
      ok = i > 0 && i < dollar && he(f, v.slice(0, i + 1) + ' x', fn);   // a translatable head before the first ${
    } else ok = he(f, v, fn);
    if (ok) continue;
    per[f] = (per[f] || 0) + 1;
    all.push(`${f}:${ln} | ${v.replace(/\s+/g, ' ').slice(0, 110)}`);
  }
  for (const m of s.matchAll(RX_TT)) {
    const k = unesc(m[1] ?? m[2]);
    if (tr('he', k) !== k || (/^Bhbc/.test(f) && bhbcT('he', k) !== k)) continue;
    const ln = s.slice(0, m.index).split('\n').length;
    per[f] = (per[f] || 0) + 1;
    all.push(`${f}:${ln} | tt key not in the dictionary: ${k.replace(/\s+/g, ' ').slice(0, 90)}`);
  }
}

const BASE_FILE = 'scripts/toast-hebrew-baseline.json';
if (process.argv.includes('--write-baseline')) {
  fs.writeFileSync(BASE_FILE, JSON.stringify(Object.fromEntries(Object.entries(per).sort()), null, 2) + '\n');
  console.log(`baseline written: ${Object.values(per).reduce((a, b) => a + b, 0)} toasts in ${Object.keys(per).length} files`);
  process.exit(0);
}
const base = fs.existsSync(BASE_FILE) ? JSON.parse(fs.readFileSync(BASE_FILE, 'utf8')) : {};
const grew = Object.entries(per).filter(([f, n]) => n > (base[f] || 0));
const total = Object.values(per).reduce((a, b) => a + b, 0);
console.log(`TOAST HEBREW - ${total} toast(s) without Hebrew in ${Object.keys(per).length} file(s); ratchet: may only fall`);
if (process.argv.includes('--report') || grew.length) for (const l of all) if (process.argv.includes('--report') || grew.some(([f]) => l.startsWith(f + ':'))) console.log('  ' + l);
for (const [f, n] of grew) console.log(`  ✗ ${f}: ${n} (baseline ${base[f] || 0})`);
for (const [f, n] of Object.entries(base)) if ((per[f] || 0) < n) console.log(`  ↓ ${f}: ${per[f] || 0} (baseline ${n}) - lower it in ${BASE_FILE}`);
process.exit(grew.length && !process.argv.includes('--report') ? 1 : 0);
