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
  borderRadius:8, border:'none', fontFamily:FB, fontSize:13, fontWeight:600,
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

  return (
    <div style={{
      background: C.bg, color: C.tx, minHeight:'100vh',
      fontFamily: FB, display:'flex', flexDirection:'column',
    }}>
      {!isEmbedded && <Header step={step} exercise={exercise} onRestart={restart} onStep={setStep} hasVideo={!!videoUrl} />}
      {!isEmbedded && <POVBanner pov={pov} />}
      {!isEmbedded && pov === 'trainee' && <TraineeContextStrip exercise={exercise} />}
      <main style={{ flex:1, padding: isEmbedded ? '14px 16px 24px' : '18px 16px 80px', maxWidth:1180, margin:'0 auto', width:'100%' }}>
        {step === 'exercise' && (pov === 'trainee' && !isEmbedded
          ? <TraineeHomeMock onPick={onPickExercise} />
          : <ExercisePicker pov={pov} onPick={onPickExercise} />)}
        {step === 'upload'   && <UploadStep pov={pov} exercise={exercise} onUpload={onUpload} onChangeExercise={() => setStep('exercise')} />}
        {step === 'analyze'  && <AnalyzeStep pov={pov} exercise={exercise} videoUrl={videoUrl}
                                  onChangeVideo={() => setStep('upload')}
                                  onCompare={() => setStep('compare')} hideEndCTA={isEmbedded} />}
        {step === 'compare'  && <CompareStep pov={pov} exercise={exercise} primaryUrl={videoUrl} secondUrl={secondUrl}
                                  onUploadSecond={onUploadSecond}
                                  onBack={() => setStep('analyze')} hideEndCTA={isEmbedded} />}
      </main>
      {!isEmbedded && <Footer />}
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
          <EXPOMark height={22} style={{ marginBottom: 0 }} />
        </a>
        {/* DEMO badge — hidden on narrow screens via the .try-sandbox-badge
            class so the step nav has room to breathe on phones. */}
        <span className="try-sandbox-badge" style={{
          fontFamily:FN, fontSize:10, color: C.ac, letterSpacing:2, fontWeight:700,
          padding:'4px 8px', background: C.acD, borderRadius:6,
          border:`1px solid rgba(57,189,255,0.30)`, whiteSpace:'nowrap',
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
                  letterSpacing: 1.5, borderRadius: 6,
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
          fontSize: 11, fontWeight: 700, letterSpacing: 1.2, borderRadius: 6,
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
          background: C.acD, padding: '3px 8px', borderRadius: 4,
          border: `1px solid rgba(57,189,255,0.30)`, whiteSpace: 'nowrap',
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
          background: C.acD, border: `1px solid rgba(57,189,255,0.30)`,
          borderRadius: 6, padding: '4px 9px', whiteSpace: 'nowrap',
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
          background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 6, overflow: 'hidden',
          flex: '0 0 auto',
        }}>
          <a href="/demo/coach" style={{
            background: isCoach ? C.ac : 'transparent',
            color: isCoach ? '#000' : C.tm,
            padding:'5px 12px', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: 1.5,
            textDecoration: 'none',
          }}>COACH</a>
          <a href="/demo/trainee" style={{
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
        background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 12,
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
          height: 6, borderRadius: 3, background: C.sf2, overflow: 'hidden',
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
              background: C.sf, border: `1px solid ${isLogged ? C.gn : C.bd}`, borderRadius: 10,
              padding: '14px 16px',
              display: 'grid', gap: 10, gridTemplateColumns: '1fr',
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <span style={{
                  fontFamily: FN, fontSize: 10, color: isLogged ? C.gn : C.tm, letterSpacing: 1.5, fontWeight: 700,
                  background: isLogged ? `${C.gn}20` : C.sf2, border: `1px solid ${isLogged ? `${C.gn}55` : C.bd}`,
                  borderRadius: 4, padding: '2px 7px',
                }}>{isLogged ? '✓ DONE' : `EX ${ei + 1}`}</span>
                <span style={{ fontFamily: FB, fontSize: 14, fontWeight: 700, color: C.tx }}>{ex.label}</span>
                <span style={{ flex: 1 }} />
                <span style={{ fontFamily: FN, fontSize: 11, color: C.ac, letterSpacing: 1, fontWeight: 700 }}>
                  {ex.sets} × {ex.reps}{ex.load && ex.load !== '—' ? ` · ${ex.load}` : ''}
                </span>
              </div>
              <div style={{
                fontFamily: FB, fontSize: 12, color: C.tm, lineHeight: 1.5,
                background: C.sf2, border: `1px solid ${C.bd}`, borderRadius: 6,
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
          background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 12,
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
                borderRadius: 6, padding: '8px 10px', color: C.tx,
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
                  flex: 1, background: C.ac, borderRadius: 2,
                  height: `${pct}%`, opacity: 0.4 + (i / bwLog.length) * 0.6,
                }} />
              );
            })}
          </div>
        </div>

        <div style={{
          background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 12,
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
        border: `1px solid rgba(57,189,255,0.30)`, borderRadius: 12,
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

// ─── Step 1 · pick an exercise ────────────────────────────────────────────
function ExercisePicker({ pov, onPick }) {
  const isCoach = pov === 'coach';
  return (
    <section>
      <div style={{
        fontFamily:FN, color: C.ac, fontSize: 11, letterSpacing: 3,
        marginBottom: 8, fontWeight: 700,
      }}>STEP 1 · {isCoach ? 'PICK THE LIFT TO REVIEW' : 'PICK WHAT YOU FILMED'}</div>
      <h1 style={{
        fontFamily:FB, fontSize:'clamp(24px, 3.5vw, 30px)', fontWeight:700,
        marginBottom: 10, letterSpacing:-0.3,
      }}>{isCoach ? "What's your client's clip of?" : 'What did you film?'}</h1>
      <p style={{
        fontFamily:FB, color: C.tx, fontSize: 15, lineHeight:1.6, maxWidth: 640, opacity: 0.85,
        marginBottom: 28,
      }}>
        {isCoach
          ? "Pick the lift. The rep counter routes to the right joint channel — squat → knee, hinge → hip, press → elbow — so your reps are counted correctly the moment the athlete uploads. You don't tag exercises; the engine inherits it from the plan."
          : "Pick the closest match. The rep counter routes to the right joint channel — squat → knee, hinge → hip, press → elbow — same logic the EXPO portal uses on real client clips. If yours isn't here, pick the closest movement pattern."}
      </p>
      <div style={{
        display:'grid', gap: 10,
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
      }}>
        {TRY_EXERCISES.map(ex => (
          <button key={ex.key} onClick={() => onPick(ex)} style={{
            ...baseBtn,
            display:'flex', justifyContent:'flex-start', textAlign:'left',
            background: C.sf, color: C.tx,
            border: `1px solid ${C.bd}`, padding: '14px 16px',
            fontSize: 14, fontWeight: 600, borderRadius: 10,
            transition:'border-color 150ms ease, background 150ms ease',
          }}>
            <span style={{
              display:'inline-block', width:6, height:6, borderRadius:'50%',
              background: C.ac, marginRight: 10,
            }} />
            {ex.label}
          </button>
        ))}
      </div>
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
          borderRadius: 14, padding:'48px 24px',
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
            fontSize: 11, fontWeight: 700, letterSpacing: 1.2, borderRadius: 6,
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
        background: C.sf, border:`1px dashed ${C.bd2}`, borderRadius: 12,
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
          letterSpacing: 1.2, borderRadius: 6, fontSize: 12,
        }}>← UPLOAD A DIFFERENT CLIP</button>
        <button onClick={onCompare} style={{
          ...baseBtn, background: C.ac, color:'#000',
          padding:'10px 18px', fontWeight:700, letterSpacing:1.2, borderRadius: 6, fontSize: 12,
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
      background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 14,
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
      background: C.sf2, border: `1px solid ${C.bd}`, borderRadius: 10,
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
            border: `1px solid rgba(57,189,255,0.30)`, borderRadius: 4,
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
              background: C.sf, border:`2px dashed ${C.bd2}`, borderRadius: 12,
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
          letterSpacing: 1.2, borderRadius: 6, fontSize: 12,
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
      background: C.sf, border:`1px solid ${C.bd}`, borderRadius: 14,
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
              border:`1px solid ${speed === s ? C.ac : C.bd}`, borderRadius: 4,
            }}>{s}×</button>
          ))}
        </div>
      </div>
      {poseError && (
        <div style={{
          background: C.rdD, border: `1px solid ${C.rd}`, color: C.rd,
          fontFamily: FB, fontSize: 12, padding:'6px 10px', borderRadius: 6,
          marginBottom: 8,
        }}>{poseError}</div>
      )}

      <div style={{ position:'relative', borderRadius: 10, overflow:'hidden', background: '#000' }}>
        {/* First-mount: MediaPipe is fetching ~6MB. Show a subtle banner so
            the visitor knows the canvas isn't broken — pose lines simply
            haven't started drawing yet. */}
        {poseLoading && !landmarkerRef.current && (
          <div style={{
            position:'absolute', top: 10, left: '50%', transform:'translateX(-50%)',
            background: C.acD, color: C.ac,
            border: `1px solid rgba(57,189,255,0.30)`, borderRadius: 6,
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
              border: `1px solid rgba(57,189,255,0.30)`, borderRadius: 6,
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
            border: `1px solid rgba(57,189,255,0.30)`, borderRadius: 6,
            padding:'4px 10px', fontFamily: FN, fontSize: 14, fontWeight: 700, letterSpacing: 1,
          }}>
            {reps} REP{reps === 1 ? '' : 'S'}
          </span>
          {tempo && (
            <span style={{
              background: C.acD, color: C.ac,
              border: `1px solid rgba(57,189,255,0.30)`, borderRadius: 6,
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
      padding:'6px 12px', borderRadius: 6,
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
      border: `1px solid rgba(57,189,255,0.30)`, borderRadius: 14,
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
          padding:'11px 22px', fontWeight:700, letterSpacing:1.5, borderRadius: 6, fontSize: 12,
          textDecoration: 'none',
        }}>{primaryLbl}</a>
        <a href={secondHref} style={{
          ...baseBtn,
          background:'transparent', color: C.tx,
          border:`1px solid ${C.bd2}`, padding:'11px 22px', fontWeight:700,
          letterSpacing: 1.2, borderRadius: 6, fontSize: 12,
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
        <EXPOMark height={14} style={{ opacity: 0.55 }} />
        <span>· TRY THE PLATFORM · NO ACCOUNT REQUIRED</span>
      </span>
      <span style={{ fontFamily:FN, fontSize:10, color: C.td, letterSpacing: 1 }}>
        VIDEO STAYS ON YOUR DEVICE
      </span>
    </footer>
  );
}
