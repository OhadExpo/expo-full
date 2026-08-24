// ShotAnalyzer.jsx — Basketball Shot Analyzer (Review › Tools).
// Record or upload a jump shot → MediaPipe pose on every frame → phase
// detection (STANCE · DIP · SET · RELEASE · APEX · FOLLOW · LAND) → frame-by-
// frame player with skeleton overlay + metric readout → checkpoint scorecard
// → FIX GUIDE (what / why / how). Engine: shotAnalysis.js (pure, tested).
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { C, FN, FB } from './theme';
import { toast } from './ui';
import { captureShotFrames } from './shotCapture';
import { getCamera, stopStream } from './usePose';
import { analyzeShotClip, frameReadout, CHECKPOINTS, SHOT_TYPES } from './shotAnalysis';

const STATUS = {
  ok:    { label: 'OK',    color: 'var(--c-gn, #2ED573)' },
  watch: { label: 'WATCH', color: 'var(--c-or, #FFA502)' },
  fix:   { label: 'FIX',   color: 'var(--c-rd, #FF4757)' },
  na:    { label: 'N/A',   color: 'rgba(255,255,255,0.35)' },
};
const BONES = [[11, 13], [13, 15], [12, 14], [14, 16], [11, 12], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28], [27, 31], [28, 32]];
const SAVE_KEY = 'expo-shot-analyses';

