// /book/<slug> — public booking page. Resolves the slug to coach
// settings, renders a week-view slot picker, captures (name, email,
// phone, notes), inserts into public.bookings with source='public'.
//
// No login required. RLS lets anon INSERT bookings as long as source
// is 'public', start_at is in the future, and coach_email + name are
// present. Occupied slots come from get_occupied_slots() SECURITY
// DEFINER (no PII).

import React, { useEffect, useState, useMemo } from 'react';
import { C, FN, FB } from './theme';
import { supabase } from './supabase';
import { EXPOMark } from './expoMark';
import { toast } from './ui';

function pad(n) { return String(n).padStart(2, '0'); }
function ymd(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function startOfWeek(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay()); // Sunday = 0
  return x;
}
function parseTimeStr(t) {
  // "09:00:00" or "09:00" → [h, m]
  const m = String(t).match(/^(\d{1,2}):(\d{2})/);
  return m ? [parseInt(m[1], 10), parseInt(m[2], 10)] : [0, 0];
}

// Availability rules are authored in the coach's timezone — slot INSTANTS
// must be computed from Israel wall-clock, not the visitor's device TZ
// (a visitor abroad was booking wall-clock times the coach never offered).
// Display stays visitor-local: a correct instant shown in their own time.
const COACH_TZ = 'Asia/Jerusalem';

// Minutes east of UTC for COACH_TZ at a given instant (DST-aware via Intl).
function coachTzOffsetMin(date) {
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone: COACH_TZ, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const p = Object.fromEntries(dtf.formatToParts(date).map(x => [x.type, x.value]));
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute);
  return (asUTC - date.getTime()) / 60000;
}

// Absolute instant for (y, mo, da, minutes-into-day) wall-clock in COACH_TZ.
// Two passes handle DST transition edges.
function coachTzInstant(y, mo, da, minOfDay) {
  const hh = Math.floor(minOfDay / 60), mi = minOfDay % 60;
  let t = Date.UTC(y, mo, da, hh, mi);
  for (let i = 0; i < 2; i++) t = Date.UTC(y, mo, da, hh, mi) - coachTzOffsetMin(new Date(t)) * 60000;
  return new Date(t);
}

// Civil (y, mo, da) of an instant as seen in COACH_TZ.
function coachTzCivil(date) {
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone: COACH_TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  const p = Object.fromEntries(dtf.formatToParts(date).map(x => [x.type, x.value]));
  return { y: +p.year, mo: +p.month - 1, da: +p.day };
}

function generateSlots(rules, duration, buffer, leadHours, windowStart, windowEnd, occupied) {
  if (!rules || rules.length === 0) return [];
  const stepMin = duration + buffer;
  const slots = [];
  const minStart = Date.now() + leadHours * 3600000;
  const first = coachTzCivil(windowStart);
  const nDays = Math.ceil((windowEnd - windowStart) / 86400000) + 1;
  for (let i = 0; i < nDays; i++) {
    // Civil-date arithmetic via Date.UTC keeps the day-of-week TZ-free.
    const civil = new Date(Date.UTC(first.y, first.mo, first.da + i));
    const dow = civil.getUTCDay();
    const dayRules = rules.filter(r => r.day_of_week === dow);
    for (const r of dayRules) {
      const [sh, sm] = parseTimeStr(r.start_time);
      const [eh, em] = parseTimeStr(r.end_time);
      const startMin = sh * 60 + sm;
      const endMin = eh * 60 + em;
      for (let m = startMin; m + duration <= endMin; m += stepMin) {
        const slot = coachTzInstant(civil.getUTCFullYear(), civil.getUTCMonth(), civil.getUTCDate(), m);
        if (slot.getTime() < minStart) continue;
        if (slot < windowStart || slot >= windowEnd) continue;
        // Skip if it overlaps an occupied window
        const slotStart = slot.getTime();
        const slotEnd = slotStart + duration * 60000;
        const isBooked = (occupied || []).some(o => {
          const oStart = new Date(o.start_at).getTime();
          const oEnd = oStart + (o.duration_min || duration) * 60000;
          return slotStart < oEnd && slotEnd > oStart;
        });
        if (isBooked) continue;
        slots.push(slot);
      }
    }
  }
  return slots.sort((a, b) => a - b);
}

