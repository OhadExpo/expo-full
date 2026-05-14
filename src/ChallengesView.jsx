// /coach/challenges — create + monitor group challenges with leaderboards.
//
// Goal types:
//   workouts_count  — most logged sessions in the window
//   total_volume    — Σ (reps × load) across all sets in the window
//   longest_streak  — most consecutive days with at least one logged session
//   bw_drop         — largest BW decrease from window start (negative = better)
//   custom          — coach-tracked, manual progress entry on the participants table
//
// Progress is computed CLIENT-SIDE from the existing client_workouts +
// bw_logs tables so we don't need a server cron. The participants table
// stores a snapshot `progress` value that the coach can override (for
// the custom type) and that gets written back when the coach taps
// "Recompute leaderboard."

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { C, FN, FB } from './theme';
import { supabase } from './supabase';
import { isRefined5b, RefinedHeaderStrip, Modal, Btn, Input, Select, confirmToast, toast } from './ui';
import { traineeIdsFor } from './traineeUtils';

const GOAL_TYPES = [
  { id: 'workouts_count', label: 'Most workouts',  unit: 'workouts' },
  { id: 'total_volume',   label: 'Most volume (Σ reps × load)', unit: 'kg' },
  { id: 'longest_streak', label: 'Longest streak', unit: 'days' },
  { id: 'bw_drop',        label: 'BW drop',         unit: 'kg' },
  { id: 'custom',         label: 'Custom (manual)', unit: '' },
];

const fmtDate = (d) => {
  try { return new Date(d).toLocaleDateString(); } catch { return ''; }
};

function computeProgress(challenge, traineeId, workouts, bwLog) {
  const ids = new Set(traineeIdsFor(traineeId));
  const start = new Date(challenge.start_at).getTime();
  const end = new Date(challenge.end_at).getTime();
  const inWindow = (iso) => {
    const t = new Date(iso).getTime();
    return t >= start && t <= end;
  };
  const wos = (workouts || []).filter(w => ids.has(w.clientId) && inWindow(w.date));
  switch (challenge.goal_type) {
    case 'workouts_count':
      return wos.length;
    case 'total_volume': {
      let v = 0;
      for (const w of wos) {
        for (const ex of (w.exercises || [])) {
          for (const s of (ex.sets || [])) {
            if (!s.done) continue;
            const reps = parseFloat(s.reps) || 0;
            const load = parseFloat(s.load) || 0;
            v += reps * load;
          }
        }
      }
      return Math.round(v);
    }
    case 'longest_streak': {
      const days = new Set(wos.map(w => new Date(w.date).toISOString().slice(0, 10)));
      if (days.size === 0) return 0;
      const sorted = [...days].sort();
      let best = 1, cur = 1;
      for (let i = 1; i < sorted.length; i++) {
        const prev = new Date(sorted[i - 1] + 'T00:00:00Z').getTime();
        const here = new Date(sorted[i]     + 'T00:00:00Z').getTime();
        if (here - prev === 86400000) { cur++; best = Math.max(best, cur); }
        else { cur = 1; }
      }
      return best;
    }
    case 'bw_drop': {
      const bws = (bwLog || [])
        .filter(b => ids.has(b.clientId) && inWindow(b.date))
        .map(b => ({ d: new Date(b.date).getTime(), v: parseFloat(b.bw) }))
        .filter(b => Number.isFinite(b.v))
        .sort((a, b) => a.d - b.d);
      if (bws.length < 2) return 0;
      const drop = bws[0].v - bws[bws.length - 1].v;
      return Math.round(drop * 10) / 10;
    }
    default:
      return null; // custom — coach-set
  }
}

