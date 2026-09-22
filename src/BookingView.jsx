// /coach/calendar — booking management for the coach side.
//
// Three subsections:
//   1. SETTINGS — slug + display name + Zoom URL + cancellation policy +
//      duration / buffer / lead-time
//   2. AVAILABILITY — weekly recurring rules (day_of_week, start, end)
//   3. UPCOMING — the next ~30 days of bookings, with cancel + complete
//      controls. Public link displayed so the coach can copy/paste.
//
// Bookings come in via the public /book/<slug> route (BookingPublic.jsx).

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useT, useTB, tr, readLang } from './i18n';
import { fmtPrettyDate } from './dates';
import { C, FN, FB } from './theme';
import { supabase } from './supabase';
import { isRefined5b, RefinedHeaderStrip, Btn, Input, toast, confirmToast, CollapsibleSection, stripBtnBase } from './ui';
import { fetchBusy, isCalendarConnected, pushBookingToCalendar, removeBookingFromCalendar } from './googleCalendarSync';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function pad(n) { return String(n).padStart(2, '0'); }
function fmtSlot(iso, duration) {
  try {
    const d = new Date(iso);
    const end = new Date(d.getTime() + duration * 60000);
    return `${fmtPrettyDate(d)} · ${pad(d.getHours())}:${pad(d.getMinutes())} → ${pad(end.getHours())}:${pad(end.getMinutes())}`;
  } catch { return iso; }
}

