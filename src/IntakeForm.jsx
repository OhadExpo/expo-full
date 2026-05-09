// IntakeForm — public renderer for /intake/<locale>?t=<token>. Validates
// the token via the verify_intake_token RPC, renders the schema, posts to
// intake_submissions, and marks the token used. Designed to feel like a
// native EXPO surface rather than an ugly Google Form clone.
//
// Hebrew/English routing: locale comes from the URL (`he` or `en`) and
// flips the `dir` attribute on the wrapper. Heebo fallback handles the
// Hebrew text per the existing unicode-range font setup.
import React, { useEffect, useMemo, useState } from 'react';
import { C, FN, FB, FH, EXPO_LOGO_NAV } from './theme';
import { supabase } from './supabase';
import { getForm } from './intakeFormSchemas';

function deriveLocale() {
  const m = (typeof window !== 'undefined' ? window.location.pathname : '').match(/^\/intake\/(he|en)\b/);
  return m ? m[1] : 'he';
}

function deriveToken() {
  if (typeof window === 'undefined') return '';
  const url = new URL(window.location.href);
  return url.searchParams.get('t') || '';
}

const RTL_CHARS = /[֐-׿]/;
const labelDir = (s) => (RTL_CHARS.test(String(s || '')) ? 'rtl' : 'ltr');

function Field({ q, value, onChange, dir }) {
  const inputBase = {
    width: '100%', boxSizing: 'border-box',
    background: 'transparent', border: `0.25px solid ${C.cardBd}`, borderRadius: 0,
    padding: '10px 12px', color: C.tx, fontFamily: FB, fontSize: 14, outline: 'none',
    direction: dir,
  };
  const labelStyle = {
    fontFamily: dir === 'rtl' ? FH : FN, fontSize: 11, fontWeight: 700, color: C.tx, letterSpacing: '0.06em',
    textTransform: 'uppercase', display: 'block', marginBottom: 6, direction: dir,
  };

  const required = q.required ? <span style={{ color: C.rd, marginLeft: 4 }}>*</span> : null;

  if (q.type === 'paragraph') {
    return (
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>{q.label}{required}</label>
        <textarea value={value || ''} onChange={e => onChange(e.target.value)} rows={4}
          style={{ ...inputBase, resize: 'vertical', minHeight: 72 }} />
      </div>
    );
  }
  if (q.type === 'choice') {
    return (
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>{q.label}{required}</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, direction: dir }}>
          {q.choices.map(c => (
            <label key={c} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontFamily: dir === 'rtl' ? FH : FB, fontSize: 14, color: C.tx }}>
              <input type="radio" name={q.id} value={c} checked={value === c}
                onChange={() => onChange(c)} style={{ accentColor: C.ac }} />
              <span>{c}</span>
            </label>
          ))}
        </div>
      </div>
    );
  }
  if (q.type === 'scale') {
    const { min, max, minLabel, maxLabel } = q.scale;
    const items = [];
    for (let n = min; n <= max; n++) items.push(n);
    return (
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>{q.label}{required}</label>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, direction: 'ltr' }}>
          {items.map(n => (
            <label key={n} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer', flex: 1, minWidth: 0 }}>
              <input type="radio" name={q.id} value={n} checked={value === n}
                onChange={() => onChange(n)} style={{ accentColor: C.ac }} />
              <span style={{ fontFamily: FN, fontSize: 13, color: value === n ? C.ac : C.tm, fontWeight: 700 }}>{n}</span>
            </label>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontFamily: dir === 'rtl' ? FH : FB, fontSize: 11, color: C.tm, direction: dir }}>
          <span>{minLabel}</span>
          <span>{maxLabel}</span>
        </div>
      </div>
    );
  }
  if (q.type === 'date') {
    return (
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>{q.label}{required}</label>
        <input type="date" value={value || ''} onChange={e => onChange(e.target.value)} style={inputBase} />
      </div>
    );
  }
  if (q.type === 'number') {
    return (
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>{q.label}{required}</label>
        <input type="number" inputMode="decimal" value={value || ''} onChange={e => onChange(e.target.value)} style={inputBase} />
      </div>
    );
  }
  if (q.type === 'email') {
    return (
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>{q.label}{required}</label>
        <input type="email" autoComplete="email" value={value || ''} onChange={e => onChange(e.target.value)} style={inputBase} />
      </div>
    );
  }
  // short
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={labelStyle}>{q.label}{required}</label>
      <input type="text" value={value || ''} onChange={e => onChange(e.target.value)} style={inputBase} />
    </div>
  );
}

