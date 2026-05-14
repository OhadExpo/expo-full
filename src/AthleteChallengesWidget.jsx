// Athlete-side mini leaderboard. Renders inside ClientPortal when the
// trainee is enrolled in at least one active challenge. Shows: rank
// + own progress + top 3 peers so the athlete sees they're competing.

import React, { useEffect, useState, useMemo } from 'react';
import { C, FN, FB } from './theme';
import { supabase } from './supabase';
import { traineeIdsFor } from './traineeUtils';

const GOAL_UNIT = {
  workouts_count: 'workouts',
  total_volume:   'kg',
  longest_streak: 'days',
  bw_drop:        'kg',
  custom:         '',
};

function computeProgress(challenge, traineeId, workouts, bwLog) {
  // Mirror of the coach-side computer — kept in sync intentionally.
  // Eventually this should be a SECURITY DEFINER function but for now
  // both sides read client_workouts directly under RLS.
  const ids = new Set(traineeIdsFor(traineeId));
  const start = new Date(challenge.start_at).getTime();
  const end = new Date(challenge.end_at).getTime();
  const inW = (iso) => { const t = new Date(iso).getTime(); return t >= start && t <= end; };
  const wos = (workouts || []).filter(w => ids.has(w.clientId) && inW(w.date));
  if (challenge.goal_type === 'workouts_count') return wos.length;
  if (challenge.goal_type === 'total_volume') {
    let v = 0;
    for (const w of wos) for (const ex of (w.exercises || [])) for (const s of (ex.sets || [])) {
      if (!s.done) continue;
      v += (parseFloat(s.reps) || 0) * (parseFloat(s.load) || 0);
    }
    return Math.round(v);
  }
  if (challenge.goal_type === 'longest_streak') {
    const days = new Set(wos.map(w => new Date(w.date).toISOString().slice(0, 10)));
    if (days.size === 0) return 0;
    const sorted = [...days].sort();
    let best = 1, cur = 1;
    for (let i = 1; i < sorted.length; i++) {
      const a = new Date(sorted[i - 1] + 'T00:00:00Z').getTime();
      const b = new Date(sorted[i]     + 'T00:00:00Z').getTime();
      if (b - a === 86400000) { cur++; best = Math.max(best, cur); } else cur = 1;
    }
    return best;
  }
  if (challenge.goal_type === 'bw_drop') {
    const bws = (bwLog || [])
      .filter(b => ids.has(b.clientId) && inW(b.date))
      .map(b => ({ d: new Date(b.date).getTime(), v: parseFloat(b.bw) }))
      .filter(b => Number.isFinite(b.v))
      .sort((a, b) => a.d - b.d);
    if (bws.length < 2) return 0;
    return Math.round((bws[0].v - bws[bws.length - 1].v) * 10) / 10;
  }
  return null;
}

export default function AthleteChallengesWidget({ clientId, clientWorkouts, bwLog, traineesById }) {
  const [challenges, setChallenges] = useState([]);
  const [participantsByChallenge, setParticipantsByChallenge] = useState({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: cs, error } = await supabase
        .from('challenges')
        .select('*')
        .gte('end_at', new Date().toISOString())
        .order('end_at', { ascending: true });
      if (cancelled || error) return;
      const live = cs || [];
      setChallenges(live);
      if (live.length === 0) return;
      const ids = live.map(c => c.id);
      const { data: ps } = await supabase
        .from('challenge_participants')
        .select('*')
        .in('challenge_id', ids);
      if (cancelled) return;
      const grouped = {};
      for (const p of (ps || [])) {
        if (!grouped[p.challenge_id]) grouped[p.challenge_id] = [];
        grouped[p.challenge_id].push(p);
      }
      setParticipantsByChallenge(grouped);
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  const rows = useMemo(() => challenges.map(c => {
    const parts = participantsByChallenge[c.id] || [];
    const board = parts.map(p => ({
      trainee_id: p.trainee_id,
      progress: c.goal_type === 'custom'
        ? (Number(p.progress) || 0)
        : computeProgress(c, p.trainee_id, clientWorkouts, bwLog),
      name: traineesById?.[p.trainee_id]?.name || p.trainee_id,
    })).sort((a, b) => b.progress - a.progress);
    const myRank = board.findIndex(r =>
      r.trainee_id === clientId
      || r.trainee_id?.startsWith(clientId + '__')
      || (clientId || '').startsWith(r.trainee_id + '__')
    );
    return { challenge: c, board, myRank };
  }).filter(r => r.myRank >= 0), [challenges, participantsByChallenge, clientId, clientWorkouts, bwLog, traineesById]);

  if (rows.length === 0) return null;

  return (
    <div style={{ marginBottom: 14 }}>
      {rows.map(({ challenge: c, board, myRank }) => {
        const unit = GOAL_UNIT[c.goal_type] || '';
        const top = board.slice(0, 3);
        const me = board[myRank];
        return (
          <div key={c.id} style={{
            background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`,
            borderLeft: `3px solid ${C.ac}`, padding: '10px 12px', marginBottom: 8,
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: FN, fontSize: 9, color: C.ac, fontWeight: 700, letterSpacing: '0.12em', border: `1px solid ${C.ac}`, padding: '2px 8px' }}>🏆 CHALLENGE</span>
              <span style={{ fontWeight: 700, fontSize: 14, color: C.tx }}>{c.name}</span>
              <span style={{ flex: 1 }} />
              <span style={{ fontFamily: FN, fontSize: 10, color: C.td }}>
                until {new Date(c.end_at).toLocaleDateString()}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontFamily: FN, fontSize: 10, color: C.tm, letterSpacing: '0.08em' }}>
                YOU · RANK #{myRank + 1} of {board.length}
              </span>
              <span style={{ fontFamily: FN, fontSize: 16, color: C.ac, fontWeight: 700 }}>
                {me?.progress ?? 0}{unit ? ` ${unit}` : ''}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {top.map((r, i) => (
                <div key={r.trainee_id} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: r.trainee_id === me?.trainee_id ? 'rgba(57,189,255,0.094)' : 'transparent',
                  padding: '4px 6px',
                }}>
                  <span style={{ fontFamily: FN, fontSize: 10, color: i === 0 ? C.ac : C.tm, width: 16, fontWeight: 700 }}>{i + 1}.</span>
                  <span style={{ flex: 1, color: C.tx, fontSize: 12, fontFamily: FB }}>{r.name}</span>
                  <span style={{ fontFamily: FN, fontSize: 12, fontWeight: 700, color: i === 0 ? C.ac : C.tx }}>
                    {r.progress}{unit ? ` ${unit}` : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
