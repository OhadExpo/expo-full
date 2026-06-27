// src/auth.jsx — Supabase Auth context for EXPO
// Two roles: trainer (Ohad) and client (matched by email in CLIENTS array)
import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from './supabase';
import { onSaveError } from './useSupaStore';
import { subscribe as subscribeQueue, drain as drainQueue, getCount as getQueueCount } from './offlineQueue';
import { subscribe as subscribeBlobs, drainBlobs } from './blobQueue';
import { C, FN, FB, FH, EXPO_LOGO } from './theme';
import { useEscClose } from './ui';

// Coach access tiers.
//  • OWNER  = Ohad — full coach portal (money, leads/marketing, owner tools).
//  • STAFF  = limited-access assistants (e.g. Yuval) — reach the coach portal
//             but see a reduced top-nav (Tasks + Athletes + Review) and are
//             walled off from Billing / Incoming / Dashboard revenue / owner
//             tools. They share Ohad's data (NOT a separate tenant), so the
//             gating is UI-only on the frontend + email-allowlist on RLS.
// TRAINER_EMAILS = everyone who gets coach-portal access at all. Existing
// `TRAINER_EMAILS.includes(...)` checks stay correct because staff ARE trainers.
export const OWNER_EMAILS = ['ohadyproductions@gmail.com'];
export const STAFF_EMAILS = ['yuvalberkovitch@gmail.com'];
export const TRAINER_EMAILS = [...OWNER_EMAILS, ...STAFF_EMAILS];
export const isOwnerEmail = (email) => !!email && OWNER_EMAILS.includes(email.toLowerCase());
export const isStaffEmail = (email) => !!email && STAFF_EMAILS.includes(email.toLowerCase());

