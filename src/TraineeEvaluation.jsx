// Athletic Evaluation surface on the trainee card. Mirrors the
// ATH EVAL.xlsx layout: section headers + per-test rows + per-joint ROM
// grid. Multiple evaluations render side-by-side (newest first, up to 3
// columns) so progression is visible at a glance.
//
// Collapsed by default — shows just the most-recent date + filled count
// + a "+ NEW EVAL" button. Click to expand into the full grid + an EDIT
// button per column to re-open the editor.

import React, { useMemo, useState } from 'react';
import { C, FN, FB } from './theme';
import { isRefined5b } from './ui';
import { EVAL_SCHEMA, romKey, countFilled } from './evaluationSchema';
import { useTraineeEvaluations } from './evaluationsData';
import EvaluationEditor from './EvaluationEditor';

const fmtDate = (s) => s ? new Date(s).toLocaleDateString() : '—';

const renderScore = (test, value) => {
  if (value == null || value === '') return '—';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  // sided non-composite: { L, R }
  if (Array.isArray(test.sides) && !test.composite) {
    const parts = test.sides.map(s => value[s] ? `${s}:${value[s]}` : null).filter(Boolean);
    return parts.length ? parts.join(' · ') : '—';
  }
  // non-sided composite: { partId: val }
  if (test.composite && !Array.isArray(test.sides)) {
    const parts = test.composite.map(p => value[p.id] ? `${p.label}:${value[p.id]}` : null).filter(Boolean);
    return parts.length ? parts.join(' · ') : '—';
  }
  // sided composite: { L: {...}, R: {...} }
  if (test.composite && Array.isArray(test.sides)) {
    const out = [];
    for (const s of test.sides) {
      const sideObj = value[s];
      if (!sideObj || typeof sideObj !== 'object') continue;
      const parts = test.composite.map(p => sideObj[p.id]).filter(v => v != null && v !== '');
      if (parts.length) out.push(`${s}:${parts.join('/')}`);
    }
    return out.length ? out.join(' · ') : '—';
  }
  return JSON.stringify(value);
};

// Comparison view = #/TEST/GOAL + N "Best Score" columns side-by-side,
// mirroring the BHBC xlsx layout exactly. Same column template across
// row types so headers, tests, and ROM axes all align vertically.
function ComparisonRow({ index, test, evals }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `28px minmax(170px, 1.5fr) minmax(95px, 0.9fr) repeat(${evals.length}, minmax(90px, 1fr))`,
      gap: 10, padding: '8px 0', alignItems: 'center',
      borderBottom: `1px solid var(--c-cardBd)`,
    }}>
      <div style={{ fontFamily: FN, fontSize: 10, color: 'var(--c-td)', fontWeight: 700 }}>{index}</div>
      <div style={{ fontSize: 12, color: 'var(--c-tx)', fontWeight: 600, lineHeight: 1.3 }}>{test.label}</div>
      <div style={{ fontFamily: FN, fontSize: 10, color: 'var(--c-tm)', letterSpacing: '0.04em', lineHeight: 1.3 }}>{test.goal || '—'}</div>
      {evals.map(e => {
        const v = renderScore(test, e.scores?.[test.id]);
        const filled = v && v !== '—';
        return (
          <div key={e.id} style={{
            fontFamily: FN, fontSize: 11,
            color: filled ? 'var(--c-tx)' : 'var(--c-td)',
            fontWeight: filled ? 700 : 400, textAlign: 'center',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{v || '—'}</div>
        );
      })}
    </div>
  );
}

