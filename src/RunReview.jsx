// RUN REVIEW - the training analysis for a RUNNING block (16.10 #814). The strength report told a runner "loads and effort
// are holding" and asked for RPE on his sets; this reads his runs against their prescription (src/runAnalysis.js) and
// says what to do with the next block. Layout: the block in one line + the moves, a 4-tile scorecard, each run against
// its plan, the weeks' km, what is still ahead. House rules: one cyan frame, colour on the words only, no fills, no
// glyphs, no tracking on Hebrew.
import React from 'react';
import { C, FN, FB } from './theme';
import { fmtPaceSec } from './runPace';

const L = (he, en, hb) => (he ? hb : en);
const pace = (s) => (s ? fmtPaceSec(s) : '—');
const km1 = (k) => String(Math.round(k * 10) / 10);
const dm = (d) => { const x = new Date(d); return isFinite(x) ? `${x.getDate()}.${x.getMonth() + 1}` : ''; };
// a number / range inside a sentence, isolated so a Hebrew line never flips it (U+2066 ... U+2069)
const I = (s) => `⁦${s}⁩`;
const range = (t) => (t ? I(`${pace(t[0])}–${pace(t[1])}`) : '');
const Ltr = ({ children, style }) => <bdi dir="ltr" style={{ unicodeBidi: 'isolate', fontVariantNumeric: 'tabular-nums', ...style }}>{children}</bdi>;
const KIND = { easy: ['Easy', 'קלה'], long: ['Long', 'ארוכה'], tempo: ['Tempo', 'טמפו'], intervals: ['Intervals', 'חזרות'], test: ['Test', 'מבחן'], run: ['Run', 'ריצה'] };
const IN_KIND_HE = { tempo: 'בטמפו', intervals: 'בחזרות', test: 'במבחן' };
const tone = { ok: C.gn, warn: C.or, bad: C.rd, info: C.ac };
const card = { border: `1px solid ${C.cardBd}`, background: 'var(--c-sf)', marginTop: 12 };
const track = (he, en) => (he ? 0 : en);

function headline(a, he) {
  const h = a.verdict.headline;
  const fs = a.fastStarts[0];
  if (h === 'none') return L(he, 'No runs logged in this block yet.', 'עוד לא נרשמו ריצות בבלוק הזה.');
  if (h === 'missing') return he ? `הוא רץ ${I(a.runs.length)} מתוך ${I(a.plannedDue)} הריצות שתוכננו עד עכשיו.` : `He ran ${a.runs.length} of the ${a.plannedDue} runs due so far.`;
  if (h === 'hardTooHard') return he ? `באימונים הקשים הוא רץ מהר מדי - ${IN_KIND_HE[fs.run.kind] || 'בחזרות'} הוא פתח מהר מהטווח ב־${I(fs.fastStart)} שנ׳ לק״מ ואיבד ${I(fs.fade)} שנ׳ לק״מ עד הסוף.` : `The hard days run too hard - the ${KIND[fs.run.kind][0].toLowerCase()} opened ${fs.fastStart} s/km faster than its range and lost ${fs.fade} s/km by the end.`;
  if (h === 'capHit') { const c = a.capHits[0]; return he ? `הדופק עבר את התקרה ב־${I(dm(c.date))} (${I(c.hrVs.max)} מול ${I(c.hrVs.cap)}).` : `Heart rate went over its cap on ${dm(c.date)} (${c.hrVs.max} vs ${c.hrVs.cap}).`; }
  if (h === 'checkLog') return L(he, 'One run reads faster than any hard target in the block - check that log.', 'ריצה אחת מהירה מכל יעד בבלוק - שווה לבדוק את הרישום שלה.');
  if (h === 'easyTooFast') return L(he, 'The easy days are not easy - heart rate over the cap.', 'הריצות הקלות לא קלות - הדופק מעל התקרה.');
  if (h === 'easyTargetSlow') return L(he, 'He runs his easy days faster than planned at a low heart rate - the easy target is too slow for him.', 'הוא רץ את הריצות הקלות מהר מהמתוכנן ובדופק נמוך - הקצב שנקבע לריצה קלה איטי מדי בשבילו.');
  if (h === 'noTargets') return L(he, 'No pace targets in this block to read the runs against.', 'אין בבלוק הזה יעדי קצב להשוות אליהם את הריצות.');
  return L(he, 'On plan - the runs sit in their ranges.', 'לפי התוכנית - הריצות בתוך הטווחים.');
}

