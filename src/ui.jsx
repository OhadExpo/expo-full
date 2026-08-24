import React from 'react';
import { createPortal } from 'react-dom';
import { C, FN, FB } from './theme';

// Canonical height for header/strip ACTION buttons (+ TASK, MARK ALL READ,
// + LOG, CONTRACT, + ADD PAYMENT, …) so this whole button family is ONE uniform
// size EVERYWHERE in the platform (Ohad). 26 = midpoint of the old 20/30 spread.
// Use `stripBtnBase` for the shared box metrics; callers add border/color/text.
export const STRIP_BTN_H = 26;
export const stripBtnBase = {
  height: STRIP_BTN_H, boxSizing: 'border-box', padding: '0 10px', borderRadius: 0,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
  cursor: 'pointer', whiteSpace: 'nowrap', background: 'transparent',
};

// Every full-screen overlay in this file renders through <body> via
// createPortal. Views are wrapped in a `.motion-rise` element whose CSS
// transform becomes the containing block for position:fixed descendants —
// so an un-portaled fixed overlay anchors to that wrapper (off-centre)
// instead of the viewport. Portaling to document.body escapes the transform.
const portal = (node) => (typeof document !== 'undefined') ? createPortal(node, document.body) : node;

// Delayed-unmount for exit animations: keeps a node mounted for `delay` ms
// after `open` flips false so it can play a .motion-fade-out / .motion-fall
// exit before React removes it. Returns { mounted, closing }. Keep `delay`
// in sync with the exit keyframe duration in themes.css (~190ms).
export function useDelayedUnmount(open, delay = 200) {
  const [mounted, setMounted] = React.useState(open);
  const [closing, setClosing] = React.useState(false);
  React.useEffect(() => {
    let t;
    if (open) { setMounted(true); setClosing(false); }
    else if (mounted) { setClosing(true); t = setTimeout(() => { setMounted(false); setClosing(false); }, delay); }
    return () => clearTimeout(t);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  return { mounted, closing };
}

// Value-holding variant for overlays rendered as `{state && <overlay>}` where
// the body reads `state`. Holds the last non-null value through the exit so
// the content doesn't blank out mid-animation. Returns { value, closing }.
export function useDelayedUnmountValue(value, delay = 200) {
  const [held, setHeld] = React.useState(value);
  const [closing, setClosing] = React.useState(false);
  React.useEffect(() => {
    let t;
    if (value != null) { setHeld(value); setClosing(false); }
    else if (held != null) { setClosing(true); t = setTimeout(() => { setHeld(null); setClosing(false); }, delay); }
    return () => clearTimeout(t);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return { value: held, closing };
}

// Viewport-width hook for the inline-styles-first codebase, where CSS media
// queries can't reach inline `style={}`. Returns true below `bp` px (default
// 640 = phone). SSR-safe and resize-reactive. Use it to swap heavy desktop
// grids / fixed min-widths for single-column phone layouts.
export function useIsMobile(bp = 640) {
  const get = () => (typeof window !== 'undefined' ? window.innerWidth <= bp : false);
  const [mobile, setMobile] = React.useState(get);
  React.useEffect(() => {
    const onResize = () => setMobile(get());
    window.addEventListener('resize', onResize);
    onResize();
    return () => window.removeEventListener('resize', onResize);
  }, [bp]); // eslint-disable-line react-hooks/exhaustive-deps
  return mobile;
}

// Per stroke ruling (`feedback_stroke_ruling.md`): default-state inputs use
// 0.25px C.ac4D (30% alpha). Bright 1px C.ac is reserved for primary CTAs
// (Btn primary variant). Active focus would step up to 2px C.ac, but we
// don't track focus inline — :focus styling lives in a global stylesheet.
export const baseInput = {
  // Input fills use the secondary surface (--c-sf2 = soft gray in light,
  // same as sf in dark). NO border at rest — the gray fill defines the
  // field against the white card bg. Focus paints a 2px cyan ring via
  // themes.css :focus rule so the focused field is unambiguous.
  background: 'var(--c-sf2)', border: '1px solid transparent', borderRadius: 0,
  padding: "9px 14px", color: C.tx, fontFamily: FB, fontSize: 13,
  outline: "none", width: "100%", boxSizing: "border-box",
  transition: "border-color 0.2s, background-color 0.2s",
  fontWeight: 400, letterSpacing: "0.01em",
  textAlign: "center", fontVariantNumeric: "tabular-nums",  // numbers don't jitter as digit count changes
};
// ONE canonical button height across the entire app (Ohad: "same vertical height
// for everything"). height + border-box so every Btn renders exactly 30px no
// matter its padding/border; call sites can still override via style when a
// genuinely different control needs it.
export const BTN_H = 30;
export const baseBtn = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
  height: BTN_H, boxSizing: "border-box", padding: "0 18px",
  borderRadius: 0, border: "none", fontFamily: FN, fontSize: 11, fontWeight: 700, cursor: "pointer",
  letterSpacing: "0.12em", textTransform: "uppercase", transition: "all 0.15s",
};
const variants = {
  // acText is the AA-safe cyan (defined in theme.js) — matches ac on dark
  // surfaces but darkens for body-text contrast on the white card surface
  // in light mode. Btn is 11px uppercase 700 so it qualifies as "large"
  // text, but using the AA variant keeps the small "ghost"-on-white wins
  // free without re-evaluating per call site.
  primary: { background: 'transparent', color: C.acText, border: `1px solid ${C.ac}` },
  // Solid brand CTA — literal #39BDFF (not C.ac, which resolves near-black in the
  // light-refined theme) with dark text, so it's a visible filled button in BOTH
  // themes. Used for the rail footer actions (+ New Program / + Add Athlete).
  solid: { background: '#39BDFF', color: '#06131b', border: '1px solid #39BDFF' },
  ghost: { background: "transparent", color: C.tm, border: `1px solid var(--c-ghostBd)` },
  danger: { background: 'transparent', color: C.rd, border: `1px solid ${C.rd}` },
  success: { background: 'transparent', color: C.gn, border: `1px solid ${C.gn}` },
};
export const Btn = ({ children, variant = "primary", onClick, style, className, ...rest }) => {
  // A solid inline background opts out of the blanket hover-tint rule (see
  // themes.css) so filled CTAs stay readable while hovered.
  const bg = style && style.background;
  const filled = !!bg && bg !== 'transparent' && bg !== 'none';
  return <button onClick={onClick}
    className={"expo-btn" + (filled ? " expo-btn--filled" : "") + (className ? " " + className : "")}
    style={{ ...baseBtn, ...variants[variant], ...style }} {...rest}>{children}</button>;
};

/** Spread onto a non-<button> click target (a div/span row, an expander) to make
 *  it keyboard-operable: asButton(handler) → { role, tabIndex, onClick, onKeyDown }
 *  firing the handler on Enter/Space. Replaces a bare `onClick={fn}` so the many
 *  div-based rows/toggles work for keyboard + screen-reader users, without
 *  changing mouse behaviour or visuals. (a11y audit) */
export const asButton = (handler) => ({
  role: 'button', tabIndex: 0, onClick: handler,
  onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(e); } },
});

// ISO (YYYY-MM-DD) → Israeli dd/mm/yyyy, or the placeholder when empty.
const fmtDMY = (iso) => { if (!iso) return 'DD/MM/YYYY'; const [y, m, d] = String(iso).split('-'); return (d && m && y) ? `${d}/${m}/${y}` : 'DD/MM/YYYY'; };

export const Input = ({ label, style: s, id, ...props }) => {
  const autoId = React.useId();
  const inputId = id || autoId;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {label && <label htmlFor={inputId} style={{ fontSize: 9, fontWeight: 700, color: C.tm, textTransform: "uppercase", letterSpacing: "0.18em", fontFamily: FN, textAlign: "center" }}>{label}</label>}
      {props.type === 'date' ? (
        // Native <input type=date> renders the BROWSER-LOCALE format (MM/DD/YYYY on
        // en-US machines, which is what Ohad's browser is). Overlay a dd/mm/yyyy span
        // over a transparent native input so the displayed format is always Israeli
        // dd/mm/yyyy, and clicking the field opens the picker. The ISO value still
        // flows through value/onChange untouched, so callers are unchanged.
        <div style={{ position: 'relative', display: 'flex' }}>
          <input id={inputId} {...props}
            onClick={(e) => { try { e.currentTarget.showPicker(); } catch { /* noop */ } }}
            style={{ ...baseInput, ...s, color: 'transparent', cursor: 'pointer' }} />
          <span style={{ position: 'absolute', left: 14, top: 0, bottom: 0, display: 'flex', alignItems: 'center', pointerEvents: 'none', fontFamily: FB, fontSize: 13, color: C.tx, opacity: props.value ? 1 : 0.45 }}>{fmtDMY(props.value)}</span>
        </div>
      ) : (
        <input id={inputId} style={{ ...baseInput, ...s }} {...props} />
      )}
    </div>
  );
};

