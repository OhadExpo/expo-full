// STRENGTH REVIEW - the top of the training analysis, rebuilt (16.10 #814, Ohad: "The block analysis looks like shit right
// now. 10% ready of what I want it to be"). What a coach opens before writing the next block, in the order he decides:
//  1. the block in one line, its reasons, and the NEXT-BLOCK MOVES (verbs to the coach, each naming its lifts / day - the
//     research's verdict-first pattern: a sentence, the reasons, then what to do)
//  2. a 4-tile scorecard (sessions, sets done, main lifts climbing, effort logged)
//  3. THE BLOCK AT A GLANCE: every planned day x week, three marks only (done / part / not logged - #821: too many marks)
//  4. MAIN LIFTS: one row each - a trend line of the logged top sets, the last top set, the change since the first, a
//     status word. The engine (lineageAnalysis.analyzeAthlete) is untouched: this shows what it already reads, in its
//     own order (a lift flat for 3+ sessions is STUCK, never also 'dropping' - the engine's 17.9 rule).
// House rules: one cyan frame, colour on the words only, no fills, no glyphs, no tracking on Hebrew.
import React from 'react';
import { C, FN, FB } from './theme';
import { useStripFit } from './ui';

const L = (he, en, hb) => (he ? hb : en);
const I = (s) => `⁦${s}⁩`;   // a number / range inside a sentence, isolated so a Hebrew line never flips it
const Ltr = ({ children, style }) => <bdi dir="ltr" style={{ unicodeBidi: 'isolate', fontVariantNumeric: 'tabular-nums', ...style }}>{children}</bdi>;
const tone = { ok: C.gn, warn: C.or, bad: C.rd, info: C.ac };
// a top set: in English an LTR run; in Hebrew a RIGHT-to-left run ('147.5 ק״ג × 4' read from the right) - inside an LTR
// box the Hebrew unit pulled '× 4' into its own run and the reps landed before the unit
const SetTxt = ({ load, reps, he, style }) => (he
  ? <bdi dir="rtl" style={{ unicodeBidi: 'isolate', fontVariantNumeric: 'tabular-nums', ...style }}>{`${kg(load)} ק״ג × ${reps ?? '—'}`}</bdi>
  : <Ltr style={style}>{`${kg(load)} kg × ${reps ?? '—'}`}</Ltr>);
const card = { border: `1px solid ${C.cardBd}`, background: 'var(--c-sf)', marginTop: 12 };
const kg = (n) => (n == null ? '—' : String(Math.round(n * 10) / 10));
const norm = (s) => String(s || '').trim().toLowerCase();
const track = (he, en) => (he ? 0 : en);

// ONE-ROW TITLE STRIP (26.9 rule): the meta sits beside the title; when the two cannot share one row (useStripFit
// measures it), the meta moves to the top of the body and the title keeps its row - never two rows, never cut
export function FitStrip({ title, meta, he, lead = null, onClick, expanded, style, metaAlone = false }) {
  const sRef = React.useRef(null), tRef = React.useRef(null), mRef = React.useRef(null);
  const stacked = useStripFit(!!meta, sRef, tRef, mRef, 0, [typeof title === 'string' ? title : '', typeof meta === 'string' ? meta : '', he ? 1 : 0]);
  const st = stripStyle(he);
  const btn = onClick ? { role: 'button', tabIndex: 0, 'aria-expanded': !!expanded, onClick, onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }, title: undefined } : {};
  return (
    <>
      <div ref={sRef} data-fit-strip style={{ ...st, ...(onClick ? { cursor: 'pointer' } : null), ...style }} {...btn}>
        <span ref={tRef} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap', minWidth: 0 }}>{lead}{title}</span>
        {meta && !stacked && <span ref={mRef} style={{ ...subStyle(he), whiteSpace: 'nowrap', flexShrink: 0 }}>{meta}</span>}
      </div>
      {meta && stacked && <div data-strip-actions style={{ ...subStyle(he), padding: metaAlone ? '8px 14px 10px' : '8px 14px 0', lineHeight: 1.45 }}>{meta}</div>}
    </>
  );
}
export const stripStyle = (he) => ({ borderBottom: `1px solid ${C.cardBd}`, padding: '0 14px', minHeight: 41, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: track(he, '0.1em'), textTransform: 'uppercase', color: 'var(--c-stripTx, ' + C.tx + ')', background: 'var(--c-stripBg, var(--c-sf))' });
export const subStyle = (he) => ({ fontFamily: FN, fontSize: 10, color: C.tm, letterSpacing: track(he, '0.04em'), textTransform: 'none', fontWeight: 600 });

