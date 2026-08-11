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
import React, { useMemo, useState } from 'react';
import { C, FN } from './theme';
import { analyzeAthlete } from './lineageAnalysis';
import { getAthleteVault, getAthleteAsymmetryTrend } from './poseMetricsStore';
import { blockNum, classifyPattern, repsTop, exById } from './PlansView';

const wrap = { maxWidth: 980, margin: '0 auto', fontFamily: FN };
const card = { border: `1px solid ${C.bd}`, background: C.sf, marginTop: 12 };
const hd = { background: C.sf2, borderBottom: `1px solid ${C.bd}`, padding: '8px 14px', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.tx, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 };
const hdQ = { color: C.tm, fontWeight: 400, letterSpacing: 0, textTransform: 'none', fontSize: 11 };
const bd = { padding: '13px 14px' };

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
    <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 2, height: 20, verticalAlign: 'middle' }}>
      {pts.map((p, i) => (
        <i key={i} style={{ width: 5, height: `${Math.max(15, ((p - min) / rng) * 100)}%`, background: col, borderRadius: 1, display: 'inline-block' }} />
      ))}
    </span>
  );
}

function Tag({ text, color }) {
  return <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.03em', padding: '2px 7px', border: `1px solid ${color}`, color, whiteSpace: 'nowrap' }}>{text}</span>;
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
    if (s.trend?.dir === 'up') return { tag: 'GOING UP', tagColor: C.gn, why: 'load creeping up on an explosive lift', next: 'keep adding — but film a set; height + bar-speed is the real read, not kg' };
    return { tag: 'EXPLOSIVE', tagColor: C.pu, why: 'jumps progress on speed + height, not load', next: 'film a set for velocity — don\'t chase kg here' };
  }
  if (s.stale?.state === 'ok' && s.stale.stale) {
    if (s.stale.mode === 'hard') return { tag: 'STUCK · HARD', tagColor: C.or, why: 'flat weight + effort climbing = hidden fatigue, not a real ceiling', next: 'one lighter week (~50% volume) then re-test, or swap the variation — not more kg' };
    if (s.stale.mode === 'easy') return { tag: 'STUCK · EASY', tagColor: C.ac, why: 'flat but moving easy — he\'s under-stimulated', next: '+2.5–5kg or add a set' };
    return { tag: 'STUCK', tagColor: C.or, why: 'weight hasn\'t moved in 3 sessions', next: noPr ? `no PR in ${wks} weeks — rotate the variation` : 'push the load or change the stimulus' };
  }
  if (s.trend?.state === 'ok') {
    if (s.trend.repNoisy) return { tag: 'REPS VARIED', tagColor: C.tm, why: 'rep scheme shifted across the block — e1RM can\'t tell a strength change from the rep change', next: 'read it off load-at-a-fixed-rep, or hold a rep target for 3 sessions for a clean trend' };
    if (s.trend.dir === 'up') return { tag: 'GOING UP', tagColor: C.gn, why: 'climbing', next: '+2–3% load or +1 rep at the same effort' };
    if (s.trend.dir === 'down') return { tag: 'SLIPPING', tagColor: C.rd, why: 'going backwards', next: 'back off ~5–10% intensity, hold volume, check his recovery' };
  }
  return { tag: 'HOLDING', tagColor: C.tm, why: 'holding steady', next: noPr ? `no PR in ${wks} weeks — time to change it up` : 'maintain, or nudge the load' };
}

