// Shared segmented control — the Tasks-toolbar idiom (TasksV8View `segBtn`),
// extracted so every page uses ONE primitive instead of ad-hoc button rows.
// This is DNA rule 01. Matches Ohad's exact pattern: active = SOLID cyan fill
// + white text (like the nav's active tab); inactive = surface box + cyan
// hairline + muted text (never grey-inside-grey — "white boxes on the grey
// page"); mono, uppercase, bold, borderRadius 0, height 30, equal-width flex.
import React from 'react';
import { FN } from './theme';

export const segStyle = (active) => ({
  flex: 1, minWidth: 0, height: 30, padding: '0 14px',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  background: active ? '#39BDFF' : 'var(--c-sf)', borderRadius: 0, boxSizing: 'border-box',
  border: `1px solid ${active ? '#39BDFF' : 'var(--c-cardBd)'}`,
  color: active ? '#FFFFFF' : 'var(--c-tm)',
  fontFamily: FN, fontWeight: 700, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
  cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
});

// items: [{ id, label, count? }]. `equal` (default) makes every segment the
// same width (flex:1); pass equal={false} for content-width segments.
export default function Segmented({ items, value, onChange, ariaLabel, equal = true, style }) {
  return (
    <div role="tablist" aria-label={ariaLabel}
      style={{ display: 'flex', gap: 6, width: equal ? '100%' : undefined, ...style }}>
      {(items || []).map((it) => {
        const active = value === it.id;
        return (
          <button key={it.id} role="tab" aria-selected={active} className="tfbtn"
            data-active={active ? '' : undefined} onClick={() => onChange(it.id)} title={it.label}
            style={{ ...segStyle(active), flex: equal ? 1 : '0 0 auto' }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.label}</span>
            {it.count != null && <span style={{ opacity: 0.65, fontSize: 9, fontWeight: 700 }}>{it.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
