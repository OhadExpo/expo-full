const rep = (src, from, to, n = 1) => { const c = src.split(from).length - 1; if (c !== n) throw new Error(`expected ${n} match(es), got ${c}: ${from.slice(0, 70)}`); return src.split(from).join(to); };
export default (src0) => {
  const crlf = src0.includes(String.fromCharCode(13,10));
  let s = crlf ? src0.split(String.fromCharCode(13,10)).join(String.fromCharCode(10)) : src0;
  // Ohad 2026-09-11: "the heb top menu is not ocd, bad buttons and logo
  // positioning". Measured at 1500: the Hebrew bar was the mirror of the
  // English one EXCEPT a 12px inward shift of everything (logo included) —
  // the logo's marginRight and the right cluster's marginLeft are physical,
  // so in RTL they pushed the wrong way. And every tab box was reserved to
  // its ENGLISH width, so short Hebrew words floated in boxes sized for
  // "CHALLENGES": uneven air, not OCD. Nav tabs now take their natural width
  // in each language (same height, padding and rulings), and the margins are
  // logical.
  for (const k of ['Dashboard', 'Athletes', 'Sessions', 'Review', 'Tasks', 'Billing', 'Incoming', 'Challenges', 'Portal']) {
    s = rep(s, `label:tb('${k}')`, `label:trFn(lang,'${k}')`);
  }
  s = rep(s, `<EXPOMark height={36} onClick={()=>navTo('dashboard')} title="Back to dashboard" style={{flex:"0 0 auto",marginRight:12,cursor:'pointer'}} />`,
    `<EXPOMark height={36} onClick={()=>navTo('dashboard')} title="Back to dashboard" style={{flex:"0 0 auto",marginInlineEnd:12,cursor:'pointer'}} />`);
  s = rep(s, `<div className="hdr-right" style={{flex:"0 0 auto",display:"flex",alignItems:"center",gap:2,marginLeft:12}}>`,
    `<div className="hdr-right" style={{flex:"0 0 auto",display:"flex",alignItems:"center",gap:2,marginInlineStart:12}}>`);
  s = rep(s, `            .hdr-right { position: static !important; right: auto !important;
              margin-left: 8px !important; background: transparent !important;
              box-shadow: none !important; z-index: auto !important; }
          }
          /* ...and at phone width`, `            .hdr-right { position: static !important; right: auto !important;
              margin-inline-start: 8px !important; background: transparent !important;
              box-shadow: none !important; z-index: auto !important; }
          }
          /* ...and at phone width`);
  s = rep(s, `div.hdr-scroll { flex-wrap: nowrap !important; height: 56px !important; overflow-x: auto !important; overflow-y: hidden !important; padding-left: 16px !important; padding-right: 0 !important; }`,
    `div.hdr-scroll { flex-wrap: nowrap !important; height: 56px !important; overflow-x: auto !important; overflow-y: hidden !important; padding-inline-start: 16px !important; padding-inline-end: 0 !important; }`);
  s = rep(s, `div.hdr-scroll > :first-child { position: sticky; left: 0; z-index: 3; background: inherit;
              align-self: stretch; display: flex; align-items: center; padding-right: 12px;`,
    `div.hdr-scroll > :first-child { position: sticky; inset-inline-start: 0; z-index: 3; background: inherit;
              align-self: stretch; display: flex; align-items: center; padding-inline-end: 12px;`);
  s = rep(s, `.hdr-right { flex: 0 0 auto !important; margin-left: 8px !important; padding-right: 16px !important; }`,
    `.hdr-right { flex: 0 0 auto !important; margin-inline-start: 8px !important; padding-inline-end: 16px !important; }`);
  s = rep(s, `          @media (max-width: 760px) {
            .hdr-right { position: static !important; right: auto !important;
              margin-left: 8px !important;`, `          @media (max-width: 760px) {
            .hdr-right { position: static !important; right: auto !important;
              margin-inline-start: 8px !important;`);
  // Hebrew tab labels: Nord's 700 is a display weight; Heebo's 700 reads a
  // notch lighter beside it, and Hebrew is never letter-spaced.
  s = rep(s, `          .nav-item-inactive{transition:color 120ms, background 120ms}`,
    `          [dir="rtl"] nav.hdr-scroll button span{font-weight:800;letter-spacing:0}
          .nav-item-inactive{transition:color 120ms, background 120ms}`);
  return crlf ? s.split(String.fromCharCode(10)).join(String.fromCharCode(13,10)) : s;
};
