// TrainingLineageV2 — "plan vs reality" athlete review.
//
// What Ohad opens before writing an athlete's next block. Reads his LIVE logs
// (client_workouts: per-set load/reps/rpe/done) against what was prescribed and
// answers, verdict-first: did he train, how's he responding, which lifts are
// stuck/climbing/dropping, and what the next block should be. Every number is
// grounded in real data; thin data is labelled, never faked; nothing here
// changes his program — it analyses and advises, the coach builds.
//
// Analysis engine: src/lineageAnalysis.js (pure). This file is presentation.
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { C, FN } from './theme';
import { analyzeAthlete } from './lineageAnalysis';
import { getAthleteVault, getAthleteAsymmetryTrend, getAthleteRomLifts } from './poseMetricsStore';
import { autoAnalyzeAthleteVideos, pendingCount } from './autoAnalyzeVideos';
import { velocityProfile1RM, mvtForLift } from './velocityProfile1RM';
import { VelocityReport, RomReport } from './LineageLiftReport';
import { blockNum, classifyPattern, repsTop, exById } from './PlansView';
import { groupByBucket, BUCKETS, movementRegion } from './movementBucket';
import { exerciseContinuity } from './exerciseContinuity';
import { useHe } from './i18n';

// Hebrew is COMPOSED here, not looked up: nearly every line carries a number,
// a lift name or a plural, so a key→value map would split sentences. L() picks
// the language; Ltr() isolates a signed/degree number, whose trailing ° or
// leading + otherwise lands on the wrong side inside a Hebrew line.
const L = (he, en, hb) => (he ? hb : en);
// "1 בלוקים" is not Hebrew: one gets its own word, the rest a counted plural.
const cnt = (n, one, many) => (n === 1 ? one : `${n} ${many}`);
const Ltr = ({ children }) => <span dir="ltr" style={{ unicodeBidi: 'isolate' }}>{children}</span>;
const CHAR_HE = { strength: 'כוח', power: 'עוצמה', hypertrophy: 'היפרטרופיה', endurance: 'סיבולת', base: 'בסיס', deload: 'הורדה' };
const CONF_HE = { high: 'גבוהה', medium: 'בינונית', moderate: 'בינונית', low: 'נמוכה' };
const JOINT_HE = { Shoulders: 'כתפיים', Elbows: 'מרפקים', Hips: 'ירכיים', Knees: 'ברכיים' };
const SIDE_HE = { Left: 'שמאל', Right: 'ימין' };
// lineageAnalysis keys the strength→power read by `side`; the English prose
// stays in the engine, the Hebrew is composed here.
const TRANSFER_HE = {
  'strength-ahead': { read: 'הכוח שלו עולה, אבל העבודה המתפרצת לא עולה איתו', move: 'הכוח לא עובר לעוצמה — תטה את הבלוק הבא למהירות, פליאומטריקה וכוח־מהירות (משקלים קלים יותר, מהר), פחות עבודה כבדה ואיטית' },
  'power-ahead': { read: 'הקפיצות והזריקות מתקדמות, אבל בסיס הכוח נתקע', move: 'העוצמה עקפה את בסיס הכוח — תוסיף עבודת כוח מקסימלי (סקוואט, הינג׳ ולחיצה כבדים) כדי להרים את התקרה של העוצמה' },
  balanced: { read: 'הכוח והעוצמה עולים יחד', move: 'הכוח עובר לעוצמה — שמור על האיזון, אל תטה יותר מדי לצד אחד' },
  stalled: { read: 'לא הכוח ולא העוצמה זזים כרגע', move: 'שניהם תקועים — זה בלוק של שינוי גירוי או של הורדה, לא בלוק של "לדחוף חזק יותר"' },
};
const BUCKET_HE = { 'upper-bilateral': 'עליון · דו־צדדי', 'upper-unilateral': 'עליון · חד־צדדי', 'upper-plyo': 'עליון · פליאומטרי', 'lower-bilateral': 'תחתון · דו־צדדי', 'lower-unilateral': 'תחתון · חד־צדדי', 'lower-plyo': 'תחתון · פליאומטרי' };

const wrap = { maxWidth: 980, margin: '0 auto', fontFamily: FN };
const card = { border: `1px solid ${C.bd}`, background: C.sf, marginTop: 12 };
const hd = { background: C.sf2, borderBottom: `1px solid ${C.bd}`, padding: '8px 14px', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.tx, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 };
const hdQ = { color: C.tm, fontWeight: 400, letterSpacing: 0, textTransform: 'none', fontSize: 11 };
const bd = { padding: '13px 14px' };

// A collapsible report card: the strip header is the toggle; collapsed it shows a
// one-line summary on the right, expanded it reveals the full body (Ohad — the
// analysis sections open on demand). Defaults closed.
function Section({ title, tag, summary, children, cardStyle = card, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const he = useHe();
  return (
    <div style={cardStyle}>
      <div className="lin-hd" style={{ ...hd, cursor: 'pointer' }} onClick={() => setOpen((o) => !o)} role="button" tabIndex={0} aria-expanded={open}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen((o) => !o); } }}
        title={open ? L(he, 'Collapse', 'סגירה') : L(he, 'Expand for the full report', 'פתיחת הדוח המלא')}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><span style={{ color: C.ac, fontSize: 10 }}>{<svg aria-hidden viewBox="0 0 9 6" fill="none" width="0.95em" height="0.63em" style={{ display: 'inline-block', verticalAlign: 'middle', transition: 'transform 150ms ease', transform: (open) ? 'none' : (he ? 'rotate(90deg)' : 'rotate(-90deg)') }}><path d="M1 1l3.5 3.5L8 1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>}</span>{title}{tag}</span>
        <span style={hdQ}>{open ? '' : summary}</span>
      </div>
      {open && <div style={bd}>{children}</div>}
    </div>
  );
}

const toneColor = { warn: C.or, bad: C.rd, ok: C.gn, info: C.ac };

function Read({ tone = 'info', children, why }) {
  return (
    <div style={{ display: 'flex', gap: 10, padding: '10px 0', borderTop: `1px solid ${C.bd}`, fontSize: 13, lineHeight: 1.5 }}>
      <span style={{ flex: '0 0 16px', color: toneColor[tone], fontWeight: 700, textAlign: 'center' }}>
        {tone === 'ok' ? '✓' : tone === 'bad' ? '✕' : tone === 'warn' ? '!' : '·'}
      </span>
      <div>{children}{why && <span style={{ color: C.tm, fontSize: 12 }}> {why}</span>}</div>
    </div>
  );
}

function Kpi({ v, l, s, color }) {
  return (
    <div style={{ flex: '1 1 0', minWidth: 110, border: `1px solid ${C.bd}`, background: C.sf2, padding: '9px 11px' }}>
      <div style={{ fontSize: 21, fontWeight: 700, lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: color || C.tx }}>{v}</div>
      <div style={{ fontSize: 9, letterSpacing: '0.11em', textTransform: 'uppercase', color: C.tm, marginTop: 5 }}>{l}</div>
      {s && <div style={{ fontSize: 10, color: C.td, marginTop: 2 }}>{s}</div>}
    </div>
  );
}

// tiny e1RM sparkline — a clean mini LINE (same grammar as the full trend
// charts: accent polyline + faint area + endpoint dot), not a bar strip, so
// the inline lift-row trend reads like the review/analysis line charts.
function Spark({ pts, dir }) {
  const col = dir === 'up' ? C.gn : dir === 'down' ? C.rd : C.or;
  const W = 88, H = 24, pad = 3;
  if (!pts || pts.length < 2) {
    return <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: W, height: H, verticalAlign: 'middle', flexShrink: 0 }}><span style={{ width: 5, height: 5, borderRadius: '50%', background: col }} /></span>;
  }
  const max = Math.max(...pts), min = Math.min(...pts), rng = (max - min) || 1;
  const gx = (i) => pad + i * ((W - 2 * pad) / (pts.length - 1));
  const gy = (v) => pad + (1 - (v - min) / rng) * (H - 2 * pad);
  const line = pts.map((v, i) => `${gx(i).toFixed(1)},${gy(v).toFixed(1)}`).join(' ');
  const area = `M${gx(0).toFixed(1)},${H - pad} L${line.replace(/ /g, ' L')} L${gx(pts.length - 1).toFixed(1)},${H - pad} Z`;
  const lastX = gx(pts.length - 1), lastY = gy(pts[pts.length - 1]);
  return (
    <span style={{ display: 'inline-flex', width: W, height: H, verticalAlign: 'middle', flexShrink: 0 }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: W, height: H, display: 'block', overflow: 'visible' }} aria-hidden="true">
        <path d={area} fill={col} opacity="0.14" />
        <polyline points={line} fill="none" stroke={col} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={gx(0)} cy={gy(pts[0])} r="1.8" fill={col} opacity="0.45" />
        <circle cx={lastX} cy={lastY} r="2.4" fill={col} />
      </svg>
    </span>
  );
}

function Tag({ text, color }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, fontSize: 10, fontWeight: 700, letterSpacing: '0.03em', padding: '3px 7px', border: `1px solid ${color}`, color, whiteSpace: 'nowrap' }}>{text}</span>;
}

// staple → { tag, tagColor, why, next } — every competitor stops at "here's the
// status"; the coach's actual job is "so what do I write next block". `next` is
// that concrete move (grounded in the S&C research: multi-signal stall =
// e1RM-flat + RPE-creep = fatigue-mask → deload/rotate, not more kg; time-since-
// PR is the rotation trigger). It's a suggestion he can override, with the why.
function readStaple(s, he) {
  const wks = s.weeksSincePr;
  const noPr = wks != null && wks >= 5;   // hasn't beaten its best in 5+ weeks → rotation trigger
  if (s.count < 3) return { tag: L(he, `${s.count}× ONLY`, `רק ${s.count}×`), tagColor: C.td, why: L(he, 'too few logs to read a trend', 'מעט מדי רישומים כדי לקרוא מגמה'), next: L(he, 'log 3+ before judging it', 'צריך 3 רישומים ומעלה לפני שאפשר לשפוט') };
  if (s.ballistic) {
    // A ballistic lift is ALWAYS "EXPLOSIVE" — never a green "GOING UP" off load,
    // because a jump/throw progresses on speed + height, not kg (Ohad). Load
    // creeping up is still noted in the 'why', but a "keep adding load" tag would
    // contradict the "don't chase kg here" cue on the same row.
    return { tag: L(he, 'EXPLOSIVE', 'מתפרץ'), tagColor: C.pu,
      why: s.trend?.dir === 'up' ? L(he, 'load creeping up — but a jump progresses on speed + height, not kg', 'המשקל עולה לאט — אבל קפיצה מתקדמת במהירות ובגובה, לא בקילו') : L(he, 'jumps progress on speed + height, not load', 'קפיצות מתקדמות במהירות ובגובה, לא במשקל'),
      next: L(he, 'film a set for velocity — don\'t chase kg here', 'צלם סט כדי למדוד מהירות — פה לא רודפים אחרי קילו') };
  }
  if (s.stale?.state === 'ok' && s.stale.stale) {
    if (s.stale.mode === 'hard') return { tag: L(he, 'STALLED · HARD', 'תקוע · קשה'), tagColor: C.or, why: L(he, 'flat weight + effort rising = hidden fatigue, not a real ceiling', 'אותו משקל ומרגיש יותר קשה = עייפות, עוד לא תקרה'), next: L(he, 'one lighter week (~50% volume) then re-test, or swap the variation — not more kg', 'שבוע קל (חצי מהנפח) ואז תבדוק שוב, או תחליף וריאציה — לא עוד קילו') };
    if (s.stale.mode === 'easy') return { tag: L(he, 'STALLED · EASY', 'תקוע · קל'), tagColor: C.ac, why: L(he, 'flat but moving easy — he\'s under-stimulated', 'קבוע אבל זז בקלות — הגירוי לא מספיק לו'), next: L(he, '+2.5–5kg or add a set', 'עוד 2.5–5 קילו או עוד סט') };
    return { tag: L(he, 'STALLED', 'תקוע'), tagColor: C.or, why: L(he, 'weight hasn\'t moved in 3 sessions', 'המשקל לא זז כבר 3 אימונים'), next: noPr ? L(he, `no PR in ${wks} weeks — rotate the variation`, `אין שיא כבר ${wks} שבועות — תחליף וריאציה`) : L(he, 'push the load or change the stimulus', 'תעלה משקל או תשנה גירוי') };
  }
  if (s.trend?.state === 'ok') {
    if (s.trend.repNoisy) return { tag: L(he, 'REPS VARIED', 'חזרות השתנו'), tagColor: C.tm, why: L(he, 'rep scheme shifted across the block — e1RM can\'t tell a strength change from the rep change', 'טווח החזרות השתנה לאורך הבלוק — ה־e1RM לא מבדיל בין שינוי בכוח לשינוי בחזרות'), next: L(he, 'read it off load-at-a-fixed-rep, or hold a rep target for 3 sessions for a clean trend', 'תשווה משקלים באותו מספר חזרות — או תשאיר את אותו יעד חזרות ל־3 אימונים, כדי לקבל מגמה נקייה') };
    if (s.trend.dir === 'up') return { tag: L(he, 'PROGRESS', 'מתקדם'), tagColor: C.gn, why: L(he, 'progressing', 'מתקדם'), next: L(he, '+2–3% load or +1 rep at the same effort', 'עוד 2–3% משקל או עוד חזרה באותו מאמץ') };
    if (s.trend.dir === 'down') return { tag: L(he, 'REGRESS', 'יורד'), tagColor: C.rd, why: L(he, 'going backwards', 'הולך אחורה'), next: L(he, 'back off ~5–10% intensity, hold volume, check recovery', 'תוריד 5–10% במשקל, תשאיר את כמות הסטים ותבדוק שינה והתאוששות') };
  }
  return { tag: L(he, 'HOLDING', 'יציב'), tagColor: C.tm, why: L(he, 'holding steady', 'נשאר יציב'), next: noPr ? L(he, `no PR in ${wks} weeks — time to change it up`, `אין שיא כבר ${wks} שבועות — הגיע הזמן לשנות`) : L(he, 'maintain, or nudge the load', 'שמור, או תעלה קצת משקל') };
}

