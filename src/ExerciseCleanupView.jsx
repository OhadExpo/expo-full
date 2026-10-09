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
import { Card, Btn, EmptyState, ConfirmDialog, toast, JoinedButtons, usePhone } from './ui';
import { normTitle } from './exerciseMatch';
import { supabase } from './supabase';
import { useT, useTB, readLang } from './i18n';

// Returns { level: 'definite'|'suspicious', reason } or null.
export function trashVerdict(title) {
  const t = String(title || '').trim();
  if (!t) return { level: 'definite', reason: 'empty title' };
  // A multi-word "<exercises> Superset" is likely a REAL combo (e.g. "KB Swing +
  // Squat Superset") — only bare markers are definite (audit 08-22).
  if (/superset/i.test(t) && /\w+\s+\w+.*superset/i.test(t) && !/חסר תרגיל|super exercies/i.test(t)) return { level: 'suspicious', reason: 'superset combo — real pairing?' };
  if (/^[\d\s,.*x×+\-–/%@()]+$/.test(t)) return { level: 'definite', reason: 'set/rep numbers' };
  if (/super\s?set|חסר תרגיל|super exercies|super exercise/i.test(t)) return { level: 'definite', reason: 'superset marker' };   // 'Super Set:' (with a space) slipped through (#620)
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
  const tt = useT();
  const tb = useTB();
  const phone = usePhone();
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
    toast(`${killed} ${tt(killed === 1 ? 'trash entry deleted' : 'trash entries deleted')} — ${tt('affected plan rows now appear in Matching')}`);
  };

  const th = { fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.tm };
  const nDef = rows.filter((r) => r.level === 'definite').length;
  const nSus = rows.length - nDef;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1100, margin: '0 auto', padding: '4px 0 60px' }}>
      <Card leftStripe={C.or} header={tt('Library Cleanup')}>
        {/* The page's actions, moved out of the title strip into the body (26.9: a title box is ONE row — a toolbar of counts and long buttons never fits one row on a phone). */}
        {/* ONE STATS LINE, ONE JOINED ROW OF ACTIONS, A SHORT NOTE (9.10, after #619 on Classify:
            three boxes of different widths over two rows and a paragraph of capitals) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ ...th, display: 'flex', flexWrap: 'wrap', columnGap: 14, rowGap: 4 }}>
            <span>{rows.length} {tt('flagged')}</span>
            {/* plural after a number in Hebrew: 'ודאיים / חשודים' (the row tags keep 'ודאי / חשוד') */}
            <span style={{ color: C.rd }}>{nDef} {readLang() === 'he' ? 'ודאיים' : tt('definite')}</span>
            <span style={{ color: C.or }}>{nSus} {readLang() === 'he' ? 'חשודים' : tt('suspicious')}</span>
            <span style={{ color: sel.size ? C.tx : C.tm }}>{sel.size} {tt('selected')}</span>
          </div>
          <JoinedButtons items={[
            { label: tb('Select all'), onClick: () => setAll(null, true) },
            { label: tb('Clear'), onClick: () => setAll(null, false), disabled: !sel.size },
            { label: <>{tb('Delete')}{' '}{sel.size}</> /* tb() is an element - in a template string it printed [object Object] */, onClick: () => setConfirm(true), disabled: !sel.size, tone: 'danger' },
          ]} />
          <div style={{ fontFamily: FB, fontSize: 12, color: C.tm, lineHeight: 1.5, maxWidth: 560 }}>
            {tt('Pre-checked: definite, in no plan, no video or cues. Deleting sends any plan row that used one to Matching.')}
          </div>
        </div>
      </Card>

      {plans === null ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.tm, fontFamily: FN, letterSpacing: '0.18em' }}>{tt('SCANNING…')}</div>
      ) : rows.length === 0 ? (
        <EmptyState message={tt('Library is clean — no trash-looking entries detected.')} />
      ) : (
        <Card>
          {/* Five fixed columns need 388px before the title column gets a pixel;
              at 390px the "Has" and "Plan rows" columns were pushed 72px past
              the viewport and simply could not be read (mobile sweep 08-25).
              The table scrolls inside its OWN container — the page never does.
              minWidth was 420, which is only 32px more than the fixed tracks, so
              the 1fr title column got 28px and a superset name lost 333px of
              itself. 700 leaves the title 312px; the container still scrolls. */}
          {phone ? (
            // A PHONE GETS ROWS, NOT A 700px TABLE (9.10, after #619): the box and the whole
            // title, then why it was flagged, its plan rows and its video/cues on one line
            <div style={{ marginTop: -12 }} data-allow-copy>
              {rows.map((r) => (
                <label key={r.ex.id} style={{ display: 'grid', gridTemplateColumns: '24px minmax(0, 1fr)', columnGap: 10, rowGap: 4, alignItems: 'start', padding: '10px 0', borderBottom: `1px solid ${C.cardBd}`, cursor: 'pointer' }}>
                  <input type="checkbox" checked={sel.has(r.ex.id)} onChange={() => toggle(r.ex.id)} style={{ accentColor: '#DE4E3B', width: 18, height: 18, margin: '1px 0 0' }} />
                  <span style={{ fontFamily: FN, fontSize: 13, fontWeight: 700, color: C.tx, minWidth: 0, overflowWrap: 'break-word', unicodeBidi: 'plaintext', textAlign: readLang() === 'he' ? 'right' : 'left' }}>{r.ex.title || r.ex.t}</span>
                  <span />
                  <span style={{ display: 'flex', flexWrap: 'wrap', columnGap: 12, rowGap: 2, fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                    <span style={{ color: r.level === 'definite' ? '#DE4E3B' : C.or }}>{tt(r.reason)}</span>
                    <span style={{ color: (r.idRefs + r.titleRefs) ? C.or : C.td }}>{tt('Plan rows')} {Math.max(r.idRefs, r.titleRefs) || 0}</span>
                    {r.ex.videoLink && <span style={{ color: C.ac }}>▶ {tt('has video')}</span>}
                    {(r.ex.cues || r.ex.notes) && <span style={{ color: C.tm }}>✎ {tt('has cues/notes')}</span>}
                  </span>
                </label>
              ))}
            </div>
          ) : (
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <div style={{ minWidth: 700, display: 'grid', gridTemplateColumns: '28px 1fr 170px 90px 60px', gap: 10, padding: '0 2px', minHeight: 36, boxSizing: 'border-box', alignItems: 'center' /* a header row is a row: 36 (OCD #494: 19) */, borderBottom: `1px solid ${C.bd}`, ...th }}>
            <span /><span>{tt('Title')}</span><span>{tt('Why flagged')}</span><span style={{ textAlign: 'center' }}>{tt('Plan rows')}</span><span style={{ textAlign: 'center' }}>{tt('Has')}</span>
          </div>
          <div style={{ minWidth: 700, display: 'flex', flexDirection: 'column' }} data-allow-copy>
            {rows.map((r) => (
              <label key={r.ex.id} style={{ display: 'grid', gridTemplateColumns: '28px 1fr 170px 90px 60px', gap: 10, alignItems: 'center', padding: '7px 2px', minHeight: 36, boxSizing: 'border-box' /* 30-33 -> 36 (OCD #494) */, borderBottom: `1px solid ${C.bd}`, cursor: 'pointer', opacity: sel.has(r.ex.id) ? 1 : 0.72 }}>
                <input type="checkbox" checked={sel.has(r.ex.id)} onChange={() => toggle(r.ex.id)} style={{ accentColor: '#DE4E3B', width: 15, height: 15 }} />
                <span style={{ fontFamily: FN, fontSize: 12.5, fontWeight: 600, color: C.tx, minWidth: 0, overflowWrap: 'break-word', unicodeBidi: 'plaintext', textAlign: readLang() === 'he' ? 'right' : 'left' /* the order follows the text, the alignment stays the screen's (plaintext makes 'start' follow the title) - with dir=auto a Latin title sat on the left edge of a Hebrew table and was cut */ }} title={r.ex.title || r.ex.t}>{r.ex.title || r.ex.t}</span>
                <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: r.level === 'definite' ? '#DE4E3B' : C.or }}>{tt(r.reason)}</span>
                <span style={{ fontFamily: FN, fontSize: 11, color: (r.idRefs + r.titleRefs) ? C.or : C.td, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{Math.max(r.idRefs, r.titleRefs) || '—'}</span>
                <span style={{ textAlign: 'center', fontFamily: FN, fontSize: 9 }}>
                  {r.ex.videoLink && <span style={{ color: C.ac }} title={tt('has video')}>▶ </span>}
                  {(r.ex.cues || r.ex.notes) && <span style={{ color: C.tm }} title={tt('has cues/notes')}>✎</span>}
                </span>
              </label>
            ))}
          </div>
          </div>
          )}
        </Card>
      )}

      <ConfirmDialog open={confirm} onCancel={() => setConfirm(false)} onConfirm={doDelete}
        title={tt('Delete trash entries?')}
        message={`${tt('Permanently removes')} ${sel.size} ${tt(sel.size === 1 ? 'library entry' : 'library entries')}. ${tt('Plan rows that used them lose their link and will appear in the Matching screen for re-pointing. A dated backup of the library exists from today.')}`} />
    </div>
  );
}
