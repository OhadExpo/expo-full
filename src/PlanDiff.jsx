// PlanDiff — side-by-side comparison of two plans for one trainee. Surfaces
// from TraineeDetail's "Assigned Programs" header. Default pair is the two
// most recent blocks (the natural copy-forward case where Ohad wants to see
// what actually changed). Pickers let him override either side.
//
// Diff algorithm (per matching day-name across A and B):
//   - Pair B's exercises greedily with A's by exerciseId (first unused match).
//   - Unmatched B → ADDED (green).
//   - Unmatched A → REMOVED (red).
//   - Paired with any field delta → CHANGED (orange) with field-level diff.
//   - Otherwise SAME (dim).
// Days that exist only in one plan render as a whole "added day" or
// "removed day" block.
import React, { useEffect, useMemo, useState } from 'react';
import { C, FN, FB } from './theme';
import { Btn } from './ui';
import { useFullPlan } from './usePlansStore';

const FIELDS_TO_DIFF = ['sets', 'reps', 'load', 'rpe', 'tempo', 'rest', 'superset', 'notes', 'videoUrl'];

function fmtField(v) {
  if (v == null || v === '') return '—';
  return String(v);
}

function diffExercises(exA, exB) {
  const changes = [];
  for (const f of FIELDS_TO_DIFF) {
    const a = exA?.[f]; const b = exB?.[f];
    const aBlank = a == null || a === '';
    const bBlank = b == null || b === '';
    if (aBlank && bBlank) continue;
    if (String(a ?? '') !== String(b ?? '')) {
      changes.push({ field: f, before: a, after: b });
    }
  }
  // Wave (per-week reps) — array compare. Treat any change as a single "wk" delta.
  const wA = JSON.stringify(exA?.wk || null);
  const wB = JSON.stringify(exB?.wk || null);
  if (wA !== wB) changes.push({ field: 'wk', before: exA?.wk, after: exB?.wk });
  return changes;
}

// Pair B-exercises with A-exercises greedily by exerciseId. Returns rows
// of { kind, a, b, changes } in B's original order, with REMOVED rows
// appended at the end for A-exercises that found no match.
function pairExercises(dayA, dayB) {
  const rows = [];
  const usedA = new Set();
  const exsA = dayA?.exercises || [];
  const exsB = dayB?.exercises || [];

  for (const exB of exsB) {
    let matched = null;
    for (let i = 0; i < exsA.length; i++) {
      if (usedA.has(i)) continue;
      if (exsA[i].exerciseId && exsA[i].exerciseId === exB.exerciseId) { matched = i; break; }
    }
    if (matched != null) {
      usedA.add(matched);
      const changes = diffExercises(exsA[matched], exB);
      rows.push({ kind: changes.length ? 'changed' : 'same', a: exsA[matched], b: exB, changes });
    } else {
      rows.push({ kind: 'added', a: null, b: exB, changes: [] });
    }
  }
  for (let i = 0; i < exsA.length; i++) {
    if (usedA.has(i)) continue;
    rows.push({ kind: 'removed', a: exsA[i], b: null, changes: [] });
  }
  return rows;
}

// Build the full per-day diff structure for two plans.
function buildPlanDiff(planA, planB) {
  if (!planA || !planB) return null;
  const dayMap = new Map();
  for (const d of planA.days || []) dayMap.set(d.name || '(unnamed)', { a: d, b: null });
  for (const d of planB.days || []) {
    const key = d.name || '(unnamed)';
    const ex = dayMap.get(key);
    if (ex) ex.b = d; else dayMap.set(key, { a: null, b: d });
  }
  const days = [];
  for (const [name, { a, b }] of dayMap) {
    if (a && b) {
      const rows = pairExercises(a, b);
      const counts = rows.reduce((acc, r) => { acc[r.kind] = (acc[r.kind] || 0) + 1; return acc; }, {});
      days.push({ name, kind: 'paired', rows, counts });
    } else if (a) {
      days.push({ name, kind: 'day-removed', day: a });
    } else if (b) {
      days.push({ name, kind: 'day-added', day: b });
    }
  }
  return { days };
}

