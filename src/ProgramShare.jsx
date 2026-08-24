// F-18 — Public program share page. URL: /p/<token>.
//
// Anonymous visitors land here from a link the coach shared (Instagram
// caption / DM / WhatsApp). The page resolves the token via the
// `get_shared_program(p_token)` SECURITY DEFINER RPC, which scrubs PII
// (trainee identity stays server-side) and returns just the plan name +
// day structure + warmup. The plan is rendered read-only with the same
// EXPO brand chrome as the trainee portal — the visitor gets a real
// taste of what the system feels like.
//
// CTA at the bottom routes to /try (TrySandbox) so a curious visitor
// can poke at the rep counter / pose engine without signing up.

import React, { useEffect, useState } from 'react';
import { C, FN, FB, FH, EXPO_LOGO_NAV } from './theme';
import { supabase } from './supabase';

const isHebrew = (s) => /[֐-׿]/.test(s || '');

export default function ProgramShare() {
  const token = window.location.pathname.replace(/^\/p\//, '').replace(/\/$/, '');
  const [state, setState] = useState({ loading: true, error: null, plan: null });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.rpc('get_shared_program', { p_token: token });
        if (cancelled) return;
        if (error) {
          setState({ loading: false, error: error.message, plan: null });
          return;
        }
        // SECURITY DEFINER function returns either a single row (object) or
        // an array depending on Postgres versions. Normalize.
        const plan = Array.isArray(data) ? data[0] : data;
        if (!plan) {
          setState({ loading: false, error: 'Link not found or expired.', plan: null });
          return;
        }
        setState({ loading: false, error: null, plan });
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: e.message || 'Could not load program.', plan: null });
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  return (
    <div data-theme="dark" style={{
      minHeight: '100vh', background: 'var(--c-bg)', color: 'var(--c-tx)',
      fontFamily: FB, padding: '24px 16px',
    }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <Header />
        {state.loading && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--c-tm)', fontFamily: FN, letterSpacing: '0.12em', fontWeight: 700 }}>
            LOADING…
          </div>
        )}
        {state.error && !state.loading && (
          <ErrorState message={state.error} />
        )}
        {state.plan && !state.loading && (
          <PlanReadOnly plan={state.plan} />
        )}
        <Footer />
      </div>
    </div>
  );
}

function Header() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      borderBottom: `1px solid var(--c-cardBd)`, paddingBottom: 16, marginBottom: 20,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <img src={EXPO_LOGO_NAV} alt="EXPO" style={{ height: 36, width: 'auto' }} />
        <span style={{ fontFamily: FN, fontSize: 11, color: 'var(--c-tm)', letterSpacing: '0.18em', fontWeight: 700 }}>
          SHARED PROGRAM
        </span>
      </div>
      <a href="/try" style={{
        fontFamily: FN, fontSize: 10, color: 'var(--c-ac)', letterSpacing: '0.12em',
        fontWeight: 700, padding: '6px 14px', border: `1px solid var(--c-ac)`,
        textDecoration: 'none',
      }}>TRY THE SANDBOX →</a>
    </div>
  );
}

function ErrorState({ message }) {
  return (
    <div style={{
      padding: 40, textAlign: 'center',
      border: `1px solid var(--c-cardBd)`,
      background: 'var(--c-sf)',
    }}>
      <div style={{ fontSize: 28, marginBottom: 12 }}>🔗</div>
      <div style={{ fontFamily: FN, fontSize: 12, color: 'var(--c-tm)', letterSpacing: '0.12em', fontWeight: 700, marginBottom: 8 }}>
        SHARE LINK PROBLEM
      </div>
      <div style={{ fontSize: 13, color: 'var(--c-td)', marginBottom: 20 }}>{message}</div>
      <a href="/" style={{
        fontFamily: FN, fontSize: 11, color: 'var(--c-ac)', letterSpacing: '0.12em',
        fontWeight: 700, textDecoration: 'none', padding: '6px 14px',
        border: `1px solid var(--c-ac)`,
      }}>GO HOME →</a>
    </div>
  );
}

