// ExerciseSubstitution: modal picker for swapping a prescribed exercise mid-set
// when the trainee can't reach the equipment (busy machine, missing kit).
//
// Surfaced in ClientPortal next to each exercise title — only when the
// trainee is on a template-purchased plan (not Ohad's manually-coached
// private clients; he handles substitutions for them himself).
//
// The picker shows the top 5 alternates from the trainer's exercise library
// scored by src/exerciseSimilarity.js. Tapping an alternate calls onPick with
// the chosen exercise + closes the modal. The substitution is per-session
// (lives in ClientPortal state, never persisted) so the prescribed plan
// stays untouched.

import React from 'react';
import { C, FN, FB } from './theme';
import { findAlternates } from './exerciseSimilarity';

// Wrap a Supabase library exercise into the shape expected by the rest of
// ClientPortal (EX dict shape: { t, vid, q }).
export function libExerciseToEx(libEx) {
  return {
    t: libEx?.title || '',
    vid: libEx?.videoLink || '',
    q: libEx?.cues || '',
  };
}

export default function ExerciseSubstitution({ currentTitle, currentEx, library, onPick, onClose }) {
  // currentEx is the EX-shape entry; currentTitle is its title. We only need
  // the title to score against the library (since everything else is empty
  // for now until the library is classified).
  const target = { id: '__current__', title: currentTitle };
  const alternates = findAlternates(target, library || [], 5);

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16, zIndex: 1000,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: C.bg, border: `1px solid ${C.bd2}`, borderRadius: 16,
        maxWidth: 480, width: '100%', maxHeight: '90vh', overflowY: 'auto',
        padding: 20,
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          marginBottom: 14,
        }}>
          <div>
            <div style={{ fontFamily: FN, fontSize: 10, color: C.ac, letterSpacing: 2, fontWeight: 700, marginBottom: 4 }}>
              SWAP EXERCISE
            </div>
            <div style={{ fontFamily: FB, fontSize: 14, color: C.tm, lineHeight: 1.4 }}>
              Replace <span style={{ color: C.tx, fontWeight: 700 }}>{currentTitle}</span> with one of these:
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{
            background: 'transparent', border: 'none', color: C.tm,
            fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: 4,
          }}>×</button>
        </div>

        {alternates.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center', color: C.td, fontFamily: FN, fontSize: 12 }}>
            No close alternates found in the library.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {alternates.map(({ exercise, score }) => (
            <button key={exercise.id} onClick={() => { onPick(exercise); onClose(); }} style={{
              textAlign: 'left', background: C.sf, border: `1px solid ${C.bd}`,
              borderRadius: 10, padding: '12px 14px', cursor: 'pointer',
              fontFamily: FB, color: C.tx, fontSize: 14, fontWeight: 600,
              transition: 'border-color 120ms, background 120ms',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = C.ac; e.currentTarget.style.background = C.acD; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = C.bd; e.currentTarget.style.background = C.sf; }}>
              <div>{exercise.title}</div>
              {(exercise.movementPattern || exercise.resistanceType) && (
                <div style={{ marginTop: 4, fontFamily: FN, fontSize: 10, color: C.tm, letterSpacing: 1, fontWeight: 400 }}>
                  {[exercise.movementPattern, exercise.resistanceType].filter(Boolean).join(' · ')}
                </div>
              )}
            </button>
          ))}
        </div>

        <div style={{
          marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.bd}`,
          fontFamily: FN, fontSize: 10, color: C.td, letterSpacing: 0.8, textAlign: 'center',
        }}>
          The prescribed plan stays intact — this is just for today's session.
        </div>
      </div>
    </div>
  );
}
