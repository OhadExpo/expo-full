// Remove the three <LangCtx.Provider> wraps that belong to the athlete portal.
//
// Part of the deploy-tree cut (scripts/cut-deploy-tree.sh). These wraps are the
// athlete-portal Hebrew fix — they put ClientPortal and TrySandbox inside the
// language provider so their tt() calls stop reading the 'en' default. They are
// portal work and they ship WITH the portal, so while the hold is on they come
// out of the tree.
//
// Exact-string edits, not regex: a regex over this file is how three earlier
// "fixes" landed on the wrong element. If the surrounding code has moved, this
// throws instead of half-applying, which is the only safe failure for something
// that runs right before a production push.
import fs from 'node:fs';

const P = 'src/App.jsx';
let s = fs.readFileSync(P, 'utf8');

const EDITS = [
  // /try
  ['      return <LangCtx.Provider value={readLang()}><Suspense fallback={<BootSplash />}><TrySandbox /></Suspense></LangCtx.Provider>;',
    '      return <Suspense fallback={<BootSplash />}><TrySandbox /></Suspense>;'],
  // /demo/sandbox
  ['      return <LangCtx.Provider value={readLang()}><Suspense fallback={<BootSplash />}><TrySandbox pov="trainee" /></Suspense></LangCtx.Provider>;',
    '      return <Suspense fallback={<BootSplash />}><TrySandbox pov="trainee" /></Suspense>;'],
  // the portal itself
  ['  if (isClient) return (<LangCtx.Provider value={lang}><div data-theme="dark" style={{ background: \'var(--c-bg)\', color: \'var(--c-tx)\', minHeight: \'100vh\' }}><Suspense fallback={<ViewFallback />}>',
    '  if (isClient) return (<div data-theme="dark" style={{ background: \'var(--c-bg)\', color: \'var(--c-tx)\', minHeight: \'100vh\' }}><Suspense fallback={<ViewFallback />}>'],
  ['  </Suspense></div></LangCtx.Provider>);',
    '  </Suspense></div>);'],
];

let applied = 0;
for (const [from, to] of EDITS) {
  const n = s.split(from).length - 1;
  if (n === 0) { console.log(`  already held (not found): ${from.trim().slice(0, 56)}…`); continue; }
  if (n > 1) { console.error(`REFUSING: ${n} matches for a wrap that must be unique:\n  ${from.trim().slice(0, 80)}`); process.exit(1); }
  s = s.replace(from, to);
  applied++;
}
fs.writeFileSync(P, s);

// The check that matters: no PORTAL wrap may remain.
//
// Scoped to the isClient return on purpose. There is a second
// `<LangCtx.Provider value={lang}>` further down that wraps the COACH app, and
// it must stay — counting every occurrence would fail a perfectly good cut and
// send someone hunting for a wrap that is supposed to be there.
const left = (s.match(/if \(isClient\) return \(<LangCtx\.Provider/g) || []).length;
console.log(`  ${applied} wrap edit(s) applied · ${left} portal LangCtx wrap(s) left in ${P}`);
if (left) { console.error('REFUSING: a portal LangCtx wrap survived the unwrap.'); process.exit(1); }