const KIND_COLOR = { added: C.gn, removed: C.rd, changed: C.or, same: C.tm };

function exTitle(ex, exercises) {
  if (!ex) return '';
  if (ex.title) return ex.title;
  const found = (exercises || []).find(e => e.id === ex.exerciseId);
  return found?.title || '(unknown exercise)';
}

function ExCell({ ex, side, kind, changes, exercises }) {
  if (!ex) {
    return (
      <div style={{ padding: '8px 10px', color: C.td, fontFamily: FB, fontSize: 12, fontStyle: 'italic' }}>
        —
      </div>
    );
  }
  const title = exTitle(ex, exercises);
  const fieldStyle = (highlight) => ({
    fontFamily: FN, fontSize: 11, color: highlight ? C.or : C.tm, letterSpacing: 0.5, fontWeight: 600,
  });
  const dim = kind === 'same';
  const prefix = ex.superset ? `${ex.superset} ` : '';
  // Highlight which fields changed when on the changed/paired branch.
  const changedSet = new Set((changes || []).map(c => c.field));
  return (
    <div style={{ padding: '8px 10px', borderLeft: `2px solid ${kind ? KIND_COLOR[kind] : C.tm}`, opacity: dim ? 0.55 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ color: C.tx, fontFamily: FB, fontSize: 13, fontWeight: 600 }}>{prefix}{title}</span>
        <span style={fieldStyle(changedSet.has('sets') || changedSet.has('reps') || changedSet.has('wk'))}>
          {fmtField(ex.sets)}×{fmtField(ex.wk ? (Array.isArray(ex.wk) ? ex.wk.join('>') : ex.wk) : ex.reps)}
        </span>
        {(ex.load || changedSet.has('load')) && (
          <span style={fieldStyle(changedSet.has('load'))}>{fmtField(ex.load)}</span>
        )}
        {(ex.rpe || changedSet.has('rpe')) && (
          <span style={fieldStyle(changedSet.has('rpe'))}>RPE {fmtField(ex.rpe)}</span>
        )}
        {(ex.tempo || changedSet.has('tempo')) && (
          <span style={fieldStyle(changedSet.has('tempo'))}>{fmtField(ex.tempo)}</span>
        )}
        {(ex.rest || changedSet.has('rest')) && (
          <span style={fieldStyle(changedSet.has('rest'))}>{fmtField(ex.rest)}s</span>
        )}
      </div>
      {ex.notes && (
        <div style={{ fontSize: 11, color: C.tm, marginTop: 4, fontFamily: FB, fontStyle: 'italic' }}>{ex.notes}</div>
      )}
    </div>
  );
}

