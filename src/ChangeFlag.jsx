// ChangeFlag — LOCALHOST DESIGN-REVIEW overlay (design-pass branch only).
// A small clickable ✦ placed next to anything I redesigned; hover/click shows a
// popup explaining the change. A floating panel (bottom-right) lists every
// change and toggles all flags on/off. NOT for production — strip before deploy.
import React, { useState, useEffect } from 'react';

const _flags = [];
const _subs = [];
function _register(f) {
  const key = (f.page || '') + '|' + (f.title || '') + '|' + (f.note || '');
  if (!_flags.find(x => x._key === key)) { _flags.push({ ...f, _key: key }); _subs.forEach(fn => fn()); }
}
function _flagsOn() { return typeof window === 'undefined' ? true : window.__EXPO_FLAGS__ !== false; }

// Register an app-wide / shared-component change that has no single inline
// anchor (e.g. a change to every card header). Shows in the panel list only.
export function noteChange(page, title, note) { _register({ page, title, note }); }

export function ChangeFlag({ title, note, page }) {
  const [open, setOpen] = useState(false);
  const [on, setOn] = useState(_flagsOn);
  useEffect(() => {
    _register({ title, note, page });
    const h = () => setOn(_flagsOn());
    window.addEventListener('expo-flags', h);
    return () => window.removeEventListener('expo-flags', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!on) return null;
  return (
    <span
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
      onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpen(o => !o); }}
      style={{ position: 'relative', display: 'inline-flex', verticalAlign: 'middle', margin: '0 5px', userSelect: 'none' }}
      title="What changed">
      <span style={{ width: 16, height: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: '#39BDFF', color: '#00131f', fontSize: 10, fontWeight: 700, cursor: 'pointer', boxShadow: '0 0 0 3px rgba(57,189,255,0.22)', animation: 'expoFlagPulse 2.6s ease-in-out infinite' }}>✦</span>
      {open && (
        <span style={{ position: 'absolute', bottom: '145%', left: '50%', transform: 'translateX(-50%)', width: 250, background: '#0c0c12', border: '1px solid #39BDFF', padding: '10px 12px', zIndex: 99999, fontSize: 11.5, lineHeight: 1.5, color: '#f0f0f4', fontFamily: "'Nord','Heebo',sans-serif", boxShadow: '0 10px 34px rgba(0,0,0,.75)', textAlign: 'left', whiteSpace: 'normal', pointerEvents: 'none' }}>
          {title && <b style={{ color: '#39BDFF', display: 'block', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 5 }}>{title}</b>}
          {note}
          <span style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderTop: '6px solid #39BDFF' }} />
        </span>
      )}
    </span>
  );
}

export function DesignChangesPanel() {
  const [, force] = useState(0);
  const [on, setOn] = useState(true);
  const [listOpen, setListOpen] = useState(false);
  useEffect(() => {
    const fn = () => force(x => x + 1);
    _subs.push(fn);
    if (typeof document !== 'undefined' && !document.getElementById('expo-flag-kf')) {
      const s = document.createElement('style'); s.id = 'expo-flag-kf';
      s.textContent = '@keyframes expoFlagPulse{0%,100%{box-shadow:0 0 0 3px rgba(57,189,255,0.22)}50%{box-shadow:0 0 0 5px rgba(57,189,255,0.08)}}';
      document.head.appendChild(s);
    }
    return () => { const i = _subs.indexOf(fn); if (i >= 0) _subs.splice(i, 1); };
  }, []);
  const toggle = () => { const nv = !on; setOn(nv); window.__EXPO_FLAGS__ = nv; window.dispatchEvent(new Event('expo-flags')); };
  const byPage = _flags.reduce((a, f) => { (a[f.page || 'General'] = a[f.page || 'General'] || []).push(f); return a; }, {});
  const F = "'Nord','Heebo',sans-serif";
  return (
    <div style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 100000, fontFamily: F, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
      {listOpen && (() => {
        const port = typeof location !== 'undefined' ? location.port : '';
        const VERS = { '5173': ['V1', 'Calm · Editorial'], '5174': ['V2', 'Branded · Energetic'], '5175': ['V3', 'Dense · Terminal'] };
        const me = VERS[port] || ['—', 'design pass'];
        const others = Object.entries(VERS).filter(([p]) => p !== port);
        return (
        <div style={{ width: 320, maxHeight: '64vh', overflowY: 'auto', background: '#0a0a0e', border: '1px solid #39BDFF', boxShadow: '0 14px 44px rgba(0,0,0,.8)' }}>
          <div style={{ padding: '11px 13px', borderBottom: '1px solid rgba(57,189,255,.3)', borderLeft: '3px solid #39BDFF' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <b style={{ fontSize: 13, color: '#39BDFF' }}>{me[0]}</b>
              <b style={{ fontSize: 12, letterSpacing: '.05em', textTransform: 'uppercase' }}>{me[1]}</b>
            </div>
            <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {others.map(([p, v]) => (
                <a key={p} href={`http://localhost:${p}${typeof location !== 'undefined' ? location.pathname : ''}`}
                  style={{ fontSize: 9, letterSpacing: '.08em', textTransform: 'uppercase', color: '#7a7a88', border: '1px solid rgba(57,189,255,.3)', padding: '3px 7px', textDecoration: 'none' }}>{v[0]} · {v[1].split(' · ')[0]} →</a>
              ))}
            </div>
          </div>
          <div style={{ padding: '9px 13px 4px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <b style={{ fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: '#7a7a88' }}>Changes</b>
            <span style={{ fontSize: 11, color: '#7a7a88' }}>{_flags.length}</span>
          </div>
          {Object.entries(byPage).map(([pg, list]) => (
            <div key={pg}>
              <div style={{ padding: '8px 13px 4px', fontSize: 8, letterSpacing: '.14em', textTransform: 'uppercase', color: '#39BDFF', fontWeight: 700 }}>{pg}</div>
              {list.map((f, i) => (
                <div key={i} style={{ padding: '7px 13px', borderBottom: '1px solid #101014', fontSize: 11.5, lineHeight: 1.45, color: '#d5d5de' }}>
                  {f.title && <b style={{ color: '#f0f0f4', display: 'block', fontSize: 10.5 }}>{f.title}</b>}
                  <span style={{ color: '#8a8a98' }}>{f.note}</span>
                </div>
              ))}
            </div>
          ))}
          {_flags.length === 0 && <div style={{ padding: 16, fontSize: 11, color: '#7a7a88' }}>Navigate the pages — flags register as they render.</div>}
        </div>
        ); })()}
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={toggle} style={{ height: 30, padding: '0 12px', background: on ? '#39BDFF' : 'transparent', color: on ? '#fff' : '#7a7a88', border: '1px solid #39BDFF', fontFamily: F, fontWeight: 700, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', cursor: 'pointer' }}>{on ? '✦ Flags On' : 'Flags Off'}</button>
        <button onClick={() => setListOpen(o => !o)} style={{ height: 30, padding: '0 12px', background: '#0a0a0e', color: '#39BDFF', border: '1px solid #39BDFF', fontFamily: F, fontWeight: 700, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', cursor: 'pointer' }}>List · {_flags.length}</button>
      </div>
    </div>
  );
}
