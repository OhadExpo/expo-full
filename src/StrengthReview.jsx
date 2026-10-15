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

const L = (he, en, hb) => (he ? hb : en);
const I = (s) => `⁦${s}⁩`;   // a number / range inside a sentence, isolated so a Hebrew line never flips it
const Ltr = ({ children, style }) => <bdi dir="ltr" style={{ unicodeBidi: 'isolate', fontVariantNumeric: 'tabular-nums', ...style }}>{children}</bdi>;
const tone = { ok: C.gn, warn: C.or, bad: C.rd, info: C.ac };
const card = { border: `1px solid ${C.cardBd}`, background: 'var(--c-sf)', marginTop: 12 };
const kg = (n) => (n == null ? '—' : String(Math.round(n * 10) / 10));
const norm = (s) => String(s || '').trim().toLowerCase();
const track = (he, en) => (he ? 0 : en);

// a lift's state, in the words the coach acts on - stuck BEFORE dropping, as the engine reads it
function liftState(s) {
  if (s.count < 3) return { k: 'few', en: 'Too few', he: 'מעט נתונים', c: C.td };
  if (s.ballistic) return { k: 'power', en: 'Explosive', he: 'מתפרץ', c: C.ac };
  if (s.stale?.stale) return { k: 'stuck', en: 'Stuck', he: 'תקוע', c: C.or };
  if (s.trend?.dir === 'down') return { k: 'down', en: 'Dropping', he: 'יורד', c: C.rd };
  if (s.trend?.dir === 'up') return { k: 'up', en: 'Climbing', he: 'עולה', c: C.gn };
  return { k: 'hold', en: 'Holding', he: 'יציב', c: C.tm };
}

function moves(a, he, deloadHeadline) {
  const mains = (a.staples || []).filter((s) => s.isMain && !s.ballistic && s.count >= 3);
  const nm = (arr) => arr.slice(0, 3).map((s) => s.title).join(', ');
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
    ? { tone: 'info', t: he ? `תשאיר את המשקל ב־${nm(up)} כמו שהוא - ${up.length === 1 ? 'הוא עולה' : 'הם עולים'}, אבל עכשיו שבוע דילאוד.` : `Hold ${nm(up)} where ${up.length === 1 ? 'it is - it is' : 'they are - they are'} climbing, but this is a deload week.` }
    : { tone: 'ok', t: he ? `תמשיך להעלות ב־${nm(up)}: עוד ${I('2-3%')} משקל או עוד חזרה באותו מאמץ.` : `Keep pushing ${nm(up)}: +2-3% load or +1 rep at the same effort.` });
  if (a.skip && a.skip.gap >= 2) out.push({ tone: 'warn', t: he ? `הוא מדלג על ${a.skip.day} שוב ושוב (נרשם ${I(a.skip.logged)} מתוך ${I(a.skip.expected)}) - או שהיום הזה קשה מדי, או שהוא לא מסתדר לו בשבוע. תברר לפני שאתה נותן אותו שוב.` : `${a.skip.day} keeps being skipped (${a.skip.logged} of ${a.skip.expected}) - too demanding, or it does not fit his week. Confirm before re-prescribing it.` });
  if (a.rpeCoverage != null && a.rpeCoverage < 30 && out.length < 4) out.push({ tone: 'info', t: he ? `תבקש ממנו לרשום RPE - נרשם רק ב־${I(a.rpeCoverage + '%')} מהסטים, ובלי זה אי אפשר לדעת אם הוא עייף או שהגיע לתקרה.` : `Ask him to log effort (RPE) - on ${a.rpeCoverage}% of sets now, and without it fatigue and a ceiling look the same.` });
  if (!out.length) out.push(mains.length
    ? { tone: 'ok', t: L(he, 'Keep progressing - nothing is dropping or stuck.', 'תמשיך להתקדם - שום תרגיל לא יורד ולא תקוע.') }
    : { tone: 'info', t: L(he, 'Too little logged on the main lifts to call the block.', 'נרשם מעט מדי בתרגילים המרכזיים כדי לקבוע משהו על הבלוק.') });
  return out.slice(0, 4);
}

