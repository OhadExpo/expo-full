// "logged is spilling. it should be one row not two like the other buttons,
// and fit inside the borders" (Ohad, 14.9, his phone).
//
// The DAILY ROUTINE header is a flex row: title group · chips · START. The
// chips had no white-space rule and no flex-shrink guard, so when the row ran
// out of width the only shrinkable child was the chip - "1 LOGGED" broke onto
// a second line and the text sat on the border it had just outgrown.
//
// Both chips now refuse to wrap, refuse to shrink, and stand exactly as tall
// as the START button beside them (24px), so the three controls read as one
// rail. The trailing letter-space (0.18em after the last glyph) is taken off
// the end padding so the ink sits centred inside the box rather than pushed.
import fs from 'node:fs';
const f = 'src/ClientPortal.jsx';
let s = fs.readFileSync(f, 'utf8');
const rep = (a, b, l) => { const n = s.split(a).length - 1; if (n !== 1) throw new Error(l + ' x' + n); s = s.replace(a, b); console.log('ok', l); };

rep(
  `{done && <span title="Completed this week" style={{display:'inline-flex',alignItems:'center',justifyContent:'center',lineHeight:1,padding:'5px 10px',border:\`1px solid \${C.gn}\`,color:C.gn,fontFamily:FN,fontSize:12,fontWeight:700,flexShrink:0}}>✓</span>}`,
  `{done && <span title="Completed this week" style={{display:'inline-flex',alignItems:'center',justifyContent:'center',height:24,minWidth:28,boxSizing:'border-box',lineHeight:1,padding:'0 9px',border:\`1px solid \${C.gn}\`,color:C.gn,fontFamily:FN,fontSize:12,fontWeight:700,flexShrink:0,whiteSpace:'nowrap'}}>✓</span>}`,
  'done chip');

rep(
  `{isDailyRoutine && dailyCount > 0 && <span style={{display:'inline-flex',alignItems:'center',lineHeight:1,padding:'3px 7px',border:\`1px solid \${C.ac}\`,color:C.ac,fontFamily:FN,fontSize:8,fontWeight:700,letterSpacing:'0.18em'}}>{dailyCount} LOGGED</span>}`,
  `{isDailyRoutine && dailyCount > 0 && <span style={{display:'inline-flex',alignItems:'center',justifyContent:'center',height:24,boxSizing:'border-box',lineHeight:1,paddingInlineStart:8,paddingInlineEnd:6.5,border:\`1px solid \${C.ac}\`,color:C.ac,fontFamily:FN,fontSize:8,fontWeight:700,letterSpacing:'0.18em',whiteSpace:'nowrap',flexShrink:0}}>{dailyCount} LOGGED</span>}`,
  'logged chip');
fs.writeFileSync(f, s);
