// The game-minutes modal (Ohad 13.9: "the design is awful"): the minutes box
// sits NEXT to the name instead of across the modal, names read in the text
// colour with the jersey number, the summary line is three isolated tokens
// that cannot scramble in Hebrew, and a DNP player is a dash, not an empty
// box. Data is untouched: the league has published no box score for the Winner
// Cup games, so minutes still come from the coach.
import fs from 'node:fs';
const f = 'src/BhbcView.jsx';
let s = fs.readFileSync(f, 'utf8');
const rep = (a, b, l) => { const n = s.split(a).length - 1; if (n !== 1) throw new Error(l + ' x' + n); s = s.replace(a, b); console.log('ok', l); };

rep(`      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <span style={{ fontFamily: FN, fontSize: 11, color: C.td }}>{tr('Game RPE')}</span>
        <input type="number" min="1" max="10" value={rpe} onChange={(e) => setRpe(e.target.value)}
          style={{ width: 64, height: 30, boxSizing: 'border-box', background: 'var(--c-sf)', border: '1px solid ' + C.ln, color: C.tx, fontFamily: FN, padding: '0 8px' }} />
        <span dir="ltr" style={{ fontFamily: FN, fontSize: 11, color: C.td, unicodeBidi: 'isolate' }}>
          {played} {tr('played')} \\u00B7 {total} {tr('min total')}
        </span>
      </div>
      <div style={{ maxHeight: '46vh', overflowY: 'auto' }}>
        {(roster || []).map((t) => (
          <div key={t.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 86px', alignItems: 'center', gap: 10, padding: '6px 0', borderTop: '1px solid ' + C.ln }}>
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name || t.id}</span>
            <input type="number" min="0" max="60" inputMode="numeric" placeholder={tr('DNP')}
              value={mins[t.id] ?? ''} onChange={(e) => setMins((p) => ({ ...p, [t.id]: e.target.value }))}
              style={{ width: '100%', height: 30, boxSizing: 'border-box', background: 'var(--c-sf)', border: '1px solid ' + C.ln, color: C.tx, fontFamily: FN, padding: '0 8px' }} />
          </div>
        ))}
      </div>`,
`      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 12, padding: '10px 12px', border: '1px solid ' + C.ln, background: 'var(--c-sf)' }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.tm }}>
          {tr('Game RPE')}
          <input type="number" min="1" max="10" value={rpe} onChange={(e) => setRpe(e.target.value)}
            style={{ width: 56, height: 30, boxSizing: 'border-box', background: 'var(--c-bg)', border: '1px solid ' + C.ln, color: C.tx, fontFamily: FN, fontSize: 13, fontWeight: 800, textAlign: 'center', padding: 0 }} />
        </label>
        <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6, fontFamily: FN, fontSize: 11, color: C.td, marginInlineStart: 'auto' }}>
          <b style={{ color: C.tx, fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>{played}</b><span>{tr('played')}</span>
          <span style={{ opacity: 0.5 }}>·</span>
          <b style={{ color: C.tx, fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>{total}</b><span>{tr('min total')}</span>
        </span>
      </div>
      <div style={{ maxHeight: '46vh', overflowY: 'auto', border: '1px solid ' + C.ln }}>
        {(roster || []).map((t, i) => {
          const v = mins[t.id] ?? '';
          const on = Number(v) > 0;
          return (
            <div key={t.id} style={{ display: 'grid', gridTemplateColumns: '34px minmax(0, 1fr) 84px 60px', alignItems: 'center', gap: 10, padding: '0 12px', height: 40, borderTop: i ? '1px solid ' + C.ln : 'none', background: on ? 'transparent' : 'color-mix(in srgb, var(--c-sf) 60%, transparent)' }}>
              <span style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, color: C.tm, fontVariantNumeric: 'tabular-nums' }}>{t.jersey != null ? t.jersey : ''}</span>
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: FN, fontSize: 12, fontWeight: 700, color: on ? C.tx : C.td }}>{t.name || t.id}</span>
              <input type="number" min="0" max="60" inputMode="numeric" placeholder="—" aria-label={tr('Minutes played')}
                value={v} onChange={(e) => setMins((p) => ({ ...p, [t.id]: e.target.value }))}
                style={{ width: '100%', height: 30, boxSizing: 'border-box', background: 'var(--c-bg)', border: '1px solid ' + (on ? ORANGE : C.ln), color: C.tx, fontFamily: FN, fontSize: 13, fontWeight: 800, textAlign: 'center', padding: 0 }} />
              <span style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: on ? ORANGE_DEEP : C.tm }}>{on ? tr('min') : tr('DNP')}</span>
            </div>
          );
        })}
      </div>`, 'modal body');
fs.writeFileSync(f, s);
