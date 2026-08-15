import React, { useState, useCallback, useRef, useEffect, useMemo, Suspense, lazy } from 'react';
import { C, FN, FB, uid } from './theme';
import { ThemeToggle } from './ThemeToggle';
import { useLogoSrc } from './hooks/useTheme';
import { EXPOMark } from './expoMark';
import { useStore } from './useStore';
import { useSupaStore, useSupaClientWorkouts, useSupaBwLog, useSupaWeeklyFocus } from './useSupaStore';
import useBitPayments from './useBitPayments';
import { usePlanIndex, savePlan } from './usePlansStore';
import { supabase } from './supabase';
import { Btn, baseBtn, ToastHost, toast } from './ui';
import BugReportButton from './BugReportButton';
import SensorLab from './SensorLab';
import { parseTraineeId } from './traineeUtils';
import { AuthProvider, useAuth, LoginScreen, UnauthorizedScreen, PasswordChangeModal, SaveErrorToast, OfflineStatusPill, RolePickerScreen, PORTAL_CHOICE_KEY, TRAINER_EMAILS, OWNER_EMAILS, isPartnerEmail } from './auth';
import InstallAppPrompt from './InstallAppPrompt';
import ErrorBoundary from './ErrorBoundary';
import { autoAnalyzeAthleteVideos } from './autoAnalyzeVideos';
// Lazy-load every heavy view so the initial bundle stays small.
// Each tab fetches its own chunk on first navigation; subsequent visits use cache.
//
// Stale-chunk recovery: after a Vercel deploy, the user's open tab still
// holds an `index-<oldhash>.js` that references chunk hashes that no longer
// exist server-side (the deploy GC'd them). The first dynamic import after
// the deploy then 404s with "Failed to fetch dynamically imported module".
// `lazyReload` wraps every lazy() call and force-reloads the page once on
// that error — the post-reload page picks up the fresh entry HTML and the
// new chunk manifest. sessionStorage flag prevents infinite reload loops if
// the failure is a real network outage. The flag self-clears 8s after a
// successful mount (see effect in AuthedApp below) so a *second* chunk
// failure later in the session can still trigger one more reload.
const RELOAD_FLAG = 'expo-chunk-reload-once';
const CHUNK_ERR_RX = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;
function lazyReload(importFn) {
  return lazy(() => importFn().catch(err => {
    if (err && err.message && CHUNK_ERR_RX.test(err.message)) {
      try {
        if (!sessionStorage.getItem(RELOAD_FLAG)) {
          sessionStorage.setItem(RELOAD_FLAG, '1');
          window.location.reload();
          // Park the promise so React.lazy doesn't surface the error
          // before the reload completes.
          return new Promise(() => {});
        }
      } catch {}
    }
    throw err;
  }));
}
const TraineesView = lazyReload(() => import('./TraineesView'));
const TraineeDetail = lazyReload(() => import('./TraineeDetail'));
const ExercisesView = lazyReload(() => import('./ExercisesView'));
const PlansView = lazyReload(() => import('./PlansView'));
const WorkoutsView = lazyReload(() => import('./WorkoutsView'));
const ClientPortal = lazyReload(() => import('./ClientPortal'));
const DashboardView = lazyReload(() => import('./DashboardView'));
const WaitlistView = lazyReload(() => import('./WaitlistView'));
const ChatAuditView = lazyReload(() => import('./ChatAuditView'));
const SmartImportView = lazyReload(() => import('./SmartImportView'));
const WorkoutReview = lazyReload(() => import('./WorkoutReview'));
const CoachTasksView = lazyReload(() => import('./CoachTasksView'));
const BugsView = lazyReload(() => import('./BugsView'));
const ChallengesView = lazyReload(() => import('./ChallengesView'));
const BookingView = lazyReload(() => import('./BookingView'));
const BillingView = lazyReload(() => import('./BillingView'));
const SessionsView = lazyReload(() => import('./SessionsView'));
const ReviewToolsView = lazyReload(() => import('./ReviewToolsView'));
const BhbcView = lazyReload(() => import('./BhbcView'));
// Public unauthenticated try-it sandbox at /try. Lazy-loaded the same way
// so the heavy MediaPipe-pulling code chunk doesn't bloat the auth path.
const TrySandbox = lazyReload(() => import('./TrySandbox'));
const DemoTraineePortal = lazyReload(() => import('./DemoTraineePortal'));
// Public coach-sales marketing landing at /demo for unauthed visitors.
const CoachLanding = lazyReload(() => import('./CoachLanding'));
// Front-door chooser at / for unauthed visitors — splits Sign In vs the
// coach-sales landing so existing users aren't dumped into a marketing pitch.
const EntryChooser = lazyReload(() => import('./EntryChooser'));
// /demo/coach is the full COACH-side interactive demo (Dashboard, Trainees,
// Programs, Exercises, Review tabs with mock data). /try is the public
// engine sandbox (TrySandbox above). /demo/trainee is the client-portal demo.
const CoachDemo = lazyReload(() => import('./CoachDemo'));
const CoachPreviewPortal = lazyReload(() => import('./CoachPreviewPortal'));
// /intake/<locale>?t=<token> is the public-facing intake form (HE/EN initial
// + HE progress check-in). /coach/intake (inside AuthedApp) is the coach
// inbox + token generator. Both lazy so the form-renderer code only ships
// when actually needed.
const IntakeForm = lazyReload(() => import('./IntakeForm'));
const IntakeView = lazyReload(() => import('./IntakeView'));
// Public booking surface — no auth required. Lazy because it pulls
// availability+occupancy logic that only matters on /book/<slug>.
const BookingPublic = lazyReload(() => import('./BookingPublic'));
// F-18 — public program share. /p/<token> is anon-readable via the
// get_shared_program(token) SECURITY DEFINER function — no PII leaves
// the server (trainee name is scrubbed).
const ProgramShare = lazyReload(() => import('./ProgramShare'));
// F-27 — public contract signing page. /sign/<token> renders the
// brand-rich agreement + signature pad; anon UPDATE writes signature.
const ContractSign = lazyReload(() => import('./ContractSign'));

// Memo wrappers prevent re-renders when parent state changes but these props haven't
const MemoPlans = React.memo(PlansView);
const MemoExercises = React.memo(ExercisesView);
const MemoWorkouts = React.memo(WorkoutsView);
const MemoReview = React.memo(WorkoutReview);

const ViewFallback = () => (
  <div style={{textAlign:'center',padding:40,color:C.td,fontFamily:FB,fontSize:13}}>Loading…</div>
);

const KEYS = { trainees:"expo-trainees", exercises:"expo-exercises", workouts:"expo-workouts", cw:"expo-cw", bw:"expo-bw" };

// Root. Wraps in Supabase auth context; AuthGate shows LoginScreen until
// there's a live session, then hands off to AuthedApp (the old App body).
// SwUpdateBanner uses the virtual:pwa-register/react hook — kept lazy so
// the banner module + workbox shim don't pull into chunks that don't need it.
const SwUpdateBanner = lazyReload(() => import('./SwUpdateBanner'));