// Multi-email editor: value is string[] (UI form shape), onChange(next: string[]).
// Shows one row per email with a × to remove, plus a "+ Add Email" button up to max.
export const EmailsInput = ({ label = "Email(s)", value, onChange, max = 3, placeholder = "email@example.com" }) => {
  const arr = value && value.length ? value : [''];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 9, fontWeight: 700, color: C.tm, textTransform: 'uppercase', letterSpacing: '0.18em', fontFamily: FN, textAlign: 'center' }}>{label}</label>
      {arr.map((em, i) => (
        <div key={i} style={{ display: 'flex', gap: 4 }}>
          <input aria-label={arr.length > 1 ? `${label} ${i + 1}` : label} value={em} onChange={e => { const next = [...arr]; next[i] = e.target.value; onChange(next); }} placeholder={placeholder} style={{ ...baseInput, flex: 1 }} />
          {arr.length > 1 && <button onClick={() => { const next = [...arr]; next.splice(i, 1); onChange(next); }} style={{ background: 'var(--c-sf)', border: `1px solid ${C.rd}`, borderRadius: 0, padding: '0 10px', color: C.rd, cursor: 'pointer', fontSize: 14, lineHeight: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>×</button>}
        </div>
      ))}
      {arr.length < max && (
        <button onClick={() => onChange([...arr, ''])} style={{ background: 'var(--c-sf)', border: `0.25px dashed ${C.cardBd}`, borderRadius: 0, padding: '6px 10px', color: C.ac, cursor: 'pointer', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>+ Add Email</button>
      )}
    </div>
  );
};

export const Select = ({ label, options, value, onChange, placeholder }) => {
  const selectId = React.useId();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {label && <label htmlFor={selectId} style={{ fontSize: 9, fontWeight: 700, color: C.tm, textTransform: "uppercase", letterSpacing: "0.18em", fontFamily: FN, textAlign: "center" }}>{label}</label>}
      <select id={selectId} value={value || ""} onChange={e => onChange(e.target.value)} style={{ ...baseInput, appearance: "none", paddingRight: 30 }}>
        {/* disabled+hidden: the placeholder is display-only when nothing is
            selected — it never appears as a pickable item in the dropdown
            (clicking it used to clear the selection, which read as a page
            refresh in the compare pane). */}
        {placeholder && <option value="" disabled hidden>{placeholder}</option>}
        {options.map(o => <option key={typeof o==="object"?o.value:o} value={typeof o==="object"?o.value:o}>{typeof o==="object"?o.label:o}</option>)}
      </select>
    </div>
  );
};
export const TextArea = ({ label, id, ...props }) => {
  const autoId = React.useId();
  const taId = id || autoId;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {label && <label htmlFor={taId} style={{ fontSize: 9, fontWeight: 700, color: C.tm, textTransform: "uppercase", letterSpacing: "0.18em", fontFamily: FN, textAlign: "center" }}>{label}</label>}
      <textarea id={taId} style={{ ...baseInput, minHeight: 60, resize: "vertical" }} {...props} />
    </div>
  );
};
export const Badge = ({ children, color = C.ac, style: s }) =>
  <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "3px 10px", borderRadius: 0, fontSize: 10, fontWeight: 700, fontFamily: FN, background: C.badgeBg, border: `1px solid ${color}`, color, letterSpacing: "0.1em", textTransform: "uppercase", ...s }}>{children}</span>;

// ============================================================
// Refined light-mode primitives
// ============================================================
// Background: the baked light theme (`[data-theme="light"]`) uses cyan cards
// with black body text. The refined pattern flips each card to a two-zone
// layout in light mode: an inverted CYAN strip at the top (matching the
// active "DASHBOARD" pill in the nav) + a WHITE body below. Dark mode is
// untouched — cards stay single-zone in dark.
//
// Pattern usage:
//   {isRefined5b() ? <RefinedCard ...> ... </RefinedCard> : <legacy single-zone card>}
//
// or, for surfaces willing to always use the wrapper, RefinedCard handles
// both modes via its dark-mode fallback (single-zone, no strip).

// Returns true when the current document theme is the refined light variant
// (data-theme="5b" preview OR data-theme="light" baked). Anything else
// (dark, W, draft variants 1-4, 6) returns false.
export const isRefined5b = () => {
  if (typeof document === 'undefined') return false;
  const dt = document.documentElement.getAttribute('data-theme');
  return dt === '5b' || dt === 'light';
};

