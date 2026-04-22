// src/auth.jsx — Supabase Auth context for EXPO
// Two roles: trainer (Ohad) and client (matched by email in CLIENTS array)
import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from './supabase';
import { C, FN, FB, EXPO_LOGO } from './theme';

// Trainer email(s) — only these get trainer-level access
export const TRAINER_EMAILS = ['ohadyproductions@gmail.com'];

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

// Login screen — three ways in: Google OAuth, Apple OAuth, or email+password.
// Sign-in only — accounts are created server-side by the coach (a Supabase
// trigger provisions an auth user with password '1234' whenever a trainee row
// gets an email). No sign-up, no forgot-password flow. If a client forgets
// they can't log in, they contact the coach who resets via Supabase dashboard.
export function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleOAuth = async (provider) => {
    setError('');
    setSubmitting(true);
    try {
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: window.location.origin + window.location.pathname },
      });
      if (authError) setError(authError.message);
    } catch (e) {
      setError('Connection error. Try again.');
    }
    setSubmitting(false);
  };

  const handlePassword = async () => {
    if (!email.trim() || !password) return;
    setError('');
    setSubmitting(true);
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (authError) setError(authError.message);
      // On success, AuthProvider's onAuthStateChange listener picks up the session.
    } catch (e) {
      setError('Connection error. Try again.');
    }
    setSubmitting(false);
  };

  const canSubmit = email.trim() && password && !submitting;

  return (
    <div style={wrapStyle}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <img src={EXPO_LOGO} alt="EXPO" style={{ height: 36, marginBottom: 12 }} />
        <div style={{ color: C.tm, fontSize: 15 }}>Training Portal</div>
      </div>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={cardStyle}>
          {/* OAuth buttons */}
          <button
            onClick={() => handleOAuth('google')}
            disabled={submitting}
            style={{ width: '100%', padding: 12, borderRadius: 10, border: `1px solid ${C.bd}`, background: '#fff', color: '#1f1f1f', fontFamily: FB, fontSize: 14, fontWeight: 600, cursor: submitting ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 10, opacity: submitting ? 0.6 : 1 }}
          >
            <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34.3 5.8 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34.3 5.8 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.3c-2 1.4-4.5 2.5-7.3 2.5-5.2 0-9.6-3.3-11.2-8l-6.5 5C9.5 39.7 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4 5.5l6.3 5.3C41 35.2 44 30 44 24c0-1.3-.1-2.6-.4-3.9z"/></svg>
            Continue with Google
          </button>
          <button
            onClick={() => handleOAuth('apple')}
            disabled={submitting}
            style={{ width: '100%', padding: 12, borderRadius: 10, border: `1px solid ${C.bd}`, background: '#000', color: '#fff', fontFamily: FB, fontSize: 14, fontWeight: 600, cursor: submitting ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 18, opacity: submitting ? 0.6 : 1 }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
            Continue with Apple
          </button>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 14px' }}>
            <div style={{ flex: 1, height: 1, background: C.bd }} />
            <span style={{ fontSize: 11, color: C.td, fontFamily: FN }}>OR</span>
            <div style={{ flex: 1, height: 1, background: C.bd }} />
          </div>

          {/* Email + password */}
          <input
            value={email}
            onChange={e => { setEmail(e.target.value); setError(''); }}
            placeholder="your@email.com"
            type="email"
            autoComplete="email"
            style={{ width: '100%', background: C.sf2, border: `1px solid ${error ? C.rd : C.bd}`, borderRadius: 10, padding: '12px 14px', color: C.tx, fontFamily: FB, fontSize: 14, outline: 'none', boxSizing: 'border-box', marginBottom: 8 }}
          />
          <input
            value={password}
            onChange={e => { setPassword(e.target.value); setError(''); }}
            onKeyDown={e => e.key === 'Enter' && canSubmit && handlePassword()}
            placeholder="password"
            type="password"
            autoComplete="current-password"
            style={{ width: '100%', background: C.sf2, border: `1px solid ${error ? C.rd : C.bd}`, borderRadius: 10, padding: '12px 14px', color: C.tx, fontFamily: FB, fontSize: 14, outline: 'none', boxSizing: 'border-box', marginBottom: 10 }}
          />
          {error && <div style={{ color: C.rd, fontSize: 12, marginBottom: 10 }}>{error}</div>}
          <button
            onClick={handlePassword}
            disabled={!canSubmit}
            style={{ width: '100%', padding: 12, borderRadius: 10, border: 'none', background: canSubmit ? C.ac : C.sf3, color: canSubmit ? '#000' : C.td, fontFamily: FB, fontSize: 14, fontWeight: 700, cursor: canSubmit ? 'pointer' : 'default', opacity: submitting ? 0.6 : 1 }}
          >
            {submitting ? '...' : 'Sign in'}
          </button>
          <div style={{ fontSize: 11, color: C.td, marginTop: 12, textAlign: 'center', lineHeight: 1.4 }}>
            Don't have an account? Contact your trainer.
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
