// ExerciseCleanupView — one screen listing every "trash exercise" candidate in
// the library (set/rep numbers, superset markers, warmup/%/RPE notes, tempo
// prescriptions, note-like titles) so the coach reviews and DELETES them
// himself (Ohad 2026-08-21: "find the trash exercises and show me on one
// screen which ones they are so I can delete them").
//
// Detection is heuristic and errs WIDE: rows are grouped into "definite" (auto
// checked) and "suspicious" (unchecked — coach opts in). Nothing is deleted
// without the explicit confirm. Plan rows that referenced a deleted entry
// become unresolved and surface in the Matching screen — the designed funnel.
import React, { useState, useEffect, useMemo } from 'react';
import { C, FN, FB } from './theme';
import { Card, Btn, EmptyState, ConfirmDialog, toast } from './ui';
import { normTitle } from './exerciseMatch';
import { supabase } from './supabase';

// Returns { level: 'definite'|'suspicious', reason } or null.
export function trashVerdict(title) {
  const t = String(title || '').trim();
  if (!t) return { level: 'definite', reason: 'empty title' };
  // A multi-word "<exercises> Superset" is likely a REAL combo (e.g. "KB Swing +
  // Squat Superset") — only bare markers are definite (audit 08-22).
  if (/superset/i.test(t) && /\w+\s+\w+.*superset/i.test(t) && !/חסר תרגיל|super exercies/i.test(t)) return { level: 'suspicious', reason: 'superset combo — real pairing?' };
  if (/^[\d\s,.*x×+\-–/%@()]+$/.test(t)) return { level: 'definite', reason: 'set/rep numbers' };
  if (/superset|חסר תרגיל|super exercies|super exercise/i.test(t)) return { level: 'definite', reason: 'superset marker' };
  if (/warm.?up set|% of (day|last)|of last (week|block)|last week|next week/i.test(t)) return { level: 'definite', reason: 'warmup / % note' };
  if (/\brpe\s*\d/i.test(t)) return { level: 'definite', reason: 'RPE note' };
  if (/^backoff set/i.test(t)) return { level: 'definite', reason: 'backoff prefix' };
  if (/last\/extra|extra for \d/i.test(t)) return { level: 'definite', reason: 'set-count note' };
  // "each side / per side / for time / as needed" can decorate REAL exercises —
  // suspicious, never pre-checked (audit 08-22).
  if (/\bfor time\b|as needed|if needed|each side|per side/i.test(t)) return { level: 'suspicious', reason: 'instruction wording' };
  if (/^\d[\d\s,.*x×\-–/+%@]*\s+\d+\s*second (down|up|pause)/i.test(t)) return { level: 'definite', reason: 'tempo prescription' };
  if (/^[\^]+.*[\^]+$/.test(t)) return { level: 'definite', reason: 'marker' };
  if (/^\d+ handed/i.test(t)) return { level: 'definite', reason: 'instruction note' };
  if (/^\d+(\s*[-–]\s*\d+)?\s*(sec|second|seconds|min|minutes)\b/i.test(t) && !/sprint|run|jog|hold|plank|iso|hang|carry|bike|row|jump|skip|walk|sit|wall|erg|crawl|squat|march/i.test(t)) return { level: 'suspicious', reason: 'time note' };
  // wider net — coach decides
  const letters = (t.match(/[a-zA-Zא-ת]/g) || []).length;
  if (letters / t.length < 0.45) return { level: 'suspicious', reason: 'mostly numbers/symbols' };
  if (/%|@/.test(t)) return { level: 'suspicious', reason: 'contains % / @' };
  if (/\b\d+\s*[x×*]\s*\d+\b/.test(t)) return { level: 'suspicious', reason: 'looks like sets×reps' };
  if (/\bday [abc]\b/i.test(t)) return { level: 'suspicious', reason: 'references a plan day' };
  if (t.length <= 2) return { level: 'suspicious', reason: 'too short' };
  return null;
}

