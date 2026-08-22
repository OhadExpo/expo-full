// ExerciseClassifyView — classify the ~91%-unclassified library at scale. Each
// unclassified exercise gets its taxonomy pre-filled by the title classifier;
// the coach reviews (edit any dropdown / skip), then Applies to the library.
// SAFE: writes only the exercise library store (never trainee plans), confirm-gated.
import React, { useState, useMemo } from 'react';
import { C, FN, FB, RESISTANCE_TYPES, BODY_POSITIONS, MOVEMENT_TYPES } from './theme';
import { Card, Btn, Select, Modal, EmptyState, toast } from './ui';
import { classify, isUnclassified } from './exerciseClassify';

const CAP = 150;

export default function ExerciseClassifyView({ exercises = [], setExercises }) {
  const [edits, setEdits] = useState({}); // exId -> { resistanceType, bodyPosition, movementType, skip }
  const [q, setQ] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [applying, setApplying] = useState(false);

  // Unclassified exercises with a title, ranked so the classifier's most complete
  // guesses come first (coach clears the reliable ones fastest).
  const items = useMemo(() => (exercises || [])
    .filter((e) => (e.title || e.t) && isUnclassified(e))
    .map((e) => ({ e, g: classify(e.title || e.t) }))
    .sort((a, b) => b.g.filled - a.g.filled), [exercises]);

  const filtered = useMemo(() => { const n = q.trim().toLowerCase(); return n ? items.filter(({ e }) => (e.title || e.t || '').toLowerCase().includes(n)) : items; }, [items, q]);
  const rows = showAll ? filtered : filtered.slice(0, CAP);
  const val = (ex, g, k) => { const d = edits[ex.id] || {}; return d[k] !== undefined ? d[k] : (ex[k] || g[k] || ''); };
  const setVal = (exId, k, v) => setEdits((p) => ({ ...p, [exId]: { ...p[exId], [k]: v } }));
  const toggleSkip = (exId) => setEdits((p) => ({ ...p, [exId]: { ...p[exId], skip: !(p[exId] && p[exId].skip) } }));

  // A row applies ONLY when the coach explicitly touched it — a dropdown edit
  // or "Fill all fully-guessed" (which copies guesses into edits). Raw guesses
  // for never-reviewed rows must NOT be batch-written (audit 08-22): guesses
  // prefill the dropdowns for display, but display is not consent.
  const editVal = (e, k) => { const d = edits[e.id] || {}; return d[k] !== undefined ? d[k] : (e[k] || ''); };
  const pending = items.filter(({ e }) => {
    const d = edits[e.id];
    if (!d || d.skip) return false;
    if (!['resistanceType', 'bodyPosition', 'movementType'].some((k) => d[k] !== undefined)) return false;
    const r = editVal(e, 'resistanceType'), b = editVal(e, 'bodyPosition'), m = editVal(e, 'movementType');
    const changed = r !== (e.resistanceType || '') || b !== (e.bodyPosition || '') || m !== (e.movementType || '');
    return changed && (r || b || m);
  });

  const acceptAllComplete = () => {
    const next = { ...edits };
    items.forEach(({ e, g }) => { if (g.filled === 3 && !next[e.id]) next[e.id] = { resistanceType: g.resistanceType, bodyPosition: g.bodyPosition, movementType: g.movementType }; });
    setEdits(next);
  };

  const apply = () => {
    setConfirm(false); setApplying(true);
    const patch = {};
    pending.forEach(({ e }) => { patch[e.id] = { resistanceType: editVal(e, 'resistanceType'), bodyPosition: editVal(e, 'bodyPosition'), movementType: editVal(e, 'movementType') }; });
    setExercises((prev) => (prev || []).map((ex) => patch[ex.id] ? { ...ex, ...patch[ex.id] } : ex));
    toast(`Classified ${pending.length} exercise${pending.length === 1 ? '' : 's'}`);
    setEdits({}); setApplying(false);
  };

  const th = { fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.tm };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 1150, margin: '0 auto', padding: '4px 0 60px' }}>
      <Card leftStripe={C.ac} header="Classify Library" headerRight={
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ ...th, color: '#fff' }}>{items.length} unclassified</span>
          <Btn variant="ghost" onClick={acceptAllComplete}>Fill all fully-guessed</Btn>
          <Btn disabled={!pending.length || applying} onClick={() => setConfirm(true)} style={{ background: pending.length ? C.ac : undefined, borderColor: pending.length ? C.ac : undefined, color: pending.length ? '#04121f' : undefined }}>
            {applying ? 'Applying…' : `Apply ${pending.length}`}
          </Btn>
        </div>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontFamily: FB, fontSize: 12.5, color: C.td }}>
            Taxonomy guessed from each title (CLAUDE.md set). Review, edit any dropdown, or skip. Applying writes only the library — never programs.
          </div>
          <input value={q} onChange={(e) => { setQ(e.target.value); setShowAll(false); }} placeholder="Filter by title (e.g. push-up, DB, squat) to classify in focused batches…"
            style={{ fontFamily: FB, fontSize: 13, color: C.tx, background: 'var(--c-sf)', border: `1px solid ${C.bd}`, borderRadius: 0, padding: '9px 11px', maxWidth: 480 }} />
        </div>
      </Card>

      {items.length === 0 ? (
        <EmptyState message="Every exercise is classified. Nothing to do here." />
      ) : (
        <Card>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 760 }}>
              <thead><tr style={{ borderBottom: `1px solid ${C.cardBd}` }}>
                <th style={{ ...th, padding: '8px 8px', textAlign: 'left' }}>Exercise</th>
                <th style={{ ...th, padding: '8px 8px' }}>Resistance</th>
                <th style={{ ...th, padding: '8px 8px' }}>Position</th>
                <th style={{ ...th, padding: '8px 8px' }}>Movement</th>
                <th style={{ ...th, padding: '8px 8px', width: 40 }} />
              </tr></thead>
              <tbody>
                {rows.map(({ e, g }) => {
                  const skip = (edits[e.id] || {}).skip;
                  const cell = { padding: '6px 8px', verticalAlign: 'middle' };
                  return (
                    <tr key={e.id} style={{ borderBottom: `0.25px solid ${C.cardBd}`, opacity: skip ? 0.45 : 1 }}>
                      <td style={{ ...cell, minWidth: 220 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: g.filled === 3 ? '#2E9E6B' : g.filled ? C.ac : '#E0A73A', flexShrink: 0 }} title={`${g.filled}/3 guessed`} />
                          <bdi style={{ fontFamily: FB, fontSize: 13, color: C.tx, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.title || e.t}</bdi>
                        </div>
                      </td>
                      <td style={cell}><Select options={RESISTANCE_TYPES} value={val(e, g, 'resistanceType')} onChange={(v) => setVal(e.id, 'resistanceType', v)} placeholder="—" /></td>
                      <td style={cell}><Select options={BODY_POSITIONS} value={val(e, g, 'bodyPosition')} onChange={(v) => setVal(e.id, 'bodyPosition', v)} placeholder="—" /></td>
                      <td style={cell}><Select options={MOVEMENT_TYPES} value={val(e, g, 'movementType')} onChange={(v) => setVal(e.id, 'movementType', v)} placeholder="—" /></td>
                      <td style={{ ...cell, textAlign: 'center' }}>
                        <button onClick={() => toggleSkip(e.id)} title={skip ? 'Un-skip' : 'Skip'} style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, color: skip ? C.ac : C.tm, background: 'transparent', border: `1px solid ${C.cardBd}`, padding: '4px 8px', cursor: 'pointer' }}>{skip ? '↺' : '✕'}</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!showAll && filtered.length > CAP && (
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <Btn variant="ghost" onClick={() => setShowAll(true)}>Show all {filtered.length}</Btn>
              <span style={{ fontFamily: FB, fontSize: 11.5, color: C.td, marginLeft: 10 }}>showing {CAP} — most-complete guesses first</span>
            </div>
          )}
        </Card>
      )}

      {confirm && (
        <Modal open onClose={() => setConfirm(false)} title="Apply classifications?">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontFamily: FB, fontSize: 13.5, color: C.tx }}>Write taxonomy to <strong>{pending.length}</strong> library exercise{pending.length === 1 ? '' : 's'}. This updates the library only — no athlete programs change.</div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Btn variant="ghost" onClick={() => setConfirm(false)}>Cancel</Btn>
              <Btn onClick={apply} style={{ background: C.ac, borderColor: C.ac, color: '#04121f' }}>Apply {pending.length}</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
