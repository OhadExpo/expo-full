// At phone width the coach header's scroller is the OUTER bar, not the <nav>
// inside it: measured at 390, nav.hdr-scroll is 877px wide with scrollWidth ===
// clientWidth (it never scrolls - it is simply wider than the screen and gets
// clipped), while the bar around it is the element the media query turns into
// an overflow-x:auto strip. The fade has to sit on the element that actually
// scrolls, so both get it, and whichever one scrolls shows the gradient.
import fs from 'node:fs';
const f = 'src/App.jsx';
let s = fs.readFileSync(f, 'utf8');
const rep = (a, b, l) => { const n = s.split(a).length - 1; if (n !== 1) throw new Error(l + ' x' + n); s = s.replace(a, b); console.log('ok', l); };

rep(`  const coachNavRef = React.useRef(null);
  useEdgeFade(coachNavRef);`,
`  const coachNavRef = React.useRef(null);
  const coachBarRef = React.useRef(null);
  useEdgeFade(coachNavRef);
  useEdgeFade(coachBarRef);`, 'bar ref');

rep(`        <div className="hdr-scroll" style={{maxWidth:1360,margin:"0 auto",padding:"0 16px",display:"flex",alignItems:"center",height:56,overflowX:"visible",WebkitOverflowScrolling:"touch",msOverflowStyle:"none",scrollbarWidth:"none"}}>`,
`        <div ref={coachBarRef} className="hdr-scroll" style={{maxWidth:1360,margin:"0 auto",padding:"0 16px",display:"flex",alignItems:"center",height:56,overflowX:"visible",WebkitOverflowScrolling:"touch",msOverflowStyle:"none",scrollbarWidth:"none"}}>`, 'bar element');
fs.writeFileSync(f, s);