export default function BookingPublic() {
  const [slug, setSlug] = useState(null);
  const [settings, setSettings] = useState(null);
  const [rules, setRules] = useState([]);
  const [occupied, setOccupied] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState(null);

  useEffect(() => {
    const m = window.location.pathname.match(/^\/book\/([^/]+)/);
    setSlug(m ? m[1].toLowerCase() : null);
  }, []);

  useEffect(() => {
    if (!slug) return;
    let alive = true;
    (async () => {
      setLoading(true);
      const { data: s, error: se } = await supabase.from('coach_booking_settings').select('*').eq('slug', slug).maybeSingle();
      if (!alive) return;
      if (se) { setError(se.message); setLoading(false); return; }
      if (!s) { setError('That booking page doesn’t exist.'); setLoading(false); return; }
      setSettings(s);
      const { data: r } = await supabase.from('availability_rules').select('*').eq('coach_email', s.coach_email);
      if (!alive) return;
      setRules(r || []);
      const wStart = startOfWeek(new Date(Date.now() + weekOffset * 7 * 86400000));
      const wEnd = new Date(wStart.getTime() + 14 * 86400000);
      const { data: occ } = await supabase.rpc('get_occupied_slots', {
        p_coach_email: s.coach_email,
        p_from: wStart.toISOString(),
        p_to: wEnd.toISOString(),
      });
      if (!alive) return;
      setOccupied(occ || []);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [slug, weekOffset]);

  const slots = useMemo(() => {
    if (!settings) return [];
    const wStart = startOfWeek(new Date(Date.now() + weekOffset * 7 * 86400000));
    const wEnd = new Date(wStart.getTime() + 7 * 86400000);
    return generateSlots(rules, settings.duration_min, settings.buffer_min, settings.lead_time_hours, wStart, wEnd, occupied);
  }, [rules, settings, weekOffset, occupied]);

  const groupedByDay = useMemo(() => {
    const out = {};
    for (const s of slots) {
      const key = ymd(s);
      if (!out[key]) out[key] = [];
      out[key].push(s);
    }
    return out;
  }, [slots]);

  const submit = async () => {
    if (!selectedSlot) return;
    if (!form.name.trim()) { toast('Name is required.', 'error'); return; }
    if (!form.email.trim() && !form.phone.trim()) { toast('Please give us an email or phone so we can confirm.', 'error'); return; }
    setSubmitting(true);
    try {
      const row = {
        coach_email: settings.coach_email,
        contact_name: form.name.trim(),
        contact_email: form.email.trim() || null,
        contact_phone: form.phone.trim() || null,
        start_at: selectedSlot.toISOString(),
        duration_min: settings.duration_min,
        status: 'confirmed',
        notes: form.notes.trim() || null,
        source: 'public',
      };
      const { error } = await supabase.from('bookings').insert(row);
      if (error) throw error;
      setConfirmation({
        when: selectedSlot,
        zoom: settings.zoom_url,
      });
    } catch (e) {
      // Public page — keep the detail in the console, show the anon visitor a
      // generic message so a raw Supabase/schema error never leaks. (security)
      console.error('booking failed', e);
      toast('Booking failed — please try again, or contact us directly.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <Wrapper><div style={{ padding: 30, textAlign: 'center', color: C.td }}>Loading…</div></Wrapper>;
  }
  if (error || !settings) {
    return <Wrapper><div style={{ padding: 30, textAlign: 'center', color: C.rd, fontSize: 14 }}>{error || 'Not found.'}</div></Wrapper>;
  }
  if (confirmation) {
    return (
      <Wrapper>
        <div style={{ padding: 30, textAlign: 'center' }}>
          <div style={{ fontFamily: FN, fontSize: 10, color: C.gn, letterSpacing: '0.18em', fontWeight: 700, marginBottom: 16 }}>✓ BOOKED</div>
          <div style={{ fontSize: 16, color: C.tx, marginBottom: 8 }}>
            {confirmation.when.toLocaleDateString('en-GB')} · {pad(confirmation.when.getHours())}:{pad(confirmation.when.getMinutes())}
          </div>
          <div style={{ fontSize: 13, color: C.tm, marginBottom: 16 }}>
            with {settings.display_name || 'your coach'}
          </div>
          {confirmation.zoom && (
            <a href={confirmation.zoom} target="_blank" rel="noopener noreferrer"
              style={{ display: 'inline-block', padding: '10px 18px', background: C.ac, color: C.acOnSurface, textDecoration: 'none', fontFamily: FN, fontSize: 12, fontWeight: 700, letterSpacing: '0.12em' }}>
              JOIN ZOOM →
            </a>
          )}
          {settings.cancellation_policy && (
            <div style={{ marginTop: 24, fontSize: 11, color: C.td, lineHeight: 1.5 }}>{settings.cancellation_policy}</div>
          )}
        </div>
      </Wrapper>
    );
  }

  return (
    <Wrapper>
      <div style={{ padding: '20px 24px' }}>
        <h1 style={{ margin: '0 0 6px', fontFamily: FN, fontSize: 18, color: C.tx, letterSpacing: '0.02em' }}>
          {settings.display_name || 'Book a session'}
        </h1>
        {settings.bio && <p style={{ margin: '0 0 14px', color: C.tm, fontSize: 13, lineHeight: 1.5 }}>{settings.bio}</p>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, fontFamily: FN, fontSize: 10, color: C.tm, letterSpacing: '0.12em' }}>
          <button onClick={() => setWeekOffset(o => Math.max(0, o - 1))} disabled={weekOffset === 0}
            style={{ padding: '4px 10px', background: 'transparent', border: `1px solid ${weekOffset === 0 ? C.cardBd : C.ac}`, color: weekOffset === 0 ? C.td : C.ac, cursor: weekOffset === 0 ? 'default' : 'pointer' }}>← PREV</button>
          <span style={{ flex: 1, textAlign: 'center' }}>WEEK OF {ymd(startOfWeek(new Date(Date.now() + weekOffset * 7 * 86400000)))}</span>
          <button onClick={() => setWeekOffset(o => o + 1)}
            style={{ padding: '4px 10px', background: 'transparent', border: `1px solid ${C.ac}`, color: C.ac, cursor: 'pointer' }}>NEXT →</button>
        </div>

        {Object.keys(groupedByDay).length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: C.td, fontSize: 13 }}>
            No available slots this week. Try next week →
          </div>
        ) : Object.entries(groupedByDay).map(([day, daySlots]) => (
          <div key={day} style={{ marginBottom: 14 }}>
            <div style={{ fontFamily: FN, fontSize: 10, color: C.tm, letterSpacing: '0.12em', fontWeight: 700, marginBottom: 6 }}>
              {new Date(day + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase()}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {daySlots.map((s, i) => {
                const sel = selectedSlot && s.getTime() === selectedSlot.getTime();
                return (
                  <button key={i} onClick={() => setSelectedSlot(s)}
                    style={{
                      padding: '8px 12px', background: sel ? C.ac : 'transparent',
                      border: `1px solid ${sel ? C.ac : C.cardBd}`,
                      color: sel ? '#000' : C.tx,
                      fontFamily: FN, fontSize: 12, fontWeight: 700, letterSpacing: '0.06em',
                      cursor: 'pointer',
                    }}>{pad(s.getHours())}:{pad(s.getMinutes())}</button>
                );
              })}
            </div>
          </div>
        ))}

        {selectedSlot && (
          <div style={{ marginTop: 20, padding: 14, background: 'var(--c-sf)', border: `1px solid ${C.ac}` }}>
            <div style={{ fontFamily: FN, fontSize: 10, color: C.ac, letterSpacing: '0.12em', fontWeight: 700, marginBottom: 8 }}>
              CONFIRM · {selectedSlot.toLocaleDateString('en-GB')} at {pad(selectedSlot.getHours())}:{pad(selectedSlot.getMinutes())}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <input placeholder="Your name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                style={inputStyle} />
              <input placeholder="Email" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                style={inputStyle} />
              <input placeholder="Phone (WhatsApp)" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                style={inputStyle} autoComplete="off" />
              <input placeholder="Notes (optional)" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                style={inputStyle} />
            </div>
            <button onClick={submit} disabled={submitting || !form.name.trim()}
              style={{
                width: '100%', padding: '10px 18px', background: form.name.trim() ? C.ac : C.cardBd,
                color: form.name.trim() ? '#000' : C.td,
                border: 'none', fontFamily: FN, fontSize: 12, fontWeight: 700, letterSpacing: '0.12em',
                cursor: submitting ? 'wait' : (form.name.trim() ? 'pointer' : 'default'),
                minWidth: 168, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}>{submitting ? 'BOOKING…' : 'CONFIRM BOOKING'}</button>
            {settings.cancellation_policy && (
              <div style={{ marginTop: 10, fontSize: 11, color: C.td, lineHeight: 1.5 }}>{settings.cancellation_policy}</div>
            )}
          </div>
        )}
      </div>
    </Wrapper>
  );
}

const inputStyle = {
  background: 'var(--c-bg)', border: `1px solid ${C.cardBd}`, padding: '8px 10px',
  color: C.tx, fontFamily: FB, fontSize: 13, outline: 'none', boxSizing: 'border-box',
};

function Wrapper({ children }) {
  return (
    <div style={{ background: 'var(--c-bg)', color: C.tx, minHeight: '100vh', fontFamily: FB }}>
      <header style={{ borderBottom: `1px solid ${C.cardBd}`, padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <EXPOMark height={28} />
        <a href="/" style={{ color: C.tm, textDecoration: 'none', fontFamily: FN, fontSize: 10, letterSpacing: '0.12em' }}>EXPO-APP.CO.IL</a>
      </header>
      <main style={{ maxWidth: 720, margin: '0 auto' }}>
        {children}
      </main>
    </div>
  );
}
