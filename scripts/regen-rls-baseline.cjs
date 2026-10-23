// Regenerate scripts/rls-baseline.json from the LIVE prod RLS manifest.
//
// Run this ONLY after an INTENTIONAL RLS/grant change, and commit the new
// baseline in the same change — otherwise the athlete-health canary pages
// the coach about drift. That page-on-unexplained-change behavior is the
// whole point; do not regen to silence an alert you can't explain.
//
// Secret: pass via env  $env:HEALTH_SECRET = '...'  or .env.canary
// (vercel env pull .env.canary --environment production).
const fs = require('fs');
const { createHash } = require('crypto');

const URL_ = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';

function secretFromEnvFile() {
  try {
    const line = fs.readFileSync('.env.canary', 'utf8').split('\n').find(l => l.startsWith('HEALTH_SECRET='));
    if (!line) return null;
    let v = line.slice('HEALTH_SECRET='.length).trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    return v || null;
  } catch { return null; }
}

function ownerFromEnv() {
  let email = process.env.EXPO_OWNER_EMAIL, password = process.env.EXPO_OWNER_PW;
  if (!email || !password) {
    try {
      const txt = fs.readFileSync('.env.owner.local', 'utf8');
      const get = (k) => ((txt.split('\n').find((l) => l.startsWith(k + '=')) || '').slice(k.length + 1).trim());
      email = email || get('EXPO_OWNER_EMAIL'); password = password || get('EXPO_OWNER_PW');
    } catch { /* none */ }
  }
  return email && password ? { email, password } : null;
}

function stableStringify(v) {
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
  }
  return JSON.stringify(v);
}

(async () => {
  const secret = process.env.HEALTH_SECRET || secretFromEnvFile();
  // No secret at hand (#932, 23.10): the OWNER's seat reads the same manifest through health_rls_manifest_owner(), which
  // passes the secret inside the database - EXPO_OWNER_EMAIL / EXPO_OWNER_PW or .env.owner.local, like scripts/lib.
  let r;
  if (secret) {
    r = await fetch(`${URL_}/rest/v1/rpc/health_rls_manifest`, {
      method: 'POST',
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ p_secret: secret }),
    });
  } else {
    const owner = ownerFromEnv();
    if (!owner) { console.error('neither HEALTH_SECRET (env / .env.canary) nor the owner login (EXPO_OWNER_EMAIL / EXPO_OWNER_PW / .env.owner.local).'); process.exit(1); }
    const t = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: KEY, 'content-type': 'application/json' }, body: JSON.stringify(owner),
    });
    const tok = t.ok ? (await t.json()).access_token : null;
    if (!tok) { console.error('owner sign-in failed', t.status); process.exit(1); }
    r = await fetch(`${URL_}/rest/v1/rpc/health_rls_manifest_owner`, {
      method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${tok}`, 'content-type': 'application/json' }, body: '{}',
    });
  }
  if (!r.ok) { console.error('manifest RPC HTTP', r.status, (await r.text()).slice(0, 200)); process.exit(1); }
  const manifest = await r.json();
  if (!manifest) { console.error('manifest is null — secret mismatch with the SQL function.'); process.exit(1); }
  const hash = createHash('sha256').update(stableStringify(manifest)).digest('hex');
  const out = { generatedAt: new Date().toISOString(), hash, manifest };
  fs.writeFileSync('scripts/rls-baseline.json', JSON.stringify(out, null, 1) + '\n');
  console.log('baseline written: scripts/rls-baseline.json');
  console.log('  policies:', manifest.policies.length, '| functions:', manifest.functions.length, '| tables:', manifest.rls.length);
  console.log('  hash:', hash);
})().catch(e => { console.error(e); process.exit(1); });
