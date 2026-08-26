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
import { detectShootingHand, analyzeShotClip, frameReadout, CHECKPOINTS, SHOT_TYPES } from './shotAnalysis';
import { SHOT_I18N, localiseCheck } from './shotI18n';
import { sessionRead } from './shotSession.js';

const STATUS = {
  ok:    { label: 'OK',    color: 'var(--c-gn, #2ED573)' },
  watch: { label: 'WATCH', color: 'var(--c-or, #FFA502)' },
  fix:   { label: 'FIX',   color: 'var(--c-rd, #FF4757)' },
  na:    { label: 'N/A',   color: 'rgba(255,255,255,0.35)' },
};
const LANG_KEY = 'expo-shot-lang';
const stKey = (score) => (score == null ? 'na' : score >= 80 ? 'ok' : score >= 60 ? 'watch' : 'fix');
const BONES = [[11, 13], [13, 15], [12, 14], [14, 16], [11, 12], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28], [27, 31], [28, 32]];
const SAVE_KEY = 'expo-shot-analyses';

const stage = { position: 'fixed', inset: 0, background: '#000', zIndex: 1500, display: 'flex', flexDirection: 'column', color: '#FFF', fontFamily: FB };
const ghost = { background: 'transparent', border: '1px solid rgba(255,255,255,0.3)', color: '#FFF', fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', padding: '9px 16px', cursor: 'pointer', borderRadius: 0 };
// This tool renders on its own ALWAYS-DARK stage, so it must not use theme
// tokens for accents: in the light theme C.ac resolves to #0E0F12 and every
// accented element (selected chips, labels, the pose dots) disappeared into
// the black background (Ohad 08-24). CYAN is the fixed on-dark accent.
const CYAN = '#39BDFF';
const chip = (active) => ({ ...ghost, padding: '5px 10px', fontSize: 10, letterSpacing: '0.12em', borderColor: active ? CYAN : 'rgba(255,255,255,0.25)', color: active ? CYAN : '#FFF', background: active ? 'rgba(57,189,255,0.10)' : 'transparent' });
const big = (color) => ({ flex: 1, padding: 14, background: color, border: `1px solid ${color}`, color: '#06131b', fontFamily: FN, fontSize: 14, fontWeight: 700, letterSpacing: '0.14em', cursor: 'pointer', borderRadius: 0 });
const lbl = { fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.16em', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' };
const fmt = (v, d = 0) => (v == null || !Number.isFinite(v) ? '—' : v.toFixed(d));

// Input is CAMERA or GALLERY only (Ohad): no reviewed/uploaded EXPO clips are
// ever fed in — this tool is a standalone shooting lab.
export default function ShotAnalyzer({ onClose, toolLabel = 'SHOT ANALYZER', demoResult = null }) {
  const [phase, setPhase] = useState(demoResult ? 'results' : 'idle'); // idle | recording | analyzing | results
  // 'auto' until the clip tells us (or the coach overrides). The shooting hand
  // is read from the pose; the shot type defaults to mid-range and is a
  // one-tap cycle — the coach shouldn't have to set either before filming
  // (Ohad 08-24).
  // Hebrew is a first-class version of the tool, not an overlay: the choice is
  // remembered and the whole stage flips to RTL (Ohad 08-24).
  const [lang, setLang] = useState(() => { try { return localStorage.getItem(LANG_KEY) === 'he' ? 'he' : 'en'; } catch { return 'en'; } });
  const T = SHOT_I18N[lang] || SHOT_I18N.en;
  const setLangPersist = (l) => { setLang(l); try { localStorage.setItem(LANG_KEY, l); } catch { /* private mode */ } };
  const [handMode, setHandMode] = useState('auto'); // auto | R | L
  const [detectedHand, setDetectedHand] = useState(null);
  const hand = handMode === 'auto' ? (detectedHand || 'R') : handMode;
  // Remember the shot type. It reset to 'mid' every time, so a coach who only
  // ever films threes re-picked it on every clip (Ohad 2026-08-26: "IT'S a 3
  // pointer and the tool didn't auto choose it").
  //
  // Deliberately NOT auto-detected from the ball. The physics would pick the
  // wrong answer today: on his own three-point clip the tracker reads 5.3 m/s
  // at 63 degrees, which is a 1.7m shot — a three needs 9.35 m/s and even a
  // free throw needs 7.8. The absolute speed scale is under-reading by about
  // 1.75x, and auto-selecting from it would confidently label a three as a
  // free throw. Remembering his choice is honest; guessing from a broken ruler
  // is not.
  const SHOTTYPE_KEY = 'expo-shot-type';
  const [shotType, setShotType] = useState(() => {
    try { const v = localStorage.getItem(SHOTTYPE_KEY); return (v === 'ft' || v === 'mid' || v === 'three') ? v : 'mid'; } catch { return 'mid'; }
  });
  const [heightSaved, setHeightSaved] = useState(false);
  // Remember the athlete's height. It was state-only, so every reload lost it
  // and the coach had to retype it before any centimetre reading was real
  // (Ohad 2026-08-26: "there's no saving mechanism and i wrote 177cm").
  const STATURE_KEY = 'expo-shot-stature';
  const [stature, setStature] = useState(() => {
    try { return localStorage.getItem(STATURE_KEY) || ''; } catch { return ''; }
  });
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
      // Read the shooting hand off the clip unless the coach pinned one.
      const auto = detectShootingHand(frames);
      if (auto) setDetectedHand(auto);
      const useHand = opts.hand || (handMode === 'auto' ? (auto || hand) : handMode);
      const r = analyzeShotClip(frames, { hand: useHand, statureCm: Number(opts.stature ?? stature) || null, shotType: opts.shotType || shotType });
      if (!r.ok) { setError(r.error); setPhase('idle'); return; }
      setResult(r); setShotIdx(0); setPhase('results');
    } catch (e) {
      setError(e?.message || 'Analysis failed.'); setPhase('idle');
    }
  }, [hand, handMode, stature, shotType]);

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
    <div style={stage} dir={T.dir}>
      {/* top bar */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.12)', background: 'rgba(0,0,0,0.92)', flexWrap: 'wrap' }}>
        <button onClick={onClose} style={ghost}>{T.back}</button>
        <div style={{ fontFamily: FN, fontSize: 13, fontWeight: 700, letterSpacing: '0.18em', color: CYAN }}>{toolLabel}</div>
        <button onClick={() => setLangPersist(lang === 'he' ? 'en' : 'he')} title={T.langTitle} style={{ ...chip(false), fontSize: 10 }}>{T.langBtn}</button>
        <div style={{ flex: 1 }} />
        {/* Every option stays on screen (Ohad 08-24: "it was way better with the
            options"). The bug that made this look broken was never the layout —
            it was the SELECTED chip painting itself with the theme accent, which
            is near-black in the light theme on this always-dark stage. chip()
            now pins the literal cyan, so both rows read correctly. AUTO stays a
            badge on the hand the clip itself reported. */}
        <span style={lbl}>{T.hand}</span>
        {[['R', T.right], ['L', T.left]].map(([k, label]) => (
          <button key={k}
            onClick={() => { setHandMode(k); if (phase === 'results') rescore(k, stature, shotType); }}
            title={T.handHint}
            style={chip(hand === k)}>{label}{handMode === 'auto' && detectedHand === k ? ' · AUTO' : ''}</button>
        ))}
        {handMode !== 'auto' && (
          <button onClick={() => { setHandMode('auto'); const h = detectedHand || 'R'; if (phase === 'results') rescore(h, stature, shotType); }} style={chip(false)} title={T.autoHint}>{T.auto}</button>
        )}
        <span style={{ ...lbl, marginInlineStart: 10 }}>{T.shot}</span>
        {SHOT_TYPES.map((t) => (
          <button key={t.key}
            onClick={() => { setShotType(t.key); try { localStorage.setItem(SHOTTYPE_KEY, t.key); } catch { /* private mode */ } if (phase === 'results') rescore(hand, stature, t.key); }}
            title={T.shotHint}
            style={chip(shotType === t.key)}>{(T.shotTypes[t.key] || t.label).toUpperCase()}</button>
        ))}
        <span style={{ ...lbl, marginInlineStart: 10 }}>{T.height}</span>
        <input value={stature}
          onChange={(e) => { setStature(e.target.value); setHeightSaved(false); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
          onBlur={() => { if (!String(stature).trim()) return; try { localStorage.setItem(STATURE_KEY, String(stature).trim()); } catch { /* private mode */ } if (phase === 'results') rescore(hand, stature, shotType); setHeightSaved(true); setTimeout(() => setHeightSaved(false), 2600); }}
          placeholder={T.cmPlaceholder} inputMode="numeric"
          style={{ width: 56, background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.35)', color: '#FFF', fontFamily: FN, fontSize: 12, padding: '4px 2px', textAlign: 'center', outline: 'none' }} />
        {/* Height feeds the cm conversions — say so when it lands (Ohad 08-24). */}
        <span style={{ fontFamily: FN, fontSize: 9, letterSpacing: '0.1em', color: heightSaved ? '#37B27C' : 'rgba(255,255,255,0.35)', minWidth: 74 }}>
          {heightSaved ? (phase === 'results' ? T.rescored : T.savedCm) : (String(stature).trim() ? T.cmUnit : T.forCm)}
        </span>
      </div>

      {/* body */}
      {phase === 'idle' && (
        <div style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ maxWidth: 720, width: '100%' }}>
            <div style={{ fontFamily: FN, fontSize: 22, fontWeight: 700, letterSpacing: '0.06em', marginBottom: 6 }}>{T.idleTitle}</div>
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, lineHeight: 1.6, marginBottom: 18 }}>
              {T.idleBlurb}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginBottom: 18 }}>
              {T.tips.map(([h, t]) => (
                <div key={h} style={{ border: '1px solid rgba(255,255,255,0.15)', padding: '10px 12px' }}>
                  <div style={{ ...lbl, color: CYAN, marginBottom: 4 }}>{h}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', lineHeight: 1.45 }}>{t}</div>
                </div>
              ))}
            </div>
            {error && <div style={{ border: '1px solid rgba(255,71,87,0.6)', color: '#FF7B86', padding: '10px 12px', fontSize: 13, marginBottom: 14 }}>⚠ {error}</div>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={startRecording} style={big(CYAN)}>{T.record}</button>
              <button onClick={pickFile} style={{ ...big('transparent'), color: '#FFF', border: '1px solid rgba(255,255,255,0.4)' }}>{T.gallery}</button>
            </div>
          </div>
        </div>
      )}

      {phase === 'recording' && (
        <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column' }}>
          <video ref={liveRef} muted playsInline style={{ flex: 1, width: '100%', objectFit: 'contain', background: '#000' }} />
          <div style={{ flexShrink: 0, padding: 14, display: 'flex', gap: 10, background: 'rgba(0,0,0,0.9)' }}>
            <button onClick={stopRecording} style={big('var(--c-rd, #FF4757)')}>{T.stopAnalyse}</button>
          </div>
        </div>
      )}

      {phase === 'analyzing' && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
          <div style={{ fontFamily: FN, fontSize: 13, letterSpacing: '0.18em', fontWeight: 700 }}>{(T.progress[progressLabel] || T.progress[''] || progressLabel).toUpperCase()}…</div>
          <div style={{ width: 220, height: 4, background: 'rgba(255,255,255,0.15)', marginTop: 16 }}><div style={{ width: `${progress}%`, height: '100%', background: CYAN, transition: 'width 120ms' }} /></div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 8, fontFamily: FN, letterSpacing: '0.12em' }}>{progress}%</div>
        </div>
      )}

      {phase === 'results' && result && shot && (
        <ShotResults result={result} shot={shot} shotIdx={shotIdx} setShotIdx={setShotIdx} srcUrl={srcUrl} frames={framesRef.current} hand={hand} onReset={reset} T={T} shotType={shotType} />
      )}

      <input ref={fileRef} type="file" accept="video/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; onFile(f); }} />
    </div>
  );
}

