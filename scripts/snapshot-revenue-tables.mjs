// Snapshot the owner-only revenue tables to JSON before any rewrite.
//   node scripts/snapshot-revenue-tables.mjs   → audit-out/sheets/backup-<table>-<stamp>.json
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv', { auth: { persistSession: false } });
const { error } = await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
if (error) { console.log('AUTH FAILED', error.message); process.exit(1); }
const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
for (const t of ['revenue_sheet_event', 'revenue_month_total', 'revenue_cell_history']) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error: e } = await s.from(t).select('*').range(from, from + 999);
    if (e) { console.log(t, 'ERR', e.message); break; }
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  const f = `audit-out/sheets/backup-${t}-${stamp}.json`;
  fs.writeFileSync(f, JSON.stringify(rows));
  console.log(t, rows.length, 'rows →', f);
}
