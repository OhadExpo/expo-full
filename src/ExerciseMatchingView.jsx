// ExerciseMatchingView — resolve unmatched exercise titles across every plan at
// scale. Scans all plans for rows whose exercise reference doesn't resolve to
// the library, groups by title, suggests library matches (ranked), and lets the
// coach Accept / Change / Skip each, then writes exerciseId back to the plans.
//
// SAFETY: the scan + suggestions are read-only. The one mutation (Apply) rewrites
// trainee-visible plans.data, so it's gated behind an explicit confirm with a
// count, and only touches rows whose normalized title matches the accepted group.
import React, { useState, useEffect, useMemo } from 'react';
import { C, FN, FB } from './theme';
import { Card, Btn, Modal, EmptyState, toast } from './ui';
import { scanUnmatched, groupUnmatched, suggestMatches, confidenceLabel, applyMatch, normTitle } from './exerciseMatch';
import { supabase } from './supabase';

const CONF_COLOR = { high: '#2E9E6B', likely: '#39BDFF', low: '#E0A73A' };

function LibraryPicker({ exercises, initial, onPick, onClose }) {
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
              <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ex.title || ex.t}</span>
              {ex.videoLink && <span style={{ fontFamily: FN, fontSize: 9, color: C.ac }}>▶</span>}
              {(ex.cues || ex.notes) && <span style={{ fontFamily: FN, fontSize: 9, color: C.tm }}>✎</span>}
            </button>
          ))}
          {!results.length && <div style={{ fontFamily: FB, fontSize: 13, color: C.td, padding: 16, textAlign: 'center' }}>No library exercise matches “{q}”.</div>}
        </div>
      </div>
    </Modal>
  );
}

export default function ExerciseMatchingView({ exercises = [] }) {
  const [plans, setPlans] = useState(null);
  const [err, setErr] = useState(null);
  const [decisions, setDecisions] = useState({}); // titleKey -> { action:'accept'|'skip', ex }
  const [pickerFor, setPickerFor] = useState(null); // { key, title }
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

  const acceptAllHighConfidence = () => {
    const next = { ...decisions };
    groups.forEach((g) => { const s = g.suggestions[0]; if (s && confidenceLabel(s.score) === 'high' && !next[g.key]) next[g.key] = { action: 'accept', ex: s.ex }; });
    setDecisions(next);
  };

  const apply = async () => {
    setConfirm(false); setApplying(true);
    try {
      // Build the new plans array by folding each accepted match in.
      let working = plans;
      accepted.forEach(([key, d]) => { working = applyMatch(working, key, d.ex); });
      // Persist only the plans that actually changed.
      const changed = working.filter((np) => { const op = plans.find((p) => p.id === np.id); return op && JSON.stringify(op.data) !== JSON.stringify(np.data); });
      let ok = 0;
      for (const p of changed) {
        const { error } = await supabase.from('plans').update({ data: p.data }).eq('id', p.id);
        if (!error) ok++;
      }
      toast(`Applied — ${ok} plan${ok === 1 ? '' : 's'} updated`);
      setPlans(working); setDecisions({});
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
          <Btn disabled={!affectedRows || applying} onClick={() => setConfirm(true)} style={{ background: affectedRows ? C.ac : undefined, borderColor: affectedRows ? C.ac : undefined, color: affectedRows ? '#04121f' : undefined }}>
            {applying ? 'Applying…' : `Apply ${accepted.length} match${accepted.length === 1 ? '' : 'es'} (${affectedRows} rows)`}
          </Btn>
        </div>}>
        <div style={{ fontFamily: FB, fontSize: 12.5, color: C.td }}>
          Every plan row whose exercise doesn’t resolve to the library, grouped by title. Accept a suggestion, Change it, or Skip. Applying writes the library link to all rows sharing that title.
        </div>
      </Card>

      {groups.length === 0 ? (
        <EmptyState title="Everything resolves" hint="No unmatched exercise titles across any plan." />
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
                          <span style={{ flex: 1, minWidth: 0, fontFamily: FB, fontSize: 12.5, color: C.tx, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.ex.title || s.ex.t}</span>
                          <span style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: CONF_COLOR[conf] }}>{s.why}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : <div style={{ fontFamily: FB, fontSize: 12, color: C.td, padding: '8px 0' }}>No close library match — Change to search, or leave to create later.</div>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                <Btn variant="ghost" onClick={() => setPickerFor({ key: g.key, title: g.title })}>Change…</Btn>
                <Btn variant="ghost" onClick={() => setDecision(g.key, 'skip')}>Skip</Btn>
              </div>
            </div>
          </Card>
        );
      })}

      {pickerFor && (
        <LibraryPicker exercises={exercises} initial={pickerFor.title}
          onPick={(ex) => { setDecision(pickerFor.key, 'accept', ex); setPickerFor(null); }}
          onClose={() => setPickerFor(null)} />
      )}

      {confirm && (
        <Modal open onClose={() => setConfirm(false)} title="Apply matches?">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontFamily: FB, fontSize: 13.5, color: C.tx }}>
              This links {accepted.length} exercise{accepted.length === 1 ? '' : 'es'} to the library and updates <strong>{affectedRows}</strong> plan row{affectedRows === 1 ? '' : 's'} across your athletes’ programs. Titles athletes see stay the same; the rows just resolve to real library exercises.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Btn variant="ghost" onClick={() => setConfirm(false)}>Cancel</Btn>
              <Btn onClick={apply} style={{ background: C.ac, borderColor: C.ac, color: '#04121f' }}>Apply {affectedRows} rows</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
