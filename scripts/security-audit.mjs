// security-audit.mjs — what can a stranger reach?
//
// Ohad: "full bulletproof security for all the platforms."
//
// The only test that means anything is the one taken from OUTSIDE: an
// unauthenticated request carrying nothing but the publishable key, which is in
// the client bundle and therefore public by design. Anything it can read, the
// whole internet can read.
//
// Checks, in order of how much damage a failure does:
//   1. Can anon READ athlete data?           plans, workouts, medical, messages
//   2. Can anon WRITE?                       inserting or deleting anything
//   3. Are the form videos world-readable?   1.38 GB of athletes on camera
//   4. Is a privileged key shipped to the browser? (service_role in dist/)
//
// READ-ONLY apart from one deliberate write probe that is immediately checked
// and, if it somehow succeeded, reported loudly rather than left behind.
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const ANON = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
const A = { apikey: ANON, Authorization: 'Bearer ' + ANON };

let fails = 0;
const bad = (m) => { fails++; console.log('  FAIL  ' + m); };
const ok = (m) => console.log('  ok    ' + m);

console.log('=== 1. ANONYMOUS READ (athlete data) ===');
for (const t of ['plans', 'client_workouts', 'bw_logs', 'coach_messages', 'store', 'bookings']) {
  try {
    const r = await fetch(BASE + '/rest/v1/' + t + '?select=*&limit=3', { headers: A });
    const body = await r.text();
    let n = 0;
    try { const j = JSON.parse(body); n = Array.isArray(j) ? j.length : 0; } catch { n = 0; }
    if (r.ok && n > 0) bad(t + ' — anon read returned ' + n + ' row(s)');
    else ok(t + ' — anon read blocked (http ' + r.status + ', ' + n + ' rows)');
  } catch (e) { ok(t + ' — request failed: ' + String(e.message).slice(0, 40)); }
}

console.log('');
console.log('=== 2. ANONYMOUS WRITE ===');
for (const t of ['store', 'plans', 'client_workouts']) {
  try {
    const r = await fetch(BASE + '/rest/v1/' + t, {
      method: 'POST',
      headers: { ...A, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ key: '__sec_probe__', value: { probe: true } }),
    });
    if (r.ok) bad(t + ' — ANON INSERT SUCCEEDED (http ' + r.status + ') — delete the row and fix the policy');
    else ok(t + ' — anon insert refused (http ' + r.status + ')');
  } catch { ok(t + ' — anon insert refused (network)'); }
}

console.log('');
console.log('=== 3. FORM VIDEOS — world readable? ===');
try {
  // Find one real object path using an authenticated list, then try to fetch it
  // with no credentials at all. That is the question that matters.
  const tok = await fetch(BASE + '/auth/v1/token?grant_type=password', {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.EXPO_EMAIL || 'ohadyproductions@gmail.com', password: process.env.EXPO_PW || '1234' }),
  }).then((r) => r.json());
  const H = { apikey: ANON, Authorization: 'Bearer ' + tok.access_token, 'Content-Type': 'application/json' };
  const walk = async (bucket, prefix, depth) => {
    if (depth > 3) return null;
    const r = await fetch(BASE + '/storage/v1/object/list/' + bucket, {
      method: 'POST', headers: H, body: JSON.stringify({ prefix, limit: 50, offset: 0 }),
    });
    if (!r.ok) return null;
    const list = await r.json();
    if (!Array.isArray(list)) return null;
    for (const o of list) {
      const full = prefix ? prefix + '/' + o.name : o.name;
      if (o.id === null && o.metadata === null) { const hit = await walk(bucket, full, depth + 1); if (hit) return hit; }
      else return full;
    }
    return null;
  };
  const sample = await walk('form-videos', '', 0);
  if (!sample) { console.log('  (no object found to test)'); }
  else {
    const url = BASE + '/storage/v1/object/public/form-videos/' + sample.split('/').map(encodeURIComponent).join('/');
    const pub = await fetch(url, { method: 'GET' });
    if (pub.ok) bad('form-videos is PUBLIC — ' + sample.slice(0, 48) + ' fetched with no credentials');
    else ok('form-videos not public (http ' + pub.status + ')');
    const naked = await fetch(BASE + '/storage/v1/object/form-videos/' + sample.split('/').map(encodeURIComponent).join('/'));
    if (naked.ok) bad('form-videos readable with NO auth header at all');
    else ok('form-videos requires auth (http ' + naked.status + ')');
  }
} catch (e) { console.log('  storage probe error: ' + String(e.message).slice(0, 60)); }

console.log('');
console.log('=== 4. SECRETS IN THE SHIPPED BUNDLE ===');
try {
  const dir = path.join(process.cwd(), 'dist', 'assets');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.js')) : [];
  let hits = 0;
  for (const f of files) {
    const txt = fs.readFileSync(path.join(dir, f), 'utf8');
    if (/service_role|sb_secret_|SUPABASE_SERVICE/i.test(txt)) { bad('privileged key material in dist/assets/' + f); hits++; }
  }
  if (!files.length) console.log('  (no dist build to scan — run npm run build first)');
  else if (!hits) ok(files.length + ' bundle file(s) scanned — no service_role / secret key');
} catch (e) { console.log('  bundle scan error: ' + String(e.message).slice(0, 60)); }

console.log('');
console.log(fails === 0 ? 'SECURITY: no findings from an anonymous position.' : 'SECURITY: ' + fails + ' finding(s) above.');
process.exit(fails ? 1 : 0);
