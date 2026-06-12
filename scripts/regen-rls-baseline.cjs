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

function stableStringify(v) {
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
  }
  return JSON.stringify(v);
}

(async () => {
  const secret = process.env.HEALTH_SECRET || secretFromEnvFile();
  if (!secret) { console.error('HEALTH_SECRET not found (env var or .env.canary).'); process.exit(1); }
  const r = await fetch(`${URL_}/rest/v1/rpc/health_rls_manifest`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ p_secret: secret }),
  });
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
