// Coach <-> Athlete messaging surface with voice notes.
//
// Coach side: TraineeCRM mounts this in the trainee card. The coach can
// type a message, record a voice note (MediaRecorder API → Supabase
// storage bucket `coach-voice`), or both. Athlete sees the same thread
// in the ClientPortal.
//
// Storage: public.coach_messages table. Audio files: storage bucket
// `coach-voice` (public read so the athlete's <audio> tag can fetch
// without an auth header — same model as form-videos).

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { C, FN, FB, FH } from './theme';
import { supabase, SUPA_URL, SUPA_PUBLISHABLE_KEY } from './supabase';
import { isRefined5b, RefinedHeaderStrip, toast, usePersistentState } from './ui';
import { sendPush, isCoachMutedForAthlete } from './push';

const isHebrew = (s) => /[֐-׿]/.test(s || '');
const fmt = (iso) => {
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
};

// Recorder hook — owns the MediaRecorder lifecycle. Returns { recording,
// elapsed, blob, error, start(), stop(), reset() }. Caller is responsible
// for uploading the blob to storage.
function useVoiceRecorder() {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [blob, setBlob] = useState(null);
  const [error, setError] = useState(null);
  const mediaRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const streamRef = useRef(null);

  const reset = useCallback(() => {
    setBlob(null); setElapsed(0); setError(null);
  }, []);

  const start = useCallback(async () => {
    setError(null); setBlob(null); setElapsed(0);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      // Prefer Opus in webm — broad browser support, small bitrate.
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : (MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '');
      const mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const out = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
        setBlob(out);
        stream.getTracks().forEach(t => t.stop());
      };
      mr.start();
      mediaRef.current = mr;
      setRecording(true);
      const startedAt = Date.now();
      timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 250);
    } catch (e) {
      setError(e?.message || 'Microphone permission denied.');
    }
  }, []);

  const stop = useCallback(() => {
    if (mediaRef.current && mediaRef.current.state !== 'inactive') {
      mediaRef.current.stop();
    }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setRecording(false);
  }, []);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
  }, []);

  return { recording, elapsed, blob, error, start, stop, reset };
}

async function uploadVoiceNote(blob, traineeId) {
  // Public bucket `coach-voice`, path = trainee/timestamp.<ext>.
  const ext = (blob.type || '').includes('mp4') ? 'm4a' : 'webm';
  const path = `${traineeId}/${Date.now()}.${ext}`;
  const url = `${SUPA_URL}/storage/v1/object/coach-voice/${path}`;
  // Use authed user's bearer (write policy requires auth). supabase-js
  // attaches it for us when we use the client's storage API. Fall back
  // to fetch with the publishable key if anything is off.
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || SUPA_PUBLISHABLE_KEY;
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': SUPA_PUBLISHABLE_KEY,
      'Authorization': `Bearer ${token}`,
      'Content-Type': blob.type || 'audio/webm',
    },
    body: blob,
  });
  if (!r.ok) throw new Error(`upload ${r.status}`);
  const { data: pub } = supabase.storage.from('coach-voice').getPublicUrl(path);
  return pub.publicUrl;
}