// the next block, as moves (verbs) - his call, never written into the program
function moves(a, he) {
  const out = [];
  for (const h of a.fastStarts.slice(0, 1)) {
    const t = h.run.target; const slow = t ? I(pace(t[1])) : null; const hr = h.run.reps && h.run.reps.hrRise;
    out.push({ tone: 'warn', t: he ? `שיתחיל ${h.run.kind === 'tempo' ? 'את הטמפו' : 'את החזרות'} בקצה האיטי של הטווח${slow ? ` (${slow})` : ''} וישמור על קצב אחיד - ב־${I(dm(h.run.date))} הוא פתח מהר מהטווח ב־${I(h.fastStart)} שנ׳ לק״מ ואיבד ${I(h.fade)} שנ׳ לק״מ עד הסוף${hr ? `, והדופק עלה ב־${I(hr)} פעימות` : ''}.` : `Start the reps at the slow end of the range${slow ? ` (${slow})` : ''} and hold them even - on ${dm(h.run.date)} he opened ${h.fastStart} s/km faster than the range and lost ${h.fade} s/km by the end${hr ? `, heart rate up ${hr}` : ''}.` });
  }
  for (const c of a.capHits.slice(0, 1)) out.push({ tone: 'warn', t: he ? `לשמור על תקרת הדופק: ב־${I(dm(c.date))} הוא הגיע ל־${I(c.hrVs.max)} מול תקרה של ${I(c.hrVs.cap)} - שיוריד קצב ברגע שהדופק נוגע בתקרה.` : `Hold the heart-rate cap: on ${dm(c.date)} he reached ${c.hrVs.max} against a cap of ${c.hrVs.cap} - ease off the moment it touches the cap.` });
  if (a.easyFastHrOk.length) {
    const e = a.easyFastHrOk[0], r = e.run;
    out.push({ tone: 'info', t: he ? `אפשר להעלות את קצב הריצה הקלה: ב־${I(dm(r.date))} הוא רץ ב־${I(pace(r.mainPace))} לק״מ${e.hr ? ` בדופק ${I(e.hr)}` : ''}, כשהיעד היה ${range(r.target)}.` : `His easy pace can come up: on ${dm(r.date)} he ran ${pace(r.mainPace)} /km${e.hr ? ` at heart rate ${e.hr}` : ''} against a target of ${pace(r.target[0])}–${pace(r.target[1])}.` });
  }
  for (const e of a.easyFastHrHigh.slice(0, 1)) out.push({ tone: 'warn', t: he ? `שירוץ את הריצות הקלות לאט יותר - ב־${I(dm(e.run.date))} הדופק עבר את התקרה.` : `Slow the easy runs - on ${dm(e.run.date)} heart rate went over the cap.` });
  for (const f of a.flags.slice(0, 1)) out.push({ tone: 'warn', t: he ? `תבדוק את הרישום של ${I(dm(f.run.date))}: ריצה "קלה" ב־${I(pace(f.pace))} לק״מ מהירה מכל יעד בבלוק (${I(pace(f.fastestTarget))}) - כנראה טעות בהקפות של השעון.` : `Check the ${dm(f.run.date)} log: an "easy" run at ${pace(f.pace)} /km is faster than any hard target in the block (${pace(f.fastestTarget)}) - most likely the watch's laps.` });
  for (const sp of (a.spikes || []).slice(-1)) out.push({ tone: 'warn', t: he ? `הריצה של ${I(dm(sp.run.date))} (${I(km1(sp.run.km))} ק״מ) ארוכה ב־${I(sp.pct + '%')} מהריצה הארוכה ביותר שלו ב־30 הימים שלפניה (${I(km1(sp.prevMax))} ק״מ) - קפיצה כזאת מעלה את הסיכון לפציעה; שיעלה את המרחק בהדרגה.` : `The ${dm(sp.run.date)} run (${km1(sp.run.km)} km) was ${sp.pct}% longer than his longest in the 30 days before it (${km1(sp.prevMax)} km) - a jump like that raises the injury risk; build to it.` });
  if (a.ramp != null && a.ramp > 10) out.push({ tone: 'warn', t: he ? `הנפח השבועי עלה ב־${I(a.ramp + '%')} - עדיף שהעלייה תישאר מתחת ל־${I('10%')} בשבוע.` : `Weekly km rose ${a.ramp}% - keep the ramp under 10% a week.` });
  if (!out.length && a.verdict.headline === 'onPlan') out.push({ tone: 'ok', t: L(he, 'Progress to the next block: he held the ranges.', 'אפשר להתקדם לבלוק הבא: הוא עמד בטווחים.') });
  return out.slice(0, 4);
}

function Tile({ v, l, s, color, he }) {
  return (
    <div style={{ flex: '1 1 120px', minWidth: 0, border: `1px solid ${C.cardBd}`, padding: '10px 12px', textAlign: 'center' }}>
      <div style={{ fontFamily: FN, fontSize: 20, fontWeight: 700, color: color || C.tx, lineHeight: 1.15 }}><Ltr>{v}</Ltr></div>
      <div style={{ fontFamily: FN, fontSize: 9.5, fontWeight: 700, letterSpacing: track(he, '0.12em'), textTransform: 'uppercase', color: C.tm, marginTop: 4 }}>{l}</div>
      {s && <div style={{ fontFamily: FB, fontSize: 11, color: C.td, marginTop: 3 }}>{s}</div>}
    </div>
  );
}

