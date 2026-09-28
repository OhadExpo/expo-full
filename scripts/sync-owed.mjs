// OWED, from the roster sheet (רשימת מתאמנים), into the owner-only revenue_owed table (#386).
//
// Ohad 28.9: "inside expo dashboard add a box with 'owed' - who, how much and all
// the details from רשימת מתאמנים" + "this should be synced automatically all the time".
//
// The sheet has no owed column. Each in-person row holds the last payment date,
// the sessions done SINCE it ("4 אישי, 6 זוגי") and the price per session
// ("200/175 ש"ח"). His rule for a split price (28.9, memory feedback_owed_price_rule):
// the LOWER number is אישי (personal), the HIGHER is זוגי (couple), per session.
// One price applies to every session in the row. Anything the rule does not cover
// (a split price next to another session kind, an unreadable cell, every online
// row) gets amount NULL and says why - never a guess.
//
// Reads audit-out/sheets/roster.xlsx, which scripts/fetch-sheet-xlsx.mjs pulls
// through the signed-in debug Chrome. The daemon runs fetch + this every 20 min.
//
//   node scripts/sync-owed.mjs [--dry] [--file <xlsx>]
// No client data lives in this file: the repo is public.
import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';
import fs from 'node:fs';

const DRY = process.argv.includes('--dry');
const fi = process.argv.indexOf('--file');
const FILE = fi > 0 ? process.argv[fi + 1] : 'audit-out/sheets/roster.xlsx';
if (!fs.existsSync(FILE)) { console.log(`NO SHEET FILE ${FILE}`); process.exit(1); }

const wb = XLSX.read(fs.readFileSync(FILE));
const ws = wb.Sheets[wb.SheetNames[0]];
const grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: null });
const cell = (v) => (v == null ? '' : String(v).trim());

// "31.08.2026" -> "2026-08-31"; anything else -> null
const isoDate = (t) => { const m = cell(t).match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null; };
const nums = (t) => (cell(t).match(/\d+(?:\.\d+)?/g) || []).map(Number);

// "4 אישי, 6 זוגי" -> { personal: 4, couple: 6, other: 0 }; null when a part is unreadable
function parseSessions(t) {
  const out = { personal: 0, couple: 0, other: 0 };
  const parts = cell(t).split(/[,،]/).map((x) => x.trim()).filter(Boolean);
  if (!parts.length) return null;
  for (const p of parts) {
    const m = p.match(/^(\d+)\s*(.*)$/);
    if (!m) return null;
    const n = Number(m[1]), kind = m[2].trim();
    if (/^אישי/.test(kind)) out.personal += n;
    else if (/^זוגי/.test(kind)) out.couple += n;
    else { out.other += n; out.otherKind = kind; }
  }
  return out;
}

function priceIt(sessions, priceText) {
  const p = nums(priceText);
  if (!sessions) return { amount: null, prices: null, method: 'sessions cell not readable' };
  const total = sessions.personal + sessions.couple + sessions.other;
  if (total === 0) return { amount: 0, prices: p.length === 1 ? { all: p[0] } : null, method: 'no sessions since the last payment' };
  if (p.length === 1) return { amount: total * p[0], prices: { all: p[0] }, method: `${total} × ${p[0]}` };
  if (p.length === 2) {
    const lo = Math.min(...p), hi = Math.max(...p);
    if (sessions.other > 0) return { amount: null, prices: { personal: lo, couple: hi }, method: 'split price next to another session kind' };
    return { amount: sessions.personal * lo + sessions.couple * hi, prices: { personal: lo, couple: hi },
      method: `${sessions.personal} × ${lo} + ${sessions.couple} × ${hi}` };
  }
  return { amount: null, prices: null, method: 'price cell not readable' };
}

