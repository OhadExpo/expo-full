// BhbcView.jsx — /coach/bhbc — Bnei Herzliya BC team S&C zone.
//
// A fully separate ZONE (no EXPO coach nav) entered from Athletes ▾ → BHBC.
// Staff-gated; players use the normal athlete portal. One home for the pro-
// basketball S&C operation: roster, per-athlete + team LOAD / ACWR / readiness.
//
// DESIGN: EXPO's rules (card/strip system, uniform 41px strips, Nord, sharp
// corners, stroke ruling, light/dark parity) recolored to the club palette by
// overriding the theme CSS tokens on the wrapper — navy #1E3D74 (structure),
// orange #F26A2B (accent, used sparingly), white. Palette sampled from the real
// crest (public/logos/bhbc-logo.png). Semantic ACWR band colors are status-only,
// never the brand. Load math: src/acwrEngine.js (validated vs the corpus).

import React, { useMemo, useState, useEffect, useCallback, useRef, useLayoutEffect, lazy } from 'react';
import { C, FN, FB, EXPO_ICON_LG_T } from './theme';
import ErrorBoundary from './ErrorBoundary';
import { Card as BaseCard, CollapsibleSection, Btn, Input, Modal, EmptyState, toast as appToast, confirmToast, usePersistentState, useEdgeFade, useRailTrailMask, SegWord, CrossGlyph, PencilGlyph } from './ui';
import { ThemeToggle } from './ThemeToggle';
import { fmtNumericDate } from './dates';
import { useTheme } from './hooks/useTheme';
import { bhbcT, BhbcLangCtx, useT, useHe, setBhbcDateLang, zoneT, countWord, daysFor, overdueFor, dowFor, dowIdxFor, monDayFor, monFor, fxLabelFor } from './bhbcHe';
import { acwrFromDaily, sessionLoad, monotonyStrain } from './acwrEngine';
import { returnToLoadFlags } from './bhbcReturnLoad';
import { applyGameMinutes, gameMinutesOf, gameRpeOf } from './bhbcGameLoad';
import { readinessAutoreg } from './readinessAutoreg';
import BWChart from './BwChart';
import { sessionSig, rowKind, ownsScRow, buildScRow, scPrefillNotes } from './bhbcSession.js';
import { useSupaStore } from './useSupaStore';
import { appendActivity, whenText, peopleSeen } from './bhbcActivity';
import { useFullPlan } from './usePlansStore';
import { LangCtx, BodyLang } from './i18n';
import { isClubAthlete } from './clubAthlete';
import { isOwnerEmail } from './authRoles';

// EXPO's read-only program/portal preview — shown INSIDE the BHBC zone so coaches
// can view an athlete's program here instead of jumping to the EXPO coach app.
const CoachPreviewPortal = lazy(() => import('./CoachPreviewPortal'));

const NAVY = '#1E3D74', NAVY_DEEP = '#14294F', ORANGE = '#F26A2B', ORANGE_DEEP = '#D9541A';
// TODAY's ink and edge (#509): the zone's theme-aware navy - raw NAVY on the
// dark page was near-invisible (the week's "FRI 2", the list's day, the
// microcycle's TODAY).
const TODAY_INK = `var(--bhbc-ha-home, ${NAVY})`;
// EVERY CONFIRMATION IN THE ZONE'S LANGUAGE (#305 N-E8). The zone's toasts
// were English on the Hebrew screen - 'Lift logged' under a Hebrew button.
// One wrapper, so no call site can forget; an untranslated line stays English.
const toast = (msg, ...rest) => appToast(typeof msg === 'string' ? zoneT(msg) : msg, ...rest);
// One ink + one hairline for every control in the header's right-hand cluster
// (theme toggle, Sign out, ‹ EXPO, Preview as coach). They were drifting apart
// — Sign out at 0.7 next to a toggle at 0.85 — which reads as two different
// control families sitting side by side.
// One height for every control in the zone header row. Fixed box + centred
// content, so Hebrew and English sit identically inside it.
const HDR_BTN_H = 36;   // the one control height (24.9); was 28
// One height for an action sitting inside a card ROW (+ Report, View ›,
// UPDATE, MED ✎). They do the same job, so they are the same size.
const ROW_BTN_H = 36;   // the one control height (24.9); was 26
const HDR_INK = 'rgba(255,255,255,0.85)';
const HDR_BD = 'rgba(255,255,255,0.18)';
// Understated dark-navy header bar (EXPO-header feel, not a loud bright-navy block).
const HDR_BG = '#0E1C38';
// Scoped theme override — reskins EXPO's components to BHBC while keeping their
// geometry + light/dark behaviour. Strips go navy (white title text stays legible)
// in both themes; card hairlines get a navy tint blended into the theme border.
// Card header strips = DEEP navy (#14294F) in BOTH themes. Earlier tries were
// wrong at both extremes: bright #1E3D74 read as a loud bar, and falling back
// to the app default made the strip inherit EXPO's cyan (light) / a muddy
// black+orange brown (dark) — both unrelated to the club brand. Deep navy is
// the club identity colour, dark enough that the white strip titles stay
// readable in light mode too, and it's calmer than the old bright blue.
// Orange is the ACTION accent (buttons, left stripes) via the ORANGE constant.
// --c-ac is pinned to the same deep navy so the RefinedHeaderStrip's
// color-mix(stripBg, ac) resolves to pure navy instead of a muddy blend.
// THE ZONE OWNS ITS THEME. Ohad, 17.9: "on bhbc: dark mode doesnt work at all".
// The wrapper was pinned to data-theme="light", so the header's toggle changed
// the APP's theme (root attribute, localStorage, user_metadata) and nothing
// inside the zone moved - a switch that looks broken and quietly edits a
// setting somewhere else. The zone now carries its own light/dark choice,
// defaulting to light so it still OPENS white the way he locked it, and the
// toggle beside the crest flips that and nothing else.
const BhbcTheme = React.createContext('light');
const tokensFor = (theme) => (theme === 'dark' ? {
  ...TOKENS,
  // On a dark page a deep navy strip disappears into the background; the
  // brighter club navy still reads as a bar and keeps white titles legible.
  '--c-ac': NAVY,
  '--c-stripBg': NAVY,
  // The zone's strip stays NAVY in both themes, so it keeps white text even
  // though the app's light theme moved its strip to a pale tint with dark ink
  // (19.9). Without this the zone would inherit #0E0F12 on navy.
  '--c-stripTx': '#FFFFFF',
  // Hairlines have to lift OFF a dark surface, not sink into it.
  '--c-cardBd': 'rgba(126,162,220,0.30)',
  '--c-bd': 'rgba(126,162,220,0.24)',
  // The amber that :root declares for a dark page (the light-page one measured
  // 2.15:1 here, which is why it is pinned at all).
  '--bhbc-amber-text': '#E0A73A',
} : TOKENS);
const TOKENS = {
  '--c-ac': NAVY_DEEP,
  '--c-stripBg': NAVY_DEEP,
  '--c-stripTx': '#FFFFFF',

  // A NAVY HAIRLINE, not a mix with the app's. Mixing 20% navy into --c-bd left
  // EXPO's cyan showing through every card edge in the zone, which is what made
  // the program popup read as an EXPO dialog wearing a club title.
  '--c-cardBd': 'rgba(30,61,116,0.26)',
  '--c-bd': 'rgba(30,61,116,0.22)',
  // THE ZONE IS ALWAYS LIGHT, SO ITS AMBER MUST BE THE LIGHT-BACKGROUND ONE.
  //
  // --bhbc-amber-text is declared twice on :root - #8A6410 for a light page and
  // #E0A73A for a dark one - and the club zone forces white cards regardless of
  // the app's theme. So with EXPO in dark mode the zone picked up the dark-page
  // amber and painted it on white: measured 2.15:1, which is not readable, on
  // every "limited" count and on the overdue flag. Pinned here, where the zone
  // decides its own colours.
  '--bhbc-amber-text': '#8A6410',
};
// EVERY BHBC MODAL CARRIES THE ZONE'S TOKENS.
//
// Modal renders through a PORTAL, so its card mounts on document.body -
// OUTSIDE .bhbc-zone - and none of the zone's CSS variable overrides reach it.
// That is not cosmetic: measured in the injury form, a shared Input's label
// came out rgb(8,102,143) beside rgb(74,82,99) on every label around it,
// because one resolved the zone's --c-tm and the other the app's. Re-declaring
// the tokens on a wrapper inside the card fixes it for all nine at once.
// EVERY MODAL IN THE ZONE WEARS THE CLUB'S COLOURS.
//
// Ohad, on the program popup on production: "this doesnt look anything like a
// bhbc branded page". He was right - a white card with a black title and EXPO's
// cyan hairlines could belong to any product. The zone's own header is navy
// with the crest and an orange rule, so its modals now open with the same bar:
// crest, white title on navy, orange underline. One place, so all nine of them
// change together and none can drift.
const BModal = ({ children, title, ...rest }) => {
  const zoneTheme = React.useContext(BhbcTheme);
  return (
  <Modal
    themeAttr={zoneTheme}
    title={<><img src="/logos/bhbc-logo.png" alt="" style={{ height: 20, width: 'auto', display: 'block' }} />{title}</>}
    // 12px above and below the 36px row (27.9 #348, Ohad: "the blue title at the
    // top is so big for no reason" - it inherited the dialog's 28px top pad, so
    // the bar stood ~100px for one line); the sides stay on the body's edge.
    // Sticky `top` is measured inside the card's 28px padding, so it must be
    // -28 too or the bar parks 16px below the card edge on a white band
    // (28.9 LOOK at 1440); phones use themes.css' -16 override.
    headerStyle={{ background: NAVY, borderBottom: `3px solid ${ORANGE}`, color: '#fff', paddingTop: 12, paddingBottom: 12, marginTop: -28, top: -28 }}
    // ONE ROW at every width (26.9): long titles carry their lead words in
    // .bm-lead, which steps aside on a phone (themes.css) - nothing is cut.
    titleStyle={{ color: '#fff', whiteSpace: 'nowrap' }}
    closeStyle={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.35)', color: '#fff' }}
    {...rest}
  ><div style={tokensFor(zoneTheme)}>{children}</div></Modal>
  );
};
// EVERY BOX IN THE ZONE COLLAPSES. Ohad: "make sure i can collapse all the
// boxes in bhbc". Done here rather than at nineteen call sites, so no card can
// be added later that forgets to: this IS `Card` inside the club zone.
//
// The strip is the handle, which is the pattern the rest of the app already
// uses, and the state is remembered per box so a physio who keeps Medical open
// and the rest shut finds it that way tomorrow. A card with no header strip has
// no handle, so it is left alone.
const cardKey = (header) => {
  if (typeof header === 'string') return header;
  const s = header && header.props && header.props.s;
  return typeof s === 'string' ? s : '';
};
// AN ACTION IN ITS OWN CARD'S STRIP (29.9 #396, Ohad: "i don't need the manage
// roster, log lift, log sc session to be appearing on all the screens. they
// need to appear where they fit"). The COPY button's build: 26px, light on the
// navy strip. A click never toggles the card (the strip ignores controls).
function StripBtn({ onClick, children, title }) {
  return (
    <button type="button" onClick={onClick} title={title} className="bhbc-strip-btn"
      style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--c-stripTx)', background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.3)', height: 'var(--btn-h-in, 26px)', minHeight: 0, boxSizing: 'border-box', padding: '0 10px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, cursor: 'pointer', borderRadius: 0, whiteSpace: 'nowrap', flexShrink: 0 }}>
      {children}
    </button>
  );
}

// A CARD THAT OPENS AND CLOSES, EASED (29.9 #423, Ohad: "add effects anywhere
// ... like collapse and expand"). The zone's cards snapped - {open ? children :
// null} - while CollapsibleSection everywhere else eased its rows. Now the body
// eases its rows 0fr <-> 1fr and stays mounted only while it moves, so a closed
// card still renders nothing (#422). BaseCard draws a closed card differently
// (the strip bleeds to the bottom edge), which sits 2 x padding + 12px higher
// than an open card with an empty body (measured on a 0 and a 14 card); the wrapper's bottom margin eases to exactly
// that, so the moment the body unmounts lands on the same pixel - no jump.
const CARD_MS = 240;
function useEasedPresence(open) {
  const [present, setPresent] = useState(open);
  const [shown, setShown] = useState(open);
  const [settled, setSettled] = useState(open);
  useEffect(() => {
    if (open) {
      setPresent(true); setSettled(false);
      let r2 = 0;
      const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setShown(true)); });
      const t = setTimeout(() => setSettled(true), CARD_MS + 40);
      return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); clearTimeout(t); };
    }
    setSettled(false); setShown(false);
    // +60: the transition's last frame lands after its nominal end on a big card
    const t = setTimeout(() => setPresent(false), CARD_MS + 60);
    return () => clearTimeout(t);
  }, [open]);
  return { present, shown, settled };
}
function Card({ header, headerRight, children, ...rest }) {
  const key = cardKey(header);
  const [open, setOpen] = usePersistentState('bhbc-open-' + (key || 'card'), true);
  const { present, shown, settled } = useEasedPresence(open);
  if (!header || !key) return <BaseCard header={header} headerRight={headerRight} {...rest}>{children}</BaseCard>;
  return (
    <BaseCard
      header={header}
      onHeaderClick={() => setOpen((v) => !v)}
      headerAriaExpanded={open}
      bodyShown={shown}
      bodyMs={CARD_MS}
      headerRight={headerRight}
      headerFixed={(
        <>
          {/* The chevron STATES the state; the whole strip is the target. An
              SVG, not a glyph: Nord renders U+25BE as a faint dash, which read
              as a stray hyphen at the end of the strip rather than a control. */}
          <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
            style={{ flexShrink: 0, transform: open ? 'none' : 'rotate(-90deg)', transition: 'transform .12s' }}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </>
      )}
      {...rest}
    >{present ? (
      <div data-card-body="" data-shown={shown ? '1' : '0'} style={{ display: 'grid', gridTemplateRows: shown ? '1fr' : '0fr', transition: `grid-template-rows ${CARD_MS}ms ease` }}>
        {/* clipped only while it moves, so a menu inside an open card is never cut */}
        <div style={{ minHeight: 0, overflow: settled ? 'visible' : 'hidden' }} inert={shown ? undefined : ''}>{children}</div>
      </div>
    ) : null}</BaseCard>
  );
}

// AN RTP TARGET THAT HAS PASSED IS NOT A PLAN ANY MORE.
//
// The board printed "Limited · RTP 26 Aug" in the same ink as a future date,
// eleven days after that date, for an athlete still limited. A return-to-play
// target the squad has sailed past is the single thing on a medical board that
// should catch a physio's eye, and it was the quietest thing on it.
//
// Only for someone still limited or out and not resolved: a target in the past
// for an athlete who is back is simply history.

const BAND = { detrained: '#4F9DE0', low: '#37B27C', elevated: '#E0A73A', high: '#DE4E3B', none: '#7C828B' };
// ONE section-title treatment everywhere (must match CollapsibleSection's title:
// FN / 13 / 700 / 0.08em / uppercase / white). Card headers are plain strings by
// default, so pass them through this to keep every strip title identical.
// Every card title in the zone goes through here, which makes it the one place
// Hebrew has to be applied for all fourteen of them. It returns a COMPONENT
// rather than a plain span so it can read the language from context — a
// module-level helper cannot call a hook, and translating at fourteen call
// sites instead would guarantee one gets missed.
function SecTitleEl({ s }) {
  const tr = useT();
  return <span style={{ fontFamily: FN, fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--c-stripTx)', whiteSpace: 'nowrap' }}>{typeof s === 'string' ? tr(s) : s}</span>;
}
const secTitle = (s) => <SecTitleEl s={s} />;

// ONE MONTH/WEEK ARROW for the zone (27.9 #355, Ohad: "the left and right
// arrows are huge buttons for no reason"): a bare chevron in a 32px tap area,
// no box - the month between them is what reads. Was three sizes: 24x26 boxes
// (attendance), 36x36 boxes (lifts) and input-sized boxes (week planner).
const navArrow = (off) => ({ fontFamily: FN, fontSize: 16, fontWeight: 700, lineHeight: 1, color: off ? C.cardBd : C.tm, background: 'transparent', border: 'none', borderRadius: 0, height: 32, width: 28, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: off ? 'default' : 'pointer' });

// A PLAYER'S NAME IS ONE ROW (27.9 #300, title gate: a two-word name broke
// onto two lines in a 138px phone column and a 123px tablet one). The full
// name where it fits, the initial + surname where it would not - same size,
// no cut.
const initialName = (n) => { const p = String(n || '').trim().split(/\s+/); return p.length > 1 ? `${p[0][0]}. ${p.slice(1).join(' ')}` : String(n || ''); };
function PlayerName({ name, style, ...rest }) {
  return <span {...rest} style={{ display: 'flex', minWidth: 0, whiteSpace: 'nowrap', ...style }}><SegWord full={name} short={initialName(name)} /></span>;
}

// LOCAL calendar date, not UTC. toISOString() is UTC, so between 00:00 and
// 03:00 Israel time it returns YESTERDAY — "Today" would show the wrong day and
// a late-night session/availability write would land on the previous date
// (audit 08-22). Same convention as MealLogger/ChallengesView/BookingPublic.
const localISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// the ISRAEL day of a stored timestamp - slicing the ISO string gives the UTC
// day, one day early for anything saved between 00:00 and 03:00 (27.9 review)
const localDayOf = (ts) => { if (!ts) return ''; const d = new Date(ts); return Number.isNaN(d.getTime()) ? String(ts).slice(0, 10) : localISO(d); };
const todayISO = () => localISO(new Date());
const daysAgoISO = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return localISO(d); };
// Nationality as text (flag emoji doesn't render on Windows Chrome → shows "US"
// letters at a wrong baseline and breaks row alignment).
// dual nationality as ISR/USA: one short token that fits a card footer on one
// row (27.9: "ISR · USA" wrapped the roster footer onto two lines)
const flag = (nat) => String(nat || '').split('/').map((c) => c.trim()).filter(Boolean).join('/');
const heightM = (cm) => (cm ? (cm / 100).toFixed(2) + 'm' : '');
// `availability` is a DAY-level fact (medical / personal — it gates ACWR and
// feeds the medical view). `attendance` is per SLOT, keyed `YYYY-MM-DD|HH:MM`,
// because a player can miss the morning practice and train in the evening —
// which the day-level flag could not express at all (Ohad 08-24).
const emptyRec = () => ({ loads: {}, sessions: {}, readiness: {}, availability: {}, attendance: {} });
// WHAT A LOGGED ROW IS — read in ONE place. Ohad, 24.9: "sc session for the
// team before practice, and lifts, are combined or messed up". They were: the
// readers each had their own regex on `type`, and a lift counted as court
// attendance in one card while a team S&C block counted as a lift in another.
//
//   sc        the team S&C block logged WITH a practice: team:true, minutes,
//             carries the practice slot's `start`. Never a load, never an RPE.
//   lift      one athlete's own lift, any day, with or without a practice.
//             team:false. Never team, never attached to a practice.
//   practice  court attendance (Practice / Shootaround) — no duration.
//   game      a game (minutes played).
//   other     anything else (Travel, an unknown label).
//
// Rows written from 24.9 carry `kind`. Older rows carry only the free-text
// `type` a select produced, so the legacy reading is spelled out here and
// nowhere else: Conditioning/Recovery were his S&C blocks; a Lift WITH
// team:true was a team session mis-logged as a lift (29 rows, 23.8–1.9); a
// row with no type at all was gym attendance, i.e. a personal lift.
// THE LIFTS GRID (29.9 #400 #414): due = MORE than five days without a lift;
// the name and last-lift columns, pinned at the two edges of a grid that
// scrolls (only the days move). The row paints its own background under a
// pinned cell, so it covers the days sliding beneath it.
const LIFT_DUE_DAYS = 6;
const LIFTS_NAME_W = 186;
const LIFTS_LAST_W = 150;
const pinStart = (bg) => ({ position: 'sticky', insetInlineStart: 0, zIndex: 1, background: bg, marginInlineStart: -14, paddingInlineStart: 14 });
const pinEnd = (bg) => ({ position: 'sticky', insetInlineEnd: 0, zIndex: 1, background: bg, marginInlineEnd: -14, paddingInlineEnd: 14 });

// THE MONTH GRIDS ARE ONE GRID (#509, Ohad 2.10: "the tables in ... lifts are
// very bad"). Lifts and Practice Attendance drew only the days that had
// happened, each column minmax(24px, 1fr) - so on the 2nd of a month two day
// columns split ~800px and a lift box sat alone in a 400px cell. Now both draw
// the WHOLE month at one column width (a sheet's month, the thing he reads
// them against), the days still ahead quiet and empty; one 36px row; the name
// and the end column pinned while the days scroll; and on a phone the grid
// opens scrolled to today instead of to the 1st.
const monthDays = (today, monthOff) => {
  const base = parseISO(today);
  const anchor = new Date(base.getFullYear(), base.getMonth() + monthOff, 1);
  const out = [];
  const m = anchor.getMonth();
  for (let d = new Date(anchor); d.getMonth() === m; d.setDate(d.getDate() + 1)) {
    const iso = localISO(d);
    out.push({ iso, dom: d.getDate(), dow: d.getDay(), future: iso > today });
  }
  return { list: out, label: `${monFor(anchor.getMonth(), MON[anchor.getMonth()])} ${anchor.getFullYear()}` };
};
const FUTURE_BG = 'color-mix(in srgb, var(--c-cardBd) 18%, transparent)';
const dayHeadInk = (d, today) => (d.iso === today ? ORANGE_DEEP : d.future || d.dow === 6 || d.dow === 5 ? C.cardBd : C.tm);
// today in view on a narrow screen: the scroller moves so today's column sits
// at the inner edge of the days (works in both directions - it moves by the
// measured overshoot, never by an absolute scrollLeft, which RTL inverts)
function useScrollToToday(ref, key) {
  useLayoutEffect(() => {
    const el = ref.current; if (!el || el.scrollWidth <= el.clientWidth + 1) return;
    const cell = el.querySelector('[data-today-col]'); if (!cell) return;
    const box = el.getBoundingClientRect(); const c = cell.getBoundingClientRect();
    const rtl = getComputedStyle(el).direction === 'rtl';
    const delta = rtl ? c.left - box.left - 24 : c.right - box.right + 24;
    if ((rtl && delta < 0) || (!rtl && delta > 0)) el.scrollLeft += delta;
  }, [ref, key]);
}

// Availability codes (Ohad's BHBC sheet legend). Semantic status colors.
// 'Out · Pers' rather than 'Out · Personal': the long label made ONE button in
// the column 168px against 135px for every other state, and Ohad wants a single
// button size. 'Non-contact' is the width driver now, and both OUT states keep
// the word OUT so the reason still reads at a glance.
const AVAIL = {
  1: { label: 'Full', color: '#37B27C' },
  2: { label: 'Limited', color: '#E0A73A' },
  3: { label: 'Non-contact', color: '#4F9DE0' },
  4: { label: 'Out · Med', color: '#DE4E3B' },
  5: { label: 'Out · Pers', color: '#7C828B' },
};

// THE ONE AVAILABILITY CONTROL (29.9 #410 + #409, Ohad: "the dropdown is not
// working perfectly, research on expo tasks how you did it perfectly and apply
// the system of dropdown everywhere" / "full - status change it to the same
// built"). EXPO Tasks' status pill is a NATIVE <select> dressed as the control:
// the browser opens, positions, scrolls and closes it, onChange always fires,
// and the keyboard works - the custom popover it replaced jumped and swallowed
// clicks, and so did ours. Same here: the underlined status entry (his rule: an
// entry is underlined, an action is a box), the status dot and the app's chevron
// are drawn around a real <select>. Options under the medical floor are disabled
// (the medical record owns them). Every event stops at the control, so a pick
// never also opens the row or the card behind it.
function AvailSelect({ avail, floor = 1, onPick, readOnly = false, minWidth = 132 }) {
  const tr = useT();
  const av = AVAIL[avail] || AVAIL[1];
  const box = { position: 'relative', display: 'inline-flex', alignItems: 'center', minWidth, height: 'var(--btn-h)', boxSizing: 'border-box', borderBottom: `2px solid ${avail > 1 ? av.color : C.cardBd}` };
  const txt = { fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.tx, whiteSpace: 'nowrap' };
  const dot = <span aria-hidden="true" style={{ position: 'absolute', insetInlineStart: 2, top: '50%', width: 7, height: 7, marginTop: -3.5, borderRadius: '50%', background: av.color, pointerEvents: 'none' }} />;
  if (readOnly || !onPick) {
    return <span data-avail="" style={{ ...box, ...txt, gap: 7, padding: '0 2px' }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: av.color, flexShrink: 0 }} />{tr(av.label)}</span>;
  }
  const stop = (e) => e.stopPropagation();
  const floorTitle = `${tr(AVAIL[floor].label)} ${tr('comes from the medical record. Open Medical to change it — an injured athlete can still be Limited.')}`;
  return (
    <span data-avail="" style={box} onClick={stop} onMouseDown={stop} onPointerDown={stop} onKeyDown={stop}>
      {dot}
      <select className="avail-select" data-no-autofocus="" value={avail} aria-label={tr('Change availability')} title={floor > 1 ? floorTitle : tr('Change availability')}
        onChange={(e) => onPick(Number(e.target.value))} onClick={stop} onMouseDown={stop} onKeyDown={stop}
        style={{ ...txt, textAlign: 'start', textAlignLast: 'start', width: '100%', height: '100%', minHeight: 0, boxSizing: 'border-box', margin: 0, paddingBlock: 0, paddingInlineStart: 16, paddingInlineEnd: 18, background: 'transparent', border: 'none', borderRadius: 0, outlineOffset: 2, cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none' }}>
        {[1, 2, 3, 4, 5].map((code) => (
          <option key={code} value={code} disabled={code < floor}>{tr(AVAIL[code].label)}</option>
        ))}
      </select>
      <svg aria-hidden="true" viewBox="0 0 9 6" fill="none" width="9" height="6" style={{ position: 'absolute', insetInlineEnd: 2, top: '50%', marginTop: -3, color: C.tm, pointerEvents: 'none' }}><path d="M1 1l3.5 3.5L8 1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </span>
  );
}


const DENSITY_BANDS = [
  { max: 20, key: 'Low Intensity', color: '#37B27C' },
  { max: 25, key: 'Moderate Intensity', color: '#4F9DE0' },
  { max: 30, key: 'High Intensity', color: 'var(--bhbc-amber-text, #E0A73A)' },
  { max: Infinity, key: 'Very High Intensity', color: '#DE4E3B' },
];
const densityOf = (fx) => {
  const min = Number(fx && fx.minutes) || 0;
  const con = Number(fx && fx.contactMin) || 0;
  if (!min || !con) return null;
  const pct = (con / min) * 100;
  const band = DENSITY_BANDS.find((b) => pct < b.max) || DENSITY_BANDS[DENSITY_BANDS.length - 1];
  const highVolume = min > 90;
  const highIntensity = pct >= 25;
  const quadrant = highIntensity ? (highVolume ? 'Q4' : 'Q3') : (highVolume ? 'Q2' : 'Q1');
  return { pct, band, highVolume, highIntensity, quadrant };
};
const QUAD_MEANING = {
  Q1: 'Low volume & low intensity', Q2: 'High volume & low intensity',
  Q3: 'Low volume & high intensity', Q4: 'High volume & high intensity',
};
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const parseISO = (iso) => new Date(String(iso) + 'T00:00:00');
// EVERY NUMERIC DATE IS DAY/MONTH (27.9, Ohad: "make sure all the dates
// everywhere are day/month/year (dd/mm)"). "2026-09-25" -> "25/09".
const ddmm = (iso) => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}` : String(iso || ''); };
const dow = (iso) => { const d = parseISO(iso); return dowFor(d, DOW[d.getDay()]); };
const monDay = (iso) => { const d = parseISO(iso); return monDayFor(d, `${d.getDate()} ${MON[d.getMonth()]}`); };
const dayDiff = (a, b) => Math.round((parseISO(a) - parseISO(b)) / 86400000);
const FX_COLOR = { game: ORANGE, practice: '#4E7FCB', lift: '#6C7A93', scrimmage: '#C7692A', shootaround: '#5E9BD6' };
const FX_LABEL = { game: 'Game', practice: 'Practice', lift: 'Weights', scrimmage: 'Scrimmage', shootaround: 'Shootaround' };
// The month cell's short form when the full word does not fit its column
// (tablet widths, 29.9 #380): same size, shorter word - never a clipped word.
const FX_LABEL_SHORT = { game: 'Game', practice: 'Prac', lift: 'Lift', scrimmage: 'Scrim', shootaround: 'Shoot' };
// The team S&C block's own colour in the grids (teal - not the lift slate, not
// the practice blue, not a restriction tint).
const SC_COLOR = '#2A9D8F';
// ONE CELL, ONE BOX (27.9, Ohad: "the design is horrible when there's multiple
// signals in one box" / "the numbers inside the boxes are not helpful at all").
// Every mark in a grid cell is the same 16px square: one thing fills it, two or
// three share it as equal horizontal bands (practice / S&C / lift). An outline
// is a session that was owed and not done. No numbers inside - the detail is in
// the tooltip and the athlete's popup.
function CellMarks({ bands = [], outline = null, label }) {
  if (!bands.length && !outline) return null;
  return (
    <span aria-label={label} style={{ width: 16, height: 16, boxSizing: 'border-box', display: 'inline-flex', flexDirection: 'column', gap: 1, border: outline ? `1.5px solid ${outline}` : 'none', background: bands.length > 1 ? 'var(--c-sf)' : 'transparent' }}>
      {bands.map((c, i) => <span key={i} style={{ flex: 1, background: c }} />)}
    </span>
  );
}

// AN ACTION INSIDE A ROW IS A SEGMENT OF THE ROW (2.10 #509, Ohad: "a lot more
// buttons inside cells that are designed bad all around bhbc. work it out once
// a for all"). Measured on the branch before this: S&C and CANCEL drew 22px
// faces inside 26px buttons inside a 36px chip, schedule-list chips were 28,
// week chips 39, the MD tags 16 - five heights for one idea, and every one a
// box inside a box. Now an action inside a bordered row takes the row's whole
// height, is split from what precedes it by one hairline, and draws no box of
// its own: the row is the box. Fixed widths come from the caller (--sc-w).
const segBtn = (ink = C.tm, extra = null) => ({ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, alignSelf: 'stretch', flexShrink: 0, height: 'auto', minHeight: 0, margin: 0, padding: '0 12px', boxSizing: 'border-box', border: 'none', borderInlineStart: `1px solid ${C.cardBd}`, borderRadius: 0, background: 'transparent', color: ink, fontFamily: FN, fontSize: 10, fontWeight: 700, lineHeight: 1, letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap', cursor: 'pointer', ...extra });

// ONE SESSION CHIP for the whole zone (#509): the planner, the schedule list,
// today's sessions. 36px, the session's colour as its border, time - kind -
// minutes on one line, actions (segBtn) at its end. `stacked` (a narrow
// column) puts the actions on a second row of equal segments under a hairline.
// The venue is never inside it: it is the line that broke a chip to 54px.
function EventChip({ f, time = null, actions = null, stacked = false, className = '', ...rest }) {
  const tr = useT();
  const off = isCancelled(f);
  const col = FX_COLOR[f.type] || NAVY;
  const info = (
    <span className="bhbc-chip-info" style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '0 9px', minWidth: 0, flex: '1 1 auto', height: stacked ? 'calc(var(--btn-h) - 2px)' : undefined }}>
      <span className="bhbc-chip-meta" style={{ fontFamily: FN, fontSize: 12, fontWeight: 700, color: col, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{time != null ? time : f.start}</span>
      <span className={'bhbc-chip-meta bhbc-kind-' + String(f.type || '').toLowerCase()} style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.tm, whiteSpace: 'nowrap', minWidth: 0 }}>{fxLabelFor(f.type, FX_LABEL[f.type] || 'Session')}</span>
      {Number(f.minutes) > 0 && <span className="bhbc-chip-meta" style={{ fontFamily: FN, fontSize: 11, color: C.td, whiteSpace: 'nowrap' }}><MinTok n={f.minutes} /></span>}
      {f.optional && <span className="bhbc-chip-meta" style={{ fontFamily: FN, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.tm, whiteSpace: 'nowrap' }}>· {tr('optional')}</span>}
      {off && <span className="fx-cancelled-tag" style={{ fontFamily: FN, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.10em', textTransform: 'uppercase', color: C.tm, whiteSpace: 'nowrap', textDecoration: 'none' }}>{tr('Cancelled')}</span>}
    </span>
  );
  return (
    <div {...rest} className={'bhbc-chip' + (off ? ' fx-cancelled' : '') + (stacked ? ' bhbc-chip-stacked' : '') + (className ? ' ' + className : '')} data-fx-cancelled={off ? '' : undefined}
      style={{ display: 'flex', flexDirection: stacked ? 'column' : 'row', alignItems: 'stretch', minWidth: 0, height: stacked ? 'auto' : 'var(--btn-h)', boxSizing: 'border-box', border: `1px ${off ? 'dashed' : 'solid'} ${off ? C.cardBd : col}`, background: 'var(--c-sf)' }}>
      {info}
      {actions && (stacked
        ? <span className="bhbc-chip-acts" style={{ display: 'flex', alignItems: 'stretch', height: 'calc(var(--btn-h) - 2px)', borderTop: `1px solid ${C.cardBd}` }}>{actions}</span>
        : actions)}
    </div>
  );
}
// "vs Rishon LeZion · HaYovel" / "vs Hapoel Eilat · Begin Arena, Eilat" - the
// line under a game or scrimmage chip. Empty for a session with no opponent.
const fxWhere = (f) => {
  if (!f || (f.type !== 'game' && f.type !== 'scrimmage')) return f && f.location ? f.location : '';
  const parts = [];
  if (f.opponent) parts.push(zoneT('vs') + ' ' + f.opponent);
  if (f.venue) parts.push(f.venue); else if (f.home === true) parts.push(zoneT('HaYovel, Herzliya'));
  return parts.join(' · ');
};

// ---- primitives ----

// A DURATION IS ONE TOKEN (#305 E4). "120 min" where there is room, "120′" on
// a phone (themes.css .min-unit / .min-tick), and the number and its unit never
// part at a line break. Nothing at all when no minutes were given - a slot with
// no length used to print a bare "min".
function MinTok({ n }) {
  const tr = useT();
  if (!(Number(n) > 0)) return null;
  return <span style={{ whiteSpace: 'nowrap' }}>{n}<span className="min-unit">{' ' + tr('min')}</span><span className="min-tick">′</span></span>;
}

// WAS THE TEAM S&C LOGGED FOR THIS PRACTICE? (#305 G1 / L2). Read off the
// athletes' own rows, the same way Past practices reads them: a row carrying
// this slot's start, or - for rows written before per-slot logging - a row
// with no start on the day's first practice. Returns the block's minutes, or
// null when nothing was logged. Never guessed.
const COURT_PRACTICE = ['practice', 'shootaround', 'scrimmage'];
// A CANCELLED SESSION (29.9 #398, Ohad: "allow me to cancel a basketball
// workout, for example this morning session got cancelled"). It stays on the
// calendar, struck through, so the week still reads true - and it never counts:
// not attendance, not the S&C slot, not the 7-day tile, not the staff brief,
// not the week's session count. The flag lives on the fixture row; the calendar
// sync keeps unknown fields on a row it matches (date + type + start), so the
// next sync does not bring it back. A moved start time is a new session.
const isCancelled = (f) => !!(f && f.cancelled);
function scLoggedFor(loads, athleteIds, f, fixtures) {
  if (!f || isCancelled(f) || !COURT_PRACTICE.includes(String(f.type || '').toLowerCase())) return null;
  const first = (fixtures || []).filter((x) => x && !isCancelled(x) && x.date === f.date && COURT_PRACTICE.includes(String(x.type || '').toLowerCase()))
    .map((x) => String(x.start || '')).sort()[0];
  for (const id of athleteIds || []) {
    for (const r of ((((loads || {})[id] || {}).sessions || {})[f.date] || [])) {
      if (!r || rowKind(r) !== 'sc' || !(Number(r.min) > 0)) continue;
      const mine = r.start ? r.start === String(f.start || '') : first === String(f.start || '');
      if (mine) return { min: Number(r.min) };
    }
  }
  return null;
}

function Sparkline({ series, w = 100, h = 26, color = ORANGE }) {
  const vals = (series || []).map((v) => v || 0);
  const n = vals.length; const max = Math.max(1, ...vals);
  if (!n) return <div style={{ width: w, height: h }} />;
  // No load yet → a faint baseline, not a solid line that reads as an error.
  if (!vals.some((v) => v > 0)) return (
    <svg width={w} height={h} style={{ display: 'block' }} aria-hidden="true">
      <line x1="0" y1={h - 3} x2={w} y2={h - 3} stroke="currentColor" strokeWidth="1" strokeDasharray="2 3" opacity="0.28" />
    </svg>
  );
  const step = n > 1 ? w / (n - 1) : 0;
  const pts = vals.map((v, i) => [i * step, h - (v / max) * (h - 4) - 2]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const last = pts[n - 1];
  return (
    <svg width={w} height={h} style={{ display: 'block' }} aria-hidden="true">
      <path d={`${line} L${w},${h} L0,${h} Z`} fill={color} opacity="0.12" />
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="2.3" fill={color} />
    </svg>
  );
}

function BandPill({ band, value }) {
  const c = band.color;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: FN, fontSize: 11, fontWeight: 700,
      letterSpacing: '0.03em', color: c, background: `color-mix(in srgb, ${c} 13%, transparent)`,
      border: `1px solid color-mix(in srgb, ${c} 38%, transparent)`, borderRadius: 0, padding: '3px 8px', whiteSpace: 'nowrap', lineHeight: 1,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: c, flexShrink: 0 }} />
      {value != null && <span style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</span>}
      {band.label}
    </span>
  );
}

const Jersey = ({ n, size = 30 }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: size, height: size,
    background: NAVY, color: 'var(--c-stripTx)', fontFamily: FN, fontWeight: 800, fontSize: size * 0.42,
    fontVariantNumeric: 'tabular-nums', flexShrink: 0,
  }}>{n ?? '–'}</span>
);

// ONE SORT FOR EVERY TABLE IN THE ZONE (27.9, Ohad: "All tables on bhbc needs
// to be sorted by each columns and clickable. Make it perfect"). Player stats
// was the only table that sorted, and it could not sort by name; every other
// table in the zone had headers that did nothing. One hook and one header cell,
// so every table answers a tap the same way:
//   - tap a header = sort by it, tap it again = the other direction;
//   - the FIRST tap is the useful end: names and jersey numbers A->Z / 1->99
//     (a column spec of { get, asc: true }), everything else high->low - the
//     newest date, the worst status, the biggest number (a plain getter);
//   - a row with no value for the column sorts LAST in both directions (a
//     dash at the top of a list answers nobody's question);
//   - ties keep the order the rows arrived in, so a table sorts the same way
//     on every tap and the untouched order (worst-first on the board) is the
//     tie-break.
const sortSpec = (s) => (typeof s === 'function' ? { get: s, asc: false } : s);
const blankSortVal = (v) => v == null || v === '' || (typeof v === 'number' && Number.isNaN(v));
function sortRowsBy(rows, spec, dir) {
  const s = sortSpec(spec);
  return rows.map((r, i) => ({ r, i, v: s.get(r) })).sort((a, b) => {
    const an = blankSortVal(a.v), bn = blankSortVal(b.v);
    if (an || bn) return an && bn ? a.i - b.i : an ? 1 : -1;
    const d = typeof a.v === 'string' && typeof b.v === 'string'
      ? a.v.localeCompare(b.v, undefined, { numeric: true, sensitivity: 'base' })
      : a.v - b.v;
    return (dir === 'asc' ? d : -d) || a.i - b.i;
  }).map((x) => x.r);
}
// `cols` maps a column key to its spec. defaultKey null = keep the rows in the
// order they came in (the load board's worst-first) until a header is tapped.
// A key that stops existing (last month's day) falls back to that order too.
// the zone's table cells (#340): one header band, one row height, numbers end-aligned
const BHBC_TH = { fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.tm, height: 36, padding: '0 12px', background: 'var(--c-sf2)', borderBottom: `1px solid ${C.cardBd}`, whiteSpace: 'nowrap', verticalAlign: 'middle' };
const BHBC_TD = { fontFamily: FN, fontSize: 13, height: 40, padding: '0 12px', textAlign: 'end', fontVariantNumeric: 'tabular-nums', verticalAlign: 'middle', borderBottom: '1px solid color-mix(in srgb, var(--c-cardBd) 65%, transparent)' };
const BHBC_TD_SORTED = { background: `color-mix(in srgb, ${ORANGE} 6%, transparent)`, fontWeight: 800 };
function useSort(rows, cols, defaultKey = null, defaultDir = null) {
  const firstDir = (k) => (k && cols[k] && sortSpec(cols[k]).asc ? 'asc' : 'desc');
  const [st, setSt] = useState(() => ({ key: defaultKey, dir: defaultDir || firstDir(defaultKey) }));
  const spec = st.key ? cols[st.key] : null;
  const list = rows || [];
  return {
    rows: spec ? sortRowsBy(list, spec, st.dir) : list,
    key: spec ? st.key : null,
    dir: st.dir,
    toggle: (k) => setSt((p) => (p.key === k ? { key: k, dir: p.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: firstDir(k) })),
  };
}
// The header cell. It keeps the table's OWN header style (passed in) and adds
// only the accent colour and the arrow. The arrow's slot is always there -
// hidden until the column is active - so tapping a header never changes its
// width and never moves a column. A CENTRED header (and a day column of the
// month grids, `float`) hangs its arrow just past the word without taking any
// width at all instead: a reserved slot would push the word off the column's
// centre - and in a 22px day column, off its own column.
function SortHeader({ k, sort, label, as: Tag = 'div', style, center = false, float = false, title, aLabel, ...rest }) {
  const tr = useT();
  const on = sort.key === k;
  const glyph = on && sort.dir === 'asc' ? '↑' : '↓';
  const go = () => sort.toggle(k);
  const hang = float || center;
  const slot = { display: 'inline-block', width: '0.8em', textAlign: 'center', letterSpacing: 0, visibility: on ? 'visible' : 'hidden' };
  return (
    // aria-sort belongs to a real column header: only the <th> form carries
    // it; outside a table the button says its own state (27.9 review)
    <Tag {...rest} aria-sort={Tag === 'th' ? (on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none') : undefined}
      onClick={go} title={title || (on ? tr(sort.dir === 'asc' ? 'Sort descending' : 'Sort ascending') : `${tr('Sort by')} ${label}`)}
      style={{ ...style, ...(on ? { color: ORANGE_DEEP } : null), cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
      <span role="button" tabIndex={0} aria-label={Tag === 'th' ? (aLabel || undefined) : `${aLabel || label}${on ? ` · ${tr(sort.dir === 'asc' ? 'Sort ascending' : 'Sort descending')}` : ''}`}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }}
        style={hang ? { position: 'relative' } : undefined}>
        {label}
        {/* 0.7em hung: inside the cell's own 9-10px padding, so it never
            reaches the next column's word or past the table's edge */}
        <span aria-hidden="true" style={hang ? { ...slot, width: '0.7em', position: 'absolute', insetInlineStart: '100%', top: 0 } : { ...slot, marginInlineStart: '0.2em' }}>{glyph}</span>
      </span>
    </Tag>
  );
}
// A PHONE HAS NO HEADER ROW on the load board and the injury board - their
// rows restack below 620 / 760 and a column header would line up with nothing
// (themes.css hides .bhbc-load-head / .bhbc-inj-head). The same headers, in the
// same type, as one row of taps above the list instead, so the phone sorts too.
function SortBar({ sort, cols, className, style }) {
  return (
    <div className={`bhbc-sortbar ${className || ''}`} style={{ flexWrap: 'wrap', columnGap: 16, rowGap: 6, ...style }}>
      {cols.map(([k, label]) => <SortHeader key={k} k={k} sort={sort} label={label} />)}
    </div>
  );
}

// ---- component ----

export default function BhbcView({ trainees = [], setTrainees, bhbcLoads = {}, setBhbcLoads, bhbcFixtures = [], setBhbcFixtures, league = {}, medical = {}, setMedical, planIndex = [], exercises = [], clientWorkouts = [], portalVis = {}, bwLog = [], weeklyFocus = {}, onOpenTrainee, onExit, coach = false, onSignOut, canMedical = true, canLogLoad = false, currentUser = '', onLocalWrite, stale = false }) {
  // The club zone OPENS WHITE, always (Ohad). The crest and the navy/orange
  // palette were built on white, and a coach arriving in whatever theme the
  // last session left behind saw a different club. Forced once on mount, not
  // on every render — the toggle in the header still works, so a coach who
  // deliberately switches to dark inside the zone keeps it for the session.
  // Hebrew for the zone. The club's coaches are Israeli; the S&C zone was
  // English-only. Persisted per person, defaults to English so nothing moves
  // for anyone who does not ask for it.
  const [bhbcLang, setBhbcLang] = usePersistentState('bhbc-lang', 'en');
  // The zone's OWN light/dark, persisted per person. Defaults to light so the
  // club still opens white; the toggle in the header moves this and never the
  // app's theme (see BhbcTheme above).
  const [bhbcTheme, setBhbcTheme] = usePersistentState('bhbc-theme', 'light');
  // The activity trail is read and written HERE, not in App: this component
  // only ever mounts inside the club zone, so no athlete seat carries the read.
  const [activity, setActivity] = useSupaStore('expo-bhbc-activity', []);
  const zoneDark = bhbcTheme === 'dark';
  const he = bhbcLang === 'he';
  setBhbcDateLang(bhbcLang);
  const tr = React.useCallback((str) => bhbcT(bhbcLang, str), [bhbcLang]);
  // The zone is light BY DESIGN (white -> blue -> orange, locked 08-16), but
  // that is a property of the ZONE, not of the app. It used to call
  // setTheme('light') on mount, and setTheme writes the root attribute,
  // localStorage AND user_metadata.theme_pref - so opening BHBC converted his
  // saved theme to light everywhere, and going back to the Dashboard showed
  // light. The wrapper carries data-theme="light" now: same look, and the
  // choice he made for EXPO is left alone.

  // Broadcast a change to other open zones after any local write (shared-sheet sync).
  const notify = useCallback(() => { if (onLocalWrite) onLocalWrite(); }, [onLocalWrite]);
  // WHO WORKS IN HERE, AND WHAT THEY TOUCHED. Ohad's owner-only ACTIVITY tab.
  // One line per action, stamped with the moment it happened (not with the date
  // of the session being typed up) and with the person who did it.
  const track = useCallback((kind, what) => {
    if (!setActivity) return;
    setActivity((prev) => appendActivity(prev, { by: currentUser || null, kind, what }));
  }, [setActivity, currentUser]);
  const trackRef = React.useRef(track); trackRef.current = track;
  useEffect(() => { trackRef.current('open', 'opened the club zone'); }, []);
  const [manageOpen, setManageOpen] = useState(false);
  const [newAthlete, setNewAthlete] = useState('');
  // Which already-landed athlete has had their date re-opened for editing in
  // Manage roster. Null = none; a past date shows as one muted word until it is
  // clicked (see the LANDS block).
  const [editArrival, setEditArrival] = useState(null);
  const [logFor, setLogFor] = useState(null);
  const [detailFor, setDetailFor] = useState(null);
  // a lift logged FROM an athlete's popup returns to that popup (#305 A4)
  const [liftReturn, setLiftReturn] = useState(null);
  // The staff brief's COPY, now that the two reports are one card.
  const [briefCopied, setBriefCopied] = useState(false);
  const [practiceOpen, setPracticeOpen] = useState(false);
  // Which practice the S&C sheet opens on when it is attached from the week
  // board (#226, Ohad 26.9: "bhbc should only let me attach an s&c team session").
  const [scPreset, setScPreset] = useState(null);
  const [gameEdit, setGameEdit] = useState(false);
  const [programFor, setProgramFor] = useState(null);
  const [injuryFor, setInjuryFor] = useState(null); // { athleteId, injuryId? } | null
  // Which played game we are recording minutes for. Minutes on court are the
  // biggest load a player takes and the board could not see them at all.
  const [minutesFor, setMinutesFor] = useState(null);
  // EVERY PAGE HAS ITS URL (27.9, Ohad: "fix the urls please to the titles of
  // the main menu for each page - same rules as in expo"): /coach/bhbc/roster,
  // /bhbc/schedule for a club coach. Read on load, written on every tab change,
  // followed on back/forward.
  const ZONE_PAGES = ['overview', 'roster', 'schedule', 'practices', 'lifts', 'medical', 'games', 'activity'];
  const pageFromUrl = () => { const m = (typeof window !== 'undefined' ? window.location.pathname : '').match(/^\/(?:coach\/)?bhbc\/([a-z]+)/); return m && ZONE_PAGES.includes(m[1]) ? m[1] : null; };
  // a coach's seat has no ACTIVITY page: /bhbc/activity opened blank for him
  // (27.9 #375) - it lands on OVERVIEW instead (`coach` is the prop; the
  // preview toggle cannot be on at first render)
  const [view, setView] = useState(() => { const p = pageFromUrl(); return p && !(coach && p === 'activity') ? p : 'overview'; });   // overview | schedule | roster
  useEffect(() => {
    const m = window.location.pathname.match(/^\/(coach\/)?bhbc/);
    if (!m) return;
    const want = `/${m[1] || ''}bhbc/${view}`;
    if (window.location.pathname === want) return;
    // the first write REPLACES (/coach/bhbc -> /coach/bhbc/overview) so Back leaves the zone
    if (pageFromUrl()) window.history.pushState(null, '', want + window.location.search);
    else window.history.replaceState(null, '', want + window.location.search);
  }, [view]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onPop = () => { const pg = pageFromUrl(); if (pg) setView(pg); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  // KEEP THE TAB YOU ARE ON IN VIEW. The bar is a horizontal scroller with a
  // pinned crest (his rule), and the scrollbar is hidden by design - so on a
  // phone the ACTIVE tab could sit entirely off-screen: measured on MEDICAL,
  // the current tab was 166px past the right edge with nothing to indicate it.
  const navRef = React.useRef(null);
  const headRef = React.useRef(null);
  useEdgeFade(navRef);
  useEdgeFade(headRef);
  // phones: the whole bar scrolls under the pinned crest; the far edge never
  // shows half a tab (the plate below covers exactly the overlap)
  const trailPlate = React.useRef(null), leadPlate = React.useRef(null);
  useRailTrailMask(headRef, { items: '.bhbc-hdr-tabs button, .bhbc-header-ctrl > *', lead: '.bhbc-header-id', trailRef: trailPlate, leadRef: leadPlate });
  // the crest plate's width is the bar's snap padding (a tab rests right after it)
  React.useLayoutEffect(() => {
    const el = headRef.current; const id = el && el.querySelector('.bhbc-header-id');
    if (el && id) el.style.setProperty('--crest-w', `${Math.round(id.getBoundingClientRect().width)}px`);
  });

  const [schedMode, setSchedMode] = useState('calendar'); // calendar | list
  // Owner-only "Preview as coach": renders the exact reduced surface a club coach
  // sees (no Manage roster / no ‹EXPO, medical view-only) without needing an account.
  const [previewCoach, setPreviewCoach] = useState(false);
  const asCoach = coach || previewCoach;
  // Ohad 2026-08-28: "allow tomer to log practice details and log rpe and time
  // and everything related". `asCoach` is one boolean gating EVERY write, so
  // flipping it would have handed over roster management and the S&C session
  // runner too. `canLog` is the narrow right he actually asked for: record a
  // practice — its minutes, its RPE, who was available. Never granted in
  // preview mode, where nothing may be written at all.
  const canLog = (!asCoach || canLogLoad) && !previewCoach;
  const effCanMedical = canMedical && !previewCoach;

  // THE LAST PLACE WITH ITS OWN CLUB PREDICATE, and it was the narrow one.
  //
  // `team === 'BHBC'` is what Manage roster writes today. Fifteen athletes carry
  // a club tag; only ten carry THAT one. The other five — tagged by an older
  // import path with format/branch 'Bnei Herzliya' — were filtered out of the
  // zone's roster while their logged sessions stayed in it, so the club's own
  // session cards rendered their names as the fallback string "המתאמן לא ברשימה
  // הזאת". Photographed at 390 on the אימונים tab, twice on one card.
  // Counted in production 22.9: team 10, format 15, branch 2, club-but-not-team 5.
  // 26.9, Ohad: "roster should only be active players on the roster (you
  // included players from last year)". The five carried only the old
  // format/branch tag — last season's players. The roster is now exactly what
  // Manage roster tags (team === 'BHBC'), so checking a box adds a player and
  // unchecking really removes him. Removing only clears that tag: the EXPO
  // profile, its history and his logged loads are untouched ("i don't want any
  // accidents with deleted profiles"). The Sessions view resolves old names from
  // its own list, so past session cards keep their names.
  // GHOSTS (27.9, Ohad, of one player: "is also a bhbc athlete (but don't need
  // to have him (just show him like a ghost athlete)"). A ghost is on the club
  // roster - his card shows, dimmed, on the Roster tab - but he is not counted:
  // no attendance, absences, alerts, S&C sheet or load board.
  const roster = useMemo(
    () => trainees.filter((t) => t && t.team === 'BHBC' && t.status !== 'Archived' && !t.bhbcGhost)
      .sort((a, b) => (a.jersey ?? 999) - (b.jersey ?? 999)),
    [trainees]
  );
  React.useEffect(() => {
    const el = navRef.current && navRef.current.querySelector('[aria-selected="true"]');
    if (!el) return undefined;
    // a timer, not requestAnimationFrame: a tab that is not focused never runs
    // animation frames, and the bar must still land right when it is shown
    const tid = setTimeout(() => {
      const sc = headRef.current;
      const phoneBar = sc && sc.scrollWidth > sc.clientWidth + 1 && getComputedStyle(sc).overflowX !== 'visible';
      if (!phoneBar) { if (el.scrollIntoView) el.scrollIntoView({ inline: 'nearest', block: 'nearest' }); return; }
      // THE PHONE BAR SCROLLS ITSELF (27.9 #304): scrollIntoView does not know
      // the pinned crest plate or the end plate, and under mandatory snap it
      // left the tapped tab half across the edge - hidden by the plate. A tab
      // already fully between the crest and the edge stays where it is;
      // otherwise the bar moves so the tab starts right at the crest.
      const rtl = getComputedStyle(sc).direction === 'rtl';
      const crest = sc.querySelector('.bhbc-header-id');
      const r = sc.getBoundingClientRect(), t = el.getBoundingClientRect(), c = crest ? crest.getBoundingClientRect() : null;
      const start = rtl ? (c ? c.left : r.right) : (c ? c.right : r.left);
      const end = rtl ? r.left : r.right;
      const fits = rtl ? (t.right <= start + 1 && t.left >= end - 1) : (t.left >= start - 1 && t.right <= end + 1);
      if (fits) { sc.dispatchEvent(new Event('scroll')); return; }
      const delta = rtl ? (t.right - start) : (t.left - start);
      sc.scrollTo({ left: sc.scrollLeft + delta, behavior: 'instant' });
      // the plates re-measure NOW, not on the next scroll event (an unfocused
      // tab dispatches that on a frame it never runs)
      sc.dispatchEvent(new Event('scroll'));
    }, 30);
    return () => clearTimeout(tid);
  // re-run when the tabs first appear: they render only once the roster has
  // loaded, so on a fresh page the first run found no active tab (27.9)
  }, [view, roster.length > 0]);
  const ghosts = useMemo(
    () => trainees.filter((t) => t && t.team === 'BHBC' && t.status !== 'Archived' && t.bhbcGhost)
      .sort((a, b) => (a.jersey ?? 999) - (b.jersey ?? 999)),
    [trainees]
  );
  // THE DAY TURNS OVER WITH THE PAGE OPEN (#305 L1). `today` was read on each
  // render, and nothing rendered at midnight - a tablet left on the Overview
  // overnight showed yesterday's Today card until someone touched it. One
  // timer to the next local midnight, and a check when the tab is shown again.
  const [, setDayTick] = useState(0);
  const dayRef = React.useRef(todayISO());
  useEffect(() => {
    let tid = null;
    const bump = () => { const d = todayISO(); if (d !== dayRef.current) { dayRef.current = d; setDayTick((x) => x + 1); } };
    const arm = () => {
      const n = new Date();
      const next = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1, 0, 0, 5);
      tid = setTimeout(() => { bump(); arm(); }, Math.max(1000, next - n));
    };
    arm();
    // AND THE HOUR (27.9 review): a practice or game becomes "past" at its
    // start time, not at the next unrelated re-render. A visible page
    // re-renders on the quarter hour - every slot starts on one.
    const qRef = { q: Math.floor(Date.now() / 900000) };
    const iid = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      const q = Math.floor(Date.now() / 900000);
      if (q !== qRef.q) { qRef.q = q; setDayTick((x) => x + 1); }
    }, 30000);
    const onVis = () => { if (document.visibilityState === 'visible') { bump(); setDayTick((x) => x + 1); } };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearTimeout(tid); clearInterval(iid); document.removeEventListener('visibilitychange', onVis); };
  }, []);
  const today = todayISO();
  // Keyed on `today`, not [] — a tab left open past midnight kept the windows
  // pinned to the mount day while ACWR moved on, so the sparkline and the ratio
  // disagreed until a reload (audit 08-22 #30).
  const last14 = useMemo(() => Array.from({ length: 14 }, (_, i) => daysAgoISO(13 - i)), [today]);
  const last28 = useMemo(() => Array.from({ length: 28 }, (_, i) => daysAgoISO(27 - i)), [today]);

// Sessions actually attended in the last 28 days, and the minutes they took.
// Counts what is RECORDED - a session with no minutes contributes to the count
// and not to the time, because a duration nobody wrote down is not a zero.
function attendance28(rec, days) {
  const within = new Set(days);
  let n = 0, min = 0, timed = 0;
  for (const [date, list] of Object.entries((rec && rec.sessions) || {})) {
    if (!within.has(date)) continue;
    for (const sess of (list || [])) {
      if (sess && sess.attended === false) continue;
      n++;
      if (Number.isFinite(Number(sess && sess.min))) { min += Number(sess.min); timed++; }
    }
  }
  return { n, min, timed };
}

  const rows = useMemo(() => roster.map((t) => {
    const rec = bhbcLoads[t.id] || emptyRec();
    const acwr = acwrFromDaily(rec.loads || {}, today);
    const series = last14.map((d) => (rec.loads && rec.loads[d]) || 0);
    // READINESS IS A DAILY MEASURE, so it has to be bounded by a date.
    //
    // This took the newest entry EVER recorded, with no bound at all — and the
    // very next line computes `checkedToday` correctly, which shows the two
    // were meant to be different things. The consequence: an athlete who
    // reported pain 7 on the 20th and never checked in again still showed a red
    // readiness dot on the 28th, and CoachBrief emitted "Regress <name> TODAY —
    // readiness red" off an eight-day-old check-in. Telling a coach to cut a
    // session on stale data is worse than telling him nothing.
    //
    // Yesterday still counts (an evening check-in is about this morning);
    // anything older is not today's readiness and reads as unknown.
    const yday = new Date(new Date(`${today}T00:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10);
    const rEntry = (rec.readiness && (rec.readiness[today] || rec.readiness[yday])) || null;
    const readiness = readinessAutoreg(rEntry || {});
    // Today's availability is at least as restrictive as any UNRESOLVED injury.
    //
    // Saving a medical record mirrors its status into availability for THAT DAY
    // only, so an ongoing non-contact injury silently reverted to "Full" on every
    // later day — the Head Coach Report then printed "0 LIMITED" directly under a
    // Medical line reading "ANKLE LEFT SPRAIN · NON-CONTACT", contradicting itself
    // on one card. The daily value is still the coach's call and can only make it
    // WORSE, never better than the medical fact.
    const avail = availOn(rec, medical, t.id, today);
    // Foster monotony over the trailing 7 days (illness/overtraining risk) +
    // whether a wellness check-in exists for today — both feed the Coach's Brief.
    const ms = monotonyStrain(last14.slice(-7).map((d) => (rec.loads && rec.loads[d]) || 0));
    const checkedToday = !!(rec.readiness && rec.readiness[today]);
    const hasLoad = Object.values(rec.loads || {}).some((v) => v > 0);
    // ATTENDED IS A FACT EVEN WHEN INTENSITY WAS NEVER RECORDED.
    //
    // The gym is logged in MINUTES with no RPE - that is the rule, not an
    // omission - so those sessions carry load 0 and never reach ACWR. With
    // three weeks of practices logged that way, every card on the roster still
    // read "no load yet" about an athlete who had trained twenty times. The
    // minutes are known; the card can say so.
    const att = attendance28(rec, last28);
    return { t, acwr, series, readiness, avail, ms, checkedToday, hasLoad, att };
  // medical is a dependency now: an active injury floors todays availability,
  // so resolving or adding one has to recompute the rows.
  }), [roster, bhbcLoads, today, last14, medical]);

  const team = useMemo(() => {
    const wr = rows.filter((r) => r.acwr.ratio != null);
    return {
      n: rows.length,
      avg: wr.length ? wr.reduce((s, r) => s + r.acwr.ratio, 0) / wr.length : null,
      flagged: rows.filter((r) => ['high', 'elevated'].includes(r.acwr.band.key)).length,
      week: Math.round(rows.reduce((s, r) => s + (r.acwr.acute || 0), 0)),
      teamSeries: last14.map((d) => roster.reduce((s, t) => s + ((bhbcLoads[t.id]?.loads?.[d]) || 0), 0)),
      series28: last28.map((d) => ({ date: d, load: roster.reduce((s, t) => s + ((bhbcLoads[t.id]?.loads?.[d]) || 0), 0) })),
    };
  }, [rows, roster, bhbcLoads, last14, last28]);

  const fx = useMemo(() => {
    // A fixture with no `start` made this concatenate 'undefined' and made the
    // sort at line ~1084 throw outright (audit 08-22 #73).
    const items = (bhbcFixtures || []).slice().sort((a, b) => `${a.date || ''}${a.start || ''}`.localeCompare(`${b.date || ''}${b.start || ''}`));
    const upcoming = items.filter((f) => f.date >= today);
    const nextGame = upcoming.find((f) => f.type === 'game') || null;
    const byDay = [];
    for (const f of upcoming) {
      let g = byDay.find((d) => d.date === f.date);
      if (!g) { g = { date: f.date, items: [] }; byDay.push(g); }
      g.items.push(f);
    }
    return { byDay: byDay.slice(0, 8), nextGame };
  }, [bhbcFixtures, today]);

  // Roster changes go on the owner's Activity trail like every other write
  // (#305 N-F5): who tagged or untagged a player was the one change it missed.
  const setTeam = useCallback((id, on) => {
    setTrainees((prev) => prev.map((t) => t.id === id ? { ...t, team: on ? 'BHBC' : undefined, bhbcGhost: on ? t.bhbcGhost : undefined } : t));
    track('edit', on ? 'added an athlete to the club roster' : 'took an athlete off the club roster');
  }, [setTrainees, track]);
  const setGhost = useCallback((id, on) => {
    setTrainees((prev) => prev.map((t) => t.id === id ? { ...t, bhbcGhost: on || undefined } : t));
    track('edit', on ? 'set an athlete as a ghost' : 'counted a ghost athlete again');
  }, [setTrainees, track]);
  // ONE PERSON, ONE PROFILE (#305 N-F3). Typing a name that is already in
  // EXPO made a second, empty profile beside the real one - his history, his
  // program and his medical record stayed on the first. The name is matched
  // exactly (case aside); a match is NOT tagged automatically, because two
  // people can share a name - the coach ticks the right row himself.
  const addAthlete = () => {
    const name = newAthlete.trim();
    if (!name) return;
    const dup = trainees.find((t) => t && t.status !== 'Archived' && String(t.name || '').trim().toLowerCase() === name.toLowerCase());
    if (dup) { toast(dup.team === 'BHBC' ? 'Already on the club roster' : 'Already in EXPO - tick him in the list below'); return; }
    setTrainees((prev) => [...prev, { id: 'tr_bh_' + Math.random().toString(36).slice(2, 9), name, team: 'BHBC', format: 'Bnei Herzliya', status: 'Active', createdAt: new Date().toISOString() }]);
    setNewAthlete(''); toast('Added'); track('edit', 'added a new athlete to the club roster');
  };

  // Per-player landing/arrival date — some sign late, first practices optional.
  const setArrival = useCallback((id, date) => {
    setTrainees((prev) => prev.map((t) => t.id === id ? { ...t, arrival: date || undefined } : t));
  }, [setTrainees]);

  // Read the CURRENT value out of state, never off the rendered row.
  //
  // Ohad: "clicking on availability sometimes work and sometimes doesnt change
  // anything". Reproduced: clicking faster than React re-renders, 3 of 10
  // clicks changed nothing. The old signature took `current` from the row's
  // props, so two clicks landing in the same render both read the same value
  // and both computed the same next one - the second was a no-op that wrote the
  // value already there. It also meant an athlete with no entry for today
  // passed `undefined`, and undefined % 5 is NaN, which JSON stores as null and
  // reads back as Full.
  //
  // Deriving inside the updater makes every click see the result of the one
  // before it, however fast they land.
  // CYCLE WITHIN WHAT THE MEDICAL RECORD ALLOWS.
  //
  // An active injury FLOORS today's availability - the board renders
  // max(dayAvail, injuryAvail) so a coach can never mark an injured athlete
  // better than the medical fact. That part is right. But the cycle still ran
  // 1..5 UNDER that floor, so for an athlete whose medical status floors him at
  // 4, four clicks in five changed a number nobody could see and the control
  // looked dead. Ohad: "i can't change the availability to limited".
  // (The athlete and his diagnosis were named here until 18.9. This repository
  // is PUBLIC: a health note about a named person has no business in a code
  // comment, and the floor number is the only part the logic needs.)
  //
  // Cycle from the floor upward instead. Floor 1 behaves exactly as before;
  // floor 4 gives the two states actually available, Out-Med and Out-Personal.
  // To go below the floor you change the medical record, which is where that
  // value really lives.
  const cycleAvail = useCallback((id, to = null) => {
    const floor = activeInjuries(medical || {}, id)
      .reduce((worst, inj) => Math.max(worst, MEDICAL_STATUS_AVAIL[inj.status] || 1), 1);
    setBhbcLoads((prev) => {
      const rec = prev[id] ? { ...prev[id] } : emptyRec();
      const cur = Math.max(Number((rec.availability || {})[today]) || 1, floor);
      // a chosen status (the picker, 27.9 #345) - never below the medical floor
      // a chosen code is clamped to the scale (1-5) as well as the medical floor (#436)
      const next = to != null ? Math.min(5, Math.max(Math.round(Number(to)) || 1, floor)) : (cur >= 5 ? floor : cur + 1);
      rec.availability = { ...(rec.availability || {}), [today]: next };
      return { ...prev, [id]: rec };
    });
    notify();
  }, [setBhbcLoads, today, notify, medical]);

  // Edit / delete an already-logged session (Ohad 2026-08-21: sessions must be
  // fixable after the fact). Editing rewrites minutes — and load for sRPE
  // entries; deleting subtracts the entry's load so ACWR stays truthful.
  const editSession = useCallback((athleteId, date, idx, newMin, sig) => {
    const cur = bhbcLoads && bhbcLoads[athleteId] && bhbcLoads[athleteId].sessions
      && bhbcLoads[athleteId].sessions[date] && bhbcLoads[athleteId].sessions[date][idx];
    if (sig != null && sessionSig(cur) !== sig) { toast('That session moved — reopen it'); return; }
    // A session with no minutes is not a session (audit #71) — unless it is a
    // court session, which is attendance and has no duration by design.
    const attendanceRow = cur && rowKind(cur) === 'practice';
    if (Number(newMin) <= 0 && cur && !attendanceRow) { toast('Minutes must be more than 0 — delete the session instead'); return; }
    setBhbcLoads((prev) => {
      const rec = prev[athleteId]; if (!rec || !rec.sessions || !rec.sessions[date] || !rec.sessions[date][idx]) return prev;
      const out = { ...rec, sessions: { ...rec.sessions }, loads: { ...(rec.loads || {}) } };
      const arr = [...out.sessions[date]];
      const s = { ...arr[idx] };
      const min = Number(newMin) || 0;
      // Editing minutes to zero on an S&C session or a lift leaves an
      // unrecoverable stub; deleting is the way to remove one. A court row is
      // allowed zero minutes because that IS its shape.
      const isAttendanceRow = rowKind(s) === 'practice';
      if (min <= 0 && !isAttendanceRow) return prev;
      // No load is ever recomputed: there is no RPE to compute one from. If a
      // stale row still carries one, drop it rather than propagate it.
      if (s.load) { out.loads[date] = Math.max(0, (out.loads[date] || 0) - s.load); s.load = 0; }
      s.rpe = null;
      s.min = isAttendanceRow ? 0 : min;
      arr[idx] = s; out.sessions[date] = arr;
      return { ...prev, [athleteId]: out };
    });
    toast('Session updated'); track('session', `edited a session on ${fmtNumericDate(date)}`); notify();
  }, [setBhbcLoads, bhbcLoads, notify]);

  const deleteSession = useCallback((athleteId, date, idx, sig) => {
    let removed = null;
    const cur = bhbcLoads && bhbcLoads[athleteId] && bhbcLoads[athleteId].sessions
      && bhbcLoads[athleteId].sessions[date] && bhbcLoads[athleteId].sessions[date][idx];
    if (sig != null && sessionSig(cur) !== sig) { toast('That session moved — reopen the list'); return; }
    setBhbcLoads((prev) => {
      const rec = prev[athleteId]; if (!rec || !rec.sessions || !rec.sessions[date] || !rec.sessions[date][idx]) return prev;
      const out = { ...rec, sessions: { ...rec.sessions }, loads: { ...(rec.loads || {}) } };
      const arr = [...out.sessions[date]];
      const [s] = arr.splice(idx, 1);
      removed = s;
      if (arr.length) out.sessions[date] = arr; else { const ss = { ...out.sessions }; delete ss[date]; out.sessions = ss; }
      if (s && s.load > 0) {
        const nl = Math.max(0, (out.loads[date] || 0) - s.load);
        if (nl > 0) out.loads[date] = nl; else { const ls = { ...out.loads }; delete ls[date]; out.loads = ls; }
      }
      return { ...prev, [athleteId]: out };
    });
    // Undo restores the exact row and its load. `removed` is captured
    // inside the updater above, so it is the row that was actually spliced.
    toast('Session removed', 'info', {
      ttl: 8000,
      actions: [{ label: zoneT('Undo'), value: 'undo' }],
      onAction: (v) => {
        if (v !== 'undo' || !removed) return;
        setBhbcLoads((prev) => {
          const rec = prev[athleteId] ? { ...prev[athleteId] } : emptyRec();
          rec.sessions = { ...(rec.sessions || {}) };
          const arr = [...(rec.sessions[date] || [])];
          arr.splice(Math.min(idx, arr.length), 0, removed);
          rec.sessions[date] = arr;
          if (removed.load > 0) rec.loads = { ...(rec.loads || {}), [date]: (rec.loads?.[date] || 0) + removed.load };
          return { ...prev, [athleteId]: rec };
        });
        toast('Session restored'); notify();
      },
    });
    // a delete is a change like any other (#305 N-F4)
    track('session', `deleted a session on ${fmtNumericDate(date)}`);
    notify();
  }, [setBhbcLoads, bhbcLoads, notify, track]);

  // ONE ATHLETE'S OWN LIFT. Ohad, 24.9: "lifts needs to be independent and i
  // can log them even on days without practice, and theyre not team. just
  // personal. and not related to the practice sessions".
  //
  // So: one athlete, any date, minutes and a note. No fixture, no slot, no
  // squad scope, no RPE, no load — and `team:false` written out so no reader
  // can ever fold it back into a team session. `type:'Lift'` stays on the row
  // for the scripts that already dedupe on it; `kind` is what the zone reads.
  const logLift = useCallback(({ athleteId, date, minutes, note }) => {
    if (!athleteId || !date) return;
    if (!(Number(minutes) > 0)) { toast('Add minutes'); return; }
    setBhbcLoads((prev) => {
      const rec = prev[athleteId] ? { ...prev[athleteId] } : emptyRec();
      rec.sessions = { ...(rec.sessions || {}) };
      rec.sessions[date] = [...(rec.sessions[date] || []), { kind: 'lift', type: 'Lift', min: Number(minutes), rpe: null, load: 0, attended: true, team: false, ...(note ? { note } : null), by: currentUser || null }];
      return { ...prev, [athleteId]: rec };
    });
    toast('Lift logged'); track('session', `logged a lift on ${fmtNumericDate(date)} · ${Number(minutes)} min`); notify();
  }, [setBhbcLoads, notify, track, currentUser]);

  // THE TEAM S&C SESSION, LOGGED WITH ITS PRACTICE. Ohad, 24.9: "sc sessions
  // are logged along with a basketball practice" and "practices gets logged
  // from the players availability on attendance". One save does both:
  //
  //   - the PRACTICE is logged as attendance — who was in and who was out of
  //     the slot `${date}|${start}`, from the day's availability, corrected by
  //     the coach per player. No duration and no plan text: the practice
  //     itself is the basketball coach's.
  //   - the S&C block that ran before it is one `kind:'sc'` row per athlete
  //     who was there: the team's minutes, one optional note, the slot's
  //     `start`, team:true. No RPE and no load — the record never carried one.
  //
  // Lifts are never written here. They are personal: see logLift.
  const saveScSession = useCallback(({ date, start = '', minutes, entries, note = '' }) => {
    const min = Number(minutes) || 0;
    if (!date || !(min > 0)) { toast('Add the S&C minutes'); return; }
    setBhbcLoads((prev) => {
      const next = { ...prev };
      Object.entries(entries).forEach(([id, e]) => {
        // NOT LANDED YET = NOT OWED THIS PRACTICE (27.9 review): the sheet
        // shows him unticked, and writing that as attendance 'out' + an
        // availability for the day turned into a red "missed" and a bigger
        // denominator on every practice before he arrived. His record is
        // left exactly as it was.
        const who = roster.find((x) => x.id === id);
        if (who && who.arrival && date < who.arrival) return;
        const rec = next[id] ? { ...next[id] } : emptyRec();
        // RE-SAVING A SLOT MUST REPLACE IT, NOT ADD TO IT.
        //
        // The attendance write below is keyed `${date}|${start}` and so is
        // already idempotent — the slot has an identity. The session rows
        // used to append unconditionally, so saving the 18:00 practice,
        // noticing a wrong note and saving again gave every athlete a
        // duplicate history row. So drop the S&C rows this slot already owns
        // first (and take any stale load back out of the day's total).
        //
        // WHAT A SLOT OWNS is ownsScRow in bhbcSession.js: its team S&C rows
        // and nothing else — never a legacy court Practice row that shares
        // its `start`, never a personal lift. A day with no fixture (start '')
        // owns only rows this model wrote without a start, so a legacy row
        // from before per-slot logging is never swept up.
        const slotKey = `${date}|${start || ''}`;
        const priorRows = (rec.sessions && rec.sessions[date]) || [];
        const mine = priorRows.filter((r) => ownsScRow(r, start));
        if (mine.length) {
          const undo = mine.reduce((a, r) => a + (Number(r.load) || 0), 0);
          rec.sessions = { ...(rec.sessions || {}) };
          rec.sessions[date] = priorRows.filter((r) => !mine.includes(r));
          if (undo > 0) rec.loads = { ...(rec.loads || {}), [date]: Math.max(0, (rec.loads?.[date] || 0) - undo) };
        }
        rec.availability = { ...(rec.availability || {}), [date]: e.avail };
        // Per-slot attendance: an athlete who is Out for the DAY is out of every
        // slot, but an available athlete can still be marked absent from THIS
        // practice without touching the rest of his day. This IS the practice
        // log.
        const attended = e.attended !== false && e.avail < 4;
        rec.attendance = { ...(rec.attendance || {}), [slotKey]: attended ? 'in' : 'out' };
        if (attended) {
          rec.sessions = { ...(rec.sessions || {}) };
          // `note` is what every reader shows (his own note wins); `teamNote`
          // and `ownNote` keep the two apart so reopening the sheet restores
          // each to its own field. Without them the sheet took the first note
          // it found as the TEAM note — one athlete's "knee sore" — and a
          // re-save wrote it onto every attending athlete (26.9 review).
          rec.sessions[date] = [...(rec.sessions[date] || []), buildScRow({ min, start, teamNote: note, ownNote: e.note, by: currentUser || null })];
        }
        if (e.bw) rec.bw = { ...(rec.bw || {}), [date]: Number(e.bw) };
        if (e.note) rec.notes = { ...(rec.notes || {}), [date]: e.note, [`${date}|${start || ''}`]: e.note };
        next[id] = rec;
      });
      return next;
    });
    const inCount = Object.values(entries || {}).filter((e) => e && e.attended !== false && e.avail < 4).length;
    toast('S&C session saved'); track('session', `logged the practice and an S&C session on ${fmtNumericDate(date)}${start ? ` ${start}` : ''} · ${min} min · ${inCount} in`); notify();
  }, [setBhbcLoads, notify, track, currentUser, roster]);

  // Squad morning wellness check-in → readiness[date] per athlete, feeding the
  // readinessAutoreg engine (so the Load board + athlete cards show a real
  // session nudge before athletes have their own portal accounts).
  const saveCheckin = useCallback(({ date, entries }) => {
    setBhbcLoads((prev) => {
      const next = { ...prev };
      Object.entries(entries).forEach(([id, e]) => {
        const hasAny = e.sleep || e.energy || (e.pain !== '' && e.pain != null) || e.bw;
        if (!hasAny) return;
        const rec = next[id] ? { ...next[id] } : emptyRec();
        if (e.sleep || e.energy || (e.pain !== '' && e.pain != null)) {
          rec.readiness = { ...(rec.readiness || {}), [date]: { ...((rec.readiness || {})[date] || {}), ...(e.sleep ? { sleep: e.sleep } : {}), ...(e.energy ? { energy: e.energy } : {}), ...(e.pain !== '' && e.pain != null ? { pain: e.pain } : {}) } };
        }
        // BW check-in (Ohad measures players through the season for the head coach)
        if (e.bw) rec.bw = { ...(rec.bw || {}), [date]: Number(e.bw) };
        next[id] = rec;
      });
      return next;
    });
    toast('Check-in saved'); track('checkin', `saved the readiness check-in for ${fmtNumericDate(date)}`); notify();
  }, [setBhbcLoads, notify]);

  const updateGame = useCallback((g, patch) => {
    if (!setBhbcFixtures) return;
    // UPDATE ONE GAME, NOT EVERY GAME THAT DAY.
    //
    // `start` is '' on every TBD fixture and the predicate never looked at the
    // opponent, so two TBD games on one date both matched: setting "Maccabi Tel
    // Aviv / away" on the second rewrote the first as well. The fixture sync
    // keys games by `date|opponent`, so two opponents on one date is a
    // supported state.
    //
    // Match on the opponent too, and even then apply the patch to the FIRST
    // match only — when two rows are genuinely indistinguishable (both TBD,
    // both opponent-less) editing one must not silently rewrite the other.
    setBhbcFixtures((prev) => {
      const list = (prev || []);
      const norm = (v) => String(v ?? '');
      const i = list.findIndex((f) => f.type === 'game'
        && f.date === g.date
        && norm(f.start) === norm(g.start)
        && norm(f.opponent) === norm(g.opponent));
      if (i < 0) return list;
      const next = list.slice();
      next[i] = { ...next[i], ...patch };
      return next;
    });
    toast('Game updated'); track('game', `updated a game on ${fmtNumericDate(g.date)}`); notify();
  }, [setBhbcFixtures, notify, track]);

  // ---- Medical / injury record (Ohad + physical therapist) ----
  // Saving an injury/progress entry can also set the athlete's availability that
  // day, so the medical record and the load board stay in sync.
  // PRACTICE PLANS ARE GONE. Ohad, 24.9: "no practice plans". The per-slot
  // plan store (`expo-bhbc-plans`, focus + plan text) is no longer read or
  // written anywhere in the zone; the key is left alone in the database.

  // ---- Week planner writes (Ohad 2026-08-24: "write what and when the entire
  // team has an S&C session"). The zone could DISPLAY sessions but never create
  // one, so planning still lived in the old sheet. Manual entries carry
  // manual:true so a future calendar sync can tell them from imported ones.
  const endOfSession = (start, minutes) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(start || ''));
    const mins = Number(minutes) || 0;
    if (!m || !mins) return '';
    const tot = Number(m[1]) * 60 + Number(m[2]) + mins;
    return `${String(Math.floor((tot % 1440) / 60)).padStart(2, '0')}:${String(tot % 60).padStart(2, '0')}`;
  };
  const sameSlot = (a, b) => a && b && a.date === b.date && String(a.start || '') === String(b.start || '') && a.type === b.type;
  const upsertFixture = useCallback((orig, next) => {
    if (!setBhbcFixtures) return;
    // THE EDITOR OWNS SIX FIELDS. IT MUST NOT DELETE THE REST.
    //
    // `clean` used to be a whitelist built from scratch, so editing an imported
    // game's start time silently dropped its opponent, venue, competition,
    // home flag, title and travel. Changing the tip-off on the Badalona game
    // would have thrown away both flights. Start from what is already on the
    // row and overwrite only what the form actually edits.
    const base = orig || {};
    const clean = { ...base, date: next.date, type: next.type, start: next.start,
      minutes: Number(next.minutes) || 0, end: endOfSession(next.start, next.minutes), manual: true };
    if (Number(next.contactMin) > 0) clean.contactMin = Number(next.contactMin);
    else delete clean.contactMin;                       // cleared in the form = cleared on the row
    // Opponent / venue / home only mean something on a game, and only the game
    // form sends them. Ohad, 20.09: the Winner Cup quarter-final read "Opponent
    // TBD" because the club calendar still says "Winner cup game ???" and he has
    // reader-only access to it — there was no way to type the name in. The
    // calendar sync already prefers an existing opponent over the calendar's
    // (`merged.opponent = f.opponent || cal.opponent`), so what is set here survives.
    if (next.type === 'game' || next.type === 'scrimmage') {
      const opp = String(next.opponent || '').trim();
      if (opp) clean.opponent = opp; else delete clean.opponent;
      const ven = String(next.venue || '').trim();
      if (ven) clean.venue = ven; else delete clean.venue;
      if (next.home === 'home') clean.home = true;
      else if (next.home === 'away') clean.home = false;
      else delete clean.home;                           // neutral / not yet known
    }
    setBhbcFixtures((prev) => {
      const list = [...(prev || [])];
      const i = orig ? list.findIndex((f) => sameSlot(f, orig)) : -1;
      if (i >= 0) list[i] = { ...list[i], ...clean }; else list.push(clean);
      return list.sort((a, b) => `${a.date}${a.start || ''}`.localeCompare(`${b.date}${b.start || ''}`));
    });
    toast(orig ? 'Session updated' : 'Session added'); track('schedule', `${orig ? 'changed' : 'added'} a slot on ${fmtNumericDate(clean.date)}`); notify();
  }, [setBhbcFixtures, notify, track]);
  const setFixtureCancelled = useCallback((f, on) => {
    if (!setBhbcFixtures || !f) return;
    setBhbcFixtures((prev) => (prev || []).map((x) => {
      if (!sameSlot(x, f)) return x;
      const next = { ...x };
      if (on) { next.cancelled = true; next.cancelledAt = new Date().toISOString(); }
      else { delete next.cancelled; delete next.cancelledAt; }
      return next;
    }));
    toast(on ? 'Session cancelled' : 'Session restored'); track('schedule', `${on ? 'cancelled' : 'restored'} the ${f.start || ''} ${f.type || 'session'} on ${fmtNumericDate(f.date)}`); notify();
  }, [setBhbcFixtures, notify, track]);
  const removeFixture = useCallback((f) => {
    if (!setBhbcFixtures) return;
    setBhbcFixtures((prev) => (prev || []).filter((x) => !sameSlot(x, f)));
    toast('Session removed'); track('schedule', `removed a slot on ${fmtNumericDate(f.date)}`); notify();
  }, [setBhbcFixtures, notify, track]);

  const saveInjury = useCallback(({ athleteId, injury }) => {
    if (!setMedical) return;
    setMedical((prev) => {
      const rec = { ...(prev || {}) };
      const a = { injuries: [...((rec[athleteId] && rec[athleteId].injuries) || [])] };
      const idx = a.injuries.findIndex((i) => i.id === injury.id);
      if (idx >= 0) a.injuries[idx] = injury; else a.injuries.unshift(injury);
      rec[athleteId] = a;
      return rec;
    });
    // Mirror the current status into availability for today (Out/Limited/etc).
    const av = MEDICAL_STATUS_AVAIL[injury.status];
    if (av && setBhbcLoads && !injury.resolved) {
      setBhbcLoads((prev) => {
        const r = prev[athleteId] ? { ...prev[athleteId] } : emptyRec();
        // "Out · Pers" is not the injury's to change (#305 N-M2): a personal
        // absence the coach set for today survived nothing but a medical save,
        // which wrote the injury's status over it.
        if (Number((r.availability || {})[today]) === 5) return prev;
        r.availability = { ...(r.availability || {}), [today]: av };
        return { ...prev, [athleteId]: r };
      });
    }
    // CLEARING AN INJURY HAS TO CLEAR THE FLOOR IT WROTE.
    //
    // Reporting one mirrors its status onto today's availability (out -> 4).
    // Resolving skipped the mirror entirely, so that 4 stayed — and `rows`
    // takes Math.max(dayAvail, injuryAvail), which by design can only make
    // availability WORSE. So a player cleared to play still read "out": the
    // head-coach report counted him out, logTeamSession skipped him (av >= 4)
    // and the practice log recorded him absent, until somebody happened to
    // cycle the chip by hand.
    //
    // Only lift a MEDICAL floor (2-4), and only when nothing else is still
    // active. 5 is "Out · Personal" and has nothing to do with the injury, so
    // it is left exactly where it is.
    if (injury.resolved && setBhbcLoads) {
      setBhbcLoads((prev) => {
        const r = prev[athleteId] ? { ...prev[athleteId] } : emptyRec();
        const cur = (r.availability || {})[today];
        if (!(cur >= 2 && cur <= 4)) return prev;
        const stillHurt = ((medical[athleteId] || {}).injuries || [])
          .some((i) => i.id !== injury.id && !i.resolved);
        if (stillHurt) return prev;
        r.availability = { ...(r.availability || {}), [today]: 1 };
        return { ...prev, [athleteId]: r };
      });
    }
    toast('Medical record saved'); track('medical', `updated a medical record`); notify();
  }, [setMedical, setBhbcLoads, today, notify, medical]);

  const rowGrid = '28px minmax(116px,1.5fr) 112px 46px 130px minmax(104px,1.1fr) 92px';
  // Coaches (head coach + assistants) are VIEWERS: they read the report, roster,
  // schedule, medical and games — but do NOT operate S&C (no session runner, no
  // logging practices, no check-in entry, no roster management). Ohad 2026-08-18.
  // Lifts is the personal weight-room record (kind:'lift' only). The old
  // owner-only "Sessions" tab (EXPO's set-by-set logger) is gone: a lift is
  // logged with "Log lift", an S&C session with "Log S&C Session" (24.9).
  const NAV_TABS = [['overview', tr('Overview')], ['roster', tr('Roster')], ['schedule', tr('Schedule')], ['practices', tr('Practices')], ['lifts', tr('Lifts')], ['medical', tr('Medical')], ['games', tr('Games')], ...(asCoach ? [] : [['activity', tr('Activity')]])];

  // Never sit on a tab that is not in the list. 'Activity' disappears in the
  // coach view, but `view` was not reset when 'Preview as coach' was switched
  // on: no content block matched, no tab rendered active, and the owner got a
  // header floating over an empty page that reads as the preview being broken
  // (audit #72). Stated as "the view must be one of the tabs on screen" rather
  // than as a special case for one tab, so a tab hidden later cannot bring the
  // blank page back. A saved 'weightroom' / 'sessions' view resolves the same
  // way.
  useEffect(() => {
    if (!NAV_TABS.some(([k]) => k === view)) setView(NAV_TABS[0][0]);
  }, [asCoach]);   // eslint-disable-line react-hooks/exhaustive-deps

  return (
    // dir="rtl" on the zone root, not just Hebrew words in an LTR layout:
    // labels sit on the correct side, the nav reads right-to-left, and mixed
    // Hebrew/English lines resolve through the browser's own bidi algorithm
    // instead of being forced. Numbers, times and club names stay LTR on their
    // own because they are strongly-typed LTR runs.
    <BhbcLangCtx.Provider value={bhbcLang}>
    {/* App returns the zone ABOVE its own LangCtx.Provider, so the app components
        the zone embeds (the session logger) read the default English whatever
        either switch says. They follow the ZONE's switch. */}
    <LangCtx.Provider value={bhbcLang}>
    <BodyLang lang={bhbcLang} />
    <BhbcTheme.Provider value={bhbcTheme}>
    <div className="bhbc-zone" data-theme={bhbcTheme} dir={he ? 'rtl' : 'ltr'} style={{ ...tokensFor(bhbcTheme), minHeight: '100vh', background: 'var(--c-bg)', color: C.tx, fontFamily: FB }}>
      <style>{`
        .bhbc-hdr-tabs::-webkit-scrollbar{display:none} .bhbc-hdr-tabs{scrollbar-width:none;-ms-overflow-style:none}
        .bhbc-ghost-btn:hover{color:${ORANGE}!important;border-color:${ORANGE}!important}
        /* the phone's sort row stands in for a header row the phone hides (SortBar) */
        .bhbc-sortbar{display:none!important}
        @media (max-width:620px){.bhbc-load-sortbar{display:flex!important}}
        @media (max-width:760px){.bhbc-inj-sortbar{display:flex!important}}
        .bhbc-tab:hover{color:#fff!important;border-color:rgba(255,255,255,0.30)!important}
        /* 17.9 (Ohad, phone): 'סקירה gets cut and i cannot scroll to where it fully seen'.
           'safe center' still centred the row once it overflowed, so the first tab sat half
           outside the scroller with nothing to scroll to. Below 700px the strip starts at its
           first tab and scrolls from there, with a little end padding so the last one clears too. */
        @media (max-width: 700px){
          /* ...and the crest is STICKY, so at rest it sat ON TOP of the first tab (measured at
             412px: tab 295..355, crest 343..412 - 12px of סקירה hidden under it). The strip
             starts clear of the crest and scrolls from there. */
          .bhbc-hdr-tabs{justify-content:flex-start !important;scroll-padding-inline:20px;padding-inline-start:20px;padding-inline-end:2px}
          .bhbc-hdr-tabs > :last-child{margin-inline-end:8px}
        }
        .bhbc-expo-mark{opacity:1}
        /* Never let the zone scroll the PAGE sideways — wide bits scroll inside. */
        .bhbc-zone{max-width:100vw;overflow-x:clip}
        .bhbc-week-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px;align-items:stretch}
        @media (max-width:620px){ .bhbc-week-grid{grid-template-columns:repeat(2,minmax(0,1fr))} }
        @media (max-width:400px){ .bhbc-week-grid{grid-template-columns:1fr} }
        /* In a seven-across week a session chip stacks: EventChip's stacked
           form (info row over a row of action segments, #509). */
        @media (max-width:620px){
          /* Label above value, both full width. A 150px label column on a 390px
             screen leaves the value ~200px and everything wraps three deep. */
          /* The label sits ON the first line of its value, not above it.
             Stacking it was worse than the 150px column it replaced: it made
             every fact TWO rows, which is what Ohad meant by "way too many rows
             spreaded out". Floating it keeps one row per fact and the value
             flows around it, so no gutter is reserved either. */
          /* The return-to-play date is what pushes each medical line onto a
             second row. It is a SUMMARY here; the date lives on the Medical
             tab. Hiding it turns six two-line entries into six one-line ones. */
          .bhbc-mob-hide{display:none!important}
          /* THE THREE ACTIONS ARE ONE ROW, ALWAYS (26.9, Ohad: "manage roster,
             log lift, log sc session should all fit in one row. always.
             everywhere"). They take the full width under the ROSTER label and
             share it; tighter tracking and inline padding make the longest
             labels fit at 360 without cutting a word. */
          .bhbc-roster-actions{display:flex!important;flex-wrap:nowrap!important;width:100%;margin-inline-start:0!important;gap:6px!important}
          .bhbc-roster-actions > *{flex:1 1 auto;min-width:0;padding-inline:6px!important;letter-spacing:0.03em!important;white-space:nowrap!important}
          /* A WEEK-PLANNER SESSION COST TWO ROWS FOR NO REASON. Measured at 390:
             the row's children come to 290px of content in about 300px, so the
             edit/remove pair wrapped onto a line of its own — eight sessions,
             eight extra rows, which is a good part of what he means by "way too
             many rows spreaded out".
             The FOCUS takes the second line instead: it is the part that
             genuinely needs the width (a real focus is a sentence), and the
             actions ride line one, pushed right by the auto margin they already
             have. Nothing is truncated - a focus note must never be. */
          .bhbc-chip .bhbc-chip-focus{order:1;flex:0 0 100%;margin-top:2px}
          /* ...and on a phone a session with NO focus does not spend a line
             saying so. The placeholder is grey italic filler; the edit control
             is right there on the same row, and a real focus still gets its own
             full-width line. Eight sessions, eight lines back. */
          .bhbc-chip .bhbc-chip-focus-empty{display:none!important}
          /* I TRIED align-items:flex-start ON EVERY ROW CLASS HERE AND IT WAS WRONG.

             A probe found 101 short items sitting below the tallest cell on rows
             that had grown, so I top-aligned .bhbc-row, .bhbc-game-row,
             .bhbc-med-row, .bhbc-chip and .bhbc-rtp-row at phone width. Ohad,
             within the hour: "nothing is verticlly center aligned anywhere in
             bhbc" - and he was right. Most of those rows are ONE line, where
             centred is correct and top-aligned just looks unfinished; the session
             chip and its + button ended up hanging off the top of a tall row.

             The probe could not tell "deliberately centred against wrapped text"
             from "slid down", so acting on its total was the mistake. Centring
             stays the default. Where a row genuinely has a two-line cell and a
             short one - the medical name beside its diagnosis, the day count
             beside its fixture - the fix is on THAT element, not on every row.  */
          /* THE PAST-PRACTICE LIST GETS ITS WIDTH BACK ON A PHONE.
             Its label column is the one that gives way, and at 390 eight of
             seventeen rows ran to two lines. The date and time columns are sized
             for a desktop; the same 84/38 the week row already uses here frees
             ~30px for the label, and the gap goes 10 -> 7. Measured before and
             after rather than eyeballed. */
          .bhbc-pp-row{ gap: 7px !important; }
          .bhbc-pp-row > span:nth-child(1){ width: 84px !important; }
          .bhbc-pp-row > span:nth-child(2){ width: 38px !important; }
        .bhbc-labelrow{display:block!important}
          /* THE LABEL GOES ABOVE, NOT BESIDE — so every value starts on ONE column.
             It floated inline-start, which indents only the FIRST line and starts
             each value after a label of a different width. Measured 19.9 at 360
             and 390: the six values in the today card started at 261.1, 294.4,
             301.9, 315.2 and 333.2 - a 72px spread, which is the thing he has now
             asked for three times. Desktop was already 0px; only the phone
             floated. The list variant below already stacks for this reason; this
             makes the default do it too - one extra line per row, every value on
             the card's own edge. */
          .bhbc-labelrow > div:first-child{float:none!important;display:block!important;width:auto!important;min-width:0!important;margin:0 0 4px 0!important;line-height:1.55}
          .bhbc-labelrow::after{content:'';display:block;clear:both}
          /* Same tightening as the desktop sweep, applied to the phone: the page
             gutter and the gap between cards are desktop measures on a 390px
             screen, where every pixel of chrome is a pixel of content lost. */
          .bhbc-zone main{padding:12px 10px 40px!important;gap:10px!important}
          /* Today panel: three blocks that sit in a row on desktop stack on a
             phone with a 24px gap between each, and the availability trio is
             rendered as three tall tiles - 366px for what the report above it
             already said in one line. Tighter gap, and the counts go inline. */
          .bhbc-today-row{gap:10px!important;row-gap:10px!important}
          .bhbc-today-row > *{min-width:0!important}
          /* A LIST does not float its label. Floating indents only the first
             line, so item one sat at x=120 beside the label while items two to
             six started at x=43 - Ohad: "most of the text in the titles is
             misaligned". For a list the label goes above and every row shares
             one left edge. Single-value sections keep the float, where it costs
             no row. */
          .bhbc-labelrow-list > div:first-child{float:none!important;display:block!important;margin:0 0 5px 0!important}
          /* This-week rows fit on ONE line. Measured at 390: the row gets 301px
             and wanted 349 - date box 96 for 72px of ink, time box 46 for 35,
             label 133, action 44, three 10px gaps. Trimming each fixed column to
             its real ink (74 / 38) and the gap to 7 buys 39px, and 11px type on
             the label buys the rest. 74 is above the 72px widest date, so no
             date wraps - which is what went wrong when this was tried at 78 in
             an earlier pass and the column read ragged. */
  /* 96px, the SAME number as the desktop grid, not auto. With auto the name
     track is the content width, so a short surname pulled the diagnosis column
     left and every row started its detail at a different x - measured at 390:
     six surnames started at 78, 82, 87, 94, 103 and
     111px, a 33px spread down six rows. 96 holds the longest surname in the
     squad and the UPDATE button that sits under it on a phone. */
  .bhbc-med-row{ grid-template-columns: 10px 96px minmax(0,1fr) !important; margin-inline-start: 0 !important; }
          .bhbc-med-row > *:nth-child(3){ grid-column: 3 !important; }
          .bhbc-med-row > *:nth-child(4){ grid-column: 2 !important; justify-self: start !important; }
                  .bhbc-week-row{gap:7px!important}
          /* 84, NOT 74, AND THE 74 WAS MEASURED IN THE WRONG LANGUAGE.
             The note above says "74 is above the 72px widest date". In Hebrew
             it is - measured 19.9 at 360 and 390, the widest Hebrew date needs
             exactly 74 and nothing overflows. In ENGLISH the same six rows need
             77, 80, 81 and 82, so FIVE OF SIX spilled their column at both
             widths, and had done since the number was picked. 84 clears the
             measured 82 and still leaves the label 163px at 360, well over its
             104px floor. If this is ever retuned, measure BOTH languages. */
          .bhbc-week-row > span:nth-child(1){width:84px!important}
          .bhbc-week-row > span:nth-child(2){width:38px!important}
          .bhbc-week-row > span:nth-child(3){font-size:11px!important}
          /* S&C brief on a phone: the 74px label column and the 96px action
             button left the instruction ~120px, so each item took three lines.
             The label goes above the instruction, the reason and the button
             share the line under it. Two lines per item, not three, and the
             instruction gets the full width it deserves. */
          /* The brief keeps its flex row - a grid made it worse twice, once by
             stacking every child and once by trapping the reason in two narrow
             columns where it wrapped to seven lines. What actually costs the
             rows is the REASON: on 301px the instruction alone needs two lines,
             and the reason adds two more. The instruction and its action are
             what a coach acts on; the reason is on the card he lands on. */
          /* INDICES SHIFTED when the severity dot left the flow (it is
             absolutely positioned off the instruction now, so the row's
             children are label / instruction / reason / button). These rules
             still counted the dot, so :nth-child(4) hid the BUTTON instead of
             the reason — measured at 390, the action rendered 0x0 and every
             brief row became a dead end. */
          .bhbc-brief-row > *:nth-child(3){display:none!important}
          /* ...and the label and button are desktop measures too: 74 + 96 of a
             301px row left the instruction 139px. The dot colour already
             carries severity and the button names the destination, so the
             label can be narrow. */
          .bhbc-brief-row{gap:8px!important}
          .bhbc-brief-row > *:nth-child(1){width:70px!important;font-size:8.5px!important;letter-spacing:0.04em!important}
          .bhbc-brief-row > *:nth-child(4){width:78px!important}
          /* THE DOT NEEDS A GUTTER, and on a phone there is none: the label is
             the row's first column, so a dot hung 21px to the left of the
             instruction lands ON the label - measured, "SETUP" ended at 74 and
             the dot sat at 61. It moves onto the label itself, where the row
             already has room, and takes the severity colour through --sev. */
          .bhbc-brief-dot{display:none!important}
          .bhbc-brief-row > *:nth-child(1){display:inline-flex!important;align-items:center;gap:5px;align-self:flex-start!important;margin-top:1px}
          .bhbc-brief-row > *:nth-child(1)::before{content:'';flex:0 0 auto;width:7px;height:7px;border-radius:50%;background:var(--sev,currentColor)}
          /* The instruction's 170px flex-basis is larger than the 137px the row
             can give it, so flex-wrap pushed it onto its OWN line and every
             item cost three. A basis it can actually have keeps it beside its
             label. */
          .bhbc-brief-row > *:nth-child(2){flex:1 1 110px!important}
          /* RTP ladder: 30px + 150px + gaps left the description 75.8px, so it
             broke words mid-syllable - PROGRESSI/VELY, ISOMETRIC/S,
             RESTRICTI/ONS - and the grid ran 933px for six one-line sentences.
             Number and stage on line one, description full width under them. */
          /* Microcycle: N days x 120px is a hard floor, so three days needed
             360 in a 305px card and the week scrolled sideways. Two columns on
             a phone, like the week grid beside it. */
          .bhbc-micro-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important;min-width:0!important}
          /* The month grid overflowed by 16px - seven cells at 5px/7px padding
             plus their borders exceed 305/7 = 43.5 each. Trimming the side
             padding to 3 closes it, so the month fits without scrolling. */
          .bhbc-cal-cell{padding:5px 3px!important;min-width:0!important;overflow:hidden!important}
          .bhbc-cal-cell *{min-width:0!important;max-width:100%!important}
          /* A MONTH CELL ON A PHONE SAYS WHEN (#509). It used to turn every
             session into a bare 5px bar - a month of coloured dashes that said
             nothing (Ohad 2.10: "very bad"). The cell is ~43px: the kind word
             and the venue do not fit, the TIME does - 9px "10:30" is ~27px -
             so each session is its time in the session's colour, on its tint. */
          .bhbc-cal-cell{gap:2px!important}
          .bhbc-cal-chip{padding:1px 2px!important;border-inline-start-width:2px!important;font-size:9px!important;letter-spacing:-0.01em}
          .bhbc-cal-chip > .bhbc-cal-kind, .bhbc-cal-chip > .bhbc-cal-where{display:none!important}
          .bhbc-cal-more{font-size:8.5px!important}
          /* Next game: the day count is 40px type in a column of its own, and
             with flex-wrap the details dropped BELOW it - so two characters
             owned about 200px of height and the card was mostly white. Keep
             them side by side and let the count be the size it needs. */
          .bhbc-nextgame{flex-wrap:nowrap!important;gap:14px!important;align-items:flex-start!important}
          .bhbc-nextgame > *:first-child{flex:0 0 auto!important}
          .bhbc-nextgame > *:nth-child(2){flex:1 1 auto!important;min-width:0!important}
        }
        @media (max-width:760px){
          /* ONE ROW. The logo is pinned and everything else scrolls past it -
             Ohad's rule, and I broke it by wrapping the header onto three rows,
             which ate a third of a phone screen and clipped the exit icon off
             the right edge. The whole bar is the horizontal scroller now and the
             identity block is sticky at its left, so the wordmark stays put
             while the tabs and controls slide under it. */
          .bhbc-header-inner{flex-wrap:nowrap!important;gap:0!important;padding-block:0!important;padding-inline:14px 0!important;min-height:56px!important;overflow-x:auto!important;overflow-y:hidden!important;-webkit-overflow-scrolling:touch;scroll-snap-type:x mandatory;scroll-padding-inline-start:var(--crest-w,88px)}
          /* AT REST A TAB STARTS RIGHT AFTER THE CREST (27.9, his shot: "EDULE"
             with SCH under the crest). Every tab is a snap point; the pinned
             crest plate is the scroll padding, so a settled bar never slices a
             word at the crest. The far edge is covered by the rail plate. */
          .bhbc-hdr-tabs button{scroll-snap-align:start}
          /* and the END of the bar is a snap point: without it mandatory snap
             stopped at the last tab-start and the exit control stayed 23px past
             the edge for good (27.9, found by the scroller-tail gate) */
          .bhbc-header-ctrl{scroll-snap-align:end}
          .bhbc-header-inner::-webkit-scrollbar{display:none}
          .bhbc-header-inner{scrollbar-width:none;-ms-overflow-style:none}
          /* The pinned identity block must be OPAQUE and must have an EDGE, or
             the tabs scroll UNDER it and show through - Ohad: "the side
             scrolling doesnt have borders and underflows under the logo". Solid
             fill, a hairline on its trailing edge, and a short shadow so the
             content visibly passes behind it. align-items centre so the crest
             sits on the row's axis, not its top. */
          .bhbc-header-id{position:sticky!important;inset-inline-start:-14px!important;z-index:3!important;flex:0 0 auto!important;align-self:stretch!important;display:flex!important;align-items:center!important;background:#0E1C38!important;margin-inline-start:-14px!important;padding-block:0!important;padding-inline:14px 32px!important;box-shadow:8px 0 12px -8px rgba(0,0,0,0.7)!important}
          [dir="rtl"] .bhbc-header-id{box-shadow:-8px 0 12px -8px rgba(0,0,0,0.7)!important}
          /* the plate OWNS the gap before the first visible tab: a tab rests at
             its edge, and no tail of the tab before it shows in between (27.9
             LOOK: a sliver of OVERVIEW's last letter sat in that gap) */
          .bhbc-hdr-tabs{padding-inline-start:0!important}
          /* The crest already says who this is; the words are 150px of a 390px bar. */
          .bhbc-wordmark{display:none!important}
          .bhbc-header-ctrl{order:3!important;flex:0 0 auto!important;padding:0 14px 0 0!important;margin-left:0!important}
          .bhbc-hdr-tabs{order:2!important;flex:0 0 auto!important;width:auto!important;overflow:visible!important;justify-content:flex-start!important;border-top:none!important}
          /* The tab BUTTON is not the bar. At 52px the active tab's orange
             outline became a full-height rectangle - on desktop it is a neat
             small box, and that difference is most of why the mobile bar read
             as heavy. Same 30px box as desktop, centred in the 52px bar. */
          .bhbc-hdr-tabs{align-items:center!important}
          .bhbc-hdr-tabs button{height:var(--btn-h)!important;padding:0 11px!important}
          /* The injury row is a fixed 5-column grid (150px 1fr 120px 110px auto)
             — about 430px before gaps, so on a phone it ran a good 130px past
             the viewport and the 'Update ›' target sat off-screen entirely.
             Restack it: name + status, then the injury, then days/pain + the
             action. Explicit areas because auto-placement reorders once one
             child spans the row. */
          /* THREE LINES, TWO EDGES (27.9, Ohad: "each box can be better designed
             for ocd"). Every line starts where the NAME starts (the jersey hangs
             in the 27px gutter) and ends on the status chip's edge:
               name ................ STATUS
               injury .............. reported by
               days · pain ......... UPDATE ›
             The Update action used to float on a fourth line, indented under
             nothing. */
          .bhbc-inj-row{grid-template-columns:minmax(0,1fr) auto!important;gap:6px 12px!important}
          .bhbc-inj-row>:nth-child(1){grid-area:1/1!important}
          .bhbc-inj-row>:nth-child(3){grid-area:1/2!important;justify-self:end!important}
          .bhbc-inj-row>:nth-child(2){grid-area:2/1!important;padding-inline-start:27px!important}
          .bhbc-inj-row>:nth-child(5){grid-area:2/2!important;justify-self:end!important;align-self:center!important}
          .bhbc-inj-row>:nth-child(4){grid-area:3/1!important;padding-inline-start:27px!important}
          .bhbc-inj-row>:nth-child(6){grid-area:3/2!important;justify-self:end!important;align-self:center!important}
          .bhbc-inj-head{display:none!important}
        }
        /* TWO ROWS BEFORE ANYTHING SCROLLS AWAY.
           Below 760 the WHOLE header became the horizontal scroller, so at 760
           the PREVIEW button, the language toggle and the theme and exit icons
           were simply not on screen - the tabs had pushed them out, and the only
           way to reach the עב toggle was to scroll a bar that does not look
           scrollable. Ohad, on a tablet: "fix the overflow".
           The bar wraps instead: identity and controls on the first row, always
           visible, and the TAB STRIP on its own row where it scrolls with the
           edge fade it already has. Nothing is hidden behind a gesture. */
        @media (max-width:1100px) and (min-width:521px){
          .bhbc-header-inner{flex-wrap:wrap!important;overflow:visible!important;row-gap:4px!important;column-gap:10px!important;padding:6px 14px!important;min-height:0!important}
          /* The phone rules pin the crest and give it an opaque plate so tabs
             scroll under it. On two rows nothing scrolls under anything, and
             that plate showed as a stray grey box beside the crest. */
          .bhbc-header-id{position:static!important;order:1!important;background:transparent!important;box-shadow:none!important;border:0!important;padding-inline-end:0!important}
          .bhbc-header-ctrl{order:2!important;margin-inline-start:auto!important}
          /* gap:0 from the phone block ran the tab labels together -
             "SCHEDULEWEIGHT ROOMMEDICAL". The strip gets its spacing back. */
          .bhbc-hdr-tabs{order:3!important;flex:1 1 100%!important;width:100%!important;overflow-x:auto!important;justify-content:flex-start!important;gap:10px!important;padding:0 0 2px!important}
          /* A TAB MUST NOT BE SQUEEZED. The box gaps were a tidy 10px and the
             LETTERS still collided: measured at 600 the ink gaps ran
             7, 6, -2, 1, 7, 10, 11 - "SCHEDULEWEIGHT ROOMMEDICAL" - because the
             buttons were shrinking and the text overflowed its own padding.
             They keep their size; the strip scrolls, which is what it is for. */
          .bhbc-hdr-tabs button{flex:0 0 auto!important}
        }
        /* THE LAST ROW DOES NOT DRAW A RULE INTO THE CARD'S OWN EDGE. Ohad:
           "there shouldnt be a cyan border after the last name and adjust the
           space to the end of the card/box after you remove it." A divider
           separates two rows; under the last one it is a second border a few
           pixels inside the card's border. Removing it leaves the row's own
           11px of padding plus the card's 14 - too much air under a list that
           just ended - so the last row's bottom padding comes down to 2. */
        .bhbc-inj-row:last-child{border-bottom:none!important;padding-bottom:2px!important}
      `}</style>
      {/* ---- ZONE TOP BAR — logo + wordmark + inline nav tabs + controls, one
           clean bar (EXPO-style; tabs moved up here from a separate row). ---- */}
      <header style={{ position: 'sticky', top: 0, zIndex: 50, background: HDR_BG, borderBottom: '1px solid rgba(255,255,255,0.07)', boxShadow: '0 2px 10px rgba(0,0,0,0.30)' }}>
        {/* the plates the rail hook sizes (no React state - the bar scrolls
            without re-rendering the zone); they absorb a tap, so a covered
            sliver of a tab cannot be tapped (27.9 review) */}
        <div ref={trailPlate} aria-hidden="true" data-rail-mask="" data-rail-occluder="" style={{ display: 'none', position: 'absolute', top: 0, bottom: 1, background: HDR_BG, zIndex: 4 }} />
        <div ref={leadPlate} aria-hidden="true" data-rail-mask="" data-rail-occluder="" style={{ display: 'none', position: 'absolute', top: 0, bottom: 1, background: '#0E1C38', zIndex: 4 }} />
        <div ref={headRef} className="bhbc-header-inner" style={{ maxWidth: 1280, margin: '0 auto', padding: '0 18px', minHeight: 54, display: 'flex', alignItems: 'center', gap: 14 }}>
          <div className="bhbc-header-id" data-rail-occluder="" style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, marginInlineEnd: 6 }}>
            {/* The crest goes HOME, like the EXPO logo does. */}
            <img src="/bnei-herzliya-logo-w.png" alt={tr('Bnei Herzliya BC')} onClick={() => setView('overview')}
              style={{ height: 30, width: 'auto', display: 'block', cursor: 'pointer' }} title={tr('Overview')} />
            {/* Wordmark on ONE line (Ohad: no stacked text in the top menu). */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, whiteSpace: 'nowrap' }}>
              {/* lineHeight:1 on BOTH, or they do not sit on the same line:
                  alignItems:center centres each span's BOX, and at 13.5px vs
                  11px the default line-heights give the two boxes different
                  heights, so the smaller text lands visibly high (Ohad: "the
                  2026/2027 is not vertically centered"). With line-height
                  pinned to the glyph size, centring the boxes centres the text.
                  Season bumped 9.5 → 11 ("slightly too small"). */}
              <span className="bhbc-wordmark" style={{ fontFamily: FN, fontWeight: 800, fontSize: 13, lineHeight: 1, color: 'var(--c-stripTx)', letterSpacing: '0.02em' }}>{tr('BNEI HERZLIYA')}</span>
            </div>
          </div>
          {/* Understated EXPO-style nav: tight left-aligned small tabs, active tab is
              an orange-outlined box (mirrors EXPO's cyan-outlined active). */}
          {/* minWidth: 0 (NOT max-content) — the strip must be allowed to shrink
              below its tabs so overflowX:auto actually scrolls on mobile instead
              of the zone's overflow-x:clip amputating the tail tabs. */}
          <nav ref={navRef} className="bhbc-hdr-tabs" style={{ display: 'flex', alignItems: 'center', justifyContent: 'safe center', gap: 6, flex: '1 1 auto', minWidth: 0, overflowX: 'auto' }}>
            {roster.length > 0 && NAV_TABS.map(([k, label]) => {
              const on = view === k;
              return (
                <button key={k} role="tab" aria-selected={on} onClick={() => setView(k)} className={on ? undefined : 'bhbc-tab'} style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: on ? '#fff' : 'rgba(255,255,255,0.5)', background: 'transparent', border: `1px solid ${on ? ORANGE : 'transparent'}`, borderRadius: 0, height: HDR_BTN_H, boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, padding: '0 11px', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'color .12s, border-color .12s' }}>{label}</button>
              );
            })}
          </nav>
          {/* One ink for EVERY control in this cluster. Sign out was
              rgba(255,255,255,0.7) while the theme toggle was 0.85, so they
              read as two different families sitting next to each other
              (Ohad: "make sure the sign out and the light/dark mode are the
              same color"). HDR_INK/HDR_BD are defined once at module scope. */}
          <div className="bhbc-header-ctrl" style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginInlineStart: 'auto' }}>
            {!coach && <button onClick={() => setPreviewCoach((v) => !v)} className="bhbc-tab" title={tr('See exactly what your BHBC coaches see')} style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: previewCoach ? '#fff' : HDR_INK, background: previewCoach ? ORANGE : 'transparent', border: `1px solid ${previewCoach ? ORANGE : HDR_BD}`, borderRadius: 0, height: HDR_BTN_H, boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, padding: '0 11px', cursor: 'pointer' }}>{previewCoach ? `● ${tr('Back')}` : `◉ ${tr('Preview')}`}</button>}
            {/* HE / EN. Fixed width so the control does not resize as the
                label changes — a control that changes size on click reads as a
                flash bug. Shows the language it will SWITCH TO, which is how a
                two-state language switch is read. */}
            <button onClick={() => setBhbcLang(he ? 'en' : 'he')}
              title={he ? 'Switch to English' : 'עברית'}
              style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: HDR_INK, background: 'transparent', border: `1px solid ${HDR_BD}`, borderRadius: 0, height: HDR_BTN_H, minWidth: 42, padding: '0 8px', cursor: 'pointer', boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
              {he ? 'EN' : 'עב'}
            </button>
            {/* The zone's own switch. The shared ThemeToggle writes the APP's
                theme, which the wrapper then overrode - the toggle looked dead
                and changed the Dashboard behind his back (Ohad: "dark mode
                doesnt work at all"). */}
            <button onClick={() => setBhbcTheme(zoneDark ? 'light' : 'dark')}
              aria-label={tr(zoneDark ? 'Switch to light mode' : 'Switch to dark mode')}
              title={tr(zoneDark ? 'Switch to light mode' : 'Switch to dark mode')}
              style={{ width: HDR_BTN_H, height: HDR_BTN_H, boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', color: HDR_INK, border: `1px solid ${HDR_BD}`, borderRadius: 0, cursor: 'pointer', padding: 0, flexShrink: 0 }}>
              {zoneDark ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </button>
            {/* The way back to EXPO is Ohad's alone, and it is a door, not a
                feature of the club zone. A bordered button with an exit arrow
                gave it the same weight as the tabs beside it; the mark says
                where it goes without competing with them (Ohad 08-30: "a small
                transparent expo icon"). Colourless on purpose - the club's
                header is its own brand, and EXPO blue inside it reads as a
                second logo. */}
            {onExit && !previewCoach && <button onClick={onExit} className="bhbc-tab" title={tr('Back to EXPO coach')} aria-label={tr('Back to EXPO coach')} style={{ background: 'transparent', border: `1px solid ${HDR_BD}`, borderRadius: 0, height: HDR_BTN_H, width: HDR_BTN_H, boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, padding: 0, cursor: 'pointer' }}>
              {/* The REAL EXPO mark. Ohad: "the bhbc is lacking expo icon which i
                  asked" - and he was right: I had drawn a bare chevron here,
                  which reads as a collapse caret, not as EXPO. expo-icon-lg.png
                  is the actual icon (white X, cyan caret, transparent ground),
                  so it says where the door goes. Small and slightly held back so
                  it does not compete with BNEI HERZLIYA beside it - it is a way
                  out, not a second logo. */}
              <img src={EXPO_ICON_LG_T} alt="" aria-hidden="true"
                className="bhbc-expo-mark"
                style={{ display: 'block', height: 18, width: 'auto' }} />
            </button>}
            {coach && onSignOut && <button onClick={onSignOut} className="bhbc-tab" title={tr('Sign out')} style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: HDR_INK, background: 'transparent', border: `1px solid ${HDR_BD}`, borderRadius: 0, height: HDR_BTN_H, boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, padding: '0 11px', cursor: 'pointer' }}>{tr('Sign out')}</button>}
          </div>
        </div>
      </header>

      {/* 14px between cards and 18 of page padding, from 20 and 24. Ohad on the
          desktop zone: "each box still has way too much extra space, beneath and
          above texts, all of them". The cards themselves came down from 18 to 14
          of padding and their rows from 11 to 8; this is the last of it. */}
      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '18px 18px 56px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* THE ZONE READ FROM CACHE. Measured with every Supabase call cut: the
            whole club zone still rendered - 10 of 10 players, medical, next
            game - and said nothing. A physio courtside on dead wifi was reading
            a confident screen that might be hours old. The data staying on
            screen is right; saying nothing about it is not. */}
        {stale && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 14px', background: C.sf, border: `1px solid ${ORANGE}`, borderRadius: 6, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: ORANGE_DEEP, lineHeight: 1.5 }}>{tr('Offline')}</span>
            <span style={{ fontFamily: FN, fontSize: 12, color: C.tm, flex: 1, minWidth: 200, lineHeight: 1.5 }}>{tr('Showing the last data saved on this device. It may be out of date, and anything you log will be sent when the connection returns.')}</span>
          </div>
        )}
        {previewCoach && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'rgba(242,106,43,0.10)', border: `1px solid ${ORANGE}`, borderRadius: 6 }}>
            <span style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: ORANGE_DEEP }}>◉ {tr('Coach view')}</span>
            <span style={{ fontFamily: FN, fontSize: 12, color: C.tm }}>{tr('This is exactly what your BHBC coaches see — no roster management, medical is view-only.')}</span>
            <button onClick={() => setPreviewCoach(false)} style={{ marginInlineStart: 'auto', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.tm, background: 'transparent', border: `1px solid ${C.cardBd}`, borderRadius: 4, padding: '5px 10px', cursor: 'pointer' }}>{tr('Exit preview')}</button>
          </div>
        )}
        {/* (The toolbar that repeated MANAGE ROSTER · LOG LIFT · LOG S&C on every
            tab is gone - each lives in its own card's strip now, 29.9 #396.) */}

        {roster.length === 0 ? (
          <Card header={secTitle('Roster')}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '28px 16px' }}>
              <img src="/logos/bhbc-logo.png" alt="" style={{ height: 68, opacity: 0.9, marginBottom: 8 }} />
              <div style={{ fontFamily: FN, fontWeight: 700, fontSize: 13, color: C.tx }}>{tr('No athletes on the roster yet')}</div>
              <div style={{ fontFamily: FB, fontSize: 13, color: C.td, marginBottom: 14, textAlign: 'center', maxWidth: 320 }}>{tr('Add the roster to start tracking load, availability and readiness.')}</div>
              {!asCoach && <Btn onClick={() => setManageOpen(true)} style={{ background: ORANGE, borderColor: ORANGE, color: '#fff' }}>{tr('Add athletes')}</Btn>}
            </div>
          </Card>
        ) : (
          // ONE VIEW CANNOT TAKE THE ZONE DOWN (29.9 #436): the only boundary
          // was App's, around the whole zone, so a throw in any card blanked
          // the tabs too. Keyed by view, a broken view shows its error in
          // place, the header and tabs stay, and another tab recovers.
          <ErrorBoundary key={view} inline>
          <div className="motion-rise" style={{ display: 'flex', flexDirection: 'column', gap: 'inherit' }}>

            {view === 'overview' && (
              <>
                <ReturnLoadAlert roster={roster} loads={bhbcLoads} medical={medical} today={today} onOpen={setDetailFor} />
                <HeadCoachReport rows={rows} fx={fx} fixtures={bhbcFixtures} medical={medical} loads={bhbcLoads} today={today} onOpen={setDetailFor}
                  onMedical={null}   /* see MED on the load board — same closure, one screen */
                  onReportNew={effCanMedical ? (() => setInjuryFor({ athleteId: (rows[0] && rows[0].t.id) || '' })) : null}
                  /* The staff brief is this report now: its COPY moved into the
                     header. */
                  copied={briefCopied}
                  onCopy={() => {
                    const txt = staffBriefText({ today, fx, rows, medical, he, tr });
                    try { navigator.clipboard.writeText(txt); } catch { /* denied - it is all on screen anyway */ }
                    setBriefCopied(true); setTimeout(() => setBriefCopied(false), 1800);
                  }} />
                <FixturesAheadPanel fixtures={bhbcFixtures} today={today} />
                {/* Three of its four numbers need an sRPE per session. Until one is
                    logged this card is four dashes, printed every morning. */}
                {(team.avg != null || (team.week || 0) > 0) && <TeamSnapshotCard team={team} />}
                <LoadBoard rows={rows} rowGrid={rowGrid} cycleAvail={canLog ? cycleAvail : null} medical={medical} loads={bhbcLoads} today={today} onOpen={setDetailFor}
                  onMedical={effCanMedical ? ((aid) => { const a = activeInjuries(medical, aid); setInjuryFor({ athleteId: aid, injuryId: a[0] && a[0].id }); }) : null} />
              </>
            )}

            {view === 'lifts' && (
              <LiftsTab rows={rows} loads={bhbcLoads} medical={medical} today={today} onOpen={setDetailFor}
                action={canLog ? <StripBtn onClick={() => setLogFor('new')}>{tr('Log lift')}</StripBtn> : null} />
            )}

            {view === 'schedule' && (
              <>
                {fx.nextGame && <NextGamePanel nextGame={fx.nextGame} today={today} onEdit={asCoach ? null : () => setGameEdit(true)} />}
                {/* THE CALENDAR RIGHT AFTER THE WEEK (Ohad 27.9: "scheduele should be
                    after week planner, before practice attendance"). */}
                <ScheduleTool fx={fx} fixtures={bhbcFixtures} today={today} mode={schedMode} setMode={setSchedMode} />
                <MicrocycleView fx={fx} today={today} />
              </>
            )}

            {/* PRACTICES, apart from the SCHEDULE (29.9 #401, Ohad: "split practices
                and scheduele, and leave each element, table and built where it
                fits"): the week's practices with their S&C, who was at each, and
                what was done. The calendar, the next game and the microcycle stay
                on SCHEDULE. */}
            {view === 'practices' && (
              <>
                {/* Plan the week HERE (Ohad 08-24) — coaches see the board read-only. */}
                {/* fixtures={bhbcFixtures} was MISSING, and the prop defaults to []
                    - so the planning board showed "WEEK PLANNER (0 SESSIONS · 0
                    S&C)" and "NO SESSIONS" on all seven days no matter what was
                    scheduled. Photographed 19.9 at 360: the Overview card on the
                    same screen said today has an 18:00 practice while the planner
                    underneath it said the week was empty. Every sibling here
                    already passed it; this one was skipped. */}
                {/* NO SESSION EDITING HERE (Ohad 26.9: "the bhbc system is still
                    letting me edit practice plans. no need for it!!!!" / "bhbc
                    should only let me attach an s&c team session"). The schedule
                    comes from the club calendar; a practice offers exactly one
                    action — attach the S&C team session to it. 29.9 #398 adds the
                    second he asked for: CANCEL (and RESTORE) a session. */}
                <WeekPlanner fixtures={bhbcFixtures} today={today} loads={bhbcLoads} athleteIds={roster.map((t) => t.id)}
                  onUpsert={null} onRemove={null} onCancel={canLog ? setFixtureCancelled : null}
                  onAttachSc={canLog ? (date, start) => { setScPreset({ date, start }); setPracticeOpen(true); } : null}
                  action={canLog ? <StripBtn onClick={() => { setScPreset(null); setPracticeOpen(true); }}>{tr('Log S&C Session')}</StripBtn> : null} />
                {/* WHO TRAINED AND WHO DIDN'T, as a month grid (Ohad 20.9: "i
                    want an easy way to view the history of who trained
                    (basketball) and who didn't like the weight room view").
                    It sits ABOVE the slot-by-slot list because the glance comes
                    first and the detail second - same order as the weight room. */}
                <CourtAttendanceTab rows={rows} loads={bhbcLoads} medical={medical} fixtures={bhbcFixtures} today={today} onOpen={setDetailFor} />
                {/* What the team ACTUALLY did, slot by slot (Ohad 08-24:
                    "where can I see the previous practices details?"). */}
                <PastPractices fixtures={bhbcFixtures} loads={bhbcLoads} roster={roster} today={today} medical={medical} />
              </>
            )}

            {view === 'roster' && (
              <>
                <RosterGrid rows={rows} ghosts={ghosts} medical={medical} league={league} loads={bhbcLoads} onOpen={setDetailFor}
                  action={!asCoach ? <StripBtn onClick={() => setManageOpen(true)}>{tr('Manage roster')}</StripBtn> : null} />
              </>
            )}

            {view === 'games' && (
              <LeagueView league={league} roster={roster} fixtures={bhbcFixtures} onOpen={setDetailFor}
                bhbcLoads={bhbcLoads} today={today} onPickMinutes={setMinutesFor} />
            )}

            {view === 'activity' && !asCoach && (
              <ActivityView activity={activity} tr={tr} he={he} />
            )}

            {view === 'medical' && (
              <MedicalView roster={roster} rows={rows} loads={bhbcLoads} medical={medical} canMedical={effCanMedical} onLog={canLog ? ((aid) => setLogFor(aid)) : null} onReport={(aid) => setInjuryFor({ athleteId: aid })} onEdit={(aid, iid) => setInjuryFor({ athleteId: aid, injuryId: iid })} onOpen={setDetailFor} />
            )}

          </div>
          </ErrorBoundary>
        )}
      </main>

      <style>{`
        /* Legible secondary text: brighter muted/dim greys, theme-aware, scoped to
           the zone (Ohad: dark-mode grey text was too faded). */
        .bhbc-zone{ --c-tm:#6B727B; --c-td:#5F666F; }
        .bhbc-zone[data-theme="dark"]{ --c-tm:#AEB4BD; --c-td:#B6BCC5; }
        :root { --bhbc-ha-home: ${NAVY}; --bhbc-ha-away: ${ORANGE_DEEP}; --bhbc-amber-text: #8A6410; }
        :root[data-theme="dark"] { --bhbc-ha-home: #7FA9E8; --bhbc-ha-away: #F0955F; --bhbc-amber-text: #E0A73A; }
        /* The zone carries its OWN data-theme on .bhbc-zone, not on :root, so a
           light APP with a dark ZONE resolved the light navy #1E3D74 onto the
           zone's near-black page - measured 1.86:1 by the light/dark parity
           sweep, i.e. the HOME chip was all but invisible. Scope the tones to
           the zone too, the way --c-tm/--c-td two lines above already are. */
        .bhbc-zone[data-theme="light"] { --bhbc-ha-home: ${NAVY}; --bhbc-ha-away: ${ORANGE_DEEP}; --bhbc-amber-text: #8A6410; }
        .bhbc-zone[data-theme="dark"] { --bhbc-ha-home: #7FA9E8; --bhbc-ha-away: #F0955F; --bhbc-amber-text: #E0A73A; }
        .bhbc-roster-actions{display:inline-grid;grid-auto-flow:column;grid-auto-columns:1fr}
                .bhbc-row{transition:background 120ms}
        .bhbc-row:hover{background:color-mix(in srgb, ${NAVY} 6%, transparent)}
        .bhbc-card:hover{transform:translateY(-2px);box-shadow:0 6px 18px rgba(6,16,37,0.14)}
      `}</style>

      {/* ---- PROGRAM POPUP (the athlete's EXPO block, read-only, in-zone) ---- */}
      {programFor && (
        <ProgramModal
          athleteName={(roster.find((t) => t && t.id === programFor) || {}).name || ''}
          plans={(planIndex || [])
            .filter((p) => String(p.traineeId || '').split('__')[0] === programFor)
            .slice()
            .sort((a, b) => {
              const n = (x) => { const m = String(x.name || '').match(/#\s*(\d+)/); return m ? +m[1] : 0; };
              return n(b) - n(a);
            })}
          exercises={exercises}
          currentWeek={(() => {
            // The week he is actually IN: the highest week logged against this
            // athlete, which is what the portal counts too. No logs yet = W1.
            const mine = (clientWorkouts || []).filter((w) => String(w.clientId || '').split('__')[0] === programFor);
            const wk = mine.map((w) => Number(w.week)).filter((n2) => Number.isFinite(n2) && n2 > 0);
            return wk.length ? Math.max(...wk) : 1;
          })()}
          onClose={() => setProgramFor(null)}
        />
      )}

      {/* ---- LOG S&C SESSION (the practice's attendance + the team S&C block) ---- */}
      {practiceOpen && (
        <ScSessionModal roster={roster} bhbcLoads={bhbcLoads} fixtures={bhbcFixtures} medical={medical}
          initialDate={scPreset ? scPreset.date : null} initialStart={scPreset ? scPreset.start : null}
          onClose={() => { setPracticeOpen(false); setScPreset(null); }} onSave={(p) => { saveScSession(p); setPracticeOpen(false); setScPreset(null); }} />
      )}

      {/* WELLNESS CHECK-IN — every entry point removed on Ohad's instruction
          ("remove the check-in option for now"). WellnessModal and saveCheckin
          are deliberately left in the file, unused: "for now" means he expects
          to want it back, and deleting the component would turn restoring it
          into a rebuild instead of re-adding one button. */}

      {gameEdit && fx.nextGame && (
        <GameEditModal game={fx.nextGame} onClose={() => setGameEdit(false)} onSave={(patch) => { updateGame(fx.nextGame, patch); setGameEdit(false); }} />
      )}
        {minutesFor && (
          <GameMinutesModal game={minutesFor} roster={roster} bhbcLoads={bhbcLoads} medical={medical}
            onClose={() => setMinutesFor(null)}
            onSave={({ date, minutes, opened }) => {
              // ONLY WHAT CHANGED IS WRITTEN (#305 N-F1). The sheet holds every
              // player's minutes, and a Save with one correction rewrote all ten
              // records (and pinged every open zone for nothing). Untouched
              // players are left exactly as stored; a touched row keeps its
              // league line (applyGameMinutes edits the row, 27.9 review).
              const saved = opened || gameMinutesOf(bhbcLoads || {}, date);
              const changed = {};
              for (const [id, v] of Object.entries(minutes || {})) {
                if ((Number(v) || 0) !== (Number(saved[id]) || 0)) changed[id] = v;
              }
              if (!Object.keys(changed).length) { setMinutesFor(null); return; }
              setBhbcLoads((prev) => applyGameMinutes(prev, { date, minutes: changed, emptyRec }));
              // WHO PLAYED WHILE MARKED OUT (#305 F4). The game row is the fact
              // for that day - the grids already show him as played - and the
              // mismatch goes on the record instead of passing silently.
              const clash = roster.filter((t) => Number(changed[t.id]) > 0 && availOn(bhbcLoads[t.id], medical, t.id, date) >= 4).length;
              toast('Minutes saved');
              track('game', `logged game minutes for ${fmtNumericDate(date)}${clash ? ` · ${clash} marked out that day played` : ''}`);
              notify();
              setMinutesFor(null);
            }} />
        )}

      {injuryFor && effCanMedical && (() => {
        const ath = roster.find((t) => t.id === injuryFor.athleteId);
        if (!ath) return null;
        const existing = injuryFor.injuryId ? ((medical[injuryFor.athleteId] || {}).injuries || []).find((i) => i.id === injuryFor.injuryId) : null;
        // 17.9, the club physio: an injury from a few days ago "only let me log it as today". With
        // one injury active every entry point opened THAT record, so a new problem could only go in
        // as a progress note - always dated today. The modal now lists the athlete's active records,
        // opens a blank one on "+ New injury", and offers the recent games as the onset date.
        return <InjuryModal key={injuryFor.injuryId || 'new'} athlete={ath} injury={existing} currentUser={currentUser}
          active={activeInjuries(medical, injuryFor.athleteId)} history={((medical[injuryFor.athleteId] || {}).injuries) || []} today={today}
          onSwitch={(id) => setInjuryFor({ athleteId: injuryFor.athleteId, injuryId: id })}
          onClose={() => setInjuryFor(null)} onSave={(injury) => { saveInjury({ athleteId: injuryFor.athleteId, injury }); setInjuryFor(null); }} />;
      })()}

      {/* ---- MANAGE ROSTER MODAL ---- */}
      <BModal open={manageOpen} onClose={() => setManageOpen(false)} wide title={tr('Manage roster')}>
        <div style={{ fontFamily: FB, fontSize: 13, color: C.td, marginBottom: 12 }}>
          {tr('Tag athletes into Bnei Herzliya. They keep their normal athlete portal — this scopes who appears in the BHBC zone.')}
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 14, alignItems: 'stretch' }}>
          <input value={newAthlete} onChange={(e) => setNewAthlete(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && newAthlete.trim()) addAthlete(); }}
            placeholder={tr('Add a new athlete — full name')} style={{ flex: 1, height: 38, boxSizing: 'border-box', fontFamily: FB, fontSize: 13, color: C.tx, background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: '0 10px' }} />
          <Btn disabled={!newAthlete.trim()} onClick={addAthlete}
            style={{ height: 38, boxSizing: 'border-box', background: newAthlete.trim() ? ORANGE : undefined, borderColor: newAthlete.trim() ? ORANGE : undefined, color: newAthlete.trim() ? '#fff' : undefined }}>{tr('+ Add')}</Btn>
        </div>
        <div style={{ maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* club first, by jersey; everyone else by name, so a player is findable (#305 N-A7) */}
          {trainees.filter((t) => t.status !== 'Archived').sort((a, b) => ((b.team === 'BHBC' ? 1 : 0) - (a.team === 'BHBC' ? 1 : 0)) || (a.team === 'BHBC' ? (a.jersey ?? 999) - (b.jersey ?? 999) : String(a.name || '').localeCompare(String(b.name || '')))).map((t) => {
            const on = t.team === 'BHBC';
            return (
              <div key={t.id} className="bhbc-manage-row" style={{ padding: '9px 12px', border: `1px solid ${C.cardBd}`, borderInlineStart: on ? `3px solid ${ORANGE}` : '3px solid transparent', background: on ? `color-mix(in srgb, ${NAVY} 6%, transparent)` : 'transparent' }}>
                <input type="checkbox" checked={on} onChange={(e) => setTeam(t.id, e.target.checked)} style={{ accentColor: NAVY, width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }} />
                <span style={{ width: 24, display: 'inline-flex', justifyContent: 'center', flexShrink: 0 }}>{on && t.jersey != null && <Jersey n={t.jersey} size={22} />}</span>
                <span style={{ minWidth: 0, fontFamily: FN, fontSize: 13, fontWeight: on ? 700 : 500, color: C.tx, whiteSpace: 'normal', overflowWrap: 'break-word' }}>{t.name}</span>
                {on && (
                  <button type="button" aria-pressed={!!t.bhbcGhost} onClick={() => setGhost(t.id, !t.bhbcGhost)} className="bhbc-ghost-btn" title={tr('A ghost stays on the roster but is not counted anywhere')}
                    style={{ flexShrink: 0, height: 26, minHeight: 26, padding: '0 9px', boxSizing: 'border-box', fontFamily: FN, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.bhbcGhost ? C.tx : C.td, background: t.bhbcGhost ? 'var(--c-sf2)' : 'transparent', border: `1px ${t.bhbcGhost ? 'solid' : 'dashed'} ${C.cardBd}`, borderRadius: 0, cursor: 'pointer' }}>{tr('Ghost')}</button>
                )}
                {on && (
                  <span className="bhbc-manage-meta">
                    <span style={{ minWidth: 0, fontFamily: FB, fontSize: 11, color: C.td, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tr(t.position) || ''}</span>
                    {/* A LANDING DATE ONLY MATTERS UNTIL THEY LAND.
                        Ohad, 21.9: "make sure that i only see when the players
                        landed where it matters... its old news and it's showing
                        everywhere right now". This modal put a date field on
                        every row, so twenty players who arrived months ago each
                        carried a stale date at full strength. Future or unset ->
                        the field, because it is a fact still ahead of you or one
                        to record. Already landed -> one muted word, and clicking
                        it brings the field back so a wrong date is still
                        fixable. The roster-card badge was already future-only.

                        LABEL ABOVE THE FIELD, not beside it (Ohad, same day:
                        "they should stack vertically one above each other").
                        Side by side the label ate the width the position needed
                        and the pair read as two loose items. */}
                    {(!t.arrival || t.arrival > todayISO() || editArrival === t.id) ? (
                      <span style={{ flexShrink: 0, display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3 }} title={tr('Landing / arrival date')}>
                        <span style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.tm }}>{tr('Lands')}</span>
                        <input type="date" value={t.arrival || ''} onChange={(e) => setArrival(t.id, e.target.value)} style={{ fontFamily: FN, fontSize: 11, color: C.tx, background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: '4px 6px' }} />
                      </span>
                    ) : (
                      <button type="button" onClick={() => setEditArrival(t.id)} title={tr('Landing / arrival date')}
                        style={{ flexShrink: 0, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.td }}>{tr('Landed')}</button>
                    )}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </BModal>

      {/* ---- LOG LIFT (one athlete, any day, personal) ---- */}
      {logFor && (
        <LiftModal open={!!logFor} initialAthlete={logFor === 'new' ? (roster[0]?.id || '') : logFor} roster={roster} loads={bhbcLoads}
          onClose={() => { setLogFor(null); if (liftReturn) { setDetailFor(liftReturn); setLiftReturn(null); } }}
          onSave={(payload) => { logLift(payload); setLogFor(null); if (liftReturn) { setDetailFor(liftReturn); setLiftReturn(null); } }} />
      )}

      {/* ---- ATHLETE DETAIL (in-zone) ---- */}
      {detailFor && (() => {
        const row = rows.find((r) => r.t.id === detailFor);
        if (!row) return null;
        // Bodyweight trend = portal weigh-ins (shared bwLog) + BHBC practice
        // weigh-ins (rec.bw), merged by date (portal wins a same-day tie),
        // oldest→newest — the exact same chart the trainee page/portal show.
        const bwByDate = {};
        Object.entries((bhbcLoads[detailFor] || {}).bw || {}).forEach(([d, kg]) => { const v = parseFloat(kg); if (Number.isFinite(v)) bwByDate[String(d).slice(0, 10)] = v; });
        (bwLog || []).forEach((b) => { if (String(b.clientId || '').split('__')[0] !== detailFor) return; const v = parseFloat(b.bw); if (Number.isFinite(v)) bwByDate[String(b.date).slice(0, 10)] = v; });
        const bwEntries = Object.entries(bwByDate).map(([date, bw]) => ({ date, bw })).sort((a, b) => a.date.localeCompare(b.date));
        // Current training block (from the EXPO plan index) so the modal shows
        // what the athlete is actually training, not just league stats.
        const _bn = (n) => { const m = String(n || '').match(/#\s*(\d+)/); return m ? +m[1] : 0; };
        const aPlans = (planIndex || []).filter((p) => String(p.traineeId || '').split('__')[0] === detailFor);
        const curPlan = aPlans.slice().sort((a, b) => _bn(b.name) - _bn(a.name))[0] || null;
        const program = { count: aPlans.length, current: curPlan ? curPlan.name : null };
        return <AthleteModal row={row} rec={bhbcLoads[detailFor]} days28={last28} bw={bwEntries} program={program} fixtures={bhbcFixtures} medicalAll={medical}
          workouts={(clientWorkouts || []).filter((w) => String(w.clientId || '').split('__')[0] === detailFor)}
          leaguePlayer={(() => { const lp = leaguePlayerFor(league, row.t); return lp ? { ...lp, log: (lp.log || []).map((g) => withCalendarOpp(bhbcFixtures, g)) } : lp; })()} leagueLog={leagueLogFor(league, row.t).map((g) => withCalendarOpp(bhbcFixtures, g))} initialKind={{ lifts: 'lift', games: 'game' }[view] || 'all'} leagueSeason={league.season} leagueUpdatedAt={league.updatedAt}
          injuries={activeInjuries(medical, detailFor)}
          onInjury={effCanMedical ? (() => { const a = activeInjuries(medical, detailFor); setInjuryFor({ athleteId: detailFor, injuryId: a[0] && a[0].id }); setDetailFor(null); }) : null}
          onClose={() => setDetailFor(null)}
          onLog={canLog ? () => { setLiftReturn(detailFor); setLogFor(detailFor); setDetailFor(null); } : null}
          onOpenExpo={!asCoach && onOpenTrainee ? () => onOpenTrainee(detailFor) : null}
          onViewProgram={() => { setProgramFor(detailFor); setDetailFor(null); }}
          onCycleAvail={canLog ? (code) => cycleAvail(detailFor, code) : null}
          onEditSession={asCoach ? null : (date, idx, min, sig) => editSession(detailFor, date, idx, min, sig)}
          onDeleteSession={asCoach ? null : (date, idx, sig) => deleteSession(detailFor, date, idx, sig)} />;
      })()}
    </div>
    </BhbcTheme.Provider>
    </LangCtx.Provider>
    </BhbcLangCtx.Provider>
  );
}

function BarChart({ series, w = 460, h = 88 }) {
  const vals = (series || []).map((v) => v || 0);
  const n = vals.length || 1;
  const max = Math.max(1, ...vals);
  const bw = w / n;
  const hasData = vals.some((v) => v > 0);
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: 'block', height: 88 }} aria-hidden="true">
      <line x1="0" y1={h - 1} x2={w} y2={h - 1} stroke="currentColor" opacity="0.16" />
      {!hasData && <line x1="0" y1={h - 3} x2={w} y2={h - 3} stroke="currentColor" strokeDasharray="3 4" opacity="0.3" />}
      {vals.map((v, i) => { const bh = hasData ? (v / max) * (h - 6) : 0; return <rect key={i} x={i * bw + 1} y={h - bh - 1} width={Math.max(1, bw - 2)} height={bh} fill={ORANGE} opacity={v > 0 ? 0.9 : 0} />; })}
    </svg>
  );
}

// ONE GAME, ITS WHOLE LINE (27.9, Ohad: "his minutes. shot attempts. makes.
// 2/3 free throw defensive. everything!!! everything from the stat sheets and
// the online league stats"). Every number the league publishes for the player,
// read from the row the box-score logger wrote (or the league feed's line).
// Nothing is computed that the source did not give, except shooting %.
// FULL WORD FIRST, THE SHORT FORM ONLY WHEN IT WOULD OVERFLOW (27.9, Ohad:
// "תשתדל להשתמש במילים מלאות אם זה נכנס בלי לגלוש"). Same font size either
// way - only the wording changes (his 04:12 rule). Measured on mount and on
// every resize: the cell decides, not a guess about the device.
function FullOrShort({ full, short, style }) {
  const ref = useRef(null);
  const [useShort, setUseShort] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current; if (!el || !short || short === full) return undefined;
    const check = () => {
      el.textContent = full;
      const over = el.scrollWidth > el.clientWidth + 0.5;
      el.textContent = over ? short : full;
      setUseShort(over);
    };
    check();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(check) : null;
    if (ro) ro.observe(el);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(check).catch(() => {});
    return () => { if (ro) ro.disconnect(); };
  }, [full, short]);
  return <div ref={ref} title={useShort ? full : undefined} style={{ ...style, whiteSpace: 'nowrap', overflow: 'hidden', minWidth: 0 }}>{useShort ? short : full}</div>;
}

// the competition's short name for one-row lines (a title fits by wording)
const COMP_SHORT = { 'Winner Cup': 'Cup', 'Winner League': 'League', 'Premier League': 'League', 'State Cup': 'Cup' };
// ONE SECTION HEAD IN THE ATHLETE POPUP (29.9 #413, Ohad: "the entire card pop
// up can be slightly better designed"). Medical was a 48px row with a pill in
// it, Full history a 38px white row, League Stats a navy strip inside an
// orange frame, Bodyweight a bare 9px caption - four sections, four headers.
// Now every section is the same bordered box under the same 40px band: the
// label, its meta right after it, an action (if any) at the end.
function PopHead({ label, meta = null, right = null, flush = false, dataKey }) {
  return (
    <div data-pop-head={dataKey || ''} style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 40, boxSizing: 'border-box', padding: '0 12px', background: 'var(--c-sf2)', borderBottom: flush ? 'none' : `1px solid ${C.cardBd}` }}>
      <span style={{ fontFamily: FN, fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.tx, whiteSpace: 'nowrap' }}>{label}</span>
      {meta != null && meta !== '' ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.tm, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{meta}</span> : null}
      {right ? <span style={{ marginInlineStart: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>{right}</span> : null}
    </div>
  );
}

function GameLineModal({ line, onClose }) {
  const tr = useT();
  const b = line.box || {};
  const ma = (x) => (x && typeof x === 'object' ? x : null);
  const pct = (x) => (x && x.a ? `${Math.round((x.m / x.a) * 100)}%` : '—');
  const fg2 = ma(b.fg2), fg3 = ma(b.fg3 || b.tp), ft = ma(b.ft);
  const fg = fg2 && fg3 ? { m: fg2.m + fg3.m, a: fg2.a + fg3.a } : null;
  const v = (x) => (x == null || Number.isNaN(x) ? '—' : x);
  // THE BOX SCORE'S OWN ABBREVIATIONS (27.9, Ohad: "turnovers is not
  // fitting/overlaying"): "TURNOVERS" at 9px ran 20px past a quarter of a 390
  // phone into BLOCKS. The league card above already reads PTS / REB / AST /
  // MIN, so the full line uses the same words, and every label fits its cell.
  // [full word, short form, value, sub]: the full word wherever it fits
  const L = (full, short) => ({ full: tr(full), short: tr(short) });
  const tiles = [
    [L('Minutes', 'MIN'), v(line.min ?? b.min)], [L('Points', 'PTS'), v(b.pts)], [L('PIR', 'PIR'), v(b.pir)], [L('+/-', '+/-'), v(b.pm)],
    [L('FG', 'FG'), fg ? `${fg.m}/${fg.a}` : '—', fg ? pct(fg) : ''], [L('2P', '2P'), fg2 ? `${fg2.m}/${fg2.a}` : '—', fg2 ? pct(fg2) : ''],
    [L('3P', '3P'), fg3 ? `${fg3.m}/${fg3.a}` : '—', fg3 ? pct(fg3) : ''], [L('FT', 'FT'), ft ? `${ft.m}/${ft.a}` : '—', ft ? pct(ft) : ''],
    [L('Off. reb', 'OREB'), v(b.oreb)], [L('Def. reb', 'DREB'), v(b.dreb)], [L('Rebounds', 'REB'), v(b.reb)], [L('Assists', 'AST'), v(b.ast)],
    [L('Steals', 'STL'), v(b.stl)], [L('Turnovers', 'TO'), v(b.to)], [L('Blocks', 'BLK'), v(b.blk)], [L('Fouls', 'PF'), v(b.pf)],
  ];
  return (
    <BModal open onClose={onClose} title={<>{line.opp ? `${tr('vs')} ${line.opp}` : tr('Game')}<span className="bm-lead"> · {monDay(line.date)}</span></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* ONE ROW AT THE HOUSE SIZE, FITTED BY WORDING (27.9, Ohad: "Friday to
            starter need to fit in one row" / "font size must be the same
            everywhere ... just use different wording"): the date day-first
            and numeric, the competition's short name. */}
        <div style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.tm, whiteSpace: 'nowrap' }}>
          {[`${dow(line.date)} ${ddmm(line.date)}`, line.comp ? tr(COMP_SHORT[line.comp] || line.comp) : null, line.home == null ? null : tr(line.home ? 'Home' : 'Away'), b.starter ? tr('Starter') : null].filter(Boolean).join(' · ')}
        </div>
        {/* hairlines are each cell's own border, not 1px of background showing
            through a gap: at 360 the columns are 75.5px wide, so the gaps sat
            on half pixels and every line drew at a different weight (#300 O5).
            Borders snap to whole pixels. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', background: 'var(--c-sf)', border: `1px solid ${C.cardBd}` }}>
          {tiles.map(([k, val, sub], ti) => (
            <div key={k.short} style={{ background: 'var(--c-sf)', padding: '9px 10px', minWidth: 0, borderInlineStart: ti % 4 ? `1px solid ${C.cardBd}` : 'none', borderTop: ti >= 4 ? `1px solid ${C.cardBd}` : 'none' }}>
              {/* numbers and +/- are LTR runs inside an RTL cell: isolated, or
                  Hebrew shows "-/+" and "12-" (27.9 LOOK at 360 he) */}
              {k.short === '+/-'
                ? <div style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.tm, whiteSpace: 'nowrap' }}><bdi dir="ltr">+/-</bdi></div>
                : <FullOrShort full={k.full} short={k.short} style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.tm }} />}
              <div style={{ fontFamily: FN, fontSize: 18, fontWeight: 800, color: C.tx, marginTop: 4, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}><bdi dir="ltr">{val}</bdi></div>
              {sub ? <div style={{ fontFamily: FN, fontSize: 10, color: C.tm, marginTop: 1 }}>{sub}</div> : null}
            </div>
          ))}
        </div>
        <div style={{ fontFamily: FB, fontSize: 11, color: C.td }}>{line.source === 'basket.co.il' || String(line.source || '').startsWith('basket.co.il') ? tr('Source: the league box score (basket.co.il).') : line.box ? tr('Source: the logged box score.') : tr('Only the minutes were logged for this game.')}</div>
      </div>
    </BModal>
  );
}

function AthleteModal({ initialKind = 'all', row, rec, days28, bw = [], program = null, workouts = [], leaguePlayer, leagueLog = [], leagueSeason, leagueUpdatedAt, injuries = [], onInjury, onClose, onLog, onOpenExpo, onViewProgram, onCycleAvail, onEditSession, onDeleteSession, fixtures = [], medicalAll = null }) {
  const tr = useT();   // `t` below is the TRAINEE, hence `tr` for the translator
  const heM = useHe();
  const [editSess, setEditSess] = useState(null); // { date, idx, min } — inline minutes edit in the history
  // opens on what the coach came from (#305 C6): Lifts tab -> lifts, Games -> games
  const [histKind, setHistKind] = useState(initialKind);  // which chip is picked
  const [monthOpen, setMonthOpen] = useState({});   // month → open; unset = newest open, rest shut
  // SEASON, THEN MONTH (27.9, Ohad: "it should show by season then months").
  // A season runs August to July (2026/27). Newest season open, the rest shut.
  const [seasonOpen, setSeasonOpen] = useState({});
  const [gameOpen, setGameOpen] = useState(null);   // the game line in the popup
  const [showPast, setShowPast] = useState(false);  // past seasons behind a button
  const { t, acwr, avail, readiness } = row;
  const loads = (rec && rec.loads) || {};
  const rc = readiness.level === 'red' ? '#DE4E3B' : readiness.level === 'amber' ? '#E0A73A' : readiness.level === 'green' ? '#37B27C' : '#7C828B';
  const availFloor = (injuries || []).reduce((worst, inj) => Math.max(worst, MEDICAL_STATUS_AVAIL[inj.status] || 1), 1);
  // Unified activity: the zone's own session rows + detailed EXPO gym sessions (client_workouts).
  let activity = [];
  // TWO DISTINCT KINDS, NAMED. Ohad, 24.9: the team S&C block and a personal
  // lift "are combined or messed up" — this timeline folded both into one
  // "Gym" line. A row is labelled by what rowKind says it IS: an S&C session
  // (team, at a practice), a Lift (his own), a practice (attendance), a game.
  // EXPO's set-by-set gym workouts keep their own "Gym" chip below.
  // 'S&C' in a row: the chip above already says S&C SESSIONS, and the long word
  // broke every phone row onto three lines (26.9).
  const KIND_WORD = { sc: 'S&C', lift: 'Lift', practice: 'Practice', game: 'Game' };
  const rowLabel = (s) => {
    const k = rowKind(s);
    if (k === 'practice' && s.type && String(s.type).toLowerCase() !== 'practice') return tr(String(s.type));   // Shootaround keeps its word
    return tr(KIND_WORD[k] || String(s.type || 'Session'));
  };
  // Branch on whether an RPE was ever recorded, NOT on whether the load is
  // zero (audit #71): a stale sRPE row still prints its RPE; everything logged
  // since 23.9 has none and reads minutes or "attended".
  // A GAME READS AS WHO IT WAS AGAINST, and opens its full line (27.9, Ohad:
  // "vs who? instead of game. then pop up option with all the stats").
  const gameLineOf = (d, s) => ({ date: d, opp: s.opp || null, comp: s.comp || null, home: s.home ?? null, start: s.start || '', min: s.min, box: s.box || null, source: s.source || null });
  Object.entries((rec && rec.sessions) || {}).forEach(([d, arr]) => (arr || []).forEach((s, idx) => activity.push(rowKind(s) === 'game' ? {
    kind: 'game', date: d, note: s.note || '', gameLine: gameLineOf(d, s),
    label: `${s.opp ? `${tr('vs')} ${s.opp}` : tr('Game')} · ${s.min ? s.min + '\u00a0' + tr('min') : tr('played')}`,
    load: null, sess: { date: d, idx, min: s.min, sig: sessionSig(s) }, by: s.by || null,
  } : { kind: rowKind(s), date: d, note: s.rpe == null ? (s.note || '') : '', label: s.rpe == null ? `${s.start ? s.start + ' · ' : ''}${rowLabel(s)} · ${s.min ? s.min + ' ' + tr('min') : tr('attended')}` : `${s.start ? s.start + ' · ' : ''}${rowLabel(s)} ${s.min} ${tr('min')} @ RPE ${s.rpe}${s.note ? ' · ' + s.note : ''}`, load: s.load || null, by: s.by || null, sess: { date: d, idx, min: s.min, sig: sessionSig(s) } })));
  // GYM = LIFTS (27.9, Ohad: "what's the difference between gym and lifts? if
  // you can combine it do so"). "Gym" was the athlete's EXPO workout, logged set
  // by set in his own app; a Lift is the same session logged here in minutes.
  // One kind, one chip. A lift logged here on the same day gets the EXPO detail
  // appended instead of a second row; stored rows are untouched.
  (workouts || []).forEach((w) => {
    const d = String(w.date || w.completedAt || '').slice(0, 10); if (!d) return;
    const nEx = (w.exercises || []).length; const nSets = (w.exercises || []).reduce((a, e) => a + (e.sets || []).length, 0);
    const detail = `${nEx} ${tr(nEx === 1 ? 'exercise' : 'exercises')}, ${nSets} ${tr(nSets === 1 ? 'set' : 'sets')}`;
    const same = activity.find((x) => x.kind === 'lift' && x.date === d && !x.expoDetail);
    if (same) { same.label = `${same.label} · ${detail}`; same.expoDetail = true; }
    else activity.push({ kind: 'lift', date: d, label: `${tr('Lift')} · ${detail}`, load: null, expoDetail: true });
  });
  Object.entries((rec && rec.bw) || {}).forEach(([d, kg]) => activity.push({ kind: 'other', date: d, label: `${tr('Bodyweight')} ${kg} ${tr('kg')}`, load: null }));
  Object.entries((rec && rec.availability) || {}).forEach(([d, code]) => { if (code > 1) activity.push({ kind: 'other', date: d, label: `${tr('Availability')} · ${tr(AVAIL[code].label)}`, load: null }); });
  // NOTES ARE STORED UNDER TWO KEYS. savePractice writes each note as both
  // `date` and `date|start` — the slot-keyed copy so a morning and an evening
  // note can coexist, the day-level one so older readers still find it. This
  // loop treated every key as a date, so one note appeared TWICE in the
  // athlete's history and the slot-keyed row rendered its date column as
  // "08-27|18:00" (a.date.slice(5) into a 62px tabular column).
  //
  // Prefer the slot-keyed copies — they are the accurate record, since the
  // day-level key holds only whichever slot was saved last — and show the DAY
  // in the date column either way.
  const noteEntries = (rec && rec.notes) || {};
  const daysWithSlotNote = new Set(Object.keys(noteEntries).filter((k) => k.includes('|')).map((k) => k.split('|')[0]));
  Object.entries(noteEntries).forEach(([k, n]) => {
    if (!n) return;
    if (!k.includes('|') && daysWithSlotNote.has(k)) return;   // the duplicate
    activity.push({ kind: 'note', date: k.split('|')[0], label: `${tr('Note')} — ${n}`, load: null });
  });
  // League games fold into the same timeline, so the full history covers court + gym.
  const loggedGameDays = new Set(activity.filter((a) => a.gameLine).map((a) => a.date));
  (leagueLog || []).forEach((g) => {
    if (!g.date || loggedGameDays.has(g.date)) return;
    const opp = g.opp && !isBH(g.opp) ? g.opp.replace(/\s*\(.*$/, '') : null;
    activity.push({ kind: 'game', date: g.date, game: { opp: opp || '—', pts: g.pts, reb: g.reb, ast: g.ast, min: g.min }, gameLine: { date: g.date, opp, min: g.min, box: g, source: 'basket.co.il' }, load: null });
  });
  activity.sort((a, b) => b.date.localeCompare(a.date));
  // THIS SEASON ONLY (27.9, Ohad: "only this year. last year as a toggle or
  // button"). A season runs August-July; past seasons sit behind one button.
  const seasonOfDate = (d) => { const y = +String(d).slice(0, 4), mo = +String(d).slice(5, 7); const st = mo >= 8 ? y : y - 1; return `${st}/${String(st + 1).slice(2)}`; };
  const curSeason = seasonOfDate(todayISO());
  const pastSeasons = [...new Set(activity.map((a) => seasonOfDate(a.date)).filter((x) => x !== curSeason))];
  const allActivity = activity;
  activity = showPast ? allActivity : allActivity.filter((a) => seasonOfDate(a.date) === curSeason);
  // Counts per kind for the chips, then the visible rows grouped by month.
  const KIND_LABEL = { game: 'Games', practice: 'Practices', sc: 'S&C', lift: 'Lifts', note: 'Notes', other: 'Other' };
  const kindCount = {};
  activity.forEach((a) => { kindCount[a.kind || 'other'] = (kindCount[a.kind || 'other'] || 0) + 1; });
  const kindChips = ['game', 'practice', 'sc', 'lift', 'note', 'other'].filter((k) => kindCount[k]);
  const effKind = histKind === 'all' || kindChips.includes(histKind) ? histKind : 'all';
  const shownActivity = effKind === 'all' ? activity : activity.filter((a) => (a.kind || 'other') === effKind);
  const monthKeys = [];
  const byMonth = {};
  shownActivity.forEach((a) => { const m = String(a.date).slice(0, 7); if (!byMonth[m]) { byMonth[m] = []; monthKeys.push(m); } byMonth[m].push(a); });
  const monthOpenAt = (m, i) => (m in monthOpen ? monthOpen[m] : i === 0);
  const monthSummary = (list) => {
    const games = list.filter((a) => a.kind === 'game').length;
    const mins = list.reduce((n, a) => n + (a.sess && Number(a.sess.min) ? Number(a.sess.min) : (a.game && Number(a.game.min) ? Number(a.game.min) : 0)), 0);
    // every number says what it counts (27.9: "24 · 231 MIN" - 24 of what?)
    return [`${list.length} ${tr(list.length === 1 ? 'entry' : 'entries')}`, mins ? `${mins} ${tr('min')}` : null, games ? `${games} ${tr(games === 1 ? 'game' : 'games')}` : null].filter(Boolean).join(' · ');
  };
  return (
    <BModal open onClose={onClose} wide title={`#${t.jersey ?? '—'} · ${t.name}`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: FB, fontSize: 13, color: C.td }}>{tr(t.position) || '—'} · {heightM(t.heightCm)} {flag(t.nationality)}</span>
          {/* THE LOAD BOARD'S OWN CONTROL (29.9 #409): one availability entry,
              one build, on the board and here. */}
          <span style={{ marginInlineStart: 'auto', display: 'inline-flex' }}>
            <AvailSelect avail={avail} floor={availFloor} onPick={onCycleAvail} />
          </span>
        </div>
        <div className="hl-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1, background: C.cardBd, border: `1px solid ${C.cardBd}` }}>
          {/* The biggest numbers on the card were three em-dashes for anyone whose
              history is gym-only: BHBC gym sessions are minutes with NO sRPE by
              design, so ACWR is genuinely undefined - but a bare dash reads as a
              broken card. Each tile now says WHY it is empty, and when there IS a
              ratio the band name earns the space instead. */}
          {/* WHAT THE CLUB RECORDS: minutes and sessions, never an RPE (Ohad:
              "no RPE ever"). The ACWR / 7-day-load / 28-day tiles read session
              RPE x minutes, which this zone never logs — they could only ever
              say "needs sRPE" (26.9, #230). */}
          {(() => {
            const cut7 = daysAgoISO(6);
            let m7 = 0, n7 = 0, lastLift = null, lastGame = null;
            // The court sessions of the last 7 days that have already happened
            // (practice / scrimmage / shootaround, not cancelled).
            const todayIso = daysAgoISO(0);
            const nowHM = new Date().toTimeString().slice(0, 5);
            const fx7 = (fixtures || []).filter((f) => f && f.date && !isCancelled(f) && ['practice', 'scrimmage', 'shootaround'].includes(f.type)
              && f.date >= cut7 && f.date <= todayIso && !(f.date === todayIso && (f.start || '99:99') > nowHM));
            const fxDays = new Set(fx7.map((f) => f.date));
            for (const [d, list] of Object.entries((rec && rec.sessions) || {})) {
              for (const r of (list || [])) {
                if (!r || r.attended === false) continue;
                const mm = Number(r.min) || 0;
                // team S&C is logged WITH its practice (24.9 model): on a court
                // day it is that practice's record, counted once below
                if (d >= cut7 && !(rowKind(r) === 'sc' && fxDays.has(d))) { n7++; m7 += mm; }
                if (rowKind(r) === 'lift' && (!lastLift || d > lastLift)) lastLift = d;
                if (rowKind(r) === 'game' && (!lastGame || d > lastGame.date)) lastGame = gameLineOf(d, r);
              }
            }
            // PRACTICES COUNT TOO (29.9 #412, Ohad: "sessions should be drawn from
            // games and practices and lifts together"). A practice is never
            // stored per player - the attendance grid draws it from the club
            // calendar + that day's availability - so the tile only ever saw
            // lifts, games and S&C. Same rule as the grid: a practice /
            // scrimmage / shootaround that has happened, he was available
            // (not OUT) and the coach did not mark him out. Counted ONCE: a day
            // that already holds its own practice or game row (a scrimmage is
            // logged as a game) is counted by that row (29.9 audit - it was
            // counted twice); a team S&C row on the day proves he was there,
            // as it does on the attendance grid.
            {
              const id = row && row.t && row.t.id;
              const att = (rec && rec.attendance) || {};
              const ses = (rec && rec.sessions) || {};
              for (const f of fx7) {
                // as the attendance grid (AUDIT-470): no practice before he landed,
                // and the coach's OUT on the slot wins over an S&C row
                if (row && row.t && row.t.arrival && f.date < row.t.arrival) continue;
                const day = (ses[f.date] || []).filter((r) => r && r.attended !== false);
                // its own row counts it: a practice / shootaround by a practice
                // row, a scrimmage by a game row. A GAME row never swallows the
                // morning shootaround of a game day (29.9 audit round 2).
                if (day.some((r) => rowKind(r) === 'practice' || (String(f.type || '').toLowerCase() === 'scrimmage' && rowKind(r) === 'game'))) continue;
                const hadSc = day.some((r) => rowKind(r) === 'sc');
                if (att[`${f.date}|${f.start || ''}`] === 'out') continue;
                if (!hadSc && id && availOn(rec || {}, medicalAll || {}, id, f.date) >= 4) continue;
                n7++; m7 += Number(f.minutes) || 0;
              }
            }
            // One line per tile at 390 (26.9): the unit rides beside the number,
            // the date is day.month — "22 SEP" at 22px broke onto two lines.
            // day-first like every other date in the zone (#305 E3): 22/09, not 22.9
            const dm = (iso) => ddmm(iso);
            // LAST GAME in place of the 28-day total (27.9, Ohad: "show last game
            // instead of one of the others"): its date, then his minutes and
            // points; a tap opens the game's full line.
            const gSub = lastGame ? [lastGame.min ? `${lastGame.min} ${tr('min')}` : tr('played'), lastGame.box && lastGame.box.pts != null ? `${lastGame.box.pts} ${tr('pts')}` : null].filter(Boolean).join(' · ') : tr('none logged');
            return [
              [tr('7 days'), m7 || null, tr('min'), n7 ? `${n7} ${tr('sessions')}` : tr('none logged')],
              [tr('Last game'), lastGame ? dm(lastGame.date) : null, '', gSub, lastGame],
              [tr('Last lift'), lastLift ? dm(lastLift) : null, '', lastLift ? dow(lastLift) : tr('none logged')],
            ];
          })().map(([k, v, unit, sub, line]) => (
            <div key={k} onClick={line ? () => setGameOpen(line) : undefined} role={line ? 'button' : undefined} tabIndex={line ? 0 : undefined}
              onKeyDown={line ? ((e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setGameOpen(line); } }) : undefined}
              className={line ? 'bhbc-row' : undefined}
              // ONE COMPACT SCALE FOR THE POPUP (27.9 #349, Ohad: "why is
              // everything so big?? all the boxes"): label 9, value 16, caption
              // 10, 8px above and below - the tiles, the load grid and the
              // league grid all read at the same size.
              style={{ background: 'var(--c-sf)', padding: '8px 12px', minWidth: 0, cursor: line ? 'pointer' : undefined }}>
              <div style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.tm, whiteSpace: 'nowrap' }}>{k}</div>
              <div style={{ fontFamily: FN, fontWeight: 800, fontSize: 16, color: v == null ? C.td : C.tx, marginTop: 4, fontVariantNumeric: 'tabular-nums', lineHeight: 'normal', whiteSpace: 'nowrap' }}>
                {v == null ? '—' : v}{v != null && unit ? <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.tm, marginInlineStart: 4 }}>{unit}</span> : null}
              </div>
              {sub ? <div style={{ fontFamily: FB, fontSize: 10, color: C.tm, marginTop: 2, whiteSpace: 'nowrap' }}>{sub}</div> : null}
            </div>
          ))}
        </div>
        {(() => {
          // Foster monotony & strain over the last 7 days (illness/overtraining
          // risk). Monotony ≥2 flags too-samey loading; strain = load × monotony.
          const week7 = (days28 || []).slice(-7).map((d) => (rec && rec.loads && rec.loads[d]) || 0);
          const ms = monotonyStrain(week7);
          if (!ms.weekLoad) return null;
          const monC = ms.monotony == null ? C.tx : ms.monotony >= 2.5 ? '#DE4E3B' : ms.monotony >= 2 ? '#E0A73A' : '#37B27C';
          return (
            <div className="hl-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1, background: C.cardBd, border: `1px solid ${C.cardBd}` }}>
              {[['Week load', ms.weekLoad ? Math.round(ms.weekLoad).toLocaleString() : '—', C.tx], ['Monotony', ms.monotony != null ? ms.monotony.toFixed(2) : '—', monC], ['Strain', ms.strain != null ? Math.round(ms.strain).toLocaleString() : '—', C.td]].map(([k, v, c]) => (
                <div key={k} style={{ background: 'var(--c-sf)', padding: '8px 12px' }}>
                  <div style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.tm, marginInlineEnd: 8 }}>{k}</div>
                  <div style={{ fontFamily: FN, fontWeight: 800, fontSize: 16, color: c, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
                </div>
              ))}
            </div>
          );
        })()}
        {readiness.level !== 'unknown' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: rc, flexShrink: 0 }} />
          <span style={{ fontFamily: FB, fontSize: 13, color: C.td }}>{tr(readiness.headline)}</span>
        </div>
        )}
        {/* Medical / injury — shown on the athlete's profile too, not only the Medical tab */}
        <div style={{ border: `1px solid ${injuries.length ? '#DE4E3B' : C.cardBd}` /* only an injury is coloured (#305 E1) */ }}>
          {/* 6px around the 36px controls, one pill width (27.9 #349: the header
              and each record stood ~56px; OUT and AVAILABLE were different
              widths, so the injury after them started at two x's) */}
          <PopHead dataKey="medical" label={tr('Medical')} flush={!injuries.length}
            meta={injuries.length ? null : <><span style={{ width: 7, height: 7, borderRadius: '50%', background: MED_STATUS.available.color }} />{tr('Available')}</>}
            right={onInjury ? <button onClick={onInjury} className="bhbc-ghost-btn" style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.tx, background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, height: 'var(--btn-h-in)', minHeight: 'var(--btn-h-in)', boxSizing: 'border-box', padding: '0 10px', display: 'inline-flex', alignItems: 'center', cursor: 'pointer', whiteSpace: 'nowrap' }}>{injuries.length ? tr('Update') : `+ ${tr('Report injury')}`}</button> : null} />
          {injuries.map((inj) => {
            const days = inj.onsetDate ? dayDiff(todayISO(), inj.onsetDate) : null;
            const lastP = (inj.progress || [])[0];
            return (
              <div key={inj.id} style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ width: 124, flexShrink: 0, display: 'inline-flex' }}><StatusPill status={inj.status} small full /></span>
                <span style={{ fontFamily: FB, fontSize: 13, color: C.tx }}>{[inj.bodyPart, inj.side && inj.side !== 'N/A' ? inj.side : '', inj.type].filter(Boolean).map((x) => tr(x)).join(' · ')}</span>
                <span style={{ fontFamily: FN, fontSize: 11, color: C.td, fontVariantNumeric: 'tabular-nums' }}>{days != null ? daysFor(days) : ''}{latestPain(inj) != null ? ` · ${tr('pain')} ${latestPain(inj)}` : ''}</span>
                {/* Same rule as the head coach report: a target already passed,
                    on someone still limited, is a flag rather than a plan. */}
                
                {lastP && <span style={{ fontFamily: FB, fontSize: 11, color: C.tm, width: '100%' }}>{tr('Latest')} ({ddmm(lastP.date)}): {lastP.note}</span>}
              </div>
            );
          })}
        </div>
        {/* FULL HISTORY IS A CARD LIKE THE REST OF THE POPUP. League Stats,
            the load strip and Medical are each a bordered card with a header
            row; this one was a bare 9px label with the list hanging off it, so
            the fourth section read as an afterthought against three cards.
            Measured at 1500: all four already share x=428.8 and w=630.4, so
            only the header was out of step. It takes Medical's shape - the
            neutral card - rather than League Stats' filled navy strip, which
            belongs to the marquee block. */}
        <div style={{ border: `1px solid ${C.cardBd}` }}>
          <PopHead dataKey="history" label={tr('Full history')} meta={activity.length || null} flush={!activity.length} />
          {/* The cut must land ON a divider, never through a row: the pitch is
              pinned at 33 (font-independent, so Heebo cannot shift it) and the cap
              is a whole number of rows plus the 2px border-box border.
              Ohad: "full history should be longer or easier to view. takes too
              little space" - 134 showed FOUR entries of twenty-one. 431 shows
              thirteen, which is a month of work, and still scrolls. */}
          {activity.length > 4 && kindChips.length > 1 && (
            // ONE CONTROL, EQUAL CELLS, NO EMPTY CELL (27.9, Ohad: "buttons all to
            // gym are badly displayed ... not ocd"): a segmented grid joined by
            // hairlines. Desktop: one row. Phone: 2 or 3 equal columns so every
            // row is full; with an odd count that neither fills, ALL takes the
            // whole first row and the kinds fill two columns under it.
            (() => { const n = kindChips.length + 1; const cols = n <= 3 ? n : n % 3 === 0 ? 3 : n % 2 === 0 ? 2 : 2; const allSpan = n > 3 && n % 3 !== 0 && n % 2 !== 0; return (
            <div className="bhbc-hist-chips hl-grid" data-allspan={allSpan ? '' : undefined} style={{ display: 'grid', gridTemplateColumns: `repeat(${n}, minmax(max-content, 1fr))`, '--hc-phone': cols, gap: 1, background: C.cardBd, margin: '8px 12px', border: `1px solid ${C.cardBd}` }}>
              {['all', ...kindChips].map((k) => {
                const on = effKind === k;
                return (
                  <button key={k} onClick={() => setHistKind(k)} className="bhbc-ghost-btn"
                    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 'var(--btn-h)', minWidth: 0, boxSizing: 'border-box', padding: '0 10px', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap', cursor: 'pointer', borderRadius: 0, background: on ? NAVY : 'var(--c-sf)', color: on ? '#fff' : C.tm, border: 'none' }}>
                    {tr(k === 'all' ? 'All' : KIND_LABEL[k])}
                    <span style={{ fontVariantNumeric: 'tabular-nums', opacity: 0.75 }}>{k === 'all' ? activity.length : kindCount[k]}</span>
                  </button>
                );
              })}
            </div>
            ); })()
          )}
          {pastSeasons.length > 0 && (
            <div style={{ padding: '8px 12px', borderBottom: `1px solid ${C.cardBd}` }}>
              <button type="button" aria-pressed={showPast} onClick={() => setShowPast((v) => !v)} className="bhbc-ghost-btn"
                style={{ width: '100%', height: 'var(--btn-h)', boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: showPast ? '#fff' : C.tm, background: showPast ? NAVY : 'transparent', border: `1px solid ${showPast ? NAVY : C.cardBd}`, borderRadius: 0, cursor: 'pointer' }}>
                {showPast ? tr('This season only') : `${tr('Show')} ${pastSeasons.join(' · ')}`}
              </button>
            </div>
          )}
          {activity.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 431, overflowY: 'auto',
              border: `1px solid ${C.cardBd}`, borderRadius: 0 }}>
              {monthKeys.map((m, mi) => {
                const group = byMonth[m];
                const open = monthOpenAt(m, mi);
                const d0 = parseISO(m + '-01');
                const seasonOf = (mk) => { const y = +mk.slice(0, 4), mo = +mk.slice(5, 7); const st = mo >= 8 ? y : y - 1; return `${st}/${String(st + 1).slice(2)}`; };
                const season = seasonOf(m);
                const firstSeason = seasonOf(monthKeys[0]);
                const sOpen = season in seasonOpen ? seasonOpen[season] : season === firstSeason;
                const seasonHead = mi === 0 || seasonOf(monthKeys[mi - 1]) !== season;
                const seasonGroups = seasonHead ? monthKeys.filter((k) => seasonOf(k) === season).map((k) => byMonth[k]).flat() : null;
                const head = seasonHead ? (
                  <button onClick={() => setSeasonOpen((p) => ({ ...p, [season]: !sOpen }))}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', boxSizing: 'border-box', padding: '0 9px', minHeight: 36, flexShrink: 0, cursor: 'pointer', borderRadius: 0, textAlign: 'start', background: NAVY_DEEP, color: '#fff', border: 'none', borderBottom: `1px solid ${C.cardBd}` /* navy like its months (29.9 #405: the orange bar was "horrible") */ }}>
                    <svg aria-hidden="true" width="9" height="6" viewBox="0 0 9 6" fill="none" style={{ width: 10, flexShrink: 0, transform: sOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 180ms ease' }}>
                      <path d="M1 1l3.5 3.5L8 1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span style={{ fontFamily: FN, fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{tr('Season')} {season}</span>
                    <span style={{ marginInlineStart: 'auto', fontFamily: FN, fontSize: 10, fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{(() => {
                      // the season line: games and minutes only - with the entry count it ran off a phone (27.9)
                      const g = seasonGroups.filter((a) => a.kind === 'game').length;
                      const mm = seasonGroups.reduce((n, a) => n + (a.sess && Number(a.sess.min) ? Number(a.sess.min) : (a.game && Number(a.game.min) ? Number(a.game.min) : 0)), 0);
                      return [g ? `${g} ${tr(g === 1 ? 'game' : 'games')}` : null, mm ? `${mm} ${tr('min')}` : null].filter(Boolean).join(' · ');
                    })()}</span>
                  </button>
                ) : null;
                if (!sOpen) return <React.Fragment key={m}>{head}</React.Fragment>;
                return (
                  <React.Fragment key={m}>
                    {head}
                    {/* The month header stays put while its own rows scroll under
                        it, so you always know where you are in a long season. */}
                    <button onClick={() => setMonthOpen((p) => ({ ...p, [m]: !open }))}
                      style={{ position: 'sticky', top: 0, zIndex: 1, display: 'flex', alignItems: 'center', gap: 8, width: '100%', boxSizing: 'border-box', padding: '7px 9px', minHeight: 33, flexShrink: 0, cursor: 'pointer', borderRadius: 0, textAlign: 'start', background: NAVY_DEEP, color: 'var(--c-stripTx)', border: 'none', borderBottom: `1px solid ${C.cardBd}` }}>
                      <svg aria-hidden="true" width="9" height="6" viewBox="0 0 9 6" fill="none" style={{ display: 'inline-block', width: 10, flexShrink: 0, opacity: 0.8, transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 180ms ease' }}>
                        <path d="M1 1l3.5 3.5L8 1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <span style={{ fontFamily: FN, fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{monFor(d0.getMonth(), MON[d0.getMonth()])} {d0.getFullYear()}</span>
                      <span style={{ marginInlineStart: 'auto', fontFamily: FN, fontSize: 10, color: 'color-mix(in srgb, var(--c-stripTx, #fff) 78%, transparent)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{monthSummary(group)}</span>
                    </button>
                    {open && group.map((a, i) => (
                <div key={i} onClick={a.gameLine ? () => setGameOpen(a.gameLine) : undefined} role={a.gameLine ? 'button' : undefined} tabIndex={a.gameLine ? 0 : undefined}
                  onKeyDown={a.gameLine ? ((e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setGameOpen(a.gameLine); } }) : undefined}
                  className={a.gameLine ? 'bhbc-row' : undefined}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px', minHeight: 33, flexShrink: 0, boxSizing: 'border-box', cursor: a.gameLine ? 'pointer' : undefined,
                  borderBottom: i < group.length - 1 ? `1px solid ${C.cardBd}` : 'none', fontFamily: FN, fontSize: 12 }}>
                  <span style={{ color: a.game ? ORANGE_DEEP : C.td, width: 44, fontVariantNumeric: 'tabular-nums', flexShrink: 0, fontWeight: a.game ? 700 : 400 }}>{ddmm(a.date)}</span>
                  {a.game ? (
                    <span style={{ color: C.tx, minWidth: 0, flex: 1, display: 'flex', gap: 8, alignItems: 'baseline' }} dir="ltr">
                      <span style={{ fontWeight: 600, unicodeBidi: 'isolate' }}>{tr('vs')} <span style={{ unicodeBidi: 'isolate' }}>{a.game.opp}</span></span>
                      <span style={{ marginInlineStart: 'auto', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: ORANGE_DEEP, whiteSpace: 'nowrap' }}>{a.game.pts}p · {a.game.reb}r · {a.game.ast}a · {a.game.min}′</span>
                    </span>
                  ) : a.sess && editSess && editSess.date === a.sess.date && editSess.idx === a.sess.idx ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
                      <input autoFocus type="number" inputMode="numeric" min="0" value={editSess.min}
                        onChange={(e) => setEditSess({ ...editSess, min: e.target.value })}
                        onKeyDown={(e) => { if (e.key === 'Enter') { onEditSession(editSess.date, editSess.idx, editSess.min, editSess.sig); setEditSess(null); } if (e.key === 'Escape') setEditSess(null); }}
                        style={{ width: 64, fontFamily: FN, fontSize: 12, color: C.tx, background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: '2px 6px' }} />
                      <span style={{ color: C.td }}>{tr('min')}</span>
                      <button onClick={() => { onEditSession(editSess.date, editSess.idx, editSess.min, editSess.sig); setEditSess(null); }} title={tr('Save')} style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, color: '#37B27C', background: 'transparent', border: `1px solid ${C.cardBd}`, padding: '2px 8px', cursor: 'pointer' }}>✓</button>
                      <button onClick={() => setEditSess(null)} title={tr('Cancel')} style={{ fontFamily: FN, fontSize: 10, color: C.tm, background: 'transparent', border: `1px solid ${C.cardBd}`, padding: '2px 8px', cursor: 'pointer' }}><CrossGlyph /></button>
                    </span>
                  ) : (
                    <span style={{ color: C.tx, minWidth: 0, flex: 1, overflowWrap: 'break-word' }}>{a.label}
                      {a.note ? <span style={{ display: 'block', fontFamily: FB, fontSize: 12, color: C.tm, marginTop: 2 }}>{a.note}</span> : null}
                      {/* WHO LOGGED IT. Ohad, 19.9: "it doesnt say who logged
                          it". Every session row has carried `by` since the club
                          coaches got write access - it was simply never shown
                          here, so with several coaches logging there was no way
                          to tell from the history who entered a line. */}
                      {a.by && <span style={{ display: 'block', color: C.td, fontSize: 10, marginTop: 2 }}>{tr('logged by')} {byName(a.by)}</span>}
                    </span>
                  )}
                  {a.sess && onEditSession && !(editSess && editSess.date === a.sess.date && editSess.idx === a.sess.idx) && (
                    <span style={{ marginInlineStart: 'auto', display: 'inline-flex', gap: 4, flexShrink: 0, justifyContent: 'flex-end', minWidth: 54 }}>
                      <button onClick={() => setEditSess({ date: a.sess.date, idx: a.sess.idx, min: a.sess.min || '', sig: a.sess.sig })} title={tr('Edit minutes')} className="bhbc-ghost-btn" style={{ fontFamily: FN, fontSize: 10, color: C.tm, background: 'transparent', border: `1px solid ${C.cardBd}`, padding: '1px 7px', cursor: 'pointer' }}><PencilGlyph /></button>
                      {onDeleteSession && <button onClick={() => { setEditSess(null); onDeleteSession(a.sess.date, a.sess.idx, a.sess.sig); }} title={tr('Delete session')} className="bhbc-ghost-btn" style={{ fontFamily: FN, fontSize: 10, color: C.tm, background: 'transparent', border: `1px solid ${C.cardBd}`, padding: '1px 7px', cursor: 'pointer' }}><CrossGlyph /></button>}
                    </span>
                  )}
                  {a.load != null && <span style={{ marginInlineStart: a.sess && onEditSession ? 8 : 'auto', color: ORANGE_DEEP, fontVariantNumeric: 'tabular-nums', fontWeight: 700, flexShrink: 0 }}>{Math.round(a.load)}</span>}
                </div>
                    ))}
                  </React.Fragment>
                );
              })}
              {!shownActivity.length && <div style={{ fontFamily: FB, fontSize: 13, color: C.td, padding: '10px 9px' }}>{tr('Nothing of this kind yet.')}</div>}
            </div>
          ) : <div style={{ fontFamily: FB, fontSize: 13, color: C.td, padding: '6px 0' }}>{tr('No history logged yet.')}</div>}
        </div>
        {/* LEAGUE STATS LAST (29.9 #406, Ohad: "leage stats should be last, after
            medical, and full history"): what he can do today first, the season's
            numbers after. */}
        {leaguePlayer && (() => {
          const lastG = (leaguePlayer.log || []).length ? [...leaguePlayer.log].sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0] : null;
          // THE LAST GAME OPENS ITS FULL LINE (27.9, Ohad: "a clickable item or
          // title to expand player stats like in the second screenshot"). The
          // club's own row for that date wins (it carries the whole box and the
          // opponent's English name); else the league log line itself.
          const lastGRow = lastG && lastG.date ? (((rec && rec.sessions) || {})[lastG.date] || []).find((r) => rowKind(r) === 'game') : null;
          const lastGLine = !lastG ? null : lastGRow ? gameLineOf(lastG.date, lastGRow)
            : { date: lastG.date, opp: lastG.opp && !isBH(lastG.opp) ? lastG.opp.replace(/\s*\(.*$/, '') : null, min: lastG.min, box: lastG, source: 'basket.co.il' };
          const ago = lastG && lastG.date ? dayDiff(todayISO(), lastG.date) : null;
          const agoLabel = ago == null ? '' : heM
            ? (ago === 0 ? 'היום' : ago === 1 ? 'אתמול' : ago < 31 ? `לפני ${ago} ימים` : ago < 60 ? 'בחודש שעבר' : `לפני ${Math.round(ago / 30)} חודשים`)
            : (ago === 0 ? 'today' : ago === 1 ? 'yesterday' : ago < 31 ? `${ago} days ago` : ago < 60 ? 'last month' : `${Math.round(ago / 30)} months ago`);
          // THE AVERAGES READ WITH THE SAME FOUR WORDS AS THE LAST GAME ABOVE,
          // under one "season average" caption (27.9: "נק׳ למשחק" wrapped to two
          // lines in a quarter of a phone; a title fits by wording, never a
          // smaller font). Then the shooting, the rating and games played.
          const avg = [['PTS', leaguePlayer.ppg], ['REB', leaguePlayer.rpg], ['AST', leaguePlayer.apg], ['MIN', leaguePlayer.mpg], ['3P%', leaguePlayer.tpp + '%'], ['FT%', leaguePlayer.ftp + '%'], ['PIR', leaguePlayer.pirpg], ['GP', leaguePlayer.gp]];
          return (
            <div style={{ border: `1px solid ${C.cardBd}` }}>
              {/* WHERE THESE NUMBERS COME FROM, and how old they are (the feed
                  publishes only the league's own games - Ohad read its last
                  game as the club's). In the zone's language (#305 N-D3). */}
              <PopHead dataKey="league" label={tr('League Stats')} meta={leagueSeason || null} right={leagueUpdatedAt ? (
                <span className="strip-meta" style={{ fontFamily: FN, fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.tm, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                  title={tr('Official league feed (basket.co.il). Only games the league has published appear here.')}>
                  {tr('Premier League') + ' · ' + fmtNumericDate(leagueUpdatedAt)}
                </span>) : null} />
              {lastG && (
                <div role="button" tabIndex={0} className="bhbc-row" onClick={() => setGameOpen(lastGLine)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setGameOpen(lastGLine); } }} style={{ cursor: 'pointer' }}>
                  <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.tm }}>{tr('Last game')}{agoLabel ? ` · ${agoLabel}` : ''}</div>
                      <div style={{ fontFamily: FN, fontSize: 13, fontWeight: 700, color: C.tx, marginTop: 3 }} dir="auto"><bdi>{tr('vs')} {lastGLine.opp || '—'}</bdi></div>
                    </div>
                    <span aria-hidden="true" style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.tm, whiteSpace: 'nowrap' }}>{tr('Full line')} ›</span>
                  </div>
                  {/* THE SAME FOUR COLUMNS as the season averages directly below.
                      They used to be pushed to the right edge on `margin-inline-start:
                      auto` with a flat 14px gap, so PTS/REB/AST/MIN landed at 933 /
                      970 / 1007 / 1046 while the grid under them started its columns
                      at 443 / 604 / 764 / 924 - two stat rows in one card on two
                      different rhythms. Ohad: "the stats on the right should be
                      ordered like columns. i keep asking this request." */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', borderTop: `1px solid ${C.cardBd}`, borderBottom: `1px solid ${C.cardBd}` }}>
                    {[['PTS', lastG.pts], ['REB', lastG.reb], ['AST', lastG.ast], ['MIN', lastG.min]].map(([k, v], i) => (
                      <div key={k} style={{ padding: '8px 12px', borderInlineEnd: i !== 3 ? `1px solid ${C.cardBd}` : 'none' }}>
                        <div style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.tm }}>{tr(k)}</div>
                        <div style={{ fontFamily: FN, fontWeight: 800, fontSize: 16, color: C.tx, marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ padding: '8px 12px 0', fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.tm, whiteSpace: 'nowrap' }}>{tr('Season average')}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)' }}>
                {avg.map(([k, v], i) => (
                  <div key={k} style={{ padding: '8px 12px', borderInlineEnd: (i % 4 !== 3) ? `1px solid ${C.cardBd}` : 'none', borderTop: i >= 4 ? `1px solid ${C.cardBd}` : 'none' }}>
                    <div style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.tm }}>{tr(k)}</div>
                    <div style={{ fontFamily: FN, fontWeight: 800, fontSize: 16, color: C.tx, marginTop: 3, fontVariantNumeric: 'tabular-nums' }}><bdi dir="ltr">{v}</bdi></div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
        {/* BODYWEIGHT LAST. Ohad: "put the bw graph at the bottom". It is a
            trend, not a headline - the stats, load and medical answer "can he
            train today", and the weight chart is what you scroll to. */}
        {bw && bw.length > 0 && (
          <div style={{ border: `1px solid ${C.cardBd}` }}>
            <PopHead dataKey="bw" label={tr('Bodyweight')} />
            <div style={{ padding: 12 }}><BWChart entries={bw} /></div>
          </div>
        )}
        {program && (program.current || program.count > 0) && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minHeight: 40, boxSizing: 'border-box', padding: '12px 0', borderTop: `1px solid ${C.cardBd}`, fontFamily: FN, fontSize: 11, lineHeight: '16px', flexWrap: 'wrap' } /* ONE baseline for label, block, count and link (29.9 #407) */}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.tm }}>{tr('Current block')}</span>
            <span style={{ color: C.tx, fontWeight: 700 }}>{program.current || tr('None assigned')}</span>
            {program.count > 1 && <span style={{ color: C.tm }}>· {program.count} {tr('total')}</span>}
            {onOpenExpo && (
              <button type="button" onClick={onOpenExpo} title={tr('Open this athlete in EXPO')}
                style={{ marginInlineStart: 'auto', flexShrink: 0, fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.tm, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}>
                {tr('Open in EXPO')} ›
              </button>
            )}
          </div>
        )}
        {/* Equal columns. Ohad: "make sure all buttons no matter the tag are the
            same horizontal size" - measured here at 134 / 166 / 149px, so the
            footer read as three different weights. auto-fit keeps them equal
            whether the owner sees four or a coach sees three, and wraps rather
            than squeezing below the widest label. */}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(168px, 1fr))`, gap: 8 }}>
          {onLog && <Btn variant="ghost" onClick={onLog}>{tr('Log lift')}</Btn>}
          {/* No footer 'Medical report': it fired the SAME onInjury as UPDATE on the
              medical strip above, and the fourth button is what squeezed the row to
              155px and wrapped its own label onto two lines. Three buttons fit. */}
          {onViewProgram && <Btn onClick={onViewProgram} style={{ background: NAVY, borderColor: NAVY, color: '#fff' }}>{tr('View program')}</Btn>}
        </div>
      </div>
      {gameOpen && <GameLineModal line={gameOpen} onClose={() => setGameOpen(null)} />}
    </BModal>
  );
}

// band helpers (mirror acwrEngine bands for the snapshot tile)
function bandKey(r) { if (r == null) return 'none'; if (r < 0.8) return 'detrained'; if (r <= 1.3) return 'low'; if (r < 1.5) return 'elevated'; return 'high'; }
function acwrLabel(r) { return { detrained: 'undertrained', low: 'sweet spot', elevated: 'elevated', high: 'danger', none: '' }[bandKey(r)]; }

// Hoisted out of WellnessModal deliberately. Defined inside the render body its
// function identity changed every render, so React saw a different element TYPE
// each time and unmounted/remounted all four buttons for every athlete on every
// keystroke in the pain and BW inputs — roughly 60 button remounts per character
// on a 15-athlete roster.
//
// The inputs themselves never lost focus, because they are siblings of Seg
// rather than children of it, so this was wasted work rather than the
// focus-eating variant of the same mistake (audit finding #10).
const WellnessSeg = ({ value, opts, onPick }) => (
  <div style={{ display: 'inline-flex', border: `1px solid ${C.cardBd}` }}>
    {opts.map(([val, label]) => {
      const on = value === val;
      return (
        <button
          key={val}
          type="button"
          onClick={() => onPick(val)}
          style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, color: on ? '#fff' : C.td, background: on ? NAVY : 'transparent', border: 'none', padding: '5px 8px', cursor: 'pointer', minWidth: 34 }}
        >{label}</button>
      );
    })}
  </div>
);

// Squad wellness check-in — sleep / energy / pain per athlete → feeds the
// readinessAutoreg engine (session nudge on the load board + athlete profile).
function WellnessModal({ roster, bhbcLoads, onClose, onSave }) {
  const tr = useT();
  const [date, setDate] = useState(todayISO());
  const [entries, setEntries] = useState({});
  useEffect(() => {
    const e = {};
    roster.forEach((t) => { const r = ((bhbcLoads[t.id] || {}).readiness || {})[date] || {}; const bw = ((bhbcLoads[t.id] || {}).bw || {})[date]; e[t.id] = { sleep: r.sleep || '', energy: r.energy || '', pain: r.pain ?? '', bw: bw || '' }; });
    setEntries(e);
  }, [date]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (id, k, v) => setEntries((prev) => ({ ...prev, [id]: { ...prev[id], [k]: (prev[id] && prev[id][k]) === v ? '' : v } }));
  const setVal = (id, k, v) => setEntries((prev) => ({ ...prev, [id]: { ...prev[id], [k]: v } }));
  // Bulk baseline: fill the whole squad as "good sleep, good energy, no pain",
  // then the coach just adjusts the exceptions — the common case is everyone fine.
  const fillAll = () => setEntries(() => { const e = {}; roster.forEach((t) => { e[t.id] = { sleep: 'good', energy: 'good', pain: 0 }; }); return e; });
  const SLEEP = [['poor', 'Poor'], ['ok', 'OK'], ['good', 'Good'], ['great', 'Great']];
  const ENERGY = [['low', 'Low'], ['ok', 'OK'], ['good', 'Good'], ['high', 'High']];
  const inp = { fontFamily: FN, fontSize: 12, color: C.tx, background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: '0 8px', width: '100%', height: 'var(--btn-h)', boxSizing: 'border-box', textAlign: 'center' };
  const count = Object.values(entries).filter((e) => e.sleep || e.energy || (e.pain !== '' && e.pain != null) || e.bw).length;
  const cols = '24px 1.3fr auto auto 62px 76px';
  return (
    <BModal open guard onClose={onClose} wide title={tr('Wellness check-in')}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'end', gap: 12, flexWrap: 'wrap' }}>
          <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Btn variant="ghost" data-dirties onClick={fillAll} style={{ marginBottom: 1 }}>{tr('Baseline all OK')}</Btn>
        </div>
        {/* Helper as its own clean full-width line (was crammed into the top-right). */}
        <div style={{ fontFamily: FB, fontSize: 12, color: C.td, lineHeight: 1.5 }}>Sleep · energy · pain (0–10) · BW kg (optional). Pain gates the session; sleep + energy set the effort. Tap a value again to clear.</div>
        <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 10, padding: '0 2px 8px', fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.tm, borderBottom: `1px solid ${C.cardBd}` }}>
          <div>#</div><div>{tr('Athlete')}</div><div style={{ textAlign: 'center' }}>{tr('Sleep')}</div><div style={{ textAlign: 'center' }}>{tr('Energy')}</div><div style={{ textAlign: 'center' }}>{tr('Pain')}</div><div style={{ textAlign: 'center' }}>BW kg</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 380, overflowY: 'auto' }}>
          {roster.map((t) => (
            <div key={t.id} style={{ display: 'grid', gridTemplateColumns: cols, gap: 10, alignItems: 'center', padding: '7px 2px', borderBottom: `1px solid ${C.cardBd}` }}>
              <Jersey n={t.jersey} size={22} />
              <div style={{ fontFamily: FN, fontSize: 13, fontWeight: 700, color: C.tx, whiteSpace: 'normal', overflowWrap: 'break-word' }}>{t.name}</div>
              <div style={{ display: 'flex', justifyContent: 'center' }}><WellnessSeg value={(entries[t.id] || {}).sleep} opts={SLEEP} onPick={(v) => set(t.id, 'sleep', v)} /></div>
              <div style={{ display: 'flex', justifyContent: 'center' }}><WellnessSeg value={(entries[t.id] || {}).energy} opts={ENERGY} onPick={(v) => set(t.id, 'energy', v)} /></div>
              <input type="number" min="0" max="10" value={(entries[t.id] || {}).pain} onChange={(e) => set(t.id, 'pain', e.target.value === '' ? '' : Number(e.target.value))} placeholder="—" style={inp} />
              <input type="number" min="0" step="0.1" inputMode="decimal" value={(entries[t.id] || {}).bw} onChange={(e) => setVal(t.id, 'bw', e.target.value)} placeholder="—" style={inp} title={tr("Bodyweight (kg) — optional, shows in the athlete's history + BW trend")} />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontFamily: FN, fontSize: 11, color: C.td, marginInlineEnd: 'auto' }}>{tr('{n} of {m} filled').replace('{n}', count).replace('{m}', roster.length)}</span>
          <Btn variant="ghost" onClick={onClose}>{tr('Cancel')}</Btn>
          <Btn disabled={!count} onClick={() => onSave({ date, entries })} style={{ background: count ? ORANGE : undefined, borderColor: count ? ORANGE : undefined, color: count ? '#fff' : undefined }}>{tr('Save check-in')}</Btn>
        </div>
      </div>
    </BModal>
  );
}

// LOG S&C SESSION — the zone's daily write. Ohad, 24.9: "sc sessions are
// logged along with a basketball practice", "practices gets logged from the
// players availability on attendance", "no practice plans".
//
// One sheet, one practice slot. The top row picks the date and the S&C
// minutes for the team; the chips pick WHICH practice on that date (a day can
// hold a morning and an evening one). The grid is the PRACTICE LOG: each
// player's day availability and whether he was at THIS practice, prefilled
// from availability (Out for the day = out of the practice). Save writes the
// attendance for the slot and one S&C row per player who was there.
//
// No type picker and no plan box: this sheet writes exactly one thing. A lift
// is personal and has its own sheet (LiftModal). There is no RPE anywhere.
function ScSessionModal({ roster, bhbcLoads, fixtures, onClose, onSave, medical = {}, initialDate = null, initialStart = null }) {
  const tr = useT();
  // DEFAULT TO TODAY, not to the next fixture on the calendar. Picking the
  // next UPCOMING fixture's date meant an unscheduled Saturday session was
  // saved onto Sunday's practice by a coach who did not re-read the date.
  const [date, setDate] = useState(() => initialDate || todayISO());
  // Only court slots are practices. A game is not one, and a legacy weights
  // slot is not one either — lifts are personal now.
  const isPracticeFx = (f) => f && !isCancelled(f) && ['practice', 'shootaround', 'scrimmage'].includes(String(f.type || '').toLowerCase());
  const dayFx = (fixtures || []).filter((f) => f.date === date && isPracticeFx(f)).slice().sort((a, b) => String(a.start || '').localeCompare(String(b.start || '')));
  const [slotStart, setSlotStart] = useState('');
  const [minutes, setMinutes] = useState('');
  const [note, setNote] = useState('');
  const [entries, setEntries] = useState({});
  // The minutes the LAST S&C session took, anywhere in the squad — the block
  // is the same length most days, so it is the honest default. NEVER the
  // slot's own minutes: those are the basketball practice's length (90/120),
  // and copying them onto the S&C row is exactly the flat-minutes mistake the
  // 23.9 rebuild removed.
  const lastScMin = useMemo(() => {
    let best = null;
    for (const rec of Object.values(bhbcLoads || {})) {
      for (const [d, list] of Object.entries((rec && rec.sessions) || {})) {
        for (const r of (list || [])) {
          if (rowKind(r) !== 'sc' || !(Number(r.min) > 0)) continue;
          // the daily 5-min warm-up rows are not a coach's S&C block: as the default
          // they would turn a real 25-min session into 5 (AUDIT-470)
          if (r.teamNote === 'Dynamic warm-up') continue;
          if (!best || d > best.date) best = { date: d, min: Number(r.min) };
        }
      }
    }
    return best ? best.min : null;
  }, [bhbcLoads]);
  useEffect(() => {
    const e = {};
    // The sheet OPENS with anyone the medical record puts out on that date
    // already set to Out, so the coach is correcting a right answer instead of
    // remembering an absence. availOn reads the record for `date`, not today.
    roster.forEach((t) => { const rec = bhbcLoads[t.id] || {}; e[t.id] = { avail: availOn(rec, medical, t.id, date), attended: !(t.arrival && date < t.arrival), bw: '', note: '' }; });
    setEntries(e);
    const list = (fixtures || []).filter((f) => f.date === date && isPracticeFx(f)).slice().sort((a2, b2) => (a2.start || '').localeCompare(b2.start || ''));
    // Default to the NEXT practice still ahead on the clock (so an evening log
    // doesn't default to the morning), else the first practice of the day.
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const upcoming = date === todayISO() ? list.find((f) => (f.start || '') >= hhmm) : null;
    const preset = initialDate && date === initialDate && initialStart != null ? list.find((f) => (f.start || '') === initialStart) : null;
    const prac = preset || upcoming || list.find((f) => f.type === 'practice') || list[0];
    setSlotStart(prac ? (prac.start || '') : '');
  }, [date]); // eslint-disable-line react-hooks/exhaustive-deps
  // IF THIS PRACTICE WAS ALREADY LOGGED, THE SHEET OPENS ON THAT RECORD — its
  // minutes, its note and who was marked in — so a re-save corrects it instead
  // of guessing again (the save replaces the slot's team rows). An unlogged
  // slot gets the last session's minutes and everyone in.
  useEffect(() => {
    const key = `${date}|${slotStart || ''}`;
    let min = null, nt = '';
    const marks = {};
    const owned = {};
    roster.forEach((t) => {
      const rec = bhbcLoads[t.id] || {};
      const att = rec.attendance && rec.attendance[key];
      if (att) marks[t.id] = att === 'in';
      const row = ((rec.sessions || {})[date] || []).find((r) => ownsScRow(r, slotStart || ''));
      if (row) { owned[t.id] = row; if (min == null && Number(row.min) > 0) min = Number(row.min); }
    });
    const { team: teamNt, own } = scPrefillNotes(owned);
    nt = teamNt;
    setEntries((prev) => {
      const next = { ...prev };
      // a player who has not landed by this date was not at it (#305 N-A6)
      const landedBy = (id) => { const t = roster.find((x) => x.id === id); return !(t && t.arrival && date < t.arrival); };
      Object.keys(next).forEach((id) => { next[id] = { ...next[id], attended: id in marks ? marks[id] : landedBy(id), note: own[id] || '' }; });
      return next;
    });
    setMinutes(min != null ? String(min) : (lastScMin ? String(lastScMin) : ''));
    setNote(nt);
  }, [date, slotStart]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (id, k, v) => setEntries((prev) => ({ ...prev, [id]: { ...prev[id], [k]: v } }));
  // One height for every bordered control on the sheet (24.9: 36 everywhere).
  const inp = { fontFamily: FN, fontSize: 12, color: C.tx, background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: '0 8px', width: '100%', height: 'var(--btn-h)', boxSizing: 'border-box' };
  // An S&C block on a date still ahead has not run - the sheet logs, it does
  // not plan (#305 N-A4).
  const future = !!date && date > todayISO();
  const canSave = Number(minutes) > 0 && !future;
  const inCount = Object.values(entries).filter((e) => e && e.attended !== false && e.avail < 4).length;
  // THE NAME COLUMN NEEDS A FLOOR, NOT A FRACTION. Measured 19.9 at 390: every
  // name broke in half ("[GIVEN] / [SURNAME]") at ~86px. minmax gives it 152px before
  // it may shrink; the grid lives in an overflowX:auto scroller, so growing
  // costs a scroll, not a clip.
  const cols = '24px minmax(152px, 1.4fr) 116px 84px 66px 1.5fr';
  return (
    <BModal open guard onClose={onClose} wide title={tr('Log S&C Session')}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* bhbc-form-grid: the ≤620px rule in themes.css stacks these into
            full-width rows on a phone. */}
        <div className="bhbc-form-grid" style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.8fr', gap: 10, alignItems: 'end' }}>
          <Input label={tr('Date')} type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
          <Input label={tr('S&C minutes')} type="number" inputMode="numeric" min="0" value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="10" />
        </div>
        {future && <div style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, color: '#DE4E3B' }}>{tr('That date has not happened yet.')}</div>}
        {/* THE PRACTICE'S LENGTH IS NOT THE S&C BLOCK'S (#305 N-F15) - the flat-
            minutes mistake the 23.9 rebuild removed. Over an hour is said, not
            refused: a long block is possible, a copied 120 is the usual cause. */}
        {!future && Number(minutes) > 60 && <div style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, color: 'var(--bhbc-amber-text, #E0A73A)' }}>{tr('Over an hour - is that the practice length rather than the S&C block?')}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.tm }}>{tr('Which practice')}</span>
            {dayFx.length ? dayFx.map((f, i) => {
              const on = (f.start || '') === slotStart;
              return (
                <button key={i} type="button" data-dirties onClick={() => setSlotStart(f.start || '')}
                  style={{ fontFamily: FN, fontSize: 12, fontWeight: 700, height: 'var(--btn-h)', boxSizing: 'border-box', padding: '0 12px', display: 'inline-flex', alignItems: 'center', lineHeight: 1, cursor: 'pointer', borderRadius: 0,
                    background: on ? NAVY : 'transparent', color: on ? '#fff' : C.tx, border: `1px solid ${on ? NAVY : C.cardBd}` }}>
                  {f.start} · {fxLabelFor(f.type, FX_LABEL[f.type] || 'Session')}{f.minutes ? <>{' · '}<MinTok n={f.minutes} /></> : null}
                </button>
              );
            }) : <span style={{ fontFamily: FB, fontSize: 12, color: C.td }}>{tr('No practice on the schedule for this date — it is saved to the day.')}</span>}
          </div>
        </div>
        {/* WHO WAS THERE — read, not edited (Ohad 26.9: "same for sc sessions:
            time, and note"). Attendance is the day's availability, as he set on
            24.9 ("practices gets logged from the players availability"); the
            per-player In/Out, BW and note controls are gone. */}
        {(() => {
          // The SAME rule as the count beside Save and as the write: out for the
          // day, or already marked out of THIS practice on an earlier save. The
          // list used to read the day only, so a re-opened slot could say
          // "In · 10" over "9/10 at this practice" (#305 N-A5).
          const isIn = (e) => e && e.avail < 4 && e.attended !== false;
          const ins = roster.filter((t) => isIn(entries[t.id]));
          const outs = roster.filter((t) => { const e = entries[t.id]; return e && !isIn(e); });
          const line = (label, list, color) => (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', fontFamily: FB, fontSize: 12, color: C.tx }}>
              <span style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color, flexShrink: 0 }}>{label} · {list.length}</span>
              <span style={{ color: C.tm }}>{list.length ? list.map((t) => t.name).join(' · ') : '—'}</span>
            </div>
          );
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: `1px solid ${C.cardBd}`, borderBottom: `1px solid ${C.cardBd}`, padding: '10px 0' }}>
              {line(tr('In'), ins, '#37B27C')}
              {line(tr('Out'), outs, '#DE4E3B')}
            </div>
          );
        })()}
        {/* WHAT WE DID — one line for the whole S&C session. A note, never a
            plan: he does not want a plan on basketball practices at all.
            Per-athlete notes still win where they were typed. */}
        <div>
          <label style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.tm, display: 'block', marginBottom: 5 }}>{tr('What we did')}</label>
          <input value={note} onChange={(e) => setNote(e.target.value)}
            placeholder={tr('e.g. Dynamic Warm-Up (Quick Feet, Coordination) + Ladders & Hurdles (Hip Mobility)')}
            style={{ ...inp, fontFamily: FB, fontSize: 13, padding: '0 9px' }} />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontFamily: FN, fontSize: 11, color: C.td, marginInlineEnd: 'auto', fontVariantNumeric: 'tabular-nums' }}>
            <span dir="ltr" style={{ unicodeBidi: 'isolate', fontWeight: 800, color: C.tx }}>{inCount}/{roster.length}</span> {tr('at this practice')} · {tr('Team S&C · minutes and a note. Who was in comes from the day’s availability.')}
          </span>
          <Btn variant="ghost" onClick={onClose}>{tr('Cancel')}</Btn>
          <Btn disabled={!canSave} onClick={() => onSave({ date, start: slotStart, minutes, entries, note: (note || '').trim() })} style={{ background: canSave ? ORANGE : undefined, borderColor: canSave ? ORANGE : undefined, color: canSave ? '#fff' : undefined }}>{tr('Log S&C Session')}</Btn>
        </div>
      </div>
    </BModal>
  );
}

function GameEditModal({ game, onClose, onSave }) {
  const tr = useT();
  const [opponent, setOpponent] = useState(game.opponent || '');
  const [venue, setVenue] = useState(game.venue || '');
  const [home, setHome] = useState(game.home == null ? '' : game.home ? 'home' : 'away');
  return (
    <BModal open guard onClose={onClose} title={tr('Game details')}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontFamily: FB, fontSize: 13, color: C.td }}>{dow(game.date)} {monDay(game.date)} · {game.start}</div>
        <Input label="Opponent" value={opponent} onChange={(e) => setOpponent(e.target.value)} placeholder="e.g. Maccabi Tel Aviv" />
        <Input label="Venue" value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="e.g. Hayovel Arena" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 9, fontWeight: 700, color: C.tm, textTransform: 'uppercase', letterSpacing: '0.18em', fontFamily: FN, textAlign: 'center' }}>{tr('Home / Away')}</label>
          <div style={{ display: 'inline-flex', border: `1px solid ${C.cardBd}`, alignSelf: 'center', height: 'var(--btn-h)', boxSizing: 'border-box' }}>
            {[['home', 'Home'], ['away', 'Away'], ['', '—']].map(([k, l]) => (
              <button key={k} type="button" data-dirties onClick={() => setHome(k)} style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, color: home === k ? '#fff' : C.td, background: home === k ? NAVY : 'transparent', border: 'none', padding: '0 16px', minHeight: 0, height: 'calc(var(--btn-h) - 2px)', cursor: 'pointer' }}>{tr(l)}</button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Btn variant="ghost" onClick={onClose}>{tr('Cancel')}</Btn>
          <Btn onClick={() => onSave({ opponent: opponent.trim(), venue: venue.trim(), home: home === '' ? null : home === 'home' })} style={{ background: ORANGE, borderColor: ORANGE, color: '#fff' }}>{tr('Save')}</Btn>
        </div>
      </div>
    </BModal>
  );
}

// Home/Away chip — form + label (never color alone).
// The ✈ glyph. Ohad, 17.9: "make sure the plane is vertically center aligned
// with the rest of the row, and with the away tag". Flex centring lines up the
// BOXES, and the plane's box was centred to 0.00px - but its INK sits high in
// its own line box, so measured at 1440 the ink centre was 1.5px above the AWAY
// chip's and 2.0px above the opponent text's. The lift below puts it back on the
// row's optical centre (0.136 x font-size, measured at 11px, scales with it).
function Plane({ size = 11, color, title }) {
  return (
    <span aria-hidden={title ? undefined : 'true'} title={title}
      style={{ fontFamily: FN, fontSize: size, color, display: 'inline-block', transform: `translateY(${(size * 0.136).toFixed(2)}px)` }}>✈</span>
  );
}

// A LINE MAY NOT END ON A SEPARATOR.
//
// "Power / speed · moderate volume" and its siblings are single text runs, so
// when the box is narrow the break lands wherever it lands - the OCD sweep
// caught lines ending on "·", "/" and "—". There is no way to make a separator
// disappear at a break inside plain text: bind it to the word before and the
// line ends on it, bind it to the word after and the next line starts on it.
// Only elements can do it, so the text becomes elements - segments that never
// break internally, with the separators as their own spans. Below 620px the
// separators hide and the gap does the separating, which is the same call the
// intake tally and the workout-review meta row already make.
//
// Layout only. No wording changes - several of these strings are Hebrew
// coaching copy and two are safety text.
// keepDots: a CLINICAL list keeps its separators at every width, AND keeps the
// SPACES around them. Splitting on / \s[·]\s / drops those spaces and lets the
// flex gap stand in for them, which looks right and reads wrong: the text
// content became "anaesthesia·bowel/bladder change", so copying a red-flag list
// or hearing it read aloud gave run-on words. The separator span carries its own
// spaces here and the gap is zeroed. Hiding them
// on a phone is fine for a focus label, where the gap reads as the separator,
// but a red-flag list must not become run-on text - that is a safety string and
// its legibility is the point. (memory: safety text gets its own meaning check;
// this changes layout only, never wording.)
function Segmented({ text, style, keepDots = false }) {
  const parts = String(text || '').split(/\s([·•/–—|])\s/);
  if (parts.length < 3) return <span style={style}>{text}</span>;
  return (
    <span className={keepDots ? 'seg-run seg-run--keep' : 'seg-run'} style={style}>
      {parts.map((p2, i) => (i % 2
        ? <span key={i} className="seg-dot" aria-hidden>{keepDots ? ` ${p2} ` : p2}</span>
        : <span key={i} style={{ whiteSpace: 'nowrap' }}>{p2}</span>))}
    </span>
  );
}

function HAChip({ home }) {
  const tr = useT();
  if (home == null) return null;
  const isHome = home === true;
  // Theme-aware brand tone — the raw navy is unreadable on the dark page.
  const c = isHome ? 'var(--bhbc-ha-home, ' + NAVY + ')' : 'var(--bhbc-ha-away, ' + ORANGE_DEEP + ')';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: FN, fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: c, background: `color-mix(in srgb, ${c} 12%, transparent)`, border: 'none', padding: '2px 7px', whiteSpace: 'nowrap' }}>
      {isHome ? tr('HOME') : tr('AWAY')}
    </span>
  );
}

// Travel legs for European games (jet-lag / travel-load planning).
function TravelStrip({ travel }) {
  const tr = useT();
  if (!travel) return null;
  const leg = (l, dir) => {
    if (!l) return null;
    const d = l.date ? `${dow(l.date)} ${monDay(l.date)}` : '';
    // THREE COLUMNS, one leg per row (26.9: "MON 5 / OCT" broke its date on a
    // phone). The direction, then when (date + departure, never split), then
    // where - the only part that may wrap, and only between words.
    return (
      <React.Fragment key={dir}>
        <span style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.tm }}>{tr(dir)}</span>
        <span style={{ fontFamily: FN, fontSize: 11, color: C.tx, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{d}{!l.tbd && l.dep ? ` · ${l.dep}` : ''}</span>
        {/* where: on a phone its own row under the date (beside it, 150px
            broke "TEL AVIV → BARCELONA ·" from its flight number and left the
            dot hanging - 27.9 #300); it may only break between the route and
            the flight, and the dot travels with the flight */}
        <span className="bhbc-leg-where" style={{ fontFamily: FN, fontSize: 11, color: C.td, minWidth: 0 }}>{l.tbd ? zoneT('TBD') : <><span style={{ whiteSpace: 'nowrap' }}>{l.label}</span>{l.flight ? <>{' '}<span style={{ whiteSpace: 'nowrap' }}>{'· '}<bdi dir="ltr">{l.flight}</bdi></span></> : null}</>}</span>
      </React.Fragment>
    );
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.cardBd}` }}>
      {/* the plane is centred on the block of legs beside it, not on a baseline */}
      <span style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}><Plane size={12} color={ORANGE_DEEP} /></span>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto auto minmax(0, 1fr)', columnGap: 10, rowGap: 6, alignItems: 'center', flex: 1, minWidth: 0 }}>
        {leg(travel.out, 'Out')}
        {leg(travel.back, 'Back')}
      </div>
    </div>
  );
}

// Road ahead — the next few games after the imminent one, so the coach can see
// congestion + travel and plan the microcycle. Flags tight turnarounds (≤3 days
// between games = elevated load risk).
// WHO WORKS IN HERE — owner only (Ohad: "so i know what coaches and pt's work
// with the app"). Two readings of one trail: the people, newest first, and then
// the actions themselves. Nothing is derived from session dates — every line is
// stamped with the moment the action happened (see bhbcActivity.js).
function ActivityView({ activity = [], tr, he }) {
  const list = Array.isArray(activity) ? activity : [];
  const people = peopleSeen(list, 30);
  const KIND = { open: tr('Signed in'), session: tr('Sessions'), checkin: tr('Check-in'), medical: tr('Medical'), game: tr('Games'), plan: tr('Session plan'), schedule: tr('Schedule'), edit: tr('Edit') };
  const lbl = { fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.tm };
  return (
    <>
      <Card padding={14} leftStripe={NAVY} header={secTitle('Who has been in, last 30 days')}>
        {people.length === 0
          ? <div style={{ fontFamily: FB, fontSize: 12, color: C.td }}>{he ? 'עוד אין פעילות רשומה. כל כניסה ושינוי מכאן והלאה יופיעו כאן.' : 'Nothing recorded yet. Every entry and every change from here on shows up here.'}</div>
          : people.map((p) => (
            <div key={p.by} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '9px 0', borderBottom: `1px solid ${C.cardBd}` }}>
              <span dir="ltr" style={{ fontFamily: FN, fontSize: 12, fontWeight: 700, color: C.tx, unicodeBidi: 'isolate', flex: '1 1 240px', minWidth: 0, overflowWrap: 'anywhere' }} title={p.by}>{byName(p.by) || p.by /* the same name the change list uses (#305 N-E7) */}</span>
              <span style={{ ...lbl, flexShrink: 0 }}>{p.n} {p.n === 1 ? tr('action') : tr('actions')}</span>
              <span style={{ fontFamily: FN, fontSize: 11, color: C.td, flexShrink: 0 }}>{whenText(p.at, he)}</span>
            </div>
          ))}
      </Card>
      <Card padding={14} leftStripe={ORANGE} header={secTitle('What changed')}>
        {list.length === 0
          ? <div style={{ fontFamily: FB, fontSize: 12, color: C.td }}>{he ? 'אין עדיין שינויים.' : 'No changes yet.'}</div>
          : <div className="bhbc-list">{list.slice(0, 120).map((e, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '7px 0', minHeight: 36, boxSizing: 'border-box' /* a row is never under the control height (OCD #494: 29) */, borderBottom: i < Math.min(list.length, 120) - 1 ? `1px solid ${C.cardBd}` : 'none' }}>
              <span style={{ ...lbl, width: 84, flexShrink: 0 }}>{KIND[e.kind] || e.kind}</span>
              <span style={{ fontFamily: FB, fontSize: 12, color: C.tx, flex: '1 1 220px', minWidth: 0 }}>{String(tr(e.what)).replace(/\b(20\d\d)-(\d\d)-(\d\d)\b/g, '$3/$2/$1')}</span>
              <span dir="ltr" style={{ fontFamily: FN, fontSize: 10, color: C.tm, unicodeBidi: 'isolate', flexShrink: 0 }}>{e.by ? byName(e.by) : '—'}</span>
              <span style={{ fontFamily: FN, fontSize: 11, color: C.td, flexShrink: 0, minWidth: 78, textAlign: 'end' }}>{whenText(e.at, he)}</span>
            </div>
          ))}</div>}
        {/* the trail keeps everything; the card shows the newest 120 and SAYS so (#305 N-O2) */}
        {list.length > 120 && <div style={{ fontFamily: FN, fontSize: 11, color: C.tm, paddingTop: 8 }}>{tr('+{n} older changes not shown').replace('{n}', list.length - 120)}</div>}
      </Card>
    </>
  );
}

function FixturesAheadPanel({ fixtures, today }) {
  const tr = useT();
  const games = (fixtures || []).filter((f) => f.type === 'game' && f.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(1, 5);
  if (!games.length) return null;
  let prevDate = (fixtures || []).filter((f) => f.type === 'game' && f.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0]?.date;
  return (
    <Card padding={14} leftStripe={NAVY} header={secTitle('Road Ahead')}>
      <div className="bhbc-list">
        {games.map((g, i) => {
          const days = dayDiff(g.date, today);
          const gap = prevDate ? dayDiff(g.date, prevDate) : null; prevDate = g.date;
          const tight = gap != null && gap <= 3;
          // THE DAY COUNT TOP-ALIGNS WITH THE OPPONENT, ALWAYS.
          // Measured 19.9 at 390 in English: three rows had the count level with
          // the club name and the fourth - FC PORTO, the only one carrying a 3D
          // TURNAROUND tag - had it sitting halfway down, because
          // alignItems:center re-centres against a taller row. The number a coach
          // reads first must start where the name starts.
          return (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '46px 1fr auto', gap: 12, alignItems: 'center', padding: '10px 0', borderBottom: i < games.length - 1 ? `1px solid ${C.cardBd}` : 'none' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: FN, fontWeight: 800, fontSize: 17, lineHeight: 1, color: C.tx, fontVariantNumeric: 'tabular-nums' }}>{days}</div>
                {/* 9, not 7.5: measured at 390px this was the smallest text in the zone,
                    and it labels the number a coach reads first. */}
                <div style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.tm, marginTop: 2 }}>{tr(days === 1 ? 'day' : 'days')}</div>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: FN, fontSize: 13, fontWeight: 700, color: C.tx }}>{g.opponent ? `${tr('vs')} ${g.opponent}` : tr('Opponent TBD')}</span>
                  {/* the travel plane and the turnaround tag ride with the name
                      (27.9: in the badge column they squeezed the name and the
                      Porto row broke into seven lines at 360) */}
                  {g.travel && <Plane size={11} color={ORANGE_DEEP} title={tr('Travel')} />}
                  {tight && <span style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#1A1205', background: '#E0A73A', padding: '1px 6px', whiteSpace: 'nowrap' }} title={tr(gap === 1 ? '1 day after the previous game' : gap === 2 ? '2 days after the previous game' : '{n} days after the previous game').replace('{n}', gap)}>{tr(gap === 1 ? '1d turnaround' : gap === 2 ? '2d turnaround' : '{n}d turnaround').replace('{n}', gap)}</span>}
                </div>
                {/* Competition and date on one line, the VENUE on its own.
                    Joined with " · " they were one text run, and once the badge
                    column took its width the run wrapped mid-separator -
                    "CHAMPIONS LEAGUE · TUE 6 OCT ·" with the dot dangling and
                    "BADALONA, SPAIN" stranded under it. Six of those appeared
                    in the sweep the moment the column was fixed. A place is not
                    a continuation of a date; give it a line and no separator
                    can be left hanging. */}
                <div style={{ fontFamily: FB, fontSize: 11, color: C.td, marginTop: 3 }}>{[tr(g.comp), `${dow(g.date)} ${monDay(g.date)}`].filter(Boolean).join(' · ')}</div>
                {g.venue && <div style={{ fontFamily: FB, fontSize: 11, color: C.td }}>{tr(g.venue)}</div>}
              </div>
              {/* THE BADGES ARE A COLUMN, NOT A TAIL ON THE NAME.
                  The row was already a 46px / 1fr / auto grid but the third
                  track was empty and HOME/AWAY trailed the opponent inline, so
                  it landed wherever that name happened to end - measured at
                  390: the same chip at x=254, x=175 and x=164 down three rows.
                  In its own track, anchored to the row's logical end, every
                  row puts it in the same place in both directions. */}
              <div style={{ justifySelf: 'end', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {/* HOME/AWAY LAST, so the one badge every row HAS owns the
                    anchored edge and the optional flags sit before it. With the
                    chip first, a row carrying a plane pushed its chip 17px off
                    the edge the chip above it sat on. */}
                <HAChip home={g.home} />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function NextGamePanel({ nextGame, today, onEdit }) {
  const he = useHe();
  const tr = useT();
  const days = dayDiff(nextGame.date, today);
  const when = days <= 0 ? tr('GAME DAY') : days === 1 ? tr('Tomorrow') : (he ? `בעוד ${days} ימים` : `In ${days} days`);
  const timeLabel = nextGame.timeTBD || !nextGame.start ? tr('Time TBD') : nextGame.start;
  return (
    <Card padding={14} leftStripe={ORANGE} header={secTitle('Next Game')} headerRight={<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--c-stripTx)' }}>{when}</span>{onEdit && <button className="bhbc-strip-btn" onClick={onEdit} style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--c-stripTx)', background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.3)', height: 24, boxSizing: 'border-box', padding: '0 9px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, cursor: 'pointer' }}>{tr('Edit')}</button>}</div>}>
      <div className="bhbc-nextgame" style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ textAlign: 'center', flexShrink: 0 }}>
          <div style={{ fontFamily: FN, fontWeight: 800, fontSize: 28, lineHeight: 1, color: ORANGE_DEEP, fontVariantNumeric: 'tabular-nums' }}>{Math.max(0, days)}</div>
          <div style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.tm, marginTop: 4 }}>{tr(Math.max(0, days) === 1 ? 'day' : 'days')}</div>
        </div>
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {nextGame.comp && <div style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: ORANGE_DEEP }}>{tr(nextGame.comp)}</div>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: FN, fontWeight: 800, fontSize: 17, color: C.tx }}>{nextGame.opponent ? `${tr('vs')} ${nextGame.opponent}` : tr('Opponent TBD')}</span>
            <HAChip home={nextGame.home} />
          </div>
          <div style={{ fontFamily: FB, fontSize: 13, color: C.td }}>
            {dow(nextGame.date)} {monDay(nextGame.date)} · {timeLabel}{nextGame.venue ? ` · ${nextGame.venue}` : ''}
          </div>
        </div>
      </div>
      {nextGame.travel && <TravelStrip travel={nextGame.travel} />}
    </Card>
  );
}

// Coach's Brief — turns the live monitoring data into a prioritised "do this
// today" list, each call grounded in the S&C corpus (Gabbett ACWR, Foster
// monotony, Mujika taper, ~10%/wk ramp). This is the decision layer: the board
// shows numbers, the brief says what to DO about them. Action-first, rationale
// muted. Pre-season (no data) it points at the right first move: baseline.
// Every brief line is an instruction, so every line gets somewhere to go.
// Ohad: "there's no action buttons (what does starting to track the roster
// mean?)". A brief that names a problem and offers no way to act on it is a
// list of worries. One destination per kind, one fixed button width.
const BRIEF_GO = {
  Setup: ['roster', 'Roster'],
  Game: ['schedule', 'Schedule'],
  Fixtures: ['schedule', 'Schedule'],
  Medical: ['medical', 'Medical'],
  Sessions: ['sessions', 'Sessions'],
};
function CoachBrief({ rows, fx, fixtures, medical, today, onOpen, onLog, onGo }) {
  const tr = useT();
  // SURNAME, not given name (Ohad 09-01): the report read "OUT: [GIVEN],
  // [GIVEN]" while the medical list right above it said [GIVEN SURNAME] and
  // [GIVEN SURNAME]. A squad is called by last names. Last token works for the
  // Hebrew names too (ישראל ישראלי -> ישראלי), and a one-word name is left alone.
  const first = (r) => { const p = (r.t.name || '').trim().split(/\s+/); return p[p.length - 1] || r.t.name; };
  // FSI/PDI: a Hebrew first name inside an English sentence dragged the
  // closing bracket to the wrong side - "([athlete], [athlete], [athlete], [athlete] +1)"
  // rendered with the paren orphaned. Isolating the run fixes it in both
  // languages without touching the surrounding direction.
  // The "+3" belongs OUTSIDE the bidi isolate. Inside it, a list ending in a
  // Hebrew surname reorders to "3+ ישראלי" - the plus lands on the wrong side of
  // the number. Isolating only the NAMES keeps the count in logical order.
  const names = (arr) => '⁨' + arr.slice(0, 4).map(first).join(', ') + '⁩'
    + (arr.length > 4 ? ` +${arr.length - 4}` : '');
  const anyLoad = rows.some((r) => r.hasLoad);
  const A = [];
  // 1) Taper into a game ≤3 days out.
  if (fx.nextGame) {
    const d = dayDiff(fx.nextGame.date, today);
    if (d >= 0 && d <= 3) A.push({ k: 'Game', sev: 'game', do: `${tr('Taper into')} ${fx.nextGame.opponent ? tr('vs') + ' ' + fx.nextGame.opponent : tr('the game')} · ${d === 0 ? tr('today') : d + tr('d')}`, why: tr('hold intensity, cut volume ~40–60%.') });
  }
  // 2) ACWR danger (>1.5) then elevated (1.3–1.5) — Gabbett sweet spot 0.8–1.3.
  const danger = rows.filter((r) => r.acwr.band.key === 'high');
  const elevated = rows.filter((r) => r.acwr.band.key === 'elevated');
  if (danger.length) A.push({ k: 'Load', sev: 'red', do: `${tr('Pull back')} ${names(danger)}`, why: tr('ACWR danger zone'), ids: danger.map((r) => r.t.id) });
  // 3) Readiness red today (autoreg says don't load).
  const red = rows.filter((r) => r.readiness.level === 'red');
  if (red.length) A.push({ k: 'Readiness', sev: 'red', do: `${tr('Regress')} ${names(red)} ${tr('today')}`, why: `${tr('readiness red')} — ${red[0].readiness.headline || tr('reassess before loading')}.`, ids: red.map((r) => r.t.id) });
  // 3b) Fixture congestion — a tight run of games needs rotation + recovery.
  const games = (fixtures || []).filter((f) => f.type === 'game' && f.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  for (let i = 0; i < games.length - 1; i++) {
    const gap = dayDiff(games[i + 1].date, games[i].date);
    if (gap > 0 && gap < 4) { A.push({ k: 'Fixtures', sev: 'amber', do: `${tr('Congestion')} ${monDay(games[i].date)}–${monDay(games[i + 1].date)}`, why: gap === 1 ? tr('1-day turnaround between games - rotate minutes and protect MD+1 recovery.') : gap === 2 ? tr('2-day turnaround between games - rotate minutes and protect MD+1 recovery.') : `${gap}${tr('-day turnaround between games - rotate minutes and protect MD+1 recovery.')}` }); break; }
  }
  // 4) Injuries in rehab.
  const injured = rows.filter((r) => activeInjuries(medical, r.t.id).length);
  if (injured.length) A.push({ k: 'Medical', sev: 'red', do: `${injured.length} ${tr('in rehab')} (${names(injured)})`, why: tr('check the medical board'), ids: injured.map((r) => r.t.id) });
  if (elevated.length) A.push({ k: 'Load', sev: 'amber', do: `${tr('Watch')} ${names(elevated)}`, why: tr('ACWR elevated'), ids: elevated.map((r) => r.t.id) });
  // 5) Monotony ≥2 (Foster).
  const mono = rows.filter((r) => r.ms.monotony != null && r.ms.monotony >= 2);
  if (mono.length) A.push({ k: 'Load', sev: 'amber', do: `${tr('Vary the stimulus for')} ${names(mono)}`, why: tr('monotony high'), ids: mono.map((r) => r.t.id) });
  // 6) Undertrained (ACWR <0.8) — ramp safely.
  const detr = rows.filter((r) => r.acwr.band.key === 'detrained');
  if (detr.length && anyLoad) A.push({ k: 'Load', sev: 'info', do: `${tr('Ramp up')} ${names(detr)}`, why: tr('ACWR undertrained'), ids: detr.map((r) => r.t.id) });
  // 7) Missing wellness check-ins today.
  const missing = rows.filter((r) => !r.checkedToday);
  // (the "chase check-ins" item went with the rest of the check-in flow)
  // 8) Pre-season / no data — baseline first.
  if (!anyLoad && rows.every((r) => !r.checkedToday)) {
    // "START TRACKING" IS THE WRONG ADVICE ONCE TRACKING HAS STARTED.
    //
    // anyLoad is about sRPE, and a squad can have weeks of attendance with no
    // load at all - the gym is minutes-only by rule, and a practice logged
    // without an RPE carries none either. Measured here: 244 sessions on the
    // board and the brief still opened with "start tracking the roster".
    // What is actually missing is the intensity, so say that instead.
    const attended = rows.reduce((n, r) => n + ((r.att && r.att.n) || 0), 0);
    A.unshift(attended
      ? { k: 'Setup', sev: 'game', do: tr('Add an RPE to your sessions'), why: tr('attendance is logged, intensity is not') }
      : { k: 'Setup', sev: 'game', do: tr('Start tracking the roster'), why: tr('pre-season start') });
  }
  const sevRank = { game: 0, red: 1, amber: 2, info: 3 };
  const top = A.sort((a, b) => sevRank[a.sev] - sevRank[b.sev]).slice(0, 5);
  const sevColor = { game: ORANGE, red: '#DE4E3B', amber: '#E0A73A', info: '#4F9DE0' };
  return (
    <Card padding={14} leftStripe={ORANGE} header={secTitle('S&C Brief')} headerRight={<span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--c-stripTx)' }}>{dow(today)} {monDay(today)}</span>}>
      {top.length === 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontFamily: FB, fontSize: 13, color: C.td, padding: '4px 0' }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#37B27C', flexShrink: 0 }} />{tr('All clear — no load, readiness or medical flags today.')}
        </div>
      ) : (
        <div>
          {top.map((a, i) => {
            const click = a.act ? a.act : (a.ids && a.ids.length === 1 && onOpen ? () => onOpen(a.ids[0]) : null);
            const dest = BRIEF_GO[a.k];
            const goTo = dest && onGo ? () => onGo(dest[0]) : null;
            return (
              <div key={i} onClick={click || undefined} className={click ? 'bhbc-row bhbc-brief-row' : 'bhbc-brief-row'}
                  role={click ? 'button' : undefined} tabIndex={click ? 0 : undefined}
                  onKeyDown={click ? ((ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); click(); } }) : undefined}
                style={{ display: 'flex', alignItems: 'center', gap: 14, rowGap: 6, flexWrap: 'wrap', minHeight: 'var(--btn-h)', boxSizing: 'border-box', padding: '6px 2px', borderBottom: `1px solid ${i < top.length - 1 ? C.cardBd : 'transparent'}`, cursor: click ? 'pointer' : 'default', '--sev': sevColor[a.sev] }}>
                {/* Center the dot on the first text line. The +4px offset accounts for
                    Nord's bottom-heavy line box (measured: line-center sits ~4px below
                    the CSS line-box center). Ohad: dot must be vertically centered. */}
                {/* Same left-label column as every other card on this screen.
                    Without it this was the one card built differently, which is
                    most of why it read as a mess next to the report above it -
                    and the reason now sits at the right edge instead of trailing
                    the action, so the row is scannable and the width is used. */}
                <span style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.tm, width: 86, flexShrink: 0, lineHeight: 'normal' }}>{a.k ? tr(a.k) : ''}</span>
                {/* fontSize 13 on the WRAPPER, not just the span inside it. Without
                    it the div inherits 16px and builds a 19.2px line box around
                    15.2px of ink, so the text sat 0.8px below centre while every
                    sibling in the row sat at -0.4 - measured, and exactly the 1.2px
                    spread Ohad could see when he zoomed in. */}
                {/* basis 170, and the row wraps. At 390 - especially in Hebrew, where
                    this was caught - the 74px label, the reason column and the new
                    96px action button left the INSTRUCTION about 20px, so it came
                    out one word per line. The instruction is the point of the row;
                    the button drops to its own line before the text gives way. */}
                <div style={{ minWidth: 0, lineHeight: 'normal', fontSize: 13, flex: '1 1 170px', position: 'relative' }}>
                  <span aria-hidden className="bhbc-brief-dot" style={{ position: 'absolute', insetInlineStart: -21, top: '50%', transform: 'translateY(-50%)', width: 7, height: 7, borderRadius: '50%', background: sevColor[a.sev] }} />
                  <span style={{ fontFamily: FN, fontSize: 13, fontWeight: 700, letterSpacing: '0.02em', color: C.tx }}>{a.do}</span>
                </div>
                <div style={{ fontFamily: FB, fontSize: 13, color: C.tm, lineHeight: 'normal', textAlign: 'start', flex: '0 1 240px', minWidth: 0 }}>{a.why}</div>
                {/* A real button, not a bare chevron. Fixed width so the column
                    is one size down the card, which is the rule everywhere else
                    here. Falls back to the athlete card when the line is about one
                    person and there is no tab for it. */}
                {(goTo || click) && (
                  <button onClick={(e) => { e.stopPropagation(); (goTo || click)(); }}
                    style={{ flexShrink: 0, width: 96, height: 24, boxSizing: 'border-box', display: 'inline-flex',
                      alignItems: 'center', justifyContent: 'center', gap: 4, fontFamily: FN, fontSize: 10,
                      fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: ORANGE,
                      background: 'transparent', border: `1px solid ${ORANGE}`, borderRadius: 0, cursor: 'pointer' }}>
                    {dest ? tr(dest[1]) : tr('Open')}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// The HEAD COACH's daily/weekly REPORT — the game-week picture at a glance:
// next game, who's available, the medical board, and the team's upcoming sessions.
// (The S&C load decisions live in the separate S&C Brief.)
// THE ATHLETE'S EXPO BLOCK, INSIDE BHBC.
//
// Ohad: "make sure the bhbc shows the expo block programs for each athlete
// inside a pop-up inside bhbc... just the program (uneditable) - something like
// how it looks in sessions > single/group", and "make sure the pt's and the
// coaches can view it as well".
//
// It used to open CoachPreviewPortal FULL SCREEN - the athlete's portal, a
// different app's chrome taking over the zone. This is a BHBC modal that reads
// the plan rows and prints them: block picker, week picker, one card per day,
// exercise + prescription. No inputs anywhere, so there is nothing to edit by
// accident, and it is handed to coaches and PTs exactly as to the owner.
function ProgramModal({ athleteName, plans, exercises, currentWeek = 1, onClose }) {
  const tr = useT();
  const { plan, loading, load } = useFullPlan();
  const [planId, setPlanId] = useState(plans[0] ? plans[0].id : null);
  const [pickOpen, setPickOpen] = useState(false);
  // One exercise open at a time, exactly like the group session on the floor.
  const [openEx, setOpenEx] = useState(null);
  const [dayIdx, setDayIdx] = useState(0);
  useEffect(() => { if (planId) load(planId); }, [planId, load]);
  useEffect(() => { setOpenEx(null); setDayIdx(0); }, [planId]);

  // Titles: prefer what the plan ROW stored. A BHBC coach cannot necessarily
  // read the exercise library (athletes cannot either - the title-resolution
  // rule), so the library is only ever a fallback.
  const exById = useMemo(() => {
    const m = new Map();
    for (const e of (exercises || [])) m.set(e.id, e);
    return m;
  }, [exercises]);

  // Ohad: "i don't need to see the entire w1-4 just the current week." The week
  // is where the athlete actually IS, so the per-week reps/sets resolve to what
  // he is doing now and there is nothing to click.
  const weeks = Math.max(1, Number(plan && plan.weeks) || 4);
  const week = Math.min(Math.max(1, currentWeek || 1), weeks);
  const wi = week - 1;
  const days = (plan && Array.isArray(plan.days)) ? plan.days : [];
  // Pairs of [day, its real index], so the day label and key stay correct
  // whether one day is shown or all of them.
  const safeDay = Math.min(dayIdx, Math.max(0, days.length - 1));
  const shownDays = days.length > 1 ? [[days[safeDay], safeDay]] : days.map((d, i) => [d, i]);

  // Both plan shapes, as everywhere else that reads a plan: d.exercises / d.ex,
  // ex.reps / ex.r, ex.sets / ex.s, with per-week overrides in wk / wkS.
  const rowsFor = (d) => ((d.exercises || d.ex || []).filter(Boolean)).map((ex) => {
    const lib = exById.get(ex.exerciseId || ex.eid || '');
    const reps = (Array.isArray(ex.wk) && ex.wk[wi] != null && ex.wk[wi] !== '') ? ex.wk[wi] : (ex.reps ?? ex.r ?? '');
    const sets = (Array.isArray(ex.wkS) && ex.wkS[wi] != null && ex.wkS[wi] !== '') ? ex.wkS[wi] : (ex.sets ?? ex.s ?? '');
    const both = sets !== '' && sets != null && reps !== '' && reps != null;
    // Tempo is PROSE in these plans ("שניות לחזרה 5-6"), not a number. Left in
    // the prescription column it was wider than the title and squeezed every
    // name into three lines, which is what made the popup unreadable. It reads
    // as what it is - a coaching note - under the exercise.
    const tempo = ex.tempo || '';
    const note = String(ex.notes || ex.n || '').trim();
    // The per-week arrays ARE the block's progression. Collapsed we show this
    // week; expanded we show every week, which is the thing a coach opens an
    // old block to look at.
    // One row per prescribed set, which is the shape the group session card
    // opens to. Only a clean numeric set count produces rows - a prescription
    // like "3-4" or "AMRAP" is shown as written rather than invented into a
    // list, because a made-up set count is worse than none.
    const nSets = /^[0-9]+$/.test(String(sets).trim()) ? Number(String(sets).trim()) : 0;
    return {
      title: ex.title || (lib && (lib.title || lib.t)) || '—',
      rx: both ? (sets + '×' + reps) : (reps || sets || ''),
      tempo,
      setCount: nSets > 0 && nSets <= 12 ? nSets : 0,
      reps: String(reps || '').trim(),
      video: ex.videoUrl || ex.vid || (lib && lib.videoLink) || '',
    };
  });

  // Sessions > Group is white cards with hairline borders and colour used only
  // as an accent - no filled bars anywhere. Ohad pointed at it twice; this is
  // that material.
  const chip = (on) => ({
    fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
    padding: '5px 10px', minHeight: 26, boxSizing: 'border-box', cursor: 'pointer', borderRadius: 0,
    background: 'transparent', color: on ? C.tx : C.tm,
    border: '1px solid ' + (on ? C.tx : C.cardBd),
  });

  return (
    <BModal open onClose={onClose} wide title={<>{athleteName}<span className="bm-lead"> · {tr('Program')}</span></>}>
      {plans.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', fontFamily: FB, color: C.tm }}>{tr('No EXPO program assigned yet')}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Ohad: "the block buttons when show a program on bhbc needs to be a
              picker like in programs on expo". Same control: the block you are
              looking at is named, and the older ones sit behind an "N previous"
              expander with a reserved width and tabular digits, so it does not
              resize as the count changes. */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <span style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.tx, minWidth: 0, overflowWrap: 'anywhere' }}>
              {(plans.find((p) => p.id === planId) || plans[0] || {}).name}
            </span>
            {plans.length > 1 && (
              <button type="button" aria-expanded={pickOpen} onClick={() => setPickOpen((v) => !v)}
                title={pickOpen ? tr('Hide earlier blocks') : tr('Show earlier blocks')}
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, minWidth: 112, height: 24, padding: '0 9px', boxSizing: 'border-box', background: pickOpen ? 'rgba(127,127,138,0.14)' : 'transparent', border: '1px solid ' + C.cardBd, borderRadius: 0, cursor: 'pointer', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.tm, fontVariantNumeric: 'tabular-nums' }}>
                {plans.length - 1 === 1 ? tr('1 previous') : `${plans.length - 1} ${tr('previous')}`}
                <svg aria-hidden width="8" height="5" viewBox="0 0 9 6" fill="none"
                  style={{ flexShrink: 0, transform: pickOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>
                  <path d="M1 1l3.5 3.5L8 1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
            <span style={{ marginInlineStart: 'auto', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.tm, whiteSpace: 'nowrap' }}>
              {tr('Week')} <span style={{ color: ORANGE_DEEP }}>{'W' + week}</span>{weeks > 1 ? ' / ' + weeks : ''}
            </span>
          </div>
          {pickOpen && plans.length > 1 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {plans.map((p) => (
                <button key={p.id} type="button" aria-pressed={p.id === planId}
                  onClick={() => { setPlanId(p.id); setPickOpen(false); }} style={chip(p.id === planId)}>{p.name}</button>
              ))}
            </div>
          )}

          {loading && <div style={{ padding: 20, textAlign: 'center', fontFamily: FN, fontSize: 11, letterSpacing: '0.14em', color: C.tm }}>{tr('Loading')}</div>}
          {!loading && days.length === 0 && (
            <div style={{ padding: 20, textAlign: 'center', fontFamily: FB, color: C.tm }}>{tr('This block has no days yet')}</div>
          )}
          {/* ONE DAY AT A TIME, for the same reason the week resolves to where
              the athlete is. The days used to stack in one scroll, so reaching
              Day C of a three-day block meant scrolling past two dozen
              exercises - on the floor, mid-session, on a tablet. A single day
              has nothing to pick, so the row does not appear. */}
          {!loading && days.length > 1 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {days.map((d, di) => (
                <button key={di} onClick={() => { setDayIdx(di); setOpenEx(null); }} style={chip(di === safeDay)}>
                  {d.name || d.n || (tr('Day') + ' ' + (di + 1))}
                </button>
              ))}
            </div>
          )}
          {!loading && shownDays.map(([d, di]) => {
            const list = rowsFor(d);
            return (
              <div key={di}>
                {/* The athlete card in Sessions > Group heads its stack with a
                    quiet "DAY B · W1" line, not a filled bar. */}
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '2px 0 6px' }}>
                  <span style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.tx }}>{d.name || d.n || (tr('Day') + ' ' + (di + 1))}</span>
                  <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.tm }}>{'W' + week} · {list.length} EX</span>
                </div>
                {list.length === 0
                  ? <div style={{ padding: '10px 12px', fontFamily: FB, fontSize: 12, color: C.td, border: '1px solid ' + C.cardBd, background: 'var(--c-sf)' }}>{'—'}</div>
                  : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {list.map((r, ri) => (
                        // One card per exercise: name, then the prescription on
                        // its own line with the cue beside it - the shape of the
                        // exercise cards on the floor.
                        (() => {
                          const key = di + ':' + ri;
                          const open = openEx === key;
                          return (
                        <div key={ri} style={{
                          border: '1px solid ' + (open ? ORANGE : C.cardBd),
                          borderInlineStart: '3px solid ' + (open ? ORANGE : NAVY),
                          background: open ? 'rgba(242,106,43,0.05)' : 'var(--c-sf)',
                          transition: 'border-color .15s, background .15s',
                        }}>
                          {/* Tap to expand, one at a time - the shape of the
                              exercise cards on the floor. The left rail and the
                              orange are what give the card its character; a flat
                              white box reads as a spreadsheet. */}
                          <div role="button" tabIndex={0} aria-expanded={open}
                            onClick={() => setOpenEx(open ? null : key)}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenEx(open ? null : key); } }}
                            style={{ padding: '9px 11px', cursor: 'pointer' }}>
                            <div style={{ display: 'flex', gap: 8, minWidth: 0, alignItems: 'flex-start' }}>
                              <span style={{ width: 16, flexShrink: 0, fontFamily: FN, fontSize: 11, fontWeight: 700, color: open ? ORANGE_DEEP : C.tm, fontVariantNumeric: 'tabular-nums', lineHeight: 1.35 }}>{ri + 1}</span>
                              <span style={{ minWidth: 0, flex: 1, fontFamily: FB, fontSize: 13, fontWeight: 700, color: C.tx, overflowWrap: 'break-word', lineHeight: 1.3 }}>{r.title}</span>
                              <svg aria-hidden width="9" height="6" viewBox="0 0 9 6" fill="none"
                                style={{ flexShrink: 0, marginTop: 4, color: open ? ORANGE_DEEP : C.tm, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>
                                <path d="M1 1l3.5 3.5L8 1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, minWidth: 0, paddingInlineStart: 24 }}>
                              <span dir="ltr" style={{ fontFamily: FN, fontSize: 13, fontWeight: 700, color: ORANGE_DEEP, fontVariantNumeric: 'tabular-nums', unicodeBidi: 'isolate', whiteSpace: 'nowrap', flexShrink: 0 }}>{r.rx || '—'}</span>
                              {r.tempo && <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: C.tm, whiteSpace: 'nowrap' }}>{r.tempo}</span>}
                            </div>
                          </div>
                          <div style={{ display: 'grid', gridTemplateRows: open ? '1fr' : '0fr', transition: 'grid-template-rows 220ms ease' }}>
                            <div style={{ overflow: 'hidden' }} inert={open ? undefined : ''}>
                            <div style={{ padding: '0 11px 10px 24px', borderTop: '1px solid ' + C.cardBd, marginTop: 2, paddingTop: 8 }}>
                              {r.tempo && <div style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: ORANGE_DEEP, marginBottom: 7 }}>{'⏱ ' + r.tempo}</div>}
                              {r.setCount > 0 ? (
                                <div style={{ display: 'grid', gridTemplateColumns: '28px minmax(0, 1fr)', columnGap: 10, rowGap: 3 }}>
                                  <span style={{ fontFamily: FN, fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', color: C.tm }}>{tr('SET')}</span>
                                  <span style={{ fontFamily: FN, fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', color: C.tm }}>{tr('REPS')}</span>
                                  {Array.from({ length: r.setCount }, (_, si) => (
                                    <React.Fragment key={si}>
                                      <span style={{ fontFamily: FN, fontSize: 11, color: C.tm, fontVariantNumeric: 'tabular-nums' }}>{si + 1}</span>
                                      <span dir="ltr" style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, color: C.tx, fontVariantNumeric: 'tabular-nums', unicodeBidi: 'isolate' }}>{r.reps || '—'}</span>
                                    </React.Fragment>
                                  ))}
                                </div>
                              ) : (
                                <div dir="ltr" style={{ fontFamily: FN, fontSize: 11, color: C.tm, unicodeBidi: 'isolate' }}>{r.rx || '—'}</div>
                              )}
                            </div>
                            </div>
                          </div>
                        </div>
                          );
                        })()
                      ))}
                    </div>
                  )}
              </div>
            );
          })}
        </div>
      )}
    </BModal>
  );
}

function HeadCoachReport({ rows, fx, fixtures, medical, loads = {}, today, onOpen, onMedical, onReportNew, onCopy, copied }) {
  const he = useHe();
  const tr = useT();
  // SURNAME, not given name (Ohad 09-01): the report read "OUT: [GIVEN],
  // [GIVEN]" while the medical list right above it said [GIVEN SURNAME] and
  // [GIVEN SURNAME]. A squad is called by last names. Last token works for the
  // Hebrew names too (ישראל ישראלי -> ישראלי), and a one-word name is left alone.
  const first = (r) => { const p = (r.t.name || '').trim().split(/\s+/); return p[p.length - 1] || r.t.name; };
  // Each NAME is its own bidi run (U+2068 FSI .. U+2069 PDI). Without it a
  // Hebrew surname among Latin ones pulls the commas and the closing full
  // stop into its RTL run - the line read "limited: <name>, .<שם>". Same
  // device the roster summary above already uses.
  const iso = (n) => '⁨' + n + '⁩';
  const nameList = (arr) => arr.slice(0, 5).map((r) => iso(first(r))).join(', ') + (arr.length > 5 ? ` +${arr.length - 5}` : '');
  const availOf = (r) => r.avail || 1;                 // 1 = full, 2–3 = limited, 4+ = out
  const out = rows.filter((r) => availOf(r) >= 4);
  const limited = rows.filter((r) => availOf(r) >= 2 && availOf(r) < 4);
  const available = rows.filter((r) => availOf(r) < 2);
  // worst first, the order of the Medical tab and the board (#305 G4)
  const SEV = { out: 0, 'non-contact': 1, limited: 2, available: 3 };
  const injuries = rows.flatMap((r) => activeInjuries(medical, r.t.id).map((inj) => ({ t: r.t, inj })))
    .sort((a, b) => (SEV[a.inj.status] ?? 4) - (SEV[b.inj.status] ?? 4) || String(a.inj.onsetDate || '').localeCompare(String(b.inj.onsetDate || '')));
  const nextGame = fx.nextGame;
  const gd = nextGame ? dayDiff(nextGame.date, today) : null;
  const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const weekEnd = addDays(today, 7);
  const sessions = (fixtures || []).filter((f) => f.type !== 'game' && !isCancelled(f) && f.date >= today && f.date <= weekEnd).sort((a, b) => a.date.localeCompare(b.date) || (a.start || '').localeCompare(b.start || ''));
  const mut = { color: C.tm };
  // The label shares the VALUE's first-line box (13px x 1.5 = 19.5px) instead of
// hanging on its own 9px one. Ohad: "nothing is center aligned". These rows
// are flex-start on purpose - the value can be a multi-line list - so the fix
// is to make the two FIRST lines share a centre, not to centre the whole row.
const lbl = { fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.tm, width: 86, flexShrink: 0, lineHeight: '19.5px' };
  // The LAST row drops its bottom padding. Ohad: "too much white space at the
  // end of every white box". Measured: this card left 32px under its last line
  // against 18px of card padding, because the row's own 11px was being added on
  // top of it - the other cards on the same screen sit at 19px.
  // STACKS ON A PHONE. Side by side, the label column takes ~150 of 390 and

  // every value wraps three deep - which is what Ohad was looking at when he

  // said nothing is aligned. The class does the stacking in CSS so desktop is

  // untouched.

  // 8px, not 11: a single 15px line inside 11+11 makes a 40px row, and stacked
  // down five sections that is most of what Ohad means by "way too much extra
  // space beneath and above texts". 8 keeps the rows separable without the air.
  // The FIRST row sat 33px below the card header and 8px above its divider -
  // measured 25px of air above the row and 0 below it, which is what Ohad saw
  // as "too close to the bottom". The header strip already carries its own
  // bottom margin, so the first row must not add the full 8 on top of it.
  const Section = ({ label, children, last, list, first, src }) => (

    <div className={list ? 'bhbc-labelrow bhbc-labelrow-list' : 'bhbc-labelrow'} style={{ display: 'flex', gap: 14, alignItems: 'flex-start', padding: last ? '8px 2px 0' : '8px 2px', ...(first ? { marginTop: -10, paddingTop: 12, paddingBottom: 12 } : null), borderBottom: last ? 'none' : `1px solid ${C.cardBd}` }}>
      {/* WHERE THE LINE COMES FROM, on hover (#305 H1) */}
      <div style={lbl} title={src}>{label}</div>
      <div style={{ flex: 1, minWidth: 0, fontFamily: FB, fontSize: 13, color: C.tx, lineHeight: 1.5 }}>{children}</div>
    </div>
  );
  return (
    <Card padding={14} leftStripe={NAVY} header={secTitle(`Today · ${dow(today)} ${monDay(today)}`)} headerRight={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>{onCopy && <button className="bhbc-strip-btn" onClick={onCopy} style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--c-stripTx)', background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.3)', height: 24, boxSizing: 'border-box', padding: '0 10px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, cursor: 'pointer', borderRadius: 0 }}>{copied ? tr('Copied') : tr('Copy')}</button>}{/* the date is in the title already - printed twice it pushed the title onto two rows (26.9) */}</span>}>
      {/* NEXT GAME */}
      {/* A SECTION WITH NOTHING TO SAY IS NOT PRINTED (#305 H4): no game on
          the calendar, no Next game line; no sessions this week, no This week -
          the Today line under it already says there is nothing on. */}
      {nextGame && <Section label={tr("Next game")} first src={tr('From the club calendar')}>
        {nextGame
          ? (() => {
              // The row is a chain of `·`-separated FACTS, and the browser was
              // breaking it wherever a space happened to fall - at 470 the venue
              // split as "HADAR / YOSEF, TEL AVIV", which is what reads as the
              // box being too narrow for the text. Each fact is an atom, so a
              // wrap lands ON a separator and never inside a name.
              //
              // Short facts only: an atom wider than the row would OVERFLOW
              // instead of wrapping, so anything long keeps normal wrapping.
              // The separators stay outside the atoms - they are where the line
              // is allowed to break.
              const atom = (t, extra) => <span style={{ whiteSpace: String(t).length <= 26 ? 'nowrap' : 'normal', ...extra }}>{t}</span>;
              // THE TRAVEL DAY, when the trip leaves before game day (#305 G3):
              // an away game two days out that flies tomorrow is really one day
              // out for the S&C plan. Read off the trip's own first leg.
              const outLeg = nextGame.travel && nextGame.travel.out;
              const flies = outLeg && outLeg.date && outLeg.date < nextGame.date && outLeg.date >= today
                ? `${tr('flies')} ${outLeg.date === today ? tr('today') : `${dow(outLeg.date)} ${monDay(outLeg.date)}`}` : null;
              const facts = [
                gd === 0 ? tr('Today') : gd < 0 ? tr('in progress') : (he ? `בעוד ${gd === 1 ? 'יום אחד' : `${gd} ימים`}` : `in ${gd} day${gd === 1 ? '' : 's'}`),
                ...(flies ? [flies] : []),
                // 'Venue TBD' only when the venue IS unknown (#305 N-G2): a neutral
                // cup tie with its arena typed in read "Venue TBD · Begin Arena"
                ...(nextGame.home === true ? [tr('HOME')] : nextGame.home === false ? [tr('AWAY')] : nextGame.venue ? [] : [tr('Venue TBD')]),
                ...(nextGame.venue ? [nextGame.venue] : []),
              ];
              return (
                <span>
                  {atom(nextGame.opponent ? `${tr('vs')} ${nextGame.opponent}` : tr('Opponent TBD'), { fontFamily: FN, fontWeight: 700 })}
                  {facts.map((f, i) => <span key={i} style={mut}>{' · '}{atom(f)}</span>)}
                </span>
              );
            })()
          : <span style={mut}>{tr('No game scheduled.')}</span>}
      </Section>}
      {/* No FOCUS row: practice plans are gone (Ohad, 24.9: "no practice plans"). */}
      {/* WHAT IS ON TODAY. It was a card of its own directly below this one,
          repeating the game and the availability counts that are already
          here. Rendered bare, it keeps its chips and loses the second copy of
          everything else. */}
      <Section label={tr("Today")} first={!nextGame} src={tr('From the club calendar and the logged S&C sessions')}>
        <TodayPanel bare today={today} fixtures={fixtures} fx={fx} rows={rows} loads={loads} />
      </Section>
      <Section label={tr("Availability")} list src={tr('From today’s availability, never better than the medical record')}>
        <span><span style={{ color: C.tx, fontFamily: FN, fontWeight: 800 }}>{available.length}</span> {countWord(available.length, 'available')} <span style={mut}>·</span> <span style={{ color: limited.length ? 'var(--bhbc-amber-text, #E0A73A)' : C.tm, fontFamily: FN, fontWeight: 800 }}>{limited.length}</span> {countWord(limited.length, 'limited')} <span style={mut}>·</span> <span style={{ color: out.length ? '#DE4E3B' : C.tm, fontFamily: FN, fontWeight: 800 }}>{out.length}</span> {tr('out')}</span>
        {(out.length > 0 || limited.length > 0) && <div style={{ marginTop: 3, color: C.tm, fontSize: 12 }}>{out.length ? `${tr('out')}: ${nameList(out)}. ` : ''}{limited.length ? `${countWord(limited.length, 'limited')}: ${nameList(limited)}.` : ''}</div>}
      </Section>
      {/* MEDICAL */}
      <Section label={tr("Medical")} list last={!sessions.length} src={tr('From the medical record')}>
        {injuries.length
          ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(330px, 100%), 1fr))', columnGap: 26, rowGap: 5 }}>
              {/* EVERY PLAYER, NO BORDERS (27.9 #351/#369, Ohad: "the players and
                  rows and borders is not very asthetic" / "show all players
                  instead" of "+1 more"). The 19.9 line above and beneath each
                  athlete drew a double rule under the section line and closed
                  only one of the two columns; the rows now read like THIS WEEK
                  below them - one pitch, the names on one x, the injuries on
                  the next. */}
              {injuries.map(({ t, inj }, i) => {
                const s = MED_STATUS[inj.status] || MED_STATUS.available;
                return (
                  // Wraps for the same reason as the This-week rows: on a phone
                  // the injury description was ellipsized to "AN…", which is not
                  // an injury report. It now takes its own line and the UPDATE
                  // button stays whole.
                  <div key={i} onClick={onOpen ? () => onOpen(t.id) : undefined} role={onOpen ? 'button' : undefined} tabIndex={onOpen ? 0 : undefined} onKeyDown={onOpen ? ((ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onOpen(t.id); } }) : undefined} className={onOpen ? 'bhbc-row bhbc-med-row' : 'bhbc-med-row'} style={{ display: 'grid', gridTemplateColumns: '10px 96px minmax(0, 1fr) auto', alignItems: 'center', columnGap: 8, rowGap: 2, marginInlineStart: -18, cursor: onOpen ? 'pointer' : 'default', padding: '2px 0' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                    <span style={{ fontFamily: FN, fontWeight: 700, fontSize: 12, minWidth: 0, overflowWrap: 'break-word' }}>{surnameOf(t.name)}</span>
                    {/* WRAP, do not ellipsize. The row already wraps, and on a narrow RTL line
    the ellipsis eats the START of the diagnosis — "…T SPRAIN" instead of
    "ANKLE LEFT SPRAIN". A truncated injury is not an injury report. */}
                    <span style={{ color: C.tm, minWidth: 0, whiteSpace: 'normal', overflowWrap: 'break-word' }}>{tr((inj.bodyPart || '').split('/')[0].trim())}{sideTag(inj.side, tr)} · {tr(s.label)}
                                        {/* THE OVERDUE CLAUSE GETS ITS OWN LINE, ALWAYS.
                        Ohad 19.9, on one athlete's row: "המשפט באיחור של [השחקן]
                        מוציא את הכל מאיזון. תתחיל משפטים כאלה משורה חדשה כדי שלא
                        יהיה אי סימטרי". Appended inline it wrapped mid-phrase -
                        'באיחור של 19' on one line and 'ימים' alone on the next -
                        which pushed his name off the column and left the row
                        lopsided next to the rows that happened to fit. display:
                        block puts it on its own line for EVERY athlete, so 19
                        days and 24 days look the same instead of one wrapping
                        and one not. The ' · ' goes with it; a new line does not
                        need a separator. */}                    </span>
                                      {onMedical && (
                      <button onClick={(e) => { e.stopPropagation(); onMedical(t.id); }} title={tr('Update this medical report')} className="bhbc-ghost-btn"
                        style={{ marginInlineStart: 'auto', flexShrink: 0, fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: C.tm, background: 'transparent', border: `1px solid ${C.cardBd}`, borderRadius: 0, height: ROW_BTN_H, boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, padding: '0 9px', cursor: 'pointer' }}>{tr('UPDATE')}</button>
                    )}
</div>
                );
              })}
            </div>
          : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span><span style={{ color: C.tx, fontFamily: FN, fontWeight: 700 }}>{tr('All clear')}</span> <span style={mut}>{tr('— no active injuries.')}</span></span>
              {onReportNew && <button onClick={onReportNew} className="bhbc-ghost-btn" style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: ORANGE, background: 'transparent', border: `1px solid ${C.cardBd}`, borderRadius: 0, height: ROW_BTN_H, boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, padding: '0 9px', cursor: 'pointer' }}>+ {tr('REPORT')}</button>}
            </span>}
      </Section>
      {/* THIS WEEK — team sessions */}
      {sessions.length > 0 && <Section label={tr("This week")} list last src={tr('From the club calendar')}>
        {sessions.length
          ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(330px, 100%), 1fr))', columnGap: 26, rowGap: 5 }}>
              {sessions.slice(0, 6).map((s, i) => {
                return (
                <div key={i}
                  // flexWrap so a squeezed label moves to its own LINE instead of
                  // being crushed to "PR…". Nothing here is clickable any more:
                  // the row used to open the slot's plan, and plans are gone.
                  className="bhbc-week-row"
                  style={{ display: 'flex', alignItems: 'center', lineHeight: 'normal', gap: 10, rowGap: 2, flexWrap: 'wrap', padding: '2px 0' }}>
                  {/* 96 + nowrap, same as the past-practice list: at 78px some dates
                      wrapped to two lines and others did not, so the column read
                      ragged down the card. */}
                  <span style={{ fontFamily: FN, fontWeight: 700, fontSize: 12, color: C.tx, width: 96, flexShrink: 0, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{s.date === today ? tr('Today') : `${dow(s.date)} ${monDay(s.date)}`}</span>
                  <span style={{ fontFamily: FN, fontSize: 12, fontWeight: 700, color: FX_COLOR[s.type] || NAVY, width: 46, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{s.start}</span>
                  {/* The descriptive label is the token that gives way: at 390px the
                      fixed date + time columns plus this label pushed the + PLAN action
                      86px past the viewport, where it could not be tapped at all
                      (mobile sweep 08-25). The ACTION always stays whole. */}
                  {/* minWidth gives the label a floor: below it the row wraps and
                      the label keeps its own line, rather than ellipsizing down to
                      two characters, which told the coach nothing. */}
                  <span style={{ color: C.tm, flexShrink: 1, minWidth: 104, whiteSpace: 'normal', overflowWrap: 'break-word' }}>{fxLabelFor(s.type, FX_LABEL[s.type] || 'Session')}{s.minutes ? <>{' · '}<MinTok n={s.minutes} /></> : null}</span>
                </div>
                );
              })}
              {sessions.length > 6 && <span style={{ color: C.tm, fontSize: 12 }}>{tr('+{n} more on the Schedule tab').replace('{n}', sessions.length - 6)}</span>}
            </div>
          : <span style={mut}>{tr('No team sessions scheduled this week.')}</span>}
      </Section>}
    </Card>
  );
}

// ============================ STAFF BRIEF ============================
// Ohad, 2026-08-28, on what this zone is actually for:
//
//   "just the s&c period on the court which is in the begging of the
//    basketball practice and thats what i plan log and tell the basketball
//    coaches and head coach about"
//
// He plans it, runs it, logs it — and then TELLS SOMEONE. That last step is
// the output of the whole product, and the zone has never produced it: the
// coach had to read four cards and retype the summary into a message.
//
// Built from what the zone already knows — the S&C slot, its focus, and who
// cannot do it — and copied in one tap. Plain text on purpose: it is going
// into a message to a basketball coach, not into another app.
// The plain-text brief staff paste into WhatsApp. Lifted out of the old
// StaffBrief card so COPY keeps producing exactly the same string now that the
// two reports are one.
function staffBriefText({ today, fx, rows, medical, he, tr }) {
  const dayGroup = ((fx && fx.byDay) || []).find((d) => d.date === today);
  const slots = (dayGroup && dayGroup.items) || [];
  // The S&C period sits at the START of a basketball practice, so the practice
  // slot is the one he briefs. A weights session is not briefed. No focus
  // line any more: practice plans are gone (24.9).
  const period = slots.find((f) => f.type === 'practice' && !isCancelled(f)) || null;
  // THE SAME SPLIT AS THE CARD IT IS COPIED FROM (#305 G5). It used to read
  // the injuries only, so a player Out for a personal reason - or set Limited
  // by the coach with no injury filed - went into WhatsApp as available while
  // the card above the Copy button counted him out.
  const limited = [], outList = [];
  for (const r of (rows || [])) {
    const code = r.avail || 1;
    if (code < 2) continue;
    const inj = activeInjuries(medical || {}, r.t.id);
    const worst = inj.find((i) => i.status === 'out') || inj.find((i) => i.status === 'non-contact') || inj.find((i) => i.status === 'limited');
    const label = (x) => [x.bodyPart, x.type].filter(Boolean).map((v) => tr(v)).join(' ');
    const detail = worst ? label(worst) + (code < 4 ? ' (' + tr((MED_STATUS[worst.status] || {}).label || worst.status) + ')' : '') : tr((AVAIL[code] || {}).label || '');
    if (code >= 4) outList.push({ name: r.t.name, detail });
    else limited.push({ name: r.t.name, detail });
  }
  const flat = (e) => e.name + ' — ' + e.detail;
  const availCount = (rows || []).length - limited.length - outList.length;
  const L = he
    ? { when: 'מתי', limited: 'מוגבלים', out: 'בחוץ', avail: 'זמינים', none: 'אין', noSession: 'אין אימון היום' }
    : { when: 'When', limited: 'Limited', out: 'Out', avail: 'Available', none: 'none', noSession: 'no practice today' };
  const dObj = new Date(today + 'T12:00:00');
  const EN_DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const EN_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const briefDate = dowFor(dObj, EN_DOW[dObj.getDay()]) + ' ' + monDayFor(dObj, dObj.getDate() + ' ' + EN_MON[dObj.getMonth()]);
  const whenLine = period
    ? L.when + ': ' + (period.start || '') + ' ' + fxLabelFor(period.type, 'Practice') + (period.minutes ? ' · ' + period.minutes + ' ' + fxLabelFor('__min', 'min') : '')
    : L.when + ': ' + L.noSession;
  return [
    'BHBC · ' + briefDate,
    whenLine,
    '',
    L.avail + ': ' + availCount,
    L.limited + ' (' + limited.length + '): ' + (limited.length ? limited.map(flat).join('; ') : L.none),
    L.out + ' (' + outList.length + '): ' + (outList.length ? outList.map(flat).join('; ') : L.none),
  ].join(String.fromCharCode(10));
}

// Contact minutes and the density they make, in his own bands. Renders
// nothing at all unless both numbers were entered - a practice with no
// contact figure is not a 0% practice.
function DensityBit({ f: fx, size = 11 }) {
  const tr = useT();
  const d = densityOf(fx);
  if (!d) return null;
  return (
    <span style={{ fontFamily: FN, fontSize: size, color: C.tm, whiteSpace: 'nowrap' }}>
      {fx.contactMin} {tr('contact')}{' \u00B7 '}
      <span style={{ color: d.band.color, fontWeight: 800 }}>{d.pct.toFixed(1)}%</span>{' '}
      {tr(d.band.key)}
      {d.highVolume ? ` \u00B7 ${tr('high volume')}` : ''}
      {' \u00B7 '}<span title={tr(QUAD_MEANING[d.quadrant])} style={{ fontWeight: 800, color: C.td }}>{d.quadrant}</span>
    </span>
  );
}
function TodayPanel({ today, fixtures, fx, rows, loads = {}, bare = false }) {
  const he = useHe();
  const tr = useT();
  const todayFx = (fixtures || []).filter((f) => f.date === today).slice().sort((a, b) => String(a.start || '').localeCompare(String(b.start || '')));
  const next = fx.byDay[0];
  const av = { full: 0, mod: 0, out: 0 };
  rows.forEach((r) => { if (r.avail <= 1) av.full++; else if (r.avail <= 3) av.mod++; else av.out++; });
  const gd = fx.nextGame ? dayDiff(today, fx.nextGame.date) : null;
  const gdLabel = gd == null ? null : gd === 0 ? tr('GAME DAY') : gd < 0 ? (he ? `עוד ${-gd === 1 ? 'יום אחד' : `${-gd} ימים`} למשחק` : `${-gd} day${gd === -1 ? '' : 's'} to game`) : null;
  // time (with date when it's a future/next session) highlighted in a navy
  // segment; all text one size.
  // A session chip and its density line. No plan under it: practice plans are
  // gone (Ohad, 24.9: "no practice plans").
  // Under each of TODAY's practices: was its S&C logged (#305 G1)? The coach
  // sees what is still his to log without opening the sheet. A practice that
  // has started and has nothing logged is the one exception coloured.
  const ids = (rows || []).map((r) => r.t.id);
  const nowD = new Date();
  const nowHHMM = `${String(nowD.getHours()).padStart(2, '0')}:${String(nowD.getMinutes()).padStart(2, '0')}`;
  const scLine = (f) => {
    if (f.date !== today || isCancelled(f) || !COURT_PRACTICE.includes(String(f.type || '').toLowerCase())) return null;
    const sc = scLoggedFor(loads, ids, f, fixtures);
    const started = !!f.start && f.start <= nowHHMM;
    return (
      <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: sc ? C.tm : started ? ORANGE_DEEP : C.td, whiteSpace: 'nowrap' }}>
        {sc ? <>{tr('S&C')} ✓ <MinTok n={sc.min} /></> : tr('S&C not logged yet')}
      </span>
    );
  };
  const chipWrap = (f, i, showDate) => (
    <span key={i} style={{ display: 'inline-flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }}>
      {chip(f, i, showDate)}
      <DensityBit f={f} />
      {scLine(f)}
    </span>
  );
  // the zone's one session chip (#509) - it was a 30px chip of its own here
  const chip = (f, i, showDate) => <EventChip key={i} f={f} time={showDate ? `${dow(f.date)} ${monDay(f.date)} · ${f.start}` : f.start} />;
  // Today's prescribed training focus, from the microcycle (game-anchored).
  const mdToday = fx.nextGame ? -dayDiff(fx.nextGame.date, today) : null;
  const focus = mdToday != null ? mdPlan(mdToday) : null;
  const focusC = focus ? (focus.game ? ORANGE : focus.load >= 5 ? ORANGE_DEEP : focus.load >= 3 ? NAVY : '#6B7280') : NAVY;
  const inner = (
    <>
      {/* 18.9 (Ohad): "today's focus md-7 general prep is not center vertically
          aligned between the upper and lower border". It had 0 padding above and
          14 below, so its ink sat 7.18px high in its own band - measured. Split
          the padding and the ink lands on the band's centre. */}
      {focus && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, paddingTop: 7, paddingBottom: 7, borderBottom: `1px solid ${C.cardBd}`, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.tm }}>{tr('Today’s focus')}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 'var(--btn-h)', boxSizing: 'border-box', padding: '0 12px', fontFamily: FN, fontSize: 11, fontWeight: 800, lineHeight: 1 /* the house 36 (#509: it was a 22px pill beside 36px controls); line-height 1 keeps the caps centred (#467) */, letterSpacing: '0.06em', color: focusC, background: `color-mix(in srgb, ${focusC} 13%, transparent)`, border: `1px solid color-mix(in srgb, ${focusC} 38%, transparent)`, whiteSpace: 'nowrap' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: focusC, flexShrink: 0 }} />{tr(focus.label)}</span>
          <Segmented text={tr(focus.emphasis)} style={{ fontFamily: FB, fontSize: 13, color: C.tx }} />
        </div>
      )}
      <div className="bhbc-today-row" style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: '2 1 300px', minWidth: 240 }}>
          <div style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.tm, marginBottom: 8 }}>{tr('Sessions')}</div>
          {todayFx.length ? (
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>{todayFx.map((f, i) => chipWrap(f, i, false))}</div>
          ) : next ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.td }}>{tr('None today · next')}</span>
              {next.items.slice(0, 3).map((f, i) => chipWrap(f, i, true))}
            </div>
          ) : <span style={{ fontFamily: FB, fontSize: 13, color: C.td }}>{tr('No sessions scheduled.')}</span>}
        </div>
        {/* No actions here: Log S&C Session and Log lift live in the toolbar,
            present on EVERY tab, so this card carries no second copy. */}
      </div>
    </>
  );
  if (bare) return inner;
  return (
    <Card padding={14} leftStripe={ORANGE} header={secTitle(`Today's sessions · ${dow(today)} ${monDay(today)}`)}
      headerRight={gdLabel ? <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: C.tm }}>{gdLabel}</span> : null}>
      {inner}
    </Card>
  );
}

function TeamSnapshotCard({ team }) {
  const tr = useT();
  const cells = [
    { k: 'Roster', v: team.n, sub: 'athletes', c: C.tx },
    { k: 'Avg ACWR', v: team.avg != null ? team.avg.toFixed(2) : '—', sub: team.avg != null ? acwrLabel(team.avg) : 'no load logged', c: team.avg != null ? BAND[bandKey(team.avg)] : C.tx },
    { k: 'Flagged', v: team.flagged, sub: 'elevated / danger', c: team.flagged ? BAND.high : C.tx },
    { k: '7-day load', v: team.week ? team.week.toLocaleString() : '—', sub: 'team sRPE', c: C.tx, spark: team.teamSeries },
  ];
  return (
    <Card leftStripe={NAVY} header={secTitle('Team Snapshot')} padding={14}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        {cells.map((s, i) => (
          <div key={s.k} style={{ padding: '10px 14px', borderInlineStart: i ? `1px solid ${C.cardBd}` : 'none', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 92 }}>
            <div style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.tm }}>{s.k}</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ fontFamily: FN, fontWeight: 800, fontSize: 28, lineHeight: 1, color: s.c, fontVariantNumeric: 'tabular-nums' }}>{s.v}</div>
              {s.spark && <Sparkline series={s.spark} w={72} h={26} />}
            </div>
            <div style={{ fontFamily: FB, fontSize: 11, color: C.td }}>{s.sub}</div>
          </div>
        ))}
      </div>
      {(() => {
        const vals = (team.series28 || []).map((d) => d.load);
        if (!vals.some((v) => v > 0)) return <div style={{ padding: '8px 14px 2px', borderTop: `1px solid ${C.cardBd}`, fontFamily: FB, fontSize: 11.5, color: C.td }}>{tr('Team load trend appears here once sessions are logged.')}</div>;
        const max = Math.max(...vals, 1), n = vals.length, W = 800, H = 76, padB = 6, padT = 8;
        const gx = (i) => (n <= 1 ? W / 2 : (i / (n - 1)) * W);
        const gy = (v) => padT + (1 - v / max) * (H - padT - padB);
        const line = vals.map((v, i) => `${gx(i).toFixed(1)},${gy(v).toFixed(1)}`).join(' ');
        const area = `M0,${H - padB} L${line.replace(/ /g, ' L')} L${W},${H - padB} Z`;
        return (
          <div style={{ padding: '14px 18px 4px', borderTop: `1px solid ${C.cardBd}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.tm, marginInlineEnd: 8 }}>28-day team load</span>
              <span style={{ fontFamily: FN, fontSize: 9, color: C.td, fontVariantNumeric: 'tabular-nums' }}>peak {Math.round(max).toLocaleString()}</span>
            </div>
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: H, display: 'block' }} aria-hidden="true">
              <defs><linearGradient id="bhbcTeamLoad" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={ORANGE} stopOpacity="0.28" /><stop offset="100%" stopColor={ORANGE} stopOpacity="0" /></linearGradient></defs>
              <path d={area} fill="url(#bhbcTeamLoad)" />
              <polyline points={line} fill="none" stroke={ORANGE} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2, fontFamily: FN, fontSize: 9, color: C.td }}><span>{tr('28d ago')}</span><span>{tr('today')}</span></div>
          </div>
        );
      })()}
    </Card>
  );
}

// WHO TRAINED BASKETBALL, AND WHO DID NOT.
//
// Ohad, 20.9: "i want an easy way to view the history of who trained
// (basketball) and who didn't like the weight room view".
//
// Same instrument as the weight room - athletes down, days across, one cell per
// athlete per day - with one difference that matters. In the weight room a day
// with no lift is nobody's fault: no session was owed. On the court there IS a
// session, on the schedule, and the question is who was at it. So a cell here
// is only meaningful against a FIXTURE, and it has to separate three different
// kinds of "no bar":
//
//   nothing owed  - no court session that day. Blank, and no judgement.
//   nobody logged - a session was scheduled and NOT ONE athlete has a record
//                   for it. That is a gap in the logging, not an absence, and
//                   calling it a miss would accuse ten people of skipping a
//                   practice that was simply never written down. Faint dash.
//   excused       - out on the medical record for that date (medicalAvailOn),
//                   so the absence is expected. Tinted, never counted as missed.
//   missed        - the session was logged, he was available, and he was not
//                   there. This is the one he asked to see, so it is the only
//                   mark that is loud, and it is what the banner at the top counts.
//
// Nothing here invents attendance. An unlogged day stays unlogged.
function CourtAttendanceTab({ rows = [], loads = {}, medical = {}, fixtures = [], today, onOpen }) {
  const tr = useT();
  const he = useHe();
  const [monthOff, setMonthOff] = useState(0);
  // Lifts and the team S&C can be laid over the schedule (27.9: "toggle button
  // for lifts and sc sessions"); off by default, remembered.
  const [showSc, setShowSc] = usePersistentState('bhbc-att-sc', false);
  const [showLift, setShowLift] = usePersistentState('bhbc-att-lift', false);

  const COURT = ['practice', 'game', 'scrimmage', 'shootaround'];
  const isCourtFx = (f) => f && !isCancelled(f) && COURT.includes(String(f.type || '').toLowerCase());
  // WHAT COUNTS AS BEING AT THE PRACTICE. A court row (attendance), a game
  // row (minutes played), or the team S&C row logged WITH that practice — the
  // S&C block runs at the start of the practice, so an S&C row is a record of
  // being there. Measured on the live store 24.9: of 230 legacy Conditioning
  // rows, 112 are the ONLY record of that athlete at that practice (no
  // attendance mark exists for the day), so dropping them would blank weeks
  // of logged practices. A personal LIFT is never court attendance — that was
  // the 20.9 bug — and S&C MINUTES are never court time: only a court or game
  // row's minutes reach the cell.
  const isCourtRow = (r) => { const k = rowKind(r); return k === 'practice' || k === 'game' || k === 'sc'; };
  const courtMins = (r) => { const k = rowKind(r); return (k === 'practice' || k === 'game') ? (Number(r.min) || 0) : 0; };

  const days = useMemo(() => monthDays(today, monthOff), [today, monthOff]);
  const scrollRef = useRef(null);
  useScrollToToday(scrollRef, `${today}|${monthOff}`);

  // Which court sessions each day held, and what kind the day was. A day with a
  // game in it reads as a game day even if it also held a shootaround.
  const dayFx = useMemo(() => {
    const m = {};
    for (const f of (fixtures || [])) {
      if (!isCourtFx(f)) continue;
      (m[f.date] = m[f.date] || []).push(f);
    }
    return m;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixtures]);

  // Game days whose box score is in (anyone on the roster has a game row).
  // Before that the game reads as pending, never as ten "did not play"s.
  const gameDays = useMemo(() => {
    const s = new Set();
    for (const { t } of (rows || [])) {
      const rec = loads[t.id] || {};
      for (const [d, list] of Object.entries(rec.sessions || {})) if ((list || []).some((r) => rowKind(r) === 'game')) s.add(d);
    }
    return s;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, loads]);

  const per = useMemo(() => (rows || []).map(({ t }) => {
    const rec = loads[t.id] || {};
    const ses = rec.sessions || {};
    const attended = [];
    const cells = days.list.map((d) => {
      const slots = dayFx[d.iso] || [];
      if (d.future || !slots.length) return { iso: d.iso, state: 'none', future: d.future };
      const kind = slots.some((f) => f.type === 'game') ? 'game'
        : slots.some((f) => f.type === 'scrimmage') ? 'scrimmage'
          : slots.some((f) => f.type === 'practice') ? 'practice' : 'shootaround';
      const all = ses[d.iso] || [];
      const rowsOfDay = all.filter(isCourtRow);
      const sc = all.some((r) => rowKind(r) === 'sc');
      const lift = all.some((r) => rowKind(r) === 'lift');
      const att = rec.attendance || {};
      const markedIn = slots.some((f) => att[`${d.iso}|${f.start || ''}`] === 'in');
      const markedOut = slots.some((f) => att[`${d.iso}|${f.start || ''}`] === 'out');
      const code = availOn(rec, medical, t.id, d.iso);
      const mins = rowsOfDay.reduce((a, r) => a + courtMins(r), 0);
      // DRAWN FROM THE ROSTER STATUS (27.9, Ohad: "it needs to draw a roster
      // for each practice based on the roster status for each player and the
      // practices in the schedule"). A scheduled practice is attended by
      // everyone available that day - no logging needed; an explicit "out" on
      // the slot is the coach's own answer and beats it; Out/medical = excused.
      // A GAME shows the game (27.9: "show a game status on gamedays"):
      // played (a game row), did not play, or out - pending until the box
      // score is in.
      let state;
      if (kind === 'game') {
        if (all.some((r) => rowKind(r) === 'game')) state = 'played';
        else if (!gameDays.has(d.iso)) state = 'pending';
        else state = code >= 4 ? 'excused' : 'dnp';
      } else if (markedOut) state = code >= 4 ? 'excused' : 'missed';
      else if (rowsOfDay.length || markedIn) state = 'in';
      else state = code >= 4 ? 'excused' : 'in';
      // before he landed nothing was owed (#305 N-B1): no 'in', no 'did not
      // play' for a day he was not in the country - unless a row says otherwise
      if (t.arrival && d.iso < t.arrival && state !== 'played' && !rowsOfDay.length && !markedIn && !markedOut) state = 'none';
      if (state === 'in' || state === 'played') attended.push(d.iso);
      return { iso: d.iso, state, kind, mins, code, sc, lift };
    });
    const last = attended.length ? attended[attended.length - 1] : null;
    const since = last ? dayDiff(today, last) : null;
    const owed = cells.filter((c) => c.kind !== 'game' && (c.state === 'in' || c.state === 'missed')).length;
    const went = cells.filter((c) => c.kind !== 'game' && c.state === 'in').length;
    const missed = cells.filter((c) => c.state === 'missed').length;
    return { t, cells, last, since, owed, went, missed, todayCode: availOn(rec, medical, t.id, today) };
  }), [rows, loads, medical, days, dayFx, gameDays, today]);

  // Per day: how many of the squad were there, out of how many were expected.
  const perDay = days.list.map((d, i) => {
    const cs = per.map((p) => p.cells[i]).filter(Boolean);
    const expected = cs.filter((c) => ['in', 'missed', 'played', 'dnp'].includes(c.state)).length;
    if (!expected && !cs.some((c) => c.state === 'excused')) return null;
    return { went: cs.filter((c) => c.state === 'in' || c.state === 'played').length, expected };
  });
  // The answer to "who didn't", surfaced instead of hunting for it in the grid.
  const absentees = per.filter((p) => p.missed > 0).sort((a, b) => b.missed - a.missed);
  // 24, not 22 (29.9 #380): two-digit days at 10px are ~25px of ink and ran
  // into the next column at 22.
  const CELL = 24;
  const TINT = { 1: 'transparent', 2: 'rgba(224,167,58,0.18)', 3: 'rgba(79,157,224,0.18)', 4: 'rgba(222,78,59,0.20)', 5: 'rgba(124,130,139,0.20)' };
  const MISS = '#DE4E3B';
  const pct = (p) => (p.owed ? Math.round((p.went / p.owed) * 100) : null);
  // colour only the exceptions (#305 N-E6): 90%+ is the normal state, plain ink
  const pctInk = (v) => (v == null ? C.cardBd : v >= 90 ? C.tx : v >= 75 ? 'var(--bhbc-amber-text, #E0A73A)' : MISS);
  const monthOwed = per.reduce((a, p) => a + p.owed, 0);
  const monthWent = per.reduce((a, p) => a + p.went, 0);
  // SORTABLE LIKE EVERY TABLE IN THE ZONE (27.9). The name column A->Z; a DAY
  // column by that day's mark - there first (more court minutes first), then a
  // game still waiting for its box score, then excused (out), then missed /
  // did not play; a day with no session for him sorts last either way. The
  // last column by the share of practices he made.
  const MARK = { played: 4, in: 3, pending: 2, excused: 1, missed: 0, dnp: 0 };
  const markVal = (c) => (!c || MARK[c.state] == null ? null : MARK[c.state] + Math.min(c.mins || 0, 999) / 1000);
  const sort = useSort(per, {
    name: { get: (p) => p.t.name, asc: true },
    pct: (p) => (p.owed ? p.went / p.owed + p.went / 1e4 : null),
    ...Object.fromEntries(days.list.map((d, i) => [`d:${d.iso}`, (p) => markVal(p.cells[i])])),
  });

  return (
    <Card leftStripe={FX_COLOR.practice} padding={0} header={secTitle('Practice Attendance')}
      headerRight={(
        <span className="strip-meta" style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: C.tm, whiteSpace: 'nowrap' }}>
          {monthOwed ? `${monthWent}/${monthOwed} ${tr('attended this month')}` : tr('nothing logged this month')}
        </span>
      )}>
      {!!absentees.length && (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', padding: '9px 14px', borderBottom: `1px solid ${C.cardBd}`, background: 'rgba(222,78,59,0.06)' }}>
          <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 800, letterSpacing: '0.10em', textTransform: 'uppercase', color: MISS, flexShrink: 0 }}>{tr('absences')}</span>
          {/* Two equal columns, same as the weight room's DUE strip: wrapped
              chips are as wide as the name inside them and land on a different
              edge each. */}
          <span style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 6, minWidth: 0, flex: '1 1 100%' }}>
            {absentees.map(({ t, missed }) => (
              <span key={t.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 24, padding: '0 8px', border: `1px solid ${C.cardBd}`, background: 'var(--c-sf)', fontFamily: FN, fontSize: 10.5, fontWeight: 700, color: C.tx, whiteSpace: 'nowrap' }}>
                <span style={{ unicodeBidi: 'isolate' }}>{t.name}</span>
                <span style={{ color: MISS, fontWeight: 800, unicodeBidi: 'isolate', fontVariantNumeric: 'tabular-nums' }}>{missed}</span>
              </span>
            ))}
          </span>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, rowGap: 6, flexWrap: 'wrap', padding: '8px 14px', borderBottom: `1px solid ${C.cardBd}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button type="button" onClick={() => setMonthOff((v) => v - 1)} className="bhbc-ghost-btn" aria-label={tr('Previous month')}
            style={navArrow(false)}>{he ? '›' : '‹'}</button>
          <span style={{ fontFamily: FN, fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.tx, minWidth: 116, textAlign: 'center' }}>{tr(days.label.split(' ')[0])} {days.label.split(' ')[1]}</span>
          <button type="button" disabled={monthOff >= 0} onClick={() => setMonthOff((v) => Math.min(0, v + 1))} className="bhbc-ghost-btn" aria-label={tr('Next month')}
            style={navArrow(monthOff >= 0)}>{he ? '‹' : '›'}</button>
        </div>
        {/* The sentence gets its own line rather than being squeezed into the
            gap beside the pager - same rule as the weight room. */}
        <span style={{ fontFamily: FB, fontSize: 11, color: C.tm, flex: '1 1 100%', minWidth: 0 }}>
          {tr('Every practice is drawn from the day’s availability. A filled box is a session he was at; a red outline, a session he missed while available; an outlined game, a game he did not play.')}
        </span>
        <span style={{ display: 'inline-flex', gap: 6 }}>
          {[['sc', tr('S&C'), showSc, setShowSc, SC_COLOR], ['lift', tr('Lifts'), showLift, setShowLift, FX_COLOR.lift]].map(([k, l, on, set, col]) => (
            <button key={k} type="button" aria-pressed={on} onClick={() => set(!on)} className="bhbc-ghost-btn"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 'var(--btn-h)', minHeight: 0, padding: '0 10px', boxSizing: 'border-box' /* 26 -> 36, as the LIFTS tab's own S&C toggle (OCD #494) */, fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: on ? C.tx : C.tm, background: on ? `color-mix(in srgb, ${col} 14%, transparent)` : 'transparent', border: `1px solid ${on ? col : C.cardBd}`, borderRadius: 0, cursor: 'pointer' }}>
              <span style={{ width: 8, height: 8, background: on ? col : 'transparent', border: `1px solid ${col}` }} />{l}
            </button>
          ))}
        </span>
      </div>

      {/* THE SAME GRID AS LIFTS (#509): the whole month at one column width,
          the name and the ATTENDED column pinned while the days scroll, rows
          of 36 (they were 26 - under the zone's row height). */}
      <div ref={scrollRef} className="bhbc-lifts-scroll bhbc-month-scroll" style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: `calc(var(--lifts-name-w, ${LIFTS_NAME_W}px) + var(--lifts-last-w, ${LIFTS_LAST_W}px) + ${28 + days.list.length * CELL}px)` }}>
          <div style={{ display: 'grid', gridTemplateColumns: `var(--lifts-name-w, ${LIFTS_NAME_W}px) repeat(${days.list.length}, minmax(${CELL}px, 1fr)) var(--lifts-last-w, ${LIFTS_LAST_W}px)`, alignItems: 'center', padding: '0 14px', minHeight: 36, background: 'var(--c-sf2)', borderBottom: `1px solid ${C.cardBd}`, marginBottom: 6 }}>
            <SortHeader k="name" sort={sort} label={tr('Athlete')} style={{ ...pinStart('var(--c-sf2)'), fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.tm }} />
            {days.list.map((d) => (
              d.future
                ? <span key={d.iso} title={monDay(d.iso)} style={{ fontFamily: FN, fontSize: 10, fontWeight: 600, color: dayHeadInk(d, today), textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{d.dom}</span>
                : <SortHeader key={d.iso} k={`d:${d.iso}`} sort={sort} label={d.dom} float title={monDay(d.iso)} aLabel={`${tr('Sort by')} ${monDay(d.iso)}`} style={{ fontFamily: FN, fontSize: 10, fontWeight: d.iso === today ? 800 : 600, color: dayHeadInk(d, today), textAlign: 'center', fontVariantNumeric: 'tabular-nums' }} {...(d.iso === today ? { 'data-today-col': '' } : {})} />
            ))}
            <SortHeader data-end-head="" k="pct" sort={sort} title={`${tr('Sort by')} ${tr('attended')}`} aLabel={tr('attended')} label={tr('attended')} style={{ ...pinEnd('var(--c-sf2)'), fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.tm, textAlign: 'end', paddingInlineStart: 10 }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `var(--lifts-name-w, ${LIFTS_NAME_W}px) repeat(${days.list.length}, minmax(${CELL}px, 1fr)) var(--lifts-last-w, ${LIFTS_LAST_W}px)`, alignItems: 'center', padding: '0 14px 6px' }}>
            <span style={{ ...pinStart('var(--c-sf)'), fontFamily: FN, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: C.tm }}>{tr('there')}</span>
            {perDay.map((v, i) => (
              // nobody was expected (the whole squad out) is a dash, not "0 there" (#305 B8); a day ahead says nothing
              <span key={days.list[i].iso} title={v && !v.expected ? tr('all out') : undefined} style={{ fontFamily: FN, fontSize: 9.5, fontWeight: 700, color: v == null || !v.expected ? C.cardBd : C.td, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{days.list[i].future ? '' : v == null || !v.expected ? '—' : v.went}</span>
            ))}
            <span style={{ ...pinEnd('var(--c-sf)'), alignSelf: 'stretch' }} />
          </div>
          <div className="hl-rows" style={{ display: 'grid', gap: 1, background: C.cardBd }}>
            {sort.rows.map(({ t, cells, last, todayCode, went, owed }) => (
              <div key={t.id} role={onOpen ? 'button' : undefined} tabIndex={onOpen ? 0 : undefined}
                onClick={onOpen ? () => onOpen(t.id) : undefined}
                onKeyDown={onOpen ? ((e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(t.id); } }) : undefined}
                style={{ display: 'grid', gridTemplateColumns: `var(--lifts-name-w, ${LIFTS_NAME_W}px) repeat(${cells.length}, minmax(${CELL}px, 1fr)) var(--lifts-last-w, ${LIFTS_LAST_W}px)`, alignItems: 'center', background: 'var(--c-sf)', padding: '0 14px', minHeight: 36, cursor: onOpen ? 'pointer' : 'default' }}>
                <span style={{ ...pinStart('var(--c-sf)'), display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, paddingInlineEnd: 8, minHeight: 36, alignSelf: 'stretch' }}>
                  <span title={todayCode > 1 ? tr(AVAIL[todayCode].label) : undefined} aria-label={todayCode > 1 ? tr(AVAIL[todayCode].label) : undefined} aria-hidden={todayCode > 1 ? undefined : 'true'} style={{ width: 7, height: 7, borderRadius: '50%', background: todayCode > 1 ? AVAIL[todayCode].color : 'transparent', flexShrink: 0 }} /* the slot is always there, so every name starts on one x (26.9) */ />
                  <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, color: C.tm, minWidth: 20, fontVariantNumeric: 'tabular-nums' }}>{t.jersey != null ? t.jersey : ''}</span>
                  <PlayerName name={t.name} className="lifts-name" style={{ fontFamily: FN, fontSize: 12, fontWeight: 700, color: C.tx, flex: '1 1 auto' }} />
                </span>
                {cells.map((c) => {
                  const label = c.state === 'none' ? (t.arrival && c.iso < t.arrival && dayFx[c.iso] ? `${monDay(c.iso)} · ${tr('before he landed')}` : monDay(c.iso))
                    : `${monDay(c.iso)} · ${tr(FX_LABEL[c.kind] || 'Practice')} · ${tr(
                      c.state === 'in' ? 'attended' : c.state === 'played' ? 'played' : c.state === 'dnp' ? 'did not play' : c.state === 'pending' ? 'box score not in yet' : c.state === 'missed' ? 'missed' : c.state === 'excused' ? AVAIL[c.code] ? AVAIL[c.code].label : 'out' : 'attended')}${c.mins ? ` · ${c.mins} ${tr('min')}` : ''}`;
                  const bands = [];
                  if (c.state === 'in') bands.push(FX_COLOR[c.kind] || FX_COLOR.practice);
                  if (c.state === 'played') bands.push(FX_COLOR.game);
                  if (showSc && c.sc) bands.push(SC_COLOR);
                  if (showLift && c.lift) bands.push(FX_COLOR.lift);
                  const outline = c.state === 'missed' ? MISS : c.state === 'dnp' ? FX_COLOR.game : null;
                  return (
                    <span key={c.iso} title={label}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 36, background: c.future ? FUTURE_BG : c.state === 'none' ? 'transparent' : TINT[c.code] || 'transparent', borderInlineStart: `1px solid ${C.cardBd}` }}>
                      <CellMarks bands={bands} outline={outline} label={label} />
                    </span>
                  );
                })}
                <span style={{ ...pinEnd('var(--c-sf)'), display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, minHeight: 36, paddingInlineStart: 10, alignSelf: 'stretch' }}>
                  <span className="lifts-last-date" style={{ fontFamily: FB, fontSize: 10.5, color: C.tm, whiteSpace: 'nowrap' }}>{last ? monDay(last) : ''}</span>
                  <span dir="ltr" style={{ fontFamily: FN, fontSize: 11, fontWeight: 800, color: pctInk(pct({ went, owed })), fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', minWidth: 46, textAlign: 'end', unicodeBidi: 'isolate' }}>
                    {owed ? `${went}/${owed}` : tr('none')}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* AN EQUAL-CELL GRID (27.9, Ohad: "practice > missed is a big unaligned
          mess"): every swatch on one start edge, every label beside it, the
          rows in step - no ragged wrap. */}
      <div className="bhbc-legend-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(118px, 1fr))', columnGap: 14, rowGap: 8, padding: '9px 14px', borderTop: `1px solid ${C.cardBd}` }}>
        {/* the legend draws the SAME marks the cells draw */}
        {[
          [[FX_COLOR.practice], null, tr('Practice')], [[FX_COLOR.scrimmage], null, tr('Scrimmage')],
          [[FX_COLOR.game], null, tr('Game played')], [[], FX_COLOR.game, tr('did not play')], [[], MISS, tr('missed')],
          ...(showSc ? [[[SC_COLOR], null, tr('S&C')]] : []), ...(showLift ? [[[FX_COLOR.lift], null, tr('Lift')]] : []),
        ].map(([bands, outline, lbl]) => (
          <span key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: FB, fontSize: 11, color: C.tm, whiteSpace: 'nowrap', minWidth: 0 }}>
            <CellMarks bands={bands} outline={outline} />{lbl}
          </span>
        ))}
      </div>
    </Card>
  );
}

// THE LIFTS TAB — one athlete's own weight-room record, as a month grid.
//
// Ohad, pointing at his own availability sheet: "that's litterally the main use
// of this table". Athletes down, days across, one cell per athlete per day. The
// tint is the restriction code (his index, 1-5, unchanged); the orange bar is a
// lift he logged. A blank column is a day nobody lifted.
//
// ONLY PERSONAL LIFTS (rowKind 'lift'). Ohad, 24.9: lifts are "not team. just
// personal. and not related to the practice sessions". The team S&C block
// that runs before a practice is a different thing and lives with its practice
// (Schedule → Past practices); it used to share this grid in a second colour,
// which is what "combined or messed up" looked like. One kind, one colour.
//
// Nothing here invents data. No lift logged means no bar - not a zero.
function LiftsTab({ rows = [], loads = {}, medical = {}, today, onOpen, action = null }) {
  const tr = useT();
  const he = useHe();
  const [monthOff, setMonthOff] = useState(0);          // 0 = this month, -1 = last
  // LIFTS ONLY (27.9, Ohad: "lifts should only show lifts (with an sc toggle
  // button for on and off to see)" / "the rest of the statuses should only be
  // applied for schedule"). No restriction tints here; the team S&C only when
  // the toggle is on; marks without numbers (CellMarks).
  const [showSc, setShowSc] = usePersistentState('bhbc-lifts-sc', false);

  const isLift = (r) => rowKind(r) === 'lift';

  // The month on screen, as local dates - never toISOString, which rolls back a
  // day in Israel between midnight and 03:00.
  const days = useMemo(() => monthDays(today, monthOff), [today, monthOff]);
  const scrollRef = useRef(null);
  useScrollToToday(scrollRef, `${today}|${monthOff}`);

  const per = useMemo(() => (rows || []).map(({ t }) => {
    const rec = loads[t.id] || {};
    const ses = rec.sessions || {};
    const avail = rec.availability || {};
    const liftDates = Object.keys(ses).filter((d) => (ses[d] || []).some(isLift)).sort();
    const last = liftDates.length ? liftDates[liftDates.length - 1] : null;
    const since = last ? dayDiff(today, last) : null;
    const cells = days.list.map((d) => {
      const lifts = (ses[d.iso] || []).filter(isLift);
      const sc = (ses[d.iso] || []).some((r) => rowKind(r) === 'sc');
      const mins = lifts.reduce((a, r) => a + (Number(r.min) || 0), 0);
      // The recorded value IS the history, floored by what the medical record
      // says about THAT day (medicalAvailOn has an onset and an end).
      const code = Math.max(Number(avail[d.iso]) || 1, medicalAvailOn(medical, t.id, d.iso));
      return { iso: d.iso, lift: lifts.length > 0, sc, mins, code, future: d.iso > today };
    });
    const within = (n) => liftDates.filter((d) => dayDiff(today, d) >= 0 && dayDiff(today, d) < n).length;
    // TODAY's state, so the name column can say it without the reader having
    // to find today's column and decode a tint.
    const todayCode = availOn(rec, medical, t.id, today);
    return { t, cells, last, since, todayCode, d7: within(7), d28: within(28) };
  }), [rows, loads, medical, days, today]);

  // One number per day: how many lifted. (Availability is a SCHEDULE status -
  // 27.9 - so this grid counts its own thing.)
  const liftedPerDay = days.list.map((d, i) => {
    if (d.iso > today) return null;
    const n = per.map((p) => p.cells[i]).filter((c) => c && c.lift).length;
    return n || null;
  });
  // DUE MEANS HE COULD HAVE LIFTED (#305 K1): an athlete out today is the
  // physio's to load, not the weight room's to chase, and one who has not
  // landed yet cannot be behind. SIX days is the line (29.9 #414, Ohad: "i need
  // everyone who havent lifted for more than 5 days"; it was four), said on the label.
  const due = [...per].filter((x) => (x.since == null || x.since >= LIFT_DUE_DAYS) && x.todayCode < 4 && !(x.t.arrival && x.t.arrival > today))
    .sort((a, b) => (b.since == null ? 1e9 : b.since) - (a.since == null ? 1e9 : a.since));
  const liftedToday = per.filter((x) => x.since === 0).length;
  const TINT = { 1: 'transparent', 2: 'rgba(224,167,58,0.18)', 3: 'rgba(79,157,224,0.18)', 4: 'rgba(222,78,59,0.20)', 5: 'rgba(124,130,139,0.20)' };
  // an overdue lift is only coloured for someone who could have lifted (#305 N-K3)
  const ink = (since, code = 1, landed = true) => (code >= 4 || !landed ? C.tm : since == null || since >= 7 ? '#DE4E3B' : since >= LIFT_DUE_DAYS ? 'var(--bhbc-amber-text, #E0A73A)' : C.tx);   // a recent lift is the normal state (#305 N-E6); amber = due (6), red = a week
  // 24, not 22 (29.9 #380): two-digit days at 10px are ~25px of ink and ran
  // into the next column at 22.
  const CELL = 24;
  // SORTABLE LIKE EVERY TABLE IN THE ZONE (27.9): the name A->Z, a DAY by that
  // day's lift (the longest first; no lift that day sorts last either way), the
  // last column by the date of his last lift, newest first - never lifted last.
  const sort = useSort(per, {
    name: { get: (p) => p.t.name, asc: true },
    last: (p) => p.last,
    ...Object.fromEntries(days.list.map((d, i) => [`d:${d.iso}`, (p) => (p.cells[i] && p.cells[i].lift ? 1 + Math.min(p.cells[i].mins || 0, 999) / 1000 : null)])),
  });

  return (
    <>
      <Card leftStripe={NAVY} padding={0} header={secTitle('Lifts')}
        headerRight={(
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: C.tm }}>
            <span className="strip-meta">{liftedToday ? `${liftedToday} ${countWord(liftedToday, 'lifted today')}` : tr('nobody has lifted today')}</span>
            {action}
          </span>
        )}>
        {/* DUE, DESIGNED (29.9 #414, Ohad: "[athlete] and due 4 days is a very
            bad design"): one tinted band with ONE chip stretched across the whole
            card. Now a calm list - no orange (orange is games and injuries) - of
            equal tiles at the house height, each one opening that athlete; the
            number is the part in colour. auto-fill keeps a lone tile its own
            width instead of the card's. */}
        {!!due.length && (
          <div className="bhbc-due" style={{ display: 'grid', gap: 8, padding: '12px 14px', borderBottom: `1px solid ${C.cardBd}` }}>
            <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 800, letterSpacing: '0.10em', textTransform: 'uppercase', color: C.tx }}>{tr('due')} · {tr('6+ days')} <span style={{ color: C.tm, fontVariantNumeric: 'tabular-nums' }}>· {due.length}</span></span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 6 }}>
              {due.map(({ t, since }) => (
                <button key={t.id} type="button" data-due={t.id} onClick={onOpen ? () => onOpen(t.id) : undefined} className="bhbc-ghost-btn"
                  style={{ display: 'flex', alignItems: 'center', gap: 8, height: 'var(--btn-h)', boxSizing: 'border-box', padding: '0 10px', border: `1px solid ${C.cardBd}`, borderRadius: 0, background: 'var(--c-sf)', color: C.tx, cursor: onOpen ? 'pointer' : 'default', minWidth: 0, textAlign: 'start' }}>
                  <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, color: C.tm, minWidth: 18, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{t.jersey != null ? t.jersey : ''}</span>
                  {/* the name gives way, never cut (26.9); the age is what is read */}
                  <span style={{ fontFamily: FN, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', unicodeBidi: 'isolate', flex: '1 1 auto', minWidth: 0, overflowWrap: 'break-word', lineHeight: 1.15 }}>{t.name}</span>
                  <span style={{ flexShrink: 0, fontFamily: FN, fontSize: 11, color: ink(since), fontWeight: 800, unicodeBidi: 'isolate', fontVariantNumeric: 'tabular-nums' }}>{since == null ? tr('never') : (he ? `${since} י׳` : `${since}d`)}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {/* THE LEGEND SENTENCE GETS ITS OWN LINE, NOT THE GAP BESIDE THE PAGER
            (Ohad, 19.9: "anywhere where there is text, it has its own space"). */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, rowGap: 6, flexWrap: 'wrap', padding: '8px 14px', borderBottom: `1px solid ${C.cardBd}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button type="button" onClick={() => setMonthOff((v) => v - 1)} className="bhbc-ghost-btn" aria-label={tr('Previous month')}
              style={navArrow(false)}>{he ? '›' : '‹'}</button>
            <span style={{ fontFamily: FN, fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.tx, minWidth: 116, textAlign: 'center' }}>{tr(days.label.split(' ')[0])} {days.label.split(' ')[1]}</span>
            <button type="button" disabled={monthOff >= 0} onClick={() => setMonthOff((v) => Math.min(0, v + 1))} className="bhbc-ghost-btn" aria-label={tr('Next month')}
              style={navArrow(monthOff >= 0)}>{he ? '‹' : '›'}</button>
          </div>
          {/* THE S&C TOGGLE LIVES WITH THE OTHER CONTROL (29.9 #415, Ohad: "sc
              button is located in a bad spot" - it sat alone under the grid):
              the pager at the start, the toggle at the end, one row, one
              height - as on Practice Attendance. */}
          <button type="button" aria-pressed={showSc} onClick={() => setShowSc(!showSc)} className="bhbc-ghost-btn" data-sc-toggle=""
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 'var(--btn-h)', minHeight: 0, padding: '0 12px', boxSizing: 'border-box', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: showSc ? C.tx : C.tm, background: showSc ? `color-mix(in srgb, ${SC_COLOR} 14%, transparent)` : 'transparent', border: `1px solid ${showSc ? SC_COLOR : C.cardBd}`, borderRadius: 0, cursor: 'pointer' }}>
            <span style={{ width: 8, height: 8, background: showSc ? SC_COLOR : 'transparent', border: `1px solid ${SC_COLOR}` }} />{tr('S&C')}
          </button>
          <span style={{ fontFamily: FB, fontSize: 11, color: C.tm, flex: '1 1 100%', minWidth: 0 }}>{tr('A box is a lift he logged. S&C shows when its toggle is on.')}</span>
        </div>

        {/* THE MONTH FITS THE CARD (29.9 #400, Ohad: "table doesnt fit"): at
            1440 LAST LIFT ran past the edge - "28 SEP  YESTERDAY" is 133px in
            a 118px column. Name 186 + a 150 last-lift column + 31 days at 24
            is 1108 inside a 1162 card. Narrower than that the grid still
            scrolls (a month cannot fit 390px), with the NAME and the LAST LIFT
            pinned at the two edges and only the days moving - down to 620px.
            On a phone only the NAME stays pinned and LAST LIFT shows "3d" /
            "yesterday" without the date (themes.css, #400 / #499). */}
        <div ref={scrollRef} className="bhbc-lifts-scroll bhbc-month-scroll" style={{ overflowX: 'auto' }}>
          {/* the column widths are CSS variables: a phone narrows them (themes.css, 1.10 #499) */}
          <div style={{ minWidth: `calc(var(--lifts-name-w, ${LIFTS_NAME_W}px) + var(--lifts-last-w, ${LIFTS_LAST_W}px) + ${28 + days.list.length * CELL}px)` }}>
            <div style={{ display: 'grid', gridTemplateColumns: `var(--lifts-name-w, ${LIFTS_NAME_W}px) repeat(${days.list.length}, minmax(${CELL}px, 1fr)) var(--lifts-last-w, ${LIFTS_LAST_W}px)`, alignItems: 'center', padding: '0 14px', minHeight: 36, background: 'var(--c-sf2)', borderBottom: `1px solid ${C.cardBd}`, marginBottom: 6, gap: 0 }}>
              <SortHeader k="name" sort={sort} label={tr('Athlete')} style={{ ...pinStart('var(--c-sf2)'), fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.tm }} />
              {days.list.map((d) => (
                d.future
                  ? <span key={d.iso} title={monDay(d.iso)} style={{ fontFamily: FN, fontSize: 10, fontWeight: 600, color: dayHeadInk(d, today), textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{d.dom}</span>
                  : <SortHeader key={d.iso} k={`d:${d.iso}`} sort={sort} label={d.dom} float title={monDay(d.iso)} aLabel={`${tr('Sort by')} ${monDay(d.iso)}`} style={{ fontFamily: FN, fontSize: 10, fontWeight: d.iso === today ? 800 : 600, color: dayHeadInk(d, today), textAlign: 'center', fontVariantNumeric: 'tabular-nums' }} {...(d.iso === today ? { 'data-today-col': '' } : {})} />
              ))}
              <SortHeader data-end-head="" k="last" sort={sort} title={`${tr('Sort by')} ${tr('last lift')}`} aLabel={tr('last lift')} label={<><span className="lifts-age-long">{tr('last lift')}</span><span className="lifts-age-short">{he ? 'אחרון' : tr('last')}</span></>} style={{ ...pinEnd('var(--c-sf2)'), fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.tm, textAlign: 'end', paddingInlineStart: 10 }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: `var(--lifts-name-w, ${LIFTS_NAME_W}px) repeat(${days.list.length}, minmax(${CELL}px, 1fr)) var(--lifts-last-w, ${LIFTS_LAST_W}px)`, alignItems: 'center', padding: '0 14px 6px' }}>
              <span style={{ ...pinStart('var(--c-sf)'), fontFamily: FN, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: C.tm }}>{tr('lifted')}</span>
              {liftedPerDay.map((n, i) => (
                <span key={days.list[i].iso} style={{ fontFamily: FN, fontSize: 9.5, fontWeight: 700, color: n == null ? C.cardBd : C.td, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{days.list[i].future ? '' : n == null ? '—' : n}</span>
              ))}
              <span style={{ ...pinEnd('var(--c-sf)'), alignSelf: 'stretch' }} />
            </div>
            <div className="hl-rows" style={{ display: 'grid', gap: 1, background: C.cardBd }}>
              {sort.rows.map(({ t, cells, since, last, todayCode }) => (
                // A table row is never under 36 (24.9).
                <div key={t.id} role={onOpen ? 'button' : undefined} tabIndex={onOpen ? 0 : undefined}
                  onClick={onOpen ? () => onOpen(t.id) : undefined}
                  onKeyDown={onOpen ? ((e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(t.id); } }) : undefined}
                  style={{ display: 'grid', gridTemplateColumns: `var(--lifts-name-w, ${LIFTS_NAME_W}px) repeat(${cells.length}, minmax(${CELL}px, 1fr)) var(--lifts-last-w, ${LIFTS_LAST_W}px)`, alignItems: 'center' /* a tap-target row is 40px on a phone; its 26px content sits on its centre, not its top (26.9) */, background: 'var(--c-sf)', padding: '0 14px', minHeight: 36, cursor: onOpen ? 'pointer' : 'default' }}>
                  <span style={{ ...pinStart('var(--c-sf)'), display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, paddingInlineEnd: 8, minHeight: 36, alignSelf: 'stretch' }}>
                    <span title={todayCode > 1 ? tr(AVAIL[todayCode].label) : undefined} aria-label={todayCode > 1 ? tr(AVAIL[todayCode].label) : undefined} aria-hidden={todayCode > 1 ? undefined : 'true'} style={{ width: 7, height: 7, borderRadius: '50%', background: todayCode > 1 ? AVAIL[todayCode].color : 'transparent', flexShrink: 0 }} /* the slot is always there, so every name starts on one x (26.9) */ />
                    <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, color: C.tm, minWidth: 20, fontVariantNumeric: 'tabular-nums' }}>{t.jersey != null ? t.jersey : ''}</span>
                    <PlayerName name={t.name} className="lifts-name" style={{ fontFamily: FN, fontSize: 12, fontWeight: 700, color: C.tx, flex: '1 1 auto' }} />
                  </span>
                  {cells.map((c) => {
                    const bands = [];
                    if (c.lift) bands.push(FX_COLOR.lift);
                    if (showSc && c.sc) bands.push(SC_COLOR);
                    const title = `${monDay(c.iso)}${c.lift ? ` · ${tr('Lift')}${c.mins ? ` · ${c.mins} ${tr('min')}` : ''}` : ''}${showSc && c.sc ? ` · ${tr('S&C')}` : ''}`;
                    return (
                      <span key={c.iso} title={c.future ? monDay(c.iso) : title}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 36, borderInlineStart: `1px solid ${C.cardBd}`, background: c.future ? FUTURE_BG : 'transparent' }}>
                        <CellMarks bands={bands} label={title} />
                      </span>
                    );
                  })}
                  {/* flexShrink:0 and marginInlineStart:auto: pinned to the end
                      and unshrinkable, the chips give way instead (OCD sweep, 22.9). */}
                  <span title={last ? monDay(last) : undefined} style={{ ...pinEnd('var(--c-sf)'), display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, height: '100%', minHeight: 36, paddingInlineStart: 10, flexShrink: 0, alignSelf: 'stretch' }}>
                    <span className="lifts-last-date" style={{ fontFamily: FB, fontSize: 10.5, color: C.tm, whiteSpace: 'nowrap' }}>{last ? monDay(last) : ''}</span>
                    <span style={{ fontFamily: FN, fontSize: 11, fontWeight: 800, color: ink(since, todayCode, !(t.arrival && t.arrival > today)), fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', minWidth: 46, textAlign: 'end' }}>
                      {since == null ? tr('never') : since === 0 ? tr('today') : since === 1 ? <><span className="lifts-age-long">{tr('yesterday')}</span><span className="lifts-age-short">{he ? `1 ${tr('days')}` : '1d'}</span></> : (he ? `${since} ${tr('days')}` : `${since}d`)}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, padding: '9px 14px', borderTop: `1px solid ${C.cardBd}` }}>
          {[[[FX_COLOR.lift], tr('lift logged')], ...(showSc ? [[[SC_COLOR], tr('S&C')]] : [])].map(([bands, lbl]) => (
            <span key={lbl} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: FB, fontSize: 11, color: C.tm }}>
              <CellMarks bands={bands} />{lbl}
            </span>
          ))}
        </div>
      </Card>
    </>
  );
}

function LoadBoard({ rows, rowGrid, cycleAvail, medical = {}, loads = {}, onOpen, onMedical, today }) {
  const tr = useT();
  const hasLoad = rows.some(({ acwr, series }) => (acwr && (acwr.ratio != null || (acwr.acute || 0) > 0)) || (series || []).some((v) => v > 0));
  const hasRead = rows.some(({ readiness }) => readiness && readiness.level && readiness.level !== 'unknown');
  const grid = ['28px', 'minmax(116px,1.5fr)', hasLoad ? '112px' : null, hasLoad ? '46px' : null, hasLoad ? null : '132px', '130px', hasRead ? 'minmax(104px,1.1fr)' : null, '92px'].filter(Boolean).join(' ');
  // Days since the last logged weight-room session, per athlete.
  const lastLift = (id) => {
    const ses = ((loads[id] || {}).sessions) || {};
    const d = Object.keys(ses).filter((k) => (ses[k] || []).some((r) => rowKind(r) === 'lift')).sort();
    return d.length ? d[d.length - 1] : null;
  };
  // WHO NEEDS ATTENTION FIRST (27.9 #305 C1): OUT, then non-contact, then
  // limited, then an overdue lift (7d+ or never), then everyone else in jersey
  // order - the order he reads the board in. It stays the order until a header
  // is tapped, and it is the tie-break after one is.
  const worstFirst = [...rows].sort((a, b) => {
    const rank = (r) => { const code = r.avail || 1; if (code >= 4) return 0; if (code === 3) return 1; if (code === 2) return 2; if (r.t.arrival && today && r.t.arrival > today) return 4; const ll = lastLift(r.t.id); const since = ll && today ? dayDiff(today, ll) : null; return since == null || since >= 7 ? 3 : 4; };
    return rank(a) - rank(b) || (a.t.jersey ?? 999) - (b.t.jersey ?? 999);
  });
  const READ_SEV = { red: 3, amber: 2, green: 1 };
  const sort = useSort(worstFirst, {
    jersey: { get: (r) => r.t.jersey, asc: true },
    name: { get: (r) => r.t.name, asc: true },
    acwr: (r) => (r.acwr && r.acwr.ratio != null ? r.acwr.ratio : null),
    acute: (r) => (r.acwr && r.acwr.acute ? r.acwr.acute : null),
    lift: (r) => lastLift(r.t.id),                          // a date: newest first; never = last
    avail: (r) => Math.min(r.avail || 1, 4),                // Out (med or personal) > non-contact > limited > full
    ready: (r) => READ_SEV[r.readiness && r.readiness.level] ?? null,
    trend: (r) => ((r.series || []).some((v) => v > 0) ? (r.series || []).reduce((a, v) => a + (Number(v) || 0), 0) : null),
  });
  const headCols = [['jersey', '#'], ['name', tr('Athlete')], ...(hasLoad ? [['acwr', 'ACWR'], ['acute', tr('7d')]] : [['lift', tr('last lift')]]), ['avail', tr('Availability')], ...(hasRead ? [['ready', tr('Readiness')]] : [])];
  // ONE START FOR EVERY INJURY (27.9 #352, Ohad: "i don't like that the
  // injuries are not horizontally aligned from one row to another"). The
  // injury followed each position ("GUARD · OTHER", "FORWARD-CENTER · ANKLE"),
  // so it started wherever that word ended. The position slot takes the width
  // of the longest position on this board (measured, so Hebrew and English
  // both fit); desktop only - a phone stacks them (themes.css).
  const loadInnerRef = React.useRef(null);
  React.useLayoutEffect(() => {
    const el = loadInnerRef.current; if (!el) return;
    el.style.removeProperty('--pos-w');
    let w = 0;
    // the column holds the NAME above the position (29.9 #395), so it is as
    // wide as the longest of either on this board
    el.querySelectorAll('.bhbc-pos-inj [data-pos], .bhbc-load-row [data-name]').forEach((p) => { w = Math.max(w, p.scrollWidth); });
    if (w) el.style.setProperty('--pos-w', `${Math.ceil(w)}px`);
  });
  return (
    <CollapsibleSection title={tr("Load & Injury Risk")} count={rows.length} storageKey="bhbc-load" defaultOpen leftStripe={ORANGE}>
      <div className="bhbc-load-scroll" style={{ overflowX: 'auto' }}>

        <div ref={loadInnerRef} className="bhbc-load-inner" style={{ minWidth: hasLoad ? 660 : 440 }}>

          <div className="bhbc-load-head" style={{ display: 'grid', gridTemplateColumns: grid, gap: 12, alignItems: 'center', minHeight: 36, padding: '0 2px', background: 'var(--c-sf2)', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.tm, borderBottom: `1px solid ${C.cardBd}` }}>
            {/* THE HEADER STANDS OVER ITS COLUMN (27.9 #373, Ohad: "not ocd
                order"): '#' is centred over the jersey badges, like the numbers
                in them - measured 5px left of them. */}
            {headCols.map(([k, label]) => <SortHeader key={k} k={k} sort={sort} label={label} center={k === 'jersey'} style={k === 'jersey' ? { textAlign: 'center', width: 26, marginInlineStart: -2 } : k === 'name' ? { marginInlineStart: -2 } : undefined} />)}
            {hasLoad ? <SortHeader k="trend" sort={sort} label={tr('14-day')} style={{ textAlign: 'end' }} /> : <div />}
          </div>
          {/* the phone's header: the columns a restacked row still shows */}
          <SortBar sort={sort} className="bhbc-load-sortbar" cols={headCols.filter(([k]) => k !== 'ready' && k !== 'acute')}
            style={{ alignItems: 'center', minHeight: 36, padding: '0 2px', background: 'var(--c-sf2)', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.tm, borderBottom: `1px solid ${C.cardBd}` }} />
          {sort.rows.map(({ t, acwr, series, readiness, avail }) => {
            const medFloor = activeInjuries(medical || {}, t.id)
              .reduce((worst, inj) => Math.max(worst, MEDICAL_STATUS_AVAIL[inj.status] || 1), 1);
            const rc = readiness.level === 'red' ? BAND.high : readiness.level === 'amber' ? BAND.elevated : readiness.level === 'green' ? BAND.low : BAND.none;
            return (
              <div key={t.id} onClick={() => onOpen(t.id)} role="button" tabIndex={0} onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onOpen(t.id); } }} style={{ display: 'grid', gridTemplateColumns: grid, gap: 12, alignItems: 'center', padding: '8px 2px', borderBottom: `1px solid ${C.cardBd}`, borderInlineStart: `2px solid ${acwr.band.color}`, paddingInlineStart: 10, marginInlineStart: -12, cursor: 'pointer', transition: 'border-color 240ms ease-out' }} className="bhbc-row bhbc-load-row">
                <Jersey n={t.jersey} size={26} />
                <div style={{ minWidth: 0 }}>
                  <PlayerName data-name="" name={t.name} style={{ fontFamily: FN, fontWeight: 700, fontSize: 13, color: C.tx }} />
                  {/* ONE line under the name, and the SAME line for everyone.
                      It used to be injury-OR-position, so some rows showed a
                      position and some an injury and the column read as two
                      different tables (Ohad). Position is a stable fact and
                      always shows; the injury appends to it. A head injury shows
                      its TYPE - "CONCUSSION" - because its body part is literally
                      "Head / Concussion" and printing that wrapped to two rows. */}
                  {(() => {
                    const inj = worstInjury(medical, t.id);
                    // Body part + side for everyone, same as every other row.
                    // The head body part is literally "Head / Concussion", which
                    // wrapped to two lines, so it collapses at the slash. Printing
                    // the TYPE instead was worse: one record is typed Contusion,
                    // so the cell read "Contusion" for a concussion.
                    const injShort = !inj ? null
                      : `${tr((inj.bodyPart || '').split('/')[0].trim())}${sideTag(inj.side, tr)}`;
                    return (
                      <div className="bhbc-pos-inj" style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0, whiteSpace: 'nowrap' }}>
                        <span data-pos style={{ fontFamily: FB, fontSize: 11, color: C.td }}>{tr(t.position) || '—'}{injShort ? <span data-sep> ·</span> : ''}</span>
                        {/* No warning glyph. Ohad: "no emojies or icons, just
                            colors" - medText already carries the severity, and a
                            triangle in front of every injured athlete was noise. */}
                        {/* bigger and bolder (27.9, Ohad: "make the injuries slightly
                            bigger or more noticeable but keep the perfect ocd design"):
                            12px / 800 in its status colour, still starting on the
                            position's edge - no tint box, no glyph. */}
                        {injShort ? <span data-inj style={{ fontFamily: FN, fontSize: 12, fontWeight: 800, letterSpacing: '0.03em', color: inj.status === 'available' ? C.td : medText(inj.status) }}>{injShort}</span> : <span data-inj-empty aria-hidden="true" />}
                        {/* LAST LIFT on the bottom line, the injury in the middle
                            (27.9 03:29, Ohad: "injury in the middle with a slightly
                            bigger font size. And last lift at the bottom") - phones
                            only; the desktop board keeps its LAST LIFT column. With
                            no injury its slot stays EMPTY in the middle, never at
                            an edge of the card (his rule, 03:30). */}
                        {(() => {
                          const ll = lastLift(t.id);
                          const since = ll && today ? dayDiff(today, ll) : null;
                          return (
                            <span className="bhbc-mob-lift" title={ll ? monDay(ll) : undefined} style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: (since == null || since >= 7) && (avail || 1) < 4 && !(t.arrival && t.arrival > today) ? '#DE4E3B' : C.tm, lineHeight: '14px' }}>
                              {tr('Last lift')} · {since == null ? tr('never') : since === 0 ? tr('today') : since === 1 ? tr('yesterday') : daysFor(since)}
                            </span>
                          );
                        })()}
                      </div>
                    );
                  })()}
                </div>
                {/* What the MEDICAL record forces, so the cell can say so. The
                    board renders max(dayAvail, medFloor): a coach can make today
                    worse than the medical fact but never better, or a card would
                    read "CONCUSSION · FULL". That rule was invisible, so clicking
                    a floored cell looked broken. Ohad: "having an injury can still
                    be limited on practice" - it can, and this points at where. */}
                {hasLoad && <div data-lbl="ACWR">{acwr.ratio != null ? <BandPill band={acwr.band} value={acwr.ratio.toFixed(2)} /> : <span style={{ fontFamily: FN, fontSize: 11, color: C.tm, letterSpacing: '0.06em' }}>{'·'} {tr('baseline')}</span>}</div>}
                {hasLoad && <div data-lbl="7-day" style={{ fontFamily: FN, fontSize: 13, color: C.tx, fontVariantNumeric: 'tabular-nums' }}>{acwr.acute ? Math.round(acwr.acute) : '—'}</div>}
                {!hasLoad && (() => {
                  const ll = lastLift(t.id);
                  const since = ll && today ? dayDiff(today, ll) : null;
                  // CALM BY DEFAULT (27.9, Ohad: "too much on the eyes"): only an
                  // overdue lift (7d+, or never) is coloured; the date is the title.
                  // ...and not for an athlete who is out (#305 N-K3)
                  const col = (since == null || since >= 7) && (avail || 1) < 4 && !(t.arrival && t.arrival > today) ? '#DE4E3B' : C.tx;   // nor for one not landed yet (#305 N-K5)
                  return (
                    // THE DATE IS A COLUMN, so the part in front of it gets a
                    // fixed width. The relative age runs from "2d" to
                    // "yesterday", and with the two laid out as a plain flex row
                    // the date behind it moved with that length - measured
                    // across ten rows, "7 Sep" and friends started at 811, 807,
                    // 807, 866 and 807. 64px holds the longest of them
                    // ("yesterday" / "אתמול") at 11px Nord.
                    // `auto` on the second column lets a nowrap date push the
                    // whole pair past its own parent — measured at 390 with the
                    // widened squad (OCD sweep, 22.9): a chip ran 31px outside
                    // its 167px container and 7px off the screen. minmax(0,1fr)
                    // makes that column give way instead of shoving, and the
                    // date is the half that can afford to be trimmed: the AGE
                    // is the number a coach reads.
                    <div data-lbl="last lift" title={ll ? monDay(ll) : undefined} style={{ display: 'grid', gridTemplateColumns: 'minmax(64px, auto)', alignItems: 'baseline', gap: 6, minWidth: 0, maxWidth: '100%' }}>
                      <span style={{ fontFamily: FN, fontSize: 11, fontWeight: 800, color: col, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                        <span className="bhbc-ll-lbl" style={{ color: C.tm, fontWeight: 700, marginInlineEnd: 6 }}>{tr('Lift')}</span>{since == null ? tr('never') : since === 0 ? tr('today') : since === 1 ? tr('yesterday') : daysFor(since)}
                      </span>

                    </div>
                  );
                })()}
                <div data-lbl="Availability">
                  <AvailSelect avail={avail} floor={medFloor} onPick={cycleAvail ? (code) => cycleAvail(t.id, code) : null} />
                </div>
                {hasRead && (<div data-lbl="Readiness" style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: rc, flexShrink: 0 }} />
                  {typeof readiness.loadAdjustPct === 'number' && readiness.loadAdjustPct !== 0 && <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 800, color: rc, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{readiness.loadAdjustPct > 0 ? '+' : ''}{readiness.loadAdjustPct}%</span>}
                  <span style={{ fontFamily: FB, fontSize: 11, color: C.td, whiteSpace: 'normal', overflowWrap: 'break-word' }}>{tr(readiness.level === 'unknown' ? 'no check-in' : readiness.headline)}</span>
                </div>)}
                <div data-lbl="actions" style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8 }}>
                  {hasLoad && <Sparkline series={series} />}
                  {/* Report / update an injury straight from the board — no need
                      to open the athlete first (Ohad: make medical easier to reach). */}
                  {onMedical && (() => {
                    const inj = worstInjury(medical, t.id);
                    return (
                      <button onClick={(e) => { e.stopPropagation(); onMedical(t.id); }}
                        title={inj ? tr('Update the medical report') : tr('Report an injury')} className="bhbc-ghost-btn"
                        // minWidth so the two states are the same box. Ohad: "make sure
                        // all buttons no matter the tag (for each column) are the same
                        // horizontal size". Measured: "+ MED" 55px, "MED ✎" 58px (Hebrew "רפואי ✎" 62.5px, so the floor is 64) - a
                        // column that shifts by 3px per row depending on the athlete's
                        // medical state. lineHeight normal so the label sits on its own
                        // centre, like every other control.
                        style={{ flexShrink: 0, minWidth: 64, height: ROW_BTN_H, boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: C.tm, background: 'transparent', border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: '4px 8px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        {/* ONE BUTTON, ONE LOOK (27.9, Ohad: "make the med button all the
                            same"): the injury line above already says whether there is
                            one and how bad; the button just opens the record. */}
                        {tr('MED')}
                      </button>
                    );
                  })()}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {hasLoad && (
      // The bands and the formula describe columns that are not on screen
      // unless an RPE exists.
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.cardBd}`, fontFamily: FN, fontSize: 10, color: C.td }}>
        {[[BAND.low, tr('band sweet spot')], [BAND.elevated, tr('band elevated')], [BAND.high, tr('band danger')], [BAND.detrained, tr('band undertrained')]].map(([c, l]) => (
          <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, letterSpacing: '0.04em' }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: c }} />{l}</span>
        ))}
        <span style={{ marginInlineStart: 'auto', color: C.tm }}>ACWR = 7-day ÷ 28-day sRPE</span>
      </div>
      )}
    </CollapsibleSection>
  );
}

function RosterGrid({ rows, ghosts = [], medical = {}, league = {}, loads = {}, onOpen, action = null }) {
  const tr = useT();
  // THE CARD'S PPG IS PLAYER STATS' PPG (#305 J3): the club's own logged games
  // first, the league feed only for a player with none - and never a league
  // number from a season that is over (the Games tab shows those as last
  // season; the card printed them as if current).
  const nowS = new Date();
  const startYr = nowS.getMonth() >= 7 ? nowS.getFullYear() : nowS.getFullYear() - 1;
  const leaguePast = !!league.season && String(league.season).replace(/\s+/g, '') !== `${startYr}/${String((startYr + 1) % 100).padStart(2, '0')}`;
  const ppgFor = (t) => {
    const club = clubSeasonStats(t, loads);
    // per field, like Player Stats: a club row with no box has no points (27.9 review)
    if (club && club.ppg != null) return club.ppg;
    const lp = leaguePast ? null : leaguePlayerFor(league, t);
    return lp && lp.ppg != null ? lp.ppg : null;
  };
  return (
    <CollapsibleSection title={tr("Roster")} count={rows.length} storageKey="bhbc-roster" defaultOpen leftStripe={NAVY} right={action}>
      {/* 264, not 232 (29.9 #380): a card's footer - height · nation · PPG ...
          sessions · hours - needs ~260px; at 820 three 240px cards clipped
          "23 SESSIONS · 5H" by 20px. 264 gives two columns there, three from
          ~1100. */}
      <div className="bhbc-roster-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(264px, 1fr))', gap: 12 }}>
        {rows.map(({ t, acwr, att }) => (
          <div key={t.id} onClick={() => onOpen(t.id)} role="button" tabIndex={0} onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onOpen(t.id); } }} className="bhbc-card" style={{ position: 'relative', overflow: 'hidden', background: 'var(--c-sf)', border: `1px solid ${acwr.band.color}`, padding: '13px 15px',
            // EVERY ROSTER CARD IS THE SAME BOX.
            // Measured across ten players: four different heights (93, 96, 99,
            // 102) because a Hebrew name renders taller than a Latin one, the
            // second line is a POSITION for some and an INJURY for others, and
            // an arrival badge appears on a few. Ohad: 'the cards borders and
            // height and built should be perfectly the same for each.'
            // A fixed height with the content laid out top-down makes the grid
            // read as one object instead of ten slightly different ones.
            // ...but a FIXED height with top-down flow only works while every
            // card's content is the same height, and it is not: when the
            // position line wraps to two lines (GUARD-FORWARD - KNEE R -
            // AVAILABLE) everything below it shifted 16px down, so Broughton's
            // and one athlete's footers crossed the bottom border and their hairlines
            // sat 23px below their row-mates'. Ohad: "text overflows, text and
            // borders don't align from card to card".
            // The footer is now PINNED to the bottom of the card, so the
            // hairline lands on the same y in every card whatever is above it.
            // NO EMPTY BAND AT THE BOTTOM (27.9, Ohad: "too much extra space on the
            // lower part of each box"): the height comes from the content - every
            // line above the rule is reserved, so every card is still the same box.
            height: 'var(--rc-h, auto)', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', cursor: 'pointer', transition: 'transform 160ms, box-shadow 160ms, border-color 240ms ease-out' }}>
            <div aria-hidden="true" data-ghost style={{ position: 'absolute', right: 10, top: 8, fontFamily: FN, fontWeight: 800, fontSize: 42, lineHeight: 1, color: NAVY, opacity: 0.08, fontVariantNumeric: 'tabular-nums' }}>{t.jersey ?? ''}</div>
            <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: ORANGE_DEEP, fontVariantNumeric: 'tabular-nums' }}>#{t.jersey ?? '—'}</div>
              {/* Two lines are reserved whether or not the name needs them, so a
                  short Latin name and a long Hebrew one leave the rows below at
                  the same y. lineHeight is fixed for the same reason - Heebo and
                  Nord disagree about 'normal'. */}
              <div style={{ fontFamily: FN, fontWeight: 700, fontSize: 15, lineHeight: 1.2, color: C.tx, marginTop: 3, minHeight: 'var(--rc-name, 36px)', whiteSpace: 'normal', overflowWrap: 'break-word' }}>{t.name}</div>
              {/* Position ALWAYS, injury appended - the same line every card in
                  the zone uses. This was injury-OR-position too, so on the roster
                  an injured athlete lost his position entirely while a fit one
                  kept it. Ohad flagged exactly this on the load board. */}
              {(() => {
                const inj = worstInjury(medical, t.id);
                const injShort = !inj ? null
                  : `${tr((inj.bodyPart || '').split('/')[0].trim())}${sideTag(inj.side, tr)}`;
                // TWO FIXED LINES, THE SAME IN EVERY CARD (27.9, Ohad: "ankle
                // available and ankle left out are on different rows ... too close
                // to the grey border"). Position and injury shared one wrapping
                // line, so the injury sat beside the position on one card and
                // under it on the next, and a wrapped line landed on the footer's
                // hairline. Now: line 1 the position, line 2 the injury (or
                // nothing), both reserved, and a fixed 12px above the rule.
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6, marginBottom: 12, minWidth: 0, minHeight: 'var(--rc-stat, 32px)' }}>
                    <span style={{ fontFamily: FB, fontSize: 11, lineHeight: '14px', color: C.td, whiteSpace: 'nowrap' }}>{tr(t.position) || '—'}</span>
                    {/* the reserved second line: the injury, or - for a player who
                        has not landed yet - when he lands (it used to add a line
                        of its own, so that card's row grew; 27.9 review) */}
                    {!injShort && t.arrival && t.arrival > todayISO()
                      ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: FN, fontSize: 11, lineHeight: '14px', fontWeight: 700, color: ORANGE_DEEP, whiteSpace: 'nowrap' }}><Plane size={10} color={ORANGE_DEEP} /> {tr('Lands')} {dow(t.arrival)} {monDay(t.arrival)}</span>
                      : <span style={{ fontFamily: FN, fontSize: 11, lineHeight: '14px', fontWeight: 700, color: injShort ? medText(inj.status) : 'transparent', whiteSpace: 'nowrap' }} aria-hidden={injShort ? undefined : 'true'}>{injShort ? `${injShort} · ${tr((MED_STATUS[inj.status] || {}).label || inj.status)}` : '·'}</span>}
                  </div>
                );
              })()}
              {/* #63, the unfinished half of "borders don't align from card to card"
                  (02.09). The card reserves a slot for the NAME and for the STAT
                  row but never for the FOOTER, so the one card whose footer wraps
                  to two lines is 8px taller and its hairline sits 8px higher than
                  its neighbours'. Measured 18.9 at 900px: two footers at top 636.8
                  and one at 628.8; same again at 620px.
                  A reserved slot fixes the hairline, and the card height goes up
                  by the same 8px so nothing above it loses room — the card was
                  rebuilt in September precisely because a fixed height with
                  top-down flow pushed the footer through the bottom border. */}
              {/* the footer's text sits centred between the rule and the card's
                  edge: 12px above it, the card's 13px padding below */}
              {/* ONE BASELINE (29.9 #397, Ohad: "the bottom row on each athlete card is
                  not aligned. not the text, and not the text compared to the top and
                  bottom borders"): the right group's wrapper kept the default line box
                  and sat its text ~2px low, and the height was 11px beside 10px.
                  Every piece is 10px on line-height 1, aligned on the baseline. */}
              <div className="bhbc-rc-foot" style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 'auto', paddingTop: 12, height: 31, boxSizing: 'border-box', borderTop: `1px solid ${C.cardBd}`, flexShrink: 0, lineHeight: 1 }}>
                <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, color: C.tm, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{heightM(t.heightCm)}</span>
                <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', color: C.tm, lineHeight: 1, whiteSpace: 'nowrap' }}>{flag(t.nationality)}</span>
                {/* THE PPG MUST NOT WRAP.
                    Measured at 900: every roster card footer is 30px except DJ
                    [athlete] and [athlete] at 38, and the whole 8px is this span
                    breaking "9.7 PPG" over two lines when the footer runs out
                    of room. The card height is fixed and the footer is pinned
                    to the bottom with margin-top:auto, so a taller footer
                    pushes its own hairline UP — which is the "borders don't
                    align from card to card" he reported on 02.09. Two words on
                    one line; the sessions text beside it is the flexible one. */}
                {(() => { const ppg = ppgFor(t); return ppg != null ? <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, color: ORANGE_DEEP, lineHeight: 1, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', flexShrink: 0 }} title={tr('Points per game this season')}><span dir="ltr" style={{ unicodeBidi: 'isolate' }}>{ppg} PPG</span></span> : null; })()}
                <span style={{ marginInlineStart: 'auto', display: 'inline-flex', alignItems: 'baseline', lineHeight: 1 }}>{acwr.ratio != null
                  ? <BandPill band={acwr.band} value={acwr.ratio.toFixed(2)} />
                  /* NO ACWR IS NOT THE SAME AS NO TRAINING. Without an RPE there
                     is no load and no ratio - but the sessions and their minutes
                     are recorded, and a physio reading "no load yet" about an
                     athlete who trained twenty times in a month is being told
                     something false. Say what is known. */
                  : (att && att.n > 0
                    ? <span title={tr('Last 28 days')} style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.tm, lineHeight: 1, whiteSpace: 'nowrap' }}>{att.n} {tr(att.n === 1 ? 'session' : 'sessions')}{att.min >= 60 ? ` · ${Math.round(att.min / 60)}${zoneT('h')}` : att.min > 0 ? ` · ${att.min}′` : ''}</span>
                    : <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.tm, lineHeight: 1 }}>{tr('no load yet')}</span>)}</span>
              </div>
            </div>
          </div>
        ))}
        {/* GHOSTS: on the club, not counted - the same card, dimmed and dashed,
            with no load, attendance or medical line to read. */}
        {ghosts.map((t) => (
          <div key={t.id} onClick={() => onOpen(t.id)} role="button" tabIndex={0} onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onOpen(t.id); } }} className="bhbc-card"
            style={{ position: 'relative', overflow: 'hidden', background: 'transparent', border: `1px dashed ${C.cardBd}`, padding: '13px 15px', height: 'var(--rc-h, auto)', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', cursor: 'pointer', opacity: 0.55 }}>
            <div style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: C.tm, fontVariantNumeric: 'tabular-nums' }}>#{t.jersey ?? '—'}</div>
            <div style={{ fontFamily: FN, fontWeight: 700, fontSize: 15, lineHeight: 1.2, color: C.tx, marginTop: 3, minHeight: 'var(--rc-name, 36px)' }}>{t.name}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6, marginBottom: 12, minHeight: 'var(--rc-stat, 32px)' }}>
              <span style={{ fontFamily: FB, fontSize: 11, lineHeight: '14px', color: C.td, whiteSpace: 'nowrap' }}>{tr(t.position) || '—'}</span>
              {/* the same reserved second line as every active card, so the ghost
                  is the same box (27.9: it was 25px shorter at 390) */}
              <span aria-hidden="true" style={{ fontFamily: FN, fontSize: 11, lineHeight: '14px', color: 'transparent' }}>·</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', height: 31, boxSizing: 'border-box', marginTop: 'auto', paddingTop: 12, borderTop: `1px dashed ${C.cardBd}`, fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.tm }}>{tr('Ghost')} · {tr('not counted')}</div>
          </div>
        ))}
      </div>
    </CollapsibleSection>
  );
}

// Microcycle — anchors the training week to the next game (MD-minus). Standard
// team-sport periodisation: load heaviest FAR from the game (MD-4/-3), taper
// MD-1 (Mujika: hold intensity, cut volume), game MD, regenerate MD+1. Gives
// the coach a day-by-day emphasis + a relative load level for the week ahead.
const MD_PLAN = {
  '-6': { label: 'MD-6', emphasis: 'Off / general prep', load: 1 },
  '-5': { label: 'MD-5', emphasis: 'General strength base', load: 3 },
  '-4': { label: 'MD-4', emphasis: 'Max strength + power (heaviest, far from game)', load: 5 },
  '-3': { label: 'MD-3', emphasis: 'Strength + power', load: 5 },
  '-2': { label: 'MD-2', emphasis: 'Power / speed · moderate volume', load: 3 },
  '-1': { label: 'MD-1', emphasis: 'Activation + taper — hold intensity, cut volume', load: 1 },
  '0': { label: 'GAME', emphasis: 'Game day', load: 0, game: true },
  '1': { label: 'MD+1', emphasis: 'Recovery / regeneration', load: 1 },
  '2': { label: 'MD+2', emphasis: 'Reload — build back up', load: 3 },
};
function mdPlan(md) {
  if (MD_PLAN[String(md)]) return MD_PLAN[String(md)];
  if (md <= -7) return { label: `MD${md}`, emphasis: 'General prep', load: 2 };
  return { label: `MD+${md}`, emphasis: 'In-season maintenance', load: 3 };
}
function MicrocycleView({ fx, today }) {
  const tr = useT();
  const addDaysISO = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const g = fx.nextGame;
  if (!g) return (
    <Card padding={14} leftStripe={ORANGE} header={secTitle('Microcycle')}>
      <div style={{ fontFamily: FB, fontSize: 13, color: C.td }}>{tr('No game scheduled — running a general prep block. Add a fixture to anchor the training week.')}</div>
    </Card>
  );
  const until = dayDiff(g.date, today); // days from today to the game
  // Show today → game + 1 recovery day (cap at ~8 cells so it stays a week view).
  const span = Math.min(Math.max(until + 1, 1), 8);
  const days = Array.from({ length: span + 1 }, (_, i) => {
    const iso = addDaysISO(today, i);
    const md = -dayDiff(g.date, iso); // MD-N (neg before, 0 game, +1 after)
    return { iso, md, plan: mdPlan(md), isToday: iso === today, isGame: md === 0 };
  });
  const loadColor = (n, game) => game ? ORANGE : n >= 5 ? ORANGE_DEEP : n >= 3 ? NAVY : '#6B7280';
  return (
    <Card padding={14} leftStripe={ORANGE} header={secTitle('Microcycle')} headerRight={<span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--c-stripTx)' }}>{tr('→')} {g.opponent ? `${tr('vs')} ${g.opponent}` : tr('Game')} · {until === 0 ? tr('today') : daysFor(until)}</span>}>
      <div style={{ overflowX: 'auto' }}>
        {/* 160, not 120 (29.9 #380): each emphasis phrase stays on one line
            ("hold intensity, cut volume" ~150px) and spilled out of a 120px
            card; the strip scrolls below desktop either way */}
        <div className="bhbc-micro-grid" style={{ display: 'grid', gridTemplateColumns: `repeat(${days.length}, minmax(160px, 1fr))`, gap: 8, minWidth: days.length * 160 }}>
          {days.map((d) => (

  // TODAY AND GAME DAY ARE NOT THE SAME THING AND MUST NOT LOOK IT.
  // Ohad, 19.9: "current day and gameday the same color? be smarter".
  // Both were an ORANGE border over an orange wash - 8% for the game,
  // 4% for today - which at a glance is one treatment, and the two
  // cards sat six apart in the same strip.
  // Orange means GAME everywhere in this zone: the fixture rows, the
  // load anchor line, the countdown. So the game keeps it, and TODAY
  // moves to NAVY, which is the zone's other structural colour and
  // already means "where you are" in the header.
  // A day that is BOTH keeps the orange wash and takes the navy ring,
  // so game-day-is-today reads as both rather than as neither.
            <div key={d.iso} style={{
              border: `1px solid ${d.isToday ? TODAY_INK : d.isGame ? ORANGE : C.cardBd}`,
              ...(d.isToday ? { boxShadow: `inset 0 0 0 1px ${TODAY_INK}` } : null),
              borderTop: `3px solid ${loadColor(d.plan.load, d.isGame)}`,
              padding: '10px 10px 12px',
              background: d.isGame ? `color-mix(in srgb, ${ORANGE} 8%, transparent)`
                : d.isToday ? `color-mix(in srgb, ${NAVY} 5%, transparent)`
                : 'var(--c-sf)',
              display: 'flex', flexDirection: 'column', gap: 6 }}>
              {/* minWidth:0 + flexWrap so a squeezed label breaks at its space
                  and the TODAY chip drops to its own line, rather than the
                  label pushing out of the card. Defensive, not a reported bug:
                  the 19.9 "Wed 23 Sep" spills were the WEEK row's 74px date
                  column (see the 84px rule above), not this card - I changed
                  this one first on a wrong reading of the gate output. */}
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.tm, minWidth: 0 }}>{dow(d.iso)} {monDay(d.iso)}</span>
                {d.isToday && <span style={{ fontFamily: FN, fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', color: TODAY_INK }}>{tr('TODAY')}</span>}
              </div>
              <span style={{ fontFamily: FN, fontSize: 13, fontWeight: 800, letterSpacing: '0.04em', color: d.isGame ? ORANGE_DEEP : C.tx }}>{tr(d.plan.label)}</span>
              <Segmented text={tr(d.plan.emphasis)} style={{ fontFamily: FB, fontSize: 11, color: C.tm, lineHeight: 1.35, minHeight: 30 }} />
              {/* Relative load — 5-segment bar, colour = intensity (signal, not paint). */}
              <div style={{ display: 'flex', gap: 2, marginTop: 2 }}>
                {[1, 2, 3, 4, 5].map((s) => (
                  <span key={s} style={{ flex: 1, height: 4, background: d.isGame ? (s <= 5 ? ORANGE : C.cardBd) : (s <= d.plan.load ? loadColor(d.plan.load, false) : C.cardBd), opacity: d.isGame ? 0.9 : (s <= d.plan.load ? 1 : 0.5) }} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.cardBd}`, fontFamily: FN, fontSize: 10, color: C.td, letterSpacing: '0.02em' }}>{tr('Load anchored to the game: heaviest far out (MD-4/-3), taper MD-1 (hold intensity, cut volume), regenerate MD+1.')}</div>
    </Card>
  );
}

// WeekPlanner — the coach's planning board: WHAT the team does and WHEN, in one
// Sun→Sat grid (Ohad 2026-08-24: "it's still not easy enough to plan the week…
// like how it was in the original sheet"). Each day row lists its sessions and
// takes an inline add/edit: type · time · minutes · focus. The focus line writes
// through to the SAME per-session plan the Today panel and Head Coach Report
// already read, so one entry feeds every surface.
// ── PAST PRACTICES ──────────────────────────────────────────────────────────
// "Where can I see the previous practices' details?" (Ohad 08-24). The Schedule
// tab listed fixtures and the saved plans only ever surfaced on Today / This
// week, so once a practice was past, what the team actually DID was only
// reachable one athlete at a time. This is the team view of the same data:
// newest first, one row per SLOT (a morning and an evening practice are two
// rows), showing the plan that was written for it, who trained, who was out,
// and the load the squad actually took.
function PastPractices({ fixtures = [], loads = {}, roster = [], today, medical = {} }) {
  const tr = useT();
  const [open, setOpen] = useState(null);      // `${date}|${start}`
  const [limit, setLimit] = useState(8);

  // "Past" = an earlier date, OR a slot on TODAY whose start time has already
  // gone by — after the morning practice the coach is looking for the morning
  // practice, and excluding it by date alone hid exactly the session he had just
  // finished running.
  // Read the clock on every render (#305 L1). Memoised on `today` it froze at
  // the first render of the day, so the 18:00 practice never became "past"
  // for a coach who had the page open since the morning.
  const nowD = new Date();
  const nowHHMM = `${String(nowD.getHours()).padStart(2, '0')}:${String(nowD.getMinutes()).padStart(2, '0')}`;
  // PRACTICES ONLY. A game is not a practice, and a legacy weights slot is not
  // one either - lifts are personal now and never appear here.
  const isPracticeFx = (f) => f && !isCancelled(f) && ['practice', 'shootaround', 'scrimmage'].includes(String(f.type || '').toLowerCase());
  const past = useMemo(() => (fixtures || [])
    .filter((f) => isPracticeFx(f) && (f.date < today || (f.date === today && (f.start || '') && f.start <= nowHHMM)))
    .sort((a, b) => b.date.localeCompare(a.date) || (b.start || '').localeCompare(a.start || ''))
  , [fixtures, today, nowHHMM]);

  // Attendance for a slot: the recorded attendance mark first, then an athlete's
  // court or S&C row for that DATE whose `start` matches. Rows written before
  // per-slot logging carry no start — they belong to the day's first practice
  // rather than vanishing.
  const detailFor = useCallback((f) => {
    const daySlots = past.filter((x) => x.date === f.date)
      .sort((a, b) => (a.start || '').localeCompare(b.start || ''));
    const trained = [], out = [], scMins = [], scNotes = [], notes = [], rowsBy = [];
    let notYet = 0;
    for (const t of roster) {
      const rec = loads[t.id];
      const rows = (rec && rec.sessions && rec.sessions[f.date]) || [];
      // NOT LANDED YET, NOT AT PRACTICE (#305 N-B1). The roster-status rule
      // below counts everyone available as there; a signing who arrives on the
      // 30th was being counted at the practices of the 20th. Before his
      // arrival he is not owed the practice at all - out of the count and out
      // of the denominator - unless something was actually logged for him.
      if (t.arrival && f.date < t.arrival && !(rec && rec.attendance && rec.attendance[`${f.date}|${f.start || ''}`]) && !rows.some((r) => rowKind(r) === 'sc' || rowKind(r) === 'practice')) { notYet++; continue; }
      // An explicitly recorded attendance for this slot is the truth; the
      // session-row inference below only covers sessions logged before the
      // per-slot model existed.
      const att = rec && rec.attendance && rec.attendance[`${f.date}|${f.start || ''}`];
      const mine = rows.filter((r) => {
        const kind = rowKind(r);
        // A PERSONAL LIFT IS NEVER ATTENDANCE AT A PRACTICE, whatever `start`
        // it happens to carry. Caught 20.9 when this card reported "2/10
        // trained" at a practice whose only records were two lifts. A game
        // row belongs to the game, not to a practice on the same day.
        if (kind !== 'practice' && kind !== 'sc') return false;
        if (r.start) return r.start === f.start;
        return daySlots.length > 0 && daySlots[0].start === f.start;
      });
      const avail = availOn(rec, medical, t.id, f.date);
      if (att === 'out') { out.push(t); continue; }
      if (mine.length || att === 'in') {
        trained.push(t);
        for (const r of mine) {
          // The S&C block attached to this practice: its minutes (team-wide,
          // reported as the mean) and the one note written for it.
          if (rowKind(r) === 'sc' && Number(r.min) > 0) scMins.push(Number(r.min));
          if (rowKind(r) === 'sc' && r.note) scNotes.push(String(r.note));
          if (r.by) rowsBy.push(r.by);
        }
        const n = (rec.notes && (rec.notes[`${f.date}|${f.start || ''}`] || rec.notes[f.date])) || '';
        if (n) notes.push({ name: t.name, note: n });
      } else if (avail >= 4) out.push(t);
      // DRAWN FROM THE ROSTER STATUS, as the attendance grid is (27.9 #249):
      // no mark for the practice -> everyone available that day was there.
      else trained.push(t);
    }
    const sum = (arr) => arr.reduce((a, x) => a + x, 0);
    // The team note is the one most athletes carry (per-athlete notes win on
    // their own rows and are listed separately below).
    const noteCount = {};
    scNotes.forEach((n) => { noteCount[n] = (noteCount[n] || 0) + 1; });
    const scNote = Object.keys(noteCount).sort((a, b) => noteCount[b] - noteCount[a])[0] || '';
    // WHO logged this session. Past practices is what the basketball staff
    // read, so the row needs an author for the same reason a medical record
    // does — you cannot ask a question of an unsigned entry.
    const loggers = [...new Set(rowsBy.filter(Boolean))];
    return { trained, out, expected: roster.length - notYet, scMinutes: scMins.length ? Math.round(sum(scMins) / scMins.length) : 0, scNote, notes, loggers };
  // medical belongs here (#305 N-D2): an injury filed or cleared while this
  // card is open moves who was out of a past practice, and without it the
  // rows kept the medical record as it was when the card first rendered.
  }, [loads, roster, past, medical]);

  if (!past.length) return null;
  const names = (arr) => arr.map((t) => t.name).join(', ');

  return (
    <Card padding={14} leftStripe={NAVY} header={secTitle('Past practices')}
      headerRight={<span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--c-stripTx)' }}>{past.length === 1 ? tr('1 practice') : `${past.length} ${tr('practices')}`}</span>}>
      {/* The first row's top space = every row's (26.9, Ohad: "too many vertical
          space between past practices and thu 25 sep"): the strip's 12px gap is
          cancelled so the row's own 9px is the only space above it. */}
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: -12 }}>
        {past.slice(0, limit).map((f) => {
          const key = `${f.date}|${f.start || ''}`;
          const d = detailFor(f);
          const isOpen = open === key;
          return (
            <div key={key} style={{ borderBottom: `1px solid ${C.cardBd}` }}>
              {/* ONE className. This element carried two — "bhbc-row" here and
                  "bhbc-pp-row" three lines down — and JSX keeps the LAST, so
                  bhbc-row was silently dropped and whatever it styles never
                  applied to this row. The build had been warning about it. */}
              <div onClick={() => setOpen(isOpen ? null : key)}
                role="button" tabIndex={0} aria-expanded={isOpen}
                onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); setOpen(isOpen ? null : key); } }}
                className="bhbc-row bhbc-pp-row"
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 2px', cursor: 'pointer' }}>
                {/* 96px + nowrap: at 78px some dates wrapped to two lines and
                    others didn't, so the column read ragged. */}
                <span style={{ fontFamily: FN, fontWeight: 700, fontSize: 12, color: C.tx, width: 96, flexShrink: 0, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{dow(f.date)} {monDay(f.date)}</span>
                <span style={{ fontFamily: FN, fontSize: 12, fontWeight: 700, color: FX_COLOR[f.type] || NAVY, width: 46, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{f.start}</span>
                {/* 12px, like the date and the time it sits between. This span
                    had no fontSize at all, so it inherited the card's ~17px while
                    its own siblings were 12 - which is both why it looked
                    oversized next to them and why "PRACTICE · 120 MIN" needed two
                    lines in a column that fits it easily at 12. */}
                {/* words stay whole (26.9: "PRACTIC / E" at 390): wrap BETWEEN words only */}
                {/* FIXED COLUMNS, ONE LINE (27.9, Ohad: "bad design ... with the sc 5
                    min moving all the text"): date · time · session · a RESERVED S&C
                    slot · count · chevron on every row, so a row with S&C lays out
                    exactly like one without. The list is Past PRACTICES, so a
                    practice row shows its minutes only; any other kind names itself. */}
                <span style={{ color: C.tm, fontFamily: FB, fontSize: 12, flex: '1 1 auto', minWidth: 0, whiteSpace: 'nowrap' }}>
                  {/* THE DURATION IS ONE TOKEN, NOT TWO WORDS THAT MAY PART.
                      Measured 19.9 at 390 in Hebrew: this column is the one that
                      gives way, and every past-practice row broke "120 דק׳" in
                      half, leaving "דק׳" alone on a second line - eight rows, all
                      of them. The label may wrap; the NUMBER and its unit may
                      not. */}
                  {f.type !== 'practice' ? fxLabelFor(f.type, FX_LABEL[f.type] || 'Session') : null}
                  {f.minutes ? <>{f.type !== 'practice' ? ' · ' : null}<span style={{ whiteSpace: 'nowrap' }}>{f.minutes}<span className="min-unit">{' ' + fxLabelFor('__min', 'min')}</span><span className="min-tick">′</span></span></> : null}
                  {densityOf(f) ? <>{' · '}<DensityBit f={f} /></> : null}
                </span>
                {/* the S&C slot is always there, empty when none ran */}
                <span style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, color: C.tx, width: 92, flexShrink: 0, textAlign: 'end', fontVariantNumeric: 'tabular-nums', unicodeBidi: 'isolate', whiteSpace: 'nowrap' }}>
                  {d.scMinutes > 0 ? <>{tr('S&C')} <MinTok n={d.scMinutes} /></> : null}
                </span>
                {/* The two numbers a head coach actually asks for. */}
                {/* THE WHOLE SQUAD OUT IS NOT A 0/10 PRACTICE (#305 B8) - on a
                    travel day nobody was owed it, and "0/10" reads as ten
                    no-shows. Said as what it is. Normal ink for a normal count:
                    colour only the exceptions (E1). */}
                <span style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, color: C.tx, width: 40, flexShrink: 0, textAlign: 'end', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                  {!d.trained.length && d.expected > 0 && d.out.length === d.expected ? <span style={{ color: C.td }}>{tr('all out')}</span> : `${d.trained.length}/${d.expected}`}
                </span>
                {/* The AU and RPE readouts are gone with the load model they
                    described (Ohad 23.9, no team RPEs). What a coach asks of
                    this row now is who trained and what the S&C block was.
                    Lifts are personal and never appear on a practice row. */}
                <svg aria-hidden width="9" height="6" viewBox="0 0 9 6" fill="none"
                  style={{ color: C.tm, flexShrink: 0, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>
                  <path d="M1 1l3.5 3.5L8 1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              {isOpen && (
                <div style={{ padding: '2px 2px 12px 88px', fontFamily: FB, fontSize: 12, color: C.tx, lineHeight: 1.55 }}>
                  {/* THE S&C BLOCK that ran with this practice: the team's
                      minutes and the note written for it. Its own figure, never
                      pooled with anyone's lift. */}
                  <div style={{ marginBottom: 6 }}>
                    <span style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.tm, marginInlineEnd: 8 }}>{tr('S&C session')}</span>
                    {d.scMinutes > 0
                      ? <span dir="auto"><span style={{ fontVariantNumeric: 'tabular-nums', unicodeBidi: 'isolate' }}>{d.scMinutes} {tr('min')}</span>{d.scNote ? ` · ${d.scNote}` : ''}</span>
                      : <span style={{ color: C.td }}>{tr('no S&C session logged')}</span>}
                  </div>
                  <div style={{ marginBottom: 6 }}>
                    <span style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.tm, marginInlineEnd: 8 }}>{tr('Trained')}</span>
                    {d.trained.length ? <span dir="auto">{names(d.trained)}</span> : <span style={{ color: C.td }}>{tr('nobody logged')}</span>}
                    {d.loggers && d.loggers.length > 0 && <span style={{ color: C.td }}> · {tr('logged by')} {d.loggers.map(byName).join(', ')}</span>}
                  </div>
                  {d.out.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <span style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#DE4E3B', marginInlineEnd: 8 }}>{tr('Out')}</span>
                      <span dir="auto">{names(d.out)}</span>
                    </div>
                  )}
                  {d.notes.length > 0 && (
                    <div>
                      <span style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.tm, marginInlineEnd: 8 }}>{tr('Notes')} </span>
                      {d.notes.map((n, i) => <div key={i} dir="auto" style={{ color: C.tm }}>{n.name}: {n.note}</div>)}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {past.length > limit && (
        <button onClick={() => setLimit((n) => n + 12)}
          style={{ marginTop: 10, background: 'transparent', border: `1px solid ${C.cardBd}`, color: C.tm, fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', padding: '6px 12px', cursor: 'pointer', textTransform: 'uppercase' }}>
          {tr('Show {n} more').replace('{n}', Math.min(12, past.length - limit))}
        </button>
      )}
    </Card>
  );
}

function WeekPlanner({ fixtures = [], today, loads = {}, athleteIds = [], onUpsert, onRemove, onAttachSc, onCancel = null, action = null }) {
  const he = useHe();
  const tr = useT();
  // 'rows' (the original vertical list) or 'columns' (the week as day columns).
  // Persisted per coach — a layout preference you have to re-pick every visit
  // is not a preference.
  const [wpLayout, setWpLayout] = usePersistentState('bhbc-week-layout', 'rows');
  const horizontalWeek = wpLayout === 'columns';
  const isoOfDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const [anchor, setAnchor] = useState(today);
  // THE WEEK FOLLOWS THE DAY (#305 L1): a page left open overnight kept
  // yesterday's week once Saturday rolled into Sunday. The planner moves with
  // the date only while it is still on the day it opened on - a week the
  // coach paged to himself stays where he put it.
  const openedOn = React.useRef(today);
  useEffect(() => {
    setAnchor((a) => (a === openedOn.current ? today : a));
    openedOn.current = today;
  }, [today]);
  // THE S&C BUTTON SAYS WHAT IS ALREADY THERE (#305 L2 / L3). A practice whose
  // S&C is logged reads "S&C ✓ 10′" in plain ink - still a button, since the
  // sheet reopens on the record to correct it; one still to log keeps the
  // orange action; a past practice with nothing logged is muted, not shouted
  // (late logging still works, but a day gone by is not today's to-do).
  const scOf = (d, f) => scLoggedFor(loads, athleteIds, { ...f, date: d }, fixtures);
  // In the tag the word is the short one - Hebrew "כוח", as the caption above
  // already writes "+ כוח" (29.9 #458: "כוח קבוצתי ✓ 10′" did not fit one width)
  const scWord = he ? 'כוח' : tr('S&C');
  const scLabel = (d, f) => { const sc = scOf(d, f); return sc ? <>{scWord} ✓ <MinTok n={sc.min} /></> : `+ ${scWord}`; };
  const scTitle = (d, f) => tr(scOf(d, f) ? 'S&C logged - open it to correct' : 'Log S&C Session');
  // logged or gone by = quiet; still to log today or ahead = the orange action
  const scInk = (d, f) => (scOf(d, f) || d < today ? C.tm : ORANGE);
  // THE S&C ACTION (29.9 #458: "should all be the same horizontal length no
  // matter the text"): one width (--sc-w) whatever it says. Since #509 it is a
  // SEGMENT of the chip (segBtn) - the whole chip height, no face of its own.
  const scBtn = (d, f) => (
    <button type="button" onClick={() => onAttachSc(d, f.start || '')} className="bhbc-seg bhbc-sc-btn" title={scTitle(d, f)}
      style={segBtn(scInk(d, f), { width: 'var(--sc-w)', padding: 0 })}>{scLabel(d, f)}</button>
  );
  const [editing, setEditing] = useState(null); // { orig|null, date, type, start, minutes, focus }
  const days = useMemo(() => {
    const d = new Date(`${anchor}T12:00:00`);
    d.setDate(d.getDate() - d.getDay()); // week starts Sunday (Israel)
    return Array.from({ length: 7 }, (_, i) => { const x = new Date(d); x.setDate(d.getDate() + i); return isoOfDate(x); });
  }, [anchor]);
  const shiftWeek = (n) => { const d = new Date(`${anchor}T12:00:00`); d.setDate(d.getDate() + n * 7); setAnchor(isoOfDate(d)); };
  const byDay = useMemo(() => {
    const m = {};
    for (const f of fixtures || []) { if (!days.includes(f.date)) continue; (m[f.date] = m[f.date] || []).push(f); }
    for (const k of Object.keys(m)) m[k].sort((a, b) => String(a.start || '').localeCompare(String(b.start || '')));
    return m;
  }, [fixtures, days]);
  // SESSIONS ARE THE NON-GAME SLOTS (#305 E5): counting every slot put the
  // week's game in both numbers - "6 sessions · 1 game" for five practices.
  const weekCount = days.reduce((a, d) => a + ((byDay[d] || []).filter((f) => f.type !== 'game' && !isCancelled(f)).length), 0);
  const gameCount = days.reduce((a, d) => a + ((byDay[d] || []).filter((f) => f.type === 'game').length), 0);

  // A new slot is a PRACTICE. There is no team weights slot to plan any more:
  // lifts are personal (24.9), so the 'lift' type is gone from the picker.
  // Legacy lift slots still on the calendar stay readable and editable.
  const startEdit = (date, f) => setEditing({
    orig: f || null, date, type: (f && f.type) || 'practice',
    start: (f && f.start) || '', minutes: (f && f.minutes) || (f && f.type === 'game' ? 90 : 60),
    contactMin: (f && f.contactMin) || '',
    // A game's own facts, so they can be typed in rather than waiting for a
    // calendar the coach can only read. `home` is a three-way: home, away, or
    // unset for a neutral venue (a cup tie in a third city).
    opponent: (f && f.opponent) || '',
    venue: (f && f.venue) || '',
    home: f && f.home === true ? 'home' : f && f.home === false ? 'away' : '',
  });
  const commit = () => {
    if (!editing || !editing.start) { toast('Set a start time'); return; }
    onUpsert(editing.orig, editing);
    setEditing(null);
  };

  // One height for every bordered control on the board (24.9: 36 everywhere).
  const inp = { fontFamily: FN, fontSize: 12, color: C.tx, background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: '0 8px', height: 'var(--btn-h)', boxSizing: 'border-box' };
  const TYPES = [['practice', 'Practice'], ['game', 'Game']];

  return (
    // ONE ROW (26.9): the counts are a caption beside the title, not part of
    // it — appended to the title they wrapped it to two lines at 390.
    <CollapsibleSection title={tr("Week Planner")} storageKey="bhbc-week-planner" defaultOpen leftStripe={ORANGE}
      right={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}><span className="strip-meta" style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', whiteSpace: 'nowrap', color: 'color-mix(in srgb, var(--c-stripTx) 78%, transparent)' }}>{he ? `${weekCount === 1 ? 'אימון אחד' : `${weekCount} אימונים`} · ${gameCount === 1 ? 'משחק אחד' : `${gameCount} משחקים`}` : `${weekCount} sessions · ${gameCount} games`}</span>{action}</span>}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <button onClick={() => shiftWeek(-1)} className="bhbc-ghost-btn" aria-label={tr('Previous week')} style={navArrow(false)}>{he ? '›' : '‹'}</button>
        <span style={{ fontFamily: FN, fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.tx }}>
          {monDay(days[0])} – {monDay(days[6])}
        </span>
        <button onClick={() => shiftWeek(1)} className="bhbc-ghost-btn" aria-label={tr('Next week')} style={navArrow(false)}>{he ? '‹' : '›'}</button>
        <button onClick={() => setAnchor(today)} className="bhbc-ghost-btn" style={{ ...inp, cursor: 'pointer', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{tr('This week')}</button>
        {/* Layout choice (Ohad: "an option for a horizontal layout for the days
            in addition the vertical"). Rows read well for a week with a few
            long sessions; columns show the SHAPE of the week - which days are
            loaded and which are empty - at a glance. Persisted, and the label
            is fixed-width so the control never resizes as it toggles. */}
        <button onClick={() => setWpLayout(wpLayout === 'columns' ? 'rows' : 'columns')}
          className="bhbc-ghost-btn"
          title={tr(wpLayout === 'columns' ? 'Switch to a vertical list of days' : 'Switch to seven day columns')}
          style={{ ...inp, cursor: 'pointer', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', minWidth: 104, textAlign: 'center' }}>
          {wpLayout === 'columns' ? `▤ ${tr('Rows')}` : `▥ ${tr('Columns')}`}
        </button>
        <span style={{ marginInlineStart: 'auto', fontFamily: FB, fontSize: 12, color: C.td }}>{he ? 'האימונים והמשחקים של השבוע, מלוח המועדון. ‎+ כוח רושם את אימון הכוח של הקבוצה לאימון הזה.' : 'The week’s practices and games, from the club calendar. + S&C logs the team S&C session for that practice.'}</span>
      </div>

      {/* SEVEN across, like a calendar week (Ohad: "all 7 days in one row, like
          google calendar"). auto-fit wrapped them into ragged rows, which is
          not a week. The class carries breakpoints so a phone still gets a
          readable column count instead of seven 50px slivers — inline styles
          cannot express a media query. */}
      <div className={horizontalWeek ? 'bhbc-week-grid' : undefined}
        style={horizontalWeek ? undefined : { display: 'flex', flexDirection: 'column' }}>
        {days.map((d) => {
          const list = byDay[d] || [];
          const isToday = d === today;
          return (
            <div key={d} data-week-date={d} data-week-n={list.length} className={horizontalWeek ? undefined : 'bhbc-week-row'} style={horizontalWeek
              ? { display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 9px', border: `1px solid ${C.cardBd}`, borderTop: `2px solid ${isToday ? TODAY_INK : 'transparent'}`, background: isToday ? `color-mix(in srgb, ${NAVY} 5%, transparent)` : 'transparent', minWidth: 0 }
              // 12px sides on EVERY row, so today's tint has an inset and the
              // day label never sits on its edge (26.9: "sat, sep 26 is too close
              // to the dark grey edge"); all rows share it, so nothing shifts.
              : { display: 'flex', gap: 12, alignItems: 'center', padding: '6px 12px', borderTop: `1px solid ${C.cardBd}`, background: isToday ? `color-mix(in srgb, ${NAVY} 5%, transparent)` : 'transparent' }}>
              <div style={horizontalWeek ? { flexShrink: 0 } : { width: 86, flexShrink: 0 }}>
                <div style={{ fontFamily: FN, fontSize: 12, fontWeight: 700, color: isToday ? TODAY_INK : C.tx }}>{dow(d)}</div>
                <div style={{ fontFamily: FN, fontSize: 10, color: C.td, fontVariantNumeric: 'tabular-nums' }}>{monDay(d)}</div>
              </div>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
                {list.length === 0 && (!editing || editing.date !== d) && (
                  <span style={{ fontFamily: FB, fontSize: 12, color: C.td, fontStyle: 'italic' }}>{tr('No sessions')}</span>
                )}
                {list.map((f, i) => {
                  const isEditing = editing && editing.orig && sameSlotKey(editing.orig, f);
                  if (isEditing) return null;
                  const off = isCancelled(f);
                  const court = ['practice', 'shootaround', 'scrimmage'].includes(String(f.type || '').toLowerCase());
                  // CANCEL / RESTORE: a quiet segment; a cancel asks first (the
                  // session drops out of every count), a restore does not.
                  const cancelBtn = onCancel && court ? (
                    <button key="cx" type="button" data-cancel-fx={off ? 'restore' : 'cancel'} className="bhbc-seg bhbc-cancel-btn" aria-label={tr(off ? 'Restore this session' : 'Cancel this session')}
                      onClick={async (e) => { const el = e.currentTarget; if (off) { onCancel(f, false); return; } if (await confirmToast(he ? `לבטל את האימון של ${f.start || ''}? הוא יישאר בלוח עם קו עליו ולא ייספר בשום מקום.` : `Cancel the ${f.start || ''} ${tr(FX_LABEL[f.type] || 'session').toLowerCase()}? It stays on the calendar, struck through, and counts nowhere.`, { okLabel: he ? 'ביטול האימון' : 'Cancel session', cancelLabel: he ? 'חזרה' : 'Back' })) onCancel(f, true); try { el.blur(); document.activeElement?.blur?.(); } catch { /* gone */ } }}
                      title={tr(off ? 'Restore this session' : 'Cancel this session')}
                      style={segBtn(C.tm, { width: horizontalWeek ? undefined : 'var(--cx-w)', flex: horizontalWeek ? '1 1 0' : undefined, padding: 0 })}>{off || horizontalWeek ? tr(off ? 'Restore' : 'Cancel') : <><span className="cx-full">{tr('Cancel')}</span><span className="cx-icon" aria-hidden>⊘</span></>}</button>
                  ) : null;
                  const sc = !off && onAttachSc && court
                    ? (horizontalWeek ? <button key="sc" type="button" onClick={() => onAttachSc(d, f.start || '')} className="bhbc-seg bhbc-sc-btn" title={scTitle(d, f)} style={segBtn(scInk(d, f), { flex: '1 1 0', padding: 0, borderInlineStart: 'none' })}>{scLabel(d, f)}</button> : scBtn(d, f))
                    : null;
                  const edits = onUpsert ? [
                    <button key="ed" type="button" onClick={() => startEdit(d, f)} className="bhbc-seg" title={tr('Edit session')} aria-label={tr('Edit session')} style={segBtn(C.tm, { width: 'var(--btn-h)', padding: 0, flex: horizontalWeek ? '1 1 0' : undefined })}><PencilGlyph /></button>,
                    <button key="rm" type="button" onClick={() => onRemove(f)} className="bhbc-seg" title={tr('Remove session')} aria-label={tr('Remove session')} style={segBtn(C.tm, { width: 'var(--btn-h)', padding: 0, flex: horizontalWeek ? '1 1 0' : undefined })}><CrossGlyph /></button>,
                  ] : [];
                  const acts = [sc, cancelBtn, ...edits].filter(Boolean);
                  return (
                    <EventChip key={i} f={f} stacked={horizontalWeek} actions={acts.length ? acts : null} />
                  );
                })}
                {editing && editing.date === d && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', border: `1px solid ${ORANGE}`, background: 'var(--c-sf)', padding: '8px 9px' }}>
                    <div style={{ display: 'inline-flex', border: `1px solid ${C.cardBd}` }}>
                      {TYPES.map(([k, l]) => (
                        <button key={k} type="button" onClick={() => setEditing((e) => ({ ...e, type: k }))}
                          style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: editing.type === k ? '#fff' : C.td, background: editing.type === k ? (FX_COLOR[k] || NAVY) : 'transparent', border: 'none', height: 34, boxSizing: 'border-box', padding: '0 10px', display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>{tr(l)}</button>
                      ))}
                    </div>
                    <input type="time" value={editing.start} onChange={(e) => setEditing((x) => ({ ...x, start: e.target.value }))} style={{ ...inp, width: 108 }} />
                    <input type="number" min="0" step="5" value={editing.minutes} onChange={(e) => setEditing((x) => ({ ...x, minutes: e.target.value }))} style={{ ...inp, width: 74 }} title={tr('Minutes')} />
                    {/* Contact minutes INSIDE those minutes. Optional: the density
                        appears once both numbers exist and stays quiet otherwise. */}
                    {editing.type !== 'lift' && (
                      <input type="number" min="0" step="1" value={editing.contactMin} onChange={(e) => setEditing((x) => ({ ...x, contactMin: e.target.value }))}
                        style={{ ...inp, width: 74 }} title={tr('Contact minutes')} placeholder={tr('contact')} />
                    )}
                    {/* A GAME'S OPPONENT IS TYPED HERE, not waited for.
                        The club calendar is read-only to the coach and still
                        said "Winner cup game ???" on the day of the tie. These
                        three only appear on a game or a scrimmage — a weights
                        session has no opponent. */}
                    {(editing.type === 'game' || editing.type === 'scrimmage') && (<>
                      <input value={editing.opponent} onChange={(e) => setEditing((x) => ({ ...x, opponent: e.target.value }))}
                        placeholder={tr('Opponent')} title={tr('Opponent')} style={{ ...inp, flex: '1 1 150px', minWidth: 120, fontFamily: FB }} />
                      <input value={editing.venue} onChange={(e) => setEditing((x) => ({ ...x, venue: e.target.value }))}
                        placeholder={tr('Venue')} title={tr('Venue')} style={{ ...inp, flex: '1 1 130px', minWidth: 110, fontFamily: FB }} />
                      <div style={{ display: 'inline-flex', border: `1px solid ${C.cardBd}` }}>
                        {[['home', 'Home'], ['away', 'Away'], ['', 'Neutral']].map(([k, l]) => (
                          <button key={k || 'neutral'} type="button" onClick={() => setEditing((x) => ({ ...x, home: k }))}
                            style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
                              color: editing.home === k ? '#fff' : C.td, background: editing.home === k ? NAVY : 'transparent',
                              border: 'none', padding: '6px 9px', cursor: 'pointer' }}>{tr(l)}</button>
                        ))}
                      </div>
                    </>)}
                    <Btn onClick={commit} style={{ background: ORANGE, borderColor: ORANGE, color: '#fff' }}>{zoneT(editing.orig ? 'Save' : 'Add')}</Btn>
                    <Btn variant="ghost" onClick={() => setEditing(null)}>{tr('Cancel')}</Btn>
                  </div>
                )}
                {onUpsert && (!editing || editing.date !== d) && (
                  <button onClick={() => startEdit(d, null)} className="bhbc-ghost-btn"
                    style={{ alignSelf: 'flex-start', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.tm, background: 'transparent', border: `0.25px dashed ${C.cardBd}`, padding: '4px 10px', cursor: 'pointer' }}>+ {tr('Session')}</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </CollapsibleSection>
  );
}
const sameSlotKey = (a, b) => a && b && a.date === b.date && String(a.start || '') === String(b.start || '') && a.type === b.type;

function ScheduleTool({ fx, fixtures, today, mode, setMode }) {
  const tr = useT();
  // UNWIRED DATA IS A VISIBLE ERROR, never a clean empty calendar (27.9: the
  // month view sat empty for ten days because `fixtures` was not passed).
  if (!Array.isArray(fixtures)) {
    console.error('[bhbc] ScheduleTool rendered without fixtures');
    return <Card padding={14} leftStripe={'#DE4E3B'} header={secTitle('Schedule')}><div style={{ fontFamily: FN, fontSize: 12, fontWeight: 700, color: '#DE4E3B' }}>{tr('Schedule data is not connected — report this.')}</div></Card>;
  }
  const toggle = (
    // ONE nested height (#509): the group is the strip's nested control height
    // with its border inside it - it measured 28 around 26px buttons.
    <div data-strip-toggle="" style={{ display: 'inline-flex', alignItems: 'stretch', height: 'var(--btn-h-in)', boxSizing: 'border-box', border: '1px solid rgba(255,255,255,0.32)' }}>
      {[['calendar', 'Month'], ['week', 'Week'], ['list', 'List']].map(([k, l]) => (
        <button key={k} type="button" data-strip-toggle="" aria-pressed={mode === k} onClick={() => setMode(k)} style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, lineHeight: 1, letterSpacing: '0.06em', textTransform: 'uppercase', color: mode === k ? NAVY : '#fff', background: mode === k ? '#fff' : 'transparent', border: 'none', height: 'auto', minHeight: 0, padding: '0 12px', display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>{tr(l)}</button>
      ))}
    </div>
  );
  return (
    <Card padding={14} leftStripe={ORANGE} header={secTitle('Schedule')} headerRight={toggle}>
      {/* ONE GRID CELL, three views stacked in it. Ohad: "month/week/list are
          differnt vetrical sizes and the website jumps and glitches from
          switching them" - measured at 1500, the page was 2125 / 1752 / 2181,
          a 429px swing, so everything below the card moved and a scrolled
          reader was thrown every time he changed view.
          Stacking them in the same cell makes the cell as tall as the TALLEST
          in one layout pass, at every width, with no stored height to go stale
          and no measure-then-set flicker. visibility:hidden (not display:none)
          keeps that height while taking the inactive views out of the tab order
          and the accessibility tree. */}
      <div style={{ display: 'grid' }}>
        {[
          ['calendar', <ScheduleMonth key="m" fixtures={fixtures} today={today} />],
          ['week', <ScheduleWeek key="w" fixtures={fixtures} today={today} />],
          ['list', <ScheduleList key="l" fx={fx} today={today} />],
        ].map(([k, node]) => (
          <div key={k} aria-hidden={mode === k ? undefined : 'true'}
            style={{ gridArea: '1 / 1', minWidth: 0, visibility: mode === k ? 'visible' : 'hidden' }}>
            {node}
          </div>
        ))}
      </div>
    </Card>
  );
}

function ScheduleList({ fx, today }) {
  const tr = useT();
  if (!fx.byDay.length) return <div style={{ fontFamily: FB, fontSize: 13, color: C.td, padding: '20px 0', textAlign: 'center' }}>{tr('No upcoming sessions.')}</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {fx.byDay.map((d) => {
        const isToday = d.date === today;
        const gd = fx.nextGame ? dayDiff(d.date, fx.nextGame.date) : null;
        // ONE VOCABULARY (#305 N-E4): the microcycle and Today's focus say MD-3;
        // this list said GD-3 for the same day. Words, not boxes (#509): the
        // 16px bordered MD tag was the smallest box in the zone.
        const gdLabel = gd == null ? null : gd === 0 ? tr('GAME DAY') : tr(mdPlan(gd).label);
        return (
          // TODAY IS THE ROW'S TINT, as on the planner - "FRI · TODAY" broke the
          // day column onto two lines (#509).
          <div key={d.date} data-list-date={d.date} style={{ display: 'flex', gap: 14, padding: '8px 10px', borderBottom: `1px solid ${C.cardBd}`, alignItems: 'center', background: isToday ? `color-mix(in srgb, ${NAVY} 5%, transparent)` : 'transparent' }}>
            <div style={{ width: 84, flexShrink: 0 }}>
              <div style={{ fontFamily: FN, fontWeight: 800, fontSize: 12, color: isToday ? TODAY_INK : C.tx }}>{dow(d.date)}</div>
              <div style={{ fontFamily: FN, fontSize: 10, color: C.td, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{monDay(d.date)}</div>
              {gdLabel && <div style={{ marginTop: 3, fontFamily: FN, fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: gd === 0 ? ORANGE_DEEP : C.tm, whiteSpace: 'nowrap' }}>{gdLabel}</div>}
            </div>
            {/* chips span the row, one under the other - as on the planner and
                the phone week; a game's venue is the line under its chip */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1, minWidth: 0 }}>
              {d.items.map((f, i) => (
                <React.Fragment key={i}>
                  <EventChip f={f} />
                  {fxWhere(f) && <span style={{ fontFamily: FB, fontSize: 11, color: C.tm, unicodeBidi: 'isolate', paddingInlineStart: 10 }}>{fxWhere(f)}</span>}
                </React.Fragment>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// THE WEEK, TWO WAYS (#509, Ohad 2.10: "the tables in schedule ... are very
// bad"). It was seven bordered columns stretched to the month view's height -
// at 1440, 580px columns holding one 39px chip each; on a phone a sideways
// scroller whose chips spilled their own words.
//   desktop: a real week - hours down the side, each session a block at its
//            time, as long as it lasts. The height it is given is the day.
//   phone:   the seven days as rows, each holding its session chips.
// Both are rendered; themes.css shows the one that fits (.bhbc-wk-*).
const hhmmToMin = (t) => { const m = /^(\d{1,2}):(\d{2})/.exec(String(t || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
function ScheduleWeek({ fixtures, today }) {
  const tr = useT();
  // Anchor to the week that holds the next session, so it's never blank pre-season.
  const upcoming = (fixtures || []).filter((f) => f.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const anchor = parseISO(upcoming[0]?.date || today);
  const weekStart = new Date(anchor); weekStart.setDate(anchor.getDate() - anchor.getDay());
  const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const byDate = {};
  (fixtures || []).forEach((f) => { (byDate[f.date] = byDate[f.date] || []).push(f); });
  // a slot with no start time must not take the card down (#305 N-F2)
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart); d.setDate(weekStart.getDate() + i);
    const iso = isoOf(d);
    return { d, iso, items: (byDate[iso] || []).slice().sort((a, b) => String(a.start || '').localeCompare(String(b.start || ''))) };
  });
  // the hours shown: 08-22 at least, widened to any session outside them
  const all = days.flatMap((x) => x.items);
  const st = all.map((f) => hhmmToMin(f.start)).filter((v) => v != null);
  const en = all.map((f) => { const v = hhmmToMin(f.start); return v == null ? null : v + (Number(f.minutes) || 60); }).filter((v) => v != null);
  const h0 = Math.min(8, ...st.map((v) => Math.floor(v / 60)));
  const h1 = Math.min(24, Math.max(22, ...en.map((v) => Math.ceil(v / 60))));
  const span = (h1 - h0) * 60;
  const hours = Array.from({ length: h1 - h0 + 1 }, (_, i) => h0 + i);
  const pctOf = (min) => Math.max(0, Math.min(100, ((min - h0 * 60) / span) * 100));
  // side by side only where two sessions overlap in time
  const placed = (items) => {
    const ends = [];
    const xs = items.map((f) => {
      const s0 = hhmmToMin(f.start) ?? h0 * 60;
      const e0 = s0 + (Number(f.minutes) || 60);
      let L = ends.findIndex((e) => e <= s0);
      if (L < 0) { L = ends.length; ends.push(e0); } else ends[L] = e0;
      return { f, s0, e0, L };
    });
    return xs.map((x) => ({ ...x, n: Math.max(1, ...xs.filter((y) => y.s0 < x.e0 && x.s0 < y.e0).map((y) => y.L + 1)) }));
  };
  const GUT = 44;
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="bhbc-wk-axis" style={{ flex: 1, minHeight: 480, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'grid', gridTemplateColumns: `${GUT}px repeat(7, minmax(0, 1fr))`, borderBottom: `1px solid ${C.cardBd}` }}>
          <span />
          {days.map((x) => {
            const isToday = x.iso === today;
            const hasGame = x.items.some((f) => f.type === 'game' && !isCancelled(f));
            return (
              <div key={x.iso} style={{ textAlign: 'center', padding: '6px 4px', borderTop: `2px solid ${isToday ? TODAY_INK : hasGame ? ORANGE : 'transparent'}` }}>
                <div style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: isToday ? TODAY_INK : C.tm }}>{dowFor(x.d, DOW[x.d.getDay()])}</div>
                <div style={{ fontFamily: FN, fontSize: 16, fontWeight: 800, color: isToday ? TODAY_INK : C.tx, fontVariantNumeric: 'tabular-nums' }}>{x.d.getDate()}</div>
              </div>
            );
          })}
        </div>
        <div style={{ flex: 1, position: 'relative', display: 'grid', gridTemplateColumns: `${GUT}px repeat(7, minmax(0, 1fr))` }}>
          {/* the hour lines run under every day; each label sits on its line */}
          {hours.map((h) => (
            <div key={h} aria-hidden="true" style={{ position: 'absolute', insetInline: 0, top: `${pctOf(h * 60)}%`, height: 0, borderTop: `1px solid ${h === h0 || h === h1 ? 'transparent' : 'color-mix(in srgb, var(--c-cardBd) 55%, transparent)'}`, zIndex: 0 }}>
              {h > h0 && h < h1 && <span style={{ position: 'absolute', insetInlineStart: 0, width: GUT - 8, top: -6, textAlign: 'end', fontFamily: FN, fontSize: 9, fontWeight: 600, color: C.tm, fontVariantNumeric: 'tabular-nums', lineHeight: '12px' }}>{String(h).padStart(2, '0')}:00</span>}
            </div>
          ))}
          <span />
          {days.map((x) => (
            <div key={x.iso} data-wk-date={x.iso} data-wk-n={x.items.length} style={{ position: 'relative', borderInlineStart: `1px solid ${C.cardBd}`, background: x.iso === today ? `color-mix(in srgb, ${NAVY} 5%, transparent)` : 'transparent' }}>
              {placed(x.items).map(({ f, s0, e0, L, n }, i) => {
                const col = FX_COLOR[f.type] || NAVY;
                const where = fxWhere(f);
                return (
                  <div key={i} className={'bhbc-wk-ev' + (isCancelled(f) ? ' fx-cancelled' : '')}
                    title={[f.start, fxLabelFor(f.type, FX_LABEL[f.type] || 'Session'), Number(f.minutes) > 0 ? `${f.minutes} ${tr('min')}` : '', where].filter(Boolean).join(' · ')}
                    style={{ position: 'absolute', zIndex: 1, top: `${pctOf(s0)}%`, height: `${pctOf(e0) - pctOf(s0)}%`, insetInlineStart: `calc(${(L / n) * 100}% + 3px)`, width: `calc(${100 / n}% - 6px)`, boxSizing: 'border-box', overflow: 'hidden', padding: '4px 6px', background: `color-mix(in srgb, ${col} 13%, var(--c-sf))`, borderInlineStart: `3px solid ${col}`, display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <span style={{ display: 'flex', gap: 5, alignItems: 'baseline', minWidth: 0, whiteSpace: 'nowrap' }}>
                      <span style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, color: C.tx, fontVariantNumeric: 'tabular-nums' }}>{f.start}</span>
                      <span style={{ fontFamily: FN, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: col, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{fxLabelFor(f.type, FX_LABEL[f.type] || 'Session')}</span>
                    </span>
                    {Number(f.minutes) > 0 && <span style={{ fontFamily: FN, fontSize: 9.5, color: C.td, whiteSpace: 'nowrap' }}><MinTok n={f.minutes} /></span>}
                    {where && <span style={{ fontFamily: FB, fontSize: 9.5, color: C.tm, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', unicodeBidi: 'isolate' }}>{where}</span>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="bhbc-wk-agenda" style={{ flex: 1, flexDirection: 'column' }}>
        {days.map((x) => {
          const isToday = x.iso === today;
          return (
            <div key={x.iso} data-wk-date={x.iso} data-wk-n={x.items.length} style={{ flex: '1 0 auto', display: 'flex', gap: 10, alignItems: 'center', padding: '6px 10px', minHeight: 48, boxSizing: 'border-box', borderBottom: `1px solid ${C.cardBd}`, background: isToday ? `color-mix(in srgb, ${NAVY} 5%, transparent)` : 'transparent' }}>
              <div style={{ width: 52, flexShrink: 0 }}>
                <div style={{ fontFamily: FN, fontSize: 12, fontWeight: 700, color: isToday ? TODAY_INK : C.tx }}>{dowFor(x.d, DOW[x.d.getDay()])}</div>
                <div style={{ fontFamily: FN, fontSize: 10, color: C.td, fontVariantNumeric: 'tabular-nums' }}>{monDay(x.iso)}</div>
              </div>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
                {x.items.length
                  ? x.items.map((f, i) => <EventChip key={i} f={f} />)
                  : <span style={{ fontFamily: FB, fontSize: 12, color: C.td, fontStyle: 'italic' }}>{tr('No sessions')}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ScheduleMonth({ fixtures, today }) {
  const tr = useT();
  const anchor = parseISO(today);
  const y = anchor.getFullYear(), m = anchor.getMonth();
  const first = new Date(y, m, 1);
  const gridStart = new Date(y, m, 1 - first.getDay());
  const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const byDate = {};
  for (const f of fixtures || []) { (byDate[f.date] = byDate[f.date] || []).push(f); }
  const weeks = [];
  for (let w = 0; w < 6; w++) {
    const row = [];
    for (let d = 0; d < 7; d++) { const dt = new Date(gridStart); dt.setDate(gridStart.getDate() + w * 7 + d); row.push(dt); }
    weeks.push(row);
  }
  const cell = (dt) => {
    const di = isoOf(dt);
    const inMonth = dt.getMonth() === m;
    const isToday = di === today;
    const items = (byDate[di] || []).slice().sort((a, b) => String(a.start || '').localeCompare(String(b.start || '')));   // a slot with no start time must not take the card down (#305 N-F2)
    // WHERE YOU ARE IN THE MONTH (#305 L4): today outlined in the zone's navy
    // (an inset ring, so no cell moves; the theme-aware navy, which lifts to a
    // light blue on the dark page), the days already gone dimmed.
    return (
      <div key={di} className="bhbc-cal-cell" data-cal-date={di} data-cal-n={items.length} style={{ minHeight: 82, borderInlineEnd: '1px solid var(--c-bd)', borderBottom: '1px solid var(--c-bd)', padding: '5px 7px', background: isToday ? `color-mix(in srgb, ${ORANGE} 7%, var(--c-sf))` : 'var(--c-sf)', display: 'flex', flexDirection: 'column', gap: 3, ...(isToday ? { boxShadow: `inset 0 0 0 2px var(--bhbc-ha-home, ${NAVY})` } : null), ...(di < today ? { opacity: 0.55 } : null) }}>
        <div style={{ fontFamily: FN, fontSize: 11, fontWeight: isToday ? 800 : 600, color: isToday ? TODAY_INK : (inMonth ? C.td : C.tm), textAlign: 'end', fontVariantNumeric: 'tabular-nums' }}>{dt.getDate()}</div>
        {items.slice(0, 3).map((f, i) => (
          <div key={i} className={isCancelled(f) ? 'bhbc-cal-chip fx-cancelled' : 'bhbc-cal-chip'} style={{ display: 'flex', flexWrap: 'wrap' /* the venue takes its own line (flexBasis 100%) - without wrap it squeezed the kind to a 19px stub (AUDIT-470) */, alignItems: 'center', gap: 5, rowGap: 1, fontFamily: FN, fontSize: 10, background: `color-mix(in srgb, ${FX_COLOR[f.type] || NAVY} 13%, transparent)`, borderInlineStart: `2px solid ${FX_COLOR[f.type] || NAVY}`, padding: '2px 5px', minWidth: 0 }}>
            <span style={{ color: FX_COLOR[f.type] || NAVY, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{f.start}</span>
            {/* one word, never broken: the full kind, or its short form when the
                column is too narrow (SegWord measures) */}
            <span className="bhbc-cal-kind" style={{ color: FX_COLOR[f.type] || NAVY, display: 'flex', minWidth: 0, whiteSpace: 'nowrap' }}><SegWord full={fxLabelFor(f.type, FX_LABEL[f.type] || 'Session')} short={fxLabelFor(f.type, FX_LABEL_SHORT[f.type] || FX_LABEL[f.type] || 'Session')} /></span>
            {fxWhere(f) && (f.type === 'game' || f.type === 'scrimmage') ? <span className="bhbc-cal-where" style={{ display: 'block', color: C.td, fontWeight: 400, fontSize: 9, flexBasis: '100%' }} dir="ltr">{fxWhere(f)}</span> : null}
          </div>
        ))}
        {items.length > 3 && <div className="bhbc-cal-more" style={{ fontFamily: FN, fontSize: 9, color: C.td, paddingInlineStart: 2 }}>{tr('+{n} more').replace('{n}', items.length - 3)}</div>}
      </div>
    );
  };
  return (
    // fills the shared cell: the three views share the TALLEST one's height (so
    // switching never jumps), and the month used to sit at the top of it with
    // an empty band under the grid (27.9 #300, his #341 rule) - its weeks grow
    <div style={{ overflowX: 'auto', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="bhbc-cal-wrap" style={{ minWidth: 620, flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontFamily: FN, fontWeight: 800, fontSize: 14, color: C.tx, marginBottom: 8, letterSpacing: '0.02em' }}>{monFor(m, MON[m])} {y}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', marginBottom: 4 }}>
          {DOW.map((d, i) => <div key={d} style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.tm, textAlign: 'center', padding: '4px 0' }}>{dowIdxFor(i, d)}</div>)}
        </div>
        <div style={{ borderTop: '1px solid var(--c-bd)', borderInlineStart: '1px solid var(--c-bd)', flex: 1, display: 'flex', flexDirection: 'column' }}>
          {weeks.map((week, i) => <div key={i} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', flex: 1 }}>{week.map(cell)}</div>)}
        </div>
      </div>
    </div>
  );
}

// ============================ LEAGUE / GAMES TAB ============================
// Renders the live league feed synced from basket.co.il (מנהלת ליגת העל) into
// the store key `expo-bhbc-league` by scripts/_bhbc-sync-league.mjs: standings,
// per-round results, BHBC team + per-player stats. BHBC always highlighted.
const isBH = (n) => /הרצליה|herzliy/i.test(n || '');
// Roster (English) → league box-score (Hebrew) name, so a player's official
// league stats attach to their EXPO athlete. Only current squad members who
// have league stats need an entry; new signings simply have none yet.
const LEAGUE_ALIAS = {
  'Daeshon Francis': 'דשון פרנסיס', 'Zack Bryant': 'זאק בראיינט',
  'Noah Carter': 'נואה קרטר', 'DJ Burns': "די-ג'יי ברנס",
};
// MATCHED BY JERSEY FIRST (27.9, Ohad: "this is not updated" - six of ten
// players read "—" on PLAYER STATS because only four had a spelling in the
// alias list). The league box scores carry the jersey; the name spelling is
// only a fallback for a season whose feed predates the jersey field.
const matchLeague = (players, t) => {
  const tt = typeof t === 'string' ? { name: t } : (t || {});
  const list = players || [];
  // a season archived before the jersey field was kept on the player still has it on every game line
  const jerseyOf = (p) => (p.jersey != null ? p.jersey : ((p.log || []).find((x) => x && x.jersey != null) || {}).jersey);
  if (tt.jersey != null) { const byJ = list.find((p) => jerseyOf(p) != null && Number(jerseyOf(p)) === Number(tt.jersey)); if (byJ) return byJ; }
  const heb = LEAGUE_ALIAS[tt.name];
  return heb ? list.find((p) => p.name === heb) || null : null;
};
const leaguePlayerFor = (league, t) => matchLeague(league?.players, t);
// ONE SPELLING PER OPPONENT (#305 E6). The league feed names clubs its own way
// (Hebrew, with a city in brackets); the club calendar - and every logged game
// row, which copies it - names them another. The club plays one game a day, so
// a league line on a date that holds a calendar game IS that game, and it takes
// the calendar's name. No calendar game that day -> the league's own name.
const calendarOpp = (fixtures, date) => {
  if (!date) return null;
  const f = (fixtures || []).find((x) => x && x.type === 'game' && x.date === date && x.opponent);
  return f ? f.opponent : null;
};
const withCalendarOpp = (fixtures, line) => { const o = line && calendarOpp(fixtures, line.date); return o ? { ...line, opp: o } : line; };
// Every league game of his, EVERY season kept: the current season's log plus
// the archived seasons' (27.9, history "by season then months").
// PAST SEASONS BY NAME, NOT BY NUMBER: a jersey changes hands between seasons
// (last year's #3 is not necessarily this year's), so an archived season is
// matched by the league's own spelling of THIS player - taken from his current-
// season line (matched by jersey), else the alias.
const leagueLogFor = (league, t) => {
  const curP = matchLeague(league?.players, t);
  const tt = typeof t === 'string' ? { name: t } : (t || {});
  const heb = (curP && curP.name) || LEAGUE_ALIAS[tt.name] || null;
  const old = heb ? Object.values(league?.archive || {}).flatMap((a) => ((a.players || []).find((p) => p.name === heb) || {}).log || []) : [];
  return [...((curP && curP.log) || []), ...old];
};
// HOW OLD THE LEAGUE NUMBERS ARE, in the zone's language (#305 D3). It printed
// "3h ago" on the Hebrew screen, and "4d ago" for a feed four days stale -
// under a day it stays relative; older than that it says the DATE it is from,
// day-first, from the feed's own updatedAt (a local date, never the UTC one).
const relTime = (iso, he = false) => {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const diff = (Date.now() - t) / 60000;
  if (diff < 1) return he ? 'עכשיו' : 'just now';
  if (diff < 60) return he ? `לפני ${Math.round(diff)} דק׳` : `${Math.round(diff)}m ago`;
  if (diff < 1440) { const h = Math.round(diff / 60); return he ? (h === 1 ? 'לפני שעה' : `לפני ${h} שעות`) : `${h}h ago`; }
  return `${he ? 'נכון ל-' : 'as of '}${ddmm(localISO(new Date(t)))}`;
};

function FormDots({ form }) {
  return (
    <span style={{ display: 'inline-flex', gap: 3 }}>
      {(form || []).map((r, i) => (
        <span key={i} title={r === 'W' ? 'Win' : 'Loss'} style={{ width: 14, height: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: FN, fontSize: 9, fontWeight: 800, color: 'var(--c-stripTx)', background: r === 'W' ? '#37B27C' : '#DE4E3B' }}>{r}</span>
      ))}
    </span>
  );
}

function StandingsTable({ standings }) {
  const tr = useT();
  const heM = useHe();
  const cols = [
    // THE LEAGUE'S OWN WORDS IN HEBREW (27.9, Ohad: "use the same stat terms
    // as the league administration's site"): basket.co.il's standings read
    // מש' / נצ' / הפ' / סל זכות / סל חובה / הפרש.
    { k: 'gp', h: 'GP', he: 'GP' }, { k: 'w', h: 'W', he: 'W' }, { k: 'l', h: 'L', he: 'L' },
    { k: 'pf', h: 'PF', he: 'Points for' }, { k: 'pa', h: 'PA', he: 'Points against' }, { k: 'diff', h: '+/–', he: 'Difference' },
  ];
  const th = { fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.tm, padding: '8px 10px', textAlign: 'end', whiteSpace: 'nowrap' };
  // the league's own order (rank) until a header is tapped; Form = wins in it
  const sort = useSort(standings, {
    rank: { get: (s) => s.rank, asc: true },
    team: { get: (s) => s.team, asc: true },
    ...Object.fromEntries(cols.map((c) => [c.k, (s) => s[c.k]])),
    form: (s) => (s.form && s.form.length ? s.form.filter((r) => r === 'W').length : null),
  }, 'rank');
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 560 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.cardBd}` }}>
            <SortHeader as="th" k="rank" sort={sort} label="#" center style={{ ...th, textAlign: 'center', width: 34 }} />
            <SortHeader as="th" k="team" sort={sort} label={tr('Team')} style={{ ...th, textAlign: 'start' }} />
            {cols.map((c) => <SortHeader as="th" key={c.k} k={c.k} sort={sort} label={heM ? tr(c.he) : c.h} center style={{ ...th, textAlign: 'center' }} />)}
            <SortHeader as="th" k="form" sort={sort} label={tr('Form')} center style={{ ...th, textAlign: 'center' }} />
          </tr>
        </thead>
        <tbody>
          {sort.rows.map((s) => {
            const bh = isBH(s.team);
            const td = { fontFamily: FN, fontSize: 13, color: C.tx, padding: '9px 10px', textAlign: 'center', fontVariantNumeric: 'tabular-nums' };
            return (
              <tr key={s.team} className="bhbc-row" style={{ borderBottom: `1px solid ${C.cardBd}`, background: bh ? `color-mix(in srgb, ${NAVY} 8%, transparent)` : 'transparent', borderInlineStart: bh ? `3px solid ${ORANGE}` : '3px solid transparent' }}>
                <td style={{ ...td, fontWeight: 800, color: bh ? ORANGE_DEEP : C.td }}>{s.rank}</td>
                <td style={{ ...td, textAlign: 'start', fontWeight: bh ? 800 : 600, color: C.tx, whiteSpace: 'nowrap' }}>{s.team}</td>
                <td style={td}>{s.gp}</td>
                <td style={{ ...td, fontWeight: 700, color: '#2E9E6B' }}>{s.w}</td>
                <td style={{ ...td, color: C.td }}>{s.l}</td>
                <td style={td}>{s.pf}</td>
                <td style={td}>{s.pa}</td>
                <td style={{ ...td, fontWeight: 700, color: s.diff > 0 ? '#2E9E6B' : s.diff < 0 ? '#C9462F' : C.td }}>{s.diff > 0 ? '+' : ''}{s.diff}</td>
                <td style={{ ...td, padding: '9px 10px' }}><FormDots form={s.form} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Roster-driven: one row per CURRENT squad athlete, showing their official
// league stats (matched via LEAGUE_ALIAS) or dashes if they've no games yet.
// No departed players — the table IS the roster.
// THE CLUB'S OWN GAMES, NOT ONLY THE LEAGUE'S (27.9, Ohad: "there's 5 logged
// games ... it needs to be always updated. all the tables all around bhbc").
// Every game row logged this season (the box-score logger's rows carry the
// full line; a scrimmage logged by hand carries minutes). GP and MPG count
// every game; the box averages count the games that HAVE a box - stated under
// the table. Falls back to the league feed for a player with no logged game.
const clubSeasonStats = (t, loads) => {
  const now = new Date();
  const seasonStart = `${now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1}-08-01`;
  const rows = [];
  for (const [d, list] of Object.entries(((loads || {})[t.id] || {}).sessions || {})) {
    if (d < seasonStart) continue;
    for (const r of (list || [])) if (r && rowKind(r) === 'game') rows.push(r);
  }
  if (!rows.length) return null;
  const withBox = rows.filter((r) => r.box);
  const sum = (f) => withBox.reduce((a, r) => a + (Number(f(r.box)) || 0), 0);
  const nb = withBox.length;
  const avg = (v) => (nb ? +(v / nb).toFixed(1) : null);
  const tp = { m: sum((b) => (b.fg3 || b.tp || {}).m), a: sum((b) => (b.fg3 || b.tp || {}).a) };
  const ft = { m: sum((b) => (b.ft || {}).m), a: sum((b) => (b.ft || {}).a) };
  const min = rows.reduce((a, r) => a + (Number(r.min) || 0), 0);
  return {
    gp: rows.length, boxGames: nb, mpg: +(min / rows.length).toFixed(1),
    ppg: avg(sum((b) => b.pts)), rpg: avg(sum((b) => b.reb)), apg: avg(sum((b) => b.ast)),
    tpp: tp.a ? Math.round((tp.m / tp.a) * 100) : null, ftp: ft.a ? Math.round((ft.m / ft.a) * 100) : null,
    pirpg: avg(sum((b) => b.pir)),
  };
};

function PlayerStatsTable({ roster, league, onOpen, loads = null }) {
  const tr = useT();
  // Ohad: "it doesnt re-order the column based on up and down when i click on
  // the column headers." It sorted, but only ever DESCENDING - clicking the
  // active column did nothing and the arrow never flipped, so from his seat the
  // header was half dead. Clicking a new column starts descending (the useful
  // default for a stat); clicking the active one flips it. The zone's shared
  // useSort now (27.9), which also sorts the Player column A->Z / Z->A.
  const cols = [
    { k: 'gp', h: 'GP' }, { k: 'mpg', h: 'MPG' }, { k: 'ppg', h: 'PPG' },
    { k: 'rpg', h: 'RPG' }, { k: 'apg', h: 'APG' }, { k: 'tpp', h: '3P%' },
    { k: 'ftp', h: 'FT%' }, { k: 'pirpg', h: 'PIR' },
  ];
  const dash = (k, v) => (v == null ? '—' : k === 'tpp' || k === 'ftp' ? `${v}%` : v);
  // A player with no league stats has nothing to rank, so he sorts LAST in
  // BOTH directions. Letting him take the -1 would put every dash at the top of
  // an ascending sort, which answers nobody's question.
  // FIELD BY FIELD (27.9 review): GP and minutes come from every logged game;
  // a box figure the logged games do not carry (no boxed game yet) falls back
  // to the official league feed instead of reading as a dash.
  const merged = (t) => {
    const club = loads ? clubSeasonStats(t, loads) : null;
    const lg = leaguePlayerFor(league, t);
    if (!club) return lg;
    if (!lg) return club;
    const out = { ...club };
    for (const k of ['ppg', 'rpg', 'apg', 'tpp', 'ftp', 'pirpg']) if (out[k] == null && lg[k] != null) out[k] = lg[k];
    return out;
  };
  // jersey order in, so every tie (and every dash) stays in jersey order
  const items = (roster || []).map((t) => ({ t, s: merged(t) }))
    .sort((a, b) => (a.t.jersey ?? 999) - (b.t.jersey ?? 999));
  const sort = useSort(items, {
    name: { get: (x) => x.t.name, asc: true },
    ...Object.fromEntries(cols.map((c) => [c.k, (x) => (x.s ? x.s[c.k] : null)])),
  }, 'ppg');
  // ONE TABLE STYLE FOR THE ZONE (27.9, Ohad: "make the tables nicer, they're
  // badly designed"): a 36px header band on the surface tint, 40px rows on a
  // light hairline, numbers END-aligned in tabular figures so a column reads as
  // a column, the jersey muted, and colour for ONE thing only - the column the
  // table is sorted by (its cells tinted, its values bold). PPG used to be
  // orange whatever the sort, which put colour on the rule, not the exception.
  const th = (k, h, first) => (
    <SortHeader as="th" key={k} k={k} sort={sort} label={h} style={{ ...BHBC_TH, textAlign: first ? 'start' : 'end' }} />
  );
  return (
    <div className="bhbc-list" style={{ overflowX: 'auto' }}>
      {/* THE TABLE FILLS ITS SCROLLER (27.9, Ohad: "why the extra white space?
          useless"): index.html turns every table into display:block under
          769px, so the rows stopped at their content width inside a 620px box.
          display:table (themes.css .bhbc-stats-table) + the player column
          pinned while the numbers scroll. */}
      <table className="bhbc-stats-table bhbc-table" style={{ borderCollapse: 'collapse', width: '100%', minWidth: 620 }}>
        <thead><tr>{th('name', tr('Player'), true)}{cols.map((c) => th(c.k, tr(c.h)))}</tr></thead>
        <tbody>
          {sort.rows.map(({ t, s }) => {
            const td = { ...BHBC_TD, color: s ? C.tx : C.tm };
            const cell = (k) => (sort.key === k ? { ...td, ...BHBC_TD_SORTED } : td);
            return (
              <tr key={t.id} className="bhbc-row bhbc-trow" onClick={() => onOpen(t.id)} role="button" tabIndex={0} onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onOpen(t.id); } }} style={{ cursor: 'pointer' }}>
                <td style={{ ...cell('name'), textAlign: 'start', fontWeight: 700, color: C.tx, whiteSpace: 'nowrap' }}><span style={{ display: 'inline-block', width: 22, textAlign: 'end', color: C.tm, fontWeight: 700, marginInlineEnd: 12, fontVariantNumeric: 'tabular-nums' }}>{t.jersey ?? '—'}</span>{t.name}</td>
                {cols.map((c) => <td key={c.k} style={cell(c.k)}>{dash(c.k, s ? s[c.k] : null)}</td>)}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ONE GAME ROW FOR EVERY GAMES LIST (29.9 #411, Ohad: "can be way better
// designed"; #403 "the home tag ... vertically center aligned in between top and
// bottom borders, same for the left rows of the text"). The old rows were
// orange-boxed tables that repeated BNEI HERZLIYA on every line, with score and
// W/L chips. Now one grid everywhere: the date, a two-line block (the matchup,
// then competition · round · venue · time) and ONE end column - the result as
// coloured text, HOME/AWAY, or the minutes still to add. Rows sit between plain
// rules and everything in them is centred between the two.
function GameRow({ date, title, detail, end, onClick, dataKey }) {
  const clickable = !!onClick;
  return (
    <div onClick={onClick || undefined} role={clickable ? 'button' : undefined} tabIndex={clickable ? 0 : undefined} data-game-row={dataKey || ''}
      onKeyDown={clickable ? ((e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }) : undefined}
      className={clickable ? 'bhbc-row bhbc-game-row' : 'bhbc-game-row'}
      style={{ display: 'grid', gridTemplateColumns: '52px minmax(0, 1fr) auto', columnGap: 14, alignItems: 'center', minHeight: 54, padding: '9px 0', boxSizing: 'border-box', borderBottom: `1px solid ${C.cardBd}`, cursor: clickable ? 'pointer' : 'default' }}>
      <span dir="ltr" style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, color: C.td, fontVariantNumeric: 'tabular-nums', unicodeBidi: 'isolate', textAlign: 'start' }}>{date}</span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        <span style={{ fontFamily: FN, fontSize: 12.5, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: C.tx, overflowWrap: 'break-word', lineHeight: 1.2 }}>{title}</span>
        {/* segments, not one text run: a Hebrew competition beside an English
            venue let the bidi algorithm pull two separators together
            ("ליגת האלופות · · BADALONA") - each segment is its own box */}
        {detail ? <Segmented text={detail} style={{ fontFamily: FN, fontSize: 10, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.tm, lineHeight: 1.25 }} /> : null}
      </span>
      <span style={{ justifySelf: 'end', display: 'inline-flex', alignItems: 'center' }}>{end}</span>
    </div>
  );
}
// A section inside the Games card: a quiet label with its count, then a list
// whose last row draws no rule (#419).
function GameSection({ label, count, children, first = false }) {
  return (
    <div style={{ marginTop: first ? 0 : 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 36, boxSizing: 'border-box' /* a 19-21px header with its word 3px from the top (OCD #494): a 36px row, ink centred */, borderBottom: `1px solid ${C.cardBd}`, fontFamily: FN, fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.tx }}>
        {label}{count != null ? <span style={{ color: C.tm, fontVariantNumeric: 'tabular-nums' }}>· {count}</span> : null}
      </div>
      <div className="bhbc-list">{children}</div>
    </div>
  );
}
const HA_TEXT = (bhHome, tr) => <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 800, letterSpacing: '0.10em', textTransform: 'uppercase', color: bhHome ? 'var(--bhbc-ha-home)' : 'var(--bhbc-ha-away)', minWidth: 44, textAlign: 'end' }}>{bhHome ? tr('HOME') : tr('AWAY')}</span>;

function ResultsList({ games, bhbcOnly, fixtures = [], onPick = null }) {
  const tr = useT();
  const played = games.filter((g) => g.played && (!bhbcOnly || isBH(g.home) || isBH(g.away)));
  const todayStr = todayISO();
  // A GAME ROW OPENS ITS GAME (27.9, Ohad: "all tables ... clickable"): a game
  // that has been played and is on the club calendar opens the same minutes
  // sheet the Minutes played list opens - who played and for how long. A game
  // still ahead, or one the calendar never held, has nothing to open.
  const fxOf = (g) => (onPick && g.date && g.date <= todayStr
    ? (fixtures || []).find((f) => f && f.date === g.date && (f.type === 'game' || f.type === 'scrimmage')) || null : null);
  // THE NEXT GAME FIRST, ALWAYS (#305 C9). These arrive in the order the
  // fixture store holds them, which is the order they were synced or typed -
  // a cup tie added by hand landed at the bottom of the list it should head.
  const upcoming = games.filter((g) => !g.played && (!g.date || g.date >= todayStr) && (!bhbcOnly || isBH(g.home) || isBH(g.away)))
    .sort((a, b) => `${a.date || '9999'}${a.time || ''}`.localeCompare(`${b.date || '9999'}${b.time || ''}`));
  // RESULTS GROUPED BY COMPETITION (#411), newest game first inside each and the
  // competition with the newest game first. The round (or a playoff's stage -
  // a playoff game has no "מחזור N") moves into the row's detail line, and a
  // round the feed never gave is simply not claimed (the old "Round NaN").
  const compOf = (g) => (g.comp ? tr(g.comp) : g.stage ? tr(g.stage) : tr('League'));
  const groups = [];
  [...played].sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).forEach((g) => {
    const k = compOf(g);
    let grp = groups.find((x) => x.k === k);
    if (!grp) { grp = { k, games: [] }; groups.push(grp); }
    grp.games.push(g);
  });
  const roundOf = (g) => (g.stage && g.comp ? tr(g.stage) : (g.round != null && Number.isFinite(Number(g.round)) ? `${tr('Round')} ${g.round}` : null));
  const side = (g) => {
    // Every visible row involves BHBC (bhbcOnly); read it from BHBC's side.
    const bhHome = isBH(g.home);
    return { bhHome, opp: g.oppName || (bhHome ? g.away : g.home) };
  };
  if (!played.length && !upcoming.length) return <div style={{ fontFamily: FB, fontSize: 13, color: C.td, padding: '16px 0', textAlign: 'center' }}>{tr('No games yet.')}</div>;
  return (
    <div>
      {upcoming.length > 0 && (
        <GameSection label={tr('Upcoming')} count={upcoming.length} first>
          {upcoming.slice(0, 8).map((g, i) => {
            const { bhHome, opp } = side(g);
            const time = g.timeTBD ? tr('TBD') : g.time;
            return <GameRow key={i} dataKey={g.date} date={g.date ? ddmm(g.date) : ''} title={`${bhHome ? tr('vs') : '@'} ${opp}`}
              detail={[tr(g.comp), g.venue && tr(g.venue), time].filter(Boolean).join(' · ')}
              end={g.homeKnown === false ? null : HA_TEXT(bhHome, tr)} />;
          })}
        </GameSection>
      )}
      {groups.map((grp, gi) => (
        <GameSection key={grp.k} label={grp.k} count={grp.games.length} first={!upcoming.length && gi === 0}>
          {grp.games.map((g, i) => {
            const { bhHome, opp } = side(g);
            const us = bhHome ? g.hs : g.as, them = bhHome ? g.as : g.hs;
            const won = us > them;
            const fx = fxOf(g);
            return <GameRow key={i} dataKey={g.date} date={g.date ? ddmm(g.date) : ''} title={`${bhHome ? tr('vs') : '@'} ${opp}`}
              detail={[roundOf(g), g.venue && tr(g.venue), bhHome ? tr('HOME') : tr('AWAY')].filter(Boolean).join(' · ')}
              onClick={fx ? () => onPick(fx) : null}
              end={(
                <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 10, fontFamily: FN, fontVariantNumeric: 'tabular-nums' }}>
                  <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', color: won ? '#2E9E6B' : '#C9462F', minWidth: 12, textAlign: 'center' }}>{won ? tr('W') : tr('L')}</span>
                  <span dir="ltr" style={{ fontSize: 14, fontWeight: 800, color: C.tx, unicodeBidi: 'isolate', minWidth: 62, textAlign: 'end' }}>{us}<span style={{ color: C.tm, margin: '0 3px' }}>–</span>{them}</span>
                </span>
              )} />;
          })}
        </GameSection>
      ))}
    </div>
  );
}

// Convert BHBC fixtures (club schedule) into result-row shape so upcoming games
// show in the Games tab even before basket.co.il has any score for them.
function fixturesToGames(fixtures) {
  // A SCRIMMAGE with a scoreline is a played game too. basket.co.il never sees
  // a prep game, so the only source is the printed box score he is handed at
  // the table - and until now the zone had nowhere to put it: he sent two and
  // both results were invisible. A scrimmage that has one shows in the results
  // under its own PRE-SEASON heading; one that has none stays out of the list
  // entirely, exactly as before.
  const scored = (f) => Number.isFinite(f.us) && Number.isFinite(f.them);
  return (fixtures || []).filter((f) => f.type === 'game' || (f.type === 'scrimmage' && scored(f))).map((f) => {
    const bhHome = f.home !== false;
    const done = scored(f);
    return {
      round: null, stage: f.type === 'scrimmage' ? 'Pre-season' : undefined,
      date: f.date, time: f.start, comp: f.comp || (f.type === 'scrimmage' ? 'Pre-season' : undefined),
      home: bhHome ? 'Bnei Herzliya' : (f.opponent || zoneT('TBD')),
      away: bhHome ? (f.opponent || zoneT('TBD')) : 'Bnei Herzliya',
      // null means the coach picked "—": the venue is genuinely unknown, so
      // downstream must not paint a HOME/AWAY chip for it.
      homeKnown: f.home === true || f.home === false,
      hs: done ? (bhHome ? f.us : f.them) : null,
      as: done ? (bhHome ? f.them : f.us) : null,
      played: done, timeTBD: f.timeTBD, venue: f.venue, travel: f.travel,
    };
  });
}

function LeagueView({ league, roster, fixtures, onOpen, bhbcLoads = {}, today, onPickMinutes }) {
  const tr = useT();
  const heL = useHe();
  const leagueGames = Array.isArray(league.games) ? league.games : [];
  const playedGames = leagueGames.filter((g) => g.played).map((g) => { const o = calendarOpp(fixtures, g.date); return o ? { ...g, oppName: o } : g; });
  // A season whose every game is already played is HISTORICAL (last season) —
  // don't badge it "Live". A season with any unplayed game is in progress.
  const historical = leagueGames.length > 0 && playedGames.length === leagueGames.length;
  // Merge: played results from basket.co.il + upcoming from the club fixtures.
  const upcomingFx = fixturesToGames(fixtures).filter((g) => !playedGames.some((p) => p.date === g.date));
  const allGames = [...playedGames, ...upcomingFx];
  const hasStats = (league.players || []).length > 0 || playedGames.length > 0;
  // Which season are we actually in? (Israeli basketball season spans ~Aug→May.)
  const now = new Date();
  // AUGUST, like every other season reader in the zone (#305 N-E5): this one
  // alone rolled over in July, so for a month the Games tab called a season
  // current that the history and the player stats did not.
  const startYr = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  const currentSeason = `${startYr}/${String((startYr + 1) % 100).padStart(2, '0')}`;
  const seasonNorm = (s) => String(s || '').replace(/\s+/g, '');
  // The stored league numbers belong to a PAST season if their tag ≠ the current one.
  // In that case this season hasn't started — show a pre-season state, not last year's
  // figures dressed up as "live". (Ohad: "only see stats from this year".)
  const pastData = !!league.season && seasonNorm(league.season) !== seasonNorm(currentSeason);
  const t = league.team || {};
  const played = t.gp || 0;
  const showCurrent = played && !pastData;
  const summary = [
    { k: tr('Record'), v: played ? `${t.w}–${t.l}` : '—', c: C.tx },
    { k: tr('Points'), v: played ? t.ppg : '—', sub: tr('per game'), c: C.tx },
    { k: tr('Allowed'), v: played ? t.oppg : '—', sub: tr('per game'), c: C.tx },
    { k: tr('Margin'), v: played ? `${(t.ppg - t.oppg) > 0 ? '+' : ''}${(t.ppg - t.oppg).toFixed(1)}` : '—', c: played && (t.ppg - t.oppg) >= 0 ? '#2E9E6B' : played ? '#C9462F' : C.tx },
  ];
  return (
    <>
      {/* Team stats + live badge */}
      <Card padding={14} leftStripe={ORANGE} header={secTitle('Team Stats')} headerRight={
        pastData
          ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.tm }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: '#7C828B' }} />{currentSeason} · {tr('Pre-season')}</span>
          : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--c-stripTx)' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: historical ? '#7C828B' : '#4ED88A' }} />{historical ? tr('Last season') : tr('Live')}{league.season ? ` · ${league.season}` : ''}{league.updatedAt ? ` · ${relTime(league.updatedAt, heL)}` : ''}</span>
      }>
        {showCurrent ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
            {summary.map((s, i) => (
              <div key={s.k} style={{ padding: '14px 18px', borderInlineStart: i ? `1px solid ${C.cardBd}` : 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.tm }}>{s.k}</div>
                <div dir="ltr" style={{ fontFamily: FN, fontWeight: 800, fontSize: 26, lineHeight: 1, color: s.c, fontVariantNumeric: 'tabular-nums', unicodeBidi: 'isolate', textAlign: 'start' }}>{s.v}</div>
                {s.sub && <div style={{ fontFamily: FN, fontSize: 9, color: C.td, letterSpacing: '0.04em' }}>{s.sub}</div>}
              </div>
            ))}
          </div>
        ) : pastData ? (
          <>
            <div style={{ fontFamily: FB, fontSize: 13, color: C.td, padding: '2px 2px 14px' }}>{tr('The {season} season has not started yet.').replace('{season}', currentSeason)}</div>
            <CollapsibleSection domId="bhbc-lastseason-team" storageKey="bhbc-lastseason-team" defaultOpen={false} title={`${league.season} · ${tr('Last season')}`} bare padX={0}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
                {summary.map((s, i) => (
                  <div key={s.k} style={{ padding: '14px 18px', borderInlineStart: i ? `1px solid ${C.cardBd}` : 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.tm }}>{s.k}</div>
                    <div dir="ltr" style={{ fontFamily: FN, fontWeight: 800, fontSize: 26, lineHeight: 1, color: s.c, fontVariantNumeric: 'tabular-nums', unicodeBidi: 'isolate', textAlign: 'start' }}>{s.v}</div>
                    {s.sub && <div style={{ fontFamily: FN, fontSize: 9, color: C.td, letterSpacing: '0.04em' }}>{s.sub}</div>}
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          </>
        ) : (
          <div style={{ fontFamily: FB, fontSize: 13, color: C.td, padding: '6px 2px' }}>{tr('No games played yet this season — team stats fill in automatically after tip-off.')}</div>
        )}
      </Card>

      {/* Player stats — the roster, with official league numbers */}
      <Card padding={14} leftStripe={NAVY} header={secTitle('Player Stats')} headerRight={pastData ? null : <span style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--c-stripTx)' }}>{tr('tap a column to sort')}</span>}>
        {pastData ? (
          <>
            <div style={{ fontFamily: FB, fontSize: 13, color: C.td, padding: '2px 2px 14px' }}>{tr('No {season} games played yet — per-player league numbers appear here after tip-off.').replace('{season}', currentSeason)}</div>
            <CollapsibleSection domId="bhbc-lastseason-players" storageKey="bhbc-lastseason-players" defaultOpen={false} title={`${league.season} · ${tr('Last season')}`} bare padX={0}>
              <PlayerStatsTable roster={roster} league={league} onOpen={onOpen} />
            </CollapsibleSection>
          </>
        ) : (
          <>
            <PlayerStatsTable roster={roster} league={league} onOpen={onOpen} loads={bhbcLoads} />
            <div style={{ fontFamily: FB, fontSize: 11, color: C.td, marginTop: 8 }}>{tr('Every game logged this season - GP and minutes count them all; points, rebounds, assists and shooting come from the games with a box score (league, basket.co.il). Tap an athlete for his games.')}</div>
          </>
        )}
      </Card>

      {/* Games — BHBC only. In a fresh season, lead with this season's fixtures and
          tuck last season's completed results into a collapse. */}
      <Card padding={14} leftStripe={NAVY} header={secTitle('Games')}>
        {/* MINUTES PLAYED -> LOAD. Until now a 32-minute game and a DNP were
            identical to the load board, so every ACWR figure in the zone was
            computed on a week with its biggest day missing. */}
        <GameMinutesList fixtures={fixtures} today={today} bhbcLoads={bhbcLoads} onPick={onPickMinutes} />
        {pastData ? (
          <>
            {upcomingFx.length ? <ResultsList games={upcomingFx} bhbcOnly fixtures={fixtures} onPick={onPickMinutes} /> : <div style={{ fontFamily: FB, fontSize: 13, color: C.td, padding: '14px 0', textAlign: 'center' }}>{tr('Fixtures load as the league publishes them.')}</div>}
            {playedGames.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <CollapsibleSection domId="bhbc-lastseason-games" storageKey="bhbc-lastseason-games" defaultOpen={false} title={`${league.season} · ${tr('Last season results')}`} bare padX={0}>
                  <ResultsList games={playedGames} bhbcOnly fixtures={fixtures} onPick={onPickMinutes} />
                </CollapsibleSection>
              </div>
            )}
          </>
        ) : (
          allGames.length ? <ResultsList games={allGames} bhbcOnly fixtures={fixtures} onPick={onPickMinutes} /> : <div style={{ fontFamily: FB, fontSize: 13, color: C.td, padding: '14px 0', textAlign: 'center' }}>{tr('Fixtures load as the league publishes them.')}</div>
        )}
      </Card>
    </>
  );
}

// ============================ MEDICAL / INJURY ============================
// The pain the board shows is the LATEST report: the newest rehab-progress
// entry that carries a pain score (progress is newest-first), else the score
// written on the injury itself. Ohad 13.9: the injury said 1, the 12.9
// progress line said 9, and the board still printed 1.
function latestPain(inj) {
  const p = (inj && inj.progress || []).find((x) => x && x.pain != null && x.pain !== '');
  if (p) return p.pain;
  return inj && inj.pain != null && inj.pain !== '' ? inj.pain : null;
}
// A shared record for Ohad + the physical therapist: injuries, current status,
// pain, return-to-play target and a dated rehab-progress log per athlete.
// An injury's side is Left / Right / Bilateral. In English the first letter
// is enough ("KNEE R"); in Hebrew a lone Latin letter is noise, so the word
// itself is used - ברך ימין.
function sideTag(side, tr) {
  if (!side || side === 'N/A') return '';
  const w = tr(side);
  return ' ' + (/[֐-׿]/.test(w) ? w : side[0]);
}
const MED_STATUS = {
  available: { label: 'Available', color: '#37B27C' },
  // color paints DOTS, text paints WORDS. Raw amber measures 2.15:1 on
  // white - the light-mode token is the same amber darkened to stay legible.
  limited: { label: 'Limited', color: '#E0A73A', text: 'var(--bhbc-amber-text, #E0A73A)' },
  'non-contact': { label: 'Non-contact', color: '#4F9DE0' },
  out: { label: 'Out', color: '#DE4E3B' },
};
const medText = (st) => { const m = MED_STATUS[st] || {}; return m.text || m.color || '#DE4E3B'; };
const BODY_PARTS = ['Ankle', 'Knee', 'Hip', 'Hamstring', 'Groin', 'Quad', 'Calf', 'Achilles', 'Lower back', 'Shoulder', 'Elbow', 'Wrist', 'Hand', 'Foot', 'Head / Concussion', 'Other'];
// Concussion is a TYPE, not just a body part. 'Head / Concussion' was already
// in BODY_PARTS, so the only way to record one was to file it as a Contusion or
// an 'Other' - which then read on the board like any soft-tissue knock and got
// the same load-progression ladder, which is the wrong management entirely.
const INJURY_TYPES = ['Strain', 'Sprain', 'Contusion', 'Concussion', 'Tendinopathy', 'Overuse', 'Fracture', 'Dislocation', 'Illness', 'Other'];
// A head injury has no side and no left/right, and asking for one invites a
// wrong answer in the record.
// One surname helper. Ohad calls the squad by last names, and on a phone the
// given name is the difference between a one-line row and a two-line one.
const surnameOf = (n) => { const p = String(n || '').trim().split(/\s+/); return p[p.length - 1] || n; };
const isConcussion = (inj) => /concussion/i.test((inj && (inj.type || '')) || '')
  || /^head/i.test((inj && (inj.bodyPart || '')) || '');
// A medical status expressed on the availability scale (1 full -> 4 out).
// Shared by saveInjury (which mirrors it onto the day it is saved) and the
// roster rows (which floor today's availability by any ACTIVE injury).
const MEDICAL_STATUS_AVAIL = { available: 1, limited: 2, 'non-contact': 3, out: 4 };
// Who wrote a record, in a form a coach recognises. The BHBC staff are a
// known, tiny set, so this stays a formatting rule rather than a directory:
// local part of the address, trailing digits dropped, title-cased.
export function byName(email) {
  // the owner is "Ohad", not his mailbox ("Ohadyproductions" in every history row)
  if (isOwnerEmail(String(email || ''))) return 'Ohad';
  const s = String(email || '').split('@')[0].replace(/[0-9._-]+$/, '').replace(/[._-]+/g, ' ').trim();
  if (!s) return '';
  return s.split(' ').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
}

const activeInjuries = (medical, id) => ((medical[id] || {}).injuries || []).filter((i) => !i.resolved);
// THE ONE INJURY A ONE-LINE SLOT SHOWS IS THE WORST (#305 N-C18): the board
// line, its MED button and the roster card took whichever record was filed
// first, so a limited ankle could stand in for an out hamstring. Same order as
// the Medical tab: out, non-contact, limited, available; then the oldest.
const INJ_SEV = { out: 0, 'non-contact': 1, limited: 2, available: 3 };
const worstInjury = (medical, id) => activeInjuries(medical, id).slice()
  .sort((a, b) => (INJ_SEV[a.status] ?? 4) - (INJ_SEV[b.status] ?? 4) || String(a.onsetDate || '').localeCompare(String(b.onsetDate || '')))[0] || null;
const resolvedInjuries = (medical, id) => ((medical[id] || {}).injuries || []).filter((i) => i.resolved);

// WHAT THE MEDICAL RECORD SAYS ABOUT A GIVEN DAY — not only about today.
//
// Ohad, after I had to set two athletes Out by hand for 19.09 and 20.09: "lmk
// how it will be systematic that when someone is medically out and is out of
// practice logged".
//
// It was not systematic, and this is exactly why. Saving an injury mirrors its
// status onto ONE date — the day the coach pressed save — and every other read
// in the zone fell back to `availability[date] || 1`, which is Full. Five call
// sites floored by the medical record only when the date happened to BE today:
// the roster rows, the weight-room month grid, the squad-wide practice log, the
// practice sheet's prefill and the past-practice reader. So an injury filed
// after the session, or a practice backdated to a day inside an injury, logged
// the athlete as having trained straight through it.
//
// One function answers it for ANY date. An unresolved injury covers every day
// from its onset onwards; a resolved one covers onset through the last thing
// written about it. The status in effect on that day is the last dated progress
// note at or before it, falling back to the record's own status.
function medicalAvailOn(medical, athleteId, date) {
  const injuries = ((medical || {})[athleteId] || {}).injuries || [];
  let worst = 1;
  for (const inj of injuries) {
    if (!inj) continue;
    if (inj.onsetDate && date < inj.onsetDate) continue;   // it had not happened yet
    const notes = (inj.progress || []).filter((p) => p && p.date)
      .slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
    if (inj.resolved) {
      // No resolution DATE is stored on the record, so the last note written
      // about it is the best evidence of when it ended; updatedAt is the
      // fallback. Getting this wrong only ever shortens a window, never
      // invents one, so a cleared athlete is never left stuck at Out.
      const endedOn = (notes.length ? notes[notes.length - 1].date : '')
        || localDayOf(inj.updatedAt);
      if (endedOn && date > endedOn) continue;
    }
    // WHICH STATUS WAS IN FORCE ON THAT DAY.
    //
    // Two kinds of dated evidence, and the newest one at or before the day wins:
    // the progress notes, and the record's own headline `status`, which is
    // dated by updatedAt. One real record proves both are needed —
    // its notes run non-contact → limited → available → limited (12.09) but the
    // headline was set to OUT on 15.09. Reading the notes alone made him
    // Limited on 19.09 and 20.09; reading the headline alone would have made
    // him Out on 12.09, when the note says he was Limited. Ordered by date,
    // both are right on their own day.
    //
    // A note dated AFTER the day describes a later state of the injury and says
    // nothing about it, so it is excluded either way.
    // A RESOLVED record's headline is its CLEARANCE, so it is dated at the
    // end (updatedAt, else the last note) - never at the onset. Without an
    // updatedAt it fell back to onsetDate, the clearance landed on day one and
    // the whole injury window read Full (29.9: verify-medical-out, revived,
    // caught it - it had been dead since this function started calling
    // localDayOf). No end date = no headline evidence.
    const headlineOn = inj.resolved
      ? (localDayOf(inj.updatedAt) || (notes.length ? notes[notes.length - 1].date : ''))
      : (localDayOf(inj.updatedAt || inj.createdAt) || inj.onsetDate || '');
    const dated = notes.filter((p) => p.status).map((p) => ({ d: p.date, s: p.status }));
    // A RESOLVED RECORD'S HEADLINE IS THE CLEARANCE (#305 B12). Resolving keeps
    // the status the PT last picked (often still "out"), and dated at updatedAt
    // that status held the athlete OUT for the whole day he was cleared - the
    // board, the grids and the S&C sheet all still read him out until
    // midnight. On and after the day it was closed, a resolved record says
    // available; every day before keeps its own evidence.
    if (inj.status && headlineOn) dated.push({ d: headlineOn, s: inj.resolved ? 'available' : inj.status, headline: true });
    // Equal dates: the headline is the current state, so it sorts last and wins.
    dated.sort((a, b) => String(a.d).localeCompare(String(b.d)) || (a.headline ? 1 : 0) - (b.headline ? 1 : 0));
    const prior = dated.filter((p) => p.d <= date).pop();
    worst = Math.max(worst, MEDICAL_STATUS_AVAIL[(prior && prior.s) || inj.status] || 1);
  }
  return worst;
}

// The availability to ACT on for one athlete on one date: the coach's own entry
// for that day, never better than the medical record. Same Math.max rule the
// roster rows already applied to today — a daily chip can make a day worse, it
// can never overrule the medical fact and make it better.
function availOn(rec, medical, athleteId, date) {
  return Math.max(Number(((rec && rec.availability) || {})[date]) || 1, medicalAvailOn(medical, athleteId, date));
}

// LOAD x MEDICAL - the one cross-check the zone was missing.
//
// The load board knows a 7-day load. The medical board knows he came back from
// an ankle six days ago. Neither knew both, so the most predictable re-injury
// pattern in team sport was invisible in a zone holding all the data.
//
// It renders NOTHING when there is nothing to say. An alert that is always on
// screen stops being an alert.
function ReturnLoadAlert({ roster, loads, medical, today, onOpen }) {
  const tr = useT();
  const flags = React.useMemo(
    () => returnToLoadFlags({ roster: roster || [], loads: loads || {}, medical: medical || {}, today }),
    [roster, loads, medical, today],
  );
  if (!flags.length) return null;
  return (
    // The zone's own card, like every other BHBC card. It used
    // <RefinedHeaderStrip title=… />, which was never imported (and takes no
    // title prop): the first time an athlete tripped the ramp this threw a
    // ReferenceError and the error boundary replaced the whole zone. ESLint's
    // no-undef does not see JSX tags; react/jsx-no-undef now does.
    <Card padding={14} leftStripe={C.rd} header={secTitle('Back from injury, loading too fast')} style={{ marginBottom: 14 }}>
      <div>
        {flags.map((f) => (
          <button key={f.id} onClick={() => onOpen && onOpen(f.id)}
            style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', gap: 10,
              width: '100%', textAlign: 'start', background: 'transparent', border: 'none', borderTop: '1px solid ' + C.ln,
              padding: '8px 0', cursor: onOpen ? 'pointer' : 'default', color: C.tx }}>
            <span style={{ minWidth: 0 }}>
              <span style={{ fontWeight: 700 }}>{f.name}</span>
              <span style={{ color: C.td }}>
                {' \u00B7 '}{tr('back')} {f.daysBack} {tr('days')}
                {f.bodyPart ? ' \u00B7 ' + tr(f.bodyPart) : ''}
              </span>
              <div dir="ltr" style={{ fontFamily: FN, fontSize: 11.5, color: C.td, marginTop: 2, unicodeBidi: 'isolate' }}>
                {f.weekLoad} AU {tr('this week')} {'\u00B7'} {f.pct}% {tr('of his own pre-injury week')} ({f.baseline} AU) {'\u00B7'} {tr('guide')} {f.cap}%
              </div>
            </span>
            <span style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
              color: f.severity === 'high' ? C.rd : C.or, border: '1px solid ' + (f.severity === 'high' ? C.rd : C.or),
              height: 22, boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              padding: '0 8px', lineHeight: 1, flexShrink: 0 }}>
              {f.severity === 'high' ? tr('CUT TODAY') : tr('WATCH')}
            </span>
          </button>
        ))}
      </div>
    </Card>
  );
}

// Played BHBC games, most recent first, each opening the minutes editor.
// Shows at a glance which games still have no minutes recorded, because a game
// nobody logged is a hole in every load number that week.
function GameMinutesList({ fixtures, today, bhbcLoads, onPick }) {
  const tr = useT();
  // A GAME THAT HAS NOT TIPPED OFF HAS NO MINUTES TO ADD (#305 N-I2): today's
  // 19:00 game sat here all afternoon asking for them. A start not on the
  // calendar yet cannot be judged, so that one stays.
  const nowD = new Date();
  const nowHHMM = `${String(nowD.getHours()).padStart(2, '0')}:${String(nowD.getMinutes()).padStart(2, '0')}`;
  const games = React.useMemo(() => (fixtures || [])
    // a CANCELLED game has no minutes to add either (1.10 code review: a cancelled scrimmage
    // sat here as ADD MINUTES forever and its "N to add" never cleared)
    .filter((f) => f && !isCancelled(f) && (f.type === 'game' || f.type === 'scrimmage') && f.date && (f.date < today || (f.date === today && (!f.start || f.start <= nowHHMM))))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 8), [fixtures, today, nowHHMM]);
  if (!games.length) return null;
  // THE SAME ROW AS EVERY OTHER GAME (#411): date, the matchup over its kind,
  // and one end column - "9 LOGGED" once done, ADD MINUTES (the one thing still
  // to do, in the zone's action orange) until then. Words wrap whole, never cut
  // (19.9), and every row has the same two lines (27.9).
  const todo = games.filter((g) => !Object.values(gameMinutesOf(bhbcLoads || {}, g.date)).some((m) => Number(m) > 0)).length;
  return (
    <div style={{ marginBottom: 18 }}>
      <GameSection label={tr('Minutes played')} count={todo ? `${todo} ${tr('to add')}` : null} first>
        {games.map((g) => {
          const mins = gameMinutesOf(bhbcLoads || {}, g.date);
          const n = Object.values(mins).filter((m) => Number(m) > 0).length;
          return (
            <GameRow key={`${g.date}|${g.opponent || ''}`} dataKey={g.date} onClick={() => onPick(g)} date={ddmm(g.date)}
              title={g.opponent ? `${g.home === false ? '@' : tr('vs')} ${g.opponent}` : tr(FX_LABEL[g.type] || 'Game')}
              detail={[tr(FX_LABEL[g.type] || (g.type === 'scrimmage' ? 'Scrimmage' : 'Game')), g.comp && tr(g.comp)].filter(Boolean).join(' · ')}
              end={(
                <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                  color: n ? C.tm : ORANGE, border: n ? 'none' : '1px solid ' + ORANGE,
                  height: 'var(--btn-h)', boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  padding: n ? 0 : '0 12px', lineHeight: 1, whiteSpace: 'nowrap' }}>
                  {n ? `${n} ${tr('logged')}` : tr('ADD MINUTES')}
                </span>
              )} />
          );
        })}
      </GameSection>
    </div>
  );
}

// MINUTES PLAYED, PER ATHLETE. No game RPE: Ohad, 23.9, "i never asked for a
// team rpe to exist" / "remember i dont need team rpes", and a game RPE is a
// team RPE. The field used to DEFAULT to 8 and write that invented number into
// every athlete's record. Minutes played are an official fact and they stay.
function GameMinutesModal({ game, roster, bhbcLoads, medical = {}, onClose, onSave }) {
  const tr = useT();
  const date = game.date;
  // what the sheet OPENED with - the save compares against this, not against
  // the store at save time, or a game row the league logger wrote while the
  // sheet was open would read as "cleared" and be deleted (27.9 review)
  const [opened] = useState(() => gameMinutesOf(bhbcLoads || {}, date));
  const [mins, setMins] = useState(() => {
    const out = {};
    for (const t of roster || []) out[t.id] = opened[t.id] == null ? '' : String(opened[t.id]);
    return out;
  });
  const total = Object.values(mins).reduce((a, m) => a + (Number(m) || 0), 0);
  const played = Object.values(mins).filter((m) => Number(m) > 0).length;
  // 60 is a full game with overtime; more is a typo, not minutes (27.9 #305 F1)
  const badMins = Object.values(mins).some((m) => Number(m) > 60 || Number(m) < 0);
  return (
    <BModal open guard onClose={onClose} wide title={<>{tr('Minutes played')}<span className="bm-lead"> {'\u00B7'} {game.opponent ? tr('vs') + ' ' + game.opponent : tr('Game')}</span></>}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 12, padding: '10px 12px', border: '1px solid ' + C.cardBd, background: 'var(--c-sf)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6, fontFamily: FN, fontSize: 11, color: C.td, marginInlineStart: 'auto' }}>
          <b style={{ color: C.tx, fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>{played}</b><span>{tr('played')}</span>
          <span style={{ opacity: 0.5 }}>·</span>
          <b style={{ color: C.tx, fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>{total}</b><span>{tr('min total')}</span>
        </span>
      </div>
      <div style={{ maxHeight: '46vh', overflowY: 'auto', border: '1px solid ' + C.cardBd }}>
        {(roster || []).map((t, i) => {
          const v = mins[t.id] ?? '';
          const on = Number(v) > 0;
          return (
            <div key={t.id} style={{ display: 'grid', gridTemplateColumns: 'var(--bhbc-gm-cols, 34px minmax(120px, 260px) 84px 60px)', justifyContent: 'start', alignItems: 'center', gap: 10, padding: '0 12px', height: 40, borderTop: i ? '1px solid ' + C.cardBd : 'none', background: on ? 'transparent' : 'color-mix(in srgb, var(--c-sf) 60%, transparent)' }}>
              <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, color: C.tm, fontVariantNumeric: 'tabular-nums' }}>{t.jersey != null ? t.jersey : ''}</span>
              <span style={{ minWidth: 0, whiteSpace: 'normal', overflowWrap: 'normal', fontFamily: FN, fontSize: 12, fontWeight: 700, color: on ? C.tx : C.td }}>{t.name || t.id}</span>
              <input type="number" min="0" max="60" inputMode="numeric" placeholder="—" aria-label={tr('Minutes played')}
                value={v} onChange={(e) => setMins((p) => ({ ...p, [t.id]: e.target.value }))}
                style={{ width: '100%', height: 'var(--btn-h)', boxSizing: 'border-box', background: 'var(--c-bg)', border: '1px solid ' + (Number(v) > 60 || Number(v) < 0 ? '#DE4E3B' : on ? ORANGE : C.ln), color: C.tx, fontFamily: FN, fontSize: 13, fontWeight: 800, textAlign: 'center', padding: 0 }} />
              {/* minutes for a player the day's record has OUT are said, not
                  hidden (#305 F4): the save keeps the minutes and notes the clash */}
              {(() => { const clash = on && availOn((bhbcLoads || {})[t.id], medical, t.id, date) >= 4; return <span title={clash ? tr('Marked out on this date - the minutes win for the day') : undefined} style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: clash ? '#DE4E3B' : on ? ORANGE_DEEP : C.tm }}>{clash ? tr('was out') : on ? tr('min') : tr('DNP')}</span>; })()}
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
        <Btn variant="ghost" onClick={onClose}>{tr('Cancel')}</Btn>
        <Btn disabled={badMins} onClick={() => onSave({ date, minutes: mins, opened })}>{tr('Save')}</Btn>
      </div>
    </BModal>
  );
}

// COLOUR IS SIGNAL, NOT PAINT - the locked BHBC rule, and this pill was breaking
// it: a 13% tint fill and a 38% coloured border, so the medical board read as a
// row of filled amber/red/green boxes. The rule says a status is a small
// coloured DOT plus a calm muted label. The dot keeps the colour; the box does
// not. minWidth 96 so OUT and NON-CONTACT are the same box down the column.
function StatusPill({ status, small, full }) {
  const tr = useT();
  const s = MED_STATUS[status] || MED_STATUS.available;
  const exc = !!MED_STATUS[status] && status !== 'available';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, height: 'var(--btn-h)', boxSizing: 'border-box', width: full ? '100%' : undefined, minWidth: full ? undefined : 96, padding: '0 9px', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.tx, background: exc ? `color-mix(in srgb, ${s.color} 12%, transparent)` : 'var(--c-sf)', border: exc ? `1px solid color-mix(in srgb, ${s.color} 45%, transparent)` : `1px solid ${C.cardBd}`, borderRadius: 0, whiteSpace: 'nowrap' }}>
      {/* tinted by status like the load board's chips, and like them ONLY for the
          exceptions (27.9: "colour only the exceptions") - AVAILABLE is plain */}
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.color, flexShrink: 0 }} />{tr(s.label)}
    </span>
  );
}


// Ohad 2026-08-28: "make sure the medical stuff has an output of rpe x time of
// practice in minutes and display it where-ever it needs to be displayed, so
// any other coach can see."
//
// This is session load (Foster sRPE): RPE x minutes, in AU. acwrEngine has
// computed it since the load board shipped, but only ever showed the RATIO it
// feeds — a PT looking at an injured player could not see the actual load that
// player is taking. The arithmetic is written out ("7 x 60 = 420 AU") rather
// than just the product, because the point is that a coach can check it.
//
// Injured athletes sort first: on the medical board they are the reason
// anyone opens this card.
function lastSessionOf(loads, id) {
  const rec = loads[id];
  if (!rec || !rec.sessions) return null;
  const dates = Object.keys(rec.sessions).filter((d) => (rec.sessions[d] || []).length).sort();
  if (!dates.length) return null;
  const date = dates[dates.length - 1];
  const rowsForDay = rec.sessions[date];
  // The last row of the most recent day that actually carries load. A gym
  // session is minutes-only by Ohad's rule (no RPE ever), so it has no load
  // and is not what this card is reporting.
  const withLoad = rowsForDay.filter((r) => Number(r.load) > 0);
  const r = withLoad.length ? withLoad[withLoad.length - 1] : null;
  return r ? { date, minutes: Number(r.min ?? r.minutes) || null, rpe: Number(r.rpe) || null, load: Math.round(Number(r.load)) } : null;
}

function LoadOutputCard({ rows, loads, medical }) {
  const tr = useT();
  const ordered = [...rows].sort((a, b) => {
    const ai = activeInjuries(medical, a.t.id).length > 0 ? 0 : 1;
    const bi = activeInjuries(medical, b.t.id).length > 0 ? 0 : 1;
    if (ai !== bi) return ai - bi;
    return (b.acwr.acute || 0) - (a.acwr.acute || 0);
  });
  const any = ordered.some((r) => (r.acwr.acute || 0) > 0 || lastSessionOf(loads, r.t.id));
  return (
    <Card padding={14} leftStripe={NAVY} header={secTitle('Session load · RPE x minutes')}
      headerRight={<span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--c-stripTx)' }}>AU</span>}>
      {!any ? (
        <div style={{ fontFamily: FB, fontSize: 13, color: C.td, padding: '10px 0', textAlign: 'center' }}>{tr('No load logged yet')}</div>
      ) : (
        <div>
          {ordered.map(({ t, acwr }) => {
            const last = lastSessionOf(loads, t.id);
            const injured = activeInjuries(medical, t.id).length > 0;
            return (
              <div key={t.id} className="bhbc-row" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 2px', borderBottom: `1px solid ${C.cardBd}` }}>
                <span style={{ display: 'inline-block', width: 22, textAlign: 'end', flexShrink: 0, fontFamily: FN, fontSize: 11, fontWeight: 700, color: C.td, fontVariantNumeric: 'tabular-nums' }}>{t.jersey != null ? t.jersey : ''}</span>
                <span style={{ fontFamily: FN, fontSize: 13, fontWeight: 700, color: injured ? ORANGE : C.tx, minWidth: 0, whiteSpace: 'normal', overflowWrap: 'break-word' }}>{t.name}</span>
                <div style={{ flex: 1 }} />
                {/* The arithmetic, spelled out, isolated LTR so the x and the
                    = do not drift in an RTL page. */}
                <span dir="ltr" style={{ fontFamily: FN, fontSize: 11, color: C.tm, flexShrink: 0, fontVariantNumeric: 'tabular-nums', unicodeBidi: 'isolate' }}>
                  {last && last.minutes ? `${last.minutes} ${tr('min')}` : '—'}
                </span>
                <span style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.td, flexShrink: 0 }}>{tr('7 days')}</span>
                <span dir="ltr" style={{ fontFamily: FN, fontSize: 12, fontWeight: 700, color: C.tx, flexShrink: 0, fontVariantNumeric: 'tabular-nums', minWidth: 62, textAlign: 'end' }}>
                  {Math.round(acwr.acute || 0)} AU
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

const INJ_COLS = '190px minmax(0, 1fr) 120px 118px 96px 72px';

function MedicalView({ roster, rows: loadRows = [], loads = {}, medical, canMedical = true, onReport, onEdit, onOpen, onLog }) {
  const he = useHe();
  const tr = useT();
  const injured = roster.filter((t) => activeInjuries(medical, t.id).length > 0);
  const cleared = roster.filter((t) => activeInjuries(medical, t.id).length === 0);
  // worst first (#305 C3): OUT, non-contact, limited, available; then the
  // longest-running injury first
  const SEV = { out: 0, 'non-contact': 1, limited: 2, available: 3 };
  const rows = injured.flatMap((t) => activeInjuries(medical, t.id).map((inj) => ({ t, inj })))
    .sort((a, b) => (SEV[a.inj.status] ?? 4) - (SEV[b.inj.status] ?? 4) || String(a.inj.onsetDate || '').localeCompare(String(b.inj.onsetDate || '')));
  const counts = { out: 0, limited: 0, nc: 0 };
  rows.forEach(({ inj }) => { if (inj.status === 'out') counts.out++; else if (inj.status === 'limited') counts.limited++; else if (inj.status === 'non-contact') counts.nc++; });
  // SORTABLE LIKE EVERY TABLE IN THE ZONE (27.9). It opens on Status, worst
  // first - the order above, so the arrow says what the order already is.
  // Since = the onset date, newest first; the injury and the author by the
  // words on screen, A->Z.
  const injText = (inj) => [inj.bodyPart, inj.side && inj.side !== 'N/A' ? inj.side : '', inj.type].filter(Boolean).map((x) => tr(x)).join(' · ');
  const sort = useSort(rows, {
    name: { get: (r) => r.t.name, asc: true },
    injury: { get: (r) => injText(r.inj), asc: true },
    status: (r) => 3 - (SEV[r.inj.status] ?? 3),
    since: (r) => r.inj.onsetDate || null,
    by: { get: (r) => byName(r.inj.updatedBy || r.inj.by), asc: true },
  }, 'status');
  const injCols = [['name', tr('Athlete')], ['injury', tr('Injury')], ['status', tr('Status')], ['since', tr('Since · pain')], ['by', tr('Reported by')]];
  // A ROW ALWAYS OPENS SOMETHING: the record for staff who can edit it, the
  // athlete's own card for everyone else.
  const openRow = (t, inj) => (canMedical ? onEdit(t.id, inj.id) : onOpen && onOpen(t.id));
  const rowOpens = canMedical || !!onOpen;
  return (
    <>
      <Card padding={14} leftStripe={ORANGE} header={secTitle('Injury Board')} headerRight={<span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--c-stripTx)' }}>{rows.length} {tr('active')} · {canMedical ? tr('Ohad + PT') : tr('view only')}</span>}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 22 }}>
          {/* colour only the exceptions (#305 E1): cleared is the normal state, so it
              takes the plain ink; limited takes the legible amber token, the raw
              amber measured 2.15:1 on white */}
          {[[tr('Out'), counts.out, '#DE4E3B'], [tr('limited'), counts.limited, 'var(--bhbc-amber-text, #E0A73A)'], [tr('Non-contact'), counts.nc, '#4F9DE0'], [tr('Cleared'), cleared.length, C.tx]].map(([k, n, c]) => (
            <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontFamily: FN, fontSize: 26, fontWeight: 800, color: n ? c : C.tx, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{n}</span>
              <span style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.tm }}>{k}</span>
            </div>
          ))}
        </div>
      </Card>

      {rows.length > 0 && (
        <Card padding={14} leftStripe={NAVY} header={secTitle('Active Injuries')}>
          <div>
            {/* Column headers: the row carries four bare values (a status, a
                day count, a pain score and a name) and nothing said which was
                which. Same grid as the rows, so the labels sit over the
                columns they name. Hidden on a phone, where the rows restack
                and the header would no longer line up with anything. */}
            {/* The arrow's reserved slot takes the place of the 8px end margin
                these labels carried, so no header grew. */}
            {/* THE HEADER STANDS OVER ITS COLUMN (#373): no padding the rows do
                not have (it put every label 2px off its column), and ATHLETE
                starts where the NAMES start - past the 22px jersey slot and its
                9px gap - not over the numbers. */}
            <div className="bhbc-inj-head" style={{ display: 'grid', gridTemplateColumns: INJ_COLS, gap: 12, alignItems: 'center', minHeight: 36, padding: 0, background: 'var(--c-sf2)', borderBottom: `1px solid ${C.cardBd}` }}>
              {injCols.map(([k, h], i) => (
                <SortHeader key={k} k={k} sort={sort} label={h} style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.tm, ...(i === 0 ? { paddingInlineStart: 31 } : null) }} />
              ))}
              <div />
            </div>
            <SortBar sort={sort} className="bhbc-inj-sortbar" cols={injCols}
              style={{ alignItems: 'center', minHeight: 36, padding: '0 2px', background: 'var(--c-sf2)', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.tm, borderBottom: `1px solid ${C.cardBd}` }} />
            {sort.rows.map(({ t, inj }) => {
              const days = inj.onsetDate ? dayDiff(todayISO(), inj.onsetDate) : null;
              return (
                <div key={t.id + inj.id} className="bhbc-row bhbc-inj-row" onClick={rowOpens ? () => openRow(t, inj) : undefined}
                  role={rowOpens ? 'button' : undefined} tabIndex={rowOpens ? 0 : undefined}
                  onKeyDown={rowOpens ? ((ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openRow(t, inj); } }) : undefined} style={{ display: 'grid', gridTemplateColumns: INJ_COLS, gap: 12, alignItems: 'center', padding: '11px 0', borderBottom: `1px solid ${C.cardBd}`, cursor: rowOpens ? 'pointer' : 'default' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                    <span style={{ display: 'inline-block', width: 22, textAlign: 'end', flexShrink: 0, fontFamily: FN, fontSize: 11, fontWeight: 700, color: C.tm, fontVariantNumeric: 'tabular-nums' }}>{t.jersey ?? '—'}</span>
                    <PlayerName name={t.name} style={{ fontFamily: FN, fontSize: 13, fontWeight: 700, color: C.tx }} />
                  </div>
                  <div style={{ fontFamily: FB, fontSize: 13, color: C.tx, minWidth: 0 }}>{[inj.bodyPart, inj.side && inj.side !== 'N/A' ? inj.side : '', inj.type].filter(Boolean).map((x) => tr(x)).join(' · ')}</div>
                  <StatusPill status={inj.status} />
                  {/* HIS PAIN RULE (CLAUDE.md: 0-3 fine, 4-5 modify, 6+ stop and
                      reassess): a latest pain of 6+ reads red, 4-5 amber (#305 F3) */}
                  <div style={{ fontFamily: FN, fontSize: 11, color: C.td, fontVariantNumeric: 'tabular-nums' }}>{days != null ? daysFor(days) : '—'}{latestPain(inj) != null ? <> · <span style={{ fontWeight: latestPain(inj) >= 4 ? 800 : 400, color: latestPain(inj) >= 6 ? '#DE4E3B' : latestPain(inj) >= 4 ? 'var(--bhbc-amber-text, #E0A73A)' : C.td }}>{tr('pain')} {latestPain(inj)}</span></> : ''}</div>
                  {/* WHO assessed this. With two PTs sharing the board, an
                      unsigned record cannot be questioned or followed up. */}
                  {/* A RECORD NOBODY HAS TOUCHED IN TWO WEEKS SAYS SO (#305 M5). The
                      last thing written is the newer of the record's own save and
                      its newest rehab note; the label is the only colour here. */}
                  {(() => {
                    const lastNote = (inj.progress || []).map((x) => x && x.date).filter(Boolean).sort().pop() || '';
                    const saved = inj.updatedAt ? localISO(new Date(inj.updatedAt)) : '';
                    const last = [lastNote, saved].filter(Boolean).sort().pop() || '';
                    const quiet = last ? dayDiff(todayISO(), last) : null;
                    return (
                      <div style={{ fontFamily: FN, fontSize: 10, color: C.td }}>
                        {(inj.updatedBy || inj.by) ? byName(inj.updatedBy || inj.by) : ''}
                        {quiet != null && quiet >= 14 && <span style={{ display: 'block', marginTop: 2, fontWeight: 700, color: 'var(--bhbc-amber-text, #E0A73A)', whiteSpace: 'nowrap' }}>{he ? `אין עדכון ${quiet} ימים` : `no update ${quiet}d`}</span>}
                      </div>
                    );
                  })()}
                  <div style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: ORANGE_DEEP }}>{canMedical ? tr('Update ›') : ''}</div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {(() => {
        // Every cleared injury, newest first. This is the history he asked
        // for: resolving moves a record HERE, it never removes it.
        const past = roster.flatMap((t) => resolvedInjuries(medical, t.id).map((inj) => ({ t, inj })));
        past.sort((a, b) => String(b.inj.onsetDate || '').localeCompare(String(a.inj.onsetDate || '')));
        if (!past.length) return null;
        return (
          <Card padding={14} leftStripe={'#37B27C'} header={secTitle('Previous injuries')}
            headerRight={<span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--c-stripTx)' }}>{past.length}</span>}>
            <div>
              {past.map(({ t, inj }) => (
                <div key={t.id + inj.id} className="bhbc-row" onClick={rowOpens ? () => openRow(t, inj) : undefined}
                  role={rowOpens ? 'button' : undefined} tabIndex={rowOpens ? 0 : undefined}
                  onKeyDown={rowOpens ? ((ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openRow(t, inj); } }) : undefined}
                  style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 12, rowGap: 4, padding: '10px 2px', borderBottom: `1px solid ${C.cardBd}`, cursor: rowOpens ? 'pointer' : 'default' }}>
                  <span style={{ display: 'inline-block', width: 22, textAlign: 'end', flexShrink: 0, fontFamily: FN, fontSize: 11, fontWeight: 700, color: C.td, fontVariantNumeric: 'tabular-nums' }}>{t.jersey != null ? t.jersey : ''}</span>
                  <PlayerName name={t.name} style={{ fontFamily: FN, fontSize: 13, fontWeight: 700, color: C.tx }} />
                  <span style={{ fontFamily: FB, fontSize: 13, color: C.tm, minWidth: 0 }}>{[inj.bodyPart, inj.side && inj.side !== 'N/A' ? inj.side : null, inj.type].filter(Boolean).map((x) => tr(x)).join(' · ')}</span>
                  {/* date + CLEARED are one unit pinned to the end: on a 360 phone the
                      longest row ran 9px past the screen (box-fit, 1.10) - now the unit
                      drops to a second line, still at the end, instead */}
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12, marginInlineStart: 'auto', flexShrink: 0 }}>
                    {inj.onsetDate && <span dir="ltr" style={{ fontFamily: FN, fontSize: 11, color: C.td, fontVariantNumeric: 'tabular-nums' }}>{fmtNumericDate(inj.onsetDate)}</span>}
                    <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#37B27C' }}>{tr('Cleared')}</span>
                  </span>
                </div>
              ))}
            </div>
          </Card>
        );
      })()}

      {/* The sRPE session-load card is not mounted: the club logs no RPE, ever
          (Ohad 23.9), so it could only say "no load logged yet" (27.9 sweep). */}

      <Card padding={14} leftStripe={NAVY} header={secTitle('Roster Health')}>
        <div>
          {roster.map((t) => {
            const act = activeInjuries(medical, t.id);
            // the WORST of his active records, in the board's order (#305 N-M1):
            // non-contact was skipped, so limited + non-contact read Limited
            const status = act.length ? act.slice().sort((a, b) => (SEV[a.status] ?? 4) - (SEV[b.status] ?? 4))[0].status : 'available';
            const hist = ((medical[t.id] || {}).injuries || []).length;
            return (
              <div key={t.id} className="bhbc-row bhbc-rh-row" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 14, rowGap: 8, padding: '11px 0', borderBottom: `1px solid ${C.cardBd}` }}>
                <div style={{ flex: '1 1 160px', display: 'flex', alignItems: 'center', gap: 10, minWidth: 140, cursor: 'pointer' }} onClick={() => onOpen(t.id)} role="button" tabIndex={0} onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onOpen(t.id); } }}>
                  <span style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, color: C.tm, fontVariantNumeric: 'tabular-nums', width: 20, textAlign: 'end', flexShrink: 0 }}>{t.jersey ?? '—'}</span>
                  <PlayerName name={t.name} style={{ fontFamily: FN, fontSize: 13, fontWeight: 600, color: C.tx }} />
                  {hist > 0 && <span style={{ fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: '0.04em', flexShrink: 0 }}>· {hist} {tr(hist > 1 ? 'records' : 'record')}</span>}
                </div>
                {/* ONE STATUS COLUMN (29.9 #416, Ohad: "the colors and the status
                    looks misaligned"): a FIXED width, so the buttons after it
                    stand on one x in every row whatever the word; every status
                    has its dot in the zone's colours (green Available too, as on
                    the load board), and the words start on one x. An exception
                    reads in full ink, Available stays calm. */}
                <span data-status={status} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, width: 124, fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: status === 'available' ? C.tm : C.tx, whiteSpace: 'nowrap', flexShrink: 0 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: (MED_STATUS[status] || MED_STATUS.available).color, flexShrink: 0 }} />
                  {tr((MED_STATUS[status] || MED_STATUS.available).label)}
                </span>
                    {/* This one carried .bhbc-ghost-btn and nothing else, and that
                        class only defines :hover - so it fell through to the
                        BROWSER's chrome: rgb(240,240,240) fill and a 1.6px black
                        border, neither of which exists in this palette. Every one
                        of its fifteen siblings supplies the look inline. minWidth 84
                        matches the medical button beside it, one size per column. */}
                {onLog && (
                  <button onClick={(e) => { e.stopPropagation(); onLog(t.id); }} className="bhbc-ghost-btn" title={tr('Log a lift for this athlete')}
                    style={{ height: 'var(--btn-h)', boxSizing: 'border-box', padding: '0 12px', minWidth: 84, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: `1px solid ${C.cardBd}`, borderRadius: 0, color: C.tm, cursor: 'pointer', flexShrink: 0, fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{tr('Log lift')}</button>
                )}
                {canMedical
                  ? <button onClick={() => (act.length ? onEdit(t.id, act[0].id) : onReport(t.id))} className="bhbc-ghost-btn" style={{ height: 'var(--btn-h)', boxSizing: 'border-box', minWidth: 84, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.tm, background: 'transparent', border: `1px solid ${C.cardBd}`, cursor: 'pointer', flexShrink: 0, transition: 'color .12s, border-color .12s' }}>{act.length ? (he ? '‹ צפייה' : 'View ›') : (he ? '+ דיווח' : '+ Report')}</button>
                  : <span style={{ width: 84, flexShrink: 0 }} />}
              </div>
            );
          })}
        </div>
      </Card>

      {/* NO RETURN-TO-PLAY IN THE CLUB ZONE (27.9, Ohad: "remove completely all rtp everywhere on bhbc"). */}

      {/* (The concussion red-flags card is gone - 29.9 #417, Ohad: "remove the
          concussion red flags completely, i never asked for it".) */}

    </>
  );
}

function InjuryModal({ athlete, injury, onClose, onSave, currentUser = '', active = [], history = [], today = todayISO(), onSwitch = null }) {
  const tr = useT();
  const he = useHe();
  const [bodyPart, setBodyPart] = useState(injury?.bodyPart || '');
  const [side, setSide] = useState(injury?.side || 'N/A');
  // A RE-INJURY STARTS ON THE SIDE HIS RECORD ALREADY KNOWS (#305 A12). Only on
  // a NEW report, only until the side is touched, and only when every earlier
  // record of that body part names the same side - two different sides on file
  // prefill nothing, because then the record cannot tell which one this is.
  const [sidePrefilled, setSidePrefilled] = useState(false);
  const [sideTouched, setSideTouched] = useState(!!injury);
  const knownSideFor = (part) => {
    if (!part || injury) return null;
    const sides = [...new Set((history || []).filter((i) => i && i.bodyPart === part && i.side && i.side !== 'N/A').map((i) => i.side))];
    return sides.length === 1 ? sides[0] : null;
  };
  const pickBodyPart = (part) => {
    setBodyPart(part);
    if (sideTouched) return;
    const known = knownSideFor(part);
    setSide(known || 'N/A');
    setSidePrefilled(!!known);
  };
  const [type, setType] = useState(injury?.type || '');
  // A concussion has no left or right. Leaving the picker live invites a wrong
  // answer into the record, so it is pinned to N/A while the injury is a head
  // injury - by TYPE or by body part, since either can be chosen first.
  const headInjury = /concussion/i.test(type || '') || /^head/i.test(bodyPart || '');
  const [onsetDate, setOnsetDate] = useState(injury?.onsetDate || todayISO());
  const [status, setStatus] = useState(injury?.status || 'out');
  // The STORED pain stays the stored pain (27.9 review): pre-filling the latest
  // rehab score here wrote it over the report-time value on any save, even a
  // status-only one. The latest rehab score shows as the field's hint instead.
  const [pain, setPain] = useState(() => injury?.pain ?? '');
  const painHint = injury ? latestPain(injury) : null;
  const [mechanism, setMechanism] = useState(injury?.mechanism || '');
  // kept as stored and saved back unchanged - no RTP is shown or edited in the club zone (27.9 #312)
  const [rtpTarget] = useState(injury?.rtpTarget || '');
  const [notes, setNotes] = useState(injury?.notes || '');
  const [resolved, setResolved] = useState(injury?.resolved || false);
  const [progress, setProgress] = useState(injury?.progress || []);
  const [pNote, setPNote] = useState(''); const [pPain, setPPain] = useState('');
  const [pDate, setPDate] = useState(today);
  const [editDate, setEditDate] = useState('');
  const [editIdx, setEditIdx] = useState(-1);
  const [editNote, setEditNote] = useState(''); const [editPain, setEditPain] = useState('');
  const byDateDesc = (arr) => [...arr].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const commitEdit = () => {
    setProgress((arr) => byDateDesc(arr.map((x, k) => (k === editIdx
      ? { ...x, date: editDate && editDate <= today ? editDate : x.date, note: editNote.trim(), pain: editPain === '' ? null : Number(editPain) }
      : x))));
    setEditIdx(-1);
  };
  const rehabBtn = (color) => ({
    background: 'transparent', border: 'none', color, cursor: 'pointer', padding: 0,
    fontFamily: FN, fontSize: 12, lineHeight: 'normal', display: 'inline-flex', alignItems: 'center',
  });
  const addProgress = () => {
    if (!pNote.trim() && pPain === '') return;
    const d = pDate && pDate <= today ? pDate : today;
    setProgress((p) => byDateDesc([{ date: d, note: pNote.trim(), pain: pPain === '' ? null : Number(pPain), status, by: currentUser || null }, ...p]));
    setPNote(''); setPPain(''); setPDate(today);
  };
  const save = () => {
    if (!bodyPart) { toast('Pick a body part'); return; }
    if (onsetDate && onsetDate > today) { toast(he ? 'תאריך הפציעה לא יכול להיות בעתיד' : 'The onset date cannot be in the future'); return; }
    onSave({
      id: injury?.id || 'inj_' + Math.random().toString(36).slice(2, 9),
      bodyPart, side, type, onsetDate, status, pain: pain === '' ? null : Number(pain),
      mechanism: mechanism.trim(), rtpTarget, notes: notes.trim(), resolved, progress,
      createdAt: injury?.createdAt || new Date().toISOString(),
      // Who wrote it first stays put; who touched it last is what a second
      // PT needs to see before acting on somebody else's assessment.
      by: injury?.by || currentUser || null,
      updatedBy: currentUser || null,
      updatedAt: new Date().toISOString(),
    });
  };
  const sel = { fontFamily: FN, fontSize: 13, color: C.tx, background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: '0 8px', width: '100%', height: 34, boxSizing: 'border-box' };
  const chipBtn = { fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', height: 28, boxSizing: 'border-box', padding: '0 10px', border: '1px solid', borderRadius: 0, display: 'inline-flex', alignItems: 'center', gap: 6, lineHeight: 1 };
  // Switching records drops unsaved edits - ask only when there are some.
  const snapshot = JSON.stringify([bodyPart, side, type, onsetDate, status, pain, mechanism, rtpTarget, notes, resolved, progress, pNote, pPain]);
  const [initialSnap] = useState(snapshot);
  const switchTo = async (id) => {
    if (snapshot !== initialSnap && !(await confirmToast(he ? 'לבטל את השינויים ברשומה הזאת?' : 'Discard the changes to this record?', { okLabel: he ? 'ביטול השינויים' : 'Discard', cancelLabel: he ? 'חזרה' : 'Back' }))) return;
    onSwitch(id);
  };
  const agoText = (iso) => {
    if (!iso) return '';
    const n = dayDiff(today, iso);
    if (n < 0) return he ? 'בעתיד' : 'in the future';
    if (n === 0) return he ? 'היום' : 'today';
    if (n === 1) return he ? 'אתמול' : 'yesterday';
    return he ? `לפני ${n} ימים` : `${n} days ago`;
  };
  const lbl = { fontSize: 9, fontWeight: 700, color: C.tm, textTransform: 'uppercase', letterSpacing: '0.16em', fontFamily: FN, marginBottom: 4, display: 'block' };
  return (
    <BModal open guard onClose={onClose} wide title={<><span className="bm-lead">{tr(injury ? 'Update injury' : 'Report injury')} · </span>#{athlete.jersey ?? '—'} {athlete.name}</>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {onSwitch && (active.length > 0 || injury) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            {active.map((a) => {
              const on = injury && a.id === injury.id;
              return (
                <button key={a.id} type="button" onClick={() => { if (!on) switchTo(a.id); }}
                  style={{ ...chipBtn, color: on ? '#fff' : C.tx, background: on ? NAVY : 'transparent', borderColor: on ? NAVY : C.cardBd, cursor: on ? 'default' : 'pointer' }}>
                  {tr(a.bodyPart) || '—'}{a.onsetDate ? <span dir="ltr" style={{ opacity: 0.75, fontWeight: 600, unicodeBidi: 'isolate' }}>{monDay(a.onsetDate)}</span> : null}
                </button>
              );
            })}
            <button type="button" onClick={() => { if (injury) switchTo(null); }}
              style={{ ...chipBtn, color: !injury ? '#fff' : ORANGE, background: !injury ? ORANGE : 'transparent', borderColor: ORANGE, cursor: injury ? 'pointer' : 'default' }}>
              + {he ? 'פציעה חדשה' : 'New injury'}
            </button>
          </div>
        )}
        <div className="bhbc-form-grid" style={{ display: 'grid', gridTemplateColumns: '1.3fr 0.9fr 1.1fr', gap: 10 }}>
          <div><label style={lbl}>{tr('Body part')}</label><select value={bodyPart} onChange={(e) => pickBodyPart(e.target.value)} style={sel}><option value="">{tr('— select —')}</option>{BODY_PARTS.map((b) => <option key={b} value={b}>{tr(b)}</option>)}</select></div>
          <div><label style={lbl}>{tr('Side')}</label><select value={headInjury ? 'N/A' : side} disabled={headInjury} title={headInjury ? tr('A head injury has no side.') : undefined} onChange={(e) => { setSide(e.target.value); setSideTouched(true); setSidePrefilled(false); }} style={{ ...sel, ...(headInjury ? { opacity: 0.5 } : null) }}>{['N/A', 'Left', 'Right', 'Bilateral'].map((s) => <option key={s} value={s}>{tr(s)}</option>)}</select>
            {sidePrefilled && !headInjury && <span style={{ display: 'block', marginTop: 4, fontFamily: FN, fontSize: 10, color: C.tm }}>{tr('Same side as his earlier injury here')}</span>}</div>
          <div><label style={lbl}>{tr('Type')}</label><select value={type} onChange={(e) => setType(e.target.value)} style={sel}><option value="">—</option>{INJURY_TYPES.map((tp) => <option key={tp} value={tp}>{tr(tp)}</option>)}</select></div>
        </div>
        <div className="bhbc-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          {/* The modal renders through a PORTAL, outside .bhbc-zone, so the zone's
              token overrides never reach the shared Input - measured, its label
              came out rgb(8,102,143) at 1.62px tracking beside rgb(74,82,99) at
              1.44 on every label around it. Same local label as the rest of the
              form, so one form has one label style. */}
          <div><label style={lbl}>{tr('Onset date')}</label>
            <input type="date" value={onsetDate} max={today} onChange={(e) => setOnsetDate(e.target.value)} style={sel} />
            <span style={{ display: 'block', marginTop: 4, fontFamily: FN, fontSize: 10, color: onsetDate > today ? '#DE4E3B' : C.tm }}>{agoText(onsetDate)}</span></div>
          <div><label style={lbl}>{tr('Pain (0–10)')}</label><input type="number" min="0" max="10" value={pain} onChange={(e) => setPain(e.target.value)} placeholder={painHint != null ? String(painHint) : '—'} style={sel} /></div>

        </div>
        <div>
          <label style={lbl}>{tr('Current status')}</label>
          {/* A 2x2 grid of EQUAL cells, not a wrapping inline row. Wrapping sized
              each option to its own label, so AVAILABLE / LIMITED / NON-CONTACT
              filled line one and OUT dropped alone onto line two at a different
              width - four peer options, four different boxes. This is the PT's
              most-used control. */}
          {/* hairlines BETWEEN the four cells too (26.9, Ohad: "no borders
              between each of them ... i need some type of inside border"): a
              1px gap over the border colour draws every inner line once */}
          <div className="hl-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1, background: C.cardBd, border: `1px solid ${C.cardBd}` }}>
            {Object.entries(MED_STATUS).map(([k, s]) => (
              <button key={k} type="button" data-dirties onClick={() => setStatus(k)} style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, color: status === k ? '#fff' : C.td, background: status === k ? s.color : 'var(--c-sf)', border: 'none', padding: '0 14px', cursor: 'pointer' }}>{tr(s.label)}</button>
            ))}
          </div>
        </div>
        <div><label style={lbl}>{tr('Mechanism / how it happened')}</label><input value={mechanism} onChange={(e) => setMechanism(e.target.value)} placeholder={tr('e.g. landed awkwardly on a rebound')} style={sel} /></div>
        <div><label style={lbl}>{tr('Notes (assessment, plan, PT observations)')}</label><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} style={{ ...sel, height: 'auto', padding: '8px', resize: 'vertical' }} /></div>

        {/* Rehab progress log */}
        <div style={{ border: `1px solid ${C.cardBd}` }}>
          <div style={{ padding: '8px 12px', background: NAVY_DEEP, fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#fff' }}>{tr('Rehab progress')}</div>
          {/* EVERY FIELD SAYS WHAT IT IS (26.9, Ohad: a small box "before pain
              ... i don't even know what that button or textbox is for"). That box
              was the NOTE, squeezed to 20px between the date and the pain score
              on a phone. Two rows: when + how much it hurts, then the note at
              full width with ADD at its end. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', borderBottom: progress.length ? `1px solid ${C.cardBd}` : 'none' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 96px', gap: 8 }}>
              <div><label style={lbl}>{he ? 'תאריך' : 'Date'}</label>
                <input type="date" value={pDate} max={today} min={onsetDate || undefined} onChange={(e) => setPDate(e.target.value)} style={{ ...sel, width: '100%' }} /></div>
              <div><label style={lbl}>{tr('Pain (0–10)')}</label>
                <input type="number" inputMode="numeric" min="0" max="10" value={pPain} onChange={(e) => setPPain(e.target.value)} placeholder="—" style={{ ...sel, width: '100%', textAlign: 'center' }} /></div>
            </div>
            <div><label style={lbl}>{he ? 'הערת התקדמות' : 'Progress note'}</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input value={pNote} onChange={(e) => setPNote(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addProgress(); }} placeholder={pDate === today ? tr('Progress note for today…') : (he ? 'הערת התקדמות…' : 'Progress note…')} style={{ ...sel, flex: 1, minWidth: 0 }} />
                <Btn onClick={addProgress} style={{ background: ORANGE, borderColor: ORANGE, color: '#fff', flexShrink: 0 }}>{tr('Add')}</Btn>
              </div></div>
          </div>
          {progress.length > 0 && (
            <div style={{ maxHeight: 160, overflowY: 'auto' }}>
              {progress.map((p, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 12px', borderBottom: `1px solid ${C.cardBd}`, fontFamily: FN, fontSize: 12, alignItems: 'center' }}>
                  {editIdx === i
                    ? <input type="date" value={editDate} max={today} onChange={(e) => setEditDate(e.target.value)} style={{ ...sel, width: 138, height: 24, flexShrink: 0 }} />
                    : <span dir="ltr" style={{ color: C.td, width: 50, flexShrink: 0, fontVariantNumeric: 'tabular-nums', unicodeBidi: 'isolate' }}>{monDay(p.date)}</span>}
                  {editIdx === i ? (
                    <input autoFocus value={editNote} onChange={(e) => setEditNote(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitEdit(); } if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setEditIdx(-1); } }}
                      style={{ ...sel, flex: 1, minWidth: 0, height: 24 }} />
                  ) : (
                    <span style={{ color: C.tx, flex: 1, minWidth: 0 }}>{p.note || '—'}</span>
                  )}
                  {editIdx === i ? (
                    <input type="number" min="0" max="10" value={editPain} onChange={(e) => setEditPain(e.target.value)}
                      placeholder={tr('pain')} style={{ ...sel, width: 62, height: 24, flexShrink: 0 }} />
                  ) : (p.pain != null && <span style={{ color: ORANGE_DEEP, fontWeight: 700, flexShrink: 0 }}>{tr('pain')} {p.pain}</span>)}
                  {p.by && editIdx !== i && <span style={{ color: C.td, fontSize: 10, flexShrink: 0 }}>{byName(p.by)}</span>}
                  {/* Ohad: "rehab progress doesnt allow me to edit/delete". A dated
                      log a PT writes into is not append-only in practice - a wrong
                      pain score typed on the floor has to be correctable by the
                      person who typed it, not left standing as the record. */}
                  {editIdx === i ? (
                    <span style={{ display: 'inline-flex', gap: 6, flexShrink: 0 }}>
                      <button type="button" onClick={commitEdit} title={tr('Save')} style={rehabBtn(ORANGE)}>✓</button>
                      <button type="button" onClick={() => setEditIdx(-1)} title={tr('Cancel')} style={rehabBtn(C.tm)}><CrossGlyph /></button>
                    </span>
                  ) : (
                    <span style={{ display: 'inline-flex', gap: 6, flexShrink: 0 }}>
                      <button type="button" onClick={() => { setEditIdx(i); setEditDate(p.date || today); setEditNote(p.note || ''); setEditPain(p.pain == null ? '' : String(p.pain)); }} title={tr('Edit')} style={rehabBtn(C.tm)}><PencilGlyph /></button>
                      <button type="button" data-dirties onClick={() => setProgress((arr) => arr.filter((_, k) => k !== i))} title={tr('Delete')} style={rehabBtn('#DE4E3B')}><CrossGlyph /></button>
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontFamily: FB, fontSize: 13, color: C.tx }}>
          <input type="checkbox" checked={resolved} onChange={(e) => setResolved(e.target.checked)} style={{ accentColor: '#37B27C', width: 16, height: 16 }} />{tr('Mark resolved / cleared to play')}</label>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Btn variant="ghost" onClick={onClose}>{tr('Cancel')}</Btn>
          <Btn onClick={save} style={{ background: ORANGE, borderColor: ORANGE, color: '#fff' }}>{tr('Save record')}</Btn>
        </div>
      </div>
    </BModal>
  );
}

// LOG LIFT — one athlete's own weight-room session. Ohad, 24.9: "lifts needs
// to be independent and i can log them even on days without practice, and
// theyre not team. just personal. and not related to the practice sessions".
//
// Athlete, date (any day), minutes, an optional note. No type select, no squad
// scope, no fixture chips, no readiness block: this sheet writes one kind of
// row, and the team S&C block has its own sheet (ScSessionModal).
function LiftModal({ open, initialAthlete, roster, loads = {}, onClose, onSave }) {
  const tr = useT();
  const [athleteId, setAthleteId] = useState(initialAthlete);
  const [date, setDate] = useState(todayISO());
  const [minutes, setMinutes] = useState('');
  // SMARTER, NOT NEW (27.9 #305): the minutes start at HIS usual lift - the
  // median of his last five - and follow the athlete picked, until typed over.
  const [minTyped, setMinTyped] = useState(false);
  const usualLift = (id) => {
    const mins = Object.entries(((loads || {})[id] || {}).sessions || {})
      .flatMap(([d, list]) => (list || []).filter((r) => r && rowKind(r) === 'lift' && Number(r.min) > 0).map((r) => ({ d, m: Number(r.min) })))
      .sort((a, b) => (a.d < b.d ? 1 : -1)).slice(0, 5).map((x) => x.m).sort((a, b) => a - b);
    return mins.length ? mins[Math.floor(mins.length / 2)] : null;
  };
  useEffect(() => { if (!minTyped) { const u = usualLift(athleteId); setMinutes(u ? String(u) : ''); } }, [athleteId]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [note, setNote] = useState('');
  // A TYPO NEVER BECOMES A RECORD (27.9 #305 F2): a lift over 4 hours is not
  // a lift, it is a missing keystroke - Save waits and says why.
  const tooLong = Number(minutes) > 240;
  // A LIFT THAT HAS NOT HAPPENED IS NOT A RECORD (#305 N-A3): a date after
  // today is a mis-tap on the picker, never a lift.
  const future = !!date && date > todayISO();
  const canSave = !!athleteId && !!date && Number(minutes) > 0 && !tooLong && !future;
  // One height for every bordered control on the sheet (24.9: 36 everywhere).
  const selStyle = { fontFamily: FB, fontSize: 13, color: C.tx, background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: '0 10px', width: '100%', height: 'var(--btn-h)', boxSizing: 'border-box' };
  const lab = { fontSize: 9, fontWeight: 700, color: C.tm, textTransform: 'uppercase', letterSpacing: '0.18em', fontFamily: FN, textAlign: 'center' };
  return (
    <BModal open={open} guard onClose={onClose} title={tr('Log lift')}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={lab}>{tr('Athlete')}</label>
          <select value={athleteId} onChange={(e) => setAthleteId(e.target.value)} style={selStyle}>
            {roster.length === 0 && <option value="">{tr('— add roster first —')}</option>}
            {roster.map((t) => <option key={t.id} value={t.id}>{t.jersey != null ? `#${t.jersey} ` : ''}{t.name}</option>)}
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Input label={tr('Date')} type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
          <Input label={tr('Minutes')} type="number" inputMode="numeric" min="0" value={minutes} onChange={(e) => { setMinTyped(true); setMinutes(e.target.value); }} placeholder="40" />
        </div>
        {tooLong && <div style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, color: '#DE4E3B', textAlign: 'center' }}>{tr('Over 240 minutes - check the number.')}</div>}
        {future && <div style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, color: '#DE4E3B', textAlign: 'center' }}>{tr('That date has not happened yet.')}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={lab}>{tr('Note (optional)')}</label>
          <input value={note} onChange={(e) => setNote(e.target.value)}
            placeholder={tr('e.g. lower body · 4 lifts')}
            style={selStyle} />
        </div>
        <div style={{ fontFamily: FN, fontSize: 11, color: C.td, textAlign: 'center', letterSpacing: '0.04em' }}>
          {tr('Lift — minutes only, no RPE. Personal, any day, not tied to a practice.')}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <Btn variant="ghost" onClick={onClose}>{tr('Cancel')}</Btn>
          <Btn disabled={!canSave} onClick={() => onSave({ athleteId, date, minutes, note: note.trim() })}
            style={{ background: canSave ? ORANGE : undefined, borderColor: canSave ? ORANGE : undefined, color: canSave ? '#fff' : undefined }}>{tr('Log lift')}</Btn>
        </div>
      </div>
    </BModal>
  );
}
