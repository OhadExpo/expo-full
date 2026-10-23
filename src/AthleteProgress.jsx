// THE ATHLETE'S PROGRESS PAGE (16.10 #826, Ohad: "a coach version like we have now, but also another version for the
// athletes"). /athlete/progress - the PRs tab grown into a page. 16.10 #830 (Ohad: "Records before everything else. The
// analysis is a bit too long for the athlete. It needs to be precise"): his records first, then ONE card - the block in
// one line, his main lifts one row each (status + the change, a noisy % left out), this block against the last one in one
// line - then only what the coach told him (CoachWords: the latest week's focus, the last video comments). The SAME engine as the coach's Training Analysis (lineageAnalysis /
// runAnalysis / athleteContext), fed ONLY what the athlete can read: his workouts, his visible blocks, his weekly-focus
// rows. Never the coach's moves ('back off 5-10%'), never coach-only notes.
import React, { useMemo } from 'react';
import { C, FN, FB } from './theme';
import { analyzeAthlete, vsLastBlock } from './lineageAnalysis';
import { analyzeRunner } from './runAnalysis';
import { blockContext } from './athleteContext';
import { blockNum, classifyPattern, repsTop } from './patternRules';
import { normalizeDays } from './usePlansStore';
import { plannedSessions } from './planWeek';
import { FitStrip, liftState } from './StrengthReview';
import { CoachWords } from './BlockTalk';
import TraineePRsView from './TraineePRsView';
import JumpTest from './JumpTest';

const L = (he, en, hb) => (he ? hb : en);
const I = (s) => `⁦${s}⁩`;
const card = { border: `1px solid ${C.cardBd}`, background: 'var(--c-sf)', marginTop: 12 };
const Ltr = ({ children, style }) => <bdi dir="ltr" style={{ unicodeBidi: 'isolate', fontVariantNumeric: 'tabular-nums', ...style }}>{children}</bdi>;
const km1 = (n) => (Math.round((n || 0) * 10) / 10).toString();