// RefinedHeaderStrip — cyan bg + white text strip that extends to the
// card edges via negative margins. The strip lives INSIDE a card whose
// outer padding is padY/padX; the negative margin pulls the strip out
// to the inside of the card border so the strip spans the card's width.
//
// Card border (and any severity left-stripe) sits OUTSIDE the strip.
// Pass `padY` and `padX` matching the parent card's padding (defaults
// match the dashboard alert-card padding of 14/18).
export function RefinedHeaderStrip({ children, padY = 14, padX = 18, marginBottom = 12 }) {
  // --c-stripBg is full BSG cyan in light, black in dark. Strip bleeds
  // to the card's outer edge via negative margins, so the card's own
  // cyan border becomes the strip's top + left + right border. The
  // bottom edge of the strip now uses the same cyan hairline as the
  // card border (var(--c-cardBd)) so the strip reads as a fully-
  // boxed title area, "closed" along the bottom.
  return (
    <div style={{
      // Header strip sits ONE subtle shade brighter/more-cyan than the card box
      // below it — a faint cyan highlight that separates header from content
      // without a hard fill (Ohad's test, 2026-07-30). ~10% brand cyan mixed
      // into the strip token; stays subtle in dark, stays branded in light.
      background: 'color-mix(in srgb, var(--c-stripBg, var(--c-sf)) 90%, var(--c-ac))',
      margin: `-${padY}px -${padX}px ${marginBottom}px`,
      // ONE uniform header height app-wide (Ohad #261: active-athletes / revenue /
      // tasks / messages / expiring bars must all be the SAME vertical height).
      // A label-only strip was ~34px while a strip with a 30px action button was
      // ~46px. Fix the box to a single height + vertically center the content, so
      // buttons no longer stretch some bars taller than others.
      minHeight: 41, boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
      padding: `0 ${padX}px`,
      // The bottom hairline divides header from content — but when the section is
      // COLLAPSED (parent passes marginBottom:0, no body follows) it becomes a
      // stray cyan line over emptiness. Drop it when collapsed so a collapsed box
      // reads as a clean strip like Revenue (Ohad #262). (px or 0 both handled.)
      // Drawn as an INSET shadow, not a border: a 1px border-box border would
      // shrink the content box and knock the vertically-centered content 1px
      // off-center (Ohad: the +TASK button must sit dead-center). Shadow paints
      // the same hairline with zero layout cost, so top/bottom gaps stay equal.
      boxShadow: (marginBottom === 0 || marginBottom === '0') ? 'none' : 'inset 0 -1px 0 var(--c-cardBd)',
    }}>{children}</div>
  );
}

// SectionIcon — stroke SVG icon matching the section-label visual vocabulary.
// Used in dashboard alert labels (Online Now / Expiring / Overdue / etc.)
// and applicable anywhere a severity-colored label needs a leading icon.
// On the refined cyan strip, pass `color="#FFFFFF"` so the icon reads white.
export function SectionIcon({ kind, color, size = 14 }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', style: { verticalAlign: '-2px', marginRight: 6, flexShrink: 0 } };
  switch (kind) {
    case 'alert': return <svg {...common}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;
    case 'dollar': return <svg {...common}><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>;
    case 'moon': return <svg {...common}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>;
    case 'trendingDown': return <svg {...common}><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>;
    case 'trendingUp': return <svg {...common}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>;
    case 'mail': return <svg {...common}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>;
    case 'dot': return <svg {...common} fill={color}><circle cx="12" cy="12" r="5"/></svg>;
    case 'user': return <svg {...common}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
    case 'users': return <svg {...common}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
    case 'filter': return <svg {...common}><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>;
    case 'calendar': return <svg {...common}><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
    case 'list': return <svg {...common}><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>;
    case 'bell': return <svg {...common}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>;
    case 'inbox': return <svg {...common}><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>;
    case 'camera': return <svg {...common}><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>;
    case 'zap': return <svg {...common}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>;
    case 'target': return <svg {...common}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>;
    case 'cube': return <svg {...common}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>;
    case 'crosshair': return <svg {...common}><circle cx="12" cy="12" r="10"/><line x1="22" y1="12" x2="18" y2="12"/><line x1="6" y1="12" x2="2" y2="12"/><line x1="12" y1="6" x2="12" y2="2"/><line x1="12" y1="22" x2="12" y2="18"/></svg>;
    default: return null;
  }
}

// RefinedCard — composes the cyan-strip header + white body in one component.
// Dark / non-refined modes fall back to the legacy single-zone card so the
// component can be used universally without per-site branching.
//
// Props:
//   header        — JSX rendered inside the strip (left-aligned by default).
//   headerRight   — JSX rendered on the right of the strip (action buttons,
//                   counters). Strip becomes flex-row when provided.
//   leftStripe    — CSS color for an outer left border (severity stripe).
//                   E.g., C.rd for overdue, C.or for warning, C.gn for active.
//   padY/padX     — card padding (default 14/18 matches dashboard alert cards)
//   className     — passthrough (used for hover styles via .alert-card etc.)
//   style         — outer card style override
export function RefinedCard({ header, headerRight, leftStripe, padY = 14, padX = 18, className, style, children }) {
  const baseBorder = `1px solid ${C.cardBd}`;
  return (
    <div className={className} style={{
      background: 'var(--c-sf)',
      border: baseBorder,
      borderLeft: leftStripe ? `3px solid ${leftStripe}` : baseBorder,
      borderRadius: 0,
      padding: `${padY}px ${padX}px`,
      boxShadow: C.cardShadow,
      ...style,
    }}>
      {/* Strip header renders in BOTH themes (keyed on !!header, not `refined`)
          so card sizing/layout is identical across light/dark — same fix the
          twin `Card` component got (Ohad spec: identical layout across themes).
          Only the strip BG color flips, via the --c-stripBg token. White header
          text in both themes so the dark strip reads as crisply as the cyan one. */}
      {header && (
        <RefinedHeaderStrip padY={padY} padX={padX} marginBottom={12}>
          {/* headerRight can shrink + wrap on phone widths — a rigid
              flex:0 0 auto pushed long action clusters (Matching / Classify /
              Cleanup hubs) ~300px past the viewport (mobile audit 08-22). */}
          {headerRight ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div style={{ minWidth: 0, flex: '1 1 auto', color: '#FFFFFF' }}>{header}</div>
              <div style={{ flex: '0 1 auto', minWidth: 0, display: 'flex', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8, color: '#FFFFFF' }}>{headerRight}</div>
            </div>
          ) : <div style={{ color: '#FFFFFF' }}>{header}</div>}
        </RefinedHeaderStrip>
      )}
      {children}
    </div>
  );
}