function bookingPublicUrl(slug) {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}/book/${slug || 'YOUR-SLUG'}`;
}

// A SETTING A COACH CAN TYPE MUST NOT BE ABLE TO HANG A STRANGER'S BROWSER.
//
// These three fed straight into the public page: duration + buffer is the step
// of its slot loop, so a typed "-60" made `m += stepMin` run backwards forever
// in a visitor's tab. `parseInt(x) || d` also let a negative through untouched.
// Clamped at the source as well as defensively in the loop itself.
function clampSetting(raw, fallback, lo, hi) {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
}

export default function BookingView({ trainees }) {
  const tt = useT();
  const tb = useTB();
  const [settings, setSettings] = useState(null);
  const [rules, setRules] = useState([]);
  const [bookings, setBookings] = useState([]);
  // The calendar sync is async and long-running, so it must not read `bookings`
  // or `settings` out of the closure it was created in - by the time it gets to
  // the push loop the reload it triggered has already replaced both. Refs mirror
  // the current values.
  // WHAT "UPCOMING" MEANS. The count used to be every confirmed booking in the
  // whole window, which starts 7 days in the PAST - a session finished on
  // Tuesday and never marked completed inflated it. And the list filtered out
  // the Google-busy mirror rows while the empty state counted them, so a day
  // with busy rows and no bookings rendered a blank card.
  // One list now, sorted, used by the header count, the empty state and the rows.
  const realBookings = useMemo(() => (bookings || [])
    .filter((b) => b.status !== 'busy' && new Date(b.start_at).getTime() >= Date.now() - 60 * 60000)
    .sort((a, b) => new Date(a.start_at) - new Date(b.start_at)), [bookings]);
  const bookingsRef = useRef([]);
  const settingsRef = useRef(null);
  useEffect(() => { bookingsRef.current = bookings; }, [bookings]);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  const [loading, setLoading] = useState(true);
  const [draftSettings, setDraftSettings] = useState(null);
  const [calBusy, setCalBusy] = useState({ connected: null, blocks: 0, syncedAt: null, error: '' });
  const refined = isRefined5b();
  const PAD = 14;
  const coachEmail = 'ohadyproductions@gmail.com';

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: s }, { data: r }, { data: b }] = await Promise.all([
        supabase.from('coach_booking_settings').select('*').eq('coach_email', coachEmail).maybeSingle(),
        supabase.from('availability_rules').select('*').eq('coach_email', coachEmail).order('day_of_week').order('start_time'),
        supabase.from('bookings').select('id,coach_email,trainee_id,contact_name,contact_email,contact_phone,start_at,duration_min,status,notes,source,created_at,canceled_at,gcal_event_id').eq('coach_email', coachEmail).gte('start_at', new Date(Date.now() - 7 * 86400000).toISOString()).order('start_at'),
      ]);
      setSettings(s);
      setDraftSettings(s || { coach_email: coachEmail, slug: 'ohad', display_name: 'Ohad — EXPO', duration_min: 60, buffer_min: 15, lead_time_hours: 4, zoom_url: '', cancellation_policy: 'Cancel at least 4 hours in advance to avoid a session being marked used.' });
      setRules(r || []);
      setBookings(b || []);
    } catch { /* a thrown read leaves prior data in place */ }
    finally { setLoading(false); } // never strand the spinner
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // WHAT HIS CALENDAR ALREADY OWNS.
  //
  // Ohad, 18.9: "make sure the weekly availability is synced with expo
  // calanders". The rules say WHEN he can be booked; the calendar says when he
  // already is. Busy time is mirrored into bookings as status='busy' so
  // get_occupied_slots() takes those slots off the public page exactly like a
  // real booking - no event titles are copied, only the interval, because the
  // public page needs to know a slot is gone and nothing else.
  //
  // Idempotent: the window's existing calendar blocks are replaced, never added
  // to, so running it twice cannot double-book anything.
  const DAYS_AHEAD = 21;
  const syncCalendarBusy = useCallback(async (quiet = false) => {
    const connected = await isCalendarConnected().catch(() => false);
    if (!connected) { setCalBusy({ connected: false, blocks: 0, syncedAt: null, error: '' }); return; }
    try {
      const from = new Date();
      const to = new Date(Date.now() + DAYS_AHEAD * 86400000);
      const spans = await fetchBusy(from.toISOString(), to.toISOString());
      const rows = spans.map((b) => ({
        coach_email: coachEmail,
        contact_name: 'Calendar',
        start_at: new Date(b.start).toISOString(),
        duration_min: Math.max(5, Math.round((new Date(b.end) - new Date(b.start)) / 60000)),
        status: 'busy',
        source: 'calendar',
      })).filter((r2) => r2.duration_min <= 24 * 60);
      // Delete only what THIS sync owns: his rows, status busy, SOURCE calendar,
      // inside the window being resynced. status alone was already enough to
      // keep a real athlete booking safe, but a future writer of busy rows from
      // another source would have been wiped by a calendar sync, and a DELETE
      // should never be broader than the thing replacing it.
      await supabase.from('bookings').delete()
        .eq('coach_email', coachEmail).eq('status', 'busy').eq('source', 'calendar')
        .gte('start_at', from.toISOString()).lt('start_at', to.toISOString());
      if (rows.length) {
        const { error } = await supabase.from('bookings').insert(rows);
        if (error) throw error;
      }
      // AND THE OTHER DIRECTION (#142). Everything above stops EXPO offering a
      // slot Google has taken. This stops GOOGLE offering a slot EXPO has
      // taken: every confirmed booking that is not yet on his calendar becomes
      // an event, and the event id is stored so it is never created twice.
      //
      // Here, not at insert time, because the OAuth token lives in the COACH's
      // browser - the public booking page is anonymous and has no token. So it
      // is reconciliation, and it catches up whenever he opens this screen.
      //
      // One failure does not stop the rest: a single event that will not create
      // should not block the other nine.
      // AND TAKE DOWN WHAT IS NO LONGER BOOKED. A client can now cancel their
      // own booking from /book/cancel/<id>, which the coach's browser knows
      // nothing about - without this, a cancelled session keeps blocking his
      // appointment page until he notices and cancels it again by hand.
      let removed = 0;
      for (const bk of (bookingsRef.current || []).filter((x) => x.gcal_event_id && x.status !== 'confirmed')) {
        try {
          await removeBookingFromCalendar(bk.gcal_event_id);
          await supabase.from('bookings').update({ gcal_event_id: null }).eq('id', bk.id);
          removed++;
        } catch { /* leave the id in place and retry on the next sync */ }
      }

      let pushed = 0, pushFailed = 0;
      const toPush = (bookingsRef.current || []).filter(
        (bk) => bk.status === 'confirmed' && bk.source !== 'calendar' && !bk.gcal_event_id
          && new Date(bk.start_at).getTime() > Date.now(),
      );
      for (const bk of toPush) {
        try {
          const eventId = await pushBookingToCalendar(bk, settingsRef.current);
          if (!eventId) { pushFailed++; continue; }
          const { error: upErr } = await supabase.from('bookings').update({ gcal_event_id: eventId }).eq('id', bk.id);
          if (upErr) { pushFailed++; continue; }
          pushed++;
        } catch { pushFailed++; }
      }
      if (pushed && !quiet) toast(`${pushed} booking(s) added to Google Calendar`);
      setCalBusy({ connected: true, blocks: rows.length, pushed, pushFailed, removed, syncedAt: new Date().toISOString(), error: '' });
      if (!quiet) toast(tt('Calendar synced'));
      reload();
    } catch (e) {
      setCalBusy((c) => ({ ...c, connected: true, error: String(e.message || e).slice(0, 120) }));
      if (!quiet) toast(String(e.message || e).slice(0, 90), 'error');
    }
  }, [reload]);

  useEffect(() => { syncCalendarBusy(true); }, [syncCalendarBusy]);

  const traineesById = useMemo(() => Object.fromEntries((trainees || []).map(t => [t.id, t])), [trainees]);

  const saveSettings = async () => {
    if (!draftSettings.slug?.trim()) { toast('Slug is required.', 'warn'); return; }
    const row = { ...draftSettings, slug: draftSettings.slug.trim().toLowerCase(), updated_at: new Date().toISOString() };
    const { error } = settings
      ? await supabase.from('coach_booking_settings').update(row).eq('coach_email', coachEmail)
      : await supabase.from('coach_booking_settings').insert(row);
    if (error) { toast(`Save failed: ${error.message}`, 'error'); return; }
    toast('Booking settings saved.', 'success', { ttl: 3000 });
    reload();
  };

  const addRule = async () => {
    const row = { coach_email: coachEmail, day_of_week: 1, start_time: '09:00', end_time: '17:00' };
    // TWO IDENTICAL RULES OFFER THE SAME HOUR TWICE. His data had exactly that -
    // Monday 09:00-17:00 saved twice, five minutes apart on 7.9 (deduped 18.9).
    // A rule that already exists is not added again.
    const dupe = rules.some((r2) => r2.day_of_week === row.day_of_week
      && String(r2.start_time).slice(0, 5) === row.start_time
      && String(r2.end_time).slice(0, 5) === row.end_time);
    if (dupe) { toast(tt('That rule already exists — edit the one you have.'), 'warn'); return; }
    const { error } = await supabase.from('availability_rules').insert(row);
    if (error) { toast(`Add rule failed: ${error.message}`, 'error'); return; }
    reload();
  };

  // A TIME INPUT FIRES PER COMPONENT. Typing one hour sends an onChange for the
  // hour and another for the minute, and each was a round trip to Postgres -
  // four writes to set one rule. The row updates on screen immediately and the
  // write is debounced; a pending write is flushed if the component unmounts.
  const ruleWriteTimers = useRef({});
  useEffect(() => {
    const timers = ruleWriteTimers.current;
    return () => { for (const t of Object.values(timers)) clearTimeout(t.id); };
  }, []);
  const updateRuleDebounced = (id, patch) => {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    const slot = ruleWriteTimers.current[id] || (ruleWriteTimers.current[id] = { id: null, patch: {} });
    slot.patch = { ...slot.patch, ...patch };
    clearTimeout(slot.id);
    slot.id = setTimeout(() => {
      const body = slot.patch; slot.patch = {};
      supabase.from('availability_rules').update(body).eq('id', id)
        .then(({ error }) => { if (error) toast(`Save failed: ${error.message}`, 'error'); });
    }, 600);
  };

  const updateRule = async (id, patch) => {
    const { error } = await supabase.from('availability_rules').update(patch).eq('id', id);
    if (error) { toast(`Update failed: ${error.message}`, 'error'); return; }
    setRules(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
  };

  const removeRule = async (id) => {
    if (!(await confirmToast('Remove this availability rule?', { okLabel: 'Remove', cancelLabel: 'Cancel' }))) return;
    const { error } = await supabase.from('availability_rules').delete().eq('id', id);
    if (error) { toast(`Remove failed: ${error.message}`, 'error'); return; }
    setRules(prev => prev.filter(r => r.id !== id));
  };

  const cancelBooking = async (id) => {
    if (!(await confirmToast('Cancel this booking?', { okLabel: 'Cancel booking', cancelLabel: 'Keep' }))) return;
    const { error } = await supabase.from('bookings').update({ status: 'canceled', canceled_at: new Date().toISOString() }).eq('id', id);
    if (error) { toast(`Cancel failed: ${error.message}`, 'error'); return; }
    // Take it off his Google Calendar too, or a cancelled session keeps
    // blocking the appointment page. The booking row is already cancelled at
    // this point, so a calendar failure must not undo that - clear the stored
    // id only on success, and the next sync will not recreate the event
    // because the booking is no longer 'confirmed'.
    const bk = (bookingsRef.current || []).find((x) => x.id === id);
    if (bk && bk.gcal_event_id) {
      try {
        await removeBookingFromCalendar(bk.gcal_event_id);
        await supabase.from('bookings').update({ gcal_event_id: null }).eq('id', id);
      } catch (e) {
        toast(`Booking cancelled, but its Google Calendar event could not be removed: ${String(e.message || e).slice(0, 60)}`, 'warn');
      }
    }
    setBookings(prev => prev.map(b => b.id === id ? { ...b, status: 'canceled', gcal_event_id: null } : b));
  };

  const markCompleted = async (id) => {
    const { error } = await supabase.from('bookings').update({ status: 'completed' }).eq('id', id);
    if (error) { toast(`Update failed: ${error.message}`, 'error'); return; }
    setBookings(prev => prev.map(b => b.id === id ? { ...b, status: 'completed' } : b));
  };

  if (loading) return <div style={{ padding: 30, textAlign: 'center', color: C.td }}>{tr(readLang(), 'Loading…')}</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* SETTINGS */}
      <CollapsibleSection title={tt('Booking Settings')} storageKey="cal-settings" style={{ marginBottom: 0 }}>
        {/* NOT SAVED IS NOT LIVE. Measured 18.9: coach_booking_settings had no
            row at all, so the public page answered every visitor with "that
            booking page doesn't exist" while this screen looked filled in - the
            fields show DRAFT defaults until the first save. Say so. */}
        {!settings && !loading && (
          <div style={{ margin: '0 0 10px', padding: '9px 12px', border: `1px solid ${C.or || '#E0A73A'}`, fontFamily: FB, fontSize: 12, color: C.tx }}>
            {tt('Your booking page is not live yet — press SAVE SETTINGS to publish it.')}
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 10 }}>
          <Input label={tt('Slug (public URL)')} value={draftSettings?.slug || ''} onChange={e => setDraftSettings({ ...draftSettings, slug: e.target.value })} placeholder="ohad" />
          <Input label={tt('Display name')} value={draftSettings?.display_name || ''} onChange={e => setDraftSettings({ ...draftSettings, display_name: e.target.value })} placeholder="Ohad — EXPO" />
          <Input label={tt('Duration (min)')} type="number" value={draftSettings?.duration_min || 60} onChange={e => setDraftSettings({ ...draftSettings, duration_min: clampSetting(e.target.value, 60, 5, 8 * 60) })} />
          <Input label={tt('Buffer (min)')} type="number" value={draftSettings?.buffer_min || 0} onChange={e => setDraftSettings({ ...draftSettings, buffer_min: clampSetting(e.target.value, 0, 0, 4 * 60) })} />
          <Input label={tt('Lead time (hrs)')} type="number" value={draftSettings?.lead_time_hours || 4} onChange={e => setDraftSettings({ ...draftSettings, lead_time_hours: clampSetting(e.target.value, 4, 0, 24 * 30) })} />
          {/* THE ENGLISH HALF. display_name / bio / cancellation_policy are one
              column each and the public page is bilingual, so three optional
              *_en columns carry the English. Empty means "use the one above",
              which is why these say OPTIONAL rather than being required —
              nothing changes for a coach who writes one language. Shipping the
              columns without these inputs would have been half a feature. */}
          <Input label={tt('Display name (EN, optional)')} value={draftSettings?.display_name_en || ''} onChange={e => setDraftSettings({ ...draftSettings, display_name_en: e.target.value })} placeholder={draftSettings?.display_name || ''} />
          <Input label={tt('Zoom URL')} style={{ textAlign: 'start' }} value={draftSettings?.zoom_url || ''} onChange={e => setDraftSettings({ ...draftSettings, zoom_url: e.target.value })} placeholder="https://zoom.us/j/…" />
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={{ display: 'block', fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: '0.18em', fontWeight: 700, marginBottom: 4 }}>{tt('CANCELLATION POLICY')}</label>
          <textarea dir="auto" rows={2} value={draftSettings?.cancellation_policy || ''}
            onChange={e => setDraftSettings({ ...draftSettings, cancellation_policy: e.target.value })}
            style={{ width: '100%', background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, padding: '8px 10px', color: C.tx, fontFamily: FB, fontSize: 13, outline: 'none', boxSizing: 'border-box', resize: 'vertical' }} />
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={{ display: 'block', fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: '0.18em', fontWeight: 700, marginBottom: 4 }}>{tt('CANCELLATION POLICY (EN, OPTIONAL)')}</label>
          <textarea dir="auto" rows={2} value={draftSettings?.cancellation_policy_en || ''}
            onChange={e => setDraftSettings({ ...draftSettings, cancellation_policy_en: e.target.value })}
            placeholder={draftSettings?.cancellation_policy || ''}
            style={{ width: '100%', background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, padding: '8px 10px', color: C.tx, fontFamily: FB, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: FN, fontSize: 10, color: C.td, letterSpacing: '0.08em' }}>{tt('PUBLIC URL:')}</span>
          <code style={{ fontSize: 12, color: C.ac, background: 'var(--c-sf)', height: 34, boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', padding: '0 10px', border: `1px solid ${C.cardBd}`, wordBreak: 'break-all', minWidth: 0 }}>
            {bookingPublicUrl(draftSettings?.slug)}
          </code>
          <span style={{ flex: 1 }} />
          <Btn onClick={saveSettings}>{tb('Save settings')}</Btn>
        </div>
      </CollapsibleSection>

      {/* AVAILABILITY */}
      <CollapsibleSection title={tt('Weekly Availability')} count={rules.length} storageKey="cal-availability" style={{ marginBottom: 0 }}
        right={<button onClick={addRule}
          style={{ ...stripBtnBase, border: '1px solid #FFFFFF', color: '#FFFFFF' }}>{tb('+ ADD RULE')}</button>}>
        {/* WHAT THE CALENDAR ALREADY OWNS. The rules say when he CAN be booked;
            his calendar says when he already is. Both have to be true before a
            slot is offered to a stranger. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 14px', borderBottom: `1px solid ${C.cardBd}`, fontFamily: FN, fontSize: 11, color: C.tm }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{tt('From your calendar')}</span>
          <span style={{ color: C.tx }}>
            {calBusy.connected === false
              ? tt('Not connected — slots are offered without checking it')
              : calBusy.error
                ? calBusy.error
                : calBusy.syncedAt
                  ? `${calBusy.blocks} ${calBusy.blocks === 1 ? tt('block') : tt('blocks')} ${tt('in the next 21 days')}`
                  : tt('checking…')}
          </span>
          <span style={{ flex: 1 }} />
          <button onClick={() => syncCalendarBusy(false)}
            style={{ ...stripBtnBase, border: `1px solid ${C.cardBd}`, color: C.tm, height: 26 }}>{tb('SYNC NOW')}</button>
        </div>
        {rules.length === 0 ? (
          <div style={{ padding: 14, textAlign: 'center', color: C.td, fontSize: 13 }}>
            {tt('No availability rules. Add one to allow bookings.')}
          </div>
        ) : rules.map(r => (
          <div key={r.id} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
            borderBottom: `1px solid ${C.cardBd}`, flexWrap: 'wrap',
          }}>
            <select value={r.day_of_week} onChange={e => updateRule(r.id, { day_of_week: parseInt(e.target.value) })}
              style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, padding: '4px 8px', color: C.tx, fontFamily: FN, fontSize: 11, outline: 'none' }}>
              {DAY_LABELS.map((d, i) => <option key={i} value={i}>{tt(d)}</option>)}
            </select>
            <input type="time" value={r.start_time?.slice(0, 5) || '09:00'} onChange={e => updateRuleDebounced(r.id, { start_time: e.target.value })}
              style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, padding: '4px 8px', color: C.tx, fontFamily: FN, fontSize: 11, outline: 'none' }} />
            <span style={{ color: C.tm }}>→</span>
            <input type="time" value={r.end_time?.slice(0, 5) || '17:00'} onChange={e => updateRuleDebounced(r.id, { end_time: e.target.value })}
              style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, padding: '4px 8px', color: C.tx, fontFamily: FN, fontSize: 11, outline: 'none' }} />
            <span style={{ flex: 1 }} />
            <button onClick={() => removeRule(r.id)}
              style={{ height: 23, boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', background: 'none', border: 'none', color: C.td, cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>
          </div>
        ))}
      </CollapsibleSection>

      {/* UPCOMING */}
      <div style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, padding: PAD }}>
        <RefinedHeaderStrip padY={PAD} padX={PAD} marginBottom={12}>
          <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: '0.04em', textTransform: 'uppercase', color: refined ? 'var(--c-stripTx)' : C.tx }}>{tt('UPCOMING')} ({realBookings.length})</span>
        </RefinedHeaderStrip>
        {/* THE EMPTY STATE TESTS THE LIST THAT IS ACTUALLY RENDERED.
            It used to test `bookings.length`, which includes the Google-busy
            mirror rows - up to 21 days of them - while the list below filters
            those out. With busy rows and no real bookings the card rendered
            neither the message nor a single row: a blank box. */}
        {realBookings.length === 0 ? (
          <div style={{ padding: 14, textAlign: 'center', color: C.td, fontSize: 13 }}>
            {tt('No bookings yet. Share the public URL above.')}
          </div>
        ) : realBookings.map((b, i) => {
          // TODAY FIRST, and a date header whenever the day changes. One flat
          // chronological list gave him no way to see what is on today.
          const dayKey = new Date(b.start_at).toDateString();
          const prevKey = i > 0 ? new Date(realBookings[i - 1].start_at).toDateString() : null;
          const showDay = dayKey !== prevKey;
          const dayLabel = dayKey === new Date().toDateString() ? tt('TODAY')
            : dayKey === new Date(Date.now() + 86400000).toDateString() ? tt('TOMORROW')
            : new Date(b.start_at).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase();
          const trainee = b.trainee_id ? traineesById[b.trainee_id] : null;
          const past = new Date(b.start_at).getTime() < Date.now();
          const sevColor = b.status === 'canceled' ? C.rd : b.status === 'completed' ? C.gn : (past ? C.or : C.ac);
          return (
            <React.Fragment key={b.id}>
            {showDay && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '10px 0 6px', fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.tm }}>
                <span>{dayLabel}</span>
                <span style={{ flex: 1, height: 1, background: C.cardBd }} />
              </div>
            )}
            <div style={{
              border: `1px solid ${sevColor}`,
              padding: '10px 12px', marginBottom: 8, background: 'var(--c-sf)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, fontFamily: FN, fontSize: 9, color: sevColor, fontWeight: 700, letterSpacing: '0.12em', border: `1px solid ${sevColor}`, padding: '3px 8px', width: 96, boxSizing: 'border-box', flexShrink: 0 }}>
                  {/* The one English word left on this screen in Hebrew:
                      the raw DB status, upper-cased. tr() on the uppercase
                      form so the four CHECK-constrained values each have a
                      Hebrew label and anything new falls through unchanged. */}
                  {tr(readLang(), (b.status||'').toUpperCase())}
                </span>
                <span style={{ fontWeight: 700, fontSize: 14, color: C.tx }}>{trainee?.name || b.contact_name}</span>
                <span style={{ flex: 1 }} />
                <span style={{ fontFamily: FN, fontSize: 11, color: C.tx }}>{fmtSlot(b.start_at, b.duration_min)}</span>
              </div>
              {(b.contact_email || b.contact_phone) && (
                <div style={{ fontSize: 11, color: C.tm, marginBottom: 4 }}>
                  {b.contact_email}{b.contact_email && b.contact_phone ? ' · ' : ''}{b.contact_phone}
                </div>
              )}
              {b.notes && <div style={{ fontSize: 12, color: C.tx, marginBottom: 6, whiteSpace: 'pre-wrap' }}>{b.notes}</div>}
              {b.status === 'confirmed' && (
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <button onClick={() => markCompleted(b.id)}
                    style={{ background: 'transparent', border: `1px solid ${C.gn}`, color: C.gn, padding: '4px 10px', fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', cursor: 'pointer' }}>✓ {tr(readLang(), 'COMPLETED')}</button>
                  <button onClick={() => cancelBooking(b.id)}
                    style={{ background: 'transparent', border: `1px solid ${C.rd}`, color: C.rd, padding: '4px 10px', fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', cursor: 'pointer' }}>× {tr(readLang(), 'CANCEL')}</button>
                </div>
              )}
            </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
