// PUT THE ROSTER'S FULL HISTORY INTO EXPO.
//
// Ohad (2026-09-13): "re-run every history field on רשימת מתאמנים and
// everything you can possibly think of to make it 100%".
//
// Reads audit-out/sheets/cells.jsonl (every cell of every client per revision,
// from parse-roster-timeline.py) and audit-out/sheets/derived.json (payments,
// attendance, rate changes, from derive-payments.mjs) and upserts:
//
//   revenue_cell_history   the raw cells - the evidence, immutable per revision
//   revenue_sheet_event    event_kind = payment | card_start | session | rate_change
//                          with amount_est / method / confidence / basis,
//                          the counter before and after, notes, unpaid flag,
//                          and the revision window in which it was recorded
//
// Both tables are OWNER-ONLY (RLS by email). Idempotent on the natural keys.
// Names are matched to EXPO trainees exactly as import-revenue.mjs does: exact,
// then word-order-tolerant, then one character of drift on a long name.
//
//   node scripts/import-revenue-timeline.mjs [--dry] [--no-cells]
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import readline from 'node:readline';

const DRY = process.argv.includes('--dry');
const NO_CELLS = process.argv.includes('--no-cells');
// The sync passes the first revision whose cells are not in the table yet, so a
// twice-daily run does not resend fifty thousand rows that are already there.
const CELLS_MIN_REV = Number(process.env.CELLS_MIN_REV || 0);
const SHEET_ID = '18TdfofxAOd1d_EkOjbhYOBjWflqlfkAzY8sI52xJnOc';
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv', { auth: { persistSession: false } });
const { error: authErr } = await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
if (authErr) { console.log('AUTH FAILED:', authErr.message); process.exit(1); }

// ---- name resolution (same rules as import-revenue.mjs) ----
const ALIAS = { 'דיאגו דיי': 'Diego Day' };
const strip = (x) => String(x || '').replace(/[֑-ׇ"'`.,\-]/g, '').replace(/\s+/g, ' ').trim();
const tokens = (x) => strip(x).replace(/(^|\s)ו/g, '$1').split(/\s+/).filter(Boolean).sort().join(' ');
function lev(a, b) { const m = a.length, n = b.length; let prev = Array.from({ length: n + 1 }, (_, j) => j); for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; } return prev[n]; }
const { data: trRow } = await s.from('store').select('value').eq('key', 'expo-trainees').maybeSingle();
const trainees = (trRow?.value || []).filter(Boolean);
function resolve(name) {
  const want = strip(ALIAS[name] || name);
  const exact = trainees.find((t) => strip(t.name) === want); if (exact) return exact.id;
  const wt = tokens(ALIAS[name] || name);
  const re = trainees.find((t) => tokens(t.name) === wt); if (re) return re.id;
  let best = null;
  for (const t of trainees) { const d = lev(want, strip(t.name)); if (d <= 1 && want.length >= 8 && (!best || d < best.d)) best = { d, t }; }
  return best ? best.t.id : null;
}

const REVS = fs.existsSync('audit-out/sheets/revisions.json') ? Object.fromEntries(JSON.parse(fs.readFileSync('audit-out/sheets/revisions.json', 'utf8')).map((r) => [r.rev, r])) : {};

async function upsert(table, rows, conflict) {
  let n = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    if (DRY) { n += chunk.length; continue; }
    const { error } = await s.from(table).upsert(chunk, { onConflict: conflict, ignoreDuplicates: false });
    if (error) { console.log(`${table} chunk ${i}: ${error.message}`); process.exit(1); }
    n += chunk.length;
  }
  return n;
}

// ---------------------------------------------------------------- cells ----
if (!NO_CELLS) {
  const rows = new Map();
  const rl = readline.createInterface({ input: fs.createReadStream('audit-out/sheets/cells.jsonl') });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const c = JSON.parse(line);
    if (c.rev == null || c.rev < CELLS_MIN_REV) continue; // the live sheet has no revision number
    const k = [c.rev, c.tab, c.name, c.field].join('');
    rows.set(k, { sheet_id: SHEET_ID, rev: c.rev, rev_time: REVS[c.rev]?.iso || null, tab: c.tab, section: c.section || null, client_name: c.name, field: c.field, value: String(c.value) });
  }
  console.log(`cells: ${rows.size} → ${await upsert('revenue_cell_history', [...rows.values()], 'sheet_id,rev,tab,client_name,field')} written${DRY ? ' (dry)' : ''}`);
}

