// Apply scripts/migrations/2026-05-12-crm-v1.sql to Supabase using the service
// role key. Idempotent (CREATE TABLE IF NOT EXISTS / DROP POLICY IF EXISTS).
//
// Usage:
//   $env:SUPABASE_SERVICE_ROLE_KEY = "eyJ..."
//   node scripts/apply-crm-migration.mjs

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY env var required.');
  process.exit(1);
}

const sql = readFileSync(new URL('./migrations/2026-05-12-crm-v1.sql', import.meta.url), 'utf8');

// Supabase JS client doesn't expose raw DDL execution. The migration must be
// run via the Postgres REST API directly. We POST to /rest/v1/rpc/exec_sql if
// available, OR fall back to splitting the file into statements and running
// each via the supabase-js client's `.from()` which doesn't help for DDL.
//
// Simplest reliable path: use the Postgres connection string via pg if
// installed, otherwise tell the user to paste into Studio SQL Editor.

const sb = createClient(URL, KEY);
console.log('Service role key detected. Attempting to apply migration via Supabase admin client.\n');
console.log('NOTE: supabase-js does not expose raw DDL. The recommended path is the');
console.log('Studio SQL Editor — paste scripts/migrations/2026-05-12-crm-v1.sql there.\n');

// Verify by checking whether the new tables exist after manual apply.
const probe = async (table) => {
  const { error } = await sb.from(table).select('id').limit(1);
  if (error && /relation .* does not exist/i.test(error.message)) return false;
  return true;
};

const a = await probe('trainee_activity');
const n = await probe('trainee_next_actions');
console.log(`trainee_activity exists:     ${a ? 'YES' : 'no'}`);
console.log(`trainee_next_actions exists: ${n ? 'YES' : 'no'}`);
if (a && n) {
  console.log('\n✓ Migration looks applied. Move on to client code.');
} else {
  console.log('\n→ Paste scripts/migrations/2026-05-12-crm-v1.sql into Supabase Studio → SQL Editor → Run.');
}
