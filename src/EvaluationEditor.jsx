// Coach-administered editor for one Evaluation. Mirrors the
// ATH EVAL.xlsx layout: section headers + per-test input rows + Passive
// ROM grid at the bottom. Values are free text (the xlsx accepts "R-4",
// "SLDL: 4" etc. — we don't over-validate).
//
// Mounted as a modal from TraineeEvaluation. Saves to trainee_evaluations
// via the hook in evaluationsData.js. eval_id is null for create, set for
// edit-in-place.

import React, { useState, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { FN, FB } from './theme';
import { useT, readLang } from './i18n';
import { isRefined5b, useEscClose, useIsMobile, toast, ConfirmDialog } from './ui';
import { EVAL_SCHEMA, romKey, romLabel, romJointLabel } from './evaluationSchema';
import { todayLocalISO } from './dates';
import { toolForTest, romAxisSpec, applyTestResult, applyRomResult, testValueDisplay } from './evalTestMap';

// Camera tools pull MediaPipe/three — lazy so opening an eval doesn't carry them
// until the coach actually runs a test.
const MovementLab = lazy(() => import('./MovementLab'));
// Hold timer is light (no MediaPipe) but lazy-loaded for symmetry with the
// other embedded test tools.
const HoldTimer = lazy(() => import('./HoldTimer'));

// THE EVALUATION, REDESIGNED (16.10 #837, Ohad: "On ath eval. Page looks horrible text overflow. Boxes don't match.
// Redesign the entire page"). One box height (36px) everywhere; a field's label sits in its own row ABOVE the inputs,
// so a label that wraps can never push its box out of line or paint over it; sides are words (שמאל / ימין), never a
// lone letter beside another field's text; the 1-2-3 scores are one joined row per side; the ROM is one aligned row
// per motion; no glyphs. Every value is the same field it always was (same keys, same save).
const BOX = 36;
const inputBase = {
  background: 'var(--c-sf)', border: `1px solid var(--c-cardBd)`, borderRadius: 0,
  padding: '0 8px', height: BOX, minHeight: BOX, color: 'var(--c-tx)', fontFamily: FN, fontSize: 13,
  outline: 'none', boxSizing: 'border-box', minWidth: 0, width: '100%', textAlign: 'center',
};
const he0 = () => readLang() === 'he';   // the app's language (documentElement.lang can be left over from another page)
const lab = () => ({ fontFamily: FN, fontSize: 9.5, color: 'var(--c-tm)', letterSpacing: he0() ? 0 : '0.06em', fontWeight: 700, textTransform: 'uppercase', lineHeight: 1.25, textAlign: 'center', overflowWrap: 'anywhere' });
// the side words (the shared 'Left' key already means 'remaining')
// a word with its English fallback (a key with no Hebrew would otherwise show as the key itself in English)
const W = (tt, en, key) => { const v = tt(key); return v === key ? en : v; };
const sideWord = (tt, s) => (s === 'L' ? W(tt, 'Left', 'eval·side·L') : s === 'R' ? W(tt, 'Right', 'eval·side·R') : s);
const partWord = (tt, p) => { const k = `eval·part·${p}`; const v = tt(k); return v === k ? p : v; };
const secWord = (tt, t) => { const k = `eval·sec·${t}`; const v = tt(k); return v === k ? t : v; };

// FIELDS: a grid whose first row holds every label and whose second row holds every input, so the inputs share one line
// whatever the labels do. Up to `per` columns a row; more fields wrap into further label/input row pairs.
function FieldGrid({ cells, per = 3 }) {
  const rows = [];
  for (let i = 0; i < cells.length; i += per) rows.push(cells.slice(i, i + per));
  const cols = Math.min(per, Math.max(2, cells.length));
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {rows.map((r, ri) => (
        <div key={ri} style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, columnGap: 8, rowGap: 4, alignItems: 'end' }}>
          {r.map((c, i) => <div key={'l' + i} style={lab()}>{c.label}</div>)}
          {r.length < cols && Array.from({ length: cols - r.length }).map((_, i) => <div key={'le' + i} />)}
          {r.map((c, i) => <div key={'i' + i} style={{ minWidth: 0 }}>{c.input}</div>)}
          {r.length < cols && Array.from({ length: cols - r.length }).map((_, i) => <div key={'ie' + i} />)}
        </div>
      ))}
    </div>
  );
}