// Compose row — text input + record/stop + send. Pure UI; parent owns
// the POST to coach_messages.
function Composer({ onSend, role, draftKey }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const rec = useVoiceRecorder();

  const submit = async () => {
    if (sending) return;
    const t = text.trim();
    if (!t && !rec.blob) return;
    setSending(true);
    try {
      let audio_url = null;
      let duration_sec = null;
      if (rec.blob) {
        audio_url = await onSend.upload(rec.blob);
        duration_sec = Math.max(1, rec.elapsed);
      }
      await onSend.send({ body_text: t || null, audio_url, duration_sec });
      setText('');
      rec.reset();
    } catch (e) {
      toast(`Send failed: ${e?.message || e}`, 'error', { ttl: 6000 });
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ marginTop: 10, borderTop: `1px solid var(--c-cardBd)`, paddingTop: 10 }}>
      <textarea
        value={text} onChange={e => setText(e.target.value)} dir="auto"
        placeholder={role === 'coach' ? 'Type a note to your athlete…' : 'Reply to your coach…'}
        rows={2}
        style={{
          width: '100%', background: 'var(--c-sf)', border: `1px solid var(--c-cardBd)`, borderRadius: 0,
          padding: '8px 10px', color: 'var(--c-tx)', fontFamily: FB, fontSize: 13,
          outline: 'none', boxSizing: 'border-box', resize: 'vertical',
          direction: isHebrew(text) ? 'rtl' : 'ltr',
        }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
        {!rec.recording && !rec.blob && (
          <button onClick={rec.start} title="Record a voice note"
            style={recBtnStyle('var(--c-rd)')}>● REC</button>
        )}
        {rec.recording && (
          <button onClick={rec.stop} style={recBtnStyle('var(--c-rd)', true)}>
            ■ STOP · {String(Math.floor(rec.elapsed / 60)).padStart(2,'0')}:{String(rec.elapsed % 60).padStart(2,'0')}
          </button>
        )}
        {rec.blob && !rec.recording && (
          <>
            <audio controls src={URL.createObjectURL(rec.blob)} style={{ height: 30, maxWidth: 220 }} />
            <button onClick={rec.reset}
              style={recBtnStyle('var(--c-tm)')}>↺ RE-RECORD</button>
          </>
        )}
        {rec.error && <span style={{ fontSize: 11, color: 'var(--c-rd)' }}>{rec.error}</span>}
        <span style={{ flex: 1 }} />
        <button disabled={sending || (!text.trim() && !rec.blob)} onClick={submit}
          style={{
            ...recBtnStyle('var(--c-ac)'),
            opacity: (text.trim() || rec.blob) ? 1 : 0.5,
            cursor: (text.trim() || rec.blob) ? 'pointer' : 'default',
          }}>{sending ? 'SENDING…' : 'SEND →'}</button>
      </div>
    </div>
  );
}

function recBtnStyle(color, active = false) {
  return {
    height: 30, padding: '0 12px', borderRadius: 0,
    background: active ? color : 'transparent', color: active ? '#fff' : color,
    border: `1px solid ${color}`,
    fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  };
}

function MessageBubble({ msg, viewerRole }) {
  const heb = isHebrew(msg.body_text);
  const self = msg.sender_role === viewerRole;
  const align = self ? 'flex-end' : 'flex-start';
  const bg = self ? 'rgba(57,189,255,0.094)' : 'var(--c-sf)';
  const border = self ? 'var(--c-ac)' : 'var(--c-cardBd)';
  return (
    <div style={{ display: 'flex', justifyContent: align, marginBottom: 8 }}>
      <div style={{
        maxWidth: '78%', background: bg, border: `1px solid ${border}`, borderRadius: 0,
        padding: '8px 10px',
      }}>
        <div style={{ fontFamily: FN, fontSize: 9, color: 'var(--c-td)', letterSpacing: '0.08em', marginBottom: 4 }}>
          {msg.sender_role === 'coach' ? 'COACH' : 'ATHLETE'} · {fmt(msg.created_at)}
        </div>
        {msg.audio_url && (
          <audio controls preload="none" src={msg.audio_url}
            style={{ display: 'block', maxWidth: '100%', marginBottom: msg.body_text ? 6 : 0 }} />
        )}
        {msg.body_text && (
          <div style={{
            fontSize: 13, color: 'var(--c-tx)', lineHeight: 1.4, whiteSpace: 'pre-wrap',
            direction: heb ? 'rtl' : 'ltr', fontFamily: heb ? FH : FB,
          }}>{msg.body_text}</div>
        )}
      </div>
    </div>
  );
}

