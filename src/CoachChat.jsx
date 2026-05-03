// Floating chat bubble for /coaches. Visitor clicks 💬, asks a basic
// question about EXPO, gets a Haiku-backed reply via /api/chat. No memory
// across page loads — fresh conversation each time the page reloads.

import React, { useState, useRef, useEffect } from 'react';
import { C, FN, FB, EXPO_LOGO_NAV } from './theme';

const SUPA_URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const SUPA_PUBLISHABLE_KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';

const SUGGESTIONS = [
  "What does EXPO do?",
  "How much does it cost?",
  "Can I try it before signing up?",
  "Who is this for?",
];

// Soft email-capture prompt fired once after the visitor has had a real
// back-and-forth (3+ user turns) so we don't interrupt the first answer.
const CAPTURE_PROMPT = "Want me to put you on the list? Drop your email and Ohad will reach out as coach slots open — or keep asking questions.";

// Generate a transient per-page-load id so backend logs from the same
// visitor session can be correlated. Doesn't survive reloads — that's fine
// for audit purposes.
function makeSessionId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function CoachChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]); // [{role:'user'|'assistant'|'system-capture', content:string}]
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');
  // null = not yet probed; true = configured; false = key missing → degrade.
  const [healthy, setHealthy] = useState(null);
  const [capturePrompted, setCapturePrompted] = useState(false);
  const [captureEmail, setCaptureEmail] = useState('');
  const [captureState, setCaptureState] = useState('idle'); // idle | sending | done | error
  const [captureErr, setCaptureErr] = useState('');
  const sessionIdRef = useRef(null);
  if (!sessionIdRef.current) sessionIdRef.current = makeSessionId();
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // Scroll to bottom on new message.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, sending]);

  // Focus input when panel opens, and probe health on first open.
  useEffect(() => {
    if (!open) return;
    setTimeout(() => inputRef.current?.focus(), 50);
    if (healthy !== null) return;
    fetch('/api/chat-health').then(r => r.json()).then(d => setHealthy(!!d?.ok)).catch(() => setHealthy(false));
  }, [open, healthy]);

  // Soft email-capture prompt: when the visitor has sent ≥3 messages and
  // we haven't already prompted, slip a system-capture row into the thread.
  useEffect(() => {
    if (capturePrompted) return;
    const userTurns = messages.filter(m => m.role === 'user').length;
    if (userTurns >= 3) {
      setCapturePrompted(true);
      setMessages(prev => [...prev, { role: 'system-capture', content: CAPTURE_PROMPT }]);
    }
  }, [messages, capturePrompted]);

  const submitCapture = async (e) => {
    e?.preventDefault?.();
    if (captureState === 'sending' || captureState === 'done') return;
    const trimmed = captureEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setCaptureState('error'); setCaptureErr('Enter a valid email'); return;
    }
    setCaptureState('sending'); setCaptureErr('');
    // Strip system-capture rows — only real turns are useful for the
    // server-side summary.
    const apiMessages = messages.filter(m => m.role === 'user' || m.role === 'assistant');
    try {
      // Try the AI-summary endpoint first. On failure (function not
      // deployed yet, key missing, etc.), fall back to the original
      // direct-insert path so we never lose a lead.
      const captureRes = await fetch('/api/capture', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: trimmed,
          source: 'expo-app-chat',
          context: 'coach_waitlist',
          messages: apiMessages,
        }),
      });
      if (captureRes.ok) {
        setCaptureState('done'); return;
      }
      // Fallback path — direct REST insert against Supabase.
      const fallback = await fetch(`${SUPA_URL}/rest/v1/leads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPA_PUBLISHABLE_KEY,
          'Authorization': `Bearer ${SUPA_PUBLISHABLE_KEY}`,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          email: trimmed,
          source: 'expo-app-chat',
          context: 'coach_waitlist',
          user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 200) : null,
        }),
      });
      if (!fallback.ok && fallback.status !== 409) throw new Error(`HTTP ${fallback.status}`);
      setCaptureState('done');
    } catch {
      setCaptureState('error'); setCaptureErr('Something went wrong. Try again.');
    }
  };

  const send = async (text) => {
    const t = (text ?? draft).trim();
    if (!t || sending) return;
    if (healthy === false) return; // input is disabled in this state anyway
    setErr('');
    const next = [...messages, { role: 'user', content: t }];
    setMessages(next);
    setDraft('');
    setSending(true);
    try {
      const apiMessages = next.filter(m => m.role === 'user' || m.role === 'assistant');
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages, stream: true, sessionId: sessionIdRef.current }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErr(data?.error || 'Something went wrong. Try again, or email Ohad directly.');
        setSending(false);
        return;
      }
      // If the server didn't switch to SSE (older deploy, etc.) fall back to JSON parse.
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('text/event-stream') || !res.body) {
        const data = await res.json().catch(() => ({}));
        setMessages([...next, { role: 'assistant', content: data?.reply || '' }]);
        return;
      }
      // Append a placeholder assistant message and stream tokens into it.
      setMessages([...next, { role: 'assistant', content: '' }]);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let acc = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split(/\n/);
        buf = lines.pop() || '';
        for (const raw of lines) {
          const line = raw.trim();
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          try {
            const ev = JSON.parse(payload);
            if (typeof ev?.t === 'string') {
              acc += ev.t;
              setMessages(prev => {
                const copy = prev.slice();
                const last = copy[copy.length - 1];
                if (last && last.role === 'assistant') {
                  copy[copy.length - 1] = { ...last, content: acc };
                }
                return copy;
              });
            }
          } catch {}
        }
      }
    } catch {
      setErr('No connection. Try again, or email Ohad directly.');
    } finally {
      setSending(false);
    }
  };

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <>
      {/* Floating bubble — always visible bottom-right when closed */}
      {!open && (
        <button onClick={() => setOpen(true)} aria-label="Open chat"
          style={{
            position: 'fixed', bottom: 20, right: 20, zIndex: 80,
            width: 56, height: 56, borderRadius: '50%',
            background: C.ac, color: '#000',
            border: 'none', cursor: 'pointer',
            boxShadow: '0 8px 24px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.05) inset',
            fontSize: 24, lineHeight: 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'transform 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.06)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
        >💬</button>
      )}

      {open && (
        <div role="dialog" aria-label="EXPO chat"
          style={{
            position: 'fixed', zIndex: 90,
            bottom: 20, right: 20,
            width: 'min(380px, calc(100vw - 32px))',
            height: 'min(560px, calc(100vh - 100px))',
            background: C.sf, color: C.tx,
            border: `1px solid ${C.bd2}`, borderRadius: 14,
            boxShadow: '0 24px 60px -12px rgba(0,0,0,0.7)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            fontFamily: FB,
          }}>
          {/* Header — three-zone layout. Logo and button cluster anchor the
              outer edges via justifyContent:space-between. The label sits in
              an absolutely-positioned middle layer so it lands on the dialog's
              true geometric centerline regardless of the side widths. */}
          <div style={{
            position: 'relative',
            padding: '10px 14px', borderBottom: `1px solid ${C.bd}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: C.sf2, gap: 10, minHeight: 44,
          }}>
            <img src={EXPO_LOGO_NAV} alt="EXPO" style={{ height: 20, width: 'auto', display: 'block', flexShrink: 0 }} />
            <span style={{
              position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
              fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: C.tm,
              lineHeight: 1, whiteSpace: 'nowrap', pointerEvents: 'none',
            }}>ASK ANYTHING.</span>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              {messages.length > 0 && (
                <button onClick={() => { setMessages([]); setErr(''); setCapturePrompted(false); setCaptureEmail(''); setCaptureState('idle'); setCaptureErr(''); }}
                  aria-label="Start a new conversation" title="Start a new conversation"
                  style={{ background: 'transparent', border: 'none', color: C.tm, cursor: 'pointer', lineHeight: 0, padding: 0, borderRadius: 6, height: 28, width: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg>
                </button>
              )}
              <button onClick={() => setOpen(false)} aria-label="Close chat"
                style={{ background: 'transparent', border: 'none', color: C.tm, cursor: 'pointer', lineHeight: 0, padding: 0, height: 28, width: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} style={{
            flex: 1, padding: '14px 14px 4px', overflowY: 'auto',
            display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            {messages.length === 0 && (
              <div style={{
                color: C.tm, fontSize: 13, lineHeight: 1.5,
                background: C.bg, border: `1px solid ${C.bd}`, borderRadius: 10,
                padding: '12px 14px',
              }}>
                Hey — I can answer basic questions about EXPO (pricing, features, who it's for, how to try it). For anything specific, email Ohad and he'll reply himself.
              </div>
            )}
            {messages.map((m, i) => {
              if (m.role === 'system-capture') {
                return (
                  <div key={i} style={{
                    alignSelf: 'stretch',
                    background: `${C.ac}10`, border: `1px dashed ${C.ac}55`,
                    borderRadius: 10, padding: '10px 12px',
                  }}>
                    <div style={{ fontSize: 12, color: C.tx, lineHeight: 1.5, marginBottom: captureState === 'done' ? 0 : 8 }}>
                      {captureState === 'done' ? "✓ You're on the list. Ohad will email you as slots open." : m.content}
                    </div>
                    {captureState !== 'done' && (
                      <form onSubmit={submitCapture} style={{ display: 'flex', gap: 6 }}>
                        <input type="email" autoComplete="email" value={captureEmail}
                          onChange={e => { setCaptureEmail(e.target.value); if (captureState === 'error') setCaptureState('idle'); }}
                          placeholder="your@email.com"
                          style={{
                            flex: 1, background: C.bg, border: `1px solid ${C.bd2}`, borderRadius: 6,
                            padding: '6px 9px', color: C.tx, fontFamily: FB, fontSize: 12, outline: 'none',
                          }} />
                        <button type="submit" disabled={captureState === 'sending'}
                          style={{
                            background: captureState === 'sending' ? C.bd : C.ac,
                            color: captureState === 'sending' ? C.tm : '#000',
                            border: 'none', borderRadius: 6, padding: '6px 10px',
                            fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
                            cursor: captureState === 'sending' ? 'default' : 'pointer',
                          }}>{captureState === 'sending' ? '…' : 'JOIN'}</button>
                      </form>
                    )}
                    {captureState === 'error' && (
                      <div style={{ fontFamily: FN, color: C.rd, fontSize: 10, marginTop: 4 }}>{captureErr}</div>
                    )}
                  </div>
                );
              }
              return (
                <div key={i} style={{
                  alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '85%',
                  background: m.role === 'user' ? C.ac : C.bg,
                  color: m.role === 'user' ? '#000' : C.tx,
                  border: m.role === 'user' ? 'none' : `1px solid ${C.bd}`,
                  borderRadius: 10, padding: '8px 12px',
                  fontSize: 13.5, lineHeight: 1.5,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>{m.content}</div>
              );
            })}
            {sending && (
              <div style={{
                alignSelf: 'flex-start',
                color: C.tm, fontSize: 13, fontStyle: 'italic',
                padding: '4px 12px',
              }}>typing…</div>
            )}
            {err && (
              <div style={{
                alignSelf: 'stretch',
                color: C.rd, fontSize: 12,
                background: `${C.rd}15`, border: `1px solid ${C.rd}55`,
                borderRadius: 8, padding: '8px 10px',
              }}>{err}</div>
            )}
            {/* Inline suggestions — shown when the conversation is idle and
                the last message (if any) is from the assistant. Chips refresh
                under each AI answer instead of living in a dead strip above
                the input. */}
            {healthy !== false && !sending && (messages.length === 0 || messages[messages.length - 1].role === 'assistant') && (
              <div style={{
                alignSelf: 'stretch',
                display: 'flex', flexWrap: 'wrap', gap: 6,
                paddingTop: messages.length === 0 ? 0 : 4,
              }}>
                {SUGGESTIONS.map((s, i) => (
                  <button key={i} onClick={() => send(s)} disabled={sending}
                    style={{
                      background: 'transparent', border: `1px solid ${C.bd2}`,
                      color: C.tx, borderRadius: 16, padding: '6px 12px',
                      fontFamily: FB, fontSize: 12, cursor: 'pointer',
                      whiteSpace: 'nowrap', flexShrink: 0,
                    }}>{s}</button>
                ))}
              </div>
            )}
          </div>

          {/* Input — degrade to offline notice when the API key isn't configured */}
          {healthy === false ? (
            <div style={{
              padding: '12px 14px', borderTop: `1px solid ${C.bd}`,
              background: C.sf2, fontSize: 12, color: C.tm, lineHeight: 1.5, textAlign: 'center',
            }}>
              Chat is offline right now. Drop your email in the waitlist form below and Ohad will reply directly.
            </div>
          ) : (
            <div style={{
              padding: 10, borderTop: `1px solid ${C.bd}`,
              display: 'flex', gap: 8, alignItems: 'flex-end',
              background: C.sf2,
            }}>
              <textarea ref={inputRef} value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={onKey}
                placeholder="Type a question…" rows={1}
                style={{
                  flex: 1, resize: 'none',
                  background: C.bg, border: `1px solid ${C.bd2}`, borderRadius: 8,
                  padding: '8px 10px', color: C.tx,
                  fontFamily: FB, fontSize: 13, outline: 'none',
                  minHeight: 36, maxHeight: 100,
                }} />
              <button onClick={() => send()} disabled={sending || !draft.trim()}
                style={{
                  background: draft.trim() && !sending ? C.ac : C.bd,
                  color: draft.trim() && !sending ? '#000' : C.tm,
                  border: 'none', borderRadius: 8,
                  padding: '8px 14px', fontFamily: FN, fontSize: 12, fontWeight: 700,
                  letterSpacing: 0.5, cursor: draft.trim() && !sending ? 'pointer' : 'default',
                }}>SEND</button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