function PlanReadOnly({ plan }) {
  const data = plan.plan_data || plan.data || {};
  const days = Array.isArray(data.days) ? data.days : [];
  const warmup = Array.isArray(data.warmup) ? data.warmup : [];
  return (
    <>
      <div style={{
        background: 'var(--c-sf)', border: `1px solid var(--c-cardBd)`,
        padding: 20, marginBottom: 20,
      }}>
        <div style={{ fontFamily: FN, fontSize: 10, color: 'var(--c-tm)', letterSpacing: '0.18em', fontWeight: 700, marginBottom: 6 }}>
          PROGRAM
        </div>
        <h1 dir="auto" style={{
          margin: 0, fontFamily: isHebrew(plan.name) ? FH : FN,
          fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em',
          color: 'var(--c-tx)',
        }}>{plan.name || 'Untitled Program'}</h1>
        {plan.phase && (
          <div style={{ fontFamily: FN, fontSize: 11, color: 'var(--c-ac)', letterSpacing: '0.08em', marginTop: 4, fontWeight: 700 }}>
            {plan.phase}
          </div>
        )}
      </div>

      {warmup.length > 0 && (
        <SectionCard label={`WARM-UP (${warmup.length})`}>
          {warmup.map((w, i) => (
            <ExerciseLine key={i} idx={i} ex={w} />
          ))}
        </SectionCard>
      )}

      {days.map((d, di) => {
        const dayLabel = d?.name || d?.title;
        return (
          <SectionCard key={di} label={`DAY ${String.fromCharCode(65 + di)}${dayLabel ? ' · ' + dayLabel : ''}`}>
            {/* Plans exist in two shapes: new (d.exercises / sets / reps) and
                old (d.ex / s / r, names enriched server-side from the eid). */}
            {/* .filter(Boolean): a null exercise element renders a blank page on
                the PUBLIC share link — the one surface a client sees before they
                are a client. The portal filters the same data for the same
                reason (audit 08-22 #42). */}
            {(d?.exercises || d?.ex || []).filter(Boolean).map((ex, ei) => (
              <ExerciseLine key={ei} idx={ei} ex={ex} />
            ))}
          </SectionCard>
        );
      })}

      {days.length === 0 && warmup.length === 0 && (
        <div style={{
          padding: 24, textAlign: 'center', color: 'var(--c-td)', fontSize: 13,
          border: `1px solid var(--c-cardBd)`, background: 'var(--c-sf)',
        }}>
          This program is empty. The coach may still be putting it together.
        </div>
      )}
    </>
  );
}

function SectionCard({ label, children }) {
  return (
    <div style={{ background: 'var(--c-sf)', border: `1px solid var(--c-cardBd)`, marginBottom: 14, overflow: 'hidden' }}>
      <div style={{
        background: 'var(--c-ac)', color: '#FFFFFF',
        padding: '10px 16px', fontFamily: FN, fontSize: 11,
        letterSpacing: '0.18em', fontWeight: 700,
      }}>{label}</div>
      <div style={{ padding: 12 }}>
        {children}
      </div>
    </div>
  );
}

function ExerciseLine({ idx, ex }) {
  const name = ex?.name || ex?.title || ex?.ex || 'Exercise';
  const sets = ex?.sets ?? ex?.s;
  const reps = ex?.reps ?? ex?.r;
  const notes = ex?.notes || ex?.coachNotes || ex?.n;
  const heb = isHebrew(name);
  return (
    <div style={{
      display: 'flex', gap: 12, alignItems: 'flex-start',
      padding: '8px 0', borderBottom: `1px solid var(--c-cardBd)`,
    }}>
      <div style={{ flexShrink: 0, width: 22, color: 'var(--c-td)', fontFamily: FN, fontSize: 11, fontWeight: 700, textAlign: 'right' }}>
        {idx + 1}.
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div dir="auto" style={{ fontSize: 14, color: 'var(--c-tx)', fontFamily: heb ? FH : FB, fontWeight: 600 }}>
          {name}
        </div>
        {(sets || reps) && (
          <div style={{ fontFamily: FN, fontSize: 11, color: 'var(--c-tm)', letterSpacing: '0.04em', marginTop: 2 }}>
            {sets ? `${sets} × ` : ''}{reps || ''}
          </div>
        )}
        {notes && (
          <div dir="auto" style={{ fontSize: 12, color: 'var(--c-td)', marginTop: 4, fontStyle: 'italic', fontFamily: isHebrew(notes) ? FH : FB }}>
            {notes}
          </div>
        )}
      </div>
    </div>
  );
}

function Footer() {
  return (
    <div style={{
      marginTop: 32, paddingTop: 20, borderTop: `1px solid var(--c-cardBd)`,
      textAlign: 'center',
    }}>
      <div style={{ fontFamily: FN, fontSize: 11, color: 'var(--c-tm)', letterSpacing: '0.12em', fontWeight: 700, marginBottom: 12 }}>
        BUILT WITH EXPO · AI-NATIVE COACHING PLATFORM
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
        <a href="/coaches" style={{
          fontFamily: FN, fontSize: 11, color: 'var(--c-ac)', letterSpacing: '0.12em',
          fontWeight: 700, padding: '8px 18px', border: `1px solid var(--c-ac)`, textDecoration: 'none',
        }}>FOR COACHES →</a>
        <a href="/try" style={{
          fontFamily: FN, fontSize: 11, color: 'var(--c-tx)', letterSpacing: '0.12em',
          fontWeight: 700, padding: '8px 18px', border: `1px solid var(--c-cardBd)`, textDecoration: 'none',
        }}>TRY THE PLATFORM</a>
      </div>
    </div>
  );
}