function Leaderboard({ challenge, participants, traineesById, workouts, bwLog, onPersistProgress }) {
  const rows = useMemo(() => {
    return participants.map(p => {
      const computed = challenge.goal_type === 'custom'
        ? Number(p.progress) || 0
        : computeProgress(challenge, p.trainee_id, workouts, bwLog);
      const name = traineesById?.[p.trainee_id]?.name || p.trainee_id;
      return { trainee_id: p.trainee_id, name, progress: computed };
    }).sort((a, b) => b.progress - a.progress);
  }, [participants, challenge, workouts, bwLog, traineesById]);

  const unit = GOAL_TYPES.find(g => g.id === challenge.goal_type)?.unit || '';
  return (
    <div style={{ marginTop: 8 }}>
      {rows.length === 0 ? (
        <div style={{ fontSize: 12, color: C.td, padding: '12px 0' }}>No participants yet.</div>
      ) : rows.map((r, i) => (
        <div key={r.trainee_id} style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 10px', borderBottom: `1px solid ${C.cardBd}`,
          background: i === 0 ? 'rgba(57,189,255,0.094)' : 'transparent',
        }}>
          <div style={{
            width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: i === 0 ? C.ac : 'transparent',
            border: `1px solid ${i === 0 ? C.ac : C.cardBd}`,
            color: i === 0 ? '#fff' : C.tm,
            fontFamily: FN, fontSize: 11, fontWeight: 700,
          }}>{i + 1}</div>
          <div style={{ flex: 1, color: C.tx, fontSize: 13, fontFamily: FB }}>{r.name}</div>
          <div style={{
            fontFamily: FN, fontWeight: 700, color: i === 0 ? C.ac : C.tx,
            fontSize: 13,
          }}>{r.progress}{unit ? ` ${unit}` : ''}</div>
        </div>
      ))}
      {challenge.goal_type !== 'custom' && rows.length > 0 && onPersistProgress && (
        <button onClick={() => onPersistProgress(rows)}
          style={{
            marginTop: 8, padding: '5px 12px', background: 'transparent',
            border: `1px solid ${C.cardBd}`, color: C.tm,
            fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', cursor: 'pointer',
          }}>↻ SNAPSHOT TO DB</button>
      )}
    </div>
  );
}

