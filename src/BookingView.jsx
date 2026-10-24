// /coach/calendar — who is booked with the coach, and the links clients book through.
//
// ONE BOOKING SYSTEM (#892, Ohad 22.10: "combine them"). There were two: the marketing site booked through his Google
// Appointment Schedules (gym / online) - the one clients actually used - and EXPO had its own /book/<slug> page with
// its own settings, weekly rules and a busy-time mirror, which nothing linked to and almost nobody booked through.
// Now Google is the one engine:
//   1. BOOKING LINKS - the website's chooser and the two Google schedules, to copy into a chat. Every old EXPO
//      /book/<slug> link forwards to the same chooser (App.jsx), so no link anywhere goes to a second system.
//   2. UPCOMING - the next 30 days from his Google Calendar (events with a client as a guest, googleCalendarSync
//      listAppointments) plus any EXPO booking still on the books, each matched to the athlete by email (then name),
//      with WhatsApp. EXPO bookings keep COMPLETED / CANCEL; Google ones open in Google.
// The retired engine's settings / rules / busy mirror were removed from this screen (git history of this file before #892).

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useT, tr, readLang } from './i18n';
import { fmtPrettyDate } from './dates';
import { C, FN, FB } from './theme';
import { supabase } from './supabase';
import { toast, confirmToast, CollapsibleSection, stripBtnBase } from './ui';
import { isCalendarConnected, connectGoogleCalendar, listAppointments, removeBookingFromCalendar } from './googleCalendarSync';
import { normalizePhoneIL } from './whatsappButton';

// the same two schedules the marketing site opens (expo-il/src/EntryChooser.jsx GCAL_GYM / GCAL_ONLINE)
export const GCAL_GYM = 'https://calendar.google.com/calendar/appointments/schedules/AcZssZ20Fi36rsE32wuwypV8krD2WvxeCaNEIRwpstQ6M1ZcJ3MND3VtOA5WH4VOCLAsRaF83pyb3MHq';
export const GCAL_ONLINE = 'https://calendar.google.com/calendar/appointments/schedules/AcZssZ2UA5-kdYxVjIBm0SLFL8Ov2Gqfw5NtAzEUCdaXgEvsBwOT3b9ZcTV19tbWRRIoetnPX2N1W5HW';
export const BOOKING_HOME = (lang) => (lang === 'he' ? 'https://expo-il.co.il/he' : 'https://expo-il.co.il/');

function pad(n) { return String(n).padStart(2, '0'); }
function fmtSlot(iso, duration) {
  try {
    const d = new Date(iso);
    const end = new Date(d.getTime() + duration * 60000);
    return `${fmtPrettyDate(d)} · ${pad(d.getHours())}:${pad(d.getMinutes())} → ${pad(end.getHours())}:${pad(end.getMinutes())}`;
  } catch { return iso; }
}
const emailsOf = (t) => (Array.isArray(t?.email) ? t.email : [t?.email]).filter((e) => typeof e === 'string' && e.trim()).map((e) => e.trim().toLowerCase());
const DAYS_AHEAD = 30;
// every action in a booking row is the same box (#892: the WhatsApp link rendered 6px taller than the buttons, text high)
const ACT = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: 28, boxSizing: 'border-box', padding: '0 10px', background: 'transparent', fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', lineHeight: 1, textDecoration: 'none', cursor: 'pointer' };

