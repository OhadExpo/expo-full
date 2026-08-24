// ExerciseMatchingView — resolve unmatched exercise titles across every plan at
// scale. Scans all plans for rows whose exercise reference doesn't resolve to
// the library, groups by title, suggests library matches (ranked), and lets the
// coach Accept / Change / Skip each, then writes exerciseId back to the plans.
//
// SAFETY: the scan + suggestions are read-only. The one mutation (Apply) rewrites
// trainee-visible plans.data, so it's gated behind an explicit confirm with a
// count, and only touches rows whose normalized title matches the accepted group.
import React, { useState, useEffect, useMemo } from 'react';
import { C, FN, FB, ytId } from './theme';
import { Card, Btn, Modal, EmptyState, toast } from './ui';
import { scanUnmatched, groupUnmatched, suggestMatches, confidenceLabel, applyMatch, normTitle } from './exerciseMatch';
import { supabase } from './supabase';

const CONF_COLOR = { high: '#2E9E6B', likely: '#39BDFF', low: '#E0A73A' };

// Full library-exercise card so the coach can VERIFY a suggestion before
// accepting it — video (click-to-play, no fullscreen), classification, cues.
// Without this the suggestion is just a truncated name (Ohad, 2026-08-21).
function ExercisePeek({ ex, onAccept, onClose }) {
  const [play, setPlay] = useState(false);
  const yid = ytId(ex.videoLink);
  const fileVid = !yid && typeof ex.videoLink === 'string' && /\.(mp4|webm|mov|m4v)(\?|$)/i.test(ex.videoLink);
  const meta = [
    ['Resistance', ex.resistanceType], ['Position', ex.bodyPosition], ['Movement', ex.movementType],
    ['Joints', ex.primaryJoints], ['Joint movements', ex.jointMovements],
    ['Primary muscles', ex.primaryMuscles], ['Secondary', ex.secondaryMuscles],
  ].filter(([, v]) => v && String(v).trim());
  const box = { position: 'relative', width: '100%', aspectRatio: '16 / 9', background: '#000', overflow: 'hidden' };
  const cueLines = [ex.cues, ex.notes].filter(Boolean).join('\n\n').split('\n');
  return (
    <Modal open onClose={onClose} wide title={ex.title || ex.t || 'Exercise'}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Video + cues SIDE BY SIDE — the old stacked layout buried dim cues
            under a huge video and pushed the buttons off-screen (Ohad: "horrible
            screen, can't see anything"). Cues are bright, per-line dir=auto so
            Hebrew reads RTL with the hyphens on the correct side. */}
        <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 330px', minWidth: 0 }}>
            {yid ? (play ? (
              <div style={box}>
                <iframe title="exercise demo" src={`https://www.youtube.com/embed/${yid}?fs=0&rel=0&modestbranding=1&playsinline=1&autoplay=1`}
                  style={{ width: '100%', height: '100%', border: 'none' }} allow="autoplay; encrypted-media" />
              </div>
            ) : (
              <div style={{ ...box, cursor: 'pointer' }} onClick={() => setPlay(true)} role="button" tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPlay(true); } }}>
                <img src={`https://img.youtube.com/vi/${yid}/hqdefault.jpg`} loading="lazy" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.92, display: 'block' }} />
                <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.85)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ width: 0, height: 0, borderTop: '7px solid transparent', borderBottom: '7px solid transparent', borderLeft: '12px solid #fff', marginLeft: 3 }} />
                  </span>
                </span>
              </div>
            )) : fileVid ? (
              <video src={ex.videoLink} controls playsInline style={{ ...box, display: 'block' }} />
            ) : (
              <div style={{ fontFamily: FN, fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.td, padding: '14px 0', textAlign: 'center', border: `0.25px solid ${C.bd}` }}>No video in the library for this exercise</div>
            )}
            {meta.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '5px 14px', marginTop: 12 }}>
                {meta.map(([k, v]) => (
                  <React.Fragment key={k}>
                    <span style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.tm, alignSelf: 'center' }}>{k}</span>
                    <span style={{ fontFamily: FB, fontSize: 12.5, color: C.tx }}>{v}</span>
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>
          {cueLines.length > 0 && cueLines[0] !== '' && (
            <div style={{ flex: '1 1 240px', minWidth: 0 }}>
              <div style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.ac, marginBottom: 8 }}>Cues</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 340, overflowY: 'auto' }}>
                {cueLines.map((line, i) => (line.trim()
                  ? <div key={i} dir="auto" style={{ fontFamily: FB, fontSize: 13.5, color: C.tx, lineHeight: 1.55, textAlign: 'start' }}>{line}</div>
                  : <div key={i} style={{ height: 6 }} />))}
              </div>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: `0.25px solid ${C.bd}`, paddingTop: 12 }}>
          <Btn variant="ghost" onClick={onClose}>Close</Btn>
          {onAccept && <Btn onClick={onAccept} style={{ background: '#2E9E6B', borderColor: '#2E9E6B', color: '#04121f' }}>Use this match</Btn>}
        </div>
      </div>
    </Modal>
  );
}

