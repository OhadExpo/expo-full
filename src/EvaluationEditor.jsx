// Coach-administered editor for one Athletic Evaluation. Mirrors the
// ATH EVAL.xlsx layout: section headers + per-test input rows + Passive
// ROM grid at the bottom. Values are free text (the xlsx accepts "R-4",
// "SLDL: 4" etc. — we don't over-validate).
//
// Mounted as a modal from TraineeEvaluation. Saves to trainee_evaluations
// via the hook in evaluationsData.js. eval_id is null for create, set for
// edit-in-place.

import React, { useState, useMemo, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { C, FN, FB } from './theme';
import { isRefined5b, useEscClose, useIsMobile, toast } from './ui';
import { EVAL_SCHEMA, romKey } from './evaluationSchema';
import { toolForTest } from './evalTestMap';

// Camera tools pull MediaPipe/three — lazy so opening an eval doesn't carry them
// until the coach actually runs a test.
const MovementLab = lazy(() => import('./MovementLab'));
// Hold timer is light (no MediaPipe) but lazy-loaded for symmetry with the
// other embedded test tools.
const HoldTimer = lazy(() => import('./HoldTimer'));

const inputBase = {
  background: 'var(--c-sf)', border: `1px solid var(--c-cardBd)`, borderRadius: 0,
  padding: '7px 8px', color: 'var(--c-tx)', fontFamily: FN, fontSize: 12,
  outline: 'none', boxSizing: 'border-box', minWidth: 0, textAlign: 'center',
};

// One test row mirrors the ATH EVAL.xlsx layout: # · NAME · GOAL · SCORE.
// Score column adapts to test shape (simple / sided / composite / sided
// composite) but stays inside its column — never overflows the card.
// A small "TEST" affordance next to a measurable row. Sided tests offer L/R;
// not-yet-built tools show a disabled "soon" chip so the eval reveals the
// intended camera coverage without pretending it works.
function TestButtons({ test, onTest }) {
  const map = toolForTest(test.id);
  if (!map) return null;
  const soon = map.status === 'soon';
  const base = {
    fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
    padding: '3px 8px', borderRadius: 0, cursor: soon ? 'default' : 'pointer',
    border: `1px solid ${soon ? 'var(--c-cardBd)' : 'var(--c-ac)'}`,
    background: 'transparent', color: soon ? 'var(--c-td)' : 'var(--c-ac)',
    opacity: soon ? 0.6 : 1,
  };
  if (soon) return <div style={{ marginTop: 5 }}><span style={base}>◉ TEST · soon</span></div>;
  const sides = map.side ? ['L', 'R'] : [null];
  return (
    <div style={{ marginTop: 5, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {sides.map(s => (
        <button key={s || 'x'} type="button" onClick={() => onTest(test, map, s)} style={base}>
          ◉ TEST{s ? ` · ${s}` : ''}
        </button>
      ))}
    </div>
  );
}

function TestRow({ index, test, value, onChange, onTest }) {
  const isComposite = Array.isArray(test.composite);
  const hasSides = Array.isArray(test.sides);
  const isMobile = useIsMobile();

  const setSimple = (v) => onChange(v);
  const setSide = (side, v) => onChange({ ...(typeof value === 'object' ? value : {}), [side]: v });
  const setComposite = (partId, v) => onChange({ ...(typeof value === 'object' ? value : {}), [partId]: v });
  const setSideComposite = (side, partId, v) => {
    const cur = typeof value === 'object' && value ? value : {};
    const sideCur = typeof cur[side] === 'object' && cur[side] ? cur[side] : {};
    onChange({ ...cur, [side]: { ...sideCur, [partId]: v } });
  };

  const labelStyle = {
    fontFamily: FN, fontSize: 9, color: 'var(--c-tm)',
    letterSpacing: '0.1em', fontWeight: 700, marginBottom: 3,
  };

  return (
    <div className="eval-row" style={{
      display: 'grid',
      gridTemplateColumns: isMobile ? '16px minmax(0,1.5fr) 42px minmax(0,1.3fr)' : '22px minmax(150px, 1.4fr) 84px minmax(150px, 1.1fr)',
      gap: isMobile ? 6 : 10, padding: '7px 0', alignItems: 'center',
      borderBottom: `1px solid var(--c-cardBd)`,
    }}>
      <div style={{ fontFamily: FN, fontSize: 11, color: 'var(--c-td)', fontWeight: 700 }}>{index}</div>
      <div>
        <div style={{ fontSize: 13, color: 'var(--c-tx)', fontWeight: 600, lineHeight: 1.3 }}>{test.label}</div>
        <TestButtons test={test} onTest={onTest} />
      </div>
      <div style={{ fontFamily: FN, fontSize: 10, color: 'var(--c-tm)', letterSpacing: '0.04em', lineHeight: 1.3 }}>{test.goal || '—'}</div>
      <div style={{ minWidth: 0 }}>
        {/* simple — capped width so a lone number doesn't float in a huge box */}
        {!hasSides && !isComposite && (
          <input value={value || ''} onChange={e => setSimple(e.target.value)}
            placeholder={test.unit || ''} style={{ ...inputBase, width: '100%', maxWidth: 120 }} />
        )}
        {/* sided, non-composite — two stacked rows on narrow, side-by-side on wide */}
        {hasSides && !isComposite && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6 }}>
            {test.sides.map(s => (
              <div key={s}>
                <div style={labelStyle}>{s} · {test.unit || ''}</div>
                <input value={(typeof value === 'object' && value?.[s]) || ''}
                  onChange={e => setSide(s, e.target.value)}
                  placeholder={test.unit || ''} style={{ ...inputBase, width: '100%' }} />
              </div>
            ))}
          </div>
        )}
        {/* non-sided composite — sub-fields stacked vertically with labels */}
        {!hasSides && isComposite && (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${test.composite.length}, minmax(0, 1fr))`, gap: 6 }}>
            {test.composite.map(part => (
              <div key={part.id}>
                <div style={labelStyle}>
                  {part.label}{part.unit ? ` · ${part.unit}` : ''}
                </div>
                <input value={(typeof value === 'object' && value?.[part.id]) || ''}
                  onChange={e => setComposite(part.id, e.target.value)}
                  style={{ ...inputBase, width: '100%' }} />
              </div>
            ))}
          </div>
        )}
        {/* sided composite — side header + composite sub-fields per side */}
        {hasSides && isComposite && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
            {test.sides.map(s => (
              <div key={s} style={{ minWidth: 0 }}>
                <div style={{ ...labelStyle, color: 'var(--c-ac)', fontSize: 10, marginBottom: 4 }}>{s}</div>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${test.composite.length}, minmax(0, 1fr))`, gap: 4 }}>
                  {test.composite.map(part => (
                    <div key={part.id} style={{ minWidth: 0 }}>
                      <div style={{ ...labelStyle, fontSize: 8, marginBottom: 2 }}>
                        {part.label}{part.unit ? `·${part.unit}` : ''}
                      </div>
                      <input value={(typeof value?.[s] === 'object' && value[s]?.[part.id]) || ''}
                        onChange={e => setSideComposite(s, part.id, e.target.value)}
                        style={{ ...inputBase, width: '100%', padding: '6px 8px', fontSize: 11 }} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// 1-3 score is semantic: 1 poor (red) · 2 moderate (orange) · 3 good (green).
const SCORE_COLORS = { 1: 'var(--c-rd)', 2: 'var(--c-or)', 3: 'var(--c-gn)' };
const isScore = (v) => v === 1 || v === 2 || v === 3;

// Tap group for one 1-3 score. Selected fills solid in its color; the rest sit
// as faint outlines so an unscored row reads calm. Tapping the active number
// clears it. Legacy free-text (e.g. "4", "R-4") shows as a faint `was:` hint.
function ScoreButtons({ value, onChange }) {
  const sel = isScore(value) ? value : null;
  const legacy = (value != null && value !== '' && !isScore(value)) ? String(value) : null;
  return (
    <div>
      <div style={{ display: 'flex', gap: 5 }}>
        {[1, 2, 3].map(n => {
          const on = sel === n;
          const col = SCORE_COLORS[n];
          return (
            <button key={n} type="button" onClick={() => onChange(on ? null : n)}
              style={{
                width: 32, height: 32, borderRadius: 0, cursor: 'pointer',
                fontFamily: FN, fontSize: 14, fontWeight: 800,
                border: `1px solid ${col}`, background: on ? col : 'transparent',
                color: on ? '#000000' : col, opacity: on ? 1 : 0.45,
                transition: 'opacity 120ms ease, background 120ms ease',
              }}>{n}</button>
          );
        })}
      </div>
      {legacy && (
        <div style={{ fontFamily: FN, fontSize: 9, color: 'var(--c-td)', marginTop: 3 }}>was: {legacy}</div>
      )}
    </div>
  );
}

// Movements row — qualitative scoring. Three zones: TEST+goal · WATCH (the
// parameters to observe, from the ATH EVAL sheet) · SCORE (1-3 tap, per side
// for sided moves) + a collapsible per-exercise note.
function MovementRow({ index, test, value, note, onScore, onNote }) {
  const hasSides = Array.isArray(test.sides);
  const isMobile = useIsMobile();
  const [noteOpen, setNoteOpen] = useState(!!note);
  const setSide = (side, v) => onScore({ ...(typeof value === 'object' && value ? value : {}), [side]: v });

  return (
    <div style={{ borderBottom: `1px solid var(--c-cardBd)` }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '16px minmax(0,1.3fr) minmax(0,1.5fr) minmax(0,1.4fr)' : '24px minmax(140px, 1.1fr) minmax(190px, 1.7fr) 130px',
        gap: isMobile ? 6 : 12, padding: '12px 0', alignItems: 'start',
      }}>
        <div style={{ fontFamily: FN, fontSize: 11, color: 'var(--c-td)', fontWeight: 700, paddingTop: 6 }}>{index}</div>
        <div style={{ paddingTop: 4 }}>
          <div style={{ fontSize: 13, color: 'var(--c-tx)', fontWeight: 600, lineHeight: 1.3 }}>{test.label}</div>
          {test.goal && <div style={{ fontFamily: FN, fontSize: 10, color: 'var(--c-tm)', letterSpacing: '0.04em', marginTop: 2 }}>{test.goal}</div>}
        </div>
        {/* WATCH — parameters, one per line, muted reference */}
        <div style={{ paddingTop: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {(test.params || []).map((p, i) => (
            <div key={i} style={{ fontFamily: FB, fontSize: 11, color: 'var(--c-tm)', lineHeight: 1.3, display: 'flex', gap: 6 }}>
              <span style={{ color: 'var(--c-ac)', flexShrink: 0 }}>·</span><span>{p}</span>
            </div>
          ))}
        </div>
        {/* SCORE — 1-3 tap. Every line is [side-label · buttons], right-aligned,
            with a fixed-width label slot (blank on bilateral) so the button
            columns line up across sided and bilateral rows alike. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
          {(hasSides ? test.sides : [null]).map((s, i) => (
            <div key={s || i} style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
              <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, color: 'var(--c-ac)', width: 12, textAlign: 'right' }}>{s || ''}</span>
              <ScoreButtons
                value={s ? (typeof value === 'object' && value ? value[s] : undefined) : value}
                onChange={v => (s ? setSide(s, v) : onScore(v))} />
            </div>
          ))}
          <button type="button" onClick={() => setNoteOpen(o => !o)}
            title={note ? 'Edit note' : 'Add note'}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 0',
              fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
              color: note ? 'var(--c-ac)' : 'var(--c-td)',
            }}>{note ? 'NOTE' : 'NOTE +'}</button>
        </div>
      </div>
      {noteOpen && (
        <div style={{ padding: '0 0 12px 36px' }}>
          <input value={note || ''} onChange={e => onNote(e.target.value)} dir="auto"
            placeholder={`Note · ${test.label}`}
            style={{ ...inputBase, width: '100%', maxWidth: 520 }} />
        </div>
      )}
    </div>
  );
}

function SectionBlock({ section, scores, setScore, notes, setNote, onTest }) {
  const isMovements = section.id === 'movements';
  const isMobile = useIsMobile();
  return (
    <div style={{
      marginBottom: 22,
      background: 'var(--c-sf)',
      padding: '14px 16px',
    }}>
      <div style={{
        fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.2em',
        color: 'var(--c-ac)', marginBottom: 8, paddingBottom: 6,
        borderBottom: `2px solid var(--c-ac)`,
      }}>{section.title.toUpperCase()}</div>
      {section.hint && (
        <div style={{ fontFamily: FB, fontSize: 11, color: 'var(--c-tm)', marginBottom: 8, fontStyle: 'italic' }}>
          {section.hint}
        </div>
      )}
      {/* Column headers — template matches the row variant so they align */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMovements
          ? (isMobile ? '16px minmax(0,1.3fr) minmax(0,1.5fr) minmax(0,1.4fr)' : '24px minmax(140px, 1.1fr) minmax(190px, 1.7fr) 130px')
          : (isMobile ? '16px minmax(0,1.5fr) 42px minmax(0,1.3fr)' : '22px minmax(150px, 1.4fr) 84px minmax(150px, 1.1fr)'),
        gap: isMovements ? (isMobile ? 6 : 12) : (isMobile ? 6 : 10), padding: '4px 0 6px',
        borderBottom: `1px solid var(--c-cardBd)`,
      }}>
        {['#', 'TEST', isMovements ? 'WATCH' : 'GOAL', 'SCORE'].map((h, i) => (
          <div key={i} style={{ fontFamily: FN, fontSize: 9, color: 'var(--c-td)', letterSpacing: '0.1em', fontWeight: 700 }}>{h}</div>
        ))}
      </div>
      {isMovements
        ? section.tests.map((t, i) => (
            <MovementRow key={t.id} index={i + 1} test={t} value={scores[t.id]}
              note={notes?.[t.id]} onScore={v => setScore(t.id, v)} onNote={v => setNote(t.id, v)} />
          ))
        : section.tests.map((t, i) => (
            <TestRow key={t.id} index={i + 1} test={t} value={scores[t.id]}
              onChange={v => setScore(t.id, v)} onTest={onTest} />
          ))}
    </div>
  );
}

function RomBlock({ rom, setRom }) {
  const set = (key, v) => setRom({ ...rom, [key]: v });
  return (
    <div style={{ marginBottom: 22, background: 'var(--c-sf)', padding: '14px 16px' }}>
      <div style={{
        fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.2em',
        color: 'var(--c-ac)', marginBottom: 6, paddingBottom: 6,
        borderBottom: `2px solid var(--c-ac)`,
      }}>{EVAL_SCHEMA.rom.title.toUpperCase()}</div>
      <div style={{ fontFamily: FB, fontSize: 11, color: 'var(--c-tm)', marginBottom: 14, fontStyle: 'italic' }}>
        {EVAL_SCHEMA.rom.hint}
      </div>
      {EVAL_SCHEMA.rom.joints.map((j, ji) => (
        <div key={j.id} style={{
          display: 'grid',
          gridTemplateColumns: '120px 1fr',
          gap: 14, padding: '10px 0', alignItems: 'start',
          borderBottom: ji < EVAL_SCHEMA.rom.joints.length - 1 ? `1px solid var(--c-cardBd)` : 'none',
        }}>
          <div style={{ fontFamily: FN, fontSize: 12, color: 'var(--c-tx)', fontWeight: 700, letterSpacing: '0.04em' }}>
            {j.label}
          </div>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(168px, 1fr))', gap: 8,
            minWidth: 0,
          }}>
            {j.axes.map(ax => {
              const k = romKey(j.id, ax);
              return (
                <div key={ax} style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  {/* Wrap, don't ellipsis — "Internal/External Rotation" must show
                      in full even in the narrow ROM column. */}
                  <div style={{ flex: 1, fontFamily: FB, fontSize: 11, color: 'var(--c-tm)', lineHeight: 1.2 }}>{ax}</div>
                  <input value={rom[k] || ''} onChange={e => set(k, e.target.value)}
                    placeholder="°" style={{ ...inputBase, width: 56, padding: '6px 8px', textAlign: 'center' }} />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function EvaluationEditor({ trainee, existing, onSave, onClose }) {
  const isMobile = useIsMobile();
  const [evalDate, setEvalDate] = useState(existing?.eval_date || new Date().toISOString().slice(0, 10));
  const [evalTime, setEvalTime] = useState(existing?.eval_time || '');
  const [age, setAge] = useState(existing?.age ?? trainee?.age ?? '');
  const [heightCm, setHeightCm] = useState(existing?.height_cm ?? trainee?.height ?? '');
  const [weightKg, setWeightKg] = useState(existing?.weight_kg ?? trainee?.weight ?? '');
  // Per-exercise notes live under a reserved `__notes` key inside the scores
  // JSONB. Split it out of the live scores state so the score-render loops and
  // countFilled (which iterate schema test ids) never see it; re-merge on save.
  const [scores, setScores] = useState(() => {
    const { __notes, ...rest } = existing?.scores || {};
    return rest;
  });
  const [exNotes, setExNotes] = useState(() => existing?.scores?.__notes || {});
  const [rom, setRom] = useState(existing?.rom || {});
  useEscClose(true, onClose); // Escape closes the editor (matches scrim-click)
  const [notes, setNotes] = useState(existing?.notes || '');

  const setExNote = (testId, v) => {
    setExNotes(prev => {
      const next = { ...prev };
      if (!v) delete next[testId]; else next[testId] = v;
      return next;
    });
  };

  const setScore = (testId, value) => {
    setScores(prev => {
      const next = { ...prev };
      if (value == null || value === '' ||
          (typeof value === 'object' && Object.values(value).every(v => v == null || v === ''))) {
        delete next[testId];
      } else {
        next[testId] = value;
      }
      return next;
    });
  };

  // Embedded camera test: open the matching tool for a row, write its measured
  // value straight into that test's field, verify-then-continue. This is the
  // "run the protocol inside the eval" flow — no separate eval row, no retyping.
  const [activeTest, setActiveTest] = useState(null); // { test, map, side }
  const onTest = (test, map, side) => setActiveTest({ test, map, side });
  // Tool-agnostic: `raw` is whatever the active tool hands back (jump metrics
  // object, or hold seconds). map.toValue folds it into the field shape; for a
  // composite test that's an object keyed by part id, which slots straight into
  // the simple / sided / composite / sided-composite storage below.
  const writeTestResult = (raw) => {
    if (!activeTest) return;
    const { test, map, side } = activeTest;
    const v = map.toValue(raw);
    if (side) {
      const cur = (typeof scores[test.id] === 'object' && scores[test.id]) ? scores[test.id] : {};
      setScore(test.id, { ...cur, [side]: v });
    } else {
      setScore(test.id, v);
    }
    const shown = typeof v === 'object' ? Object.entries(v).map(([k, val]) => `${k}:${val}`).join(' · ') : v;
    toast(`Logged ${shown} to ${test.label}${side ? ` · ${side}` : ''}`, 'success', { ttl: 3500 });
    setActiveTest(null);
  };

  const save = async () => {
    const scoresOut = Object.keys(exNotes).length ? { ...scores, __notes: exNotes } : scores;
    await onSave({
      eval_date: evalDate, eval_time: evalTime || null,
      age, height_cm: heightCm, weight_kg: weightKg,
      scores: scoresOut, rom, notes: notes || null,
    });
    onClose();
  };

  return (
    <>
    {createPortal((<div onClick={onClose} role="dialog" aria-modal="true" aria-label="Athletic evaluation" style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 300,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: isMobile ? '16px 8px' : '40px 16px',
      overflowY: 'auto',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: isRefined5b() ? '#FFFFFF' : 'var(--c-bg)',
        border: `1px solid var(--c-ac)`, borderRadius: 0,
        padding: isMobile ? 14 : 24, maxWidth: 880, width: '100%',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontFamily: FN, fontSize: 18, color: 'var(--c-tx)', letterSpacing: '0.04em' }}>
            ATHLETIC EVALUATION · {trainee?.name || ''}
          </h2>
          <button onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'var(--c-tm)', cursor: 'pointer', fontSize: 18 }}>✕</button>
        </div>

        {/* Meta header — date / time / age / height / weight */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8, marginBottom: 18 }}>
          <div>
            <div style={{ fontFamily: FN, fontSize: 9, color: 'var(--c-tm)', letterSpacing: '0.18em', fontWeight: 700, marginBottom: 4 }}>DATE</div>
            {/* dd/mm/yyyy overlay (native date renders the browser locale = MM/DD/YYYY
                on Ohad's en-US machine). Transparent native input + centered span. */}
            <div style={{ position: 'relative', display: 'flex' }}>
              <input type="date" value={evalDate} onChange={e => setEvalDate(e.target.value)}
                onClick={e => { try { e.currentTarget.showPicker(); } catch { /* noop */ } }}
                style={{ ...inputBase, width: '100%', color: 'transparent', cursor: 'pointer' }} />
              <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', fontFamily: FN, fontSize: 12, color: 'var(--c-tx)', opacity: evalDate ? 1 : 0.45 }}>{evalDate ? evalDate.split('-').reverse().join('/') : 'DD/MM/YYYY'}</span>
            </div>
          </div>
          <div>
            <div style={{ fontFamily: FN, fontSize: 9, color: 'var(--c-tm)', letterSpacing: '0.18em', fontWeight: 700, marginBottom: 4 }}>TIME</div>
            <input type="time" value={evalTime} onChange={e => setEvalTime(e.target.value)} style={{ ...inputBase, width: '100%' }} />
          </div>
          <div>
            <div style={{ fontFamily: FN, fontSize: 9, color: 'var(--c-tm)', letterSpacing: '0.18em', fontWeight: 700, marginBottom: 4 }}>AGE</div>
            <input type="number" value={age} onChange={e => setAge(e.target.value)} style={{ ...inputBase, width: '100%' }} />
          </div>
          <div>
            <div style={{ fontFamily: FN, fontSize: 9, color: 'var(--c-tm)', letterSpacing: '0.18em', fontWeight: 700, marginBottom: 4 }}>HEIGHT (cm)</div>
            <input type="number" value={heightCm} onChange={e => setHeightCm(e.target.value)} style={{ ...inputBase, width: '100%' }} />
          </div>
          <div>
            <div style={{ fontFamily: FN, fontSize: 9, color: 'var(--c-tm)', letterSpacing: '0.18em', fontWeight: 700, marginBottom: 4 }}>WEIGHT (kg)</div>
            <input type="number" step="0.1" value={weightKg} onChange={e => setWeightKg(e.target.value)} style={{ ...inputBase, width: '100%' }} />
          </div>
        </div>

        {EVAL_SCHEMA.sections.map(s => (
          <SectionBlock key={s.id} section={s} scores={scores} setScore={setScore}
            notes={exNotes} setNote={setExNote} onTest={onTest} />
        ))}

        <RomBlock rom={rom} setRom={setRom} />

        {/* Free notes */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontFamily: FN, fontSize: 9, color: 'var(--c-tm)', letterSpacing: '0.18em', fontWeight: 700, marginBottom: 4 }}>NOTES</div>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} dir="auto"
            placeholder="Coach observations · red flags · session-context"
            style={{ ...inputBase, width: '100%', resize: 'vertical' }} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose}
            style={{ padding: '10px 18px', borderRadius: 0, border: `1px solid var(--c-cardBd)`,
              background: 'transparent', color: 'var(--c-tm)', fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer' }}>CANCEL</button>
          <button onClick={save}
            style={{ padding: '10px 18px', borderRadius: 0, border: `1px solid var(--c-ac)`,
              background: 'transparent', color: 'var(--c-ac)', fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer' }}>
            {existing ? 'SAVE CHANGES' : 'SAVE EVALUATION'}
          </button>
        </div>
      </div>
    </div>), document.body)}

    {/* Embedded camera test overlay — fullscreen, stacks over the eval modal.
        On SAVE it writes the measured value into the row and closes. */}
    {activeTest && activeTest.map.tool === 'jump' && (
      <Suspense fallback={null}>
        <MovementLab
          initialMode="jump"
          jumpType={activeTest.map.jumpType || 'cmj'}
          exerciseTitle={`${activeTest.map.label}${activeTest.side ? ` · ${activeTest.side}` : ''}`}
          toolLabel={String(activeTest.map.label).toUpperCase()}
          defaultBodyweightKg={parseFloat(weightKg) || null}
          onSaveJump={writeTestResult}
          onClose={() => setActiveTest(null)}
        />
      </Suspense>
    )}
    {/* Embedded hold-to-failure timer for the isometric tests. */}
    {activeTest && activeTest.map.tool === 'hold' && (
      <Suspense fallback={null}>
        <HoldTimer
          title={String(activeTest.map.label).toUpperCase()}
          side={activeTest.side}
          goal={activeTest.map.goal || activeTest.test.goal}
          onSave={writeTestResult}
          onClose={() => setActiveTest(null)}
        />
      </Suspense>
    )}
    </>
  );
}