function vsWord(r, he) {
  if (!r.paceVs) return null;
  const d = r.paceVs;
  if (d.dir === 'in') return { c: C.gn, t: L(he, 'on target', 'בטווח') };
  return { c: d.dir === 'fast' ? C.or : C.ac, t: he ? `${d.dir === 'fast' ? 'מהר' : 'לאט'} ב־${I(d.by)} שנ׳` : `${d.by} s ${d.dir}` };
}

export default function RunReview({ a, he }) {
  const v = a.verdict;
  const strip = { borderBottom: `1px solid ${C.cardBd}`, padding: '0 14px', minHeight: 41, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: track(he, '0.1em'), textTransform: 'uppercase', color: 'var(--c-stripTx, ' + C.tx + ')', background: 'var(--c-stripBg, var(--c-sf))' };
  const sub = { fontFamily: FN, fontSize: 10, color: C.tm, letterSpacing: track(he, '0.06em'), textTransform: 'none', fontWeight: 600 };
  const label = { fontFamily: FN, fontSize: 9.5, fontWeight: 700, letterSpacing: track(he, '0.16em'), textTransform: 'uppercase' };
  const hardWithTarget = a.runs.filter((r) => ['intervals', 'tempo', 'test'].includes(r.kind) && r.paceVs);
  const hardOn = hardWithTarget.filter((r) => r.paceVs.dir === 'in').length;
  const easyRead = a.easyReads.filter((e) => e.hrOk != null);
  const easyHrOk = easyRead.filter((e) => e.hrOk === true).length;
  const ms = moves(a, he);
  return (
    <div data-run-review>
      {/* THE BLOCK IN ONE LINE + THE MOVES */}
      <div style={{ ...card, borderColor: C.ac }}>
        <div style={{ padding: '14px 16px' }}>
          <div style={{ ...label, color: tone[v.tone] || C.ac, marginBottom: 8 }}>{L(he, 'The block in one line', 'הבלוק בשורה אחת')}</div>
          <div style={{ fontFamily: FB, fontSize: 18, fontWeight: 700, lineHeight: 1.35, color: C.tx }}>{headline(a, he)}</div>
          {ms.length > 0 && <div style={{ ...label, color: C.tm, margin: '14px 0 6px' }}>{L(he, 'Next block · your call', 'הבלוק הבא · ההחלטה שלך')}</div>}
          {ms.map((m, i) => (
            // no glyphs (#765b): each move carries its tone as a 3px bar at its start
            <div key={i} style={{ padding: '6px 0', paddingInlineStart: 10, margin: i ? '8px 0 0' : 0, borderInlineStart: `3px solid ${tone[m.tone]}`, fontFamily: FB, fontSize: 13, lineHeight: 1.5, color: C.tx }}>{m.t}</div>
          ))}
        </div>
      </div>

      {/* SCORECARD */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        <Tile he={he} v={`${a.runs.length}/${a.plannedDue}`} l={L(he, 'Runs', 'ריצות')} s={a.weekReached < a.plan.weeks ? (he ? `עד שבוע ${a.weekReached} מתוך ${a.plan.weeks}` : `to week ${a.weekReached} of ${a.plan.weeks}`) : (a.upcomingTest ? L(he, 'the test still ahead', 'המבחן עוד לפניו') : null)} color={a.runs.length >= a.plannedDue - 1 ? C.gn : C.or} />
        <Tile he={he} v={a.plannedKm > 0 ? `${km1(a.doneKm)}/${a.kmPartial ? '≥' : ''}${km1(a.plannedKm)}` : km1(a.doneKm)} l={L(he, 'Km', 'ק״מ')} s={L(he, 'run / planned so far', 'בוצע / מתוכנן עד עכשיו')} />
        <Tile he={he} v={hardWithTarget.length ? `${hardOn}/${hardWithTarget.length}` : '—'} l={L(he, 'Hard days on target', 'אימוני איכות בטווח')} color={!hardWithTarget.length ? C.tm : hardOn === hardWithTarget.length ? C.gn : C.or} />
        <Tile he={he} v={easyRead.length ? `${easyHrOk}/${easyRead.length}` : '—'} l={L(he, 'Easy days, HR in check', 'ריצות קלות בדופק תקין')} s={easyRead.length ? null : L(he, 'no heart-rate cap set', 'לא נקבעה תקרת דופק')} color={!easyRead.length ? C.tm : easyHrOk === easyRead.length ? C.gn : C.or} />
      </div>

      {/* RUN BY RUN */}
      <div style={card}>
        <div style={strip}><span>{L(he, 'Run by run', 'ריצה אחרי ריצה')}</span><span style={sub}>{L(he, 'the main work against its plan', 'החלק העיקרי מול התכנון')}</span></div>
        {a.runs.map((r, i) => {
          const w = vsWord(r, he); const isFlag = a.flags.some((f) => f.run === r);
          return (
            <div key={r.id || i} data-run-row style={{ padding: '10px 14px', borderTop: i ? `1px solid ${C.cardBd}` : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
                  <span style={{ fontFamily: FN, fontSize: 12, fontWeight: 700, color: C.tm, width: 38, flexShrink: 0 }}><Ltr>{dm(r.date)}</Ltr></span>
                  <span style={{ fontFamily: FN, fontSize: 12, fontWeight: 700, letterSpacing: track(he, '0.06em'), color: C.tx, textTransform: 'uppercase' }}>{KIND[r.kind][he ? 1 : 0]}</span>
                  {r.km > 0 && <span style={{ fontFamily: FB, fontSize: 12, color: C.tm }}><Ltr>{km1(r.km)}</Ltr> {L(he, 'km', 'ק״מ')}</span>}
                </span>
                <span style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, color: isFlag ? C.or : (w ? w.c : C.tm), letterSpacing: track(he, '0.04em') }}>{isFlag ? L(he, 'check the log', 'לבדוק רישום') : w ? w.t : L(he, 'no target', 'בלי יעד')}</span>
              </div>
              <div style={{ fontFamily: FB, fontSize: 12.5, color: C.tx, marginTop: 4, display: 'flex', flexWrap: 'wrap', columnGap: 12, rowGap: 2, paddingInlineStart: 46 }}>
                {r.mainPace ? <span><Ltr>{pace(r.mainPace)}</Ltr> {L(he, '/km', 'לק״מ')}{r.target && <span style={{ color: C.tm }}> {L(he, 'vs', 'מול')} <Ltr>{pace(r.target[0])}–{pace(r.target[1])}</Ltr></span>}</span> : <span style={{ color: C.tm }}>{L(he, 'time logged, no distance', 'נרשם זמן בלי מרחק')}</span>}
                {r.hrVs && <span style={{ color: r.hrVs.over ? C.rd : C.tm }}>{L(he, 'HR', 'דופק')} <Ltr>{r.hrVs.max}</Ltr> {L(he, 'cap', 'תקרה')} <Ltr>{r.hrVs.cap}</Ltr></span>}
                {r.reps && r.reps.paces.length >= 2 && r.reps.spread > 0 && (
                  <span style={{ color: C.tm }}>{L(he, 'reps', 'חזרות')} <Ltr>{r.reps.paces.map(pace).join(' · ')}</Ltr>{r.reps.fade >= 10 && <span style={{ color: C.or }}> ({L(he, 'slowed', 'ירידת קצב')} <Ltr>{r.reps.fade}</Ltr> {L(he, 's', 'שנ׳')})</span>}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* THE WEEKS */}
      {a.weeks.length > 0 && (() => {
        const max = Math.max(...a.weeks.map((w) => w.km), 1);
        return (
          <div style={card}>
            <div style={strip}><span>{L(he, 'Km a week', 'ק״מ בשבוע')}</span><span style={sub}>{a.ramp != null ? <>{he ? 'שינוי ' : 'change '}<Ltr>{(a.ramp > 0 ? '+' : '') + a.ramp + '%'}</Ltr></> : L(he, 'the change shows after two full weeks', 'השינוי יופיע אחרי שני שבועות מלאים')}</span></div>
            <div style={{ padding: '10px 14px', display: 'grid', gap: 6 }}>
              {a.weeks.slice(-8).map((w) => (
                <div key={w.wk} style={{ display: 'grid', gridTemplateColumns: '44px 1fr 74px', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontFamily: FN, fontSize: 11, color: C.tm }}><Ltr>{dm(w.wk + 'T12:00:00Z')}</Ltr></span>
                  <span style={{ height: 8, border: `1px solid ${C.ac}`, boxSizing: 'border-box', width: `${Math.max(4, (100 * w.km) / max)}%`, borderStyle: w.current ? 'dashed' : 'solid' }} />
                  <span style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, color: C.tx, textAlign: 'end' }}><Ltr>{km1(w.km)}</Ltr> {w.current ? L(he, 'so far', 'עד כה') : L(he, 'km', 'ק״מ')}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
      {a.upcomingTest && (
        <div style={{ ...card, padding: '10px 14px', fontFamily: FB, fontSize: 12.5, color: C.tm }}>
          {L(he, 'Still ahead: ', 'עוד לפניו: ')}<bdi style={{ color: C.tx }}>{a.upcomingTest}</bdi>
        </div>
      )}
    </div>
  );
}
