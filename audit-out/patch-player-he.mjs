const rep = (src, from, to, n = 1) => { const c = src.split(from).length - 1; if (c !== n) throw new Error(`expected ${n} match(es), got ${c}: ${from.slice(0, 70)}`); return src.split(from).join(to); };
export default (src0) => {
  const crlf = src0.includes(String.fromCharCode(13,10));
  let s = crlf ? src0.split(String.fromCharCode(13,10)).join(String.fromCharCode(10)) : src0;
  // The player's own toggles were the last English on the Hebrew review page
  // (and inside the compare modal). tt is in scope: FormVideoPlayerImpl line ~151.
  s = rep(s, `{poseLoading ? 'LOADING…' : poseOn ? 'SKELETON ON' : 'SKELETON'}`, `{poseLoading ? tt('LOADING…') : poseOn ? tt('SKELETON ON') : tt('SKELETON')}`);
  s = rep(s, "{repsOn ? `REPS ${reps}` : 'REPS'}", "{repsOn ? `${tt('REPS')} ${reps}` : tt('REPS')}");
  s = rep(s, `fontFamily:FN,fontSize:10,cursor:'pointer'}}>⛶ FULL</button>`, `fontFamily:FN,fontSize:10,cursor:'pointer'}}>⛶ {tt('FULL')}</button>`);
  return crlf ? s.split(String.fromCharCode(10)).join(String.fromCharCode(13,10)) : s;
};