function nextBlockText(a) {
  const v = a.verdict;
  const nextNum = a.blockNumber != null ? ` (#${a.blockNumber + 1})` : '';
  if (v.tone === 'warn') {
    const region = a.region?.lower?.pct >= a.region?.upper?.pct ? 'lower' : 'upper';
    const hardStale = a.staples.find((s) => s.stale?.stale && s.stale.mode === 'hard');
    const climbing = a.staples.filter((s) => s.trend?.dir === 'up').map((s) => s.title);
    return (
      <>
        <b>Deload{nextNum}: cut {region}-body volume ~50%, hold intensity.</b> He's accumulating fatigue faster than he's clearing it.
        {hardStale && <> When you rebuild: <b>{hardStale.title} is stale at a hard effort</b> — change the stimulus (tempo / pause / variation), not just the number.</>}
        {climbing.length > 0 && <> Keep pushing <b>{climbing.slice(0, 2).join(' + ')}</b> — still has room.</>}
        {a.skip && <> And fix the <b>{a.skip.day} skip</b> ({a.skip.logged}/{a.skip.expected} logged) — reprogramming it as-is won't help.</>}
      </>
    );
  }
  if (v.tone === 'info') {
    return <><b>Get him logging first.</b> Only {a.adh.sessionPct}% of sessions are logged — every load signal here is unreliable until he's training and recording it. This is a check-in, not a programming change.</>;
  }
  const climbing = a.staples.filter((s) => s.trend?.dir === 'up').map((s) => s.title);
  const stuck = a.staples.filter((s) => s.stale?.stale || s.trend?.dir === 'down').map((s) => s.title);
  return (
    <>
      <b>Progress the block{nextNum}.</b> He's holding or climbing.
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
          <div style={{ fontSize: 10, fontWeight: 400, color: s.weeksSincePr >= 6 ? C.or : C.td, marginTop: 2 }}>PR {s.weeksSincePr}w ago</div>
        )}
      </td>
      <td style={{ padding: '9px 8px', borderBottom: `1px solid ${C.bd}`, fontVariantNumeric: 'tabular-nums', color: C.tm, verticalAlign: 'top' }}>{loads.join(' · ')}</td>
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
  const vault = useMemo(() => getAthleteVault(traineeId), [traineeId]);
  const asymTrend = useMemo(() => getAthleteAsymmetryTrend(traineeId), [traineeId]);
  const [showThin, setShowThin] = useState(false); // expand the "logged 1-2× · too few to trend" lifts

  const shell = (children) => (
    <div style={{ ...wrap, background: C.bg, border: `1px solid ${C.bd}`, borderRadius: 2, overflow: 'hidden' }}>
      {children}
    </div>
  );

  if (loading || !a) {
    return shell(
      <div style={{ padding: 40, textAlign: 'center', color: C.tm, fontFamily: FN, fontSize: 13, letterSpacing: '0.08em' }}>READING HIS LOGS…</div>
    );
  }

  // strip header — shared
  const Strip = (
    <div style={{ background: `linear-gradient(90deg, color-mix(in srgb, ${C.ac} 15%, ${C.bg}), ${C.bg})`, border: `1px solid ${C.bd}`, borderBottom: `2px solid ${C.ac}`, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.tx }}>
        Training Lineage · <span style={{ color: C.ac }}>{traineeName}</span>
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
      <div style={card}><div style={hd}>You're flying blind on this one</div>
        <div style={bd}>
          <div style={{ border: `1px dashed ${C.bd}`, background: C.sf2, padding: 16, color: C.tm, fontSize: 13, lineHeight: 1.55 }}>
            <b style={{ color: C.tx }}>{traineeName} has no logged workouts in {a.blockName || 'the latest block'}.</b><br />
            You can see what you <i>wrote</i>, not what he <i>did</i> — so there's nothing to analyse against reality. Get him logging in the portal, or ask him directly before you write the next block.
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
        <span style={{ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: v.confidence === 'high' ? C.gn : v.confidence === 'low' ? C.td : C.or, border: `1px solid ${v.confidence === 'high' ? C.gn : v.confidence === 'low' ? C.td : C.or}`, padding: '1px 6px', marginLeft: 8 }}>
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
          <Read tone="bad" why="Either that day's too much, or it never fits his week. Ask him — don't just re-prescribe it.">
            <b>He's not skipping randomly — it clusters on {a.skip.day}.</b>
          </Read>
        )}
      </div>
    </div>

    {/* 2. AUTOREGULATION */}
    <div style={card}><div style={hd}>How's he responding?<span style={hdQ}>autoregulation — is the load right?</span></div>
      <div style={bd}>
        {a.region?.lower?.pct != null && a.region.lower.pct >= 25 && (
          <Read tone="warn" why="Above ~25% the load's too heavy for now; it compounds.">
            <b>Grinding the lower body — {a.region.lower.pct}% of sets short of target.</b>
          </Read>
        )}
        {a.staples.some((s) => s.trend?.dir === 'down') && (
          <Read tone="bad" why="Load or fatigue is winning — back it off before it becomes an injury.">
            <b>{a.staples.filter((s) => s.trend?.dir === 'down').map((s) => s.title).slice(0, 2).join(', ')} regressing.</b> e1RM trending down across the block.
          </Read>
        )}
        {upperOk && (
          <Read tone="ok"><b>Upper body's dialed.</b> Hitting reps at {a.region.upper.pct}% miss — room to keep progressing.</Read>
        )}
        {!(a.region?.lower?.pct >= 25) && !a.staples.some((s) => s.trend?.dir === 'down') && !upperOk && (
          <Read tone="info"><b>Nothing flashing.</b> Loads and completion are holding across the block.</Read>
        )}
      </div>
    </div>

    {/* 2.4 BLOCK HISTORY — the programming arc across every block */}
    {a.blockHistory && a.blockHistory.length >= 2 && (
      <div style={card}><div style={hd}>Block history · the programming arc<span style={hdQ}>what each block emphasized — oldest → newest</span></div>
        <div style={bd}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {a.blockHistory.slice(-14).map((b, idx) => {
              const col = b.character === 'strength' ? C.ac : b.character === 'hypertrophy' ? C.pu : C.gn;
              const label = b.num != null ? `#${b.num}` : (b.name || '').replace(/block/i, '').trim().slice(0, 6) || `B${idx + 1}`;
              return (
                <div key={b.name || idx} title={`${b.name} · ${b.character} — avg ${b.avgReps} prescribed reps on ${b.fromMains ? 'the main lifts' : 'all exercises'} (${b.exercises} logged)`}
                  style={{ flex: '0 0 auto', border: `1px solid ${col}`, padding: '5px 9px', minWidth: 50, textAlign: 'center', background: `color-mix(in srgb, ${col} 8%, transparent)` }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.tx, fontFamily: FN }}>{label}</div>
                  <div style={{ fontSize: 8.5, letterSpacing: '0.05em', textTransform: 'uppercase', color: col, marginTop: 2 }}>{b.character}</div>
                  <div style={{ fontSize: 9, color: C.td, marginTop: 1, fontVariantNumeric: 'tabular-nums' }}>{b.avgReps}r</div>
                </div>
              );
            })}
          </div>
          {(() => {
            const bh = a.blockHistory;
            const lastChar = bh[bh.length - 1].character;
            let run = 0; for (let k = bh.length - 1; k >= 0; k--) { if (bh[k].character === lastChar) run++; else break; }
            if (run < 4) return null;
            // Only fire this prescriptive cue when the run's character reads are
            // anchored on real main lifts (not an all-rows fallback) — otherwise
            // the "monotony" is a soft signal, not a periodization fact.
            const runBlocks = bh.slice(bh.length - run);
            if (runBlocks.filter((b) => b.fromMains).length < Math.ceil(run * 0.6)) return null;
            const swap = lastChar === 'hypertrophy' ? 'a strength or power/peaking' : lastChar === 'strength' ? 'a hypertrophy or a deload' : 'a strength';
            return (
              <div style={{ fontSize: 12.5, color: C.or || '#f0b429', marginTop: 10, lineHeight: 1.5, fontFamily: FN }}>
                <b>{run} {lastChar} blocks in a row.</b> Same rep emphasis on his main lifts every block — {swap} block is the obvious contrast if you want a fresh stimulus. Your periodization call.
              </div>
            );
          })()}
          <div style={{ fontSize: 10, color: C.td, marginTop: 9, lineHeight: 1.5 }}>From what you PROGRAMMED each block (avg prescribed reps): under 6 = strength, 6–12 = hypertrophy, 12+ = endurance. The arc shows your periodization — a long run of one colour is the cue to change phase.</div>
        </div>
      </div>
    )}

    {/* 2.5 THE ARC — the cross-block journey (the actual "lineage") */}
    {a.staples.filter((s) => !s.ballistic && s.arc && s.arc.length >= 4 && s.arcGainPct != null).length > 0 && (
      <div style={card}><div style={hd}>The arc · his journey on the big lifts<span style={hdQ}>e1RM across every block he's logged — where he started vs now</span></div>
        <div style={bd}>
          {a.staples.filter((s) => !s.ballistic && s.arc && s.arc.length >= 4 && s.arcGainPct != null)
            .sort((x, y) => y.count - x.count).slice(0, 4).map((s) => {
              // e1RM conflates load and reps, so a rep-scheme shift alone moves the
              // arc %. When the per-lift trend flagged reps as noisy, mute the number
              // and flatten the spark — never contradict the trend row on the same lift.
              const noisy = s.trend && s.trend.repNoisy;
              const gc = noisy ? C.td : s.arcGainPct >= 3 ? C.gn : s.arcGainPct <= -3 ? C.rd : C.tm;
              return (
                <div key={s.title} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: `1px solid ${C.bd}` }}>
                  <div style={{ flex: '1 1 40%', minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: C.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</div>
                    <div style={{ fontSize: 10, color: C.td, marginTop: 2 }}>{s.count} logs · {s.spanWeeks > 0 ? `over ${s.spanWeeks} weeks` : 'this block'}</div>
                  </div>
                  <Spark pts={s.arc} dir={noisy ? 'flat' : s.arcGainPct >= 3 ? 'up' : s.arcGainPct <= -3 ? 'down' : 'flat'} />
                  <div style={{ flex: '0 0 auto', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    <div style={{ fontSize: 12.5, color: C.tx }}>e{s.firstE1} → e{Math.round(s.arc[s.arc.length - 1])}{s.prE1 > Math.round(s.arc[s.arc.length - 1]) ? <span style={{ color: C.td, fontSize: 10 }}> · pk e{s.prE1}</span> : null}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: gc }}>{s.arcGainPct >= 0 ? '+' : ''}{s.arcGainPct}%{noisy ? <span style={{ fontSize: 9, fontWeight: 400, color: C.td }}> · reps varied</span> : null}</div>
                  </div>
                </div>
              );
            })}
          <div style={{ fontSize: 10, color: C.td, marginTop: 9, lineHeight: 1.5 }}>His long arc, not just this block — e1RM = est-1RM (Epley). Rep-scheme shifts move e1RM too; read it with the per-lift trend below.</div>
        </div>
      </div>
    )}

    {/* 3. STAPLES */}
    {a.staples.length > 0 && (
      <div style={card}><div style={hd}>His lifts · what to do next<span style={hdQ}>worst first · each row tells you the move for next block</span></div>
        <div style={bd}>
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
            <div style={{ fontSize: 12.5, color: C.tm, padding: '10px 8px', lineHeight: 1.5 }}>Nothing logged 3+ times yet — no lift has enough history to read a trend. The lifts he's touched are below.</div>
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
            Lifts he's logged 3+ times (enough to read){a.bodyweightLifts > 0 ? ` · ${a.bodyweightLifts} more bodyweight/accessory lift${a.bodyweightLifts === 1 ? '' : 's'} (no load to trend)` : ''} · best = heaviest logged · e = est-1RM (Epley), hidden past 12 reps.
          </div>
        </div>
      </div>
    )}

    {/* STRENGTH → POWER TRANSFER — the flagship read no competitor has */}
    {a.transfer && (() => {
      const t = a.transfer;
      const tone = t.side === 'balanced' ? C.gn : t.side === 'stalled' ? C.or : C.pu;
      return (
        <div style={card}><div style={hd}>Strength → power<span style={hdQ}>is his base converting to explosive output?</span></div>
          <div style={bd}>
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
          </div>
        </div>
      );
    })()}

    {/* 4+5. LOAD/VOLUME + VELOCITY */}
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }} className="lineage-grid2">
      <div style={{ ...card, marginTop: 0 }}><div style={hd}>Load &amp; volume</div>
        <div style={bd}>
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
        </div>
      </div>

      <div style={{ ...card, marginTop: 0 }}><div style={hd}>Bar speed<span style={{ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '1px 6px', border: `1px solid ${C.pu}`, color: C.pu }}>camera only</span></div>
        <div style={bd}>
          {vault && vault.length > 0 ? (
            <>
              {vault.slice(0, 3).map((lift) => {
                const mx = Math.max(...lift.entries.map((e) => e.lossPct || 0), 20);
                const tCol = lift.trend === 'worse' ? C.rd : lift.trend === 'better' ? C.gn : C.pu;
                const last = lift.entries[lift.entries.length - 1];
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
                        <div key={i} title={`${(e.date || '').slice(0, 10)} · ${e.lossPct}% vel-loss · best ${e.bestMean} m/s`}
                          style={{ flex: 1, minWidth: 4, height: `${Math.max(12, ((e.lossPct || 0) / mx) * 100)}%`, background: tCol, opacity: 0.85, borderRadius: '1px 1px 0 0' }} />
                      ))}
                    </div>
                  </div>
                );
              })}
              <div style={{ fontSize: 10, color: C.td, marginTop: 9, lineHeight: 1.5 }}>Per-lift velocity-loss from filmed sets — rising bars = fatigue building on the bar, days before load or RPE would show it.</div>
            </>
          ) : (
            <div style={{ border: `1px dashed ${C.bd}`, background: C.sf2, padding: 14, color: C.tm, fontSize: 12.5, lineHeight: 1.5 }}>
              <b style={{ color: C.tx }}>No stored velocity yet.</b> Bar speed is the one fatigue signal that drops <i>before</i> load or RPE — and no competitor at this price can read it. Film a set in the camera tools and hit <span style={{ color: C.ac }}>Save bar speed to trend</span> — this becomes a per-lift fatigue line that's a real moat.
            </div>
          )}
        </div>
      </div>

      <div style={{ ...card, marginTop: 0 }}><div style={hd}>Symmetry · injury watch<span style={{ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '1px 6px', border: `1px solid ${C.pu}`, color: C.pu }}>camera only</span></div>
        <div style={bd}>
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
              <b style={{ color: C.tx }}>No symmetry history yet.</b> Every filmed set logs left-vs-right joint travel. Once a few are saved, this becomes a per-joint drift line — a limb pulling away shows here <i>before</i> it's a tweak. Nobody at this price trends it.
            </div>
          )}
        </div>
      </div>
    </div>

    {/* 6. READINESS honest thin */}
    <div style={card}><div style={hd}>Readiness / effort log</div>
      <div style={bd}>
        <div style={{ border: `1px dashed ${C.bd}`, background: C.sf2, padding: 14, color: C.tm, fontSize: 12.5, lineHeight: 1.5 }}>
          {a.rpeCoverage >= 40
            ? <><b style={{ color: C.tx }}>RPE logged on {a.rpeCoverage}% of sets.</b> Enough to trust the effort reads above — the autoregulation signal is real for him.</>
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
