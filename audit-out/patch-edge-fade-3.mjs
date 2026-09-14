// Measured at 390: in the club zone the element that actually scrolls is
// .bhbc-header-inner (390 visible, 1038 of content, 648px hidden to the right),
// not the <nav> of tabs inside it. Fade the scroller.
import fs from 'node:fs';
const f = 'src/BhbcView.jsx';
let s = fs.readFileSync(f, 'utf8');
const rep = (a, b, l) => { const n = s.split(a).length - 1; if (n !== 1) throw new Error(l + ' x' + n); s = s.replace(a, b); console.log('ok', l); };

rep(`  const navRef = React.useRef(null);
  useEdgeFade(navRef);`,
`  const navRef = React.useRef(null);
  const headRef = React.useRef(null);
  useEdgeFade(navRef);
  useEdgeFade(headRef);`, 'head ref');

rep(`        <div className="bhbc-header-inner" style={{ maxWidth: 1280, margin: '0 auto', padding: '0 18px', minHeight: 54, display: 'flex', alignItems: 'center', gap: 14 }}>`,
`        <div ref={headRef} className="bhbc-header-inner" style={{ maxWidth: 1280, margin: '0 auto', padding: '0 18px', minHeight: 54, display: 'flex', alignItems: 'center', gap: 14 }}>`, 'head element');
fs.writeFileSync(f, s);
