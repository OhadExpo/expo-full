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
import { getAthleteVault, getAthleteAsymmetryTrend } from './poseMetricsStore';
import { autoAnalyzeAthleteVideos, pendingCount } from './autoAnalyzeVideos';
import { velocityProfile1RM, mvtForLift } from './velocityProfile1RM';
import { blockNum, classifyPattern, repsTop, exById } from './PlansView';
import { groupByBucket, BUCKETS, movementRegion } from './movementBucket';
import { exerciseContinuity } from './exerciseContinuity';

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
  return (
    <div style={cardStyle}>
      <div style={{ ...hd, cursor: 'pointer' }} onClick={() => setOpen((o) => !o)} role="button" tabIndex={0} aria-expanded={open}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen((o) => !o); } }}
        title={open ? 'Collapse' : 'Expand for the full report'}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><span style={{ color: C.ac, fontSize: 10 }}>{open ? '▾' : '▸'}</span>{title}{tag}</span>
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

// tiny e1RM sparkline
function Spark({ pts, dir }) {
  const col = dir === 'up' ? C.gn : dir === 'down' ? C.rd : C.or;
  const max = Math.max(...pts, 1), min = Math.min(...pts, 0);
  const rng = max - min || 1;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, height: 20, verticalAlign: 'middle', flexShrink: 0 }}>
      {pts.map((p, i) => (
        <i key={i} style={{ width: 5, height: `${Math.max(15, ((p - min) / rng) * 100)}%`, background: col, borderRadius: 1, display: 'inline-block' }} />
      ))}
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
function readStaple(s) {
  const wks = s.weeksSincePr;
  const noPr = wks != null && wks >= 5;   // hasn't beaten its best in 5+ weeks → rotation trigger
  if (s.count < 3) return { tag: `${s.count}× ONLY`, tagColor: C.td, why: 'too few logs to read a trend', next: 'log 3+ before judging it' };
  if (s.ballistic) {
    // A ballistic lift is ALWAYS "EXPLOSIVE" — never a green "GOING UP" off load,
    // because a jump/throw progresses on speed + height, not kg (Ohad). Load
    // creeping up is still noted in the 'why', but a "keep adding load" tag would
    // contradict the "don't chase kg here" cue on the same row.
    return { tag: 'EXPLOSIVE', tagColor: C.pu,
      why: s.trend?.dir === 'up' ? 'load creeping up — but a jump progresses on speed + height, not kg' : 'jumps progress on speed + height, not load',
      next: 'film a set for velocity — don\'t chase kg here' };
  }
  if (s.stale?.state === 'ok' && s.stale.stale) {
    if (s.stale.mode === 'hard') return { tag: 'STALLED · HARD', tagColor: C.or, why: 'flat weight + effort rising = hidden fatigue, not a real ceiling', next: 'one lighter week (~50% volume) then re-test, or swap the variation — not more kg' };
    if (s.stale.mode === 'easy') return { tag: 'STALLED · EASY', tagColor: C.ac, why: 'flat but moving easy — he\'s under-stimulated', next: '+2.5–5kg or add a set' };
    return { tag: 'STALLED', tagColor: C.or, why: 'weight hasn\'t moved in 3 sessions', next: noPr ? `no PR in ${wks} weeks — rotate the variation` : 'push the load or change the stimulus' };
  }
  if (s.trend?.state === 'ok') {
    if (s.trend.repNoisy) return { tag: 'REPS VARIED', tagColor: C.tm, why: 'rep scheme shifted across the block — e1RM can\'t tell a strength change from the rep change', next: 'read it off load-at-a-fixed-rep, or hold a rep target for 3 sessions for a clean trend' };
    if (s.trend.dir === 'up') return { tag: 'PROGRESS', tagColor: C.gn, why: 'progressing', next: '+2–3% load or +1 rep at the same effort' };
    if (s.trend.dir === 'down') return { tag: 'REGRESS', tagColor: C.rd, why: 'going backwards', next: 'back off ~5–10% intensity, hold volume, check recovery' };
  }
  return { tag: 'HOLDING', tagColor: C.tm, why: 'holding steady', next: noPr ? `no PR in ${wks} weeks — time to change it up` : 'maintain, or nudge the load' };
}

