// Athlete-side mini leaderboard. Renders inside ClientPortal when the
// trainee is enrolled in at least one active challenge. Shows: rank
// + own progress + top 3 peers so the athlete sees they're competing.

import React, { useEffect, useState, useMemo } from 'react';
import { fmtPrettyDate } from './dates';
import { C, FN, FB } from './theme';
import { supabase } from './supabase';
import { GOAL_TYPES, computeProgress } from './challengePredicates';

const GOAL_UNIT = Object.fromEntries(GOAL_TYPES.map(g => [g.id, g.unit]));

export default function AthleteChallengesWidget({ clientId, clientWorkouts, bwLog, traineesById }) {
  const [challenges, setChallenges] = useState([]);
  const [participantsByChallenge, setParticipantsByChallenge] = useState({});
  const [meals, setMeals] = useState([]);

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
      // Pull meals only if a meal_log_streak challenge is live for this
      // athlete — skip the query otherwise.
      if (live.some(c => c.goal_type === 'meal_log_streak') && clientId) {
        // athlete_meals is keyed by trainee_id + created_at. RLS only lets an
        // athlete read their OWN meals, so this athlete's streak computes
        // correctly; other participants' meal rows aren't readable here (they
        // show on the coach leaderboard, which reads all meals).
        const { data: ms } = await supabase
          .from('athlete_meals')
          .select('trainee_id,created_at')
          .eq('trainee_id', clientId);
        if (!cancelled) setMeals(ms || []);
      }
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  const rows = useMemo(() => challenges.map(c => {
    const parts = participantsByChallenge[c.id] || [];
    const goalDef = GOAL_TYPES.find(g => g.id === c.goal_type);
    const sortDir = goalDef?.sortDir || 'desc';
    // Only 'custom' goals store each participant's progress (readable by the athlete).
    // Every OTHER goal type is computed from client_workouts/bw/meals — which are
    // RLS-scoped to THIS athlete, so a peer's progress computes to 0 here. Showing
    // those fabricated 0s made the athlete always rank #1 with everyone else at 0
    // (#123). So for non-custom goals we can't rank peers client-side: show only the
    // athlete's own real progress, no fake leaderboard.
    const peersKnown = c.goal_type === 'custom';
    const isMe = (r) => r.trainee_id === clientId || r.trainee_id?.startsWith(clientId + '__') || (clientId || '').startsWith(r.trainee_id + '__');
    let board = parts.map(p => ({
      trainee_id: p.trainee_id,
      progress: peersKnown ? (Number(p.progress) || 0) : computeProgress(c, p.trainee_id, clientWorkouts, bwLog, meals),
      name: traineesById?.[p.trainee_id]?.name || p.trainee_id,
    }));
    if (!peersKnown) board = board.filter(isMe); // drop uncomputable peers
    board.sort((a, b) => sortDir === 'asc' ? (a.progress - b.progress) : (b.progress - a.progress));
    const myRank = board.findIndex(isMe);
    return { challenge: c, board, myRank, peersKnown };
  }).filter(r => r.myRank >= 0), [challenges, participantsByChallenge, clientId, clientWorkouts, bwLog, meals, traineesById]);

  if (rows.length === 0) return null;

  return (
    <div style={{ marginBottom: 14 }}>
      {rows.map(({ challenge: c, board, myRank, peersKnown }) => {
        const showRank = peersKnown && board.length > 1;
        const unit = GOAL_UNIT[c.goal_type] || '';
        const top = board.slice(0, 3);
        const me = board[myRank];
        return (
          <div key={c.id} style={{
            background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`,
            borderLeft: `3px solid ${C.ac}`, padding: '10px 12px', marginBottom: 8,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, fontFamily: FN, fontSize: 9, color: C.ac, fontWeight: 700, letterSpacing: '0.12em', border: `1px solid ${C.ac}`, padding: '2px 8px' }}>🏆 CHALLENGE</span>
              <span style={{ fontWeight: 700, fontSize: 14, color: C.tx }}>{c.name}</span>
              <span style={{ flex: 1 }} />
              <span style={{ fontFamily: FN, fontSize: 10, color: C.td }}>
                until {fmtPrettyDate(c.end_at)}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontFamily: FN, fontSize: 10, color: C.tm, letterSpacing: '0.08em' }}>
                {showRank ? `YOU · RANK #${myRank + 1} of ${board.length}` : 'YOUR PROGRESS'}
              </span>
              <span style={{ fontFamily: FN, fontSize: 16, color: C.ac, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
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
                  <span style={{ fontFamily: FN, fontSize: 12, fontWeight: 700, color: i === 0 ? C.ac : C.tx, fontVariantNumeric: 'tabular-nums' }}>
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
