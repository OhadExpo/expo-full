// FROM THE ROSTER'S TIMELINE TO PAYMENT, ATTENDANCE AND RATE EVENTS.
//
// Ohad (2026-09-13): "the billing is not even close to 10% ready … make it 100%".
//
// Input: audit-out/sheets/timeline.json (every field of every client across
// every harvested revision) + finance.json (the monthly channel totals, the
// only real amounts). Output: audit-out/sheets/derived.json with, per client:
//
//   payments   one per change of the payment-date cell (or card-start cell):
//              the date he wrote, the counter as it stood just BEFORE he reset
//              it (= what the cycle contained), the rate in force, and an
//              ESTIMATED amount with the method that produced it:
//                monthly      price_month is a number             → that number
//                card         "N מתוך M" with a package price      → package price
//                per_session  "7 זוגי + 1 אישי" × "200/175 ש"ח"    → Σ count × rate
//                count        "3" or "3 אימונים" × one rate         → count × rate
//                unknown      no numeric rate ("עד בלוק #17")      → null
//   sessions   attendance: every increase of the counter between revisions,
//              dated by the revision window in which it appeared
//   rates      every change of a price cell
//   spans      when the client was on the sheet, in which section
//
// and a month-by-month reconciliation of the estimates against the finance
// sheet, per channel, so the estimate's error is measured, not assumed.
//
// Estimates are labelled ESTIMATED everywhere downstream. The convention for a
// two-price rate ("250/200") is personal/couple in that order - the sheet's
// own header says מחיר לאימון אישי and the second number is always the lower.
//
//   node scripts/derive-payments.mjs
import fs from 'node:fs';

const T = JSON.parse(fs.readFileSync('audit-out/sheets/timeline.json', 'utf8'));
const FIN = fs.existsSync('audit-out/sheets/finance.json') ? JSON.parse(fs.readFileSync('audit-out/sheets/finance.json', 'utf8')) : [];
const REVS = fs.existsSync('audit-out/sheets/revisions.json') ? Object.fromEntries(JSON.parse(fs.readFileSync('audit-out/sheets/revisions.json', 'utf8')).map((r) => [r.rev, r])) : {};

const num = (s) => { const m = String(s || '').replace(/,/g, '').match(/(\d+(?:\.\d+)?)/); return m ? Number(m[1]) : null; };
const dateOf = (iso) => (iso ? iso.slice(0, 10) : null);

