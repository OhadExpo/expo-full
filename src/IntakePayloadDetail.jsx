// Shared renderer for a submitted intake payload (question label + answer).
// Used by the coach inbox (IntakeView detail modal) AND the athlete page
// (TraineeIntake). One source of truth so both read submissions identically.
import React from 'react';
import { C, FN, FB, FH } from './theme';

// `center` centres every label + answer (used on the athlete page, Ohad).
export default function PayloadDetail({ form, payload, center = false }) {
  if (!form) return <div style={{ color: C.tm, fontSize: 13 }}>Form schema unknown.</div>;
  const align = center ? 'center' : undefined;
  return (
    <div style={{ direction: form.locale === 'he' ? 'rtl' : 'ltr', fontFamily: form.locale === 'he' ? FH : FB }}>
      {form.questions.map(q => {
        const v = payload?.[q.id];
        const isArr = Array.isArray(v);
        const isEmpty = v == null || v === '' || (isArr && v.length === 0);
        // Scale answers read as "3 / 5" so the rating carries its own ceiling.
        const isScale = q.type === 'scale' && q.scale && q.scale.max != null;
        const shownVal = isEmpty ? '—' : (isScale ? `${v} / ${q.scale.max}` : String(v));
        return (
          <div key={q.id} style={{ marginBottom: 12, paddingBottom: 10, borderBottom: `1px solid rgba(57,189,255,0.149)`, textAlign: align }}>
            <div style={{ fontFamily: FN, fontSize: 10, color: C.tm, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>{q.label}</div>
            {isArr && !isEmpty ? (
              // multichoice — render selected options as cyan chips
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: center ? 'center' : undefined }}>
                {v.map((opt, i) => (
                  <span key={i} style={{
                    padding: '3px 10px', border: `1px solid ${C.ac}`, color: C.ac,
                    fontFamily: form.locale === 'he' ? FH : FN, fontSize: 12,
                    direction: /[֐-׿]/.test(String(opt)) ? 'rtl' : 'ltr',
                  }}>{String(opt)}</span>
                ))}
              </div>
            ) : (
              <div style={{ fontFamily: form.locale === 'he' ? FH : FB, fontSize: 14, color: isEmpty ? C.td : C.tx, fontStyle: isEmpty ? 'italic' : 'normal', whiteSpace: 'pre-wrap' }}>
                {shownVal}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