export default function ExerciseCleanupView({ exercises = [], setExercises }) {
  const [plans, setPlans] = useState(null);
  const [checked, setChecked] = useState(null); // Set of ids; null = not initialized
  const [confirm, setConfirm] = useState(false);

  useEffect(() => { let stop = false; (async () => {
    const { data } = await supabase.from('plans').select('id,data');
    if (!stop) setPlans(data || []);
  })(); return () => { stop = true; }; }, []);

  // plan-row reference counts (by id and by normalized title)
  const refs = useMemo(() => {
    const byId = new Map(); const byTitle = new Map();
    for (const p of plans || []) {
      for (const d of (p.data && p.data.days) || []) {
        const list = Array.isArray(d.exercises) ? d.exercises : (Array.isArray(d.ex) ? d.ex : []);
        for (const e of list) {
          const id = e.exerciseId || e.eid; if (id) byId.set(id, (byId.get(id) || 0) + 1);
          const tn = normTitle(e.title || e.t); if (tn) byTitle.set(tn, (byTitle.get(tn) || 0) + 1);
        }
      }
    }
    return { byId, byTitle };
  }, [plans]);

  const rows = useMemo(() => (exercises || [])
    .map((ex) => { const v = trashVerdict(ex.title || ex.t); return v ? { ex, ...v } : null; })
    .filter(Boolean)
    .map((r) => ({ ...r, idRefs: refs.byId.get(r.ex.id) || 0, titleRefs: refs.byTitle.get(normTitle(r.ex.title || r.ex.t)) || 0 }))
    .sort((a, b) => (a.level === b.level ? String(a.ex.title).localeCompare(String(b.ex.title)) : a.level === 'definite' ? -1 : 1)),
  [exercises, refs]);

  // initialize checks once rows exist: definite pre-checked, suspicious not
  useEffect(() => {
    // Pre-check ONLY definite rows with zero plan references and no video/cues —
    // anything referenced or carrying media waits for the coach's eye (audit 08-22).
    if (checked === null && rows.length) setChecked(new Set(rows.filter((r) => r.level === 'definite' && r.idRefs === 0 && r.titleRefs === 0 && !r.ex.videoLink && !(r.ex.cues || r.ex.notes)).map((r) => r.ex.id)));
  }, [rows, checked]);

  const sel = checked || new Set();
  const toggle = (id) => setChecked((prev) => { const n = new Set(prev || []); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const setAll = (level, on) => setChecked((prev) => { const n = new Set(prev || []); rows.filter((r) => !level || r.level === level).forEach((r) => { if (on) n.add(r.ex.id); else n.delete(r.ex.id); }); return n; });

  const doDelete = () => {
    setConfirm(false);
    const killed = rows.filter((r) => sel.has(r.ex.id)).length;
    setExercises((prev) => (prev || []).filter((ex) => !sel.has(ex.id)));
    setChecked(new Set());
    toast(`${killed} trash entr${killed === 1 ? 'y' : 'ies'} deleted — affected plan rows now appear in Matching`);
  };

  const th = { fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.tm };
  const nDef = rows.filter((r) => r.level === 'definite').length;
  const nSus = rows.length - nDef;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1100, margin: '0 auto', padding: '4px 0 60px' }}>
      <Card leftStripe={C.or} header="Library Cleanup" headerRight={
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ ...th, color: '#fff' }}>{rows.length} flagged · {sel.size} selected</span>
          <Btn variant="ghost" onClick={() => setAll(null, true)}>Select all</Btn>
          <Btn variant="ghost" onClick={() => setAll(null, false)}>Clear</Btn>
          <Btn disabled={!sel.size} onClick={() => setConfirm(true)} style={{ background: sel.size ? '#DE4E3B' : undefined, borderColor: sel.size ? '#DE4E3B' : undefined, color: sel.size ? '#fff' : undefined }}>Delete {sel.size} selected</Btn>
        </div>}>
        <div style={{ fontFamily: FB, fontSize: 12.5, color: C.td }}>
          Entries that look like set/rep prescriptions, warmup notes or markers — not real exercises. <b style={{ color: C.tx }}>{nDef} definite</b>, <b style={{ color: C.tx }}>{nSus} suspicious</b>. Pre-checked = definite AND unreferenced AND no video/cues; everything else waits for your eye. Deleting sends any plan rows that used them to the Matching screen to be re-pointed at real exercises.
        </div>
      </Card>

      {plans === null ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.tm, fontFamily: FN, letterSpacing: '0.18em' }}>SCANNING…</div>
      ) : rows.length === 0 ? (
        <EmptyState message="Library is clean — no trash-looking entries detected." />
      ) : (
        <Card>
          {/* Five fixed columns need 388px before the title column gets a pixel;
              at 390px the "Has" and "Plan rows" columns were pushed 72px past
              the viewport and simply could not be read (mobile sweep 08-25).
              The table scrolls inside its OWN container — the page never does. */}
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <div style={{ minWidth: 420, display: 'grid', gridTemplateColumns: '28px 1fr 170px 90px 60px', gap: 10, padding: '0 2px 8px', borderBottom: `1px solid ${C.bd}`, ...th }}>
            <span /><span>Title</span><span>Why flagged</span><span style={{ textAlign: 'center' }}>Plan rows</span><span style={{ textAlign: 'center' }}>Has</span>
          </div>
          <div style={{ minWidth: 420, display: 'flex', flexDirection: 'column' }} data-allow-copy>
            {rows.map((r) => (
              <label key={r.ex.id} style={{ display: 'grid', gridTemplateColumns: '28px 1fr 170px 90px 60px', gap: 10, alignItems: 'center', padding: '7px 2px', borderBottom: `0.25px solid ${C.bd}`, cursor: 'pointer', opacity: sel.has(r.ex.id) ? 1 : 0.72 }}>
                <input type="checkbox" checked={sel.has(r.ex.id)} onChange={() => toggle(r.ex.id)} style={{ accentColor: '#DE4E3B', width: 15, height: 15 }} />
                <span style={{ fontFamily: FN, fontSize: 12.5, fontWeight: 600, color: C.tx, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.ex.title || r.ex.t}>{r.ex.title || r.ex.t}</span>
                <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: r.level === 'definite' ? '#DE4E3B' : C.or }}>{r.reason}</span>
                <span style={{ fontFamily: FN, fontSize: 11, color: (r.idRefs + r.titleRefs) ? C.or : C.td, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{Math.max(r.idRefs, r.titleRefs) || '—'}</span>
                <span style={{ textAlign: 'center', fontFamily: FN, fontSize: 9 }}>
                  {r.ex.videoLink && <span style={{ color: C.ac }} title="has video">▶ </span>}
                  {(r.ex.cues || r.ex.notes) && <span style={{ color: C.tm }} title="has cues/notes">✎</span>}
                </span>
              </label>
            ))}
          </div>
          </div>
        </Card>
      )}

      <ConfirmDialog open={confirm} onCancel={() => setConfirm(false)} onConfirm={doDelete}
        title="Delete trash entries?"
        message={`Permanently removes ${sel.size} librar${sel.size === 1 ? 'y entry' : 'y entries'}. Plan rows that used them lose their link and will appear in the Matching screen for re-pointing. A dated backup of the library exists from today.`} />
    </div>
  );
}