// "250/200 ש"ח" → {personal:250, couple:200}; "200 ש"ח" → {single:200}; "עד בלוק #17" → {text}
function parseRate(t) {
  if (!t) return null;
  const s = String(t);
  const two = s.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
  if (two) return { text: s, personal: Number(two[1]), couple: Number(two[2]) };
  const one = s.match(/^\s*(\d+(?:\.\d+)?)\s*(?:ש"ח|₪|שח)?\s*$/);
  if (one) return { text: s, single: Number(one[1]) };
  // "300 ש" - the ח fell off the cell; the number is still a price.
  const inText = s.match(/(\d{2,5})\s*(?:ש"ח|₪|שח|ש(?![א-ת]))/);
  if (inText) return { text: s, single: Number(inText[1]), loose: true };
  return { text: s };
}

// The counter cell, in every shape the sheet has used.
function parseCounter(t) {
  if (t == null || t === '') return null;
  const s = String(t).trim();
  const out = { text: s, notes: [], unpaid: /לא שולם/.test(s), by: {} , total: 0, card: null };
  const noteM = s.match(/\(([^)]*)\)/g);
  if (noteM) out.notes = noteM.map((x) => x.slice(1, -1));
  const body = s.replace(/\([^)]*\)/g, ' ');
  const card = body.match(/(\d+)\s*(?:\(\?\)\s*)?מתו[ךל]\s*(\d+)/);
  if (card) { out.card = { used: Number(card[1]), size: Number(card[2]) }; out.by.card = Number(card[1]); out.total += Number(card[1]); }
  const rest = card ? body.replace(card[0], ' ') : body;
  const typed = [...rest.matchAll(/(\d+)\s*(אישי|זוגי|אתלטיקה|אימונים|אימון|כניסות)/g)];
  for (const m of typed) {
    const k = { 'אישי': 'personal', 'זוגי': 'couple', 'אתלטיקה': 'athletics', 'אימונים': 'sessions', 'אימון': 'sessions', 'כניסות': 'entries' }[m[2]];
    out.by[k] = (out.by[k] || 0) + Number(m[1]); out.total += Number(m[1]);
  }
  if (!card && !typed.length) {
    const bare = rest.match(/^\s*(\d+)\s*$/);
    if (bare) { out.by.sessions = Number(bare[1]); out.total = Number(bare[1]); }
    else if (/^\s*שולם\s*$/.test(rest)) out.paidWord = true;
    else if (!/\d/.test(rest)) out.textOnly = true;
  }
  return out;
}

function estimate(counter, rateSession, rateMonth, section) {
  const rs = parseRate(rateSession), rm = parseRate(rateMonth);
  const online = /אונליין|זום/.test(section || '');
  if (counter && counter.card) {
    if (rm && (rm.single || rm.personal)) return { amount: rm.single || rm.personal, method: 'card', confidence: 'high', basis: `${counter.card.size} sessions package · ${rm.text}` };
    if (rs && (rs.single || rs.personal)) return { amount: counter.card.size * (rs.single || rs.personal), method: 'card', confidence: 'medium', basis: `${counter.card.size} × ${rs.text}` };
    return { amount: null, method: 'unknown', confidence: 'low', basis: 'card size known, no price' };
  }
  if (online || (!rs && rm)) {
    if (rm && (rm.single || rm.personal)) return { amount: rm.single || rm.personal, method: 'monthly', confidence: rm.loose ? 'medium' : 'high', basis: rm.text };
    return { amount: null, method: 'unknown', confidence: 'low', basis: rm ? rm.text : 'no monthly price' };
  }
  if (counter && counter.total > 0 && rs) {
    const single = rs.single ?? rs.personal;
    let amount = 0; const parts = [];
    for (const [k, n] of Object.entries(counter.by)) {
      const r = k === 'couple' ? (rs.couple ?? single) : (k === 'personal' ? (rs.personal ?? single) : single);
      if (r == null) return { amount: null, method: 'unknown', confidence: 'low', basis: 'no rate' };
      amount += n * r; parts.push(`${n}×${r}`);
    }
    const typed = Object.keys(counter.by).some((k) => k === 'personal' || k === 'couple');
    return { amount, method: typed ? 'per_session' : 'count', confidence: rs.couple != null || !typed ? 'high' : 'medium', basis: parts.join(' + ') + ' · ' + rs.text };
  }
  if (counter && counter.total === 0) return { amount: 0, method: 'count', confidence: 'medium', basis: 'counter at 0 when the date changed' };
  if (rm && (rm.single || rm.personal)) return { amount: rm.single || rm.personal, method: 'monthly', confidence: 'medium', basis: rm.text };
  return { amount: null, method: 'unknown', confidence: 'low', basis: counter ? counter.text : 'no counter' };
}

// value of a field as it stood at revision `rev` (the run covering it), or the
// latest run that ended before it.
function valueAt(runs, rev, { before = false } = {}) {
  if (!runs) return null;
  let best = null;
  for (const r of runs) {
    if (before ? r.last_rev < rev : r.first_rev <= rev) best = r;
    else break;
  }
  return best;
}

const clients = [];
let nPay = 0, nSess = 0, nRate = 0;
for (const c of T) {
  const f = c.fields;
  const section = c.sections[c.sections.length - 1] || '';
  const out = { key: c.key, names: c.names, sections: c.sections, first_rev: c.first_rev, last_rev: c.last_rev, first_iso: c.first_iso, last_iso: c.last_iso, payments: [], sessions: [], rates: [], spans: [] };

  // ---- payments: each new value of the payment-date cell ----
  const dateFields = ['last_payment', 'card_start'];
  for (const df of dateFields) {
    for (const run of (f[df] || [])) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(run.value)) continue;
      const rev = run.first_rev;
      const before = valueAt(f.sessions_done, rev, { before: true });
      const at = valueAt(f.sessions_done, rev);
      const counterBefore = parseCounter(before && before.last_rev < rev ? before.value : null);
      const counterAt = parseCounter(at ? at.value : null);
      const rs = valueAt(f.price_session, rev), rm = valueAt(f.price_month, rev);
      const entries = valueAt(f.entries, rev, { before: true });
      const cardType = valueAt(f.card_type, rev);
      // In the 2022 punch-card layout the counter is "entries" and the package is card_type.
      let counter = counterBefore;
      if (!counter && entries) counter = parseCounter(entries.value);
      let est = estimate(counter, rs && rs.value, rm && rm.value, section);
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
      const owes = /חייב/.test((rm && rm.value) || '') || /חייב/.test((counterBefore && counterBefore.text) || '');
      if (df === 'card_start' && cardType && !est.amount) est = { amount: null, method: 'unknown', confidence: 'low', basis: `card ${cardType.value}` };
      const isFirst = run === (f[df] || [])[0];
      out.payments.push({
        kind: df === 'card_start' ? 'card_start' : 'payment', date: run.value, first_seen_rev: rev, seen_until_rev: run.last_rev,
        recorded_between: [dateOf(REVS[rev - 1]?.iso || (before && before.last_iso)), dateOf(run.first_iso)],
        counter_before: counterBefore ? counterBefore.text : (entries ? entries.value : null),
        counter_after: counterAt ? counterAt.text : null,
        sessions_before: counterBefore ? counterBefore.total : (entries ? num(entries.value) : null),
        sessions_by: counterBefore ? counterBefore.by : null,
        unpaid: !!(counterBefore && counterBefore.unpaid) || owes, notes: [...(counterBefore ? counterBefore.notes : []), ...(owes && rm ? [rm.value] : [])],
        rate_session: rs ? rs.value : null, rate_month: rm ? rm.value : null, card_type: cardType ? cardType.value : null,
        amount_est: est.amount, method: est.method, confidence: isFirst && df === 'last_payment' && !counterBefore ? 'low' : est.confidence, basis: est.basis,
        first_on_sheet: isFirst,
      });
      nPay++;
    }
  }
  out.payments.sort((a, b) => (a.date < b.date ? -1 : 1));

  // ---- sessions: each increase of the counter ----
  const counterRuns = f.sessions_done || f.entries || [];
  let prev = null;
  for (const run of counterRuns) {
    const cur = parseCounter(run.value);
    if (prev && cur && cur.total > prev.total && !(cur.card && prev.card && cur.card.size !== prev.card.size)) {
      const delta = {};
      for (const k of new Set([...Object.keys(cur.by), ...Object.keys(prev.by)])) { const d = (cur.by[k] || 0) - (prev.by[k] || 0); if (d > 0) delta[k] = d; }
      out.sessions.push({ count: cur.total - prev.total, by: delta, between: [dateOf(prev.last_iso), dateOf(run.first_iso)], at_rev: run.first_rev, from: prev.text, to: cur.text });
      nSess += cur.total - prev.total;
    }
    if (cur) { cur.last_iso = run.last_iso; prev = cur; }
  }

  // ---- rates ----
  for (const pf of ['price_session', 'price_month']) {
    const runs = f[pf] || [];
    for (let i = 0; i < runs.length; i++) {
      out.rates.push({ field: pf, value: runs[i].value, from: i ? runs[i - 1].value : null, from_rev: runs[i].first_rev, to_rev: runs[i].last_rev, from_iso: runs[i].first_iso, to_iso: runs[i].last_iso });
      if (i) nRate++;
    }
  }
  out.spans.push({ sections: c.sections, from_rev: c.first_rev, to_rev: c.last_rev, from: dateOf(c.first_iso), to: dateOf(c.last_iso) });
  // ---- start dates: every distinct value the start cell ever held ----
  out.starts = (f.start || []).filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.value)).map((r) => ({ date: r.value, first_seen_rev: r.first_rev, seen_until_rev: r.last_rev }));
  clients.push(out);
}