export default function ChallengesView({ trainees, clientWorkouts, bwLog }) {
  const [challenges, setChallenges] = useState([]);
  const [participantsByChallenge, setParticipantsByChallenge] = useState({});
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editChallenge, setEditChallenge] = useState(null);
  const refined = isRefined5b();
  const PAD = 14;

  const traineesById = useMemo(() => {
    const out = {};
    for (const t of (trainees || [])) out[t.id] = t;
    return out;
  }, [trainees]);

  const reload = useCallback(async () => {
    setLoading(true);
    const { data: cs, error: ce } = await supabase
      .from('challenges')
      .select('*')
      .order('end_at', { ascending: false });
    if (ce) {
      if (/relation .* does not exist/i.test(ce.message)) {
        setChallenges([]); setLoading(false); return;
      }
      // Known RLS recursion bug on challenge_participants policies —
      // swallow silently and render empty state. Fix migration sits at
      // scripts/migrations/2026-05-14-challenges-rls-recursion-fix.sql
      // and needs to be applied via the Supabase SQL Editor.
      if (/infinite recursion/i.test(ce.message)) {
        setChallenges([]); setLoading(false); return;
      }
      toast(`Challenges load failed: ${ce.message}`, 'error');
      setChallenges([]); setLoading(false); return;
    }
    setChallenges(cs || []);
    if ((cs || []).length > 0) {
      const ids = cs.map(c => c.id);
      const { data: ps } = await supabase
        .from('challenge_participants')
        .select('*')
        .in('challenge_id', ids);
      const grouped = {};
      for (const p of (ps || [])) {
        if (!grouped[p.challenge_id]) grouped[p.challenge_id] = [];
        grouped[p.challenge_id].push(p);
      }
      setParticipantsByChallenge(grouped);
    } else {
      setParticipantsByChallenge({});
    }
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const persistSnapshot = async (challengeId, rows) => {
    // Write computed progress back to the participants table so athletes
    // see the same number when they view their portal widget.
    const updates = rows.map(r =>
      supabase.from('challenge_participants')
        .update({ progress: r.progress })
        .eq('challenge_id', challengeId)
        .eq('trainee_id', r.trainee_id)
    );
    await Promise.all(updates);
    toast('Leaderboard snapshot saved.', 'success', { ttl: 3000 });
    reload();
  };

  const remove = async (id) => {
    if (!(await confirmToast('Delete this challenge?', { okLabel: 'Delete', cancelLabel: 'Cancel' }))) return;
    const { error } = await supabase.from('challenges').delete().eq('id', id);
    if (error) { toast(`Delete failed: ${error.message}`, 'error'); return; }
    setChallenges(prev => prev.filter(c => c.id !== id));
  };

  return (
    <div style={{
      background: refined ? '#FFFFFF' : 'var(--c-sf)',
      border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: PAD,
    }}>
      <RefinedHeaderStrip padY={PAD} padX={PAD} marginBottom={12}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: '0.04em', textTransform: 'uppercase', color: refined ? '#FFFFFF' : C.tx }}>
            🏆 CHALLENGES ({challenges.length})
          </span>
          <button onClick={() => { setEditChallenge(null); setShowCreate(true); }}
            style={{
              background: 'transparent',
              border: `1px solid ${refined ? '#FFFFFF' : C.ac}`,
              color: refined ? '#FFFFFF' : C.ac,
              padding: '4px 12px', borderRadius: 0, fontFamily: FN, fontSize: 10,
              fontWeight: 700, letterSpacing: '0.12em', cursor: 'pointer',
            }}>+ NEW CHALLENGE</button>
        </div>
      </RefinedHeaderStrip>

      {loading ? (
        <div style={{ padding: 30, textAlign: 'center', color: C.td, fontSize: 13 }}>Loading…</div>
      ) : challenges.length === 0 ? (
        <div style={{ padding: 30, textAlign: 'center', color: C.td, fontSize: 13 }}>
          No challenges yet. Try "30-day squat streak" or "team total volume."
        </div>
      ) : challenges.map(c => {
        const parts = participantsByChallenge[c.id] || [];
        const goalLabel = GOAL_TYPES.find(g => g.id === c.goal_type)?.label || c.goal_type;
        const now = Date.now();
        const active = now >= new Date(c.start_at).getTime() && now <= new Date(c.end_at).getTime();
        return (
          <div key={c.id} style={{
            border: `1px solid ${C.cardBd}`, borderLeft: `3px solid ${active ? C.gn : C.tm}`,
            background: 'var(--c-sf)', padding: '12px 14px', marginBottom: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{
                fontFamily: FN, fontSize: 9, color: active ? C.gn : C.tm, fontWeight: 700,
                letterSpacing: '0.12em', border: `1px solid ${active ? C.gn : C.tm}`, padding: '2px 8px',
              }}>{active ? 'LIVE' : (now < new Date(c.start_at).getTime() ? 'UPCOMING' : 'ENDED')}</span>
              <span style={{ fontWeight: 700, fontSize: 14, color: C.tx, fontFamily: FB }}>{c.name}</span>
              <span style={{ flex: 1 }} />
              <span style={{ fontFamily: FN, fontSize: 10, color: C.td }}>
                {fmtDate(c.start_at)} → {fmtDate(c.end_at)}
              </span>
              <button onClick={() => { setEditChallenge(c); setShowCreate(true); }}
                style={{ background: 'none', border: 'none', color: C.td, cursor: 'pointer', fontSize: 12, padding: '0 4px' }}>✏️</button>
              <button onClick={() => remove(c.id)}
                style={{ background: 'none', border: 'none', color: C.td, cursor: 'pointer', fontSize: 14, padding: '0 4px' }}>×</button>
            </div>
            {c.description && (
              <div style={{ fontSize: 12, color: C.tm, marginBottom: 8, lineHeight: 1.4 }}>{c.description}</div>
            )}
            <div style={{ fontFamily: FN, fontSize: 10, color: C.td, letterSpacing: '0.08em', marginBottom: 4 }}>
              GOAL · {goalLabel.toUpperCase()}{c.goal_value ? ` · target ${c.goal_value}` : ''}
            </div>
            <Leaderboard
              challenge={c}
              participants={parts}
              traineesById={traineesById}
              workouts={clientWorkouts || []}
              bwLog={bwLog || []}
              onPersistProgress={rows => persistSnapshot(c.id, rows)} />
          </div>
        );
      })}

      {showCreate && (
        <ChallengeForm
          initial={editChallenge}
          trainees={trainees || []}
          existingParticipants={editChallenge ? (participantsByChallenge[editChallenge.id] || []) : []}
          onClose={() => { setShowCreate(false); setEditChallenge(null); }}
          onSaved={() => { setShowCreate(false); setEditChallenge(null); reload(); }} />
      )}
    </div>
  );
}

