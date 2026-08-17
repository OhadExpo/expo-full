// Evaluation surface on the trainee card. The card stays collapsed
// by default — it shows the count + a "+ NEW EVAL" button, then a list of
// previous evaluations as summary rows (date · age · weight · filled-count).
// Click a row to expand THAT eval inline into a clean single-column view
// of every section + ROM block.
//
// Multiple rows can be expanded simultaneously — useful for comparing two
// dates side-by-side by scrolling between them. The full-comparison grid
// from the previous version is gone (it was unreadable on narrow widths
// and forced an awkward two-level interaction).

import React, { useMemo, useState, useRef, useCallback, useEffect, Suspense, lazy } from 'react';
import { createPortal } from 'react-dom';
import { fmtPrettyDate, ageFromDob } from './dates';
import { supabase } from './supabase';
import { C, FN, FB } from './theme';
import { isRefined5b, RefinedHeaderStrip, toast, useEscClose, ConfirmDialog } from './ui';
import { EVAL_SCHEMA, romKey, countFilled } from './evaluationSchema';
import { toolForTest, romAxisSpec, applyTestResult, applyRomResult, testValueDisplay } from './evalTestMap';
import { useTraineeEvaluations } from './evaluationsData';
import EvaluationEditor from './EvaluationEditor';

// MovementLab pulls MediaPipe — lazy so the trainee card doesn't carry the
// pose bundle until the coach actually runs a camera test.
const MovementLab = lazy(() => import('./MovementLab'));
// Hold-to-failure timer for the isometric tests (no MediaPipe) — lazy for
// symmetry with the other embedded test tools.
const HoldTimer = lazy(() => import('./HoldTimer'));

const fmtDate = (s) => s ? fmtPrettyDate(s) : '—';

// Score renderer — turns whatever shape the eval has into a readable string.
const renderScore = (test, value) => {
  if (value == null || value === '') return '—';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(test.sides) && !test.composite) {
    const parts = test.sides.map(s => value[s] ? `${s}: ${value[s]}` : null).filter(Boolean);
    return parts.length ? parts.join('  ·  ') : '—';
  }
  if (test.composite && !Array.isArray(test.sides)) {
    const parts = test.composite.map(p => value[p.id] ? `${p.label}: ${value[p.id]}` : null).filter(Boolean);
    return parts.length ? parts.join('  ·  ') : '—';
  }
  if (test.composite && Array.isArray(test.sides)) {
    const out = [];
    for (const s of test.sides) {
      const sideObj = value[s];
      if (!sideObj || typeof sideObj !== 'object') continue;
      const parts = test.composite.map(p => sideObj[p.id]).filter(v => v != null && v !== '');
      if (parts.length) out.push(`${s}: ${parts.join('/')}`);
    }
    return out.length ? out.join('  ·  ') : '—';
  }
  return JSON.stringify(value);
};

// ──────────────────────────────────────────────────────────────────────
// Single-eval expanded view — # · TEST · GOAL · SCORE in 4 fluid columns
// (no per-eval-date side-by-side, just this one's scores). Test names
// get a wide column so labels never truncate.
// ──────────────────────────────────────────────────────────────────────
// 4-column layout used by EVERY row + the column header + section
// headers. Keeping a single template at the top means the # column,
// test names, goal units, and scores all sit on the SAME X positions
// row-to-row — fixes the alignment drift Ohad called out. Min widths
// guarantee no column ever collapses to 0 when content is short.
const SINGLE_GRID = '36px minmax(220px, 2.2fr) minmax(110px, 1fr) minmax(180px, 2fr)';
const ROW_GAP = 12;
const ROW_MIN_H = 30;       // unified row height so wrapped labels don't shift baselines
const cellBase = {
  display: 'flex', alignItems: 'center',
  minHeight: ROW_MIN_H,
  boxSizing: 'border-box',
};

