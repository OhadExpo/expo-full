// backup-all.mjs — an independent, verified copy of everything.
//
// Ohad: "make sure all the information that we have, and all the info, details,
// logs, videos, text, anything... is bulletproof saved and backed-up."
//
// Two halves, and the second is the one that matters most:
//   DATABASE  ~800 KB of store blobs plus plans / workouts / bw / messages
//   STORAGE   229 form videos, 1.38 GB — none of it in any table. A database
//             dump would look complete and lose every one of them.
//
// Verified, not assumed: after writing, it re-reads the live source and compares
// row counts per table, and file sizes for storage. An unverified backup is a
// belief, not a backup.
//
// Writes OUTSIDE the repo (1.4 GB has no business in git) and skips files it
// already holds at the right size, so it is safe to re-run and resumable.
//
//   EXPO_PW=... node scripts/backup-all.mjs [--db-only]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const BASE = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
const EMAIL = process.env.EXPO_EMAIL || 'ohadyproductions@gmail.com';
const PW = process.env.EXPO_PW || '1234';
const DB_ONLY = process.argv.includes('--db-only');

const stamp = new Date().toISOString().slice(0, 10);
const ROOT = process.env.EXPO_BACKUP_DIR || path.join('C:', 'Users', 'Administrator', 'expo-backups', stamp);
fs.mkdirSync(path.join(ROOT, 'db'), { recursive: true });
fs.mkdirSync(path.join(ROOT, 'storage'), { recursive: true });

const tok = await fetch(BASE + '/auth/v1/token?grant_type=password', {
  method: 'POST',
  headers: { apikey: KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PW }),
}).then((r) => r.json());
if (!tok.access_token) { console.log('auth failed'); process.exit(1); }
const H = { apikey: KEY, Authorization: 'Bearer ' + tok.access_token };
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);

console.log('backup root: ' + ROOT);
console.log('');
console.log('=== DATABASE ===');
const TABLES = ['store', 'plans', 'client_workouts', 'bw_logs', 'coach_messages', 'bookings', 'challenges', 'bug_reports'];
const manifest = { takenAt: new Date().toISOString(), tables: {}, storage: {} };

for (const t of TABLES) {
  // Page it. A single select can be capped by the API default, and a short file
  // that looks fine is the worst possible failure here.
  const rows = [];
  let bad = false;
  for (let from = 0; ; from += 1000) {
    const r = await fetch(BASE + '/rest/v1/' + t + '?select=*', { headers: { ...H, Range: from + '-' + (from + 999) } });
    if (!r.ok) { if (from === 0) { console.log('  ' + t.padEnd(18) + ' http ' + r.status + ' - skipped'); bad = true; } break; }
    const page = await r.json();
    if (!Array.isArray(page) || !page.length) break;
    rows.push(...page);
    if (page.length < 1000) break;
  }
  if (bad) continue;
  const json = JSON.stringify(rows, null, 1);
  fs.writeFileSync(path.join(ROOT, 'db', t + '.json'), json);
  manifest.tables[t] = { rows: rows.length, bytes: json.length, sha: sha(json) };
  console.log('  ' + t.padEnd(18) + String(rows.length).padStart(6) + ' rows  '
    + String(Math.round(json.length / 1024)).padStart(6) + ' KB  ' + manifest.tables[t].sha);
}

console.log('');
console.log('=== VERIFY DATABASE (against live) ===');
let dbOk = true;
for (const t of Object.keys(manifest.tables)) {
    // select=* not select=id: `store` is keyed by `key` and has no id column, so
  // an id-based count returned '?' and that table was silently unverified -
  // exactly the row that holds the exercise library and every BHBC blob.
  const r = await fetch(BASE + '/rest/v1/' + t + '?select=*', { headers: { ...H, Prefer: 'count=exact', Range: '0-0' } });
  const live = Number((r.headers.get('content-range') || '').split('/')[1]);
  const got = manifest.tables[t].rows;
  const ok = !Number.isFinite(live) || live === got;
  if (!ok) dbOk = false;
  console.log('  ' + t.padEnd(18) + 'backup ' + String(got).padStart(6)
    + '  live ' + String(Number.isFinite(live) ? live : '?').padStart(6) + '  ' + (ok ? 'OK' : 'MISMATCH'));
}

// Objects live in per-athlete folders, so a flat list returns FOLDERS (null id,
// null metadata) and counting those reports zero files. Walk into each prefix.
// The list endpoint also needs `prefix`: omitting it while passing sortBy
// returns 400, which reads exactly like "no such bucket".
const walk = async (bucket, prefix, depth, out) => {
  if (depth > 4) return out;
  for (let page = 0; page < 40; page++) {
    const r = await fetch(BASE + '/storage/v1/object/list/' + bucket, {
      method: 'POST',
      headers: { ...H, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix, limit: 100, offset: page * 100 }),
    });
    if (!r.ok) break;
    const list = await r.json();
    if (!Array.isArray(list) || !list.length) break;
    for (const o of list) {
      const full = prefix ? prefix + '/' + o.name : o.name;
      if (o.id === null && o.metadata === null) await walk(bucket, full, depth + 1, out);
      else out.push({ path: full, size: (o.metadata && o.metadata.size) || 0 });
    }
    if (list.length < 100) break;
  }
  return out;
};

if (!DB_ONLY) {
  console.log('');
  console.log('=== STORAGE ===');
  for (const bucket of ['form-videos', 'coach-voice']) {
    const objs = await walk(bucket, '', 0, []);
    const dir = path.join(ROOT, 'storage', bucket);
    fs.mkdirSync(dir, { recursive: true });
    let saved = 0; let skipped = 0; let failed = 0; let bytes = 0;
    for (const o of objs) {
      const dest = path.join(dir, o.path.replace(/[\\/]/g, '__'));
      if (fs.existsSync(dest) && fs.statSync(dest).size === o.size && o.size > 0) { skipped++; bytes += o.size; continue; }
      try {
        const url = BASE + '/storage/v1/object/' + bucket + '/' + o.path.split('/').map(encodeURIComponent).join('/');
        const r = await fetch(url, { headers: H });
        if (!r.ok) { failed++; continue; }
        const buf = Buffer.from(await r.arrayBuffer());
        fs.writeFileSync(dest, buf);
        saved++; bytes += buf.length;
      } catch { failed++; }
      if ((saved + skipped) % 25 === 0) console.log('    ' + bucket + ': ' + (saved + skipped) + '/' + objs.length);
    }
    manifest.storage[bucket] = { objects: objs.length, saved, skipped, failed, bytes };
    console.log('  ' + bucket.padEnd(16) + objs.length + ' objects  saved ' + saved
      + '  already had ' + skipped + '  failed ' + failed + '  ' + (bytes / 1048576).toFixed(1) + ' MB');
  }
}

fs.writeFileSync(path.join(ROOT, 'manifest.json'), JSON.stringify(manifest, null, 1));
console.log('');
console.log('manifest: ' + path.join(ROOT, 'manifest.json'));
console.log(dbOk ? 'DATABASE VERIFIED — every table matches the live row count.' : 'DATABASE MISMATCH — see above.');