function LibraryPicker({ exercises, initial, onPick, onPeek, onClose }) {
  const [q, setQ] = useState(initial || '');
  const results = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return (exercises || []).slice(0, 60);
    return (exercises || []).filter((e) => (e.title || e.t || '').toLowerCase().includes(n)).slice(0, 60);
  }, [q, exercises]);
  return (
    <Modal open onClose={onClose} wide title="Pick library exercise">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the library…"
          style={{ fontFamily: FB, fontSize: 14, color: C.tx, background: 'var(--c-sf)', border: `1px solid ${C.bd}`, borderRadius: 0, padding: '10px 12px' }} />
        <div style={{ maxHeight: 420, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {results.map((ex) => (
            <button key={ex.id} onClick={() => onPick(ex)} style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', padding: '9px 10px', border: 'none', borderBottom: `0.25px solid ${C.bd}`, background: 'transparent', cursor: 'pointer', fontFamily: FB, fontSize: 13, color: C.tx }}>
              <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={ex.title || ex.t}>{ex.title || ex.t}</span>
              {ex.videoLink && <span style={{ fontFamily: FN, fontSize: 9, color: C.ac }}>▶</span>}
              {(ex.cues || ex.notes) && <span style={{ fontFamily: FN, fontSize: 9, color: C.tm }}>✎</span>}
              {onPeek && <span role="button" tabIndex={0} title="Preview this exercise" onClick={(e) => { e.stopPropagation(); onPeek(ex); }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onPeek(ex); } }}
                style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: C.tm, border: `0.25px solid ${C.bd}`, padding: '3px 7px', flexShrink: 0 }}>VIEW</span>}
            </button>
          ))}
          {!results.length && <div style={{ fontFamily: FB, fontSize: 13, color: C.td, padding: 16, textAlign: 'center' }}>No library exercise matches “{q}”.</div>}
        </div>
      </div>
    </Modal>
  );
}

