// /book/<slug> — public booking page. Resolves the slug to coach
// settings, renders a week-view slot picker, captures (name, email,
// phone, notes), inserts into public.bookings with source='public'.
//
// No login required. RLS lets anon INSERT bookings as long as source
// is 'public', start_at is in the future, and coach_email + name are
// present. Occupied slots come from get_occupied_slots() SECURITY
// DEFINER (no PII).

import React, { useEffect, useState, useMemo, useRef } from 'react';
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

// AN ARROW POINTS THE WAY THE READER IS GOING.
//
// Both week arrows were hardcoded, so in Hebrew "next" and "previous" pointed
// the SAME way (left) and the next-opening button pointed right - backwards for
// a forward action in RTL. Forward is left in RTL and right in LTR; back is the
// mirror. (memory: rtl-forward-cta-arrows - the arrow sits at the logical END.)
const fwdArrow = () => (readLang() === 'he' ? '←' : '→');
const backArrow = () => (readLang() === 'he' ? '→' : '←');

// SOMETHING THE CLIENT CAN KEEP.
//
// A booking sent no email, no SMS and no invite: close the tab and there was no
// record of it on the client's side at all. Until a real notification exists,
// the very least the page can do is hand them a calendar entry, and that needs
// no backend - the file is built here and offered as a download.
function icsFor(when, minutes, title, location, description) {
  const pad2 = (n) => String(n).padStart(2, '0');
  const z = (d) => `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}00Z`;
  const end = new Date(when.getTime() + (minutes || 60) * 60000);
  // RFC 5545 wants CRLF, and commas / semicolons inside a value are escaped.
  // Escapes per RFC 5545: a backslash, comma or semicolon inside a value is
  // prefixed, and a newline becomes the two characters backslash-n. Built with
  // fromCharCode so the escaping survives being written by a script.
  const BS = String.fromCharCode(92);
  const esc = (t) => String(t || '')
    .replace(new RegExp('([,;' + BS + BS + '])', 'g'), BS + '$1')
    .replace(new RegExp(String.fromCharCode(13) + '?' + String.fromCharCode(10), 'g'), BS + 'n');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//EXPO//booking//EN', 'BEGIN:VEVENT',
    `UID:${z(when)}-${Math.random().toString(36).slice(2, 10)}@expo-app.co.il`,
    `DTSTAMP:${z(new Date())}`, `DTSTART:${z(when)}`, `DTEND:${z(end)}`,
    `SUMMARY:${esc(title)}`,
    location ? `LOCATION:${esc(location)}` : null,
    description ? `DESCRIPTION:${esc(description)}` : null,
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean);
  // CRLF between lines, per the spec.
  const CRLF = String.fromCharCode(13) + String.fromCharCode(10);
  return 'data:text/calendar;charset=utf-8,' + encodeURIComponent(lines.join(CRLF));
}