export default function CoachMessages({ traineeId, role = 'coach', recipientEmail, senderLabel }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  // Collapsible — the cyan strip is the toggle. Persisted per trainee+role.
  const [open, setOpen] = usePersistentState(`msg-${role}-${traineeId}`, true);
  const refined = isRefined5b();
  const PAD = 14;

  const reload = useCallback(async () => {
    if (!traineeId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('coach_messages')
      .select('*')
      .eq('trainee_id', traineeId)
      .order('created_at', { ascending: true })
      .limit(200);
    if (error) {
      // Migration not yet applied locally — degrade silently with an
      // informative empty state instead of throwing.
      if (/relation .* does not exist/i.test(error.message || '')) {
        setRows([]); setLoading(false); return;
      }
      toast(`Messages load failed: ${error.message}`, 'error', { ttl: 6000 });
      setRows([]);
    } else {
      setRows(data || []);
    }
    setLoading(false);
  }, [traineeId]);

  useEffect(() => { reload(); }, [reload]);

  const send = async ({ body_text, audio_url, duration_sec }) => {
    const row = { trainee_id: traineeId, sender_role: role, body_text, audio_url, duration_sec };
    const { data, error } = await supabase.from('coach_messages').insert(row).select().single();
    if (error) throw error;
    setRows(prev => [...prev, data]);
    // Fire-and-forget push to the OTHER side. Coach sending → push the
    // athlete; athlete sending → push the coach. Either side can pass
    // recipientEmail; if missing we skip (graceful degrade).
    //
    // Per-athlete mute: when the athlete is the sender, check the coach's
    // notifOff flag for this trainee. If muted, skip the push but still
    // persist the message (the mute is for buzzing the coach's phone, not
    // for blocking the message itself).
    if (recipientEmail) {
      const muted = role === 'athlete' && await isCoachMutedForAthlete(traineeId);
      if (!muted) {
        const preview = body_text
          ? body_text.slice(0, 100)
          : (audio_url ? '🎤 Voice note' : 'New message');
        sendPush({
          toEmail: recipientEmail,
          title: role === 'coach'
            ? `Message from ${senderLabel || 'your coach'}`
            : `Message from ${senderLabel || 'your athlete'}`,
          body: preview,
          url: role === 'coach' ? '/athlete' : `/coach/trainees/${traineeId}`,
          tag: `msg:${traineeId}`,
        });
      }
    }
  };

  return (
    <div style={{
      // var(--c-sf) resolves to #FFFFFF in light theme, dark surface inside
      // any data-theme="dark" wrapper (like the athlete portal). Hardcoding
      // #FFFFFF here used to break the message bubbles inside the athlete
      // portal — body text stayed `--c-tx` (light gray in dark) on a forced
      // white card = unreadable.
      background: 'var(--c-sf)',
      border: `1px solid var(--c-cardBd)`, borderRadius: 0, padding: PAD, marginBottom: 12,
    }}>
      <RefinedHeaderStrip padY={PAD} padX={PAD} marginBottom={open ? 10 : 0}>
        <div onClick={() => setOpen(o => !o)} role="button" tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(o => !o); } }}
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
          <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: '0.04em', textTransform: 'uppercase', color: refined ? '#FFFFFF' : 'var(--c-tx)' }}>
            MESSAGES ({rows.length})
          </span>
          <span aria-hidden style={{ color: refined ? '#FFFFFF' : 'var(--c-tx)', fontSize: 12, lineHeight: 1, transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 180ms ease' }}>▾</span>
        </div>
      </RefinedHeaderStrip>

      {open && (<>
      {loading ? (
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--c-td)', fontSize: 13 }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div style={{ padding: 14, textAlign: 'center', color: 'var(--c-td)', fontSize: 13 }}>
          No messages yet. {role === 'coach' ? 'Drop a voice note or a quick check-in below.' : 'Your coach will message you here.'}
        </div>
      ) : (
        <div style={{ maxHeight: 360, overflowY: 'auto', paddingRight: 4 }}>
          {rows.map(m => <MessageBubble key={m.id} msg={m} viewerRole={role} />)}
        </div>
      )}

      <Composer
        role={role}
        onSend={{
          upload: (blob) => uploadVoiceNote(blob, traineeId),
          send,
        }} />
      </>)}
    </div>
  );
}
