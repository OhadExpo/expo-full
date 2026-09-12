// Import a payments export (Bit history, an invoice export, a bank credit
// list — anything with a date, a payer and an amount) into the owner-only
// revenue_sheet_event table as event_kind 'payment_amount', so EXPO holds
// the money history the roster sheet never did.
//
// Ohad 2026-09-12: "log all previous billings on expo. use bit, use the
// history of the רשימת מתאמנים page … use every other source you can".
//
//   node scripts/import-payments-csv.mjs <source> <file.csv> [--dry]
//     source: bit | invoice | bank | other
//     columns (header row, any order, case-insensitive): date, name, amount[, memo]
//     date: YYYY-MM-DD or DD/MM/YYYY · amount: number (₪ and commas allowed)
//
// Idempotent: the natural key is (source, client_name, event_kind, event_date,
// amount) — re-running the same file writes nothing new. Names are matched to
// EXPO trainees the way import-revenue.mjs does (exact, then loose Hebrew);
// unmatched rows are still stored (historical clients) with trainee_id null.
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
const [source, file] = process.argv.slice(2);
const DRY = process.argv.includes('--dry');
if (!source || !file) { console.log('usage: node scripts/import-payments-csv.mjs <bit|invoice|bank|other> <file.csv> [--dry]'); process.exit(2); }
// Same client + owner sign-in as scripts/import-revenue.mjs (the publishable key is public by design).
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv', { auth: { persistSession: false } });
const { error: authErr } = await s.auth.signInWithPassword({ email: process.env.EXPO_EMAIL || 'ohadyproductions@gmail.com', password: process.env.EXPO_PW || '1234' });
if (authErr) { console.log('sign-in failed:', authErr.message); process.exit(1); }

const parseCsv = (text) => {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
};
const norm = (h) => h.trim().toLowerCase().replace(/^﻿/, '');
const toIso = (d) => {
  const t = String(d).trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})/); if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  return null;
};
const toAmount = (a) => { const n = Number(String(a).replace(/[₪,\s]/g, '').replace(/ש"ח/g, '')); return Number.isFinite(n) ? n : null; };

const rows = parseCsv(fs.readFileSync(file, 'utf8'));
const header = rows[0].map(norm);
const col = (names) => header.findIndex((h) => names.includes(h));
const iDate = col(['date', 'תאריך']), iName = col(['name', 'payer', 'client', 'שם', 'מאת']), iAmt = col(['amount', 'sum', 'סכום']), iMemo = col(['memo', 'note', 'description', 'הערה', 'פירוט']);
if (iDate < 0 || iName < 0 || iAmt < 0) { console.log('header must carry date, name, amount — got:', header.join(' | ')); process.exit(2); }

// Trainees live in the store blob, not a table (same read as import-revenue.mjs).
const { data: trRow } = await s.from('store').select('value').eq('key', 'expo-trainees').maybeSingle();
const trainees = (trRow?.value || []).filter(Boolean);
const loose = (x) => String(x || '').replace(/[^֐-׿A-Za-z0-9]/g, '').toLowerCase();
const match = (name) => {
  const t = trainees || [];
  const exact = t.find((x) => x.name === name); if (exact) return exact.id;
  const l = loose(name); const hit = t.find((x) => loose(x.name) === l || (l.length > 3 && (loose(x.name).includes(l) || l.includes(loose(x.name)))));
  return hit ? hit.id : null;
};
const events = [];
let bad = 0;
for (const r of rows.slice(1)) {
  const d = toIso(r[iDate]); const amt = toAmount(r[iAmt]); const name = (r[iName] || '').trim();
  if (!d || amt === null || !name) { bad++; continue; }
  events.push({ source, sheet_id: null, client_name: name, trainee_id: match(name), section: null, event_kind: 'payment_amount', event_date: d, rate_text: iMemo >= 0 ? (r[iMemo] || null) : null, rate_amount: amt, rate_unit: 'payment', sessions_text: null, first_seen_rev: null });
}
const linked = events.filter((e) => e.trainee_id).length;
console.log(`${events.length} payments parsed (${bad} rows skipped) · ${linked} linked to an EXPO trainee · total ₪${events.reduce((a, e) => a + e.rate_amount, 0).toLocaleString()}`);
if (DRY) { for (const e of events.slice(0, 12)) console.log(`  ${e.event_date}  ${e.client_name.padEnd(22)} ₪${e.rate_amount}${e.trainee_id ? '' : '   (unmatched)'}`); process.exit(0); }
let written = 0;
for (let i = 0; i < events.length; i += 200) {
  const { error } = await s.from('revenue_sheet_event').upsert(events.slice(i, i + 200), { onConflict: 'source,client_name,event_kind,event_date' });
  if (error) { console.log('upsert failed:', error.message); process.exit(1); }
  written += Math.min(200, events.length - i);
}
console.log(`wrote ${written} rows to revenue_sheet_event (source=${source})`);