// --------------------------------------------------------------- events ----
const D = JSON.parse(fs.readFileSync('audit-out/sheets/derived.json', 'utf8'));
const events = new Map();
const put = (e) => {
  const k = [e.source, e.client_name, e.event_kind, e.event_date].join('');
  if (e.unpaid == null) e.unpaid = false;
  const prev = events.get(k);
  if (prev && e.event_kind === 'session') { prev.sessions_count = Number(prev.sessions_count || 0) + Number(e.sessions_count || 0); prev.sessions_by = mergeBy(prev.sessions_by, e.sessions_by); prev.sessions_text = `${prev.sessions_count}`; return; }
  if (prev && e.event_kind === 'rate_change') { prev.rate_text = [prev.rate_text, e.rate_text].filter(Boolean).join(' · '); prev.notes = [prev.notes, e.notes].filter(Boolean).join(' · '); return; }
  events.set(k, e);
};
const mergeBy = (a, b) => { const o = { ...(a || {}) }; for (const [k, v] of Object.entries(b || {})) o[k] = (o[k] || 0) + v; return o; };
const parseRateAmount = (t) => { const m = t && String(t).match(/^\s*(\d+(?:\.\d+)?)\s*(?:ש"ח|₪)?\s*$/); return m ? Number(m[1]) : null; };
let linked = 0, unmatched = [];
for (const c of D.clients) {
  const name = c.names[0];
  const trainee_id = resolve(name);
  if (trainee_id) linked++; else unmatched.push(name);
  const section = c.sections[c.sections.length - 1] || null;
  const base = { source: 'roster', sheet_id: SHEET_ID, client_name: name, trainee_id, section };
  for (const p of c.payments) {
    const rateText = p.rate_month && (/אונליין|זום/.test(section || '') || p.method === 'monthly' || p.method === 'card') ? p.rate_month : (p.rate_session || p.rate_month);
    put({ ...base, event_kind: p.kind, event_date: p.date,
      rate_text: rateText || null, rate_amount: parseRateAmount(rateText), rate_unit: p.method === 'monthly' || p.method === 'card' ? 'month' : (p.rate_session ? 'session' : null),
      sessions_text: p.counter_before || null, first_seen_rev: p.first_seen_rev,
      amount_est: p.amount_est, amount_method: p.method, confidence: p.confidence, basis: p.basis,
      sessions_count: p.sessions_before, sessions_by: p.sessions_by || null, counter_before: p.counter_before, counter_after: p.counter_after,
      notes: [p.card_type ? `card: ${p.card_type}` : null, ...(p.notes || [])].filter(Boolean).join(' · ') || null, unpaid: !!p.unpaid,
      rev_lo: p.first_seen_rev, rev_hi: p.seen_until_rev, recorded_from: p.recorded_between[0], recorded_to: p.recorded_between[1] });
  }
  for (const sess of c.sessions) {
    const d = sess.between[1] || sess.between[0];
    if (!d) continue;
    put({ ...base, event_kind: 'session', event_date: d, sessions_count: sess.count, sessions_by: sess.by, sessions_text: `${sess.count}`,
      counter_before: sess.from, counter_after: sess.to, first_seen_rev: sess.at_rev, rev_lo: sess.at_rev, rev_hi: sess.at_rev,
      recorded_from: sess.between[0], recorded_to: sess.between[1], amount_method: 'attendance', confidence: sess.approx ? 'low' : (sess.between[0] === sess.between[1] ? 'high' : 'medium'),
      basis: `counter ${sess.from} → ${sess.to}` });
  }
  for (const st of (c.starts || [])) {
    const rs = c.rates.find((r) => r.field === 'price_session' && r.from_rev <= st.first_seen_rev) || null;
    put({ ...base, event_kind: 'start_date', event_date: st.date, first_seen_rev: st.first_seen_rev, rev_lo: st.first_seen_rev, rev_hi: st.seen_until_rev,
      rate_text: rs ? rs.value : null, rate_amount: parseRateAmount(rs && rs.value), rate_unit: rs ? 'session' : null, amount_method: 'start', confidence: 'high', basis: 'start cell' });
  }
  for (const r of c.rates) {
    if (!r.from) continue;
    const d = r.from_iso ? r.from_iso.slice(0, 10) : null;
    if (!d) continue;
    put({ ...base, event_kind: 'rate_change', event_date: d, rate_text: `${r.field === 'price_month' ? 'month' : 'session'}: ${r.from} → ${r.value}`, rate_amount: parseRateAmount(r.value), rate_unit: r.field === 'price_month' ? 'month' : 'session',
      first_seen_rev: r.from_rev, rev_lo: r.from_rev, rev_hi: r.to_rev, recorded_from: d, recorded_to: d, amount_method: 'rate', confidence: 'high', basis: r.field });
  }
}
const list = [...events.values()];
const kinds = {}; for (const e of list) kinds[e.event_kind] = (kinds[e.event_kind] || 0) + 1;
console.log(`clients ${D.clients.length} · linked to EXPO ${linked} · unmatched ${unmatched.length}: ${unmatched.slice(0, 12).join(', ')}`);
console.log('events:', JSON.stringify(kinds));
if (!DRY) {
  const { error: delErr } = await s.from('revenue_sheet_event').delete().eq('source', 'roster').in('event_kind', ['session', 'rate_change']);
  if (delErr) { console.log('could not clear derived rows:', delErr.message); process.exit(1); }
}
console.log(`events → ${await upsert('revenue_sheet_event', list, 'source,client_name,event_kind,event_date')} written${DRY ? ' (dry)' : ''}`);
