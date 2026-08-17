// ExerciseSubstitution: bottom-sheet picker for swapping a prescribed exercise
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

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { C, FN, FB } from './theme';
import { findAlternates } from './exerciseSimilarity';

// F-25 — equipment chips the trainee can toggle on/off. Only alternates
// matching at least one selected chip will surface. The TRAVELING
// preset auto-selects bodyweight + band (anything you can do in a
// hotel room without weights).
const EQUIP_CHIPS = [
  { id: 'BODYWEIGHT', label: 'BW' },
  { id: 'BAND', label: 'BAND' },
  { id: 'DUMBBELL', label: 'DB' },
  { id: 'KETTLEBELL', label: 'KB' },
  { id: 'CABLE', label: 'CABLE' },
  { id: 'BARBELL', label: 'BB' },
  { id: 'MACHINE', label: 'MACHINE' },
];
const TRAVELING_EQUIP = new Set(['BODYWEIGHT', 'BAND']);

// Wrap a Supabase library exercise into the shape expected by the rest of
// ClientPortal (EX dict shape: { t, vid, q }).
export function libExerciseToEx(libEx) {
  return {
    t: libEx?.title || '',
    vid: libEx?.videoLink || '',
    q: libEx?.cues || '',
  };
}

// Pull a single equipment hint from a title for display on the alternate
// row (DUMBBELL / CABLE / MACHINE / BARBELL / BANDED / ...). Lower-case
// scan, returns the first hit. Pure UI hint — doesn't drive the score.
function equipmentHintFor(title) {
  const t = (title || '').toLowerCase();
  const map = [
    ['barbell', 'BARBELL'], ['bb ', 'BARBELL'], [' bb', 'BARBELL'],
    ['dumbbell', 'DUMBBELL'], ['db ', 'DUMBBELL'], [' db', 'DUMBBELL'],
    ['kettlebell', 'KETTLEBELL'], ['kb ', 'KETTLEBELL'], [' kb', 'KETTLEBELL'],
    ['cable', 'CABLE'], ['machine', 'MACHINE'], ['smith', 'SMITH'],
    ['banded', 'BAND'], ['band', 'BAND'],
    ['bodyweight', 'BODYWEIGHT'], ['bw ', 'BODYWEIGHT'],
    ['trx', 'TRX'], ['ring', 'RINGS'], ['sled', 'SLED'],
  ];
  for (const [needle, label] of map) if (t.includes(needle)) return label;
  return null;
}