// Walk the sheet: a section title, its "עודכן לאחרונה" line, a header row with
// "שם מלא", then one client per row until a blank name.
const rows = [];
let section = null, updated = null, header = null;
for (let r = 0; r < grid.length; r++) {
  const line = (grid[r] || []).map(cell);
  const joined = line.join(' ');
  if (/מתאמני חד/.test(joined)) { section = 'in_person'; header = null; continue; }
  if (/מתאמני אונליין/.test(joined)) { section = 'online'; header = null; continue; }
  if (/עודכן לאחרונה/.test(joined)) { updated = joined.replace(/\s+/g, ' ').trim(); continue; }
  const nameCol = line.findIndex((x) => x === 'שם מלא');
  if (nameCol >= 0) { header = { name: nameCol, pay: line.findIndex((x) => /תשלום אחרון/.test(x)), sess: line.findIndex((x) => /אימונים/.test(x)), price: line.findIndex((x) => /מחיר/.test(x)) }; continue; }
  if (!section || !header) continue;
  const name = line[header.name];
  if (!name) continue;
  const lastPay = isoDate(line[header.pay]);
  const priceText = header.price >= 0 ? line[header.price] : '';
  const base = { id: `${section}:${r + 1}`, section, client_name: name, last_payment: lastPay, price_text: priceText || null, sheet_updated: updated };
  if (section === 'in_person') {
    const sessionsText = header.sess >= 0 ? line[header.sess] : '';
    const sessions = parseSessions(sessionsText);
    const priced = priceIt(sessions, priceText);
    rows.push({ ...base, sessions_text: sessionsText || null, sessions_by: sessions, ...priced });
  } else {
    // Online: a monthly price or "paid up to block #N". His price rule does not
    // cover these, so no amount - the card shows the facts and "due since".
    const p = nums(priceText);
    rows.push({ ...base, sessions_text: null, sessions_by: null, prices: p.length === 1 && !/בלוק/.test(priceText) ? { month: p[0] } : null,
      amount: null, method: /בלוק/.test(priceText) ? 'paid up to a block' : 'monthly - not priced (no rule yet)' });
  }
}
if (!rows.length) { console.log('PARSED 0 ROWS - sheet layout changed? nothing written'); process.exit(1); }

const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv', { auth: { persistSession: false } });
const { error: authErr } = await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
if (authErr) { console.log('AUTH FAILED:', authErr.message); process.exit(1); }

// Link to an EXPO profile only on an exact or word-reordered name match: a wrong
// link would show one client's debt on another's page.
const { data: trRow } = await s.from('store').select('value').eq('key', 'expo-trainees').maybeSingle();
const trainees = (trRow?.value || []).filter(Boolean);
const strip = (x) => String(x || '').replace(/[֑-ׇ"'`.,-]/g, '').replace(/\s+/g, ' ').trim();
const tokens = (x) => strip(x).replace(/(^|\s)ו/g, '$1').split(/\s+/).filter(Boolean).sort().join(' ');
const ALIAS = { 'דיאגו דיי': 'Diego Day' };
for (const row of rows) {
  const want = ALIAS[row.client_name] || row.client_name;
  const hit = trainees.find((t) => strip(t.name) === strip(want) || strip(t.nameLocal) === strip(want))
    || trainees.find((t) => tokens(t.name) === tokens(want) || (t.nameLocal && tokens(t.nameLocal) === tokens(want)));
  row.trainee_id = hit ? hit.id : null;
}

const now = new Date().toISOString();
const owed = rows.filter((r) => r.amount > 0);
console.log(`parsed ${rows.length} rows (${rows.filter((r) => r.section === 'in_person').length} in person, ${rows.filter((r) => r.section === 'online').length} online) · ${owed.length} owe · total ${owed.reduce((a, r) => a + r.amount, 0)} · unpriced ${rows.filter((r) => r.amount == null).length} · linked ${rows.filter((r) => r.trainee_id).length}`);
if (DRY) { for (const r of rows) console.log(`  ${r.id} ${r.amount ?? '-'} · ${r.method}`); process.exit(0); }

// Replace the table with the sheet's current state: upsert this run, then delete
// every row this run did not write (a client removed from the sheet owes nothing here).
const payload = rows.map((r) => ({ ...r, synced_at: now }));
const { error: upErr } = await s.from('revenue_owed').upsert(payload);
if (upErr) { console.log('WRITE FAILED:', upErr.message); process.exit(1); }
const { error: delErr } = await s.from('revenue_owed').delete().lt('synced_at', now);
if (delErr) { console.log('PRUNE FAILED:', delErr.message); process.exit(1); }
const { count } = await s.from('revenue_owed').select('id', { count: 'exact', head: true });
console.log(`written ${payload.length}, table now ${count}`);
process.exit(count === payload.length ? 0 : 1);