// ---- reconciliation against the finance sheet ----
const CHANNEL_OF = (sec) => (/אונליין|זום/.test(sec || '') ? 'online' : 'gym');
const est = new Map(); // month -> channel -> {sum, n, unknown}
for (const c of clients) {
  const ch = CHANNEL_OF(c.sections[c.sections.length - 1]);
  for (const p of c.payments) {
    if (p.kind !== 'payment') continue;
    const m = p.date.slice(0, 7);
    if (!est.has(m)) est.set(m, {});
    const g = est.get(m)[ch] || (est.get(m)[ch] = { sum: 0, n: 0, unknown: 0 });
    g.n++; if (p.amount_est == null) g.unknown++; else g.sum += p.amount_est;
  }
}
const fin = new Map();
for (const r of FIN) {
  const m = String(r.month).slice(0, 7);
  const ch = r.channel === 'online' ? 'online' : (/^gym_/.test(r.channel) ? 'gym' : null);
  if (!ch) continue;
  if (!fin.has(m)) fin.set(m, {});
  fin.get(m)[ch] = (fin.get(m)[ch] || 0) + Number(r.amount);
}
const months = [...new Set([...est.keys(), ...fin.keys()])].sort();
const recon = months.map((m) => ({ month: m, gym_est: est.get(m)?.gym?.sum ?? null, gym_n: est.get(m)?.gym?.n ?? 0, gym_unknown: est.get(m)?.gym?.unknown ?? 0, gym_sheet: fin.get(m)?.gym ?? null, online_est: est.get(m)?.online?.sum ?? null, online_n: est.get(m)?.online?.n ?? 0, online_unknown: est.get(m)?.online?.unknown ?? 0, online_sheet: fin.get(m)?.online ?? null }));

fs.writeFileSync('audit-out/sheets/derived.json', JSON.stringify({ generated: new Date().toISOString(), clients, reconciliation: recon }, null, 0));
console.log(`clients ${clients.length} · payments ${nPay} · sessions counted ${nSess} · rate changes ${nRate}`);
const byMethod = {};
for (const c of clients) for (const p of c.payments) byMethod[p.method + '/' + p.confidence] = (byMethod[p.method + '/' + p.confidence] || 0) + 1;
console.log('payments by method/confidence:', JSON.stringify(byMethod));
console.log('\nmonth      gym est (n, ?)        gym sheet   | online est (n, ?)     online sheet');
for (const r of recon.filter((x) => x.gym_sheet != null || x.online_sheet != null || x.month >= '2026-01')) {
  console.log(`${r.month}   ${String(r.gym_est ?? '—').padStart(7)} (${r.gym_n}, ${r.gym_unknown})   ${String(r.gym_sheet ?? '—').padStart(8)}   | ${String(r.online_est ?? '—').padStart(7)} (${r.online_n}, ${r.online_unknown})   ${String(r.online_sheet ?? '—').padStart(8)}`);
}
