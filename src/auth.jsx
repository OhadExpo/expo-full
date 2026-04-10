// src/auth.jsx — Supabase Auth context for EXPO
// Two roles: trainer (Ohad) and client (matched by email in CLIENTS array)
import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from './supabase';
import { C, FN, FB, EXPO_LOGO } from './theme';

// Trainer email(s) — only these get trainer-level access
const TRAINER_EMAILS = ['ohadyproductions@gmail.com'];

const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children, clientList }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState(null); // 'trainer' | 'client' | null
  const [clientId, setClientId] = useState(null); // matched client ID from CLIENTS array

  // Resolve role from email
  const resolveRole = (email) => {
    if (!email) return { role: null, clientId: null };
    const lower = email.toLowerCase();
    if (TRAINER_EMAILS.includes(lower)) return { role: 'trainer', clientId: null };
    // Check client list
    for (const cl of clientList) {
      if (!cl.email) continue;
      const emails = Array.isArray(cl.email) ? cl.email : [cl.email];
      if (emails.some(e => e.toLowerCase() === lower)) return { role: 'client', clientId: cl.id };
    }
    return { role: null, clientId: null };
  };

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s?.user?.email) {
        const r = resolveRole(s.user.email);
        setRole(r.role);
        setClientId(r.clientId);
      }
      setLoading(false);
    });

    // Listen for auth changes (magic link callback, sign out, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user?.email) {
        const r = resolveRole(s.user.email);
        setRole(r.role);
        setClientId(r.clientId);
      } else {
        setRole(null);
        setClientId(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setRole(null);
    setClientId(null);
  };

  const value = { session, user: session?.user || null, role, clientId, loading, signOut };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Login screen — shared between trainer and client
export function LoginScreen() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleLogin = async () => {
    if (!email.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const { error: authError } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: {
          emailRedirectTo: window.location.origin + window.location.pathname,
        },
      });
      if (authError) {
        setError(authError.message);
      } else {
        setSent(true);
      }
    } catch (e) {
      setError('Connection error. Try again.');
    }
    setSubmitting(false);
  };

  if (sent) {
    return (
      <div style={wrapStyle}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <img src={EXPO_LOGO} alt="EXPO" style={{ height: 36, marginBottom: 12 }} />
        </div>
        <div style={cardStyle}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📧</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: C.tx, marginBottom: 8 }}>Check your email</div>
            <div style={{ fontSize: 13, color: C.tm, lineHeight: 1.5 }}>
              We sent a magic link to <strong style={{ color: C.ac }}>{email}</strong>.<br />
              Click the link to log in — no password needed.
            </div>
            <button
              onClick={() => { setSent(false); setEmail(''); }}
              style={{ marginTop: 20, background: 'none', border: `1px solid ${C.bd}`, borderRadius: 8, padding: '10px 20px', color: C.tm, fontFamily: FB, fontSize: 13, cursor: 'pointer' }}
            >
              Use a different email
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={wrapStyle}>
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <img src={EXPO_LOGO} alt="EXPO" style={{ height: 36, marginBottom: 12 }} />
        <div style={{ color: C.tm, fontSize: 15 }}>Training Portal</div>
      </div>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={cardStyle}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.tx, marginBottom: 16 }}>Log in with your email</div>
          <input
            value={email}
            onChange={e => { setEmail(e.target.value); setError(''); }}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            placeholder="your@email.com"
            type="email"
            autoComplete="email"
            autoFocus
            style={{
              width: '100%', background: C.sf2, border: `1px solid ${error ? C.rd : C.bd}`,
              borderRadius: 10, padding: '14px 16px', color: C.tx, fontFamily: FB, fontSize: 15,
              outline: 'none', boxSizing: 'border-box', marginBottom: 12,
            }}
          />
          {error && <div style={{ color: C.rd, fontSize: 12, marginBottom: 10 }}>{error}</div>}
          <button
            onClick={handleLogin}
            disabled={submitting || !email.trim()}
            style={{
              width: '100%', padding: 14, borderRadius: 10, border: 'none',
              background: email.trim() ? C.ac : C.sf3, color: email.trim() ? '#000' : C.td,
              fontFamily: FB, fontSize: 15, fontWeight: 700,
              cursor: email.trim() && !submitting ? 'pointer' : 'default',
              transition: 'all .15s', opacity: submitting ? 0.6 : 1,
            }}
          >
            {submitting ? 'Sending...' : 'Send Magic Link'}
          </button>
          <div style={{ fontSize: 11, color: C.td, marginTop: 12, textAlign: 'center', lineHeight: 1.4 }}>
            No password needed. We'll email you a secure login link.
          </div>
        </div>
      </div>
    </div>
  );
}

// Unauthorized screen — when email doesn't match any known user
export function UnauthorizedScreen({ email, onSignOut }) {
  return (
    <div style={wrapStyle}>
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <img src={EXPO_LOGO} alt="EXPO" style={{ height: 36, marginBottom: 12 }} />
      </div>
      <div style={cardStyle}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: C.tx, marginBottom: 8 }}>Access Denied</div>
          <div style={{ fontSize: 13, color: C.tm, lineHeight: 1.5 }}>
            <strong style={{ color: C.ac }}>{email}</strong> is not registered.<br />
            Contact your trainer to get access.
          </div>
          <button
            onClick={onSignOut}
            style={{ marginTop: 20, background: C.rdD, border: 'none', borderRadius: 8, padding: '10px 20px', color: C.rd, fontFamily: FB, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}

const wrapStyle = {
  background: C.bg, color: C.tx, minHeight: '100vh', fontFamily: FB,
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20,
};

const cardStyle = {
  background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 14, padding: 28,
};
