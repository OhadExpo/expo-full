// F-27 — Coach-side contract composer modal. Opens from the trainee
// card; coach picks rate / cadence / package length / custom clauses,
// hits SEND, gets a /sign/<token> URL copied to clipboard. They send
// the URL via WhatsApp; athlete signs from any device.

import React, { useState } from 'react';
import { C, FN, FB } from './theme';
import { supabase } from './supabase';

const isHebrew = (s) => /[֐-׿]/.test(s || '');

export default function CoachContractComposer({ trainee, coachEmail, onClose, onSent }) {
  const [monthly, setMonthly] = useState(trainee?.monthly || 800);
  const [sessions, setSessions] = useState(2);
  const [months, setMonths] = useState(3);
  const [custom, setCustom] = useState('');
  const [creating, setCreating] = useState(false);
  const [createdUrl, setCreatedUrl] = useState(null);
  const [error, setError] = useState(null);

  const submit = async () => {
    setCreating(true);
    setError(null);
    try {
      const token = 'ct_' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36).slice(-4);
      const row = {
        token,
        coach_email: coachEmail,
        client_id: trainee.id,
        client_name: trainee.name,
        monthly_rate: Number(monthly) || 0,
        currency: 'ils',
        sessions_per_week: Number(sessions) || null,
        package_length_months: Number(months) || null,
        custom_clauses: custom.trim() || null,
        status: 'pending',
        created_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('coaching_contracts').insert(row);
      if (error) throw error;
      const url = `${window.location.origin}/sign/${token}`;
      try { await navigator.clipboard.writeText(url); } catch {}
      setCreatedUrl(url);
      onSent?.(url);
    } catch (e) {
      setError(e.message || 'Could not create contract.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 250,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 20, paddingTop: 60,
      backdropFilter: 'blur(4px)',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--c-bg)', border: `1px solid ${C.cardBd}`,
        borderLeft: `3px solid ${C.ac}`,
        maxWidth: 480, width: '100%', maxHeight: '85vh', overflow: 'auto',
      }}>
        <div style={{ background: C.ac, color: '#FFFFFF', padding: '14px 20px' }}>
          <div style={{ fontFamily: FN, fontSize: 10, letterSpacing: '0.18em', fontWeight: 700, opacity: 0.78 }}>
            COACHING AGREEMENT
          </div>
          <div dir="auto" style={{
            fontFamily: isHebrew(trainee?.name) ? 'serif' : FN,
            fontSize: 16, fontWeight: 800, marginTop: 2,
          }}>{trainee?.name || 'Client'}</div>
        </div>

        {createdUrl ? (
          <div style={{ padding: 22, textAlign: 'center' }}>
            <div style={{ fontSize: 30, marginBottom: 10 }}>📨</div>
            <div style={{ fontFamily: FN, fontSize: 12, color: C.gn, letterSpacing: '0.18em', fontWeight: 700, marginBottom: 12 }}>
              CONTRACT READY
            </div>
            <div style={{
              background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, padding: 10,
              fontFamily: 'monospace', fontSize: 11, color: C.tx, wordBreak: 'break-all',
              marginBottom: 14,
            }}>{createdUrl}</div>
            <div style={{ fontFamily: FB, fontSize: 12, color: C.tm, marginBottom: 16 }}>
              Link copied to clipboard. Send via WhatsApp — athlete signs from any device.
            </div>
            <button onClick={onClose} style={{
              padding: '10px 24px', background: C.ac, color: '#FFFFFF',
              border: `1px solid ${C.ac}`, fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.18em',
              cursor: 'pointer',
            }}>DONE</button>
          </div>
        ) : (
          <div style={{ padding: 20 }}>
            <FormRow label="MONTHLY RATE (₪)">
              <input type="number" value={monthly} onChange={e => setMonthly(e.target.value)} style={inp} />
            </FormRow>
            <FormRow label="SESSIONS / WEEK">
              <input type="number" min={1} max={7} value={sessions} onChange={e => setSessions(e.target.value)} style={inp} />
            </FormRow>
            <FormRow label="PACKAGE LENGTH (months)">
              <input type="number" min={1} max={24} value={months} onChange={e => setMonths(e.target.value)} style={inp} />
            </FormRow>
            <FormRow label="CUSTOM CLAUSES (optional)">
              <textarea value={custom} onChange={e => setCustom(e.target.value)} dir="auto"
                rows={4}
                placeholder='e.g. "Coach will write a periodized 12-week marathon plan; athlete commits to 4 runs/week."'
                style={{ ...inp, fontFamily: isHebrew(custom) ? 'serif' : FB, resize: 'vertical' }} />
            </FormRow>
            {error && (
              <div style={{ color: C.rd, fontSize: 12, marginBottom: 10 }}>{error}</div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={onClose} disabled={creating}
                style={{
                  flex: 1, padding: '10px', background: 'transparent', border: `1px solid ${C.cardBd}`,
                  color: C.tm, fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.18em',
                  cursor: 'pointer',
                }}>CANCEL</button>
              <button onClick={submit} disabled={creating}
                style={{
                  flex: 2, padding: '10px', background: C.ac, border: `1px solid ${C.ac}`,
                  color: '#FFFFFF', fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.18em',
                  cursor: 'pointer',
                }}>{creating ? 'CREATING…' : 'CREATE + COPY LINK →'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FormRow({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: '0.18em', fontWeight: 700, marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

const inp = {
  width: '100%', background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`,
  padding: '8px 10px', color: C.tx, fontFamily: FN, fontSize: 13,
  outline: 'none', boxSizing: 'border-box', borderRadius: 0,
};