// The camera / timer tool for a measurable test: a full-width 36px button, or two equal cells for a sided test.
function TestButtons({ test, onTest }) {
  const tt = useT();
  const map = toolForTest(test.id);
  if (!map) return null;
  const soon = map.status === 'soon';
  const sides = map.side ? ['L', 'R'] : [null];
  // a half-width cell (a sided test) takes the short word - 'Measure with the camera · Left' did not fit a phone's half
  const word = soon ? W(tt, 'Measure · soon', 'eval·tool·soon') : map.tool === 'hold' ? W(tt, 'Timer', 'eval·tool·timer') : sides.length > 1 ? W(tt, 'Camera', 'eval·tool·camera short') : W(tt, 'Measure with the camera', 'eval·tool·camera');
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${sides.length}, minmax(0, 1fr))`, gap: 1, background: 'var(--c-cardBd)', border: '1px solid var(--c-cardBd)', marginTop: 10 }}>
      {sides.map((s) => (
        <button key={s || 'x'} type="button" disabled={soon} onClick={() => !soon && onTest(test, map, s)}
          style={{ height: BOX, border: 'none', background: 'var(--c-sf)', color: soon ? 'var(--c-td)' : 'var(--c-ac)', cursor: soon ? 'default' : 'pointer',
            fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: he0() ? 0 : '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', padding: '0 8px' }}>
          {word}{s ? ` · ${sideWord(tt, s)}` : ''}
        </button>
      ))}
    </div>
  );
}

// a test's head: its number, its name (English, the platform's rule for test and exercise names) and its goal
function TestHead({ index, test, extra = null }) {
  const tt = useT();
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
      <span style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, color: 'var(--c-td)', width: 18, flexShrink: 0, textAlign: 'center' }}>{index}</span>
      <div style={{ minWidth: 0, flex: '1 1 auto' }}>
        {/* the name on the page's own side (an English name in a Hebrew page still reads left to right inside its bdi) */}
        <div style={{ fontFamily: FB, fontSize: 14, fontWeight: 600, color: 'var(--c-tx)', lineHeight: 1.3, textAlign: 'start', overflowWrap: 'anywhere' }}><bdi>{test.label}</bdi></div>
        {test.goal && test.goal !== '—' && (
          <div style={{ fontFamily: FN, fontSize: 10.5, color: 'var(--c-tm)', marginTop: 3, lineHeight: 1.3 }}>
            {W(tt, 'Goal', 'eval·goal')}: <bdi dir="ltr">{test.goal}</bdi>
          </div>
        )}
      </div>
      {extra}
    </div>
  );
}

function TestRow({ index, test, value, onChange, onTest }) {
  const tt = useT();
  const isComposite = Array.isArray(test.composite);
  const hasSides = Array.isArray(test.sides);
  const obj = typeof value === 'object' && value ? value : {};
  const asObj = (c) => (typeof c === 'object' && c ? c : {});
  const setSide = (side, v) => onChange((c) => ({ ...asObj(c), [side]: v }));
  const setComposite = (partId, v) => onChange((c) => ({ ...asObj(c), [partId]: v }));
  const setSideComposite = (side, partId, v) => onChange((c) => { const o = asObj(c); const sideCur = typeof o[side] === 'object' && o[side] ? o[side] : {}; return { ...o, [side]: { ...sideCur, [partId]: v } }; });
  const unit0 = test.unit && test.unit !== 'composite' ? test.unit : '';
  const unit = unit0 ? partWord(tt, unit0) : '';   // 'sec' -> 'שניות', 'cm' -> 'ס״מ' in a Hebrew page
  const inp = (val, on, ph = unit) => <input dir="ltr" value={val || ''} onChange={(e) => on(e.target.value)} placeholder={ph} style={inputBase} />;
  let fields;
  if (!hasSides && !isComposite) {
    fields = <FieldGrid per={2} cells={[{ label: unit || W(tt, 'Result', 'eval·result'), input: inp(typeof value === 'object' ? '' : value, (v) => onChange(v)) }]} />;
  } else if (hasSides && !isComposite) {
    fields = <FieldGrid per={2} cells={test.sides.map((s) => ({ label: `${sideWord(tt, s)}${unit ? ` · ${unit}` : ''}`, input: inp(obj[s], (v) => setSide(s, v)) }))} />;
  } else if (!hasSides && isComposite) {
    fields = <FieldGrid per={3} cells={test.composite.map((p) => ({ label: `${partWord(tt, p.label)}${p.unit ? ` · ${partWord(tt, p.unit)}` : ''}`, input: inp(obj[p.id], (v) => setComposite(p.id, v), p.unit ? partWord(tt, p.unit) : '') }))} />;
  } else {
    // sided composite: a small table - the parts across, one row per side
    fields = (
      <div style={{ display: 'grid', gridTemplateColumns: `64px repeat(${test.composite.length}, minmax(0, 1fr))`, columnGap: 8, rowGap: 6, alignItems: 'center' }}>
        <div />
        {test.composite.map((p) => <div key={p.id} style={lab()}>{partWord(tt, p.label)}{p.unit ? ` · ${p.unit}` : ''}</div>)}
        {test.sides.map((s) => (
          <React.Fragment key={s}>
            <div style={{ ...lab(), color: 'var(--c-ac)', textAlign: 'start' }}>{sideWord(tt, s)}</div>
            {test.composite.map((p) => <div key={p.id} style={{ minWidth: 0 }}>{inp(typeof obj[s] === 'object' && obj[s] ? obj[s][p.id] : '', (v) => setSideComposite(s, p.id, v), p.unit || '')}</div>)}
          </React.Fragment>
        ))}
      </div>
    );
  }
  return (
    <div className="eval-row" data-eval-test={test.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--c-cardBd)' }}>
      <TestHead index={index} test={test} />
      {fields}
      <TestButtons test={test} onTest={onTest} />
    </div>
  );
}

// 1-3 score is semantic: 1 poor (red) · 2 moderate (orange) · 3 good (green).
const SCORE_COLORS = { 1: 'var(--c-rd)', 2: 'var(--c-or)', 3: 'var(--c-gn)' };
const isScore = (v) => v === 1 || v === 2 || v === 3;

// One side's score: three EQUAL joined cells; the chosen one framed in its colour, the word in its colour (no fills);
// tapping the chosen one clears it. A legacy free-text value shows under the row.
function ScoreButtons({ value, onChange, label }) {
  const tt = useT();
  const sel = isScore(value) ? value : null;
  const legacy = (value != null && value !== '' && !isScore(value)) ? String(value) : null;
  return (
    <div style={{ minWidth: 0 }}>
      <div role="radiogroup" aria-label={label} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
        {[1, 2, 3].map((n) => {
          const on = sel === n;
          const col = SCORE_COLORS[n];
          return (
            <button key={n} type="button" role="radio" aria-checked={on} onClick={() => onChange(on ? null : n)}
              style={{ height: BOX, borderRadius: 0, cursor: 'pointer', fontFamily: FN, fontSize: 15, fontWeight: 800, background: 'transparent',
                border: `${on ? 2 : 1}px solid ${on ? col : 'var(--c-cardBd)'}`, color: on ? col : 'var(--c-tm)', boxSizing: 'border-box' }}>{n}</button>
          );
        })}
      </div>
      {legacy && <div style={{ fontFamily: FN, fontSize: 10, color: 'var(--c-td)', marginTop: 4 }}>{tt('was:')} <bdi>{legacy}</bdi></div>}
    </div>
  );
}

// A movement: its head, what to watch (the sheet's parameters, one per line), then one score row per side and a note.
function MovementRow({ index, test, value, note, onScore, onNote }) {
  const tt = useT();
  const hasSides = Array.isArray(test.sides);
  const [noteOpen, setNoteOpen] = useState(!!note);
  const obj = typeof value === 'object' && value ? value : {};
  const setSide = (side, v) => onScore((c) => ({ ...(typeof c === 'object' && c ? c : {}), [side]: v }));
  return (
    <div className="eval-row" data-eval-move={test.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--c-cardBd)' }}>
      <TestHead index={index} test={test} />
      {(test.params || []).length > 0 && (
        <div style={{ margin: '0 0 12px', paddingInlineStart: 28 }}>
          <div style={{ ...lab(), textAlign: 'start', marginBottom: 4 }}>{W(tt, 'Watch', 'eval·watch')}</div>
          {(test.params || []).map((p, i) => (
            <div key={i} dir="ltr" style={{ fontFamily: FB, fontSize: 12, color: 'var(--c-tm)', lineHeight: 1.45, textAlign: 'start', unicodeBidi: 'plaintext' }}><bdi>{p}</bdi></div>
          ))}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '64px minmax(0, 1fr)', columnGap: 8, rowGap: 8, alignItems: 'center' }}>
        {(hasSides ? test.sides : [null]).map((s) => (
          <React.Fragment key={s || 'x'}>
            <div style={{ ...lab(), color: s ? 'var(--c-ac)' : 'var(--c-tm)', textAlign: 'start' }}>{s ? sideWord(tt, s) : W(tt, 'Score', 'eval·score')}</div>
            <ScoreButtons label={`${test.label}${s ? ` · ${sideWord(tt, s)}` : ''}`}
              value={s ? obj[s] : value}
              onChange={(v) => (s ? setSide(s, v) : onScore(v))} />
          </React.Fragment>
        ))}
      </div>
      <div style={{ marginTop: 10 }}>
        {noteOpen
          ? <input value={note || ''} onChange={(e) => onNote(e.target.value)} dir="auto" placeholder={W(tt, 'A note on this movement', 'eval·note')} style={{ ...inputBase, textAlign: 'start', fontFamily: FB }} />
          : <button type="button" onClick={() => setNoteOpen(true)} style={{ height: BOX, width: '100%', background: 'transparent', border: '1px dashed var(--c-cardBd)', color: 'var(--c-tm)', cursor: 'pointer', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: he0() ? 0 : '0.08em', textTransform: 'uppercase' }}>{W(tt, '+ Note', 'eval·add note')}</button>}
      </div>
    </div>
  );
}

// a section: one strip (its name), the hint, then its tests
function SectionStrip({ title, hint }) {
  return (
    <>
      <div style={{ borderBottom: '1px solid var(--c-cardBd)', padding: '0 14px', minHeight: 41, display: 'flex', alignItems: 'center', fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: he0() ? 0 : '0.1em', textTransform: 'uppercase', color: 'var(--c-ac)', background: 'var(--c-stripBg, var(--c-sf))' }}>{title}</div>
      {hint && <div style={{ padding: '10px 14px 0', fontFamily: FB, fontSize: 12, color: 'var(--c-tm)', lineHeight: 1.5 }}>{hint}</div>}
    </>
  );
}

function SectionBlock({ section, scores, setScore, notes, setNote, onTest }) {
  const tt = useT();
  const isMovements = section.id === 'movements';
  const hint = section.hint ? (() => { const k = `eval·hint·${section.id}`; const v = tt(k); return v === k ? section.hint : v; })() : null;
  return (
    <div data-eval-section={section.id} style={{ border: '1px solid var(--c-cardBd)', background: 'var(--c-sf)', marginBottom: 14 }}>
      <SectionStrip title={secWord(tt, section.title)} hint={hint} />
      <div style={{ padding: '0 14px' }}>
        {isMovements
          ? section.tests.map((t, i) => <MovementRow key={t.id} index={i + 1} test={t} value={scores[t.id]} note={notes?.[t.id]} onScore={(v) => setScore(t.id, v)} onNote={(v) => setNote(t.id, v)} />)
          : section.tests.map((t, i) => <TestRow key={t.id} index={i + 1} test={t} value={scores[t.id]} onChange={(v) => setScore(t.id, v)} onTest={onTest} />)}
      </div>
    </div>
  );
}

// PASSIVE ROM: per joint a sub-strip, then one aligned row per motion - the motion, its degrees, the camera (only on the
// motions 2D pose measures honestly; the rest keep an empty cell so the columns stay in line)
function RomBlock({ rom, setRom, onRomTest }) {
  const tt = useT();
  const set = (key, v) => setRom({ ...rom, [key]: v });
  return (
    <div data-eval-section="rom" style={{ border: '1px solid var(--c-cardBd)', background: 'var(--c-sf)', marginBottom: 14 }}>
      <SectionStrip title={romLabel(tt, EVAL_SCHEMA.rom.title)} hint={romLabel(tt, EVAL_SCHEMA.rom.hint)} />
      <div style={{ padding: '6px 14px 0', fontFamily: FB, fontSize: 12, color: 'var(--c-tm)', lineHeight: 1.5 }}>{W(tt, 'The camera reads some of these ranges (shoulder, hip and knee flexion, knee over-extension, neck and ankle) and you confirm each one. Rotations, the scapula and foot inversion stay manual.', 'eval·rom camera hint')}</div>
      <div style={{ padding: '0 14px 6px' }}>
        {EVAL_SCHEMA.rom.joints.map((j) => (
          <div key={j.id} data-eval-joint={j.id} style={{ paddingTop: 12 }}>
            <div style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, color: 'var(--c-tx)', letterSpacing: he0() ? 0 : '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>{romLabel(tt, j.label)}</div>
            {j.axes.map((ax) => {
              const k = romKey(j.id, ax);
              const camSpec = romAxisSpec(j.id, ax);
              return (
                <div key={ax} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 84px 96px', columnGap: 8, alignItems: 'center', minHeight: BOX + 8, borderTop: '1px solid var(--c-cardBd)' }}>
                  <div style={{ fontFamily: FB, fontSize: 13, color: 'var(--c-tx)', lineHeight: 1.3, overflowWrap: 'anywhere', padding: '4px 0' }}>{romLabel(tt, ax)}</div>
                  <input dir="ltr" value={rom[k] || ''} onChange={(e) => set(k, e.target.value)} placeholder="°" aria-label={`${romLabel(tt, j.label)} · ${romLabel(tt, ax)}`} style={inputBase} />
                  {camSpec && onRomTest
                    ? <button type="button" onClick={() => onRomTest(camSpec, k)} title={tt('Measure {axis} with the camera').replace('{axis}', romLabel(tt, ax))}
                        style={{ height: BOX, background: 'transparent', border: '1px solid var(--c-ac)', color: 'var(--c-ac)', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: he0() ? 0 : '0.08em', textTransform: 'uppercase', cursor: 'pointer', whiteSpace: 'nowrap' }}>{W(tt, 'Camera', 'eval·tool·camera short')}</button>
                    : <span />}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// Now-time HH:MM in the LOCAL zone (native <input type="time"> value shape).
const nowHHMM = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

export default function EvaluationEditor({ trainee, existing, metaDefaults = null, onSave, onClose }) {
  const tt = useT();
  const isMobile = useIsMobile();
  const [evalDate, setEvalDate] = useState(existing?.eval_date || todayLocalISO());
  // A NEW eval defaults TIME to now; editing keeps whatever was saved (even blank).
  const [evalTime, setEvalTime] = useState(existing ? (existing.eval_time || '') : nowHHMM());
  // Metadata defaults for a NEW eval, resolved by the parent from intake DOB→age /
  // trainee vitals / latest bw_logs (precedence lives there). Editing an existing
  // eval always shows its own saved values first; blank when no source has data.
  // HARD RULE (never-invent-training-data): a prefill from today's intake/vitals/
  // bw_logs may seed a NEW eval only. Editing an EXISTING eval must NEVER fall
  // through to metaDefaults/trainee — that would rewrite a historical row's
  // age/height/weight to today's values on save, fabricating a measurement.
  // Existing eval → its own saved value, or blank when it never had one.
  const [age, setAge] = useState(existing ? (existing.age ?? '') : (metaDefaults?.age ?? trainee?.age ?? ''));
  const [heightCm, setHeightCm] = useState(existing ? (existing.height_cm ?? '') : (metaDefaults?.height_cm ?? trainee?.height ?? ''));
  const [weightKg, setWeightKg] = useState(existing ? (existing.weight_kg ?? '') : (metaDefaults?.weight_kg ?? trainee?.weight ?? ''));
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

  // value may be a function of the field's latest value (two quick taps on one test never drop the first)
  const setScore = (testId, value0) => {
    setScores(prev => {
      const value = typeof value0 === 'function' ? value0(prev[testId]) : value0;
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
  // Retake guard — if the field already has a value in this evaluation, confirm
  // (re-capture + overwrite) before re-running; a fresh field launches straight in.
  const [retake, setRetake] = useState(null); // { label, current, run }
  const onTest = (test, map, side) => {
    const cur = testValueDisplay(scores, test, side);
    if (cur != null) setRetake({ label: `${test.label}${side ? ` · ${side}` : ''}`, current: cur, run: () => setActiveTest({ test, map, side }) });
    else setActiveTest({ test, map, side });
  };
  // Camera goniometer for a single ROM axis — opens MovementLab in analyze mode
  // with a romSpec, and writes the coach-confirmed degree into rom[key].
  const [activeRom, setActiveRom] = useState(null); // { spec, key }
  const onRomTest = (spec, key) => {
    const cur = rom[key];
    if (cur != null && cur !== '') setRetake({ label: `${romJointLabel(tt, spec.jointId)} · ${romLabel(tt, spec.axis)}`, current: `${cur}°`, run: () => setActiveRom({ spec, key }) });
    else setActiveRom({ spec, key });
  };
  // Tool-agnostic: `raw` is whatever the active tool hands back (jump metrics
  // object, or hold seconds). map.toValue folds it into the field shape; for a
  // composite test that's an object keyed by part id, which slots straight into
  // the simple / sided / composite / sided-composite storage below.
  const writeTestResult = (raw) => {
    if (!activeTest) return;
    const { test, map, side } = activeTest;
    // Single source of truth for the writeback shape (sided { L,R } merge without
    // clobbering the other side + composite objects) — same helper the writeback
    // fixture asserts, and the same one the top-level picker uses. Retake overwrites.
    setScores(prev => applyTestResult(prev, test, map, side, raw));
    const v = map.toValue(raw);
    const shown = typeof v === 'object' ? Object.entries(v).map(([k, val]) => `${k}:${val}`).join(' · ') : v;
    toast(tt('Logged {v} to {target}').replace('{v}', shown).replace('{target}', `${test.label}${side ? ` · ${side}` : ''}`), 'success', { ttl: 3500 });
    setActiveTest(null);
  };

  const [saving, setSaving] = useState(false);
  const save = async () => {
    // Guard double-tap/slow-network re-click: create() mints a fresh id per call,
    // so a second click before the first resolves writes a DUPLICATE evaluation row
    // (clinical data). Mirrors ContractSign's submitting guard (#123).
    if (saving) return;
    setSaving(true);
    try {
    const scoresOut = Object.keys(exNotes).length ? { ...scores, __notes: exNotes } : scores;
    // onSave is create (row|null) or update (true|false). Only close on a
    // confirmed write — closing unconditionally on a swallowed failure lost the
    // whole eval (every score + ROM) while reading as success.
    const ok = await onSave({
      eval_date: evalDate, eval_time: evalTime || null,
      age, height_cm: heightCm, weight_kg: weightKg,
      scores: scoresOut, rom, notes: notes || null,
    });
    if (!ok) { toast(tt('Could not save the evaluation — check your connection and try again.'), 'error', { ttl: 5000 }); return; }
    onClose();
    } finally { setSaving(false); }
  };

  // the meta fields: the date a full row, then time · age and height · weight as equal halves (desktop: five equal cells)
  const metaInput = { ...inputBase, padding: '0 10px' };
  const metaCell = (label, input, span = false) => (
    <div style={{ minWidth: 0, gridColumn: span ? '1 / -1' : undefined }}>
      <div style={{ ...lab(), textAlign: 'start', marginBottom: 4 }}>{label}</div>
      {input}
    </div>
  );
  return (
    <>
    {createPortal((<div onClick={onClose} role="dialog" aria-modal="true" aria-label={tt('Evaluation')} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 300,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: isMobile ? '12px 8px' : '40px 16px',
      overflowY: 'auto',
    }}>
      <div data-eval-editor onClick={e => e.stopPropagation()} style={{
        background: isRefined5b() ? '#FFFFFF' : 'var(--c-bg)',
        border: `1px solid var(--c-ac)`, borderRadius: 0,
        padding: isMobile ? 12 : 20, maxWidth: 880, width: '100%', boxSizing: 'border-box',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 14, minHeight: BOX }}>
          <h2 style={{ margin: 0, fontFamily: FN, fontSize: 16, color: 'var(--c-tx)', letterSpacing: he0() ? 0 : '0.04em', lineHeight: 1.3, minWidth: 0, overflowWrap: 'anywhere' }}>
            {tt('EVALUATION')} · <bdi>{trainee?.name || ''}</bdi>
          </h2>
          <button type="button" onClick={onClose} aria-label={tt('Close')}
            style={{ height: BOX, padding: '0 14px', flexShrink: 0, background: 'transparent', border: '1px solid var(--c-cardBd)', color: 'var(--c-tm)', cursor: 'pointer', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: he0() ? 0 : '0.08em', textTransform: 'uppercase' }}>{tt('Close')}</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(5, minmax(0, 1fr))', gap: 8, marginBottom: 14 }}>
          {metaCell(tt('DATE'), (
            // dd/mm/yyyy over the native picker (the browser's own date text follows its locale)
            <div style={{ position: 'relative', display: 'flex', height: BOX }}>
              <input type="date" value={evalDate} onChange={e => setEvalDate(e.target.value)} aria-label={tt('DATE')}
                onClick={e => { try { e.currentTarget.showPicker(); } catch { /* noop */ } }}
                style={{ ...metaInput, color: 'transparent', cursor: 'pointer' }} />
              <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', fontFamily: FN, fontSize: 13, color: 'var(--c-tx)', opacity: evalDate ? 1 : 0.45 }}>{evalDate ? evalDate.split('-').reverse().join('/') : 'DD/MM/YYYY'}</span>
            </div>
          ), isMobile)}
          {metaCell(tt('TIME'), <input type="time" dir="ltr" value={evalTime} onChange={e => setEvalTime(e.target.value)} aria-label={tt('TIME')} style={metaInput} />)}
          {metaCell(tt('AGE'), <input type="number" dir="ltr" inputMode="numeric" value={age} onChange={e => setAge(e.target.value)} aria-label={tt('AGE')} style={metaInput} />)}
          {metaCell(tt('HEIGHT (cm)'), <input type="number" dir="ltr" inputMode="decimal" value={heightCm} onChange={e => setHeightCm(e.target.value)} aria-label={tt('HEIGHT (cm)')} style={metaInput} />)}
          {metaCell(tt('WEIGHT (kg)'), <input type="number" dir="ltr" inputMode="decimal" step="0.1" value={weightKg} onChange={e => setWeightKg(e.target.value)} aria-label={tt('WEIGHT (kg)')} style={metaInput} />)}
        </div>

        {EVAL_SCHEMA.sections.map(s => (
          <SectionBlock key={s.id} section={s} scores={scores} setScore={setScore}
            notes={exNotes} setNote={setExNote} onTest={onTest} />
        ))}

        <RomBlock rom={rom} setRom={setRom} onRomTest={onRomTest} />

        <div style={{ border: '1px solid var(--c-cardBd)', background: 'var(--c-sf)', marginBottom: 14 }}>
          <SectionStrip title={tt('NOTES')} />
          <div style={{ padding: 14 }}>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} dir="auto"
              placeholder={tt('Coach observations · red flags · session-context')}
              style={{ ...inputBase, height: 'auto', minHeight: 88, padding: '10px 12px', textAlign: 'start', fontFamily: FB, resize: 'vertical' }} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1, background: 'var(--c-cardBd)', border: '1px solid var(--c-cardBd)' }}>
          <button type="button" onClick={onClose}
            style={{ height: BOX, border: 'none', background: 'var(--c-sf)', color: 'var(--c-tm)', fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: he0() ? 0 : '0.1em', cursor: 'pointer' }}>{tt('CANCEL')}</button>
          <button type="button" onClick={save} disabled={saving}
            style={{ height: BOX, border: 'none', background: 'var(--c-sf)', color: 'var(--c-ac)', fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: he0() ? 0 : '0.1em', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? tt('SAVING…') : (existing ? tt('SAVE CHANGES') : tt('SAVE EVALUATION'))}
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
          captureCue={activeTest.map.cue || null}
          defaultBodyweightKg={parseFloat(weightKg) || null}
          defaultHeightCm={parseFloat(heightCm) || null}
          onSaveJump={writeTestResult}
          onClose={() => setActiveTest(null)}
        />
      </Suspense>
    )}
    {/* Embedded camera goniometer — analyze mode, one joint axis. Writes the
        coach-confirmed clinical degree into rom[key]. */}
    {activeRom && (
      <Suspense fallback={null}>
        <MovementLab
          initialMode="analyze"
          initialView="metrics"
          exerciseTitle={`${romJointLabel(tt, activeRom.spec.jointId)} · ${romLabel(tt, activeRom.spec.axis)}`}
          toolLabel={`${tt('CAMERA ROM')} · ${romJointLabel(tt, activeRom.spec.jointId).toUpperCase()} · ${romLabel(tt, activeRom.spec.axis).toUpperCase()}`}
          captureCue={activeRom.spec.cue || null}
          romSpec={activeRom.spec}
          onSaveRom={(deg) => { setRom(prev => applyRomResult(prev, activeRom.spec, deg)); toast(tt(Number(deg) === 1 ? 'Logged 1° to {target}' : 'Logged {deg}° to {target}').replace('{deg}', deg).replace('{target}', `${activeRom.spec.jointId} ${activeRom.spec.axis}`), 'success', { ttl: 3500 }); }}
          onClose={() => setActiveRom(null)}
        />
      </Suspense>
    )}
    {/* Retake confirm — portal + backdrop-blocking (ConfirmDialog); only when the
        field already holds a value in this evaluation. */}
    <ConfirmDialog
      open={!!retake}
      title={tt('Retake — overwrite result?')}
      message={retake ? tt('{label} already has {current} in this evaluation. Re-running the camera test will RE-CAPTURE and REPLACE that value. Continue?').replace('{label}', retake.label).replace('{current}', retake.current) : ''}
      onConfirm={() => { const r = retake; setRetake(null); r?.run(); }}
      onCancel={() => setRetake(null)}
    />
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