function SingleEvalRow({ index, test, evaluation }) {
  const v = evaluation.scores?.[test.id];
  const rendered = renderScore(test, v);
  const filled = rendered && rendered !== '—';
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: SINGLE_GRID,
      gap: ROW_GAP, padding: '4px 0',
      borderBottom: `1px solid var(--c-cardBd)`,
    }}>
      <div style={{ ...cellBase, justifyContent: 'center', fontFamily: FN, fontSize: 10, color: 'var(--c-td)', fontWeight: 700 }}>{index}</div>
      <div style={{ ...cellBase, fontSize: 12, color: 'var(--c-tx)', fontWeight: 600, lineHeight: 1.3 }}>{test.label}</div>
      <div style={{ ...cellBase, justifyContent: 'flex-end', fontFamily: FN, fontSize: 10, color: 'var(--c-tm)', letterSpacing: '0.04em', textAlign: 'right' }}>{test.goal || '—'}</div>
      <div style={{
        ...cellBase,
        fontFamily: FN, fontSize: 12,
        color: filled ? 'var(--c-tx)' : 'var(--c-td)',
        fontWeight: filled ? 700 : 400,
        lineHeight: 1.35,
      }}>{rendered}</div>
    </div>
  );
}

function SingleRomRow({ joint, axis, evaluation }) {
  const k = romKey(joint.id, axis);
  const val = evaluation.rom?.[k];
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: SINGLE_GRID,
      gap: ROW_GAP, padding: '4px 0',
      borderBottom: `1px solid var(--c-cardBd)`,
    }}>
      <div style={{ ...cellBase }} />
      <div style={{ ...cellBase, fontSize: 11, color: 'var(--c-tm)', paddingLeft: 18 }}>{axis}</div>
      <div style={{ ...cellBase, justifyContent: 'flex-end', fontFamily: FN, fontSize: 10, color: 'var(--c-td)', letterSpacing: '0.04em', textAlign: 'right' }}>degrees</div>
      <div style={{
        ...cellBase,
        fontFamily: FN, fontSize: 12,
        color: val ? 'var(--c-tx)' : 'var(--c-td)',
        fontWeight: val ? 700 : 400,
      }}>{val || '—'}</div>
    </div>
  );
}

// Section header — rendered as a single-column row aligned to the TEST
// column position via the shared grid template. Without this, the
// section title sat above the # column, not above the test names.
function SectionHeader({ title }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: SINGLE_GRID,
      gap: ROW_GAP, marginTop: 10, marginBottom: 4,
    }}>
      <div />
      <div style={{
        gridColumn: '2 / -1',
        fontFamily: FN, fontSize: 10, color: 'var(--c-ac)',
        letterSpacing: '0.2em', fontWeight: 700,
        paddingBottom: 4, borderBottom: `1px solid var(--c-ac)`,
      }}>{title.toUpperCase()}</div>
    </div>
  );
}

// Joint sub-header — same alignment scheme as SectionHeader, but
// lower visual weight (no border, no cyan).
function JointHeader({ label }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: SINGLE_GRID,
      gap: ROW_GAP, marginTop: 8, marginBottom: 2,
    }}>
      <div />
      <div style={{
        gridColumn: '2 / -1',
        fontFamily: FN, fontSize: 11, color: 'var(--c-tx)',
        fontWeight: 700, letterSpacing: '0.04em',
      }}>{label}</div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// One row in the evaluations list. Collapsed = date + meta; expanded =