const stage = { position: 'fixed', inset: 0, background: '#000', zIndex: 1500, display: 'flex', flexDirection: 'column', color: '#FFF', fontFamily: FB };
const ghost = { background: 'transparent', border: '1px solid rgba(255,255,255,0.3)', color: '#FFF', fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', padding: '9px 16px', cursor: 'pointer', borderRadius: 0 };
const chip = (active) => ({ ...ghost, padding: '5px 10px', fontSize: 10, letterSpacing: '0.12em', borderColor: active ? C.ac : 'rgba(255,255,255,0.25)', color: active ? C.ac : '#FFF', background: active ? 'rgba(57,189,255,0.10)' : 'transparent' });
const big = (color) => ({ flex: 1, padding: 14, background: color, border: `1px solid ${color}`, color: '#06131b', fontFamily: FN, fontSize: 14, fontWeight: 700, letterSpacing: '0.14em', cursor: 'pointer', borderRadius: 0 });
const lbl = { fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.16em', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' };
const fmt = (v, d = 0) => (v == null || !Number.isFinite(v) ? '—' : v.toFixed(d));

// Input is CAMERA or GALLERY only (Ohad): no reviewed/uploaded EXPO clips are
// ever fed in — this tool is a standalone shooting lab.
export default function ShotAnalyzer({ onClose, toolLabel = 'SHOT ANALYZER', demoResult = null }) {
  const [phase, setPhase] = useState(demoResult ? 'results' : 'idle'); // idle | recording | analyzing | results
  const [hand, setHand] = useState('R');
  const [shotType, setShotType] = useState('mid');
  const [stature, setStature] = useState('');
  const [progressLabel, setProgressLabel] = useState('');
  const [srcUrl, setSrcUrl] = useState(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(demoResult);
  const [shotIdx, setShotIdx] = useState(0);
  const framesRef = useRef(demoResult?.frames || null);
  const fileRef = useRef(null);
  const streamRef = useRef(null);
  const recRef = useRef(null);
  const chunksRef = useRef([]);
  const liveRef = useRef(null);

  useEffect(() => () => { stopStream(streamRef.current); }, []);

  const analyze = useCallback(async (url, opts = {}) => {
    setError(null); setPhase('analyzing'); setProgress(0); setProgressLabel('');
    try {
      // Two-pass ROI capture: find the athlete, then re-run pose on a crop
      // around him at the source frame cadence inside each shot window.
      const frames = await captureShotFrames(url, { onProgress: (pct, label) => { setProgress(pct); if (label) setProgressLabel(label); } });
      framesRef.current = frames;
      const r = analyzeShotClip(frames, { hand: opts.hand || hand, statureCm: Number(opts.stature ?? stature) || null, shotType: opts.shotType || shotType });
      if (!r.ok) { setError(r.error); setPhase('idle'); return; }
      setResult(r); setShotIdx(0); setPhase('results');
    } catch (e) {
      setError(e?.message || 'Analysis failed.'); setPhase('idle');
    }
  }, [hand, stature, shotType]);

  // Re-score the SAME frames when the hand / stature changes after analysis —
  // no re-capture needed.
  const rescore = (h, st, type) => {
    const frames = framesRef.current; if (!frames) return;
    const r = analyzeShotClip(frames, { hand: h, statureCm: Number(st) || null, shotType: type || shotType });
    if (r.ok) { setResult(r); } else toast(r.error, 'error');
  };

  const pickFile = () => fileRef.current?.click();
  const onFile = (f) => { if (!f) return; const url = URL.createObjectURL(f); setSrcUrl(url); analyze(url); };

  const startRecording = async () => {
    setError(null);
    try {
      const stream = await getCamera('environment');
      streamRef.current = stream;
      setPhase('recording');
      setTimeout(() => { if (liveRef.current) { liveRef.current.srcObject = stream; liveRef.current.play().catch(() => {}); } }, 50);
      chunksRef.current = [];
      const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'video/webm' });
        stopStream(streamRef.current); streamRef.current = null;
        const url = URL.createObjectURL(blob); setSrcUrl(url); analyze(url);
      };
      recRef.current = rec; rec.start(200);
    } catch (e) { setError('Camera unavailable: ' + (e?.message || e)); setPhase('idle'); }
  };
  const stopRecording = () => { try { recRef.current?.stop(); } catch { /* noop */ } };
  const reset = () => { setResult(null); setPhase('idle'); setError(null); setSrcUrl(null); framesRef.current = null; };

  const shot = result?.shots?.[shotIdx] || null;

  return (
    <div style={stage}>
      {/* top bar */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.12)', background: 'rgba(0,0,0,0.92)', flexWrap: 'wrap' }}>
        <button onClick={onClose} style={ghost}>← BACK</button>
        <div style={{ fontFamily: FN, fontSize: 13, fontWeight: 700, letterSpacing: '0.18em', color: C.ac }}>{toolLabel}</div>
        <div style={{ flex: 1 }} />
        <span style={lbl}>Shooting hand</span>
        {['R', 'L'].map((h) => <button key={h} onClick={() => { setHand(h); if (phase === 'results') rescore(h, stature, shotType); }} style={chip(hand === h)}>{h === 'R' ? 'RIGHT' : 'LEFT'}</button>)}
        <span style={{ ...lbl, marginLeft: 10 }}>Shot</span>
        {SHOT_TYPES.map((t) => <button key={t.key} onClick={() => { setShotType(t.key); if (phase === 'results') rescore(hand, stature, t.key); }} style={chip(shotType === t.key)} title={`Release-angle band for a ${t.label.toLowerCase()}`}>{t.label.toUpperCase()}</button>)}
        <span style={{ ...lbl, marginLeft: 10 }}>Height</span>
        <input value={stature} onChange={(e) => setStature(e.target.value)} onBlur={() => { if (phase === 'results') rescore(hand, stature, shotType); }} placeholder="cm" inputMode="numeric"
          style={{ width: 56, background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.35)', color: '#FFF', fontFamily: FN, fontSize: 12, padding: '4px 2px', textAlign: 'center', outline: 'none' }} />
      </div>

      {/* body */}
      {phase === 'idle' && (
        <div style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ maxWidth: 720, width: '100%' }}>
            <div style={{ fontFamily: FN, fontSize: 22, fontWeight: 700, letterSpacing: '0.06em', marginBottom: 6 }}>Analyse a jump shot, frame by frame.</div>
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, lineHeight: 1.6, marginBottom: 18 }}>
              EXPO tracks the body on every frame, finds the dip, set point, release, jump apex and follow-through, scores 10 mechanical checkpoints, and writes the fix guide — what to change, why it matters, how to train it.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginBottom: 18 }}>
              {[['SIDE VIEW', 'Film from the shooting-arm side, camera at chest height, 4–6 m away.'], ['WHOLE BODY', 'Feet to fingertips in frame through the release and the follow-through.'], ['ONE SHOT PER CLIP', 'Several shots in one clip are fine — each is scored and compared for consistency.'], ['60 FPS IF YOU CAN', 'Slow-mo / 60 fps gives sharper release timing. Steady phone, good light.']].map(([h, t]) => (
                <div key={h} style={{ border: '1px solid rgba(255,255,255,0.15)', padding: '10px 12px' }}>
                  <div style={{ ...lbl, color: C.ac, marginBottom: 4 }}>{h}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', lineHeight: 1.45 }}>{t}</div>
                </div>
              ))}
            </div>
            {error && <div style={{ border: '1px solid rgba(255,71,87,0.6)', color: '#FF7B86', padding: '10px 12px', fontSize: 13, marginBottom: 14 }}>⚠ {error}</div>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={startRecording} style={big(C.ac)}>RECORD →</button>
              <button onClick={pickFile} style={{ ...big('transparent'), color: '#FFF', border: '1px solid rgba(255,255,255,0.4)' }}>FROM GALLERY</button>
            </div>
          </div>
        </div>
      )}

      {phase === 'recording' && (
        <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column' }}>
          <video ref={liveRef} muted playsInline style={{ flex: 1, width: '100%', objectFit: 'contain', background: '#000' }} />
          <div style={{ flexShrink: 0, padding: 14, display: 'flex', gap: 10, background: 'rgba(0,0,0,0.9)' }}>
            <button onClick={stopRecording} style={big('var(--c-rd, #FF4757)')}>STOP &amp; ANALYSE</button>
          </div>
        </div>
      )}

      {phase === 'analyzing' && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
          <div style={{ fontFamily: FN, fontSize: 13, letterSpacing: '0.18em', fontWeight: 700 }}>{(progressLabel || 'reading the shot').toUpperCase()}…</div>
          <div style={{ width: 220, height: 4, background: 'rgba(255,255,255,0.15)', marginTop: 16 }}><div style={{ width: `${progress}%`, height: '100%', background: C.ac, transition: 'width 120ms' }} /></div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 8, fontFamily: FN, letterSpacing: '0.12em' }}>{progress}%</div>
        </div>
      )}

      {phase === 'results' && result && shot && (
        <ShotResults result={result} shot={shot} shotIdx={shotIdx} setShotIdx={setShotIdx} srcUrl={srcUrl} frames={framesRef.current} hand={hand} onReset={reset} />
      )}

      <input ref={fileRef} type="file" accept="video/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; onFile(f); }} />
    </div>
  );
}

