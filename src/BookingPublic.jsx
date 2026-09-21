// /book/<slug> — public booking page. Resolves the slug to coach
// settings, renders a week-view slot picker, captures (name, email,
// phone, notes), inserts into public.bookings with source='public'.
//
// No login required. RLS lets anon INSERT bookings as long as source
// is 'public', start_at is in the future, and coach_email + name are
// present. Occupied slots come from get_occupied_slots() SECURITY
// DEFINER (no PII).

import React, { useEffect, useState, useMemo } from 'react';
import { tr, readLang } from './i18n';
import { C, FN, FB } from './theme';
import { safeUrl } from './VideoEmbed';
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
      // stepMin can never be <= 0 or this loop never advances and the visitor's
      // tab locks up. The coach's settings field accepts any integer, so a typed
      // "-60" used to be an infinite loop in a stranger's browser. Clamped here
      // as well as at the settings form, because this page must survive bad data
      // it did not write.
      if (!(stepMin > 0)) break;
      for (let m = startMin; m + duration <= endMin; m += stepMin) {
        const slot = coachTzInstant(civil.getUTCFullYear(), civil.getUTCMonth(), civil.getUTCDate(), m);
        if (slot.getTime() < minStart) continue;
        if (slot < windowStart || slot >= windowEnd) continue;
        // Skip if it overlaps an occupied window
        const slotStart = slot.getTime();
        // THE BUFFER IS PART OF THE BOOKING, not just of the grid spacing.
        // The step above already spaces slots by duration+buffer, but the
        // overlap test below only covered the duration - so a Google-busy block
        // ending at 11:00 still offered an 11:00 slot and left zero gap between
        // a real appointment and a stranger's session. The occupied window is
        // widened by the buffer on BOTH sides: his gap is needed after the
        // previous commitment and before the next one.
        const bufferMs = Math.max(0, buffer) * 60000;
        const slotEnd = slotStart + duration * 60000;
        const isBooked = (occupied || []).some(o => {
          const oStart = new Date(o.start_at).getTime() - bufferMs;
          const oEnd = oStart + bufferMs + (o.duration_min || duration) * 60000 + bufferMs;
          return slotStart < oEnd && slotEnd > oStart;
        });
        if (isBooked) continue;
        slots.push(slot);
        // (deduped after the loop - two overlapping rules for the same day,
        //  Mon 09-12 and Mon 10-14, otherwise emit 10:00 twice and the second
        //  one 23505s against the unique confirmed-slot index on confirm.)
      }
    }
  }
  // One instant, one button. Overlapping rules are legitimate - a coach can
  // add Mon 09-12 and Mon 10-14 without meaning to offer 10:00 twice.
  const seen = new Set();
  const unique = [];
  for (const sl of slots.sort((a, b) => a - b)) {
    const k = sl.getTime();
    if (seen.has(k)) continue;
    seen.add(k);
    unique.push(sl);
  }
  return unique;
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

  // THE PAGE LOADS ONCE. THE WEEK RELOADS ON ITS OWN.
  //
  // This was one effect keyed on [slug, weekOffset], so every NEXT -> click
  // re-fetched the coach's settings and his availability rules - neither of
  // which depends on the week - and flipped `loading` back on, blanking the
  // whole page including the header. Two effects: identity, then occupancy.
  useEffect(() => {
    if (!slug) return;
    let alive = true;
    (async () => {
      setLoading(true);
      const { data: s, error: se } = await supabase.from('coach_booking_settings').select('*').eq('slug', slug).maybeSingle();
      if (!alive) return;
      // NO RAW DB TEXT ON A PUBLIC PAGE. The submit path already knew this; the
      // load path printed se.message verbatim, which is schema detail on an
      // anonymous page. The real error still reaches the console.
      if (se) { console.error('[booking] settings load failed', se); setError(tr(readLang(), 'Could not load this booking page. Please try again.')); setLoading(false); return; }
      if (!s) { setError(tr(readLang(), 'That booking page doesn’t exist.')); setLoading(false); return; }
      setSettings(s);
      const { data: r } = await supabase.from('availability_rules').select('*').eq('coach_email', s.coach_email);
      if (!alive) return;
      setRules(r || []);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [slug]);

  // Occupancy is the only thing a week change actually needs. It fetches the
  // 7 days it renders, not 14 - the other half was discarded by the memo below
  // and re-fetched on the next click anyway. One buffer-day on the leading edge
  // so an event running INTO the window still arrives (the RPC matches on
  // overlap now, not on start instant).
  useEffect(() => {
    if (!settings) return;
    let alive = true;
    (async () => {
      const wStart = startOfWeek(new Date(Date.now() + weekOffset * 7 * 86400000));
      const { data: occ } = await supabase.rpc('get_occupied_slots', {
        p_coach_email: settings.coach_email,
        p_from: new Date(wStart.getTime() - 86400000).toISOString(),
        p_to: new Date(wStart.getTime() + 7 * 86400000).toISOString(),
      });
      if (!alive) return;
      setOccupied(occ || []);
    })();
    return () => { alive = false; };
  }, [settings, weekOffset]);

  // A slot picked in one week must not stay selected into another - the confirm
  // panel used to sit under a different week's grid showing a date the visitor
  // was no longer looking at.
  useEffect(() => { setSelectedSlot(null); }, [weekOffset]);

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
      // Once the recommended partial-unique index on (coach_email, start_at)
      // WHERE status='confirmed' is in place, a slot taken between the visitor's
      // snapshot and submit rejects with 23505 — tell them it's taken and mark
      // the slot occupied so it greys out, instead of a generic "try again".
      const dup = /duplicate key|23505|already exists|unique/i.test(`${e?.message || ''} ${e?.code || ''}`);
      if (dup) {
        toast('That time was just booked — please pick another slot.', 'error');
        setOccupied(prev => [...prev, { start_at: selectedSlot.toISOString() }]);
        setSelectedSlot(null);
      } else {
        toast('Booking failed — please try again, or contact us directly.', 'error');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <Wrapper><div style={{ padding: 30, textAlign: 'center', color: C.td }}>{tr(readLang(), 'Loading…')}</div></Wrapper>;
  }
  if (error || !settings) {
    return <Wrapper><div style={{ padding: 30, textAlign: 'center', color: C.rd, fontSize: 14 }}>{error || 'Not found.'}</div></Wrapper>;
  }
  if (confirmation) {
    return (
      <Wrapper>
        <div style={{ padding: 30, textAlign: 'center' }}>
          <div style={{ fontFamily: FN, fontSize: 10, color: C.gn, letterSpacing: '0.18em', fontWeight: 700, marginBottom: 16 }}>✓ {tr(readLang(), 'BOOKED')}</div>
          <div style={{ fontSize: 16, color: C.tx, marginBottom: 8 }}>
            {confirmation.when.toLocaleDateString('en-GB')} · {pad(confirmation.when.getHours())}:{pad(confirmation.when.getMinutes())}
          </div>
          <div style={{ fontSize: 13, color: C.tm, marginBottom: 16 }}>
            with {settings.display_name || 'your coach'}
          </div>
          {safeUrl(confirmation.zoom) && (
            <a href={safeUrl(confirmation.zoom)} target="_blank" rel="noopener noreferrer"
              style={{ display: 'inline-block', padding: '10px 18px', background: C.ac, color: C.acOnSurface, textDecoration: 'none', fontFamily: FN, fontSize: 12, fontWeight: 700, letterSpacing: '0.12em' }}>
              {tr(readLang(), 'JOIN ZOOM →')}
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
            style={{ padding: '4px 10px', background: 'transparent', border: `1px solid ${weekOffset === 0 ? C.cardBd : C.ac}`, color: weekOffset === 0 ? C.td : C.ac, cursor: weekOffset === 0 ? 'default' : 'pointer' }}>← {tr(readLang(), 'PREV')}</button>
          <span style={{ flex: 1, textAlign: 'center' }}>{tr(readLang(), 'WEEK OF')}{ymd(startOfWeek(new Date(Date.now() + weekOffset * 7 * 86400000)))}</span>
          <button onClick={() => setWeekOffset(o => o + 1)}
            style={{ padding: '4px 10px', background: 'transparent', border: `1px solid ${C.ac}`, color: C.ac, cursor: 'pointer' }}>{tr(readLang(), 'NEXT →')}</button>
        </div>

        {/* SAY WHICH CLOCK. Every time on this page is rendered with the
            VISITOR's local getHours(), which is correct - the instant is
            computed from Israel wall-clock in coachTzInstant - but nothing told
            them so. A client abroad read "14:00" and turned up at 14:00 Israel
            time. The instant was right; the human was not told. */}
        <div style={{ textAlign: 'center', fontSize: 11, color: C.td, marginBottom: 10 }}>
          {tr(readLang(), 'Times are shown in your own timezone')}
          {(() => { try { return ' · ' + Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return ''; } })()}
        </div>

        {Object.keys(groupedByDay).length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: C.td, fontSize: 13 }}>{tr(readLang(), 'No available slots this week. Try next week →')}</div>
        ) : Object.entries(groupedByDay).map(([day, daySlots]) => (
          <div key={day} style={{ marginBottom: 14 }}>
            <div style={{ fontFamily: FN, fontSize: 10, color: C.tm, letterSpacing: '0.12em', fontWeight: 700, marginBottom: 6 }}>
              {new Date(day + 'T12:00:00').toLocaleDateString(readLang() === 'he' ? 'he-IL' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase()}
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
            <div style={{ fontFamily: FN, fontSize: 10, color: C.ac, letterSpacing: '0.12em', fontWeight: 700, marginBottom: 8 }}>{tr(readLang(), 'CONFIRM ·')}{selectedSlot.toLocaleDateString('en-GB')} at {pad(selectedSlot.getHours())}:{pad(selectedSlot.getMinutes())}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginBottom: 8 }}>
              <input placeholder={tr(readLang(), 'Your name *')} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                style={inputStyle} />
              <input placeholder={tr(readLang(), 'Email')} type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                style={inputStyle} />
              <input placeholder={tr(readLang(), 'Phone (WhatsApp)')} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                style={inputStyle} autoComplete="off" />
              <input placeholder={tr(readLang(), 'Notes (optional)')} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                style={inputStyle} />
            </div>
            <button onClick={submit} disabled={submitting || !form.name.trim()}
              style={{
                width: '100%', padding: '10px 18px', background: form.name.trim() ? C.ac : C.cardBd,
                color: form.name.trim() ? '#000' : C.td,
                border: 'none', fontFamily: FN, fontSize: 12, fontWeight: 700, letterSpacing: '0.12em',
                cursor: submitting ? 'wait' : (form.name.trim() ? 'pointer' : 'default'),
                minWidth: 168, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}>{tr(readLang(), submitting ? 'BOOKING…' : 'CONFIRM BOOKING')}</button>
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
    <div dir={readLang() === 'he' ? 'rtl' : 'ltr'} style={{ background: 'var(--c-bg)', color: C.tx, minHeight: '100vh', fontFamily: FB }}>
      <header style={{ borderBottom: `1px solid ${C.cardBd}`, padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <EXPOMark height={28} />
        <a href="/" style={{ color: C.tm, textDecoration: 'none', fontFamily: FN, fontSize: 10, letterSpacing: '0.12em' }}>{tr(readLang(), 'EXPO-APP.CO.IL')}</a>
      </header>
      <main style={{ maxWidth: 720, margin: '0 auto' }}>
        {children}
      </main>
    </div>
  );
}