export default function BookingView({ trainees }) {
  const tt = useT();
  const lang = readLang();
  const [bookings, setBookings] = useState([]);   // EXPO rows still on the books
  const [gBookings, setGBookings] = useState(undefined);   // undefined = checking, null = not connected, [] = none
  const [gError, setGError] = useState('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState('');
  const PAD = 14;
  const coachEmail = 'ohadyproductions@gmail.com';

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const { data: b } = await supabase.from('bookings').select('id,coach_email,trainee_id,contact_name,contact_email,contact_phone,start_at,duration_min,status,notes,source,created_at,canceled_at,gcal_event_id')
        .eq('coach_email', coachEmail).neq('status', 'busy').gte('start_at', new Date(Date.now() - 60 * 60000).toISOString()).order('start_at');
      setBookings(b || []);
    } catch { /* a thrown read leaves prior data in place */ }
    finally { setLoading(false); }
  }, []);
  const loadGoogle = useCallback(async () => {
    setGError('');
    const connected = await isCalendarConnected().catch(() => false);
    if (!connected) { setGBookings(null); return; }
    try {
      setGBookings(await listAppointments(new Date(Date.now() - 60 * 60000).toISOString(), new Date(Date.now() + DAYS_AHEAD * 86400000).toISOString()));
    } catch (e) { setGBookings([]); setGError(String(e.message || e).slice(0, 120)); }
  }, []);
  useEffect(() => { reload(); loadGoogle(); }, [reload, loadGoogle]);

  const connect = async () => {
    try { await connectGoogleCalendar(); await loadGoogle(); } catch (e) { toast(String(e.message || e).slice(0, 90), 'error'); }
  };

  // ONE LIST: EXPO rows + Google events, an EXPO row that is already on his calendar shown once
  const byEmail = useMemo(() => { const m = new Map(); for (const t of trainees || []) for (const e of emailsOf(t)) m.set(e, t); return m; }, [trainees]);
  const byName = useMemo(() => { const m = new Map(); for (const t of trainees || []) if (t?.name) m.set(String(t.name).trim().toLowerCase(), t); return m; }, [trainees]);
  const traineesById = useMemo(() => Object.fromEntries((trainees || []).map((t) => [t.id, t])), [trainees]);
  const rows = useMemo(() => {
    const expo = (bookings || []).filter((b) => b.source !== 'calendar');
    const onCal = new Set(expo.map((b) => b.gcal_event_id).filter(Boolean));
    const g = (gBookings || []).filter((x) => !onCal.has(x.gcal_event_id));
    return [...expo, ...g]
      .map((b) => ({ ...b, athlete: (b.trainee_id && traineesById[b.trainee_id]) || byEmail.get(String(b.contact_email || '').toLowerCase()) || byName.get(String(b.contact_name || '').trim().toLowerCase()) || null }))
      .sort((a, b) => new Date(a.start_at) - new Date(b.start_at));
  }, [bookings, gBookings, byEmail, byName, traineesById]);

  const copy = async (key, url) => {
    try { await navigator.clipboard.writeText(url); setCopied(key); setTimeout(() => setCopied(''), 1800); } catch { toast(url, 'info', { ttl: 8000 }); }
  };

  const cancelBooking = async (id) => {
    if (!(await confirmToast('Cancel this booking?'))) return;
    const { error } = await supabase.from('bookings').update({ status: 'canceled', canceled_at: new Date().toISOString() }).eq('id', id);
    if (error) { toast(`Cancel failed: ${error.message}`, 'error'); return; }
    const bk = bookings.find((x) => x.id === id);
    if (bk && bk.gcal_event_id) {
      try { await removeBookingFromCalendar(bk.gcal_event_id); await supabase.from('bookings').update({ gcal_event_id: null }).eq('id', id); }
      catch (e) { toast(`Booking cancelled, but its Google Calendar event could not be removed: ${String(e.message || e).slice(0, 60)}`, 'warn'); }
    }
    setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, status: 'canceled', gcal_event_id: null } : b)));
  };
  const markCompleted = async (id) => {
    const { error } = await supabase.from('bookings').update({ status: 'completed' }).eq('id', id);
    if (error) { toast(`Update failed: ${error.message}`, 'error'); return; }
    setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, status: 'completed' } : b)));
  };

  if (loading) return <div style={{ padding: 30, textAlign: 'center', color: C.td }}>{tr(lang, 'Loading…')}</div>;

  // three cells per row in one grid: the label column is as wide as the widest label in this language (it was a fixed 110),
  // and a Google schedule (100 opaque characters) reads "Google Calendar" - Copy carries the whole link (#949 gate 24.10: ellipsised)
  const linkRow = (key, label, url) => {   // the gaps are cell padding, so each row's hairline runs unbroken
    const cell = { display: 'flex', alignItems: 'center', minHeight: 36, padding: '6px 0', boxSizing: 'border-box', borderBottom: key !== 'online' ? `1px solid ${C.cardBd}` : 'none' };
    return (
      <React.Fragment key={key}>
        <span style={{ ...cell, paddingInlineEnd: 10, fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.tx }}>{label}</span>
        <span style={{ ...cell, minWidth: 0 }}>
          <a href={url} target="_blank" rel="noopener noreferrer" dir="ltr" style={{ minWidth: 0, fontFamily: FN, fontSize: 11, color: C.acText || C.ac, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{/calendar\.google\.com/.test(url) ? 'Google Calendar' : url.replace(/^https:\/\//, '')}</a>
        </span>
        <span style={{ ...cell, paddingInlineStart: 10 }}>
          <button type="button" onClick={() => copy(key, url)} style={{ ...stripBtnBase, height: 26, border: `1px solid ${C.cardBd}`, color: copied === key ? C.gn : C.tm, minWidth: 64 }}>{copied === key ? tt('Copied') : tt('Copy')}</button>
        </span>
      </React.Fragment>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <CollapsibleSection title={tt('Booking links')} storageKey="cal-links" padX={PAD} padY={8} style={{ marginBottom: 0 }}>
        <div style={{ fontFamily: FB, fontSize: 12, color: C.tm, margin: '4px 0 6px' }}>{tt('Where clients book - the same page as the website.')}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'max-content minmax(0, 1fr) auto' }}>
          {linkRow('home', tt('Booking page'), BOOKING_HOME(lang))}
          {linkRow('gym', tt('Gym'), GCAL_GYM)}
          {linkRow('online', tt('Online'), GCAL_ONLINE)}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title={tt('UPCOMING')} count={rows.length} storageKey="cal-upcoming" padX={PAD} padY={PAD} style={{ marginBottom: 0 }}
        right={gBookings === null ? <button type="button" onClick={connect} style={{ ...stripBtnBase, border: '1px solid var(--c-stripTx)', color: 'var(--c-stripTx)' }}>{tt('Connect Google Calendar')}</button> : null}>
        {gBookings === null && (
          <div style={{ margin: '0 0 10px', padding: '9px 12px', border: `1px solid ${C.cardBd}`, fontFamily: FB, fontSize: 12, color: C.tx }}>
            {tt("Google Calendar isn't connected - connect it to see who booked.")}
          </div>
        )}
        {gError && <div style={{ margin: '0 0 10px', fontFamily: FB, fontSize: 12, color: C.rd }}>{gError}</div>}
        {rows.length === 0 ? (
          <div style={{ padding: '6px 14px 0' /* the section's own padding is the bottom (#964: 12 more made 29 under it vs 13 above) */, textAlign: 'center', color: C.td, fontSize: 13 }}>{tt('No bookings in the next 30 days.')}</div>
        ) : rows.map((b, i) => {
          const dayKey = new Date(b.start_at).toDateString();
          const showDay = i === 0 || dayKey !== new Date(rows[i - 1].start_at).toDateString();
          const dayLabel = dayKey === new Date().toDateString() ? tt('TODAY')
            : dayKey === new Date(Date.now() + 86400000).toDateString() ? tt('TOMORROW')
              : new Date(b.start_at).toLocaleDateString(lang === 'he' ? 'he-IL' : undefined, { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase();
          const past = new Date(b.start_at).getTime() < Date.now();
          const google = b.source === 'google';
          const sevColor = b.status === 'canceled' ? C.rd : b.status === 'completed' ? C.gn : (past ? C.or : C.ac);
          const phone = normalizePhoneIL((b.athlete && b.athlete.phone) || b.contact_phone || '');
          return (
            <React.Fragment key={b.id}>
              {showDay && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '10px 0 6px', fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.tm }}>
                  <span>{dayLabel}</span><span style={{ flex: 1, height: 1, background: C.cardBd }} />
                </div>
              )}
              <div style={{ border: `1px solid ${sevColor}`, padding: '10px 12px', marginBottom: 8, background: 'var(--c-sf)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, fontFamily: FN, fontSize: 9, color: sevColor, fontWeight: 700, letterSpacing: '0.12em', border: `1px solid ${sevColor}`, padding: '3px 8px', width: 96, boxSizing: 'border-box', flexShrink: 0 }}>
                    {google ? 'GOOGLE' : tr(lang, (b.status || '').toUpperCase())}
                  </span>
                  <span style={{ fontWeight: 700, fontSize: 14, color: C.tx }}>{(b.athlete && b.athlete.name) || b.contact_name || b.contact_email}</span>
                  <span style={{ flex: 1 }} />
                  <span style={{ fontFamily: FN, fontSize: 11, color: C.tx }}>{fmtSlot(b.start_at, b.duration_min)}</span>
                </div>
                {(b.title || b.contact_email) && <div style={{ fontSize: 11, color: C.tm, marginBottom: 4 }}>{[b.title, b.contact_email].filter(Boolean).join(' · ')}</div>}
                {b.notes && <div style={{ fontSize: 12, color: C.tx, marginBottom: 6, whiteSpace: 'pre-wrap' }}>{b.notes}</div>}
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  {phone && <a href={`https://wa.me/${phone}`} target="_blank" rel="noopener noreferrer" style={{ ...ACT, border: `1px solid ${C.cardBd}`, color: C.tm }}>{tt('WhatsApp')}</a>}
                  {google && b.htmlLink && <a href={b.htmlLink} target="_blank" rel="noopener noreferrer" style={{ ...ACT, border: `1px solid ${C.cardBd}`, color: C.tm }}>{tt('Open in Google')}</a>}
                  {!google && b.status === 'confirmed' && (
                    <>
                      <button onClick={() => markCompleted(b.id)} style={{ ...ACT, border: `1px solid ${C.gn}`, color: C.gn }}>✓ {tr(lang, 'COMPLETED')}</button>
                      <button onClick={() => cancelBooking(b.id)} style={{ ...ACT, border: `1px solid ${C.rd}`, color: C.rd }}>× {tr(lang, 'CANCEL')}</button>
                    </>
                  )}
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </CollapsibleSection>
    </div>
  );
}