// ------------------------------------------------------------------ results
function ShotResults({ result, shot, shotIdx, setShotIdx, srcUrl, frames, hand, onReset }) {
  const { series } = result;
  const n = series.n;
  const [cur, setCur] = useState(shot.cycle.release);
  const [playing, setPlaying] = useState(false);
  // Which MOMENT of the shot the coach is looking at. Switching shots keeps
  // the same moment (follow-through → follow-through), never jumps back to
  // the release.
  const [phaseKey, setPhaseKey] = useState('release');
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const [openGuide, setOpenGuide] = useState(() => new Set(shot.checks.filter((c) => c.status === 'fix').map((c) => c.key)));

  useEffect(() => {
    const p = shot.phases.find((x) => x.key === phaseKey);
    const target = p ? p.idx : shot.cycle.release;
    setCur(target); seekTo(target);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [shotIdx]);

  const nearestIdx = (tMs) => { const t = series.tMs; let lo = 0, hi = t.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (t[m] < tMs) lo = m + 1; else hi = m; } if (lo > 0 && Math.abs(t[lo - 1] - tMs) < Math.abs(t[lo] - tMs)) lo--; return lo; };
  const seekTo = (i) => { const v = videoRef.current; const ii = Math.max(0, Math.min(n - 1, i)); setCur(ii); if (v) { try { v.pause(); v.currentTime = series.tMs[ii] / 1000; } catch { /* noop */ } } };
  const step = (d) => seekTo(cur + d);

  // Follow playback → overlay follows the nearest captured frame.
  useEffect(() => {
    const v = videoRef.current; if (!v) return;
    let raf = 0; let alive = true;
    const tick = () => { if (!alive) return; if (!v.paused && !v.ended) setCur(nearestIdx(v.currentTime * 1000)); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    const onP = () => setPlaying(true), onS = () => setPlaying(false);
    v.addEventListener('play', onP); v.addEventListener('pause', onS); v.addEventListener('ended', onS);
    return () => { alive = false; cancelAnimationFrame(raf); v.removeEventListener('play', onP); v.removeEventListener('pause', onS); v.removeEventListener('ended', onS); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [srcUrl]);

  // Redraw the overlay whenever the video box RESIZES — the canvas backing
  // store must match its CSS box or the skeleton draws at the wrong scale and
  // sits off the body (that was the misalignment Ohad saw).
  const [boxTick, setBoxTick] = useState(0);
  useEffect(() => {
    const wrap = wrapRef.current; if (!wrap || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setBoxTick((t) => t + 1));
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  // Skeleton overlay — mapped onto the video's CONTENT box (object-fit contain),
  // in CSS pixels, with a devicePixelRatio-scaled backing store.
  useEffect(() => {
    const cv = canvasRef.current, v = videoRef.current, wrap = wrapRef.current;
    if (!cv || !wrap) return;
    const rect = wrap.getBoundingClientRect();
    const W = Math.max(1, Math.round(rect.width)), H = Math.max(1, Math.round(rect.height));
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const f = frames?.[cur]; if (!f?.landmarks) return;
    const vw = v?.videoWidth || (result?.aspect ? result.aspect * 1000 : 16), vh = v?.videoHeight || 1000;
    const s = Math.min(W / vw, H / vh); const cw = vw * s, ch = vh * s; const ox = (W - cw) / 2, oy = (H - ch) / 2;
    const X = (p) => ox + p.x * cw, Y = (p) => oy + p.y * ch;
    const lm = f.landmarks;
    ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(57,189,255,0.9)'; ctx.lineCap = 'round';
    for (const [a, b] of BONES) { const p = lm[a], q = lm[b]; if (!p || !q) continue; if ((p.visibility ?? 1) < 0.3 || (q.visibility ?? 1) < 0.3) continue; ctx.beginPath(); ctx.moveTo(X(p), Y(p)); ctx.lineTo(X(q), Y(q)); ctx.stroke(); }
    const arm = hand === 'L' ? [11, 13, 15] : [12, 14, 16];
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.moveTo(X(lm[arm[0]]), Y(lm[arm[0]])); ctx.lineTo(X(lm[arm[1]]), Y(lm[arm[1]])); ctx.lineTo(X(lm[arm[2]]), Y(lm[arm[2]])); ctx.stroke();
    for (let i = 11; i <= 28; i++) { const p = lm[i]; if (!p || (p.visibility ?? 1) < 0.3) continue; ctx.fillStyle = arm.includes(i) ? '#FFFFFF' : C.ac; ctx.beginPath(); ctx.arc(X(p), Y(p), 3.5, 0, Math.PI * 2); ctx.fill(); }
    // eye line
    const eye = lm[hand === 'L' ? 2 : 5]; if (eye) { ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(ox, Y(eye)); ctx.lineTo(ox + cw, Y(eye)); ctx.stroke(); ctx.setLineDash([]); }
  }, [cur, frames, hand, srcUrl, boxTick]);

  const rd = frameReadout(series, cur);
  const phaseAt = shot.phases.find((p) => p.idx === cur);
  const tMs = series.tMs[cur];
  const sc = STATUS[shot.score == null ? 'na' : shot.score >= 80 ? 'ok' : shot.score >= 60 ? 'watch' : 'fix'];
  const fixes = shot.checks.filter((c) => c.status === 'fix'), watches = shot.checks.filter((c) => c.status === 'watch');

  const save = () => {
    try {
      const all = JSON.parse(localStorage.getItem(SAVE_KEY) || '[]');
      all.unshift({ date: new Date().toISOString(), hand, score: shot.score, shots: result.shots.length, checks: shot.checks.map((c) => ({ key: c.key, value: c.value, status: c.status })), info: shot.info });
      localStorage.setItem(SAVE_KEY, JSON.stringify(all.slice(0, 50)));
      toast('Shot analysis saved', 'success');
    } catch { toast('Could not save', 'error'); }
  };
  const copySummary = async () => {
    const lines = [`EXPO Shot Analyzer — score ${shot.score ?? '—'}/100 (${hand === 'L' ? 'left' : 'right'} hand)`];
    for (const c of shot.checks) lines.push(`${STATUS[c.status].label.padEnd(5)} ${c.label}: ${c.display} (target ${c.target})`);
    if (fixes.length) { lines.push('', 'FIX FIRST:'); for (const c of fixes) { lines.push(`• ${c.label} — ${c.why}`); for (const h of c.how) lines.push(`   - ${h}`); } }
    try { await navigator.clipboard.writeText(lines.join('\n')); toast('Summary copied', 'success'); } catch { toast('Copy failed', 'error'); }
  };

  return (
    <div style={{ flex: 1, overflow: 'auto', WebkitOverflowScrolling: 'touch' }} data-allow-copy>
      <style>{`@media print { .shot-noprint{display:none!important} .shot-print{padding:0!important} }`}</style>
      <div className="shot-print" style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', maxWidth: 1440, margin: '0 auto', padding: 16 }}>
        {/* LEFT — player */}
        <div style={{ flex: '1 1 420px', minWidth: 300, maxWidth: 640, position: 'sticky', top: 0 }}>
          <div ref={wrapRef} style={{ position: 'relative', width: '100%', aspectRatio: result.aspect ? `${result.aspect}` : '16/9', background: '#000', border: '1px solid rgba(255,255,255,0.15)' }}>
            {srcUrl ? <video ref={videoRef} src={srcUrl} muted playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} onLoadedMetadata={() => seekTo(cur)} />
              : <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.4)', fontFamily: FN, fontSize: 11, letterSpacing: '0.14em' }}>POSE TRACK</div>}
            <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
            {phaseAt && <div style={{ position: 'absolute', top: 8, left: 8, background: 'rgba(0,0,0,0.7)', border: `1px solid ${C.ac}`, color: C.ac, fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', padding: '3px 8px' }}>{phaseAt.label}</div>}
            <div style={{ position: 'absolute', bottom: 8, right: 8, background: 'rgba(0,0,0,0.7)', fontFamily: FN, fontSize: 10, letterSpacing: '0.08em', padding: '3px 8px', color: 'rgba(255,255,255,0.8)' }}>F{cur + 1}/{n} · {fmt(tMs / 1000, 2)}s</div>
          </div>
          {/* transport */}
          <div className="shot-noprint" style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
            <button onClick={() => step(-10)} style={chip(false)} title="Back 10 frames">«10</button>
            <button onClick={() => step(-1)} style={chip(false)} title="Previous frame">‹ 1</button>
            <button onClick={() => { const v = videoRef.current; if (!v) return; if (v.paused) { v.play().catch(() => {}); } else v.pause(); }} style={chip(playing)}>{playing ? '❚❚' : '▶'}</button>
            <button onClick={() => step(1)} style={chip(false)} title="Next frame">1 ›</button>
            <button onClick={() => step(10)} style={chip(false)} title="Forward 10 frames">10»</button>
            <input type="range" min={0} max={n - 1} value={cur} onChange={(e) => seekTo(Number(e.target.value))} style={{ flex: 1, minWidth: 120, accentColor: '#39BDFF' }} />
          </div>
          <div className="shot-noprint" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            {shot.phases.map((p) => <button key={p.key} onClick={() => { setPhaseKey(p.key); seekTo(p.idx); }} style={chip(cur === p.idx)} title={`Jump to ${p.label.toLowerCase()} — stays on this moment when you switch shots`}>{p.label}</button>)}
          </div>
          {/* per-frame readout */}
          <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))', gap: 6 }}>
            {[['Knee', fmt(rd.knee) + '°'], ['Hip', fmt(rd.hip) + '°'], ['Elbow', fmt(rd.elbow) + '°'], ['Arm elev.', fmt(rd.shoulder) + '°'], ['Forearm ∠', fmt(rd.forearm) + '°'], ['Trunk lean', fmt(rd.trunk) + '°'], ['Wrist vs eye', (rd.wristEye == null ? '—' : (rd.wristEye >= 0 ? '+' : '') + fmt(rd.wristEye, 2))], ['Elbow offset', fmt(rd.wristElbowX, 2)]].map(([k, v]) => (
              <div key={k} style={{ border: '1px solid rgba(255,255,255,0.12)', padding: '6px 8px' }}>
                <div style={lbl}>{k}</div>
                <div style={{ fontFamily: FN, fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
              </div>
            ))}
          </div>
          <Timeline series={series} shot={shot} cur={cur} onSeek={seekTo} />
        </div>

        {/* RIGHT — score, scorecard, guide */}
        <div style={{ flex: '1 1 420px', minWidth: 300 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 12 }}>
            <div style={{ width: 84, height: 84, borderRadius: '50%', border: `4px solid ${sc.color}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <div style={{ fontFamily: FN, fontSize: 26, fontWeight: 700, lineHeight: 1 }}>{shot.score ?? '—'}</div>
              <div style={{ ...lbl, fontSize: 8 }}>/ 100</div>
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontFamily: FN, fontSize: 16, fontWeight: 700, letterSpacing: '0.06em' }}>
                {shot.score == null ? 'Shot read' : shot.score >= 80 ? 'Clean mechanics' : shot.score >= 60 ? 'Solid base — a few things to tighten' : 'Rebuild the chain from the legs up'}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, marginTop: 3, lineHeight: 1.5 }}>
                {fixes.length} to fix · {watches.length} to watch · {shot.checks.length - fixes.length - watches.length} OK · tracking {result.quality} ({Math.round((result.coverage || 0) * 100)}% of shot frames) · {result.fps} fps
              </div>
              {result.shots.length > 1 && (
                <div className="shot-noprint" style={{ marginTop: 8 }}>
                  {/* WHICH SHOT AM I LOOKING AT — a clip can hold many shots; the
                      scorecard below is ALWAYS the selected one, the session
                      panel underneath is all of them. */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={() => setShotIdx((i) => Math.max(0, i - 1))} disabled={shotIdx === 0} style={{ ...chip(false), opacity: shotIdx === 0 ? 0.35 : 1 }}>&lsaquo;</button>
                    <span style={{ fontFamily: FN, fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', color: C.ac }}>SHOT {shot.index} / {result.shots.length}</span>
                    <span style={{ ...lbl, letterSpacing: '0.06em' }}>at {fmt(series.tMs[shot.cycle.release] / 1000, 1)}s</span>
                    <button onClick={() => setShotIdx((i) => Math.min(result.shots.length - 1, i + 1))} disabled={shotIdx === result.shots.length - 1} style={{ ...chip(false), opacity: shotIdx === result.shots.length - 1 ? 0.35 : 1 }}>&rsaquo;</button>
                    <div style={{ flex: 1 }} />
                    <span style={{ ...lbl, letterSpacing: '0.06em' }}>scorecard = this shot · session = all {result.shots.length}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                    {result.shots.map((s, i) => {
                      const st = STATUS[s.score == null ? 'na' : s.score >= 80 ? 'ok' : s.score >= 60 ? 'watch' : 'fix'];
                      return <button key={i} onClick={() => setShotIdx(i)} title={`Shot ${s.index} at ${fmt(series.tMs[s.cycle.release] / 1000, 1)}s, score ${s.score ?? '-'}`}
                        style={{ ...chip(i === shotIdx), padding: '4px 8px', borderColor: i === shotIdx ? C.ac : st.color, color: i === shotIdx ? C.ac : st.color }}>{s.index}</button>;
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* info strip */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 6, marginBottom: 14 }}>
            {[['Dip → release', shot.info.dipToReleaseMs != null ? shot.info.dipToReleaseMs + ' ms' : '—'],
              ['Jump rise', shot.info.jumpRiseCm != null ? shot.info.jumpRiseCm + ' cm' : 'enter height'],
              ['Release height', shot.info.releaseHeightCm != null ? shot.info.releaseHeightCm + ' cm' : (shot.info.releaseHeightRatio != null ? shot.info.releaseHeightRatio + '× eye height' : '—')],
              ['Arm at release', fmt(shot.info.shoulderAtRelease) + '°'],
              ['Chain (from dip)', shot.info.sequenceOrder ? `legs ${shot.info.sequenceOrder.kneeMs} · arm ${shot.info.sequenceOrder.shoulderMs} · elbow ${shot.info.sequenceOrder.elbowMs} ms` : '—'],
              ['Tracked', shot.info.coverage != null ? Math.round(shot.info.coverage * 100) + '% of frames' : '—']].map(([k, v]) => (
              <div key={k} style={{ border: '1px solid rgba(255,255,255,0.12)', padding: '6px 8px' }}><div style={lbl}>{k}</div><div style={{ fontFamily: FN, fontSize: 14, fontWeight: 700 }}>{v}</div></div>
            ))}
            {result.consistency && <div style={{ border: '1px solid rgba(255,255,255,0.12)', padding: '6px 8px', gridColumn: 'span 2' }}><div style={lbl}>Consistency ({result.consistency.n} shots)</div><div style={{ fontFamily: FN, fontSize: 12, fontWeight: 700 }}>rhythm ±{fmt(result.consistency.rhythmCv)}% · release arm ±{fmt(result.consistency.releaseArmSd, 1)}° · set elbow ±{fmt(result.consistency.setElbowSd, 1)}° · timing ±{fmt(result.consistency.timingSd)} ms</div></div>}
          </div>

          {/* SESSION — every detected shot, scored, so a multi-shot clip is
              never ambiguous: this table IS the whole clip. */}
          {result.shots.length > 1 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ ...lbl, color: C.ac, marginBottom: 6 }}>Session · {result.shots.length} shots detected</div>
              <div style={{ border: '1px solid rgba(255,255,255,0.15)', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: FN, fontSize: 11 }}>
                  <thead><tr>{['#', 'At', 'Score', 'Dip', 'Set', 'Release', 'Timing', 'Fix first'].map((h) => <th key={h} style={{ ...lbl, textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid rgba(255,255,255,0.15)', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {result.shots.map((s, i) => {
                      const st = STATUS[s.score == null ? 'na' : s.score >= 80 ? 'ok' : s.score >= 60 ? 'watch' : 'fix'];
                      const worst = s.checks.find((c) => c.status === 'fix') || s.checks.find((c) => c.status === 'watch');
                      return (
                        <tr key={i} onClick={() => setShotIdx(i)} style={{ cursor: 'pointer', background: i === shotIdx ? 'rgba(57,189,255,0.10)' : 'transparent', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                          <td style={{ padding: '6px 8px', fontWeight: 700, color: i === shotIdx ? C.ac : '#FFF' }}>{s.index}</td>
                          <td style={{ padding: '6px 8px', color: 'rgba(255,255,255,0.7)' }}>{fmt(series.tMs[s.cycle.release] / 1000, 1)}s</td>
                          <td style={{ padding: '6px 8px', fontWeight: 700, color: st.color }}>{s.score ?? '—'}</td>
                          <td style={{ padding: '6px 8px', color: 'rgba(255,255,255,0.8)' }}>{fmt(s.raw.dip)}°</td>
                          <td style={{ padding: '6px 8px', color: 'rgba(255,255,255,0.8)' }}>{fmt(s.raw.setElbow)}°</td>
                          <td style={{ padding: '6px 8px', color: 'rgba(255,255,255,0.8)' }}>{fmt(s.raw.releaseArm)}°</td>
                          <td style={{ padding: '6px 8px', color: 'rgba(255,255,255,0.8)' }}>{s.raw.timing == null ? '—' : (s.raw.timing > 0 ? '+' : '') + Math.round(s.raw.timing) + 'ms'}</td>
                          <td style={{ padding: '6px 8px', color: worst ? STATUS[worst.status].color : 'rgba(255,255,255,0.4)', whiteSpace: 'nowrap' }}>{worst ? worst.label : 'clean'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {/* What repeats across the session is what to coach first. */}
              {(() => {
                const counts = new Map();
                for (const s of result.shots) for (const c of s.checks) if (c.status === 'fix') counts.set(c.label, (counts.get(c.label) || 0) + 1);
                const top = [...counts.entries()].sort((x, y) => y[1] - x[1]).slice(0, 3);
                const scored = result.shots.filter((s) => s.score != null);
                const avg = scored.length ? Math.round(scored.reduce((acc, s) => acc + s.score, 0) / scored.length) : null;
                return (
                  <div style={{ marginTop: 8, fontSize: 12.5, lineHeight: 1.55, color: 'rgba(255,255,255,0.8)' }}>
                    Session average <b style={{ color: '#FFF' }}>{avg == null ? '—' : avg + '/100'}</b>
                    {top.length > 0
                      ? <> · repeats across the session: {top.map(([l, n]) => `${l} (${n}/${result.shots.length})`).join(' · ')}</>
                      : <> · no checkpoint failed on more than one shot.</>}
                  </div>
                );
              })()}
            </div>
          )}

          {/* scorecard */}
          <div style={{ ...lbl, color: C.ac, marginBottom: 6 }}>Checkpoints · shot {shot.index}{result.shots.length > 1 ? ' of ' + result.shots.length : ''}</div>
          <div style={{ border: '1px solid rgba(255,255,255,0.15)' }}>
            {shot.checks.map((c, i) => {
              const st = STATUS[c.status];
              const open = openGuide.has(c.key);
              const phaseKey = { dip: 'dip', setHeight: 'set', setElbow: 'set', elbowAlign: 'set', releaseExt: 'release', releaseArm: 'release', timing: 'release', follow: 'follow', trunk: 'release' }[c.key];
              const ph = shot.phases.find((p) => p.key === phaseKey);
              return (
                <div key={c.key} style={{ borderTop: i ? '1px solid rgba(255,255,255,0.1)' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', cursor: 'pointer' }} onClick={() => setOpenGuide((s) => { const nx = new Set(s); nx.has(c.key) ? nx.delete(c.key) : nx.add(c.key); return nx; })}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: st.color, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: FN, fontSize: 12, fontWeight: 700, letterSpacing: '0.04em' }}>{c.label}</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>{c.target}</div>
                    </div>
                    <div style={{ fontFamily: FN, fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{c.display}</div>
                    <span style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', color: st.color, border: `1px solid ${st.color}`, padding: '2px 6px', flexShrink: 0 }}>{st.label}</span>
                    {ph && <button className="shot-noprint" onClick={(e) => { e.stopPropagation(); setPhaseKey(ph.key); seekTo(ph.idx); }} style={{ ...chip(false), padding: '3px 7px' }} title="Jump to this frame">▸</button>}
                    <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, transform: open ? 'rotate(180deg)' : 'none', display: 'inline-block' }}>▾</span>
                  </div>
                  {open && (
                    <div style={{ padding: '0 12px 12px 30px', fontSize: 12.5, lineHeight: 1.55, color: 'rgba(255,255,255,0.85)' }}>
                      <div style={{ marginBottom: 6 }}><span style={{ ...lbl, color: st.color }}>What </span>{c.status === 'ok' ? `Measured ${c.display} — inside the target band.` : `Measured ${c.display}; target ${c.target}.`}</div>
                      <div style={{ marginBottom: 6 }}><span style={{ ...lbl, color: C.ac }}>Why </span>{c.why}</div>
                      <div><span style={{ ...lbl, color: C.ac }}>How </span>
                        <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{c.how.map((h, k) => <li key={k} style={{ marginBottom: 2 }}>{h}</li>)}</ul>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5, marginTop: 10 }}>
            Targets are coach-readable bands, not laws — read them with the athlete in front of you. Release arm angle is a proxy for the ball’s launch angle. Side-on filming is assumed for the trunk and elbow-offset reads.
          </div>

          <div className="shot-noprint" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
            <button onClick={save} style={{ ...ghost, borderColor: C.ac, color: C.ac }}>↑ SAVE</button>
            <button onClick={copySummary} style={ghost}>COPY SUMMARY</button>
            <button onClick={() => window.print()} style={ghost}>PRINT REPORT</button>
            <div style={{ flex: 1 }} />
            <button onClick={onReset} style={ghost}>↺ NEW CLIP</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Joint-angle timeline with phase bands + playhead; click/drag to seek.
function Timeline({ series, shot, cur, onSeek }) {
  const W = 600, H = 150, PAD = 6;
  const n = series.n; if (n < 2) return null;
  const t0 = series.tMs[0], t1 = series.tMs[n - 1] || t0 + 1;
  const X = (i) => PAD + ((series.tMs[i] - t0) / (t1 - t0)) * (W - 2 * PAD);
  const line = (arr, lo, hi, color) => {
    const pts = [];
    for (let i = 0; i < n; i++) { const v = arr[i]; if (v == null || !Number.isFinite(v)) continue; const y = PAD + (1 - (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * (H - 2 * PAD); pts.push(`${X(i).toFixed(1)},${y.toFixed(1)}`); }
    return <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="1.6" />;
  };
  const pick = (e) => { const r = e.currentTarget.getBoundingClientRect(); const fx = (e.clientX - r.left) / r.width; const t = t0 + fx * (t1 - t0); let best = 0, bd = Infinity; for (let i = 0; i < n; i++) { const d = Math.abs(series.tMs[i] - t); if (d < bd) { bd = d; best = i; } } onSeek(best); };
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 4 }}>
        {[['Knee', '#39BDFF'], ['Elbow', '#FFFFFF'], ['Arm elev.', '#FFA502'], ['Hip height', '#2ED573']].map(([k, c]) => <span key={k} style={{ ...lbl, color: c }}>— {k}</span>)}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.02)', cursor: 'crosshair' }}
        onMouseDown={pick} onMouseMove={(e) => { if (e.buttons === 1) pick(e); }}>
        {shot.phases.map((p) => <line key={p.key} x1={X(p.idx)} x2={X(p.idx)} y1={0} y2={H} stroke="rgba(255,255,255,0.22)" strokeDasharray="3 3" />)}
        {shot.phases.map((p) => <text key={p.key + 't'} x={X(p.idx) + 2} y={10} fill="rgba(255,255,255,0.55)" fontFamily="Nord, monospace" fontSize="8">{p.label}</text>)}
        {line(series.sm.knee, 60, 180, '#39BDFF')}
        {line(series.sm.elbow, 30, 180, '#FFFFFF')}
        {line(series.sm.shoulder, 0, 180, '#FFA502')}
        {line(series.sm.hipY.map((v) => (v == null ? null : v * 400)), (Math.min(...series.sm.hipY.filter(Number.isFinite)) || 0) * 400, (Math.max(...series.sm.hipY.filter(Number.isFinite)) || 1) * 400 + 0.01, '#2ED573')}
        <line x1={X(cur)} x2={X(cur)} y1={0} y2={H} stroke="#39BDFF" strokeWidth="1.5" />
      </svg>
    </div>
  );
}

export { CHECKPOINTS };
