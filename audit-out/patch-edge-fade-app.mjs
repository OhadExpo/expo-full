// Re-apply the coach header's edge fade (a merge on this branch rewrote
// App.jsx and took the uncommitted edit with it). Idempotent.
import fs from 'node:fs';
const f = 'src/App.jsx';
let s = fs.readFileSync(f, 'utf8');
const rep = (a, b, l) => { if (s.includes(b)) { console.log('already', l); return; } const n = s.split(a).length - 1; if (n !== 1) throw new Error(l + ' x' + n); s = s.replace(a, b); console.log('ok', l); };

rep("import { Btn, baseBtn, ToastHost, toast } from './ui';",
    "import { Btn, baseBtn, ToastHost, toast, useEdgeFade } from './ui';", 'import');

rep('  const coachNavRef = React.useRef(null);',
`  const coachNavRef = React.useRef(null);
  // At 390 the element that scrolls is the OUTER bar (390 visible, 1260 of
  // content), not the <nav> inside it - so both get the fade and whichever one
  // actually scrolls shows it.
  const coachBarRef = React.useRef(null);
  useEdgeFade(coachNavRef);
  useEdgeFade(coachBarRef);`, 'refs');

rep('        <div className="hdr-scroll" style={{maxWidth:1360,',
    '        <div ref={coachBarRef} className="hdr-scroll" style={{maxWidth:1360,', 'bar element');
fs.writeFileSync(f, s);