function nextBlockText(a, he) {
  const v = a.verdict;
  const nextNum = a.blockNumber != null ? ` (#${a.blockNumber + 1})` : '';
  if (v.tone === 'warn') {
    const region = a.region?.lower?.pct >= a.region?.upper?.pct ? 'lower' : 'upper';
    const hardStale = a.staples.find((s) => s.stale?.stale && s.stale.mode === 'hard');
    // "Keep pushing" must exclude stale/ballistic lifts — a stale lift isn't
    // "still has room", and you don't chase kg on a jump.
    const climbing = a.staples.filter((s) => s.trend?.dir === 'up' && !s.stale?.stale && !s.ballistic).map((s) => s.title);
    if (he) {
      return (
        <>
          <b>שבוע הורדה{nextNum}: חתוך כ־50% מהנפח ב{region === 'lower' ? 'פלג גוף תחתון' : 'פלג גוף עליון'}, שמור על העצימות.</b> העייפות מצטברת מהר יותר ממה שהיא מתפוגגת.
          {hardStale && <> אחרי שבוע ההורדה: <b>{hardStale.title} תקוע במאמץ גבוה</b> — תשנה גירוי (טמפו, עצירה, וריאציה), לא רק את המספר.</>}
          {climbing.length > 0 && <> תמשיך לדחוף ב־<b>{climbing.slice(0, 2).join(' ו־')}</b> — יש עוד מקום.</>}
          {a.skip && <> ותטפל בדילוג על <b>{a.skip.day}</b> ({a.skip.logged}/{a.skip.expected} נרשמו) — לתכנן אותו שוב כמו שהוא לא יעזור.</>}
        </>
      );
    }
    return (
      <>
        <b>{`Deload${nextNum}: cut ${region}-body volume ~50%, hold intensity.`}</b>{' Fatigue is accumulating faster than it\'s clearing.'}
        {hardStale && <>{' When you rebuild: '}<b>{`${hardStale.title} is stale at a hard effort`}</b>{' — change the stimulus (tempo / pause / variation), not just the number.'}</>}
        {climbing.length > 0 && <>{' Keep pushing '}<b>{climbing.slice(0, 2).join(' + ')}</b>{' — still has room.'}</>}
        {a.skip && <>{' And fix the '}<b>{`${a.skip.day} skip`}</b>{` (${a.skip.logged}/${a.skip.expected} logged) — reprogramming it as-is won't help.`}</>}
      </>
    );
  }
  if (v.tone === 'info') {
    if (he) return <><b>קודם שיתחיל לרשום.</b> רק {a.adh.sessionPct}% מהאימונים נרשמו — כל סימן עומס כאן לא אמין עד שהוא מתאמן ורושם. זו שיחת בירור, לא שינוי בתוכנית.</>;
    return <><b>{'Get the athlete logging first.'}</b>{` Only ${a.adh.sessionPct}% of sessions are logged — every load signal here is unreliable until the athlete is training and recording it. This is a check-in, not a programming change.`}</>;
  }
  // Mutually exclusive: a stale lift is "stuck", never also "climbing" — else
  // the coach is told to both add load AND hold on the same lift. Ballistics
  // never land in "add load" (kg isn't the read on a jump). Matches the
  // responding-split split above.
  const stuck = a.staples.filter((s) => s.stale?.stale || s.trend?.dir === 'down').map((s) => s.title);
  const climbing = a.staples.filter((s) => s.trend?.dir === 'up' && !s.stale?.stale && !s.ballistic).map((s) => s.title);
  if (he) {
    return (
      <>
        <b>{a.blockNumber != null ? `ממשיכים להתקדם בבלוק #${a.blockNumber + 1}.` : 'ממשיכים להתקדם בבלוק הבא.'}</b> יציב או מתקדם.
        {climbing.length > 0 && <> תעלה משקל ב־<b>{climbing.slice(0, 3).join(', ')}</b>.</>}
        {stuck.length > 0 && <> ב־<b>{stuck.slice(0, 2).join(', ')}</b>: תשמור או תגוון לפני שאתה מעמיס עוד משקל.</>}
      </>
    );
  }
  return (
    <>
      <b>{`Progress the block${nextNum}.`}</b>{' Holding or progressing.'}
      {climbing.length > 0 && <>{' Add load on '}<b>{climbing.slice(0, 3).join(', ')}</b>.</>}
      {stuck.length > 0 && <>{' Hold or vary '}<b>{stuck.slice(0, 2).join(', ')}</b>{' before forcing more weight.'}</>}
    </>
  );
}

function LiftRow({ s }) {
  const he = useHe();
  const r = readStaple(s, he);
  const loads = s.loads.filter((x) => x != null).slice(-4).map((x) => (Number.isInteger(x) ? x : x.toFixed(1)));
  const fmt = (d) => { try { const dt = new Date(d); return `${dt.getDate()}/${dt.getMonth() + 1}`; } catch { return ''; } };
  const best = s.pr != null ? `${Number.isInteger(s.pr) ? s.pr : s.pr.toFixed(1)}kg` : (s.prE1 != null ? `e${s.prE1}` : '—');
  return (
    <tr>
      <td style={{ padding: '9px 8px', borderBottom: `1px solid ${C.bd}`, verticalAlign: 'top' }}>
        <div style={{ color: C.tx }}>{s.title}</div>
        <div style={{ fontSize: 11, color: C.tm, marginTop: 2, lineHeight: 1.4 }}>{r.why}</div>
        <div style={{ fontSize: 11.5, color: C.ac, marginTop: 3, fontWeight: 600, lineHeight: 1.4 }}>{he ? "← " : "→ "}{r.next}</div>
        <div style={{ fontSize: 10, color: C.td, marginTop: 3 }}>{`${s.count}× · ${L(he, 'last', 'אחרון')} ${fmt(s.lastDate)}`}</div>
      </td>
      <td data-h={L(he, 'Trend', 'מגמה')} style={{ padding: '9px 8px', borderBottom: `1px solid ${C.bd}`, whiteSpace: 'nowrap', verticalAlign: 'top' }}>
        {s.trend?.state === 'ok' ? <><Spark pts={s.trend.pts} dir={s.trend.dir} /> <span style={{ fontVariantNumeric: 'tabular-nums', color: C.tx, fontWeight: 600, marginInlineStart: 4 }}>e{s.trend.latest}</span></> : <span style={{ color: C.td, fontSize: 11 }}>—</span>}
      </td>
      <td data-h={L(he, 'Best', 'שיא')} style={{ padding: '9px 8px', borderBottom: `1px solid ${C.bd}`, fontVariantNumeric: 'tabular-nums', color: C.tx, fontWeight: 600, whiteSpace: 'nowrap', verticalAlign: 'top' }}>
        {best}
        {!s.ballistic && s.weeksSincePr != null && s.weeksSincePr >= 2 && (
          <span style={{ fontSize: 10, fontWeight: 400, color: s.weeksSincePr >= 6 ? C.or : C.td, marginInlineStart: 6 }}>{he ? `· שיא לפני ${s.weeksSincePr} שב׳` : `· PR ${s.weeksSincePr}w ago`}</span>
        )}
      </td>
      <td data-h={L(he, 'Last loads', 'משקלים אחרונים')} style={{ padding: '9px 8px', borderBottom: `1px solid ${C.bd}`, fontVariantNumeric: 'tabular-nums', color: C.tm, verticalAlign: 'top', whiteSpace: 'nowrap' }}><Ltr>{loads.join(' · ')}</Ltr></td>
      <td style={{ padding: '9px 8px', borderBottom: `1px solid ${C.bd}`, textAlign: 'end', verticalAlign: 'top' }}><Tag text={r.tag} color={r.tagColor} /></td>
    </tr>
  );
}

