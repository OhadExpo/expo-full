// THE ATHLETE'S PROGRESS PAGE (16.10 #826, Ohad: "a coach version like we have now, but also another version for the
// athletes"). /athlete/progress - the PRs tab grown into a page: the block in one line in HIS words, the scorecard, his
// main lifts, this block against the last one, the coach's weekly focus and comments with his own notes, then his
// records (the old PRs page, embedded). The SAME engine as the coach's Training Analysis (lineageAnalysis /
// runAnalysis / athleteContext), fed ONLY what the athlete can read: his workouts, his visible blocks, his weekly-focus
// rows. Never the coach's moves ('back off 5-10%'), never coach-only notes.
import React, { useMemo } from 'react';
import { C, FN, FB } from './theme';
import { analyzeAthlete, vsLastBlock } from './lineageAnalysis';
import { analyzeRunner } from './runAnalysis';
import { blockContext } from './athleteContext';
import { blockNum, classifyPattern, repsTop } from './patternRules';
import { normalizeDays } from './usePlansStore';
import { Tile, Lifts, VsLast, FitStrip } from './StrengthReview';
import BlockTalk from './BlockTalk';
import TraineePRsView from './TraineePRsView';

const L = (he, en, hb) => (he ? hb : en);
const I = (s) => `⁦${s}⁩`;
const card = { border: `1px solid ${C.cardBd}`, background: 'var(--c-sf)', marginTop: 12 };
const km1 = (n) => (Math.round((n || 0) * 10) / 10).toString();

export default function AthleteProgress({ header, clientWorkouts, clientId, plans, exercises, weeklyFocus, he, blockId = null, blockName = null, week = null }) {
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

  const mains = a && !a.empty ? (a.staples || []).filter((s) => s.isMain && !s.ballistic && s.count >= 3) : [];
  const climbing = mains.filter((s) => !s.stale?.stale && s.trend?.dir === 'up').length;
  // the sessions due SO FAR (days x the week he has reached), not the whole block - week 2 of 4 is not '17%'
  const sessW = a && !a.empty ? (a.sessions || []).map((x) => Number(x.week)).filter((x) => x > 0) : [];
  const reached = sessW.length ? Math.max(...sessW) : null;
  const dueSoFar = a && !a.empty ? (reached && a.plannedDays && a.plannedDays.length ? Math.min(a.plannedSessionCount || Infinity, a.plannedDays.length * reached) : (a.plannedSessionCount || 0)) : 0;
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

  return (
    <div data-theme="dark" style={{ background: C.bg, color: C.tx, fontFamily: FB, maxWidth: 500, margin: '0 auto' }}>
      {header}
      <div key="mv-progress" className="motion-view" data-athlete-progress dir={he ? 'rtl' : 'ltr'} style={{ padding: '14px 20px 20px' }}>
        {line ? (
          <div style={{ ...card, marginTop: 0, borderColor: C.ac }}>
            <FitStrip he={he} title={L(he, 'Your block', 'הבלוק שלך')} />
            <div style={{ padding: '12px 14px', fontFamily: FB, fontSize: 14, lineHeight: 1.5, color: C.tx }}>{line}</div>
          </div>
        ) : (
          <div style={{ ...card, marginTop: 0 }}>
            <FitStrip he={he} title={L(he, 'Your block', 'הבלוק שלך')} />
            <div style={{ padding: '12px 14px', fontFamily: FB, fontSize: 13, lineHeight: 1.5, color: C.tm }}>{L(he, 'Log your first session and your progress shows here.', 'תרשום את האימון הראשון וההתקדמות שלך תופיע כאן.')}</div>
          </div>
        )}
        {a && !a.empty && !run && (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
              <Tile he={he} v={dueSoFar ? `${Math.min(100, Math.round(((a.adh?.loggedSessions || 0) / dueSoFar) * 100))}%` : '—'} l={L(he, 'Sessions', 'אימונים')} s={he ? `${a.adh?.loggedSessions || 0} מתוך ${dueSoFar || '?'}${dueLabel ? ' עד עכשיו' : ''}` : `${a.adh?.loggedSessions || 0} of ${dueSoFar || '?'}${dueLabel ? ' so far' : ''}`} color={C.tx} />
              <Tile he={he} v={a.adh && a.adh.setsPct != null ? `${a.adh.setsPct}%` : '—'} l={L(he, 'Sets done', 'סטים שבוצעו')} color={C.tx} />
              <Tile he={he} v={mains.length ? `${climbing}/${mains.length}` : '—'} l={L(he, 'Main lifts climbing', 'תרגילים מרכזיים בעלייה')} color={climbing ? C.gn : C.tx} />
              <Tile he={he} v={a.rpeCoverage != null ? `${a.rpeCoverage}%` : '—'} l={L(he, 'Effort logged', 'רישום מאמץ')} s={L(he, 'sets with RPE', 'סטים עם RPE')} color={C.tx} />
            </div>
            <Lifts a={a} he={he} athlete />
            {cmp && cmp.prev && cmp.prev.logged > 0 && <VsLast cmp={cmp} he={he} athlete />   /* an athlete never gets a 'nothing to compare' card */}
          </>
        )}
        {run && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            <Tile he={he} v={`${run.runs.length}/${run.plannedDue || '?'}`} l={L(he, 'Runs', 'ריצות')} s={L(he, 'so far', 'עד עכשיו')} color={C.tx} />
            <Tile he={he} v={km1(run.doneKm)} l={L(he, 'Km', 'ק״מ')} s={L(he, 'in this block', 'בבלוק הזה')} color={C.tx} />
          </div>
        )}
        {talk && talk.any && <BlockTalk ctx={talk} he={he} coach={false} />}
        <div style={{ ...card }}>
          <FitStrip he={he} title={L(he, 'Your records', 'השיאים שלך')} />
          <div style={{ padding: '12px 14px' }}>
            <TraineePRsView clientWorkouts={clientWorkouts} traineeId={clientId} embedded />
          </div>
        </div>
      </div>
    </div>
  );
}
