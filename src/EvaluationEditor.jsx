// Coach-administered editor for one Athletic Evaluation. Mirrors the
// ATH EVAL.xlsx layout: section headers + per-test input rows + Passive
// ROM grid at the bottom. Values are free text (the xlsx accepts "R-4",
// "SLDL: 4" etc. — we don't over-validate).
//
// Mounted as a modal from TraineeEvaluation. Saves to trainee_evaluations
// via the hook in evaluationsData.js. eval_id is null for create, set for
// edit-in-place.

import React, { useState, useMemo } from 'react';
import { C, FN, FB } from './theme';
import { isRefined5b } from './ui';
import { EVAL_SCHEMA, romKey } from './evaluationSchema';

const inputBase = {
  background: 'var(--c-sf)', border: `1px solid var(--c-cardBd)`, borderRadius: 0,
  padding: '6px 8px', color: 'var(--c-tx)', fontFamily: FN, fontSize: 12,
  outline: 'none', boxSizing: 'border-box',
};

function TestRow({ test, value, onChange }) {
  const isComposite = Array.isArray(test.composite);
  const hasSides = Array.isArray(test.sides);

  // Cell shape:
  //   simple test           → value is string
  //   sided test            → value is { L, R }
  //   composite test        → value is { [partId]: string }
  //   sided composite test  → value is { L: {...}, R: {...} }

  const setSimple = (v) => onChange(v);
  const setSide = (side, v) => onChange({ ...(typeof value === 'object' ? value : {}), [side]: v });
  const setComposite = (partId, v) => onChange({ ...(typeof value === 'object' ? value : {}), [partId]: v });
  const setSideComposite = (side, partId, v) => {
    const cur = typeof value === 'object' && value ? value : {};
    const sideCur = typeof cur[side] === 'object' && cur[side] ? cur[side] : {};
    onChange({ ...cur, [side]: { ...sideCur, [partId]: v } });
  };

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '180px 110px 1fr',
      gap: 8, padding: '6px 0', alignItems: 'start',
      borderBottom: `1px solid var(--c-cardBd)`,
    }}>
      <div style={{ fontSize: 12, color: 'var(--c-tx)', fontWeight: 600 }}>{test.label}</div>
      <div style={{ fontFamily: FN, fontSize: 10, color: 'var(--c-tm)', letterSpacing: '0.06em' }}>{test.goal || '—'}</div>
      <div>
        {/* simple */}
        {!hasSides && !isComposite && (
          <input value={value || ''} onChange={e => setSimple(e.target.value)}
            placeholder={test.unit || ''} style={{ ...inputBase, width: '100%' }} />
        )}
        {/* sided, non-composite */}
        {hasSides && !isComposite && (
          <div style={{ display: 'flex', gap: 6 }}>
            {test.sides.map(s => (
              <div key={s} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontFamily: FN, fontSize: 10, color: 'var(--c-tm)', width: 12 }}>{s}</span>
                <input value={(typeof value === 'object' && value?.[s]) || ''}
                  onChange={e => setSide(s, e.target.value)}
                  placeholder={test.unit || ''} style={{ ...inputBase, flex: 1 }} />
              </div>
            ))}
          </div>
        )}
        {/* non-sided composite */}
        {!hasSides && isComposite && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {test.composite.map(part => (
              <div key={part.id} style={{ flex: '1 1 80px', minWidth: 80 }}>
                <div style={{ fontFamily: FN, fontSize: 8, color: 'var(--c-td)', letterSpacing: '0.08em', marginBottom: 2 }}>
                  {part.label}{part.unit ? ` (${part.unit})` : ''}
                </div>
                <input value={(typeof value === 'object' && value?.[part.id]) || ''}
                  onChange={e => setComposite(part.id, e.target.value)}
                  style={{ ...inputBase, width: '100%' }} />
              </div>
            ))}
          </div>
        )}
        {/* sided composite (e.g. sl_pogo: per-side {ssc_ms, rsi}) */}
        {hasSides && isComposite && (
          <div style={{ display: 'flex', gap: 8 }}>
            {test.sides.map(s => (
              <div key={s} style={{ flex: 1 }}>
                <div style={{ fontFamily: FN, fontSize: 8, color: 'var(--c-tm)', letterSpacing: '0.08em', marginBottom: 2 }}>{s}</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {test.composite.map(part => (
                    <input key={part.id}
                      value={(typeof value?.[s] === 'object' && value[s]?.[part.id]) || ''}
                      onChange={e => setSideComposite(s, part.id, e.target.value)}
                      placeholder={part.label}
                      style={{ ...inputBase, flex: 1, minWidth: 0 }} />
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

function SectionBlock({ section, scores, setScore }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{
        fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.18em',
        color: 'var(--c-ac)', marginBottom: 8, paddingBottom: 4,
        borderBottom: `1px solid var(--c-ac)`,
      }}>{section.title.toUpperCase()}</div>
      {section.hint && (
        <div style={{ fontFamily: FB, fontSize: 11, color: 'var(--c-tm)', marginBottom: 8, fontStyle: 'italic' }}>
          {section.hint}
        </div>
      )}
      {section.tests.map(t => (
        <TestRow key={t.id} test={t} value={scores[t.id]}
          onChange={v => setScore(t.id, v)} />
      ))}
    </div>
  );
}

function RomBlock({ rom, setRom }) {
  const set = (key, v) => setRom({ ...rom, [key]: v });
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{
        fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.18em',
        color: 'var(--c-ac)', marginBottom: 8, paddingBottom: 4,
        borderBottom: `1px solid var(--c-ac)`,
      }}>{EVAL_SCHEMA.rom.title.toUpperCase()}</div>
      <div style={{ fontFamily: FB, fontSize: 11, color: 'var(--c-tm)', marginBottom: 12, fontStyle: 'italic' }}>
        {EVAL_SCHEMA.rom.hint}
      </div>
      {EVAL_SCHEMA.rom.joints.map(j => (
        <div key={j.id} style={{ marginBottom: 12 }}>
          <div style={{ fontFamily: FN, fontSize: 11, color: 'var(--c-tx)', fontWeight: 700, marginBottom: 4 }}>
            {j.label}
          </div>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 6,
          }}>
            {j.axes.map(ax => {
              const k = romKey(j.id, ax);
              return (
                <div key={ax} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ flex: 1, fontFamily: FB, fontSize: 11, color: 'var(--c-tm)' }}>{ax}</div>
                  <input value={rom[k] || ''} onChange={e => set(k, e.target.value)}
                    placeholder="°" style={{ ...inputBase, width: 64 }} />
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
  const [evalDate, setEvalDate] = useState(existing?.eval_date || new Date().toISOString().slice(0, 10));
  const [evalTime, setEvalTime] = useState(existing?.eval_time || '');
  const [age, setAge] = useState(existing?.age ?? trainee?.age ?? '');
  const [heightCm, setHeightCm] = useState(existing?.height_cm ?? trainee?.height ?? '');
  const [weightKg, setWeightKg] = useState(existing?.weight_kg ?? trainee?.weight ?? '');
  const [scores, setScores] = useState(existing?.scores || {});
  const [rom, setRom] = useState(existing?.rom || {});
  const [notes, setNotes] = useState(existing?.notes || '');

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

  const save = async () => {
    await onSave({
      eval_date: evalDate, eval_time: evalTime || null,
      age, height_cm: heightCm, weight_kg: weightKg,
      scores, rom, notes: notes || null,
    });
    onClose();
  };

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 300,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px',
      overflowY: 'auto',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: isRefined5b() ? '#FFFFFF' : 'var(--c-bg)',
        border: `1px solid var(--c-ac)`, borderRadius: 0,
        padding: 20, maxWidth: 900, width: '100%',
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
            <input type="date" value={evalDate} onChange={e => setEvalDate(e.target.value)} style={{ ...inputBase, width: '100%' }} />
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
          <SectionBlock key={s.id} section={s} scores={scores} setScore={setScore} />
        ))}

        <RomBlock rom={rom} setRom={setRom} />

        {/* Free notes */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontFamily: FN, fontSize: 9, color: 'var(--c-tm)', letterSpacing: '0.18em', fontWeight: 700, marginBottom: 4 }}>NOTES</div>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
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
    </div>
  );
}
