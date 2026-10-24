// THE GUIDED TOUR of a club demo (team version #904, A6): seven stops a club director can follow alone. Each stop opens
// the zone page it talks about. A stop has its URL (?tour=<n>), so a reload or a shared link lands on the same stop;
// Close drops the query. Rendered INSIDE the zone (BhbcView's demo.tour), so it wears the club's tokens and language.
import React, { useEffect, useState } from 'react';
import { FN, FB } from '../theme';
import DemoSwitch from '../DemoSwitch';

const STOPS = [
  { page: 'overview', en: ['The morning brief', 'Open the zone at 08:00 and the day is already read: who is available, who needs a change today, what is next on the schedule. The brief is built from the check-ins, the medical files and the calendar - nobody types it.'],
    he: ['תדריך הבוקר', 'פותחים את המערכת ב-08:00 והיום כבר מסודר: מי זמין, מי צריך התאמה באימון היום ומה הבא בלוח. התדריך נבנה מהצ׳ק-אין, מהתיקים הרפואיים ומהלוח - אף אחד לא מקליד אותו.'] },
  { page: 'overview', en: ['Readiness, every morning', 'The squad check-in takes a minute: sleep, energy and pain for each player. Pain 4+ or a bad night turns into a concrete nudge for today\'s session, and the brief names the player.'],
    he: ['מוכנות, כל בוקר', 'הצ׳ק-אין של הסגל לוקח דקה: שינה, אנרגיה וכאב לכל שחקן. כאב 4 ומעלה או לילה רע הופכים להמלצה מעשית לאימון של היום, והתדריך מציין את השחקן בשם.'] },
  { page: 'roster', en: ['The squad', 'One card per player: availability today, attendance over 28 days, minutes, body weight and league stats. Tap a player for his full file.'],
    he: ['הסגל', 'כרטיס לכל שחקן: זמינות היום, נוכחות ב-28 הימים האחרונים, דקות, משקל וסטטיסטיקה מהליגה. לחיצה על שחקן פותחת את התיק המלא שלו.'] },
  { page: 'medical', en: ['Medical and return to play', 'The physio owns the file: status, pain, progress notes and the return-to-play target. Coaches see the status they need; a player coming back is flagged before his load jumps.'],
    he: ['רפואה וחזרה למשחק', 'הפיזיותרפיסט מנהל את התיק: סטטוס, כאב, מעקב והיעד לחזרה. המאמנים רואים את הסטטוס שהם צריכים, ושחקן שחוזר מסומן לפני שהעומס שלו קופץ.'] },
  { page: 'schedule', en: ['The week', 'Practices, lifts, shootarounds, games and travel in one calendar, synced from the club\'s Google Calendar. Month, week and list views.'],
    he: ['השבוע', 'אימונים, חדר כושר, שוטאראונד, משחקים ונסיעות בלוח אחד, מסונכרן מיומן Google של המועדון. תצוגת חודש, שבוע ורשימה.'] },
  { page: 'practices', en: ['Every session, logged', 'Attendance per slot, the S&C block before practice, personal lifts - minutes and notes, one tap per player. History stays per player and per team.'],
    he: ['כל אימון מתועד', 'נוכחות לכל אימון, בלוק הכוח לפני האימון, חדר כושר אישי - דקות והערות, לחיצה אחת לשחקן. ההיסטוריה נשמרת לכל שחקן ולקבוצה.'] },
  { page: 'games', en: ['Games and the league', 'Results, standings and box scores are imported from the league automatically. Minutes played feed each player\'s file; the head coach gets his report ready to send on WhatsApp.'],
    he: ['משחקים והליגה', 'תוצאות, טבלה וסטטיסטיקות מגיעות אוטומטית מהליגה. דקות המשחק נכנסות לתיק של כל שחקן, והמאמן הראשי מקבל דוח מוכן לשליחה בוואטסאפ.'] },
];

const stopFromUrl = () => { try { const n = Number(new URLSearchParams(window.location.search).get('tour')); return Number.isInteger(n) && n >= 1 && n <= STOPS.length ? n : null; } catch { return null; } };
// ONE history entry per stop: the stop's page AND ?tour=<n> in a single push, then the zone is told (popstate), so its
// own page effect finds the URL already right and pushes nothing. Back walks the stops; the page always matches.
const writeStop = (base, n, replace) => {
  const u = new URL(window.location.href);
  if (n) { u.pathname = `${base}/${STOPS[n - 1].page}`; u.searchParams.set('tour', String(n)); } else u.searchParams.delete('tour');
  const href = u.pathname + (u.search || '') + u.hash;
  if (href === window.location.pathname + window.location.search + window.location.hash) return;
  if (replace) window.history.replaceState(null, '', href); else window.history.pushState(null, '', href);
  if (n) window.dispatchEvent(new PopStateEvent('popstate'));
};

// the tour's own ?tour=<n> on the CURRENT entry, path untouched (the page-follow; Back is the zone's)
const writeQuery = (n) => {
  const u = new URL(window.location.href);
  if (n) u.searchParams.set('tour', String(n)); else u.searchParams.delete('tour');
  const href = u.pathname + (u.search || '') + u.hash;
  if (href !== window.location.pathname + window.location.search + window.location.hash) window.history.replaceState(window.history.state, '', href);
};