const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children, clientList }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState(null); // 'trainer' | 'client' | 'both' | null
  const [clientId, setClientId] = useState(null); // matched client ID from CLIENTS array

  // Resolve role from email. 'both' = same email is in TRAINER_EMAILS *and*
  // matches a trainee row — these accounts get a portal-picker after login
  // (see RolePickerScreen). Pure trainers get role='trainer' with no clientId,
  // pure clients get role='client' with their matched id.
  const resolveRole = (email) => {
    if (!email) return { role: null, clientId: null };
    const lower = email.toLowerCase();
    const isTrainer = TRAINER_EMAILS.includes(lower);
    let matchedClientId = null;
    for (const cl of clientList) {
      if (!cl.email) continue;
      const emails = Array.isArray(cl.email) ? cl.email : [cl.email];
      if (emails.some(e => e.toLowerCase() === lower)) { matchedClientId = cl.id; break; }
    }
    if (isTrainer && matchedClientId) return { role: 'both', clientId: matchedClientId };
    if (isTrainer) return { role: 'trainer', clientId: null };
    if (matchedClientId) return { role: 'client', clientId: matchedClientId };
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

// Login screen — two ways in: Google OAuth or email+password.
// Sign-in only — accounts are created server-side by the coach (a Supabase
// trigger provisions an auth user with password '1234' whenever a trainee row
// gets an email). No sign-up, no forgot-password flow. If a client forgets
// they can't log in, they contact the coach who resets via Supabase dashboard.
export function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // PWA install. Chrome/Edge/Android fire `beforeinstallprompt` once engagement
  // criteria are met; we capture it and replay on user click for one-tap install.
  // iOS Safari has no programmatic install API — Apple requires the user to use
  // the Share menu manually, so we fall back to inline instructions there.
  const [installPrompt, setInstallPrompt] = useState(null);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const isStandalone = typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true);
  const isIOS = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent);

  useEffect(() => {
    const handler = (e) => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener('beforeinstallprompt', handler);
    const installed = () => setInstallPrompt(null);
    window.addEventListener('appinstalled', installed);
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);

  const handleInstall = async () => {
    if (installPrompt) {
      installPrompt.prompt();
      try { await installPrompt.userChoice; } catch {}
      setInstallPrompt(null);
      return;
    }
    setShowInstallHelp(true);
  };

  const handleOAuth = async (provider) => {
    setError('');
    setSubmitting(true);
    try {
      // skipBrowserRedirect lets us handle the redirect manually; without it
      // Supabase navigates to /auth/v1/authorize?provider=... and if the
      // provider isn't enabled the user lands on a raw JSON error page with
      // no back button. By handling redirect here we keep errors in-app.
      const { data, error: authError } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: window.location.origin + window.location.pathname,
          skipBrowserRedirect: true,
        },
      });
      if (authError) { setError(authError.message); setSubmitting(false); return; }
      if (!data?.url) { setError(`${provider} sign-in is not configured yet.`); setSubmitting(false); return; }
      // Pre-flight: HEAD the authorize URL to detect "provider not enabled"
      // before redirecting. Supabase returns 400 JSON in that case.
      try {
        const probe = await fetch(data.url, { method: 'GET', redirect: 'manual' });
        if (probe.status >= 400 && probe.status < 500) {
          let msg = `${provider} sign-in is not configured.`;
          try { const body = await probe.json(); if (body?.msg) msg = body.msg; } catch {}
          setError(msg); setSubmitting(false); return;
        }
      } catch {} // Opaque/CORS failures are fine — the real redirect will work.
      window.location.href = data.url;
    } catch (e) {
      setError('Connection error. Try again.');
      setSubmitting(false);
    }
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
    <div data-theme="dark" style={wrapStyle}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 16, padding: '0 28px', boxSizing: 'border-box' }}>
          <a href="/" title="Back to sign in / for coaches"
            onClick={() => { try { sessionStorage.setItem('expo-marketing', '1'); } catch { /* noop */ } }}
            style={{ display: 'block', textDecoration: 'none' }}>
            <img src={EXPO_LOGO} alt="EXPO" style={{ display: 'block', width: '100%', height: 'auto', maxHeight: '20vh', objectFit: 'contain', marginBottom: 77 }} />
          </a>
          <div style={{ color: C.tm, fontSize: 15 }}>Sign<span style={{ color: C.td }}>-</span>in</div>
        </div>
        <div style={cardStyle}>
          {/* OAuth buttons */}
          <button
            onClick={() => handleOAuth('google')}
            disabled={submitting}
            style={{ width: '100%', padding: 12, borderRadius: 0, border: `1px solid ${C.cardBd}`, background: '#fff', color: '#1f1f1f', fontFamily: FB, fontSize: 14, fontWeight: 600, cursor: submitting ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 10, opacity: submitting ? 0.6 : 1 }}
          >
            <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34.3 5.8 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34.3 5.8 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.3c-2 1.4-4.5 2.5-7.3 2.5-5.2 0-9.6-3.3-11.2-8l-6.5 5C9.5 39.7 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4 5.5l6.3 5.3C41 35.2 44 30 44 24c0-1.3-.1-2.6-.4-3.9z"/></svg>
            Continue with Google
          </button>

          <div style={{ marginBottom: 18 }} />

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 14px' }}>
            <div style={{ flex: 1, height: 1, background: `${C.cardBd}` }} />
            <span style={{ fontSize: 9, color: C.tm, fontFamily: FN, letterSpacing: '0.18em', fontWeight: 700 }}>OR</span>
            <div style={{ flex: 1, height: 1, background: `${C.cardBd}` }} />
          </div>

          {/* Email + password */}
          <input
            value={email}
            onChange={e => { setEmail(e.target.value); setError(''); }}
            placeholder="your@email.com"
            type="email"
            autoComplete="email"
            style={{ width: '100%', background: 'var(--c-sf)', border: `1px solid ${error ? C.rd : C.cardBd}`, borderRadius: 0, padding: '12px 14px', color: C.tx, fontFamily: FB, fontSize: 14, outline: 'none', boxSizing: 'border-box', marginBottom: 8, textAlign: 'center' }}
          />
          <input
            value={password}
            onChange={e => { setPassword(e.target.value); setError(''); }}
            onKeyDown={e => e.key === 'Enter' && canSubmit && handlePassword()}
            placeholder="password"
            type="password"
            autoComplete="current-password"
            style={{ width: '100%', background: 'var(--c-sf)', border: `1px solid ${error ? C.rd : C.cardBd}`, borderRadius: 0, padding: '12px 14px', color: C.tx, fontFamily: FB, fontSize: 14, outline: 'none', boxSizing: 'border-box', marginBottom: 10, textAlign: 'center' }}
          />
          {error && <div style={{ color: C.rd, fontSize: 12, marginBottom: 10, textAlign: 'center' }}>{error}</div>}
          <button
            onClick={handlePassword}
            disabled={!canSubmit}
            style={{ width: '100%', padding: 12, borderRadius: 0, border: `1px solid ${canSubmit ? C.ac : C.cardBd}`, background: 'transparent', color: canSubmit ? C.ac : C.tm, fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', cursor: canSubmit ? 'pointer' : 'default', opacity: submitting ? 0.6 : 1 }}
          >
            {submitting ? '...' : 'Sign in'}
          </button>
          <div style={{ fontSize: 11, color: C.td, marginTop: 12, textAlign: 'center', lineHeight: 1.4 }}>
            Don't have an account? Contact your coach.
          </div>
        </div>
        {!isStandalone && (
          <button
            onClick={handleInstall}
            style={{ width: '100%', marginTop: 16, padding: showInstallHelp ? '14px 16px' : 12, borderRadius: 0, border: `1px solid ${C.cardBd}`, background: 'transparent', color: C.tm, fontFamily: FB, fontSize: showInstallHelp ? 12 : 14, fontWeight: showInstallHelp ? 400 : 600, cursor: 'pointer', lineHeight: showInstallHelp ? 1.5 : 1.2, textAlign: 'center' }}
          >
            {showInstallHelp
              ? (isIOS
                  ? <>1. Tap <svg width="12" height="14" viewBox="0 0 16 20" style={{ verticalAlign: '-2px', margin: '0 2px' }}><path fill="none" stroke={C.tm} strokeWidth="1.5" d="M8 1v12M4 5l4-4 4 4M2 9h2v9h8V9h2v11H2z"/></svg> at the bottom of Safari<br/>2. Tap "Add to Home Screen"</>
                  : 'Open your browser menu and choose "Install app" or "Add to Home Screen".')
              : 'Add to Home Screen'}
          </button>
        )}
      </div>
    </div>
  );
}

