// F-27 — Public contract signing page. URL: /sign/<token>.
//
// Premium brand-rich layout: EXPO header strip, two-column meta block,
// itemized terms, custom clauses, signature pad (touch + mouse), and a
// big cyan SIGN button. Renders the same legal-bind contract whether
// the athlete opens it on phone or desktop.
//
// Token is the row's `token` column on coaching_contracts. Anon GET is
// allowed via RLS as long as the token matches. The athlete-sign UPDATE
// policy lets them write `athlete_signature` + `athlete_signed_at` but
// nothing else.

import React, { useEffect, useRef, useState } from 'react';
import { C, FN, FB, FH, EXPO_LOGO_NAV } from './theme';
import { supabase } from './supabase';

const isHebrew = (s) => /[֐-׿]/.test(s || '');

export default function ContractSign() {
  const token = window.location.pathname.replace(/^\/sign\//, '').replace(/\/$/, '');
  const [state, setState] = useState({ loading: true, error: null, contract: null });
  const [signed, setSigned] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [agreeChecks, setAgreeChecks] = useState({ adult: false, health: false, terms: false });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('coaching_contracts')
          .select('*')
          .eq('token', token)
          .maybeSingle();
        if (cancelled) return;
        if (error) { setState({ loading: false, error: error.message, contract: null }); return; }
        if (!data) { setState({ loading: false, error: 'Contract not found.', contract: null }); return; }
        setState({ loading: false, error: null, contract: data });
        if (data.athlete_signed_at) setSigned(true);
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: e.message || 'Could not load contract.', contract: null });
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const allAgreed = agreeChecks.adult && agreeChecks.health && agreeChecks.terms;
  const padRef = useRef(null);

  const submit = async (signatureDataUrl) => {
    if (!state.contract || submitting) return;
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('coaching_contracts')
        .update({
          athlete_signature: signatureDataUrl,
          athlete_signed_at: new Date().toISOString(),
          status: 'signed',
        })
        .eq('token', token);
      if (error) throw error;
      setSigned(true);
    } catch (e) {
      alert(`Signing failed: ${e.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (state.loading) {
    return <Shell><div style={{ padding: 60, textAlign: 'center', color: C.tm, fontFamily: FN, letterSpacing: '0.18em', fontWeight: 700 }}>LOADING…</div></Shell>;
  }
  if (state.error || !state.contract) {
    return <Shell>
      <ErrorPanel message={state.error || 'Contract not found.'} />
    </Shell>;
  }

  const c = state.contract;
  return (
    <Shell>
      <CoverHeader contract={c} />
      <MetaBlock contract={c} />
      <TermsBlock contract={c} />
      {c.custom_clauses && <CustomClausesBlock text={c.custom_clauses} />}

      {signed ? (
        <SignedBlock contract={c} />
      ) : (
        <>
          <AgreeChecks agreeChecks={agreeChecks} setAgreeChecks={setAgreeChecks} />
          <SignaturePad ref={padRef} disabled={!allAgreed || submitting} onSubmit={submit} submitting={submitting} />
        </>
      )}

      <Footer />
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div data-theme="dark" style={{
      minHeight: '100vh', background: 'var(--c-bg)', color: 'var(--c-tx)',
      fontFamily: FB, padding: '20px 14px',
    }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        {children}
      </div>
    </div>
  );
}

function CoverHeader({ contract }) {
  return (
    <div style={{
      background: C.ac, color: '#FFFFFF',
      padding: '24px 24px 22px',
      marginBottom: 16,
      position: 'relative', overflow: 'hidden',
    }}>
      <img src={EXPO_LOGO_NAV} alt="EXPO" style={{ height: 36, width: 'auto', marginBottom: 16, filter: 'brightness(0) invert(1)' }} />
      <div style={{ fontFamily: FN, fontSize: 10, letterSpacing: '0.24em', fontWeight: 700, opacity: 0.88, marginBottom: 8 }}>
        COACHING AGREEMENT
      </div>
      <div dir="auto" style={{
        fontFamily: isHebrew(contract.client_name) ? FH : FN,
        fontSize: 24, fontWeight: 800, letterSpacing: '-0.015em', lineHeight: 1.15,
      }}>
        {contract.client_name || 'Unnamed Client'}
      </div>
      <div style={{ fontFamily: FN, fontSize: 11, opacity: 0.78, letterSpacing: '0.06em', marginTop: 6 }}>
        Prepared {new Date(contract.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} · Coach: Ohad — EXPO
      </div>
    </div>
  );
}

function MetaBlock({ contract }) {
  const c = contract;
  const total = (c.monthly_rate || 0) * (c.package_length_months || 1);
  const rows = [
    { l: 'MONTHLY RATE', v: `₪${Math.round(c.monthly_rate || 0).toLocaleString()}` },
    { l: 'SESSIONS / WEEK', v: c.sessions_per_week ? `${c.sessions_per_week}` : '—' },
    { l: 'PACKAGE LENGTH', v: c.package_length_months ? `${c.package_length_months} mo` : 'Open-ended' },
    { l: 'TOTAL (INCL. VAT)', v: `₪${Math.round(total).toLocaleString()}` },
  ];
  return (
    <div style={{
      background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`,
      padding: 18, marginBottom: 14,
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        {rows.map((r, i) => (
          <div key={i} style={{ borderLeft: i === 0 ? 'none' : `1px solid ${C.cardBd}`, paddingLeft: i === 0 ? 0 : 12 }}>
            <div style={{ fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: '0.18em', fontWeight: 700 }}>{r.l}</div>
            <div style={{ fontFamily: FN, fontSize: 18, color: C.tx, fontWeight: 700, marginTop: 4 }}>{r.v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const DEFAULT_TERMS = [
  { h: 'COMMITMENT', b: 'The athlete agrees to follow the prescribed training plan to the best of their ability and report back honestly about adherence, fatigue, and any pain or injury.' },
  { h: 'BILLING', b: 'Payment is monthly in advance, due on the 1st of each calendar month. Late payments after 7 days will pause access to programming until resolved.' },
  { h: 'CANCELLATION', b: '30 days written notice cancels the agreement. Sessions paid in advance for cancelled months are pro-rated and refunded.' },
  { h: 'HEALTH', b: 'The athlete declares they are medically cleared for resistance training. They will disclose any pre-existing condition that could affect safe programming.' },
  { h: 'COMMUNICATION', b: 'WhatsApp + the EXPO app are the primary channels. Programming questions are answered within 24h on weekdays; safety questions same-day.' },
];

function TermsBlock({ contract }) {
  const terms = (contract.terms && Array.isArray(contract.terms)) ? contract.terms : DEFAULT_TERMS;
  return (
    <div style={{
      background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`,
      padding: 18, marginBottom: 14,
    }}>
      <div style={{
        fontFamily: FN, fontSize: 11, color: C.ac, letterSpacing: '0.18em', fontWeight: 700,
        paddingBottom: 8, borderBottom: `1px solid ${C.cardBd}`, marginBottom: 14,
      }}>
        TERMS
      </div>
      {terms.map((t, i) => (
        <div key={i} style={{ marginBottom: i === terms.length - 1 ? 0 : 14 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
            <span style={{ fontFamily: FN, fontSize: 11, color: C.ac, letterSpacing: '0.18em', fontWeight: 700, flexShrink: 0 }}>
              {String(i + 1).padStart(2, '0')}
            </span>
            <span style={{ fontFamily: FN, fontSize: 11, color: C.tx, letterSpacing: '0.18em', fontWeight: 700 }}>
              {t.h}
            </span>
          </div>
          <div dir="auto" style={{
            fontSize: 13, color: C.tx, lineHeight: 1.5, paddingLeft: 24,
            fontFamily: isHebrew(t.b) ? FH : FB,
          }}>{t.b}</div>
        </div>
      ))}
    </div>
  );
}

function CustomClausesBlock({ text }) {
  return (
    <div style={{
      background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderLeft: `3px solid ${C.ac}`,
      padding: 18, marginBottom: 14,
    }}>
      <div style={{
        fontFamily: FN, fontSize: 11, color: C.ac, letterSpacing: '0.18em', fontWeight: 700,
        marginBottom: 10,
      }}>
        CUSTOM CLAUSES
      </div>
      <div dir="auto" style={{
        fontSize: 13, color: C.tx, lineHeight: 1.6, whiteSpace: 'pre-wrap',
        fontFamily: isHebrew(text) ? FH : FB,
      }}>{text}</div>
    </div>
  );
}

function AgreeChecks({ agreeChecks, setAgreeChecks }) {
  const items = [
    { k: 'adult', l: 'I confirm I am 18+ years old or have a legal guardian co-signing.' },
    { k: 'health', l: "I have read the HEALTH clause and have no undisclosed condition that would make resistance training unsafe." },
    { k: 'terms', l: 'I have read and agree to every clause above.' },
  ];
  return (
    <div style={{
      background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`,
      padding: 18, marginBottom: 14,
    }}>
      <div style={{ fontFamily: FN, fontSize: 11, color: C.tm, letterSpacing: '0.18em', fontWeight: 700, marginBottom: 12 }}>
        BEFORE YOU SIGN
      </div>
      {items.map((it, i) => (
        <label key={it.k} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', marginBottom: i === items.length - 1 ? 0 : 8 }}>
          <input type="checkbox" checked={agreeChecks[it.k]} onChange={e => setAgreeChecks({ ...agreeChecks, [it.k]: e.target.checked })}
            style={{ width: 16, height: 16, accentColor: C.ac, marginTop: 2, flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: C.tx, lineHeight: 1.5 }}>{it.l}</span>
        </label>
      ))}
    </div>
  );
}

const SignaturePad = React.forwardRef(function SignaturePad({ disabled, onSubmit, submitting }, ref) {
  const canvasRef = useRef(null);
  const [hasInk, setHasInk] = useState(false);
  const drawingRef = useRef(false);
  const lastRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = cv.getBoundingClientRect();
    cv.width = rect.width * ratio;
    cv.height = rect.height * ratio;
    const ctx = cv.getContext('2d');
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#FFFFFF';
  }, []);

  const getPoint = (e) => {
    const cv = canvasRef.current;
    const rect = cv.getBoundingClientRect();
    const t = e.touches?.[0] || e;
    return { x: t.clientX - rect.left, y: t.clientY - rect.top };
  };

  const onDown = (e) => {
    if (disabled) return;
    e.preventDefault();
    drawingRef.current = true;
    lastRef.current = getPoint(e);
  };
  const onMove = (e) => {
    if (!drawingRef.current || disabled) return;
    e.preventDefault();
    const p = getPoint(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(lastRef.current.x, lastRef.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastRef.current = p;
    if (!hasInk) setHasInk(true);
  };
  const onUp = () => { drawingRef.current = false; };

  const clear = () => {
    const cv = canvasRef.current;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, cv.width, cv.height);
    setHasInk(false);
  };

  const finish = () => {
    if (!hasInk || disabled) return;
    const dataUrl = canvasRef.current.toDataURL('image/png');
    onSubmit(dataUrl);
  };

  return (
    <div style={{
      background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`,
      padding: 18, marginBottom: 14,
      opacity: disabled ? 0.6 : 1, transition: 'opacity 200ms',
    }}>
      <div style={{ fontFamily: FN, fontSize: 11, color: C.ac, letterSpacing: '0.18em', fontWeight: 700, marginBottom: 10 }}>
        SIGN HERE
      </div>
      <div style={{
        background: 'var(--c-bg)', border: `1px solid ${C.cardBd}`,
        height: 160, position: 'relative', marginBottom: 12,
      }}>
        <canvas ref={canvasRef}
          onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
          onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
          style={{ width: '100%', height: '100%', display: 'block', cursor: disabled ? 'not-allowed' : 'crosshair', touchAction: 'none' }} />
        {!hasInk && (
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: C.td, fontFamily: FN, fontSize: 11, letterSpacing: '0.18em', fontWeight: 700,
          }}>DRAW YOUR SIGNATURE</div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={clear} disabled={disabled}
          style={{
            flex: 1, padding: '12px', borderRadius: 0, background: 'transparent',
            border: `1px solid ${C.cardBd}`, color: C.tm, fontFamily: FN, fontSize: 11,
            fontWeight: 700, letterSpacing: '0.18em', cursor: 'pointer',
          }}>CLEAR</button>
        <button onClick={finish} disabled={!hasInk || disabled || submitting}
          style={{
            flex: 2, padding: '12px',
            background: hasInk && !disabled ? C.ac : C.cardBd,
            border: `1px solid ${hasInk && !disabled ? C.ac : C.cardBd}`,
            color: hasInk && !disabled ? '#FFFFFF' : C.td,
            fontFamily: FN, fontSize: 12, fontWeight: 700, letterSpacing: '0.18em',
            cursor: hasInk && !disabled ? 'pointer' : 'not-allowed',
            minWidth: 180, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}>{submitting ? 'SIGNING…' : 'SIGN AGREEMENT →'}</button>
      </div>
    </div>
  );
});

function SignedBlock({ contract }) {
  return (
    <div style={{
      background: 'rgba(46,213,115,0.094)', border: `2px solid ${C.gn}`,
      padding: 24, marginBottom: 14, textAlign: 'center',
    }}>
      <div style={{ fontSize: 36, marginBottom: 8 }}>✓</div>
      <div style={{ fontFamily: FN, fontSize: 14, color: C.gn, letterSpacing: '0.18em', fontWeight: 700, marginBottom: 8 }}>
        AGREEMENT SIGNED
      </div>
      <div style={{ fontFamily: FB, fontSize: 13, color: C.tm, marginBottom: 12 }}>
        Signed {new Date(contract.athlete_signed_at).toLocaleString('en-GB')}.<br/>
        Welcome to EXPO. Your coach will reach out to schedule your first session.
      </div>
      {contract.athlete_signature && (
        <img src={contract.athlete_signature} alt="signature"
          style={{ background: '#FFFFFF', padding: 10, maxWidth: 240, maxHeight: 100, display: 'inline-block' }} />
      )}
    </div>
  );
}

function ErrorPanel({ message }) {
  return (
    <div style={{
      padding: 40, textAlign: 'center',
      border: `1px solid ${C.cardBd}`, background: 'var(--c-sf)',
    }}>
      <div style={{ fontSize: 28, marginBottom: 12 }}>📄</div>
      <div style={{ fontFamily: FN, fontSize: 12, color: C.tm, letterSpacing: '0.12em', fontWeight: 700, marginBottom: 8 }}>
        CONTRACT PROBLEM
      </div>
      <div style={{ fontSize: 13, color: C.td }}>{message}</div>
    </div>
  );
}

function Footer() {
  return (
    <div style={{
      textAlign: 'center', paddingTop: 24, marginTop: 8,
      borderTop: `1px solid ${C.cardBd}`,
      fontFamily: FN, fontSize: 10, color: C.tm, letterSpacing: '0.18em', fontWeight: 700,
    }}>
      BOUND BY ELECTRONIC SIGNATURE · EXPO COACHING
    </div>
  );
}
