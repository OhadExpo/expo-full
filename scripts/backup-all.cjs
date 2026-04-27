// Nightly backup: dump everything in Supabase to a timestamped JSON file.
//
// Run manually:
//   node scripts/backup-all.cjs
//
// Run nightly via Windows Task Scheduler or cron (Mac/Linux):
//   0 3 * * *  cd /path/to/expo-full && node scripts/backup-all.cjs
//
// Output: backups/expo-backup-YYYY-MM-DDTHH-MM-SSZ.json
// Plus: backups/latest.json (symlink-style copy of the newest backup) so
//       restore scripts can find the most recent dump without globbing.
//
// Auth: signs in as the trainer to bypass RLS — see
//       memory/reference_scripts_trainer_auth.md for why.

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPA_URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const SUPA_KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';

const s = createClient(SUPA_URL, SUPA_KEY);

async function main() {
  const t0 = Date.now();

  const { error: signInErr } = await s.auth.signInWithPassword({
    email: 'ohadyproductions@gmail.com',
    password: '1234',
  });
  if (signInErr) {
    console.error('Sign-in failed:', signInErr.message);
    process.exit(1);
  }

  const dump = {
    backupAt: new Date().toISOString(),
    schemaVersion: 1,
    tables: {},
  };

  // Tables to dump. Each entry: [tableName, orderBy?].
  const TABLES = [
    ['plans', 'created_at'],
    ['client_workouts', 'date'],
    ['bw_logs', 'date'],
    ['store', null], // store keys: trainees, exercises, payments, weeklyFocus, portalVis, etc.
  ];

  for (const [table, orderBy] of TABLES) {
    process.stdout.write(`  ${table}… `);
    let q = s.from(table).select('*');
    if (orderBy) q = q.order(orderBy, { ascending: true });
    const { data, error } = await q;
    if (error) {
      console.error(`FAILED: ${error.message}`);
      dump.tables[table] = { error: error.message };
      continue;
    }
    dump.tables[table] = data;
    console.log(`${data.length} rows`);
  }

  const outDir = path.join(__dirname, '..', 'backups');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = dump.backupAt.replace(/[:.]/g, '-');
  const outPath = path.join(outDir, `expo-backup-${stamp}.json`);
  const latestPath = path.join(outDir, 'latest.json');
  const json = JSON.stringify(dump, null, 2);
  fs.writeFileSync(outPath, json);
  fs.writeFileSync(latestPath, json);

  // Retention: keep the newest 30 backups, drop the rest. Keeps the folder
  // from ballooning — daily run × infinity = problem otherwise.
  const KEEP = 30;
  const all = fs.readdirSync(outDir)
    .filter(f => /^expo-backup-.*\.json$/.test(f))
    .map(f => ({ f, mtime: fs.statSync(path.join(outDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  for (const old of all.slice(KEEP)) {
    fs.unlinkSync(path.join(outDir, old.f));
    console.log(`  pruned old: ${old.f}`);
  }

  const sizeKB = Math.round(Buffer.byteLength(json) / 1024);
  console.log(`\n✓ ${sizeKB}KB → ${path.relative(process.cwd(), outPath)}  (${Date.now() - t0}ms)`);
}

main().catch(e => { console.error('Backup failed:', e); process.exit(1); });
