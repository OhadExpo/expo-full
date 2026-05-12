// Trainee-card surface for the latest physical assessment submission.
//
// Renders a compact summary card with: assessment date, sit-rise score,
// balance L/R, push-up max, plank seconds, pull-up ability, pain regions
// (color-coded by worst-pain score), and red-flag warning if any. Click
// the title to expand the full payload.
//
// Data source: intake_submissions WHERE form_type='assessment' AND
// trainee_id matches. Most recent wins. Hides itself when no submission.

import React, { useEffect, useState } from 'react';
import { C, FN, FB, FH } from './theme';
import { isRefined5b } from './ui';
import { supabase } from './supabase';
import { getForm } from './intakeFormSchemas';

const isHebrew = (s) => /[֐-׿]/.test(s || '');

const painSeverityColor = (score) => {
  if (score == null) return C.tm;
  if (score >= 6) return C.rd;
  if (score >= 4) return C.or;
  return C.gn;
};

export default function TraineeAssessment({ traineeId }) {
  const [submission, setSubmission] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!traineeId) { setSubmission(null); setLoading(false); return; }
    (async () => {
      const { data, error } = await supabase
        .from('intake_submissions')
        .select('*')
        .eq('trainee_id', traineeId)
        .eq('form_type', 'assessment')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled) {
        if (error) console.warn('assessment fetch failed:', error.message);
        setSubmission(data || null);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [traineeId]);

  if (loading || !submission) return null;
  const payload = submission.payload || {};
  const form = getForm('assessment', submission.locale) || getForm('assessment', 'en');
  const date = payload.assessment_date || submission.created_at;
  const pain = payload.pain_worst != null ? Number(payload.pain_worst) : null;
  const painCol = painSeverityColor(pain);
  const regions = Array.isArray(payload.pain_regions) ? payload.pain_regions : [];
  const redFlag = payload.red_flags === 'כן' || payload.red_flags === 'Yes';

  const metric = (label, val, suffix = '') => (
    <div style={{ flex: 1, minWidth: 90, textAlign: 'center', padding: '6px 4px' }}>
      <div style={{ fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: '0.12em', fontWeight: 700 }}>{label}</div>
      <div style={{ fontFamily: FN, fontSize: 16, color: C.tx, fontWeight: 700, marginTop: 2 }}>
        {val != null && val !== '' ? `${val}${suffix}` : '—'}
      </div>
    </div>
  );

  return (
    <div style={{
      background: isRefined5b() ? '#FFFFFF' : 'var(--c-sf)',
      border: `1px solid ${C.cardBd}`, borderLeft: `3px solid ${painCol}`,
      borderRadius: 0, padding: 14, marginBottom: 12,
    }}>
      <div onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          marginBottom: 10, cursor: 'pointer',
        }}>
        <div>
          <div style={{ fontSize: 9, fontFamily: FN, color: C.tm, letterSpacing: '0.18em', fontWeight: 700 }}>
            PHYSICAL ASSESSMENT
          </div>
          <div style={{ fontSize: 11, fontFamily: FN, color: C.td, marginTop: 2 }}>
            {date ? new Date(date).toLocaleDateString() : '—'}
            {redFlag && <span style={{ color: C.rd, marginLeft: 10, fontWeight: 700 }}>⚠ RED FLAG</span>}
          </div>
        </div>
        <span style={{ color: C.td, fontSize: 12 }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {/* Key metrics row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
        {metric('SIT-RISE', payload.sit_rise, '/10')}
        {metric('BAL L', payload.balance_left, 's')}
        {metric('BAL R', payload.balance_right, 's')}
        {metric('PUSH-UP', payload.pushup_max)}
        {metric('PLANK', payload.plank_seconds, 's')}
        {metric('PAIN', pain != null ? `${pain}/10` : '—')}
      </div>

      {/* Pain regions tag strip */}
      {regions.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 9, fontFamily: FN, color: C.tm, letterSpacing: '0.12em', fontWeight: 700, marginBottom: 4 }}>
            PAIN REGIONS
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {regions.map(r => (
              <span key={r} style={{
                padding: '3px 8px', border: `1px solid ${painCol}`, color: painCol,
                fontFamily: isHebrew(r) ? FH : FN, fontSize: 11,
                direction: isHebrew(r) ? 'rtl' : 'ltr',
              }}>{r}</span>
            ))}
          </div>
        </div>
      )}

      {expanded && form && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.cardBd}` }}>
          {form.questions.map(q => {
            const v = payload[q.id];
            if (v == null || v === '' || (Array.isArray(v) && v.length === 0)) return null;
            const heb = isHebrew(q.label) || (typeof v === 'string' && isHebrew(v));
            return (
              <div key={q.id} style={{ marginBottom: 8, direction: heb ? 'rtl' : 'ltr' }}>
                <div style={{ fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: '0.12em', fontWeight: 700, marginBottom: 2 }}>
                  {q.label}
                </div>
                <div style={{
                  fontFamily: heb ? FH : FB, fontSize: 12, color: C.tx, lineHeight: 1.5,
                }}>
                  {Array.isArray(v) ? v.join(' · ') : String(v)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
