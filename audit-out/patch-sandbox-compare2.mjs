const rep = (src, from, to, n = 1) => { const c = src.split(from).length - 1; if (c !== n) throw new Error(`expected ${n} match(es), got ${c}: ${from.slice(0, 70)}`); return src.split(from).join(to); };
export default (src0) => {
  const crlf = src0.includes(String.fromCharCode(13,10));
  let s = crlf ? src0.split(String.fromCharCode(13,10)).join(String.fromCharCode(10)) : src0;
  // In step 4 the shared bar owns the speed; each player's own SPEED row goes
  // (as the review's compare mode does), the POSE/REPS toggles stay.
  s = rep(s, `function SandboxPlayer({ url, exerciseTitle, compact = false, onVideoRef }) {`, `function SandboxPlayer({ url, exerciseTitle, compact = false, onVideoRef, compare = false }) {`);
  s = rep(s, `        <div style={{ display:'flex', gap:4, alignItems:'center' }}>
          <span style={{ fontFamily:FN, fontSize:10, color:C.td, letterSpacing:1.5, fontWeight:700 }}>SPEED</span>`,
  `        <div style={{ display: compare ? 'none' : 'flex', gap:4, alignItems:'center' }}>
          <span style={{ fontFamily:FN, fontSize:10, color:C.td, letterSpacing:1.5, fontWeight:700 }}>SPEED</span>`);
  s = rep(s, `<SandboxPlayer url={primaryUrl} exerciseTitle={exercise?.sample || ''} compact onVideoRef={setLeftVid} />`, `<SandboxPlayer url={primaryUrl} exerciseTitle={exercise?.sample || ''} compact onVideoRef={setLeftVid} compare={!!secondUrl} />`);
  s = rep(s, `<SandboxPlayer url={secondUrl} exerciseTitle={exercise?.sample || ''} compact onVideoRef={setRightVid} />`, `<SandboxPlayer url={secondUrl} exerciseTitle={exercise?.sample || ''} compact onVideoRef={setRightVid} compare />`);
  return crlf ? s.split(String.fromCharCode(10)).join(String.fromCharCode(13,10)) : s;
};
