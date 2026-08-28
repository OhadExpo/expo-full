// Shared left filter-rail — this IS the Tasks-page sidebar, lifted verbatim so
// Programs and Athletes render the EXACT same rail (Ohad: "copy the tasks
// sidebar and rebuild it to fit athletes and programs"). One source of truth:
// container panel, search box at the top, "Filters" underline header, then
// RailGroup sections of RailOpt text-rows. Page-specific data comes in via the
// `groups` prop; a page-specific action (e.g. + New Program) via `footer`.
import React, { useState } from 'react';
import { FN } from './theme';
import { useT } from './i18n';

// Section label — dim mono heading above a group of options.
export function RailGroup({ label, children }) {
  return (
    <div>
      <div style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', color: 'var(--c-td)', textTransform: 'uppercase', padding: '0 14px', marginBottom: 5 }}>{label}</div>
      {children}
    </div>
  );
}

// One filter row — borderless, left accent bar, active = accent-tint fill, muted
// count on the right. `accent` defaults to the brand cyan (identical to Tasks);
// pass a colour (amber/red) for triage flags so their active state reads by hue.
export function RailOpt({ label, count, active, onClick, title, accent }) {
  const [hov, setHov] = useState(false);
  const ac = accent || 'var(--c-ac)';
  // Hebrew (athlete names) must render clean: Nord has no Hebrew glyphs so it
  // falls to Heebo everywhere — but letter-spacing + uppercase are Latin-label
  // treatments that mangle Hebrew (spread-apart, no case), which is what read as
  // "not the right font" in the sidebar (Ohad #191/#192). Drop both for Hebrew.
  const heb = /[֐-׿]/.test(String(label || ''));
  return (
    <button onClick={onClick} title={title}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', width: '100%', height: 28, border: 'none', padding: 0, cursor: 'pointer',
        background: active ? `color-mix(in srgb, ${ac} 20%, transparent)` : (hov ? 'var(--c-sf3, rgba(127,127,138,0.10))' : 'transparent'),
        color: active ? ac : (hov ? 'var(--c-tx)' : 'var(--c-tm)'),
        fontFamily: FN, fontSize: 10, fontWeight: active ? 800 : 700, letterSpacing: heb ? 0 : '0.05em', textTransform: heb ? 'none' : 'uppercase',
        transition: 'background .12s, color .12s',
      }}>
      <span style={{ width: 3, alignSelf: 'stretch', background: ac, opacity: active ? 1 : 0, flexShrink: 0 }} />
      <span style={{ flex: 1, textAlign: 'left', padding: '0 8px 0 14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      {count != null && <span style={{ paddingRight: 14, fontSize: 9, fontWeight: 700, opacity: active ? 0.9 : 0.55, flexShrink: 0 }}>{count}</span>}
    </button>
  );
}

// The rail. `groups` = [{ label, opts:[{ key?, label, count?, active, onClick, title?, accent? }] }].
// `footer` renders pinned at the bottom (page action). Narrow collapses to just
// the search + Filters toggle, exactly like the Tasks rail.
export function SideRail({
  groups = [], footer = null, search = '', onSearch, searchPlaceholder = 'Search…', searchTitle,
  narrow = false, railOpen = false, setRailOpen,
  width = 204, top = 66, maxHeight = 'calc(100vh - 84px)', className = '',
}) {
  const tt = useT();
  return (
    <div className={`side-rail ${className}`} style={{
      width: narrow ? 'auto' : width, flexShrink: 0,
      background: 'var(--c-sf2)', border: '1px solid var(--c-cardBd)', boxSizing: 'border-box',
      padding: (narrow && !railOpen) ? '12px 0' : '14px 0 16px', display: 'flex', flexDirection: 'column', gap: 12,
      alignSelf: 'flex-start',
      position: narrow ? 'static' : 'sticky', top: narrow ? undefined : top,
      maxHeight: narrow ? undefined : maxHeight, overflowY: narrow ? 'visible' : 'auto',
      // Stop the scrollbar-thumb jitter at the very bottom of the track (Ohad #196):
      // a reserved gutter kills the width flicker, and scroll-containment stops the
      // sticky rail from chaining its scroll into the page once it bottoms out.
      scrollbarGutter: narrow ? undefined : 'stable', overscrollBehavior: 'contain',
    }}>
      {/* Search box at the TOP of the sidebar, above Filters (Ohad). */}
      <div style={{ padding: '0 14px 12px' }}>
        <input value={search} onChange={e => onSearch?.(e.target.value)} placeholder={searchPlaceholder} title={searchTitle}
          style={{ width: '100%', height: 38, boxSizing: 'border-box', padding: '0 11px', borderRadius: 0, background: 'var(--c-sf)', color: 'var(--c-tx)', border: '1px solid var(--c-cardBd)', fontFamily: FN, fontSize: 11, fontWeight: 500, letterSpacing: '0.04em', outline: 'none', textAlign: 'left' }} autoComplete="off" />
      </div>
      {/* Filters header — static label + underline on desktop; tap-to-collapse
          toggle with chevron on narrow. */}
      <div onClick={narrow ? () => setRailOpen?.(o => !o) : undefined}
        style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.22em', color: 'var(--c-ac)', textTransform: 'uppercase', padding: (narrow && !railOpen) ? '0 16px' : '0 16px 10px', borderBottom: (narrow && !railOpen) ? 'none' : '1px solid var(--c-cardBd)', cursor: narrow ? 'pointer' : 'default', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span>{tt('Filters')}</span>
        {narrow && <span aria-hidden style={{ fontSize: 11, lineHeight: 1, transform: railOpen ? 'rotate(180deg)' : 'none', transition: 'transform 180ms ease' }}>▾</span>}
      </div>

      {(!narrow || railOpen) && (<>
        {groups.map((g, i) => (
          <RailGroup key={g.label || i} label={tt(g.label)}>
            {g.opts.map((o, j) => (
              <RailOpt key={o.key || o.label || j} label={o.label} count={o.count} active={o.active} onClick={o.onClick} title={o.title} accent={o.accent} />
            ))}
          </RailGroup>
        ))}
        {footer && <div style={{ padding: '0 14px', marginTop: 'auto' }}>{footer}</div>}
      </>)}
    </div>
  );
}
