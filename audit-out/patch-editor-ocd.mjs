const rep = (src, from, to, n = 1) => { const c = src.split(from).length - 1; if (c !== n) throw new Error(`expected ${n} match(es), got ${c}: ${from.slice(0, 70)}`); return src.split(from).join(to); };
export default (src0) => {
  const crlf = src0.includes(String.fromCharCode(13,10));
  let s = crlf ? src0.split(String.fromCharCode(13,10)).join(String.fromCharCode(10)) : src0;
  // Ohad 2026-09-12 (screenshot of the live editor): "portal and delete buttons
  // and portal overview etc (buttons) all needs to be the same vertical height".
  // Measured on production: athlete/block selects + SAVE PROGRAM 42px, PORTAL /
  // OVERVIEW / MORE / PORTAL-toggle / DELETE 38px, UNDO / REDO 24px. One height: 42.
  s = rep(s, `height:38,padding:'0 13px',lineHeight:'38px'`, `height:42,padding:'0 13px',lineHeight:'42px'`, 3);
  s = rep(s, `height: 38, padding: '0 13px', lineHeight: '38px'`, `height: 42, padding: '0 13px', lineHeight: '42px'`);
  s = rep(s, `borderRadius:0, height:38, padding:'0 13px', display:'inline-flex', alignItems:'center', gap:8, cursor:'pointer'}}`, `borderRadius:0, height:42, padding:'0 13px', display:'inline-flex', alignItems:'center', gap:8, cursor:'pointer'}}`);
  s = rep(s, `padding:'0 10px',height:24,borderRadius:0,fontFamily:FN,fontSize:10`, `padding:'0 12px',height:42,borderRadius:0,fontFamily:FN,fontSize:10`, 2);
  // "grp on the left doesn't fit the box size and text cannot be seen": the
  // superset letter select had 56px with a 30px chevron gutter — 20px for a
  // bold letter. Explicit width and gutter now.
  s = rep(s, `fontWeight: ex.superset ? 800 : 600, height:24, minHeight:24, padding:'0 6px', boxSizing:'border-box'`, `fontWeight: ex.superset ? 800 : 600, height:24, minHeight:24, width:64, minWidth:64, padding:'0 22px 0 8px', boxSizing:'border-box'`);
  // "the share button next to expand all is not vertically and horizontally
  // centered": the ⤴ glyph comes from a fallback font and sits high-left in
  // its 28×24 box. An inline SVG arrow is centred by flex, exactly.
  const svg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 17L17 7"/><path d="M9 7h8v8"/></svg>`;
  s = rep(s, `display:'inline-flex',alignItems:'center',justifyContent:'center',padding:0}}>⤴</button>}`, `display:'inline-flex',alignItems:'center',justifyContent:'center',padding:0}}>${svg}</button>}`);
  s = rep(s, `display:'inline-flex', alignItems:'center', justifyContent:'center', padding:0 }}>⤴</button>}`, `display:'inline-flex', alignItems:'center', justifyContent:'center', padding:0 }}>${svg}</button>}`);
  return crlf ? s.split(String.fromCharCode(10)).join(String.fromCharCode(13,10)) : s;
};
