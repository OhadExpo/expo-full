// ONE CHIP GRID for the marketing site (5.10 #574, Ohad: "button/tag layout
// looks awful ... massive sweep to all over our platforms"). The twin of the
// app's ui.jsx ChipGrid, written against this site's literal palette (it has
// no CSS variables and no themes.css): a segmented grid of EQUAL cells joined
// by hairlines, every cell 36px tall (CTRL_H), the count beside the word, the
// active cell filled. Each line is a cell's own top/start edge pulled 1px
// back over its neighbour, so it is one whole pixel on fractional columns
// (the app's .hl-grid trick); the container clips the first row's and
// column's and its own border is the outer edge. Desktop: `cols` or one row.
// Phone (<=620, index.html .chip-grid): 2 or 3 equal columns so every row is
// full; with a count that fills neither, the first chip spans the first row.
//   items: [{ k, label, n, active, onClick, title, disabled, tone }]
//   soft   active = cyan wash + cyan text (this site's active-pill idiom)
//   prose  a sentence, not a label: body font, no caps, may wrap
import React from 'react';
import { C, FN, FB, FH } from '../theme';

const HE = /[֐-׿]/;

export default function ChipGrid({ items, value, onChange, cols = null, soft = false, prose = false, ariaLabel, style = null }) {
  const list = items || [];
  const n = list.length;
  const desk = Math.max(1, Math.min(n, cols || n));
  const deskSpan = desk < n && n % desk === 1;
  const phone = n <= 3 ? n : n % 3 === 0 ? 3 : 2;
  const phoneSpan = n > 3 && n % 3 !== 0 && n % 2 !== 0;
  return (
    <div role="group" aria-label={ariaLabel} className="chip-grid"
      data-deskspan={deskSpan ? '' : undefined} data-allspan={phoneSpan ? '' : undefined}
      style={{ display: 'grid', gridTemplateColumns: `repeat(${desk}, minmax(0, 1fr))`, '--cg-phone': phone, gap: 0, border: `1px solid ${C.bd}`, boxSizing: 'border-box', minWidth: 0, overflow: 'hidden', ...style }}>
      {list.map((it) => {
        const on = it.active != null ? !!it.active : value === it.k;
        const he = typeof it.label === 'string' && HE.test(it.label);
        return (
          <button key={it.k} type="button" aria-pressed={on} disabled={it.disabled} title={it.title}
            onClick={it.onClick || (onChange ? () => onChange(it.k) : undefined)}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              height: prose ? 'auto' : 36, minHeight: 36, minWidth: 0, boxSizing: 'border-box',
              padding: prose ? '6px 10px' : '0 10px', marginTop: -1, marginInlineStart: -1,
              fontFamily: he ? FH : prose ? FB : FN,
              fontSize: prose ? 12 : he ? 14 : 11, fontWeight: prose ? 500 : 700, lineHeight: prose ? 1.3 : 1,
              letterSpacing: he || prose ? 0 : 1, textTransform: prose ? 'none' : 'uppercase',
              whiteSpace: prose ? 'normal' : 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              color: !on ? (it.tone || C.tm) : soft ? C.ac : '#FFFFFF',
              background: !on ? 'transparent' : soft ? C.acD : C.ac,
              border: 'none', borderTop: `1px solid ${C.bd}`, borderInlineStart: `1px solid ${C.bd}`, borderRadius: 0,
              cursor: it.disabled ? 'default' : 'pointer', transition: 'background 0.15s',
            }}>
            {it.label}
            {it.n != null && <span style={{ fontSize: 9, fontVariantNumeric: 'tabular-nums', opacity: 0.85, color: on && !soft ? '#FFFFFF' : on ? C.ac : C.td, flexShrink: 0 }}>{it.n}</span>}
          </button>
        );
      })}
    </div>
  );
}
