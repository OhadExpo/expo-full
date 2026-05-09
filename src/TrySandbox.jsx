// Public unauthenticated sandbox at /try. Lets a landing-page visitor walk
// the upload → pose detection → rep count → side-by-side compare flow on
// their own video without creating an account or touching Supabase. Mounted
// from src/App.jsx via an early-return in AuthGate when location.pathname
// starts with /try.
//
// Self-contained: no auth, no Supabase, no useStore, nothing that the rest of
// the app depends on. Reuses src/repCounter.js for the math so when the
// production rep counter is tuned the sandbox tracks automatically.
import React, { useEffect, useRef, useState } from 'react';
import { C, FN, FB } from './theme';
import { EXPOMark } from './expoMark';
import {
  ANGLE_DEFS, angleAt, detectChannels, medianFilter, findPeaks, SMOOTH_N,
} from './repCounter';

// MediaPipe Pose-Landmarker landmark pairs we draw skeleton edges between.
// Same set the production WorkoutReview overlay uses. Anything outside this
// is silent metadata — the rep counter still uses worldLandmarks for joint
// angle math regardless of what's drawn.
const POSE_CONNECTIONS = [
  [11,12],[11,23],[12,24],[23,24],
  [11,13],[13,15],
  [12,14],[14,16],
  [23,25],[25,27],
  [24,26],[26,28],
];

// Catalog of exercise titles the chip picker exposes. The `sample` string is
// passed through detectChannels() so the sandbox uses the correct joint
// channels for rep counting (knee for squat, hip for hinge, elbow for press,
// etc.) — exact same logic the production app runs.
const TRY_EXERCISES = [
  { key:'squat',    label:'Back Squat',           sample:'Back Squat' },
  { key:'goblet',   label:'Goblet Squat',         sample:'Goblet Squat' },
  { key:'lunge',    label:'Walking Lunge',        sample:'Walking Lunge' },
  { key:'rdl',      label:'Romanian Deadlift',    sample:'Romanian Deadlift' },
  { key:'dl',       label:'Deadlift',             sample:'Deadlift' },
  { key:'hipthrust',label:'Hip Thrust',           sample:'Hip Thrust' },
  { key:'bench',    label:'Bench Press',          sample:'Bench Press' },
  { key:'ohp',      label:'Overhead Press',       sample:'Overhead Press' },
  { key:'pushup',   label:'Push-Up',              sample:'Push-Up' },
  { key:'pullup',   label:'Pull-Up',              sample:'Pull-Up' },
  { key:'row',      label:'DB Row',               sample:'DB Row' },
  { key:'curl',     label:'DB Curl',              sample:'DB Curl' },
  { key:'lateral',  label:'Lateral Raise',        sample:'Lateral Raise' },
];

const baseBtn = {
  display:'inline-flex', alignItems:'center', gap:6, padding:'8px 16px',
  borderRadius:0, border:'none', fontFamily:FB, fontSize:13, fontWeight:600,
  cursor:'pointer', letterSpacing:'0.02em', transition:'all 0.15s',
};

// /demo — the trainee POV engine sandbox. /try used to mount this with
// pov='coach' but now mounts CoachDemo instead, so the only live caller is
// the trainee POV. The pov prop and isCoach branches stay for now in case
// the coach POV gets reused as a focused single-screen demo later, but they
// are unreachable from the live router.
//
// `?embed=1` in the URL hides the header, POV banner, and footer so the
// engine can be iframe'd into CoachLanding / CoachDemo without nested chrome.
export default function TrySandbox({ pov = 'trainee' } = {}) {
  const isEmbedded = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('embed') === '1';
  // step: 'exercise' → 'upload' → 'analyze' → 'compare'
  // We don't gate forward steps — you can land on 'analyze' with no video and
  // it'll show the empty state. The header stepper is the canonical UI path.
  const [step, setStep] = useState('exercise');
  const [exercise, setExercise] = useState(null);
  const [videoBlob, setVideoBlob] = useState(null); // user-uploaded video (blob URL)
  const [videoUrl, setVideoUrl] = useState(null);
  const [secondUrl, setSecondUrl] = useState(null); // for compare step

  // Tear down any blob URLs on unmount so they don't leak across navigations.
  useEffect(() => {
    return () => {
      if (videoUrl) try { URL.revokeObjectURL(videoUrl); } catch {}
      if (secondUrl) try { URL.revokeObjectURL(secondUrl); } catch {}
    };
  }, [videoUrl, secondUrl]);

  const onPickExercise = (ex) => { setExercise(ex); setStep('upload'); };
  const onUpload = (file) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setVideoBlob(file);
    setVideoUrl(url);
    setStep('analyze');
  };
  const onUploadSecond = (file) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setSecondUrl(url);
  };
  const restart = () => {
    if (videoUrl) try { URL.revokeObjectURL(videoUrl); } catch {}
    if (secondUrl) try { URL.revokeObjectURL(secondUrl); } catch {}
    setVideoUrl(null); setSecondUrl(null); setVideoBlob(null);
    setExercise(null); setStep('exercise');
  };

  // For pov="trainee" + landing step, mirror the real ClientPortal surface
  // 1:1 — own header, 4-tab nav, day cards, BW tab, History tab. The engine
  // sandbox (upload → analyze → compare) only takes over once the visitor
  // taps "📹 FILM SET" on an exercise, and a ← BACK TO PORTAL link returns
  // them home so they don't get stuck in a marketing flow.
  const isTraineePortal = pov === 'trainee' && !isEmbedded && step === 'exercise';

  return (
    // /try sandbox is a public marketing surface — force dark while light
    // mode is gated to the coach app only.
    <div data-theme="dark" style={{
      background: C.bg, color: C.tx, minHeight:'100vh',
      fontFamily: FB, display:'flex', flexDirection:'column',
    }}>
      {!isEmbedded && !isTraineePortal && <Header step={step} exercise={exercise} onRestart={restart} onStep={setStep} hasVideo={!!videoUrl} />}
      {!isEmbedded && !isTraineePortal && <POVBanner pov={pov} />}
      {!isEmbedded && !isTraineePortal && pov === 'trainee' && <TraineeContextStrip exercise={exercise} />}
      {isTraineePortal ? (
        <ClientPortalMock onPick={onPickExercise} />
      ) : (
        <main style={{ flex:1, padding: isEmbedded ? '14px 16px 24px' : '18px 16px 80px', maxWidth:1180, margin:'0 auto', width:'100%' }}>
          {step === 'exercise' && <ExercisePicker pov={pov} onPick={onPickExercise} />}
          {step === 'upload'   && <UploadStep pov={pov} exercise={exercise} onUpload={onUpload} onChangeExercise={pov === 'trainee' ? restart : () => setStep('exercise')} />}
          {step === 'analyze'  && <AnalyzeStep pov={pov} exercise={exercise} videoUrl={videoUrl}
                                    onChangeVideo={() => setStep('upload')}
                                    onCompare={() => setStep('compare')} hideEndCTA={isEmbedded} />}
          {step === 'compare'  && <CompareStep pov={pov} exercise={exercise} primaryUrl={videoUrl} secondUrl={secondUrl}
                                    onUploadSecond={onUploadSecond}
                                    onBack={() => setStep('analyze')} hideEndCTA={isEmbedded} />}
        </main>
      )}
      {!isEmbedded && !isTraineePortal && <Footer />}
    </div>
  );
}