export default function ExerciseSubstitution({ currentTitle, currentEx, library, onPick, onClose }) {
  // Esc closes the sheet. Mounted only while open so the listener is auto
  // cleaned up when the parent unmounts (swapOpenForEid → null).
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // F-25 — equipment filter chips + TRAVELING toggle. State is local so
  // the sheet remembers selection while open but resets on next open
  // (a different exercise often has a different "what's reasonable" set).
  const [traveling, setTraveling] = useState(false);
  const [activeEquip, setActiveEquip] = useState(() => new Set());
  const toggleEquip = (id) => setActiveEquip(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleTraveling = () => {
    if (traveling) { setTraveling(false); setActiveEquip(new Set()); }
    else { setTraveling(true); setActiveEquip(new Set(TRAVELING_EQUIP)); }
  };

  const target = { id: '__current__', title: currentTitle };
  // Pull a wider candidate pool so equipment filtering still leaves us
  // with at least 5 useful options once narrowed.
  const allAlternates = useMemo(() => findAlternates(target, library || [], 24), [library, currentTitle]);
  const alternates = useMemo(() => {
    if (activeEquip.size === 0) return allAlternates.slice(0, 5);
    const filtered = allAlternates.filter(({ exercise }) => {
      const eq = equipmentHintFor(exercise.title);
      return eq && activeEquip.has(eq);
    });
    // Equipment filtering can dry up — fall back to showing the top
    // unfiltered alternates as a hint of "nothing matches your filter".
    return filtered.length ? filtered.slice(0, 5) : [];
  }, [allAlternates, activeEquip]);
  const targetEquip = equipmentHintFor(currentTitle);

  return createPortal((
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: C.scrim,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      zIndex: 1000, animation: 'fv-fade-in 180ms ease',
    }}>
      <style>{`
        @keyframes fv-fade-in { from { opacity: 0 } to { opacity: 1 } }
        @keyframes fv-slide-up { from { transform: translateY(24px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
      `}</style>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: C.sf, border: `1px solid ${C.bd}`, borderTop: `1px solid ${C.ac}`,
        borderTopLeftRadius: 0, borderTopRightRadius: 0,
        width: '100%', maxWidth: 520, maxHeight: '88vh', overflowY: 'auto',
        padding: '14px 16px 22px',
        animation: 'fv-slide-up 220ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        boxShadow: `0 -24px 64px -24px rgba(57,189,255,0.251)`,
      }}>
        {/* Pull-tab + title row */}
        <div style={{
          width: 40, height: 2, borderRadius: 0, background: `${C.cardBd}`,
          margin: '0 auto 14px',
        }} />
        <div style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          gap: 12, marginBottom: 4,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: FN, fontSize: 9, color: C.ac, letterSpacing: '0.18em', fontWeight: 700,
              marginBottom: 4,
            }}>
              FIND AN ALTERNATE
            </div>
            <div style={{
              fontFamily: FB, fontSize: 13, color: C.tm, lineHeight: 1.4,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }} title={currentTitle}>
              instead of <span style={{ color: C.tx, fontWeight: 700 }}>{currentTitle}</span>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{
            background: 'transparent', border: 'none', color: C.tm,
            fontSize: 24, cursor: 'pointer', lineHeight: 1, padding: '0 4px',
            flex: '0 0 auto',
          }}>×</button>
        </div>

        <div style={{ height: 1, background: `${C.cardBd}`, margin: '12px -16px 14px' }} />

        {/* F-25 — equipment filter row. Trainees pick what's actually
            available right now; the alternate list updates live. The
            TRAVELING preset is a one-tap shortcut for hotel-room workouts. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          <button onClick={toggleTraveling} style={{
            padding: '4px 10px', borderRadius: 0,
            background: traveling ? C.ac : 'transparent',
            color: traveling ? '#FFFFFF' : C.ac,
            border: `1px solid ${C.ac}`,
            fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
            cursor: 'pointer',
            minWidth: 120, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}>{traveling ? '✓ TRAVELING' : '✈ TRAVELING'}</button>
          <span style={{ fontFamily: FN, fontSize: 9, color: C.td, letterSpacing: '0.12em', fontWeight: 700, marginLeft: 4 }}>HAVE:</span>
          {EQUIP_CHIPS.map(chip => {
            const active = activeEquip.has(chip.id);
            return (
              <button key={chip.id} onClick={() => toggleEquip(chip.id)} style={{
                padding: '4px 8px', borderRadius: 0,
                background: active ? 'rgba(57,189,255,0.094)' : 'transparent',
                color: active ? C.ac : C.tm,
                border: `1px solid ${active ? C.ac : C.cardBd}`,
                fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
                cursor: 'pointer',
              }}>{chip.label}</button>
            );
          })}
        </div>

        {alternates.length === 0 && (
          <div style={{ padding: '36px 20px', textAlign: 'center' }}>
            <div style={{ fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: '0.18em', fontWeight: 700, marginBottom: 6 }}>
              {activeEquip.size > 0 ? 'NO MATCHES FOR YOUR EQUIPMENT' : 'NO CLOSE MATCHES'}
            </div>
            <div style={{ fontFamily: FB, fontSize: 13, color: C.tm, lineHeight: 1.5 }}>
              {activeEquip.size > 0
                ? 'Try selecting more equipment chips above, or clear the filter to see all alternates.'
                : "The library doesn't have an obvious alternate for this exercise. Stick with the prescribed one or skip the set."}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {alternates.map(({ exercise, score }, i) => {
            const eq = equipmentHintFor(exercise.title);
            const eqDifferent = eq && targetEquip && eq !== targetEquip;
            return (
              <button key={exercise.id} onClick={() => { onPick(exercise); onClose(); }} style={{
                textAlign: 'left', background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`,
                borderRadius: 0, padding: '12px 14px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 10,
                transition: 'border-color 120ms, background 120ms, transform 120ms',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = C.ac;
                e.currentTarget.style.transform = 'translateX(2px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = `${C.cardBd}`;
                e.currentTarget.style.transform = 'translateX(0)';
              }}>
                {/* Rank index */}
                <div style={{
                  flex: '0 0 auto', width: 24, height: 24, borderRadius: 0,
                  background: 'var(--c-sf)', border: `1px solid ${C.ac}`, color: C.ac,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: FN, fontSize: 11, fontWeight: 700,
                }}>
                  {i + 1}
                </div>
                {/* Title + equipment hint */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: FB, fontSize: 14, fontWeight: 600, color: C.tx, lineHeight: 1.3,
                  }}>{exercise.title}</div>
                  {eq && (
                    <div style={{
                      marginTop: 4, fontFamily: FN, fontSize: 9, letterSpacing: '0.18em', fontWeight: 700,
                      color: eqDifferent ? C.ac : C.tm,
                    }}>
                      {eqDifferent && '⇄ '}{eq}
                    </div>
                  )}
                </div>
                {/* Tap-to-pick affordance */}
                <div style={{
                  flex: '0 0 auto', color: C.td, fontSize: 18,
                }}>›</div>
              </button>
            );
          })}
        </div>

        <div style={{
          marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.cardBd}`,
          fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: '0.18em', textAlign: 'center',
        }}>
          Just for today's session — the prescribed plan stays intact.
        </div>
      </div>
    </div>
  ), document.body);
}
