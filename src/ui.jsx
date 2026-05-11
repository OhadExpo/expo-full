import React from 'react';
import { C, FN, FB } from './theme';

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
  textAlign: "center",
};
export const baseBtn = {
  display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 18px",
  borderRadius: 0, border: "none", fontFamily: FN, fontSize: 11, fontWeight: 700, cursor: "pointer",
  letterSpacing: "0.12em", textTransform: "uppercase", transition: "all 0.15s",
};
const variants = {
  primary: { background: 'transparent', color: C.ac, border: `1px solid ${C.ac}` },
  ghost: { background: "transparent", color: C.tm, border: `1px solid ${C.cardBd}` },
  danger: { background: 'transparent', color: C.rd, border: `1px solid ${C.rd}` },
  success: { background: 'transparent', color: C.gn, border: `1px solid ${C.gn}` },
};
export const Btn = ({ children, variant = "primary", onClick, style, ...rest }) =>
  <button onClick={onClick} style={{ ...baseBtn, ...variants[variant], ...style }} {...rest}>{children}</button>;

export const Input = ({ label, style: s, ...props }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
    {label && <label style={{ fontSize: 9, fontWeight: 700, color: C.tm, textTransform: "uppercase", letterSpacing: "0.18em", fontFamily: FN, textAlign: "center" }}>{label}</label>}
    <input style={{ ...baseInput, ...s }} {...props} />
  </div>
);

