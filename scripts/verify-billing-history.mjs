// GATE: the billing history in EXPO covers what the roster's revisions hold.
//
// Runs after every import (the sync, refresh-billing.sh). Fails when:
//   1. a payment-date value that exists in the harvested cells has no 'payment'
//      event in revenue_sheet_event for that client (coverage < 100%)
//   2. an estimated amount is negative, or a priced payment lacks a method
//   3. the newest revision on disk is older than the newest the sheet lists
//      (revisions.json) by more than 50 - the harvest has fallen behind
//   4. a client who is linked in one event and unlinked in another (a name
//      matched inconsistently)
// Exit 1 on any failure, with the offending rows named.
//
//   node scripts/verify-billing-history.mjs
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import readline from 'node:readline';

const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv', { auth: { persistSession: false } });
const { error } = await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
if (error) { console.log('AUTH FAILED', error.message); process.exit(1); }

// What the cells hold: every (client, date) the payment-date cell ever showed.
const expected = new Set();
const rl = readline.createInterface({ input: fs.createReadStream(process.env.CELLS || 'audit-out/sheets/cells.jsonl') });
for await (const line of rl) {
  if (!line.trim()) continue;
  const c = JSON.parse(line);
  if (c.rev != null && c.field === 'last_payment' && /^\d{4}-\d{2}-\d{2}$/.test(c.value)) expected.add(c.name + '|' + c.value);
}

const rows = [];
for (let from = 0; ; from += 1000) {
  const { data, error: e } = await s.from('revenue_sheet_event').select('client_name,trainee_id,event_kind,event_date,amount_est,amount_method').eq('source', 'roster').range(from, from + 999);
  if (e) { console.log('read failed', e.message); process.exit(1); }
  rows.push(...(data || []));
  if (!data || data.length < 1000) break;
}
const have = new Set(rows.filter((r) => r.event_kind === 'payment').map((r) => r.client_name + '|' + r.event_date));
const failures = [];

// 1. coverage - the parser's client key strips punctuation; compare on the same key.
const key = (n) => String(n).replace(/[֑-ׇ"'`.,\-]/g, '').replace(/\s+/g, ' ').trim();
const haveK = new Set([...have].map((k) => { const [n, d] = k.split('|'); return key(n) + '|' + d; }));
const missing = [...expected].filter((k) => { const [n, d] = k.split('|'); return !haveK.has(key(n) + '|' + d); });
if (missing.length) failures.push(`${missing.length} payment-date cells with no payment event: ${missing.slice(0, 6).join(', ')}`);

// 2. amounts
const bad = rows.filter((r) => r.event_kind === 'payment' && ((r.amount_est != null && Number(r.amount_est) < 0) || (r.amount_est != null && !r.amount_method)));
if (bad.length) failures.push(`${bad.length} payments with a negative amount or no method`);

// 3. harvest currency
const onDisk = fs.readdirSync('audit-out/sheets/rev').map((f) => f.match(/^r(\d+)\.xlsx$/)).filter(Boolean).map((m) => Number(m[1]));
const maxDisk = Math.max(0, ...onDisk);
const listed = fs.existsSync('audit-out/sheets/revisions.json') ? JSON.parse(fs.readFileSync('audit-out/sheets/revisions.json', 'utf8')) : [];
const maxListed = Math.max(0, ...listed.map((r) => r.rev));
if (maxListed - maxDisk > 50) failures.push(`harvest behind: newest on disk r${maxDisk}, newest listed r${maxListed}`);

// 4. link consistency
const linkBy = new Map();
for (const r of rows) { const k = key(r.client_name); const set = linkBy.get(k) || new Set(); set.add(r.trainee_id || '—'); linkBy.set(k, set); }
const incons = [...linkBy.entries()].filter(([, set]) => set.size > 1).map(([k]) => k);
if (incons.length) failures.push(`${incons.length} clients linked inconsistently: ${incons.slice(0, 5).join(', ')}`);

console.log(`BILLING HISTORY — ${expected.size} payment-date cells, ${have.size} payment events, ${rows.length} roster events, revisions on disk to r${maxDisk}`);
if (failures.length) { for (const f of failures) console.log('FAIL  ' + f); process.exit(1); }
console.log('ok    every payment-date cell has its event; amounts sane; harvest current; links consistent');
