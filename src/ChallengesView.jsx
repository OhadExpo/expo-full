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
import { fmtPrettyDate } from './dates';
import { C, FN, FB } from './theme';
import { supabase } from './supabase';
import { isRefined5b, RefinedHeaderStrip, Modal, Btn, Input, Select, confirmToast, toast, stripBtnBase } from './ui';
import { GOAL_TYPES, computeProgress, TEMPLATES } from './challengePredicates';
import { useT as useAppT } from './i18n';

const fmtDate = (d) => {
  try { return fmtPrettyDate(d); } catch { return ''; }
};

function Leaderboard({ challenge, participants, traineesById, workouts, bwLog, meals, onPersistProgress }) {
  const goalDef = GOAL_TYPES.find(g => g.id === challenge.goal_type);
  const sortDir = goalDef?.sortDir || 'desc';
  const rows = useMemo(() => {
    return participants.map(p => {
      const computed = challenge.goal_type === 'custom'
        ? Number(p.progress) || 0
        : computeProgress(challenge, p.trainee_id, workouts, bwLog, meals);
      const name = traineesById?.[p.trainee_id]?.name || p.trainee_id;
      return { trainee_id: p.trainee_id, name, progress: computed };
    }).sort((a, b) => sortDir === 'asc' ? (a.progress - b.progress) : (b.progress - a.progress));
  }, [participants, challenge, workouts, bwLog, meals, traineesById, sortDir]);

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
            fontSize: 13, fontVariantNumeric: 'tabular-nums',
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
  const tt = useAppT();
  const [challenges, setChallenges] = useState([]);
  const [participantsByChallenge, setParticipantsByChallenge] = useState({});
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editChallenge, setEditChallenge] = useState(null);
  const [meals, setMeals] = useState([]); // pulled lazily only when a meal_log_streak exists
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

  // Lazy-load athlete_meals only when at least one challenge needs it.
  useEffect(() => {
    const needsMeals = challenges.some(c => c.goal_type === 'meal_log_streak');
    if (!needsMeals) { setMeals([]); return; }
    let cancelled = false;
    (async () => {
      // We only need meals within any challenge's window — query the
      // earliest start, latest end across the relevant challenges.
      const windows = challenges.filter(c => c.goal_type === 'meal_log_streak');
      const t = (v) => { const ms = new Date(v).getTime(); return Number.isFinite(ms) ? ms : null; };
      const starts = windows.map(c => t(c.start_at)).filter(v => v !== null);
      const ends   = windows.map(c => t(c.end_at)).filter(v => v !== null);
      if (!starts.length || !ends.length) { if (!cancelled) setMeals([]); return; }
      const minStart = Math.min(...starts);
      const maxEnd   = Math.max(...ends);
      // athlete_meals has no meal_date col — it's keyed by created_at (a full
      // timestamp). Filter by a created_at range: [start-day 00:00, end-day+1
      // 00:00) so the whole end day is included. The predicate scopes each row
      // to a participant by trainee_id.
      // LOCAL calendar days on both ends. Deriving the day with toISOString()
      // and then appending a timezone-less 'T00:00:00' mixes a UTC-derived date
      // with a locally-interpreted timestamp: in Israel (UTC+2/+3) local
      // midnight is the PREVIOUS day in UTC, so the window opened a day early
      // and could count a meal logged before the challenge even started.
      const localDay = (ms) => { const d = new Date(ms); const p3 = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p3(d.getMonth() + 1)}-${p3(d.getDate())}`; };
      const startIso = localDay(minStart) + 'T00:00:00';
      const endNext  = new Date(maxEnd); endNext.setDate(endNext.getDate() + 1);
      const endIso   = localDay(endNext.getTime()) + 'T00:00:00';
      const { data } = await supabase
        .from('athlete_meals')
        .select('trainee_id,created_at')
        .gte('created_at', startIso)
        .lt('created_at', endIso);
      if (!cancelled) setMeals(data || []);
    })();
    return () => { cancelled = true; };
  }, [challenges]);

  const persistSnapshot = async (challengeId, rows) => {
    // Write computed progress back to the participants table so athletes
    // see the same number when they view their portal widget.
    const updates = rows.map(r =>
      supabase.from('challenge_participants')
        .update({ progress: r.progress })
        .eq('challenge_id', challengeId)
        .eq('trainee_id', r.trainee_id)
    );
    const results = await Promise.all(updates);
    const failed = results.filter(r => r?.error).length;
    if (failed) { toast(`Snapshot partly failed — ${failed} row(s) not saved.`, 'error', { ttl: 6000 }); }
    else { toast('Leaderboard snapshot saved.', 'success', { ttl: 3000 }); }
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
      background: 'var(--c-sf)',
      border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: PAD,
    }}>
      <RefinedHeaderStrip padY={PAD} padX={PAD} marginBottom={12}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: '0.04em', textTransform: 'uppercase', color: refined ? '#FFFFFF' : C.tx }}>
            {tt('Challenges')} ({challenges.length})
          </span>
          <button onClick={() => { setEditChallenge(null); setShowCreate(true); }}
            style={{ ...stripBtnBase, border: `1px solid ${refined ? '#FFFFFF' : C.ac}`, color: refined ? '#FFFFFF' : C.ac }}>{tt('+ NEW CHALLENGE')}</button>
        </div>
      </RefinedHeaderStrip>

      {loading ? (
        <div style={{ padding: 30, textAlign: 'center', color: C.td, fontSize: 13 }}>Loading…</div>
      ) : challenges.length === 0 ? (
        <div style={{ padding: 30, textAlign: 'center', color: C.td, fontSize: 13 }}>
          {tt('No challenges yet')}
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
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
                fontFamily: FN, fontSize: 9, color: active ? C.gn : C.tm, fontWeight: 700,
                letterSpacing: '0.12em', border: `1px solid ${active ? C.gn : C.tm}`, padding: '3px 8px',
                width: 82, boxSizing: 'border-box', flexShrink: 0,
              }}>{active ? 'LIVE' : (now < new Date(c.start_at).getTime() ? 'UPCOMING' : 'ENDED')}</span>
              <span style={{ fontWeight: 700, fontSize: 14, color: C.tx, fontFamily: FB }}>{c.name}</span>
              <span style={{ flex: 1 }} />
              <span style={{ fontFamily: FN, fontSize: 10, color: C.td }}>
                {fmtDate(c.start_at)} → {fmtDate(c.end_at)}
              </span>
              <button onClick={() => { setEditChallenge(c); setShowCreate(true); }}
                style={{ background: 'none', border: 'none', color: C.td, cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: '0 4px', display: 'inline-flex', alignItems: 'center' }}>✏️</button>
              <button onClick={() => remove(c.id)}
                style={{ background: 'none', border: 'none', color: C.td, cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: '0 4px', display: 'inline-flex', alignItems: 'center' }}>×</button>
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
              meals={meals}
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
  const tt = useAppT();
  // For new challenges, show the template picker first. Editing skips
  // straight to the form (we already know what the challenge is).
  const [stage, setStage] = useState(initial ? 'form' : 'pick');
  const [name, setName] = useState(initial?.name || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [goalType, setGoalType] = useState(initial?.goal_type || 'workouts_count');
  const [goalValue, setGoalValue] = useState(initial?.goal_value || '');
  // Read stored instants as LOCAL dates (not a UTC slice). save() writes local
  // midnight as a UTC instant, so `.slice(0,10)` read the UTC calendar day — a
  // day early in Israel — and each edit+save walked the start back another day.
  // Lazy init so it runs once; also corrects existing challenges' shown date.
  const localDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const [startAt, setStartAt] = useState(() => localDay(initial?.start_at ? new Date(initial.start_at) : new Date()));
  const [endAt, setEndAt] = useState(() => localDay(initial?.end_at ? new Date(initial.end_at) : new Date(Date.now() + 30 * 86400000)));
  const [participantIds, setParticipantIds] = useState(new Set(existingParticipants.map(p => p.trainee_id)));
  const [saving, setSaving] = useState(false);

  const pickTemplate = (tpl) => {
    setName(tpl.name);
    setDescription(tpl.description);
    setGoalType(tpl.goalType);
    setGoalValue(tpl.goalValue != null ? String(tpl.goalValue) : '');
    const start = new Date();
    const end = new Date(Date.now() + tpl.durationDays * 86400000);
    // localDay (not toISOString) — a UTC slice reads a day early in Israel evenings.
    setStartAt(localDay(start));
    setEndAt(localDay(end));
    setStage('form');
  };
  const startBlank = () => {
    setName(''); setDescription('');
    setGoalType('workouts_count'); setGoalValue('');
    setStartAt(localDay(new Date()));
    setEndAt(localDay(new Date(Date.now() + 30 * 86400000)));
    setStage('form');
  };

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
        const { error } = await supabase.from('challenge_participants').insert(toAdd.map(id => ({ challenge_id: challengeId, trainee_id: id })));
        if (error) throw error;
      }
      if (toRemove.length > 0) {
        const { error } = await supabase.from('challenge_participants').delete().eq('challenge_id', challengeId).in('trainee_id', toRemove);
        if (error) throw error;
      }
      toast('Challenge saved.', 'success', { ttl: 3000 });
      onSaved();
    } catch (e) {
      toast(`Save failed: ${e?.message || e}`, 'error', { ttl: 6000 });
    } finally {
      setSaving(false);
    }
  };

  if (stage === 'pick') {
    return (
      <Modal open={true} onClose={onClose} title="+ New Challenge — pick a template" wide>
        <div style={{ fontFamily: FN, fontSize: 10, color: C.tm, letterSpacing: '0.18em', fontWeight: 700, marginBottom: 10 }}>
          SMART TEMPLATES
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8, marginBottom: 14 }}>
          {TEMPLATES.map(tpl => (
            <button key={tpl.id} onClick={() => pickTemplate(tpl)}
              style={{
                textAlign: 'left',
                background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`,
                borderRadius: 0, padding: '12px 14px', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', gap: 4,
                transition: 'border-color 0.12s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = C.ac; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = C.cardBd; }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 20 }}>{tpl.icon}</span>
                <span style={{ fontFamily: FN, fontSize: 12, fontWeight: 700, color: C.tx, letterSpacing: '0.04em' }}>
                  {tpl.label}
                </span>
              </div>
              <div style={{ fontSize: 11, color: C.tm, lineHeight: 1.4 }}>{tpl.blurb}</div>
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <button onClick={startBlank} style={{
            background: 'transparent', border: `1px solid ${C.cardBd}`, color: C.tm,
            fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
            padding: '6px 12px', cursor: 'pointer', borderRadius: 0,
          }}>BLANK CHALLENGE →</button>
          <Btn variant="ghost" onClick={onClose}>{tt("Cancel")}</Btn>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={true} onClose={onClose} title={initial ? `Edit · ${initial.name}` : '+ New Challenge'} wide>
      {!initial && (
        <button onClick={() => setStage('pick')} style={{
          background: 'transparent', border: 'none', color: C.tm,
          fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
          padding: 0, cursor: 'pointer', marginBottom: 10,
        }}>← BACK</button>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <Input label="Name" value={name} onChange={e => setName(e.target.value)} />
        <Select label="Goal type" value={goalType} onChange={setGoalType}
          options={GOAL_TYPES.map(g => ({ value: g.id, label: g.label }))}
          />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(150px, 100%), 1fr))', gap: 12, marginBottom: 12 }}>
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
        <Btn variant="ghost" onClick={onClose} disabled={saving}>{tt("Cancel")}</Btn>
        <Btn onClick={save} disabled={saving} style={{minWidth:104,justifyContent:'center'}}>{saving ? 'Saving…' : 'Save'}</Btn>
      </div>
    </Modal>
  );
}
