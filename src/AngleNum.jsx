// ANGLES THAT STACK (13.10 #723, Ohad: "the numbers are not ocd aligned and not stacked vertically on top of each
// other"): Nord has no tabular digits (its 1 is narrow), so fontVariantNumeric: tabular-nums did nothing and every
// value had its own width. Here every character sits in a fixed slot - the ~ (not seen) and the sign in one slot, the
// digits padded to three from the left, the unit in its own - so every cell of a column is ONE width: centred under
// its L / R heading, the units, tens and hundreds stand in columns.
import React from 'react';

// the mark's slot = the unit's, so the digits sit in the middle of the cell, under its heading (measure the ink)
const SLOT = '0.68em', PRE = '0.6em', UNIT = '0.6em';
const slot = (w, align) => ({ display: 'inline-block', width: w, textAlign: align });
// a MARK's slot ends at the digit and an oversized mark ('~' + a sign) spills LEFT into the empty slot before it - as
// text it spilled right, over the first digit ('~−41' read '~4I', the phone, 13.10)
const markSlot = (w) => ({ display: 'inline-flex', justifyContent: 'flex-end', width: w });

// pre: false = no ~ / sign slot (a column that is always seen and never signed: the ROM tables)
export default function AngleNum({ v, seen = true, signed = false, unit = '°', digits = 3, pre = true, style = null }) {
  const box = { display: 'inline-flex', direction: 'ltr', unicodeBidi: 'isolate', whiteSpace: 'nowrap', ...style };
  if (v == null || !Number.isFinite(v)) {
    // a missing value takes the same width, its dash centred in it
    return <span style={{ ...box, justifyContent: 'center', width: `calc(${pre ? PRE : '0em'} + ${digits} * ${SLOT} + ${UNIT})` }}>—</span>;
  }
  const n = String(Math.abs(Math.round(v)));
  const ds = n.length >= digits ? n.split('') : [...Array(digits - n.length).fill(''), ...n.split('')];
  const mark = `${seen ? '' : '~'}${signed && v > 0 ? '+' : signed && v < 0 ? '−' : ''}`;
  // the mark hugs the number: in the empty slot just before its first digit (a full three-digit value: the mark's own slot)
  const lead = pre && mark && ds[0] === '' ? ds.findIndex((d) => d !== '') - 1 : -1;
  return (
    <span style={box}>
      {pre && <span style={markSlot(PRE)}>{lead < 0 ? mark : ''}</span>}
      {ds.map((d, i) => <span key={i} style={i === lead ? markSlot(SLOT) : slot(SLOT, 'center')}>{i === lead ? mark : d}</span>)}
      <span style={slot(UNIT, 'left')}>{unit}</span>
    </span>
  );
}

// the heading over an AngleNum column (L / R): the cell's own width, its letter centred over the digits and unit - not
// over the mostly-empty mark slot, which put it ~3 px off the numbers' ink on a phone (13.10 #723)
export function AngleHead({ children, pre = true, digits = 3, style = null }) {
  return (
    <span style={{ display: 'inline-flex', direction: 'ltr', unicodeBidi: 'isolate', width: `calc(${pre ? PRE : '0em'} + ${digits} * ${SLOT} + ${UNIT})`, ...style }}>
      {pre && <span style={{ flex: `0 0 ${PRE}` }} />}
      <span style={{ flex: '1 1 auto', textAlign: 'center' }}>{children}</span>
    </span>
  );
}
