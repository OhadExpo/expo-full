// Floating chat bubble for /coaches. Visitor clicks 💬, asks a basic
// question about EXPO, gets a Haiku-backed reply via /api/chat. No memory
// across page loads — fresh conversation each time the page reloads.

import React, { useState, useRef, useEffect } from 'react';
import { C, FN, FB } from './theme';

const SUGGESTIONS = [
  "What does EXPO do?",
  "How much does it cost?",
  "Can I try it before signing up?",
  "Who is this for?",
];

export default function CoachChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]); // [{role:'user'|'assistant', content:string}]
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // Scroll to bottom on new message.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, sending]);

  // Focus input when panel opens.
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const send = async (text) => {
    const t = (text ?? draft).trim();
    if (!t || sending) return;
    setErr('');
    const next = [...messages, { role: 'user', content: t }];
    setMessages(next);
    setDraft('');
    setSending(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data?.error || 'Something went wrong. Try again, or email Ohad directly.');
        setSending(false);
        return;
      }
      setMessages([...next, { role: 'assistant', content: data.reply || '' }]);
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
          {/* Header */}
          <div style={{
            padding: '12px 16px', borderBottom: `1px solid ${C.bd}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: C.sf2,
          }}>
            <div>
              <div style={{ fontFamily: FN, fontSize: 11, color: C.ac, letterSpacing: 1.5, fontWeight: 700 }}>EXPO CHAT</div>
              <div style={{ fontSize: 11, color: C.td, marginTop: 2 }}>Ask anything about the platform.</div>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close chat"
              style={{ background: 'transparent', border: 'none', color: C.tm, fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: 4 }}>×</button>
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
            {messages.map((m, i) => (
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
            ))}
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
          </div>

          {/* Suggestion chips — only on empty state */}
          {messages.length === 0 && (
            <div style={{
              padding: '4px 14px 10px', display: 'flex', flexWrap: 'wrap', gap: 6,
            }}>
              {SUGGESTIONS.map((s, i) => (
                <button key={i} onClick={() => send(s)} disabled={sending}
                  style={{
                    background: 'transparent', border: `1px solid ${C.bd2}`,
                    color: C.tx, borderRadius: 16, padding: '6px 12px',
                    fontFamily: FB, fontSize: 12, cursor: 'pointer',
                  }}>{s}</button>
              ))}
            </div>
          )}

          {/* Input */}
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
        </div>
      )}
    </>
  );
}
