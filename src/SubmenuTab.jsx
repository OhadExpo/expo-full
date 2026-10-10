// SubmenuTab - the coach nav's dropdown tab, SHARED by the real app (App.jsx)
// and the coach demo (CoachDemo.jsx) so the demo's nav is the same component,
// not a drawing of it (29.9 #441 / #448: the demo showed its own pill row).
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { C, FN } from './theme';
import { baseBtn } from './ui';

const HDR_ICON_H = 36;   // the one control height (see themes.css --btn-h)

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
export default function SubmenuTab({ id, label, count, items, tab, navTo, activeStyle, isChosen, countColor }) {
  const [open, setOpen] = useState(false);
  const btnRef = React.useRef(null);
  const menuRef = React.useRef(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  // Hover-open with a short close delay so crossing the gap between the
  // trigger and the menu doesn't snap it shut. The entrance itself uses the
  // global .motion-rise (fade + 6px rise, reduced-motion safe) so it eases
  // open instead of jumping. Click still toggles for touch.
  const closeTimer = React.useRef(null);
  // A CLICK MUST NOT UNDO WHAT THE HOVER JUST DID.
  //
  // Ohad, 20.9: "submenus on expo top menu not working good". Traced on the
  // built app, and it was not touch-specific at all:
  //     start         aria-expanded=false
  //     after HOVER   true
  //     after CLICK   FALSE
  // Hovering opens the panel and then clicking the trigger — the obvious thing
  // to do next — closes it. On a phone it is worse: the browser fires an
  // emulated mouseenter before the click, so the panel opens and shuts inside
  // one tap and the menu simply never appears.
  //
  // So remember WHERE the open came from. A click on a panel that hover opened
  // means "keep this", not "toggle"; a click on a closed panel opens it; a
  // click on a panel the user themselves clicked open closes it.
  const openedByHover = React.useRef(false);
  const hoverOpen = () => { if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; } openedByHover.current = true; setOpen(true); };
  const hoverClose = () => { if (closeTimer.current) clearTimeout(closeTimer.current); closeTimer.current = setTimeout(() => { openedByHover.current = false; setOpen(false); }, 160); };
  // A TAP IS NOT A HOVER. pointerenter fires for touch too, so without this the
  // emulated hover re-creates the same bug on a phone.
  const pointerOpen = (e) => { if (e && e.pointerType === 'touch') return; hoverOpen(); };
  const pointerClose = (e) => { if (e && e.pointerType === 'touch') return; hoverClose(); };
  const toggle = () => setOpen((o) => {
    if (o && openedByHover.current) { openedByHover.current = false; return true; }
    openedByHover.current = false;
    return !o;
  });
  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);
  useEffect(() => {
    if (!open || !btnRef.current) return;
    // 17.9 (Ohad, phone): "submenus in the top menu like athletes and sessions gets cut out".
    // The trigger sits far along the scrolling rail, so aligning the panel to its left edge put
    // it at x 260..440 in a 412px screen - a third of it off-screen. Clamp it into the viewport
    // (and hang it from the trigger's RIGHT edge in RTL, which is the same rule mirrored).
    const recalc = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      const w = menuRef.current?.offsetWidth || 180;
      const rtl = getComputedStyle(document.documentElement).direction === 'rtl' || document.body.dataset.lang === 'he';
      const wanted = rtl ? r.right - w : r.left;
      const left = Math.max(8, Math.min(wanted, window.innerWidth - w - 8));
      // same place = no new state: every scroll frame re-rendered the menu (AUDIT-470)
      setCoords((c) => (c && c.top === r.bottom + 4 && c.left === left ? c : { top: r.bottom + 4, left }));
    };
    recalc();
    // again once the panel has a measured width
    const raf = requestAnimationFrame(recalc);
    // THE MENU GOES WHEN ITS RAIL MOVES (10.10 #652, Ohad on his phone: "Top menu still
    // glitching"). Swiping the header rail with a panel open slid the trigger under the logo
    // plate while the panel floated on beside it, chasing a tab that was no longer there. A
    // swipe of the rail means the coach moved on: the panel closes. A scroll of the PAGE (or
    // any scroller the trigger is not inside) still only re-places it.
    const onScroll = (e) => {
      const sc = e && e.target;
      if (sc && sc !== document && sc.nodeType === 1 && btnRef.current && sc.contains(btnRef.current) && sc.scrollWidth > sc.clientWidth + 1) { setOpen(false); return; }
      recalc();
    };
    window.addEventListener('resize', recalc);
    window.addEventListener('scroll', onScroll, true);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', recalc); window.removeEventListener('scroll', onScroll, true); };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const selector = `[data-submenu-id="${id}"]`;
    // THE PANEL IS PORTALLED TO <body>, so in the DOM it is not inside the
    // [data-submenu-id] wrapper and closest() cannot find it. Every press on a
    // menu item therefore read as an outside click: mousedown closed the panel,
    // it unmounted, and the item's click never fired — "the top menu submenu is
    // not clickable anywhere" (Ohad, 26.9). Inside means the trigger OR the panel.
    const onDoc = (e) => {
      if (e.target.closest?.(selector)) return;
      if (menuRef.current && menuRef.current.contains(e.target)) return;
      setOpen(false);
    };
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
    <div data-submenu-id={id} onPointerEnter={pointerOpen} onPointerLeave={pointerClose} style={{ display: 'inline-flex', position: 'relative' }}>
      <button ref={btnRef} onClick={toggle}
        aria-expanded={open}
        aria-current={isSectionActive ? 'page' : undefined} aria-selected={isSectionActive}
        className={!isSectionActive ? 'nav-item-inactive' : undefined}
        // alignItems:center (was baseline) so the label, count, and
        // chevron share one optical center-line. baseline-mode let
        // the chevron drift below the cap-height of the label.
        // gap:6 inherits from baseBtn, no per-child margins needed.
        style={{ ...baseBtn, height: HDR_ICON_H, boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, borderRadius: 0, padding: '0 8px', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap', ...activeStyle }}>
        <span>{label}</span>
        {count != null && <span className="nav-count" style={{ fontSize: 10, color: countColor, fontFamily: FN }}>{count}</span>}
        <span style={{ fontSize: 10, lineHeight: 1, display: 'inline-block', transition: 'transform .2s cubic-bezier(.22,.61,.36,1)', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}><svg aria-hidden viewBox="0 0 9 6" fill="none" width="0.95em" height="0.63em" style={{ display: 'inline-block', verticalAlign: 'middle' }}><path d="M1 1l3.5 3.5L8 1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
      </button>
      {/* 17.9: fixed was not enough - the panel sits in the header's stacking context, so the page
          content painted OVER it on a phone. Portalled to <body>, per the app-wide overlay rule. */}
      {open && createPortal(
        <div ref={menuRef} data-submenu-id={id} className="motion-rise" onPointerEnter={pointerOpen} onPointerLeave={pointerClose} style={{
          position: 'fixed', top: coords.top, left: coords.left, maxWidth: 'calc(100vw - 16px)',
          background: 'var(--c-bg)', border: `1px solid ${C.cardBd}`,
          minWidth: 180, zIndex: 100000, transformOrigin: 'top center',
          boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
        }}>
          {items.map(it => {
            const isItemActive = tab === it.route;
            return (
              <button key={it.route} aria-current={isItemActive ? 'page' : undefined} aria-selected={isItemActive} role="menuitem" className={!isItemActive ? 'nav-item-inactive' : undefined} onClick={() => { setOpen(false); navTo(it.route); }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14,
                  width: '100%', padding: '10px 14px',
                  background: isItemActive ? C.acD : 'transparent',
                  color: isItemActive ? C.ac : C.tx,
                  border: 'none', borderBottom: `1px solid ${C.cardBd}`,
                  fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em',
                  textTransform: 'uppercase', textAlign: 'start', cursor: 'pointer',
                }}>
                <span>{it.label}</span>
                {it.count != null && <span style={{ fontSize: 10, color: isItemActive ? C.ac : C.td, fontFamily: FN }}>{it.count}</span>}
              </button>
            );
          })}
        </div>, document.body)}
    </div>
  );
}