// Multi-email editor: value is string[] (UI form shape), onChange(next: string[]).
// Shows one row per email with a × to remove, plus a "+ Add Email" button up to max.
export const EmailsInput = ({ label = "Email(s)", value, onChange, max = 3, placeholder = "email@example.com" }) => {
  const arr = value && value.length ? value : [''];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 9, fontWeight: 700, color: C.tm, textTransform: 'uppercase', letterSpacing: '0.18em', fontFamily: FN, textAlign: 'center' }}>{label}</label>
      {arr.map((em, i) => (
        <div key={i} style={{ display: 'flex', gap: 4 }}>
          <input value={em} onChange={e => { const next = [...arr]; next[i] = e.target.value; onChange(next); }} placeholder={placeholder} style={{ ...baseInput, flex: 1 }} />
          {arr.length > 1 && <button onClick={() => { const next = [...arr]; next.splice(i, 1); onChange(next); }} style={{ background: 'var(--c-sf)', border: `1px solid ${C.rd}`, borderRadius: 0, padding: '0 10px', color: C.rd, cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>}
        </div>
      ))}
      {arr.length < max && (
        <button onClick={() => onChange([...arr, ''])} style={{ background: 'var(--c-sf)', border: `0.25px dashed ${C.cardBd}`, borderRadius: 0, padding: '6px 10px', color: C.ac, cursor: 'pointer', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>+ Add Email</button>
      )}
    </div>
  );
};

export const Select = ({ label, options, value, onChange, placeholder }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
    {label && <label style={{ fontSize: 9, fontWeight: 700, color: C.tm, textTransform: "uppercase", letterSpacing: "0.18em", fontFamily: FN, textAlign: "center" }}>{label}</label>}
    <select value={value || ""} onChange={e => onChange(e.target.value)} style={{ ...baseInput, appearance: "none", paddingRight: 30 }}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(o => <option key={typeof o==="object"?o.value:o} value={typeof o==="object"?o.value:o}>{typeof o==="object"?o.label:o}</option>)}
    </select>
  </div>
);
export const TextArea = ({ label, ...props }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
    {label && <label style={{ fontSize: 9, fontWeight: 700, color: C.tm, textTransform: "uppercase", letterSpacing: "0.18em", fontFamily: FN, textAlign: "center" }}>{label}</label>}
    <textarea style={{ ...baseInput, minHeight: 60, resize: "vertical" }} {...props} />
  </div>
);
export const Badge = ({ children, color = C.ac, style: s }) =>
  <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 0, fontSize: 10, fontWeight: 700, fontFamily: FN, background: C.badgeBg, border: `1px solid ${color}`, color, letterSpacing: "0.1em", textTransform: "uppercase", ...s }}>{children}</span>;

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
  return (
    <div style={{
      background: 'var(--c-sf)',
      margin: `-${padY}px -${padX}px ${marginBottom}px`,
      padding: `8px ${padX}px`,
      borderBottom: '1px solid rgba(0,0,0,0.10)',
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
  const refined = isRefined5b();
  const baseBorder = `1px solid ${C.cardBd}`;
  return (
    <div className={className} style={{
      background: refined ? '#FFFFFF' : 'var(--c-sf)',
      border: baseBorder,
      borderLeft: leftStripe ? `3px solid ${leftStripe}` : baseBorder,
      borderRadius: 0,
      padding: `${padY}px ${padX}px`,
      boxShadow: C.cardShadow,
      ...style,
    }}>
      {refined && header && (
        <RefinedHeaderStrip padY={padY} padX={padX} marginBottom={12}>
          {headerRight ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div style={{ minWidth: 0, flex: '1 1 auto' }}>{header}</div>
              <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 8 }}>{headerRight}</div>
            </div>
          ) : header}
        </RefinedHeaderStrip>
      )}
      {!refined && header && (
        <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div style={{ minWidth: 0 }}>{header}</div>
          {headerRight && <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 8 }}>{headerRight}</div>}
        </div>
      )}
      {children}
    </div>
  );
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
    <div style={{ overflowX: 'auto', background: refined ? '#FFFFFF' : 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0 }}>
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
                <td key={i} style={{ padding: '12px', textAlign: columns[i].align || 'left', verticalAlign: 'middle' }}>{cell}</td>
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
export const Card = ({ children, style, onClick, onMouseEnter, onMouseLeave, header, headerRight, leftStripe, padding = 20 }) => {
  // Refined light variant: when `header` is passed AND the theme is refined,
  // render the cyan-strip + white-body pattern. Otherwise fall back to the
  // legacy single-zone card so all existing call sites keep working.
  const refined = isRefined5b();
  const hasStrip = refined && header;
  const padNum = typeof padding === 'number' ? padding : 20;
  return (
    <div onClick={onClick} style={{
      background: hasStrip ? '#FFFFFF' : 'var(--c-sf)',
      border: `1px solid ${C.cardBd}`,
      borderLeft: leftStripe ? `3px solid ${leftStripe}` : `1px solid ${C.cardBd}`,
      borderRadius: 0,
      padding: padNum,
      cursor: onClick ? "pointer" : "default",
      boxShadow: C.cardShadow,
      transition: "box-shadow 0.2s, transform 0.2s",
      ...style,
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
        <RefinedHeaderStrip padY={padNum} padX={padNum} marginBottom={12}>
          {headerRight ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div style={{ minWidth: 0, flex: '1 1 auto', color: '#FFFFFF' }}>{header}</div>
              <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 8 }}>{headerRight}</div>
            </div>
          ) : <div style={{ color: '#FFFFFF' }}>{header}</div>}
        </RefinedHeaderStrip>
      )}
      {!hasStrip && header && (
        <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div style={{ minWidth: 0 }}>{header}</div>
          {headerRight && <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 8 }}>{headerRight}</div>}
        </div>
      )}
      {children}
    </div>
  );
};
export const Modal = ({ open, onClose, title, children, wide }) => {
  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 60, background: C.scrim, backdropFilter: "blur(8px)" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 0, width: wide ? 700 : 480, maxHeight: "80vh", overflow: "auto", padding: 28, boxShadow: C.cardShadow }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          <h3 style={{ margin: 0, fontFamily: FN, fontSize: 16, color: C.tx, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, color: C.tm, cursor: "pointer", padding: "4px 10px", borderRadius: 0, fontSize: 14 }}>✕</button>
        </div>{children}</div></div>);
};
export const ConfirmDialog = ({ open, onConfirm, onCancel, title, message }) => {
  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", background: C.scrim }} onClick={onCancel}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 0, width: 400, padding: 28, boxShadow: C.cardShadow }}>
        <h3 style={{ margin: "0 0 10px", fontFamily: FN, fontSize: 15, color: C.tx, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" }}>{title}</h3>
        <p style={{ margin: "0 0 22px", fontSize: 13, color: C.tm, fontFamily: FB, lineHeight: 1.5 }}>{message}</p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Btn variant="ghost" onClick={onCancel}>Cancel</Btn>
          <Btn variant="danger" onClick={onConfirm}>Confirm</Btn>
        </div></div></div>);
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
export function confirmToast(message, { okLabel = 'OK', cancelLabel = 'Cancel' } = {}) {
  return new Promise(resolve => {
    const id = toast(message, 'confirm', {
      ttl: 0,
      actions: [
        { label: cancelLabel, variant: 'ghost', value: false },
        { label: okLabel, variant: 'primary', value: true },
      ],
      onAction: v => resolve(v),
    });
    // patch the just-created item with onAction (toast() doesn't accept it as-is)
    _listeners.forEach(fn => fn({ type: 'patch', id, patch: { onAction: v => { resolve(v); dismissToast(id); } } }));
  });
}

export function ToastHost() {
  const [items, setItems] = React.useState([]);
  React.useEffect(() => {
    const fn = (ev) => {
      if (ev.type === 'add') setItems(prev => [...prev, ev.item]);
      else if (ev.type === 'remove') setItems(prev => prev.filter(x => x.id !== ev.id));
      else if (ev.type === 'patch') setItems(prev => prev.map(x => x.id === ev.id ? { ...x, ...ev.patch } : x));
    };
    _listeners.add(fn);
    return () => { _listeners.delete(fn); };
  }, []);
  if (!items.length) return null;
  const palette = {
    info:    { bg: C.sf2,  fg: C.tx,  bd: `rgba(57,189,255,0.4)` },
    success: { bg: C.gnD,  fg: C.gn,  bd: `rgba(46,213,115,0.4)` },
    error:   { bg: C.rdD,  fg: C.rd,  bd: `rgba(255,71,87,0.4)` },
    warn:    { bg: C.orD,  fg: C.or,  bd: `rgba(255,165,2,0.4)` },
    confirm: { bg: C.sf2,  fg: C.tx,  bd: `rgba(57,189,255,0.6)` },
  };
  return (
    <div style={{ position: 'fixed', left: '50%', bottom: 20, transform: 'translateX(-50%)', zIndex: 1300, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', pointerEvents: 'none', maxWidth: 'calc(100vw - 32px)' }}>
      {items.map(it => {
        const p = palette[it.kind] || palette.info;
        return (
          <div key={it.id} style={{ pointerEvents: 'auto', background: C.sf, color: p.fg, border: `1px solid ${p.bd}`, borderRadius: 0, padding: '12px 16px', fontFamily: FB, fontSize: 13, fontWeight: 500, boxShadow: `0 8px 24px ${C.shadow}`, minWidth: 240, maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'center' }}>
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
  );
}