// CollapsibleSection — a card whose cyan strip-header IS the expand/collapse
// handle. The strip becomes a button (title + optional count + optional right-
// side actions + a rotating chevron); the body animates open/closed via the
// CSS grid 0fr→1fr height trick (same as the dashboard dropout card). Open
// state persists in localStorage per `storageKey`, so a coach's collapse
// layout sticks across reloads — important on TraineeDetail where they'd
// otherwise re-set it every visit.
//
// Props:
//   title       — strip text (uppercased FN, white on the strip)
//   count       — optional number rendered as "(N)" after the title
//   right       — optional JSX (action buttons/counters) on the strip's right.
//                 Clicks inside it are stopped so they don't toggle the section.
//   storageKey  — localStorage id; omit for non-persisted (defaults to open).
//   defaultOpen — initial state when no stored value (default true)
//   leftStripe  — severity left border colour (e.g. C.rd)
//   padY/padX   — body padding (strip padding is fixed 8/padX to match strips)
//   bare        — for sections whose CHILD already renders its own card/chart
//                 (BWChart, OverloadChart, …): drops the outer card chrome and
//                 body padding so there's no double-card. The strip becomes a
//                 fully-bordered bar matching TraineeDetail's inline strips.
//   right       — extra JSX on the strip's right (clicks stopPropagated)
//   titleNode   — custom JSX for the title (overrides `title`/`count`); use
//                 for Hebrew/RTL or non-uppercase labels. Render it white so
//                 it reads on the strip.
export function CollapsibleSection({ title, titleNode, count, right, storageKey, defaultOpen = true, leftStripe, padY = 14, padX = 18, bare = false, style, children, domId, openSignal }) {
  const storeId = storageKey ? `expo-collapse:${storageKey}` : null;
  const [open, setOpen] = React.useState(() => {
    if (!storeId) return defaultOpen;
    try { const v = localStorage.getItem(storeId); return v == null ? defaultOpen : v === '1'; } catch { return defaultOpen; }
  });
  // External force-open: when `openSignal` CHANGES to a truthy value the
  // section expands (and persists open). Lets a parent — e.g. the review
  // queue summary — jump to and reveal a specific collapsed section.
  // Change-only (not on mount): the parent's signal value survives a
  // list↔detail roundtrip, and firing on remount would force the section
  // back open after the user deliberately collapsed it.
  const prevSignalRef = React.useRef(openSignal);
  React.useEffect(() => {
    if (openSignal === prevSignalRef.current) return;
    prevSignalRef.current = openSignal;
    if (!openSignal) return;
    setOpen(true);
    try { if (storeId) localStorage.setItem(storeId, '1'); } catch { /* private mode */ }
  }, [openSignal]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = () => setOpen(o => {
    const n = !o;
    try { if (storeId) localStorage.setItem(storeId, n ? '1' : '0'); } catch { /* private mode */ }
    return n;
  });
  const baseBorder = `1px solid ${C.cardBd}`;
  // Same header treatment as RefinedHeaderStrip so EVERY header matches app-wide:
  // one shade of cyan above the box (the highlight test) AND one uniform 8px
  // inner height (bare no longer runs taller at 10px/minHeight-45).
  const stripBg = 'color-mix(in srgb, var(--c-stripBg, var(--c-sf)) 90%, var(--c-ac))';
  // minHeight 41 + boxSizing matches RefinedHeaderStrip so EVERY section header
  // is the same vertical height app-wide (Ohad #261; trimmed ~10% from 46 → 41
  // per Ohad — bars were slightly too tall). The strip div below is
  // display:flex/alignItems:center, so content stays vertically centered.
  const stripH = { minHeight: 41, boxSizing: 'border-box' };
  const stripStyle = bare
    ? { background: stripBg, border: baseBorder, padding: '0 14px', ...stripH }
    : (open
        // Divider as an inset shadow (not a border-box borderBottom) so it doesn't
        // shrink the content box and push the vertically-centered header/buttons
        // 1px off-center (Ohad). Bare/collapsed use a full border → already symmetric.
        ? { background: stripBg, boxShadow: `inset 0 -1px 0 ${C.cardBd}`, padding: `0 ${padX}px`, ...stripH }
        // Collapsed non-bare: the strip stands ALONE (the card body box beneath it
        // is gone), so it carries its OWN full border — matching the `bare` collapsed
        // look. Fixes the stray empty white box some sections showed collapsed (#260).
        : { background: stripBg, border: baseBorder, padding: `0 ${padX}px`, ...stripH });
  const outerStyle = bare
    ? { ...style }
    // Card chrome (white bg + border + shadow) only when OPEN; collapsed = no box
    // (the strip carries its own border), so every section collapses to a bare strip.
    : (open
        ? { background: 'var(--c-sf)', border: baseBorder, borderLeft: leftStripe ? `3px solid ${leftStripe}` : baseBorder, borderRadius: 0, boxShadow: C.cardShadow, marginBottom: 12, ...style }
        : { marginBottom: 12, ...style });
  return (
    <div id={domId} style={outerStyle}>
      <div
        onClick={toggle}
        role="button" tabIndex={0}
        aria-expanded={open}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }}
        style={{
          ...stripStyle,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12, cursor: 'pointer', userSelect: 'none', flexWrap: 'wrap',
        }}
      >
        {titleNode ? <span style={{ minWidth: 0, overflow: 'hidden' }}>{titleNode}</span> : (
          <span style={{
            color: '#FFFFFF', fontFamily: FN, fontSize: 13, fontWeight: 700,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0,
          }}>{title}{count != null && ` (${count})`}</span>
        )}
        {/* flexWrap on the strip + the action cluster lets a wide button group
            drop to its own line on a phone instead of forcing horizontal page
            overflow. On desktop it stays on one line. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end', marginLeft: 'auto', minWidth: 0, maxWidth: '100%' }}>
          {right && <span onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', minWidth: 0, maxWidth: '100%' }}>{right}</span>}
          <span aria-hidden style={{
            color: 'var(--c-tx)', fontSize: 12, lineHeight: 1, display: 'inline-block',
            transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 180ms ease',
          }}>▾</span>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateRows: open ? '1fr' : '0fr', transition: 'grid-template-rows 260ms ease' }}>
        {/* inert when collapsed: the 0fr trick keeps children mounted, so
            without it hidden buttons (e.g. DELETE rows) stay tab-focusable
            and Enter-activatable while invisible. Empty string = set the
            attribute (React 18 passes unknown attrs through as strings). */}
        <div style={{ overflow: 'hidden' }} inert={open ? undefined : ''}>
          <div style={{ padding: bare ? '8px 0 0' : `12px ${padX}px ${padY}px` }}>{children}</div>
        </div>
      </div>
    </div>
  );
}

// usePersistentState — useState whose value is mirrored to localStorage under
// the shared `expo-collapse:` namespace, so collapse/expand layout (and any
// other small UI preference) survives reloads and sessions. Works for booleans
// and plain JSON-serialisable objects (e.g. the Tasks per-section collapse map).
// Same persistence model as CollapsibleSection's storageKey.
export function usePersistentState(key, initial) {
  const id = `expo-collapse:${key}`;
  const [val, setVal] = React.useState(() => {
    try { const v = localStorage.getItem(id); return v == null ? initial : JSON.parse(v); }
    catch { return initial; }
  });
  React.useEffect(() => {
    try { localStorage.setItem(id, JSON.stringify(val)); } catch { /* private mode */ }
  }, [id, val]);
  return [val, setVal];
}

