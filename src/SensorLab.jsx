// SensorLab.jsx — owner-only BETA lab that turns the phone into a sensor rig,
// wiring the three 2026-08-14 engines to real Web APIs:
//   • PULSE — rear camera + torch → mean-red frame series → analyzePPG (HR + HRV)
//   • ECHO  — mic → AnalyserNode RMS energy → analyzeAcousticSet (reps + grind)
//   • PIVOT — DeviceMotion gravity → romFromSweep / jointAngleTwoPos (joint ROM)
//
// Everything runs ON-DEVICE; no audio/video/motion ever leaves the phone. Each
// tool also has a SIMULATE button (synthetic input → the same engine → result) so
// it demonstrates without a live sensor and the UI is verifiable in a headless
// screenshot. Honest labels: HR/ROM are solid, HRV/RIR are gated + confidence-
// tagged. Not a medical device — informs, never diagnoses. Greenlight-gated: owner
// entry only, nothing athlete-facing.

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { C, FN, FB } from './theme';
import { analyzePPG } from './pulsePPG';
import { analyzeAcousticSet } from './acousticReps';
import { romFromSweep, inclination, ROM_NORMS } from './goniometer';
import { analyzeReflex } from './reflexPVT';

const Btn = ({ children, onClick, primary, disabled, style }) => (
  <button onClick={onClick} disabled={disabled} style={{
    minHeight: 44, padding: '11px 16px', border: `1px solid ${primary ? C.ac : C.cardBd}`,
    background: primary ? C.ac : 'transparent', color: primary ? '#04121a' : C.tx,
    fontFamily: FN, fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1, borderRadius: 0, ...style,
  }}>{children}</button>
);
const Row = ({ label, value, color }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '7px 0', borderTop: `1px solid ${C.cardBd}` }}>
    <span style={{ fontFamily: FN, fontSize: 10, letterSpacing: '0.08em', color: C.tm, textTransform: 'uppercase' }}>{label}</span>
    <span style={{ fontFamily: FN, fontSize: 15, fontWeight: 700, color: color || C.tx, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
  </div>
);
const Note = ({ children }) => <div style={{ fontSize: 11.5, color: C.tm, lineHeight: 1.5, marginTop: 10 }}>{children}</div>;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---------------- PULSE ----------------
function PulsePanel() {
  const [state, setState] = useState('idle'); // idle | reading | done | error
  const [progress, setProgress] = useState(0);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');
  const stopRef = useRef(false);

  const run = useCallback(async () => {
    setErr(''); setRes(null); setProgress(0); stopRef.current = false;
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: 320, height: 240 }, audio: false });
      const track = stream.getVideoTracks()[0];
      try { await track.applyConstraints({ advanced: [{ torch: true }] }); } catch { /* torch optional */ }
      const video = document.createElement('video');
      video.srcObject = stream; video.playsInline = true; await video.play();
      const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 48;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      setState('reading');
      const samples = []; const t0 = performance.now(); const DUR = 60000;
      while (performance.now() - t0 < DUR && !stopRef.current) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let sum = 0; for (let i = 0; i < d.length; i += 4) sum += d[i];
        samples.push({ t: performance.now() - t0, v: sum / (d.length / 4) });
        setProgress(Math.min(100, ((performance.now() - t0) / DUR) * 100));
        await sleep(33);
      }
      stream.getTracks().forEach(t => t.stop());
      const r = analyzePPG(samples, {});
      setRes(r); setState(r.ok ? 'done' : 'error'); if (!r.ok) setErr(r.reason || 'no clean pulse');
    } catch (e) {
      if (stream) stream.getTracks().forEach(t => t.stop());
      setErr(e?.message || 'camera unavailable'); setState('error');
    }
  }, []);

  const simulate = useCallback(() => {
    // synthetic 60s clean fingertip PPG at ~64 bpm
    const s = []; let ph = 0;
    for (let i = 0; i < 1800; i++) { const t = i * 33.3; ph += 2 * Math.PI * (64 / 60) * 0.0333; s.push({ t, v: 128 + 5 * Math.sin(2 * Math.PI * 0.05 * t / 1000) + 8 * Math.sin(ph) + 3 * Math.sin(2 * ph) }); }
    const r = analyzePPG(s, { baseline: { mean: 55, sd: 12 } });
    setRes(r); setState(r.ok ? 'done' : 'error'); setErr('');
  }, []);

  return (
    <div>
      <Note>Cover the <b>rear camera + flash</b> with a fingertip and hold dead still for 60s. Reads heart rate always; HRV (recovery) when the signal is clean. On-device — nothing is recorded or uploaded.</Note>
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <Btn primary onClick={run} disabled={state === 'reading'}>{state === 'reading' ? `Reading… ${Math.round(progress)}%` : 'Start (finger on camera)'}</Btn>
        {state === 'reading' ? <Btn onClick={() => { stopRef.current = true; }}>Stop</Btn> : <Btn onClick={simulate}>Simulate</Btn>}
      </div>
      {err && <Note><span style={{ color: C.rd }}>{err}</span></Note>}
      {res?.ok && (
        <div style={{ marginTop: 14 }}>
          <Row label="Heart rate" value={`${res.hr} bpm`} color={C.ac} />
          {res.hrv
            ? <><Row label="HRV (RMSSD)" value={`${res.hrv.rmssd} ms`} /><Row label="Confidence" value={res.hrv.confidence} color={res.hrv.confidence === 'high' ? C.gn : C.or} /></>
            : <Note>{res.hrvReason}</Note>}
          {res.readiness && <Note><b style={{ color: res.readiness.band === 'suppressed' ? C.rd : res.readiness.band === 'primed' ? C.gn : C.tx }}>{res.readiness.band.toUpperCase()}</b> — {res.readiness.note}</Note>}
        </div>
      )}
    </div>
  );
}

