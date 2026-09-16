// THE TOP MENU, asked for five times.
//
// Measured on production at 390 (his own width), after 90px of thumb-scroll:
// the DASHBOARD tab sits at x 52..153 while the logo — position:sticky,
// inset-inline-start:0, z-index:3, opaque background — occupies 16..130. 78 of
// the tab's 101px are behind the logo. That is exactly his screenshot: a cyan
// box with "ARD" sticking out of it.
//
// It is not a spacing bug, it is the STRUCTURE: at phone width the whole bar is
// the scroller and the logo is pinned inside it, so every tab scrolls
// underneath by design. The previous fix made the logo OPAQUE so the nav would
// hide behind it instead of showing through — which is the thing he is looking
// at.
//
// The logo comes out of the scroller. The bar becomes two columns: a static
// logo, and a rail that holds the nav and the right cluster and scrolls beside
// it. A tab can no longer reach the logo's x, so it can never be covered — and
// one swipe still carries you from the first tab to sign-out, which is the rule
// that made this one row in the first place.
//
// Desktop is untouched: .hdr-rail is display:contents above 700px, so the nav
// and the right cluster stay direct flex children of the bar exactly as before.
import fs from 'node:fs';
const f = 'src/App.jsx';
let s = fs.readFileSync(f, 'utf8');
const rep = (a, b, l) => { const n = s.split(a).length - 1; if (n !== 1) throw new Error(l + ' x' + n); s = s.replace(a, b); console.log('ok', l); };

// ---- 1. the rail wrapper: opens right after the logo -----------------------
rep(`          <nav ref={coachNavRef} className="hdr-scroll" style={{display:"flex",gap:6,`,
    `          <div className="hdr-rail">
          <nav ref={coachNavRef} className="hdr-scroll" style={{display:"flex",gap:6,`, 'rail opens');

// ---- 2. ...and closes after the right cluster ------------------------------
rep(`            </div></div></header>`, `            </div></div></div></header>`, 'rail closes');

// ---- 3. the CSS ------------------------------------------------------------
rep(`          @media (max-width: 700px) {
            /* ONE ROW, logo pinned, everything else scrolls past it. Wrapping
               the nav onto its own row fixed the 12px-wide nav but broke the
               rule, so the header became two rows on every phone. The bar
               itself is the scroller now and the logo is sticky at its left. */
            div.hdr-scroll { flex-wrap: nowrap !important; height: 56px !important; overflow-x: auto !important; overflow-y: hidden !important; padding-inline-start: 16px !important; padding-inline-end: 0 !important; }
            /* Opaque, with an edge - otherwise the nav scrolls UNDER the logo and
               shows through it. The header's own background is the only correct
               fill here, and it differs per theme. */
            div.hdr-scroll > :first-child { position: sticky; inset-inline-start: 0; z-index: 3; background: inherit;
              align-self: stretch; display: flex; align-items: center; padding-inline-end: 12px;
              border-inline-end: 1px solid var(--c-cardBd); box-shadow: 6px 0 10px -6px rgba(0,0,0,0.35); }
            div.hdr-scroll { background: inherit; }
            nav.hdr-scroll { flex: 0 0 auto !important; overflow: visible !important; min-width: 0 !important; }
            .hdr-right { flex: 0 0 auto !important; margin-inline-start: 8px !important; padding-inline-end: 16px !important; }
          }`,
`          /* Above 700px the rail is not a box at all - display:contents leaves
             the nav and the right cluster as direct flex children of the bar,
             so the desktop header is byte-for-byte what it was. */
          .hdr-rail { display: contents; }
          @media (max-width: 700px) {
            /* ONE ROW, and the logo is OUT of the scroller.
               It used to be sticky INSIDE it: every tab scrolled underneath and
               the opaque background hid whatever was there. Measured on his own
               width, the active DASHBOARD tab sat at 52..153 with the logo over
               16..130 - 78px of it behind the logo, which is the screenshot he
               sent five times. Now the bar is a plain two-column flex: a static
               logo, and a rail beside it that scrolls. A tab cannot reach the
               logo's x, so it cannot be covered, and one swipe still carries you
               from the first tab to sign-out. */
            div.hdr-scroll { flex-wrap: nowrap !important; height: 56px !important; overflow-x: visible !important; overflow-y: visible !important; padding-inline-start: 16px !important; padding-inline-end: 0 !important; background: inherit; }
            div.hdr-scroll > :first-child { position: static; z-index: auto; flex: 0 0 auto;
              align-self: stretch; display: flex; align-items: center; padding-inline-end: 12px;
              border-inline-end: 1px solid var(--c-cardBd); }
            .hdr-rail { display: flex !important; align-items: center; flex: 1 1 auto; min-width: 0;
              height: 56px; overflow-x: auto; overflow-y: hidden;
              -ms-overflow-style: none; scrollbar-width: none; -webkit-overflow-scrolling: touch;
              padding-inline-start: 12px; }
            .hdr-rail::-webkit-scrollbar { display: none; }
            nav.hdr-scroll { flex: 0 0 auto !important; overflow: visible !important; min-width: 0 !important; }
            .hdr-right { flex: 0 0 auto !important; margin-inline-start: 8px !important; padding-inline-end: 16px !important; }
          }`, 'css');
fs.writeFileSync(f, s);
