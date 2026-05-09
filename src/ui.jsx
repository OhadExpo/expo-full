import React from 'react';
import { C, FN, FB } from './theme';

// Per stroke ruling (`feedback_stroke_ruling.md`): default-state inputs use
// 0.25px C.ac4D (30% alpha). Bright 1px C.ac is reserved for primary CTAs
// (Btn primary variant). Active focus would step up to 2px C.ac, but we
// don't track focus inline — :focus styling lives in a global stylesheet.
export const baseInput = {
  background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0,
  padding: "9px 14px", color: C.tx, fontFamily: FB, fontSize: 13,
  outline: "none", width: "100%", boxSizing: "border-box",
  transition: "border-color 0.2s",
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
  <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 0, fontSize: 10, fontWeight: 700, fontFamily: FN, background: 'var(--c-sf)', border: `1px solid ${color}`, color, letterSpacing: "0.1em", textTransform: "uppercase", ...s }}>{children}</span>;

// Standard EXPO section heading. Used everywhere we'd otherwise hand-roll
// `<div style={{fontSize:9, fontFamily:FN, color:C.tm, letterSpacing:'0.18em', fontWeight:700, textTransform:'uppercase'}}>...</div>`
// Single source of truth for the brand caps style so any future tweak (size,
// color, tracking) propagates everywhere instead of having to re-grep 18 files.
// `as` lets the call site choose div vs span vs h3 etc. — defaults to div.
export const SectionLabel = ({ children, color = C.tm, as: Tag = 'div', style: s }) =>
  <Tag style={{
    fontFamily: FN, fontSize: 9, fontWeight: 700, color,
    letterSpacing: '0.18em', textTransform: 'uppercase',
    ...s,
  }}>{children}</Tag>;
export const Card = ({ children, style, onClick, onMouseEnter, onMouseLeave }) => (
  <div onClick={onClick} style={{ background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0, padding: 18, cursor: onClick ? "pointer" : "default", transition: "all 0.2s", ...style }}
    onMouseEnter={e => { if(onClick) e.currentTarget.style.borderColor = C.ac; if(onMouseEnter) onMouseEnter(e); }}
    onMouseLeave={e => { if(onClick) e.currentTarget.style.borderColor = C.cardBd; if(onMouseLeave) onMouseLeave(e); }}>{children}</div>
);
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
