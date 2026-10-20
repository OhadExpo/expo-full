// From 2026-10-30 Supabase stops auto-granting Data API access to NEW tables in
// "public" (notice 20.10). A table created without an explicit GRANT answers
// supabase-js with "permission denied" — the app breaks, nothing else warns.
// Half the table-creating migrations before this date relied on the old
// default (8 of 16), so the habit is real. Every migration dated 2026-10-20 or
// later that creates a public table must grant it in the SAME file.
// Recreating a table (drop + create) counts as new.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'scripts/migrations';
const FROM = '2026-10-20';
const bad = [];
for (const f of readdirSync(DIR).filter((n) => n.endsWith('.sql') && n.slice(0, 10) >= FROM).sort()) {
  const sql = readFileSync(join(DIR, f), 'utf8').replace(/--[^\n]*/g, '');
  const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi;
  for (const m of sql.matchAll(re)) {
    const t = m[1];
    if (/^(?:temp|temporary)$/i.test(t)) continue;
    const granted = new RegExp(`grant\\s[^;]*\\son\\s+(?:table\\s+)?(?:public\\.)?"?${t}"?\\s[^;]*\\bto\\s+[^;]*\\bauthenticated\\b`, 'i').test(sql);
    if (!granted) bad.push(`${f}: public.${t} has no GRANT ... TO authenticated`);
  }
}
if (bad.length) {
  console.error('verify-migration-grants: new tables need explicit grants (Supabase, from 2026-10-30):');
  for (const b of bad) console.error('  ' + b);
  console.error('Add in the same migration:\n  grant select, insert, update, delete on public.<t> to authenticated;\n  grant select, insert, update, delete on public.<t> to service_role;\n  (and to anon only if signed-out pages read it)');
  process.exit(1);
}
console.log('verify-migration-grants: ok');