// ---------------- ECHO ----------------
function EchoPanel() {
  const [state, setState] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');
  const stopRef = useRef(false);

  const run = useCallback(async () => {
    setErr(''); setRes(null); setProgress(0); stopRef.current = false;
    let stream, ac;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      ac = new (window.AudioContext || window.webkitAudioContext)();
      const src = ac.createMediaStreamSource(stream);
      const an = ac.createAnalyser(); an.fftSize = 1024; src.connect(an);
      const buf = new Float32Array(an.fftSize);
      setState('reading');
      const frames = []; const t0 = performance.now(); const DUR = 40000;
      while (performance.now() - t0 < DUR && !stopRef.current) {
        an.getFloatTimeDomainData(buf);
        let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
        frames.push({ t: performance.now() - t0, e: Math.sqrt(s / buf.length) });
        setProgress(Math.min(100, ((performance.now() - t0) / DUR) * 100));
        await sleep(20);
      }
      stream.getTracks().forEach(t => t.stop()); ac.close();
      const r = analyzeAcousticSet(frames, {});
      setRes(r); setState(r.ok ? 'done' : 'error'); if (!r.ok) setErr(r.reason || 'no reps heard');
    } catch (e) {
      if (stream) stream.getTracks().forEach(t => t.stop()); if (ac) try { ac.close(); } catch {}
      setErr(e?.message || 'mic unavailable'); setState('error');
    }
  }, []);

  const simulate = useCallback(() => {
    // 6 reps, effort climbing in the last few (a set near failure)
    const amps = [1, 1, 1.05, 1.2, 1.6, 2.2], reps = 6, gap = 2500, burst = 650, fps = 50, start = 800;
    const frames = []; const dur = start + reps * gap + 1000;
    for (let t = 0; t < dur; t += 1000 / fps) {
      let e = 0.05;
      for (let r = 0; r < reps; r++) { const c = start + r * gap, d = t - c; if (Math.abs(d) < burst / 2) e += amps[r] * 0.5 * (1 + Math.cos(2 * Math.PI * d / burst)); }
      frames.push({ t, e });
    }
    const r = analyzeAcousticSet(frames, {});
    setRes(r); setState(r.ok ? 'done' : 'error'); setErr('');
  }, []);

  return (
    <div>
      <Note>Set the phone near the bar and hit start before your set. Listens for the rhythm of the reps + the grunt/clank to count reps and read <b>grind</b> (effort climbing = near failure). Works in a pocket / in the dark. On-device audio, never uploaded.</Note>
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <Btn primary onClick={run} disabled={state === 'reading'}>{state === 'reading' ? `Listening… ${Math.round(progress)}%` : 'Start (before your set)'}</Btn>
        {state === 'reading' ? <Btn onClick={() => { stopRef.current = true; }}>End set</Btn> : <Btn onClick={simulate}>Simulate</Btn>}
      </div>
      {err && <Note><span style={{ color: C.rd }}>{err}</span></Note>}
      {res?.ok && (
        <div style={{ marginTop: 14 }}>
          <Row label="Reps" value={res.reps} color={C.ac} />
          {res.cadence && <Row label="Cadence" value={res.cadence} />}
          <Row label="Grind" value={res.grind.rising ? `rising ×${res.grind.index}` : 'steady'} color={res.grind.rising ? C.or : C.gn} />
          {res.grind.rirEstimate != null && <Row label="Reps in reserve (est.)" value={String(res.grind.rirEstimate)} />}
          <Note>{res.grind.note}</Note>
        </div>
      )}
    </div>
  );
}