function ChallengeForm({ initial, trainees, existingParticipants, onClose, onSaved }) {
  const [name, setName] = useState(initial?.name || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [goalType, setGoalType] = useState(initial?.goal_type || 'workouts_count');
  const [goalValue, setGoalValue] = useState(initial?.goal_value || '');
  const [startAt, setStartAt] = useState(initial?.start_at?.slice(0, 10) || new Date().toISOString().slice(0, 10));
  const [endAt, setEndAt] = useState(initial?.end_at?.slice(0, 10) || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
  const [participantIds, setParticipantIds] = useState(new Set(existingParticipants.map(p => p.trainee_id)));
  const [saving, setSaving] = useState(false);

  const toggle = (id) => {
    setParticipantIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const save = async () => {
    if (!name.trim()) { toast('Name the challenge first.', 'warn'); return; }
    setSaving(true);
    try {
      const row = {
        coach_email: 'ohadyproductions@gmail.com',
        name: name.trim(),
        description: description.trim() || null,
        goal_type: goalType,
        goal_value: goalValue ? parseFloat(goalValue) : null,
        unit_label: GOAL_TYPES.find(g => g.id === goalType)?.unit || null,
        start_at: new Date(startAt + 'T00:00:00').toISOString(),
        end_at:   new Date(endAt   + 'T23:59:59').toISOString(),
      };
      let challengeId = initial?.id;
      if (challengeId) {
        const { error } = await supabase.from('challenges').update(row).eq('id', challengeId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('challenges').insert(row).select().single();
        if (error) throw error;
        challengeId = data.id;
      }
      // Sync participants — diff existing vs selected.
      const existing = new Set(existingParticipants.map(p => p.trainee_id));
      const toAdd = [...participantIds].filter(id => !existing.has(id));
      const toRemove = [...existing].filter(id => !participantIds.has(id));
      if (toAdd.length > 0) {
        await supabase.from('challenge_participants').insert(toAdd.map(id => ({ challenge_id: challengeId, trainee_id: id })));
      }
      if (toRemove.length > 0) {
        await supabase.from('challenge_participants').delete().eq('challenge_id', challengeId).in('trainee_id', toRemove);
      }
      toast('Challenge saved.', 'success', { ttl: 3000 });
      onSaved();
    } catch (e) {
      toast(`Save failed: ${e?.message || e}`, 'error', { ttl: 6000 });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={true} onClose={onClose} title={initial ? `Edit · ${initial.name}` : '+ New Challenge'} wide>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <Input label="Name" value={name} onChange={e => setName(e.target.value)} />
        <Select label="Goal type" value={goalType} onChange={setGoalType}
          options={GOAL_TYPES.map(g => ({ value: g.id, label: g.label }))}
          />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
        <Input label="Goal value (optional)" value={goalValue} onChange={e => setGoalValue(e.target.value)} placeholder="—" />
        <Input label="Start" type="date" value={startAt} onChange={e => setStartAt(e.target.value)} />
        <Input label="End"   type="date" value={endAt}   onChange={e => setEndAt(e.target.value)} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: '0.18em', fontWeight: 700, marginBottom: 4 }}>DESCRIPTION (OPTIONAL)</label>
        <textarea value={description} onChange={e => setDescription(e.target.value)} dir="auto" rows={2}
          style={{ width: '100%', background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: '8px 10px', color: C.tx, fontFamily: FB, fontSize: 13, outline: 'none', boxSizing: 'border-box', resize: 'vertical' }} />
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: '0.18em', fontWeight: 700, marginBottom: 6 }}>
          PARTICIPANTS ({participantIds.size})
        </label>
        <div style={{ maxHeight: 220, overflowY: 'auto', border: `1px solid ${C.cardBd}`, padding: 8 }}>
          {trainees.filter(t => t.status !== 'Archived').map(t => {
            const on = participantIds.has(t.id);
            return (
              <div key={t.id} onClick={() => toggle(t.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', cursor: 'pointer',
                  background: on ? 'rgba(57,189,255,0.094)' : 'transparent', marginBottom: 2 }}>
                <input type="checkbox" checked={on} readOnly style={{ pointerEvents: 'none' }} />
                <span style={{ fontSize: 13, color: C.tx }}>{t.name}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <Btn variant="ghost" onClick={onClose} disabled={saving}>Cancel</Btn>
        <Btn onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Btn>
      </div>
    </Modal>
  );
}
