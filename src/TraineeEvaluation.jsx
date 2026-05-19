// Athletic Evaluation surface on the trainee card. The card stays collapsed
// by default — it shows the count + a "+ NEW EVAL" button, then a list of
// previous evaluations as summary rows (date · age · weight · filled-count).
// Click a row to expand THAT eval inline into a clean single-column view
// of every section + ROM block.
//
// Multiple rows can be expanded simultaneously — useful for comparing two
// dates side-by-side by scrolling between them. The full-comparison grid
// from the previous version is gone (it was unreadable on narrow widths
// and forced an awkward two-level interaction).

import React, { useMemo, useState } from 'react';
import { fmtPrettyDate } from './dates';
import { C, FN, FB } from './theme';
import { isRefined5b, RefinedHeaderStrip } from './ui';
import { EVAL_SCHEMA, romKey, countFilled } from './evaluationSchema';
import { useTraineeEvaluations } from './evaluationsData';
import EvaluationEditor from './EvaluationEditor';

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
      gap: ROW_GAP, padding: '2px 0',
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
export default function TraineeEvaluation({ trainee }) {
  const { rows, create, update, loading } = useTraineeEvaluations(trainee?.id);
  const [editing, setEditing] = useState(null);

  const onSave = async (input) => {
    if (editing === 'new') return create(input);
    if (editing?.id) return update(editing.id, input);
  };

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
            Athletic Evaluation ({rows.length})
          </span>
          <button onClick={() => setEditing('new')}
            style={{
              background: 'transparent',
              border: `1px solid ${refined ? '#FFFFFF' : 'var(--c-ac)'}`,
              color: refined ? '#FFFFFF' : 'var(--c-ac)',
              padding: '3px 10px', borderRadius: 0, fontFamily: 'inherit', fontSize: 10,
              fontWeight: 700, letterSpacing: '0.12em', cursor: 'pointer',
            }}>+ NEW EVAL</button>
        </div>
      </RefinedHeaderStrip>

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
          onSave={onSave}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