export default function ClubTour({ he, base, accent, onAccent, page }) {
  // a first visit opens on stop 1; a link with ?tour=<n> opens that stop; closed stays closed for the visit
  // a first visit to the demo's FRONT page opens stop 1; a deep link (a page, a pop-up) is never hijacked by the tour
  const [stop, setStop] = useState(() => {
    const n = stopFromUrl(); if (n) return n;
    let closed = false; try { closed = !!sessionStorage.getItem('club-tour-closed'); } catch { /* storage blocked */ }
    const p = window.location.pathname.replace(/\/+$/, '');
    return !closed && (p === base || p === base + '/overview') ? 1 : null;
  });
  useEffect(() => { const onPop = () => setStop(stopFromUrl()); window.addEventListener('popstate', onPop); return () => window.removeEventListener('popstate', onPop); }, []);
  // a first visit (no ?tour in the link) writes stop 1 into the URL - a tick later, so the zone, which mounts AFTER its
  // child the tour, is listening (it lands on the zone's front page, which is stop 1's)
  // Decided from the URL AT FIRST RENDER (what the visitor opened), not at the effect: the zone may have rewritten the
  // URL in between, and a deep link read as a first visit was sent to the front page (#965, measured).
  const [firstVisit] = useState(() => !stopFromUrl() && [base, base + '/overview'].includes(window.location.pathname.replace(/\/+$/, '')));
  useEffect(() => { if (!stop || !firstVisit) return undefined; const t = setTimeout(() => writeQuery(stop), 0); return () => clearTimeout(t); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  // THE PAGE WINS (#965, Ohad 23.10 on /schedule?tour=1: "look at the top menu and what its showing"): the card always
  // talks about the page on screen. A tab pressed with the tour open, or a link whose stop is not its page's, moves the
  // card to that page's first stop - or hides it where no stop talks about the page (the banner's 'Guided tour' brings
  // it back). Moving the card never moves the page: the zone owns its page and its URL, the tour only its ?tour.
  useEffect(() => {
    if (!stop || !page || STOPS[stop - 1].page === page) return;
    const i = STOPS.findIndex((x) => x.page === page);
    if (i >= 0) { writeQuery(i + 1); setStop(i + 1); } else { writeQuery(null); setStop(null); }
  }, [page, stop]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!stop) return undefined;
    const prev = document.body.style.paddingBottom; document.body.style.paddingBottom = '260px';
    return () => { document.body.style.paddingBottom = prev; };
  }, [stop]);
  const open = () => { try { sessionStorage.removeItem('club-tour-closed'); } catch { /* */ } writeStop(base, 1, false); setStop(1); };
  const move = (n) => { writeStop(base, n, false); setStop(n); };
  const close = () => { try { sessionStorage.setItem('club-tour-closed', '1'); } catch { /* */ } writeStop(base, null, false); setStop(null); };
  // THE BANNER: one row at every width - what this is, and the tour
  const banner = (
    <>
    <DemoSwitch current="teams" he={he} />
    <div data-demo-banner style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 36, padding: '0 12px', background: accent, color: onAccent, fontFamily: FN, fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}
      title={he ? 'הדגמה: כל השחקנים והנתונים נוצרו להדגמה. אפשר ללחוץ על הכל - שום דבר לא נשמר.' : 'Demo: every player and number is generated. Press anything - nothing is saved.'}>
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{he ? 'הדגמה · שום דבר לא נשמר' : 'Demo · nothing is saved'}</span>
      {!stop && <button type="button" data-tour-open onClick={open} style={{ flexShrink: 0, height: 26, padding: '0 10px', border: `1px solid ${onAccent}`, background: 'transparent', color: onAccent, fontFamily: FN, fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}>{he ? 'סיור מודרך' : 'Guided tour'}</button>}
    </div>
    </>
  );
  if (!stop) return banner;
  const s = STOPS[stop - 1]; const [title, body] = he ? s.he : s.en;
  const btn = { height: 36, minWidth: 0, padding: '0 14px', border: '1px solid var(--c-cardBd)', background: 'var(--c-sf)', color: 'var(--c-tx)', fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' };
  return (
    <>
      {banner}
      <div data-tour role="dialog" aria-label={title} style={{ position: 'fixed', insetInline: 'max(16px, calc(50% - 300px))', bottom: 16, zIndex: 40, background: 'var(--c-sf)', border: '1px solid var(--c-cardBd)', borderTop: `3px solid ${accent}`, boxShadow: '0 10px 30px rgba(0,0,0,0.28)', padding: '14px 16px 12px', boxSizing: 'border-box', textTransform: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
          <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', color: 'var(--c-td)', whiteSpace: 'nowrap' }} dir="ltr">{stop} / {STOPS.length}</span>
          <span style={{ fontFamily: FN, fontSize: 13, fontWeight: 800, color: 'var(--c-tx)', minWidth: 0 }}>{title}</span>
        </div>
        <div style={{ fontFamily: FB, fontSize: 13, lineHeight: 1.5, color: 'var(--c-tm)', marginBottom: 12 }}>{body}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <button type="button" style={btn} onClick={close}>{he ? 'סגור' : 'Close'}</button>
          <button type="button" style={{ ...btn, opacity: stop > 1 ? 1 : 0.4, cursor: stop > 1 ? 'pointer' : 'default' }} disabled={stop === 1} onClick={() => move(stop - 1)}>{he ? 'הקודם' : 'Back'}</button>
          <button type="button" style={{ ...btn, background: accent, borderColor: accent, color: onAccent }} onClick={() => (stop < STOPS.length ? move(stop + 1) : close())}>{stop < STOPS.length ? (he ? 'הבא' : 'Next') : (he ? 'סיום' : 'Done')}</button>
        </div>
      </div>
    </>
  );
}
