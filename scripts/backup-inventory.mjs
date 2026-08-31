// backup-inventory.mjs — what is there to lose?
//
// Ohad: "make sure all the information that we have, and all the info, details,
// logs, videos, text, anything... is bulletproof saved and backed-up."
//
// Step one is knowing the shape of it. A backup written against a guess misses
// exactly the thing nobody thought of - and for this app that is Storage: the
// form videos and voice notes live in buckets, not in any table, so a database
// dump alone would look complete and lose them.
//
// READ ONLY.
//   EXPO_PW=... node scripts/backup-inventory.mjs
const BASE = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
const EMAIL = process.env.EXPO_EMAIL || 'ohadyproductions@gmail.com';
const PW = process.env.EXPO_PW || '1234';

const tok = await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
  method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PW }),
}).then((r) => r.json());
if (!tok.access_token) { console.log('auth failed'); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${tok.access_token}` };

const TABLES = ['store', 'plans', 'client_workouts', 'bw_logs', 'coach_messages',
  'trainees', 'tasks', 'payments', 'bookings', 'challenges', 'bug_reports'];

console.log('=== TABLES ===');
const present = [];
for (const t of TABLES) {
  try {
    const r = await fetch(`${BASE}/rest/v1/${t}?select=*`, { headers: { ...H, Prefer: 'count=exact', Range: '0-0' } });
    const cr = r.headers.get('content-range') || '';
    const n = cr.split('/')[1];
    if (r.status >= 400) { console.log(`  ${t.padEnd(18)} http ${r.status}`); continue; }
    present.push(t);
    console.log(`  ${t.padEnd(18)} ${String(n).padStart(8)} rows`);
  } catch (e) { console.log(`  ${t.padEnd(18)} error ${String(e.message).slice(0, 40)}`); }
}

console.log('\n=== STORE KEYS (each is a whole JSON blob) ===');
try {
  const rows = await fetch(`${BASE}/rest/v1/store?select=key,value`, { headers: H }).then((r) => r.json());
  let total = 0;
  const sized = rows.map((r) => {
    const b = JSON.stringify(r.value ?? null).length;
    total += b;
    return { key: r.key, kb: Math.round(b / 1024) };
  }).sort((a, b) => b.kb - a.kb);
  for (const s of sized) console.log(`  ${s.key.padEnd(34)} ${String(s.kb).padStart(6)} KB`);
  console.log(`  ${'TOTAL'.padEnd(34)} ${String(Math.round(total / 1024)).padStart(6)} KB across ${rows.length} keys`);
} catch (e) { console.log('  store read failed:', String(e.message).slice(0, 60)); }

console.log('');
console.log('=== STORAGE (what a DB dump would miss) ===');
// Objects live in per-athlete folders, so a flat list returns FOLDERS - entries
// with a null id and null metadata - and counting those reports zero files.
// Walk into each prefix. Also: the list endpoint needs `prefix`; omitting it
// while passing sortBy returns 400, which reads exactly like "no such bucket".
const walk = async (bucket, prefix = '', depth = 0) => {
  let files = 0, bytes = 0;
  if (depth > 4) return { files, bytes };
  for (let page = 0; page < 40; page++) {
    const r = await fetch(`${BASE}/storage/v1/object/list/${bucket}`, {
      method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix, limit: 100, offset: page * 100 }),
    });
    if (!r.ok) break;
    const list = await r.json();
    if (!Array.isArray(list) || !list.length) break;
    for (const o of list) {
      if (o.id === null && o.metadata === null) {
        const sub = await walk(bucket, prefix ? `${prefix}/${o.name}` : o.name, depth + 1);
        files += sub.files; bytes += sub.bytes;
      } else {
        files++; bytes += (o.metadata && o.metadata.size) || 0;
      }
    }
    if (list.length < 100) break;
  }
  return { files, bytes };
};
for (const bucket of ['form-videos', 'coach-voice']) {
  const { files, bytes } = await walk(bucket);
  console.log(`  ${bucket.padEnd(16)} ${String(files).padStart(5)} files  ${(bytes / 1048576).toFixed(1)} MB`);
}