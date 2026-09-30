// ShotAnalyzer.jsx — Basketball Shot Analyzer (Review › Tools).
// Record or upload a jump shot → MediaPipe pose on every frame → phase
// detection (STANCE · DIP · SET · RELEASE · APEX · FOLLOW · LAND) → frame-by-
// frame player with skeleton overlay + metric readout → checkpoint scorecard
// → FIX GUIDE (what / why / how). Engine: shotAnalysis.js (pure, tested).
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { C, FN, FB } from './theme';
import { fmtNumericDate } from './dates';
import { toast, SegWord } from './ui';
import { captureShotFrames } from './shotCapture';
import { preflightClip } from './clipPreflight';
import { getCamera, stopStream } from './usePose';
import { detectShootingHand, analyzeShotClip, frameReadout, CHECKPOINTS, SHOT_TYPES } from './shotAnalysis';
import { SHOT_I18N, localiseCheck } from './shotI18n';
import { sessionRead, sessionConclusions, makeMissContrast, makesByThird, CONTRAST_MIN } from './shotSession.js';
import { useSupaStore } from './useSupaStore';
import { crossFade } from './viewTransition';
import { judgeShots } from './rimJudge';
import { flushSync } from 'react-dom';

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
// ONE height scale for every control on this page. Both primitives used to be
// sized by their padding, so a control's height followed its font-size and its
// label — BACK (ghost, 11px) stood taller than the language chip beside it, and
// no two adjacent buttons agreed. Ohad's rule: buttons that sit next to each
// other are always the same height. A fixed box is the only way to guarantee
// that regardless of label or language.
// 36 everywhere a control has a border (27.9 redesign: "one bordered control
// height"). The dense 24px chips were the odd ones out on a phone - the
// transport, the phases and the rep grid each stood a different height from
// the actions under them.
const CTL_H = 36;
const CTL_SM = CTL_H;
// lineHeight NORMAL, not 1. Ohad: "the buttons at the top are not vertically
// center aligned inside the box". The box always was centred - the LETTERS
// were not. line-height 1 on a 10px Nord label gives a 10px line box around
// a 12px glyph box, and flex centres the LINE box, so the ink rides 0.6px
// high against a border that makes it obvious. Letting the font's own
// metrics set the line box centres the ink instead - measured 0.00px on the
// demo's control, which already did this. The height is fixed and the box is
// border-box, so line-height cannot move the button itself.
const boxed = (h) => ({ height: h, minHeight: 0, boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 'normal', paddingTop: 0, paddingBottom: 0 });
const ghost = { background: 'transparent', border: '1px solid rgba(255,255,255,0.3)', color: '#FFF', fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', padding: '0 14px', cursor: 'pointer', borderRadius: 0, ...boxed(CTL_H) };
// HEIGHT: an actual SAVE button, then only a green check (Ohad 28.9 #387:
// "replace the saved with an actual save button (then just keep the green check
// when updated)"). One fixed slot for both states, so the row never moves when
// SAVE turns into the check; typing a new value brings SAVE back.
const SAVE_W = 72;
function HeightSave({ saved, empty, onSave, T }) {
  return (
    <span style={{ width: SAVE_W, height: CTL_H, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {saved
        ? <span data-height-saved role="img" aria-label={T.savedCm} title={T.savedCm} style={{ color: '#37B27C', fontSize: 16, fontWeight: 700, lineHeight: 'normal' }}>✓</span>
        : <button type="button" data-height-save disabled={empty} onClick={onSave}
            style={{ ...ghost, width: '100%', minWidth: 0, padding: 0, opacity: empty ? 0.35 : 1, cursor: empty ? 'default' : 'pointer' }}>{T.saveBtn}</button>}
    </span>
  );
}
// This tool renders on its own ALWAYS-DARK stage, so it must not use theme
// tokens for accents: in the light theme C.ac resolves to #0E0F12 and every
// accented element (selected chips, labels, the pose dots) disappeared into
// the black background (Ohad 08-24). CYAN is the fixed on-dark accent.
const CYAN = '#39BDFF';
const chip = (active) => ({ ...ghost, padding: '0 10px', fontSize: 10, letterSpacing: '0.12em', borderColor: active ? CYAN : 'rgba(255,255,255,0.25)', color: active ? CYAN : '#FFF', background: active ? 'rgba(57,189,255,0.10)' : 'transparent', ...boxed(CTL_SM) });
const big = (color) => ({ flex: 1, padding: 14, background: color, border: `1px solid ${color}`, color: '#06131b', fontFamily: FN, fontSize: 14, fontWeight: 700, letterSpacing: '0.14em', cursor: 'pointer', borderRadius: 0 });
const lbl = { fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.16em', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' };

// DRILLS, collapsed until asked for.
//
// Ohad: "the 'how' should be drills and it should be expandable list,
// collapsed before touched". Every checkpoint carries two or three of them, so
// leaving them open put a wall of prose between the reading he came for and
// the next checkpoint. WHAT and WHY answer the question; the drills are what he
// does about it, and he asks for those when he wants them.
//
// A module-level component, not an inline one - there is a build gate against
// declaring components inside render, because remounting on every parent render
// loses their state (this one's open/closed included).
function DrillList({ label, items }) {
  const [open, setOpen] = useState(false);
  if (!items || !items.length) return null;
  return (
    <div>
      <button type="button" onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{ ...lbl, color: CYAN, background: 'transparent', border: 'none', padding: 0, margin: 0,
          cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, lineHeight: 'normal' }}>
        <span>{label} ({items.length})</span>
        <span style={{ fontSize: 8, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}><svg aria-hidden viewBox="0 0 9 6" fill="none" width="0.95em" height="0.63em" style={{ display: 'inline-block', verticalAlign: 'middle' }}><path d="M1 1l3.5 3.5L8 1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
      </button>
      {open && (
        <ul style={{ margin: '3px 0 0', paddingInlineStart: 18 }}>
          {items.map((h, k) => <li key={k} style={{ marginBottom: 3 }}>{h}</li>)}
        </ul>
      )}
    </div>
  );
}
// CLIP WARNINGS as one line. The findings are still the preflight's own words -
// tapping the line opens them in full - but collapsed they are a title and a
// short phrase, and ✕ puts them away for this clip. Before, two findings in
// full sat above the results on every visit and took a third of a phone
// screen. SegWord drops the phrase (never the title) when both would not fit
// one row, at the same size - nothing is cut or ellipsised.
const WARN_INK = '#FFD08A';
function ClipWarnings({ findings, T }) {
  const [open, setOpen] = useState(false);
  const [gone, setGone] = useState(false);
  if (gone || !findings || !findings.length) return null;
  const first = findings[0];
  const title = T.preflight.keys[first.key] || first.key;
  const phrase = (T.warnShort && T.warnShort[first.key]) || '';
  const more = findings.length - 1;
  return (
    <div data-shot-warn style={{ flexShrink: 0, borderBottom: '1px solid rgba(255,165,2,0.45)', background: 'rgba(255,165,2,0.08)', padding: '4px var(--g)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} title={T.warnOpen}
          style={{ flex: 1, minWidth: 0, height: CTL_H, display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', border: 'none', padding: 0, margin: 0, cursor: 'pointer', color: WARN_INK, textAlign: 'start', lineHeight: 'normal' }}>
          <span aria-hidden style={{ fontSize: 12, flexShrink: 0 }}>⚠</span>
          <span data-shot-warn-line style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', whiteSpace: 'nowrap' }}>
            <SegWord
              full={<><span className="shot-warn-title" style={{ fontFamily: FN, fontSize: 10, letterSpacing: '0.12em', fontWeight: 700 }}>{title}</span><span style={{ fontFamily: FB, fontSize: 12, marginInlineStart: 8, color: 'rgba(255,208,138,0.8)' }}>{phrase}</span></>}
              short={<span className="shot-warn-title" style={{ fontFamily: FN, fontSize: 10, letterSpacing: '0.12em', fontWeight: 700 }}>{title}</span>} />
          </span>
          {more > 0 && <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', flexShrink: 0 }}>+{more}</span>}
          <svg aria-hidden viewBox="0 0 9 6" fill="none" width="10" height="7" style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}><path d="M1 1l3.5 3.5L8 1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <button type="button" onClick={() => setGone(true)} title={T.warnDismiss} aria-label={T.warnDismiss}
          style={{ ...boxed(CTL_H), width: CTL_H, minWidth: 0, flexShrink: 0, background: 'transparent', border: '1px solid rgba(255,165,2,0.45)', color: WARN_INK, fontFamily: FN, fontSize: 12, cursor: 'pointer', borderRadius: 0, padding: 0 }}>✕</button>
      </div>
      {open && (
        <div data-shot-warn-body style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '2px 0 8px' }}>
          {findings.map((f) => (
            <div key={f.key} style={{ fontFamily: FB, fontSize: 12, color: WARN_INK, lineHeight: 1.45 }}>
              <div className="shot-warn-title" style={{ fontFamily: FN, fontSize: 10, letterSpacing: '0.12em', fontWeight: 700, marginBottom: 2 }}>{T.preflight.keys[f.key] || f.key}</div>
              {f.msg}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

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
  // Switching language repaints every string on the page AND flips the whole
  // layout between LTR and RTL — the biggest single repaint in the app. It gets
  // the same one-image cross-fade as the theme switch (Ohad 2026-08-26: "add
  // the same effect for he/eng transition. everywhere"). flushSync so the new
  // language is committed before the browser captures the "after" snapshot.
  const setLangPersist = (l) => {
    try { localStorage.setItem(LANG_KEY, l); } catch { /* private mode */ }
    crossFade(() => { flushSync(() => setLang(l)); });
  };
  const HAND_KEY = 'expo-shot-hand';
  // Remembered like the shot type: a coach who pins a hand should not have to
  // pin it again next clip.
  const [handMode, setHandMode] = useState(() => {
    try { const v = localStorage.getItem(HAND_KEY); return (v === 'R' || v === 'L') ? v : 'auto'; } catch { return 'auto'; }
  }); // auto | R | L
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
  // 27.9, Ohad: "the hand, shot should both be automatic, unless i manually
  // change it". What CAN be measured honestly is whether he left the floor: a
  // free throw has no jump (median jump rise under 6 cm across the clip's
  // shots). A jump shot keeps his last jump-shot pick (mid / three) - distance
  // is still not measurable (the note above). A tap on a type pins it (manual).
  const SHOTMODE_KEY = 'expo-shot-mode';
  const [shotMode, setShotMode] = useState(() => { try { return localStorage.getItem(SHOTMODE_KEY) === 'manual' ? 'manual' : 'auto'; } catch { return 'auto'; } });
  const [detectedShot, setDetectedShot] = useState(null);
  const [shotType, setShotType] = useState(() => {
    try { const v = localStorage.getItem(SHOTTYPE_KEY); return (v === 'ft' || v === 'mid' || v === 'three') ? v : 'mid'; } catch { return 'mid'; }
  });
  // A height restored from storage IS saved — starting false made a remembered
  // value look unsaved on every load, which is the other half of 'it doesnt get
  // updated'.
  const [heightSaved, setHeightSaved] = useState(() => {
    try { return !!localStorage.getItem('expo-shot-stature'); } catch { return false; }
  });
  // Remember the athlete's height. It was state-only, so every reload lost it
  // and the coach had to retype it before any centimetre reading was real
  // (Ohad 2026-08-26: "there's no saving mechanism and i wrote 177cm").
  const STATURE_KEY = 'expo-shot-stature';
  const [stature, setStature] = useState(() => {
    try { return localStorage.getItem(STATURE_KEY) || ''; } catch { return ''; }
  });
  // A height typed WHILE a clip is analysing used to be lost twice over:
  // analyze() had already closed over the old value, and the blur handler
  // refused to re-score because phase was 'analyzing', not 'results'. The
  // result then read ENTER HEIGHT with the number sitting in the box.
  const statureRef = useRef(stature);
  // What the FOOTAGE can and cannot answer, read off twelve frames before the
  // five-minute capture starts. See src/clipPreflight.js - on his own clip02
  // the release happens above the top edge, and until now that was only
  // discoverable after the whole analysis had already run.
  const [preflight, setPreflight] = useState(null);
  const [pendingUrl, setPendingUrl] = useState(null);
  const [progressLabel, setProgressLabel] = useState('');
  const [srcUrl, setSrcUrl] = useState(null);
  const [progress, setProgress] = useState(0);
  // WATCHDOG (27.9, "always gets stuck on 40%"): the bar may never sit silent.
  // When no progress arrives for 45s the screen names the stage and offers STOP;
  // a stopped run's late result is dropped (runIdRef).
  const runIdRef = useRef(0);
  // STOP must actually stop the capture. It used to only drop the late
  // result: the old capture ran on, and the next analysis shared the phone's
  // CPU with it - which is a real stall of its own.
  const abortRef = useRef(null);
  const lastProgAtRef = useRef(Date.now());
  const [quietFor, setQuietFor] = useState(0);
  useEffect(() => { lastProgAtRef.current = Date.now(); setQuietFor(0); }, [progress, progressLabel]);
  // The clip's object URL is released when the next clip replaces it (a phone
  // recording is held in memory - tens of MB per take - until it is revoked).
  const urlRef = useRef(null);
  const adoptUrl = (url) => {
    const old = urlRef.current;
    urlRef.current = url;
    setSrcUrl(url);
    if (old && old !== url) { try { URL.revokeObjectURL(old); } catch { /* already gone */ } }
  };
  useEffect(() => () => {
    try { abortRef.current?.abort(); } catch { /* noop */ }
    if (urlRef.current) { try { URL.revokeObjectURL(urlRef.current); } catch { /* noop */ } }
  }, []);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(demoResult);
  const [shotIdx, setShotIdx] = useState(0);
  const framesRef = useRef(demoResult?.frames || null);
  const fileRef = useRef(null);
  // A DOM ref (statureRef above holds the VALUE, for analyze's closure).
  const heightBoxRef = useRef(null);
  const streamRef = useRef(null);
  const recRef = useRef(null);
  const chunksRef = useRef([]);
  const liveRef = useRef(null);

  useEffect(() => () => { stopStream(streamRef.current); }, []);

  const analyze = useCallback(async (url, opts = {}) => {
    setError(null); setPhase('analyzing'); setProgress(0); setProgressLabel('');
    lastProgAtRef.current = Date.now();
    const runId = ++runIdRef.current;
    const live = () => runIdRef.current === runId;
    try { abortRef.current?.abort(); } catch { /* noop */ }
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      // Twelve frames, a few seconds, before committing to the long capture.
      // A blocking finding stops here and says what to do with the phone still
      // in his hand; a warning rides along and is shown beside the results.
      if (!opts.skipPreflight) {
        setProgressLabel('checking the clip');
        // Bounded: the preflight is advice, and a phone whose model or video
        // never answers must not hold the real analysis at 0% forever.
        const pf = await Promise.race([
          preflightClip(url, { kind: 'shot', onProgress: (pct) => { if (live()) { lastProgAtRef.current = Date.now(); setProgress(Math.round(pct * 0.1)); } } }),
          new Promise((res) => setTimeout(() => res(null), 60000)),
        ]);
        if (!live()) return;
        // Metadata but a 0x0 picture: the phone has no decoder for this video
        // (HEVC / HDR from another phone). The twelve frames then read as
        // "no one could be tracked", which sends him to re-film a clip that
        // only needed re-exporting.
        if (pf && pf.measured && pf.measured.dims && !pf.measured.dims.w && pf.measured.samples > 0) {
          setError(T.errors.codec); setPhase('idle'); return;
        }
        setPreflight(pf);
        if (pf && !pf.ok) { setPendingUrl(url); setPhase('preflight'); return; }
      }
      // Two-pass ROI capture: find the athlete, then re-run pose on a crop
      // around him at the source frame cadence inside each shot window.
      // opts.deterministic steps the clip frame by frame with seeks instead of
      // reading a playing video. Measured on clip02: 754 frames against 639,
      // 24.5 effective fps against 20.7 on a 24 fps source - i.e. every frame
      // rather than one in six lost - and the shot count is then identical run
      // to run. It is opt-in because a seek costs more on a 60 fps portrait
      // clip, so the fast path stays the default and this is the retry.
      const frames = await captureShotFrames(url, {
        deterministic: opts.deterministic || false,
        signal: ac.signal,
        // Every call is a heartbeat, not only a changed percentage: a slow
        // phone can take a few seconds per whole percent and is still working.
        onProgress: (pct, label) => { if (!live()) return; lastProgAtRef.current = Date.now(); setProgress(pct); if (label) setProgressLabel(label); },
      });
      if (!live()) return;
      framesRef.current = frames;
      // The detailed model did not load in time and the fast one read the
      // shots - the numbers stand, but say they are the coarser read.
      if (frames.stats && frames.stats.fineModel === 'lite') toast(T.liteModel, 'info', { ttl: 9000 });
      // Read the shooting hand off the clip unless the coach pinned one.
      const auto = detectShootingHand(frames);
      if (auto) setDetectedHand(auto);
      const useHand = opts.hand || (handMode === 'auto' ? (auto || hand) : handMode);
      let r = analyzeShotClip(frames, { hand: useHand, statureCm: Number(opts.stature ?? statureRef.current) || null, shotType: opts.shotType || shotType });
      if (!r.ok) { setError(r.error); setPhase('idle'); return; }
      if (shotMode === 'auto' && !opts.shotType) {
        const jumps = (r.shots || []).map((x) => x && x.info && x.info.jumpRiseCm).filter((v) => typeof v === 'number' && isFinite(v)).sort((a, b) => a - b);
        if (jumps.length) {
          const med = jumps[Math.floor(jumps.length / 2)];
          let lastJump = 'mid';
          try { const v = localStorage.getItem(SHOTTYPE_KEY); if (v === 'mid' || v === 'three') lastJump = v; } catch { /* private mode */ }
          const det = med < 6 ? 'ft' : lastJump;
          setDetectedShot(det);
          if (det !== (opts.shotType || shotType)) {
            const r2 = analyzeShotClip(frames, { hand: useHand, statureCm: Number(opts.stature ?? statureRef.current) || null, shotType: det });
            if (r2.ok) r = r2;
          }
          setShotType(det);
        }
      }
      setResult(r); setShotIdx(0); setPhase('results');
    } catch (e) {
      if (!live() || e?.code === 'aborted') return;
      setError((e?.code && T.errors[e.code]) || e?.message || T.errors.failed); setPhase('idle');
    }
  }, [hand, handMode, stature, shotType, shotMode, T]);
  useEffect(() => {
    if (phase !== 'analyzing') return undefined;
    const iv = setInterval(() => setQuietFor(Math.round((Date.now() - lastProgAtRef.current) / 1000)), 1000);
    // KEEP THE SCREEN ON. The capture takes minutes and a phone locks its
    // screen after 30-60 s without a touch - the page is then hidden, the
    // browser pauses the video, and the bar freezes wherever it was. The Screen
    // Wake Lock holds the screen on while this screen is analysing; where the
    // browser does not offer it, the line under the bar asks for it instead.
    let lock = null, gone = false;
    const acquire = async () => {
      try {
        if (gone || lock || !navigator.wakeLock || document.visibilityState !== 'visible') return;
        const l = await navigator.wakeLock.request('screen');
        if (gone) { l.release().catch(() => {}); return; }
        lock = l;
        // The browser drops the lock itself when the page is hidden.
        l.addEventListener('release', () => { if (lock === l) lock = null; });
      } catch { /* refused (battery saver) - the on-screen line covers it */ }
    };
    // Time spent in another app is not a stall: the capture waits for the
    // page to come back, so the watchdog restarts its count when it does.
    const onVis = () => { if (document.visibilityState === 'visible') { lastProgAtRef.current = Date.now(); setQuietFor(0); acquire(); } };
    acquire();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      gone = true;
      clearInterval(iv);
      document.removeEventListener('visibilitychange', onVis);
      if (lock) { lock.release().catch(() => {}); lock = null; }
    };
  }, [phase]);
  const stopRun = () => { runIdRef.current++; try { abortRef.current?.abort(); } catch { /* noop */ } setPhase('idle'); setProgress(0); setProgressLabel(''); };

  // Re-score the SAME frames when the hand / stature changes after analysis —
  // no re-capture needed.
  // SAY that it re-scored. Ohad: "they're not working or affecting anything",
  // twice. They were working - measured on the real tool, switching MID-RANGE to
  // FREE THROW moved the verdict from "5 to fix / 3 OK" to "4 to fix / 4 OK" and
  // rewrote every checkpoint target. But the six big readings are MEASUREMENTS
  // of his body, so they cannot move when the shot type changes; only the
  // judgements do, and those live in a small line and inside collapsed rows.
  // From his seat the button did nothing. A control that changes something
  // invisible is indistinguishable from a dead one, so it now confirms itself
  // the same way the height box already does.
  const flashRef = useRef(null);
  const [rescored, setRescored] = useState(false);
  useEffect(() => () => clearTimeout(flashRef.current), []);
  // SAVE (button or Enter): remember the height, and on the results screen
  // re-score the same frames with it. Leaving the box no longer saves by itself
  // - the button is the save.
  const saveHeight = (rescoreToo) => {
    const v = String(statureRef.current ?? stature).trim();
    if (!v) return;
    try { localStorage.setItem(STATURE_KEY, v); } catch { /* private mode */ }
    if (rescoreToo) rescore(hand, v, shotType);
    setHeightSaved(true);
  };
  const rescore = (h, st, type) => {
    const frames = framesRef.current; if (!frames) return;
    const r = analyzeShotClip(frames, { hand: h, statureCm: Number(st) || null, shotType: type || shotType });
    if (r.ok) {
      setResult(r);
      setRescored(true);
      clearTimeout(flashRef.current);
      flashRef.current = setTimeout(() => setRescored(false), 2200);
    } else toast(r.error, 'error');
  };

  const pickFile = () => fileRef.current?.click();
  const onFile = (f) => { if (!f) return; const url = URL.createObjectURL(f); adoptUrl(url); analyze(url); };

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
        const url = URL.createObjectURL(blob); adoptUrl(url); analyze(url);
      };
      recRef.current = rec; rec.start(200);
    } catch (e) { setError((T === SHOT_I18N.he ? 'המצלמה לא זמינה: ' : 'Camera unavailable: ') + (e?.message || e)); setPhase('idle'); }
  };
  const stopRecording = () => { try { recRef.current?.stop(); } catch { /* noop */ } };
  const reset = () => { setResult(null); setPhase('idle'); setError(null); adoptUrl(null); framesRef.current = null; setPreflight(null); setPendingUrl(null); };

  const shot = result?.shots?.[shotIdx] || null;

  return (
    <div className="shot-stage" data-phase={phase} style={stage} dir={T.dir}>
      {/* The top bar is the PARENT's, and it is on screen before any clip is
          analysed - so its rules cannot live in the results stylesheet. */}
      <style>{`
        /* ONE GUTTER (28.9 #388, "ocd order ... vertically, horizontally"):
           every bar, strip and column starts on the same x - 16px on a phone,
           24 on a tablet, 32 on a desktop. The top bar used 14, the warning
           strip 14, the results 16. */
        .shot-stage { --g: 16px; }
        @media (min-width: 621px) { .shot-stage { --g: 24px; } }
        @media (min-width: 980px) { .shot-stage { --g: 32px; } }
        @media (max-width: 620px) {
          /* The spacer pushes the controls right on one desktop row. Once the
             bar wraps it just eats the leading space of whatever row it lands
             on. */
          .shot-bar-spacer { display: none !important; }
          /* The label indent separates groups on ONE line; once each group
             owns a row it is only a ragged left edge. */
          .shot-ctl-group { margin-inline-start: 0 !important; }
          .shot-ctl-group > span:first-child { margin-inline-start: 0 !important; }
          /* ONE ROW PER GROUP, EVERY CHIP ONE LINE (27.9 #300 O10): "FREE
             THROW" and "MID-RANGE" broke onto two lines at 390. Each group is
             the same grid - a label column and four equal cells - so AUTO
             sits over AUTO, and a chip whose full word would not fit its cell
             shows the court's short form (FT / MID / 3PT) at the same size. */
          .shot-ctl-group { display: grid !important; grid-template-columns: 64px repeat(4, minmax(0, 1fr)); column-gap: 8px !important; width: 100%; }
          .shot-ctl-group > button { min-width: 0; padding: 0 6px !important; }
          .shot-ctl-group > input { width: 100% !important; }
          /* HEIGHT row: the box sits under AUTO, its confirmation spans the
             three cells beside it - same columns as HAND and SHOT above. */
          .shot-ctl-note { grid-column: 3 / -1; min-width: 0 !important; }
        }
        /* WHAT AUTO PICKED is lit like a manual pick (Ohad 08-24: "i want the
           r/l hand in that menu to be hilighted like i manually chose it"), and
           said ONCE: the old labels said it twice ("AUTO · RIGHT" on one chip,
           "RIGHT · AUTO" on the next - 27.9 #361). AUTO lit = the setting; the
           lit side / type = what AUTO is reading. */
        /* Tracking belongs to Latin capitals; spread Hebrew letters read as
           separate glyphs and cost the width that keeps a word on one row. */
        .shot-stage[dir="rtl"] .shot-ctl-group > button { letter-spacing: 0 !important; }
        /* ONE SCROLLER ON A PHONE (27.9, "i cannot scroll lower than this at
           all"). Below the desktop split the stage was a fixed column: the top
           bar and the clip warnings never scrolled, the results scrolled in
           what was left, and the rep header was sticky inside that - on a
           360px phone the header alone was taller than the space left for it,
           so every scroll slid the page UNDER the header and the screen never
           changed. Now the stage itself scrolls, top to bottom, from a touch
           anywhere on it, and nothing sticks. */
        @media (max-width: 979px) {
          .shot-stage[data-phase="results"] { display: block !important; overflow-y: auto; overflow-x: hidden; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; }
          .shot-stage[data-phase="results"] .shot-wrap { overflow: visible !important; flex: none !important; }

        }
      `}</style>
      {/* top bar */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '10px var(--g)', borderBottom: '1px solid rgba(255,255,255,0.12)', background: 'rgba(0,0,0,0.92)', flexWrap: 'wrap' }}>
        <button onClick={onClose} style={{ ...ghost, ...boxed(CTL_SM), padding: '0 12px', fontSize: 10 }}>{T.back}</button>
        <div style={{ fontFamily: FN, fontSize: 13, fontWeight: 700, letterSpacing: '0.18em', color: CYAN }}>{lang === 'he' && T.toolTitle ? T.toolTitle : toolLabel}</div>
        <button onClick={() => setLangPersist(lang === 'he' ? 'en' : 'he')} title={T.langTitle} style={{ ...chip(false), fontSize: 10 }}>{T.langBtn}</button>
        <div className="shot-bar-spacer" style={{ flex: 1 }} />
        {/* SHOWN ONLY WITH A RESULT (27.9, Ohad: "all of this needs to be
            invisible and automatically detected as the video is being loaded.
            then it needs to be shown only after analyzed"). Hand and shot are
            detected; height is asked on the progress screen; here they are the
            overrides, and every change re-scores the same frames.
            ONE SYSTEM (27.9, "the top buttons hand/shot/auto is all a mess.
            perfect ocd order that makes sense"): the FILLED chip is the setting
            - AUTO, or the side / type he pinned. While AUTO is set, the option
            it is using carries a dot, once, and nothing else says "auto". The
            dot keys off what the reading is actually taken on (`hand`,
            `shotType`), so a clip where the side could not be read still shows
            which side is in use - and its tooltip says it was a fallback, never
            a detection. */}
        {phase === 'results' && (<>
        <span className="shot-ctl-group" style={{ display: 'inline-flex', alignItems: 'center', gap: 12, flexWrap: 'nowrap' }}>
        <span style={lbl}>{T.hand}</span>
        <button
          onClick={() => { setHandMode('auto'); try { localStorage.setItem(HAND_KEY, 'auto'); } catch { /* private mode */ } const h = detectedHand || 'R'; rescore(h, stature, shotType); }}
          title={T.autoHint}
          style={chip(handMode === 'auto')}><SegWord full={T.auto} short={T.auto} /></button>
        {[['R', T.right], ['L', T.left]].map(([k, label]) => {
          const picked = handMode === 'auto' && hand === k;
          return (
            <button key={k} data-auto-pick={picked ? '1' : undefined} className={picked ? 'shot-auto-pick' : undefined}
              onClick={() => { setHandMode(k); try { localStorage.setItem(HAND_KEY, k); } catch { /* private mode */ } rescore(k, stature, shotType); }}
              title={picked ? (detectedHand === k ? T.autoPicked : T.autoFallback) : T.handHint}
              style={chip(handMode === k || picked)}><SegWord full={label} short={label} /></button>
          );
        })}
        </span>
        <span className="shot-ctl-group" style={{ display: 'inline-flex', alignItems: 'center', gap: 12, flexWrap: 'nowrap' }}>
        <span style={{ ...lbl, marginInlineStart: 10 }}>{T.shot}</span>
        <button
          onClick={() => { setShotMode('auto'); try { localStorage.setItem(SHOTMODE_KEY, 'auto'); } catch { /* private mode */ } if (detectedShot) { setShotType(detectedShot); rescore(hand, stature, detectedShot); } }}
          title={T.autoHint}
          style={chip(shotMode === 'auto')}><SegWord full={T.auto} short={T.auto} /></button>
        {SHOT_TYPES.map((t) => {
          const picked = shotMode === 'auto' && shotType === t.key;
          return (
            <button key={t.key} data-auto-pick={picked ? '1' : undefined} className={picked ? 'shot-auto-pick' : undefined}
              onClick={() => { setShotMode('manual'); setShotType(t.key); try { localStorage.setItem(SHOTMODE_KEY, 'manual'); localStorage.setItem(SHOTTYPE_KEY, t.key); } catch { /* private mode */ } rescore(hand, stature, t.key); }}
              title={picked ? (detectedShot === t.key ? T.autoPicked : T.autoFallback) : T.shotHint}
              style={chip(shotType === t.key)}><SegWord full={(T.shotTypes[t.key] || t.label).toUpperCase()} short={((T.shotTypesShort || {})[t.key] || T.shotTypes[t.key] || t.label).toUpperCase()} /></button>
          );
        })}
        </span>
        <span className="shot-ctl-group" style={{ display: 'inline-flex', alignItems: 'center', gap: 12, flexWrap: 'nowrap' }}>
        <span style={{ ...lbl, marginInlineStart: 10 }}>{T.height}</span>
        <input ref={heightBoxRef} value={stature}
          onChange={(e) => { statureRef.current = e.target.value; setStature(e.target.value); setHeightSaved(false); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveHeight(true); } }}
          placeholder={T.cmPlaceholder} inputMode="numeric"
          style={{ width: 56, height: CTL_SM, boxSizing: 'border-box', background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.35)', color: '#FFF', fontFamily: FN, fontSize: 12, padding: '0 2px', textAlign: 'center', outline: 'none' }} />
        {/* ONE slot after the box: SAVE, then the check. A hand / shot-type
            re-score shows the same check (it used to be a RESCORED flash that
            took a row of its own on a phone). */}
        <span className="shot-ctl-note" style={{ display: 'inline-flex', alignItems: 'center', minWidth: 0 }}>
          <HeightSave saved={heightSaved || rescored} empty={!String(stature).trim()} onSave={() => saveHeight(true)} T={T} />
        </span>
        </span>
        </>)}
      </div>

      {/* body */}
      {phase === 'idle' && (
        <div style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--g)' }}>
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

      {phase === 'preflight' && preflight && (
        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--g)', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* The class, not just the inline colour: a light-theme rule in
              themes.css repaints EVERY inline letter-spacing:0.18em label in
              the AA-on-white cyan with !important, which on this black stage
              turned the warning into an ordinary heading. */}
          <div className="shot-warn-title" style={{ fontFamily: FN, fontSize: 13, letterSpacing: '0.18em', fontWeight: 700, color: '#FFA502' }}>
            {T.preflight.title}
          </div>
          <div style={{ fontFamily: FB, fontSize: 13, color: 'rgba(255,255,255,0.72)', lineHeight: 1.5 }}>
            {T.preflight.lede}
          </div>
          {preflight.findings.map((f) => (
            <div key={f.key} style={{
              border: `1px solid ${f.level === 'block' ? 'rgba(255,71,87,0.55)' : 'rgba(255,165,2,0.5)'}`,
              padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6,
            }}>
              <div style={{ ...lbl, color: f.level === 'block' ? '#FF4757' : '#FFA502' }}>
                {T.preflight.keys[f.key] || f.key}
              </div>
              <div style={{ fontFamily: FB, fontSize: 13, color: '#fff', lineHeight: 1.5 }}>{f.msg}</div>
            </div>
          ))}
          {/* The measurements behind the verdict, so it can be argued with. */}
          <div style={{ fontFamily: FN, fontSize: 10, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.08em', lineHeight: 1.7 }}>
            {T.preflight.measuredLabel}: {preflight.measured.withBody}/{preflight.measured.samples} frames tracked
            {preflight.measured.medianBodyHeight != null ? ` · body ${Math.round(preflight.measured.medianBodyHeight * 100)}% of frame` : ''}
            {preflight.measured.minHeadY != null ? ` · ${Math.round(preflight.measured.minHeadY * 100)}% above his head` : ''}
            {preflight.measured.dims ? ` · ${preflight.measured.dims.w}x${preflight.measured.dims.h}` : ''}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button onClick={reset} style={big('#FFA502')}>{T.preflight.refilm}</button>
            {/* Never a hard stop. He may know something the twelve frames do not. */}
            <button onClick={() => { const u = pendingUrl; if (u) analyze(u, { skipPreflight: true }); }}
              style={{ ...big('transparent'), color: 'rgba(255,255,255,0.75)', border: '1px solid rgba(255,255,255,0.3)' }}>
              {T.preflight.anyway}
            </button>
          </div>
        </div>
      )}

      {phase === 'analyzing' && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
          <div style={{ fontFamily: FN, fontSize: 13, letterSpacing: '0.18em', fontWeight: 700 }}>{(T.progress[progressLabel] || T.progress[''] || progressLabel).toUpperCase()}…</div>
          <div style={{ width: 220, height: 4, background: 'rgba(255,255,255,0.15)', marginTop: 16 }}><div style={{ width: `${progress}%`, height: '100%', background: CYAN, transition: 'width 120ms' }} /></div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 8, fontFamily: FN, letterSpacing: '0.12em' }}>{progress}%</div>
          {/* HEIGHT, ASKED WHILE IT READS (27.9: "the height needs to be asked
              before upload is commited or right after it"). The capture takes
              minutes and height is only used at the scoring step at the end,
              so asking here costs nothing and the result comes back in cm. */}
          <label style={{ marginTop: 26, display: 'flex', alignItems: 'center', gap: 10, fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', color: 'rgba(255,255,255,0.7)' }}>
            {T.height}
            <input value={stature} inputMode="numeric" placeholder={T.cmPlaceholder}
              onChange={(e) => { statureRef.current = e.target.value; setStature(e.target.value); setHeightSaved(false); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveHeight(false); } }}
              style={{ width: 64, height: 'var(--btn-h)', boxSizing: 'border-box', background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.45)', color: '#FFF', fontFamily: FN, fontSize: 14, textAlign: 'center' }} />
          </label>
          <div style={{ marginTop: 10 }}><HeightSave saved={heightSaved} empty={!String(stature).trim()} onSave={() => saveHeight(false)} T={T} /></div>
          {/* The one thing that stalls a phone mid-capture is the phone
              leaving the page - so say it before it happens. */}
          <div data-shot-keep-on style={{ marginTop: 18, maxWidth: 300, textAlign: 'center', fontFamily: FB, fontSize: 12, color: 'rgba(255,255,255,0.55)', lineHeight: 1.5 }}>{T.keepOn}</div>
          {quietFor >= 45 && (
            <div data-shot-stalled style={{ marginTop: 18, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, maxWidth: 300, textAlign: 'center' }}>
              <div style={{ fontFamily: FN, fontSize: 10, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>
                {T.stalled(T.progress[progressLabel] || T.progress[''], quietFor)}
              </div>
              <button onClick={stopRun} style={{ height: 'var(--btn-h)', padding: '0 18px', background: 'transparent', color: '#FFF', border: '1px solid rgba(255,255,255,0.4)', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', cursor: 'pointer' }}>{T.stopRun}</button>
            </div>
          )}
        </div>
      )}

      {/* A clip that only WARNS still analyses - but the warning has to travel
          with the numbers, or the coach reads a launch angle that the framing
          made unreliable and never learns why. */}
      {/* ONE LINE until asked (27.9, "the too far away is always shown, i
          don't need it capturing half the screen constantly"). Keyed on the
          clip, so a dismissal lasts for this clip and the next clip's
          warnings arrive fresh. */}
      {phase === 'results' && preflight && preflight.findings.some((f) => f.level === 'warn') && (
        <ClipWarnings key={srcUrl || 'clip'} findings={preflight.findings.filter((f) => f.level === 'warn')} T={T} />
      )}

      {phase === 'results' && result && shot && (
        <ShotResults result={result} shot={shot} shotIdx={shotIdx} setShotIdx={setShotIdx} srcUrl={srcUrl} frames={framesRef.current} hand={hand} onReset={reset} T={T} shotType={shotType}
          onNeedHeight={() => { const el = heightBoxRef.current; if (el) { el.scrollIntoView({ block: 'nearest' }); el.focus(); el.select(); } }} />
      )}

      <input ref={fileRef} type="file" accept="video/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; onFile(f); }} />
    </div>
  );
}

// ------------------------------------------------------------------ results
function ShotResults({ result, shot: rawShot, shotIdx, setShotIdx, srcUrl, frames, hand, onReset, T, shotType, onNeedHeight }) {
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
  // MAKES. The analyser scores mechanics; it has never seen the rim, so it
  // cannot know whether a shot went in - and it must not guess. The coach marks
  // each detected shot MADE or MISSED and the counter is exactly those marks,
  // nothing inferred. (Ohad, 2026-09-07: "can you also add a makes/shots
  // counter".) Keyed by the shot's own index so it survives re-scoring.
  const [made, setMade] = useState({});
  const madeCount = Object.values(made).filter((v) => v === true).length;
  const unmarkedCount = result.shots.filter((x) => made[x.index] === undefined).length;
  // RESET ON A NEW SHOT LIST, NOT A RE-SCORE (AUDIT-470): saving his height,
  // switching hand or shot type makes a new `result` for the SAME shots - and
  // wiped every mark, his own taps and a multi-minute rim check with them. The
  // shots' identity is their index + release frame; only a change there resets.
  const shotSig = (result.shots || []).map((x) => `${x.index}@${x.cycle ? x.cycle.release : ''}`).join(',') + `|${result.aspect || ''}`;
  useEffect(() => { setMade({}); }, [shotSig]);
  // AUTO MAKES (29.9 #430): the coach taps the rim's two edges once; rimJudge
  // reads the rim around every shot and pre-fills MADE (and MISSED on a clear
  // rebound). His tap always wins; an overridden call loses its AUTO tag.
  const [auto, setAuto] = useState({});          // shot index -> { outcome, confidence, evidence, overridden }
  const [rimTap, setRimTap] = useState(null);    // null | [] | [pt] while tapping
  const [autoRun, setAutoRun] = useState(null);  // null | 0-100 | 'done' | { error }
  // a run belongs to the result it started on: a new clip (or leaving the page)
  // stops it, and a late answer never lands on another clip's shots
  const autoTokenRef = useRef(0);
  // which marks the rim check filled (a REDO may replace those) - the coach's
  // own taps are never in here, and never replaced
  const autoFilledRef = useRef(new Set());
  const autoStatsRef = useRef(null);             // the last check's seek counts (a gate reads data-auto-seeks)
  const madeRef = useRef(made); madeRef.current = made;
  useEffect(() => { autoTokenRef.current++; autoFilledRef.current = new Set(); setAuto({}); setRimTap(null); setAutoRun(null); }, [shotSig]);   // a re-score keeps a running check and its marks
  useEffect(() => () => { autoTokenRef.current++; }, []);
  const markShot = (idx, val) => { autoFilledRef.current.delete(idx); setMade((m) => ({ ...m, [idx]: val })); setAuto((a) => (a[idx] ? { ...a, [idx]: { ...a[idx], overridden: true } } : a)); };
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

  // A TABLE CELL IS A JUMP (29.9 #432, Ohad: "if i click on release 85 on rep 9
  // it should move me in the clip to release sec frame on rep 9 ... and the
  // buttons should be updated"): select the rep AND the phase; the shot-change
  // effect above seeks to that phase's frame, and the phase chips follow
  // phaseKey. Same rep = seek straight there.
  const jumpTo = (i, key) => {
    const sh = result.shots[i]; if (!sh) return;
    setPhaseKey(key);
    if (i === shotIdx) { const p = sh.phases.find((x) => x.key === key); seekTo(p ? p.idx : sh.cycle.release); }
    else setShotIdx(i);
  };
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

  const [reportTab, setReportTab] = useState('shot');
  const rd = frameReadout(series, cur);
  // ONE LIT PHASE, the one he picked (27.9, "release and apex buttons are
  // tagged and always turn off/on together"). Each chip used to light on
  // `cur === p.idx`, and on a set shot the release lands on the jump apex's
  // own frame (the engine allows 0-3 frames between them), so two chips shared
  // one frame and lit as a pair. The frame can be shared; the selection is
  // not: the chosen phase wins when it sits on this frame, otherwise the
  // first phase that does.
  const atCur = shot.phases.filter((p) => p.idx === cur);
  const activePhaseKey = atCur.some((p) => p.key === phaseKey) ? phaseKey : (atCur[0] ? atCur[0].key : null);
  const phaseAt = shot.phases.find((p) => p.key === activePhaseKey) || null;
  const tMs = series.tMs[cur];
  const sc = ST[stKey(shot.score)];
  // WHAT IS EACH FAULT ACTUALLY COSTING?
  //
  // The score is a WEIGHTED mean and the weights are not equal — 0.7 to 1.2 —
  // so the faults are not worth the same to fix. Set point height is worth
  // +11.5 points and trunk at release +6.7, nearly half. The guide listed them
  // in definition order, so a coach working top-down could spend a session on
  // the cheapest fault on the board.
  //
  // Recoverable points for a check = its weight, times how far its status is
  // from ok, over the weight actually in play. Same arithmetic the score uses,
  // so the numbers add up to the difference they claim.
  const gainOf = (() => {
    const S = { ok: 1, watch: 0.55, fix: 0.1 };
    const wsum = shot.checks.reduce((a, c) => a + (S[c.status] == null ? 0 : c.weight), 0);
    return (c) => {
      const sc = S[c.status];
      if (sc == null || !wsum) return 0;
      return Math.round((c.weight * (1 - sc)) / wsum * 100 * 10) / 10;
    };
  })();
  const byGain = (a, b) => gainOf(b) - gainOf(a);
  const fixes = shot.checks.filter((c) => c.status === 'fix').sort(byGain);
  const watches = shot.checks.filter((c) => c.status === 'watch').sort(byGain);
  // (the vs-last-saved comparison was removed 29.9 #433)

  // SAVE wrote to localStorage and NOTHING ever read it back, so from the
  // coach's seat the button did nothing at all (Ohad 08-30: "the save button
  // doesnt save anything"). The stored list is rendered below now, and this
  // counter is what makes it repaint after a write.
  const [savedTick, setSavedTick] = useState(0);
  // THESE WERE ONLY EVER ON ONE DEVICE, AND EVICTABLE.
  //
  // Saved analyses lived in localStorage alone: invisible from his laptop if he
  // shot on his phone, gone with the browser data, and - worst - first in line
  // for the quota evictor in supabase.js, which deletes the BIGGEST expo- key to
  // make room for the auth token. Fifty analyses is exactly that key. They are
  // excluded from eviction now AND mirrored to the server, so the list is the
  // union of both and the device is no longer the only copy.
  const [cloudSaved, setCloudSaved] = useSupaStore(SAVE_KEY, []);
  const saved = useMemo(() => {
    let local = [];
    try {
      const all = JSON.parse(localStorage.getItem(SAVE_KEY) || '[]');
      local = Array.isArray(all) ? all : [];
    } catch { /* unreadable device copy - the server one still stands */ }
    const cloud = Array.isArray(cloudSaved) ? cloudSaved : [];
    const byDate = new Map();
    for (const a of [...cloud, ...local]) if (a && typeof a.score === 'number' && a.date) byDate.set(a.date, a);
    return [...byDate.values()].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }, [savedTick, cloudSaved]);
  const dropSaved = (date) => {
    try {
      const all = JSON.parse(localStorage.getItem(SAVE_KEY) || '[]');
      localStorage.setItem(SAVE_KEY, JSON.stringify(all.filter((a) => a && a.date !== date)));
    } catch { /* nothing to remove on the device */ }
    // Remove it from the durable copy too, or it comes straight back.
    setCloudSaved((prev) => (Array.isArray(prev) ? prev : []).filter((a) => a && a.date !== date));
    setSavedTick((v) => v + 1);
  };
  const save = () => {
    try {
      const all = JSON.parse(localStorage.getItem(SAVE_KEY) || '[]');
      const row = { date: new Date().toISOString(), hand, score: shot.score, shots: result.shots.length, makes: madeCount, marked: result.shots.length - unmarkedCount, checks: shot.checks.map((c) => ({ key: c.key, value: c.value, status: c.status })), info: shot.info };
      all.unshift(row);
      localStorage.setItem(SAVE_KEY, JSON.stringify(all.slice(0, 50)));
      // The durable copy. Written after the device one so a failed network call
      // cannot cost him the analysis he just took.
      setCloudSaved((prev) => [row, ...(Array.isArray(prev) ? prev : [])].slice(0, 50));
      setSavedTick((v) => v + 1);
      toast(T.savedToast, 'success');
    } catch { toast(T.saveFail, 'error'); }
  };
  const copySummary = async () => {
    // Building the text used to sit OUTSIDE the try. Only about half the
    // checkpoint definitions carry `how`, so the first fix-item without one
    // threw on `for (const h of c.how)` and the button did nothing at all: no
    // copy, no toast, no error. Everything that can throw is inside the guard
    // now, and the clipboard has a fallback for when the async API is refused.
    let text = '';
    try {
      const L = [T.copyHead(shot.score ?? '—', hand === 'L' ? T.handWordL : T.handWordR)];
      for (const c of shot.checks) L.push(`${(ST[c.status] || STATUS.na).label.padEnd(5)} ${c.label}: ${c.display} (${c.target})`);
      if (fixes.length) {
        L.push('', T.copyFixFirst);
        for (const c of fixes) {
          L.push(`• ${c.label}${c.why ? ` — ${c.why}` : ''}`);
          for (const h of (c.how || [])) L.push(`   - ${h}`);
        }
      }
      text = L.join('\n');
    } catch { toast(T.copyFail, 'error'); return; }
    try {
      await navigator.clipboard.writeText(text);
      toast(T.copiedToast, 'success');
      return;
    } catch { /* fall through to the textarea path */ }
    // copyGuard blocks document-level copy events but exempts form fields, so a
    // real textarea is the one path that still works when the async API fails.
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      toast(ok ? T.copiedToast : T.copyFail, ok ? 'success' : 'error');
    } catch { toast(T.copyFail, 'error'); }
  };

  return (
    <div className="shot-wrap" style={{ flex: 1, overflow: 'auto', WebkitOverflowScrolling: 'touch' }} data-allow-copy>
      <style>{`
        /* PRINT.
           The tool renders on a fixed, always-dark stage: white text on #000.
           Browsers drop backgrounds when printing, so the report came out as
           white text on white paper - which is what "the print button doesnt
           work good" looked like. A fixed container also prints only its first
           screenful. So printing gets its own document: static flow, ink on
           white, and rows that do not split across a page break. */
        @media print {
          .shot-noprint { display: none !important; }
          .shot-print { padding: 0 !important; }
          .shot-stage {
            position: static !important; inset: auto !important; height: auto !important;
            background: #FFF !important; color: #000 !important; z-index: auto !important;
            display: block !important;
          }
          .shot-wrap { overflow: visible !important; height: auto !important; flex: none !important; }
          .shot-stage * { color: #000 !important; background-color: transparent !important; }
          /* Status dots and score rings carry meaning in their colour, so keep
             their borders - the text is what has to be legible in ink. */
          .shot-stage [style*="border"] { border-color: #999 !important; }
          .shot-results { display: block !important; }
          .shot-left, .shot-right { max-width: 100% !important; width: 100% !important; }
          .shot-video { break-inside: avoid; page-break-inside: avoid; max-height: 340px !important; }
          .shot-readout { break-inside: avoid; page-break-inside: avoid; }
          /* A checkpoint and its explanation belong on the same page. */
          .shot-check-row { break-inside: avoid; page-break-inside: avoid; }
          /* The sticky header must not repeat down the page. */
          .shot-head { border-bottom: 1px solid #999 !important; }
          svg polyline { stroke: #000 !important; }
          @page { margin: 12mm; }
        }
        /* One screen, no page scroll: the video column and the report column
           each scroll on their own, and the video is capped vertically so the
           transport, the read-out and the actions all sit above the fold
           (Ohad 08-24: "i want everything to fit without scrolling"). */
        /* (top-bar mobile rules live in the PARENT — this block only
           renders once there are results.) */
        /* CHECKPOINT ROWS (28.9 #388). One grid, named areas, the same seven
           pieces at every width: dot, name, target, status (+ the points it is
           worth), value, the frame jump, the chevron. The status is plain
           coloured text (CLAUDE.md: badges add padding that breaks alignment);
           the only bordered thing in a row is the 36px jump.
           Wide: name / target on the left, value · status · jump · chevron each
           in a fixed column spanning both lines, so every row shares its x's. */
        .shot-check-grid { display: grid; grid-template-columns: 8px minmax(0, 1fr) 112px 96px 36px 12px;
          grid-template-areas: "d n v m j c" "d t v m j c"; column-gap: 12px; row-gap: 2px; align-items: center; padding: 12px; cursor: pointer; }
        /* Phone: the name gets the row (jump + chevron beside it), then status
           · points ...... value, then the target in full. */
        @media (max-width: 620px) {
          .shot-check-grid { grid-template-columns: 8px minmax(0, 1fr) auto 36px 12px;
            grid-template-areas: "d n n j c" ". m v j c" ". t t t t"; column-gap: 10px; row-gap: 4px; }
        }
        /* EIGHT tiles in each grid, so 2 x 4 on a phone and 4 x 2 from a tablet
           up - never a row with an empty cell (28.9 #388). */
        @media (min-width: 621px) {
          .shot-readout, .shot-info { grid-template-columns: repeat(4, minmax(0, 1fr)) !important; }
        }
        /* STACKED (below the desktop split) the player column takes the full
           width, so its right edge is the report's right edge (820: the player
           stopped at 640 while the report below ran to 772). */
        @media (max-width: 979px) {
          .shot-left, .shot-right { max-width: none !important; flex-basis: 100% !important; }
        }
        @media (min-width: 980px) {
          .shot-wrap { overflow: hidden !important; }
          /* THE HEADER ABOVE, TWO COLUMNS BELOW THAT END ON ONE LINE (29.9 #428,
             "the right and left parts of the page needs to end in the same
             vertical spot"): the body fills the stage, the columns stretch to
             the same height and each scrolls inside it. */
          .shot-body { height: 100%; min-height: 0; }
          .shot-head { grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr) minmax(0, 0.8fr) !important; align-items: center; column-gap: calc(var(--g) * 1.5) !important; }
          .shot-results { flex: 1 1 auto; flex-wrap: nowrap !important; min-height: 0; align-items: stretch !important; }
          .shot-tabs { position: sticky; top: 0; z-index: 3; background: #000; padding-bottom: 2px; }
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
          .shot-readout, .shot-info { grid-template-columns: repeat(4, minmax(0, 1fr)) !important; }
        }
      `}</style>
      <div className="shot-print shot-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--g)', maxWidth: 1440, margin: '0 auto', padding: 'var(--g)', boxSizing: 'border-box' }}>
          <div className="shot-head" data-shot-head style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12, paddingBottom: 'var(--g)', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '76px minmax(0, 1fr)', columnGap: 14, alignItems: 'center' }}>
              <div data-shot-ring style={{ width: 76, height: 76, boxSizing: 'border-box', borderRadius: '50%', border: `4px solid ${sc.color}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontFamily: FN, fontSize: 24, fontWeight: 700, lineHeight: 1 }}>{shot.score ?? '—'}</div>
                <div style={{ ...lbl, fontSize: 8 }}>/ 100</div>
              </div>
              <div data-shot-verdict style={{ minWidth: 0 }}>
                <div style={{ fontFamily: FN, fontSize: 15, fontWeight: 700, letterSpacing: '0.04em', lineHeight: 1.3 }}>
                  {shot.score == null ? T.verdictNa : shot.score >= 80 ? T.verdictOk : shot.score >= 60 ? T.verdictMid : T.verdictLow}
                </div>
                <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, marginTop: 3, lineHeight: 1.5 }}>
                  {T.summary(fixes.length, watches.length, shot.checks.length - fixes.length - watches.length, T.quality[result.quality] || result.quality, Math.round((result.coverage || 0) * 100), result.fps)}
                </div>
              </div>
            </div>
            {result.shots.length > 1 && (() => {
              // WHICH SHOT AM I LOOKING AT - the scorecard below is ALWAYS the
              // selected one, the session panel is all of them.
              // ONE ROW (27.9, "the left and right arrow and buttons are very
              // needlessly big and on different rows"): back, "SHOT 10 / 11",
              // forward. The arrows mirror in Hebrew - back is on the right.
              const N = result.shots.length;
              const flip = T.dir === 'rtl' ? 'scaleX(-1)' : 'none';
              const arrow = (disabled) => ({ ...chip(false), width: CTL_H, minWidth: 0, padding: 0, opacity: disabled ? 0.35 : 1, cursor: disabled ? 'default' : 'pointer' });
              const chev = <svg aria-hidden viewBox="0 0 6 10" fill="none" width="6" height="10" style={{ transform: flip }}><path d="M5 1L1 5l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
              // BALANCED rows (27.9, "the 1-11 numbers should not leave one box
              // on its own in a new row"): at most eight to a row, and the
              // shots spread evenly over the rows that needs - 11 is 6 + 5,
              // 17 is 6 + 6 + 5 - so no row is ever a lone cell.
              const rows = Math.ceil(N / 8);
              const cols = Math.ceil(N / rows);
              return (
                <div className="shot-noprint" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div data-shot-nav style={{ display: 'grid', gridTemplateColumns: `${CTL_H}px minmax(0, 1fr) ${CTL_H}px`, alignItems: 'center', columnGap: 8 }}>
                    <button type="button" onClick={() => setShotIdx((i) => Math.max(0, i - 1))} disabled={shotIdx === 0} title={T.prevShot} aria-label={T.prevShot} style={arrow(shotIdx === 0)}>{chev}</button>
                    <div title={T.scopeHint(N)} style={{ textAlign: 'center', whiteSpace: 'nowrap', lineHeight: 'normal' }}>
                      <span style={{ fontFamily: FN, fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', color: CYAN }}>{T.shotWord} <bdi dir="ltr">{shot.index} / {N}</bdi></span>
                      <span style={{ ...lbl, letterSpacing: '0.06em', marginInlineStart: 8 }}>{T.atSec(fmt(series.tMs[shot.cycle.release] / 1000, 1))}</span>
                    </div>
                    <button type="button" onClick={() => setShotIdx((i) => Math.min(N - 1, i + 1))} disabled={shotIdx === N - 1} title={T.nextShot} aria-label={T.nextShot} style={arrow(shotIdx === N - 1)}><span style={{ display: 'inline-flex', transform: 'scaleX(-1)' }}>{chev}</span></button>
                  </div>
                  <div data-shot-grid style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 6 }}>
                    {result.shots.map((s, i) => {
                      const st = ST[stKey(s.score)];
                      return <button key={i} onClick={() => setShotIdx(i)} title={T.shotTip(s.index, fmt(series.tMs[s.cycle.release] / 1000, 1), s.score ?? '-')}
                        style={{ ...chip(i === shotIdx), padding: 0, minWidth: 0, letterSpacing: 0, fontVariantNumeric: 'tabular-nums', borderColor: i === shotIdx ? CYAN : st.color, color: i === shotIdx ? CYAN : st.color }}>{s.index}</button>;
                    })}
                  </div>
                </div>
              );
            })()}
            {/* MADE / MISSED for the shot selected above - two equal cells, the
                tally under them. Marked by the coach: the analyser has no rim to
                look at, so it never guesses a make. */}
            <div data-shot-mark className="shot-noprint" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                <button onClick={() => markShot(shot.index, true)} title={T.markShot}
                  style={{ ...chip(made[shot.index] === true), ...(made[shot.index] === true ? { borderColor: '#37B27C', color: '#37B27C', background: 'rgba(55,178,124,0.10)' } : null) }}>✓ {T.made}</button>
                <button onClick={() => markShot(shot.index, false)} title={T.markShot}
                  style={{ ...chip(made[shot.index] === false), ...(made[shot.index] === false ? { borderColor: '#F26A2B', color: '#F26A2B', background: 'rgba(242,106,43,0.10)' } : null) }}>✗ {T.missed}</button>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: FN, fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', color: CYAN }}>{T.makes(madeCount, result.shots.length)}</span>
                {unmarkedCount > 0 && <span style={{ ...lbl, letterSpacing: '0.06em' }}>{T.unmarked(unmarkedCount)}</span>}
                {auto[shot.index] && !auto[shot.index].overridden && (
                  <span data-auto-tag={auto[shot.index].outcome} style={{ ...lbl, letterSpacing: '0.06em', color: auto[shot.index].outcome === 'unsure' ? '#F2B33D' : 'rgba(255,255,255,0.7)' }}>
                    {auto[shot.index].outcome === 'unsure' ? T.autoUnsure : auto[shot.index].outcome === 'missed' ? T.autoCheck : T.autoTag(Math.round(auto[shot.index].confidence * 100))}
                  </span>
                )}
              </div>
              {srcUrl && (
                <div data-auto-row style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {autoRun === null && rimTap === null && (
                    <button data-auto-start onClick={() => setRimTap([])} style={{ ...chip(false), width: '100%' }}>{T.autoBtn}</button>
                  )}
                  {rimTap !== null && (<>
                    <span style={{ ...lbl, color: CYAN, letterSpacing: '0.06em', flex: '1 1 200px' }}>{rimTap.length === 0 ? T.rimTapL : T.rimTapR}</span>
                    <button onClick={() => setRimTap(null)} style={{ ...chip(false) }}>{T.cancel}</button>
                  </>)}
                  {typeof autoRun === 'number' && (<>
                    <span data-auto-progress style={{ ...lbl, color: CYAN, letterSpacing: '0.06em', flex: '1 1 200px' }}>{T.autoRunning(autoRun)}</span>
                    {/* a check that runs long can be stopped (AUDIT-470: no way out but leaving the page) */}
                    <button onClick={() => { autoTokenRef.current++; setAutoRun(null); }} style={{ ...chip(false) }}>{T.cancel}</button>
                  </>)}
                  {autoRun === 'done' && (() => {
                    const vals = Object.values(auto).filter((a) => !a.overridden);   // the coach's own flips leave the rim's summary (it read 9 MADE beside a 7 tally; AUDIT-470)
                    const m = vals.filter((a) => a.outcome === 'made').length, x = vals.filter((a) => a.outcome === 'missed').length, u = vals.filter((a) => a.outcome === 'unsure').length;
                    return (<>
                      <span data-auto-done data-auto-seeks={autoStatsRef.current ? JSON.stringify(autoStatsRef.current) : undefined} style={{ ...lbl, letterSpacing: '0.06em', flex: '1 1 200px' }}>{T.autoDone(m, x, u)}</span>
                      <button onClick={() => { setAutoRun(null); setRimTap([]); }} style={{ ...chip(false) }}>{T.rimRedo}</button>
                    </>);
                  })()}
                  {/* a failed check was a dead end - neither AUTO nor REDO showed (AUDIT-470) */}
                  {autoRun && typeof autoRun === 'object' && (<>
                    <span style={{ ...lbl, color: '#F26A2B', flex: '1 1 200px' }}>{autoRun.error}</span>
                    <button onClick={() => { setAutoRun(null); setRimTap([]); }} style={{ ...chip(false) }}>{T.rimRedo}</button>
                  </>)}
                </div>
              )}
            </div>
          </div>

      <div className="shot-results" style={{ display: 'flex', gap: 'var(--g)', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* LEFT — player */}
        <div className="shot-left" style={{ flex: '1 1 420px', minWidth: 300, maxWidth: 640 }}>
          <div ref={wrapRef} className="shot-video" style={{ '--shot-ar': result.aspect || 1.7778, position: 'relative', width: '100%', aspectRatio: result.aspect ? `${result.aspect}` : '16/9', background: '#000', border: '1px solid rgba(255,255,255,0.15)' }}>
            {srcUrl ? <video ref={videoRef} src={srcUrl} muted playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} onLoadedMetadata={() => seekTo(cur)} />
              : <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.4)', fontFamily: FN, fontSize: 11, letterSpacing: '0.14em' }}>{T === SHOT_I18N.he ? 'מסלול תנוחה' : 'POSE TRACK'}</div>}
            <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
            {rimTap !== null && (
              // TAP THE RIM: two taps, its left edge then its right, in the
              // video's own pixels (the frame is letterboxed by objectFit contain)
              <div data-rim-tap onClick={(e) => {
                const v = videoRef.current; if (!v || !v.videoWidth) return;
                const r = e.currentTarget.getBoundingClientRect();
                const sc = Math.min(r.width / v.videoWidth, r.height / v.videoHeight);
                const ox = (r.width - v.videoWidth * sc) / 2, oy = (r.height - v.videoHeight * sc) / 2;
                const pt = { x: (e.clientX - r.left - ox) / sc, y: (e.clientY - r.top - oy) / sc, sx: e.clientX - r.left, sy: e.clientY - r.top };
                if (pt.x < 0 || pt.y < 0 || pt.x > v.videoWidth || pt.y > v.videoHeight) return;
                const pts = [...rimTap, pt];
                if (pts.length < 2) { setRimTap(pts); return; }
                setRimTap(null);
                const rim = { l: Math.min(pts[0].x, pts[1].x), r: Math.max(pts[0].x, pts[1].x), y: (pts[0].y + pts[1].y) / 2 };
                const releases = result.shots.map((sh) => series.tMs[sh.cycle.release]);
                setAutoRun(0);
                const tok = ++autoTokenRef.current;
                const live = () => autoTokenRef.current === tok;
                const seekStats = {};
                autoStatsRef.current = seekStats;
                judgeShots(srcUrl, rim, releases, { onProgress: (p) => { if (live()) setAutoRun(p); }, shouldStop: () => !live(), stats: seekStats }).then((res) => {
                  if (!live()) return;
                  // A shot the coach marked himself stays his (tagged as
                  // overridden, whatever the rim said); a shot the LAST check
                  // filled takes this check's answer - a REDO after a bad rim
                  // tap must not leave the first run's marks behind (29.9 audit).
                  const filled = autoFilledRef.current;
                  const his = (k) => madeRef.current[k] !== undefined && !filled.has(k);
                  const a = {};
                  res.forEach((rr, i) => { const k = result.shots[i].index; a[k] = his(k) ? { ...rr, overridden: true } : rr; });
                  setAuto(a);
                  // computed ONCE, outside any updater: React may run an updater
                  // twice (StrictMode), and one that also edits a ref is not
                  // idempotent (29.9 audit round 2)
                  const n = { ...madeRef.current }; const nextFilled = new Set(filled);
                  res.forEach((rr, i) => {
                    const k = result.shots[i].index;
                    if (n[k] !== undefined && !filled.has(k)) return;
                    if (rr.outcome === 'made' || rr.outcome === 'missed') { n[k] = rr.outcome === 'made'; nextFilled.add(k); } else { delete n[k]; nextFilled.delete(k); }
                  });
                  autoFilledRef.current = nextFilled;
                  setMade(n);
                  setAutoRun('done');
                }).catch((err) => { if (live() && !(err && err.code === 'aborted')) setAutoRun({ error: T.autoFail }); });
              }} style={{ position: 'absolute', inset: 0, cursor: 'crosshair', background: 'rgba(0,0,0,0.12)' }}>
                {rimTap.map((pt, i) => <span key={i} style={{ position: 'absolute', left: pt.sx - 5, top: pt.sy - 5, width: 10, height: 10, borderRadius: '50%', background: CYAN, boxShadow: '0 0 0 2px #000' }} />)}
              </div>
            )}
            {phaseAt && <div style={{ position: 'absolute', top: 8, left: 8, background: 'rgba(0,0,0,0.7)', border: `1px solid ${CYAN}`, color: CYAN, fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', padding: '3px 8px' }}>{phaseAt.label}</div>}
            <div style={{ position: 'absolute', bottom: 8, right: 8, background: 'rgba(0,0,0,0.7)', fontFamily: FN, fontSize: 10, letterSpacing: '0.08em', padding: '3px 8px', color: 'rgba(255,255,255,0.8)' }}>{T.frameOf ? T.frameOf(cur + 1, n, fmt(tMs / 1000, 2)) : `F${cur + 1}/${n} · ${fmt(tMs / 1000, 2)}s`}</div>
          </div>
          {/* transport */}
          {/* TRANSPORT: five EQUAL cells (they were each as wide as their own
              label) and the scrubber - beside them on a wide column, on a row
              of its own on a phone. */}
          {/* dir=ltr: time runs left to right in every language - the chart's
              axis does, and a mirrored row put "«10" on the right with the
              slider running backwards (28.9 #388, Hebrew LOOK). */}
          <div dir="ltr" className="shot-noprint shot-transport" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 44px) minmax(0, 1fr)', columnGap: 6, rowGap: 8, alignItems: 'center', marginTop: 8 }}>
            {[[() => step(-10), T.back10, '«10'], [() => step(-1), T.prev1, '‹ 1'], [() => { const v = videoRef.current; if (!v) return; if (v.paused) { v.play().catch(() => {}); } else v.pause(); }, '', playing ? '❚❚' : '▶'], [() => step(1), T.next1, '1 ›'], [() => step(10), T.fwd10, '10»']].map(([fn, tip, label], k) => (
              <button key={k} onClick={fn} title={tip || undefined} style={{ ...chip(k === 2 && playing), width: '100%', minWidth: 0, padding: 0 }}>{label}</button>
            ))}
            <input type="range" min={0} max={n - 1} value={cur} onChange={(e) => userSeek(Number(e.target.value))} style={{ width: '100%', minWidth: 0, margin: 0, accentColor: '#39BDFF' }} />
          </div>
          {/* STANCE -> LAND is ONE SEQUENCE, so it gets one strip: equal
              columns, one height, no wrapping to a ragged second row. Sized by
              grid rather than by each label's length — RELEASE and DIP are very
              different widths and padding alone made the row look accidental.
              (Ohad: "the stance to land buttons are still a ocd mess".) */}
          {/* Ohad: "the stance dip set release etc buttons are overflowing and not
              showing". Six phases fit this column; a rep with a detected LAND
              makes SEVEN, each column drops to ~62px, and RELEASE - the widest
              label - was ellipsised inside its own border. An ellipsis here is
              the UI deciding he does not need the rest of the word.
              auto-fit wraps to a second row instead of shrinking past the
              widest label, and the ellipsis is gone so a squeeze can never be
              silent again. Columns stay equal width either way. */}
          {/* TWO FULL ROWS. auto-fit put five chips on the first row and left
              two orphans on the second (Ohad, 2026-09-07: "the buttons are
              still a mess ... i need an equal spreading of the buttons across
              the two rows"). Each chip's basis is a half-row's share, so the
              first row takes ceil(n/2) chips and the rest grow to fill the
              second - both rows full, every chip in a row the same width. */}
          {/* PHASES: one grid, ceil(n/2) EQUAL columns - the flex version grew
              the shorter second row's cells wider than the first row's. */}
          {/* ONE BUTTON PER FRAME (29.9 #425, Ohad: "dip and set are still
              highlighted together, bad. audit all those buttons and what they
              do"). The audit: on a one-motion shot the set point IS the dip
              frame, so DIP and SET were two buttons for one picture - pressing
              either showed the same frame and the pair read as one control lit
              twice. Phases that share a frame are one button now, "DIP · SET",
              lit when either is the chosen phase. */}
          {(() => {
            const groups = [];
            for (const p of shot.phases) { const g = groups.find((x) => x.idx === p.idx); if (g) g.ps.push(p); else groups.push({ idx: p.idx, ps: [p] }); }
            return (
              <div className="shot-noprint" style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.ceil(groups.length / 2)}, minmax(0, 1fr))`, gap: 6, marginTop: 8 }}>
                {groups.map((g) => {
                  const on = g.ps.some((p) => p.key === activePhaseKey);
                  const label = g.ps.map((p) => p.label).join(' · ');
                  return <button key={g.ps[0].key} data-phase-key={g.ps.map((p) => p.key).join(',')} data-idx={g.idx} data-active={on ? '1' : '0'} onClick={() => { setPhaseKey(g.ps[0].key); seekTo(g.idx); }} style={{ ...chip(on), width: '100%', padding: '0 4px', minWidth: 0, letterSpacing: '0.06em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={T.phaseJump(label)}>{label}</button>;
                })}
              </div>
            );
          })()}
          {/* per-frame readout */}
          {/* Ordered up the body, four to a row: ground → trunk → shoulder on the
              first line, then the arm chain elbow → forearm → wrist on the
              second, so the eye reads it in the same order the shot happens. */}
          <div style={{ ...lbl, marginTop: 10, marginBottom: 4 }}>{(T.measuredOnSide ? T.measuredOnSide(hand === 'L' ? T.left : T.right) : 'MEASURED ON THE SHOOTING SIDE · ' + (hand === 'L' ? 'LEFT' : 'RIGHT'))}</div>
          <div className="shot-readout" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6 }}>
            {[[T.metrics.knee, fmt(rd.knee) + '°'], [T.metrics.hip, fmt(rd.hip) + '°'], [T.metrics.trunk, fmt(rd.trunk) + '°'], [T.metrics.armElev, fmt(rd.shoulder) + '°'], [T.metrics.elbow, fmt(rd.elbow) + '°'], [T.metrics.elbowOffset, [fmt(rd.wristElbowX, 2), (T.unitTorso || ' torso').trim()], T.metricsHelp && T.metricsHelp.elbowOffset], [T.metrics.forearm, fmt(rd.forearm) + '°'], [T.metrics.wristEye, (rd.wristEye == null ? '—' : [(rd.wristEye >= 0 ? '+' : '') + fmt(rd.wristEye, 2), (T.unitTorso || ' torso').trim()]), T.metricsHelp && T.metricsHelp.wristEye]].map(([k, v, help]) => (
              <div key={k} className="shot-metric" title={help || undefined} style={{ border: '1px solid rgba(255,255,255,0.12)', padding: '8px 10px', height: 56, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minWidth: 0 }}>
                {/* ONE ROW per label, fitted by wording (memory feedback_titles_fit_by_wording) */}
                <div style={{ ...lbl, lineHeight: '12px', whiteSpace: 'nowrap', overflow: 'hidden' }}>{k}</div>
                {/* a unit word rides small after its number, on the same line
                    ("0.08 TORSO" at 15px wrapped in a phone tile - 27.9 O10) */}
                <div className="shot-metric-v" style={{ fontFamily: FN, fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums', lineHeight: '20px', whiteSpace: 'nowrap' }}>{Array.isArray(v)
                  ? <><bdi dir="ltr">{v[0]}</bdi><span style={{ fontSize: 9, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.55)', marginInlineStart: 4 }}>{v[1]}</span></>
                  : v}</div>
              </div>
            ))}
          </div>
          {/* Actions live UNDER THE VIDEO, not at the end of the report — they
              used to sit below every checkpoint, so the coach had to scroll the
              whole guide to reach SAVE / NEW CLIP (Ohad 08-24). */}
          {/* Four actions, four equal columns. This was a wrapping flex row with
              a flex:1 spacer before NEW CLIP: at full width the spacer pushed it
              to the right edge, and the moment the row wrapped the spacer ate a
              whole line and left NEW CLIP orphaned underneath. Equal columns
              reflow 4 -> 2 -> 1 with every edge still aligned, and no orphan
              (Ohad: "same for save to new clip"). NEW CLIP keeps a dimmer border
              so starting over does not read as a peer of SAVE. */}
          <div className="shot-noprint" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(45%, 1fr))', gap: 8, marginTop: 10 }}>
            <button onClick={save} style={{ ...ghost, borderColor: CYAN, color: CYAN, padding: '0 10px', fontSize: 10 }}>{T.save}</button>
            <button onClick={copySummary} style={{ ...ghost, padding: '0 10px', fontSize: 10 }}>{T.copy}</button>
            <button onClick={() => window.print()} style={{ ...ghost, padding: '0 10px', fontSize: 10 }}>{T.print}</button>
            <button onClick={onReset} style={{ ...ghost, padding: '0 10px', fontSize: 10, borderColor: 'rgba(255,255,255,0.18)', color: 'rgba(255,255,255,0.75)' }}>{T.newClip}</button>
          </div>
          <Timeline series={series} shot={shot} cur={cur} onSeek={seekTo} T={T} hand={hand} />
        </div>

        {/* RIGHT — the report, in THREE VIEWS (29.9 #429, Ohad: "very uncomfortable
            to navigate and read"): THIS SHOT (its read-outs and checkpoints),
            SESSION (every shot, the averages, what holds and what wanders) and
            SAVED. One long scroll mixed the three; now each answers one question. */}
        <div className="shot-right" style={{ flex: '1 1 420px', minWidth: 300 }}>
          <div className="shot-tabs shot-noprint" role="tablist" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6, marginBottom: 'var(--g)' }}>
            {[['shot', T.tabShot || 'THIS SHOT'], ['session', T.tabSession || 'SESSION'], ['saved', T.tabSaved || 'SAVED']].map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={reportTab === k} data-report-tab={k} onClick={() => setReportTab(k)} style={{ ...chip(reportTab === k), width: '100%', minWidth: 0 }}>
                {l}{k === 'session' && result.shots.length > 1 ? ` · ${result.shots.length}` : ''}{k === 'saved' && saved.length ? ` · ${saved.length}` : ''}
              </button>
            ))}
          </div>
          {reportTab === 'shot' && (<>
          {/* info strip */}
          {/* Six single-width read-outs fill two clean rows of three; the two
              long ones (chain order, session consistency) get a row each
              instead of stretching one tile taller than its neighbours. */}
          <div className="shot-info" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6, marginBottom: 14 }}>
            {[[T.info.dipToRelease, shot.info.dipToReleaseMs != null ? shot.info.dipToReleaseMs + (T.unitMs || ' ms') : '—'],
              // Third slot = an action for the value. Only the height prompt has
              // one; every other tile is a reading, and a reading is not a button.
              [T.info.jumpRise, shot.info.jumpRiseCm != null ? shot.info.jumpRiseCm + (T.unitCm || ' cm') : T.enterHeight,
                shot.info.jumpRiseCm == null ? onNeedHeight : null],
              [T.info.releaseHeight, shot.info.releaseHeightCm != null ? shot.info.releaseHeightCm + (T.unitCm || ' cm') : (shot.info.releaseHeightRatio != null ? shot.info.releaseHeightRatio + T.eyeHeight : '—')],
              [T.info.armAtRelease, fmt(shot.info.shoulderAtRelease) + '°'],
              // Measured from the BALL. Blank when the ball could not be tracked
              // confidently — an empty tile beats a confident wrong angle.
              [T.info.ballLaunch, shot.info.ballLaunchDeg != null ? shot.info.ballLaunchDeg + '°' : '—'],
              // Scaled off the ball itself — no calibration, nothing to enter.
              [T.info.ballSpeed, shot.info.ballSpeedMs != null ? shot.info.ballSpeedMs + (T.unitMps || ' m/s') : '—'],
              [T.info.ballRise, shot.info.ballRiseM != null ? shot.info.ballRiseM + (T.unitM || ' m') : '—'],
              // (TRACKED was a ninth tile repeating the verdict line's "tracking
              // poor (52% of shot frames)" - dropped, so the grid is 2 x 4 / 4 x 2.)
              [T.info.releaseVsApex, shot.raw.timing == null ? '—' : (shot.raw.timing > 0 ? '+' : '') + Math.round(shot.raw.timing) + (T.unitMs || ' ms')]].map(([k, v, act]) => (
              <div key={k} style={{ border: '1px solid rgba(255,255,255,0.12)', padding: '8px 10px', height: 56, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minWidth: 0 }}><div style={{ ...lbl, whiteSpace: 'nowrap', overflow: 'hidden' }}>{k}</div>
                {act
                  ? <button type="button" onClick={act} dir="ltr" style={{ alignSelf: 'flex-start', minHeight: 0, height: 'auto', lineHeight: 'normal', fontFamily: FN, fontSize: 14, fontWeight: 700, unicodeBidi: 'isolate', textAlign: 'start', background: 'transparent', border: 'none', padding: 0, color: '#39BDFF', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}>{v}</button>
                  : <div dir="ltr" style={{ fontFamily: FN, fontSize: 14, fontWeight: 700, unicodeBidi: 'isolate', textAlign: 'start', whiteSpace: 'nowrap', overflow: 'hidden' }}>{v}</div>}
              </div>
            ))}
            {/* An untracked ball used to be three em dashes and no explanation.
                The plain sentence is for the coach; the technical reason the
                tracker actually gave is on the tooltip, for whoever is fixing it. */}
            {shot.info.ballLaunchDeg == null && (shot.info.ballWhy || shot.info.ballPartial || shot.info.ballAboveFrame) && (
              <div title={(shot.info.ballWhy && (shot.info.ballWhy.why || shot.info.ballWhy.failed)) || shot.info.ballPartial || ''}
                style={{ border: '1px solid rgba(255,255,255,0.12)', padding: '6px 8px', gridColumn: '1 / -1',
                  fontSize: 12, lineHeight: 1.5, color: 'rgba(255,255,255,0.62)' }}>
                {shot.info.ballAboveFrame ? T.ballAboveFrame : (shot.info.ballPartial === 'ascent' ? T.ballAscent : shot.info.ballPartial === 'flat' ? T.ballFlat : T.ballUnread)}
              </div>
            )}
            <div style={{ border: '1px solid rgba(255,255,255,0.12)', padding: '6px 8px', gridColumn: '1 / -1' }}><div style={lbl}>{T.info.chain}</div><div dir="ltr" style={{ fontFamily: FN, fontSize: 14, fontWeight: 700, unicodeBidi: 'isolate', textAlign: 'start' }}>{shot.info.sequenceOrder ? T.chainVal(shot.info.sequenceOrder.kneeMs, shot.info.sequenceOrder.shoulderMs, shot.info.sequenceOrder.elbowMs) : '—'}</div></div>
            {result.consistency && <div style={{ border: '1px solid rgba(255,255,255,0.12)', padding: '6px 8px', gridColumn: '1 / -1' }}><div style={lbl}>{T.consistencyLbl(result.consistency.n)}</div><div style={{ fontFamily: FN, fontSize: 12, fontWeight: 700 }}>{T.consistencyVal(fmt(result.consistency.rhythmCv), fmt(result.consistency.releaseArmSd, 1), fmt(result.consistency.setElbowSd, 1), fmt(result.consistency.timingSd))}</div></div>}
          </div>

          {/* (The "vs the last analysis you saved" block is gone - 29.9 #433, Ohad:
              "remove it completely - only compare it to this clip". The session
              view compares the shots of this clip.) */}
          {/* A starved capture reports FEWER SHOTS with full confidence.
              Measured on one identical clip across runs: 9, 10, 11 and 12
              shots, depending only on what else was driving the browser.
              MediaPipe drops frames under load and the analyzer cannot tell
              a rep that was never filmed from a rep whose frames were lost.
              Below ~18fps say so, loudly, rather than showing a short count
              as if it were the truth. (Ohad, 2026-08-26: "it only recognized
              6 out of 11 shots i took" — on a clip that reads 11 when the
              browser is idle.) */}
          {/* Filmed obliquely: the ball receded from the camera, so the
              absolute readings are projections of a 3D flight onto 2D and read
              low. Measured from the ball's own apparent size, which scales as
              1/distance. This is why Ohad's three-point clip solved to a 1.7m
              shot — the physics was right, the geometry was not. */}
          {shot.info.ballOblique && (
            <div style={{ border: '1px solid #E0A73A', background: 'rgba(224,167,58,0.08)', color: '#E0A73A',
              padding: '10px 12px', marginBottom: 14, fontSize: 12.5, lineHeight: 1.5 }}>
              {T.oblique}
            </div>
          )}
          {/* Keyed on effFps — the rate we ACTUALLY analysed — not on fps,
              which is the source video's rate whenever capture could measure
              it. Ohad's clip is 60fps; a run that analysed only 16 fps of it
              and found 9 shots instead of 11 reported fps=60 and this banner
              stayed silent. The guard could not fire for the failure it exists
              to catch. Falls back to fps when effFps is unavailable. */}
          {(() => {
            const rate = result.effFps != null ? result.effFps : result.fps;
            if (rate == null || rate >= 18) return null;
            return (
              <div style={{ border: `1px solid ${'#E0A73A'}`, background: 'rgba(224,167,58,0.08)', color: '#E0A73A',
                padding: '10px 12px', marginBottom: 14, fontSize: 12.5, lineHeight: 1.5 }}>
                {T.starved(rate, result.frameCount)}
                {/* NO "analyse frame by frame" button here, and that is a measured
                    decision rather than an omission.
                    
                    Stepping the clip with seeks looked like the fix: on clip02
                    (24 fps, landscape) it captured 754 frames against 639 and
                    every run agreed. On OHAD'S OWN 17-shot clip it captured
                    FEWER - 1541 against 2286 - found 9 of the 17 shots, and took
                    1445s against 487s. His footage is 60 fps portrait, where a
                    seek is expensive and the fixed step under-samples the source.
                    Offering it would have halved his shot count while promising
                    precision. */}
              </div>
            );
          })()}
          <div style={{ ...lbl, color: CYAN, marginBottom: 6 }}>{T.checksTitle(shot.index, result.shots.length)}</div>
          <div style={{ border: '1px solid rgba(255,255,255,0.15)' }}>
            {shot.checks.map((c, i) => {
              const st = ST[c.status];
              const open = openGuide.has(c.key);
              const PHASE_OF = { dip: 'dip', setHeight: 'set', setElbow: 'set', elbowAlign: 'set', releaseExt: 'release', releaseArm: 'release', timing: 'release', follow: 'follow', trunk: 'release' };
              const phaseKey = PHASE_OF[c.key];
              const ph = shot.phases.find((p) => p.key === phaseKey);
              // One jump per FRAME, not per row. Three set-point checks and four
              // release checks each carried a ▸ to the same frame (Ohad,
              // 2026-09-07: "too many play buttons next to the checkpoints that
              // lead to the same frame"). The first row of a phase keeps it.
              const showJump = !!ph && (i === 0 || PHASE_OF[shot.checks[i - 1].key] !== phaseKey);
              return (
                <div key={c.key} className="shot-check-row" style={{ borderTop: i ? '1px solid rgba(255,255,255,0.1)' : 'none' }}>
                  {/* GRID, not flex: fixed trailing columns so every value, gain,
                      status chip and jump arrow shares an x with the row above.
                      Flex sized each by its own text, which is why 135 and
                      -0.24 TORSO ended in different places. */}
                  <div className="shot-check-grid" onClick={() => setOpenGuide((s) => { const nx = new Set(s); nx.has(c.key) ? nx.delete(c.key) : nx.add(c.key); return nx; })}>
                    <span style={{ gridArea: 'd', width: 8, height: 8, borderRadius: '50%', background: st.color }} />
                    <div className="shot-check-name" style={{ gridArea: 'n', minWidth: 0, fontFamily: FN, fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', lineHeight: '16px' }}>{c.label}</div>
                    <div className="shot-check-target" style={{ gridArea: 't', minWidth: 0, fontSize: 11, lineHeight: '15px', color: 'rgba(255,255,255,0.55)' }}>{c.target}</div>
                    <span className="shot-check-meta" style={{ gridArea: 'm', minWidth: 0, display: 'inline-flex', alignItems: 'baseline', gap: 8, whiteSpace: 'nowrap', lineHeight: '16px' }}>
                      <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', color: st.color }}>{st.label}</span>
                      {c.status !== 'ok' && c.status !== 'na' && gainOf(c) > 0 && <span dir="ltr" title={T.gainPts(gainOf(c))} style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: 'rgba(255,255,255,0.5)', unicodeBidi: 'isolate' }}>{`+${gainOf(c)}`}</span>}
                    </span>
                    <div className="shot-check-val" dir="ltr" style={{ gridArea: 'v', justifySelf: 'end', fontFamily: FN, fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', unicodeBidi: 'isolate', lineHeight: '16px' }}>{c.display}</div>
                    {showJump
                      ? <button className="shot-noprint shot-check-jump" onClick={(e) => { e.stopPropagation(); setPhaseKey(ph.key); seekTo(ph.idx); }} style={{ ...chip(false), gridArea: 'j', width: CTL_H, minWidth: 0, padding: 0 }} title={T.jumpFrame}>▸</button>
                      : <span className="shot-check-jump" style={{ gridArea: 'j', width: CTL_H }} />}
                    <span className="shot-check-chev" style={{ gridArea: 'c', color: 'rgba(255,255,255,0.5)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', transform: open ? 'rotate(180deg)' : 'none' }}><svg aria-hidden viewBox="0 0 9 6" fill="none" width="10" height="7" style={{ display: 'block' }}><path d="M1 1l3.5 3.5L8 1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
                  </div>
                  {open && (
                    <div style={{ padding: '0 12px 12px 30px', fontSize: 12.5, lineHeight: 1.55, color: 'rgba(255,255,255,0.85)', minWidth: 0, overflowWrap: 'break-word', wordBreak: 'break-word' }}>
                      <div style={{ marginBottom: 9 }}>
                        <div style={{ ...lbl, color: st.color, marginBottom: 3 }}>{T.what}</div>
                        <div>{c.status === 'ok' ? T.measuredOk(c.display) : T.measuredBad(c.display, c.target)}</div>
                      </div>
                      <div style={{ marginBottom: 9 }}>
                        <div style={{ ...lbl, color: CYAN, marginBottom: 3 }}>{T.why}</div>
                        <div>{c.why}</div>
                      </div>
                      <DrillList label={T.drills || T.how} items={c.how} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div data-shot-end style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5, marginTop: 10 }}>
            {T.footnote}
          </div>

          </>)}
          {reportTab === 'session' && (<>
            {result.shots.length < 2 && <div style={{ fontFamily: FB, fontSize: 13, color: 'rgba(255,255,255,0.6)', padding: '8px 0' }}>{T.sessionOne || 'One shot in this clip - the session view needs two or more.'}</div>}
          {/* SESSION — every detected shot, scored, so a multi-shot clip is
              never ambiguous: this table IS the whole clip. */}
          {result.shots.length > 1 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ ...lbl, color: CYAN, marginBottom: 6 }}>{T.sessionTitle(result.shots.length)}</div>
              <div style={{ border: '1px solid rgba(255,255,255,0.15)', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: FN, fontSize: 11 }}>
                  <thead><tr>{T.cols.map((h) => <th key={h} style={{ ...lbl, textAlign: 'start', padding: '6px 8px', borderBottom: '1px solid rgba(255,255,255,0.15)', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {result.shots.map((s, i) => {
                      const st = ST[stKey(s.score)];
                      // The COSTLIEST fault, not the first one defined. The
                      // score is a weighted mean, so "set point height" is
                      // worth +11.5 and "trunk at release" +6.7 — telling a
                      // coach to fix whichever happens to be listed first can
                      // point him at the cheapest thing on the board.
                       return (
                        <tr key={i} onClick={() => jumpTo(i, phaseKey)} style={{ cursor: 'pointer', background: i === shotIdx ? 'rgba(57,189,255,0.10)' : 'transparent', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                          <td style={{ padding: '6px 8px', fontWeight: 700, color: i === shotIdx ? CYAN : '#FFF' }}>{s.index}</td>
                          <td onClick={(e) => { e.stopPropagation(); jumpTo(i, 'release'); }} title={T.phaseJump ? T.phaseJump('release') : undefined} data-jump="release" style={{ padding: '6px 8px', color: 'rgba(255,255,255,0.7)' }}>{fmt(series.tMs[s.cycle.release] / 1000, 1)}{T.unitS || 's'}</td>
                          <td style={{ padding: '6px 8px', fontWeight: 700, color: st.color }}>{s.score ?? '—'}</td>
                          <td onClick={(e) => { e.stopPropagation(); jumpTo(i, 'dip'); }} title={T.phaseJump ? T.phaseJump('dip') : undefined} data-jump="dip" style={{ padding: '6px 8px', color: 'rgba(255,255,255,0.8)' }}>{fmt(s.raw.dip)}°</td>
                          <td onClick={(e) => { e.stopPropagation(); jumpTo(i, 'set'); }} title={T.phaseJump ? T.phaseJump('set') : undefined} data-jump="set" style={{ padding: '6px 8px', color: 'rgba(255,255,255,0.8)' }}>{fmt(s.raw.setElbow)}°</td>
                          <td onClick={(e) => { e.stopPropagation(); jumpTo(i, 'release'); }} title={T.phaseJump ? T.phaseJump('release') : undefined} data-jump="release" style={{ padding: '6px 8px', color: 'rgba(255,255,255,0.8)' }}>{fmt(s.raw.releaseArm)}°</td>
                          <td onClick={(e) => { e.stopPropagation(); jumpTo(i, 'release'); }} title={T.phaseJump ? T.phaseJump('release') : undefined} data-jump="release" style={{ padding: '6px 8px', color: 'rgba(255,255,255,0.8)' }}>{s.raw.timing == null ? '—' : (s.raw.timing > 0 ? '+' : '') + Math.round(s.raw.timing) + (T.unitMs || 'ms').trim()}</td>
                          {/* RELEASE HEIGHT, not "fix first". Ohad: "fix first is
                              useless you may remove it and fill it with something more
                              importnant". He was right, and the git history already
                              shows one attempt to rescue it: the absolute worst
                              checkpoint is identical on every rep, so it was replaced
                              by a deviation-from-his-own-norm pick that needs at least
                              THREE shots. His session had two, so every row fell
                              through to "on his norm" - a column that says the same
                              word on every line is a column of nothing.
                              Release height is on every rep whether or not a stature
                              has been entered, and it is the other axis of the
                              question this tool exists to answer: does the release
                              REPEAT across the set. The release ANGLE is already the
                              column beside it. */}
                          <td style={{ padding: '6px 8px', color: 'rgba(255,255,255,0.8)', whiteSpace: 'nowrap' }}>
                            {s.info.releaseHeightCm != null
                              ? `${s.info.releaseHeightCm}${T.unitCm || ' cm'}`
                              : (s.info.releaseHeightRatio != null ? `${s.info.releaseHeightRatio.toFixed(2)}×` : '—')}
                          </td>
                          <td style={{ padding: '6px 8px', fontWeight: 700, color: made[s.index] === true ? '#37B27C' : made[s.index] === false ? '#F26A2B' : 'rgba(255,255,255,0.35)' }}>
                            {made[s.index] === true ? '✓' : made[s.index] === false ? '✗' : '—'}
                          </td>
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
                // a symbol / Latin unit ("°", " m") rides INSIDE the number's
                // isolate - outside it would resolve right-to-left and read
                // "°64"; a Hebrew unit sits outside and reads in the sentence
                const withUnit = (v, unit) => (/[\u0590-\u05FF]/.test(unit)
                  ? <><bdi dir="ltr">{v}</bdi>{unit}</>
                  : <bdi dir="ltr">{v}{unit}</bdi>);
                const row = (label, sp, unit) => (sp ? (
                  <span style={{ marginInlineEnd: 14 }}>
                    {label}{' '}
                    {/* ONLY THE NUMBERS are bidi-isolated (a range "(54-67.2)"
                        must never reverse), and the reading wraps with its
                        paragraph. 29.9: the whole reading - Hebrew units
                        included - sat in one LTR inline-block that wrapped
                        inside itself, and the Hebrew speed line read
                        "מ׳/שנ׳ 0.28 ± מ׳/שנ׳" over "5.56 (6—5)". */}
                    <b style={{ color: '#FFF' }}>{withUnit(sp.mean, unit)}</b>
                    {' ± '}<b style={{ color: band(sp) }}>{withUnit(sp.sd, unit)}</b>
                    <span style={{ opacity: 0.7 }}> (<bdi dir="ltr">{sp.lo}–{sp.hi}</bdi>)</span>
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
                        {row(T.spreadSpeed, spread.speed, T.unitMps || ' m/s')}
                        {row(T.spreadRise, spread.rise, T.unitM || ' m')}
                        <div style={{ marginTop: 2, color: verdict === 'repeatable' ? '#37B27C' : '#E0A73A' }}>
                          {verdict === 'outlier' ? T.verdictOutlier(rest.n)
                            : verdict === 'speed' ? T.verdictSpeed
                            : verdict === 'angle' ? T.verdictAngle : T.sessionRepeatable}
                          {spread.angle ? ' · ' + T.launchSpreadOn(spread.angle.n, result.shots.length) : ''}
                        </div>
                        {culprit && (
                          <div style={{ marginTop: 2, color: '#E0A73A' }}>
                            {T.worstRep(culprit.index, culprit.value, culprit.key === 'ballSpeedMs' ? T.unitSpeedProse : (T === SHOT_I18N.he ? ' מעלות' : '°'))}
                          </div>
                        )}
                      </div>
                    )}
                    <MakeMissRead shots={result.shots} made={made} T={T} />
                  </div>
                );
              })()}
            </div>
          )}

          {/* scorecard */}
          {/* THE WHOLE SESSION, not this rep.
              The scorecard below answers "what went wrong on this shot". A coach
              on the court is asking three other questions, and they need three
              different answers: what is already solid (leave it alone), what is
              wrong on nearly every rep (change the technique), and what wanders
              between right and wrong (repeat it, do not change it). Collapsing
              those into one list is what made the old summary unusable
              (Ohad 08-30: "i need more conclusions from analyzing all the reps,
              positive, negative, focuses"). */}
          <SessionPanel result={result} T={T} />
          </>)}
          {reportTab === 'saved' && (<>
            {saved.length === 0 && <div style={{ fontFamily: FB, fontSize: 13, color: 'rgba(255,255,255,0.6)', padding: '8px 0' }}>{T.savedNone || 'Nothing saved yet.'}</div>}
          {saved.length > 0 && (
            <div style={{ border: '1px solid rgba(255,255,255,0.15)', padding: '10px 12px', marginBottom: 12 }}>
              <div style={{ ...lbl, color: CYAN, marginBottom: 6 }}>{T.savedTitle || 'SAVED SESSIONS'}</div>
              {saved.slice(0, 8).map((a) => (
                <div key={a.date} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 60px', alignItems: 'center', gap: 8, padding: '3px 0', fontSize: 12.5 }}>
                  <span dir="ltr" style={{ unicodeBidi: 'isolate', minWidth: 0 }}>
                    {T.savedRow
                      ? T.savedRow(fmtNumericDate(a.date), a.score, a.shots ?? 1) + (a.marked > 0 && T.savedRowMakes ? T.savedRowMakes(a.makes || 0, a.marked) : '')
                      : `${fmtNumericDate(a.date)} - ${a.score}/100`}
                  </span>
                  <button onClick={() => dropSaved(a.date)} style={{ ...chip(false), fontSize: 9 }} title={T.savedDrop || 'Remove'}>{T.savedDrop || 'Remove'}</button>
                </div>
              ))}
            </div>
          )}
          </>)}
        </div>
      </div>
      </div>
    </div>
  );
}

// MAKES vs MISSES (29.9 #424): what differs about this shooter's misses, and
// the makes per third of the clip. The gate and its calibration live in
// shotSession.js; below the minimum this says how many more it needs.
function MakeMissRead({ shots, made, T }) {
  const c = useMemo(() => makeMissContrast(shots, made), [shots, made]);
  const thirds = useMemo(() => makesByThird(shots, made), [shots, made]);
  if (!c.makes && !c.misses) return null;
  const iso = (x) => <span dir="ltr" style={{ unicodeBidi: 'isolate', display: 'inline-block' }}>{x}</span>;
  // the number isolated; a Hebrew unit reads in the sentence after it, a
  // symbol / Latin unit stays inside the isolate (as the spread lines, 29.9)
  const numUnit = (v, u) => (/[\u0590-\u05FF]/.test(u) ? <><bdi dir="ltr">{v}</bdi>{u}</> : <bdi dir="ltr">{v}{u}</bdi>);
  const unit = (u) => (u === 'ms' ? (T.unitMs || ' ms') : u === 'm/s' ? (T.unitMps || ' m/s') : u === 'm' ? (T.unitM || ' m') : u === 'cm' ? (T.unitCm || ' cm') : u);
  const L = c.lead;
  return (
    <div data-makemiss style={{ marginTop: 8 }}>
      <div style={{ ...lbl, color: CYAN, marginBottom: 2 }}>{T.mmTitle}</div>
      {!c.ready && <div data-makemiss-need>{T.mmNeed(c.makes, c.misses, c.needMakes, c.needMisses, CONTRAST_MIN.makes, CONTRAST_MIN.misses)}</div>}
      {c.ready && L && (
        <div data-makemiss-lead={L.key} style={{ color: '#E0A73A' }}>
          {T.mmMisses(T.mmNames[L.key])} <b>{numUnit(L.missMean, unit(L.unit))}</b> · {T.mmMakes} <b style={{ color: '#FFF' }}>{numUnit(L.makeMean, unit(L.unit))}</b>
          {' '}({T.mmCounts(L.nMiss, L.nMake)}). {T.mmLeadNote}
        </div>
      )}
      {c.ready && !L && c.compared > 0 && <div data-makemiss-none>{T.mmNone(c.compared)}</div>}
      {thirds && (
        <div data-makemiss-thirds style={{ marginTop: 2 }}>
          {T.mmThirds}: {thirds.map((p, i) => <React.Fragment key={i}>{i > 0 && ' · '}{iso(p.made + '/' + p.marked)}</React.Fragment>)}
        </div>
      )}
    </div>
  );
}

// Joint-angle timeline with phase bands + playhead; click/drag to seek.
// The session-level read: solid / broken / wandering / focus, plus whether the
// shooter held up across the clip. All arithmetic lives in shotSession.js so it
// can be tested without a video; this only draws it.
function SessionPanel({ result, T }) {
  const c = useMemo(() => sessionConclusions(result.shots), [result]);
  if (!c || c.reps < 2) return null;
  const pct = (x) => Math.round(x * 100) + '%';
  const name = (t) => (T && T.checks && T.checks[t.key] && T.checks[t.key].label) || t.label;
  const Row = ({ title, color, items, render }) => {
    if (!items || !items.length) return null;
    return (
      <div style={{ marginBottom: 8 }}>
        <div style={{ ...lbl, color, marginBottom: 3 }}>{title}</div>
        <div style={{ fontSize: 12.5, lineHeight: 1.5, color: 'rgba(255,255,255,0.85)' }}>
          {items.map((t) => <div key={t.key}>{render(t)}</div>)}
        </div>
      </div>
    );
  };
  const trendColor = !c.trend || c.trend.dir === 'flat' ? 'rgba(255,255,255,0.65)' : c.trend.dir === 'declined' ? '#E0A73A' : '#37B27C';
  return (
    <div style={{ border: '1px solid rgba(255,255,255,0.15)', padding: '10px 12px', marginBottom: 12 }}>
      <div style={{ ...lbl, color: CYAN, marginBottom: 6 }}>{T.sessionReadTitle ? T.sessionReadTitle(c.reps) : 'ACROSS ALL ' + c.reps + ' REPS'}</div>
      <div dir="ltr" style={{ fontSize: 12.5, marginBottom: 8, color: 'rgba(255,255,255,0.8)', unicodeBidi: 'isolate' }}>
        {(T.sessionSpan || 'best {b} · worst {w} · spread {s}')
          .replace('{b}', c.best == null ? '—' : c.best)
          .replace('{w}', c.worst == null ? '—' : c.worst)
          .replace('{s}', c.band == null ? '—' : c.band)}
      </div>
      <Row title={T.sessionSolid || 'HOLDING UP'} color="#37B27C" items={c.solid}
        render={(t) => (T.sessionSolidLine ? T.sessionSolidLine(name(t), t.ok, t.n) : `${name(t)} — right on ${t.ok} of ${t.n}`)} />
      <Row title={T.sessionBroken || 'WRONG ON MOST REPS'} color="#FF4757" items={c.broken}
        render={(t) => (T.sessionBrokenLine ? T.sessionBrokenLine(name(t), t.fix, t.n) : `${name(t)} — off on ${t.fix} of ${t.n}`)} />
      <Row title={T.sessionWander || 'INCONSISTENT (REPEAT, DO NOT CHANGE)'} color="#E0A73A" items={c.wandering}
        render={(t) => (T.sessionWanderLine ? T.sessionWanderLine(name(t), pct(t.okRate)) : `${name(t)} — right ${pct(t.okRate)} of the time`)} />
      {c.trend && (
        <div style={{ marginTop: 8, fontSize: 12.5, color: trendColor }}>
          {c.trend.dir === 'flat'
            ? (T.trendFlat || 'Held the same level from the first reps to the last.')
            : (T.trendMoved
              ? T.trendMoved(c.trend.dir, c.trend.first, c.trend.last, Math.abs(c.trend.delta))
              : `Score ${c.trend.dir} across the clip: ${c.trend.first} → ${c.trend.last} (${Math.abs(c.trend.delta)} points).`)}
        </div>
      )}
      {c.focus.length > 0 && (() => {
        // #424 (the coaching research: one fault, one cue, one drill - a list of
        // five corrections is five things ignored). The worst focus leads with
        // what KIND of work it needs (the session read's own definitions: broken
        // = change the technique, wandering = repetition) and its first drill,
        // taken from that checkpoint's own drills in the viewer's language.
        const top = c.focus[0];
        const chk = (result.shots || []).flatMap((s) => s.checks || []).find((k) => k && k.key === top.key);
        const drill = chk && Array.isArray(chk.how) && chk.how.length ? chk.how[0] : null;
        const broken = top.fixRate >= 0.5;
        return (
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.12)' }}>
            <div style={{ ...lbl, color: CYAN, marginBottom: 3 }}>{T.sessionFocus || 'FOCUS NEXT SESSION'}</div>
            <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.4 }}>{name(top)}</div>
            <div style={{ fontSize: 12.5, lineHeight: 1.5, color: 'rgba(255,255,255,0.75)', marginTop: 2 }}>
              {broken ? (T.focusChange ? T.focusChange(top.fix, top.n) : `Off on ${top.fix} of ${top.n} reps.`) : (T.focusRepeat || '')}
            </div>
            {drill && (
              <div style={{ fontSize: 12.5, lineHeight: 1.5, marginTop: 6 }}>
                <span style={{ ...lbl, color: CYAN, marginInlineEnd: 6 }}>{T.oneDrill || 'ONE DRILL'}</span>{drill}
              </div>
            )}
            {c.focus[1] && <div style={{ fontSize: 12, lineHeight: 1.5, color: 'rgba(255,255,255,0.6)', marginTop: 6 }}>{T.focusThen || 'After that:'} {name(c.focus[1])}</div>}
          </div>
        );
      })()}
    </div>
  );
}

function Timeline({ series, shot, cur, onSeek, T, hand }) {
  // Click a legend entry to show ONLY that line; click it again for all four
  // (Ohad 2026-08-26: "i wanna be able to only see one graph (knee/hip etc if i
  // click on it)"). Four traces over one another is unreadable when the
  // question is "what did the knee actually do".
  const [soloLine, setSoloLine] = useState(null);
  const [wholeClip, setWholeClip] = useState(false);
  // Four traces with four different ranges are squeezed into one box, so a
  // numbered y-axis is meaningless while they are all drawn. Solo ONE and the
  // axis becomes real - which is the moment Ohad asked for the numbers.
  const W = 600, H = 150, PAD = 6, GUT = 34, BOT = 13;
  const n = series.n; if (n < 2) return null;
  // The window is the viewed shot, padded so the run-up and the landing are
  // both visible. Falls back to the whole clip when a shot has no usable
  // phase indices, rather than drawing an empty box.
  const pIdx = (shot.phases || []).map((p) => p.idx).filter((i) => Number.isFinite(i) && i >= 0);
  const span = pIdx.length >= 2 ? { a: Math.min(...pIdx), b: Math.max(...pIdx) } : null;
  const padF = span ? Math.max(6, Math.round((span.b - span.a) * 0.22)) : 0;
  const zoomed = !wholeClip && !!span && (span.b - span.a) >= 2;
  const i0 = zoomed ? Math.max(0, span.a - padF) : 0;
  const i1 = zoomed ? Math.min(n - 1, span.b + padF) : n - 1;
  const t0 = series.tMs[i0], t1 = series.tMs[i1] || t0 + 1;
  const X = (i) => GUT + ((series.tMs[i] - t0) / (t1 - t0)) * (W - GUT - PAD);
  const Y = (v, lo, hi) => PAD + (1 - (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo || 1)) * (H - PAD - BOT);
  const hips = series.sm.hipY.filter(Number.isFinite);
  const hipLo = hips.length ? Math.min(...hips) : 0, hipHi = hips.length ? Math.max(...hips) : 1;
  // Every angle here is measured on the SHOOTING side - the engine reads
  // side(hand) for all of them. The graph never said so, and neither did the
  // metric boxes, so "which knee?" had no answer on screen (Ohad 08-30).
  const SIDE = (T && T.sideShort && T.sideShort[hand === 'L' ? 'L' : 'R']) || (hand === 'L' ? 'L' : 'R');
  const TRACES = [
    { id: 'knee', label: T.legend.knee, color: '#39BDFF', data: series.sm.knee, lo: 60, hi: 180, unit: '°', dec: 0 },
    { id: 'hipY', label: T.legend.hipHeight, color: '#2ED573', data: series.sm.hipY, lo: hipLo, hi: hipHi, unit: '', dec: 3 },
    { id: 'shoulder', label: T.legend.armElev, color: '#FFA502', data: series.sm.shoulder, lo: 0, hi: 180, unit: '°', dec: 0 },
    { id: 'elbow', label: T.legend.elbow, color: '#FFFFFF', data: series.sm.elbow, lo: 30, hi: 180, unit: '°', dec: 0 },
  ];
  const solo = TRACES.find((tr) => tr.id === soloLine) || null;
  const poly = (tr) => {
    const pts = [];
    for (let i = i0; i <= i1; i++) {
      const v = tr.data[i];
      if (v == null || !Number.isFinite(v)) continue;
      pts.push(X(i).toFixed(1) + ',' + Y(v, tr.lo, tr.hi).toFixed(1));
    }
    return <polyline key={tr.id} points={pts.join(' ')} fill="none" stroke={tr.color} strokeWidth="1.6" />;
  };
  const pick = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    // The plot no longer starts at the left edge: undo the gutter before
    // turning a pixel into a time, or every seek lands early.
    const fx = ((e.clientX - r.left) / r.width * W - GUT) / (W - GUT - PAD);
    const t = t0 + Math.max(0, Math.min(1, fx)) * (t1 - t0);
    let best = i0, bd = Infinity;
    for (let i = i0; i <= i1; i++) { const d = Math.abs(series.tMs[i] - t); if (d < bd) { bd = d; best = i; } }
    onSeek(best);
  };
  const secs = (ms) => ((ms - t0) / 1000).toFixed(1) + 's';
  const fmtV = (v, tr) => (v == null || !Number.isFinite(v) ? '—' : v.toFixed(tr.dec) + tr.unit);
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ f, ms: t0 + f * (t1 - t0) }));
  const yTicks = solo ? [0, 0.5, 1].map((f) => solo.lo + f * (solo.hi - solo.lo)) : [];
  const curVal = solo ? solo.data[cur] : null;
  return (
    <div style={{ marginTop: 10 }}>
      {/* Legends wrap inside their own cell; the toggle keeps the end of the
          row. A 36px toggle wrapped onto a row of its own used to leave a
          half-empty band between the legend rows on a phone. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', columnGap: 8, marginBottom: 4, alignItems: 'center' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: 8, rowGap: 0, alignItems: 'center', minWidth: 0 }}>
        {TRACES.map((tr) => (
          <button key={tr.id} onClick={() => setSoloLine((v) => (v === tr.id ? null : tr.id))}
            title={soloLine === tr.id ? T.legendAll : T.legendOnly(tr.label)}
            style={{ ...lbl, color: tr.color, background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 4px',
              opacity: soloLine && soloLine !== tr.id ? 0.3 : 1,
              textDecoration: soloLine === tr.id ? 'underline' : 'none' }}>
            — {tr.label} ({SIDE})
          </button>
        ))}
        </div>
        <button onClick={() => setWholeClip((v) => !v)}
          title={T === SHOT_I18N.he ? (wholeClip ? 'חזרה לזריקה שכרטיס הציון מציג' : 'כל הקליפ — כל החזרות, בשביל שאלת הקצב') : (wholeClip ? "Zoom back to the shot the scorecard is showing" : "Show the whole clip - every rep, for the rhythm question")}
          style={{ ...lbl, color: "rgba(255,255,255,0.75)", background: "transparent", border: "1px solid rgba(255,255,255,0.18)", cursor: "pointer", ...boxed(CTL_H), padding: "0 10px", whiteSpace: "nowrap" }}>
          {wholeClip ? (T.wholeClip || "WHOLE CLIP") : (T.thisShot || "THIS SHOT")}
        </button>
      </div>
      {/* What the axes MEAN, in words, above the box - and while one trace is
          soloed, its value at the playhead, so the graph and the frame readout
          can never disagree. */}
      <div dir="ltr" style={{ ...lbl, display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 3, unicodeBidi: 'isolate' }}>
        <span>{solo ? (T.axisSolo ? T.axisSolo(solo.label, SIDE, solo.unit) : 'Y ' + solo.label + ' (' + SIDE + ')' + (solo.unit ? ' ' + solo.unit : '') + '  X time s') : (T.axisAll || 'Y each trace on its own scale  X time s')}</span>
        {solo && <span style={{ color: solo.color }}>{secs(series.tMs[cur])} → {fmtV(curVal, solo)}</span>}
      </div>
      <svg viewBox={'0 0 ' + W + ' ' + H} style={{ width: '100%', height: 'auto', display: 'block', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.02)', cursor: 'crosshair' }}
        onMouseDown={pick} onMouseMove={(e) => { if (e.buttons === 1) pick(e); }}>
        {solo && yTicks.map((v, i) => (
          <g key={'y' + i}>
            <line x1={GUT} x2={W - PAD} y1={Y(v, solo.lo, solo.hi)} y2={Y(v, solo.lo, solo.hi)} stroke="rgba(255,255,255,0.10)" />
            <text x={GUT - 4} y={Y(v, solo.lo, solo.hi) + 3} textAnchor="end" fill="rgba(255,255,255,0.55)" fontFamily="Nord, monospace" fontSize="8">{v.toFixed(solo.dec)}</text>
          </g>
        ))}
        {xTicks.map((tk, i) => (
          <text key={'x' + i} x={GUT + tk.f * (W - GUT - PAD)} y={H - 3}
            textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}
            fill="rgba(255,255,255,0.55)" fontFamily="Nord, monospace" fontSize="8">{secs(tk.ms)}</text>
        ))}
        {shot.phases.filter((p) => p.idx >= i0 && p.idx <= i1).map((p) => <line key={p.key} x1={X(p.idx)} x2={X(p.idx)} y1={0} y2={H - BOT} stroke="rgba(255,255,255,0.22)" strokeDasharray="3 3" />)}
        {(() => { let lastX = -99; return shot.phases.filter((p) => p.idx >= i0 && p.idx <= i1).map((p) => { const x = X(p.idx); if (x - lastX < 34) return null; lastX = x; return <text key={p.key + 't'} x={x + 2} y={10} fill="rgba(255,255,255,0.55)" fontFamily="Nord, monospace" fontSize="8">{p.label}</text>; }); })()}
        {TRACES.filter((tr) => !soloLine || soloLine === tr.id).map(poly)}
        {cur >= i0 && cur <= i1 && <line x1={X(cur)} x2={X(cur)} y1={0} y2={H - BOT} stroke="#39BDFF" strokeWidth="1.5" />}
      </svg>
    </div>
  );
}

export { CHECKPOINTS };