// full per-section + ROM data underneath. EDIT button opens the editor.
// ──────────────────────────────────────────────────────────────────────
function EvalListRow({ evaluation, onOpenEditor }) {
  const [open, setOpen] = useState(false);
  const filled = useMemo(() => countFilled(evaluation.scores, evaluation.rom), [evaluation]);
  const refined = isRefined5b();
  return (
    <div style={{
      background: 'var(--c-sf)',
      border: `1px solid ${open ? 'var(--c-ac)' : 'var(--c-cardBd)'}`,
      borderLeft: open ? `3px solid var(--c-ac)` : `1px solid var(--c-cardBd)`,
      marginBottom: 6,
    }}>
      {/* Summary row — clickable */}
      <div onClick={() => setOpen(!open)}
        role="button" tabIndex={0} aria-expanded={open}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(!open); } }}
        style={{
          display: 'flex', alignItems: 'center', gap: 14, padding: '10px 14px',
          cursor: 'pointer', flexWrap: 'wrap',
        }}>
        <div style={{
          fontFamily: FN, fontSize: 13, color: 'var(--c-ac)', fontWeight: 700, letterSpacing: '0.04em',
          minWidth: 90,
        }}>{fmtDate(evaluation.eval_date)}</div>
        <div style={{ display: 'flex', gap: 14, fontFamily: FN, fontSize: 11, color: 'var(--c-tm)', flex: 1, flexWrap: 'wrap' }}>
          {evaluation.age != null && <span><span style={{ color: 'var(--c-td)' }}>AGE</span> {evaluation.age}</span>}
          {evaluation.height_cm != null && <span><span style={{ color: 'var(--c-td)' }}>HT</span> {evaluation.height_cm}cm</span>}
          {evaluation.weight_kg != null && <span><span style={{ color: 'var(--c-td)' }}>WT</span> {evaluation.weight_kg}kg</span>}
          <span><span style={{ color: 'var(--c-td)' }}>FIELDS</span> {filled}</span>
        </div>
        <button onClick={e => { e.stopPropagation(); onOpenEditor(evaluation); }}
          style={{
            background: 'transparent', border: `1px solid var(--c-cardBd)`, color: 'var(--c-tm)',
            padding: '3px 10px', borderRadius: 0, fontFamily: FN, fontSize: 9,
            fontWeight: 700, letterSpacing: '0.08em', cursor: 'pointer',
          }}>EDIT</button>
        <span style={{ color: 'var(--c-tm)', fontSize: 11, marginLeft: 4 }}>{open ? '▲' : '▼'}</span>
      </div>

      {/* Expanded full eval — single-column layout, every section + ROM */}
      {open && (
        <div style={{ padding: '0 14px 14px', borderTop: `1px solid var(--c-cardBd)`, overflowX: 'auto' }}>
          {/* Column header — same template as the rows so the labels
              sit exactly above each column's content. Right-aligned
              GOAL header matches the right-aligned goal cells below. */}
          <div style={{
            display: 'grid', gridTemplateColumns: SINGLE_GRID, gap: ROW_GAP,
            padding: '8px 0 6px', borderBottom: `2px solid var(--c-ac)`, marginBottom: 4,
          }}>
            <div style={{ ...cellBase, justifyContent: 'center', fontFamily: FN, fontSize: 9, color: 'var(--c-tm)', letterSpacing: '0.18em', fontWeight: 700 }}>#</div>
            <div style={{ ...cellBase, fontFamily: FN, fontSize: 9, color: 'var(--c-tm)', letterSpacing: '0.18em', fontWeight: 700 }}>TEST</div>
            <div style={{ ...cellBase, justifyContent: 'flex-end', fontFamily: FN, fontSize: 9, color: 'var(--c-tm)', letterSpacing: '0.18em', fontWeight: 700, textAlign: 'right' }}>GOAL</div>
            <div style={{ ...cellBase, fontFamily: FN, fontSize: 9, color: 'var(--c-tm)', letterSpacing: '0.18em', fontWeight: 700 }}>SCORE</div>
          </div>

          {EVAL_SCHEMA.sections.map(s => (
            <div key={s.id} style={{ marginBottom: 12 }}>
              <SectionHeader title={s.title} />
              {s.tests.map((t, ti) => (
                <SingleEvalRow key={t.id} index={ti + 1} test={t} evaluation={evaluation} />
              ))}
            </div>
          ))}

          {/* ROM block — same grid template, joint sub-headers align with
              the TEST column so the eye reads them as a sub-group. */}
          <div style={{ marginBottom: 12 }}>
            <SectionHeader title={EVAL_SCHEMA.rom.title} />
            {EVAL_SCHEMA.rom.joints.map(j => (
              <div key={j.id}>
                <JointHeader label={j.label} />
                {j.axes.map(ax => <SingleRomRow key={ax} joint={j} axis={ax} evaluation={evaluation} />)}
              </div>
            ))}
          </div>

          {evaluation.notes && (
            <div style={{ padding: '10px 0', borderTop: `1px solid var(--c-cardBd)` }}>
              <div style={{ fontFamily: FN, fontSize: 9, color: 'var(--c-tm)', letterSpacing: '0.18em', fontWeight: 700, marginBottom: 4 }}>NOTES</div>
              <div style={{ fontSize: 12, color: 'var(--c-tx)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                {evaluation.notes}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Main component — never auto-expands. Always shows the list of evals
// with a "+ NEW EVAL" button. Each row toggles itself open on click.
// ──────────────────────────────────────────────────────────────────────
// Collect every email a trainee (and any couple members) is known by, for the
// intake lookup — mirrors TraineeIntake.emailsOf.
const emailsOf = (t) => {
  const out = [];
  const push = (e) => { if (typeof e === 'string' && e.trim()) out.push(e.trim()); };
  if (Array.isArray(t?.email)) t.email.forEach(push); else push(t?.email);
  (t?.members || []).forEach(m => { if (Array.isArray(m?.email)) m.email.forEach(push); else push(m?.email); });
  return [...new Set(out)];
};
const num = (x) => (x != null && x !== '' && Number.isFinite(parseFloat(x)) ? parseFloat(x) : null);

export default function TraineeEvaluation({ trainee, bwLog = [] }) {
  const { rows, create, update, loading } = useTraineeEvaluations(trainee?.id);
  const [editing, setEditing] = useState(null);

  // Intake vitals — the athlete's own submitted DOB / height / weight, used only
  // as DEFAULTS for a new evaluation (never fabricated, blank if intake has none).
  // Same query pattern as TraineeIntake: match by trainee_id OR any known email.
  const [intakeVitals, setIntakeVitals] = useState(null); // { dob, height, weight } | null
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const emails = emailsOf(trainee);
        const queries = [];
        const escLike = (em) => em.replace(/([\\%_])/g, '\\$1');
        if (trainee?.id) queries.push(supabase.from('intake_submissions').select('payload,created_at').eq('trainee_id', trainee.id));
        for (const em of emails) queries.push(supabase.from('intake_submissions').select('payload,created_at').ilike('email', escLike(em)));
        if (!queries.length) return;
        const results = await Promise.all(queries.map(q => q));
        const subs = [];
        for (const r of results) if (r && !r.error && Array.isArray(r.data)) subs.push(...r.data);
        if (cancelled || !subs.length) return;
        subs.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))); // newest first
        const firstOf = (f) => { for (const s of subs) { const v = s?.payload?.[f]; if (v != null && v !== '') return v; } return null; };
        setIntakeVitals({ dob: firstOf('dob'), height: firstOf('height'), weight: firstOf('weight') });
      } catch { /* intake is a best-effort default source — silent on failure */ }
    })();
    return () => { cancelled = true; };
  }, [trainee?.id]); // eslint-disable-line react-hooks/exhaustive-deps -- emails derived from id-stable trainee

  // Latest logged bodyweight for this athlete (couple-aware), from bw_logs.
  const latestBwFromLog = useMemo(() => {
    const ids = new Set([trainee?.id, ...((trainee?.members || []).map(m => m?.id))].filter(Boolean));
    const entries = (bwLog || [])
      .filter(b => ids.has(b.clientId) && Number.isFinite(parseFloat(b.bw)))
      .map(b => ({ date: b.date, bw: parseFloat(b.bw) }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    return entries.length ? entries[entries.length - 1].bw : null;
  }, [bwLog, trainee]);

  // Resolved metadata defaults for a NEW evaluation, precedence per source
  // reliability: AGE = intake DOB→age → trainee record; HEIGHT = trainee vitals →
  // intake; WEIGHT = latest bw_logs → trainee vitals → intake. Blank when nothing.
  const metaDefaults = useMemo(() => ({
    age: (intakeVitals && ageFromDob(intakeVitals.dob)) ?? num(trainee?.age),
    height_cm: num(trainee?.height) ?? (intakeVitals ? num(intakeVitals.height) : null),
    weight_kg: latestBwFromLog ?? num(trainee?.weight) ?? (intakeVitals ? num(intakeVitals.weight) : null),
  }), [intakeVitals, latestBwFromLog, trainee]);

  const onSave = async (input) => {
    if (editing === 'new') return create(input);
    if (editing?.id) return update(editing.id, input);
  };

  // ── Camera-measurement session ────────────────────────────────────────────
  // CAMERA TEST opens a picker of every eval test/ROM-axis the camera can
  // honestly measure. One session accumulates every measured value into a
  // SINGLE evaluation administration row: the row is created on the first
  // measurement and updated in place thereafter, so filming a jump, then a
  // hold, then a ROM axis all land on the same row — mirroring how the protocol
  // is run in one sitting. Tests write scores[id] (via the map's toValue,
  // respecting sided/composite shapes); ROM axes write rom[romKey(joint,axis)].
  const [picker, setPicker] = useState(false);
  const [activeTool, setActiveTool] = useState(null); // { kind:'jump'|'hold'|'rom', test, map, side, spec }
  const [retake, setRetake] = useState(null);         // { label, current, run } — overwrite-confirm before re-capturing
  const [draftVersion, setDraftVersion] = useState(0);// bump to re-render the picker's ✓ progress after a write
  const draftRef = useRef({ rowId: null, date: null, scores: {}, rom: {}, weight_kg: null });

  const openPicker = () => {
    draftRef.current = { rowId: null, date: new Date().toISOString().slice(0, 10), scores: {}, rom: {}, weight_kg: null };
    setDraftVersion(0);
    setPicker(true);
  };
  const closePicker = () => { setActiveTool(null); setPicker(false); };

  // Launch helpers. A RETAKE (the field already has a value in THIS administration)
  // first asks for confirmation — clearly says it re-captures and overwrites — and
  // only runs the tool on confirm. A fresh field launches straight into capture.
  const launchTool = (test, map, side) => setActiveTool({ kind: map.tool, test, map, side });
  const launchRom = (spec) => setActiveTool({ kind: 'rom', spec });
  const onPickTest = (test, map, side) => {
    const cur = testValueDisplay(draftRef.current.scores, test, side);
    if (cur != null) setRetake({ label: `${test.label}${side ? ` · ${side}` : ''}`, current: cur, run: () => launchTool(test, map, side) });
    else launchTool(test, map, side);
  };
  const onPickRom = (spec) => {
    const cur = draftRef.current.rom?.[romKey(spec.jointId, spec.axis)];
    if (cur != null && cur !== '') setRetake({ label: `${spec.jointId} ${spec.axis}`, current: `${cur}°`, run: () => launchRom(spec) });
    else launchRom(spec);
  };

  // Persist the draft — create the row on the first measurement, update it after.
  // `scores`/`rom` are the FULLY-MERGED next objects. Returns true only on a
  // confirmed write, so callers toast success on a real save (a swallowed
  // RLS/offline failure must not read as green).
  const persistDraft = useCallback(async (scores, rom, weightKg) => {
    const d = draftRef.current;
    const weight = weightKg || d.weight_kg || null;
    let ok = true, rowId = d.rowId;
    if (!rowId) {
      const saved = await create({
        eval_date: d.date,
        ...(weight ? { weight_kg: weight } : {}),
        scores, rom, notes: 'Camera-measured evaluation.',
      });
      ok = !!saved; rowId = saved?.id || null;
    } else {
      ok = await update(rowId, { scores, rom, ...(weight ? { weight_kg: weight } : {}) });
    }
    draftRef.current = { ...d, rowId, scores, rom, weight_kg: weight };
    return ok;
  }, [create, update]);

  // Jump/hold result → scores[id]. map.toValue folds the raw tool output into the
  // field shape (string, or a composite object); sided tests merge into {L,R}.
  const writeTestResult = useCallback(async (raw) => {
    const at = activeTool;
    if (!at || (at.kind !== 'jump' && at.kind !== 'hold')) return;
    const { test, map, side } = at;
    const v = map.toValue(raw);
    const d = draftRef.current;
    // Single source of truth for the writeback shape (sided { L,R } merge +
    // composite objects) — same helper the writeback fixture asserts. A retake
    // just replaces this field/side; every other score is left intact.
    const nextScores = applyTestResult(d.scores, test, map, side, raw);
    const weightKg = at.kind === 'jump' && raw && raw.bodyweightKg ? raw.bodyweightKg : null;
    const ok = await persistDraft(nextScores, d.rom, weightKg);
    setActiveTool(null);
    setDraftVersion(x => x + 1);
    const shown = typeof v === 'object' ? Object.entries(v).map(([k, val]) => `${k}:${val}`).join(' · ') : v;
    if (ok) toast(`Logged ${shown} to ${test.label}${side ? ` · ${side}` : ''}`, 'success', { ttl: 3500 });
    else toast('Could not save — check your connection and try again.', 'error', { ttl: 5000 });
  }, [activeTool, persistDraft]);

  // Coach-confirmed camera ROM degree → rom[romKey(joint,axis)].
  const writeRomResult = useCallback(async (deg) => {
    const at = activeTool;
    if (!at || at.kind !== 'rom') return;
    const { spec } = at;
    const d = draftRef.current;
    const nextRom = applyRomResult(d.rom, spec, deg);
    const ok = await persistDraft(d.scores, nextRom, null);
    setActiveTool(null);
    setDraftVersion(x => x + 1);
    if (ok) toast(`Logged ${deg}° to ${spec.jointId} ${spec.axis}`, 'success', { ttl: 3500 });
    else toast('Could not save — check your connection and try again.', 'error', { ttl: 5000 });
  }, [activeTool, persistDraft]);

  // Prefill the jump-power bodyweight from the most recent evaluation that has one.
  const lastBodyweight = useMemo(() => {
    const withW = rows.filter(r => { const w = parseFloat(r?.weight_kg); return isFinite(w) && w > 0; })
      .sort((a, b) => String(b.eval_date).localeCompare(String(a.eval_date)));
    return withW.length ? parseFloat(withW[0].weight_kg) : null;
  }, [rows]);

  // Athlete stature (cm) → the broad-jump distance scale. Prefer the resolved
  // vitals/intake default, else the most recent evaluation that carries a height.
  const lastHeight = useMemo(() => {
    if (metaDefaults.height_cm > 0) return metaDefaults.height_cm;
    const withH = rows.filter(r => { const h = parseFloat(r?.height_cm); return isFinite(h) && h > 0; })
      .sort((a, b) => String(b.eval_date).localeCompare(String(a.eval_date)));
    return withH.length ? parseFloat(withH[0].height_cm) : null;
  }, [rows, metaDefaults]);

  if (loading) return null;

  const refined = isRefined5b();
  const PAD = 14;

  return (
    <div style={{
      background: 'var(--c-sf)',
      border: `1px solid var(--c-cardBd)`,
      borderRadius: 0, padding: PAD, marginBottom: 12,
      boxShadow: C.cardShadow,
    }}>
      {/* Cyan header strip — same vocabulary as every other dashboard /
          trainee-card section. Title + NEW EVAL button live on the strip. */}
      <RefinedHeaderStrip padY={PAD} padX={PAD} marginBottom={10}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: '0.04em', textTransform: 'uppercase', color: refined ? '#FFFFFF' : 'var(--c-tx)' }}>
            Evaluation ({rows.length})
          </span>
          <div style={{ display: 'flex', gap: 0 }}>
            <button onClick={openPicker}
              style={{
                background: 'transparent',
                border: `1px solid ${refined ? '#FFFFFF' : 'var(--c-ac)'}`,
                color: refined ? '#FFFFFF' : 'var(--c-ac)',
                padding: '3px 10px', borderRadius: 0, fontFamily: 'inherit', fontSize: 10,
                fontWeight: 700, letterSpacing: '0.12em', cursor: 'pointer',
              }}>CAMERA TEST</button>
            <button onClick={() => setEditing('new')}
              style={{
                background: 'transparent',
                border: `1px solid ${refined ? '#FFFFFF' : 'var(--c-ac)'}`, borderLeft: 'none',
                color: refined ? '#FFFFFF' : 'var(--c-ac)',
                padding: '3px 10px', borderRadius: 0, fontFamily: 'inherit', fontSize: 10,
                fontWeight: 700, letterSpacing: '0.12em', cursor: 'pointer',
              }}>+ NEW EVALUATION</button>
          </div>
        </div>
      </RefinedHeaderStrip>

      {/* CAMERA TEST picker — grouped by eval section, every camera-measurable
          test/ROM-axis with a LIVE or soon state. Picking one launches the tool
          below; results accumulate into one evaluation row. */}
      {picker && (
        <CameraTestPicker
          capturedScores={draftRef.current.scores}
          capturedRom={draftRef.current.rom}
          draftVersion={draftVersion}
          onPickTest={onPickTest}
          onPickRom={onPickRom}
          onClose={closePicker}
        />
      )}

      {/* Retake confirm — only when the field already holds a value in THIS
          administration; portal + backdrop-blocking (ConfirmDialog). */}
      <ConfirmDialog
        open={!!retake}
        title="Retake — overwrite result?"
        message={retake ? `${retake.label} already has ${retake.current} in this evaluation. Re-running the camera test will RE-CAPTURE and REPLACE that value. Continue?` : ''}
        onConfirm={() => { const r = retake; setRetake(null); r?.run(); }}
        onCancel={() => setRetake(null)}
      />

      {/* Jump test (svj/cmj/sl_jump/drop_jump/sl_pogo/broad_jump) → scores[id]. */}
      {activeTool?.kind === 'jump' && (
        <Suspense fallback={null}>
          <MovementLab
            initialMode="jump"
            jumpType={activeTool.map.jumpType || 'cmj'}
            exerciseTitle={`${activeTool.map.label}${activeTool.side ? ` · ${activeTool.side}` : ''}`}
            toolLabel={String(activeTool.map.label).toUpperCase()}
            captureCue={activeTool.map.cue || null}
            defaultBodyweightKg={metaDefaults.weight_kg ?? lastBodyweight}
            defaultHeightCm={lastHeight}
            onSaveJump={writeTestResult}
            onClose={() => setActiveTool(null)}
          />
        </Suspense>
      )}

      {/* Isometric hold-to-failure timer (iso_sl_stand/iso_dead_hang/iso_sa_pushup) → whole seconds. */}
      {activeTool?.kind === 'hold' && (
        <Suspense fallback={null}>
          <HoldTimer
            title={String(activeTool.map.label).toUpperCase()}
            side={activeTool.side}
            goal={activeTool.map.goal || activeTool.test.goal}
            onSave={writeTestResult}
            onClose={() => setActiveTool(null)}
          />
        </Suspense>
      )}

      {/* Camera goniometer — one joint axis, coach-confirmed degree → rom[key]. */}
      {activeTool?.kind === 'rom' && (
        <Suspense fallback={null}>
          <MovementLab
            initialMode="analyze"
            initialView="metrics"
            exerciseTitle={`${activeTool.spec.jointId} ${activeTool.spec.axis}`}
            toolLabel={`CAMERA ROM · ${activeTool.spec.jointId.toUpperCase()} ${activeTool.spec.axis.toUpperCase()}`}
            captureCue={activeTool.spec.cue || null}
            romSpec={activeTool.spec}
            onSaveRom={writeRomResult}
            onClose={() => setActiveTool(null)}
          />
        </Suspense>
      )}

      {rows.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--c-td)', padding: '6px 0 10px' }}>
          No evaluations yet. Run the protocol from ATH EVAL.xlsx in-person and log the scores here.
        </div>
      )}

      {/* Evaluations list — newest first; click any row to expand it */}
      {rows.map(e => (
        <EvalListRow key={e.id} evaluation={e} onOpenEditor={setEditing} />
      ))}

      {editing && (
        <EvaluationEditor
          trainee={trainee}
          existing={editing === 'new' ? null : editing}
          metaDefaults={metaDefaults}
          onSave={onSave}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// CAMERA TEST picker — grouped by eval section, listing every test/ROM-axis
// the camera can measure, with a LIVE ◉ button or a disabled "soon" chip so
// the coach sees the intended coverage without anything being faked. Picking a
// live test launches the matching tool (jump/hold/goniometer) in the parent,
// which writes the measured value back into the evaluation. Portaled to <body>
// (transform-safe fixed overlay), Esc/scrim-click closes.
// ──────────────────────────────────────────────────────────────────────
function CameraTestPicker({ onPickTest, onPickRom, onClose, capturedScores = {}, capturedRom = {} }) {
  useEscClose(true, onClose);

  // ✓ + measured value on anything already captured in THIS administration, so
  // the coach sees done-vs-remaining at a glance. Cyan check, Nord value.
  const doneTick = { fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--c-ac)' };

  const liveBtn = {
    fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
    padding: '4px 9px', borderRadius: 0, cursor: 'pointer',
    border: `1px solid var(--c-ac)`, background: 'transparent', color: 'var(--c-ac)',
    whiteSpace: 'nowrap',
  };
  const soonChip = {
    fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
    padding: '4px 9px', borderRadius: 0,
    border: `1px solid var(--c-cardBd)`, background: 'transparent', color: 'var(--c-td)',
    opacity: 0.6, whiteSpace: 'nowrap',
  };
  const rowStyle = {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
    padding: '8px 0', borderBottom: `1px solid var(--c-cardBd)`, flexWrap: 'wrap',
  };
  const sectionTitle = {
    fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.2em',
    color: 'var(--c-ac)', marginTop: 16, marginBottom: 6, paddingBottom: 5,
    borderBottom: `2px solid var(--c-ac)`,
  };

  // Test chips: a live TEST button (per-side for sided tests), or a "soon" chip.
  const renderTestChips = (test, map) => {
    if (map.status === 'soon') return <span style={soonChip}>◉ TEST · soon</span>;
    const sides = map.side ? ['L', 'R'] : [null];
    return (
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {sides.map(s => (
          <button key={s || 'x'} type="button" onClick={() => onPickTest(test, map, s)} style={liveBtn}>
            ◉ TEST{s ? ` · ${s}` : ''}
          </button>
        ))}
      </div>
    );
  };

  // Sections that carry at least one camera tool (Stability holds, Jumping).
  const toolSections = EVAL_SCHEMA.sections
    .map(s => ({ s, tests: s.tests.filter(t => toolForTest(t.id)) }))
    .filter(g => g.tests.length);

  return createPortal((
    <div onClick={onClose} role="dialog" aria-modal="true" aria-label="Camera test picker" style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 320,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px',
      overflowY: 'auto',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: isRefined5b() ? '#FFFFFF' : 'var(--c-bg)',
        border: `1px solid var(--c-ac)`, borderRadius: 0,
        padding: 22, maxWidth: 720, width: '100%',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
          <h2 style={{ margin: 0, fontFamily: FN, fontSize: 16, color: 'var(--c-tx)', letterSpacing: '0.08em' }}>
            CAMERA TEST
          </h2>
          <button onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'var(--c-tm)', cursor: 'pointer', fontSize: 18 }}>✕</button>
        </div>
        <div style={{ fontFamily: FB, fontSize: 12, color: 'var(--c-tm)', lineHeight: 1.5, marginBottom: 4 }}>
          Pick a test to measure with the camera. Each measured value logs into one evaluation for this athlete —
          run several in a row, then tap DONE. Only the axes the camera reads honestly are live; the rest stay manual.
        </div>

        {toolSections.map(({ s, tests }) => (
          <div key={s.id}>
            <div style={sectionTitle}>{s.title.toUpperCase()}</div>
            {tests.map(t => {
              const map = toolForTest(t.id);
              const done = testValueDisplay(capturedScores, t);
              return (
                <div key={t.id} style={rowStyle}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, color: 'var(--c-tx)', fontWeight: 600, lineHeight: 1.3 }}>{t.label}</div>
                    {t.goal && <div style={{ fontFamily: FN, fontSize: 10, color: 'var(--c-tm)', letterSpacing: '0.04em', marginTop: 2 }}>{t.goal}</div>}
                    {done != null && <div style={{ ...doneTick, marginTop: 3 }}>✓ {done}</div>}
                  </div>
                  {renderTestChips(t, map)}
                </div>
              );
            })}
          </div>
        ))}

        {/* Passive ROM — camera goniometer per axis. Live = sagittal/frontal
            axes a single 2D camera reads honestly; the rest show "soon". */}
        <div style={sectionTitle}>{EVAL_SCHEMA.rom.title.toUpperCase()}</div>
        <div style={{ fontFamily: FB, fontSize: 10.5, color: 'var(--c-ac)', marginBottom: 8, lineHeight: 1.5 }}>
          ◉ CAM reads active range from one clip (both sides), coach-confirmed. Rotations, neck, scapula, ankle and
          hyperextension stay manual — 2D pose can&apos;t see them honestly.
        </div>
        {EVAL_SCHEMA.rom.joints.map(j => (
          <div key={j.id} style={{ ...rowStyle, alignItems: 'flex-start' }}>
            <div style={{ fontFamily: FN, fontSize: 12, color: 'var(--c-tx)', fontWeight: 700, letterSpacing: '0.04em', minWidth: 110, paddingTop: 4 }}>
              {j.label}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end', flex: 1 }}>
              {j.axes.map(ax => {
                const spec = romAxisSpec(j.id, ax);
                if (!spec) return <span key={ax} style={soonChip}>{ax} · soon</span>;
                const captured = capturedRom?.[romKey(j.id, ax)];
                return (
                  <button key={ax} type="button" onClick={() => onPickRom(spec)}
                    style={captured != null && captured !== '' ? { ...liveBtn, borderColor: 'var(--c-ac)', color: 'var(--c-ac)' } : liveBtn}
                    title={spec.cue}>
                    {captured != null && captured !== '' ? `${ax} ✓ ${captured}°` : `${ax} ◉`}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
          <button onClick={onClose}
            style={{ padding: '10px 22px', borderRadius: 0, border: `1px solid var(--c-ac)`,
              background: 'transparent', color: 'var(--c-ac)', fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer' }}>DONE</button>
        </div>
      </div>
    </div>
  ), document.body);
}