function nextBlockText(a) {
  const v = a.verdict;
  const nextNum = a.blockNumber != null ? ` (#${a.blockNumber + 1})` : '';
  if (v.tone === 'warn') {
    const region = a.region?.lower?.pct >= a.region?.upper?.pct ? 'lower' : 'upper';
    const hardStale = a.staples.find((s) => s.stale?.stale && s.stale.mode === 'hard');
    // "Keep pushing" must exclude stale/ballistic lifts — a stale lift isn't
    // "still has room", and you don't chase kg on a jump.
    const climbing = a.staples.filter((s) => s.trend?.dir === 'up' && !s.stale?.stale && !s.ballistic).map((s) => s.title);
    return (
      <>
        <b>Deload{nextNum}: cut {region}-body volume ~50%, hold intensity.</b> Fatigue is accumulating faster than it's clearing.
        {hardStale && <> When you rebuild: <b>{hardStale.title} is stale at a hard effort</b> — change the stimulus (tempo / pause / variation), not just the number.</>}
        {climbing.length > 0 && <> Keep pushing <b>{climbing.slice(0, 2).join(' + ')}</b> — still has room.</>}
        {a.skip && <> And fix the <b>{a.skip.day} skip</b> ({a.skip.logged}/{a.skip.expected} logged) — reprogramming it as-is won't help.</>}
      </>
    );
  }
  if (v.tone === 'info') {
    return <><b>Get the athlete logging first.</b> Only {a.adh.sessionPct}% of sessions are logged — every load signal here is unreliable until the athlete is training and recording it. This is a check-in, not a programming change.</>;
  }
  // Mutually exclusive: a stale lift is "stuck", never also "climbing" — else
  // the coach is told to both add load AND hold on the same lift. Ballistics
  // never land in "add load" (kg isn't the read on a jump). Matches the
  // responding-split split above.
  const stuck = a.staples.filter((s) => s.stale?.stale || s.trend?.dir === 'down').map((s) => s.title);
  const climbing = a.staples.filter((s) => s.trend?.dir === 'up' && !s.stale?.stale && !s.ballistic).map((s) => s.title);
  return (
    <>
      <b>Progress the block{nextNum}.</b> Holding or progressing.
      {climbing.length > 0 && <> Add load on <b>{climbing.slice(0, 3).join(', ')}</b>.</>}
      {stuck.length > 0 && <> Hold or vary <b>{stuck.slice(0, 2).join(', ')}</b> before forcing more weight.</>}
    </>
  );
}

function LiftRow({ s }) {
  const r = readStaple(s);
  const loads = s.loads.filter((x) => x != null).slice(-4).map((x) => (Number.isInteger(x) ? x : x.toFixed(1)));
  const fmt = (d) => { try { const dt = new Date(d); return `${dt.getDate()}/${dt.getMonth() + 1}`; } catch { return ''; } };
  const best = s.pr != null ? `${Number.isInteger(s.pr) ? s.pr : s.pr.toFixed(1)}kg` : (s.prE1 != null ? `e${s.prE1}` : '—');
  return (
    <tr>
      <td style={{ padding: '9px 8px', borderBottom: `1px solid ${C.bd}`, verticalAlign: 'top' }}>
        <div style={{ color: C.tx }}>{s.title}</div>
        <div style={{ fontSize: 11, color: C.tm, marginTop: 2, lineHeight: 1.4 }}>{r.why}</div>
        <div style={{ fontSize: 11.5, color: C.ac, marginTop: 3, fontWeight: 600, lineHeight: 1.4 }}>→ {r.next}</div>
        <div style={{ fontSize: 10, color: C.td, marginTop: 3 }}>{s.count}× · last {fmt(s.lastDate)}</div>
      </td>
      <td style={{ padding: '9px 8px', borderBottom: `1px solid ${C.bd}`, whiteSpace: 'nowrap', verticalAlign: 'top' }}>
        {s.trend?.state === 'ok' ? <><Spark pts={s.trend.pts} dir={s.trend.dir} /> <span style={{ fontVariantNumeric: 'tabular-nums', color: C.tx, fontWeight: 600, marginLeft: 4 }}>e{s.trend.latest}</span></> : <span style={{ color: C.td, fontSize: 11 }}>—</span>}
      </td>
      <td style={{ padding: '9px 8px', borderBottom: `1px solid ${C.bd}`, fontVariantNumeric: 'tabular-nums', color: C.tx, fontWeight: 600, whiteSpace: 'nowrap', verticalAlign: 'top' }}>
        {best}
        {!s.ballistic && s.weeksSincePr != null && s.weeksSincePr >= 2 && (
          <span style={{ fontSize: 10, fontWeight: 400, color: s.weeksSincePr >= 6 ? C.or : C.td, marginLeft: 6 }}>· PR {s.weeksSincePr}w ago</span>
        )}
      </td>
      <td style={{ padding: '9px 8px', borderBottom: `1px solid ${C.bd}`, fontVariantNumeric: 'tabular-nums', color: C.tm, verticalAlign: 'top', whiteSpace: 'nowrap' }}>{loads.join(' · ')}</td>
      <td style={{ padding: '9px 8px', borderBottom: `1px solid ${C.bd}`, textAlign: 'right', verticalAlign: 'top' }}><Tag text={r.tag} color={r.tagColor} /></td>
    </tr>
  );
}

export default function TrainingLineageV2({ traineeId, traineeName, exercises, plans, clientWorkouts, loading, onOpenPlan }) {
  const exMap = useMemo(() => exById(exercises), [exercises]);
  const [selBlock, setSelBlock] = useState(null); // null = latest; else a block number to view a PREVIOUS block
  const a = useMemo(() => {
    if (!plans) return null;
    return analyzeAthlete(clientWorkouts || [], traineeId, plans, { blockNum, classifyPattern, repsTop, exMap, targetBlockNum: selBlock });
  }, [clientWorkouts, traineeId, plans, exMap, selBlock]);
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
      onProgress: ({ done, total }) => { setAutoPose({ running: true, done, total }); setPoseBump((n) => n + 1); },
    }).then(() => { setAutoPose((s) => ({ ...s, running: false })); setPoseBump((n) => n + 1); })
      .catch(() => setAutoPose((s) => ({ ...s, running: false })));
    return () => { stopRef.current = true; };
  }, [traineeId, clientWorkouts]);
  const vault = useMemo(() => getAthleteVault(traineeId), [traineeId, poseBump]);
  const asymTrend = useMemo(() => getAthleteAsymmetryTrend(traineeId), [traineeId, poseBump]);
  const [showThin, setShowThin] = useState(false); // expand the "logged 1-2× · too few to trend" lifts
  const [liftsOpen, setLiftsOpen] = useState(false); // HIS LIFTS list collapsed by default — click the header to expand (Ohad)
  const [barSpeedAll, setBarSpeedAll] = useState(false); // Bar-speed shows the top 3 lifts, expands to the FULL report of every tracked lift (Ohad #203)

  const shell = (children) => (
    <div style={{ ...wrap, background: C.bg, border: `1px solid ${C.bd}`, borderRadius: 2, overflow: 'hidden' }}>
      {children}
    </div>
  );

  if (loading || !a) {
    return shell(
      <div style={{ padding: 40, textAlign: 'center', color: C.tm, fontFamily: FN, fontSize: 13, letterSpacing: '0.08em' }}>READING LOGS…</div>
    );
  }

  // strip header — shared
  const Strip = (
    <div style={{ background: `linear-gradient(90deg, color-mix(in srgb, ${C.ac} 15%, ${C.bg}), ${C.bg})`, border: `1px solid ${C.bd}`, borderBottom: `2px solid ${C.ac}`, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.tx }}>
        Training Analysis · <span style={{ color: C.ac }}>{traineeName}</span>
      </span>
      <span style={{ fontSize: 10, letterSpacing: '0.1em', color: C.tm, display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {a.totalBlocks} BLOCK{a.totalBlocks === 1 ? '' : 'S'}{a.journey && a.journey.weeks > 0 ? ` · ${a.journey.weeks}W · ${a.journey.loggedSessions} SESSIONS` : ''}
        {a.blocks && a.blocks.filter((b) => b.num != null).length > 1 ? (
          <>· <select value={a.blockNumber ?? ''} onChange={(e) => setSelBlock(Number(e.target.value))}
            title="View the report for any block"
            style={{ fontFamily: FN, fontSize: 10, letterSpacing: '0.06em', background: C.bg, color: C.ac, border: `1px solid ${C.bd}`, padding: '2px 6px', cursor: 'pointer', borderRadius: 0 }}>
            {a.blocks.filter((b) => b.num != null).map((b, i) => <option key={b.num} value={b.num}>{b.name.toUpperCase()}{i === 0 ? ' · LATEST' : ''}</option>)}
          </select></>
        ) : (a.blockName ? <>· {a.blockName.toUpperCase()}</> : null)}
        {a.empty ? '' : `· ${a.adh.loggedSessions}/${a.plannedSessionCount || '?'} LOGGED`}
      </span>
    </div>
  );

  // no plans at all
  if (!a.hasPlans) {
    return shell(<>{Strip}
      <div style={{ ...bd, color: C.tm, fontSize: 13, lineHeight: 1.5 }}>No program blocks with exercises yet for this athlete.</div>
    </>);
  }

  // has plans but NO logged workouts — the honest "flying blind" nudge
  if (a.empty) {
    return shell(<>{Strip}
      <div style={card}><div style={hd}>Not enough logged training to analyze</div>
        <div style={bd}>
          <div style={{ border: `1px dashed ${C.bd}`, background: C.sf2, padding: 16, color: C.tm, fontSize: 13, lineHeight: 1.55 }}>
            <b style={{ color: C.tx }}>{traineeName} has no logged workouts in {a.blockName || 'the latest block'}.</b><br />
            You can see the prescribed program, not what was performed — there's nothing to analyze against actual training. Prompt the athlete to log sessions in the portal before writing the next block.
          </div>
          {onOpenPlan && <div style={{ marginTop: 10, fontSize: 11, color: C.td }}>Tip: the plan-vs-reality reads here light up the moment he logs a session.</div>}
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
    <div style={{ border: `1px solid ${vColor}`, borderLeft: `3px solid ${vColor}`, background: `color-mix(in srgb, ${vColor} 8%, ${C.sf})`, padding: '16px 18px', marginTop: 12 }}>
      <div style={{ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: vColor, marginBottom: 7 }}>
        If you read one thing
        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: v.confidence === 'high' ? C.gn : v.confidence === 'low' ? C.td : C.or, border: `1px solid ${v.confidence === 'high' ? C.gn : v.confidence === 'low' ? C.td : C.or}`, padding: '2px 6px', marginLeft: 8 }}>
          {v.confidence} confidence{v.logs ? ' · he logs' : ''}
        </span>
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.3, color: C.tx }}>{v.headline}</div>
      <div style={{ fontSize: 13, color: C.tm, marginTop: 8, lineHeight: 1.5 }}>{v.sub}</div>
    </div>

    {/* 1. THE GATE */}
    <div style={card}><div style={hd}>Did he actually train?<span style={hdQ}>the gate — everything below assumes real data</span></div>
      <div style={bd}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Kpi v={a.adh.sessionPct != null ? `${a.adh.sessionPct}%` : '—'} l="Sessions" s={`${a.adh.loggedSessions} of ${a.plannedSessionCount || '?'} logged`} color={a.adh.sessionPct >= 80 ? C.gn : C.or} />
          <Kpi v={a.adh.setsPct != null ? `${a.adh.setsPct}%` : '—'} l="Sets done" s={`${a.adh.setsDone} of ${a.adh.setsPrescribed}`} color={a.adh.setsPct >= 80 ? C.gn : C.or} />
          {a.skip
            ? <Kpi v={a.skip.day} l="The skips" s={`${a.skip.logged}/${a.skip.expected} — a pattern`} color={C.rd} />
            : <Kpi v="—" l="The skips" s="no clear skip pattern" color={C.tm} />}
        </div>
        {a.skip && a.skip.gap >= 2 && (
          <Read tone="bad" why="Either that day is too demanding, or it doesn't fit the athlete's week. Confirm before re-prescribing it.">
            <b>The skips aren't random — they cluster on {a.skip.day}.</b>
          </Read>
        )}
      </div>
    </div>

    {/* 2. AUTOREGULATION — split into what's working vs what to back off (Ohad) */}
    <div style={card}><div style={hd}>Training response<span style={hdQ}>autoregulation — what's working vs what to back off</span></div>
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
          if (climbing.length) pos.push({ t: `Progressing — ${nm(climbing)}`, d: 'e1RM trending up. Keep progressing: +2–3% load or +1 rep at the same effort.' });
          if (upperOk && !climbingCoversUpper) pos.push({ t: 'Upper body progressing', d: `hitting reps at ${a.region.upper.pct}% miss — room to push the load.` });
          if (ballisticUp.length) pos.push({ t: `Power progressing — ${nm(ballisticUp)}`, d: 'load is up; film a set to confirm it’s bar speed, not just heavier kg.' });
          const neg = [];
          if (regressing.length) neg.push({ t: `Regressing — ${nm(regressing)}`, d: thin ? `e1RM sliding, but only ${a.adh?.loggedSessions || 0} session${(a.adh?.loggedSessions || 0) === 1 ? '' : 's'} logged — a flag to watch, not a deload trigger yet.` : 'e1RM down across the block. Back off ~5–10% intensity, hold volume, check recovery.' });
          if (stuck.length) neg.push({ t: `Not progressing — ${nm(stuck)}`, d: 'flat 3+ sessions. Change the stimulus (variation/tempo) or a light week — not more kg.' });
          if (lowerGrind && !negNamesLower) neg.push({ t: 'Lower body regressing', d: `${a.region.lower.pct}% of sets short of target — the load’s too heavy right now and it compounds.` });
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
              <Col title="✓ Positive" color={C.gn} items={pos} empty="Nothing clearly trending up yet — needs more logged sessions to call a win." />
              <Col title="⚠ Negative" color={C.rd} items={neg} empty="Nothing flashing — loads and completion are holding across the block." />
            </div>
          );
        })()}
      </div>
    </div>

    {/* 2.4 BLOCK HISTORY — the programming arc across every block */}
    {a.blockHistory && a.blockHistory.length >= 2 && (
      <div style={card}><div style={hd}>Block history · the programming arc<span style={hdQ}>what each block emphasized — oldest → newest</span></div>
        <div style={bd}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {a.blockHistory.slice(-14).map((b, idx) => {
              const col = b.character === 'strength' ? C.ac : b.character === 'power' ? (C.or || '#f0b429') : b.character === 'hypertrophy' ? C.pu : C.gn;
              const label = b.num != null ? `#${b.num}` : (b.name || '').replace(/block/i, '').trim().slice(0, 6) || `B${idx + 1}`;
              // Low-confidence (mixed) reads — no intensity programmed, so the phase
              // is inferred from reps alone. Dim them + mark with ~ so a guess never
              // looks like a fact (Ohad: the tagging must not over-claim).
              const lowConf = b.mixed || b.confidence === 'low';
              const intel = b.avgPct != null ? ` @ ${b.avgPct}% 1RM` : (b.avgRpe != null ? ` @ RPE ${b.avgRpe}` : ' · no %/RPE logged');
              return (
                <div key={b.name || idx} title={`${b.name} · ${b.character}${lowConf ? ' (low-confidence — no intensity logged, inferred from reps)' : ` (${b.confidence || 'read'})`} — ${b.avgReps != null ? `avg ${b.avgReps} reps` : 'explosive, no rep basis'}${intel}${b.explosiveShare >= 0.4 ? ` · ${Math.round(b.explosiveShare * 100)}% explosive` : ''} · from ${b.fromMains ? 'the main lifts' : 'all exercises'} (${b.exercises} logged)`}
                  style={{ flex: '0 0 auto', border: `1px ${lowConf ? 'dashed' : 'solid'} ${col}`, padding: '5px 9px', minWidth: 50, textAlign: 'center', background: `color-mix(in srgb, ${col} ${lowConf ? 4 : 8}%, transparent)`, opacity: lowConf ? 0.72 : 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.tx, fontFamily: FN }}>{label}</div>
                  <div style={{ fontSize: 8.5, letterSpacing: '0.05em', textTransform: 'uppercase', color: col, marginTop: 2 }}>{lowConf ? '~' : ''}{b.character}</div>
                  <div style={{ fontSize: 9, color: C.td, marginTop: 1, fontVariantNumeric: 'tabular-nums' }}>{b.avgReps != null ? `${b.avgReps}r` : '⚡'}</div>
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
                  The last {run} blocks read similar on <b>rep count alone</b> — but you didn't program %1RM or RPE, so the phase is a guess, not a fact. Log intensity on the main lifts and the arc becomes reliable before you decide to change phase.
                </div>
              );
            }
            const swap = lastChar === 'hypertrophy' ? 'a strength or power/peaking' : lastChar === 'strength' ? 'a hypertrophy or a power' : lastChar === 'power' ? 'a strength or hypertrophy base' : 'a strength or power';
            return (
              <div style={{ fontSize: 12.5, color: C.or || '#f0b429', marginTop: 10, lineHeight: 1.5, fontFamily: FN }}>
                <b>{run} {lastChar} blocks in a row.</b> Same intensity + rep emphasis every block — {swap} block is the obvious contrast if you want a fresh stimulus. Your periodization call.
              </div>
            );
          })()}
          <div style={{ fontSize: 10, color: C.td, marginTop: 9, lineHeight: 1.5 }}>Character weighs <b>intensity (%1RM / RPE)</b>, rep zone, and movement intent together — not reps alone: explosive (Olympic / jumps / throws) = power; heavy low reps or high %/RPE = strength; 8–12 sub-maximal = hypertrophy; 12+ low intensity = endurance. A <b style={{ color: C.tm }}>~dashed</b> block = low confidence (no intensity logged, inferred from reps). A long run of one colour is the cue to change phase.</div>
        </div>
      </div>
    )}

    {/* 2.5 THE ARC — the cross-block journey (the actual "lineage") */}
    {a.staples.filter((s) => !s.ballistic && s.arc && s.arc.length >= 4 && s.arcGainPct != null).length > 0 && (
      <div style={card}><div style={hd}>The arc · progression on the main lifts<span style={hdQ}>e# = estimated 1-rep max (Epley) across every block — starting point vs now</span></div>
        <div style={bd}>
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
                  <span title={`${s.count} logs · ${s.spanWeeks > 0 ? `over ${s.spanWeeks} weeks` : 'this block'}`}
                    style={{ flex: '1 1 auto', minWidth: 0, fontSize: 13, color: C.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</span>
                  <Spark pts={s.arc} dir={noisy ? 'flat' : s.arcGainPct >= 3 ? 'up' : s.arcGainPct <= -3 ? 'down' : 'flat'} />
                  <span style={{ flexShrink: 0, fontSize: 12.5, color: C.tx, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }} title="estimated 1-rep max (Epley), first → now">e{s.firstE1} → e{lastE}{s.prE1 > lastE ? <span style={{ color: C.td, fontSize: 10 }}> · pk e{s.prE1}</span> : null}</span>
                  <span style={{ flexShrink: 0, minWidth: 46, textAlign: 'right', fontSize: 12, fontWeight: 700, color: gc, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{s.arcGainPct >= 0 ? '+' : ''}{s.arcGainPct}%{noisy ? <span style={{ fontSize: 9, fontWeight: 400, color: C.td }}> · reps varied</span> : null}</span>
                </div>
              );
            })}
          <div style={{ fontSize: 10, color: C.td, marginTop: 9, lineHeight: 1.5 }}>Long-term arc, not just this block — e1RM = est-1RM (Epley). Rep-scheme shifts move e1RM too; read it with the per-lift trend below.</div>
        </div>
      </div>
    )}

    {/* 3. STAPLES */}
    {a.staples.length > 0 && (
      <div style={card}>
        <div style={{ ...hd, cursor: 'pointer' }} onClick={() => setLiftsOpen((v) => !v)} role="button" tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setLiftsOpen((v) => !v); } }}
          title={liftsOpen ? 'Collapse' : 'Expand the per-lift breakdown'}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><span style={{ color: C.ac }}>{liftsOpen ? '▾' : '▸'}</span>Key lifts · what to do next</span>
          <span style={hdQ}>{liftsOpen ? 'worst first · each row tells you the move for next block' : `${a.staples.filter((s) => s.count >= 3).length} lifts · click to expand`}</span>
        </div>
        {liftsOpen && <div style={bd}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr>
                {['Lift', 'Trend', 'Best', 'Last loads', ''].map((h, i) => (
                  <th key={i} style={{ textAlign: i === 4 ? 'right' : 'left', fontSize: 9, letterSpacing: '0.11em', textTransform: 'uppercase', color: C.tm, fontWeight: 600, padding: '0 8px 7px', borderBottom: `1px solid ${C.bd}` }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {a.staples.filter((s) => s.count >= 3).map((s) => <LiftRow key={s.title} s={s} />)}
              </tbody>
            </table>
          </div>
          {a.staples.filter((s) => s.count >= 3).length === 0 && (
            <div style={{ fontSize: 12.5, color: C.tm, padding: '10px 8px', lineHeight: 1.5 }}>Nothing logged 3+ times yet — no lift has enough history to read a trend. The lifts trained so far are below.</div>
          )}
          {(() => {
            const thin = a.staples.filter((s) => s.count < 3);
            if (!thin.length) return null;
            return (
              <div style={{ marginTop: 8 }}>
                <button type="button" onClick={() => setShowThin((v) => !v)}
                  style={{ fontFamily: FN, fontSize: 11, letterSpacing: '0.04em', color: C.tm, background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: C.ac }}>{showThin ? '▾' : '▸'}</span>{thin.length} more lift{thin.length === 1 ? '' : 's'} logged 1–2× · too few to trend {showThin ? '' : '(show)'}
                </button>
                {showThin && (
                  <div style={{ overflowX: 'auto', marginTop: 4 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}><tbody>
                      {thin.map((s) => <LiftRow key={s.title} s={s} />)}
                    </tbody></table>
                  </div>
                )}
              </div>
            );
          })()}
          <div style={{ fontSize: 10, color: C.td, marginTop: 9, lineHeight: 1.5 }}>
            Lifts logged 3+ times (enough to read){a.bodyweightLifts > 0 ? ` · ${a.bodyweightLifts} more bodyweight/accessory lift${a.bodyweightLifts === 1 ? '' : 's'} (no load to trend)` : ''} · best = heaviest logged · e = est-1RM (Epley), hidden past 12 reps.
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
      // One clean line per lift — truncate long names with … (full name on hover)
      // instead of wrapping to 2-3 ragged lines, which made the cards messy (Ohad #225).
      const cell = (lift) => (
        <div key={lift.title} dir="auto" title={lift.title} style={{ fontSize: 11.5, color: C.tm, lineHeight: 1.7, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span aria-hidden style={{ flex: '0 0 auto', width: 3, height: 3, borderRadius: '50%', background: C.td }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{lift.title}</span>
        </div>
      );
      return (
        <Section title="Movement map" summary={`${trained} of 6 patterns trained`}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
            {BUCKETS.map((b) => {
              const lifts = grouped[b.key];
              const empty = lifts.length === 0;
              return (
                <div key={b.key} style={{ border: `1px solid ${empty ? C.bd : C.ac}`, background: empty ? 'transparent' : C.sf2, padding: '9px 11px', opacity: empty ? 0.45 : 1, minWidth: 0 }}>
                  <div style={{ fontFamily: FN, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: empty ? C.td : C.ac, fontWeight: 700, marginBottom: empty ? 0 : 7, display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                    <span>{b.label}</span><span style={{ color: C.tm }}>{lifts.length || ''}</span>
                  </div>
                  {empty ? <div style={{ fontSize: 10, color: C.td, fontStyle: 'italic' }}>not trained</div> : lifts.map(cell)}
                </div>
              );
            })}
          </div>
          {grouped.other.length > 0 && (
            <div style={{ fontSize: 10.5, color: C.td, marginTop: 9, lineHeight: 1.5 }}>
              <div style={{ color: C.tm, fontWeight: 600, marginBottom: 3 }}>Other ({grouped.other.length}) <span style={{ opacity: 0.7, fontWeight: 400 }}>— core / carry / full-body (outside the six patterns)</span></div>
              {grouped.other.map((l) => (
                <div key={l.title} dir="auto" title={l.title} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.6 }}>– {l.title}</div>
              ))}
            </div>
          )}
          <div style={{ fontSize: 10, color: C.td, marginTop: 9, lineHeight: 1.5 }}>Logged lifts catalogued into the library's six buckets. A dim <b style={{ color: C.tm }}>not trained</b> bucket = a movement pattern this block is skipping — the fastest gap-check before you build the next one.</div>
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
        <Section title="Exercise continuity" summary={`${cont.totalBlocks} blocks · ${cont.staticNow.length} kept ≥4`}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr>
                {['Main lift', 'In a row', 'Longest', 'Blocks'].map((h, i) => (
                  <th key={i} style={{ textAlign: i === 0 ? 'left' : 'center', fontSize: 9, letterSpacing: '0.11em', textTransform: 'uppercase', color: C.tm, fontWeight: 600, padding: '0 8px 7px', borderBottom: `1px solid ${C.bd}` }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {rows.map((l) => (
                  <tr key={l.title} style={{ borderTop: `1px solid ${C.bd}` }}>
                    <td dir="auto" style={{ padding: '7px 8px', color: C.tx, minWidth: 0, overflowWrap: 'anywhere' }}>{l.title}</td>
                    <td style={{ textAlign: 'center', padding: '7px 8px', color: l.static ? C.or : C.tm, fontWeight: l.static ? 700 : 400, fontVariantNumeric: 'tabular-nums' }}>{l.currentRun || '—'}{l.static ? ' ⚑' : ''}</td>
                    <td style={{ textAlign: 'center', padding: '7px 8px', color: C.tm, fontVariantNumeric: 'tabular-nums' }}>{l.longestRun}</td>
                    <td title={`Blocks ${l.blocks.join(', ')}`} style={{ textAlign: 'center', padding: '7px 8px', color: C.td, fontVariantNumeric: 'tabular-nums', cursor: 'help' }}>{l.count}/{cont.totalBlocks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 10, color: C.td, marginTop: 9, lineHeight: 1.5 }}>Blocks IN A ROW each main lift has run, up to the latest block. A ⚑ marks ≥4 straight — long enough to ask whether it's still being progressed (specificity) or has gone stale. Your call, not a verdict.</div>
        </Section>
      );
    })()}

    {/* STRENGTH → POWER TRANSFER — the flagship read no competitor has */}
    {a.transfer && (() => {
      const t = a.transfer;
      const tone = t.side === 'balanced' ? C.gn : t.side === 'stalled' ? C.or : C.pu;
      return (
        <Section title="Strength → power" summary={`${t.sT > 0 ? '+' : ''}${t.sT}% str · ${t.pT > 0 ? '+' : ''}${t.pT}% pow`}>
            {(() => {
              // Aggregate each side's lifts into ONE trend: index every lift's e1RM
              // arc to its own start (100%) and average across lifts. Two overlaid
              // lines = the strength↔power relationship as a graph, not just numbers.
              const norm = (lifts) => {
                const cs = lifts.map((s) => (s.arc || []).filter((v) => typeof v === 'number' && v > 0)).filter((a) => a.length >= 3 && a[0] > 0);
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
              const orange = C.or || '#f0b429';
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
                  <div style={{ fontSize: 10, color: C.tm, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 8 }}>Strength vs power · e1RM indexed to each lift&apos;s start (100%)</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
                    {/* Y-axis: bright tabular % ticks aligned to their gridlines. */}
                    <div style={{ position: 'relative', width: 38, flexShrink: 0, fontSize: 9, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
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
                          <div style={{ position: 'absolute', bottom: '120%', left: '50%', transform: 'translateX(-50%)', fontSize: 8.5, fontWeight: 700, color: s.col, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{Math.round(s.peak.v)}%</div>
                        </div>
                      ))}
                      {/* X ends: START (indexed 100%) → NOW. */}
                      <div style={{ position: 'absolute', left: 2, bottom: 2, fontSize: 8, fontWeight: 700, color: C.tm, letterSpacing: '0.1em', pointerEvents: 'none' }}>START</div>
                      <div style={{ position: 'absolute', right: 2, bottom: 2, fontSize: 8, fontWeight: 700, color: C.tm, letterSpacing: '0.1em', pointerEvents: 'none' }}>NOW</div>
                    </div>
                  </div>
                  {/* Legend: bright, with each side's NOW value in its colour. */}
                  <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 10, color: C.tm, paddingLeft: 46, flexWrap: 'wrap', alignItems: 'center' }}>
                    {sCurve && <span style={{ fontWeight: 600 }}><span style={{ color: BRAND }}>●</span> Strength ({sCurve.length}) · now <b style={{ color: BRAND }}>{Math.round(sCurve[sCurve.length - 1])}%</b></span>}
                    {pCurve && <span style={{ fontWeight: 600 }}><span style={{ color: orange }}>●</span> Power ({pCurve.length}) · now <b style={{ color: orange }}>{Math.round(pCurve[pCurve.length - 1])}%</b></span>}
                    <span style={{ marginLeft: 'auto', color: C.td }}>○ = high · dashed = 100% start</span>
                  </div>
                </div>
              );
            })()}
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'stretch', marginBottom: 10 }}>
              <div style={{ flex: '1 1 0', minWidth: 130, border: `1px solid ${C.bd}`, background: C.sf2, padding: '9px 11px' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: t.sT > 0.8 ? C.gn : t.sT < -0.8 ? C.rd : C.or, fontVariantNumeric: 'tabular-nums' }}>{t.sT > 0 ? '+' : ''}{t.sT}%</div>
                <div style={{ fontSize: 9, letterSpacing: '0.11em', textTransform: 'uppercase', color: C.tm, marginTop: 5 }}>Strength trend</div>
                <div style={{ fontSize: 10, color: C.td, marginTop: 2 }}>{t.strengthN} heavy lift{t.strengthN === 1 ? '' : 's'} · e1RM/session</div>
              </div>
              <div style={{ flex: '1 1 0', minWidth: 130, border: `1px solid ${C.bd}`, background: C.sf2, padding: '9px 11px' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: t.pT > 0.8 ? C.gn : t.pT < -0.8 ? C.rd : C.or, fontVariantNumeric: 'tabular-nums' }}>{t.pT > 0 ? '+' : ''}{t.pT}%</div>
                <div style={{ fontSize: 9, letterSpacing: '0.11em', textTransform: 'uppercase', color: C.tm, marginTop: 5 }}>Power / jump trend</div>
                <div style={{ fontSize: 10, color: C.td, marginTop: 2 }}>{t.powerN} explosive lift{t.powerN === 1 ? '' : 's'}</div>
              </div>
            </div>
            <div style={{ fontSize: 14, color: C.tx, lineHeight: 1.5 }}><b style={{ color: tone }}>{t.read}.</b></div>
            <div style={{ fontSize: 13, color: C.ac, fontWeight: 600, marginTop: 5, lineHeight: 1.5 }}>→ {t.move}</div>
            <div style={{ fontSize: 10, color: C.td, marginTop: 8, lineHeight: 1.5 }}>Trend = avg e1RM slope per side. A relationship to watch, not a law — strength↔power carry-over is individual. Film jumps to swap the load-proxy for real height + bar-speed.</div>
        </Section>
      );
    })()}

    {/* 4+5. LOAD/VOLUME + VELOCITY */}
    {/* alignItems:start so a COLLAPSED card (e.g. Load & Volume) doesn't get
        stretched to the height of an EXPANDED neighbour (Bar Speed) and show a
        big empty black box below its header (Ohad #200: "shows literally
        nothing"). Each card now keeps its own natural height. */}
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12, alignItems: 'start' }} className="lineage-grid2">
      <Section title="Load & volume" cardStyle={{ ...card, marginTop: 0 }} summary={a.acwr.state === 'ok' ? `ACWR ${a.acwr.acwr}` : 'building the baseline'}>
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
                  <span style={{ fontSize: 10, color: C.tm, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}>Session tonnage · last {a.acwr.series.length}</span>
                  <span style={{ fontSize: 10, color: C.tm, fontVariantNumeric: 'tabular-nums' }}>peak <b style={{ color: BRAND }}>{mx.toLocaleString()}</b> · latest <b style={{ color: C.tx }}>{last.toLocaleString()}</b> kg·reps</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {/* Y-axis: bright peak / mid / 0 ticks give the bars a real scale. */}
                  <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', textAlign: 'right', fontSize: 9, color: C.tx, fontWeight: 700, height: BH, fontVariantNumeric: 'tabular-nums', minWidth: 32 }}>
                    <span>{k(mx)}</span><span style={{ color: C.tm }}>{k(Math.round(mx / 2))}</span><span>0</span>
                  </div>
                  <div style={{ position: 'relative', flex: 1, height: BH }}>
                    {/* dashed gridlines behind the bars (peak / mid / floor). */}
                    {[0, 50, 100].map((p) => <div key={p} style={{ position: 'absolute', left: 0, right: 0, top: `${p}%`, borderTop: `1px dashed ${C.bd}`, pointerEvents: 'none' }} />)}
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', gap: 3 }}>
                      {a.acwr.series.map((t, i) => {
                        const isPeak = i === peakI, isLast = i === lastI;
                        return (
                          <div key={i} title={`${t.toLocaleString()} kg·reps`} style={{ position: 'relative', flex: 1, minWidth: 4, height: `${Math.max(4, (t / mx) * 100)}%`, background: BRAND, opacity: isPeak || isLast ? 1 : 0.55, boxShadow: isLast && !isPeak ? `inset 0 0 0 1px ${C.tx}` : 'none', borderRadius: '1px 1px 0 0' }}>
                            {/* value on top of every bar: peak in cyan, the rest in the same grey as the axis ticks (Ohad 08-13) */}
                            <span style={{ position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: 2, fontSize: 8.5, fontWeight: 700, color: isPeak ? BRAND : C.tm, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{k(t)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: 9.5, color: C.tm, marginTop: 6, lineHeight: 1.5 }}>Σ load×reps per logged session · avg <b style={{ color: C.tx }}>{avg.toLocaleString()}</b> kg·reps — the raw work trend. <span style={{ color: BRAND }}>▮</span> peak · outlined = latest.</div>
              </div>
            );
          })()}
          {a.acwr.state === 'ok' ? (
            <>
              <Kpi v={a.acwr.acwr} l="Load ratio (ACWR)" s="completed tonnage · watch >1.3" color={a.acwr.band === 'high' ? C.rd : a.acwr.band === 'low' ? C.or : C.gn} />
              <div style={{ marginTop: 8 }}>
                {a.acwr.band === 'high' && <Read tone="warn" why="A common heuristic, not a law (Zatsiorsky is skeptical of fixed cutoffs) — but don't add more on top of a spike."><b>Load spiked this week (ACWR {a.acwr.acwr}).</b></Read>}
                {a.acwr.band === 'low' && <Read tone="warn" why="Troughs often precede a risky rebound spike — a quiet week to watch."><b>Load dropped sharply (ACWR {a.acwr.acwr}).</b></Read>}
                {a.acwr.band === 'ok' && <Read tone="ok"><b>Load's in the steady band ({a.acwr.acwr}).</b> No spike or crash.</Read>}
              </div>
            </>
          ) : (
            <div style={{ border: `1px dashed ${C.bd}`, background: C.sf2, padding: 14, color: C.tm, fontSize: 12.5, lineHeight: 1.5 }}>
              <b style={{ color: C.tx }}>Building the load baseline.</b> Need ~4 weeks of logging for a real acute:chronic ratio — have {a.acwr.haveDays || 0} days.
            </div>
          )}
      </Section>

      <Section title="Bar speed" cardStyle={{ ...card, marginTop: 0 }} tag={<span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '2px 6px', border: `1px solid ${C.pu}`, color: C.pu, marginLeft: 8 }}>camera only</span>} summary={vault && vault.length > 0 ? `${vault.length} lift${vault.length === 1 ? '' : 's'} tracked` : 'no stored velocity'}>
          {vault && vault.length > 0 ? (
            <>
              {vault.slice(0, barSpeedAll ? vault.length : 3).map((lift) => {
                const mx = Math.max(...lift.entries.map((e) => e.lossPct || 0), 20);
                const tCol = lift.trend === 'worse' ? C.rd : lift.trend === 'better' ? C.gn : C.pu;
                const last = lift.entries[lift.entries.length - 1];
                // Load-velocity 1RM: if he filmed this lift across a real load range,
                // extrapolate a max WITHOUT a max test (the elite-VBT read no phone
                // tool does). The engine refuses thin/noisy data, so this line only
                // appears on a genuinely profilable lift — never a fabricated number.
                const prof = velocityProfile1RM(
                  lift.entries.filter((e) => e.load && e.bestMean).map((e) => ({ load: e.load, velocity: e.bestMean })),
                  mvtForLift(lift.title),
                );
                return (
                  <div key={lift.title} style={{ padding: '9px 0', borderTop: `1px solid ${C.bd}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                      <span style={{ fontSize: 12.5, color: C.tx }}>{lift.title}</span>
                      <span style={{ fontSize: 10, color: tCol, letterSpacing: '0.04em' }}>
                        {last?.lossPct != null ? `${last.lossPct}% loss` : ''}{lift.count >= 2 ? ` · ${lift.trend === 'worse' ? 'fatiguing' : lift.trend === 'better' ? 'recovering' : 'holding'}` : ''}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 30 }}>
                      {lift.entries.slice(-8).map((e, i) => (
                        <div key={i} title={`${(e.date || '').slice(0, 10)}${e.lossPct != null ? ` · ${e.lossPct}% vel-loss` : ' · vel-loss n/a'} · best ${e.bestMean} m/s`}
                          style={{ flex: 1, minWidth: 4, height: `${Math.max(12, ((e.lossPct || 0) / mx) * 100)}%`, background: tCol, opacity: 0.85, borderRadius: '1px 1px 0 0' }} />
                      ))}
                    </div>
                    {prof.state === 'ok' && prof.confidence !== 'low' && (
                      <div title={`Load-velocity profile: linear fit of phone-camera bar speed vs load across ${prof.loads} loads, extrapolated to this lift's minimal-velocity threshold (${prof.mvt} m/s). R²=${prof.r2}. The speed is uncalibrated 2D-pose m/s, so read the TREND across dates — not the exact kg — and confirm with a real top set before you prescribe loads off it. Not a tested max.`}
                        style={{ marginTop: 6, fontSize: 10.5, color: C.ac, letterSpacing: '0.02em' }}>
                        Est. 1RM ~{prof.oneRM}kg <span style={{ color: C.td }}>· {prof.loads} loads · {prof.confidence} confidence · no max test</span>
                      </div>
                    )}
                  </div>
                );
              })}
              {vault.length > 3 && (
                <button onClick={() => setBarSpeedAll((s) => !s)}
                  style={{ marginTop: 10, width: '100%', height: 30, boxSizing: 'border-box', background: 'transparent', border: `1px solid ${C.bd}`, borderRadius: 0, color: C.tm, fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer' }}>
                  {barSpeedAll ? 'Show less' : `Show all ${vault.length} lifts`}
                </button>
              )}
              <div style={{ fontSize: 10, color: C.td, marginTop: 9, lineHeight: 1.5 }}>Per-lift velocity-loss from filmed sets — rising bars = fatigue building on the bar, days before load or RPE would show it. Film a lift across a load range and it also extrapolates a max-less 1RM (load-velocity profiling — the elite-VBT read no phone tool offers).</div>
            </>
          ) : (
            <div style={{ border: `1px dashed ${C.bd}`, background: C.sf2, padding: 14, color: C.tm, fontSize: 12.5, lineHeight: 1.5 }}>
              {autoPose.running
                ? <><b style={{ color: C.ac, display: 'block', marginBottom: 5 }}>Auto-analysing clips… {autoPose.done}/{autoPose.total}</b><span>Bar speed is read from every uploaded video automatically — no logging needed. This fills in as it goes.</span></>
                : <><b style={{ color: C.tx, display: 'block', marginBottom: 5 }}>No clean bar-speed read yet.</b><span>Every uploaded clip is auto-analysed for velocity — none is filmed side-on cleanly enough to trend yet. Bar speed drops <i>before</i> load or RPE; it's the fatigue read no competitor at this price offers.</span></>}
            </div>
          )}
      </Section>

      <Section title="Symmetry · injury watch" cardStyle={{ ...card, marginTop: 0 }} tag={<span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '2px 6px', border: `1px solid ${C.pu}`, color: C.pu, marginLeft: 8 }}>camera only</span>} summary={asymTrend.joints.length > 0 ? (asymTrend.anyFlag ? `watch ${asymTrend.worst.joint.toLowerCase()}` : `holding · ${asymTrend.films} film${asymTrend.films === 1 ? '' : 's'}`) : 'no history'}>
          {asymTrend.joints.length > 0 ? (
            <>
              <div style={{ fontSize: 12.5, color: asymTrend.anyFlag ? C.rd : asymTrend.films < 2 ? C.tm : C.gn, marginBottom: 4, fontWeight: 600 }}>
                {asymTrend.anyFlag
                  ? `Watch the ${asymTrend.worst.joint.toLowerCase()} — ${asymTrend.worst.weaker.toLowerCase()} side ${asymTrend.worst.current}% behind${asymTrend.worst.drift === 'widening' ? ' and widening' : ''}.`
                  : asymTrend.films < 2
                    ? `One filmed set — nothing alarming, but film a few more to trend symmetry.`
                    : `Symmetry holding across ${asymTrend.films} filmed sets.`}
              </div>
              {asymTrend.joints.slice(0, 4).map((j) => {
                const mx = Math.max(...j.series.map((s) => s.pct), 20);
                const jc = j.flag ? C.rd : j.drift === 'widening' ? C.pu : C.gn;
                return (
                  <div key={`${j.lift}-${j.joint}`} style={{ padding: '9px 0', borderTop: `1px solid ${C.bd}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                      <span style={{ fontSize: 12.5, color: C.tx }}>{j.joint} · {j.weaker.toLowerCase()} lower <span style={{ color: C.td, fontSize: 11 }}>· {j.lift}</span></span>
                      <span style={{ fontSize: 10, color: jc, letterSpacing: '0.04em' }}>
                        {j.current}%{j.series.length >= 2 ? ` · ${j.drift === 'widening' ? `widened +${j.delta}` : j.drift === 'closing' ? `closing ${j.delta}` : 'stable'}` : ' · 1 set'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 30 }}>
                      {j.series.slice(-8).map((s, i) => (
                        <div key={i} title={`${s.date} · ${s.pct}% ${s.weaker.toLowerCase()} behind`}
                          style={{ flex: 1, minWidth: 4, height: `${Math.max(12, (s.pct / mx) * 100)}%`, background: jc, opacity: 0.85, borderRadius: '1px 1px 0 0' }} />
                      ))}
                    </div>
                  </div>
                );
              })}
              <div style={{ fontSize: 10, color: C.td, marginTop: 9, lineHeight: 1.5 }}>Per-joint L/R travel across filmed sets — a bar climbing = one limb pulling away. 2D pose is approximate; a widening flag is worth screening in person, not a diagnosis.</div>
            </>
          ) : (
            <div style={{ border: `1px dashed ${C.bd}`, background: C.sf2, padding: 14, color: C.tm, fontSize: 12.5, lineHeight: 1.5 }}>
              {autoPose.running
                ? <><b style={{ color: C.ac, display: 'block', marginBottom: 5 }}>Auto-analysing clips… {autoPose.done}/{autoPose.total}</b><span>Left-vs-right joint travel is read from every uploaded video automatically — no logging needed.</span></>
                : <><b style={{ color: C.tx, display: 'block', marginBottom: 5 }}>No symmetry read yet.</b><span>Every uploaded clip is auto-analysed for L/R joint travel — none clean enough to trend yet. A limb pulling away shows here <i>before</i> it's a tweak; nobody at this price trends it.</span></>}
            </div>
          )}
      </Section>
    </div>

    {/* 6. READINESS honest thin */}
    <div style={card}><div style={hd}>Readiness / effort log</div>
      <div style={bd}>
        <div style={{ border: `1px dashed ${C.bd}`, background: C.sf2, padding: 14, color: C.tm, fontSize: 12.5, lineHeight: 1.5 }}>
          {a.rpeCoverage >= 40
            ? <><b style={{ color: C.tx }}>RPE logged on {a.rpeCoverage}% of sets.</b> Enough to trust the effort reads above — the autoregulation signal is reliable.</>
            : <><b style={{ color: C.tx }}>Not enough effort data to model fatigue.</b> RPE on {a.rpeCoverage}% of sets — need ~10 points for a trend. Right now this is judgment + the load signals above. <span style={{ color: C.td }}>Nudge him to log effort and this unlocks a real fitness-fatigue readout.</span></>}
        </div>
      </div>
    </div>

    {/* 7. NEXT BLOCK */}
    <div style={card}><div style={hd}>The next block · your call</div>
      <div style={bd}>
        <div style={{ border: `1px solid ${C.ac}`, background: `color-mix(in srgb, ${C.ac} 7%, ${C.sf})`, padding: 14, fontSize: 14, lineHeight: 1.6, color: C.tx }}>
          {nextBlockText(a)}
        </div>
      </div>
    </div>

    <div style={{ fontSize: 11, color: C.td, margin: '18px 2px 4px', lineHeight: 1.6 }}>
      Verdict up top, gated on "did he train" · velocity from your camera is the moat · thin data is labelled, never faked · nothing here changes his program — it analyses + advises, you build.
    </div>
    <style>{`@media(max-width:720px){.lineage-grid2{grid-template-columns:1fr !important}}`}</style>
  </>);
}
