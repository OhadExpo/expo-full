// TraineeIntake — the athlete's submitted intake form(s), shown on their
// coach page (TraineeDetail) directly beneath the Athletic Evaluation.
//
// Reuses the coach-inbox renderer (IntakePayloadDetail) so a submission reads
// identically here and in the /coach/intake inbox. A submission is matched to
// this athlete by trainee_id (bound links) OR by a matching email (initial
// prospect intakes that carried no trainee_id). Read-only.
import React, { useEffect, useState } from 'react';
import { C, FN, FB } from './theme';
import { CollapsibleSection, Badge } from './ui';
import { supabase } from './supabase';
import { getForm } from './intakeFormSchemas';
import PayloadDetail from './IntakePayloadDetail';

function emailsOf(trainee) {
  const e = trainee?.email;
  const arr = Array.isArray(e) ? e : (e ? [e] : []);
  return arr.map(x => String(x).trim().toLowerCase()).filter(Boolean);
}
function fmt(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
const FORM_TINT = { initial: C.ac, assessment: C.or, progress: C.gn };

export default function TraineeIntake({ trainee }) {
  const [subs, setSubs] = useState(null);

  useEffect(() => {
    if (!trainee) return;
    let live = true;
    (async () => {
      const emails = emailsOf(trainee);
      try {
        // Parameterised queries (eq / ilike) merged + deduped — avoids raw
        // .or() string interpolation of user-supplied emails (injection-safe).
        // Email match must be CASE-INSENSITIVE: submission emails are stored
        // as typed (IntakeForm only trims), so a prospect intake from
        // "Foo@Bar.com" must still match a trainee email "foo@bar.com".
        // ilike does that; LIKE metachars (% _ \) are escaped so it stays an
        // EXACT case-insensitive match (emails can legitimately contain "_").
        const escLike = (em) => em.replace(/([\\%_])/g, '\\$1');
        const queries = [];
        if (trainee.id) queries.push(supabase.from('intake_submissions').select('*').eq('trainee_id', trainee.id));
        for (const em of emails) queries.push(supabase.from('intake_submissions').select('*').ilike('email', escLike(em)));
        const results = await Promise.all(queries);
        const map = new Map();
        for (const r of results) {
          // Surface (don't silently swallow) a query/RLS error, then keep any
          // rows other queries did return rather than blanking the section.
          if (r.error) { try { console.error('[EXPO] intake load error:', r.error); } catch { /* noop */ } continue; }
          (r.data || []).forEach(s => map.set(s.id, s));
        }
        const rows = [...map.values()].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        if (live) setSubs(rows);
      } catch { if (live) setSubs([]); }
    })();
    return () => { live = false; };
  }, [trainee?.id, JSON.stringify(emailsOf(trainee))]);

  // Nothing submitted yet → keep the page quiet (no empty section noise).
  if (!subs || subs.length === 0) return null;

  return (
    // Grouped tight beneath the Athletic Evaluation (no top gap) — the two read
    // as one "who is this athlete" block, separate from Assigned Programs (Ohad).
    <CollapsibleSection bare title="Intake" count={subs.length} storageKey={`td-intake-${trainee.id}`} defaultOpen={false} style={{ margin: 0 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {subs.map(s => (
          <div key={s.id} style={{ border: `1px solid ${C.cardBd}`, background: 'var(--c-sf)', padding: '12px 14px' }}>
            {/* Centred header + body (Ohad). */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
              <Badge color={FORM_TINT[s.form_type] || C.ac}>{s.form_type}</Badge>
              <span style={{ color: C.tm, fontFamily: FN, fontSize: 10, letterSpacing: '0.06em' }}>{(s.locale || '').toUpperCase()}</span>
              <span style={{ color: C.td, fontFamily: FB, fontSize: 12 }}>· {fmt(s.created_at)}</span>
              {!s.reviewed_at && <span style={{ color: C.ac, fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em' }}>· NEW</span>}
            </div>
            <PayloadDetail form={getForm(s.form_type, s.locale)} payload={s.payload} center />
          </div>
        ))}
      </div>
    </CollapsibleSection>
  );
}