// Per-lift "FULL REPORT" expander — reveals the Review-screen velocity/ROM
// report built from the latest filmed set's stored payload (report). A shared
// control so bar-speed + ROM cards read identically. When the latest entry
// predates the payload (e.g. its clip was re-filmed away / not re-analysed yet),
// it shows an honest note instead of crashing.
function ReportToggle({ open, onToggle }) {
  const he = useHe();
  return (
    <button type="button" onClick={onToggle}
      style={{ marginTop: 8, background: 'transparent', border: 'none', padding: 0, color: C.ac, fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
      {open ? L(he, '▾ Hide full report', '▾ הסתרת הדוח המלא') : L(he, '▸ Full report', '◂ הדוח המלא')}
    </button>
  );
}
function NoReportNote() {
  const he = useHe();
  return (
    <div style={{ marginTop: 10, border: `1px dashed ${C.bd}`, background: C.sf2, padding: '10px 12px', color: C.tm, fontSize: 11.5, lineHeight: 1.5 }}>
      {L(he, 'The full per-rep report populates after this lift\'s latest clip is re-analysed — it runs automatically the next time this page is open. The trend above is live now.', 'הדוח המלא לכל חזרה יופיע אחרי שהקליפ האחרון של התרגיל ינותח מחדש — זה קורה אוטומטית בפעם הבאה שהעמוד ייפתח. המגמה למעלה כבר מעודכנת.')}
    </div>
  );
}

// BAR SPEED per-lift row: the per-session velocity-loss trend (unchanged) + an
// expander into the Review-style velocity report (speed/accel graph, best mean /
// velocity loss, per-rep table) rendered from the latest set's stored payload.
function BarSpeedLiftCard({ lift }) {
  const he = useHe();
  const [open, setOpen] = useState(false);
  const mx = Math.max(...lift.entries.map((e) => e.lossPct || 0), 20);
  const tCol = lift.trend === 'worse' ? C.rd : lift.trend === 'better' ? C.gn : C.pu;
  const last = lift.entries[lift.entries.length - 1];
  const report = last && last.report;
  // Load-velocity 1RM: if he filmed this lift across a real load range,
  // extrapolate a max WITHOUT a max test (the elite-VBT read no phone tool
  // does). The engine refuses thin/noisy data, so this line only appears on a
  // genuinely profilable lift — never a fabricated number.
  const prof = velocityProfile1RM(
    lift.entries.filter((e) => e.load && e.bestMean).map((e) => ({ load: e.load, velocity: e.bestMean })),
    mvtForLift(lift.title),
  );
  return (
    <div style={{ padding: '9px 0', borderTop: `1px solid ${C.bd}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
        <span style={{ fontSize: 12.5, color: C.tx }}>{lift.title}</span>
        <span style={{ fontSize: 10, color: tCol, letterSpacing: '0.04em' }}>
          {last?.lossPct != null ? L(he, `${last.lossPct}% loss`, `ירידת מהירות ${last.lossPct}%`) : ''}{lift.count >= 2 ? ` · ${lift.trend === 'worse' ? L(he, 'fatiguing', 'מתעייף') : lift.trend === 'better' ? L(he, 'recovering', 'מתאושש') : L(he, 'holding', 'יציב')}` : ''}
        </span>
      </div>
      <div dir="ltr" style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 30 }}>
        {lift.entries.slice(-8).map((e, i) => (
          <div key={i} title={he
            ? `${(e.date || '').slice(0, 10)}${e.lossPct != null ? ` · ירידת מהירות ${e.lossPct}%` : ' · אין נתון ירידת מהירות'} · הכי מהיר ${e.bestMean} m/s`
            : `${(e.date || '').slice(0, 10)}${e.lossPct != null ? ` · ${e.lossPct}% vel-loss` : ' · vel-loss n/a'} · best ${e.bestMean} m/s`}
            style={{ flex: 1, minWidth: 4, height: `${Math.max(12, ((e.lossPct || 0) / mx) * 100)}%`, background: tCol, opacity: 0.85, borderRadius: '1px 1px 0 0' }} />
        ))}
      </div>
      {prof.state === 'ok' && prof.confidence !== 'low' && (
        <div title={he
          ? `פרופיל עומס־מהירות: קו ישר של מהירות המוט מהמצלמה מול המשקל, על ${prof.loads} משקלים, שממשיך עד סף המהירות המינימלית של התרגיל (${prof.mvt} m/s). R²=${prof.r2}. המהירות לא מכוילת (זיהוי תנוחה דו־ממדי), אז תסתכל על המגמה לאורך התאריכים — לא על הקילו המדויק — ותאמת עם סט עליון אמיתי לפני שאתה נותן משקלים לפיה. זה לא מקסימום שנבדק.`
          : `Load-velocity profile: linear fit of phone-camera bar speed vs load across ${prof.loads} loads, extrapolated to this lift's minimal-velocity threshold (${prof.mvt} m/s). R²=${prof.r2}. The speed is uncalibrated 2D-pose m/s, so read the TREND across dates — not the exact kg — and confirm with a real top set before you prescribe loads off it. Not a tested max.`}
          style={{ marginTop: 6, fontSize: 10.5, color: C.ac, letterSpacing: '0.02em' }}>
          {he ? `1RM משוער כ־${prof.oneRM} קילו ` : `Est. 1RM ~${prof.oneRM}kg `}<span style={{ color: C.td }}>{he ? `· ${prof.loads} משקלים · ודאות ${CONF_HE[prof.confidence] || prof.confidence} · בלי מבחן מקסימום` : `· ${prof.loads} loads · ${prof.confidence} confidence · no max test`}</span>
        </div>
      )}
      <ReportToggle open={open} onToggle={() => setOpen((o) => !o)} />
      {open && (report ? <div style={{ marginTop: 10 }}><VelocityReport report={report} title={lift.title} /></div> : <NoReportNote />)}
    </div>
  );
}

// RANGE OF MOTION per-lift row: the peak-ROM-per-session trend graph (unchanged)
// + an expander into the Review-style ROM report (degrees-over-time graph, joint
// + L/R selector, L↔R ROM bars, largest ROM / collapsed reps, tempo, per-rep
// table) rendered from the latest set's stored payload.
function RomLiftCard({ lift }) {
  const he = useHe();
  const [open, setOpen] = useState(false);
  const roms = lift.entries.filter((e) => e.maxRom != null);
  const last = roms[roms.length - 1];
  const report = last && last.report;
  const delta = roms.length >= 2 ? Math.round(last.maxRom - roms[0].maxRom) : null;
  const dCol = delta == null ? C.tm : delta <= -8 ? C.rd : delta >= 5 ? C.gn : C.tm;
  // Full graph (Ohad #240): the same rich treatment as the Load&Volume /
  // Strength→Power / readiness graphs — a real degree Y-axis with bright ticks,
  // dashed gridlines, an area gradient, a dot per filmed set, and a marked HIGH
  // (peak) + NOW. A ZOOMED domain (not 0-based) so a quietly shrinking working
  // range is actually visible — the whole point of ROM.
  const pts = roms.slice(-10);
  const vals = pts.map((e) => e.maxRom);
  const lo = Math.min(...vals), hi = Math.max(...vals), rng = (hi - lo) || 1;
  const BRAND = '#39BDFF'; // literal cyan — C.ac flips to black in light mode
  const GW = 320, GH = 92, padT = 16, padB = 8, padX = 6, plotH = GH - padT - padB;
  const domLo = lo - rng * 0.14, domHi = hi + rng * 0.20, domR = (domHi - domLo) || 1;
  const gy = (v) => padT + (1 - (v - domLo) / domR) * plotH;
  const gx = (i, n) => padX + (n <= 1 ? (GW - 2 * padX) / 2 : i * ((GW - 2 * padX) / (n - 1)));
  const pctX = (i, n) => `${(gx(i, n) / GW) * 100}%`;
  const pctY = (v) => `${(gy(v) / GH) * 100}%`;
  const line = pts.map((e, i) => `${gx(i, pts.length).toFixed(1)},${gy(e.maxRom).toFixed(1)}`).join(' ');
  const area = `M${gx(0, pts.length).toFixed(1)},${GH - padB} L${line.replace(/ /g, ' L')} L${gx(pts.length - 1, pts.length).toFixed(1)},${GH - padB} Z`;
  const ticks = [...new Set([Math.round(hi), Math.round(lo + rng * 0.5), Math.round(lo)])];
  let pkI = 0; pts.forEach((e, i) => { if (e.maxRom > pts[pkI].maxRom) pkI = i; });
  const gid = `romGrad-${lift.title.replace(/[^a-z0-9]/gi, '')}`;
  return (
    <div style={{ padding: '10px 0', borderTop: `1px solid ${C.bd}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, color: C.tx }}>{lift.title}</span>
        <span style={{ fontSize: 10, color: dCol, letterSpacing: '0.04em', fontVariantNumeric: 'tabular-nums' }}>{L(he, 'now ', 'עכשיו ')}<b style={{ color: BRAND }}><Ltr>{Math.round(last.maxRom)}°</Ltr></b>{delta != null ? <>{' · '}<Ltr>{`${delta >= 0 ? '+' : ''}${delta}°`}</Ltr>{L(he, ' vs first', ' מההתחלה')}</> : ''}</span>
      </div>
      {pts.length >= 2 ? (
        <div dir="ltr" style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
          <div style={{ position: 'relative', width: 30, flexShrink: 0, fontSize: 9, fontVariantNumeric: 'tabular-nums', textAlign: 'end' }}>
            {ticks.map((L) => (
              <span key={L} dir="ltr" style={{ position: 'absolute', top: pctY(L), insetInlineEnd: 0, transform: 'translateY(-50%)', color: C.tx, fontWeight: 700 }}>{L}°</span>
            ))}
          </div>
          <div style={{ position: 'relative', flex: 1, height: GH }}>
            <svg viewBox={`0 0 ${GW} ${GH}`} preserveAspectRatio="none" style={{ width: '100%', height: GH, display: 'block', background: C.sf2, border: `1px solid ${C.bd}` }}>
              <defs>
                <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={BRAND} stopOpacity="0.22" /><stop offset="100%" stopColor={BRAND} stopOpacity="0" /></linearGradient>
              </defs>
              {ticks.map((L) => <line key={L} x1={0} y1={gy(L)} x2={GW} y2={gy(L)} stroke={C.bd} strokeWidth="0.75" strokeDasharray="4" />)}
              <path d={area} fill={`url(#${gid})`} />
              <polyline points={line} fill="none" stroke={BRAND} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {pts.map((e, i) => (
              <div key={i} title={he ? `${(e.date || '').slice(0, 10)} · טווח עבודה ${Math.round(e.maxRom)}°` : `${(e.date || '').slice(0, 10)} · ${Math.round(e.maxRom)}° working range`} style={{ position: 'absolute', left: pctX(i, pts.length), top: pctY(e.maxRom), width: 7, height: 7, borderRadius: '50%', background: BRAND, transform: 'translate(-50%,-50%)', boxShadow: '0 0 0 2px var(--c-sf2)', pointerEvents: 'none' }} />
            ))}
            <div style={{ position: 'absolute', left: pctX(pkI, pts.length), top: pctY(pts[pkI].maxRom), transform: 'translate(-50%,-50%)', pointerEvents: 'none' }}>
              <div style={{ width: 11, height: 11, borderRadius: '50%', background: 'transparent', border: `2px solid ${BRAND}`, boxShadow: '0 0 0 2px var(--c-sf2)' }} />
              <div style={{ position: 'absolute', bottom: '150%', left: '50%', transform: 'translateX(-50%)', fontSize: 8.5, fontWeight: 700, color: BRAND, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', background: 'var(--c-sf2)', padding: '1px 4px', borderRadius: 2, border: `1px solid ${C.bd}` }}>{Math.round(pts[pkI].maxRom)}°</div>
            </div>
            <div style={{ position: 'absolute', right: 2, bottom: 2, fontSize: 8, fontWeight: 700, color: C.tm, letterSpacing: '0.1em', pointerEvents: 'none' }}>{L(he, 'NOW', 'עכשיו')}</div>
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 11, color: C.td, paddingInlineStart: 2 }}>{L(he, 'One filmed set · ', 'סט מצולם אחד · ')}<Ltr>{Math.round(last.maxRom)}°</Ltr>{L(he, ' — film another to trend the range.', ' — צלם עוד אחד כדי לראות מגמה בטווח.')}</div>
      )}
      <ReportToggle open={open} onToggle={() => setOpen((o) => !o)} />
      {open && (report ? <div style={{ marginTop: 10 }}><RomReport report={report} /></div> : <NoReportNote />)}
    </div>
  );
}

export default function TrainingLineageV2({ traineeId, traineeName, exercises, plans, clientWorkouts, loading, onOpenPlan }) {
  const he = useHe();
  const exMap = useMemo(() => exById(exercises), [exercises]);
  const [selBlock, setSelBlock] = useState(null); // null = latest; else a plan/block ID to view a PREVIOUS block (id keys every block, numbered or not — #231)
  const a = useMemo(() => {
    if (!plans) return null;
    return analyzeAthlete(clientWorkouts || [], traineeId, plans, { blockNum, classifyPattern, repsTop, exMap, targetBlockId: selBlock, he });
  }, [clientWorkouts, traineeId, plans, exMap, selBlock, he]);
  // Auto-analyse EVERY uploaded clip for bar-speed + symmetry — no manual "save
  // to trend" (Ohad). Runs once per clip in the background when the report opens
  // (owner-only surface); analysed clips are remembered so re-opens are instant.
  // `poseBump` bumps on each stored result so the vault/symmetry memos re-read.
  const [poseBump, setPoseBump] = useState(0);
  const [autoPose, setAutoPose] = useState({ running: false, done: 0, total: 0 });
  const stopRef = useRef(false);
  useEffect(() => {
    stopRef.current = false;
    if (!traineeId || traineeId === 'demo' || !clientWorkouts || !clientWorkouts.length) return undefined;
    const pending = pendingCount(clientWorkouts, traineeId);
    if (!pending) return undefined;
    setAutoPose({ running: true, done: 0, total: pending });
    autoAnalyzeAthleteVideos(clientWorkouts, traineeId, {
      shouldStop: () => stopRef.current,
      // Cap the on-open batch so a large backlog (esp. the one-time re-analyze
      // storm after a DONE_KEY bump) can't run dozens of MediaPipe passes back-
      // to-back and freeze the report on first open; the background warmer drains
      // the rest gently. Steady state (a few new clips) is unaffected.
      maxPerRun: 8,
      onProgress: ({ done, total }) => { setAutoPose({ running: true, done, total }); setPoseBump((n) => n + 1); },
    }).then(() => { setAutoPose((s) => ({ ...s, running: false })); setPoseBump((n) => n + 1); })
      .catch(() => setAutoPose((s) => ({ ...s, running: false })));
    return () => { stopRef.current = true; };
  }, [traineeId, clientWorkouts]);
  const vault = useMemo(() => getAthleteVault(traineeId), [traineeId, poseBump]);
  const asymTrend = useMemo(() => getAthleteAsymmetryTrend(traineeId), [traineeId, poseBump]);
  const [showThin, setShowThin] = useState(false); // expand the "logged 1-2× · too few to trend" lifts
  const [liftsOpen, setLiftsOpen] = useState(false); // HIS LIFTS list collapsed by default — click the header to expand (Ohad)
  const [arcOpen, setArcOpen] = useState(true); // THE ARC collapsible like its siblings (Ohad 2026-08-21); starts open — it's the headline read
  const [barSpeedAll, setBarSpeedAll] = useState(false); // Bar-speed shows the top 3 lifts, expands to the FULL report of every tracked lift (Ohad #203)
  const [romAll, setRomAll] = useState(false); // Range-of-motion card: same top-3 → full-report expansion as bar speed (Ohad #203)
  // Lifts that carry a real camera ROM read (peak joint range per filmed set).
  // From the FULL store, not the bar-speed-filtered vault: ballistic and
  // symmetry-only lifts store a real maxRom that the velocity filter hid
  // (audit 08-22 #48).
  const romLifts = useMemo(() => getAthleteRomLifts(traineeId), [traineeId]);

  const shell = (children) => (
    <div style={{ ...wrap, background: C.bg, border: `1px solid ${C.bd}`, borderRadius: 2, overflow: 'hidden' }}>
      {children}
    </div>
  );

  if (loading || !a) {
    return shell(
      <div style={{ padding: 40, textAlign: 'center', color: C.tm, fontFamily: FN, fontSize: 13, letterSpacing: '0.08em' }}>{L(he, 'READING LOGS…', 'קורא את הרישומים…')}</div>
    );
  }

  // strip header — shared
  const Strip = (
    <div style={{ background: `linear-gradient(90deg, color-mix(in srgb, ${C.ac} 15%, ${C.bg}), ${C.bg})`, border: `1px solid ${C.bd}`, borderBottom: `2px solid ${C.ac}`, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.tx }}>
        {L(he, 'Training Analysis · ', 'ניתוח אימונים · ')}<span style={{ color: C.ac }}>{traineeName}</span>
      </span>
      <span style={{ fontSize: 10, letterSpacing: '0.1em', color: C.tm, display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {he
          ? `${cnt(a.totalBlocks, 'בלוק אחד', 'בלוקים')}${a.journey && a.journey.weeks > 0 ? ` · ${a.journey.weeks} שב׳ · ${cnt(a.journey.loggedSessions, 'אימון אחד', 'אימונים')}` : ''}`
          : `${a.totalBlocks} BLOCK${a.totalBlocks === 1 ? '' : 'S'}${a.journey && a.journey.weeks > 0 ? ` · ${a.journey.weeks}W · ${a.journey.loggedSessions} SESSIONS` : ''}`}
        {a.blocks && a.blocks.length > 1 ? (
          <>· <select value={a.blockId ?? ''} onChange={(e) => setSelBlock(e.target.value)}
            title={L(he, 'View the report for any block', 'תבחר בלוק כדי לראות את הדוח שלו')}
            style={{ fontFamily: FN, fontSize: 10, letterSpacing: '0.06em', background: C.bg, color: C.ac, border: `1px solid ${C.bd}`, padding: '2px 6px', cursor: 'pointer', borderRadius: 0, maxWidth: 260 }}>
            {/* Every block, keyed by plan id — numbered AND imported/un-numbered ones,
                so all 16 of an athlete's blocks are selectable, not just the "#N" ones (#231). */}
            {a.blocks.map((b, i) => <option key={b.id} value={b.id}>{b.name.toUpperCase()}{i === 0 ? L(he, ' · LATEST', ' · אחרון') : ''}</option>)}
          </select></>
        ) : (a.blockName ? <>· {a.blockName.toUpperCase()}</> : null)}
        {a.empty ? '' : `· ${a.adh.loggedSessions}/${a.plannedSessionCount || '?'} ${L(he, 'LOGGED', 'נרשמו')}`}
      </span>
    </div>
  );

  // no plans at all
  if (!a.hasPlans) {
    return shell(<>{Strip}
      <div style={{ ...bd, color: C.tm, fontSize: 13, lineHeight: 1.5 }}>{L(he, 'No program blocks with exercises yet for this athlete.', 'עוד אין למתאמן הזה בלוקים עם תרגילים.')}</div>
    </>);
  }

  // has plans but NO logged workouts — the honest "flying blind" nudge
  if (a.empty) {
    return shell(<>{Strip}
      <div style={card}><div className="lin-hd" style={hd}>{L(he, 'Not enough logged training to analyze', 'אין מספיק אימונים רשומים לניתוח')}</div>
        <div style={bd}>
          <div style={{ border: `1px dashed ${C.bd}`, background: C.sf2, padding: 16, color: C.tm, fontSize: 13, lineHeight: 1.55 }}>
            <b style={{ color: C.tx }}>{he ? `${traineeName} לא רשם אימונים ${a.blockName ? `ב־${a.blockName}` : 'בבלוק האחרון'}.` : `${traineeName} has no logged workouts in ${a.blockName || 'the latest block'}.`}</b><br />
            {L(he, 'You can see the prescribed program, not what was performed — there\'s nothing to analyze against actual training. Prompt the athlete to log sessions in the portal before writing the next block.', 'רואים את התוכנית שנכתבה, לא את מה שבוצע — אין מול מה לנתח. תבקש ממנו לרשום אימונים בפורטל לפני שאתה כותב את הבלוק הבא.')}
          </div>
          {onOpenPlan && <div style={{ marginTop: 10, fontSize: 11, color: C.td }}>{L(he, 'Tip: the plan-vs-reality reads here light up the moment he logs a session.', 'טיפ: ההשוואה בין התוכנית לביצוע מתמלאת ברגע שהוא רושם אימון.')}</div>}
        </div>
      </div>
    </>);
  }

  const v = a.verdict;
  const vColor = toneColor[v.tone] || C.ac;
  const upperOk = a.region?.upper?.pct != null && a.region.upper.pct < 15;

  return shell(<>
    {Strip}

    {/* VERDICT FIRST */}
    <div style={{ border: `1px solid ${vColor}`, borderInlineStart: `3px solid ${vColor}`, background: `color-mix(in srgb, ${vColor} 8%, ${C.sf})`, padding: '16px 18px', marginTop: 12 }}>
      <div style={{ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: vColor, marginBottom: 7 }}>
        {L(he, 'If you read one thing', 'בשורה התחתונה')}
        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: v.confidence === 'high' ? C.gn : v.confidence === 'low' ? C.td : C.or, border: `1px solid ${v.confidence === 'high' ? C.gn : v.confidence === 'low' ? C.td : C.or}`, padding: '2px 6px', marginInlineStart: 8 }}>
          {he ? `ודאות ${CONF_HE[v.confidence] || v.confidence}${v.logs ? ' · הוא רושם' : ''}` : `${v.confidence} confidence${v.logs ? ' · he logs' : ''}`}
        </span>
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.3, color: C.tx }}>{v.headline}</div>
      <div style={{ fontSize: 13, color: C.tm, marginTop: 8, lineHeight: 1.5 }}>{v.sub}</div>
    </div>

    {/* 1. THE GATE */}
    <div style={card}><div className="lin-hd" style={hd}>{L(he, 'Did he actually train?', 'האימונים באמת קרו?')}<span style={hdQ}>{L(he, 'the gate — everything below assumes real data', 'קודם כל — מה שלמטה שווה משהו רק אם האימונים באמת נרשמו')}</span></div>
      <div style={bd}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Kpi v={a.adh.sessionPct != null ? `${a.adh.sessionPct}%` : '—'} l={L(he, 'Sessions', 'אימונים')} s={he ? `${a.adh.loggedSessions} מתוך ${a.plannedSessionCount || '?'} נרשמו` : `${a.adh.loggedSessions} of ${a.plannedSessionCount || '?'} logged`} color={a.adh.sessionPct >= 80 ? C.gn : C.or} />
          <Kpi v={a.adh.setsPct != null ? `${a.adh.setsPct}%` : '—'} l={L(he, 'Sets done', 'סטים שבוצעו')} s={he ? `${a.adh.setsDone} מתוך ${a.adh.setsPrescribed}` : `${a.adh.setsDone} of ${a.adh.setsPrescribed}`} color={a.adh.setsPct >= 80 ? C.gn : C.or} />
          {a.skip
            ? <Kpi v={a.skip.day} l={L(he, 'The skips', 'דילוגים')} s={`${a.skip.logged}/${a.skip.expected} — ${L(he, 'a pattern', 'זה דפוס')}`} color={C.rd} />
            : <Kpi v={L(he, 'SPREAD', 'מפוזרים')} l={L(he, 'The skips', 'דילוגים')} s={L(he, 'no day is missed repeatedly', 'אין יום שמדלגים עליו שוב ושוב')} color={C.gn} />}
        </div>
        {a.skip && a.skip.gap >= 2 && (
          <Read tone="bad" why={L(he, 'Either that day is too demanding, or it doesn\'t fit the athlete\'s week. Confirm before re-prescribing it.', 'או שהיום הזה קשה מדי, או שהוא לא מסתדר לו בשבוע. תברר לפני שאתה נותן אותו שוב.')}>
            <b>{he ? `הדילוגים לא אקראיים — הם מתרכזים ב־${a.skip.day}.` : `The skips aren't random — they cluster on ${a.skip.day}.`}</b>
          </Read>
        )}
      </div>
    </div>

    {/* 2. AUTOREGULATION — split into what's working vs what to back off (Ohad) */}
    <div style={card}><div className="lin-hd" style={hd}>{L(he, 'Training response', 'תגובה לאימון')}<span style={hdQ}>{L(he, 'autoregulation — what\'s working vs what to back off', 'מה עובד ומה לא')}</span></div>
      <div style={bd}>
        {(() => {
          const nm = (arr) => arr.map((s) => s.title).slice(0, 3).join(', ');
          const thin = (a.adh?.loggedSessions || 0) < 3;
          // Only MAIN compounds drive the systemic reads; a lone accessory dip or a
          // ballistic lift (whose e1RM is meaningless) never triggers "back off".
          // Buckets are mutually exclusive: a lift flat the last 3 sessions is "stuck",
          // never also "climbing"/"regressing" — the recent plateau is the actionable
          // signal, and a lift can't honestly be in both a positive and a negative column.
          const stuck = a.staples.filter((s) => !s.ballistic && s.isMain && s.stale?.stale);
          const climbing = a.staples.filter((s) => !s.ballistic && s.isMain && !s.stale?.stale && s.trend?.dir === 'up');
          const ballisticUp = a.staples.filter((s) => s.ballistic && !s.stale?.stale && s.trend?.dir === 'up');
          const regressing = a.staples.filter((s) => !s.ballistic && s.isMain && !s.stale?.stale && s.trend?.dir === 'down');
          const lowerGrind = a.region?.lower?.pct != null && a.region.lower.pct >= 25;
          // Dedup: the generic region line ("Upper body progressing" / "Lower body
          // regressing") is pure restatement when a NAMED lift in the same column is
          // already in that region — show it only when it adds new coverage (Ohad).
          const climbingCoversUpper = climbing.some((s) => movementRegion(s.title) === 'upper');
          const negNamesLower = [...regressing, ...stuck].some((s) => movementRegion(s.title) === 'lower');
          const pos = [];
          if (climbing.length) pos.push({ t: `${L(he, 'Progressing', 'מתקדם')} — ${nm(climbing)}`, d: L(he, 'e1RM trending up. Keep progressing: +2–3% load or +1 rep at the same effort.', 'ה־e1RM עולה. תמשיך להתקדם: עוד 2–3% משקל או עוד חזרה באותו מאמץ.') });
          if (upperOk && !climbingCoversUpper) pos.push({ t: L(he, 'Upper body progressing', 'פלג גוף עליון מתקדם'), d: he ? `מפספס רק ${a.region.upper.pct}% מהחזרות — יש מקום להעלות משקל.` : `hitting reps at ${a.region.upper.pct}% miss — room to push the load.` });
          if (ballisticUp.length) pos.push({ t: `${L(he, 'Power progressing', 'העוצמה מתקדמת')} — ${nm(ballisticUp)}`, d: L(he, 'load is up; film a set to confirm it’s bar speed, not just heavier kg.', 'המשקל עלה. צלם סט כדי לוודא שזו מהירות מוט ולא רק יותר קילו.') });
          const neg = [];
          if (regressing.length) neg.push({ t: `${L(he, 'Regressing', 'יורד')} — ${nm(regressing)}`, d: thin
            ? (he ? `ה־e1RM יורד, אבל ${(a.adh?.loggedSessions || 0) === 1 ? 'נרשם רק אימון אחד' : `נרשמו רק ${a.adh?.loggedSessions || 0} אימונים`} — סימן לעקוב אחריו, עוד לא סיבה לשבוע הורדה.` : `e1RM sliding, but only ${a.adh?.loggedSessions || 0} session${(a.adh?.loggedSessions || 0) === 1 ? '' : 's'} logged — a flag to watch, not a deload trigger yet.`)
            : L(he, 'e1RM down across the block. Back off ~5–10% intensity, hold volume, check recovery.', 'ה־e1RM ירד לאורך הבלוק. תוריד 5–10% במשקל, תשאיר את כמות הסטים ותבדוק שינה והתאוששות.') });
          if (stuck.length) neg.push({ t: `${L(he, 'Not progressing', 'לא מתקדם')} — ${nm(stuck)}`, d: L(he, 'flat 3+ sessions. Change the stimulus (variation/tempo) or a light week — not more kg.', 'תקוע כבר 3 אימונים. שנה גירוי (וריאציה או טמפו) או תן שבוע קל — לא עוד קילו.') });
          if (lowerGrind && !negNamesLower) neg.push({ t: L(he, 'Lower body regressing', 'פלג גוף תחתון יורד'), d: he ? `${a.region.lower.pct}% מהסטים לא מגיעים ליעד — המשקל כבד מדי כרגע, וזה מצטבר.` : `${a.region.lower.pct}% of sets short of target — the load’s too heavy right now and it compounds.` });
          const Col = ({ title, color, items, empty }) => (
            <div style={{ border: `1px solid ${color}`, background: `color-mix(in srgb, ${color} 6%, transparent)`, padding: '11px 13px' }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color, marginBottom: 9 }}>{title}</div>
              {items.length ? items.map((it, i) => (
                <div key={i} style={{ marginBottom: i < items.length - 1 ? 10 : 0, fontSize: 12.5, lineHeight: 1.5, color: C.tx }}><b>{it.t}.</b> <span style={{ color: C.tm }}>{it.d}</span></div>
              )) : <div style={{ fontSize: 12, color: C.td, lineHeight: 1.5 }}>{empty}</div>}
            </div>
          );
          return (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }} className="lineage-grid2">
              <Col title={L(he, '✓ Positive', '✓ עובד')} color={C.gn} items={pos} empty={L(he, 'Nothing clearly trending up yet — needs more logged sessions to call a win.', 'עוד אין משהו שעולה בבירור — צריך עוד אימונים רשומים כדי לקבוע שיש שיפור.')} />
              <Col title={L(he, '⚠ Negative', '⚠ לא עובד')} color={C.rd} items={neg} empty={L(he, 'Nothing flashing — loads and completion are holding across the block.', 'אין נורות אדומות — המשקלים והביצוע יציבים לאורך הבלוק.')} />
            </div>
          );
        })()}
      </div>
    </div>

    {/* 2.4 BLOCK HISTORY — the programming arc across every block */}
    {a.blockHistory && a.blockHistory.length >= 2 && (
      <div style={card}><div className="lin-hd" style={hd}>{L(he, 'Block history · the programming arc', 'היסטוריית בלוקים · רצף התכנות')}<span style={hdQ}>{L(he, 'what each block emphasized — oldest → newest', 'על מה כל בלוק שם דגש — מהישן לחדש')}</span></div>
        <div style={bd}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {a.blockHistory.slice(-14).map((b, idx) => {
              const col = b.character === 'strength' ? C.ac : b.character === 'power' ? (C.or || '#f0b429') : b.character === 'hypertrophy' ? C.pu : C.gn;
              // Show the FULL block name — no .slice() (Ohad #205: "comeback block" was cut to "comeba"). The chip is flex:'0 0 auto' so it grows to fit and stays one row (nowrap below).
              const label = b.num != null ? `#${b.num}` : ((b.name || '').replace(/block/i, '').trim() || `B${idx + 1}`);
              // Low-confidence (mixed) reads — no intensity programmed, so the phase
              // is inferred from reps alone. Dim them + mark with ~ so a guess never
              // looks like a fact (Ohad: the tagging must not over-claim).
              const lowConf = b.mixed || b.confidence === 'low';
              const intel = b.avgPct != null ? ` @ ${b.avgPct}% 1RM` : (b.avgRpe != null ? ` @ RPE ${b.avgRpe}` : L(he, ' · no %/RPE logged', ' · לא נרשמו % או RPE'));
              const charName = he ? (CHAR_HE[b.character] || b.character) : b.character;
              return (
                <div key={b.name || idx} title={he
                  ? `${b.name} · ${charName}${lowConf ? ' (ודאות נמוכה — לא נרשמה עצימות, הוסק מהחזרות)' : ` (ודאות ${CONF_HE[b.confidence] || b.confidence || 'לא ידועה'})`} — ${b.avgReps != null ? `ממוצע ${b.avgReps} חזרות` : 'מתפרץ, בלי בסיס חזרות'}${intel}${b.explosiveShare >= 0.4 ? ` · ${Math.round(b.explosiveShare * 100)}% מתפרץ` : ''} · לפי ${b.fromMains ? 'התרגילים המרכזיים' : 'כל התרגילים'} (${b.exercises} נרשמו)`
                  : `${b.name} · ${b.character}${lowConf ? ' (low-confidence — no intensity logged, inferred from reps)' : ` (${b.confidence || 'read'})`} — ${b.avgReps != null ? `avg ${b.avgReps} reps` : 'explosive, no rep basis'}${intel}${b.explosiveShare >= 0.4 ? ` · ${Math.round(b.explosiveShare * 100)}% explosive` : ''} · from ${b.fromMains ? 'the main lifts' : 'all exercises'} (${b.exercises} logged)`}
                  style={{ flex: '0 0 auto', border: `1px ${lowConf ? 'dashed' : 'solid'} ${col}`, padding: '5px 9px', minWidth: 50, textAlign: 'center', background: `color-mix(in srgb, ${col} ${lowConf ? 4 : 8}%, transparent)`, opacity: lowConf ? 0.72 : 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.tx, fontFamily: FN, whiteSpace: 'nowrap' }}>{label}</div>
                  <div style={{ fontSize: 8.5, letterSpacing: '0.05em', textTransform: 'uppercase', color: col, marginTop: 2 }}>{lowConf ? '~' : ''}{charName}</div>
                  <div style={{ fontSize: 9, color: C.td, marginTop: 1, fontVariantNumeric: 'tabular-nums' }}>{b.avgReps != null ? (he ? `${b.avgReps} חז׳` : `${b.avgReps}r`) : '⚡'}</div>
                </div>
              );
            })}
          </div>
          {(() => {
            const bh = a.blockHistory;
            const lastChar = bh[bh.length - 1].character;
            let run = 0; for (let k = bh.length - 1; k >= 0; k--) { if (bh[k].character === lastChar) run++; else break; }
            if (run < 4) return null;
            const runBlocks = bh.slice(bh.length - run);
            // Only fire when anchored on real main lifts (not an all-rows fallback).
            if (runBlocks.filter((b) => b.fromMains).length < Math.ceil(run * 0.6)) return null;
            // If the run is mostly LOW-confidence (no intensity programmed), the
            // "same phase N times" read is unreliable — say THAT, don't prescribe a
            // phase change off a guess. Intensity is what makes the arc trustworthy.
            const confidentRun = runBlocks.filter((b) => !b.mixed && b.confidence !== 'low').length >= Math.ceil(run * 0.6);
            if (!confidentRun) {
              return (
                <div style={{ fontSize: 12.5, color: C.tm, marginTop: 10, lineHeight: 1.5, fontFamily: FN }}>
                  {he
                    ? <>{run} הבלוקים האחרונים נראים דומים <b>רק לפי מספר החזרות</b> — אבל לא תכננת %1RM או RPE, אז השלב הוא ניחוש ולא עובדה. תרשום עצימות בתרגילים המרכזיים, כדי שהרצף יהיה אמין לפני שאתה מחליט לשנות שלב.</>
                    : <>{`The last ${run} blocks read similar on `}<b>{'rep count alone'}</b>{' — but you didn\'t program %1RM or RPE, so the phase is a guess, not a fact. Log intensity on the main lifts and the arc becomes reliable before you decide to change phase.'}</>}
                </div>
              );
            }
            const swap = lastChar === 'hypertrophy' ? 'a strength or power/peaking' : lastChar === 'strength' ? 'a hypertrophy or a power' : lastChar === 'power' ? 'a strength or hypertrophy base' : 'a strength or power';
            const swapHe = lastChar === 'hypertrophy' ? 'כוח או עוצמה' : lastChar === 'strength' ? 'היפרטרופיה או עוצמה' : lastChar === 'power' ? 'כוח או היפרטרופיה' : 'כוח או עוצמה';
            return (
              <div style={{ fontSize: 12.5, color: C.or || '#f0b429', marginTop: 10, lineHeight: 1.5, fontFamily: FN }}>
                {he
                  ? <><b>{run} בלוקי {CHAR_HE[lastChar] || lastChar} ברצף.</b> אותה עצימות ואותו דגש חזרות בכל בלוק — בלוק {swapHe} הוא הניגוד הטבעי אם אתה רוצה גירוי חדש. ההחלטה על הפריודיזציה היא שלך.</>
                  : <><b>{`${run} ${lastChar} blocks in a row.`}</b>{` Same intensity + rep emphasis every block — ${swap} block is the obvious contrast if you want a fresh stimulus. Your periodization call.`}</>}
              </div>
            );
          })()}
          <div style={{ fontSize: 10, color: C.td, marginTop: 9, lineHeight: 1.5 }}>{he
            ? <>אופי הבלוק נקבע לפי <b>עצימות (%1RM / RPE)</b>, טווח חזרות וכוונת התנועה יחד — לא רק לפי חזרות: מתפרץ (אולימפי, קפיצות, זריקות) = עוצמה; מעט חזרות כבדות או %/RPE גבוה = כוח; 8–12 חזרות תת־מקסימליות = היפרטרופיה; 12 חזרות ומעלה בעצימות נמוכה = סיבולת. בלוק <b style={{ color: C.tm }}>~מקווקו</b> = ודאות נמוכה (לא נרשמה עצימות, הוסק מהחזרות). רצף ארוך בצבע אחד הוא הסימן לשנות שלב.</>
            : <>{'Character weighs '}<b>{'intensity (%1RM / RPE)'}</b>{', rep zone, and movement intent together — not reps alone: explosive (Olympic / jumps / throws) = power; heavy low reps or high %/RPE = strength; 8–12 sub-maximal = hypertrophy; 12+ low intensity = endurance. A '}<b style={{ color: C.tm }}>{'~dashed'}</b>{' block = low confidence (no intensity logged, inferred from reps). A long run of one colour is the cue to change phase.'}</>}</div>
        </div>
      </div>
    )}

    {/* 2.5 THE ARC — the cross-block journey (the actual "lineage") */}
    {a.staples.filter((s) => !s.ballistic && s.arc && s.arc.length >= 4 && s.arcGainPct != null).length > 0 && (
      <div style={card}>
        <div className="lin-hd" style={{ ...hd, cursor: 'pointer' }} onClick={() => setArcOpen((v) => !v)} role="button" tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setArcOpen((v) => !v); } }}
          title={arcOpen ? L(he, 'Collapse', 'סגירה') : L(he, 'Expand the main-lift arc', 'פתיחת ההתקדמות בתרגילים המרכזיים')}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><span style={{ color: C.ac, fontSize: 10 }}>{<svg aria-hidden viewBox="0 0 9 6" fill="none" width="0.95em" height="0.63em" style={{ display: 'inline-block', verticalAlign: 'middle', transition: 'transform 150ms ease', transform: (arcOpen) ? 'none' : (he ? 'rotate(90deg)' : 'rotate(-90deg)') }}><path d="M1 1l3.5 3.5L8 1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>}</span>{L(he, 'The arc · progression on the main lifts', 'התקדמות לאורך זמן · התרגילים המרכזיים')}</span>
          <span style={hdQ}>{arcOpen ? L(he, 'e# = estimated 1-rep max (Epley) across every block — starting point vs now', 'e# = 1RM משוער (Epley) לאורך כל הבלוקים — נקודת ההתחלה מול היום') : (() => { const n = a.staples.filter((s) => !s.ballistic && s.arc && s.arc.length >= 4 && s.arcGainPct != null).length; return he ? `${cnt(n, 'תרגיל אחד', 'תרגילים')} · לחיצה לפתיחה` : `${n} lifts · click to expand`; })()}</span>
        </div>
        {arcOpen && <div style={bd}>
          {a.staples.filter((s) => !s.ballistic && s.arc && s.arc.length >= 4 && s.arcGainPct != null)
            .sort((x, y) => y.count - x.count).slice(0, 4).map((s) => {
              // e1RM conflates load and reps, so a rep-scheme shift alone moves the
              // arc %. When the per-lift trend flagged reps as noisy, mute the number
              // and flatten the spark — never contradict the trend row on the same lift.
              const noisy = s.trend && s.trend.repNoisy;
              const gc = noisy ? C.td : s.arcGainPct >= 3 ? C.gn : s.arcGainPct <= -3 ? C.rd : C.tm;
              const lastE = Math.round(s.arc[s.arc.length - 1]);
              return (
                // Everything on ONE vertically-centred row (Ohad): name · spark ·
                // e1RM change · gain%. The log/week context moves to the name tooltip.
                <div key={s.title} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: `1px solid ${C.bd}` }}>
                  <span title={he ? `${s.count} רישומים · ${s.spanWeeks > 0 ? `לאורך ${s.spanWeeks} שבועות` : 'בבלוק הזה'}` : `${s.count} logs · ${s.spanWeeks > 0 ? `over ${s.spanWeeks} weeks` : 'this block'}`}
                    style={{ flex: '1 1 auto', minWidth: 0, fontSize: 13, color: C.tx, whiteSpace: 'normal', overflowWrap: 'break-word', lineHeight: 1.3 }}>{s.title}</span>
                  <Spark pts={s.arc} dir={noisy ? 'flat' : s.arcGainPct >= 3 ? 'up' : s.arcGainPct <= -3 ? 'down' : 'flat'} />
                  <span style={{ flexShrink: 0, fontSize: 12.5, color: C.tx, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }} title={L(he, 'estimated 1-rep max (Epley), first → now', '1RM משוער (Epley), מההתחלה עד היום')}><Ltr>{`e${s.firstE1} → e${lastE}`}</Ltr>{s.prE1 > lastE ? <span style={{ color: C.td, fontSize: 10 }}>{` · ${L(he, 'pk', 'שיא')} e${s.prE1}`}</span> : null}</span>
                  <span style={{ flexShrink: 0, minWidth: 46, textAlign: 'end', fontSize: 12, fontWeight: 700, color: gc, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}><Ltr>{`${s.arcGainPct >= 0 ? '+' : ''}${s.arcGainPct}%`}</Ltr>{noisy ? <span style={{ fontSize: 9, fontWeight: 400, color: C.td }}>{L(he, ' · reps varied', ' · חזרות השתנו')}</span> : null}</span>
                </div>
              );
            })}
          <div style={{ fontSize: 10, color: C.td, marginTop: 9, lineHeight: 1.5 }}>{L(he, 'Long-term arc, not just this block — e1RM = est-1RM (Epley). Rep-scheme shifts move e1RM too; read it with the per-lift trend below.', 'מגמה לטווח ארוך, לא רק הבלוק הזה — e1RM = 1RM משוער (Epley). שינוי בטווח החזרות מזיז גם את ה־e1RM, אז תסתכל על זה יחד עם המגמה של כל תרגיל למטה.')}</div>
        </div>}
      </div>
    )}

    {/* 3. STAPLES */}
    {a.staples.length > 0 && (
      <div style={card}>
        <div className="lin-hd" style={{ ...hd, cursor: 'pointer' }} onClick={() => setLiftsOpen((v) => !v)} role="button" tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setLiftsOpen((v) => !v); } }}
          title={liftsOpen ? L(he, 'Collapse', 'סגירה') : L(he, 'Expand the per-lift breakdown', 'פתיחת הפירוט לפי תרגיל')}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><span style={{ color: C.ac, fontSize: 10 }}>{<svg aria-hidden viewBox="0 0 9 6" fill="none" width="0.95em" height="0.63em" style={{ display: 'inline-block', verticalAlign: 'middle', transition: 'transform 150ms ease', transform: (liftsOpen) ? 'none' : (he ? 'rotate(90deg)' : 'rotate(-90deg)') }}><path d="M1 1l3.5 3.5L8 1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>}</span>{L(he, 'Key lifts · what to do next', 'תרגילים מרכזיים · מה עושים הלאה')}</span>
          <span style={hdQ}>{liftsOpen ? L(he, 'worst first · each row tells you the move for next block', 'הבעייתיים קודם · כל שורה אומרת מה לעשות בבלוק הבא') : (() => { const n = a.staples.filter((s) => s.count >= 3).length; return he ? `${cnt(n, 'תרגיל אחד', 'תרגילים')} · לחיצה לפתיחה` : `${n} lifts · click to expand`; })()}</span>
        </div>
        {liftsOpen && <div style={bd}>
          <div style={{ overflowX: 'auto' }}>
            <table className="lin-lifts" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr>
                {(he ? ['תרגיל', 'מגמה', 'שיא', 'משקלים אחרונים', ''] : ['Lift', 'Trend', 'Best', 'Last loads', '']).map((h, i) => (
                  <th key={i} style={{ textAlign: i === 4 ? 'end' : 'start', fontSize: 9, letterSpacing: '0.11em', textTransform: 'uppercase', color: C.tm, fontWeight: 600, padding: '0 8px 7px', borderBottom: `1px solid ${C.bd}` }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {a.staples.filter((s) => s.count >= 3).map((s) => <LiftRow key={s.title} s={s} />)}
              </tbody>
            </table>
          </div>
          {a.staples.filter((s) => s.count >= 3).length === 0 && (
            <div style={{ fontSize: 12.5, color: C.tm, padding: '10px 8px', lineHeight: 1.5 }}>{L(he, 'Nothing logged 3+ times yet — no lift has enough history to read a trend. The lifts trained so far are below.', 'עוד אין תרגיל שנרשם 3 פעמים ומעלה — אין מספיק היסטוריה כדי לקרוא מגמה. התרגילים שבוצעו עד עכשיו מופיעים למטה.')}</div>
          )}
          {(() => {
            const thin = a.staples.filter((s) => s.count < 3);
            if (!thin.length) return null;
            return (
              <div style={{ marginTop: 8 }}>
                <button type="button" onClick={() => setShowThin((v) => !v)}
                  style={{ fontFamily: FN, fontSize: 11, letterSpacing: '0.04em', color: C.tm, background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: C.ac }}>{showThin ? '▾' : (he ? '◂' : '▸')}</span>{he
                    ? `${thin.length === 1 ? 'עוד תרגיל אחד שנרשם' : `עוד ${thin.length} תרגילים שנרשמו`} 1–2 פעמים · מעט מדי למגמה${showThin ? '' : ' (הצגה)'}`
                    : `${thin.length} more lift${thin.length === 1 ? '' : 's'} logged 1–2× · too few to trend ${showThin ? '' : '(show)'}`}
                </button>
                {showThin && (
                  <div style={{ overflowX: 'auto', marginTop: 4 }}>
                    <table className="lin-lifts" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}><tbody>
                      {thin.map((s) => <LiftRow key={s.title} s={s} />)}
                    </tbody></table>
                  </div>
                )}
              </div>
            );
          })()}
          <div style={{ fontSize: 10, color: C.td, marginTop: 9, lineHeight: 1.5 }}>
            {he
              ? `תרגילים שנרשמו 3 פעמים ומעלה (מספיק כדי לקרוא מגמה)${a.bodyweightLifts > 0 ? ` · ${a.bodyweightLifts === 1 ? 'עוד תרגיל משקל גוף או עזר אחד' : `עוד ${a.bodyweightLifts} תרגילי משקל גוף ועזר`} (אין משקל למגמה)` : ''} · שיא = המשקל הכי כבד שנרשם · e = 1RM משוער (Epley), מוסתר מעל 12 חזרות.`
              : `Lifts logged 3+ times (enough to read)${a.bodyweightLifts > 0 ? ` · ${a.bodyweightLifts} more bodyweight/accessory lift${a.bodyweightLifts === 1 ? '' : 's'} (no load to trend)` : ''} · best = heaviest logged · e = est-1RM (Epley), hidden past 12 reps.`}
          </div>
        </div>}
      </div>
    )}

    {/* MOVEMENT MAP — the athlete's logged lifts catalogued into the library's
        six buckets (upper/lower × bilateral/unilateral/plyo), like the exercise
        sheet organises them (Ohad #170). An EMPTY bucket is the read: a pattern
        the block isn't training. Reuses the same PLYO test as the bar-speed gate
        so plyos land in the plyo column, not among the grinding lifts. */}
    {a.staples.length > 0 && (() => {
      const grouped = groupByBucket(a.staples);
      const trained = BUCKETS.filter((b) => grouped[b.key].length > 0).length;
      if (trained === 0) return null;
      // Show the FULL lift name — wrap onto the next row rather than truncating
      // with … (Ohad #233, reversing the #225 ellipsis decision). Bullet pinned to
      // the first line so multi-line names stay tidy.
      const cell = (lift) => (
        <div key={lift.title} dir="auto" title={lift.title} style={{ fontSize: 11.5, color: C.tm, lineHeight: 1.7, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
          <span aria-hidden style={{ flex: '0 0 auto', width: 3, height: 3, borderRadius: '50%', background: C.td, marginTop: 8 }} />
          <span style={{ flex: '1 1 auto', minWidth: 0, overflowWrap: 'break-word' }}>{lift.title}</span>
        </div>
      );
      return (
        <Section title={L(he, 'Movement map', 'מפת תנועה')} summary={he ? `אומנו ${trained} מתוך 6 דפוסים` : `${trained} of 6 patterns trained`}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10, alignItems: 'start' }}>
            {BUCKETS.map((b) => {
              const lifts = grouped[b.key];
              const empty = lifts.length === 0;
              return (
                <div key={b.key} style={{ border: `1px solid ${empty ? C.bd : C.ac}`, background: empty ? 'transparent' : C.sf2, padding: '9px 11px', opacity: empty ? 0.45 : 1, minWidth: 0 }}>
                  <div style={{ fontFamily: FN, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: empty ? C.td : C.ac, fontWeight: 700, marginBottom: empty ? 0 : 7, display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                    <span>{he ? (BUCKET_HE[b.key] || b.label) : b.label}</span><span style={{ color: C.tm }}>{lifts.length || ''}</span>
                  </div>
                  {empty ? <div style={{ fontSize: 10, color: C.td, fontStyle: 'italic' }}>{L(he, 'not trained', 'אין')}</div> : lifts.map(cell)}
                </div>
              );
            })}
          </div>
          {grouped.other.length > 0 && (
            <div style={{ fontSize: 10.5, color: C.td, marginTop: 9, lineHeight: 1.5 }}>
              <div style={{ color: C.tm, fontWeight: 600, marginBottom: 3 }}>{`${L(he, 'Other', 'אחר')} (${grouped.other.length}) `}<span style={{ opacity: 0.7, fontWeight: 400 }}>{L(he, '— core / carry / full-body (outside the six patterns)', '— בטן / נשיאה / גוף מלא (מחוץ לשישה הדפוסים)')}</span></div>
              {grouped.other.map((l) => (
                <div key={l.title} dir="auto" title={l.title} style={{ overflowWrap: 'break-word', lineHeight: 1.6 }}>– {l.title}</div>
              ))}
            </div>
          )}
          <div style={{ fontSize: 10, color: C.td, marginTop: 9, lineHeight: 1.5 }}>{he
            ? <>התרגילים שנרשמו, מחולקים לשש הקבוצות של הספרייה. קבוצה אפורה עם <b style={{ color: C.tm }}>אין</b> = דפוס תנועה שהבלוק הזה מדלג עליו — הבדיקה הכי מהירה לחורים לפני שאתה בונה את הבא.</>
            : <>{'Logged lifts catalogued into the library\'s six buckets. A dim '}<b style={{ color: C.tm }}>{'not trained'}</b>{' bucket = a movement pattern this block is skipping — the fastest gap-check before you build the next one.'}</>}</div>
        </Section>
      );
    })()}

    {/* EXERCISE CONTINUITY — how many blocks IN A ROW each main lift has run.
        The coach's own programming mirror: are the mains being progressed, or
        churned every block? NEUTRAL — shows the runs, never prescribes rotate-vs-
        keep (a goal call: specificity for strength vs novel stimulus). */}
    {a.blockHistory && a.blockHistory.length >= 2 && (() => {
      const cont = exerciseContinuity(a.blockHistory.map((b) => ({ num: b.num, mains: b.mains || [] })));
      const rows = cont.lifts.filter((l) => l.count >= 2).slice(0, 12);
      if (!rows.length) return null;
      return (
        <Section title={L(he, 'Exercise continuity', 'רצף תרגילים')} summary={he ? `${cnt(cont.totalBlocks, 'בלוק אחד', 'בלוקים')} · ${cont.staticNow.length} נשארו 4 בלוקים ומעלה` : `${cont.totalBlocks} blocks · ${cont.staticNow.length} kept ≥4`}>
          <div style={{ overflowX: 'auto' }}>
            <table className="lin-lifts" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr>
                {(he ? ['תרגיל מרכזי', 'ברצף', 'הרצף הכי ארוך', 'בלוקים'] : ['Main lift', 'In a row', 'Longest', 'Blocks']).map((h, i) => (
                  <th key={i} style={{ textAlign: i === 0 ? 'start' : 'center', fontSize: 9, letterSpacing: '0.11em', textTransform: 'uppercase', color: C.tm, fontWeight: 600, padding: '0 8px 7px', borderBottom: `1px solid ${C.bd}` }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {rows.map((l) => (
                  <tr key={l.title} style={{ borderTop: `1px solid ${C.bd}` }}>
                    <td dir="auto" style={{ padding: '7px 8px', color: C.tx, minWidth: 0, overflowWrap: 'break-word' }}>{l.title}</td>
                    <td data-h={L(he, 'In a row', 'ברצף')} style={{ textAlign: 'center', padding: '7px 8px', color: l.static ? C.or : C.tm, fontWeight: l.static ? 700 : 400, fontVariantNumeric: 'tabular-nums' }}>{l.currentRun || '—'}{l.static ? ' ⚑' : ''}</td>
                    <td data-h={L(he, 'Longest', 'הרצף הכי ארוך')} style={{ textAlign: 'center', padding: '7px 8px', color: C.tm, fontVariantNumeric: 'tabular-nums' }}>{l.longestRun}</td>
                    <td data-h={L(he, 'Blocks', 'בלוקים')} title={`${L(he, 'Blocks', 'בלוקים')} ${l.blocks.join(', ')}`} style={{ textAlign: 'center', padding: '7px 8px', color: C.td, fontVariantNumeric: 'tabular-nums', cursor: 'help' }}>{l.count}/{cont.totalBlocks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 10, color: C.td, marginTop: 9, lineHeight: 1.5 }}>{L(he, 'Blocks IN A ROW each main lift has run, up to the latest block. A ⚑ marks ≥4 straight — long enough to ask whether it\'s still being progressed (specificity) or has gone stale. Your call, not a verdict.', 'כמה בלוקים ברצף כל תרגיל מרכזי נמצא בתוכנית, עד הבלוק האחרון. ⚑ מסמן 4 בלוקים ברצף ומעלה — מספיק זמן כדי לשאול אם עוד מתקדמים בו (ספציפיות) או שהוא כבר נשחק. ההחלטה שלך, לא פסק דין.')}</div>
        </Section>
      );
    })()}

    {/* STRENGTH → POWER TRANSFER — the flagship read no competitor has */}
    {a.transfer && (() => {
      const t = a.transfer;
      const tone = t.side === 'balanced' ? C.gn : t.side === 'stalled' ? C.or : C.pu;
      return (
        <Section title={L(he, 'Strength → power', 'כוח ← עוצמה')} summary={he
          ? <>{'כוח '}<Ltr>{`${t.sT > 0 ? '+' : ''}${t.sT}%`}</Ltr>{' · עוצמה '}<Ltr>{`${t.pT > 0 ? '+' : ''}${t.pT}%`}</Ltr></>
          : `${t.sT > 0 ? '+' : ''}${t.sT}% str · ${t.pT > 0 ? '+' : ''}${t.pT}% pow`}>
            {(() => {
              // Aggregate each side's lifts into ONE trend: index every lift's e1RM
              // arc to its own start (100%) and average across lifts. Two overlaid
              // lines = the strength↔power relationship as a graph, not just numbers.
              // Physiological corruption gate: a lift's e1RM cannot jump >3× its
              // own starting e1RM within a training history — that's a corrupt set
              // (e.g. a date-serial that leaked into reps/load inflating Epley),
              // not real strength. Such a lift produced a 1856% index that blew out
              // the whole Y-scale and collided the axis labels. Drop the corrupt
              // lift entirely (honest — never clamp a fabricated point in), so the
              // legend's "Strength (N)" reflects only the lifts actually charted.
              const RATIO_CEIL = 3;
              const norm = (lifts) => {
                const cs = lifts
                  .map((s) => (s.arc || []).filter((v) => typeof v === 'number' && v > 0))
                  .filter((a) => a.length >= 3 && a[0] > 0 && Math.max(...a) / a[0] <= RATIO_CEIL);
                if (!cs.length) return null;
                const len = Math.min(...cs.map((a) => a.length));
                if (len < 3) return null;
                return Array.from({ length: len }, (_, i) => cs.reduce((x, a) => x + (a[i] / a[0]) * 100, 0) / cs.length);
              };
              const sCurve = norm(a.staples.filter((s) => !s.ballistic && s.isMain));
              const pCurve = norm(a.staples.filter((s) => s.ballistic));
              if (!sCurve && !pCurve) return null;
              const all = [...(sCurve || []), ...(pCurve || []), 100];
              const lo = Math.min(...all), hi = Math.max(...all), rng = (hi - lo) || 1;
              // Power series = neutral slate, NOT the app's warning-orange (Ohad
              // #243: "too many colors we usually don't use"). The chart now reads
              // cyan (strength, brand) + neutral (power); green stays for the verdict.
              const orange = '#9aa4b2';
              const BRAND = '#39BDFF';  // brand cyan literal: C.ac resolves to BLACK in light mode, so the graph's cyan identity (like the readiness/BW graphs) must be a literal to stay cyan in BOTH themes
              // Richer chart to match the readiness / bodyweight graphs (Ohad):
              // real Y-axis scale with bright % ticks, dashed gridlines, an area
              // gradient under each line, a dot on every session, and a marked
              // HIGH (peak) + NOW on each series. Geometry in an SVG stretched
              // edge-to-edge (preserveAspectRatio=none); dots + labels are HTML
              // overlays so they stay round and unstretched (BWChart technique).
              const GW = 320, GH = 132, gpadT = 16, gpadB = 8, gpadX = 6;
              const gplotH = GH - gpadT - gpadB;
              const domLo = lo - rng * 0.06, domHi = hi + rng * 0.16, domR = (domHi - domLo) || 1;
              const gy = (v) => gpadT + (1 - (v - domLo) / domR) * gplotH;
              const gx = (i, len) => gpadX + (len <= 1 ? (GW - 2 * gpadX) / 2 : i * ((GW - 2 * gpadX) / (len - 1)));
              const gpctX = (i, len) => `${(gx(i, len) / GW) * 100}%`;
              const gpctY = (v) => `${(gy(v) / GH) * 100}%`;
              const gLine = (curve) => curve.map((v, i) => `${gx(i, curve.length).toFixed(1)},${gy(v).toFixed(1)}`).join(' ');
              const gArea = (curve) => `M${gx(0, curve.length).toFixed(1)},${GH - gpadB} L${gLine(curve).replace(/ /g, ' L')} L${gx(curve.length - 1, curve.length).toFixed(1)},${GH - gpadB} Z`;
              // Bright, evenly-spaced % ticks across the plotted range (hi → lo).
              const ticks = [...new Set([Math.round(hi), Math.round(lo + rng * 0.5), Math.round(lo)])];
              const peakOf = (curve) => { let mi = 0; curve.forEach((v, i) => { if (v > curve[mi]) mi = i; }); return { i: mi, v: curve[mi] }; };
              const series = [
                sCurve && { curve: sCurve, col: BRAND, gid: 'spGradS', label: 'STRENGTH', peak: peakOf(sCurve) },
                pCurve && { curve: pCurve, col: orange, gid: 'spGradP', label: 'POWER', peak: peakOf(pCurve) },
              ].filter(Boolean);
              return (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, color: C.tm, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 8 }}>{L(he, 'Strength vs power · e1RM indexed to each lift\'s start (100%)', 'כוח מול עוצמה · e1RM ביחס לנקודת ההתחלה של כל תרגיל (100%)')}</div>
                  <div dir="ltr" style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
                    {/* Y-axis: bright tabular % ticks aligned to their gridlines. */}
                    <div style={{ position: 'relative', width: 38, flexShrink: 0, fontSize: 9, fontVariantNumeric: 'tabular-nums', textAlign: 'end' }}>
                      {ticks.map((L) => (
                        <span key={L} style={{ position: 'absolute', top: gpctY(L), right: 0, transform: 'translateY(-50%)', color: C.tx, fontWeight: 700 }}>{L}%</span>
                      ))}
                      {ticks.every((t) => Math.abs(t - 100) > 4) && <span style={{ position: 'absolute', top: gpctY(100), right: 0, transform: 'translateY(-50%)', color: BRAND, fontWeight: 700 }}>100</span>}
                    </div>
                    <div style={{ position: 'relative', flex: 1, height: GH }}>
                      <svg viewBox={`0 0 ${GW} ${GH}`} preserveAspectRatio="none" style={{ width: '100%', height: GH, display: 'block', background: C.sf2, border: `1px solid ${C.bd}` }}>
                        <defs>
                          <linearGradient id="spGradS" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={BRAND} stopOpacity="0.22" /><stop offset="100%" stopColor={BRAND} stopOpacity="0" /></linearGradient>
                          <linearGradient id="spGradP" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={orange} stopOpacity="0.20" /><stop offset="100%" stopColor={orange} stopOpacity="0" /></linearGradient>
                        </defs>
                        {ticks.map((L) => <line key={L} x1={0} y1={gy(L)} x2={GW} y2={gy(L)} stroke={C.bd} strokeWidth="0.75" strokeDasharray="4" />)}
                        <line x1={0} y1={gy(100)} x2={GW} y2={gy(100)} stroke={BRAND} strokeWidth="1" strokeDasharray="3 3" strokeOpacity="0.55" />
                        {series.map((s) => <path key={s.gid} d={gArea(s.curve)} fill={`url(#${s.gid})`} />)}
                        {series.map((s) => <polyline key={s.label} points={gLine(s.curve)} fill="none" stroke={s.col} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />)}
                      </svg>
                      {/* Round dots on every session (HTML → stay circular). */}
                      {series.map((s) => s.curve.map((v, i) => (
                        <div key={s.label + i} style={{ position: 'absolute', left: gpctX(i, s.curve.length), top: gpctY(v), width: 7, height: 7, borderRadius: '50%', background: s.col, transform: 'translate(-50%,-50%)', boxShadow: '0 0 0 2px var(--c-sf2)', pointerEvents: 'none' }} />
                      )))}
                      {/* HIGH (peak) marker per series: a ring + its % value above. */}
                      {series.map((s) => (
                        <div key={s.label + 'pk'} style={{ position: 'absolute', left: gpctX(s.peak.i, s.curve.length), top: gpctY(s.peak.v), transform: 'translate(-50%,-50%)', pointerEvents: 'none' }}>
                          <div style={{ width: 11, height: 11, borderRadius: '50%', background: 'transparent', border: `2px solid ${s.col}`, boxShadow: '0 0 0 2px var(--c-sf2)' }} />
                          <div style={{ position: 'absolute', bottom: '150%', left: '50%', transform: 'translateX(-50%)', fontSize: 8.5, fontWeight: 700, color: s.col, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', background: 'var(--c-sf2)', padding: '1px 4px', borderRadius: 2, border: `1px solid ${C.bd}` }}>{Math.round(s.peak.v)}%</div>
                        </div>
                      ))}
                      {/* X ends: START (indexed 100%) → NOW. */}
                      <div style={{ position: 'absolute', left: 2, bottom: 2, fontSize: 8, fontWeight: 700, color: C.tm, letterSpacing: '0.1em', pointerEvents: 'none' }}>{L(he, 'START', 'התחלה')}</div>
                      <div style={{ position: 'absolute', right: 2, bottom: 2, fontSize: 8, fontWeight: 700, color: C.tm, letterSpacing: '0.1em', pointerEvents: 'none' }}>{L(he, 'NOW', 'עכשיו')}</div>
                    </div>
                  </div>
                  {/* Legend: bright, with each side's NOW value in its colour. */}
                  <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 10, color: C.tm, paddingInlineStart: 46, flexWrap: 'wrap', alignItems: 'center' }}>
                    {sCurve && <span style={{ fontWeight: 600 }}><span style={{ color: BRAND }}>●</span>{` ${L(he, 'Strength', 'כוח')} (${sCurve.length}) · ${L(he, 'now', 'עכשיו')} `}<b style={{ color: BRAND }}>{Math.round(sCurve[sCurve.length - 1])}%</b></span>}
                    {pCurve && <span style={{ fontWeight: 600 }}><span style={{ color: orange }}>●</span>{` ${L(he, 'Power', 'עוצמה')} (${pCurve.length}) · ${L(he, 'now', 'עכשיו')} `}<b style={{ color: orange }}>{Math.round(pCurve[pCurve.length - 1])}%</b></span>}
                    <span style={{ marginInlineStart: 'auto', color: C.td }}>{L(he, '○ = high · dashed = 100% start', '○ = שיא · מקווקו = התחלה (100%)')}</span>
                  </div>
                </div>
              );
            })()}
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'stretch', marginBottom: 10 }}>
              <div style={{ flex: '1 1 0', minWidth: 130, border: `1px solid ${C.bd}`, background: C.sf2, padding: '9px 11px' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: t.sT > 0.8 ? C.gn : t.sT < -0.8 ? C.rd : C.or, fontVariantNumeric: 'tabular-nums' }}><Ltr>{`${t.sT > 0 ? '+' : ''}${t.sT}%`}</Ltr></div>
                <div style={{ fontSize: 9, letterSpacing: '0.11em', textTransform: 'uppercase', color: C.tm, marginTop: 5 }}>{L(he, 'Strength trend', 'מגמת כוח')}</div>
                <div style={{ fontSize: 10, color: C.td, marginTop: 2 }}>{he ? `${cnt(t.strengthN, 'תרגיל כבד אחד', 'תרגילים כבדים')} · e1RM לאימון` : `${t.strengthN} heavy lift${t.strengthN === 1 ? '' : 's'} · e1RM/session`}</div>
              </div>
              <div style={{ flex: '1 1 0', minWidth: 130, border: `1px solid ${C.bd}`, background: C.sf2, padding: '9px 11px' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: t.pT > 0.8 ? C.gn : t.pT < -0.8 ? C.rd : C.or, fontVariantNumeric: 'tabular-nums' }}><Ltr>{`${t.pT > 0 ? '+' : ''}${t.pT}%`}</Ltr></div>
                <div style={{ fontSize: 9, letterSpacing: '0.11em', textTransform: 'uppercase', color: C.tm, marginTop: 5 }}>{L(he, 'Power / jump trend', 'מגמת עוצמה / קפיצה')}</div>
                <div style={{ fontSize: 10, color: C.td, marginTop: 2 }}>{he ? cnt(t.powerN, 'תרגיל מתפרץ אחד', 'תרגילים מתפרצים') : `${t.powerN} explosive lift${t.powerN === 1 ? '' : 's'}`}</div>
              </div>
            </div>
            <div style={{ fontSize: 14, color: C.tx, lineHeight: 1.5 }}><b style={{ color: tone }}>{(he && TRANSFER_HE[t.side]?.read) || t.read}.</b></div>
            <div style={{ fontSize: 13, color: C.ac, fontWeight: 600, marginTop: 5, lineHeight: 1.5 }}>{he ? '← ' : '→ '}{(he && TRANSFER_HE[t.side]?.move) || t.move}</div>
            <div style={{ fontSize: 10, color: C.td, marginTop: 8, lineHeight: 1.5 }}>{L(he, 'Trend = avg e1RM slope per side. A relationship to watch, not a law — strength↔power carry-over is individual. Film jumps to swap the load-proxy for real height + bar-speed.', 'מגמה = השיפוע הממוצע של e1RM בכל צד. קשר שכדאי לעקוב אחריו, לא חוק — המעבר בין כוח לעוצמה משתנה מספורטאי לספורטאי. צלם קפיצות כדי לקבל גובה ומהירות מוט אמיתיים במקום הערכה לפי משקל.')}</div>
        </Section>
      );
    })()}

    {/* 4+5. LOAD/VOLUME + VELOCITY + ROM + SYMMETRY */}
    {/* SINGLE full-width column (Ohad #236): in a 2-col grid a COLLAPSED card
        (mostly collapsed-by-default here) left its whole half of the page an
        empty black void next to a tall EXPANDED neighbour — "half the page is
        empty, not a good look." Full-width stacking means a collapsed card is a
        clean full-width bar (like the programs list he referenced) and an
        expanded card uses the full width, giving its graph more room. No void. */}
    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12, marginTop: 12, alignItems: 'start' }} className="lineage-grid2">
      <Section title={L(he, 'Load & volume', 'עומס ונפח')} cardStyle={{ ...card, marginTop: 0 }} summary={a.acwr.state === 'ok' ? `ACWR ${a.acwr.acwr}` : L(he, 'building the baseline', 'בונה בסיס')}>
          {Array.isArray(a.acwr.series) && a.acwr.series.length >= 2 && (() => {
            const mx = Math.max(...a.acwr.series, 1);
            const last = a.acwr.series[a.acwr.series.length - 1];
            const lastI = a.acwr.series.length - 1;
            const peakI = a.acwr.series.indexOf(mx);
            const avg = Math.round(a.acwr.series.reduce((x, y) => x + y, 0) / a.acwr.series.length);
            const k = (n) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`; // compact kg·reps
            const BH = 92; // bar-plot height — taller, to match the readiness / BW graphs
            const BRAND = '#39BDFF'; // literal cyan — C.ac flips to black in light mode; the bars keep brand cyan in BOTH themes like the readiness/BW graphs
            return (
              <div style={{ marginBottom: 12 }}>
                {/* extra bottom margin so the peak bar's value label (bottom:100% of a
                    full-height bar) has headroom and never crowds this header (Ohad #224). */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 20, gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10, color: C.tm, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}>{he ? `טונאז׳ לאימון · ${a.acwr.series.length} אחרונים` : `Session tonnage · last ${a.acwr.series.length}`}</span>
                  <span style={{ fontSize: 10, color: C.tm, fontVariantNumeric: 'tabular-nums' }}>{L(he, 'peak ', 'שיא ')}<b style={{ color: BRAND }}>{mx.toLocaleString()}</b>{L(he, ' · latest ', ' · אחרון ')}<b style={{ color: C.tx }}>{last.toLocaleString()}</b>{L(he, ' kg·reps', ' ק״ג·חזרות')}</span>
                </div>
                <div dir="ltr" style={{ display: 'flex', gap: 8 }}>
                  {/* Y-axis: bright peak / mid / 0 ticks give the bars a real scale. */}
                  <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', textAlign: 'end', fontSize: 9, color: C.tx, fontWeight: 700, height: BH, fontVariantNumeric: 'tabular-nums', minWidth: 32 }}>
                    <span>{k(mx)}</span><span style={{ color: C.tm }}>{k(Math.round(mx / 2))}</span><span>0</span>
                  </div>
                  <div style={{ position: 'relative', flex: 1, height: BH }}>
                    {/* dashed gridlines behind the bars (peak / mid / floor). */}
                    {[0, 50, 100].map((p) => <div key={p} style={{ position: 'absolute', left: 0, right: 0, top: `${p}%`, borderTop: `1px dashed ${C.bd}`, pointerEvents: 'none' }} />)}
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', gap: 3 }}>
                      {a.acwr.series.map((t, i) => {
                        const isPeak = i === peakI, isLast = i === lastI;
                        return (
                          <div key={i} title={`${t.toLocaleString()} ${L(he, 'kg·reps', 'ק״ג·חזרות')}`} style={{ position: 'relative', flex: 1, minWidth: 4, height: `${Math.max(4, (t / mx) * 100)}%`, background: BRAND, opacity: isPeak || isLast ? 1 : 0.55, boxShadow: isLast && !isPeak ? `inset 0 0 0 1px ${C.tx}` : 'none', borderRadius: '1px 1px 0 0' }}>
                            {/* value on top of every bar: peak in cyan, the rest in the same grey as the axis ticks (Ohad 08-13) */}
                            <span style={{ position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: 2, fontSize: 8.5, fontWeight: 700, color: isPeak ? BRAND : C.tm, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{k(t)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: 9.5, color: C.tm, marginTop: 6, lineHeight: 1.5 }}>{L(he, 'Σ load×reps per logged session · avg ', 'משקל × חזרות בכל אימון · ממוצע ')}<b style={{ color: C.tx }}>{avg.toLocaleString()}</b>{L(he, ' kg·reps — the raw work trend. ', ' קילו × חזרות — כמה עבודה נעשתה בפועל. ')}<span style={{ color: BRAND }}>▮</span>{L(he, ' peak · outlined = latest.', ' שיא · עם מסגרת = אחרון.')}</div>
              </div>
            );
          })()}
          {a.acwr.state === 'ok' ? (
            <>
              <Kpi v={a.acwr.acwr} l={L(he, 'Load ratio (ACWR)', 'יחס עומס (ACWR)')} s={L(he, 'completed tonnage · watch >1.3', 'טונאז׳ שבוצע · זהירות מעל 1.3')} color={a.acwr.band === 'high' ? C.rd : a.acwr.band === 'low' ? C.or : C.gn} />
              <div style={{ marginTop: 8 }}>
                {a.acwr.band === 'high' && <Read tone="warn" why={L(he, 'A common heuristic, not a law (Zatsiorsky is skeptical of fixed cutoffs) — but don\'t add more on top of a spike.', 'כלל אצבע נפוץ, לא חוק (זציורסקי סקפטי לגבי ספים קבועים) — אבל אל תעמיס עוד על קפיצה בעומס.')}><b>{he ? `העומס קפץ השבוע (ACWR ${a.acwr.acwr}).` : `Load spiked this week (ACWR ${a.acwr.acwr}).`}</b></Read>}
                {a.acwr.band === 'low' && <Read tone="warn" why={L(he, 'Troughs often precede a risky rebound spike — a quiet week to watch.', 'ירידה חדה מגיעה הרבה פעמים לפני קפיצה מסוכנת כשהעומס חוזר — שבוע שקט שכדאי לעקוב אחריו.')}><b>{he ? `העומס ירד בחדות (ACWR ${a.acwr.acwr}).` : `Load dropped sharply (ACWR ${a.acwr.acwr}).`}</b></Read>}
                {a.acwr.band === 'ok' && <Read tone="ok"><b>{he ? `העומס בטווח היציב (${a.acwr.acwr}).` : `Load's in the steady band (${a.acwr.acwr}).`}</b>{L(he, ' No spike or crash.', ' בלי קפיצות ובלי נפילות.')}</Read>}
              </div>
            </>
          ) : (
            <div style={{ border: `1px dashed ${C.bd}`, background: C.sf2, padding: 14, color: C.tm, fontSize: 12.5, lineHeight: 1.5 }}>
              <b style={{ color: C.tx }}>{L(he, 'Building the load baseline.', 'בונה את בסיס העומס.')}</b>{he
                ? ` צריך כ־4 שבועות של רישום כדי לקבל יחס אקוטי:כרוני אמיתי — ${(a.acwr.haveDays || 0) === 1 ? 'יש יום אחד' : `יש ${a.acwr.haveDays || 0} ימים`}.`
                : ` Need ~4 weeks of logging for a real acute:chronic ratio — have ${a.acwr.haveDays || 0} days.`}
            </div>
          )}
      </Section>

      <Section title={L(he, 'Bar speed', 'מהירות מוט')} cardStyle={{ ...card, marginTop: 0 }} tag={<span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '2px 6px', border: `1px solid ${C.pu}`, color: C.pu, marginInlineStart: 8 }}>{L(he, 'camera only', 'רק מצלמה')}</span>} summary={vault && vault.length > 0 ? (he ? `${cnt(vault.length, 'תרגיל אחד', 'תרגילים')} במעקב` : `${vault.length} lift${vault.length === 1 ? '' : 's'} tracked`) : L(he, 'no stored velocity', 'אין מדידות מהירות')}>
          {vault && vault.length > 0 ? (
            <>
              {vault.slice(0, barSpeedAll ? vault.length : 3).map((lift) => (
                <BarSpeedLiftCard key={lift.title} lift={lift} />
              ))}
              {vault.length > 3 && (
                <button onClick={() => setBarSpeedAll((s) => !s)}
                  style={{ marginTop: 10, width: '100%', height: 30, boxSizing: 'border-box', background: 'transparent', border: `1px solid ${C.bd}`, borderRadius: 0, color: C.tm, fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer' }}>
                  {barSpeedAll ? L(he, 'Show less', 'פחות') : (he ? `כל ${vault.length} התרגילים` : `Show all ${vault.length} lifts`)}
                </button>
              )}
              <div style={{ fontSize: 10, color: C.td, marginTop: 9, lineHeight: 1.5 }}>{L(he, 'Per-lift velocity-loss from filmed sets — rising bars = fatigue building on the bar, days before load or RPE would show it. Film a lift across a load range and it also extrapolates a max-less 1RM (load-velocity profiling).', 'ירידת מהירות לכל תרגיל מסטים מצולמים — עמודות שעולות = עייפות, ימים לפני שהמשקל או ה־RPE יראו את זה. צלם תרגיל על כמה משקלים ותקבל גם 1RM משוער בלי מבחן מקסימום (פרופיל עומס־מהירות).')}</div>
            </>
          ) : (
            <div style={{ border: `1px dashed ${C.bd}`, background: C.sf2, padding: 14, color: C.tm, fontSize: 12.5, lineHeight: 1.5 }}>
              {autoPose.running
                ? <><b style={{ color: C.ac, display: 'block', marginBottom: 5 }}>{`${L(he, 'Auto-analysing clips…', 'מנתח קליפים…')} ${autoPose.done}/${autoPose.total}`}</b><span>{L(he, 'Bar speed is read from every uploaded video automatically — no logging needed. This fills in as it goes.', 'מהירות המוט נמדדת אוטומטית מכל וידאו שעולה — בלי רישום. זה מתמלא תוך כדי.')}</span></>
                : <><b style={{ color: C.tx, display: 'block', marginBottom: 5 }}>{L(he, 'No clean bar-speed read yet.', 'עוד אין מדידת מהירות מוט נקייה.')}</b><span>{he
                  ? <>כל קליפ שעולה מנותח אוטומטית למהירות — אף אחד עוד לא צולם מהצד מספיק נקי בשביל מגמה. מהירות המוט יורדת <i>לפני</i> המשקל או ה־RPE; זה מדד עייפות שאף מתחרה במחיר הזה לא נותן.</>
                  : <>{'Every uploaded clip is auto-analysed for velocity — none is filmed side-on cleanly enough to trend yet. Bar speed drops '}<i>{'before'}</i>{' load or RPE; it\'s the fatigue read no competitor at this price offers.'}</>}</span></>}
            </div>
          )}
      </Section>

      {/* Range of motion — per-lift peak joint ROM from filmed sets, same
          top-3 → full-report expansion as bar speed (Ohad #203). ROM is real
          camera data (romTempo.maxRom), refused on poor-capture clips. */}
      <Section title={L(he, 'Range of motion', 'טווח תנועה')} cardStyle={{ ...card, marginTop: 0 }} tag={<span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '2px 6px', border: `1px solid ${C.pu}`, color: C.pu, marginInlineStart: 8 }}>{L(he, 'camera only', 'רק מצלמה')}</span>} summary={romLifts.length > 0 ? (he ? `${cnt(romLifts.length, 'תרגיל אחד', 'תרגילים')} במעקב` : `${romLifts.length} lift${romLifts.length === 1 ? '' : 's'} tracked`) : L(he, 'no stored ROM', 'אין מדידות טווח')}>
          {romLifts.length > 0 ? (
            <>
              {romLifts.slice(0, romAll ? romLifts.length : 3).map((lift) => (
                <RomLiftCard key={lift.title} lift={lift} />
              ))}
              {romLifts.length > 3 && (
                <button onClick={() => setRomAll((s) => !s)}
                  style={{ marginTop: 10, width: '100%', height: 30, boxSizing: 'border-box', background: 'transparent', border: `1px solid ${C.bd}`, borderRadius: 0, color: C.tm, fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer' }}>
                  {romAll ? L(he, 'Show less', 'פחות') : (he ? `כל ${romLifts.length} התרגילים` : `Show all ${romLifts.length} lifts`)}
                </button>
              )}
              <div style={{ fontSize: 10, color: C.td, marginTop: 9, lineHeight: 1.5 }}>{L(he, 'Peak working range per filmed lift, measured from the skeleton. A quietly shrinking range = depth or mobility slipping, or fatigue compensation — visible before it shows in the loads.', 'טווח העבודה הכי גדול לכל תרגיל מצולם, נמדד מהווידאו. טווח שמתכווץ בשקט = עומק או מוביליטי שנשחקים, או פיצוי בגלל עייפות — רואים את זה לפני שזה מופיע במשקלים.')}</div>
            </>
          ) : (
            <div style={{ border: `1px dashed ${C.bd}`, background: C.sf2, padding: 14, color: C.tm, fontSize: 12.5, lineHeight: 1.5 }}>
              <b style={{ color: C.tx, display: 'block', marginBottom: 5 }}>{L(he, 'No ROM read yet.', 'עוד אין מדידת טווח.')}</b><span>{L(he, 'Working range is read from filmed sets automatically — film a few clean sets and each lift\'s range trends here, no logging needed.', 'טווח העבודה נמדד אוטומטית מסטים מצולמים — צלם כמה סטים נקיים והמגמה של כל תרגיל תופיע כאן, בלי רישום.')}</span>
            </div>
          )}
      </Section>

      <Section title={L(he, 'Symmetry · left vs right', 'סימטריה · ימין מול שמאל')} cardStyle={{ ...card, marginTop: 0 }} tag={<span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '2px 6px', border: `1px solid ${C.pu}`, color: C.pu, marginInlineStart: 8 }}>{L(he, 'camera only', 'רק מצלמה')}</span>} summary={asymTrend.joints.length > 0 ? (asymTrend.anyFlag ? (he ? `מעקב: ${JOINT_HE[asymTrend.worst.joint] || asymTrend.worst.joint}` : `watch ${asymTrend.worst.joint.toLowerCase()}`) : (he ? `יציב · ${cnt(asymTrend.films, 'צילום אחד', 'צילומים')}` : `holding · ${asymTrend.films} film${asymTrend.films === 1 ? '' : 's'}`)) : L(he, 'no history', 'אין היסטוריה')}>
          {asymTrend.joints.length > 0 ? (
            <>
              <div style={{ fontSize: 12.5, color: asymTrend.anyFlag ? C.rd : asymTrend.films < 2 ? C.tm : C.gn, marginBottom: 4, fontWeight: 600 }}>
                {he
                  ? (asymTrend.anyFlag
                    ? `תעקוב אחרי ה${JOINT_HE[asymTrend.worst.joint] || asymTrend.worst.joint} — צד ${SIDE_HE[asymTrend.worst.weaker] || asymTrend.worst.weaker} זז ${asymTrend.worst.current}% פחות${asymTrend.worst.drift === 'widening' ? ' והפער גדל' : ''}.`
                    : asymTrend.films < 2
                      ? 'סט מצולם אחד — אין שום דבר מדאיג, אבל צלם עוד כמה כדי לראות מגמה בסימטריה.'
                      : `הסימטריה יציבה לאורך ${asymTrend.films} סטים מצולמים.`)
                  : (asymTrend.anyFlag
                    ? `Watch the ${asymTrend.worst.joint.toLowerCase()} — ${asymTrend.worst.weaker.toLowerCase()} side ${asymTrend.worst.current}% behind${asymTrend.worst.drift === 'widening' ? ' and widening' : ''}.`
                    : asymTrend.films < 2
                      ? `One filmed set — nothing alarming, but film a few more to trend symmetry.`
                      : `Symmetry holding across ${asymTrend.films} filmed sets.`)}
              </div>
              {asymTrend.joints.slice(0, 4).map((j) => {
                const mx = Math.max(...j.series.map((s) => s.pct), 20);
                const jc = j.flag ? C.rd : j.drift === 'widening' ? C.pu : C.gn;
                return (
                  <div key={`${j.lift}-${j.joint}`} style={{ padding: '9px 0', borderTop: `1px solid ${C.bd}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                      <span style={{ fontSize: 12.5, color: C.tx }}>{he ? `${JOINT_HE[j.joint] || j.joint} · ${SIDE_HE[j.weaker] || j.weaker} זז פחות ` : `${j.joint} · ${j.weaker.toLowerCase()} lower `}<span style={{ color: C.td, fontSize: 11 }}>· {j.lift}</span></span>
                      <span style={{ fontSize: 10, color: jc, letterSpacing: '0.04em' }}>
                        {he
                          ? `${j.current}%${j.series.length >= 2 ? ` · ${j.drift === 'widening' ? `הפער גדל ב־${Math.abs(j.delta)}` : j.drift === 'closing' ? `הפער הצטמצם ב־${Math.abs(j.delta)}` : 'יציב'}` : ' · סט אחד'}`
                          : `${j.current}%${j.series.length >= 2 ? ` · ${j.drift === 'widening' ? `widened +${j.delta}` : j.drift === 'closing' ? `closing ${j.delta}` : 'stable'}` : ' · 1 set'}`}
                      </span>
                    </div>
                    <div dir="ltr" style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 30 }}>
                      {j.series.slice(-8).map((s, i) => (
                        <div key={i} title={he ? `${s.date} · ${SIDE_HE[s.weaker] || s.weaker} זז ${s.pct}% פחות` : `${s.date} · ${s.pct}% ${s.weaker.toLowerCase()} behind`}
                          style={{ flex: 1, minWidth: 4, height: `${Math.max(12, (s.pct / mx) * 100)}%`, background: jc, opacity: 0.85, borderRadius: '1px 1px 0 0' }} />
                      ))}
                    </div>
                  </div>
                );
              })}
              <div style={{ fontSize: 10, color: C.td, marginTop: 9, lineHeight: 1.5 }}>{L(he, 'Per-joint L/R travel across filmed sets — a bar climbing = one limb pulling away. 2D pose is approximate; a widening flag is worth screening in person, not a diagnosis.', 'תנועת ימין/שמאל לכל מפרק לאורך סטים מצולמים — עמודה שעולה = פער בין הצדדים שהולך וגדל. זיהוי תנוחה דו־ממדי הוא רק הערכה; פער שגדל — תבדוק בעין באימון — זו לא קביעה רפואית.')}</div>
            </>
          ) : (
            <div style={{ border: `1px dashed ${C.bd}`, background: C.sf2, padding: 14, color: C.tm, fontSize: 12.5, lineHeight: 1.5 }}>
              {autoPose.running
                ? <><b style={{ color: C.ac, display: 'block', marginBottom: 5 }}>{`${L(he, 'Auto-analysing clips…', 'מנתח קליפים…')} ${autoPose.done}/${autoPose.total}`}</b><span>{L(he, 'Left-vs-right joint travel is read from every uploaded video automatically — no logging needed.', 'תנועת המפרקים ימין מול שמאל נמדדת אוטומטית מכל וידאו שעולה — בלי רישום.')}</span></>
                : <><b style={{ color: C.tx, display: 'block', marginBottom: 5 }}>{L(he, 'No symmetry read yet.', 'עוד אין מדידת סימטריה.')}</b><span>{he
                  ? <>כל קליפ שעולה מנותח אוטומטית לתנועת ימין/שמאל — אף אחד עוד לא נקי מספיק בשביל מגמה. פער בין הצדדים יופיע כאן <i>לפני</i> שזה נהיה מתיחה; אף אחד במחיר הזה לא עוקב אחרי זה.</>
                  : <>{'Every uploaded clip is auto-analysed for L/R joint travel — none clean enough to trend yet. A limb pulling away shows here '}<i>{'before'}</i>{' it\'s a tweak; nobody at this price trends it.'}</>}</span></>}
            </div>
          )}
      </Section>
    </div>

    {/* 6. READINESS honest thin */}
    <div style={card}><div className="lin-hd" style={hd}>{L(he, 'Readiness / effort log', 'רישום מאמץ (RPE)')}</div>
      <div style={bd}>
        <div style={{ border: `1px dashed ${C.bd}`, background: C.sf2, padding: 14, color: C.tm, fontSize: 12.5, lineHeight: 1.5 }}>
          {a.rpeCoverage >= 40
            ? <><b style={{ color: C.tx }}>{he ? `RPE נרשם ב־${a.rpeCoverage}% מהסטים.` : `RPE logged on ${a.rpeCoverage}% of sets.`}</b>{L(he, ' Enough to trust the effort reads above — the autoregulation signal is reliable.', ' מספיק כדי לסמוך על מה שכתוב למעלה.')}</>
            : <><b style={{ color: C.tx }}>{L(he, 'Not enough effort data to model fatigue.', 'אין מספיק נתוני מאמץ כדי להעריך עייפות.')}</b>{he ? ` RPE ב־${a.rpeCoverage}% מהסטים — צריך בערך 10 מדידות בשביל מגמה. כרגע זה שיקול דעת ביחד עם סימני העומס למעלה. ` : ` RPE on ${a.rpeCoverage}% of sets — need ~10 points for a trend. Right now this is judgment + the load signals above. `}<span style={{ color: C.td }}>{L(he, 'Nudge him to log effort and this unlocks a real fitness-fatigue readout.', 'תגיד לו לרשום מאמץ, וככה תקבל מעקב כושר־עייפות אמיתי.')}</span></>}
        </div>
      </div>
    </div>

    {/* 7. NEXT BLOCK */}
    <div style={card}><div className="lin-hd" style={hd}>{L(he, 'The next block · your call', 'הבלוק הבא · ההחלטה שלך')}</div>
      <div style={bd}>
        <div style={{ border: `1px solid ${C.ac}`, background: `color-mix(in srgb, ${C.ac} 7%, ${C.sf})`, padding: 14, fontSize: 14, lineHeight: 1.6, color: C.tx }}>
          {nextBlockText(a, he)}
        </div>
      </div>
    </div>

    <div style={{ fontSize: 11, color: C.td, margin: '18px 2px 4px', lineHeight: 1.6 }}>
      {L(he, 'Verdict up top, gated on "did he train" · thin data is labelled, never faked · nothing here changes his program — it analyses + advises, you build.', 'הכול בתנאי שהאימונים באמת נרשמו · מה שחסר מסומן, לא ממציאים · שום דבר פה לא משנה את התוכנית — פה רק ממליצים, אתה בונה.')}
    </div>
    <style>{`@media(max-width:720px){.lineage-grid2{grid-template-columns:1fr !important}}
@media(max-width:620px){
  .lin-lifts, .lin-lifts tbody, .lin-lifts tr, .lin-lifts td{display:block!important;width:auto!important}
  .lin-lifts thead{display:none!important}
  .lin-lifts tr{display:flex!important;flex-wrap:wrap;align-items:flex-start;padding:10px 0;border-bottom:1px solid var(--c-cardBd)}
  .lin-lifts td{border-bottom:none!important;padding:0 2px 4px!important;white-space:normal!important;text-align:start!important;flex:1 1 100%;min-width:0}
  /* The readings share one wrapping line, each labelled by the header the
     phone had to drop. flex is what gives them a break opportunity - as
     inline-blocks written with no whitespace between the tags, they had
     none, and the last cell ran off the screen. */
  .lin-lifts td[data-h]{flex:0 1 auto;margin-inline-end:16px}
  .lin-hd{display:block!important}
  .lin-hd > *:last-child{display:block;margin-top:3px}
  .lin-lifts td[data-h]::before{content:attr(data-h);display:block;font-size:8px;letter-spacing:0.11em;text-transform:uppercase;color:var(--c-tm);margin-bottom:2px}
}`}</style>
  </>);
}