// a lift's state, in the words the coach acts on - stuck BEFORE dropping, as the engine reads it
export function liftState(s, athlete = false) {
  if (s.count < 3) return { k: 'few', en: 'Too few', he: 'מעט נתונים', c: C.td };
  if (s.ballistic) return { k: 'power', en: 'Explosive', he: 'מתפרץ', c: C.ac };
  if (s.stale?.stale) return athlete ? { k: 'stuck', en: 'Holding', he: 'יציב', c: C.tm } : { k: 'stuck', en: 'Stuck', he: 'תקוע', c: C.or };
  if (s.trend?.dir === 'down') return { k: 'down', en: 'Dropping', he: 'יורד', c: C.rd };
  if (s.trend?.dir === 'up') return { k: 'up', en: 'Climbing', he: 'עולה', c: C.gn };
  return { k: 'hold', en: 'Holding', he: 'יציב', c: C.tm };
}

function moves(a, he, deloadHeadline) {
  const mains = (a.staples || []).filter((s) => s.isMain && !s.ballistic && s.count >= 3);
  const nm = (arr) => arr.slice(0, 3).map((s) => (he ? I(s.title) : s.title)).join(', ');   // each English name isolated in a Hebrew line
  const thin = (a.adh?.loggedSessions || 0) < 3;
  const up = mains.filter((s) => liftState(s).k === 'up');
  const stuck = mains.filter((s) => liftState(s).k === 'stuck');
  const down = mains.filter((s) => liftState(s).k === 'down');
  const out = [];
  const n = a.adh?.loggedSessions || 0;
  if (down.length) out.push(thin
    ? { tone: 'info', t: he ? `${nm(down)} ${down.length === 1 ? 'יורד' : 'יורדים'}, אבל ${n === 1 ? 'נרשם רק אימון אחד' : `נרשמו רק ${I(n)} אימונים`} - ${down.length === 1 ? 'סימן לעקוב אחריו' : 'סימן לעקוב אחריהם'}, עוד לא סיבה להוריד משקל.` : `${nm(down)} sliding, but only ${n} session${n === 1 ? '' : 's'} logged - a flag to watch, not a back-off yet.` }
    : { tone: 'bad', t: he ? `תוריד ${I('5-10%')} מהמשקל ב־${nm(down)} ותבדוק התאוששות - ${down.length === 1 ? 'הוא יורד' : 'הם יורדים'} לאורך הבלוק.` : `Back off ${nm(down)} 5-10% and check recovery - ${down.length === 1 ? 'it is' : 'they are'} dropping across the block.` });
  if (stuck.length) out.push({ tone: 'warn', t: he ? `תשנה גירוי ב־${nm(stuck)} (וריאציה או טמפו) - ${stuck.length === 1 ? 'תקוע' : 'תקועים'} כבר 3 אימונים ומעלה. לא עוד משקל.` : `Change the stimulus on ${nm(stuck)} (a variation or a tempo) - flat for 3+ sessions. Not more kg.` });
  // the lower-body miss: a move only on real data, and only when the reasons line does not already say it
  if (!thin && a.region?.lower?.pct != null && a.region.lower.pct >= 25 && !/lower|תחתון|רגליים/i.test(String(a.verdict?.sub || ''))) out.push({ tone: 'bad', t: he ? `ב־${I(a.region.lower.pct + '%')} מהסטים ברגליים הוא לא מגיע ליעד - תוריד שם משקל לפני שאתה מעלה שוב.` : `He falls short of target on ${a.region.lower.pct}% of the leg sets - take weight off there before adding again.` });
  if (up.length) out.push(deloadHeadline
    ? { tone: 'info', t: he ? `תשאיר את המשקל ב־${nm(up)} כמו שהוא - ${up.length === 1 ? 'הוא עולה' : 'הם עולים'}, אבל עכשיו שבוע דילואד.` : `Hold ${nm(up)} where ${up.length === 1 ? 'it is - it is' : 'they are - they are'} climbing, but this is a deload week.` }
    : { tone: 'ok', t: he ? `תמשיך להעלות ב־${nm(up)}: עוד ${I('2-3%')} משקל או עוד חזרה באותו מאמץ.` : `Keep pushing ${nm(up)}: +2-3% load or +1 rep at the same effort.` });
  if (a.skip && a.skip.gap >= 2) out.push({ tone: 'warn', t: he ? `הוא מדלג על ${a.skip.day} שוב ושוב (נרשם ${I(a.skip.logged)} מתוך ${I(a.skip.expected)}) - או שהיום הזה קשה מדי, או שהוא לא מסתדר לו בשבוע. תברר לפני שאתה נותן אותו שוב.` : `${a.skip.day} keeps being skipped (${a.skip.logged} of ${a.skip.expected}) - too demanding, or it does not fit his week. Confirm before re-prescribing it.` });
  if (a.rpeCoverage != null && a.rpeCoverage < 30 && out.length < 4) out.push({ tone: 'info', t: he ? `תבקש ממנו לרשום RPE - נרשם רק ב־${I(a.rpeCoverage + '%')} מהסטים, ובלי זה אי אפשר לדעת אם הוא עייף או שהגיע לתקרה.` : `Ask him to log effort (RPE) - on ${a.rpeCoverage}% of sets now, and without it fatigue and a ceiling look the same.` });
  if (!out.length) out.push(mains.length
    ? { tone: 'ok', t: L(he, 'Keep progressing - nothing is dropping or stuck.', 'תמשיך להתקדם - שום תרגיל לא יורד ולא תקוע.') }
    : { tone: 'info', t: L(he, 'Too little logged on the main lifts to call the block.', 'נרשם מעט מדי בתרגילים המרכזיים כדי לקבוע משהו על הבלוק.') });
  return out.slice(0, 4);
}

