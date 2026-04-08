import React from 'react';
import { C, FN, FB } from './theme';

export const baseInput = {
  background: C.sf2, border: `1px solid ${C.bd}`, borderRadius: 8,
  padding: "9px 14px", color: C.tx, fontFamily: FB, fontSize: 13,
  outline: "none", width: "100%", boxSizing: "border-box",
  transition: "border-color 0.2s",
  fontWeight: 400, letterSpacing: "0.01em",
};
export const baseBtn = {
  display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 18px",
  borderRadius: 8, border: "none", fontFamily: FB, fontSize: 13, fontWeight: 600, cursor: "pointer",
  letterSpacing: "0.02em", transition: "all 0.15s",
};
const variants = {
  primary: { background: C.ac, color: "#000" },
  ghost: { background: "transparent", color: C.tm, border: `1px solid ${C.bd}` },
  danger: { background: C.rdD, color: C.rd },
  success: { background: C.gnD, color: C.gn },
};
export const Btn = ({ children, variant = "primary", onClick, style, ...rest }) =>
  <button onClick={onClick} style={{ ...baseBtn, ...variants[variant], ...style }} {...rest}>{children}</button>;

export const Input = ({ label, style: s, ...props }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
    {label && <label style={{ fontSize: 10, fontWeight: 700, color: C.td, textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: FN }}>{label}</label>}
    <input style={{ ...baseInput, ...s }} {...props} />
  </div>
);

export const Select = ({ label, options, value, onChange, placeholder }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
    {label && <label style={{ fontSize: 10, fontWeight: 700, color: C.td, textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: FN }}>{label}</label>}
    <select value={value || ""} onChange={e => onChange(e.target.value)} style={{ ...baseInput, appearance: "none", paddingRight: 30 }}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(o => <option key={typeof o==="object"?o.value:o} value={typeof o==="object"?o.value:o}>{typeof o==="object"?o.label:o}</option>)}
    </select>
  </div>
);
export const TextArea = ({ label, ...props }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
    {label && <label style={{ fontSize: 10, fontWeight: 700, color: C.td, textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: FN }}>{label}</label>}
    <textarea style={{ ...baseInput, minHeight: 60, resize: "vertical" }} {...props} />
  </div>
);
export const Badge = ({ children, color = C.ac, style: s }) =>
  <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 6, fontSize: 10, fontWeight: 700, fontFamily: FN, background: `${color}15`, color, letterSpacing: "0.04em", textTransform: "uppercase", ...s }}>{children}</span>;
export const Card = ({ children, style, onClick }) => (
  <div onClick={onClick} style={{ background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 10, padding: 18, cursor: onClick ? "pointer" : "default", transition: "all 0.2s", ...style }}
    onMouseEnter={e => { if(onClick) { e.currentTarget.style.borderColor = C.ac + '40'; e.currentTarget.style.background = C.sf2; }}}
    onMouseLeave={e => { if(onClick) { e.currentTarget.style.borderColor = C.bd; e.currentTarget.style.background = C.sf; }}}>{children}</div>
);
export const Modal = ({ open, onClose, title, children, wide }) => {
  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 60, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 14, width: wide ? 700 : 480, maxHeight: "80vh", overflow: "auto", padding: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          <h3 style={{ margin: 0, fontFamily: FN, fontSize: 17, color: C.tx, fontWeight: 700, letterSpacing: "-0.01em" }}>{title}</h3>
          <button onClick={onClose} style={{ background: C.sf2, border: `1px solid ${C.bd}`, color: C.tm, cursor: "pointer", padding: "4px 8px", borderRadius: 6, fontSize: 14 }}>✕</button>
        </div>{children}</div></div>);
};
export const ConfirmDialog = ({ open, onConfirm, onCancel, title, message }) => {
  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.85)" }} onClick={onCancel}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 14, width: 400, padding: 28 }}>
        <h3 style={{ margin: "0 0 10px", fontFamily: FN, fontSize: 16, color: C.tx, fontWeight: 700 }}>{title}</h3>
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
