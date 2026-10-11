// verify-sandbox-parity.mjs - ELAD'S VERSION GETS EVERY UPDATE THE MAIN APP GETS (11.10 #655).
//
// Ohad, 11.10: "Make sure the demo and elad version are always updates as the main app gets
// updates. Forever. Always. Continuous". Elad's partner seat runs the SAME client code on his own
// sbx_ copy of the data (src/supabase.js reroutes from()/rpc() while he is signed in). So code
// reaches him on every deploy by itself - what drifts is the ROUTING: a table or RPC the app
// starts calling that is not in SBX_TABLES / SBX_RPC reads nothing in his seat (fails closed), or
// an RPC hits the real data's rules instead of his copy's. This runs in `npm run build`:
//   every .from('<table>') and .rpc('<fn>') literal under src/ must be sandboxed, or be listed
//   below with the reason it does not need to be.
// The DATABASE half (a new table / column in public with no sbx_ twin) is SCHEMA_DRIFT_SQL at the
// bottom - run it through the Supabase MCP before every deploy (expo-site-parity skill, step 0).
//   node scripts/verify-sandbox-parity.mjs        BREAK=1 adds a call to an unsandboxed table
import fs from 'node:fs';
import path from 'node:path';

// called by the client, deliberately NOT rerouted - each with its reason
const NOT_SANDBOXED_RPC = {
  my_trainee: 'athlete portal only - the partner seat never opens it',
  bhbc_activity_append: 'BHBC trail; refuses any non-club-coach with 42501, so it fails closed for the partner',
};
const NOT_SANDBOXED_TABLES = {};

const src = fs.readFileSync('src/supabase.js', 'utf8');
const tablesBlock = (src.match(/const SBX_TABLES = new Set\(\[([\s\S]*?)\]\)/) || [])[1];
const rpcBlock = (src.match(/const SBX_RPC = Object\.fromEntries\(\[([\s\S]*?)\]\.map/) || [])[1];
if (!tablesBlock || !rpcBlock) { console.log('SANDBOX PARITY: could not read SBX_TABLES / SBX_RPC from src/supabase.js - the gate cannot judge'); process.exit(1); }
const names = (s) => new Set([...s.matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]));
const SBX_TABLES = names(tablesBlock), SBX_RPC = names(rpcBlock);

const calls = [];
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    if (!/\.(js|jsx|mjs|ts|tsx)$/.test(e.name)) continue;
    const text = fs.readFileSync(p, 'utf8');
    for (const m of text.matchAll(/\.(from|rpc)\(\s*['"]([a-z0-9_]+)['"]/g)) {
      if (m[2].startsWith('sbx_')) continue;
      calls.push({ kind: m[1], name: m[2], file: p.replace(/\\/g, '/') });
    }
  }
};
walk('src');
if (process.env.BREAK) calls.push({ kind: 'from', name: 'brand_new_table', file: 'BREAK' });

const bad = calls.filter((c) => c.kind === 'from'
  ? !SBX_TABLES.has(c.name) && !(c.name in NOT_SANDBOXED_TABLES)
  : !SBX_RPC.has(c.name) && !(c.name in NOT_SANDBOXED_RPC));
const seen = new Set(calls.map((c) => c.kind + ':' + c.name));
if (bad.length) {
  console.log(`SANDBOX PARITY: ${bad.length} call(s) the partner seat would not route to his copy:`);
  for (const c of bad) console.log(`  .${c.kind}('${c.name}')  ${c.file}`);
  console.log('Add an sbx_ copy (DB) + the name to SBX_TABLES / SBX_RPC in src/supabase.js, or list it here with the reason.');
  process.exit(1);
}
console.log(`SANDBOX PARITY: ${seen.size} tables/RPCs the client calls, all routed to Elad's copy or listed with a reason`);

export const SCHEMA_DRIFT_SQL = `
with real as (
  select c.table_name t, c.column_name col from information_schema.columns c
  join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name
  where c.table_schema = 'public' and c.table_name not like 'sbx\\_%' and tb.table_type in ('BASE TABLE', 'VIEW')),
sbx as (select substr(c.table_name, 5) t, c.column_name col from information_schema.columns c
  where c.table_schema = 'public' and c.table_name like 'sbx\\_%')
select 'TABLE_NO_TWIN' kind, t, null col from (select distinct t from real) r where not exists (select 1 from sbx s where s.t = r.t)
union all
select 'COLUMN_MISSING', r.t, r.col from real r where exists (select 1 from sbx s where s.t = r.t)
  and not exists (select 1 from sbx s where s.t = r.t and s.col = r.col)
order by 1, 2, 3;`;
// Known, expected TABLE_NO_TWIN rows (11.10): api_daily_budget (server-side API budget),
// push_subscriptions + push_nudge_log (push is a no-op in the sandbox), *_backup_* tables.