export function Tile({ v, l, s, color, he }) {
  return (
    <div style={{ flex: '1 1 140px', minWidth: 0, border: `1px solid ${C.cardBd}`, padding: '10px 12px', textAlign: 'center' }}>
      <div style={{ fontFamily: FN, fontSize: 20, fontWeight: 700, color: color || C.tx, lineHeight: 1.15 }}><Ltr>{v}</Ltr></div>
      <div style={{ fontFamily: FN, fontSize: 9.5, fontWeight: 700, letterSpacing: track(he, '0.12em'), textTransform: 'uppercase', color: C.tm, marginTop: 4 }}>{l}</div>
      {s && <div style={{ fontFamily: FB, fontSize: 11, color: C.td, marginTop: 3 }}>{s}</div>}
    </div>
  );
}

// a trend line of the lift's logged top sets (estimated max), no axes - the shape is the read
function Spark({ vals, color }) {
  const v = (vals || []).filter((x) => typeof x === 'number' && isFinite(x)).slice(-12);
  if (v.length < 2) return <span style={{ display: 'inline-block', width: 96, height: 24 }} />;
  const lo = Math.min(...v), hi = Math.max(...v), W = 96, H = 24, pad = 3;
  const pts = v.map((x, i) => `${(pad + (i * (W - 2 * pad)) / (v.length - 1)).toFixed(1)},${(H - pad - (hi > lo ? ((x - lo) * (H - 2 * pad)) / (hi - lo) : (H - 2 * pad) / 2)).toFixed(1)}`).join(' ');
  const last = pts.split(' ').pop().split(',');
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" style={{ display: 'block', flexShrink: 0 }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="2.2" fill={color} />
    </svg>
  );
}