// ---------------- PIVOT ----------------
function PivotPanel() {
  const [state, setState] = useState('idle');
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');
  const [joint, setJoint] = useState('knee-flexion');
  const stopRef = useRef(false);

  const run = useCallback(async () => {
    setErr(''); setRes(null); stopRef.current = false;
    try {
      if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        const p = await DeviceMotionEvent.requestPermission(); if (p !== 'granted') throw new Error('motion permission denied');
      }
      const samples = []; const t0 = performance.now();
      const onMotion = (e) => {
        const g = e.accelerationIncludingGravity; if (!g) return;
        samples.push({ t: performance.now() - t0, g: { x: g.x || 0, y: g.y || 0, z: g.z || 0 } });
      };
      window.addEventListener('devicemotion', onMotion);
      setState('reading');
      const DUR = 6000; while (performance.now() - t0 < DUR && !stopRef.current) await sleep(50);
      window.removeEventListener('devicemotion', onMotion);
      if (samples.length < 8) throw new Error('no motion captured — is motion access on?');
      const r = romFromSweep(samples, { joint });
      setRes(r); setState(r.ok ? 'done' : 'error'); if (!r.ok) setErr(r.reason || 'no movement');
    } catch (e) { setErr(e?.message || 'motion unavailable'); setState('error'); }
  }, [joint]);

  const simulate = useCallback(() => {
    const sweep = []; const peak = ROM_NORMS[joint] ? Math.round(ROM_NORMS[joint] * 0.88) : 110;
    for (let i = 0; i <= 40; i++) { const a = i <= 20 ? (i / 20) * peak : ((40 - i) / 20) * peak; const rad = a / 180 * Math.PI; sweep.push({ t: i * 50, g: { x: Math.sin(rad), y: 0, z: Math.cos(rad) } }); }
    const r = romFromSweep(sweep, { joint });
    setRes(r); setState(r.ok ? 'done' : 'error'); setErr('');
  }, [joint]);

  return (
    <div>
      <Note>Lay the phone flat against the limb and move the joint through its full range. Reads active <b>range of motion</b> vs a clinical norm — a hard mobility number for the Evaluation. (Placement in the movement plane matters.)</Note>
      <div style={{ marginTop: 10 }}>
        <select value={joint} onChange={e => setJoint(e.target.value)} style={{ background: C.sf2 || 'transparent', color: C.tx, border: `1px solid ${C.cardBd}`, padding: '8px 10px', fontFamily: FN, fontSize: 12, borderRadius: 0, width: '100%' }}>
          {Object.keys(ROM_NORMS).map(k => <option key={k} value={k}>{k.replace(/-/g, ' ')}</option>)}
        </select>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <Btn primary onClick={run} disabled={state === 'reading'}>{state === 'reading' ? 'Move the joint…' : 'Start sweep'}</Btn>
        {state === 'reading' ? <Btn onClick={() => { stopRef.current = true; }}>Done</Btn> : <Btn onClick={simulate}>Simulate</Btn>}
      </div>
      {err && <Note><span style={{ color: C.rd }}>{err}</span></Note>}
      {res?.ok && (
        <div style={{ marginTop: 14 }}>
          <Row label="Range of motion" value={`${res.rom}°`} color={C.ac} />
          <Row label="Peak / min" value={`${res.peak}° / ${res.min}°`} />
          {res.pctOfNorm != null && <Row label="% of typical" value={`${res.pctOfNorm}%`} color={res.limited ? C.rd : C.gn} />}
          <Row label="Peak speed" value={`${res.peakVelDegS}°/s`} />
          {res.note && <Note>{res.note}</Note>}
        </div>
      )}
    </div>
  );
}