// "28/09/2026 AT 10:15" is a receipt, not a sentence. And en-GB was hardcoded
// under dir=rtl, so a Hebrew client got an English date on the one line that
// has to be unambiguous.
function prettyWhen(d) {
  if (!d) return '';
  const loc = readLang() === 'he' ? 'he-IL' : 'en-GB';
  const day = d.toLocaleDateString(loc, { weekday: 'short', day: 'numeric', month: 'short' });
  return `${day} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
  const [cancelId, setCancelId] = useState(null);
  const [cancelState, setCancelState] = useState('working');
  const [cancelWhen, setCancelWhen] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState(null);

  useEffect(() => {
    const c = window.location.pathname.match(/^\/book\/cancel\/([0-9a-fA-F-]{36})/);
    if (c) { setCancelId(c[1]); return; }
    const m = window.location.pathname.match(/^\/book\/([^/]+)/);
    setSlug(m ? m[1].toLowerCase() : null);
  }, []);

  useEffect(() => {
    if (!cancelId) return;
    let alive = true;
    (async () => {
      const { data, error: ce } = await supabase.rpc('cancel_booking', { p_id: cancelId });
      if (!alive) return;
      const row = Array.isArray(data) ? data[0] : data;
      if (ce || !row || !row.ok) { console.error('[booking] cancel failed', ce); setCancelState('failed'); return; }
      if (row.start_at) setCancelWhen(new Date(row.start_at));
      setCancelState('done');
    })();
    return () => { alive = false; };
  }, [cancelId]);

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


  const slots = useMemo(() => {
    if (!settings) return [];
    const wStart = startOfWeek(new Date(Date.now() + weekOffset * 7 * 86400000));
    const wEnd = new Date(wStart.getTime() + 7 * 86400000);
    return generateSlots(rules, settings.duration_min, settings.buffer_min, settings.lead_time_hours, wStart, wEnd, occupied);
  }, [rules, settings, weekOffset, occupied]);

  // "WEEK OF2026-09-20" - a missing space and a raw ISO date on a page meant for
  // clients. A week is easier to recognise by its span than by its Monday.
  const weekLabel = useMemo(() => {
    const a = startOfWeek(new Date(Date.now() + weekOffset * 7 * 86400000));
    const b = new Date(a.getTime() + 6 * 86400000);
    const loc = readLang() === 'he' ? 'he-IL' : 'en-GB';
    const d = (x, withMonth) => x.toLocaleDateString(loc, withMonth ? { day: 'numeric', month: 'short' } : { day: 'numeric' });
    const sameMonth = a.getMonth() === b.getMonth();
    if (weekOffset === 0) return tr(readLang(), 'THIS WEEK') + ' · ' + d(a, !sameMonth) + ' – ' + d(b, true);
    return d(a, !sameMonth) + ' – ' + d(b, true);
  }, [weekOffset]);

  const groupedByDay = useMemo(() => {
    const out = {};
    for (const s of slots) {
      const key = ymd(s);
      if (!out[key]) out[key] = [];
      out[key].push(s);
    }
    return out;
  }, [slots]);

  // THE NEXT REAL OPENING, looked for only when this week has none.
  //
  // One extra RPC, 8 weeks wide, run lazily - the common case (a week with
  // slots) costs nothing. Generating slots week by week against the same rules
  // the grid uses means the answer is the same answer, not an estimate.
  const [nextOpen, setNextOpen] = useState(null);
  const [searchedAhead, setSearchedAhead] = useState(false);
  // A REF, NOT STATE. As state it was a dependency of the clear-on-week-change
  // effect below, so the moment the pick was consumed and set back to null that
  // effect re-ran and wiped the very selection the jump had just made - the
  // week changed correctly and nothing was selected.
  const pendingPickRef = useRef(null);
  const weekIsEmpty = Object.keys(groupedByDay).length === 0;
  useEffect(() => {
    if (!settings || !weekIsEmpty) { setNextOpen(null); setSearchedAhead(false); return; }
    let alive = true;
    (async () => {
      const from = startOfWeek(new Date(Date.now() + weekOffset * 7 * 86400000));
      const to = new Date(from.getTime() + 8 * 7 * 86400000);
      const { data: occ } = await supabase.rpc('get_occupied_slots', {
        p_coach_email: settings.coach_email,
        p_from: new Date(from.getTime() - 86400000).toISOString(),
        p_to: to.toISOString(),
      });
      if (!alive) return;
      for (let w = weekOffset + 1; w <= weekOffset + 8; w++) {
        const a = startOfWeek(new Date(Date.now() + w * 7 * 86400000));
        const found = generateSlots(rules, settings.duration_min, settings.buffer_min,
          settings.lead_time_hours, a, new Date(a.getTime() + 7 * 86400000), occ || []);
        if (found.length) { setNextOpen({ offset: w, at: found[0] }); setSearchedAhead(true); return; }
      }
      setNextOpen(null); setSearchedAhead(true);
    })();
    return () => { alive = false; };
  }, [settings, rules, weekOffset, weekIsEmpty]);


  // A slot picked in one week must not stay selected into another - the confirm
  // panel used to sit under a different week's grid showing a date the visitor
  // was no longer looking at.
  // ...unless the week changed BECAUSE the visitor tapped "next opening", in
  // which case the pick is the whole point of the jump. React runs effects in
  // declaration order within a commit, so without this guard the clear below
  // would undo the selection the jump had just made.
  useEffect(() => { if (pendingPickRef.current == null) setSelectedSlot(null); }, [weekOffset]);

  // Jumping to the next opening should land on it, not just on its week.
  useEffect(() => {
    const want = pendingPickRef.current;
    if (want == null) return;
    const hit = slots.find((x) => x.getTime() === want);
    if (hit) { setSelectedSlot(hit); pendingPickRef.current = null; }
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
      // Return the row so the confirmation can hand back a cancel link. Without
      // the id the client has no way out except messaging him.
      const { data: made, error } = await supabase.from('bookings').insert(row).select('id').single();
      if (error) throw error;
      setConfirmation({
        when: selectedSlot,
        zoom: settings.zoom_url,
        id: made?.id || null,
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

  // /book/cancel/<id> - the client's own way out.
  //
  // The policy text was displayed and there was no way to act on it: a client
  // who could not make it had to reach Ohad directly, and a no-show costs him
  // the hour either way. The booking's uuid is the capability - it is given
  // only to the person who booked - and it can do exactly one thing, because
  // the work happens in a SECURITY DEFINER function that can only move a
  // confirmed FUTURE booking to canceled.
  if (cancelId) {
    return (
      <Wrapper>
        <div style={{ padding: 30, textAlign: 'center' }}>
          {cancelState === 'working' && <div style={{ color: C.td, fontSize: 13 }}>{tr(readLang(), 'Loading…')}</div>}
          {cancelState === 'done' && (
            <>
              <div style={{ fontFamily: FN, fontSize: 10, color: C.gn, letterSpacing: '0.18em', fontWeight: 700, marginBottom: 14 }}>
                ✓ {tr(readLang(), 'Cancelled')}
              </div>
              {cancelWhen && <div style={{ fontSize: 15, color: C.tx, marginBottom: 10 }}>{prettyWhen(cancelWhen)}</div>}
              <div style={{ fontSize: 13, color: C.tm, lineHeight: 1.6, maxWidth: 360, margin: '0 auto' }}>
                {tr(readLang(), 'That time is free again. You are welcome to book another.')}
              </div>
              <a href={slug ? `/book/${slug}` : '/'} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  minHeight: 'var(--btn-h)', padding: '0 16px', marginTop: 18, background: 'transparent',
                  border: `1px solid ${C.ac}`, color: C.ac, textDecoration: 'none', fontFamily: FN, fontSize: 11,
                  fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                {tr(readLang(), 'Book another time')}
              </a>
            </>
          )}
          {cancelState === 'failed' && (
            <div style={{ fontSize: 13, color: C.tm, lineHeight: 1.6, maxWidth: 380, margin: '0 auto' }}>
              {tr(readLang(), 'We could not cancel that one — it may have already passed. Please message us.')}
            </div>
          )}
        </div>
      </Wrapper>
    );
  }

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
            {prettyWhen(confirmation.when)}
          </div>
          <div style={{ fontSize: 13, color: C.tm, marginBottom: 16 }}>
            {tr(readLang(), 'with')} {settings.display_name || tr(readLang(), 'your coach')}
          </div>
          {safeUrl(confirmation.zoom) && (
            <a href={safeUrl(confirmation.zoom)} target="_blank" rel="noopener noreferrer"
              style={{ display: 'inline-block', padding: '10px 18px', background: C.ac, color: C.acOnSurface, textDecoration: 'none', fontFamily: FN, fontSize: 12, fontWeight: 700, letterSpacing: '0.12em' }}>
              {tr(readLang(), 'JOIN ZOOM →')}
            </a>
          )}
          {/* WHAT HAPPENS NEXT. The screen used to state the time and stop, so
              a client closed the tab holding nothing - no email, no invite, no
              record. Until a notification exists, they at least leave with a
              calendar entry and with the next step spelled out. */}
          <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <a href={icsFor(confirmation.when, settings.duration_min,
                  `${tr(readLang(), 'Session')} · ${settings.display_name || 'EXPO'}`,
                  safeUrl(confirmation.zoom) || '',
                  [settings.bio || '', confirmation.id ? `${tr(readLang(), 'Cancel')}: ${window.location.origin}/book/cancel/${confirmation.id}` : ''].filter(Boolean).join(' '))}
              download="expo-session.ics"
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 'var(--btn-h)', padding: '0 16px',
                background: 'transparent', border: `1px solid ${C.ac}`, color: C.ac, textDecoration: 'none',
                fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              {tr(readLang(), 'Add to calendar')}
            </a>
            <div style={{ fontSize: 12.5, color: C.tm, lineHeight: 1.6, maxWidth: 360 }}>
              {tr(readLang(), 'Your time is held. We will be in touch to confirm the details.')}
            </div>
            {confirmation.id && (
              <a href={`/book/cancel/${confirmation.id}`}
                style={{ fontSize: 12, color: C.td, textDecoration: 'underline', marginTop: 2 }}>
                {tr(readLang(), 'Need to cancel?')}
              </a>
            )}
          </div>
          {settings.cancellation_policy && (
            <div style={{ marginTop: 20, fontSize: 11, color: C.td, lineHeight: 1.5 }}>{settings.cancellation_policy}</div>
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
        {settings.bio && <p dir="auto" style={{ margin: '0 0 12px', color: C.tm, fontSize: 13, lineHeight: 1.5 }}>{settings.bio}</p>}
        {/* WHAT THE SESSION IS, before they are asked to pick a time. The page
            used to open straight onto a week grid: a stranger was choosing an
            hour without being told how long it runs or where it happens. */}
        <div className="bk-facts">
          <span><b>{settings.duration_min || 60}</b> {tr(readLang(), 'minutes')}</span>
          <span>{settings.zoom_url ? tr(readLang(), 'Online session') : tr(readLang(), 'In person')}</span>
          {settings.lead_time_hours > 0 && (
            <span>{tr(readLang(), 'Book at least')} {settings.lead_time_hours}{tr(readLang(), 'h ahead')}</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, fontFamily: FN, fontSize: 10, color: C.tm, letterSpacing: '0.12em' }}>
          <button onClick={() => setWeekOffset(o => Math.max(0, o - 1))} disabled={weekOffset === 0}
            style={{ padding: '0 12px', minHeight: 'var(--btn-h)', background: 'transparent', border: weekOffset === 0 ? '1px solid transparent' : `1px solid ${C.ac}`, color: weekOffset === 0 ? C.td : C.ac, opacity: weekOffset === 0 ? 0.45 : 1, cursor: weekOffset === 0 ? 'default' : 'pointer' }}>{backArrow()} {tr(readLang(), 'PREV')}</button>
          <span style={{ flex: 1, textAlign: 'center' }}>{weekLabel}</span>
          <button onClick={() => setWeekOffset(o => o + 1)}
            style={{ padding: '0 12px', minHeight: 'var(--btn-h)', background: 'transparent', border: `1px solid ${C.ac}`, color: C.ac, cursor: 'pointer' }}>{tr(readLang(), 'NEXT')} {fwdArrow()}</button>
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
          /* AN EMPTY WEEK MUST NOT BE A DEAD END.
             It used to say "try next week" and leave the visitor clicking NEXT
             and guessing. With one availability rule (Mondays) that is the most
             likely first impression of the whole page. It now finds the next
             real opening and offers it as one tap. */
          <div style={{ padding: '26px 8px', textAlign: 'center' }}>
            <div style={{ color: C.td, fontSize: 13, marginBottom: nextOpen ? 14 : 0 }}>
              {tr(readLang(), 'Nothing free this week.')}
            </div>
            {nextOpen && (
              <button onClick={() => { pendingPickRef.current = nextOpen.at.getTime(); setWeekOffset(nextOpen.offset); }}
                style={{ background: 'transparent', border: `1px solid ${C.ac}`, color: C.ac, borderRadius: 0,
                  padding: '0 16px', minHeight: 'var(--btn-h)', fontFamily: FN, fontSize: 11.5, fontWeight: 700,
                  letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer' }}>
                {tr(readLang(), 'Next opening')} · {nextOpen.at.toLocaleDateString(readLang() === 'he' ? 'he-IL' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} {pad(nextOpen.at.getHours())}:{pad(nextOpen.at.getMinutes())} {fwdArrow()}
              </button>
            )}
            {!nextOpen && searchedAhead && (
              <div style={{ color: C.td, fontSize: 12.5, marginTop: 6 }}>
                {tr(readLang(), 'No openings in the next 8 weeks — message us and we will find a time.')}
              </div>
            )}
          </div>
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
            <div style={{ fontFamily: FN, fontSize: 10, color: C.ac, letterSpacing: '0.12em', fontWeight: 700, marginBottom: 8 }}>{tr(readLang(), 'Confirm')} · {prettyWhen(selectedSlot)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 8, marginBottom: 8 }}>
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