function DayPair({ day, exercises, showSame }) {
  if (day.kind === 'day-added') {
    return (
      <div style={{ marginBottom: 16, border: `1px solid ${C.gn}`, padding: 10 }}>
        <div style={{ fontFamily: FN, fontSize: 11, color: C.gn, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 6 }}>
          + Day added: {day.name}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: `${C.ac}1a` }}>
          <div style={{ background: C.bg }}>
            <div style={{ padding: '8px 10px', color: C.td, fontFamily: FB, fontSize: 12, fontStyle: 'italic' }}>(not in plan A)</div>
          </div>
          <div style={{ background: C.bg }}>
            {(day.day.exercises || []).map((ex, i) => (
              <ExCell key={ex.id || i} ex={ex} side="b" kind="added" changes={[]} exercises={exercises} />
            ))}
          </div>
        </div>
      </div>
    );
  }
  if (day.kind === 'day-removed') {
    return (
      <div style={{ marginBottom: 16, border: `1px solid ${C.rd}`, padding: 10 }}>
        <div style={{ fontFamily: FN, fontSize: 11, color: C.rd, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 6 }}>
          − Day removed: {day.name}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: `${C.ac}1a` }}>
          <div style={{ background: C.bg }}>
            {(day.day.exercises || []).map((ex, i) => (
              <ExCell key={ex.id || i} ex={ex} side="a" kind="removed" changes={[]} exercises={exercises} />
            ))}
          </div>
          <div style={{ background: C.bg }}>
            <div style={{ padding: '8px 10px', color: C.td, fontFamily: FB, fontSize: 12, fontStyle: 'italic' }}>(not in plan B)</div>
          </div>
        </div>
      </div>
    );
  }

  const visibleRows = showSame ? day.rows : day.rows.filter(r => r.kind !== 'same');
  const c = day.counts || {};
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
        <div style={{ fontFamily: FN, fontSize: 12, color: C.tx, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{day.name}</div>
        {!!c.added && <span style={{ fontFamily: FN, fontSize: 10, color: C.gn, fontWeight: 700 }}>+{c.added}</span>}
        {!!c.removed && <span style={{ fontFamily: FN, fontSize: 10, color: C.rd, fontWeight: 700 }}>−{c.removed}</span>}
        {!!c.changed && <span style={{ fontFamily: FN, fontSize: 10, color: C.or, fontWeight: 700 }}>~{c.changed}</span>}
        {!!c.same && <span style={{ fontFamily: FN, fontSize: 10, color: C.tm, fontWeight: 600 }}>={c.same}</span>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: `${C.ac}26`, border: `0.25px solid ${C.ac}4D` }}>
        {visibleRows.map((row, i) => (
          <React.Fragment key={i}>
            <div style={{ background: C.bg }}>
              <ExCell ex={row.a} side="a" kind={row.kind === 'added' ? null : row.kind} changes={row.changes} exercises={exercises} />
            </div>
            <div style={{ background: C.bg }}>
              <ExCell ex={row.b} side="b" kind={row.kind === 'removed' ? null : row.kind} changes={row.changes} exercises={exercises} />
            </div>
          </React.Fragment>
        ))}
        {visibleRows.length === 0 && (
          <div style={{ gridColumn: '1 / -1', padding: '12px 10px', color: C.td, fontFamily: FB, fontSize: 12, background: C.bg }}>
            No changes in this day. Toggle "Show same" to view it.
          </div>
        )}
      </div>
    </div>
  );
}

