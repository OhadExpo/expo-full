// REVIEW · TOOLS — the camera/pose video suite as its own coach surface,
// reached from the Review ▾ nav dropdown (Workouts / Tools). All lazy so
// MediaPipe / three.js stay out of the bundle until a tool is opened. Owner
// trial — nothing here writes to the athlete.
import React, { useState, lazy, Suspense } from 'react';
import { C, FN, FB } from './theme';
import { SectionLabel } from './ui';

const MovementLab = lazy(() => import('./MovementLab'));
const ARFormOverlay = lazy(() => import('./ARFormOverlay'));
const LiveRepCounter = lazy(() => import('./LiveRepCounter'));

const REVIEW_TOOLS = [
  { key: 'lab',  label: 'MOVEMENT LAB', desc: 'Record or upload a set → bar-speed (VBT), range-of-motion + tempo, and a rotatable 3D skeleton rebuilt from the lift.' },
  { key: 'jump', label: 'JUMP TEST',    desc: 'Film a vertical jump → height from flight time + estimated peak power (enter bodyweight).' },
  { key: 'ar',   label: 'AR FORM',      desc: 'Live camera overlay — real-time bar-path + depth line while the athlete lifts.' },
  { key: 'rep',  label: 'REP COUNTER',  desc: 'Live automatic rep counting from the camera.' },
];

export default function ReviewToolsView() {
  const [title, setTitle] = useState('Squat');
  const [tool, setTool] = useState(null); // 'lab' | 'jump' | 'ar' | 'rep' | null
  return (
    <div>
      <div style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, color: C.tm, textTransform: 'uppercase', letterSpacing: '0.18em', marginBottom: 4 }}>REVIEW · TOOLS</div>
      <div style={{ color: C.tm, fontSize: 11, marginBottom: 16, fontFamily: FB }}>
        Camera &amp; pose tools — measure a lift you're reviewing. Owner trial; nothing is saved to the athlete.
      </div>

      <div style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, boxShadow: C.cardShadow }}>
        <div style={{ background: 'var(--c-stripBg, var(--c-sf))', borderBottom: '1px solid var(--c-cardBd)', padding: '0 14px', minHeight: 45, boxSizing: 'border-box', display: 'flex', alignItems: 'center' }}>
          <SectionLabel as="div" style={{ color: '#FFFFFF', fontSize: C.alertLabelSize }}>TOOLS</SectionLabel>
        </div>
        <div style={{ padding: 14 }}>
          <div style={{ marginBottom: 14, maxWidth: 320 }}>
            <label style={{ display: 'block', fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: '0.12em', fontWeight: 700, marginBottom: 4 }}>EXERCISE · FOR LAB / AR / REPS</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Back Squat"
              style={{ width: '100%', boxSizing: 'border-box', background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, color: C.tx, fontFamily: FB, fontSize: 13, padding: '8px 10px', borderRadius: 0, outline: 'none' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 240px), 1fr))', gap: 10 }}>
            {REVIEW_TOOLS.map(t => (
              <button key={t.key} onClick={() => setTool(t.key)} title={t.desc}
                style={{ textAlign: 'left', background: 'transparent', border: `1px solid ${C.ac}`, borderRadius: 0, padding: '12px 14px', cursor: 'pointer' }}>
                <div style={{ fontFamily: FN, fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', color: C.ac, marginBottom: 4 }}>{t.label} →</div>
                <div style={{ fontFamily: FB, fontSize: 11, color: C.td, lineHeight: 1.4 }}>{t.desc}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {tool && (
        <Suspense fallback={null}>
          {tool === 'lab'  && <MovementLab exerciseTitle={title || 'Squat'} initialMode="analyze" onClose={() => setTool(null)} />}
          {tool === 'jump' && <MovementLab exerciseTitle="Vertical Jump" initialMode="jump" onClose={() => setTool(null)} />}
          {tool === 'ar'   && <ARFormOverlay exerciseTitle={title || 'Squat'} onClose={() => setTool(null)} />}
          {tool === 'rep'  && <LiveRepCounter exerciseTitle={title || 'Squat'} onClose={() => setTool(null)} />}
        </Suspense>
      )}
    </div>
  );
}