// ---------------- REFLEX ----------------
function ReflexPanel() {
  const [phase, setPhase] = useState('idle'); // idle | armed | go | done
  const [count, setCount] = useState(0);
  const [res, setRes] = useState(null);
  const rts = useRef([]);
  const goAt = useRef(0);
  const timer = useRef(null);
  const TRIALS = 8;

  const finish = useCallback(() => { setPhase('done'); setRes(analyzeReflex(rts.current, { baseline: { meanRT: 265, sd: 22 } })); }, []);
  const arm = useCallback(() => {
    setPhase('armed');
    timer.current = setTimeout(() => { goAt.current = performance.now(); setPhase('go'); }, 1200 + Math.random() * 2600);
  }, []);
  const nextOrEnd = useCallback(() => { setCount(rts.current.length); if (rts.current.length >= TRIALS) finish(); else arm(); }, [arm, finish]);
  const start = useCallback(() => { rts.current = []; setRes(null); setCount(0); arm(); }, [arm]);
  const tap = useCallback(() => {
    if (phase === 'armed') { clearTimeout(timer.current); rts.current.push(50); nextOrEnd(); }   // false start (<100)
    else if (phase === 'go') { rts.current.push(Math.round(performance.now() - goAt.current)); nextOrEnd(); }
  }, [phase, nextOrEnd]);
  const simulate = useCallback(() => {
    const arr = [255, 268, 249, 272, 60, 261, 258, 540, 247, 263]; // includes a false start + a lapse
    setRes(analyzeReflex(arr, { baseline: { meanRT: 265, sd: 22 } })); setPhase('done'); setCount(TRIALS);
  }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const armed = phase === 'armed', go = phase === 'go';
  return (
    <div>
      <Note>Tap the moment the box flashes cyan — {TRIALS} times. Measures your <b>reaction time + attention lapses</b> (a PVT), the gold-standard read of how sharp the nervous system is TODAY. A slow, lapsy CNS = a day to back off heavy neural work.</Note>
      {(armed || go) && (
        <div onPointerDown={tap} style={{ marginTop: 12, height: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', userSelect: 'none',
          background: go ? C.ac : C.sf2 || '#111', border: `1px solid ${go ? C.ac : C.cardBd}`, transition: 'background 60ms' }}>
          <span style={{ fontFamily: FN, fontWeight: 700, fontSize: 18, letterSpacing: '0.1em', color: go ? '#04121a' : C.tm }}>{go ? 'TAP!' : 'wait…'}</span>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <Btn primary onClick={start} disabled={armed || go}>{(armed || go) ? `Trial ${count + 1}/${TRIALS}` : 'Start test'}</Btn>
        {!(armed || go) && <Btn onClick={simulate}>Simulate</Btn>}
      </div>
      {res?.ok && (
        <div style={{ marginTop: 14 }}>
          <Row label="Mean reaction" value={`${res.meanRT} ms`} color={C.ac} />
          <Row label="Fastest 10%" value={`${res.fastest10} ms`} />
          <Row label="Lapses" value={String(res.lapses)} color={res.lapses ? C.or : C.gn} />
          {res.falseStarts > 0 && <Row label="False starts" value={String(res.falseStarts)} color={C.or} />}
          {res.readiness && <Note><b style={{ color: res.readiness.band === 'suppressed' ? C.rd : res.readiness.band === 'primed' ? C.gn : C.tx }}>{res.readiness.band.toUpperCase()}</b> — {res.readiness.note}</Note>}
        </div>
      )}
      {res && !res.ok && <Note><span style={{ color: C.rd }}>{res.reason}</span></Note>}
    </div>
  );
}

const TOOLS = [
  { key: 'pulse', name: 'PULSE', sub: 'Camera HRV', Panel: PulsePanel },
  { key: 'echo', name: 'ECHO', sub: 'Mic reps/grind', Panel: EchoPanel },
  { key: 'pivot', name: 'PIVOT', sub: 'Motion ROM', Panel: PivotPanel },
  { key: 'reflex', name: 'REFLEX', sub: 'CNS reaction', Panel: ReflexPanel },
];

export default function SensorLab() {
  const [open, setOpen] = useState(false);
  const [tool, setTool] = useState('pulse');
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener('expo-open-lab', onOpen);
    // deep-link: #lab opens it (used for screenshot verification)
    if (typeof window !== 'undefined' && window.location.hash.includes('lab')) setOpen(true);
    return () => window.removeEventListener('expo-open-lab', onOpen);
  }, []);
  if (!open) return null;
  const Active = TOOLS.find(t => t.key === tool)?.Panel || PulsePanel;
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(4,6,8,0.86)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '4vh 12px' }}
      onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div style={{ width: '100%', maxWidth: 460, background: C.bg, border: `1px solid ${C.cardBd}`, boxShadow: `0 0 0 1px ${C.ac}22` }}>
        <div style={{ background: `linear-gradient(90deg, ${C.ac}22, transparent)`, borderBottom: `2px solid ${C.ac}`, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: FN, fontWeight: 700, fontSize: 14, letterSpacing: '0.1em', color: C.tx }}>SENSOR LAB <span style={{ fontSize: 9, color: C.ac, border: `1px solid ${C.ac}`, padding: '1px 5px', marginLeft: 6 }}>BETA</span></div>
            <div style={{ fontFamily: FN, fontSize: 10, color: C.tm, letterSpacing: '0.06em', marginTop: 2 }}>the phone as a sensor rig · on-device</div>
          </div>
          <button onClick={() => setOpen(false)} aria-label="Close" style={{ background: 'transparent', border: 'none', color: C.tm, fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ display: 'flex', borderBottom: `1px solid ${C.cardBd}` }}>
          {TOOLS.map(t => (
            <button key={t.key} onClick={() => setTool(t.key)} style={{ flex: 1, padding: '10px 6px', background: tool === t.key ? C.acD || 'transparent' : 'transparent', border: 'none', borderBottom: tool === t.key ? `2px solid ${C.ac}` : '2px solid transparent', cursor: 'pointer' }}>
              <div style={{ fontFamily: FN, fontWeight: 700, fontSize: 12, color: tool === t.key ? C.ac : C.tx, letterSpacing: '0.08em' }}>{t.name}</div>
              <div style={{ fontFamily: FN, fontSize: 8.5, color: C.tm, marginTop: 2, letterSpacing: '0.02em' }}>{t.sub}</div>
            </button>
          ))}
        </div>
        <div style={{ padding: 16 }}>
          <Active />
          <Note><span style={{ color: C.td }}>BETA · engine-verified (58 fixtures) · not a medical device — informs, never diagnoses. HR/ROM are solid; HRV/RIR/CNS reads are gated + labelled.</span></Note>
        </div>
      </div>
    </div>,
    document.body,
  );
}