// the block at a glance: every planned day x week, three marks
function Glance({ a, he }) {
  const days = a.plannedDays || [];
  const weeks = Math.max(1, Number(a.weeks) || 1);
  if (!days.length) return null;
  const sess = a.sessions || [];
  // no planned day matches any logged day (the days were renamed after logging): say so, never a wall of 'not logged'
  const dayKeys = new Set(days.map(norm));
  if (sess.length && !sess.some((x) => dayKeys.has(norm(x.day)))) {
    return (
      <div style={card}>
        <FitStrip he={he} title={L(he, 'The block at a glance', 'הבלוק במבט אחד')} />
        <div style={{ padding: '10px 14px', fontFamily: FB, fontSize: 12.5, color: C.tm, lineHeight: 1.5 }}>{L(he, 'The logged days carry other names than the plan\'s days (probably renamed after logging), so they cannot be laid on the plan.', 'השמות של הימים שנרשמו לא תואמים לימים בתוכנית (כנראה שונו אחרי הרישום), אז אי אפשר לשבץ אותם בטבלה.')}</div>
      </div>
    );
  }
  // a session with no week number: numbered by date order within its day (imported history)
  const byDay = new Map();
  for (const x of sess.slice().sort((p, q) => new Date(p.date) - new Date(q.date))) {
    const k = norm(x.day); if (!byDay.has(k)) byDay.set(k, []); byDay.get(k).push(x);
  }
  const weekOf = (x) => (Number(x.week) > 0 ? Number(x.week) : (byDay.get(norm(x.day)) || []).indexOf(x) + 1);
  const cell = (d, w) => {
    const list = (byDay.get(norm(d)) || []).filter((x) => weekOf(x) === w);
    if (!list.length) return 'none';
    // a make-up / repeat of the same day: the best of them
    let best = 0;
    for (const s of list) { let done = 0, all = 0; for (const ex of s.exercises || []) for (const st of ex.sets || []) { all++; if (st.done) done++; } best = Math.max(best, all ? done / all : 0); }
    return best >= 0.8 ? 'done' : best > 0 ? 'part' : 'none';
  };
  const Mark = ({ k }) => (k === 'done'
    ? <span style={{ display: 'inline-block', width: 12, height: 12, background: C.ac }} />
    : k === 'part' ? <span style={{ display: 'inline-block', width: 12, height: 12, boxSizing: 'border-box', border: `1.5px solid ${C.ac}` }} />
      : <span style={{ display: 'inline-block', width: 10, height: 2, background: C.td }} />);
  // the marks sit by their day: the label column is bounded (a 1fr column pushed them to the far edge on a desktop) and
  // keeps 88px on a long block, so a name never sits under the marks
  const cols = `minmax(88px, 260px) repeat(${weeks}, 34px)`;
  return (
    <div style={card}>
      <FitStrip he={he} title={L(he, 'The block at a glance', 'הבלוק במבט אחד')} meta={L(he, 'every planned day, week by week', 'כל יום מתוכנן, שבוע אחרי שבוע')} />
      <div style={{ padding: '8px 14px 12px', overflowX: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: cols, alignItems: 'center', minWidth: 0 }}>
          <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, color: C.tm, letterSpacing: track(he, '0.08em'), textTransform: 'uppercase' }}>{L(he, 'Week', 'שבוע')}</span>
          {Array.from({ length: weeks }, (_, i) => <span key={i} style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, color: C.tm, textAlign: 'center', padding: '4px 0' }}>{i + 1}</span>)}
          {days.map((d, di) => (
            <React.Fragment key={di}>
              <span style={{ fontFamily: FB, fontSize: 12, color: C.tx, paddingBlock: 7, paddingInlineEnd: 8, borderTop: `1px solid ${C.cardBd}`, overflowWrap: 'anywhere', lineHeight: 1.3 }}><bdi>{d}</bdi></span>
              {Array.from({ length: weeks }, (_, w) => <span key={w} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', alignSelf: 'stretch', borderTop: `1px solid ${C.cardBd}`, borderInlineStart: `1px solid ${C.cardBd}` }}>{(() => { const ow = (a.plannedDayObjs || [])[di] && a.plannedDayObjs[di].onlyWeek; return ow == null || ow === '' || Number(ow) === w + 1 ? <Mark k={cell(d, w + 1)} /> : null; })() /* #850: a day of another week is not 'not logged' */}</span>)}
            </React.Fragment>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 10, fontFamily: FN, fontSize: 10, color: C.tm, letterSpacing: track(he, '0.04em') }}>
          {[['done', L(he, 'Done', 'בוצע')], ['part', L(he, 'Part', 'חלקי')], ['none', L(he, 'Not logged', 'לא נרשם')]].map(([k, t]) => <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Mark k={k} />{t}</span>)}
        </div>
      </div>
    </div>
  );
}

// VS THE LAST BLOCK: the two blocks' own numbers side by side, then every lift that ran in both (worst first)
const kShort = (n) => (n == null ? '—' : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
export function VsLast({ cmp, he, athlete = false }) {
  if (!cmp) return null;
  const { cur, prev, lifts } = cmp;
  const head = (
    <FitStrip he={he} title={L(he, 'Vs the last block', 'מול הבלוק הקודם')} meta={prev.name} />
  );
  if (!prev.logged) {
    return (
      <div style={card} data-vs-last>{head}
        <div style={{ padding: '10px 14px', fontFamily: FB, fontSize: 12.5, color: C.tm, lineHeight: 1.5 }}>{cmp.weeks ? (he ? `בבלוק הקודם לא נרשם אף אימון ב־${cmp.weeks === 1 ? 'שבוע הראשון' : `${I(cmp.weeks)} השבועות הראשונים`}, אז אין למה להשוות.` : `Nothing was logged in the last block's first ${cmp.weeks === 1 ? 'week' : `${cmp.weeks} weeks`}, so there is nothing to compare against.`) : (he ? 'בבלוק הקודם לא נרשם אף אימון, אז אין למה להשוות.' : 'Nothing was logged in the last block, so there is nothing to compare against.')}</div>
      </div>
    );
  }
  const pct = (v) => (v == null ? '—' : `${v}%`);
  const better = (x, y, step) => (x == null || y == null ? C.tx : x - y >= step ? C.gn : y - x >= step ? C.or : C.tx);
  const rows = [
    [L(he, 'Sessions', 'אימונים'), `${prev.logged}/${prev.planned || '?'}`, `${cur.logged}/${cur.planned || '?'}`, better(cur.sessionPct, prev.sessionPct, 5)],
    [L(he, 'Sets done', 'סטים שבוצעו'), pct(prev.setsPct), pct(cur.setsPct), better(cur.setsPct, prev.setsPct, 5)],
    [L(he, 'Effort logged', 'רישום מאמץ'), pct(prev.rpeCoverage), pct(cur.rpeCoverage), better(cur.rpeCoverage, prev.rpeCoverage, 10)],
    [L(he, 'Average RPE', 'RPE ממוצע'), prev.avgRpe ?? '—', cur.avgRpe ?? '—', C.tx],
    [L(he, 'Work a week', 'עבודה בשבוע'), kShort(prev.workPerWeek), kShort(cur.workPerWeek), C.tx],
  ];
  if (cmp.prevPhase || cmp.curPhase) rows.push([L(he, 'Phase', 'שלב'), cmp.prevPhase || '—', cmp.curPhase || '—', C.tx, true]);
  const shown = rows.filter((x) => x[1] !== '—' || x[2] !== '—');   // a row with nothing on either side says nothing
  const n = lifts.length;
  const held = cmp.counted - cmp.up - cmp.down;
  const one = cmp.counted === 1 && n === 1 ? (cmp.up ? ['went up', 'עלה'] : cmp.down ? ['went down', 'ירד'] : ['held', 'נשאר במקום']) : null;
  const parts = [[cmp.up, 'went up', 'עלה', 'עלו'], [cmp.down, 'went down', 'ירד', 'ירדו'], [held, 'held', 'נשאר במקום', 'נשארו במקום']].filter((x) => x[0] > 0);
  const line = !n
    ? L(he, 'No lift ran in both blocks - the exercises changed.', 'אף תרגיל לא חזר בשני הבלוקים - התרגילים התחלפו.')
    : one ? L(he, `One lift ran in both blocks, and it ${one[0]}.`, `תרגיל אחד היה בשני הבלוקים, והוא ${one[1]}.`)
      : !parts.length ? (he ? (n === 1 ? 'תרגיל אחד היה בשני הבלוקים.' : `${I(n)} תרגילים היו בשני הבלוקים.`) : `${n} lift${n === 1 ? '' : 's'} ran in both blocks.`)
      : he ? `${n === 1 ? 'תרגיל אחד היה' : `${I(n)} תרגילים היו`} בשני הבלוקים: ${parts.map(([k, , o, m]) => (k === 1 ? `אחד ${o}` : `${I(k)} ${m}`)).join(', ')}.`
        : `${n} lift${n === 1 ? '' : 's'} ran in both blocks: ${parts.map(([k, e]) => `${k} ${e}`).join(', ')}.`;
  const winLine = cmp.weeks ? (he ? (cmp.weeks === 1 ? (athlete ? 'משווה את השבוע הראשון בשני הבלוקים - אתה עדיין בשבוע 1.' : 'משווה את השבוע הראשון בשני הבלוקים - הוא עדיין בשבוע 1.') : `משווה את ${I(cmp.weeks)} השבועות הראשונים בשני הבלוקים - ${athlete ? 'אתה' : 'הוא'} עדיין בשבוע ${I(cmp.weeks)}.`) : `Both blocks over their first ${cmp.weeks === 1 ? 'week' : `${cmp.weeks} weeks`} - ${athlete ? 'you are' : 'he is'} still in week ${cmp.weeks}.`) : null;
  const cellNum = { display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FN, fontSize: 12.5, fontWeight: 700, textAlign: 'center', padding: '8px 4px', borderTop: `1px solid ${C.cardBd}`, fontVariantNumeric: 'tabular-nums' };
  return (
    <div style={card} data-vs-last>
      {head}
      <div style={{ padding: '10px 14px 4px', fontFamily: FB, fontSize: 13, color: C.tx, lineHeight: 1.5 }}>{line}</div>
      {winLine && <div style={{ padding: '0 14px 4px', fontFamily: FB, fontSize: 12, color: C.tm, lineHeight: 1.5 }}>{winLine}</div>}
      <div style={{ padding: '4px 14px 12px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 260px) 96px 96px', alignItems: 'stretch' }}>
          <span />
          <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, color: C.tm, textAlign: 'center', letterSpacing: track(he, '0.08em'), textTransform: 'uppercase', padding: '4px 0' }}>{L(he, 'Last', 'הקודם')}</span>
          <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, color: C.ac, textAlign: 'center', letterSpacing: track(he, '0.08em'), textTransform: 'uppercase', padding: '4px 0' }}>{L(he, 'This', 'הנוכחי')}</span>
          {shown.map(([l, p, c, col, word]) => (
            <React.Fragment key={l}>
              <span style={{ display: 'flex', alignItems: 'center', fontFamily: FB, fontSize: 12.5, color: C.tm, padding: '8px 0', paddingInlineEnd: 8, borderTop: `1px solid ${C.cardBd}`, lineHeight: 1.3, overflowWrap: 'anywhere' }}>{l}</span>
              <span style={{ ...cellNum, color: C.tm, fontWeight: 600, ...(word ? { fontSize: 10.5, textTransform: 'uppercase' } : null) }}>{word ? <bdi>{p}</bdi> : <Ltr>{p}</Ltr>}</span>
              <span style={{ ...cellNum, color: col, ...(word ? { fontSize: 10.5, textTransform: 'uppercase' } : null) }}>{word ? <bdi>{c}</bdi> : <Ltr>{c}</Ltr>}</span>
            </React.Fragment>
          ))}
        </div>
        {(prev.workPerWeek || cur.workPerWeek) && <div style={{ fontFamily: FB, fontSize: 11, color: C.td, marginTop: 8, lineHeight: 1.5 }}>{athlete ? L(he, 'Work = kg × reps summed over every set done, averaged a week (only the weeks you logged).', 'עבודה = סך ק״ג × חזרות בכל הסטים שבוצעו, בממוצע לשבוע (רק שבועות שרשמת).') : L(he, 'Work = kg × reps summed over every set done, averaged a week (only the weeks he logged).', 'עבודה = סך ק״ג × חזרות בכל הסטים שבוצעו, בממוצע לשבוע (רק שבועות שהוא רשם).')}</div>}
      </div>
      {n > 0 && (
        <>
          <FitStrip he={he} style={{ borderTop: `1px solid ${C.cardBd}` }} title={L(he, 'Lifts in both blocks', 'תרגילים בשני הבלוקים')} meta={L(he, 'best top set · worst first', 'הטופ סט הכי טוב · מהחלש לחזק')} />
          {lifts.slice(0, 8).map((x, i) => (
            <div key={x.title} data-vs-lift style={{ padding: '9px 14px', borderTop: i ? `1px solid ${C.cardBd}` : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ fontFamily: FB, fontSize: 13, fontWeight: 600, color: C.tx, minWidth: 0, overflowWrap: 'anywhere', lineHeight: 1.3 }}><bdi>{x.title}</bdi></span>
                {x.pct != null && <span style={{ fontFamily: FN, fontSize: 12, fontWeight: 700, flexShrink: 0, color: x.pct >= 2 ? C.gn : x.pct <= -2 ? C.rd : C.tm }}><Ltr>{(x.pct > 0 ? '+' : '') + x.pct + '%'}</Ltr></span>}
                {(x.kind === 'kg' || x.kind === 'assist') && x.dKg != null && <span style={{ fontFamily: FN, fontSize: 12, fontWeight: 700, flexShrink: 0, color: (x.kind === 'assist' ? -x.dKg : x.dKg) > 0 ? C.gn : (x.kind === 'assist' ? -x.dKg : x.dKg) < 0 ? C.rd : C.tm }}>{he ? <bdi dir="rtl">{`${I((x.dKg > 0 ? '+' : '') + kg(x.dKg))} ק״ג`}</bdi> : <Ltr>{`${x.dKg > 0 ? '+' : ''}${kg(x.dKg)} kg`}</Ltr>}</span>}
              </div>
              <div style={{ fontFamily: FB, fontSize: 12, color: C.tm, marginTop: 4, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                <span>{L(he, 'last', 'בקודם')} <SetTxt he={he} load={x.prev.load} reps={x.prev.reps} style={{ color: C.tm }} /></span>
                <span>{L(he, 'this', 'בנוכחי')} <SetTxt he={he} load={x.cur.load} reps={x.cur.reps} style={{ color: C.tx }} /></span>
                {x.kind === 'power' && <span style={{ color: C.td }}>{L(he, 'explosive - read it on speed, not kg', 'מתפרץ - נמדד במהירות, לא בקילו')}</span>}
                {x.kind === 'zone' && <span style={{ color: C.td }}>{L(he, 'different rep ranges - no %', 'טווחי חזרות שונים - בלי אחוז')}</span>}
                {x.kind === 'kg' && <span style={{ color: C.td }}>{L(he, 'added load', 'משקל נוסף')}</span>}
                {x.kind === 'assist' && <span style={{ color: C.td }}>{L(he, 'assistance - less is stronger', 'עזרה - פחות זה חזק יותר')}</span>}
              </div>
            </div>
          ))}
          {n > 8 && !athlete && <div style={{ padding: '0 14px 10px', fontFamily: FB, fontSize: 11.5, color: C.td }}>{he ? (n - 8 === 1 ? 'ועוד אחד - ברשימת התרגילים המרכזיים למטה.' : `ועוד ${I(n - 8)} - כולם ברשימת התרגילים המרכזיים למטה.`) : `${n - 8} more - all of them in the key lifts list below.`}</div>}
        </>
      )}
    </div>
  );
}

