// "it gets cut in a solid line, try and add some kind of blur or effect to make
// it a little less rough" (Ohad, 15.9, the club zone's tab rail on his phone).
//
// A horizontal rail that scrolls is guillotined by the viewport: half a word,
// a hard vertical edge. Now each rail fades on whichever side still hides
// content - and only that side, so a rail scrolled to its end has a clean edge
// there and a fade behind it. The state is measured from the children's own
// rectangles, not from scrollLeft, because scrollLeft is signed differently in
// RTL and this app runs in both directions.
import fs from 'node:fs';
const rep = (f, a, b, l) => { let s = fs.readFileSync(f, 'utf8'); const n = s.split(a).length - 1; if (n !== 1) throw new Error(l + ' x' + n); fs.writeFileSync(f, s.replace(a, b)); console.log('ok', l); };

// ---------------------------------------------------------------- css ----
fs.appendFileSync('src/themes.css', `

/* ── Edge fades on horizontal rails ──────────────────────────────────────
   A scrolling strip of tabs used to be cut dead flat by the viewport edge
   (Ohad, 15.9: "it gets cut in a solid line … make it a little less rough").
   useEdgeFade() writes data-fade on the scroller; the mask softens only the
   side that actually hides something. Physical left/right on purpose: the
   hook measures real rectangles, so this works in RTL unchanged. */
[data-fade="left"]   { -webkit-mask-image: linear-gradient(to right, transparent 0, #000 22px, #000 100%); mask-image: linear-gradient(to right, transparent 0, #000 22px, #000 100%); }
[data-fade="right"]  { -webkit-mask-image: linear-gradient(to right, #000 0, #000 calc(100% - 22px), transparent 100%); mask-image: linear-gradient(to right, #000 0, #000 calc(100% - 22px), transparent 100%); }
[data-fade="both"]   { -webkit-mask-image: linear-gradient(to right, transparent 0, #000 22px, #000 calc(100% - 22px), transparent 100%); mask-image: linear-gradient(to right, transparent 0, #000 22px, #000 calc(100% - 22px), transparent 100%); }
/* The active tab must never sit under its own fade. */
[data-fade] { scroll-padding-inline: 24px; }
`);
console.log('ok themes.css');

// ---------------------------------------------------------------- hook ----
const UI = 'src/ui.jsx';
let ui = fs.readFileSync(UI, 'utf8');
if (!ui.includes('export function useEdgeFade')) {
  ui += `

// A horizontal scroller should tell you there is more, not amputate it.
// Sets data-fade="left|right|both|none" on the element; themes.css masks the
// side that hides content. Measured from the children's rectangles so it is
// direction-agnostic (scrollLeft is signed differently in RTL).
export function useEdgeFade(ref) {
  React.useEffect(() => {
    const el = ref && ref.current;
    if (!el) return undefined;
    const update = () => {
      const r = el.getBoundingClientRect();
      let minL = Infinity, maxR = -Infinity;
      for (const kid of el.children) {
        const b = kid.getBoundingClientRect();
        if (b.width < 0.5) continue;
        minL = Math.min(minL, b.left); maxR = Math.max(maxR, b.right);
      }
      if (minL === Infinity) { el.dataset.fade = 'none'; return; }
      const left = minL < r.left - 1, right = maxR > r.right + 1;
      el.dataset.fade = left && right ? 'both' : left ? 'left' : right ? 'right' : 'none';
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    let ro = null;
    if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(update); ro.observe(el); for (const kid of el.children) ro.observe(kid); }
    const t = setTimeout(update, 400);   // fonts land after first paint
    return () => { clearTimeout(t); el.removeEventListener('scroll', update); window.removeEventListener('resize', update); if (ro) ro.disconnect(); };
  });
}
`;
  fs.writeFileSync(UI, ui);
  console.log('ok useEdgeFade');
}

// ------------------------------------------------------------- club zone ----
rep('src/BhbcView.jsx',
  `import { Card as BaseCard, CollapsibleSection, Btn, Input, Modal, EmptyState, toast, usePersistentState } from './ui';`,
  `import { Card as BaseCard, CollapsibleSection, Btn, Input, Modal, EmptyState, toast, usePersistentState, useEdgeFade } from './ui';`, 'zone import');
rep('src/BhbcView.jsx',
  `  const navRef = React.useRef(null);
  React.useEffect(() => {
    const el = navRef.current && navRef.current.querySelector('[aria-selected="true"]');
    if (el && el.scrollIntoView) el.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [view]);`,
  `  const navRef = React.useRef(null);
  useEdgeFade(navRef);
  React.useEffect(() => {
    const el = navRef.current && navRef.current.querySelector('[aria-selected="true"]');
    // 'nearest' first: a tab already fully on screen must not be yanked to the
    // middle on every render. Only a tab that is clipped gets centred.
    if (el && el.scrollIntoView) el.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }, [view]);`, 'zone rail');

// ----------------------------------------------------------- coach header ----
rep('src/App.jsx', "import { Btn, baseBtn, ToastHost, toast } from './ui';", "import { Btn, baseBtn, ToastHost, toast, useEdgeFade } from './ui';", 'coach import');
rep('src/App.jsx',
  `  const coachNavRef = React.useRef(null);`,
  `  const coachNavRef = React.useRef(null);
  useEdgeFade(coachNavRef);`, 'coach rail');
