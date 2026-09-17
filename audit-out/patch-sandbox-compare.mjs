const rep = (src, from, to, n = 1) => { const c = src.split(from).length - 1; if (c !== n) throw new Error(`expected ${n} match(es), got ${c}: ${from.slice(0, 70)}`); return src.split(from).join(to); };
export default (src0) => {
  const crlf = src0.includes(String.fromCharCode(13,10));
  let s = crlf ? src0.split(String.fromCharCode(13,10)).join(String.fromCharCode(10)) : src0;
  // Parity (09-11): the review's compare mode got ONE transport for both
  // videos (play both · pause · step · speed · loop · sync) and centred titles.
  // The sandbox's step 4 is the public demo of that feature, so it shows the
  // same bar once the second clip is loaded.
  s = rep(s, `function SandboxPlayer({ url, exerciseTitle, compact = false }) {
  const videoRef = useRef(null);`, `function SandboxPlayer({ url, exerciseTitle, compact = false, onVideoRef }) {
  const videoRef = useRef(null);
  useEffect(() => { onVideoRef?.(videoRef.current); return () => onVideoRef?.(null); }, [url]); // eslint-disable-line react-hooks/exhaustive-deps`);

  s = rep(s, `function CompareStep({ pov, exercise, primaryUrl, secondUrl, onUploadSecond, onBack, hideEndCTA }) {
  const inputRef = useRef(null);`, `function CompareStep({ pov, exercise, primaryUrl, secondUrl, onUploadSecond, onBack, hideEndCTA }) {
  const inputRef = useRef(null);
  const [leftVid, setLeftVid] = useState(null);
  const [rightVid, setRightVid] = useState(null);`);

  s = rep(s, `          <div style={{ fontFamily:FN, fontSize:11, color: C.tm, letterSpacing:1.5, fontWeight:700, marginBottom:8 }}>
            CLIP 1 · YOUR FIRST UPLOAD
          </div>
          <SandboxPlayer url={primaryUrl} exerciseTitle={exercise?.sample || ''} compact />`,
  `          <div style={{ fontFamily:FN, fontSize:11, color: C.tm, letterSpacing:1.5, fontWeight:700, marginBottom:8, textAlign:'center' }}>
            CLIP 1 · YOUR FIRST UPLOAD
          </div>
          <SandboxPlayer url={primaryUrl} exerciseTitle={exercise?.sample || ''} compact onVideoRef={setLeftVid} />`);
  s = rep(s, `          <div style={{ fontFamily:FN, fontSize:11, color: C.tm, letterSpacing:1.5, fontWeight:700, marginBottom:8 }}>
            CLIP 2 · ANOTHER ATTEMPT
          </div>
          {secondUrl ? (
            <SandboxPlayer url={secondUrl} exerciseTitle={exercise?.sample || ''} compact />`,
  `          <div style={{ fontFamily:FN, fontSize:11, color: C.tm, letterSpacing:1.5, fontWeight:700, marginBottom:8, textAlign:'center' }}>
            CLIP 2 · ANOTHER ATTEMPT
          </div>
          {secondUrl ? (
            <SandboxPlayer url={secondUrl} exerciseTitle={exercise?.sample || ''} compact onVideoRef={setRightVid} />`);

  s = rep(s, `      {!hideEndCTA && <NextStepPanel pov={pov} exercise={exercise} />}

      <div style={{
        marginTop: 22, display:'flex', gap: 10, flexWrap:'wrap', justifyContent:'center',
      }}>
        <button onClick={onBack} style={{`,
  `      {secondUrl && <BothTransport left={leftVid} right={rightVid} />}

      {!hideEndCTA && <NextStepPanel pov={pov} exercise={exercise} />}

      <div style={{
        marginTop: 22, display:'flex', gap: 10, flexWrap:'wrap', justifyContent:'center',
      }}>
        <button onClick={onBack} style={{`);

  s = rep(s, `// ─── The actual video player with pose + rep overlays ────────────────────`,
  `// ─── One transport for both clips (parity with the review's compare mode) ──
function BothTransport({ left, right }) {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeedState] = useState(1);
  const [loop, setLoopState] = useState(false);
  const vids = () => [left, right].filter(Boolean);
  const playBoth = () => { vids().forEach(v => { v.playbackRate = speed; v.loop = loop; v.play().catch(() => {}); }); };
  const pauseBoth = () => { vids().forEach(v => v.pause()); };
  const toggle = () => (playing ? pauseBoth() : playBoth());
  const stepBoth = (dir) => { vids().forEach(v => { v.pause(); v.currentTime = Math.max(0, v.currentTime + dir / 30); }); };
  const setSpeed = (x) => { setSpeedState(x); vids().forEach(v => { v.playbackRate = x; }); };
  const setLoop = () => { const next = !loop; setLoopState(next); vids().forEach(v => { v.loop = next; }); };
  const sync = (target) => {
    if (!left || !right) return;
    if (target === 'right') right.currentTime = left.currentTime; else left.currentTime = right.currentTime;
  };
  useEffect(() => {
    const list = vids(); if (!list.length) return undefined;
    const upd = () => setPlaying(list.some(v => !v.paused && !v.ended));
    list.forEach(v => { v.addEventListener('play', upd); v.addEventListener('pause', upd); v.addEventListener('ended', upd); });
    upd();
    return () => list.forEach(v => { v.removeEventListener('play', upd); v.removeEventListener('pause', upd); v.removeEventListener('ended', upd); });
  }, [left, right]); // eslint-disable-line react-hooks/exhaustive-deps
  const bar = { display:'inline-flex', alignItems:'center', border:\`1px solid \${C.bd}\`, borderRadius:0, background:'var(--c-sf)', maxWidth:'100%', overflowX:'auto' };
  const btn = (active, extra = {}) => ({ height:30, padding:'0 12px', boxSizing:'border-box', border:'none', borderRadius:0, background: active ? \`\${C.ac}1f\` : 'transparent', color: active ? C.ac : C.tm, fontFamily:FN, fontSize:10, fontWeight:700, letterSpacing:'0.12em', cursor:'pointer', display:'inline-flex', alignItems:'center', justifyContent:'center', whiteSpace:'nowrap', ...extra });
  const divider = { width:1, alignSelf:'stretch', background:C.bd, flex:'0 0 1px' };
  return (
    <div style={{ display:'flex', justifyContent:'center', marginTop:16 }}>
      <div style={bar} role="toolbar" aria-label="Both clips">
        <button onClick={() => stepBoth(-1)} title="Both back one frame" style={btn(false)}>◀</button>
        <button onClick={toggle} title={playing ? 'Pause both' : 'Play both'} style={btn(playing, { minWidth: 118 })}>{playing ? '❚❚  PAUSE' : '▶  PLAY BOTH'}</button>
        <button onClick={() => stepBoth(1)} title="Both forward one frame" style={btn(false)}>▶</button>
        <span style={divider} />
        {[0.125, 0.25, 0.5, 1, 2].map(x => (
          <button key={x} onClick={() => setSpeed(x)} title={\`Both at \${x}x\`} style={btn(speed === x, { padding:'0 10px' })}>{x}x</button>
        ))}
        <span style={divider} />
        <button onClick={setLoop} title="Loop both" style={btn(loop)}>↻ LOOP</button>
        <span style={divider} />
        <button onClick={() => sync('right')} title="Clip 2 jumps to clip 1's frame" style={btn(false)}>SYNC →</button>
        <button onClick={() => sync('left')} title="Clip 1 jumps to clip 2's frame" style={btn(false)}>← SYNC</button>
      </div>
    </div>
  );
}

// ─── The actual video player with pose + rep overlays ────────────────────`);
  return crlf ? s.split(String.fromCharCode(10)).join(String.fromCharCode(13,10)) : s;
};