// ------------------------------------------------------------------ results
function ShotResults({ result, shot: rawShot, shotIdx, setShotIdx, srcUrl, frames, hand, onReset, T, shotType }) {
  // The engine stays language-free: every checkpoint and phase label is
  // localised HERE, so the scorecard, the fix guide, the timeline and the
  // copied summary all speak one language.
  const typeSpec = SHOT_TYPES.find((t) => t.key === shotType) || SHOT_TYPES[1];
  const shot = useMemo(() => ({
    ...rawShot,
    checks: rawShot.checks.map((c) => localiseCheck(c, T, typeSpec)),
    phases: rawShot.phases.map((p) => ({ ...p, label: T.phases[p.key] || p.label })),
  }), [rawShot, T, typeSpec]);
  const ST = useMemo(() => ({
    ok: { ...STATUS.ok, label: T.status.ok }, watch: { ...STATUS.watch, label: T.status.watch },
    fix: { ...STATUS.fix, label: T.status.fix }, na: { ...STATUS.na, label: T.status.na },
  }), [T]);
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
  // Collapsed by default (Ohad 2026-08-26: "the drills/solutions should be
  // expandable, and collapsed when not clicked on"). It used to auto-open every
  // failing check, so the panel arrived as a wall of prose and the scorecard —
  // the part that is meant to be scannable — was pushed off the screen.
  const [openGuide, setOpenGuide] = useState(() => new Set());

  // When the SHOT changes, jump the video to that shot's current phase — unless
  // the change came from the user scrubbing, in which case they are already
  // exactly where they want to be and yanking the video away is the bug.
  const fromScrubRef = useRef(false);
  useEffect(() => {
    if (fromScrubRef.current) { fromScrubRef.current = false; return; }
    const p = shot.phases.find((x) => x.key === phaseKey);
    const target = p ? p.idx : shot.cycle.release;
    setCur(target); seekTo(target);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [shotIdx]);

  const nearestIdx = (tMs) => { const t = series.tMs; let lo = 0, hi = t.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (t[m] < tMs) lo = m + 1; else hi = m; } if (lo > 0 && Math.abs(t[lo - 1] - tMs) < Math.abs(t[lo] - tMs)) lo--; return lo; };
  const seekTo = (i) => { const v = videoRef.current; const ii = Math.max(0, Math.min(n - 1, i)); setCur(ii); if (v) { try { v.pause(); v.currentTime = series.tMs[ii] / 1000; } catch { /* noop */ } } };
  // Which rep does a frame belong to? The nearest release: phases butt up
  // against each other, so a frame between two reps belongs to whichever
  // release it is closer to.
  const shotAtFrame = (i) => {
    let best = shotIdx, bestD = Infinity;
    (result.shots || []).forEach((s2, k) => {
      const rel = s2.cycle && s2.cycle.release;
      if (rel == null) return;
      const d = Math.abs(rel - i);
      if (d < bestD) { bestD = d; best = k; }
    });
    return best;
  };
  // A USER scrub also re-selects the rep. Scrubbing back to the start of the
  // clip used to leave the panel showing the last rep analysed, so every
  // reading on screen described a shot that was nowhere near the playhead
  // (Ohad 2026-08-26).
  const userSeek = (i) => {
    const k = shotAtFrame(Math.max(0, Math.min(n - 1, i)));
    if (k !== shotIdx) { fromScrubRef.current = true; setShotIdx(k); }
    seekTo(i);
  };
  const step = (d) => userSeek(cur + d);

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
    for (let i = 11; i <= 28; i++) { const p = lm[i]; if (!p || (p.visibility ?? 1) < 0.3) continue; ctx.fillStyle = arm.includes(i) ? '#FFFFFF' : CYAN; ctx.beginPath(); ctx.arc(X(p), Y(p), 3.5, 0, Math.PI * 2); ctx.fill(); }
    // eye line
    const eye = lm[hand === 'L' ? 2 : 5]; if (eye) { ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(ox, Y(eye)); ctx.lineTo(ox + cw, Y(eye)); ctx.stroke(); ctx.setLineDash([]); }
  }, [cur, frames, hand, srcUrl, boxTick]);

  const rd = frameReadout(series, cur);
  const phaseAt = shot.phases.find((p) => p.idx === cur);
  const tMs = series.tMs[cur];
  const sc = ST[stKey(shot.score)];
  const fixes = shot.checks.filter((c) => c.status === 'fix'), watches = shot.checks.filter((c) => c.status === 'watch');

  const save = () => {
    try {
      const all = JSON.parse(localStorage.getItem(SAVE_KEY) || '[]');
      all.unshift({ date: new Date().toISOString(), hand, score: shot.score, shots: result.shots.length, checks: shot.checks.map((c) => ({ key: c.key, value: c.value, status: c.status })), info: shot.info });
      localStorage.setItem(SAVE_KEY, JSON.stringify(all.slice(0, 50)));
      toast(T.savedToast, 'success');
    } catch { toast(T.saveFail, 'error'); }
  };
  const copySummary = async () => {
    const lines = [T.copyHead(shot.score ?? '—', hand === 'L' ? T.handWordL : T.handWordR)];
    for (const c of shot.checks) lines.push(`${ST[c.status].label.padEnd(5)} ${c.label}: ${c.display} (${c.target})`);
    if (fixes.length) { lines.push('', T.copyFixFirst); for (const c of fixes) { lines.push(`• ${c.label} — ${c.why}`); for (const h of c.how) lines.push(`   - ${h}`); } }
    try { await navigator.clipboard.writeText(lines.join('\n')); toast(T.copiedToast, 'success'); } catch { toast(T.copyFail, 'error'); }
  };

  return (
    <div className="shot-wrap" style={{ flex: 1, overflow: 'auto', WebkitOverflowScrolling: 'touch' }} data-allow-copy>
      <style>{`
        @media print { .shot-noprint{display:none!important} .shot-print{padding:0!important} }
        /* One screen, no page scroll: the video column and the report column
           each scroll on their own, and the video is capped vertically so the
           transport, the read-out and the actions all sit above the fold
           (Ohad 08-24: "i want everything to fit without scrolling"). */
        @media (min-width: 980px) {
          .shot-wrap { overflow: hidden !important; }
          .shot-results { flex-wrap: nowrap !important; height: 100%; min-height: 0; align-items: stretch !important; }
          /* The video column is a FIXED control column and the report takes the
             rest — with the video box now shrinking to a portrait clip's own
             aspect, a flexible left column left a wide empty gutter. */
          .shot-left { flex: 0 0 440px !important; min-height: 0; overflow-y: auto; overflow-x: hidden; padding-right: 4px; }
          .shot-right { flex: 1 1 auto !important; min-height: 0; overflow-y: auto; padding-right: 4px; }
          /* Cap the HEIGHT and let the box narrow to the clip's own aspect —
             capping height alone kept width:100%%, so a portrait phone clip sat
             in a wide box with black bars down both sides. */
          .shot-video { max-height: 44vh; max-width: calc(44vh * var(--shot-ar, 1.7778)); margin: 0 auto; }
          /* Fixed column counts, not auto-fill: eight read-outs in an auto-fill
             grid wrapped 5 + 3 and the info tiles came out at different heights.
             Two rows of four, three even columns, nothing ragged. */
          .shot-readout { grid-template-columns: repeat(4, 1fr) !important; }
          .shot-info { grid-template-columns: repeat(3, 1fr) !important; }
        }
      `}</style>
      <div className="shot-print shot-results" style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', maxWidth: 1440, margin: '0 auto', padding: 16 }}>
        {/* LEFT — player */}
        <div className="shot-left" style={{ flex: '1 1 420px', minWidth: 300, maxWidth: 640 }}>
          <div ref={wrapRef} className="shot-video" style={{ '--shot-ar': result.aspect || 1.7778, position: 'relative', width: '100%', aspectRatio: result.aspect ? `${result.aspect}` : '16/9', background: '#000', border: '1px solid rgba(255,255,255,0.15)' }}>
            {srcUrl ? <video ref={videoRef} src={srcUrl} muted playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} onLoadedMetadata={() => seekTo(cur)} />
              : <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.4)', fontFamily: FN, fontSize: 11, letterSpacing: '0.14em' }}>POSE TRACK</div>}
            <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
            {phaseAt && <div style={{ position: 'absolute', top: 8, left: 8, background: 'rgba(0,0,0,0.7)', border: `1px solid ${CYAN}`, color: CYAN, fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', padding: '3px 8px' }}>{phaseAt.label}</div>}
            <div style={{ position: 'absolute', bottom: 8, right: 8, background: 'rgba(0,0,0,0.7)', fontFamily: FN, fontSize: 10, letterSpacing: '0.08em', padding: '3px 8px', color: 'rgba(255,255,255,0.8)' }}>F{cur + 1}/{n} · {fmt(tMs / 1000, 2)}s</div>
          </div>
          {/* transport */}
          <div className="shot-noprint" style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
            <button onClick={() => step(-10)} style={chip(false)} title={T.back10}>«10</button>
            <button onClick={() => step(-1)} style={chip(false)} title={T.prev1}>‹ 1</button>
            <button onClick={() => { const v = videoRef.current; if (!v) return; if (v.paused) { v.play().catch(() => {}); } else v.pause(); }} style={chip(playing)}>{playing ? '❚❚' : '▶'}</button>
            <button onClick={() => step(1)} style={chip(false)} title={T.next1}>1 ›</button>
            <button onClick={() => step(10)} style={chip(false)} title={T.fwd10}>10»</button>
            <input type="range" min={0} max={n - 1} value={cur} onChange={(e) => userSeek(Number(e.target.value))} style={{ flex: 1, minWidth: 120, accentColor: '#39BDFF' }} />
          </div>
          <div className="shot-noprint" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            {shot.phases.map((p) => <button key={p.key} onClick={() => { setPhaseKey(p.key); seekTo(p.idx); }} style={chip(cur === p.idx)} title={T.phaseJump(p.label)}>{p.label}</button>)}
          </div>
          {/* per-frame readout */}
          {/* Ordered up the body, four to a row: ground → trunk → shoulder on the
              first line, then the arm chain elbow → forearm → wrist on the
              second, so the eye reads it in the same order the shot happens. */}
          <div className="shot-readout" style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))', gap: 6 }}>
            {[[T.metrics.knee, fmt(rd.knee) + '°'], [T.metrics.hip, fmt(rd.hip) + '°'], [T.metrics.trunk, fmt(rd.trunk) + '°'], [T.metrics.armElev, fmt(rd.shoulder) + '°'], [T.metrics.elbow, fmt(rd.elbow) + '°'], [T.metrics.elbowOffset, fmt(rd.wristElbowX, 2)], [T.metrics.forearm, fmt(rd.forearm) + '°'], [T.metrics.wristEye, (rd.wristEye == null ? '—' : (rd.wristEye >= 0 ? '+' : '') + fmt(rd.wristEye, 2))]].map(([k, v]) => (
              <div key={k} style={{ border: '1px solid rgba(255,255,255,0.12)', padding: '6px 8px', minHeight: 46, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={lbl}>{k}</div>
                <div style={{ fontFamily: FN, fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
              </div>
            ))}
          </div>
          {/* Actions live UNDER THE VIDEO, not at the end of the report — they
              used to sit below every checkpoint, so the coach had to scroll the
              whole guide to reach SAVE / NEW CLIP (Ohad 08-24). */}
          <div className="shot-noprint" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            <button onClick={save} style={{ ...ghost, borderColor: CYAN, color: CYAN, padding: '7px 12px', fontSize: 10 }}>{T.save}</button>
            <button onClick={copySummary} style={{ ...ghost, padding: '7px 12px', fontSize: 10 }}>{T.copy}</button>
            <button onClick={() => window.print()} style={{ ...ghost, padding: '7px 12px', fontSize: 10 }}>{T.print}</button>
            <div style={{ flex: 1 }} />
            <button onClick={onReset} style={{ ...ghost, padding: '7px 12px', fontSize: 10 }}>{T.newClip}</button>
          </div>
          <Timeline series={series} shot={shot} cur={cur} onSeek={seekTo} T={T} />
        </div>

        {/* RIGHT — score, scorecard, guide */}
        <div className="shot-right" style={{ flex: '1 1 420px', minWidth: 300 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 12 }}>
            <div style={{ width: 84, height: 84, borderRadius: '50%', border: `4px solid ${sc.color}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <div style={{ fontFamily: FN, fontSize: 26, fontWeight: 700, lineHeight: 1 }}>{shot.score ?? '—'}</div>
              <div style={{ ...lbl, fontSize: 8 }}>/ 100</div>
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontFamily: FN, fontSize: 16, fontWeight: 700, letterSpacing: '0.06em' }}>
                {shot.score == null ? T.verdictNa : shot.score >= 80 ? T.verdictOk : shot.score >= 60 ? T.verdictMid : T.verdictLow}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, marginTop: 3, lineHeight: 1.5 }}>
                {T.summary(fixes.length, watches.length, shot.checks.length - fixes.length - watches.length, T.quality[result.quality] || result.quality, Math.round((result.coverage || 0) * 100), result.fps)}
              </div>
              {result.shots.length > 1 && (
                <div className="shot-noprint" style={{ marginTop: 8 }}>
                  {/* WHICH SHOT AM I LOOKING AT — a clip can hold many shots; the
                      scorecard below is ALWAYS the selected one, the session
                      panel underneath is all of them. */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={() => setShotIdx((i) => Math.max(0, i - 1))} disabled={shotIdx === 0} style={{ ...chip(false), opacity: shotIdx === 0 ? 0.35 : 1 }}>&lsaquo;</button>
                    <span style={{ fontFamily: FN, fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', color: CYAN }}>{T.shotOf(shot.index, result.shots.length)}</span>
                    <span style={{ ...lbl, letterSpacing: '0.06em' }}>{T.atSec(fmt(series.tMs[shot.cycle.release] / 1000, 1))}</span>
                    <button onClick={() => setShotIdx((i) => Math.min(result.shots.length - 1, i + 1))} disabled={shotIdx === result.shots.length - 1} style={{ ...chip(false), opacity: shotIdx === result.shots.length - 1 ? 0.35 : 1 }}>&rsaquo;</button>
                    <div style={{ flex: 1 }} />
                    <span style={{ ...lbl, letterSpacing: '0.06em' }}>{T.scopeHint(result.shots.length)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                    {result.shots.map((s, i) => {
                      const st = ST[stKey(s.score)];
                      return <button key={i} onClick={() => setShotIdx(i)} title={T.shotTip(s.index, fmt(series.tMs[s.cycle.release] / 1000, 1), s.score ?? '-')}
                        style={{ ...chip(i === shotIdx), padding: '4px 8px', borderColor: i === shotIdx ? CYAN : st.color, color: i === shotIdx ? CYAN : st.color }}>{s.index}</button>;
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* info strip */}
          {/* Six single-width read-outs fill two clean rows of three; the two
              long ones (chain order, session consistency) get a row each
              instead of stretching one tile taller than its neighbours. */}
          <div className="shot-info" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 6, marginBottom: 14 }}>
            {[[T.info.dipToRelease, shot.info.dipToReleaseMs != null ? shot.info.dipToReleaseMs + ' ms' : '—'],
              [T.info.jumpRise, shot.info.jumpRiseCm != null ? shot.info.jumpRiseCm + ' cm' : T.enterHeight],
              [T.info.releaseHeight, shot.info.releaseHeightCm != null ? shot.info.releaseHeightCm + ' cm' : (shot.info.releaseHeightRatio != null ? shot.info.releaseHeightRatio + T.eyeHeight : '—')],
              [T.info.armAtRelease, fmt(shot.info.shoulderAtRelease) + '°'],
              // Measured from the BALL. Blank when the ball could not be tracked
              // confidently — an empty tile beats a confident wrong angle.
              [T.info.ballLaunch, shot.info.ballLaunchDeg != null ? shot.info.ballLaunchDeg + '°' : '—'],
              // Scaled off the ball itself — no calibration, nothing to enter.
              [T.info.ballSpeed, shot.info.ballSpeedMs != null ? shot.info.ballSpeedMs + ' m/s' : '—'],
              [T.info.ballRise, shot.info.ballRiseM != null ? shot.info.ballRiseM + ' m' : '—'],
              [T.info.releaseVsApex, shot.raw.timing == null ? '—' : (shot.raw.timing > 0 ? '+' : '') + Math.round(shot.raw.timing) + ' ms'],
              [T.info.tracked, shot.info.coverage != null ? T.ofFrames(Math.round(shot.info.coverage * 100)) : '—']].map(([k, v]) => (
              <div key={k} style={{ border: '1px solid rgba(255,255,255,0.12)', padding: '6px 8px', minHeight: 46, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}><div style={lbl}>{k}</div><div dir="ltr" style={{ fontFamily: FN, fontSize: 14, fontWeight: 700, unicodeBidi: 'isolate', textAlign: 'start' }}>{v}</div></div>
            ))}
            {/* An untracked ball used to be three em dashes and no explanation.
                The plain sentence is for the coach; the technical reason the
                tracker actually gave is on the tooltip, for whoever is fixing it. */}
            {shot.info.ballLaunchDeg == null && shot.info.ballWhy && (
              <div title={shot.info.ballWhy.why || shot.info.ballWhy.failed || ''}
                style={{ border: '1px solid rgba(255,255,255,0.12)', padding: '6px 8px', gridColumn: '1 / -1',
                  fontSize: 12, lineHeight: 1.5, color: 'rgba(255,255,255,0.62)' }}>
                {T.ballUnread}
              </div>
            )}
            <div style={{ border: '1px solid rgba(255,255,255,0.12)', padding: '6px 8px', gridColumn: '1 / -1' }}><div style={lbl}>{T.info.chain}</div><div dir="ltr" style={{ fontFamily: FN, fontSize: 14, fontWeight: 700, unicodeBidi: 'isolate', textAlign: 'start' }}>{shot.info.sequenceOrder ? T.chainVal(shot.info.sequenceOrder.kneeMs, shot.info.sequenceOrder.shoulderMs, shot.info.sequenceOrder.elbowMs) : '—'}</div></div>
            {result.consistency && <div style={{ border: '1px solid rgba(255,255,255,0.12)', padding: '6px 8px', gridColumn: '1 / -1' }}><div style={lbl}>{T.consistencyLbl(result.consistency.n)}</div><div style={{ fontFamily: FN, fontSize: 12, fontWeight: 700 }}>{T.consistencyVal(fmt(result.consistency.rhythmCv), fmt(result.consistency.releaseArmSd, 1), fmt(result.consistency.setElbowSd, 1), fmt(result.consistency.timingSd))}</div></div>}
          </div>

          {/* A starved capture reports FEWER SHOTS with full confidence.
              Measured on one identical clip across runs: 9, 10, 11 and 12
              shots, depending only on what else was driving the browser.
              MediaPipe drops frames under load and the analyzer cannot tell
              a rep that was never filmed from a rep whose frames were lost.
              Below ~18fps say so, loudly, rather than showing a short count
              as if it were the truth. (Ohad, 2026-08-26: "it only recognized
              6 out of 11 shots i took" — on a clip that reads 11 when the
              browser is idle.) */}
          {result.fps != null && result.fps < 18 && (
            <div style={{ border: `1px solid ${'#E0A73A'}`, background: 'rgba(224,167,58,0.08)', color: '#E0A73A',
              padding: '10px 12px', marginBottom: 14, fontSize: 12.5, lineHeight: 1.5 }}>
              {T.starved(result.fps, result.frameCount)}
            </div>
          )}
          {/* SESSION — every detected shot, scored, so a multi-shot clip is
              never ambiguous: this table IS the whole clip. */}
          {result.shots.length > 1 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ ...lbl, color: CYAN, marginBottom: 6 }}>{T.sessionTitle(result.shots.length)}</div>
              <div style={{ border: '1px solid rgba(255,255,255,0.15)', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: FN, fontSize: 11 }}>
                  <thead><tr>{T.cols.map((h) => <th key={h} style={{ ...lbl, textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid rgba(255,255,255,0.15)', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {result.shots.map((s, i) => {
                      const st = ST[stKey(s.score)];
                      const worstRaw = s.checks.find((c) => c.status === 'fix') || s.checks.find((c) => c.status === 'watch');
                      const worst = worstRaw ? localiseCheck(worstRaw, T, typeSpec) : null;
                      return (
                        <tr key={i} onClick={() => setShotIdx(i)} style={{ cursor: 'pointer', background: i === shotIdx ? 'rgba(57,189,255,0.10)' : 'transparent', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                          <td style={{ padding: '6px 8px', fontWeight: 700, color: i === shotIdx ? CYAN : '#FFF' }}>{s.index}</td>
                          <td style={{ padding: '6px 8px', color: 'rgba(255,255,255,0.7)' }}>{fmt(series.tMs[s.cycle.release] / 1000, 1)}s</td>
                          <td style={{ padding: '6px 8px', fontWeight: 700, color: st.color }}>{s.score ?? '—'}</td>
                          <td style={{ padding: '6px 8px', color: 'rgba(255,255,255,0.8)' }}>{fmt(s.raw.dip)}°</td>
                          <td style={{ padding: '6px 8px', color: 'rgba(255,255,255,0.8)' }}>{fmt(s.raw.setElbow)}°</td>
                          <td style={{ padding: '6px 8px', color: 'rgba(255,255,255,0.8)' }}>{fmt(s.raw.releaseArm)}°</td>
                          <td style={{ padding: '6px 8px', color: 'rgba(255,255,255,0.8)' }}>{s.raw.timing == null ? '—' : (s.raw.timing > 0 ? '+' : '') + Math.round(s.raw.timing) + 'ms'}</td>
                          <td style={{ padding: '6px 8px', color: worst ? ST[worst.status].color : 'rgba(255,255,255,0.4)', whiteSpace: 'nowrap' }}>{worst ? worst.label : T.cleanRow}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {/* What repeats across the session is what to coach first. */}
              {(() => {
                const counts = new Map();
                for (const s of result.shots) for (const c of s.checks) if (c.status === 'fix') { const lc = localiseCheck(c, T, typeSpec); counts.set(lc.label, (counts.get(lc.label) || 0) + 1); }
                const top = [...counts.entries()].sort((x, y) => y[1] - x[1]).slice(0, 3);
                const scored = result.shots.filter((s) => s.score != null);
                const avg = scored.length ? Math.round(scored.reduce((acc, s) => acc + s.score, 0) / scored.length) : null;
                // CONSISTENCY of the ball's launch angle across the session.
                // A single rep's angle says little on a phone clip; the SPREAD
                // across reps is the coachable thing, and it needs no extra
                // measurement — the angles are already there.
                // Session consistency across every tracked rep. Logic lives in
                // src/shotSession.js so it is testable without a clip.
                // The spreads, the verdict, and the rep to actually watch. The
                // read refuses to blame the session for one odd rep: if dropping
                // that rep brings the reading back inside the threshold, the
                // finding is the rep. See src/shotSession.js.
                const { spread, verdict, culprit, rest } = sessionRead(result.shots);
                const band = (sp) => (sp && sp.tight ? '#37B27C' : '#E0A73A');
                const row = (label, sp, unit) => (sp ? (
                  <span style={{ marginRight: 14 }}>
                    {label}{' '}
                    {/* Numbers and their Latin units are bidi-isolated: inside an
                        RTL paragraph "200 ms" otherwise renders as "ms 200", and
                        a range "(54-67.2)" reverses. */}
                    <span dir="ltr" style={{ unicodeBidi: 'isolate', display: 'inline-block' }}>
                      <b style={{ color: '#FFF' }}>{sp.mean}{unit}</b>
                      {' ± '}<b style={{ color: band(sp) }}>{sp.sd}{unit}</b>
                      <span style={{ opacity: 0.7 }}> ({sp.lo}–{sp.hi})</span>
                    </span>
                  </span>
                ) : null);
                return (
                  <div style={{ marginTop: 8, fontSize: 12.5, lineHeight: 1.55, color: 'rgba(255,255,255,0.8)' }}>
                    {T.sessionAvg} <b style={{ color: '#FFF' }}>{avg == null ? '—' : avg + '/100'}</b>
                    {top.length > 0
                      ? <> · {T.repeats}: {top.map(([l, n]) => `${l} (${n}/${result.shots.length})`).join(' · ')}</>
                      : <> · {T.noRepeats}</>}
                    {verdict && (
                      <div style={{ marginTop: 4 }}>
                        {row(T.launchSpread, spread.angle, '°')}
                        {row(T.spreadSpeed, spread.speed, ' m/s')}
                        {row(T.spreadRise, spread.rise, ' m')}
                        <div style={{ marginTop: 2, color: verdict === 'repeatable' ? '#37B27C' : '#E0A73A' }}>
                          {verdict === 'outlier' ? T.verdictOutlier(rest.n)
                            : verdict === 'speed' ? T.verdictSpeed
                            : verdict === 'angle' ? T.verdictAngle : T.sessionRepeatable}
                          {spread.angle ? ' · ' + T.launchSpreadOn(spread.angle.n, result.shots.length) : ''}
                        </div>
                        {culprit && (
                          <div style={{ marginTop: 2, color: '#E0A73A' }}>
                            {T.worstRep(culprit.index, culprit.value, culprit.key === 'ballSpeedMs' ? T.unitSpeedProse : '°')}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* scorecard */}
          <div style={{ ...lbl, color: CYAN, marginBottom: 6 }}>{T.checksTitle(shot.index, result.shots.length)}</div>
          <div style={{ border: '1px solid rgba(255,255,255,0.15)' }}>
            {shot.checks.map((c, i) => {
              const st = ST[c.status];
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
                    <div dir="ltr" style={{ fontFamily: FN, fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', unicodeBidi: 'isolate' }}>{c.display}</div>
                    <span style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', color: st.color, border: `1px solid ${st.color}`, padding: '2px 6px', flexShrink: 0 }}>{st.label}</span>
                    {ph && <button className="shot-noprint" onClick={(e) => { e.stopPropagation(); setPhaseKey(ph.key); seekTo(ph.idx); }} style={{ ...chip(false), padding: '3px 7px' }} title={T.jumpFrame}>▸</button>}
                    <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, transform: open ? 'rotate(180deg)' : 'none', display: 'inline-block' }}>▾</span>
                  </div>
                  {open && (
                    <div style={{ padding: '0 12px 12px 30px', fontSize: 12.5, lineHeight: 1.55, color: 'rgba(255,255,255,0.85)', minWidth: 0, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                      <div style={{ marginBottom: 9 }}>
                        <div style={{ ...lbl, color: st.color, marginBottom: 3 }}>{T.what}</div>
                        <div>{c.status === 'ok' ? T.measuredOk(c.display) : T.measuredBad(c.display, c.target)}</div>
                      </div>
                      <div style={{ marginBottom: 9 }}>
                        <div style={{ ...lbl, color: CYAN, marginBottom: 3 }}>{T.why}</div>
                        <div>{c.why}</div>
                      </div>
                      <div>
                        <div style={{ ...lbl, color: CYAN, marginBottom: 3 }}>{T.how}</div>
                        <ul style={{ margin: 0, paddingInlineStart: 18 }}>{c.how.map((h, k) => <li key={k} style={{ marginBottom: 3 }}>{h}</li>)}</ul>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5, marginTop: 10 }}>
            {T.footnote}
          </div>

        </div>
      </div>
    </div>
  );
}

// Joint-angle timeline with phase bands + playhead; click/drag to seek.
function Timeline({ series, shot, cur, onSeek, T }) {
  // Click a legend entry to show ONLY that line; click it again for all four
  // (Ohad 2026-08-26: "i wanna be able to only see one graph (knee/hip etc if i
  // click on it)"). Four traces over one another is unreadable when the
  // question is "what did the knee actually do".
  const [soloLine, setSoloLine] = useState(null);
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
        {[[T.legend.knee, '#39BDFF', 'knee'], [T.legend.hipHeight, '#2ED573', 'hipY'], [T.legend.armElev, '#FFA502', 'shoulder'], [T.legend.elbow, '#FFFFFF', 'elbow']].map(([k, c, id]) => (
          <button key={k} onClick={() => setSoloLine((v) => (v === id ? null : id))}
            title={soloLine === id ? T.legendAll : T.legendOnly(k)}
            style={{ ...lbl, color: c, background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 4px',
              opacity: soloLine && soloLine !== id ? 0.3 : 1,
              textDecoration: soloLine === id ? 'underline' : 'none' }}>— {k}</button>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.02)', cursor: 'crosshair' }}
        onMouseDown={pick} onMouseMove={(e) => { if (e.buttons === 1) pick(e); }}>
        {shot.phases.map((p) => <line key={p.key} x1={X(p.idx)} x2={X(p.idx)} y1={0} y2={H} stroke="rgba(255,255,255,0.22)" strokeDasharray="3 3" />)}
        {shot.phases.map((p) => <text key={p.key + 't'} x={X(p.idx) + 2} y={10} fill="rgba(255,255,255,0.55)" fontFamily="Nord, monospace" fontSize="8">{p.label}</text>)}
        {(!soloLine || soloLine === 'knee') && line(series.sm.knee, 60, 180, '#39BDFF')}
        {(!soloLine || soloLine === 'elbow') && line(series.sm.elbow, 30, 180, '#FFFFFF')}
        {(!soloLine || soloLine === 'shoulder') && line(series.sm.shoulder, 0, 180, '#FFA502')}
        {(!soloLine || soloLine === 'hipY') && line(series.sm.hipY.map((v) => (v == null ? null : v * 400)), (Math.min(...series.sm.hipY.filter(Number.isFinite)) || 0) * 400, (Math.max(...series.sm.hipY.filter(Number.isFinite)) || 1) * 400 + 0.01, '#2ED573')}
        <line x1={X(cur)} x2={X(cur)} y1={0} y2={H} stroke="#39BDFF" strokeWidth="1.5" />
      </svg>
    </div>
  );
}

export { CHECKPOINTS };
