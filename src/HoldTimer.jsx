// HoldTimer.jsx — a hold-to-failure stopwatch for the eval's isometric tests
// (ISO single-leg stand, dead hang, SA push-up stance…). These tests score a
// number of seconds held, so the "tool" is a coach-operated timer, not a pose
// read: START when the athlete is set, STOP at failure, LOG the seconds into
// the eval field. Deliberately no camera/MediaPipe — it would add nothing a
// stopwatch doesn't, and it keeps the tool reliable.
//
// Used as a fullscreen overlay over EvaluationEditor, same shell language as
// MovementLab's jump tool. onSave(seconds:number) folds into evalTestMap.toValue.

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { C, FN } from './theme';

const fmt = (ms) => {
  const totalT = Math.floor(ms / 100);            // tenths
  const tenths = totalT % 10;
  const totalS = Math.floor(totalT / 10);
  const s = totalS % 60;
  const m = Math.floor(totalS / 60);
  return { mmss: `${m}:${String(s).padStart(2, '0')}`, tenths };
};

export default function HoldTimer({
  title = 'ISOMETRIC HOLD',
  side = null,                 // 'L' | 'R' | null — shown in the header
  goal = null,                 // e.g. '30 sec E' — shown as the target line
  onSave,                      // (seconds:number) => void
  onClose,
}) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);        // stopped with a time on the clock
  const startRef = useRef(0);
  const accRef = useRef(0);                        // accumulated ms across start/stop
  const rafRef = useRef(null);

  const tick = useCallback(() => {
    setElapsedMs(accRef.current + (performance.now() - startRef.current));
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const start = () => {
    if (running) return;
    setDone(false);
    startRef.current = performance.now();
    setRunning(true);
    rafRef.current = requestAnimationFrame(tick);
  };
  const stop = () => {
    if (!running) return;
    cancelAnimationFrame(rafRef.current);
    accRef.current += performance.now() - startRef.current;
    setElapsedMs(accRef.current);
    setRunning(false);
    setDone(true);
  };
  const reset = () => {
    cancelAnimationFrame(rafRef.current);
    accRef.current = 0;
    setElapsedMs(0);
    setRunning(false);
    setDone(false);
  };

  // keyboard: space = start/stop, so the coach can run it hands-on-athlete
  useEffect(() => {
    const onKey = (e) => {
      if (e.code === 'Space') { e.preventDefault(); running ? stop() : start(); }
      if (e.code === 'Escape') onClose && onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const { mmss, tenths } = fmt(elapsedMs);
  const seconds = Math.round(elapsedMs / 1000);
  const accent = running ? C.gn : (done ? C.ac : C.tm);

  const btn = (bg, color, border) => ({
    fontFamily: FN, fontSize: 13, fontWeight: 700, letterSpacing: '0.12em',
    padding: '14px 26px', borderRadius: 0, cursor: 'pointer',
    background: bg, color, border: `1px solid ${border}`, textTransform: 'uppercase',
  });

  return (
    <div role="dialog" aria-modal="true" aria-label="Isometric hold timer" style={{
      position: 'fixed', inset: 0, background: '#000', zIndex: 400,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }}>
      <button onClick={onClose} aria-label="Close timer" style={{
        position: 'absolute', top: 16, right: 18, background: 'transparent',
        border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: 24, cursor: 'pointer',
      }}>✕</button>

      <div style={{ fontFamily: FN, fontSize: 12, fontWeight: 700, letterSpacing: '0.18em', color: C.ac, textTransform: 'uppercase' }}>
        {title}{side ? ` · ${side}` : ''}
      </div>
      {goal && <div style={{ fontFamily: FN, fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', marginTop: 6 }}>TARGET · {goal}</div>}

      {/* the clock */}
      <div style={{ display: 'flex', alignItems: 'baseline', margin: '28px 0 10px', color: accent, transition: 'color .2s' }}>
        <span style={{ fontFamily: FN, fontSize: 96, fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{mmss}</span>
        <span style={{ fontFamily: FN, fontSize: 40, fontWeight: 800, width: 44 }}>.{tenths}</span>
      </div>
      <div style={{ fontFamily: FN, fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', minHeight: 16 }}>
        {running ? 'HOLDING — STOP AT FAILURE' : done ? `${seconds} SEC ON THE CLOCK` : 'PRESS START WHEN SET · SPACEBAR ALSO WORKS'}
      </div>

      {/* controls */}
      <div style={{ display: 'flex', gap: 12, marginTop: 30, flexWrap: 'wrap', justifyContent: 'center' }}>
        {!running && !done && <button onClick={start} style={btn(C.gn, '#000', C.gn)}>▶ START</button>}
        {running && <button onClick={stop} style={btn('#000', C.rd, C.rd)}>■ STOP</button>}
        {done && <>
          <button onClick={reset} style={btn('transparent', 'rgba(255,255,255,0.7)', 'rgba(255,255,255,0.3)')}>↺ REDO</button>
          <button onClick={start} style={btn('transparent', C.gn, C.gn)}>▶ RESUME</button>
          <button onClick={() => onSave && onSave(seconds)} style={btn(C.ac, '#fff', C.ac)}>✓ LOG {seconds}s</button>
        </>}
      </div>
    </div>
  );
}
