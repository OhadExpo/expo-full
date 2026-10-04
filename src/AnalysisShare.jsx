// THE ANALYSIS GOES SOMEWHERE (4.10 #530, Ohad: "the tools in expo can be 10x
// better"). Two pieces shared by Lift Metrics and Jump:
//   VsLastTime    - today's numbers against the last saved session of the same
//                   lift / jump for this athlete (an earlier day), with the change.
//   SendToAthlete - the analysis as a note on the clip he filmed: the coach gets
//                   the wording prefilled, edits it, and only SEND writes it - the
//                   same note path as a note typed in Review.
import React, { useState } from 'react';
import { C, FN, FB, CTRL_H } from './theme';
import { useT } from './i18n';

const shortDate = (iso) => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}` : ''; };

// rows: [{ label, now, before, unit, digits, higherIsBetter }]
export function VsLastTime({ rows, date }) {
  const tt = useT();
  const shown = (rows || []).filter((r) => typeof r.now === 'number' && typeof r.before === 'number');
  if (!shown.length) return null;
  return (
    <div style={{ marginBottom: 14, border: '1px solid rgba(255,255,255,0.14)', textAlign: 'start' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 30, padding: '0 12px', borderBottom: '1px solid rgba(255,255,255,0.14)', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', color: 'rgba(255,255,255,0.6)' }}>
        <span>{tt('VS LAST TIME')}</span>
        <span dir="ltr" style={{ fontVariantNumeric: 'tabular-nums', unicodeBidi: 'isolate' }}>{shortDate(date)}</span>
      </div>
      {shown.map((r) => {
        const d = r.now - r.before;
        const k = Math.pow(10, r.digits ?? 0);
        const dRound = Math.round(d * k) / k;
        const good = dRound === 0 ? null : (dRound > 0) === (r.higherIsBetter !== false);
        const col = good == null ? 'rgba(255,255,255,0.6)' : good ? C.gn : C.rd;
        const fmt = (v) => (Math.round(v * k) / k).toFixed(r.digits ?? 0);
        return (
          <div key={r.label} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto', columnGap: 12, alignItems: 'center', minHeight: 36, padding: '0 12px', borderTop: '1px solid rgba(255,255,255,0.08)', fontFamily: FN, fontSize: 12 }}>
            <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em' }}>{r.label}</span>
            <span dir="ltr" style={{ color: 'rgba(255,255,255,0.55)', fontVariantNumeric: 'tabular-nums', unicodeBidi: 'isolate' }}>{fmt(r.before)} → <b style={{ color: '#FFF' }}>{fmt(r.now)}</b>{r.unit ? ` ${r.unit}` : ''}</span>
            <span dir="ltr" style={{ color: col, fontWeight: 700, fontVariantNumeric: 'tabular-nums', unicodeBidi: 'isolate', minWidth: 52, textAlign: 'end' }}>{dRound > 0 ? '+' : ''}{fmt(dRound)}</span>
          </div>
        );
      })}
    </div>
  );
}

// onSend(text) -> Promise<boolean>. Nothing is written until SEND.
export function SendToAthlete({ defaultText, onSend }) {
  const tt = useT();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [state, setState] = useState('idle'); // idle | sending | sent | failed
  if (!onSend) return null;
  const box = { height: CTRL_H, minHeight: CTRL_H, boxSizing: 'border-box', padding: '0 14px', fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', cursor: 'pointer', borderRadius: 0 };
  if (state === 'sent') {
    return (
      <div className="motion-rise" style={{ ...box, cursor: 'default', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${C.gn}`, color: C.gn }}>
        ✓ {tt('SENT - ON HIS CLIP')}
      </div>
    );
  }
  if (!open) {
    return (
      <button type="button" onClick={() => { setText(defaultText || ''); setOpen(true); }}
        style={{ ...box, width: '100%', marginBottom: 14, background: 'transparent', border: `1px solid ${C.ac}`, color: C.ac }}>
        {tt('SEND TO ATHLETE')} →
      </button>
    );
  }
  return (
    <div className="motion-rise" style={{ marginBottom: 14, border: `1px solid ${C.ac}`, textAlign: 'start' }}>
      <div style={{ minHeight: 30, display: 'flex', alignItems: 'center', padding: '0 12px', borderBottom: '1px solid rgba(255,255,255,0.14)', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', color: 'rgba(255,255,255,0.6)' }}>
        {tt('A NOTE ON HIS CLIP - EDIT, THEN SEND')}
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} dir="auto" data-allow-copy className="analysis-note-text"
        // the athlete reads exactly this text: no inherited uppercase, no letter-spacing
        style={{ display: 'block', width: '100%', boxSizing: 'border-box', resize: 'vertical', background: 'transparent', border: 'none', outline: 'none', color: '#FFF', fontFamily: FB, fontSize: 14, lineHeight: 1.5, padding: '10px 12px', textTransform: 'none', letterSpacing: 'normal' }} />
      {state === 'failed' && <div style={{ padding: '0 12px 8px', fontFamily: FN, fontSize: 11, color: C.rd }}>{tt('Not sent - check the connection and try again.')}</div>}
      <div style={{ display: 'flex', gap: 8, padding: '0 12px 12px' }}>
        <button type="button" disabled={!text.trim() || state === 'sending'}
          onClick={async () => { setState('sending'); let ok = false; try { ok = await onSend(text.trim()); } catch { ok = false; } setState(ok ? 'sent' : 'failed'); }}
          style={{ ...box, flex: 1, background: C.ac, border: `1px solid ${C.ac}`, color: '#000', opacity: !text.trim() || state === 'sending' ? 0.5 : 1 }}>
          {state === 'sending' ? tt('SENDING…') : tt('SEND')}
        </button>
        <button type="button" onClick={() => { setOpen(false); setState('idle'); }}
          style={{ ...box, background: 'transparent', border: '1px solid rgba(255,255,255,0.3)', color: '#FFF' }}>
          {tt('CANCEL')}
        </button>
      </div>
    </div>
  );
}