export default function ExerciseMatchingView({ exercises = [], setExercises }) {
  const [plans, setPlans] = useState(null);
  const [err, setErr] = useState(null);
  const [decisions, setDecisions] = useState({}); // titleKey -> { action:'accept'|'skip', ex }
  const [pickerFor, setPickerFor] = useState(null); // { key, title }
  const [peek, setPeek] = useState(null); // { ex, key } — key present ⇒ "Use this match" accepts into that group
  const [applying, setApplying] = useState(false);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => { let stop = false; (async () => {
    const { data, error } = await supabase.from('plans').select('id,name,trainee_id,data');
    if (stop) return;
    if (error) setErr(error.message); else setPlans(data || []);
  })(); return () => { stop = true; }; }, []);

  const groups = useMemo(() => {
    if (!plans) return [];
    const rows = scanUnmatched(plans, exercises);
    return groupUnmatched(rows).map((g) => ({ ...g, suggestions: suggestMatches(g.title, exercises, 4) }));
  }, [plans, exercises]);

  const totalEntries = groups.reduce((a, g) => a + g.count, 0);
  const accepted = Object.entries(decisions).filter(([, d]) => d.action === 'accept' && d.ex);
  const affectedRows = accepted.reduce((a, [key]) => a + (groups.find((g) => g.key === key)?.count || 0), 0);

  const setDecision = (key, action, ex) => setDecisions((prev) => ({ ...prev, [key]: { action, ex } }));

  // Create a brand-new library exercise for a genuinely-new title. Writes the
  // library (store), NOT trainee plans — the plan rows then resolve by title.
  const createInLibrary = (g) => {
    if (!setExercises) return;
    const ex = { id: 'ex_' + Math.random().toString(36).slice(2, 12), title: g.title, resistanceType: '', bodyPosition: '', movementType: '', primaryMuscles: '', secondaryMuscles: '', videoLink: '', cues: '', notes: '' };
    setExercises((prev) => [...(prev || []), ex]);
    toast(`“${g.title}” added to library`);
  };

  const acceptAllHighConfidence = () => {
    const next = { ...decisions };
    groups.forEach((g) => { const s = g.suggestions[0]; if (s && confidenceLabel(s.score) === 'high' && !next[g.key]) next[g.key] = { action: 'accept', ex: s.ex }; });
    setDecisions(next);
  };

  const apply = async () => {
    setConfirm(false); setApplying(true);
    try {
      // RE-FETCH plans first — the mount-time snapshot may be minutes old and a
      // whole-blob write from it would clobber editor autosaves made since
      // (audit 08-22). Matches fold into the FRESH data.
      const { data: fresh, error: fErr } = await supabase.from('plans').select('id,name,trainee_id,data');
      if (fErr) throw fErr;
      let working = fresh || [];
      const groupByKey = new Map(groups.map((g) => [g.key, g]));
      accepted.forEach(([key, d]) => { const g = groupByKey.get(key); if (g) working = applyMatch(working, g, d.ex, exercises); });
      const changed = working.filter((np) => { const op = (fresh || []).find((p) => p.id === np.id); return op && JSON.stringify(op.data) !== JSON.stringify(np.data); });
      let ok = 0; const failedIds = new Set();
      for (const p of changed) {
        const { error } = await supabase.from('plans').update({ data: p.data }).eq('id', p.id);
        if (!error) ok++; else failedIds.add(p.id);
      }
      // Local state reflects reality: successful writes only — a failed plan
      // keeps its fresh (unapplied) data so its groups stay visible for retry.
      const next = working.map((np) => (failedIds.has(np.id) ? (fresh || []).find((p) => p.id === np.id) || np : np));
      setPlans(next);
      if (failedIds.size) {
        toast(`Applied ${ok} plan${ok === 1 ? '' : 's'} — ${failedIds.size} FAILED, their rows stay listed for retry`);
        // keep decisions only for groups that still have unresolved rows in failed plans
        setDecisions((prev) => { const keep = {}; for (const [k, v] of Object.entries(prev)) { const g = groupByKey.get(k); if (g && g.rows.some((r) => failedIds.has(r.planId))) keep[k] = v; } return keep; });
      } else {
        toast(`Applied — ${ok} plan${ok === 1 ? '' : 's'} updated`);
        setDecisions({});
      }
    } catch (e) { toast('Apply failed'); setErr(String(e && e.message || e)); }
    setApplying(false);
  };

  if (err) return <Card header="Exercise Matching"><div style={{ fontFamily: FB, color: '#DE4E3B', padding: 16 }}>Couldn’t load plans: {err}</div></Card>;
  if (!plans) return <div style={{ padding: 40, textAlign: 'center', color: C.tm, fontFamily: FN, letterSpacing: '0.18em' }}>SCANNING PLANS…</div>;

  const th = { fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.tm };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1100, margin: '0 auto', padding: '4px 0 60px' }}>
      <Card leftStripe={C.ac} header="Exercise Matching" headerRight={
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ ...th, color: '#fff' }}>{groups.length} titles · {totalEntries} rows</span>
          <Btn variant="ghost" onClick={acceptAllHighConfidence}>Accept all high-confidence</Btn>
          <Btn disabled={!affectedRows || applying} onClick={() => setConfirm(true)} style={{ background: affectedRows ? '#39BDFF' : undefined, borderColor: affectedRows ? '#39BDFF' : undefined, color: affectedRows ? '#06131b' : undefined }} /* literal cyan — C.ac resolves near-black in the light theme (audit 08-22) */>
            {applying ? 'Applying…' : `Apply ${accepted.length} match${accepted.length === 1 ? '' : 'es'} (${affectedRows} rows)`}
          </Btn>
        </div>}>
        <div style={{ fontFamily: FB, fontSize: 12.5, color: C.td }}>
          Every plan row whose exercise doesn’t resolve to the library, grouped by title. Accept a suggestion, Change it, or Skip. Applying writes the library link to all rows sharing that title.
        </div>
      </Card>

      {groups.length === 0 ? (
        <EmptyState message="Everything resolves — no unmatched exercise titles across any plan." />
      ) : groups.map((g) => {
        const dec = decisions[g.key];
        const top = g.suggestions[0];
        const chosen = dec && dec.action === 'accept' ? dec.ex : null;
        const skipped = dec && dec.action === 'skip';
        return (
          <Card key={g.key} leftStripe={chosen ? '#2E9E6B' : skipped ? C.bd : C.or} style={{ opacity: skipped ? 0.6 : 1 }}>
            <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 300px', minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontFamily: FN, fontSize: 15, fontWeight: 700, color: C.tx }}>{g.title}</span>
                  <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, color: C.or, background: `color-mix(in srgb, ${C.or} 14%, transparent)`, padding: '2px 7px' }}>{g.count}×</span>
                </div>
                <div style={{ fontFamily: FB, fontSize: 11, color: C.td, marginTop: 5 }}>
                  {g.rows.slice(0, 3).map((r) => `${r.planName || 'plan'} · ${r.dayName}`).join('  ·  ')}{g.rows.length > 3 ? `  +${g.rows.length - 3}` : ''}
                </div>
                {chosen && <div style={{ fontFamily: FN, fontSize: 12, fontWeight: 700, color: '#2E9E6B', marginTop: 8 }}>→ {chosen.title || chosen.t}</div>}
              </div>
              <div style={{ flex: '1 1 320px', minWidth: 0 }}>
                {top ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {g.suggestions.slice(0, 3).map((s) => {
                      const conf = confidenceLabel(s.score);
                      const on = chosen && chosen.id === s.ex.id;
                      return (
                        <button key={s.ex.id} onClick={() => setDecision(g.key, 'accept', s.ex)} style={{ display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', padding: '7px 10px', border: `1px solid ${on ? '#2E9E6B' : C.bd}`, background: on ? 'color-mix(in srgb, #2E9E6B 10%, transparent)' : 'var(--c-sf)', cursor: 'pointer', borderRadius: 0 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: CONF_COLOR[conf], flexShrink: 0 }} />
                          <span style={{ flex: 1, minWidth: 0, fontFamily: FB, fontSize: 12.5, color: C.tx, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={s.ex.title || s.ex.t}>{s.ex.title || s.ex.t}</span>
                          {s.ex.videoLink && <span style={{ fontFamily: FN, fontSize: 9, color: C.ac, flexShrink: 0 }} title="has video">▶</span>}
                          {(s.ex.cues || s.ex.notes) && <span style={{ fontFamily: FN, fontSize: 9, color: C.tm, flexShrink: 0 }} title="has cues">✎</span>}
                          <span style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: CONF_COLOR[conf] }}>{s.why}</span>
                          <span role="button" tabIndex={0} title="Preview this library exercise — video, cues, classification" onClick={(e) => { e.stopPropagation(); setPeek({ ex: s.ex, key: g.key }); }}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setPeek({ ex: s.ex, key: g.key }); } }}
                            style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: C.tm, border: `0.25px solid ${C.bd}`, padding: '3px 7px', flexShrink: 0 }}>VIEW</span>
                        </button>
                      );
                    })}
                  </div>
                ) : <div style={{ fontFamily: FB, fontSize: 12, color: C.td, padding: '8px 0' }}>No close library match — Change to search, or leave to create later.</div>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                <Btn variant="ghost" onClick={() => setPickerFor({ key: g.key, title: g.title })}>Change…</Btn>
                {setExercises && <Btn variant="ghost" onClick={() => createInLibrary(g)}>+ New</Btn>}
                <Btn variant="ghost" onClick={() => setDecision(g.key, 'skip')}>Skip</Btn>
              </div>
            </div>
          </Card>
        );
      })}

      {pickerFor && (
        <LibraryPicker exercises={exercises} initial={pickerFor.title}
          onPick={(ex) => { setDecision(pickerFor.key, 'accept', ex); setPickerFor(null); }}
          onPeek={(ex) => setPeek({ ex, key: pickerFor.key })}
          onClose={() => setPickerFor(null)} />
      )}

      {peek && (
        <ExercisePeek ex={peek.ex}
          onAccept={peek.key ? () => { setDecision(peek.key, 'accept', peek.ex); setPeek(null); setPickerFor(null); } : null}
          onClose={() => setPeek(null)} />
      )}

      {confirm && (
        <Modal open onClose={() => setConfirm(false)} title="Apply matches?">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontFamily: FB, fontSize: 13.5, color: C.tx }}>
              This links {accepted.length} exercise{accepted.length === 1 ? '' : 'es'} to the library and updates <strong>{affectedRows}</strong> plan row{affectedRows === 1 ? '' : 's'} across your athletes’ programs. Titles athletes see stay the same; the rows just resolve to real library exercises.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Btn variant="ghost" onClick={() => setConfirm(false)}>Cancel</Btn>
              <Btn onClick={apply} style={{ background: '#39BDFF', borderColor: '#39BDFF', color: '#06131b' }}>Apply {affectedRows} rows</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
