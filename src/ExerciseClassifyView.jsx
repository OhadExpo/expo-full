// ExerciseClassifyView — classify the ~91%-unclassified library at scale. Each
// unclassified exercise gets its taxonomy pre-filled by the title classifier;
// the coach reviews (edit any dropdown / skip), then Applies to the library.
// SAFE: writes only the exercise library store (never trainee plans), confirm-gated.
import React, { useState, useMemo, useEffect } from 'react';
import { C, FN, FB, RESISTANCE_TYPES, BODY_POSITIONS, MOVEMENT_TYPES } from './theme';
import { Card, Btn, Select, Modal, EmptyState, toast, JoinedButtons } from './ui';
import { classify, isUnclassified } from './exerciseClassify';
import { useT, readLang } from './i18n';

const CAP = 150;
// colour of a guess: all three / some / none - said in words beside it, never a lone dot
// a long 'A/B' name breaks after its slash, never mid-word ('PROTRACTION/RETRA-CTION' at 390)
const slashWbr = (t) => String(t || '').split('/').flatMap((part, i, all) => (i < all.length - 1 ? [part, '/', <wbr key={i} />] : [part]));
const GUESS_INK = (n) => (n === 3 ? '#2E9E6B' : n ? C.ac : '#E0A73A');

// A PHONE GETS CARDS, NOT A TABLE (9.10 #619, Ohad: "This can look much better. Lacking
// design"): at 390 the table showed only the names - the three dropdowns the screen is for
// sat off to the right. Each exercise is a card: its name and how much was guessed, then
// the three categories as one joined list (label | dropdown), 36px rows.
function usePhone(max = 600) {
  const q = `(max-width: ${max}px)`;
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => { const mq = window.matchMedia(q); const on = () => setM(mq.matches); if (mq.addEventListener) { mq.addEventListener('change', on); return () => mq.removeEventListener('change', on); } mq.addListener(on); return () => mq.removeListener(on); /* Safari < 14 */ }, [q]);
  return m;
}
const CELL_SELECT = { width: '100%', height: 36, boxSizing: 'border-box', border: 'none', borderRadius: 0, background: 'var(--c-sf)', color: C.tx, fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', padding: '0 10px', appearance: 'none', WebkitAppearance: 'none', outline: 'none', textAlign: 'start' };
const PHONE_FIELDS = [['resistanceType', 'Resistance', RESISTANCE_TYPES], ['bodyPosition', 'Position', BODY_POSITIONS], ['movementType', 'Movement', MOVEMENT_TYPES]];
function PhoneRow({ e, g, skip, val, setVal, toggleSkip, tt }) {
  return (
    <div style={{ padding: '12px 0', borderBottom: `1px solid ${C.cardBd}`, opacity: skip ? 0.45 : 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <bdi style={{ flex: '1 1 0', minWidth: 0, fontFamily: FB, fontSize: 13, fontWeight: 700, color: C.tx, overflowWrap: 'break-word', wordBreak: 'normal' }}>{slashWbr(e.title || e.t)}</bdi>
        <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: GUESS_INK(g.filled), whiteSpace: 'nowrap' }}>{tt('{n}/3 guessed').replace('{n}', g.filled)}</span>
        <button type="button" onClick={() => toggleSkip(e.id)} aria-label={skip ? tt('Un-skip') : tt('Skip')} title={skip ? tt('Un-skip') : tt('Skip')} style={{ width: 36, height: 36, flexShrink: 0, boxSizing: 'border-box', fontFamily: FN, fontSize: 12, fontWeight: 700, color: skip ? C.ac : C.tm, background: 'transparent', border: `1px solid ${C.cardBd}`, cursor: 'pointer' }}>{skip ? '↺' : '✕'}</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(84px, auto) minmax(0, 1fr)', gap: 1, background: C.cardBd, border: `1px solid ${C.cardBd}` }}>
        {PHONE_FIELDS.map(([k, label, opts]) => (
          <React.Fragment key={k}>
            <span style={{ display: 'flex', alignItems: 'center', padding: '0 10px', background: 'var(--c-sf2)', fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.tm }}>{tt(label)}</span>
            <span style={{ display: 'flex' }}>
              <select aria-label={tt(label)} value={val(e, g, k) || ''} onChange={(ev) => setVal(e.id, k, ev.target.value)} style={{ ...CELL_SELECT, color: val(e, g, k) ? C.tx : C.td }}>
                <option value="" disabled hidden>—</option>
                {opts.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </span>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

export default function ExerciseClassifyView({ exercises = [], setExercises }) {
  const tt = useT();
  const phone = usePhone();
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
    toast(readLang() === 'he' ? (pending.length === 1 ? 'סווג תרגיל אחד' : `סווגו ${pending.length} תרגילים`) : `Classified ${pending.length} exercise${pending.length === 1 ? '' : 's'}`);
    setEdits({}); setApplying(false);
  };

  const th = { fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.tm };
  const fullyGuessed = items.filter(({ g }) => g.filled === 3).length;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 1150, margin: '0 auto', padding: '4px 0 60px' }}>
      <Card leftStripe={C.ac} header={tt('Classify Library')}>
        {/* ONE STATS LINE, ONE JOINED PAIR OF ACTIONS, A SHORT NOTE (9.10 #619): the actions were two
            lone boxes of different widths, the note a grey paragraph of capitals. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ ...th, color: C.tm, display: 'flex', flexWrap: 'wrap', columnGap: 14, rowGap: 4 }}>
            <span>{items.length} {tt('unclassified')}</span>
            <span style={{ color: GUESS_INK(3) }}>{fullyGuessed} {tt('fully guessed')}</span>
            <span style={{ color: pending.length ? C.ac : C.tm }}>{pending.length} {tt('ready to apply')}</span>
          </div>
          <JoinedButtons items={[
            { label: tt('Fill all 3/3'), onClick: acceptAllComplete },
            { label: applying ? tt('Applying…') : `${tt('Apply')} ${pending.length}`, onClick: () => setConfirm(true), disabled: !pending.length || applying, tone: 'accent' },
          ]} />
          <div style={{ fontFamily: FB, fontSize: 12, color: C.tm, lineHeight: 1.5, maxWidth: 560 }}>
            {tt('Guesses come from each title. Change any, skip any - Apply writes the library only, never programs.')}
          </div>
          <input type="text" value={q} onChange={(e) => { setQ(e.target.value); setShowAll(false); }} placeholder={tt('Filter by title…')} aria-label={tt('Filter by title…')}
            style={{ textAlign: 'start', fontFamily: FB, fontSize: 13, color: C.tx, background: 'var(--c-sf)', border: `1px solid ${C.bd}`, borderRadius: 0, padding: '0 11px', height: 36, boxSizing: 'border-box', maxWidth: 560 }} />
        </div>
      </Card>

      {items.length === 0 ? (
        <EmptyState message="Every exercise is classified. Nothing to do here." />
      ) : (
        <Card>
          {phone ? (
            <div style={{ marginTop: -12 }}>
              {rows.map(({ e, g }) => <PhoneRow key={e.id} e={e} g={g} skip={!!(edits[e.id] || {}).skip} val={val} setVal={setVal} toggleSkip={toggleSkip} tt={tt} />)}
            </div>
          ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 760 }}>
              <thead><tr style={{ borderBottom: `1px solid ${C.cardBd}` }}>
                <th style={{ ...th, padding: '8px 8px', textAlign: 'start' }}>{tt('Exercise')}</th>
                <th style={{ ...th, padding: '8px 8px' }}>{tt('Resistance')}</th>
                <th style={{ ...th, padding: '8px 8px' }}>{tt('Position')}</th>
                <th style={{ ...th, padding: '8px 8px' }}>{tt('Movement')}</th>
                <th style={{ ...th, padding: '8px 8px', width: 40 }} />
              </tr></thead>
              <tbody>
                {rows.map(({ e, g }) => {
                  const skip = (edits[e.id] || {}).skip;
                  const cell = { padding: '6px 8px', verticalAlign: 'middle' };
                  return (
                    <tr key={e.id} style={{ borderBottom: `1px solid ${C.cardBd}`, opacity: skip ? 0.45 : 1 }}>
                      <td style={{ ...cell, minWidth: 220 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, color: GUESS_INK(g.filled), flexShrink: 0, minWidth: 22 }} title={tt('{n}/3 guessed').replace('{n}', g.filled)}>{g.filled}/3</span>
                          <bdi style={{ fontFamily: FB, fontSize: 13, color: C.tx, flex: '1 1 0', minWidth: 0, whiteSpace: 'normal', overflowWrap: 'break-word', wordBreak: 'normal' /* wraps between words - an inline nowrap title ran past its cell, cut mid-word at 390 (audit #612 C10) */ }}>{e.title || e.t}</bdi>
                        </div>
                      </td>
                      <td style={cell}><Select options={RESISTANCE_TYPES} value={val(e, g, 'resistanceType')} onChange={(v) => setVal(e.id, 'resistanceType', v)} placeholder="—" /></td>
                      <td style={cell}><Select options={BODY_POSITIONS} value={val(e, g, 'bodyPosition')} onChange={(v) => setVal(e.id, 'bodyPosition', v)} placeholder="—" /></td>
                      <td style={cell}><Select options={MOVEMENT_TYPES} value={val(e, g, 'movementType')} onChange={(v) => setVal(e.id, 'movementType', v)} placeholder="—" /></td>
                      <td style={{ ...cell, textAlign: 'center' }}>
                        <button onClick={() => toggleSkip(e.id)} title={skip ? tt('Un-skip') : tt('Skip')} style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, color: skip ? C.ac : C.tm, background: 'transparent', border: `1px solid ${C.cardBd}`, padding: '4px 8px', cursor: 'pointer' }}>{skip ? '↺' : '✕'}</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          )}
          {!showAll && filtered.length > CAP && (
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <Btn variant="ghost" onClick={() => setShowAll(true)}>{tt('Show all')} {filtered.length}</Btn>
              <span style={{ fontFamily: FB, fontSize: 11.5, color: C.td, marginInlineStart: 10 }}>{tt('showing {n} — most-complete guesses first').replace('{n}', CAP)}</span>
            </div>
          )}
        </Card>
      )}

      {confirm && (
        <Modal open onClose={() => setConfirm(false)} title={tt('Apply classifications?')}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontFamily: FB, fontSize: 13.5, color: C.tx }}>{tt('Write taxonomy to')} <strong>{pending.length}</strong> {tt(pending.length === 1 ? 'library exercise.' : 'library exercises.')} {tt('This updates the library only — no athlete programs change.')}</div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Btn variant="ghost" onClick={() => setConfirm(false)}>{tt('Cancel')}</Btn>
              <Btn onClick={apply} style={{ background: C.ac, borderColor: C.ac, color: '#04121f' }}>{tt('Apply')} {pending.length}</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