export default function AthleteProgress({ header, clientWorkouts, clientId, plans, exercises, weeklyFocus, he, blockId = null, blockName = null, week = null, demo = false, readOnly = false }) {
  const exMap = useMemo(() => new Map((exercises || []).map((e) => [e.id, e])), [exercises]);
  // ONLY the block he is on and the blocks before it: a newer block the coach is still writing (hidden in his portal) is
  // cut away, so it can never be analysed, named or have its pre-written focus shown. A couple member keeps his own plans.
  const all = useMemo(() => (plans || []).map((p) => ({ ...p, days: normalizeDays(p.days || []) })), [plans]);
  const target = useMemo(() => (blockId ? all.find((p) => p.id === blockId) : null) || (blockName ? all.find((p) => p.name === blockName && (!p.traineeId || p.traineeId === clientId)) || all.find((p) => p.name === blockName) : null) || null, [all, blockId, blockName, clientId]);
  const norm = useMemo(() => {
    if (!target) return [];
    const own = target.traineeId ? all.filter((p) => !p.traineeId || p.traineeId === target.traineeId) : all;
    const tn = blockNum(target.name);
    return own.filter((p) => p.id === target.id || (tn != null && blockNum(p.name) != null && blockNum(p.name) < tn))
      .sort((x, y) => (blockNum(x.name) ?? -1) - (blockNum(y.name) ?? -1));   // newest last (runAnalysis reads the tail as the latest)
  }, [all, target]);
  // a couple's logs: the ones filed against a plan of HIS
  // drop ONLY the logs that must stay hidden: filed under another couple member's plan, or under a newer block
  const cwOwn = useMemo(() => {
    if (!target) return [];
    const tn = blockNum(target.name);
    const bad = new Set(all.filter((p) => p.id !== target.id && ((target.traineeId && p.traineeId && p.traineeId !== target.traineeId) || (tn != null && blockNum(p.name) != null && blockNum(p.name) > tn))).map((p) => p.id));
    return (clientWorkouts || []).filter((w) => w && (!w.planId || !bad.has(w.planId)));
  }, [clientWorkouts, all, target]);
  const deps = useMemo(() => ({ blockNum, classifyPattern, repsTop, exMap, he, targetBlockId: target ? target.id : null }), [exMap, he, target]);
  const a0 = useMemo(() => (target && norm.length ? analyzeAthlete(cwOwn, clientId, norm, deps) : null), [target, norm, cwOwn, clientId, deps]);
  const a = a0 && target && a0.blockId === target.id ? a0 : null;   // never a result about another block
  const viewed = a ? target : null;
  const same = (w, p) => w.planName === p.name || (blockNum(p.name) != null && blockNum(w.planName) === blockNum(p.name));
  const run = useMemo(() => (viewed && viewed.sport === 'running' ? analyzeRunner(cwOwn, clientId, norm, { viewedId: viewed.id, sameBlock: same }) : null), [viewed, cwOwn, clientId, norm]);
  const cmp = useMemo(() => (a && !run ? vsLastBlock(a, norm, cwOwn, clientId, deps) : null), [a, run, norm, cwOwn, clientId, deps]);
  const talk = useMemo(() => (viewed ? blockContext({ workouts: cwOwn, clientId, plan: viewed, sameBlock: same, focus: weeklyFocus || {}, exMap, upToWeek: week }) : null), [viewed, cwOwn, clientId, weeklyFocus, exMap, week]);

  const mains = a && !a.empty && !run ? (a.staples || []).filter((s) => s.isMain && !s.ballistic && s.count >= 3) : [];   // never lift rows under a running block
  const climbing = mains.filter((s) => !s.stale?.stale && s.trend?.dir === 'up').length;
  // the sessions due SO FAR (days x the week he has reached), not the whole block - week 2 of 4 is not '17%'
  const sessW = a && !a.empty ? (a.sessions || []).map((x) => Number(x.week)).filter((x) => x > 0) : [];
  const reached = sessW.length ? Math.max(...sessW) : null;
  const dueSoFar = a && !a.empty ? (reached && a.plannedDays && a.plannedDays.length ? Math.min(a.plannedSessionCount || Infinity, a.plannedDayObjs ? plannedSessions(a.plannedDayObjs, reached) : a.plannedDays.length * reached) : (a.plannedSessionCount || 0)) : 0;
  const dueLabel = reached && dueSoFar < (a?.plannedSessionCount || 0);
  let line = null;
  if (a && !a.empty && !run) {
    const n = a.adh?.loggedSessions || 0, of = dueSoFar, sets = a.adh?.setsPct;
    line = he
      ? `בבלוק הזה רשמת ${n === 1 ? 'אימון אחד' : `${I(n)} אימונים`}${of ? ` מתוך ${I(of)}${dueLabel ? ' עד עכשיו' : ''}` : ''}${sets != null ? ` וסיימת ${I(sets + '%')} מהסטים` : ''}.${mains.length ? ` ${climbing === 0 ? 'עוד אף תרגיל מרכזי לא בעלייה' : climbing === 1 ? (mains.length === 1 ? 'תרגיל מרכזי אחד בעלייה' : `תרגיל מרכזי אחד מתוך ${I(mains.length)} בעלייה`) : `${I(climbing)} מתוך ${I(mains.length)} התרגילים המרכזיים שלך בעלייה`}.` : ''}`
      : `In this block you logged ${n} session${n === 1 ? '' : 's'}${of ? ` of ${of}${dueLabel ? ' so far' : ''}` : ''}${sets != null ? ` and finished ${sets}% of your sets` : ''}.${mains.length ? ` ${climbing === 0 ? 'None of your main lifts is climbing yet' : `${climbing} of your ${mains.length} main lifts ${climbing === 1 ? 'is' : 'are'} climbing`}.` : ''}`;
  } else if (run && run.runs.length) {
    line = he
      ? `בבלוק הזה עשית ${run.runs.length === 1 ? 'ריצה אחת' : `${I(run.runs.length)} ריצות`}${run.plannedDue ? ` מתוך ${I(run.plannedDue)} עד עכשיו` : ''} - ${I(km1(run.doneKm))} ק״מ.`
      : `In this block you ran ${run.runs.length} run${run.runs.length === 1 ? '' : 's'}${run.plannedDue ? ` of ${run.plannedDue} so far` : ''} - ${km1(run.doneKm)} km.`;
  }

  // the main lifts, one row each: the lifts whose status means something (3+ logs, not explosive) - climbing first, then
  // dropping, then holding (stable inside each group: the engine's own order), the first six
  const rank = { up: 0, down: 1, hold: 2, stuck: 2 };   // a dropping lift is never the one cut (re-review)
  const rows = mains.map((x, i) => ({ x, i, r: rank[liftState(x, true).k] ?? 1 })).sort((p, q) => p.r - q.r || p.i - q.i).map((o) => o.x).slice(0, 6);
  let vs = null;
  if (cmp && cmp.prev && cmp.prev.logged > 0 && cmp.lifts.length) {
    const held = Math.max(0, cmp.counted - cmp.up - cmp.down);
    const parts = [[cmp.up, 'went up', 'עלה', 'עלו'], [cmp.down, 'went down', 'ירד', 'ירדו'], [held, 'held', 'נשאר במקום', 'נשארו במקום']].filter((x) => x[0] > 0);
    const lead = cmp.weeks ? (he ? (cmp.weeks === 1 ? 'מול השבוע הראשון בבלוק הקודם' : `מול ${I(cmp.weeks)} השבועות הראשונים בבלוק הקודם`) : `Vs the last block's first ${cmp.weeks === 1 ? 'week' : `${cmp.weeks} weeks`}`) : L(he, 'Vs the last block', 'מול הבלוק הקודם');
    const n = cmp.lifts.length;
    if (parts.length) vs = he ? `${lead}: ${parts.map(([k, , o, m]) => (k === 1 ? `תרגיל אחד ${o}` : `${I(k)} תרגילים ${m}`)).join(', ')}.` : `${lead}: ${parts.map(([k, e]) => `${k} ${k === 1 ? 'lift' : 'lifts'} ${e}`).join(', ')}.`;
    else vs = he ? `${lead}: ${n === 1 ? 'תרגיל אחד חזר' : `${I(n)} תרגילים חזרו`} בשני הבלוקים.` : `${lead}: ${n} lift${n === 1 ? '' : 's'} ran in both blocks.`;
  }
  const records = (
    <div style={{ ...card, marginTop: 0 }} data-progress-records>
      <FitStrip he={he} title={L(he, 'Your records', 'השיאים שלך')} />
      <div style={{ padding: '12px 14px' }}>
        <TraineePRsView clientWorkouts={clientWorkouts} traineeId={clientId} embedded />
      </div>
    </div>
  );

  return (
    <div data-theme="dark" style={{ background: C.bg, color: C.tx, fontFamily: FB, maxWidth: 500, margin: '0 auto' }}>
      {header}
      <div key="mv-progress" className="motion-view" data-athlete-progress dir={he ? 'rtl' : 'ltr'} style={{ padding: '14px 20px 20px' }}>
        {records}
        <div style={card} data-progress-block>
          <FitStrip he={he} title={L(he, 'Your block', 'הבלוק שלך')} />
          <div style={{ padding: '12px 14px', fontFamily: FB, fontSize: line ? 14 : 13, lineHeight: 1.5, color: line ? C.tx : C.tm }}>
            {line || L(he, 'Log your first session and your progress shows here.', 'תרשום את האימון הראשון וההתקדמות שלך תופיע כאן.')}
            {vs && <div style={{ marginTop: 6, fontSize: 13, color: C.tm }}>{vs}</div>}
          </div>
          {rows.length > 0 && (
            <>
              <FitStrip he={he} style={{ borderTop: `1px solid ${C.cardBd}` }} title={L(he, 'Main lifts', 'התרגילים המרכזיים')} meta={L(he, 'change since your first top set', 'שינוי מהטופ סט הראשון שלך')} />
              {rows.map((x, i) => {
                const st = liftState(x, true);
                // a % on a shifting rep scheme, under 4 logs, or against its own status word (a 'dropping' lift at +30% since a
                // first log months ago) is not precise - left out (re-review)
                const raw = x.trend?.repNoisy || x.count < 4 ? null : x.arcGainPct;
                const chg = raw == null || (st.k === 'down' && raw > 0) || (st.k === 'up' && raw < 0) ? null : raw;
                return (
                  <div key={x.title} data-lift-row style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 36, padding: '6px 14px', borderTop: i ? `1px solid ${C.cardBd}` : 'none' }}>
                    <span style={{ fontFamily: FB, fontSize: 13, fontWeight: 600, color: C.tx, minWidth: 0, overflowWrap: 'anywhere', lineHeight: 1.3 }}><bdi>{x.title}</bdi></span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                      <span style={{ minWidth: 46, textAlign: 'end', fontFamily: FN, fontSize: 12, fontWeight: 700, color: chg == null ? C.td : chg > 0 ? C.gn : chg < 0 ? C.rd : C.tm }}>{chg == null ? '' : <Ltr>{`${chg > 0 ? '+' : ''}${chg}%`}</Ltr>}</span>
                      <span style={{ minWidth: 58, textAlign: 'end', fontFamily: FN, fontSize: 10.5, fontWeight: 700, letterSpacing: he ? 0 : '0.08em', textTransform: 'uppercase', color: st.c }}>{he ? st.he : st.en}</span>
                    </span>
                  </div>
                );
              })}
            </>
          )}
        </div>
        {/* his own jump test, saved where his coach sees it (#897) */}
        <JumpTest clientId={clientId} he={he} demo={demo} readOnly={readOnly} />
        <CoachWords ctx={talk} he={he} />
      </div>
    </div>
  );
}
