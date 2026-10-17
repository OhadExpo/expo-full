// THE EVALUATION'S ANALYSIS, ON SCREEN (16.10 #837): what needs work, what to watch, what was not tested, his notes -
// from evalReport.js. Opens right after an evaluation is saved and from every saved evaluation. Coach voice (the athlete
// is 'he'); test names stay English (the platform rule), each isolated inside a Hebrew line. No fills, no glyphs: the
// level is the colour of the words.
import React, { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { C, FN, FB } from './theme';
import { useT, useHe } from './i18n';
import { useEscClose, useIsMobile } from './ui';
import { romLabel, romJointLabel } from './evaluationSchema';
import { analyzeEvaluation } from './evalAnalysis';

const L = (he, en, hb) => (he ? hb : en);
const I = (s) => `⁨${s}⁩`;
const fmtDate = (d) => (d ? String(d).split('-').reverse().join('/') : '');
const SEC = { stability: ['Stability & Isometric', 'יציבות ואיזומטריה'], jumping: ['Jumping & Landing', 'ניתור ונחיתה'], accel_decel: ['Acceleration / Deceleration', 'האצה ובלימה'], movements: ['Movements', 'תנועות'], rom: ['Range of motion', 'טווחי תנועה'] };
const side = (he, s) => (s === 'L' ? L(he, 'left', 'שמאל') : s === 'R' ? L(he, 'right', 'ימין') : '');
const sideAt = (he, s) => (he ? `בצד ${side(he, s)}` : `on the ${side(he, s)}`);   // 'בצד שמאל', never a glued 'בשמאל'
const other = (s) => (s === 'L' ? 'R' : 'L');
// a value with its unit; RSI is an index, written before the number
const withU = (he, v, u) => (!u ? `${v}` : u === 'rsi' ? `RSI ${v}` : `${v} ${unitW(he, u)}`);
const UNIT_HE = { sec: 'שנ׳', cm: 'ס״מ', rsi: 'RSI', 'N/kg': 'N/kg' };
// a list of English names inside a Hebrew line: each name one unbroken block in a wrapping row - joined by ' · ' the bidi
// algorithm reordered the names across the line breaks
const Names = ({ items, color }) => <span style={{ display: 'inline-flex', flexWrap: 'wrap', columnGap: 14, rowGap: 2, verticalAlign: 'top' }}>{items.map((t, k) => <bdi key={k} style={{ display: 'inline-block', color }}>{t}</bdi>)}</span>;
const unitW = (he, u) => (!u ? '' : he ? (UNIT_HE[u] || u) : u);

function itemTitle(it, he, tt) {
  if (it.kind === 'rom') return `${romJointLabel(tt, it.joint)} · ${romLabel(tt, it.axis)}`;
  return it.label;
}
function itemReading(it, he) {
  const r = it.reading;
  const u = unitW(he, r.unit);
  if (it.kind === 'score') return he
    ? `ציון ${r.score} מתוך 3${it.side ? ` ${sideAt(he, it.side)}` : ''}${r.other != null && it.side ? ` (${sideAt(he, other(it.side))} ${r.other})` : ''}`
    : `${r.score} of 3${it.side ? ` ${sideAt(he, it.side)}` : ''}${r.other != null && it.side ? ` (${r.other} ${sideAt(he, other(it.side))})` : ''}`;
  if (it.kind === 'goal') return he
    ? `${it.side ? `${side(he, it.side)}: ` : ''}${I(r.value)} שנ׳, היעד ${I(r.goal)} שנ׳ (${I(r.pct + '%')})`
    : `${it.side ? `${side(he, it.side)}: ` : ''}${r.value} sec of a ${r.goal} sec goal (${r.pct}%)`;
  if (it.kind === 'asym') return he
    ? `פער של ${I(r.gapPct + '%')} בין הצדדים – צד ${side(he, r.weak)} חלש יותר (שמאל ${I(withU(he, r.L, r.unit))}, ימין ${I(withU(he, r.R, r.unit))})`
    : `A ${r.gapPct}% gap between the sides - the ${side(he, r.weak)} is weaker (left ${withU(he, r.L, r.unit)}, right ${withU(he, r.R, r.unit)})`;
  if (it.kind === 'rom') return he
    ? `${I(r.value + '°')}, הנורמה למבוגרים ${I(r.ref + '°')} (${I(r.pct + '%')})`
    : `${r.value}° against an adult reference of ${r.ref}° (${r.pct}%)`;
  if (it.kind === 'change') return he
    ? `${it.side ? `${side(he, it.side)}: ` : ''}${I(withU(he, r.value, r.unit))} לעומת ${I(withU(he, r.before, r.unit))} בהערכה הקודמת (ירידה של ${I(Math.abs(r.pct) + '%')})`
    : `${it.side ? `${side(he, it.side)}: ` : ''}${r.value}${u ? ' ' + u : ''} against ${r.before}${u ? ' ' + u : ''} last time (${r.pct}%)`;
  return '';
}

// a movement value off the 1-3 scale, as it was recorded: 'שמאל 5, ימין 4' / 'נרשם 4'
const outsideReading = (v, he) => {
  if (v && typeof v === 'object') return Object.entries(v).map(([k, x]) => `${k === 'L' || k === 'R' ? side(he, k) : k} ${he ? I(String(x)) : x}`).join(', ');
  return he ? `נרשם ${I(String(v))}` : `recorded ${v}`;
};

const strip = (he, title, meta = null) => (
  <div style={{ borderBottom: `1px solid ${C.cardBd}`, padding: '0 14px', minHeight: 41, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: he ? 0 : '0.1em', textTransform: 'uppercase', color: 'var(--c-stripTx, ' + C.tx + ')', background: 'var(--c-stripBg, var(--c-sf))' }}>
    <span>{title}</span>{meta && <span style={{ fontSize: 10, color: C.tm, fontWeight: 600, textTransform: 'none' }}>{meta}</span>}
  </div>
);

function Items({ items, he, tt, color }) {
  return items.map((it, i) => (
    <div key={it.key} data-eval-finding={it.kind} style={{ padding: '10px 14px', borderTop: i ? `1px solid ${C.cardBd}` : 'none' }}>
      <div style={{ fontFamily: FB, fontSize: 14, fontWeight: 600, color: C.tx, lineHeight: 1.35, overflowWrap: 'anywhere' }}><bdi>{itemTitle(it, he, tt)}</bdi></div>
      <div style={{ fontFamily: FB, fontSize: 13, color, lineHeight: 1.5, marginTop: 3 }}>{itemReading(it, he)}</div>
      {it.watch && it.watch.length > 0 && (
        <div style={{ fontFamily: FB, fontSize: 12, color: C.tm, lineHeight: 1.5, marginTop: 4 }}>
          <div style={{ marginBottom: 2 }}>{L(he, 'Watch:', 'דגשים:')}</div><Names items={it.watch} />
        </div>
      )}
    </div>
  ));
}

export function EvalReportBody({ evaluation, prev = null }) {
  const tt = useT();
  const he = useHe();
  const a = useMemo(() => analyzeEvaluation(evaluation, prev), [evaluation, prev]);
  const card = { border: `1px solid ${C.cardBd}`, background: 'var(--c-sf)', marginTop: 12 };
  const nW = a.needsWork.length, nM = a.watch.length;
  const heW = nW === 0 ? 'אין נקודות שדורשות עבודה' : nW === 1 ? 'נקודה אחת דורשת עבודה' : `${I(nW)} נקודות דורשות עבודה`;
  const heM = nM === 0 ? 'אין נקודות לשים לב אליהן' : nM === 1 ? 'אחת שצריך לשים לב אליה' : `${I(nM)} שצריך לשים לב אליהן`;
  const line = he
    ? `בוצעו ${I(a.counts.tested)} מתוך ${I(a.counts.tests)} בדיקות ונמדדו ${I(a.counts.romTested)} מתוך ${I(a.counts.rom)} טווחי תנועה. ${heW}, ${heM}, ${I(a.onTarget)} ביעד.${a.recorded ? ` ${a.recorded === 1 ? 'תוצאה אחת נרשמה' : `${I(a.recorded)} תוצאות נרשמו`} בלי יעד להשוואה.` : ''}`
    : `${a.counts.tested} of ${a.counts.tests} tests and ${a.counts.romTested} of ${a.counts.rom} ranges of motion were tested. ${nW} need${nW === 1 ? 's' : ''} work, ${nM} to watch, ${a.onTarget} on target.${a.recorded ? ` ${a.recorded} recorded with no goal to read ${a.recorded === 1 ? 'it' : 'them'} by.` : ''}`;
  return (
    <div data-eval-report>
      <div style={{ ...card, marginTop: 0, borderColor: C.ac }}>
        {strip(he, L(he, 'Evaluation summary', 'סיכום ההערכה'), fmtDate(evaluation.eval_date))}
        <div style={{ padding: '12px 14px', fontFamily: FB, fontSize: 14, lineHeight: 1.55, color: C.tx }}>{line}</div>
        {a.freeNotes && <div style={{ padding: '0 14px 12px', fontFamily: FB, fontSize: 13, color: C.tm, lineHeight: 1.5 }}>{L(he, 'Your notes: ', 'ההערות שלך: ')}<bdi>{a.freeNotes}</bdi></div>}
      </div>
      {nW > 0 && <div style={card}>{strip(he, L(he, 'Needs work', 'דורש עבודה'), String(nW))}<Items items={a.needsWork} he={he} tt={tt} color={C.rd} /></div>}
      {nM > 0 && <div style={card}>{strip(he, L(he, 'To watch', 'לשים לב'), String(nM))}<Items items={a.watch} he={he} tt={tt} color={C.or} /></div>}
      {nW === 0 && nM === 0 && a.onTarget > 0 && a.recorded === 0 && a.outside.length === 0 && (
        <div style={card}><div style={{ padding: '12px 14px', fontFamily: FB, fontSize: 13, color: C.gn, lineHeight: 1.5 }}>{L(he, 'Everything tested is on target.', 'כל מה שנבדק ביעד.')}</div></div>
      )}
      {a.outside.length > 0 && (
        <div style={card}>{strip(he, L(he, 'Scored outside 1-3', 'ציון מחוץ לסולם 1–3'), String(a.outside.length))}
          {a.outside.map((o, i) => (
            <div key={o.test} data-eval-finding="outside" style={{ padding: '10px 14px', borderTop: i ? `1px solid ${C.cardBd}` : 'none' }}>
              <div style={{ fontFamily: FB, fontSize: 14, fontWeight: 600, color: C.tx, lineHeight: 1.35, overflowWrap: 'anywhere' }}><bdi>{o.label}</bdi></div>
              <div style={{ fontFamily: FB, fontSize: 13, color: C.tm, lineHeight: 1.5, marginTop: 3 }}>{outsideReading(o.value, he)}</div>
            </div>
          ))}
        </div>
      )}
      {a.notes.length > 0 && (
        <div style={card}>{strip(he, L(he, 'Notes on the movements', 'הערות על התנועות'), String(a.notes.length))}
          {a.notes.map((n, i) => (
            <div key={n.test} style={{ padding: '10px 14px', borderTop: i ? `1px solid ${C.cardBd}` : 'none', fontFamily: FB, fontSize: 13, lineHeight: 1.5, color: C.tx }}>
              <bdi style={{ fontWeight: 600 }}>{n.label}</bdi>: <bdi>{n.text}</bdi>
            </div>
          ))}
        </div>
      )}
      {(a.notTested.length > 0 || a.romNotTested > 0) && (
        <div style={card}>{strip(he, L(he, 'Not tested', 'לא נבדקו'))}
          {a.notTested.map((g, i) => (
            <div key={g.section} style={{ padding: '10px 14px', borderTop: i ? `1px solid ${C.cardBd}` : 'none', fontFamily: FB, fontSize: 13, lineHeight: 1.5, color: C.tm }}>
              <div style={{ color: C.tx, fontWeight: 600, marginBottom: 2 }}>{L(he, SEC[g.section][0], SEC[g.section][1])}</div>
              <Names items={g.tests} />
            </div>
          ))}
          {a.romNotTested > 0 && <div style={{ padding: '10px 14px', borderTop: a.notTested.length ? `1px solid ${C.cardBd}` : 'none', fontFamily: FB, fontSize: 13, color: C.tm, lineHeight: 1.5 }}>{he ? `${I(a.romNotTested)} מתוך ${I(a.counts.rom)} טווחי תנועה לא נמדדו.` : `${a.romNotTested} of ${a.counts.rom} ranges of motion were not measured.`}</div>}
        </div>
      )}
      <div style={{ fontFamily: FB, fontSize: 11, color: C.td, lineHeight: 1.5, marginTop: 10 }}>
        {L(he, 'Ranges of motion are read against the adult reference (AAOS); hold times against the protocol\'s goal; a gap between the sides is marked from 10%.', 'טווחי התנועה מושווים לנורמה של מבוגרים (AAOS), זמני ההחזקה – ליעד של הפרוטוקול, ופער בין הצדדים מסומן מ־10% ומעלה.')}
      </div>
    </div>
  );
}

// the full-screen view (right after a save, and from a saved evaluation): its own URL, Back closes it
export default function EvalReport({ evaluation, prev = null, traineeName = '', onClose, onEdit = null }) {
  const he = useHe();
  const isMobile = useIsMobile();
  useEscClose(true, onClose);
  return createPortal((
    <div onClick={onClose} role="dialog" aria-modal="true" aria-label={L(he, 'Evaluation summary', 'סיכום ההערכה')} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 300, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: isMobile ? '12px 8px' : '40px 16px', overflowY: 'auto' }}>
      <div onClick={(e) => e.stopPropagation()} dir={he ? 'rtl' : 'ltr'} style={{ background: 'var(--c-bg)', border: `1px solid ${C.ac}`, padding: isMobile ? 12 : 20, maxWidth: 760, width: '100%', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12, minHeight: 36 }}>
          <h2 style={{ margin: 0, fontFamily: FN, fontSize: 16, color: C.tx, letterSpacing: he ? 0 : '0.04em', lineHeight: 1.3, minWidth: 0, overflowWrap: 'anywhere' }}>{L(he, 'SUMMARY', 'סיכום')} · <bdi>{traineeName}</bdi></h2>
          <div style={{ display: 'grid', gridAutoFlow: 'column', gridAutoColumns: 'minmax(0, 1fr)', gap: 1, background: C.cardBd, border: `1px solid ${C.cardBd}`, flexShrink: 0 }}>
            {onEdit && <button type="button" onClick={onEdit} style={{ height: 36, padding: '0 14px', border: 'none', background: 'var(--c-sf)', color: C.ac, cursor: 'pointer', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: he ? 0 : '0.08em', textTransform: 'uppercase' }}>{L(he, 'Edit', 'עריכה')}</button>}
            <button type="button" onClick={onClose} style={{ height: 36, padding: '0 14px', border: 'none', background: 'var(--c-sf)', color: C.tm, cursor: 'pointer', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: he ? 0 : '0.08em', textTransform: 'uppercase' }}>{L(he, 'Close', 'סגירה')}</button>
          </div>
        </div>
        <EvalReportBody evaluation={evaluation} prev={prev} />
      </div>
    </div>
  ), document.body);
}