// MoreMenu — collapses 5 secondary header actions into one ⋯ icon
// (Smart Import / Export / Chat Audit / Bugs / Change Password). The
// 5 individual icons were creating right-side overflow on common
// 1280-wide laptops and crowding the cyan strip visually. Active state
// reflects when the current tab is one of the menu items.
// SubmenuTab — generic dropdown tab. Used twice in the coach nav:
//   • Athletes ▾  → Roster / Programs / Exercises
//   • Incoming ▾  → Intake / Waitlist
//
// Two of the original 11 top-level tabs were pulled into each dropdown
// (Programs+Exercises into Athletes; Intake+Waitlist into Incoming) so
// the top row fits cleanly at 1366px viewport. The dropdown trigger
// looks active whenever the current `tab` matches any of the inner
// items' routes — so the user always knows which section they're in.
//
// data-submenu-id is set per instance so the document-level "click
// outside to close" only closes the menu the click missed; clicking
// from one open submenu directly onto another tab's trigger still
// works as expected.
function SubmenuTab({ id, label, count, items, tab, navTo, activeStyle, isChosen, countColor }) {
  const [open, setOpen] = useState(false);
  const btnRef = React.useRef(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  // Hover-open with a short close delay so crossing the gap between the
  // trigger and the menu doesn't snap it shut. The entrance itself uses the
  // global .motion-rise (fade + 6px rise, reduced-motion safe) so it eases
  // open instead of jumping. Click still toggles for touch.
  const closeTimer = React.useRef(null);
  const hoverOpen = () => { if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; } setOpen(true); };
  const hoverClose = () => { if (closeTimer.current) clearTimeout(closeTimer.current); closeTimer.current = setTimeout(() => setOpen(false), 160); };
  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);
  useEffect(() => {
    if (!open || !btnRef.current) return;
    const recalc = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      setCoords({ top: r.bottom + 4, left: r.left });
    };
    recalc();
    window.addEventListener('resize', recalc);
    window.addEventListener('scroll', recalc, true);
    return () => { window.removeEventListener('resize', recalc); window.removeEventListener('scroll', recalc, true); };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const selector = `[data-submenu-id="${id}"]`;
    const onDoc = (e) => { if (!e.target.closest?.(selector)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open, id]);

  // The trigger reads as "active" when the current tab is one of the
  // submenu items' routes. Active styling mirrors the inline
  // activeStyle prop the parent computes for every tab, so the
  // submenu trigger and a plain tab look identical when selected.
  const isSectionActive = items.some(it => tab === it.route);

  return (
    <div data-submenu-id={id} onMouseEnter={hoverOpen} onMouseLeave={hoverClose} style={{ display: 'inline-flex', position: 'relative' }}>
      <button ref={btnRef} onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className={!isSectionActive ? 'nav-item-inactive' : undefined}
        // alignItems:center (was baseline) so the label, count, and
        // chevron share one optical center-line. baseline-mode let
        // the chevron drift below the cap-height of the label.
        // gap:6 inherits from baseBtn, no per-child margins needed.
        style={{ ...baseBtn, alignItems: 'center', borderRadius: 0, padding: '6px 10px', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap', ...activeStyle }}>
        <span>{label}</span>
        {count != null && <span style={{ fontSize: 10, color: countColor, fontFamily: FN }}>{count}</span>}
        <span style={{ fontSize: 10, lineHeight: 1, display: 'inline-block', transition: 'transform .2s cubic-bezier(.22,.61,.36,1)', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>▾</span>
      </button>
      {open && (
        <div className="motion-rise" onMouseEnter={hoverOpen} onMouseLeave={hoverClose} style={{
          position: 'fixed', top: coords.top, left: coords.left,
          background: 'var(--c-bg)', border: `1px solid ${C.cardBd}`,
          minWidth: 180, zIndex: 100000, transformOrigin: 'top center',
          boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
        }}>
          {items.map(it => {
            const isItemActive = tab === it.route;
            return (
              <button key={it.route} className={!isItemActive ? 'nav-item-inactive' : undefined} onClick={() => { setOpen(false); navTo(it.route); }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14,
                  width: '100%', padding: '10px 14px',
                  background: isItemActive ? C.acD : 'transparent',
                  color: isItemActive ? C.ac : C.tx,
                  border: 'none', borderBottom: `1px solid ${C.cardBd}`,
                  fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em',
                  textTransform: 'uppercase', textAlign: 'left', cursor: 'pointer',
                }}>
                <span>{it.label}</span>
                {it.count != null && <span style={{ fontSize: 10, color: isItemActive ? C.ac : C.td, fontFamily: FN }}>{it.count}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MoreMenu({ tab, navTo, onExport, onChangePassword, isOwner = true }) {
  const [open, setOpen] = useState(false);
  // Push-notification state for the in-menu toggle (placed above Change
  // Password per Ohad 2026-05-23). Lazy-imports ./push to avoid bloating
  // the App.jsx critical bundle; only fetches the current subscription
  // when the menu opens so a fresh load doesn't fire a ServiceWorker
  // round-trip on every page render.
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushSupported, setPushSupported] = useState(true);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const m = await import('./push');
        if (cancelled) return;
        if (!m.isPushSupported()) { setPushSupported(false); return; }
        const sub = await m.getCurrentSubscription();
        const perm = await m.getPushPermission();
        if (cancelled) return;
        setPushOn(!!sub && perm === 'granted');
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [open]);
  const togglePush = async () => {
    setPushBusy(true);
    try {
      const m = await import('./push');
      if (pushOn) { await m.disablePush(); setPushOn(false); }
      else { await m.enablePush('coach'); setPushOn(true); }
    } catch (e) {
      // Surface a minimal alert — full error UI lives in PushToggle.jsx
      // (mounted elsewhere); the menu just confirms it didn't work.
      try { toast(e?.message || 'Could not toggle notifications.', 'error'); } catch {}
    } finally {
      setPushBusy(false);
    }
  };
  // Position the popover as a top-layer floating element (position:fixed
  // + computed coords) so the sticky <header>'s stacking context can't
  // clip it. Without this, the dropdown rendered below the nav bar
  // visually but underneath any sibling card with its own stacking ctx.
  const btnRef = React.useRef(null);
  const [coords, setCoords] = useState({ top: 0, right: 0 });
  useEffect(() => {
    if (!open || !btnRef.current) return;
    const recalc = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      setCoords({ top: r.bottom + 4, right: window.innerWidth - r.right });
    };
    recalc();
    window.addEventListener('resize', recalc);
    window.addEventListener('scroll', recalc, true);
    return () => { window.removeEventListener('resize', recalc); window.removeEventListener('scroll', recalc, true); };
  }, [open]);
  // Close on outside-click + Escape. Re-attach handlers each open so
  // closing-then-reopening doesn't leak listeners on the document.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (!e.target.closest?.('[data-more-menu]')) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const isActiveTab = tab === 'smartImport' || tab === 'chatAudit' || tab === 'bugs';
  const allItems = [
    { key: 'smartImport', label: 'Smart Import', onClick: () => navTo('smartImport'), icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
    ) },
    { key: 'export', label: 'Export', onClick: onExport, icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
    ) },
    { key: 'chatAudit', label: 'Chat Audit', onClick: () => navTo('chatAudit'), icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
    ) },
    { key: 'bugs', label: 'Bugs', onClick: () => navTo('bugs'), icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2.5a4 4 0 0 0-4 4v1h8v-1a4 4 0 0 0-4-4Z"/><path d="M5 12a7 7 0 0 1 14 0v3a7 7 0 0 1-14 0Z"/></svg>
    ) },
    { key: 'sensorLab', label: 'Sensor Lab (beta)', onClick: () => { setOpen(false); window.dispatchEvent(new CustomEvent('expo-open-lab')); }, icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3h6M10 3v6l-4 8a2 2 0 0 0 2 3h8a2 2 0 0 0 2-3l-4-8V3"/></svg>
    ) },
    { key: 'password', label: 'Change Password', onClick: onChangePassword, icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
    ) },
  ];
  // Owner tools (Smart Import / Export / Chat Audit / Bugs) are hidden from
  // staff — they keep only Change Password (+ the Push toggle below). The
  // render relies on Change Password being the last entry, which holds.
  const items = isOwner ? allItems : allItems.filter(it => it.key === 'password');

  return (
    <div data-more-menu style={{ display: 'inline-flex' }}>
      <button ref={btnRef} onClick={() => setOpen(o => !o)}
        className="hdr-icon-btn"
        title="More"
        aria-label="More options"
        aria-expanded={open}
        style={{
          background: isActiveTab ? C.acD : 'transparent',
          color: isActiveTab ? C.ac : C.tm,
          border: 'none', padding: '6px 8px', fontSize: 14,
          borderRadius: 0, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center',
        }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="5" r="1.5"/>
          <circle cx="12" cy="12" r="1.5"/>
          <circle cx="12" cy="19" r="1.5"/>
        </svg>
      </button>
      {open && (
        <div style={{
          // position:fixed lifts the popover out of the header's
          // stacking context so it floats above all page content. The
          // coords mirror the button's bottom-right corner.
          position: 'fixed', top: coords.top, right: coords.right,
          background: 'var(--c-bg)',
          border: `1px solid ${C.cardBd}`,
          minWidth: 220, zIndex: 100000,
          boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
        }}>
          {items.slice(0, -1).map(it => {
            const isItemActive = tab === it.key;
            return (
              <button key={it.key} className={!isItemActive ? 'nav-item-inactive' : undefined} onClick={() => { setOpen(false); it.onClick(); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  width: '100%', padding: '10px 14px',
                  background: isItemActive ? C.acD : 'transparent',
                  color: isItemActive ? C.ac : C.tx,
                  border: 'none', borderBottom: `1px solid ${C.cardBd}`,
                  fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em',
                  textTransform: 'uppercase', textAlign: 'left', cursor: 'pointer',
                }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', color: isItemActive ? C.ac : C.tm, flexShrink: 0 }}>{it.icon}</span>
                <span>{it.label}</span>
              </button>
            );
          })}
          {/* Push Notifications row — only the toggle switch on the right
              is clickable; the label area is inert. Ohad spec 2026-05-23. */}
          {pushSupported && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px', borderBottom: `1px solid ${C.cardBd}`,
              color: C.tx, fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
            }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', color: C.tm, flexShrink: 0 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
              </span>
              <span style={{ flex: 1 }}>Push Notifications</span>
              {/* Toggle switch — the ONLY clickable region. */}
              <button onClick={e => { e.stopPropagation(); togglePush(); }}
                disabled={pushBusy}
                aria-label={pushOn ? 'Turn off push notifications' : 'Turn on push notifications'}
                title={pushOn ? 'Click to disable push notifications' : 'Click to enable push notifications'}
                style={{
                  flexShrink: 0, width: 36, height: 20, borderRadius: 10,
                  background: pushOn ? '#39BDFF' : 'var(--c-sf3)',
                  border: `1px solid ${pushOn ? '#39BDFF' : C.cardBd}`,
                  position: 'relative', padding: 0,
                  cursor: pushBusy ? 'wait' : 'pointer',
                  opacity: pushBusy ? 0.6 : 1,
                  transition: 'background 0.15s, border-color 0.15s',
                }}>
                <span style={{
                  position: 'absolute',
                  top: 1, left: pushOn ? 17 : 1,
                  width: 16, height: 16, borderRadius: '50%',
                  background: '#FFFFFF',
                  transition: 'left 0.15s',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
                }} />
              </button>
            </div>
          )}
          {/* Change Password — always rendered last */}
          {items.slice(-1).map(it => {
            const isItemActive = tab === it.key;
            return (
              <button key={it.key} className={!isItemActive ? 'nav-item-inactive' : undefined} onClick={() => { setOpen(false); it.onClick(); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  width: '100%', padding: '10px 14px',
                  background: isItemActive ? C.acD : 'transparent',
                  color: isItemActive ? C.ac : C.tx,
                  border: 'none', borderBottom: `1px solid ${C.cardBd}`,
                  fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em',
                  textTransform: 'uppercase', textAlign: 'left', cursor: 'pointer',
                }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', color: isItemActive ? C.ac : C.tm, flexShrink: 0 }}>{it.icon}</span>
                <span>{it.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider clientList={[]}>
      <AuthGate />
      {!/^(localhost|127\.0\.0\.1)$/.test(typeof window !== 'undefined' ? window.location.hostname : '') && <Suspense fallback={null}><SwUpdateBanner /></Suspense>}
    </AuthProvider>
  );
}

function BootSplash() {
  const logo = useLogoSrc();
  return (
    <div style={{background:C.bg,color:C.tx,minHeight:"100vh",fontFamily:FB,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16}}>
      <img src={logo.nav} alt="EXPO" style={{height:50}} />
      <div style={{color:C.td,fontSize:13}}>Loading…</div>
    </div>
  );
}

// True only when the page was launched from an installed PWA (Add-to-Home
// on Android / iOS). We use this to hide every marketing surface when the
// user is inside the installed app — they should only see Sign in → Portal.
// Browser visitors still get the full marketing site at the same URLs.
function isStandalonePwa() {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
  if (window.navigator.standalone === true) return true; // iOS Safari
  return false;
}

function AuthGate() {
  const auth = useAuth();
  const path = typeof window !== 'undefined' ? window.location.pathname : '/';
  const inPwa = isStandalonePwa();

  // PWA-mode: marketing surfaces are off-limits. Anyone who lands on /demo*
  // or /coaches* (legacy) or the EntryChooser inside the installed app gets
  // bounced into the product flow (LoginScreen for unauthed → portal/dashboard
  // for authed). The marketing site stays live in regular browser tabs.
  // Old /try paths also count as marketing (legacy redirect targets).
  const isMarketingPath = path === '/' || path === ''
    || path.startsWith('/demo')
    || path.startsWith('/he/demo')
    || path.startsWith('/demo/he')
    || path.startsWith('/coaches')
    || path === '/try';
  useEffect(() => {
    if (!inPwa) return;
    if (!isMarketingPath) return;
    if (window.location.pathname !== '/login' && window.location.pathname !== '/portal') {
      window.history.replaceState(null, '', '/');
    }
  }, [inPwa, isMarketingPath]);

  // Backward-compat: legacy /coaches, /coaches/try, /coaches/demo,
  // /coaches/demo/* URLs redirect to /demo* canonical homes. External links
  // from social posts / chat shares keep working without 404s.
  // /try is NO LONGER redirected — it now serves the public TrySandbox.
  useEffect(() => {
    if (inPwa) return;
    if (path === '/coaches' || path === '/coaches/') {
      window.history.replaceState(null, '', '/demo' + (window.location.hash || ''));
      return;
    }
    if (path === '/coaches/try' || path === '/coaches/demo/coach') {
      window.history.replaceState(null, '', '/demo/coach');
      return;
    }
    if (path === '/coaches/demo' || path === '/coaches/demo/trainee') {
      window.history.replaceState(null, '', '/demo/athlete');
      return;
    }
    // /demo/trainee → /demo/athlete canonical rename. Keeps existing
    // shared links / chat-bot CTAs working without 404s.
    if (path === '/demo/trainee') {
      window.history.replaceState(null, '', '/demo/athlete');
      return;
    }
  }, [inPwa, path]);

  // Signed-out /coach or /athlete entry bounces to /login. Both surfaces
  // require auth. Match exact paths — NOT /coaches (marketing landing).
  // This effect must run unconditionally, BEFORE any early returns below,
  // or React will see a different number of hooks across renders and crash
  // on browser back/forward between /try ↔ /coach.
  useEffect(() => {
    if (!auth || auth.loading || auth.session) return;
    if (path === '/coach' || path.startsWith('/coach/')
        || path === '/athlete' || path.startsWith('/athlete/')) {
      window.history.replaceState(null, '', '/login');
    }
  }, [auth, path]);

  // Browser-mode public routes:
  //   /demo          → CoachLanding (marketing pitch + waitlist)
  //   /demo/coach    → CoachDemo (full coach-side tour)
  //   /demo/trainee  → DemoTraineePortal (real ClientPortal in demoMode w/ fixture data)
  //   /demo/sandbox  → TrySandbox pov="trainee" (legacy alias)
  //   /try           → TrySandbox (public engine sandbox — visitor uploads
  //                    their own clip; pose detect + rep count + compare)
  // All hidden in PWA mode.
  // Public intake form route — works in PWA mode AND browser mode because
  // a trainee getting a check-in link should be able to fill it from inside
  // the installed app or any browser. Stays before the auth gate.
  if (path.startsWith('/intake/he') || path.startsWith('/intake/en')) {
    return <Suspense fallback={<BootSplash />}><IntakeForm /></Suspense>;
  }
  // Public booking — /book/<slug>. Resolves coach + availability via the
  // coach_booking_settings RLS public-read policy. Anon writes a booking
  // via the bookings_public_insert WITH CHECK policy.
  if (path.startsWith('/book/')) {
    return <><Suspense fallback={<BootSplash />}><BookingPublic /></Suspense><ToastHost /></>;
  }
  // F-18 — public program share. /p/<token> renders a read-only program
  // preview for a coach-shared link. No auth required; the server
  // function decides what the anon visitor sees.
  if (path.startsWith('/p/')) {
    return <Suspense fallback={<BootSplash />}><ProgramShare /></Suspense>;
  }
  // F-27 — public contract signing page. Brand-rich layout + signature
  // pad; anon UPDATE writes athlete_signature + athlete_signed_at.
  if (path.startsWith('/sign/')) {
    return <><Suspense fallback={<BootSplash />}><ContractSign /></Suspense><ToastHost /></>;
  }

  if (!inPwa) {
    // /try short-circuits BEFORE the auth check so the route stays public.
    if (path === '/try' || path.startsWith('/try/')) {
      return <Suspense fallback={<BootSplash />}><TrySandbox /></Suspense>;
    }
    if (path === '/demo/coach' || path.startsWith('/demo/coach/') || path === '/coaches/demo/coach') {
      return <Suspense fallback={<BootSplash />}><CoachDemo /></Suspense>;
    }
    if (path === '/demo/athlete' || path === '/demo/trainee' || path === '/coaches/demo/trainee' || path === '/coaches/demo') {
      return <Suspense fallback={<BootSplash />}><DemoTraineePortal /></Suspense>;
    }
    if (path === '/demo/sandbox') {
      return <Suspense fallback={<BootSplash />}><TrySandbox pov="trainee" /></Suspense>;
    }
    // The coaches' demo LANDING (/demo, /demo/he) is public too — render it
    // BEFORE the auth gate so a signed-in coach can still open the demo to show
    // a prospect, instead of being bounced into their own dashboard.
    if (path === '/demo' || path === '/demo/' || path.startsWith('/coaches')) {
      return <Suspense fallback={<BootSplash />}><CoachLanding lang="en" /></Suspense>;
    }
    if (path === '/demo/he' || path === '/demo/he/' || path === '/he/demo' || path === '/he/demo/') {
      if (path.startsWith('/he/demo')) window.history.replaceState(null, '', '/demo/he');
      return <Suspense fallback={<BootSplash />}><CoachLanding lang="he" /></Suspense>;
    }
  }
  if (!auth || auth.loading) return <BootSplash />;
  if (!auth.session) {
    // PWA mode: every path that isn't already /login renders the LoginScreen
    // directly so the user can authenticate without seeing the marketing
    // chooser or landing page.
    if (inPwa) return <LoginScreen />;
    // Browser mode: front door at / is the EntryChooser; /demo is the
    // coach-marketing landing (legacy /coaches still resolves); everything
    // else falls through to LoginScreen.
    if (path === '/' || path === '') {
      return <Suspense fallback={<BootSplash />}><EntryChooser /></Suspense>;
    }
    // Hebrew lang suffix: /demo/he is the canonical Hebrew route. /he/demo
    // kept as a redirect for any existing inbound link or bookmark.
    if (path === '/demo/he' || path === '/demo/he/') {
      return <Suspense fallback={<BootSplash />}><CoachLanding lang="he" /></Suspense>;
    }
    if (path === '/he/demo' || path === '/he/demo/') {
      window.history.replaceState(null, '', '/demo/he');
      return <Suspense fallback={<BootSplash />}><CoachLanding lang="he" /></Suspense>;
    }
    if (path === '/demo' || path === '/demo/' || path.startsWith('/coaches')) {
      return <Suspense fallback={<BootSplash />}><CoachLanding lang="en" /></Suspense>;
    }
    return <LoginScreen />;
  }
  // SaveErrorToast rides alongside AuthedApp so a failed write from any
  // hook (useSupaStore, useSupaClientWorkouts, useSupaBwLog, useSupaWeeklyFocus)
  // surfaces as a red card bottom-right instead of being swallowed.
  return <><AuthedApp /><SaveErrorToast /><OfflineStatusPill /><ToastHost /><InstallAppPrompt /></>;
}

function AuthedApp() {
  const { session, signOut: rawSignOut } = useAuth();
  const email = (session?.user?.email || '').toLowerCase();
  const logo = useLogoSrc();
  // After a stale-chunk reload (see lazyReload at the top of this file),
  // wait 8s of healthy runtime then clear the once-flag so a *later* chunk
  // failure in the same tab can still trigger one more recovery reload.
  // 8s is long enough to be sure the page actually mounted and didn't
  // immediately re-throw, short enough that the user has likely interacted.
  useEffect(() => {
    const t = setTimeout(() => {
      try { sessionStorage.removeItem(RELOAD_FLAG); } catch {}
    }, 8000);
    return () => clearTimeout(t);
  }, []);
  // Clear the portal choice on sign-out so the next login (potentially a
  // different account) goes through the picker fresh instead of inheriting
  // the previous user's preference.
  const signOut = useCallback(async () => {
    try { sessionStorage.removeItem(PORTAL_CHOICE_KEY); } catch {}
    await rawSignOut();
  }, [rawSignOut]);
  const [trainees,setTrainees,tL,,setTraineesLocal]=useSupaStore(KEYS.trainees,[]);
  const [exercises,setExercises,eL]=useSupaStore(KEYS.exercises,[]);
  const { index: planIndex, loaded: pL, reload: reloadPlanIndex } = usePlanIndex();
  const [workouts,setWorkouts,wL]=useSupaStore(KEYS.workouts,[]);
  // Payments now live in bit_payment_requests (single source of truth).
  // The adapter hook shapes rows to the legacy `payments` array contract
  // so DashboardView / TraineesView / autoTasks don't change.
  const { payments, loaded: pyL, addPayment, updatePayment: updateBitPayment, removePayment } = useBitPayments();
  const [clientWorkouts,setClientWorkouts,markWorkoutReviewed,updateFormVideos,deleteClientWorkout,cwL]=useSupaClientWorkouts([]);
  const [bwLog,setBwLog,bwL]=useSupaBwLog([]);
  const [weeklyFocus,setWeeklyFocus]=useSupaWeeklyFocus({});
  const [portalVis,setPortalVis,,,setPortalVisLocal]=useSupaStore('expo-portal-vis',{});
  // BHBC team command center (/coach/bhbc) — per-athlete session-RPE load + readiness.
  // Owner-only store key (never trainee-visible); JSON blob like expo-bw.
  const [bhbcLoads,setBhbcLoads,,,setBhbcLoadsLocal]=useSupaStore('expo-bhbc-loads',{});
  const [bhbcFixtures,setBhbcFixtures,,,setBhbcFixturesLocal]=useSupaStore('expo-bhbc-fixtures',[]);
  const [bhbcLeague,,,,setBhbcLeagueLocal]=useSupaStore('expo-bhbc-league',{});
  const [bhbcMedical,setBhbcMedical,,,setBhbcMedicalLocal]=useSupaStore('expo-bhbc-medical',{});
  // Live portal-visibility sync: when the coach hides/shows a block, the
  // athlete's OPEN portal (and the coach's other devices) reflect it live
  // instead of on reload. Pure broadcast (no DDL); the athlete never sets it,
  // so there's no rebroadcast loop. Guarded against malformed payloads.
  const portalVisChanRef = useRef(null);
  useEffect(() => {
    // PRIVATE (#35): realtime.messages RLS splits read from write here — any
    // signed-in athlete may RECEIVE a visibility change, but only is_staff()
    // may SEND one. While this topic was public, anyone with the anon key that
    // ships in the browser bundle could broadcast a portal-vis payload; the
    // handler below applies it wholesale, and on a coach's device that setter
    // persists it — so an outsider could rewrite which blocks the whole roster
    // sees. Server-side write authorization is the real fix.
    let disposed = false;
    let ch = null;
    (async () => {
      // Logged-out visitors (landing / demo) have no portal visibility to sync
      // and cannot join a private topic — skip instead of failing a join.
      const { data } = await supabase.auth.getSession();
      if (disposed || !data?.session) return;
      try { await supabase.realtime.setAuth(); } catch { /* surfaced below */ }
      if (disposed) return;
      ch = supabase.channel('portal-sync', { config: { private: true, broadcast: { self: false } } });
      ch.on('broadcast', { event: 'portal-vis' }, ({ payload }) => {
        // Local-only: the coach who toggled already persisted it. Persisting
        // again on the receiver is redundant, and on an athlete (no write RLS on
        // the staff-locked store) it fired a false "SAVE FAILED" toast on every
        // visibility toggle.
        if (payload && payload.vis && typeof payload.vis === 'object') setPortalVisLocal(payload.vis);
      }).subscribe((status) => {
        if (status === 'CHANNEL_ERROR') console.warn('[portal-sync] channel not authorized');
      });
      portalVisChanRef.current = ch;
    })();
    return () => { disposed = true; portalVisChanRef.current = null; if (ch) supabase.removeChannel(ch); };
  }, [setPortalVisLocal]);
  const setPortalVisSynced = useCallback((next) => {
    setPortalVis(prev => {
      const resolved = typeof next === 'function' ? next(prev) : next;
      try { portalVisChanRef.current?.send({ type: 'broadcast', event: 'portal-vis', payload: { vis: resolved } }); } catch { /* not ready */ }
      return resolved;
    });
  }, [setPortalVis]);

  // Role. Trainer = hardcoded whitelist; client = email matches a trainees row.
  // Resolved here rather than in AuthProvider so we don't block auth on the
  // trainees fetch — AuthProvider doesn't know what a trainee is.
  // Note: drop the `if (isTrainer)` short-circuit so an email present in BOTH
  // the trainer list AND a trainee row still resolves a clientTrainee — that
  // dual-role state is what triggers the portal picker.
  const isTrainerEmail = TRAINER_EMAILS.includes(email);
  // Owner = Ohad (full access). Anyone else in TRAINER_EMAILS is limited
  // "staff" (e.g. Yuval) — coach portal, but a reduced surface. STAFF_TABS
  // is the whitelist of tab keys a staff coach may reach (UI + URL guard).
  // Partner (Elad) is treated as owner for the UI so he sees every tab + all data.
  // His writes are blocked at the DB (SELECT-only RLS), and the Partner-Preview
  // banner (below) makes the read-only intent explicit (#232).
  const isPartner = isPartnerEmail(email);
  const isOwner = OWNER_EMAILS.includes(email) || isPartner;

  // Pre-warm pose analysis in the BACKGROUND across every athlete as soon as the
  // coach app has their clips — so bar-speed + symmetry are already computed when
  // the Analysis report opens, instead of grinding through MediaPipe on-demand
  // (Ohad 2026-08-12: "analyze as soon as a video is uploaded, always be ready").
  // Owner-only. Idle-scheduled and STRICTLY sequential per athlete so it never
  // competes with interactive work; the per-clip cache (isAnalyzed) means the
  // first pass does the backlog and later passes only touch newly-uploaded clips.
  const poseWarmRef = useRef(false);
  useEffect(() => {
    if (!isOwner) return undefined;
    if (!clientWorkouts || clientWorkouts.length === 0) return undefined;
    if (poseWarmRef.current) return undefined; // one warmer per app session
    poseWarmRef.current = true;
    let cancelled = false;
    const base = (id) => String(id || '').split('__')[0];
    const ids = [...new Set((clientWorkouts || [])
      .filter((w) => Array.isArray(w.formVideos) && w.formVideos.length)
      .map((w) => base(w.clientId)).filter(Boolean))];
    const idle = () => new Promise((r) => (typeof window !== 'undefined' && window.requestIdleCallback
      ? window.requestIdleCallback(() => r(), { timeout: 5000 })
      : setTimeout(r, 1500)));
    (async () => {
      for (const id of ids) {
        if (cancelled) break;
        await idle();
        if (cancelled) break;
        // onIdle yields to idle BETWEEN CLIPS too (not just between athletes), so
        // an athlete with many clips can't grind N full-model pose passes back-to-
        // back and jank the coach's UI (review H1).
        try { await autoAnalyzeAthleteVideos(clientWorkouts, id, { shouldStop: () => cancelled, onIdle: idle }); } catch { /* one athlete's clip blip never stops the sweep */ }
      }
    })();
    // Reset the guard on cleanup so a later owner re-login (App stays mounted in
    // the dual-role portal switch) restarts the warmer instead of leaving it off
    // for the rest of the tab's life (review M2).
    return () => { cancelled = true; poseWarmRef.current = false; };
    // Intentionally keyed on isOwner only (+ the ref guard): re-runs on every
    // clientWorkouts identity change would restart the whole sweep on each
    // realtime tick. The report-open path still catches anything uploaded after
    // this warmer's snapshot, and a fresh reload starts a fresh sweep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner, clientWorkouts && clientWorkouts.length > 0]);

  // Staff (e.g. Yuval, a masseur) gets Dashboard + Tasks only for now. Athletes
  // (Roster/Programs/Exercises) and every athlete-derived surface are removed
  // per Ohad — alongside money (Billing, revenue KPIs), leads/marketing
  // (Incoming/Waitlist), Review, Challenges, and owner tools (Chat Audit, Bugs,
  // Smart Import, Export). A staff-tailored dashboard is future work; for now
  // his dashboard is just his task queue (see DashboardView `isOwner` branch).
  const STAFF_TABS = ['dashboard','tasks'];
  const storeClientTrainee = useMemo(() => {
    if (!email) return null;
    return (trainees || []).find(t => {
      if (!t.email) return false;
      const emails = Array.isArray(t.email) ? t.email : [t.email];
      // typeof guard: a null/non-string element inside a multi-email array
      // (the `if(!t.email)` above only catches a top-level falsy) would throw on
      // .toLowerCase() and white-screen the whole app shell (this runs in the
      // shell on every trainees change).
      return emails.some(e => typeof e === 'string' && e.toLowerCase() === email);
    }) || null;
  }, [trainees, email]);
  // Athletes can't read the full `expo-trainees` store under RLS (locked to
  // staff + presence keys on 2026-06-06), so a fresh athlete login can't
  // self-match there. Fall back to the self-scoped my_trainee() RPC
  // (SECURITY DEFINER — returns ONLY the caller's own record, no PII leak).
  // selfTrainee: null = none, undefined = checking (avoids an "unauthorized"
  // flash before the RPC resolves).
  const [selfTrainee, setSelfTrainee] = useState(null);
  // Distinguish an RPC FAILURE (network / RLS regression) from a genuine
  // "no trainee row" — the former must not read as "you're not registered".
  const [selfTraineeError, setSelfTraineeError] = useState(false);
  useEffect(() => {
    if (!email || storeClientTrainee || isTrainerEmail) { setSelfTrainee(null); setSelfTraineeError(false); return; }
    let cancelled = false;
    setSelfTrainee(undefined);
    setSelfTraineeError(false);
    supabase.rpc('my_trainee')
      .then(({ data, error }) => { if (cancelled) return; if (error) { setSelfTraineeError(true); setSelfTrainee(null); } else { setSelfTrainee(data || null); } })
      .catch(() => { if (!cancelled) { setSelfTraineeError(true); setSelfTrainee(null); } });
    return () => { cancelled = true; };
  }, [email, storeClientTrainee, isTrainerEmail]);
  const clientTrainee = storeClientTrainee || selfTrainee || null;
  const hasClientRow = !!clientTrainee;
  const isBoth = isTrainerEmail && hasClientRow;

  // Portal choice for dual-role users. sessionStorage = persists across
  // refreshes within the same browser session, dies on new window — exactly
  // what we want (refresh keeps you in, fresh Chrome = re-pick).
  //
  // URL bypass: a path starting with /coach pre-selects the trainer side
  // (the user clearly meant to land on the coach portal); /athlete pre-
  // selects the client side. This lets us open multiple new tabs/windows
  // directly to a deep coach URL without going through the picker every
  // time. Persisted to sessionStorage on first load so the rest of the
  // app sees a normal choice.
  const [portalChoice, setPortalChoice] = useState(() => {
    if (typeof window === 'undefined') return null;
    try {
      const stored = sessionStorage.getItem(PORTAL_CHOICE_KEY);
      if (stored) return stored;
      const p = window.location.pathname || '';
      if (p === '/coach' || p.startsWith('/coach/')) {
        sessionStorage.setItem(PORTAL_CHOICE_KEY, 'trainer');
        return 'trainer';
      }
      if (p === '/athlete' || p.startsWith('/athlete/')) {
        sessionStorage.setItem(PORTAL_CHOICE_KEY, 'client');
        return 'client';
      }
      return null;
    } catch { return null; }
  });
  // If the auth user changes mid-session (e.g. user A signs out, user B
  // signs in via OAuth on the same tab — sessionStorage survives the
  // redirect), drop user A's portal choice so user B re-picks. Without
  // this, a dual-role User B inherits A's "trainer"/"client" preference.
  const lastEmailRef = useRef(email);
  useEffect(() => {
    if (lastEmailRef.current && email && lastEmailRef.current !== email) {
      try { sessionStorage.removeItem(PORTAL_CHOICE_KEY); } catch {}
      setPortalChoice(null);
    }
    lastEmailRef.current = email;
  }, [email]);
  const pickPortal = useCallback((side) => {
    sessionStorage.setItem(PORTAL_CHOICE_KEY, side);
    setPortalChoice(side);
    // Land on the right URL + tab state immediately. Without the setTab the
    // coach header would render with the stale "client" initial tab value
    // on first pick (useState's initializer runs once, before portalChoice
    // exists), leaving no active tab highlighted until the user clicked.
    if (side === 'trainer') {
      const p = window.location.pathname;
      if (!(p === '/coach' || p.startsWith('/coach/'))) {
        window.history.replaceState(null, '', '/coach/dashboard');
      }
      setTab('dashboard');
    } else if (side === 'client') {
      // Canonical client URL is /athlete (trainee portal). Anything else
      // — / front-door, /coach/* coach surfaces — gets rewritten so the
      // address bar stays in sync with the rendered portal.
      const p = window.location.pathname;
      if (p !== '/athlete' && !p.startsWith('/athlete/')) {
        window.history.replaceState(null, '', '/athlete');
      }
      setTab('client');
    }
  }, []);
  const switchPortal = useCallback(() => {
    sessionStorage.removeItem(PORTAL_CHOICE_KEY);
    setPortalChoice(null);
  }, []);

  // Effective role flags. For pure trainers/clients they match the raw flags.
  // For dual-role users they reflect the picked portal — letting the rest of
  // AuthedApp ignore the dual-role wrinkle entirely.
  const isTrainer = isBoth ? portalChoice === 'trainer' : isTrainerEmail;
  const isClient = isBoth ? portalChoice === 'client' : hasClientRow;
  const clientId = clientTrainee?.id || null;

  // Routing: / = portal, /coach = trainer, /coach/tab = specific tab.
  // Anchor on `/coach` exactly or `/coach/` so /coaches (the marketing
  // landing) doesn't get pulled into the trainer router.
  const getRoute = () => {
    const p = window.location.pathname;
    if (p === '/coach' || p.startsWith('/coach/')) {
      const sub = p.replace('/coach','').replace(/^\//,'');
      // /coach/athletes is canonical; /coach/trainees still resolves for any
      // legacy bookmark / chat-share. Both route to the same internal tab.
      if (sub.startsWith('athletes/') || sub.startsWith('trainees/')) {
        const parts = sub.split('/');
        const traineeId = parts[1];
        const preview = parts[2] === 'preview';
        return { mode:'coach', tab:'trainees', traineeId, preview };
      }
      if (sub.startsWith('programs/') && sub.endsWith('/preview')) {
        const parts = sub.split('/');
        return { mode:'coach', tab:'plans', planPreviewId: parts[1] };
      }
      // /coach/programs/<planId> — open that program in the editor (deep-link
      // so a refresh / tab-duplicate lands back in the same editor).
      if (sub.startsWith('programs/')) {
        const parts = sub.split('/');
        if (parts[1]) return { mode:'coach', tab:'plans', planEditId: parts[1] };
      }
      const tabMap = {dashboard:'dashboard',athletes:'trainees',trainees:'trainees',programs:'plans',exercises:'exercises',review:'review','review-tools':'reviewTools',workouts:'workouts',sessions:'sessions','sessions-single':'sessionsSolo',intake:'intake',waitlist:'waitlist','chat-audit':'chatAudit','smart-import':'smartImport',tasks:'tasks',bugs:'bugs',challenges:'challenges',calendar:'calendar',billing:'billing',bhbc:'bhbc'};
      return { mode:'coach', tab: tabMap[sub] || 'dashboard', traineeId:null };
    }
    return { mode:'portal' };
  };
  const initRoute = getRoute();
  const isCoach = isTrainer;

  // A staff coach who deep-links to a tab outside STAFF_TABS falls back to
  // their dashboard.
  const coachInitialTab = isOwner
    ? (initRoute.tab || 'dashboard')
    : (STAFF_TABS.includes(initRoute.tab) ? initRoute.tab : 'dashboard');
  const [tab,setTab]=useState(isCoach ? coachInitialTab : "client");
  const [selectedTrainee,setSelectedTrainee]=useState(initRoute.traineeId || null);
  const [previewTrainee,setPreviewTrainee]=useState(initRoute.preview ? initRoute.traineeId : null);
  const [previewPlan,setPreviewPlan]=useState(initRoute.planPreviewId || null);
  const [selectedPlanId,setSelectedPlanId]=useState(initRoute.planEditId || null);
  // Tracks where the plan editor was entered FROM, so the back button
  // routes the coach back there instead of always landing on /programs.
  // null = no editor open; { kind: 'trainees', traineeId: 'tr_xxx' } = came
  // from a trainee card; { kind: 'plans' } = came from the program list.
  const [planEditorOrigin,setPlanEditorOrigin]=useState(null);
  const [showPwModal,setShowPwModal]=useState(false);

  // Post-sign-in URL routing: trainers go to /coach/dashboard, clients go
  // to /athlete. Covers the case where the form lives at /login — after
  // auth flips, this redirect rewrites the address bar to the canonical
  // surface URL for the user's role.
  useEffect(() => {
    if (!tL) return;
    const p = window.location.pathname;
    const onCoach = p === '/coach' || p.startsWith('/coach/');
    const onAthlete = p === '/athlete' || p.startsWith('/athlete/');
    const onLogin = p.startsWith('/login');
    if (isClient && !onAthlete) window.history.replaceState(null, '', '/athlete');
    else if (isTrainer && !onCoach) {
      window.history.replaceState(null, '', '/coach/dashboard');
      // Back-stop: push a duplicate landing entry so the FIRST browser Back
      // is absorbed by popstate (returns to dashboard, handled in-app)
      // instead of falling through to the pre-login page and ejecting the
      // user from the SPA. This is what Yuval hit — landing replaced the
      // only app entry, so one Back left the app entirely.
      window.history.pushState(null, '', '/coach/dashboard');
      setTab('dashboard');
    }
  }, [tL, isClient, isTrainer]);

  // Sync URL when tab or trainee changes (coach mode only)
  const updateURL = useCallback((newTab, newTrainee) => {
    if (tab === 'client' && !isCoach) return;
    // URL writes the canonical "athletes" segment now; internal tab key
    // stays "trainees" so the rest of AuthedApp doesn't have to be touched.
    const tabUrl = {dashboard:'dashboard',trainees:'athletes',plans:'programs',exercises:'exercises',review:'review',reviewTools:'review-tools',workouts:'workouts',sessions:'sessions',sessionsSolo:'sessions-single',intake:'intake',waitlist:'waitlist',chatAudit:'chat-audit',smartImport:'smart-import',tasks:'tasks',bugs:'bugs',challenges:'challenges',calendar:'calendar',billing:'billing',bhbc:'bhbc'};
    let path = '/coach/' + (tabUrl[newTab] || 'dashboard');
    if (newTab === 'trainees' && newTrainee) path += '/' + newTrainee;
    if (window.location.pathname !== path) window.history.pushState(null, '', path);
  }, [tab, isCoach]);

  // Handle browser back/forward
  useEffect(() => {
    const onPop = () => {
      const r = getRoute();
      if (r.mode === 'coach') { setTab(r.tab); setSelectedTrainee(r.traineeId); setPreviewTrainee(r.preview ? r.traineeId : null); setPreviewPlan(r.planPreviewId || null); setSelectedPlanId(r.planEditId || null); }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const openPreview = useCallback((id) => {
    setTab('trainees'); setSelectedTrainee(id); setPreviewTrainee(id);
    const path = '/coach/athletes/' + id + '/preview';
    if (window.location.pathname !== path) window.history.pushState(null, '', path);
  }, []);
  const closePreview = useCallback((id) => {
    setPreviewTrainee(null);
    const path = '/coach/athletes/' + id;
    if (window.location.pathname !== path) window.history.pushState(null, '', path);
  }, []);
  const openPlanPreview = useCallback((id) => {
    setTab('plans'); setPreviewPlan(id);
    const path = '/coach/programs/' + id + '/preview';
    if (window.location.pathname !== path) window.history.pushState(null, '', path);
  }, []);
  const closePlanPreview = useCallback(() => {
    // BACK TO COACH from CoachPreviewPortal returns the coach to the SAME
    // plan in the editor — Ohad opens preview to glance at how it looks,
    // then expects to drop back into editing where he left off. Without
    // re-setting selectedPlanId, MemoPlans rendered as the empty list.
    setSelectedPlanId(previewPlan);
    setPreviewPlan(null);
    const path = '/coach/programs';
    if (window.location.pathname !== path) window.history.pushState(null, '', path);
  }, [previewPlan]);

  const navTo = useCallback((newTab, newTrainee) => {
    // Staff (non-owner coach) can never navigate to an owner-only tab — not even
    // via a cross-tab action button surfaced on their dashboard/tasks (e.g. a
    // task's "open program"/"open athlete"/"review"). Without this, such a click
    // rendered an owner-only view (PlansView/TraineeDetail/WorkoutReview) and
    // fired its Supabase reads for one frame before the URL guard bounced them.
    // Owners (isOwner) are unaffected; athletes never hit the coach app.
    if (isCoach && !isOwner && newTab && !STAFF_TABS.includes(newTab)) return;
    setTab(newTab);
    setSelectedTrainee(newTrainee || null);
    updateURL(newTab, newTrainee);
  }, [updateURL, isCoach, isOwner]);

  // Stable ref for MemoReview — an inline arrow here would defeat its memo.
  const openTraineeFromReview = useCallback((id) => navTo('trainees', id), [navTo]);

  // Staff URL guard: a limited coach (e.g. Yuval) who types/bookmarks an
  // owner-only tab (billing, intake, waitlist, chat-audit, smart-import,
  // challenges, bugs, …) gets bounced back to their dashboard. UI hides
  // these tabs; this backstops direct navigation.
  useEffect(() => {
    if (isCoach && !isOwner && tab && !STAFF_TABS.includes(tab)) {
      // Bounce via REPLACE, not push. navTo() pushes a new history entry, so
      // a staff user (Yuval) who back-navigated onto a forbidden tab would
      // get a phantom /coach/dashboard pushed on top — making the next Back
      // re-land on the forbidden URL and bounce again, or fall through below
      // the app's first entry and eject him entirely. Replacing the current
      // entry keeps the history stack clean.
      setTab('dashboard');
      setSelectedTrainee(null);
      if (window.location.pathname !== '/coach/dashboard') {
        window.history.replaceState(null, '', '/coach/dashboard');
      }
    }
  }, [isCoach, isOwner, tab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Deep-link URL correction for staff: a limited coach who typed/bookmarked an
  // owner-only tab URL lands with `tab` pre-sanitized to 'dashboard', so the
  // guard above (keyed on `tab`) never fires — yet the address bar still shows
  // the forbidden path. Fix the URL once on mount so it matches the view shown.
  useEffect(() => {
    if (!(isCoach && !isOwner)) return;
    const r = getRoute();
    if (r.mode === 'coach' && r.tab && !STAFF_TABS.includes(r.tab) && window.location.pathname !== '/coach/dashboard') {
      setTab('dashboard');
      window.history.replaceState(null, '', '/coach/dashboard');
    }
  }, [isCoach, isOwner]); // eslint-disable-line react-hooks/exhaustive-deps

  // Earlier a one-time BILLING seed lived here that gated on
  // `!t.monthly` — it ran successfully on the first sign-in, then went
  // permanently dormant because every trainee then had `monthly` set.
  // Editing the source-of-truth constant in this file had no effect
  // after that first run. Removed entirely; the canonical edit surface
  // for monthly / perSession / lastPayment is the trainee detail page.

  const handleDecrementSession=useCallback(tid=>{
    // Couple workouts arrive with sub-member IDs (tr_xxx__0). Sessions counter lives on the parent row.
    const parsed = parseTraineeId(tid);
    const targetId = parsed ? parsed.parentId : tid;
    setTrainees(prev=>{
      const target = prev.find(t=>t.id===targetId);
      // No writable trainee row present (the ATHLETE portal's `trainees` is an
      // empty, RLS-staff-locked list) or nothing to decrement → return the SAME
      // reference so React skips the update. Otherwise setTrainees([]) hit the
      // staff-only store → 42501 → a spurious "SAVE FAILED" on every portal
      // workout completion. (A self-logged portal workout isn't a coaching
      // session anyway; coach-side in-person logging still decrements normally.)
      if (!target || !(target.sessionsRemaining>0)) return prev;
      return prev.map(t=>t.id===targetId?{...t,sessionsRemaining:t.sessionsRemaining-1}:t);
    });
  },[setTrainees]);

  const handleExport=async()=>{
    const { data: allPlans, error: plansErr } = await supabase.from('plans').select('*');
    if (plansErr) {
      // A backup with silently-empty plans is worse than no backup.
      toast('Export aborted — plans could not be read: ' + plansErr.message, 'error');
      return;
    }
    const data=JSON.stringify({trainees,exercises,plans:allPlans||[],workouts,payments,clientWorkouts,bwLog,exportDate:new Date().toISOString(),version:"1.0"},null,2);
    const blob=new Blob([data],{type:"application/json"});const url=URL.createObjectURL(blob);
    const a=document.createElement("a");a.href=url;a.download=`expo-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(url);
  };

  // ChatAudit + Bugs were moved out of the primary nav into the ⋯ MORE
  // overflow menu (alongside Smart Import / Export / Change Password)
  // so the header doesn't overflow on common viewport widths. Both
  // remain reachable as tab keys via navTo().
  // Calendar was pulled 2026-05-14 — bookings now happen on
  // expo-il.co.il/#/gym via Google Calendar, so the coach-side settings
  // page is dead weight. URL still resolves for backwards-compat.
  // Top-level nav order (Ohad spec 2026-05-16):
  // Tasks → Review → Billing first (daily triage), then Dashboard +
  // Athletes ▾ + Challenges + Incoming ▾ + Portal. Two submenu tabs:
  //   • Athletes ▾ groups Roster / Programs / Exercises
  //   • Incoming ▾ groups Intake / Waitlist
  // The row goes from 11 items down to 8 visible tabs, fitting at
  // 1366px viewport without horizontal scroll.
  const activeAthletesCount = trainees.filter(t=>t.status!=='Archived'&&t.team!=='BHBC').length;
  // Ohad spec 2026-05-16:
  //   Dashboard › Athletes › Tasks › Review › Billing › Incoming › Challenges › Portal
  const tabs = [
    { key:'dashboard',  label:'Dashboard',  count:null },
    { key:'trainees',   label:'Athletes',   count:activeAthletesCount,
      submenu: [
        { route:'trainees',  label:'Roster',    count:activeAthletesCount },
        { route:'plans',     label:'Programs',  count:null },
        { route:'exercises', label:'Exercises', count:null },
        { route:'bhbc',      label:'BHBC',      count:null },
      ] },
    { key:'sessions',   label:'Sessions',   count:null,
      submenu: [
        { route:'sessions',     label:'Group',  count:null },
        { route:'sessionsSolo', label:'Single', count:null },
      ] },
    { key:'review',     label:'Review',     count:null,
      submenu: [
        { route:'review',      label:'Workouts', count:null },
        { route:'reviewTools', label:'Tools',    count:null },
      ] },
    { key:'tasks',      label:'Tasks',      count:null },
    { key:'billing',    label:'Billing',    count:null },
    { key:'intake',     label:'Incoming',   count:null,
      submenu: [
        { route:'intake',    label:'Intake',    count:null },
        { route:'waitlist',  label:'Waitlist',  count:null },
      ] },
    { key:'challenges', label:'Challenges', count:null },
    { key:'client',     label:'Portal',     count:null },
  ];
  // Staff see only their whitelisted top-level tabs (STAFF_TABS = dashboard +
  // tasks only — they do NOT get Athletes/Programs/Exercises/Billing/etc; the
  // visibleTabs filter below + the URL guard enforce it). The Portal tab stays
  // for dual-role staff (e.g. Yuval, who is also an athlete) so they can switch
  // to their own training portal. Owner sees the full row.
  const visibleTabs = isOwner
    ? tabs
    : tabs.filter(t => STAFF_TABS.includes(t.key) || (t.key === 'client' && isBoth));

  // Pre-compute plan counts per trainee. Counts roll up to the parent ID:
  // a plan on tr_xxx__0 or __1 (couple sub-members) also increments tr_xxx so
  // Dashboard's parent-keyed lookup works without rewriting every call site.
  const planCounts = useMemo(() => {
    const m = {};
    planIndex.forEach(p => {
      if (!p.traineeId) return;
      m[p.traineeId] = (m[p.traineeId]||0) + 1;
      const parsed = parseTraineeId(p.traineeId);
      if (parsed) m[parsed.parentId] = (m[parsed.parentId]||0) + 1;
    });
    return m;
  }, [planIndex]);

  // Presence polling — read which clients are online.
  // Aggregates per-client rows (key prefix `expo-presence-`) plus the legacy
  // shared `expo-presence` blob for backwards compatibility while the older
  // rows age out of localStorage on logged-in trainees.
  const [presence, setPresence] = useState({});
  useEffect(() => {
    if (!isCoach) return;
    const poll = async () => {
      try {
        const next = {};
        const { data: rows } = await supabase
          .from('store')
          .select('key, value')
          .like('key', 'expo-presence-%');
        for (const r of rows || []) {
          const id = (r?.value?.clientId) || r.key.slice('expo-presence-'.length);
          const ts = r?.value?.ts;
          if (id && typeof ts === 'number') next[id] = ts;
        }
        const { data: legacy } = await supabase.from('store').select('value').eq('key', 'expo-presence').maybeSingle();
        if (legacy?.value && typeof legacy.value === 'object') {
          for (const [id, ts] of Object.entries(legacy.value)) {
            if (next[id] == null && typeof ts === 'number') next[id] = ts;
          }
        }
        setPresence(next);
      } catch {}
    };
    poll();
    const iv = setInterval(poll, 30000);
    return () => clearInterval(iv);
  }, [isCoach]);

  // Live sync for the BHBC zone — poll the store keys so coaches see each other's
  // changes without refreshing (shared-Google-Sheet feel). Gated to the zone.
  // saveLocal applies the incoming value WITHOUT re-writing. First read is
  // skipped so it never clobbers a local edit made just before entering.
  // (A true realtime-broadcast layer like portal-sync is the next step.)
  const bhbcSeenRef = useRef({});
  useEffect(() => {
    if (tab !== 'bhbc') return undefined;
    let stop = false;
    const poll = async () => {
      try {
        const { data: rows } = await supabase.from('store').select('key, value').in('key', ['expo-bhbc-loads', 'expo-bhbc-fixtures', 'expo-bhbc-league', 'expo-bhbc-medical', 'expo-trainees']);
        if (stop || !rows) return;
        for (const r of rows) {
          const j = JSON.stringify(r.value);
          if (bhbcSeenRef.current[r.key] === j) continue;
          const first = bhbcSeenRef.current[r.key] === undefined;
          bhbcSeenRef.current[r.key] = j;
          if (first) continue;
          if (r.key === 'expo-bhbc-loads') setBhbcLoadsLocal(r.value);
          else if (r.key === 'expo-bhbc-fixtures') setBhbcFixturesLocal(r.value);
          else if (r.key === 'expo-bhbc-league') setBhbcLeagueLocal(r.value);
          else if (r.key === 'expo-bhbc-medical') setBhbcMedicalLocal(r.value);
          else if (r.key === 'expo-trainees') setTraineesLocal(r.value);
        }
      } catch { /* transient */ }
    };
    poll();
    const iv = setInterval(poll, 8000);
    return () => { stop = true; clearInterval(iv); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // Dual-role accounts: no portal picked yet → show the picker. Wait for
  // trainees to load so we don't briefly render the picker for a pure trainer
  // before the trainee match resolves (would flash for one frame otherwise).
  if (tL && isBoth && !portalChoice) {
    return <RolePickerScreen name={clientTrainee?.name || ''} onPick={pickPortal} onSignOut={signOut} />;
  }

  // Authenticated but email not recognized — show Access Denied.
  // Wait for trainees to load before deciding so real clients don't flash this.
  // Excludes isBoth since they're handled by the picker branch above.
  if (tL && selfTrainee !== undefined && !isTrainer && !isClient && !isBoth) {
    return <UnauthorizedScreen email={session?.user?.email || ''} onSignOut={signOut}
      verifyError={selfTraineeError}
      onRetry={() => { setSelfTrainee(undefined); setSelfTraineeError(false); supabase.rpc('my_trainee').then(({ data, error }) => { if (error) { setSelfTraineeError(true); setSelfTrainee(null); } else { setSelfTrainee(data || null); } }).catch(() => { setSelfTraineeError(true); setSelfTrainee(null); }); }} />;
  }

  // Client view — portal for the logged-in client. Dual-role users (an
  // account that's BOTH a trainer AND a client row, e.g. Ohad himself)
  // get an `onReturnToCoach` callback wired to pickPortal('trainer') so
  // they can switch back without signing out.
  // Athlete portal — force dark while light-mode rollout is gated to the
  // coach app. The wrapper `data-theme="dark"` overrides any html-level
  // light theme set by a dual-role coach. The inline background + minHeight
  // are required so the body's light bg doesn't leak through the margins
  // (every other forced-dark wrapper in the codebase carries the same
  // background/minHeight pair — see CoachLanding, TrySandbox, etc.).
  // Removing this attribute later will let the athlete portal follow the
  // user's preference.
  if (isClient) return (<div data-theme="dark" style={{ background: 'var(--c-bg)', color: 'var(--c-tx)', minHeight: '100vh' }}><Suspense fallback={<ViewFallback />}>
    <ErrorBoundary inline>
    <ClientPortal clientId={clientId} clientWorkouts={clientWorkouts} setClientWorkouts={setClientWorkouts} bwLog={bwLog} setBwLog={setBwLog} weeklyFocus={weeklyFocus} setWeeklyFocus={setWeeklyFocus} portalVis={portalVis} trainerExercises={exercises} trainees={trainees} selfTrainee={clientTrainee} onDecrementSession={handleDecrementSession} signOut={signOut} updateFormVideos={updateFormVideos}
      onReturnToCoach={isBoth ? () => pickPortal('trainer') : null}/>
    </ErrorBoundary>
  </Suspense></div>);

  // Role not resolved yet — the my_trainee() RPC is still in flight for a
  // possible athlete (selfTrainee===undefined only during that window; it always
  // resolves to a value, null on error, so this can't strand). Wait instead of
  // flashing the coach header/nav to someone who may be a client. Trainers get
  // selfTrainee=null synchronously, so they're unaffected.
  if (selfTrainee === undefined && !isTrainer) return (
    <div style={{background:C.bg,color:C.tx,minHeight:"100vh",fontFamily:FB,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16}}>
      <img src={logo.nav} alt="EXPO" style={{height:50}} />
      <div style={{color:C.td,fontSize:13}}>Loading…</div>
    </div>);

  // Wait for small stores + plan index + workout/bodyweight tables so
  // trainee card counts, the Review queue, and dashboard alert tiles don't
  // flash 0/empty while their tables are still loading. Exercises (eL) is
  // deliberately NOT gated — it's the largest store and its consumers
  // (library, pickers) tolerate a late fill. All loaded flags flip true on
  // failure too, so a failed read can't strand this splash.
  const storesReady = tL && wL && pyL && pL && cwL && bwL;
  if (!storesReady) return (
    <div style={{background:C.bg,color:C.tx,minHeight:"100vh",fontFamily:FB,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16}}>
      <img src={logo.nav} alt="EXPO" style={{height:50}} />
      <div style={{color:C.td,fontSize:13}}>Loading data...</div>
    </div>);

  // BHBC = a fully separate ZONE — no EXPO coach nav at all (Ohad: "completely
  // different zone, I don't want to see the rest of the expo stuff"). Full-screen
  // BHBC shell with its own top bar; entered from the Athletes ▾ submenu. Owner-only.
  if (tab === 'bhbc' && isOwner) return (
    <Suspense fallback={<ViewFallback />}>
      <ErrorBoundary inline>
        <BhbcView trainees={trainees} setTrainees={setTrainees} bhbcLoads={bhbcLoads} setBhbcLoads={setBhbcLoads} bhbcFixtures={bhbcFixtures} setBhbcFixtures={setBhbcFixtures} league={bhbcLeague} medical={bhbcMedical} setMedical={setBhbcMedical} planIndex={planIndex} exercises={exercises} clientWorkouts={clientWorkouts} setClientWorkouts={setClientWorkouts} workouts={workouts} setWorkouts={setWorkouts} onDecrementSession={handleDecrementSession} portalVis={portalVis} bwLog={bwLog} weeklyFocus={weeklyFocus} onOpenTrainee={id=>navTo('trainees',id)} onExit={()=>navTo('trainees')} />
      </ErrorBoundary>
    </Suspense>
  );

  return(
    <div style={{background:C.bg,color:C.tx,minHeight:"100vh",fontFamily:FB}}>
      {isPartner && <div style={{background:`color-mix(in srgb, ${C.ac} 22%, ${C.bg})`,borderBottom:`1px solid ${C.ac}`,color:C.tx,fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.06em',textAlign:'center',padding:'7px 12px'}}>PARTNER PREVIEW · you're viewing the real EXPO with live data — anything you change isn't saved</div>}
      {isOwner && <SensorLab />}
      <header style={{background:C.headerBg,borderBottom:`1px solid ${C.cardBd}`,boxShadow:'0 1px 2px rgba(0,0,0,0.03), 0 4px 12px rgba(0,0,0,0.04)',position:"sticky",top:0,zIndex:100,paddingTop:'env(safe-area-inset-top)'}}>
        <style>{`
          .hdr-scroll::-webkit-scrollbar{display:none}
          .nav-item-inactive{transition:color 120ms, background 120ms}
          .nav-item-inactive:hover{color:var(--c-acText) !important;background:rgba(57,189,255,0.035) !important}
          .hdr-icon-btn{transition:color 120ms, background 120ms}
          .hdr-icon-btn:hover{color:#0E0F12 !important;background:rgba(57,189,255,0.08) !important}
          /* Mobile: the ENTIRE nav row slides horizontally end-to-end with
             NOTHING pinned (Ohad 2026-08). Pinning the right cluster (sticky,
             right:0) made it read as "fixed" and blocked scrolling to the last
             nav tabs. Un-pin it so a single swipe carries you from the logo all
             the way to the sign-out icon. Desktop (where it all fits + centers)
             is untouched. */
          @media (max-width: 760px) {
            .hdr-right { position: static !important; right: auto !important;
              margin-left: 8px !important; background: transparent !important;
              box-shadow: none !important; z-index: auto !important; }
          }
          [data-theme="5b"] .alert-card,[data-theme="light"] .alert-card{transition:box-shadow 200ms, transform 200ms}
          [data-theme="5b"] .alert-card:hover,[data-theme="light"] .alert-card:hover{box-shadow:inset 0 1px 0 rgba(255,255,255,0.30), 0 2px 4px rgba(0,0,0,0.10), 0 10px 24px rgba(0,0,0,0.14);transform:translateY(-1px)}
          [data-theme="5b"] .alert-row,[data-theme="light"] .alert-row{transition:background 120ms}
          [data-theme="5b"] .alert-row:hover,[data-theme="light"] .alert-row:hover{background:rgba(255,255,255,0.10)}
        `}</style>
        <div className="hdr-scroll" style={{maxWidth:1200,margin:"0 auto",padding:"0 16px",display:"flex",alignItems:"center",height:56,overflowX:"auto",WebkitOverflowScrolling:"touch",msOverflowStyle:"none",scrollbarWidth:"none"}}>
          <EXPOMark height={36} onClick={()=>navTo('dashboard')} title="Back to dashboard" style={{flex:"0 0 auto",marginRight:12,cursor:'pointer'}} />
          <nav style={{display:"flex",gap:6,alignItems:"center",flex:"1 1 auto",justifyContent:"center",minWidth:"max-content"}}>
            {/* alignItems:'baseline' overrides baseBtn's 'center' so the
                count digit (fontSize:10) baseline-aligns with the label
                (fontSize:11) instead of floating above it. See CoachDemo
                line ~2755 for the full reasoning. */}
            {visibleTabs.map(t=>{
              // A tab with `submenu` becomes a dropdown trigger.
              // Active-state for a submenu trigger fires when current
              // tab is any of the items' routes.
              const isSection = t.submenu && t.submenu.some(it => tab === it.route);
              const isActive = t.submenu ? isSection : tab === t.key;
              const dataTheme=(typeof document!=='undefined'?document.documentElement.getAttribute('data-theme'):null);
              const isChosen=dataTheme==='5'||dataTheme==='5b'||dataTheme==='light';
              const CYAN='#39BDFF';
              const BLACK='#0E0F12';
              const activeStyle=isChosen
                ?{background:isActive?CYAN:'transparent',border:'0.25px solid transparent',color:isActive?'#FFFFFF':BLACK,boxShadow:isActive?'0 1px 2px rgba(0,0,0,0.10), 0 4px 12px rgba(57,189,255,0.28)':'none'}
                :{background:'transparent',border:`1px solid ${isActive?C.ac:'transparent'}`,color:isActive?C.ac:C.tm};
              const countColor=isChosen?(isActive?'rgba(255,255,255,0.78)':BLACK):(isActive?C.ac:C.td);
              if (t.submenu) {
                return (<SubmenuTab key={t.key} id={t.key}
                  label={t.label} count={t.count} items={t.submenu}
                  tab={tab} navTo={navTo}
                  activeStyle={activeStyle} isChosen={isChosen} countColor={countColor} />);
              }
              // Plain tab. Typography tightened (fontSize 10 + letterSpacing
              // 0.06em — was 11 / 0.18em) so the 8-item row clears 1366px
              // viewport comfortably. alignItems:'center' (was 'baseline')
              // matches SubmenuTab so label + count share one center-line.
              return(<button key={t.key} className={!isActive?'nav-item-inactive':undefined} onClick={async()=>{if(t.key==='client'){if(isBoth){pickPortal('client');}else{await signOut();window.location.href='/';}}else{navTo(t.key)}}} style={{...baseBtn,alignItems:'center',borderRadius:0,padding:"6px 10px",fontSize:10,fontWeight:700,letterSpacing:'0.06em',textTransform:'uppercase',whiteSpace:"nowrap",...activeStyle}}>
                <span>{t.label}</span>{t.count!==null&&<span style={{fontSize:10,color:countColor,fontFamily:FN}}>{t.count}</span>}</button>)})}</nav>
          {/* Right cluster: ⋯ MORE | Theme | Bug | Sign out, separated
              by cyan hairlines. Ohad 2026-05-16 — removed the left
              border that previously fenced this whole group from the
              nav; the cyan separators between items are the only
              dividers now. */}
          <div className="hdr-right" style={{flex:"0 0 auto",display:"flex",alignItems:"center",gap:2,marginLeft:12}}>
            <MoreMenu tab={tab} navTo={navTo} onExport={handleExport} onChangePassword={()=>setShowPwModal(true)} isOwner={isOwner} />
            <span style={{width:1,height:22,background:C.ac,opacity:0.15,alignSelf:'center',marginLeft:6,marginRight:6}} aria-hidden="true" />
            <ThemeToggle size={32} />
            <span style={{width:1,height:22,background:C.ac,opacity:0.15,alignSelf:'center',marginLeft:6,marginRight:6}} aria-hidden="true" />
            <BugReportButton role="coach" reporterEmail={email} variant="coach" />
            <span style={{width:1,height:22,background:C.ac,opacity:0.15,alignSelf:'center',marginLeft:6,marginRight:6}} aria-hidden="true" />
            <button className="hdr-icon-btn" onClick={signOut} title="Sign out" aria-label="Sign out" style={{...baseBtn,background:"transparent",color:C.tx,padding:"6px 8px",fontSize:14,borderRadius:0}}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg></button>
            </div></div></header>
      {showPwModal && <PasswordChangeModal onClose={()=>setShowPwModal(false)}/>}
      <main style={{maxWidth:1200,margin:"0 auto",padding:"12px"}}>
        <Suspense fallback={<ViewFallback />}>
          {/* Per-view boundary: a crash in one view degrades to a recovery card
              while the nav + other tabs stay usable. Keyed on the full sub-route
              identity (not just `tab`) so navigating BETWEEN trainees/plans within
              the same tab remounts the boundary and recovers — keying on `tab`
              alone left the recovery card stuck when switching to another trainee
              after a crash. */}
          {/* NOTE: selectedPlanId is deliberately NOT in this key. Opening a
              program from TraineeDetail sets selectedPlanId then PlansView's
              onPlanOpened immediately clears it back to null — putting it in the
              boundary key made that pid→null toggle remount the whole subtree,
              throwing away the editor's just-set editMode and dumping the coach
              back on the programs list. tab + trainee already reset a stuck
              recovery card on navigation. */}
          <ErrorBoundary key={`${tab}:${selectedTrainee||''}:${previewTrainee||''}`} inline>
          {tab==="dashboard"&&<DashboardView isOwner={isOwner} trainees={trainees} planCounts={planCounts} workouts={workouts} clientWorkouts={clientWorkouts} payments={payments} presence={presence} onSelectTrainee={id=>navTo("trainees",id)} onOpenTasksTab={()=>navTo("tasks")} onCreatePlanForTask={()=>navTo("plans")} onOpenIntakeTab={()=>navTo("intake")} onOpenWaitlist={()=>navTo("waitlist")} onOpenReviewWorkout={id=>{try{sessionStorage.setItem('expo-pendingReviewWorkout',id);}catch{} navTo("review");}}/>}
          {tab==="waitlist"&&<WaitlistView trainees={trainees}/>}
          {tab==="intake"&&<IntakeView trainees={trainees}/>}
          {tab==="chatAudit"&&<ChatAuditView/>}
          {tab==="smartImport"&&<SmartImportView/>}
          {tab==="trainees"&&!selectedTrainee&&<TraineesView trainees={trainees} setTrainees={setTrainees} planCounts={planCounts} payments={payments} workouts={workouts} clientWorkouts={clientWorkouts} bwLog={bwLog} portalVis={portalVis} presence={presence} onSelect={id=>navTo("trainees",id)} onPreview={openPreview}/>}
          {tab==="trainees"&&selectedTrainee&&previewTrainee===selectedTrainee&&<CoachPreviewPortal traineeId={selectedTrainee} trainees={trainees} exercises={exercises} portalVis={portalVis} clientWorkouts={clientWorkouts} bwLog={bwLog} weeklyFocus={weeklyFocus} onBack={()=>closePreview(selectedTrainee)}/>}
          {tab==="trainees"&&selectedTrainee&&previewTrainee!==selectedTrainee&&<TraineeDetail key={selectedTrainee} trainee={selectedTrainee} trainees={trainees} setTrainees={setTrainees} planIndex={planIndex} reloadPlanIndex={reloadPlanIndex} onOpenPlan={pid=>{setSelectedPlanId(pid);setPlanEditorOrigin({kind:'trainees',traineeId:selectedTrainee});navTo("plans")}} onPreviewPortal={()=>openPreview(selectedTrainee)} onOpenTasksTab={()=>navTo("tasks")} onCreatePlanForTask={()=>navTo("plans")} onOpenIntakeTab={()=>navTo("intake")} onOpenInPersonForTrainee={tid=>{try{sessionStorage.setItem('expo-pendingInPersonTrainee',tid);}catch{} navTo("workouts");}} exercises={exercises} workouts={workouts} clientWorkouts={clientWorkouts} payments={payments} addPayment={addPayment} updatePayment={updateBitPayment} removePayment={removePayment} bwLog={bwLog} portalVis={portalVis} setPortalVis={setPortalVisSynced} presence={presence} onBack={()=>navTo("trainees")}/>}
          {tab==="exercises"&&<MemoExercises exercises={exercises} setExercises={setExercises}/>}
          {tab==="review"&&<MemoReview clientWorkouts={clientWorkouts} weeklyFocus={weeklyFocus} setWeeklyFocus={setWeeklyFocus} planIndex={planIndex} trainees={trainees} exercises={exercises} markReviewed={markWorkoutReviewed} updateFormVideos={updateFormVideos} deleteWorkout={deleteClientWorkout} onOpenTrainee={openTraineeFromReview}/>}
          {tab==="reviewTools"&&isOwner&&<ReviewToolsView clientWorkouts={clientWorkouts} trainees={trainees}/>}
          {tab==="plans"&&previewPlan&&<CoachPreviewPortal planId={previewPlan} trainees={trainees} exercises={exercises} portalVis={portalVis} clientWorkouts={clientWorkouts} bwLog={bwLog} weeklyFocus={weeklyFocus} onBack={closePlanPreview}/>}
          {tab==="plans"&&!previewPlan&&<MemoPlans planIndex={planIndex} reloadIndex={reloadPlanIndex} trainees={trainees} exercises={exercises} setExercises={setExercises} clientWorkouts={clientWorkouts} weeklyFocus={weeklyFocus} setWeeklyFocus={setWeeklyFocus} openPlanId={selectedPlanId} onPlanOpened={()=>setSelectedPlanId(null)} onEditorOpen={(id)=>{ const path='/coach/programs/'+id; if(window.location.pathname!==path) window.history.pushState(null,'',path); }} onEditorClose={()=>{ const p=window.location.pathname; if(p.startsWith('/coach/programs/')&&!p.endsWith('/preview')) window.history.replaceState(null,'','/coach/programs'); }} onPreviewPlan={openPlanPreview} portalVis={portalVis} setPortalVis={setPortalVisSynced} onCloseEditor={()=>{const o=planEditorOrigin; setPlanEditorOrigin(null); if(o?.kind==='trainees'&&o.traineeId)navTo('trainees',o.traineeId);}}/>}
          {tab==="workouts"&&<MemoWorkouts workouts={workouts} setWorkouts={setWorkouts} planIndex={planIndex} trainees={trainees} exercises={exercises} onDecrementSession={handleDecrementSession} clientWorkouts={clientWorkouts} setClientWorkouts={setClientWorkouts}/>}
          {tab==="tasks"&&<CoachTasksView trainees={trainees} onSelectTrainee={id=>navTo("trainees",id)} onCreatePlanForTask={()=>navTo("plans")} onOpenIntakeTab={()=>navTo("intake")} onOpenReviewWorkout={id=>{try{sessionStorage.setItem('expo-pendingReviewWorkout',id);}catch{} navTo("review");}}/>}
          {tab==="bugs"&&<BugsView/>}
          {tab==="challenges"&&<ChallengesView trainees={trainees} clientWorkouts={clientWorkouts} bwLog={bwLog} />}
          {tab==="calendar"&&<BookingView trainees={trainees} />}
          {tab==="billing"&&<BillingView trainees={trainees} />}
          {/* Sessions = owner-only TRIAL. The tab is hidden for staff (not in
              STAFF_TABS) and the URL guard redirects non-owners; this isOwner
              gate is belt-and-suspenders so it can never render for anyone but
              Ohad. Athletes never reach the coach app at all. */}
          {(tab==="sessions"||tab==="sessionsSolo")&&isOwner&&<SessionsView mode={tab==="sessionsSolo"?"single":"group"} trainees={trainees} planIndex={planIndex} exercises={exercises} clientWorkouts={clientWorkouts} setClientWorkouts={setClientWorkouts} workouts={workouts} setWorkouts={setWorkouts} onDecrementSession={handleDecrementSession} />}
          </ErrorBoundary>
        </Suspense>
      </main>
    </div>);
}
