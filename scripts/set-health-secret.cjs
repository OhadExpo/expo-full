// Set HEALTH_SECRET on Vercel production via REST API (the CLI's `env add`
// prompt hangs under -NonInteractive on this host). Reads the CLI token.
const fs = require('fs');
const os = require('os');
const path = require('path');
const token = JSON.parse(fs.readFileSync(path.join(os.homedir(), 'AppData/Roaming/com.vercel.cli/Data/auth.json'), 'utf8')).token;
const proj = JSON.parse(fs.readFileSync('.vercel/project.json', 'utf8'));
const secret = fs.readFileSync('.health-secret-new', 'utf8').trim();

(async () => {
  const base = `https://api.vercel.com`;
  const q = `teamId=${proj.orgId}`;
  // remove any existing HEALTH_SECRET first
  const list = await (await fetch(`${base}/v9/projects/${proj.projectId}/env?${q}`, { headers: { Authorization: `Bearer ${token}` } })).json();
  for (const e of (list.envs || []).filter(e => e.key === 'HEALTH_SECRET')) {
    const d = await fetch(`${base}/v9/projects/${proj.projectId}/env/${e.id}?${q}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    console.log('deleted old', e.id, d.status);
  }
  const r = await fetch(`${base}/v10/projects/${proj.projectId}/env?${q}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ key: 'HEALTH_SECRET', value: secret, type: 'encrypted', target: ['production'] }),
  });
  console.log('create:', r.status, JSON.stringify(await r.json()).slice(0, 200));
  // verify by reading back decrypted
  const list2 = await (await fetch(`${base}/v9/projects/${proj.projectId}/env?decrypt=true&${q}`, { headers: { Authorization: `Bearer ${token}` } })).json();
  const mine = (list2.envs || []).find(e => e.key === 'HEALTH_SECRET');
  console.log('readback match:', mine && mine.value === secret);
})().catch(e => { console.error(e); process.exit(1); });
