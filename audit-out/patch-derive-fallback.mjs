// derive-payments: a loose "300 ש" is a price; a payment with no priceable
// rate beside it takes the client's nearest numeric rate from another period,
// labelled LOW; "חייב …" in a price cell or counter marks the row unpaid.
import fs from 'node:fs';
const f = 'scripts/derive-payments.mjs';
let s = fs.readFileSync(f, 'utf8');
const rep = (a, b, l) => { const n = s.split(a).length - 1; if (n !== 1) throw new Error(l + ' x' + n); s = s.replace(a, b); console.log('ok', l); };

rep(`  const inText = s.match(/(\\d{2,5})\\s*(?:ש"ח|₪|שח)/);`,
    `  // "300 ש" - the ח fell off the cell; the number is still a price.
  const inText = s.match(/(\\d{2,5})\\s*(?:ש"ח|₪|שח|ש(?![א-ת]))/);`, 'loose rate');

rep(`      let est = estimate(counter, rs && rs.value, rm && rm.value, section);`,
    `      let est = estimate(counter, rs && rs.value, rm && rm.value, section);
      // No priceable rate beside this date: the client's nearest numeric rate
      // from another period, labelled LOW - a guess about the period, not the number.
      if (est.amount == null) {
        const numeric = (runs, fld) => (runs || []).map((r) => ({ r, p: parseRate(r.value), fld })).filter((x) => x.p && (x.p.single || x.p.personal));
        const cand = [...numeric(f.price_month, 'price_month'), ...numeric(f.price_session, 'price_session')]
          .sort((a, b2) => Math.abs(a.r.first_rev - rev) - Math.abs(b2.r.first_rev - rev))[0];
        if (cand) {
          const e2 = estimate(counter, cand.fld === 'price_session' ? cand.r.value : null, cand.fld === 'price_month' ? cand.r.value : null, section);
          if (e2.amount != null) est = { ...e2, confidence: 'low', basis: e2.basis + ' · ' + (cand.r.first_rev < rev ? 'earlier' : 'later') + ' rate' };
        }
      }
      const owes = /חייב/.test((rm && rm.value) || '') || /חייב/.test((counterBefore && counterBefore.text) || '');`, 'fallback rate');

rep(`        unpaid: !!(counterBefore && counterBefore.unpaid), notes: counterBefore ? counterBefore.notes : [],`,
    `        unpaid: !!(counterBefore && counterBefore.unpaid) || owes, notes: [...(counterBefore ? counterBefore.notes : []), ...(owes && rm ? [rm.value] : [])],`, 'owes');
fs.writeFileSync(f, s);
