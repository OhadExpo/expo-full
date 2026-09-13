// Put the finance sheet's OLDER months into revenue_month_total.
//
// The live ניהול פיננסי keeps only the last four month tabs, so March–May 2026
// exist only in its revision history. audit-out/sheets/finance-history.json is
// the merge of one month-end revision per month plus the live sheet (the
// highest revision wins per month × channel). Idempotent on (month, channel).
//   node scripts/import-finance-history.mjs
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv', { auth: { persistSession: false } });
const { error } = await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
if (error) { console.log('AUTH FAILED', error.message); process.exit(1); }
const rows = JSON.parse(fs.readFileSync('audit-out/sheets/finance-history.json', 'utf8')).map((r) => ({ ...r, imported_at: new Date().toISOString() }));
const { error: e2 } = await s.from('revenue_month_total').upsert(rows, { onConflict: 'month,channel', ignoreDuplicates: false });
if (e2) { console.log('upsert failed:', e2.message); process.exit(1); }
const months = [...new Set(rows.map((r) => r.month))].sort();
console.log(`wrote ${rows.length} month × channel rows across ${months.length} months: ${months.join(', ')}`);