// Password change modal — simple overlay triggered from the portal or
// trainer header. Calls supabase.auth.updateUser({ password }) which
// hashes and rotates the password in auth.users under the current session.
// Closes on success; surfaces Supabase errors inline.
export function PasswordChangeModal({ onClose, demoMode = false }) {
  const auth = useAuth();
  const email = auth?.session?.user?.email || '';
  const [currentPw, setCurrentPw] = useState('');
  const [pw, setPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEscClose(true, () => { if (!saving) onClose(); }); // Escape closes (not mid-save)
  const [ok, setOk] = useState(false);

  const handleSave = async () => {
    setError('');
    // Preview / sandbox (coach viewing-as an athlete): NEVER touch auth. The
    // live session here is the COACH's, so a real updateUser would rotate the
    // COACH's password. Hard no-op with a clear notice.
    if (demoMode) { setError('Password changes are disabled in preview.'); return; }
    if (!currentPw) { setError('Enter your current password.'); return; }
    if (pw.length < 4) { setError('New password must be at least 4 characters.'); return; }
    if (pw !== confirmPw) { setError("Passwords don't match."); return; }
    setSaving(true);
    try {
      // Verify the current password by attempting a sign-in with it. If it
      // fails, we stop — without this check, any logged-in session could
      // silently rotate the password (bad if the user left a device unlocked).
      // Email comes from the live session so nobody can swap identities here.
      if (!email) { setError('Session lost. Sign out and back in, then retry.'); setSaving(false); return; }
      const { error: verifyError } = await supabase.auth.signInWithPassword({ email, password: currentPw });
      if (verifyError) { setError('Current password is incorrect.'); setSaving(false); return; }
      const { error: authError } = await supabase.auth.updateUser({ password: pw });
      if (authError) { setError(authError.message); setSaving(false); return; }
      setOk(true);
      setTimeout(onClose, 1200);
    } catch (e) {
      setError('Connection error. Try again.');
      setSaving(false);
    }
  };

  return (
    <div onClick={onClose} role="dialog" aria-modal="true" aria-label="Change password" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.bg, border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: 24, maxWidth: 360, width: '100%' }}>
        <div style={{ fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: '0.18em', fontWeight: 700, marginBottom: 12, textAlign: 'center' }}>CHANGE PASSWORD</div>
        {ok ? (
          <div style={{ color: C.gn, fontSize: 14, textAlign: 'center', padding: '20px 0' }}>Password updated ✓</div>
        ) : (
          <>
            <input value={currentPw} onChange={e => { setCurrentPw(e.target.value); setError(''); }} type="password" placeholder="Current password" autoComplete="current-password" autoFocus
              style={{ width: '100%', background: 'var(--c-sf)', border: `1px solid ${error ? C.rd : C.cardBd}`, borderRadius: 0, padding: '12px 14px', color: C.tx, fontFamily: FB, fontSize: 14, outline: 'none', boxSizing: 'border-box', marginBottom: 10, textAlign: 'center' }} />
            <input value={pw} onChange={e => { setPw(e.target.value); setError(''); }} type="password" placeholder="New password" autoComplete="new-password"
              style={{ width: '100%', background: 'var(--c-sf)', border: `1px solid ${error ? C.rd : C.cardBd}`, borderRadius: 0, padding: '12px 14px', color: C.tx, fontFamily: FB, fontSize: 14, outline: 'none', boxSizing: 'border-box', marginBottom: 10, textAlign: 'center' }} />
            <input value={confirmPw} onChange={e => { setConfirmPw(e.target.value); setError(''); }} onKeyDown={e => e.key === 'Enter' && handleSave()} type="password" placeholder="Confirm new password" autoComplete="new-password"
              style={{ width: '100%', background: 'var(--c-sf)', border: `1px solid ${error ? C.rd : C.cardBd}`, borderRadius: 0, padding: '12px 14px', color: C.tx, fontFamily: FB, fontSize: 14, outline: 'none', boxSizing: 'border-box', marginBottom: 10, textAlign: 'center' }} />
            {error && <div style={{ color: C.rd, fontSize: 12, marginBottom: 10, textAlign: 'center' }}>{error}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={onClose} style={{ flex: 1, padding: '10px 0', borderRadius: 0, border: `1px solid ${C.cardBd}`, background: 'transparent', color: C.tm, fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', cursor: 'pointer' }}>Cancel</button>
              {(() => { const canSave = !saving && !demoMode && currentPw && pw && confirmPw; return (
              <button onClick={handleSave} disabled={!canSave} title={demoMode ? 'Disabled in preview' : undefined} style={{ flex: 1, padding: '10px 0', borderRadius: 0, border: `1px solid ${canSave ? C.ac : C.cardBd}`, background: 'transparent', color: canSave ? C.ac : C.tm, fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', cursor: canSave ? 'pointer' : 'not-allowed', opacity: demoMode ? 0.5 : 1, minWidth: 72, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{saving ? '...' : 'Save'}</button>
              ); })()}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Toast for Supabase write failures. Subscribes to useSupaStore's
// onSaveError bus; every silent catch() now surfaces as a visible
// red card bottom-right, auto-dismissed after 5s. Stacks up to 3.
// Each error also keeps a unique id so re-renders don't churn entries.
// Mount this once at the authed-app root (App.jsx) — everything else
// is fire-and-forget module state, no props needed.
export function SaveErrorToast() {
  const [errors, setErrors] = useState([]);
  useEffect(() => {
    return onSaveError((e) => {
      const id = Date.now() + Math.random();
      setErrors(prev => [...prev, { id, ...e }].slice(-3));
      setTimeout(() => setErrors(prev => prev.filter(x => x.id !== id)), 5000);
    });
  }, []);
  if (errors.length === 0) return null;
  return (
    <div style={{ position: 'fixed', bottom: 20, right: 20, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 2000, maxWidth: 360 }}>
      {errors.map(e => (
        <div key={e.id} style={{ background: C.bg, border: `1px solid ${C.rd || '#c94444'}`, color: C.rd || '#ff6b6b', borderRadius: 0, padding: '12px 14px', fontFamily: FB, fontSize: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
          <div style={{ fontFamily: FN, fontWeight: 700, fontSize: 9, letterSpacing: '0.18em', marginBottom: 4 }}>SAVE FAILED — {e.key} · {e.op}</div>
          <div style={{ color: C.tx, fontSize: 12 }}>{e.msg}</div>
          {/* A dropped/unstorable VIDEO is gone — don't claim it's "still in
              local memory" (it isn't). Text writes that failed ARE retained in
              the local cache, so keep the reassuring line only for those. */}
          <div style={{ color: C.tm, fontSize: 10, marginTop: 4 }}>{e.key === 'form_video' ? 'This recording was not saved — record and upload it again.' : 'Your data is still in local memory. Check connection and retry.'}</div>
        </div>
      ))}
    </div>
  );
}

// Connectivity + queue indicator. Sits bottom-left so it doesn't fight with
// the SaveErrorToast (bottom-right). Hidden completely when online and the
// queue is empty — no chrome unless something is actually pending or off.
export function OfflineStatusPill() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [opCount, setOpCount] = useState(() => { try { return getQueueCount(); } catch { return 0; } });
  const [blobCount, setBlobCount] = useState(0);
  useEffect(() => {
    const onUp = () => { setOnline(true); drainQueue(); drainBlobs(); };
    const onDown = () => setOnline(false);
    window.addEventListener('online', onUp);
    window.addEventListener('offline', onDown);
    const unsub1 = subscribeQueue(setOpCount);
    const unsub2 = subscribeBlobs(setBlobCount);
    return () => {
      window.removeEventListener('online', onUp);
      window.removeEventListener('offline', onDown);
      unsub1(); unsub2();
    };
  }, []);
  const total = opCount + blobCount;
  if (online && total === 0) return null;
  const offline = !online;
  const bg = offline ? (C.rdD || '#3a1a1a') : (C.acD || '#0d2438');
  const fg = offline ? (C.rd || '#ff6b6b') : (C.ac || '#3BA0FF');
  const dotBg = offline ? (C.rd || '#ff6b6b') : (C.ac || '#3BA0FF');
  const detail = blobCount > 0
    ? `${total} pending (${blobCount} video${blobCount === 1 ? '' : 's'})`
    : `${total} pending`;
  const text = offline
    ? (total > 0 ? `OFFLINE · ${detail}` : 'OFFLINE')
    : `SYNCING · ${detail}`;
  return (
    <div onClick={() => { if (online) { drainQueue(); drainBlobs(); } }}
      title={offline ? "You're offline. Changes are saved locally and will sync when connection returns." : 'Replaying queued changes…'}
      style={{ position: 'fixed', bottom: 20, left: 20, display: 'flex', alignItems: 'center', gap: 8,
        background: 'var(--c-sf)', border: `1px solid ${fg}`, color: fg, borderRadius: 0,
        padding: '6px 12px', fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase',
        cursor: online ? 'pointer' : 'default', zIndex: 1500, userSelect: 'none' }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotBg }} />
      {text}
    </div>
  );
}

// Portal picker — only shown for role==='both' (an email that's both in
// TRAINER_EMAILS and on a trainee row). Choice is sticky in sessionStorage so
// a refresh keeps you on the chosen side, but a new browser session re-prompts.
// onPick(side) is wired in App.jsx — it sets the same sessionStorage key and
// triggers a re-render.
export const PORTAL_CHOICE_KEY = 'expo-portal-choice'; // 'trainer' | 'client'
// EXPO cyan brand (matches expo-app / expo-il): dark bg, cyan radial glow,
// cyan-hairline cards that light up + glow on hover, mono headlines, cyan
// ENTER CTA. Two centered cards (not the full-bleed split-screen sign-in
// chooser). No emojis anywhere.
export function RolePickerScreen({ name, onPick, onSignOut }) {
  const Card = ({ kicker, title, sub, side }) => (
    <button onClick={() => onPick(side)} className="rp-card"
      style={{
        flex: '1 1 0', minWidth: 220, position: 'relative', overflow: 'hidden',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 12, minHeight: 250, padding: '32px 24px', borderRadius: 0,
        background: `radial-gradient(ellipse 120% 90% at 50% 130%, ${C.ac}24 0%, transparent 62%), var(--c-sf)`,
        border: `1px solid ${C.cardBd}`, cursor: 'pointer', textAlign: 'center',
        color: C.tx, fontFamily: FB,
      }}>
      <span style={{ fontFamily: FN, fontSize: 11, color: C.ac, letterSpacing: '0.26em', fontWeight: 700, textTransform: 'uppercase' }}>{kicker}</span>
      <span style={{ fontFamily: FN, fontSize: 20, fontWeight: 800, letterSpacing: '0.01em', lineHeight: 1.1, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{title}</span>
      <span style={{ fontSize: 13, color: C.tm, lineHeight: 1.5 }}>{sub}</span>
      <span style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 18px', background: C.ac, color: '#0E0F12', fontFamily: FN, fontSize: 11, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase' }}>
        Enter <span className="rp-arrow" aria-hidden="true">{'→'}</span>
      </span>
    </button>
  );
  return (
    <div data-theme="dark" style={{
      background: C.bg, color: C.tx, minHeight: '100vh', fontFamily: FB,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '24px',
      backgroundImage: `radial-gradient(ellipse 80% 55% at 50% 36%, ${C.ac}1f 0%, transparent 70%)`,
    }}>
      <style>{`
        .rp-card { transition: border-color 180ms ease, transform 180ms ease, box-shadow 180ms ease; }
        .rp-card:hover { border-color: var(--c-ac) !important; transform: translateY(-3px); box-shadow: inset 0 0 0 1px var(--c-ac), 0 18px 40px rgba(57,189,255,0.18); }
        .rp-card:hover .rp-arrow { display: inline-block; transform: translateX(4px); transition: transform 180ms ease; }
        @keyframes rp-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
      <div style={{ width: '100%', maxWidth: 620, animation: 'rp-in 480ms ease both' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img src={EXPO_LOGO} alt="EXPO" style={{ display: 'block', height: 44, width: 'auto', margin: '0 auto 22px', objectFit: 'contain' }} />
          <div style={{ fontFamily: FN, fontSize: 10, color: C.ac, letterSpacing: '0.3em', fontWeight: 700, textTransform: 'uppercase', marginBottom: 10 }}>Choose your portal</div>
          {/* "HEY" in Nord (FB), the Hebrew name in Heebo (FH). Both sit on the
              shared text baseline so the two words read as one line — centering
              line-boxes of different fonts/sizes staggers them visually. */}
          <div style={{ display: 'inline-flex', alignItems: 'baseline', justifyContent: 'center', gap: 9, color: C.tx, fontWeight: 600, lineHeight: 1 }}>
            <span style={{ fontFamily: FB, fontSize: 15, letterSpacing: '0.06em' }}>HEY</span>
            <span style={{ fontFamily: FH, fontSize: 17 }}>{name || 'there'}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <Card kicker="Manage" title="Coach" sub="Tasks, athletes & plans" side="trainer" />
          <Card kicker="Workout" title="Train" sub="Your own program & workouts" side="client" />
        </div>
        <div style={{ textAlign: 'center', marginTop: 28 }}>
          <span style={{ fontFamily: FN, fontSize: 10, color: C.td, letterSpacing: '0.14em' }}>
            {name || 'Signed in'}
            <span style={{ margin: '0 9px', opacity: 0.5 }}>·</span>
            <button onClick={onSignOut} style={{ background: 'none', border: 'none', color: C.td, cursor: 'pointer', fontFamily: FN, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', padding: 0 }}>Sign out</button>
          </span>
        </div>
      </div>
    </div>
  );
}

// Unauthorized screen — when email doesn't match any known user
export function UnauthorizedScreen({ email, onSignOut, verifyError = false, onRetry }) {
  // verifyError = the account lookup FAILED (network / RLS), which is NOT the
  // same as "not registered". Show a softer, retryable message so a real
  // athlete isn't told they don't exist over a transient blip.
  return (
    <div data-theme="dark" style={wrapStyle}>
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <img src={EXPO_LOGO} alt="EXPO" style={{ height: 36, marginBottom: 12 }} />
      </div>
      <div style={cardStyle}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: FN, fontSize: 10, color: C.ac, letterSpacing: '0.3em', fontWeight: 700, textTransform: 'uppercase', marginBottom: 14 }}>{verifyError ? "Couldn't Verify Account" : 'Access Denied'}</div>
          <div style={{ fontSize: 13, color: C.tm, lineHeight: 1.5 }}>
            {verifyError ? (
              <><strong style={{ color: C.ac }}>{email}</strong> — we couldn't reach the server to verify your account.<br />Check your connection and try again.</>
            ) : (
              <><strong style={{ color: C.ac }}>{email}</strong> is not registered.<br />Contact your coach to get access.</>
            )}
          </div>
          {verifyError && onRetry && (
            <button
              onClick={onRetry}
              style={{ marginTop: 20, marginRight: 8, background: 'var(--c-sf)', border: `1px solid ${C.ac}`, borderRadius: 0, padding: '10px 20px', color: C.ac, fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', cursor: 'pointer' }}
            >
              Try Again
            </button>
          )}
          <button
            onClick={onSignOut}
            style={{ marginTop: 20, background: 'var(--c-sf)', border: `1px solid ${C.rd}`, borderRadius: 0, padding: '10px 20px', color: C.rd, fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', cursor: 'pointer' }}
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
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  // Symmetric padding so justifyContent:'center' lands the block at the true
  // vertical center of the viewport.
  padding: '20px',
};

const cardStyle = {
  background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: 28,
};