export function Lifts({ a, he, athlete = false }) {
  const rows = (a.staples || []).filter((s) => s.isMain && s.count >= 2).slice(0, 10);
  if (!rows.length) return null;
  return (
    <div style={card}>
      <FitStrip he={he} title={L(he, 'Main lifts', 'התרגילים המרכזיים')} meta={L(he, 'up to the last 12 top sets · change since the first', 'עד 12 טופ סטים אחרונים · שינוי מהראשון')} />
      {rows.map((s, i) => {
        const st = liftState(s, athlete);
        const chg = s.ballistic ? null : s.arcGainPct;   // a jump's estimated max means nothing
        return (
          <div key={s.title} data-lift-row style={{ padding: '10px 14px', borderTop: i ? `1px solid ${C.cardBd}` : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
              <span style={{ fontFamily: FB, fontSize: 13, fontWeight: 600, color: C.tx, minWidth: 0, overflowWrap: 'anywhere', lineHeight: 1.3 }}><bdi>{s.title}</bdi></span>
              <span style={{ fontFamily: FN, fontSize: 10.5, fontWeight: 700, letterSpacing: track(he, '0.08em'), textTransform: 'uppercase', color: st.c, flexShrink: 0 }}>{he ? st.he : st.en}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 6, flexWrap: 'wrap' }}>
              <Spark vals={s.arc} color={st.c === C.td ? C.tm : st.c} />
              <span style={{ fontFamily: FB, fontSize: 12, color: C.tm }}>{L(he, 'last', 'אחרון')} <SetTxt he={he} load={s.lastLoad} reps={s.lastReps} style={{ color: C.tx }} /></span>
              {chg != null && <span style={{ fontFamily: FB, fontSize: 12, color: C.tm }}><Ltr style={{ color: (s.trend?.repNoisy || s.count < 4) ? C.td : chg > 0 ? C.gn : chg < 0 ? C.rd : C.tx }}>{chg > 0 ? '+' : ''}{chg}%</Ltr> {L(he, 'since the first', 'מהראשון')}</span>}
              <span style={{ fontFamily: FB, fontSize: 12, color: C.td }}><Ltr>{s.count}</Ltr> {L(he, 'logs', 'רישומים')}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function StrengthReview({ a, he, cmp }) {
  const v = a.verdict || {};
  const label = { fontFamily: FN, fontSize: 9.5, fontWeight: 700, letterSpacing: track(he, '0.16em'), textTransform: 'uppercase' };
  const mains = (a.staples || []).filter((s) => s.isMain && !s.ballistic && s.count >= 3);
  const climbing = mains.filter((s) => liftState(s).k === 'up').length;
  const deload = v.tone === 'warn';   // synthesizeVerdict keeps 'warn' for its deload branch only (a regex on the words missed the engine's spelling)
  const ms = moves(a, he, deload);
  const confHe = { high: 'גבוהה', medium: 'בינונית', moderate: 'בינונית', low: 'נמוכה' };
  return (
    <div data-strength-review>
      <div style={{ ...card, borderColor: C.ac }}>
        <div style={{ padding: '14px 16px' }}>
          <div style={{ ...label, color: tone[v.tone] || C.ac, marginBottom: 8, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <span>{L(he, 'The block in one line', 'הבלוק בשורה אחת')}</span>
            {v.confidence === 'low' && <span style={{ color: C.tm }}>{he ? `ודאות ${confHe.low}` : 'low confidence'}</span>}
          </div>
          <div style={{ fontFamily: FB, fontSize: 18, fontWeight: 700, lineHeight: 1.35, color: C.tx }}>{v.headline}</div>
          {v.sub && <div style={{ fontFamily: FB, fontSize: 13, color: C.tm, marginTop: 6, lineHeight: 1.5 }}>{v.sub}</div>}
          <div style={{ ...label, color: C.tm, margin: '14px 0 6px' }}>{L(he, 'Next block · your call', 'הבלוק הבא · ההחלטה שלך')}</div>
          {ms.map((m, i) => (
            <div key={i} style={{ padding: '6px 0', paddingInlineStart: 10, margin: i ? '8px 0 0' : 0, borderInlineStart: `3px solid ${tone[m.tone]}`, fontFamily: FB, fontSize: 13, lineHeight: 1.5, color: C.tx }}>{m.t}</div>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        <Tile he={he} v={a.adh && a.adh.sessionPct != null ? `${a.adh.sessionPct}%` : '—'} l={L(he, 'Sessions', 'אימונים')} s={a.adh ? (he ? `${a.adh.loggedSessions} מתוך ${a.plannedSessionCount || '?'}` : `${a.adh.loggedSessions} of ${a.plannedSessionCount || '?'}`) : null} color={!a.adh || a.adh.sessionPct == null ? C.tm : a.adh.sessionPct >= 80 ? C.gn : C.or} />
        <Tile he={he} v={a.adh && a.adh.setsPct != null ? `${a.adh.setsPct}%` : '—'} l={L(he, 'Sets done', 'סטים שבוצעו')} s={a.adh ? (he ? `${a.adh.setsDone} מתוך ${a.adh.setsPrescribed}` : `${a.adh.setsDone} of ${a.adh.setsPrescribed}`) : null} color={!a.adh || a.adh.setsPct == null ? C.tm : a.adh.setsPct >= 80 ? C.gn : C.or} />
        <Tile he={he} v={mains.length ? `${climbing}/${mains.length}` : '—'} l={L(he, 'Main lifts climbing', 'תרגילים מרכזיים עולים')} color={!mains.length ? C.tm : climbing >= mains.length / 2 ? C.gn : C.or} />
        <Tile he={he} v={a.rpeCoverage != null ? `${a.rpeCoverage}%` : '—'} l={L(he, 'Effort logged', 'רישום מאמץ')} s={L(he, 'sets with RPE', 'סטים עם RPE')} color={a.rpeCoverage == null ? C.tm : a.rpeCoverage >= 60 ? C.gn : C.or} />
      </div>
      <Glance a={a} he={he} />
      <VsLast cmp={cmp} he={he} />
      <Lifts a={a} he={he} />
    </div>
  );
}