// Pick A and B from the trainee's plan list. Defaults: B = newest, A = next-newest.
export default function PlanDiff({ open, onClose, traineePlans, exercises }) {
  // Plans should arrive newest-first (parent passes pre-sorted list).
  const newest = traineePlans?.[0];
  const next = traineePlans?.[1];
  const [aId, setAId] = useState(next?.id || null);
  const [bId, setBId] = useState(newest?.id || null);
  const [showSame, setShowSame] = useState(false);

  // Reset selections when the modal reopens with a different trainee.
  useEffect(() => {
    if (!open) return;
    setAId(traineePlans?.[1]?.id || traineePlans?.[0]?.id || null);
    setBId(traineePlans?.[0]?.id || null);
  }, [open, traineePlans]);

  const { plan: planA, load: loadA, clear: clearA } = useFullPlan();
  const { plan: planB, load: loadB, clear: clearB } = useFullPlan();

  useEffect(() => { if (open && aId) loadA(aId); else clearA(); }, [open, aId, loadA, clearA]);
  useEffect(() => { if (open && bId) loadB(bId); else clearB(); }, [open, bId, loadB, clearB]);

  const diff = useMemo(() => buildPlanDiff(planA, planB), [planA, planB]);

  if (!open) return null;

  const totals = (diff?.days || []).reduce((acc, d) => {
    if (d.kind === 'day-added') acc.dayAdded++;
    else if (d.kind === 'day-removed') acc.dayRemoved++;
    else {
      const c = d.counts || {};
      acc.added += c.added || 0;
      acc.removed += c.removed || 0;
      acc.changed += c.changed || 0;
    }
    return acc;
  }, { added: 0, removed: 0, changed: 0, dayAdded: 0, dayRemoved: 0 });

  const Picker = ({ value, onChange, label }) => (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: '0.18em', fontWeight: 700, marginBottom: 4 }}>{label}</div>
      <select value={value || ''} onChange={e => onChange(e.target.value || null)}
        style={{ width: '100%', background: 'transparent', border: `0.25px solid ${C.ac}4D`, borderRadius: 0, padding: '8px 10px', color: C.tx, fontFamily: FB, fontSize: 13, outline: 'none' }}>
        <option value="">(none)</option>
        {(traineePlans || []).map(p => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 30, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.bg, border: `0.25px solid ${C.ac}4D`, borderRadius: 0, width: 'min(1180px, 96vw)', maxHeight: '92vh', overflow: 'auto', padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontFamily: FN, fontSize: 14, color: C.tx, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>↔ Plan Diff</h3>
          <button onClick={onClose} style={{ background: 'transparent', border: `0.25px solid ${C.ac}4D`, color: C.tm, cursor: 'pointer', padding: '4px 10px', borderRadius: 0, fontSize: 14 }}>✕</button>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 14, flexWrap: 'wrap' }}>
          <Picker value={aId} onChange={setAId} label="Plan A (older / left)" />
          <div style={{ alignSelf: 'center', color: C.tm, fontFamily: FN, fontSize: 16, padding: '0 4px' }}>→</div>
          <Picker value={bId} onChange={setBId} label="Plan B (newer / right)" />
          <Btn variant="ghost" onClick={() => setShowSame(s => !s)} style={{ height: 36, padding: '0 12px', whiteSpace: 'nowrap' }}>
            {showSame ? '◧ Hide unchanged' : '◨ Show unchanged'}
          </Btn>
        </div>

        {(!planA || !planB) ? (
          <div style={{ padding: 30, color: C.td, fontFamily: FB, fontSize: 13, textAlign: 'center' }}>
            {(!aId || !bId) ? 'Pick two plans to compare.' : 'Loading plans…'}
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 16, padding: '8px 12px', border: `0.25px solid ${C.ac}4D`, marginBottom: 14, fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', flexWrap: 'wrap' }}>
              <span style={{ color: C.gn }}>+ {totals.added} added</span>
              <span style={{ color: C.rd }}>− {totals.removed} removed</span>
              <span style={{ color: C.or }}>~ {totals.changed} changed</span>
              {!!totals.dayAdded && <span style={{ color: C.gn }}>+ {totals.dayAdded} day{totals.dayAdded === 1 ? '' : 's'}</span>}
              {!!totals.dayRemoved && <span style={{ color: C.rd }}>− {totals.dayRemoved} day{totals.dayRemoved === 1 ? '' : 's'}</span>}
            </div>

            {/* Column headers — show plan names on each side. */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: `${C.ac}26`, border: `0.25px solid ${C.ac}4D`, marginBottom: 14 }}>
              <div style={{ background: C.bg, padding: '8px 10px' }}>
                <div style={{ fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: '0.18em', fontWeight: 700 }}>PLAN A</div>
                <div style={{ fontFamily: FB, fontSize: 13, color: C.tx, fontWeight: 600, marginTop: 2 }}>{planA.name}</div>
              </div>
              <div style={{ background: C.bg, padding: '8px 10px' }}>
                <div style={{ fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: '0.18em', fontWeight: 700 }}>PLAN B</div>
                <div style={{ fontFamily: FB, fontSize: 13, color: C.tx, fontWeight: 600, marginTop: 2 }}>{planB.name}</div>
              </div>
            </div>

            {(diff?.days || []).map((day, i) => (
              <DayPair key={`${day.name}-${i}`} day={day} exercises={exercises} showSame={showSame} />
            ))}

            {(diff?.days || []).length === 0 && (
              <div style={{ padding: 30, color: C.td, fontFamily: FB, fontSize: 13, textAlign: 'center' }}>
                Both plans have no days.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