function Tile({ v, l, s, color, he }) {
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
function Glance({ a, he, strip, sub }) {
  const days = a.plannedDays || [];
  const weeks = Math.max(1, Number(a.weeks) || 1);
  if (!days.length) return null;
  const sess = a.sessions || [];
  // no planned day matches any logged day (the days were renamed after logging): say so, never a wall of 'not logged'
  const dayKeys = new Set(days.map(norm));
  if (sess.length && !sess.some((x) => dayKeys.has(norm(x.day)))) {
    return (
      <div style={card}>
        <div style={strip}><span>{L(he, 'The block at a glance', 'הבלוק במבט אחד')}</span></div>
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
      <div style={strip}><span>{L(he, 'The block at a glance', 'הבלוק במבט אחד')}</span><span style={sub}>{L(he, 'every planned day, week by week', 'כל יום מתוכנן, שבוע אחרי שבוע')}</span></div>
      <div style={{ padding: '8px 14px 12px', overflowX: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: cols, alignItems: 'center', minWidth: 0 }}>
          <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, color: C.tm, letterSpacing: track(he, '0.08em'), textTransform: 'uppercase' }}>{L(he, 'Week', 'שבוע')}</span>
          {Array.from({ length: weeks }, (_, i) => <span key={i} style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, color: C.tm, textAlign: 'center', padding: '4px 0' }}>{i + 1}</span>)}
          {days.map((d, di) => (
            <React.Fragment key={di}>
              <span style={{ fontFamily: FB, fontSize: 12, color: C.tx, paddingBlock: 7, paddingInlineEnd: 8, borderTop: `1px solid ${C.cardBd}`, overflowWrap: 'anywhere', lineHeight: 1.3 }}><bdi>{d}</bdi></span>
              {Array.from({ length: weeks }, (_, w) => <span key={w} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', alignSelf: 'stretch', borderTop: `1px solid ${C.cardBd}`, borderInlineStart: `1px solid ${C.cardBd}` }}><Mark k={cell(d, w + 1)} /></span>)}
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

function Lifts({ a, he, strip, sub }) {
  const rows = (a.staples || []).filter((s) => s.isMain && s.count >= 2).slice(0, 10);
  if (!rows.length) return null;
  return (
    <div style={card}>
      <div style={strip}><span>{L(he, 'Main lifts', 'התרגילים המרכזיים')}</span><span style={sub}>{L(he, 'up to the last 12 top sets · the change since the first', 'עד 12 טופ סטים אחרונים · השינוי מהראשון')}</span></div>
      {rows.map((s, i) => {
        const st = liftState(s);
        const chg = s.ballistic ? null : s.arcGainPct;   // a jump's estimated max means nothing
        return (
          <div key={s.title} data-lift-row style={{ padding: '10px 14px', borderTop: i ? `1px solid ${C.cardBd}` : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
              <span style={{ fontFamily: FB, fontSize: 13, fontWeight: 600, color: C.tx, minWidth: 0, overflowWrap: 'anywhere', lineHeight: 1.3 }}><bdi>{s.title}</bdi></span>
              <span style={{ fontFamily: FN, fontSize: 10.5, fontWeight: 700, letterSpacing: track(he, '0.08em'), textTransform: 'uppercase', color: st.c, flexShrink: 0 }}>{he ? st.he : st.en}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 6, flexWrap: 'wrap' }}>
              <Spark vals={s.arc} color={st.c === C.td ? C.tm : st.c} />
              <span style={{ fontFamily: FB, fontSize: 12, color: C.tm }}>{L(he, 'last', 'אחרון')} <Ltr style={{ color: C.tx }}>{kg(s.lastLoad)} {L(he, 'kg', 'ק״ג')} × {s.lastReps ?? '—'}</Ltr></span>
              {chg != null && <span style={{ fontFamily: FB, fontSize: 12, color: C.tm }}><Ltr style={{ color: (s.trend?.repNoisy || s.count < 4) ? C.td : chg > 0 ? C.gn : chg < 0 ? C.rd : C.tx }}>{chg > 0 ? '+' : ''}{chg}%</Ltr> {L(he, 'since the first', 'מהראשון')}</span>}
              <span style={{ fontFamily: FB, fontSize: 12, color: C.td }}><Ltr>{s.count}</Ltr> {L(he, 'logs', 'רישומים')}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function StrengthReview({ a, he }) {
  const v = a.verdict || {};
  const strip = { borderBottom: `1px solid ${C.cardBd}`, padding: '0 14px', minHeight: 41, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: track(he, '0.1em'), textTransform: 'uppercase', color: 'var(--c-stripTx, ' + C.tx + ')', background: 'var(--c-stripBg, var(--c-sf))' };
  const sub = { fontFamily: FN, fontSize: 10, color: C.tm, letterSpacing: track(he, '0.04em'), textTransform: 'none', fontWeight: 600 };
  const label = { fontFamily: FN, fontSize: 9.5, fontWeight: 700, letterSpacing: track(he, '0.16em'), textTransform: 'uppercase' };
  const mains = (a.staples || []).filter((s) => s.isMain && !s.ballistic && s.count >= 3);
  const climbing = mains.filter((s) => liftState(s).k === 'up').length;
  const deload = v.tone === 'warn';   // synthesizeVerdict keeps 'warn' for its deload branch only (a regex on the words missed the engine's 'דילאוד')
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
      <Glance a={a} he={he} strip={strip} sub={sub} />
      <Lifts a={a} he={he} strip={strip} sub={sub} />
    </div>
  );
}
