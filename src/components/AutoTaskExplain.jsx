// F-26 — Auto-task explainability modal + ⓘ button. Same shell used
// by NotesWidget (dashboard tasks) and NotesInline (trainee-card tasks)
// so the "why is this task here" experience is identical everywhere.
import React, { useState } from 'react';
import { FN } from '../theme';
import { explainAutoTask } from '../autoTasks';
import { useEscClose } from '../ui';

export function ExplainInfoButton({ note, trainee, color = 'var(--c-ac)' }) {
  const [open, setOpen] = useState(false);
  if (!note?.auto_kind) return null;
  return (
    <>
      <button onClick={() => setOpen(true)} title="Why is this task here?"
        style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          color, fontSize: 13, padding: '0 2px',
          lineHeight: 1, flexShrink: 0, fontWeight: 700,
        }}>ⓘ</button>
      {open && <AutoTaskExplainModal note={note} trainee={trainee} accent={color} onClose={() => setOpen(false)} />}
    </>
  );
}

export function AutoTaskExplainModal({ note, trainee, accent = 'var(--c-ac)', onClose }) {
  const exp = explainAutoTask(note, trainee);
  useEscClose(true, onClose); // Escape closes the explainer
  return (
    <div onClick={onClose} role="dialog" aria-modal="true" aria-label="Why this task" style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 220,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 20, paddingTop: 80,
      backdropFilter: 'blur(4px)',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--c-bg)', border: `1px solid var(--c-cardBd)`, borderLeft: `3px solid ${accent}`,
        borderRadius: 0, padding: 22, maxWidth: 460, width: '100%', maxHeight: '80vh', overflow: 'auto',
      }}>
        <div style={{ fontFamily: FN, fontSize: 10, color: 'var(--c-tm)', letterSpacing: '0.18em', fontWeight: 700, marginBottom: 4 }}>
          WHY THIS TASK
        </div>
        <div style={{ fontFamily: FN, fontSize: 14, color: accent, letterSpacing: '0.04em', fontWeight: 700, marginBottom: 14 }}>
          {exp.title}
        </div>

        <Section label="RULE">
          <div style={{ fontSize: 13, color: 'var(--c-tx)', lineHeight: 1.5 }}>{exp.rule}</div>
        </Section>

        {exp.inputs.length > 0 && (
          <Section label="INPUTS READ">
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {exp.inputs.map((i, idx) => (
                <li key={idx} style={{ fontSize: 12, color: 'var(--c-tx)', lineHeight: 1.6, fontFamily: FN }}>{i}</li>
              ))}
            </ul>
          </Section>
        )}

        <Section label="AUTO-CLOSES">
          <div style={{ fontSize: 12, color: 'var(--c-tm)', lineHeight: 1.5, fontFamily: FN }}>{exp.closes}</div>
        </Section>

        <Section label="CONFIDENCE">
          <div style={{ fontSize: 12, color: 'var(--c-tx)', fontFamily: FN, letterSpacing: '0.08em', fontWeight: 700, textTransform: 'uppercase' }}>{exp.confidence}</div>
        </Section>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={onClose}
            style={{
              padding: '6px 14px', borderRadius: 0, border: `1px solid ${accent}`,
              background: 'transparent', color: accent, fontFamily: FN, fontSize: 11,
              fontWeight: 700, letterSpacing: '0.12em', cursor: 'pointer',
            }}>CLOSE</button>
        </div>
      </div>
    </div>
  );
}

function Section({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontFamily: FN, fontSize: 9, color: 'var(--c-td)', letterSpacing: '0.18em', fontWeight: 700, marginBottom: 6 }}>
        {label}
      </div>
      {children}
    </div>
  );
}