// RefinedTable — cyan-strip-header + white-body table for /coach surfaces.
// In refined mode, the <thead> row gets the cyan-strip treatment; rows
// switch to white bg with subtle hover tint via var(--c-rowHover).
//
// Props:
//   columns       — array of { key, label, align?, sortable?, width? }
//   rows          — array of { id, cells, onClick?, leftStripe? }
//                     cells is array of JSX matching columns.length.
//   sort/onSort   — { key, dir } + callback for sortable columns.
//   empty         — JSX to render when rows.length === 0.
export function RefinedTable({ columns, rows, sort, onSort, empty }) {
  const refined = isRefined5b();
  const sortArrow = (col) => {
    if (!col.sortable || !sort || sort.key !== col.key) return '';
    return sort.dir > 0 ? ' ↑' : ' ↓';
  };
  return (
    <div style={{ overflowX: 'auto', background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: FB, fontSize: 13 }}>
        <thead>
          <tr style={{ background: refined ? 'var(--c-sf)' : 'transparent', borderBottom: `1px solid ${refined ? 'rgba(0,0,0,0.10)' : C.cardBd}` }}>
            {columns.map(col => (
              <th key={col.key} onClick={col.sortable && onSort ? () => onSort(col.key) : undefined}
                style={{
                  textAlign: col.align || 'left', padding: '10px 12px',
                  fontSize: 9, fontFamily: FN,
                  color: refined ? '#FFFFFF' : C.tm,
                  textTransform: 'uppercase', letterSpacing: '0.18em', fontWeight: 700,
                  cursor: col.sortable ? 'pointer' : 'default',
                  width: col.width || undefined,
                  whiteSpace: 'nowrap',
                }}>{col.label}{sortArrow(col)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && empty ? (
            <tr><td colSpan={columns.length} style={{ padding: 40, textAlign: 'center', color: C.td }}>{empty}</td></tr>
          ) : rows.map(r => (
            <tr key={r.id} onClick={r.onClick}
              style={{ borderBottom: `1px solid ${C.cardBd}`, cursor: r.onClick ? 'pointer' : 'default', borderLeft: r.leftStripe ? `3px solid ${r.leftStripe}` : undefined, transition: 'background 0.1s' }}
              onMouseEnter={r.onClick ? (e => e.currentTarget.style.background = refined ? 'rgba(0,0,0,0.04)' : C.sf2) : undefined}
              onMouseLeave={r.onClick ? (e => e.currentTarget.style.background = 'transparent') : undefined}>
              {r.cells.map((cell, i) => (
                <td key={i} style={{ padding: '12px', textAlign: columns[i].align || 'left', verticalAlign: 'middle', fontVariantNumeric: 'tabular-nums' }}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// RefinedActionButton — small icon-text button readable on both the cyan
// header strip (white outline + white icon) and the white body (cyan or
// neutral outline). Use inside `headerRight` slots on RefinedCard or as
// inline action buttons on table rows.
export function RefinedActionButton({ kind, label, onClick, onContext = 'strip' }) {
  const refined = isRefined5b();
  const variants = {
    edit:    { stroke: '✎', color: refined && onContext === 'strip' ? '#FFFFFF' : C.ac },
    delete:  { stroke: '✕', color: refined && onContext === 'strip' ? '#FFFFFF' : C.rd },
    archive: { stroke: '⎘', color: refined && onContext === 'strip' ? '#FFFFFF' : C.tm },
    preview: { stroke: '👁', color: refined && onContext === 'strip' ? '#FFFFFF' : C.ac },
    plus:    { stroke: '+', color: refined && onContext === 'strip' ? '#FFFFFF' : C.ac },
    check:   { stroke: '✓', color: refined && onContext === 'strip' ? '#FFFFFF' : C.gn },
  };
  const v = variants[kind] || variants.edit;
  const isStrip = refined && onContext === 'strip';
  return (
    <button onClick={onClick} title={label} style={{
      background: 'transparent',
      border: `1px solid ${isStrip ? 'rgba(255,255,255,0.55)' : v.color}`,
      color: v.color,
      padding: '3px 8px', borderRadius: 0,
      fontFamily: FN, fontSize: 11, fontWeight: 700, cursor: 'pointer',
      letterSpacing: '0.04em', lineHeight: 1,
    }}>{v.stroke}{label ? ` ${label}` : ''}</button>
  );
}

// Standard EXPO section heading. Used everywhere we'd otherwise hand-roll
// `<div style={{fontSize:9, fontFamily:FN, color:C.tm, letterSpacing:'0.18em', fontWeight:700, textTransform:'uppercase'}}>...</div>`
// Single source of truth for the brand caps style so any future tweak (size,
// color, tracking) propagates everywhere instead of having to re-grep 18 files.
// `as` lets the call site choose div vs span vs h3 etc. — defaults to div.
// SectionLabel — used for the small caps heading above a stat / panel /
// form group. Old: fontSize 9 + 0.18em tracking — read as shouty
// micro-text. New: fontSize 11 + 0.04em tracking + a touch lighter
// weight. Still a label, no longer screams.
export const SectionLabel = ({ children, color = C.tm, as: Tag = 'div', style: s }) =>
  <Tag style={{
    fontFamily: FN, fontSize: 11, fontWeight: 600, color,
    letterSpacing: '0.04em', textTransform: 'uppercase',
    ...s,
  }}>{children}</Tag>;
// Card — wraps trainee-grid items, exercise rows, summary stats, etc.
// Strategy: NO visible border at rest. The cardShadow alone defines the
// card edge against the cyan page bg (light) or near-black bg (dark).
// On hover (clickable cards only), the shadow grows + the card lifts
// 1px. This is the Linear / Vercel / Notion pattern — strokes are
// noise, shadows are signal.
export const Card = ({ children, style, onClick, onMouseEnter, onMouseLeave, header, headerRight, leftStripe, padding = 24, draggable, onDragStart, onDragEnd, onDragOver, onDrop, dropActive }) => {
  // Refined light variant: in refined mode every card flips to a white body.
  // When `header` is also passed, the cyan strip is rendered above the body.
  // In dark / non-refined modes the card stays single-zone cyan.
  const refined = isRefined5b();
  // Strip headers render in BOTH light and dark mode so card sizing/layout
  // is identical across themes (Ohad spec 2026-05-23). Light mode strip is
  // full brand cyan; dark mode strip uses the same brand cyan via the
  // --c-stripBg token override below.
  const hasStrip = !!header;
  const padNum = typeof padding === 'number' ? padding : 20;
  return (
    <div onClick={onClick}
      // Clickable cards get a keyboard path (Enter/Space) + button semantics so
      // they aren't mouse-only. No-op when the card isn't interactive.
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(e); } } : undefined}
      draggable={draggable} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragOver={onDragOver} onDrop={onDrop}
      style={{
      background: 'var(--c-sf)',
      border: `1px solid ${C.cardBd}`,
      borderLeft: leftStripe ? `3px solid ${leftStripe}` : `1px solid ${C.cardBd}`,
      borderRadius: 0,
      padding: padNum,
      cursor: draggable ? "grab" : (onClick ? "pointer" : "default"),
      boxShadow: C.cardShadow,
      transition: "box-shadow 0.2s, transform 0.2s",
      ...style,
      ...(dropActive ? { outline: '2px solid var(--c-ac)', outlineOffset: -2 } : null),
    }}
      onMouseEnter={e => {
        if (onClick) {
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(6,20,37,0.08), 0 16px 32px rgba(6,20,37,0.16)';
          e.currentTarget.style.transform = 'translateY(-2px)';
        }
        if (onMouseEnter) onMouseEnter(e);
      }}
      onMouseLeave={e => {
        if (onClick) {
          e.currentTarget.style.boxShadow = C.cardShadow;
          e.currentTarget.style.transform = 'translateY(0)';
        }
        if (onMouseLeave) onMouseLeave(e);
      }}>
      {hasStrip && (
        // Header-only card (no body content): let the strip bleed to the BOTTOM
        // edge too (negative margin cancels the card's bottom padding) so there's
        // no dead band under the title. With a body, keep the normal 12px gap.
        <RefinedHeaderStrip padY={padNum} padX={padNum} marginBottom={children ? 12 : -padNum}>
          {headerRight ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              {/* Pure white in BOTH themes so the dark strip's title reads
                  with the same crispness as the cyan-strip light variant. */}
              <div style={{ minWidth: 0, flex: '1 1 auto', color: '#FFFFFF' }}>{header}</div>
              <div style={{ flex: '0 1 auto', minWidth: 0, display: 'flex', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8, color: '#FFFFFF' }}>{headerRight}</div>
            </div>
          ) : <div style={{ color: '#FFFFFF' }}>{header}</div>}
        </RefinedHeaderStrip>
      )}
      {!hasStrip && header && (
        <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div style={{ minWidth: 0 }}>{header}</div>
          {headerRight && <div style={{ flex: '0 1 auto', minWidth: 0, display: 'flex', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8 }}>{headerRight}</div>}
        </div>
      )}
      {children}
    </div>
  );
};
// Overlay stack. Escape must close ONLY the topmost overlay: Modal,
// ConfirmDialog and useEscClose all attach window-level keydown listeners, and
// preventDefault does not stop the others — so one Escape used to close a
// confirm AND the editor beneath it, discarding a whole unsaved evaluation
// (audit 08-22). Every overlay registers here on open and asks isTopOverlay()
// before reacting.
let overlaySeq = 0;
const overlayStack = [];
function pushOverlay() {
  const id = ++overlaySeq;
  overlayStack.push(id);
  return {
    id,
    isTop: () => overlayStack[overlayStack.length - 1] === id,
    release: () => { const i = overlayStack.indexOf(id); if (i >= 0) overlayStack.splice(i, 1); },
  };
}

// Body-scroll lock, refcounted. Per-instance save/restore broke whenever two
// overlays were open at once: the inner one saved 'hidden' (the outer's lock),
// and when both unmounted in the SAME commit React ran cleanups in tree order —
// outer restored '', then inner re-applied 'hidden'. The page stayed
// permanently unscrollable until a reload (audit 08-22). A counter makes the
// last overlay out the one that unlocks.
let scrollLocks = 0;
let scrollPrev = '';
function lockBodyScroll() {
  if (typeof document === 'undefined') return () => {};
  if (scrollLocks === 0) { scrollPrev = document.body.style.overflow; document.body.style.overflow = 'hidden'; }
  scrollLocks++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    scrollLocks = Math.max(0, scrollLocks - 1);
    if (scrollLocks === 0) document.body.style.overflow = scrollPrev;
  };
}

export const Modal = ({ open, onClose, title, children, wide }) => {
  const titleId = React.useId();
  const cardRef = React.useRef(null);
  const lastFocusRef = React.useRef(null);
  // onClose is almost always an inline arrow (new identity every render). Keep
  // it in a ref so the focus/trap effect can depend on [open] ALONE — if it
  // depended on onClose, every parent re-render (e.g. each keystroke in a
  // form field) re-ran the effect and its setTimeout stole focus back to the
  // first field. That was the app-wide "input gets stuck after every digit".
  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;
  React.useEffect(() => {
    if (!open) return;
    // Lock background scroll while the modal is open — a blocking overlay must
    // not let the page behind it scroll (especially on phones). Restored on close.
    const releaseScroll = lockBodyScroll();
    const layer = pushOverlay();
    // Save the focus element so we can restore on close — keyboard users
    // expect focus to return to the trigger that opened the modal.
    lastFocusRef.current = (typeof document !== 'undefined') ? document.activeElement : null;
    const FOCUSABLE = 'input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';
    const onKey = (e) => {
      if (e.key === 'Escape') { if (!layer.isTop()) return; e.preventDefault(); onCloseRef.current?.(); return; }
      if (e.key !== 'Tab') return;
      if (!layer.isTop()) return; // stacked overlays: only the top one traps Tab (audit 08-22)
      // Focus trap — keep Tab cycling inside the card. Without this,
      // keyboard users can Tab out of the modal into the underlying
      // page even though the modal is visually scrimmed.
      const node = cardRef.current;
      if (!node) return;
      const focusables = Array.from(node.querySelectorAll(FOCUSABLE))
        .filter(el => el.offsetParent !== null || el === node);
      if (focusables.length === 0) {
        e.preventDefault();
        node.focus?.();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !node.contains(active))) {
        e.preventDefault();
        last.focus?.();
      } else if (!e.shiftKey && (active === last || !node.contains(active))) {
        e.preventDefault();
        first.focus?.();
      }
    };
    window.addEventListener('keydown', onKey);
    // Initial focus — first focusable inside the card, falling back to the
    // card itself. Defer to next tick so React has actually mounted the
    // children before the query runs.
    const t = setTimeout(() => {
      const node = cardRef.current;
      if (!node) return;
      const focusable = node.querySelector(
        'input, textarea, select, button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
      );
      (focusable || node).focus?.();
    }, 0);
    return () => {
      window.removeEventListener('keydown', onKey);
      clearTimeout(t);
      layer.release();
      releaseScroll();
      // Restore focus on close — wrapped in try because the prior element
      // may have unmounted (e.g. modal opened from a deleted row).
      try { lastFocusRef.current?.focus?.(); } catch {}
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- onClose via ref
  const { mounted, closing } = useDelayedUnmount(open);
  if (!mounted) return null;
  return portal(
    <div
      role="dialog" aria-modal="true" aria-labelledby={titleId} className={closing ? 'motion-fade-out' : 'motion-fade-in'}
      style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 60, background: C.scrim, backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div ref={cardRef} tabIndex={-1} onClick={e => e.stopPropagation()} className={closing ? 'motion-fall' : 'motion-rise'} style={{ background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 0, width: wide ? 700 : 480, maxWidth: 'calc(100vw - 24px)', maxHeight: "80vh", overflow: "auto", padding: 28, boxShadow: C.cardShadow, outline: 'none' }}>
        {/* Sticky title row: stays pinned (with the ✕) while the body scrolls —
            top:-28 + negative margins swallow the card's own padding so the row
            docks flush at the card top (Ohad, 2026-08-21). */}
        <div style={{ position: "sticky", top: -28, zIndex: 5, background: C.sf, margin: "-28px -28px 22px", padding: "28px 28px 14px", borderBottom: `1px solid ${C.bd}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 id={titleId} style={{ margin: 0, fontFamily: FN, fontSize: 13, color: C.tx, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>{title}</h3>
          <button onClick={onClose} aria-label="Close dialog" style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, color: C.tm, cursor: "pointer", padding: "4px 10px", borderRadius: 0, fontSize: 14 }}>✕</button>
        </div>{children}</div></div>);
};
export const ConfirmDialog = ({ open, onConfirm, onCancel, title, message }) => {
  const titleId = React.useId();
  const msgId = React.useId();
  const cardRef = React.useRef(null);
  const lastFocusRef = React.useRef(null);
  // Ref so the effect depends on [open] alone — see Modal note above.
  const onCancelRef = React.useRef(onCancel);
  onCancelRef.current = onCancel;
  React.useEffect(() => {
    if (!open) return;
    const releaseScroll = lockBodyScroll(); // refcounted — see lockBodyScroll
    const layer = pushOverlay();
    // Mirror Modal's a11y — this is a destructive-confirm dialog, so
    // keyboard escape-to-cancel and focus containment matter most here.
    lastFocusRef.current = (typeof document !== 'undefined') ? document.activeElement : null;
    const FOCUSABLE = 'input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';
    const onKey = (e) => {
      if (e.key === 'Escape') { if (!layer.isTop()) return; e.preventDefault(); onCancelRef.current?.(); return; }
      if (e.key !== 'Tab') return;
      if (!layer.isTop()) return; // stacked overlays: only the top one traps Tab (audit 08-22)
      const node = cardRef.current;
      if (!node) return;
      const focusables = Array.from(node.querySelectorAll(FOCUSABLE)).filter(el => el.offsetParent !== null || el === node);
      if (focusables.length === 0) { e.preventDefault(); node.focus?.(); return; }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !node.contains(active))) { e.preventDefault(); last.focus?.(); }
      else if (!e.shiftKey && (active === last || !node.contains(active))) { e.preventDefault(); first.focus?.(); }
    };
    window.addEventListener('keydown', onKey);
    // Default focus on Cancel — safe default for a destructive prompt so
    // an accidental Enter doesn't confirm the irreversible action. Cancel is
    // the first button rendered in the card.
    const t = setTimeout(() => {
      const node = cardRef.current;
      (node?.querySelector('button') || node)?.focus?.();
    }, 0);
    return () => {
      window.removeEventListener('keydown', onKey);
      clearTimeout(t);
      layer.release();
      releaseScroll();
      try { lastFocusRef.current?.focus?.(); } catch {}
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- onCancel via ref
  const { mounted, closing } = useDelayedUnmount(open);
  if (!mounted) return null;
  return portal(
    <div role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={msgId} className={closing ? 'motion-fade-out' : 'motion-fade-in'} style={{ position: "fixed", inset: 0, zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", background: C.scrim }} onClick={onCancel}>
      <div ref={cardRef} tabIndex={-1} onClick={e => e.stopPropagation()} className={closing ? 'motion-fall' : 'motion-rise'} style={{ background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 0, width: 400, maxWidth: 'calc(100vw - 24px)', padding: 28, boxShadow: C.cardShadow, outline: 'none' }}>
        <h3 id={titleId} style={{ margin: "0 0 10px", fontFamily: FN, fontSize: 13, color: C.tx, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>{title}</h3>
        <p id={msgId} style={{ margin: "0 0 22px", fontSize: 13, color: C.tm, fontFamily: FB, lineHeight: 1.5 }}>{message}</p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Btn variant="ghost" onClick={onCancel}>Cancel</Btn>
          <Btn variant="danger" onClick={onConfirm}>Confirm</Btn>
        </div></div></div>);
};
// Keyboard a11y for hand-rolled dialog overlays that don't use <Modal> /
// <ConfirmDialog>. Adds three things on top of the scrim-click dismiss those
// overlays already have:
//   1. Escape closes (calls onClose)
//   2. Tab is trapped inside the dialog — keyboard users can't fall through
//      to the page behind. Works generically by locating the topmost
//      [role="dialog"] in the DOM, so callers need no ref wiring (every
//      overlay using this hook also sets role="dialog").
//   3. Focus is restored to the trigger element on close.
// Call unconditionally at the top of a component; pass `active` to gate it.
const DIALOG_FOCUSABLE = 'input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';
export const useEscClose = (active, onClose) => {
  // Ref so the effect depends on [active] alone. With onClose (usually an
  // inline arrow) in the deps, every parent re-render re-ran the effect and
  // its cleanup fired prevFocus.focus() — yanking focus out of whatever field
  // the user was typing in. App-wide "input stuck after every digit".
  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;
  React.useEffect(() => {
    if (!active) return;
    // Element focused before the dialog opened — restored on close so
    // keyboard users return to where they were.
    const prevFocus = (typeof document !== 'undefined') ? document.activeElement : null;
    const layer = pushOverlay();
    const onKey = (e) => {
      // Topmost only — a confirm opened OVER this surface owns the Escape.
      if (e.key === 'Escape') { if (!layer.isTop()) return; e.preventDefault(); onCloseRef.current?.(); return; }
      if (e.key !== 'Tab') return;
      if (!layer.isTop()) return; // stacked overlays: only the top one traps Tab (audit 08-22)
      // Trap within the topmost dialog (last one mounted wins for stacks).
      const dialogs = document.querySelectorAll('[role="dialog"]');
      const node = dialogs[dialogs.length - 1];
      if (!node) return;
      const f = Array.from(node.querySelectorAll(DIALOG_FOCUSABLE)).filter(el => el.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1], act = document.activeElement;
      if (e.shiftKey && (act === first || !node.contains(act))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (act === last || !node.contains(act))) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      layer.release();
      // Wrapped — the trigger may have unmounted (e.g. a deleted row).
      try { prevFocus?.focus?.(); } catch {}
    };
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps -- onClose via ref
};
export const EmptyState = ({ icon, message }) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 60, color: C.td }}>
    <div style={{ opacity: 0.3, marginBottom: 12, fontSize: 36 }}>{icon}</div>
    <p style={{ fontFamily: FB, fontSize: 14, fontWeight: 400 }}>{message}</p>
  </div>
);

// Toast bus. Use `toast(msg, kind?)` from anywhere; mount <ToastHost/> once
// near the app root. Keeps mid-workout messaging non-blocking — alert()
// freezes the camera-record flow on iOS, toasts don't.
const _listeners = new Set();
let _seq = 0;
export function toast(message, kind = 'info', opts = {}) {
  const id = ++_seq;
  const item = { id, message, kind, ttl: opts.ttl ?? 4500, actions: opts.actions || null };
  _listeners.forEach(fn => fn({ type: 'add', item }));
  if (item.ttl > 0) setTimeout(() => _listeners.forEach(fn => fn({ type: 'remove', id })), item.ttl);
  return id;
}
export function dismissToast(id) {
  _listeners.forEach(fn => fn({ type: 'remove', id }));
}
// Async confirm dialog returning a promise<boolean>. Replaces window.confirm()
// without blocking the JS thread (window.confirm halts video element on iOS).
// SINGLE-INSTANCE + backdrop-blocking (Ohad: "open once, can't click anything
// else until resolved — like the update popup"). A second call while one is
// already open resolves false immediately instead of stacking a duplicate.
let _confirmActive = false;
// Module-scoped resolver for the currently-open confirm, so an interrupted
// confirm (its ToastHost unmounting on a route flip before the user answers)
// can be force-resolved to `false` instead of stranding `_confirmActive = true`
// forever — which would make every subsequent confirmToast() silently return
// false and no dialog ever appear again.
let _confirmFinish = null;
export function confirmToast(message, { okLabel = 'OK', cancelLabel = 'Cancel' } = {}) {
  if (_confirmActive) return Promise.resolve(false); // no stacking
  _confirmActive = true;
  return new Promise(resolve => {
    const finish = v => { _confirmActive = false; _confirmFinish = null; resolve(v); dismissToast(id); };
    _confirmFinish = finish;
    const id = toast(message, 'confirm', {
      ttl: 0,
      actions: [
        { label: cancelLabel, variant: 'ghost', value: false },
        { label: okLabel, variant: 'primary', value: true },
      ],
    });
    // patch the just-created item with onAction (toast() doesn't accept it as-is)
    _listeners.forEach(fn => fn({ type: 'patch', id, patch: { onAction: finish } }));
  });
}

export function ToastHost() {
  const [items, setItems] = React.useState([]);
  // Track whether THIS host is currently showing a confirm, so its unmount
  // cleanup can release a stranded confirm (and only then).
  const hasConfirmRef = React.useRef(false);
  hasConfirmRef.current = items.some(x => x.kind === 'confirm');
  React.useEffect(() => {
    const fn = (ev) => {
      if (ev.type === 'add') setItems(prev => [...prev, ev.item]);
      else if (ev.type === 'remove') setItems(prev => prev.filter(x => x.id !== ev.id));
      else if (ev.type === 'patch') setItems(prev => prev.map(x => x.id === ev.id ? { ...x, ...ev.patch } : x));
    };
    _listeners.add(fn);
    return () => {
      _listeners.delete(fn);
      // If this host is torn down (e.g. a route flip) while a confirm is still
      // open, force-resolve it to false so _confirmActive doesn't stay latched.
      if (hasConfirmRef.current && _confirmActive && _confirmFinish) _confirmFinish(false);
    };
  }, []);
  if (!items.length) return null;
  const palette = {
    info:    { bg: C.sf2,  fg: C.tx,  bd: `rgba(57,189,255,0.4)` },
    success: { bg: C.gnD,  fg: C.gn,  bd: `rgba(46,213,115,0.4)` },
    error:   { bg: C.rdD,  fg: C.rd,  bd: `rgba(255,71,87,0.4)` },
    warn:    { bg: C.orD,  fg: C.or,  bd: `rgba(255,165,2,0.4)` },
    confirm: { bg: C.sf2,  fg: C.tx,  bd: `rgba(57,189,255,0.6)` },
  };
  // Confirms render as a centered, backdrop-blocking modal (Ohad: "can't click
  // anything else until resolved"); plain toasts keep the bottom stack.
  const confirms = items.filter(it => it.kind === 'confirm');
  const toasts = items.filter(it => it.kind !== 'confirm');
  const confirm = confirms[0]; // single-instance guaranteed by confirmToast()
  const p = confirm ? (palette.confirm) : null;
  return (
    <>
      {confirm && (
        <div role="alertdialog" aria-modal="true"
          onKeyDown={e => { if (e.key === 'Escape' && confirm.onAction) confirm.onAction(false); }}
          onClick={e => { if (e.target === e.currentTarget && confirm.onAction) confirm.onAction(false); }}
          style={{ position: 'fixed', inset: 0, zIndex: 1310, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: C.sf, color: p.fg, border: `1px solid ${p.bd}`, borderRadius: 0, padding: '18px 20px', fontFamily: FB, fontSize: 13, fontWeight: 500, boxShadow: `0 16px 48px ${C.shadow}`, minWidth: 280, maxWidth: 460, display: 'flex', flexDirection: 'column', gap: 14, textAlign: 'center' }}>
            <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>{confirm.message}</div>
            {confirm.actions && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
                {/* Focus the FIRST action (Cancel) — confirmToast always builds
                    [cancel, ok], so an accidental Enter cancels instead of
                    confirming a possibly-destructive action (matches ConfirmDialog). */}
                {confirm.actions.map((a, i) => (
                  <Btn key={i} variant={a.variant || 'ghost'} autoFocus={i === 0} onClick={() => { if (confirm.onAction) confirm.onAction(a.value); }}>{a.label}</Btn>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      <div role="status" aria-live="polite" aria-atomic="false" style={{ position: 'fixed', left: '50%', bottom: 20, transform: 'translateX(-50%)', zIndex: 1300, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', pointerEvents: 'none', maxWidth: 'calc(100vw - 32px)' }}>
        {toasts.map(it => {
          const tp = palette[it.kind] || palette.info;
          return (
            <div key={it.id}
              style={{ pointerEvents: 'auto', background: C.sf, color: tp.fg, border: `1px solid ${tp.bd}`, borderRadius: 0, padding: '12px 16px', fontFamily: FB, fontSize: 13, fontWeight: 500, boxShadow: `0 8px 24px ${C.shadow}`, minWidth: 240, maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'center' }}>
              <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>{it.message}</div>
              {it.actions && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
                  {it.actions.map((a, i) => (
                    <Btn key={i} variant={a.variant || 'ghost'} onClick={() => { if (it.onAction) it.onAction(a.value); dismissToast(it.id); }}>{a.label}</Btn>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