function RomRow({ joint, axis, evals }) {
  const k = romKey(joint.id, axis);
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `28px minmax(170px, 1.5fr) minmax(95px, 0.9fr) repeat(${evals.length}, minmax(90px, 1fr))`,
      gap: 10, padding: '5px 0', alignItems: 'center',
      borderBottom: `1px solid var(--c-cardBd)`,
    }}>
      <div></div>
      <div style={{ fontSize: 11, color: 'var(--c-tm)', paddingLeft: 18 }}>{axis}</div>
      <div style={{ fontFamily: FN, fontSize: 10, color: 'var(--c-td)', letterSpacing: '0.04em' }}>degrees</div>
      {evals.map(e => {
        const val = e.rom?.[k];
        return (
          <div key={e.id} style={{
            fontFamily: FN, fontSize: 11,
            color: val ? 'var(--c-tx)' : 'var(--c-td)',
            fontWeight: val ? 700 : 400, textAlign: 'center',
          }}>{val || '—'}</div>
        );
      })}
    </div>
  );
}

export default function TraineeEvaluation({ trainee }) {
  const { rows, create, update, remove, loading } = useTraineeEvaluations(trainee?.id);
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(null);     // null | row-or-'new'
  const [showAll, setShowAll] = useState(false);

  // Compare up to 3 newest evals side-by-side; "show all" expands further.
  const compareEvals = useMemo(() => showAll ? rows : rows.slice(0, 3), [rows, showAll]);
  const latest = rows[0];
  const latestFilled = latest ? countFilled(latest.scores, latest.rom) : 0;

  const onSave = async (input) => {
    if (editing === 'new') return create(input);
    if (editing?.id) return update(editing.id, input);
  };

  if (loading) return null;

  return (
    <div style={{
      background: isRefined5b() ? '#FFFFFF' : 'var(--c-sf)',
      border: `1px solid ${rows.length ? 'var(--c-ac)' : 'var(--c-cardBd)'}`,
      borderLeft: rows.length ? `3px solid var(--c-ac)` : `1px solid var(--c-cardBd)`,
      borderRadius: 0, padding: 14, marginBottom: 12,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <div onClick={() => rows.length && setExpanded(!expanded)}
          style={{ cursor: rows.length ? 'pointer' : 'default' }}>
          <div style={{ fontSize: 9, fontFamily: FN, color: 'var(--c-tm)', letterSpacing: '0.18em', fontWeight: 700 }}>
            ATHLETIC EVALUATION ({rows.length})
          </div>
          {latest ? (
            <div style={{ fontSize: 11, fontFamily: FN, color: 'var(--c-td)', marginTop: 2 }}>
              Latest: {fmtDate(latest.eval_date)} · {latestFilled} fields filled
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--c-td)', marginTop: 4 }}>
              No evaluations yet. Run the protocol from ATH EVAL.xlsx in-person and log the scores here.
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {rows.length > 0 && (
            <button onClick={() => setExpanded(!expanded)}
              style={{
                background: 'transparent', border: `1px solid var(--c-cardBd)`, color: 'var(--c-tm)',
                padding: '4px 10px', borderRadius: 0, fontFamily: FN, fontSize: 10,
                fontWeight: 700, letterSpacing: '0.08em', cursor: 'pointer',
              }}>{expanded ? '▲ COLLAPSE' : '▼ EXPAND'}</button>
          )}
          <button onClick={() => setEditing('new')}
            style={{
              background: 'transparent', border: `1px solid var(--c-ac)`, color: 'var(--c-ac)',
              padding: '4px 10px', borderRadius: 0, fontFamily: FN, fontSize: 10,
              fontWeight: 700, letterSpacing: '0.08em', cursor: 'pointer',
            }}>+ NEW EVAL</button>
        </div>
      </div>

      {expanded && rows.length > 0 && (
        <div style={{ overflowX: 'auto', marginTop: 4 }}>
          {/* Column-header row with edit buttons per eval column.
              Template matches ComparisonRow + RomRow exactly so every
              row aligns vertically: # · TEST · GOAL · score columns. */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: `28px minmax(170px, 1.5fr) minmax(95px, 0.9fr) repeat(${compareEvals.length}, minmax(90px, 1fr))`,
            gap: 10, padding: '8px 0', alignItems: 'end',
            borderBottom: `2px solid var(--c-ac)`, marginBottom: 8,
          }}>
            <div style={{ fontFamily: FN, fontSize: 9, color: 'var(--c-tm)', letterSpacing: '0.18em', fontWeight: 700 }}>#</div>
            <div style={{ fontFamily: FN, fontSize: 9, color: 'var(--c-tm)', letterSpacing: '0.18em', fontWeight: 700 }}>TEST</div>
            <div style={{ fontFamily: FN, fontSize: 9, color: 'var(--c-tm)', letterSpacing: '0.18em', fontWeight: 700 }}>GOAL</div>
            {compareEvals.map(e => (
              <div key={e.id} style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: FN, fontSize: 11, color: 'var(--c-ac)', fontWeight: 700 }}>
                  {fmtDate(e.eval_date)}
                </div>
                <button onClick={() => setEditing(e)}
                  style={{
                    background: 'transparent', border: 'none', color: 'var(--c-tm)',
                    fontFamily: FN, fontSize: 9, letterSpacing: '0.1em', fontWeight: 700,
                    cursor: 'pointer', marginTop: 2, textDecoration: 'underline',
                  }}>EDIT</button>
              </div>
            ))}
          </div>

          {/* Sections */}
          {EVAL_SCHEMA.sections.map(s => (
            <div key={s.id} style={{ marginBottom: 18 }}>
              <div style={{
                fontFamily: FN, fontSize: 10, color: 'var(--c-ac)', letterSpacing: '0.2em',
                fontWeight: 700, marginBottom: 6, paddingBottom: 4, paddingTop: 6,
                borderBottom: `1px solid var(--c-ac)`,
              }}>{s.title.toUpperCase()}</div>
              {s.tests.map((t, ti) => (
                <ComparisonRow key={t.id} index={ti + 1} test={t} evals={compareEvals} />
              ))}
            </div>
          ))}

          {/* ROM grid */}
          <div style={{ marginBottom: 18 }}>
            <div style={{
              fontFamily: FN, fontSize: 10, color: 'var(--c-ac)', letterSpacing: '0.2em',
              fontWeight: 700, marginBottom: 6, paddingBottom: 4, paddingTop: 6,
              borderBottom: `1px solid var(--c-ac)`,
            }}>{EVAL_SCHEMA.rom.title.toUpperCase()}</div>
            {EVAL_SCHEMA.rom.joints.map(j => (
              <div key={j.id}>
                <div style={{ fontFamily: FN, fontSize: 11, color: 'var(--c-tx)', fontWeight: 700, marginTop: 10, marginBottom: 4, letterSpacing: '0.04em' }}>
                  {j.label}
                </div>
                {j.axes.map(ax => <RomRow key={ax} joint={j} axis={ax} evals={compareEvals} />)}
              </div>
            ))}
          </div>

          {/* Notes per eval column */}
          {compareEvals.some(e => e.notes) && (
            <div style={{
              display: 'grid', gridTemplateColumns: `290px repeat(${compareEvals.length}, 1fr)`,
              gap: 8, paddingTop: 8, borderTop: `1px solid var(--c-cardBd)`,
            }}>
              <div style={{ fontFamily: FN, fontSize: 9, color: 'var(--c-tm)', letterSpacing: '0.18em', fontWeight: 700 }}>NOTES</div>
              {compareEvals.map(e => (
                <div key={e.id} style={{ fontSize: 11, color: 'var(--c-tx)', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
                  {e.notes || '—'}
                </div>
              ))}
            </div>
          )}

          {rows.length > 3 && (
            <button onClick={() => setShowAll(!showAll)}
              style={{
                width: '100%', marginTop: 10, padding: '6px 0', background: 'transparent',
                border: `1px solid var(--c-cardBd)`, color: 'var(--c-tm)', fontFamily: FN, fontSize: 10,
                fontWeight: 700, letterSpacing: '0.12em', cursor: 'pointer',
              }}>{showAll ? `SHOW LATEST 3` : `SHOW ALL ${rows.length}`}</button>
          )}
        </div>
      )}

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