export default function IntakeForm() {
  const [locale] = useState(() => deriveLocale());
  const [token] = useState(() => deriveToken());
  const dir = locale === 'he' ? 'rtl' : 'ltr';

  // 'verifying' | 'no-token' | 'invalid' | 'used' | 'ready' | 'submitting' | 'done' | 'error'
  const [phase, setPhase] = useState(token ? 'verifying' : 'no-token');
  const [tokenInfo, setTokenInfo] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [answers, setAnswers] = useState({});

  // Verify token (or fall back to "open form" mode if no token at all —
  // useful for Ohad's own testing; coach-distributed links always carry a
  // token).
  useEffect(() => {
    if (!token) return;
    let alive = true;
    (async () => {
      try {
        const { data, error } = await supabase.rpc('verify_intake_token', { p_token: token });
        if (!alive) return;
        if (error) { setPhase('error'); setErrorMsg(error.message || 'Token check failed.'); return; }
        const row = (data || [])[0];
        if (!row) { setPhase('invalid'); return; }
        if (row.used) { setPhase('used'); setTokenInfo(row); return; }
        setTokenInfo(row);
        setPhase('ready');
      } catch (e) {
        if (!alive) return;
        setPhase('error'); setErrorMsg(String(e?.message || e));
      }
    })();
    return () => { alive = false; };
  }, [token]);

  // When no token, render the locale's initial form anyway (preview mode).
  // No DB write happens until phase === 'ready'.
  // trainee_id is resolved server-side by submit_intake_form() now — the
  // verify RPC no longer echoes it, so a leaked token can't be used to
  // submit AS a specific trainee from the public form.
  const formType = tokenInfo?.form_type || 'initial';
  const form = useMemo(() => getForm(formType, locale), [formType, locale]);

  const setAnswer = (qid, v) => setAnswers(a => ({ ...a, [qid]: v }));

  const validate = () => {
    if (!form) return 'Form not available.';
    for (const q of form.questions) {
      if (!q.required) continue;
      const v = answers[q.id];
      if (v == null || v === '') return `Missing: ${q.label}`;
    }
    return null;
  };

  const onSubmit = async () => {
    const err = validate();
    if (err) { setErrorMsg(err); return; }
    setErrorMsg('');
    setPhase('submitting');
    try {
      // Token-bearing submissions: route through the server-side RPC so
      // trainee_id is resolved from the token by SECURITY DEFINER code.
      // The RPC also marks the token used atomically.
      if (token) {
        const { data, error } = await supabase.rpc('submit_intake_form', {
          p_token: token,
          p_payload: answers,
          p_email: String(answers.email || '').trim() || null,
          p_name:  String(answers.name  || '').trim() || null,
        });
        if (error) throw error;
        if (!data) {
          // Token race: was used between verify and submit, or invalidated.
          setPhase('used');
          return;
        }
        setPhase('done');
        return;
      }
      // No token at all (Ohad's preview-mode testing): the anon INSERT
      // policy was removed in the 2026-05-07 migration, so this path now
      // requires the trainer to be signed in. We surface a clear message
      // rather than letting the RLS error reach the UI.
      setPhase('ready');
      setErrorMsg('Submitting without a coach link requires sign-in. Ask Ohad for an intake link.');
    } catch (e) {
      setPhase('ready');
      setErrorMsg(String(e?.message || e) || 'Submit failed — try again.');
    }
  };

  const wrapper = {
    minHeight: '100vh', background: C.bg, color: C.tx,
    padding: '40px 20px', display: 'flex', justifyContent: 'center',
  };
  const card = {
    width: '100%', maxWidth: 720,
    background: 'transparent', border: `0.25px solid ${C.cardBd}`, padding: '32px 28px',
    direction: dir, fontFamily: dir === 'rtl' ? FH : FB,
  };

  if (phase === 'verifying') {
    return (
      <div data-theme="dark" style={wrapper}><div style={card}>
        <div style={{ textAlign: 'center', color: C.tm, fontFamily: FN, fontSize: 12 }}>
          {dir === 'rtl' ? 'בודק את הקישור…' : 'Checking link…'}
        </div>
      </div></div>
    );
  }
  if (phase === 'invalid') {
    return (
      <div data-theme="dark" style={wrapper}><div style={card}>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ fontFamily: FN, fontSize: 18, color: C.rd, margin: 0 }}>
            {dir === 'rtl' ? 'הקישור אינו תקף' : 'Link not valid'}
          </h2>
          <p style={{ fontSize: 14, color: C.tm, marginTop: 12 }}>
            {dir === 'rtl' ? 'בקש/י קישור חדש מהמאמן.' : 'Ask the coach for a new link.'}
          </p>
        </div>
      </div></div>
    );
  }
  if (phase === 'used') {
    return (
      <div data-theme="dark" style={wrapper}><div style={card}>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ fontFamily: FN, fontSize: 18, color: C.or, margin: 0 }}>
            {dir === 'rtl' ? 'הקישור כבר שומש' : 'Link already used'}
          </h2>
          <p style={{ fontSize: 14, color: C.tm, marginTop: 12 }}>
            {dir === 'rtl' ? 'אם זה היה בטעות — בקש/י קישור חדש מהמאמן.' : 'If that was a mistake, ask the coach for a fresh link.'}
          </p>
        </div>
      </div></div>
    );
  }
  if (phase === 'done') {
    return (
      <div data-theme="dark" style={wrapper}><div style={card}>
        <div style={{ textAlign: 'center' }}>
          <img src={EXPO_LOGO_NAV} alt="EXPO" style={{ height: 36, marginBottom: 16, opacity: 0.9 }} />
          <h2 style={{ fontFamily: FN, fontSize: 22, color: C.ac, margin: 0 }}>{form?.thanksTitle}</h2>
          <p style={{ fontSize: 15, color: C.tx, marginTop: 16 }}>{form?.thanksBody}</p>
        </div>
      </div></div>
    );
  }
  if (phase === 'error') {
    return (
      <div data-theme="dark" style={wrapper}><div style={card}>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ fontFamily: FN, fontSize: 18, color: C.rd, margin: 0 }}>
            {dir === 'rtl' ? 'אירעה תקלה' : 'Something went wrong'}
          </h2>
          <p style={{ fontSize: 13, color: C.tm, marginTop: 12 }}>{errorMsg}</p>
        </div>
      </div></div>
    );
  }
  if (phase === 'no-token') {
    // Preview mode — show the form but don't submit. Useful for Ohad's QA.
    // Real prospects will always have a ?t= since the link is what was sent.
    return (
      <div data-theme="dark" style={wrapper}><div style={card}>
        <div style={{ textAlign: 'center', color: C.or, fontFamily: FN, fontSize: 11, marginBottom: 16 }}>
          PREVIEW · NO TOKEN · {dir === 'rtl' ? 'הקישור החי כולל את t= בכתובת' : 'Live link must include ?t=...'}
        </div>
        <h2 style={{ fontFamily: FN, fontSize: 22, color: C.tx, margin: '0 0 8px' }}>{form?.title}</h2>
        <p style={{ fontSize: 13, color: C.tm, marginTop: 0, marginBottom: 24, lineHeight: 1.5 }}>{form?.intro}</p>
        {(form?.questions || []).map(q => (
          <Field key={q.id} q={q} value={answers[q.id]} onChange={v => setAnswer(q.id, v)} dir={labelDir(q.label)} />
        ))}
        <button disabled style={{ background: 'transparent', border: `0.25px solid ${C.tm}`, color: C.tm, padding: '12px 24px', fontFamily: FN, fontSize: 13, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', borderRadius: 0, marginTop: 12, opacity: 0.5 }}>
          {form?.submitLabel || 'Submit'} (preview)
        </button>
      </div></div>
    );
  }

  // ready / submitting
  return (
    <div data-theme="dark" style={wrapper}><div style={card}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <img src={EXPO_LOGO_NAV} alt="EXPO" style={{ height: 36, opacity: 0.85, marginBottom: 12 }} />
        <h2 style={{ fontFamily: FN, fontSize: 22, color: C.tx, margin: '0 0 8px' }}>{form?.title}</h2>
        <p style={{ fontSize: 13, color: C.tm, margin: 0, lineHeight: 1.5 }}>{form?.intro}</p>
      </div>
      {(form?.questions || []).map(q => (
        <Field key={q.id} q={q} value={answers[q.id]} onChange={v => setAnswer(q.id, v)} dir={labelDir(q.label)} />
      ))}
      {errorMsg && (
        <div style={{ color: C.rd, fontFamily: FN, fontSize: 12, marginBottom: 12, textAlign: 'center' }}>{errorMsg}</div>
      )}
      <div style={{ display: 'flex', justifyContent: dir === 'rtl' ? 'flex-start' : 'flex-end', marginTop: 12 }}>
        <button onClick={onSubmit} disabled={phase === 'submitting'}
          style={{ background: 'transparent', border: `1px solid ${C.ac}`, color: C.ac, padding: '12px 28px', fontFamily: FN, fontSize: 13, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', borderRadius: 0, cursor: phase === 'submitting' ? 'wait' : 'pointer', opacity: phase === 'submitting' ? 0.5 : 1 }}>
          {phase === 'submitting' ? (dir === 'rtl' ? 'שולח…' : 'Submitting…') : form?.submitLabel}
        </button>
      </div>
    </div></div>
  );
}