// ─── ClientPortalMock — 1:1 mirror of src/ClientPortal.jsx for /demo/trainee ────
//
// Renders the same surface the real `/portal` shows: gradient top header
// (logo + lock + Log Out), centered "Hey {first} 💪" greeting, plan
// badges + 🔥STREAK + N SESSIONS counter, 4-tab nav (Program / BW / PRs /
// History), and per-tab bodies. Mock data is sized to match the existing
// TraineeHomeMock so the URL transition feels seamless.
//
// "📹 FILM SET" on an exercise calls back into TrySandbox to enter the
// engine sandbox (upload → analyze → compare) with that lift pre-picked.
function ClientPortalMock({ onPick }) {
  const TRAINEE = {
    name: 'נועה לוי', firstName: 'Noa', sessionsLeft: 6,
    plans: [{ name: 'Block #4 — Push/Pull Volume', phase: 'Volume', weeks: 4 }],
  };
  const PLAN = TRAINEE.plans[0];
  // 2 days × 4 exercises — keeps the demo focused: an athlete sees Day A
  // (push) + Day B (pull) on the program tab, fully visible without
  // scrolling.
  const DAYS = [
    {
      name: 'Day A · Push',
      ex: [
        { eid: 'bench',   t: 'Bench Press',     vid: 'https://youtu.be/0', s: 4, r: '6-8',   load: '60kg',   tempo: '3-1-1', focus: 'Pause 1s on chest, drive heels.' },
        { eid: 'ohp',     t: 'Overhead Press',  vid: 'https://youtu.be/0', s: 4, r: '6-8',   load: '35kg',   focus: 'Glutes locked, ribs down.' },
        { eid: 'lateral', t: 'Lateral Raise',   vid: 'https://youtu.be/0', s: 3, r: '12-15', load: '7.5kg',  focus: 'Lead with elbows, soft thumb.' },
        { eid: 'pushup',  t: 'Push-Up',         vid: 'https://youtu.be/0', s: 3, r: '12',    load: 'BW',     focus: '2-1-1 tempo, plank from heel to crown.' },
      ],
    },
    {
      name: 'Day B · Pull',
      ex: [
        { eid: 'pullup',  t: 'Pull-Up',     vid: 'https://youtu.be/0', s: 4, r: '6-8',  load: 'BW',     focus: 'Chin clears bar, no kip.' },
        { eid: 'row',     t: 'DB Row',      vid: 'https://youtu.be/0', s: 3, r: '10 E', load: '20kg',   focus: 'Pull to hip, not chest.' },
        { eid: 'curl',    t: 'DB Curl',     vid: 'https://youtu.be/0', s: 3, r: '12',   load: '12.5kg', focus: 'No swing — count from full hang.' },
        { eid: 'face',    t: 'Face Pull',   vid: 'https://youtu.be/0', s: 3, r: '15',   load: '15kg',   focus: 'Elbows high, pull to forehead.' },
      ],
    },
  ];
  // History rows match the real ClientPortal shape: per-workout cards with
  // per-exercise rows inside (title · prescription — done/total · 📹 if a
  // form video was uploaded · 💬 N if the coach left review notes).
  const HISTORY = [
    {
      id: 'h1', date: '2026-04-29', dayName: 'Day C · Legs', planName: PLAN.name, week: 1,
      exercises: [
        { title: 'Back Squat',        prescribed: '5×5 · 95kg',  done: 5, total: 5, hasVideo: false, notes: 0 },
        { title: 'Romanian Deadlift', prescribed: '4×8 · 70kg',  done: 4, total: 4, hasVideo: false, notes: 0 },
        { title: 'Walking Lunge',     prescribed: '3×10 E',      done: 3, total: 3, hasVideo: false, notes: 0 },
        { title: 'Hip Thrust',        prescribed: '3×10 · 80kg', done: 2, total: 2, hasVideo: false, notes: 0 },
      ],
    },
    {
      id: 'h2', date: '2026-04-27', dayName: 'Day B · Pull', planName: PLAN.name, week: 1,
      exercises: [
        { title: 'Pull-Up',         prescribed: '4×6-8 · BW',     done: 4, total: 4, hasVideo: true,  notes: 2 },
        { title: 'DB Row',          prescribed: '3×10 E · 20kg',  done: 3, total: 3, hasVideo: false, notes: 0 },
        { title: 'DB Curl',         prescribed: '3×12 · 12.5kg',  done: 3, total: 3, hasVideo: true,  notes: 0 },
        { title: 'Face Pull',       prescribed: '3×15 · 15kg',    done: 3, total: 3, hasVideo: false, notes: 0 },
      ],
    },
    {
      id: 'h3', date: '2026-04-23', dayName: 'Day A · Push', planName: PLAN.name, week: 1,
      exercises: [
        { title: 'Bench Press',     prescribed: '4×6-8 · 60kg',  done: 4, total: 4, hasVideo: true,  notes: 3 },
        { title: 'Overhead Press',  prescribed: '4×6-8 · 35kg',  done: 4, total: 4, hasVideo: false, notes: 0 },
        { title: 'Lateral Raise',   prescribed: '3×12-15 · 7.5kg', done: 3, total: 3, hasVideo: false, notes: 0 },
        { title: 'Push-Up',         prescribed: '3×12 · BW',     done: 3, total: 3, hasVideo: false, notes: 0 },
      ],
    },
    {
      id: 'h4', date: '2026-04-20', dayName: 'Day C · Legs', planName: PLAN.name, week: 4,
      exercises: [
        { title: 'Back Squat',        prescribed: '5×5 · 92.5kg', done: 5, total: 5, hasVideo: false, notes: 0 },
        { title: 'Romanian Deadlift', prescribed: '4×8 · 67.5kg', done: 4, total: 4, hasVideo: false, notes: 0 },
        { title: 'Walking Lunge',     prescribed: '3×10 E',       done: 3, total: 3, hasVideo: false, notes: 0 },
        { title: 'Hip Thrust',        prescribed: '3×10 · 77.5kg', done: 2, total: 2, hasVideo: false, notes: 0 },
      ],
    },
  ];
  const PRS = [
    { name: 'Back Squat',          load: '105kg', date: '2026-04-26', delta: '+5kg / 8w' },
    { name: 'Bench Press',         load: '70kg',  date: '2026-04-22', delta: '+2.5kg / 8w' },
    { name: 'Romanian Deadlift',   load: '80kg',  date: '2026-04-19', delta: '+5kg / 8w' },
    { name: 'Pull-Up',             load: '+5kg',  date: '2026-04-16', delta: '+2.5kg / 8w' },
  ];
  const BW_LOG = [
    { date: '2026-03-04', bw: 65.6, week: 1 },
    { date: '2026-03-11', bw: 65.1, week: 2 },
    { date: '2026-03-18', bw: 64.8, week: 3 },
    { date: '2026-03-25', bw: 64.3, week: 4 },
    { date: '2026-04-01', bw: 64.4, week: 1 },
    { date: '2026-04-08', bw: 64.0, week: 2 },
    { date: '2026-04-15', bw: 63.7, week: 3 },
    { date: '2026-04-22', bw: 63.3, week: 4 },
  ];

  const [vw, setVw] = useState('prog');
  const [bw, setBw] = useState('');
  const [bwInput, setBwInput] = useState('');
  const [bwData, setBwData] = useState(BW_LOG);
  const [wk, setWk] = useState(1); // current week (0-indexed: 1 = W2)
  const [doneDays, setDoneDays] = useState({}); // { [dayName]: true }
  const [loggingDay, setLoggingDay] = useState(null); // day index being logged
  const [logSets, setLogSets] = useState({}); // {`${dayIdx}:${exIdx}:${setIdx}`: {reps,load,done}}
  const [preCheck, setPreCheck] = useState({ pain: '', energy: '', sleep: '' });
  const [expandedHistEx, setExpandedHistEx] = useState(null); // History tab tap-to-expand: `${workoutId}:${exIdx}`

  // ─── Mock StepLogger — mirrors src/ClientPortal.jsx StepLogger ─────
  // Open when 📝 Log is tapped on a day card. Shows pre-workout check
  // (pain/energy/sleep), then per-exercise set-by-set log inputs, then a
  // Complete button that marks the day done and returns to the program tab.
  if (loggingDay != null) {
    const day = DAYS[loggingDay];
    const exit = () => { setLoggingDay(null); window.scrollTo(0, 0); };
    const completeAndExit = () => {
      setDoneDays(d => ({ ...d, [day.name]: true }));
      exit();
    };
    const totalSets = day.ex.reduce((a, ex) => a + ex.s, 0);
    const doneSets = day.ex.reduce((a, ex, exIdx) => {
      let n = 0;
      for (let s = 0; s < ex.s; s++) {
        if (logSets[`${loggingDay}:${exIdx}:${s}`]?.done) n++;
      }
      return a + n;
    }, 0);
    const pct = totalSets > 0 ? Math.round((doneSets / totalSets) * 100) : 0;
    const updateSet = (exIdx, setIdx, patch) => {
      const k = `${loggingDay}:${exIdx}:${setIdx}`;
      setLogSets(s => ({ ...s, [k]: { ...(s[k] || { reps: '', load: '', done: false }), ...patch } }));
    };
    return (
      <div style={{ background: C.bg, color: C.tx, minHeight: '100vh', fontFamily: FB, maxWidth: 500, margin: '0 auto' }}>
        <div style={{ background: `linear-gradient(135deg,${C.sf},${C.sf2})`, padding: '16px 20px', borderBottom: `1px solid ${C.bd}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <button onClick={exit} style={{ background: 'none', border: 'none', color: C.ac, cursor: 'pointer', fontFamily: FB, fontSize: 13, padding: 0 }}>← Back</button>
            <button onClick={completeAndExit} style={{ background: C.gn, color: '#0a0a0b', border: 'none', borderRadius: 0, padding: '6px 14px', fontFamily: FB, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              Complete Workout
            </button>
          </div>
          <h2 style={{ margin: '0 0 4px', fontFamily: FN, fontSize: 18, textAlign: 'center' }}>{day.name}</h2>
          <div style={{ fontSize: 11, color: C.tm, textAlign: 'center', marginBottom: 8 }}>{PLAN.name} · W{wk + 1}</div>
          <div style={{ background: C.sf2, borderRadius: 0, height: 6, overflow: 'hidden' }}>
            <div style={{ background: pct === 100 ? C.gn : C.ac, height: '100%', width: `${pct}%`, transition: 'width 0.3s', borderRadius: 0 }} />
          </div>
          <div style={{ fontSize: 10, fontFamily: FN, color: C.td, letterSpacing: 1, marginTop: 4, textAlign: 'right' }}>{doneSets} / {totalSets} SETS · {pct}%</div>
        </div>

        <div style={{ padding: '14px 20px 24px' }}>
          {/* Pre-workout check (pain / energy / sleep) — same fields as real */}
          <div style={{ background: C.sf, border: `0.25px solid ${C.cardBd}`, borderRadius: 0, padding: 14, marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontFamily: FN, color: C.td, letterSpacing: 1.5, fontWeight: 700, marginBottom: 10 }}>PRE-WORKOUT CHECK</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              {[['pain', 'PAIN', '0-10'], ['energy', 'ENERGY', '1-5'], ['sleep', 'SLEEP', '1-5']].map(([k, l, ph]) => (
                <div key={k}>
                  <div style={{ fontSize: 9, fontFamily: FN, color: C.tm, letterSpacing: 1, fontWeight: 700, marginBottom: 4, textAlign: 'center' }}>{l}</div>
                  <input type="number" placeholder={ph} value={preCheck[k]} onChange={e => setPreCheck(p => ({ ...p, [k]: e.target.value }))} style={{
                    width: '100%', background: C.sf2, border: `0.25px solid ${C.bd}`, borderRadius: 0,
                    padding: '6px 8px', color: C.tx, fontFamily: FN, fontSize: 13, outline: 'none',
                    boxSizing: 'border-box', textAlign: 'center',
                  }} />
                </div>
              ))}
            </div>
            {parseInt(preCheck.pain) >= 4 && (
              <div style={{ background: C.rdD, borderRadius: 0, padding: 8, marginTop: 8, fontSize: 11, color: C.rd, fontWeight: 600 }}>
                ⚠ Pain ≥4 — load regression: ROM → Tempo → Intensity → Volume
              </div>
            )}
          </div>

          {/* Exercise blocks — set rows with reps/load/RPE/done checkbox */}
          {day.ex.map((ex, exIdx) => (
            <div key={exIdx} style={{ background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 0, padding: 14, marginBottom: 10 }}>
              <div style={{ fontWeight: 700, color: C.tx, fontSize: 14, marginBottom: 4 }}>
                {exIdx + 1}. {ex.t}
                <span style={{ fontWeight: 400, color: C.tm, fontSize: 12, marginLeft: 8 }}>{ex.s}×{ex.r}{ex.load ? ` · ${ex.load}` : ''}</span>
              </div>
              {ex.focus && (
                <div style={{ fontSize: 11, color: C.ac, marginBottom: 8, opacity: 0.85 }}>💡 {ex.focus}</div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr 1fr 1fr 50px', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                {['SET', 'REPS', 'LOAD', 'RPE', 'DONE'].map(h => (
                  <div key={h} style={{ fontSize: 9, fontFamily: FN, color: C.td, textAlign: 'center', letterSpacing: 1, fontWeight: 700 }}>{h}</div>
                ))}
              </div>
              {Array.from({ length: ex.s }, (_, sIdx) => {
                const k = `${loggingDay}:${exIdx}:${sIdx}`;
                const v = logSets[k] || { reps: '', load: '', rpe: '', done: false };
                return (
                  <div key={sIdx} style={{ display: 'grid', gridTemplateColumns: '40px 1fr 1fr 1fr 50px', gap: 6, alignItems: 'center', padding: '4px 0', opacity: v.done ? 0.55 : 1 }}>
                    <span style={{ fontFamily: FN, fontSize: 13, color: C.tm, textAlign: 'center' }}>{sIdx + 1}</span>
                    <input type="number" value={v.reps} onChange={e => updateSet(exIdx, sIdx, { reps: e.target.value })} placeholder="—" style={{
                      background: C.sf2, border: `1px solid ${C.bd}`, borderRadius: 0,
                      padding: '5px 8px', color: C.tx, fontFamily: FN, fontSize: 13, outline: 'none',
                      width: '100%', boxSizing: 'border-box', textAlign: 'center',
                    }} />
                    <input type="number" value={v.load} onChange={e => updateSet(exIdx, sIdx, { load: e.target.value })} placeholder="—" style={{
                      background: C.sf2, border: `1px solid ${C.bd}`, borderRadius: 0,
                      padding: '5px 8px', color: C.tx, fontFamily: FN, fontSize: 13, outline: 'none',
                      width: '100%', boxSizing: 'border-box', textAlign: 'center',
                    }} />
                    <input value={v.rpe || ''} onChange={e => updateSet(exIdx, sIdx, { rpe: e.target.value })} placeholder="—" style={{
                      background: C.sf2, border: `1px solid ${C.bd}`, borderRadius: 0,
                      padding: '5px 8px', color: C.tx, fontFamily: FN, fontSize: 13, outline: 'none',
                      width: '100%', boxSizing: 'border-box', textAlign: 'center',
                    }} />
                    <div style={{ textAlign: 'center' }}>
                      <input type="checkbox" checked={!!v.done} onChange={e => updateSet(exIdx, sIdx, { done: e.target.checked })} style={{ width: 18, height: 18, accentColor: C.gn, cursor: 'pointer' }} />
                    </div>
                  </div>
                );
              })}
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button onClick={() => onPick({ key: ex.eid, label: ex.t, sample: ex.t })} title="Film a set" style={{
                  ...baseBtn, background: 'transparent', color: C.rd,
                  border: `1px solid rgba(255,71,87,0.251)`, padding: '6px 12px', fontSize: 11,
                }}>📹 FILM SET</button>
                <button onClick={() => {
                  // Mark all sets done
                  const next = { ...logSets };
                  for (let s = 0; s < ex.s; s++) {
                    const k = `${loggingDay}:${exIdx}:${s}`;
                    next[k] = { ...(next[k] || { reps: '', load: '', rpe: '' }), done: true };
                  }
                  setLogSets(next);
                }} style={{
                  ...baseBtn, background: 'transparent', color: C.gn,
                  border: `1px solid rgba(46,213,115,0.251)`, padding: '6px 12px', fontSize: 11,
                }}>✓ MARK ALL</button>
              </div>
            </div>
          ))}

          <button onClick={completeAndExit} style={{
            width: '100%', padding: '14px 0', borderRadius: 0, border: 'none',
            background: C.gn, color: '#0a0a0b',
            fontFamily: FB, fontSize: 14, fontWeight: 700, letterSpacing: 0.5, cursor: 'pointer',
            marginTop: 8,
          }}>✓ Complete Workout</button>
        </div>
      </div>
    );
  }

  // ─── Top header (matches ClientPortal renderTopHeader) ─────────
  const renderTopHeader = () => (
    <>
      <div style={{ background: `linear-gradient(135deg,${C.sf},${C.sf2})`, padding: '20px 20px 16px', borderBottom: `1px solid ${C.bd}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <EXPOMark theme="dark" height={36} style={{ marginLeft: 3 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button title="Change password (demo)" style={{ background: 'none', border: 'none', color: C.tm, cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
            </button>
            <a href="/demo" style={{ background: 'none', border: 'none', color: C.ac, cursor: 'pointer', fontFamily: FB, fontSize: 13, padding: 0, textDecoration: 'none' }}>Log Out →</a>
          </div>
        </div>
        <h1 style={{ margin: '0 0 6px', fontFamily: FN, fontSize: 20, color: C.tx, textAlign: 'center' }}>Hey {TRAINEE.firstName} 💪</h1>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 14 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {TRAINEE.plans.map(p => (
                <span key={p.name} style={{ fontSize: 9, fontFamily: FN, color: C.ac, fontWeight: 700, padding: '2px 6px', borderRadius: 0, border: `1px solid rgba(57,189,255,0.251)`, background: C.acD }}>{p.name}</span>
              ))}
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: FN, color: TRAINEE.sessionsLeft <= 2 ? C.rd : C.gn }}>{TRAINEE.sessionsLeft}</div>
            <div style={{ fontSize: 9, color: C.tm, fontFamily: FN }}>SESSIONS</div>
          </div>
        </div>
      </div>
      <div style={{ padding: '14px 20px 0', display: 'flex', gap: 4 }}>
        {[['prog', 'Program'], ['bwt', 'BW'], ['pr', 'PRs'], ['hist', `History (${HISTORY.length})`]].map(([k, l]) => (
          <button key={k} onClick={() => setVw(k)} style={{
            flex: 1, padding: 8, borderRadius: 0,
            border: `${vw === k ? '2px' : '0.25px'} solid ${C.ac}${vw === k ? '' : '4D'}`,
            background: vw === k ? C.acD : 'transparent',
            color: vw === k ? C.ac : C.tm,
            fontFamily: FB, fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}>{l}</button>
        ))}
      </div>
    </>
  );

  // ─── BW tab body ─────────────────────────────────────────────
  if (vw === 'bwt') {
    const maxBw = Math.max(...bwData.map(b => b.bw));
    const minBw = Math.min(...bwData.map(b => b.bw));
    const range = Math.max(maxBw - minBw, 2);
    return (
      <div style={{ background: C.bg, color: C.tx, minHeight: '100vh', fontFamily: FB, maxWidth: 500, margin: '0 auto' }}>
        {renderTopHeader()}
        <div style={{ padding: '14px 20px 20px' }}>
          <h2 style={{ margin: '0 0 4px', fontFamily: FN, fontSize: 18 }}>Bodyweight Tracking</h2>
          <div style={{ color: C.tm, fontSize: 12, marginBottom: 16 }}>{TRAINEE.name} · {bwData.length} entries</div>
          <div style={{ background: C.sf, border: `0.25px solid ${C.cardBd}`, borderRadius: 0, padding: 14, marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap' }}>
              {Array.from({ length: PLAN.weeks }, (_, w) => (
                <button key={w} onClick={() => setWk(w)} style={{
                  flex: '1 1 40px', padding: '6px 0', borderRadius: 0,
                  border: `${wk === w ? '2px' : '0.25px'} solid ${C.ac}${wk === w ? '' : '4D'}`,
                  background: wk === w ? C.acD : 'transparent',
                  color: wk === w ? C.ac : C.tm,
                  fontFamily: FN, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                }}>W{w + 1}</button>
              ))}
            </div>
            <div style={{ fontSize: 11, fontFamily: FN, color: C.td, marginBottom: 8, textAlign: 'center' }}>LOG W{wk + 1} · {PLAN.name}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={bwInput} onChange={e => setBwInput(e.target.value)} placeholder="Weight in kg" type="number" style={{
                flex: 1, background: C.sf2, border: `0.25px solid ${C.ac}`, borderRadius: 0,
                padding: '10px 12px', color: C.tx, fontFamily: FN, fontSize: 14, outline: 'none',
                boxSizing: 'border-box', textAlign: 'center',
              }} />
              <button onClick={() => {
                const v = parseFloat(bwInput);
                if (!Number.isFinite(v)) return;
                setBwData(d => [...d, { date: new Date().toISOString(), bw: v, week: wk + 1 }]);
                setBwInput('');
              }} style={{
                padding: '10px 20px', borderRadius: 0, border: 'none',
                background: bwInput ? C.ac : C.sf3, color: bwInput ? '#fff' : C.td,
                fontFamily: FB, fontSize: 13, fontWeight: 700, cursor: bwInput ? 'pointer' : 'default',
              }}>Save</button>
            </div>
          </div>
          <div style={{ background: C.sf, border: `0.25px solid ${C.cardBd}`, borderRadius: 0, padding: 14, marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontFamily: FN, color: C.td, marginBottom: 10 }}>TREND</div>
            <svg viewBox={`0 -10 ${Math.max(bwData.length * 60, 300)} 185`} style={{ width: '100%', height: 185 }}>
              {[0, 0.25, 0.5, 0.75, 1].map((p, i) => {
                const y = 10 + p * 130;
                const val = (maxBw - p * range).toFixed(1);
                return (
                  <g key={i}>
                    <line x1="40" y1={y} x2={Math.max(bwData.length * 60, 300) - 10} y2={y} stroke={C.bd} strokeWidth="0.5" strokeDasharray="4" />
                    <text x="36" y={y + 4} fill={C.td} fontSize="9" fontFamily={FN} textAnchor="end">{val}</text>
                  </g>
                );
              })}
              <polyline fill="none" stroke={C.ac} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                points={bwData.map((d, i) => `${50 + i * 50},${10 + ((maxBw - d.bw) / range) * 130}`).join(' ')} />
              {bwData.map((d, i) => (
                <circle key={i} cx={50 + i * 50} cy={10 + ((maxBw - d.bw) / range) * 130} r="3" fill={C.ac} />
              ))}
            </svg>
          </div>
        </div>
      </div>
    );
  }

  // ─── PRs tab body ────────────────────────────────────────────
  if (vw === 'pr') {
    return (
      <div style={{ background: C.bg, color: C.tx, minHeight: '100vh', fontFamily: FB, maxWidth: 500, margin: '0 auto' }}>
        {renderTopHeader()}
        <div style={{ padding: '14px 20px 20px' }}>
          <h2 style={{ margin: '0 0 12px', fontFamily: FN, fontSize: 18 }}>Personal Records ({PRS.length})</h2>
          {PRS.map((pr, i) => (
            <div key={i} style={{ background: C.sf, border: `0.25px solid ${C.cardBd}`, borderRadius: 0, padding: '12px 14px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontFamily: FB, fontWeight: 600, fontSize: 14, color: C.tx }}>{pr.name}</div>
                <div style={{ fontFamily: FN, fontSize: 10, color: C.td, letterSpacing: 1, marginTop: 2 }}>{pr.date}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: FB, fontWeight: 700, fontSize: 16, color: C.ac }}>{pr.load}</div>
                <div style={{ fontFamily: FN, fontSize: 9, color: C.gn, letterSpacing: 1, fontWeight: 700 }}>{pr.delta}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ─── History tab body — mirrors ClientPortal `vw === 'hist'` 1:1 ───
  // Per-workout cards with per-exercise rows inside. Per-exercise: title +
  // prescription + done/total sets, 📹 if a form video was uploaded, and a
  // small acD-bg `💬 N` pill if the coach left review notes. Tapping a
  // videoed exercise expands to show the form-video player (here: a stub
  // box since the demo has no actual video). 0.25px ac4D border, becomes
  // 2px ac when an exercise inside is expanded.
  if (vw === 'hist') {
    return (
      <div style={{ background: C.bg, color: C.tx, minHeight: '100vh', fontFamily: FB, maxWidth: 500, margin: '0 auto' }}>
        {renderTopHeader()}
        <div style={{ padding: '14px 20px 20px' }}>
          <h2 style={{ margin: '0 0 12px', fontFamily: FN, fontSize: 18 }}>History ({HISTORY.length})</h2>
          {HISTORY.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: C.td }}>No workouts yet.</div>
          ) : (
            HISTORY.map(w => {
              const wActive = expandedHistEx && expandedHistEx.startsWith(w.id + ':');
              return (
                <div key={w.id} style={{
                  background: C.sf,
                  border: `${wActive ? '2px' : '0.25px'} solid ${C.ac}${wActive ? '' : '4D'}`,
                  borderRadius: 0, padding: 12, marginBottom: 8,
                }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>
                    {w.dayName} <span style={{ color: C.tm, fontWeight: 400 }}>({w.planName})</span>
                  </div>
                  <div style={{ fontSize: 11, color: C.tm, marginBottom: 4 }}>
                    {new Date(w.date).toLocaleDateString()} · W{w.week}
                  </div>
                  {w.exercises.map((x, i) => {
                    const expandKey = `${w.id}:${i}`;
                    const isOpen = expandedHistEx === expandKey;
                    const canExpand = x.hasVideo;
                    return (
                      <div key={i} style={{ marginTop: 2 }}>
                        <div onClick={canExpand ? () => setExpandedHistEx(isOpen ? null : expandKey) : undefined}
                          style={{ fontSize: 11, color: C.tm, display: 'flex', alignItems: 'center', gap: 6, cursor: canExpand ? 'pointer' : 'default', padding: '2px 0' }}>
                          <span style={{ flex: 1 }}>{i + 1}. {x.title} ({x.prescribed}) — {x.done}/{x.total}</span>
                          {x.hasVideo && <span style={{ color: C.gn, fontSize: 12 }}>📹</span>}
                          {x.notes > 0 && (
                            <span style={{
                              background: C.acD, color: C.ac,
                              fontFamily: FN, fontSize: 9, fontWeight: 700,
                              padding: '1px 6px', borderRadius: 0,
                            }}>💬 {x.notes}</span>
                          )}
                          {canExpand && <span style={{ color: C.td, fontSize: 10 }}>{isOpen ? '▲' : '▼'}</span>}
                        </div>
                        {isOpen && x.hasVideo && (
                          <div style={{
                            marginTop: 6, marginBottom: 10,
                            background: C.sf2, border: `0.25px solid ${C.cardBd}`, borderRadius: 0,
                            padding: 8,
                          }}>
                            <div style={{
                              background: '#000', borderRadius: 0, aspectRatio: '16/9',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              color: C.tm, fontFamily: FN, fontSize: 11, letterSpacing: 1.5, fontWeight: 700,
                            }}>FORM VIDEO</div>
                            {x.notes > 0 && (
                              <div style={{ marginTop: 8, fontFamily: FN, fontSize: 10, color: C.ac, letterSpacing: 1, fontWeight: 700 }}>
                                💬 {x.notes} COACH NOTE{x.notes === 1 ? '' : 'S'}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }

  // ─── Program tab body (default) — mirror of ClientPortal `vw === 'prog'` ───
  const lb = bwData[bwData.length - 1]?.bw;
  const unreadCoachNotes = HISTORY.reduce((a, h) => a + (h.coachNotes || 0), 0);
  return (
    <div style={{ background: C.bg, color: C.tx, minHeight: '100vh', fontFamily: FB, maxWidth: 500, margin: '0 auto' }}>
      {renderTopHeader()}
      <div style={{ padding: '14px 20px 20px' }}>
        {/* Week picker + tiny BW quick-log row (matches real Program tab) */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, fontFamily: FN, color: C.td, marginBottom: 4 }}>Week</div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {Array.from({ length: PLAN.weeks }, (_, w) => (
                <button key={w} onClick={() => setWk(w)} style={{
                  flex: '1 1 40px', padding: '8px 0', borderRadius: 0,
                  border: `${wk === w ? '2px' : '0.25px'} solid ${C.ac}${wk === w ? '' : '4D'}`,
                  background: wk === w ? C.acD : 'transparent',
                  color: wk === w ? C.ac : C.tm,
                  fontFamily: FN, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}>W{w + 1}</button>
              ))}
            </div>
          </div>
          <div style={{ width: 120 }}>
            <div style={{ fontSize: 10, fontFamily: FN, color: C.td, marginBottom: 4 }}>BW {lb ? `(${lb}kg)` : ''}</div>
            <div style={{ display: 'flex', gap: 4 }}>
              <input value={bw} onChange={e => setBw(e.target.value)} placeholder="kg" type="number" style={{
                background: C.sf2, border: `0.25px solid ${C.cardBd}`, borderRadius: 0,
                padding: '8px', color: C.tx, fontFamily: FN, fontSize: 12, outline: 'none',
                width: '100%', boxSizing: 'border-box', textAlign: 'center',
              }} />
              {bw && (
                <button onClick={() => {
                  setBwData(d => [...d, { date: new Date().toISOString(), bw: parseFloat(bw), week: wk + 1 }]);
                  setBw('');
                }} style={{
                  background: C.acD, border: 'none', borderRadius: 0,
                  padding: '4px 8px', color: C.ac,
                  fontFamily: FN, fontSize: 10, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                }}>Save</button>
              )}
            </div>
          </div>
        </div>

        {/* Unread coach notes callout */}
        {unreadCoachNotes > 0 && (
          <div onClick={() => setVw('hist')} style={{
            background: C.acD, border: `1px solid rgba(57,189,255,0.376)`, borderRadius: 0,
            padding: '10px 14px', marginBottom: 14, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ fontSize: 20 }}>📬</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: C.ac, fontWeight: 700 }}>Ohad left {unreadCoachNotes} new note{unreadCoachNotes === 1 ? '' : 's'} on your workouts</div>
              <div style={{ fontSize: 11, color: C.tm, marginTop: 2 }}>Tap to view in History →</div>
            </div>
          </div>
        )}

        {DAYS.map((day, di) => {
          const done = !!doneDays[day.name];
          return (
            <div key={di} style={{ background: C.sf, border: `0.25px solid ${done ? rgba(46,213,115,0.251) : C.ac}`, borderRadius: 0, marginBottom: 12, padding: '14px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div>
                  <span style={{ fontWeight: 700, fontSize: 15 }}>{day.name}</span>
                  {done && (
                    <span style={{ fontSize: 9, fontFamily: FN, color: C.gn, fontWeight: 700, padding: '2px 6px', marginLeft: 6, borderRadius: 0, border: `1px solid rgba(46,213,115,0.251)`, background: C.gnD }}>✓</span>
                  )}
                  <div style={{ fontSize: 11, color: C.tm, marginTop: 2 }}>{day.ex.length} exercises</div>
                </div>
                <button onClick={() => { setLoggingDay(di); window.scrollTo(0, 0); }} style={{
                  padding: '6px 12px', borderRadius: 0, border: 'none',
                  background: done ? C.gnD : C.acD,
                  color: done ? C.gn : C.ac,
                  fontFamily: FB, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                }}>{done ? 'Again' : '📝 Log'}</button>
              </div>
              {day.ex.map((ex, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '4px 0', borderTop: i ? `1px solid rgba(127,127,131,0.133)` : 'none' }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: 0, background: C.acD,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: FN, fontSize: 10, fontWeight: 700, color: C.ac, flexShrink: 0,
                  }}>{i + 1}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 12 }}>{ex.t}</div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: C.ac, fontFamily: FN }}>{ex.s}x{ex.r}{ex.load ? ` · ${ex.load}` : ''}</span>
                    {ex.tempo && <span style={{ fontSize: 9, color: C.or, marginLeft: 4 }}>{ex.tempo}</span>}
                    {ex.focus && (
                      <div style={{ fontSize: 11, color: C.ac, marginTop: 3, opacity: 0.85, lineHeight: 1.4, display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden' }}>💡 {ex.focus}</div>
                    )}
                  </div>
                  {ex.vid && (
                    <a href={ex.vid} target="_blank" rel="noopener" onClick={e => e.stopPropagation()} style={{
                      color: C.rd, fontSize: 10, textDecoration: 'none',
                      padding: '2px 6px', background: C.rdD, borderRadius: 0, flexShrink: 0,
                    }}>▶</a>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Header / stepper ─────────────────────────────────────────────────────
function Header({ step, exercise, hasVideo, onRestart, onStep }) {
  const steps = [
    { key:'exercise', label:'1 · EXERCISE' },
    { key:'upload',   label:'2 · UPLOAD' },
    { key:'analyze',  label:'3 · ANALYZE' },
    { key:'compare',  label:'4 · COMPARE' },
  ];
  // Allow click-back-to-earlier-step navigation but not click-forward (forward
  // requires the user to actually finish the current step's prerequisite).
  const stepIdx = steps.findIndex(s => s.key === step);
  const canGoTo = (target) => {
    const t = steps.findIndex(s => s.key === target);
    if (t <= stepIdx) return true;
    if (target === 'upload' && exercise) return true;
    if (target === 'analyze' && hasVideo) return true;
    if (target === 'compare' && hasVideo) return true;
    return false;
  };
  return (
    <header style={{
      background: C.sf, borderBottom: `1px solid ${C.bd}`,
      position:'sticky', top:0, zIndex:50,
    }}>
      <style>{`@media (max-width: 720px){.try-sandbox-badge{display:none}}`}</style>
      <div style={{
        maxWidth: 1180, margin:'0 auto', padding:'0 16px',
        display:'flex', alignItems:'center', height: 60, gap: 14,
      }}>
        <a href="/" title="Back to EXPO" style={{ display:'flex', alignItems:'center', gap:10, textDecoration:'none', flex:'0 0 auto' }}>
          <EXPOMark theme="dark" height={36} style={{ marginBottom: 0 }} />
        </a>
        {/* DEMO badge — hidden on narrow screens via the .try-sandbox-badge
            class so the step nav has room to breathe on phones. */}
        <span className="try-sandbox-badge" style={{
          fontFamily:FN, fontSize:10, color: C.ac, letterSpacing:2, fontWeight:700,
          padding:'4px 8px', background: C.acD, borderRadius:0,
          border:`1px solid ${C.cardBd}`, whiteSpace:'nowrap',
        }}>DEMO</span>
        <nav style={{
          display:'flex', gap:4, flex:1, justifyContent:'center',
          overflowX:'auto', minWidth:0,
        }}>
          {steps.map((s) => {
            const on = step === s.key;
            const enabled = canGoTo(s.key);
            return (
              <button key={s.key}
                onClick={enabled ? () => onStep(s.key) : undefined}
                disabled={!enabled}
                style={{
                  ...baseBtn,
                  background: on ? C.acD : 'transparent',
                  color: on ? C.ac : (enabled ? C.tm : C.td),
                  padding: '6px 10px', fontSize: 11, fontWeight: on ? 700 : 500,
                  letterSpacing: 1.5, borderRadius: 0,
                  cursor: enabled ? 'pointer' : 'not-allowed',
                  whiteSpace: 'nowrap',
                  opacity: enabled ? 1 : 0.5,
                }}>
                {s.label}
              </button>
            );
          })}
        </nav>
        <button onClick={onRestart} title="Start over" style={{
          ...baseBtn,
          background:'transparent', color: C.tm,
          border: `1px solid ${C.bd}`, padding: '6px 12px',
          fontSize: 11, fontWeight: 700, letterSpacing: 1.2, borderRadius: 0,
        }}>↺ RESTART</button>
      </div>
    </header>
  );
}

// Plan-context strip that sits under the POV banner on /demo (trainee
// POV). Frames the engine as "inside today's workout, exercise 1 of 8"
// rather than a standalone upload tool — same shape as ClientPortal's
// header line which shows "DAY A · W2" plus the current exercise.
function TraineeContextStrip({ exercise }) {
  // Per-lift mock prescription — what would have been pulled from the
  // trainee's plan in production. Falls back to a default for picks that
  // don't have a specific entry, and to "Pick a lift" when nothing's chosen.
  const PRESCRIPTIONS = {
    'Back Squat':       { sets: 5, reps: '5',     load: '95kg' },
    'Goblet Squat':     { sets: 3, reps: '8-10',  load: '24kg' },
    'Walking Lunge':    { sets: 3, reps: '10 E',  load: '2×16kg' },
    'Romanian Deadlift':{ sets: 4, reps: '8',     load: '70kg' },
    'Deadlift':         { sets: 5, reps: '3',     load: '110kg' },
    'Hip Thrust':       { sets: 4, reps: '10',    load: '80kg' },
    'Bench Press':      { sets: 4, reps: '6-8',   load: '60kg' },
    'Overhead Press':   { sets: 4, reps: '6-8',   load: '35kg' },
    'Push-Up':          { sets: 3, reps: '12-15', load: 'BW' },
    'Pull-Up':          { sets: 4, reps: '6-8',   load: 'BW' },
    'DB Row':           { sets: 3, reps: '10 E',  load: '20kg' },
    'DB Curl':          { sets: 3, reps: '12',    load: '12.5kg' },
    'Lateral Raise':    { sets: 3, reps: '12-15', load: '7.5kg' },
  };
  const liftLabel = exercise?.label || 'Pick a lift to film';
  const rx = exercise ? (PRESCRIPTIONS[exercise.label] || { sets: 4, reps: '8-10', load: '—' }) : null;
  return (
    <div style={{
      borderBottom: `1px solid ${C.bd}`,
      background: C.sf,
    }}>
      <div style={{
        maxWidth: 1180, margin: '0 auto', padding: '10px 16px',
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      }}>
        <span style={{
          fontFamily: FN, fontSize: 10, color: C.ac, letterSpacing: 1.8, fontWeight: 700,
          background: C.acD, padding: '3px 8px', borderRadius: 0,
          border: `1px solid ${C.cardBd}`, whiteSpace: 'nowrap',
        }}>BLOCK #4 · DAY A</span>
        <span style={{
          fontFamily: FN, fontSize: 10, color: C.tm, letterSpacing: 1.5, fontWeight: 700,
        }}>WEEK 2 OF 4 · EXERCISE 1 OF 8</span>
        <span style={{ flex: '1 1 auto' }} />
        <span style={{
          fontFamily: FB, fontSize: 13, color: exercise ? C.tx : C.tm, fontWeight: 700,
        }}>{liftLabel}</span>
        {rx && (
          <span style={{
            fontFamily: FN, fontSize: 11, color: C.tm, letterSpacing: 1, fontWeight: 700,
          }}>{rx.sets} × {rx.reps}{rx.load && rx.load !== '—' ? ` · ${rx.load}` : ''}</span>
        )}
      </div>
    </div>
  );
}

// ─── POV banner ───────────────────────────────────────────────────────────
// Sits under the header on /try and /demo so the visitor knows which side
// of the table they're sitting at — coach (review tool) vs trainee (what
// the client uploads + sees). One-tap toggle to the other POV.
function POVBanner({ pov }) {
  const isCoach = pov === 'coach';
  return (
    <div style={{
      borderBottom: `1px solid ${C.bd}`,
      background: `linear-gradient(180deg, ${C.sf} 0%, ${C.bg} 100%)`,
    }}>
      <div style={{
        maxWidth: 1180, margin:'0 auto', padding:'12px 16px',
        display:'flex', alignItems:'center', gap: 12, flexWrap:'wrap',
      }}>
        {/* POV chip — eye glyph + label */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontFamily: FN, fontSize: 10, color: C.ac, letterSpacing: 1.8, fontWeight: 700,
          background: C.acD, border: `1px solid ${C.cardBd}`,
          borderRadius: 0, padding: '4px 9px', whiteSpace: 'nowrap',
        }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
          {isCoach ? 'COACH VIEW' : 'ATHLETE VIEW'}
        </div>
        <div style={{
          fontFamily: FB, fontSize: 13, color: C.tx, opacity: 0.85, lineHeight: 1.45,
          flex: '1 1 auto', minWidth: 200,
        }}>
          {isCoach
            ? <>The review tool <b style={{ opacity: 1 }}>you</b> sit down to. Pose, rep count, draw on form, timestamped notes, reply video.</>
            : <>What <b style={{ opacity: 1 }}>your client</b> uses. Film a set, see the analysis, one-tap send to the coach.</>}
        </div>
        <div style={{
          display:'inline-flex', gap: 0,
          background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 0, overflow: 'hidden',
          flex: '0 0 auto',
        }}>
          <a href="/demo/coach" style={{
            background: isCoach ? C.ac : 'transparent',
            color: isCoach ? '#000' : C.tm,
            padding:'5px 12px', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: 1.5,
            textDecoration: 'none',
          }}>COACH</a>
          <a href="/demo/athlete" style={{
            background: !isCoach ? C.ac : 'transparent',
            color: !isCoach ? '#000' : C.tm,
            padding:'5px 12px', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: 1.5,
            textDecoration: 'none',
          }}>ATHLETE</a>
        </div>
      </div>
    </div>
  );
}

// ─── Trainee POV homepage (mock of ClientPortal) ──────────────────────────
// Replaces the bare exercise-picker on /demo/trainee with a fuller home
// surface that mirrors what the real client app shows: today's workout,
// per-exercise prescriptions, plan progress, BW logger, recent history.
// Tapping "📹 FILM SET" on any exercise enters the engine sandbox with
// that lift pre-selected, so the upload/analyze/compare flow lands in
// the same place but feels like it came from inside the app.
function TraineeHomeMock({ onPick }) {
  const [selectedDayIdx, setSelectedDayIdx] = useState(0);
  const [bwInput, setBwInput] = useState('');
  const [bwLog, setBwLog] = useState([
    { date: '2026-04-01', bw: 64.8 },
    { date: '2026-04-08', bw: 64.4 },
    { date: '2026-04-15', bw: 64.1 },
    { date: '2026-04-22', bw: 63.7 },
  ]);
  const [logged, setLogged] = useState({}); // {`${dayIdx}:${exIdx}`: true}
  const TRAINEE = { name: 'נועה לוי', firstName: 'Noa', block: 'Block #4 — Push/Pull Volume', week: 2, totalWeeks: 4 };
  const DAYS = [
    { name: 'Day A · Push', exercises: [
      { key: 'bench',  label: 'Bench Press',          sample: 'Bench Press',         sets: 4, reps: '6-8',    load: '60kg',   note: 'Pause 1s on chest, drive heels.' },
      { key: 'ohp',    label: 'Overhead Press',       sample: 'Overhead Press',      sets: 4, reps: '6-8',    load: '35kg',   note: 'Glutes locked, ribs down.' },
      { key: 'lateral',label: 'Lateral Raise',        sample: 'Lateral Raise',       sets: 3, reps: '12-15',  load: '7.5kg',  note: 'Lead with elbows, soft thumb.' },
      { key: 'pushup', label: 'Push-Up',              sample: 'Push-Up',             sets: 3, reps: '12',     load: 'BW',     note: '2-1-1 tempo. Plank from heel to crown.' },
    ]},
    { name: 'Day B · Pull', exercises: [
      { key: 'pullup', label: 'Pull-Up',              sample: 'Pull-Up',             sets: 4, reps: '6-8',    load: 'BW',     note: 'Chin clears bar, no kip.' },
      { key: 'row',    label: 'DB Row',               sample: 'DB Row',              sets: 3, reps: '10 E',   load: '20kg',   note: 'Pull to hip, not chest.' },
      { key: 'curl',   label: 'DB Curl',              sample: 'DB Curl',             sets: 3, reps: '12',     load: '12.5kg', note: 'No swing — count from full hang.' },
    ]},
    { name: 'Day C · Legs', exercises: [
      { key: 'squat',  label: 'Back Squat',           sample: 'Back Squat',          sets: 5, reps: '5',      load: '95kg',   note: 'Brace BEFORE unrack. Tempo 3-1-1.' },
      { key: 'rdl',    label: 'Romanian Deadlift',    sample: 'Romanian Deadlift',   sets: 4, reps: '8',      load: '70kg',   note: 'Push hips back, soft knees.' },
      { key: 'lunge',  label: 'Walking Lunge',        sample: 'Walking Lunge',       sets: 3, reps: '10 E',   load: '2×16kg', note: 'Knee tracks toe. Drive through front heel.' },
      { key: 'hipthrust',label: 'Hip Thrust',         sample: 'Hip Thrust',          sets: 3, reps: '10',     load: '80kg',   note: 'Chin tucked, lock at the top.' },
    ]},
  ];
  const RECENT = [
    { date: '2026-04-26', dayName: 'Day C · Legs', completed: 4, total: 4 },
    { date: '2026-04-23', dayName: 'Day B · Pull', completed: 3, total: 3 },
    { date: '2026-04-21', dayName: 'Day A · Push', completed: 4, total: 4 },
    { date: '2026-04-19', dayName: 'Day C · Legs', completed: 3, total: 4 },
  ];
  const day = DAYS[selectedDayIdx];
  const completedCount = Object.entries(logged).filter(([k]) => k.startsWith(`${selectedDayIdx}:`)).length;
  const progressPct = Math.round((completedCount / day.exercises.length) * 100);
  const submitBw = () => {
    const v = parseFloat(bwInput);
    if (!Number.isFinite(v)) return;
    const today = new Date().toISOString().slice(0, 10);
    setBwLog(arr => [...arr.filter(b => b.date !== today), { date: today, bw: v }].sort((a, b) => a.date.localeCompare(b.date)));
    setBwInput('');
  };
  const lastBw = bwLog[bwLog.length - 1]?.bw;
  const firstBw = bwLog[0]?.bw;
  const bwDelta = (lastBw && firstBw) ? (lastBw - firstBw) : 0;
  return (
    <section>
      <div style={{
        fontFamily: FN, color: C.ac, fontSize: 11, letterSpacing: 3,
        marginBottom: 8, fontWeight: 700,
      }}>YOUR PORTAL · MOCK DATA</div>
      <h1 style={{
        fontFamily: FB, fontSize: 'clamp(22px, 3.4vw, 28px)', fontWeight: 700,
        margin: 0, letterSpacing: -0.3,
      }}>Hi {TRAINEE.firstName}, ready for {day.name.split('·')[0].trim()}?</h1>
      <p style={{
        fontFamily: FB, color: C.tx, opacity: 0.78, fontSize: 14, lineHeight: 1.55,
        margin: '6px 0 22px', maxWidth: 720,
      }}>
        This is what your client sees when they sign in. Today's plan, sets &amp; reps,
        coach cues, bodyweight log, and a film-button on every exercise that opens
        the live form-analysis engine you'll see next.
      </p>

      {/* Today header card — block + week + day picker + progress bar */}
      <div style={{
        background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 0,
        padding: '16px 18px', marginBottom: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
          <h2 style={{ fontFamily: FB, fontSize: 16, fontWeight: 700, margin: 0, letterSpacing: -0.2 }}>{TRAINEE.block}</h2>
          <span style={{ fontFamily: FN, fontSize: 11, color: C.tm, letterSpacing: 1, fontWeight: 700 }}>WEEK {TRAINEE.week} OF {TRAINEE.totalWeeks}</span>
          <span style={{ flex: 1 }} />
          <span style={{ fontFamily: FN, fontSize: 10, color: C.gn, letterSpacing: 1.5, fontWeight: 700 }}>● ON TRACK</span>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {DAYS.map((d, i) => (
            <button key={i} onClick={() => setSelectedDayIdx(i)} style={{
              ...baseBtn,
              background: i === selectedDayIdx ? C.acD : 'transparent',
              color: i === selectedDayIdx ? C.ac : C.tm,
              border: `1px solid ${i === selectedDayIdx ? C.ac : C.bd}`,
              padding: '6px 12px', fontSize: 11, letterSpacing: 1,
            }}>{d.name}</button>
          ))}
        </div>
        <div style={{
          height: 6, borderRadius: 0, background: C.sf2, overflow: 'hidden',
        }}>
          <div style={{
            width: `${progressPct}%`, height: '100%',
            background: progressPct === 100 ? C.gn : C.ac,
            transition: 'width 0.25s',
          }} />
        </div>
        <div style={{
          fontFamily: FN, fontSize: 10, color: C.td, letterSpacing: 1.5, fontWeight: 700,
          marginTop: 6,
        }}>{completedCount} OF {day.exercises.length} EXERCISES LOGGED · {progressPct}%</div>
      </div>

      {/* Exercise rows — sets × reps × load + coach note + Film CTA */}
      <div style={{ display: 'grid', gap: 10, marginBottom: 18 }}>
        {day.exercises.map((ex, ei) => {
          const key = `${selectedDayIdx}:${ei}`;
          const isLogged = !!logged[key];
          return (
            <div key={ei} style={{
              background: C.sf, border: `1px solid ${isLogged ? C.gn : C.bd}`, borderRadius: 0,
              padding: '14px 16px',
              display: 'grid', gap: 10, gridTemplateColumns: '1fr',
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <span style={{
                  fontFamily: FN, fontSize: 10, color: isLogged ? C.gn : C.tm, letterSpacing: 1.5, fontWeight: 700,
                  background: isLogged ? `rgba(46,213,115,0.125)` : C.sf2, border: `1px solid ${isLogged ? `'rgba(46,213,115,0.333)'` : C.bd}`,
                  borderRadius: 0, padding: '2px 7px',
                }}>{isLogged ? '✓ DONE' : `EX ${ei + 1}`}</span>
                <span style={{ fontFamily: FB, fontSize: 14, fontWeight: 700, color: C.tx }}>{ex.label}</span>
                <span style={{ flex: 1 }} />
                <span style={{ fontFamily: FN, fontSize: 11, color: C.ac, letterSpacing: 1, fontWeight: 700 }}>
                  {ex.sets} × {ex.reps}{ex.load && ex.load !== '—' ? ` · ${ex.load}` : ''}
                </span>
              </div>
              <div style={{
                fontFamily: FB, fontSize: 12, color: C.tm, lineHeight: 1.5,
                background: C.sf2, border: `1px solid ${C.bd}`, borderRadius: 0,
                padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{ fontFamily: FN, fontSize: 9, color: C.ac, letterSpacing: 1.5, fontWeight: 700, flexShrink: 0 }}>COACH</span>
                <span>{ex.note}</span>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={() => onPick(ex)} style={{
                  ...baseBtn, background: C.ac, color: '#000',
                  padding: '8px 14px', fontSize: 12,
                }}>📹 FILM SET</button>
                <button onClick={() => setLogged(L => ({ ...L, [key]: !L[key] }))} style={{
                  ...baseBtn, background: 'transparent', color: isLogged ? C.gn : C.tm,
                  border: `1px solid ${isLogged ? C.gn : C.bd}`,
                  padding: '8px 14px', fontSize: 12,
                }}>{isLogged ? '✓ LOGGED' : 'MARK DONE'}</button>
                <button style={{
                  ...baseBtn, background: 'transparent', color: C.tm,
                  border: `1px solid ${C.bd}`,
                  padding: '8px 14px', fontSize: 12,
                }}>↻ SWAP</button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Two-up: BW logger + Recent history — mirrors ClientPortal layout */}
      <div style={{
        display: 'grid', gap: 14, marginBottom: 18,
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
      }}>
        <div style={{
          background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 0,
          padding: '14px 16px',
        }}>
          <div style={{
            fontFamily: FN, color: C.tm, fontSize: 10, letterSpacing: 1.5, fontWeight: 700,
            marginBottom: 8,
          }}>BODYWEIGHT</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
            <span style={{ fontFamily: FB, fontSize: 26, fontWeight: 700, color: C.tx, letterSpacing: -0.4 }}>
              {lastBw?.toFixed(1)}<span style={{ fontSize: 13, color: C.tm, marginLeft: 2 }}>kg</span>
            </span>
            <span style={{
              fontFamily: FN, fontSize: 11, color: bwDelta <= 0 ? C.gn : C.or, letterSpacing: 1, fontWeight: 700,
            }}>{bwDelta > 0 ? '+' : ''}{bwDelta.toFixed(1)} kg / {bwLog.length}W</span>
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            <input type="number" step="0.1" placeholder="Today's weight (kg)"
              value={bwInput} onChange={e => setBwInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submitBw(); }}
              style={{
                flex: 1, background: C.sf2, border: `1px solid ${C.bd}`,
                borderRadius: 0, padding: '8px 10px', color: C.tx,
                fontFamily: FB, fontSize: 13, outline: 'none',
              }} />
            <button onClick={submitBw} style={{
              ...baseBtn, background: C.ac, color: '#000',
              padding: '8px 14px', fontSize: 12,
            }}>LOG</button>
          </div>
          <div style={{
            display: 'flex', alignItems: 'flex-end', gap: 4,
            height: 40, padding: '0 2px',
          }}>
            {bwLog.map((b, i) => {
              const min = Math.min(...bwLog.map(x => x.bw)) - 0.3;
              const max = Math.max(...bwLog.map(x => x.bw)) + 0.3;
              const pct = ((b.bw - min) / (max - min)) * 100;
              return (
                <div key={i} title={`${b.date} · ${b.bw}kg`} style={{
                  flex: 1, background: C.ac, borderRadius: 0,
                  height: `${pct}%`, opacity: 0.4 + (i / bwLog.length) * 0.6,
                }} />
              );
            })}
          </div>
        </div>

        <div style={{
          background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 0,
          padding: '14px 16px',
        }}>
          <div style={{
            fontFamily: FN, color: C.tm, fontSize: 10, letterSpacing: 1.5, fontWeight: 700,
            marginBottom: 8,
          }}>RECENT WORKOUTS</div>
          {RECENT.map((w, i) => {
            const fullyDone = w.completed === w.total;
            return (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 0',
                borderBottom: i < RECENT.length - 1 ? `1px solid ${C.bd}` : 'none',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: FB, fontSize: 13, color: C.tx, fontWeight: 600 }}>{w.dayName}</div>
                  <div style={{ fontFamily: FN, fontSize: 10, color: C.td, letterSpacing: 1, marginTop: 2 }}>
                    {new Date(w.date).toLocaleDateString()} · {w.completed}/{w.total} EXERCISES
                  </div>
                </div>
                <span style={{
                  fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: 1,
                  color: fullyDone ? C.gn : C.or,
                }}>{fullyDone ? '✓ COMPLETE' : 'PARTIAL'}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Weekly focus from coach — non-functional in demo, mirrors the
          real ClientPortal weekly_focus card pattern. */}
      <div style={{
        background: `linear-gradient(135deg, ${C.acD} 0%, ${C.sf} 100%)`,
        border: `1px solid ${C.cardBd}`, borderRadius: 0,
        padding: '14px 18px', marginBottom: 8,
      }}>
        <div style={{
          fontFamily: FN, color: C.ac, fontSize: 10, letterSpacing: 2, fontWeight: 700,
          marginBottom: 6,
        }}>THIS WEEK'S FOCUS · FROM YOUR COACH</div>
        <div style={{ fontFamily: FB, fontSize: 14, color: C.tx, lineHeight: 1.5 }}>
          Push volume is up this week — pace your bench work, hit the lateral-raise back-off
          sets even when they feel light. Film at least one bench set so I can call out the
          touch point.
        </div>
      </div>
    </section>
  );
}

// ─── Step 1 · auto-detected exercise (override available) ──────────────
//
// Real app behavior: the engine picks the exercise from the athlete's plan
// position automatically — they never tag what they filmed. The demo used to
// present a 13-button picker which made it look like the platform asks the
// athlete to identify the lift. Now we mirror production: show the auto-
// detected exercise as a hero card, with a low-key override path for the
// edge case where the plan position is wrong, and a small joint-channel
// dropdown for the case where the athlete wants to track a different joint.
//
// Exercise & joint mapping mirrors the real app's repCounter.js routing —
// squat→knee, hinge→hip, push→elbow, pull→back/elbow, isolation→primary.
const PATTERN_FOR = {
  squat:    { pattern: 'Squat',          joint: 'KNEE' },
  goblet:   { pattern: 'Squat',          joint: 'KNEE' },
  lunge:    { pattern: 'Lunge',          joint: 'KNEE' },
  rdl:      { pattern: 'Hip Hinge',      joint: 'HIP' },
  dl:       { pattern: 'Hip Hinge',      joint: 'HIP' },
  hipthrust:{ pattern: 'Hip Hinge',      joint: 'HIP' },
  bench:    { pattern: 'Horizontal Push',joint: 'ELBOW' },
  ohp:      { pattern: 'Vertical Push',  joint: 'ELBOW' },
  pushup:   { pattern: 'Horizontal Push',joint: 'ELBOW' },
  pullup:   { pattern: 'Vertical Pull',  joint: 'ELBOW' },
  row:      { pattern: 'Horizontal Pull',joint: 'ELBOW' },
  curl:     { pattern: 'Isolation',      joint: 'ELBOW' },
  lateral:  { pattern: 'Isolation',      joint: 'SHOULDER' },
};
const JOINT_OPTIONS = ['AUTO', 'KNEE', 'HIP', 'ELBOW', 'SHOULDER'];

function ExercisePicker({ pov, onPick }) {
  const isCoach = pov === 'coach';
  // Auto-detected default: matches the plan-context strip's "Block #4 Day A
  // exercise 1" — Back Squat. Same exercise an athlete would actually be on
  // when arriving at the upload step.
  const auto = TRY_EXERCISES[0];
  const meta = PATTERN_FOR[auto.key] || { pattern: 'Squat', joint: 'KNEE' };
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [joint, setJoint] = useState('AUTO');
  const resolvedJoint = joint === 'AUTO' ? meta.joint : joint;

  return (
    <section>
      <div style={{
        fontFamily: FN, color: C.gn, fontSize: 11, letterSpacing: 3,
        marginBottom: 8, fontWeight: 700,
      }}>STEP 1 · {isCoach ? 'AUTO-MATCHED FROM THE PLAN' : 'AUTO-DETECTED FROM YOUR PLAN'}</div>
      <h1 style={{
        fontFamily: FB, fontSize: 'clamp(24px, 3.5vw, 30px)', fontWeight: 700,
        marginBottom: 10, letterSpacing: -0.3,
      }}>{isCoach
        ? <>You're reviewing <span style={{ color: C.ac }}>{auto.label}</span>.</>
        : <>We already know — it's your <span style={{ color: C.ac }}>{auto.label}</span>.</>}</h1>
      <p style={{
        fontFamily: FB, color: C.tx, fontSize: 15, lineHeight: 1.6, maxWidth: 640, opacity: 0.85,
        marginBottom: 24,
      }}>
        {isCoach
          ? "The engine inherits the exercise from the athlete's plan position the moment they upload — no tagging on either side. Joint channel below is auto-routed off the movement pattern (squat → knee, hinge → hip, press → elbow)."
          : "Your plan tells the app what set you're on. The rep counter auto-routes to the right joint (squat → knee, hinge → hip, press → elbow) the moment you upload. You don't tag anything."}
      </p>

      {/* Auto-detected exercise card */}
      <div style={{
        background: C.sf, border: `1px solid rgba(46,213,115,0.251)`, borderRadius: 0,
        padding: 18, marginBottom: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontFamily: FN, fontSize: 10, color: C.gn, letterSpacing: 2, fontWeight: 700, marginBottom: 4 }}>
              ✓ AUTO-DETECTED
            </div>
            <div style={{ fontFamily: FB, fontSize: 22, fontWeight: 700, color: C.tx, marginBottom: 4 }}>{auto.label}</div>
            <div style={{ fontFamily: FN, fontSize: 11, color: C.tm, letterSpacing: 1, fontWeight: 600 }}>
              BLOCK #4 · DAY A · EXERCISE 1 · 4×6-8 · 60KG
            </div>
          </div>
          <div style={{ minWidth: 180, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
            <div style={{ fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: 2, fontWeight: 700 }}>JOINT TRACKING</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontFamily: FB, fontSize: 16, color: C.ac, fontWeight: 700 }}>{resolvedJoint}</span>
              {joint === 'AUTO' && (
                <span style={{ fontFamily: FN, fontSize: 9, color: C.gn, letterSpacing: 1.5, fontWeight: 700, padding: '2px 6px', background: 'rgba(46,213,115,0.125)', borderRadius: 0 }}>AUTO</span>
              )}
            </div>
            <div style={{ fontFamily: FN, fontSize: 10, color: C.tm, letterSpacing: 1, fontWeight: 600 }}>
              FROM PATTERN: {meta.pattern.toUpperCase()}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={() => onPick(auto)} style={{
            ...baseBtn,
            background: C.ac, color: '#0a0a0b',
            padding: '12px 22px', fontSize: 14, fontWeight: 700, letterSpacing: 0.5,
          }}>CONTINUE → UPLOAD</button>
          <select value={joint} onChange={e => setJoint(e.target.value)} style={{
            background: C.sf2, border: `1px solid ${C.bd2}`, borderRadius: 0,
            padding: '10px 12px', color: C.tx, fontFamily: FN, fontSize: 12,
            fontWeight: 600, letterSpacing: 1, outline: 'none',
          }}>
            {JOINT_OPTIONS.map(j => (
              <option key={j} value={j}>{j === 'AUTO' ? 'JOINT: AUTO' : `TRACK: ${j}`}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Override (rare path) */}
      <button onClick={() => setOverrideOpen(o => !o)} style={{
        background: 'none', border: 'none', color: C.tm, cursor: 'pointer',
        fontFamily: FN, fontSize: 11, letterSpacing: 1, fontWeight: 600, padding: 0,
        textDecoration: overrideOpen ? 'none' : 'underline', marginBottom: 12,
      }}>{overrideOpen ? 'HIDE OVERRIDE' : 'NOT THIS LIFT? OVERRIDE →'}</button>

      {overrideOpen && (
        <>
          <div style={{ fontFamily: FN, fontSize: 10, color: C.td, letterSpacing: 2, fontWeight: 700, marginBottom: 8 }}>
            MANUAL OVERRIDE — pick the lift instead
          </div>
          <div style={{
            display: 'grid', gap: 10,
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
          }}>
            {TRY_EXERCISES.map(ex => (
              <button key={ex.key} onClick={() => onPick(ex)} style={{
                ...baseBtn,
                display: 'flex', justifyContent: 'flex-start', textAlign: 'left',
                background: C.sf, color: C.tx,
                border: `1px solid ${ex.key === auto.key ? C.ac : C.bd}`, padding: '14px 16px',
                fontSize: 14, fontWeight: 600, borderRadius: 0,
              }}>
                <span style={{
                  display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
                  background: ex.key === auto.key ? C.gn : C.ac, marginRight: 10,
                }} />
                {ex.label}
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

// ─── Step 2 · upload your clip ────────────────────────────────────────────
function UploadStep({ pov, exercise, onUpload, onChangeExercise }) {
  const isCoach = pov === 'coach';
  const [drag, setDrag] = useState(false);
  const inputRef = useRef(null);
  const onDrop = (e) => {
    e.preventDefault(); setDrag(false);
    const f = e.dataTransfer?.files?.[0];
    if (f && f.type.startsWith('video/')) onUpload(f);
  };
  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (f) onUpload(f);
  };
  return (
    <section>
      <div style={{
        fontFamily:FN, color: C.ac, fontSize: 11, letterSpacing: 3,
        marginBottom: 8, fontWeight: 700,
      }}>STEP 2 · {isCoach ? 'LOAD THE ATHLETE CLIP' : 'UPLOAD A SET'}</div>
      <h1 style={{
        fontFamily:FB, fontSize:'clamp(24px, 3.5vw, 30px)', fontWeight:700,
        marginBottom: 10, letterSpacing:-0.3,
      }}>{isCoach
        ? <>Drop in your client's <span style={{ color: C.ac }}>{exercise?.label || 'set'}</span>.</>
        : <>Drop in a clip of your <span style={{ color: C.ac }}>{exercise?.label || 'set'}</span>.</>}</h1>
      <p style={{
        fontFamily:FB, color: C.tx, fontSize: 15, lineHeight:1.6, maxWidth: 640, opacity: 0.85,
        marginBottom: 24,
      }}>
        {isCoach
          ? 'For this demo, drop in any of your client\'s side-on training clips. In production, the clip arrives in your review queue automatically — you click it from the trainee detail and it loads here.'
          : 'Side-on phone clip works best. The video stays in your browser — no upload, no account, nothing leaves your device. MP4, MOV, or WebM, ideally 5–60 seconds.'}
      </p>

      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        style={{
          background: drag ? C.acD : C.sf, color: drag ? C.ac : C.tx,
          border: `2px dashed ${drag ? C.ac : C.bd2}`,
          borderRadius: 0, padding:'48px 24px',
          textAlign:'center', cursor:'pointer',
          transition:'border-color 150ms ease, background 150ms ease',
        }}>
        <div style={{
          fontFamily:FN, fontSize: 11, color: drag ? C.ac : C.td,
          letterSpacing: 2, fontWeight:700, marginBottom: 14,
        }}>{drag ? 'RELEASE TO LOAD' : 'CLICK OR DROP A CLIP'}</div>
        <div style={{
          fontFamily:FB, fontSize: 18, fontWeight: 700, color: C.tx,
          marginBottom: 10,
        }}>Tap to browse · or drop here</div>
        <div style={{
          fontFamily:FN, fontSize: 11, color: C.tm, letterSpacing: 1,
        }}>
          MP4 · MOV · WEBM · stays on this device
        </div>
        <input type="file" accept="video/*" ref={inputRef} onChange={onFile}
          style={{ display:'none' }} />
      </div>

      <p style={{
        marginTop: 20, fontFamily:FN, fontSize: 11, color: C.td,
        letterSpacing: 1, textAlign:'center',
      }}>
        TIP · 30FPS PHONE CLIPS WORK GREAT · SLOW & GRINDY REPS STILL COUNT
      </p>
      {onChangeExercise && (
        <div style={{ marginTop: 14, textAlign:'center' }}>
          <button onClick={onChangeExercise} style={{
            ...baseBtn, background:'transparent', color: C.tm,
            border:`1px solid ${C.bd}`, padding:'8px 16px',
            fontSize: 11, fontWeight: 700, letterSpacing: 1.2, borderRadius: 0,
          }}>← CHANGE EXERCISE</button>
        </div>
      )}
    </section>
  );
}

// ─── Step 3 · analyze (pose overlay + rep count) ──────────────────────────
function AnalyzeStep({ pov, exercise, videoUrl, onChangeVideo, onCompare, hideEndCTA }) {
  if (!videoUrl) {
    return (
      <div style={{
        background: C.sf, border:`1px dashed ${C.bd2}`, borderRadius: 0,
        padding: 48, textAlign:'center',
      }}>
        <div style={{
          fontFamily:FN, fontSize: 11, color: C.td, letterSpacing: 2, fontWeight: 700,
          marginBottom: 12,
        }}>NO VIDEO LOADED</div>
        <button onClick={onChangeVideo} style={{
          ...baseBtn, background: C.ac, color:'#000',
          padding:'10px 20px', fontWeight: 700, letterSpacing: 1.5,
        }}>UPLOAD A CLIP →</button>
      </div>
    );
  }
  return (
    <section>
      <div style={{
        fontFamily:FN, color: C.ac, fontSize: 11, letterSpacing: 3,
        marginBottom: 8, fontWeight: 700,
      }}>STEP 3 · ANALYZE</div>
      <h1 style={{
        fontFamily:FB, fontSize:'clamp(22px, 3.2vw, 28px)', fontWeight:700,
        marginBottom: 10, letterSpacing:-0.3,
      }}>{pov === 'coach'
        ? <>Reviewing your client's <span style={{ color: C.ac }}>{exercise?.label}</span>.</>
        : <>Pose detection on your <span style={{ color: C.ac }}>{exercise?.label}</span>.</>}</h1>
      <p style={{
        fontFamily:FB, color: C.tx, fontSize: 15, lineHeight:1.6, maxWidth: 720, opacity: 0.85,
        marginBottom: 18,
      }}>
        {pov === 'coach'
          ? "Toggle POSE for the skeleton overlay + live joint angles. Toggle REPS to count reps from angle troughs. In production you'd also draw on the frame, drop timestamped notes, and queue a video reply — that panel is mocked below the player."
          : "Toggle POSE for the skeleton overlay + live joint angles. Toggle REPS to count reps from angle troughs. Press play to start counting; the count tracks playback so scrubbing back drops it."}
      </p>
      <SandboxPlayer url={videoUrl} exerciseTitle={exercise?.sample || ''} />

      {!hideEndCTA && <NextStepPanel pov={pov} exercise={exercise} />}

      <div style={{
        marginTop: 22, display:'flex', gap: 10, flexWrap:'wrap', justifyContent:'center',
      }}>
        <button onClick={onChangeVideo} style={{
          ...baseBtn, background:'transparent', color: C.tm,
          border:`1px solid ${C.bd}`, padding:'10px 18px', fontWeight:700,
          letterSpacing: 1.2, borderRadius: 0, fontSize: 12,
        }}>← UPLOAD A DIFFERENT CLIP</button>
        <button onClick={onCompare} style={{
          ...baseBtn, background: C.ac, color:'#000',
          padding:'10px 18px', fontWeight:700, letterSpacing:1.2, borderRadius: 0, fontSize: 12,
        }}>COMPARE WITH ANOTHER CLIP →</button>
      </div>

      {!hideEndCTA && <BuyCallToAction pov={pov} />}
    </section>
  );
}

// ─── NextStepPanel ────────────────────────────────────────────────────────
// A POV-specific mock of "what comes after the analysis" — purely illustrative,
// non-interactive. Coach POV shows the review-tools surface (drawing, comments,
// reply video). Trainee POV shows the trainee's outbound flow (send for review,
// "your coach will reply" inline). Glued onto Step 3 + Step 4 so each POV has
// a meaningfully different shape, not just different copy.
function NextStepPanel({ pov, exercise }) {
  const isCoach = pov === 'coach';
  return (
    <div style={{
      marginTop: 22,
      background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 0,
      padding: 16,
    }}>
      <div style={{
        fontFamily: FN, color: C.ac, fontSize: 10, letterSpacing: 2.5, fontWeight: 700,
        marginBottom: 12,
      }}>{isCoach ? 'COACH · NEXT — REVIEW TOOLS' : 'ATHLETE · NEXT — SEND FOR REVIEW'}</div>
      {isCoach ? <CoachReviewMock exercise={exercise} /> : <TraineeSendMock exercise={exercise} />}
    </div>
  );
}

function CoachReviewMock({ exercise }) {
  return (
    <div style={{
      display: 'grid', gap: 14,
      gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
    }}>
      <MockTile
        title="Draw on form"
        body="Tap on any frame, draw a line on the bar path, knee track, or torso angle. Strokes are saved with the timestamp and replay when the athlete opens the review."
        chips={['BAR PATH', 'KNEE TRACK', 'TORSO ANGLE']}
      />
      <MockTile
        title="Timestamped comments"
        body="Pause at the bottom of rep 3, type a note. The client sees it pop in at the same frame on their side. Voice notes too if you'd rather speak it."
        chips={['00:08 · "knees caving"', '00:12 · "hips fast — slow it"']}
      />
      <MockTile
        title="Send a reply video"
        body="Record a 30s video reply with your phone — coaching cues, demo of the correction, mood check. Lands in the trainee's portal next to the review."
        chips={['REPLY · 0:24', 'SENT']}
      />
    </div>
  );
}

function TraineeSendMock({ exercise }) {
  return (
    <div style={{
      display: 'grid', gap: 14,
      gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
    }}>
      <MockTile
        title="One tap to send"
        body={`Hit "send for review" — the clip lands in your coach's review queue with the rep count, joint angles, and tempo already attached. No DM, no email, no compression.`}
        chips={[`${exercise?.label || 'Set'} · queued`, 'COACH NOTIFIED']}
      />
      <MockTile
        title="Coach reply lands here"
        body="When your coach reviews the clip, their drawings + timestamped notes + reply video appear right back on this screen. No app-switching."
        chips={['COMMENTS · 2', 'REPLY VIDEO · 0:24']}
      />
      <MockTile
        title="In your plan context"
        body="The clip is auto-linked to the right exercise on the right day so you (and your coach) can compare against last week's set on the same lift."
        chips={['BLOCK #3 · DAY A', 'WEEK 2 OF 4']}
      />
    </div>
  );
}

function MockTile({ title, body, chips }) {
  return (
    <div style={{
      background: C.sf2, border: `1px solid ${C.bd}`, borderRadius: 0,
      padding: 14, textAlign: 'left',
    }}>
      <div style={{
        fontFamily: FB, fontSize: 14, fontWeight: 700, color: C.tx,
        marginBottom: 6, letterSpacing: -0.1,
      }}>{title}</div>
      <p style={{
        fontFamily: FB, color: C.tx, opacity: 0.78, fontSize: 12.5, lineHeight: 1.5,
        margin: '0 0 10px',
      }}>{body}</p>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {chips.map((c, i) => (
          <span key={i} style={{
            fontFamily: FN, fontSize: 9, letterSpacing: 1.2, fontWeight: 700,
            color: C.ac, background: C.acD,
            border: `1px solid ${C.cardBd}`, borderRadius: 0,
            padding: '3px 6px',
          }}>{c}</span>
        ))}
      </div>
    </div>
  );
}

// ─── Step 4 · compare two clips side by side ──────────────────────────────
function CompareStep({ pov, exercise, primaryUrl, secondUrl, onUploadSecond, onBack, hideEndCTA }) {
  const inputRef = useRef(null);
  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (f) onUploadSecond(f);
  };
  return (
    <section>
      <div style={{
        fontFamily:FN, color: C.ac, fontSize: 11, letterSpacing: 3,
        marginBottom: 8, fontWeight: 700,
      }}>STEP 4 · SIDE-BY-SIDE</div>
      <h1 style={{
        fontFamily:FB, fontSize:'clamp(22px, 3.2vw, 28px)', fontWeight:700,
        marginBottom: 10, letterSpacing:-0.3,
      }}>Compare two attempts at the same lift.</h1>
      <p style={{
        fontFamily:FB, color: C.tx, fontSize: 15, lineHeight:1.6, maxWidth: 720, opacity: 0.85,
        marginBottom: 18,
      }}>
        Upload a second clip — last week's set, a heavier set, or your warm-up.
        Both run pose + rep count independently so you can compare ROM, tempo,
        and rep quality at a glance.
      </p>

      <div style={{
        display:'grid', gap: 16,
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))',
      }}>
        <div>
          <div style={{ fontFamily:FN, fontSize:11, color: C.tm, letterSpacing:1.5, fontWeight:700, marginBottom:8 }}>
            CLIP 1 · YOUR FIRST UPLOAD
          </div>
          <SandboxPlayer url={primaryUrl} exerciseTitle={exercise?.sample || ''} compact />
        </div>
        <div>
          <div style={{ fontFamily:FN, fontSize:11, color: C.tm, letterSpacing:1.5, fontWeight:700, marginBottom:8 }}>
            CLIP 2 · ANOTHER ATTEMPT
          </div>
          {secondUrl ? (
            <SandboxPlayer url={secondUrl} exerciseTitle={exercise?.sample || ''} compact />
          ) : (
            <div onClick={() => inputRef.current?.click()} style={{
              background: C.sf, border:`2px dashed ${C.bd2}`, borderRadius: 0,
              padding:'48px 16px', textAlign:'center', cursor:'pointer', minHeight: 280,
              display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
            }}>
              <div style={{ fontFamily:FN, fontSize:11, color:C.td, letterSpacing:2, fontWeight:700, marginBottom:10 }}>
                CLICK TO LOAD A SECOND CLIP
              </div>
              <div style={{ fontFamily:FB, fontSize:14, color:C.tm, lineHeight:1.5, maxWidth: 280 }}>
                MP4 · MOV · WEBM · stays on this device
              </div>
              <input type="file" accept="video/*" ref={inputRef} onChange={onFile}
                style={{ display:'none' }} />
            </div>
          )}
        </div>
      </div>

      {!hideEndCTA && <NextStepPanel pov={pov} exercise={exercise} />}

      <div style={{
        marginTop: 22, display:'flex', gap: 10, flexWrap:'wrap', justifyContent:'center',
      }}>
        <button onClick={onBack} style={{
          ...baseBtn, background:'transparent', color: C.tm,
          border:`1px solid ${C.bd}`, padding:'10px 18px', fontWeight:700,
          letterSpacing: 1.2, borderRadius: 0, fontSize: 12,
        }}>← BACK TO SINGLE-CLIP VIEW</button>
      </div>
      {!hideEndCTA && <BuyCallToAction pov={pov} />}
    </section>
  );
}

// ─── The actual video player with pose + rep overlays ────────────────────
// Lean rewrite — same MediaPipe + repCounter math as src/WorkoutReview.jsx,
// but stripped of comments / drawings / fullscreen-trainer-only paths /
// review-notes / Save&Next hotkey. Same model URL + lite-vs-full delegate
// fallback so behavior matches production.
function SandboxPlayer({ url, exerciseTitle, compact = false }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const landmarkerRef = useRef(null);
  const rafRef = useRef(null);
  const repStateRef = useRef({ signalBufs: {} });
  const repsCountRef = useRef(0);
  const lastTempoRef = useRef(null);

  const [poseOn, setPoseOn] = useState(true);
  const [repsOn, setRepsOn] = useState(true);
  const [poseLoading, setPoseLoading] = useState(false);
  const [poseError, setPoseError] = useState('');
  const [angles, setAngles] = useState({});
  const [reps, setReps] = useState(0);
  const [tempo, setTempo] = useState(null);
  const [speed, setSpeed] = useState(1);

  // Resolve which joint channels to count — squat→knee, deadlift→hip, etc.
  const { kind: channelKind, channels: activeChannels } = detectChannels(exerciseTitle || '');
  const activeChannelsRef = useRef(activeChannels);
  useEffect(() => { activeChannelsRef.current = activeChannels; }, [activeChannels.join('|')]);

  // Lazy MediaPipe bootstrap. First toggle of POSE or REPS triggers download
  // of the WASM + lite-model (~6MB total). Subsequent toggles reuse the
  // cached landmarker.
  const ensureModel = async () => {
    if (landmarkerRef.current) return true;
    setPoseLoading(true); setPoseError('');
    try {
      const { PoseLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
      const fileset = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm'
      );
      const modelUrl = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task';
      const opts = (delegate) => ({
        baseOptions: { modelAssetPath: modelUrl, delegate },
        runningMode: 'VIDEO',
        numPoses: 1,
      });
      try {
        landmarkerRef.current = await PoseLandmarker.createFromOptions(fileset, opts('GPU'));
      } catch {
        landmarkerRef.current = await PoseLandmarker.createFromOptions(fileset, opts('CPU'));
      }
    } catch (e) {
      console.error('Pose load failed:', e);
      setPoseError('Model load failed — refresh and retry');
      setPoseLoading(false);
      return false;
    }
    setPoseLoading(false);
    return true;
  };

  // Auto-load the model on first mount so the visitor sees the skeleton + rep
  // counter immediately when they press play, without having to discover the
  // toggles. We keep the toggles for power-users and for performance — old
  // phones can disable POSE while keeping REPS, etc.
  useEffect(() => { ensureModel(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, []);

  // Tear down the landmarker on unmount so navigating away frees the GPU.
  useEffect(() => () => {
    if (landmarkerRef.current) {
      try { landmarkerRef.current.close(); } catch {}
      landmarkerRef.current = null;
    }
  }, []);

  // Sync playback rate to the speed selector. We don't use HTMLMediaElement's
  // `playbackrate` attribute because it's read-only at element level.
  useEffect(() => {
    const v = videoRef.current; if (!v) return;
    v.playbackRate = speed;
  }, [speed]);

  // Detection loop — copy of the production loop in WorkoutReview.jsx but
  // simplified (no comment auto-pause, no drawings layer, no role gating).
  useEffect(() => {
    if (!poseOn && !repsOn) {
      const c = canvasRef.current;
      if (c && c.width && c.height) c.getContext('2d').clearRect(0, 0, c.width, c.height);
      setAngles({});
      return;
    }
    const v = videoRef.current;
    const c = canvasRef.current;
    const lm = landmarkerRef.current;
    if (!v || !c || !lm) return;

    let active = true;
    const ctx = c.getContext('2d');
    let lastTs = -1;
    let pendingAngles = {};
    let frameTick = 0;

    const hudInterval = setInterval(() => {
      if (!active) return;
      setAngles(pendingAngles);
      setReps(repsCountRef.current);
      setTempo(lastTempoRef.current);
    }, 200);

    const detect = () => {
      if (!active) return;
      const skip = (frameTick++ % 2) !== 0;
      if (skip) {
        if (typeof v.requestVideoFrameCallback === 'function') v.requestVideoFrameCallback(detect);
        else rafRef.current = requestAnimationFrame(detect);
        return;
      }
      const w = v.clientWidth, h = v.clientHeight;
      if (w > 0 && h > 0 && v.readyState >= 2) {
        if (c.width !== w) c.width = w;
        if (c.height !== h) c.height = h;
        const ts = Math.max(performance.now(), lastTs + 0.001);
        if (ts > lastTs) {
          lastTs = ts;
          try {
            const result = lm.detectForVideo(v, ts);
            ctx.clearRect(0, 0, w, h);
            const lms = result.landmarks?.[0];
            const wlms = result.worldLandmarks?.[0] || lms;
            const vw = v.videoWidth || w, vh = v.videoHeight || h;
            const s = Math.min(w / vw, h / vh);
            const dw = vw * s, dh = vh * s;
            const ox = (w - dw) / 2, oy = (h - dh) / 2;
            const px = (p) => ox + p.x * dw;
            const py = (p) => oy + p.y * dh;
            if (lms) {
              if (poseOn) {
                ctx.strokeStyle = C.ac;
                ctx.lineWidth = 2;
                for (const [i, j] of POSE_CONNECTIONS) {
                  const a = lms[i], b = lms[j];
                  if (!a || !b) continue;
                  ctx.beginPath();
                  ctx.moveTo(px(a), py(a));
                  ctx.lineTo(px(b), py(b));
                  ctx.stroke();
                }
                ctx.fillStyle = '#fff';
                for (const p of lms) {
                  ctx.beginPath();
                  ctx.arc(px(p), py(p), 3, 0, 2*Math.PI);
                  ctx.fill();
                }
              }
              const next = {};
              for (const d of ANGLE_DEFS) {
                const val = angleAt(wlms, d.a, d.b, d.c);
                if (val != null) next[d.name] = Math.round(val);
              }
              pendingAngles = next;

              const BUCKET_FPS = 30;
              if (repsOn) {
                const st = repStateRef.current;
                const vt = v.currentTime;
                const bucket = Math.round(vt * BUCKET_FPS);
                for (const d of ANGLE_DEFS) {
                  const key = d.name;
                  if (!st.signalBufs[key]) st.signalBufs[key] = [];
                  const raw = next[key];
                  st.signalBufs[key][bucket] = raw != null ? raw : NaN;
                }
                const activeCh = activeChannelsRef.current;
                if (activeCh.length === 0) {
                  repsCountRef.current = 0;
                } else {
                  const minDist = Math.max(4, Math.round(BUCKET_FPS * 0.4));
                  const curBucket = Math.round(v.currentTime * BUCKET_FPS);
                  let bestCount = 0;
                  for (const key of activeCh) {
                    const sig = st.signalBufs[key];
                    if (!sig || sig.length < 10) continue;
                    const truncated = sig.slice(0, Math.max(0, curBucket + 1));
                    if (truncated.length < 10) continue;
                    const smoothed = medianFilter(truncated, SMOOTH_N);
                    const inverted = smoothed.map(x => Number.isFinite(x) ? -x : x);
                    const troughs = findPeaks(inverted, 25, minDist);
                    if (troughs.length > bestCount) bestCount = troughs.length;
                  }
                  repsCountRef.current = bestCount;
                  lastTempoRef.current = bestCount > 1 ? vt / bestCount : null;
                }
              }
            }
          } catch { /* per-frame errors are noisy and recoverable */ }
        }
      }
      if (typeof v.requestVideoFrameCallback === 'function') v.requestVideoFrameCallback(detect);
      else rafRef.current = requestAnimationFrame(detect);
    };

    if (typeof v.requestVideoFrameCallback === 'function') v.requestVideoFrameCallback(detect);
    else rafRef.current = requestAnimationFrame(detect);
    detect();

    v.addEventListener('seeked', detect);
    v.addEventListener('loadeddata', detect);

    const onPlay = () => {
      if (!repsOn) return;
      repStateRef.current.signalBufs = {};
      repsCountRef.current = 0;
      lastTempoRef.current = null;
      setReps(0);
      setTempo(null);
    };
    v.addEventListener('play', onPlay);

    return () => {
      active = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (hudInterval) clearInterval(hudInterval);
      v.removeEventListener('seeked', detect);
      v.removeEventListener('loadeddata', detect);
      v.removeEventListener('play', onPlay);
    };
  }, [poseOn, repsOn]);

  const togglePose = async () => {
    if (poseOn) { setPoseOn(false); return; }
    if (await ensureModel()) setPoseOn(true);
  };
  const toggleReps = async () => {
    if (repsOn) { setRepsOn(false); return; }
    if (await ensureModel()) setRepsOn(true);
  };

  const speeds = [0.25, 0.5, 1, 1.25];

  // Pick which angle to highlight in the HUD based on which channels are
  // active. Rep counter watches one or both — we show the active side(s)
  // in the corner so the viewer sees the signal feeding the count.
  const hudChannels = (activeChannels.length > 0 ? activeChannels : ['L KNE', 'R KNE'])
    .map(name => ({ name, val: angles[name] }));

  return (
    <div style={{
      background: C.sf, border:`1px solid ${C.bd}`, borderRadius: 0,
      padding: 12, position:'relative',
    }}>
      {/* Toolbar */}
      <div style={{
        display:'flex', flexWrap:'wrap', gap: 8, marginBottom: 10, alignItems:'center',
      }}>
        <Toggle on={poseOn} loading={poseLoading} onClick={togglePose} label="POSE" />
        <Toggle on={repsOn} loading={poseLoading} onClick={toggleReps} label="REPS" />
        <div style={{ flex:1 }} />
        <div style={{ display:'flex', gap:4, alignItems:'center' }}>
          <span style={{ fontFamily:FN, fontSize:10, color:C.td, letterSpacing:1.5, fontWeight:700 }}>SPEED</span>
          {speeds.map(s => (
            <button key={s} onClick={() => setSpeed(s)} style={{
              ...baseBtn, padding:'4px 8px', fontSize: 11, fontWeight: 700,
              background: speed === s ? C.acD : 'transparent',
              color: speed === s ? C.ac : C.tm,
              border:`1px solid ${speed === s ? C.ac : C.bd}`, borderRadius: 0,
            }}>{s}×</button>
          ))}
        </div>
      </div>
      {poseError && (
        <div style={{
          background: C.rdD, border: `1px solid ${C.rd}`, color: C.rd,
          fontFamily: FB, fontSize: 12, padding:'6px 10px', borderRadius: 0,
          marginBottom: 8,
        }}>{poseError}</div>
      )}

      <div style={{ position:'relative', borderRadius: 0, overflow:'hidden', background: '#000' }}>
        {/* First-mount: MediaPipe is fetching ~6MB. Show a subtle banner so
            the visitor knows the canvas isn't broken — pose lines simply
            haven't started drawing yet. */}
        {poseLoading && !landmarkerRef.current && (
          <div style={{
            position:'absolute', top: 10, left: '50%', transform:'translateX(-50%)',
            background: C.acD, color: C.ac,
            border: `1px solid ${C.cardBd}`, borderRadius: 0,
            padding:'4px 12px', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: 1.5,
            zIndex: 5, pointerEvents:'none',
          }}>LOADING POSE MODEL…</div>
        )}
        <video ref={videoRef} src={url} controls preload="metadata" playsInline
          style={{
            display:'block', width:'100%',
            maxHeight: compact ? 360 : 540,
            objectFit:'contain',
          }} />
        <canvas ref={canvasRef} style={{
          position:'absolute', top:0, left:0, width:'100%', height:'100%',
          pointerEvents:'none',
        }} />
        {/* HUD overlays — top-left for joint angles, top-right for the live rep count */}
        <div style={{
          position:'absolute', top: 10, left: 10, display:'flex', flexDirection:'column', gap:4,
          pointerEvents:'none',
        }}>
          {(poseOn || repsOn) && hudChannels.map(({ name, val }) => (
            <span key={name} style={{
              background: C.acD, color: C.ac,
              border: `1px solid ${C.cardBd}`, borderRadius: 0,
              padding:'3px 8px', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: 1,
            }}>{name} {val != null ? `${val}°` : '—'}</span>
          ))}
        </div>
        <div style={{
          position:'absolute', top: 10, right: 10, display: repsOn ? 'flex' : 'none', gap: 6,
          pointerEvents:'none',
        }}>
          <span style={{
            background: C.acD, color: C.ac,
            border: `1px solid ${C.cardBd}`, borderRadius: 0,
            padding:'4px 10px', fontFamily: FN, fontSize: 14, fontWeight: 700, letterSpacing: 1,
          }}>
            {reps} REP{reps === 1 ? '' : 'S'}
          </span>
          {tempo && (
            <span style={{
              background: C.acD, color: C.ac,
              border: `1px solid ${C.cardBd}`, borderRadius: 0,
              padding:'4px 10px', fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: 1,
            }}>
              {tempo.toFixed(2)}s/REP
            </span>
          )}
        </div>
      </div>

      <div style={{
        marginTop: 10, display:'flex', justifyContent:'space-between', alignItems:'center', gap: 10, flexWrap:'wrap',
      }}>
        <span style={{ fontFamily:FN, fontSize: 10, color: C.td, letterSpacing: 1.5, fontWeight: 700 }}>
          REP CHANNEL · {channelKind.toUpperCase()}
          {activeChannels.length > 0 && ' · ' + activeChannels.join(' / ')}
          {channelKind === 'none' && ' · ISOMETRIC — NO REP COUNT'}
        </span>
        <span style={{ fontFamily:FN, fontSize: 10, color: C.td, letterSpacing: 1.5, fontWeight: 700 }}>
          MEDIAPIPE LITE · 33 LANDMARKS
        </span>
      </div>
    </div>
  );
}

function Toggle({ on, loading, onClick, label }) {
  return (
    <button onClick={onClick} disabled={loading} style={{
      ...baseBtn,
      background: on ? C.acD : C.sf2,
      color: on ? C.ac : C.tm,
      border: `1px solid ${on ? C.ac : C.bd}`,
      padding:'6px 12px', borderRadius: 0,
      fontSize: 11, fontWeight: 700, letterSpacing: 1.5,
      cursor: loading ? 'wait' : 'pointer',
      opacity: loading ? 0.6 : 1,
    }}>
      {loading ? '…' : (on ? '● ' : '○ ')}{label}
    </button>
  );
}

// ─── BuyCallToAction shown after analyze + compare ────────────────────────
// Both POVs convert at /demo#waitlist — /try and /demo are two angles of
// the same coach-buyer pitch ("here's your tool" + "here's your client's tool").
// The cross-link sends the visitor to the OTHER POV so they get the full
// picture before deciding.
function BuyCallToAction({ pov = 'coach' }) {
  const isCoach = pov === 'coach';
  const tag = 'WHAT YOU JUST USED';
  const head = isCoach
    ? 'This is the review tool you sit down to every morning.'
    : 'This is what every one of your clients gets.';
  const body = isCoach
    ? 'Same engine, your side of the table. Pose overlay, rep count, side-by-side compare on any uploaded athlete clip — no exporting to QuickTime, no scrubbing through DMs. Comments, drawings, and timestamped notes go back to the athlete through the portal.'
    : 'When your client films a set on their phone, this is the screen they see. Pose lines, rep count, tempo, and a one-tap path to send it for your review. No app install, no account they have to manage — they tap the link in your message and they\'re in.';
  const primaryHref = '/demo#waitlist';
  const primaryLbl  = 'JOIN THE WAITLIST';
  const secondHref  = isCoach ? '/demo' : '/try';
  const secondLbl   = isCoach ? 'NOW SEE THE ATHLETE VIEW →' : 'NOW SEE THE COACH VIEW →';
  return (
    <div style={{
      marginTop: 28,
      background: `linear-gradient(135deg, ${C.sf2} 0%, ${C.sf} 100%)`,
      border: `1px solid ${C.cardBd}`, borderRadius: 0,
      padding:'22px 18px', textAlign:'center',
    }}>
      <div style={{
        fontFamily:FN, color: C.ac, fontSize: 11, letterSpacing: 3,
        marginBottom: 8, fontWeight: 700,
      }}>{tag}</div>
      <h2 style={{
        fontFamily:FB, fontSize:'clamp(20px, 2.6vw, 24px)', fontWeight: 700,
        marginBottom: 10, letterSpacing: -0.2,
      }}>{head}</h2>
      <p style={{
        fontFamily: FB, color: C.tx, opacity: 0.85, fontSize: 14, lineHeight: 1.55,
        maxWidth: 620, margin:'0 auto 18px',
      }}>{body}</p>
      <div style={{ display:'flex', gap: 10, flexWrap:'wrap', justifyContent:'center' }}>
        <a href={primaryHref} style={{
          ...baseBtn,
          background: C.ac, color:'#000',
          padding:'11px 22px', fontWeight:700, letterSpacing:1.5, borderRadius: 0, fontSize: 12,
          textDecoration: 'none',
        }}>{primaryLbl}</a>
        <a href={secondHref} style={{
          ...baseBtn,
          background:'transparent', color: C.tx,
          border:`1px solid ${C.bd2}`, padding:'11px 22px', fontWeight:700,
          letterSpacing: 1.2, borderRadius: 0, fontSize: 12,
          textDecoration: 'none',
        }}>{secondLbl}</a>
      </div>
    </div>
  );
}

function Footer() {
  return (
    <footer style={{
      borderTop: `1px solid ${C.bd}`, padding:'18px 16px',
      maxWidth: 1180, margin:'0 auto', width:'100%',
      display:'flex', justifyContent:'space-between', alignItems:'center', gap: 12,
      flexWrap:'wrap',
    }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        fontFamily:FN, fontSize:10, color: C.td, letterSpacing: 1,
      }}>
        <EXPOMark theme="dark" height={14} style={{ opacity: 0.55 }} />
        <span>· TRY THE PLATFORM · NO ACCOUNT REQUIRED</span>
      </span>
      <span style={{ fontFamily:FN, fontSize:10, color: C.td, letterSpacing: 1 }}>
        VIDEO STAYS ON YOUR DEVICE
      </span>
    </footer>
  );
}
