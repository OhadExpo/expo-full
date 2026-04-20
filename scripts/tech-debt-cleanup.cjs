const SUPA_URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const SUPA_KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
const h = { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json' };

(async () => {
  // (1) Delete orphan client_workouts (client_id in t3, t4, t5)
  const orphanIds = ['t3', 't4', 't5'];
  let deleted = 0;
  for (const cid of orphanIds) {
    const r = await fetch(SUPA_URL + '/rest/v1/client_workouts?client_id=eq.' + cid, {
      method: 'DELETE', headers: { ...h, Prefer: 'return=representation' },
    });
    const body = await r.json();
    const n = Array.isArray(body) ? body.length : 0;
    console.log('deleted client_workouts where client_id=' + cid + ':', n);
    deleted += n;
  }
  console.log('Orphan client_workouts total deleted:', deleted);

  // (6) Delete legacy expo-plans store key
  const dr = await fetch(SUPA_URL + '/rest/v1/store?key=eq.expo-plans', {
    method: 'DELETE', headers: { ...h, Prefer: 'return=representation' },
  });
  const drBody = await dr.json();
  console.log('\nexpo-plans store key deleted:', Array.isArray(drBody) ? drBody.length : dr.status);

  // (5) Prune portalVis keys that reference non-existent plans
  const vR = await fetch(SUPA_URL + '/rest/v1/store?key=eq.expo-portal-vis&select=value', { headers: h });
  const vis = (await vR.json())[0]?.value || {};
  const visKeys = Object.keys(vis);
  console.log('\nportalVis keys before:', visKeys.length);

  const tR = await fetch(SUPA_URL + '/rest/v1/store?key=eq.expo-trainees&select=value', { headers: h });
  const trainees = (await tR.json())[0]?.value || [];
  const pR = await fetch(SUPA_URL + '/rest/v1/plans?select=trainee_id,name', { headers: h });
  const plans = await pR.json();

  const traineeById = {};
  trainees.forEach(t => { traineeById[t.id] = t; });

  const validKeys = new Set();
  for (const p of plans) {
    const tid = p.trainee_id;
    if (!tid) continue;
    const m = tid.match(/^(.+)__(\d+)$/);
    if (m) {
      const parent = traineeById[m[1]];
      if (parent) validKeys.add(parent.name + ':' + p.name + ':m' + m[2]);
    } else {
      const t = traineeById[tid];
      if (t) validKeys.add(t.name + ':' + p.name);
    }
  }
  console.log('Valid visKeys from current plans:', validKeys.size);

  const cleaned = {};
  for (const k of visKeys) if (validKeys.has(k)) cleaned[k] = vis[k];
  const dropped = visKeys.length - Object.keys(cleaned).length;
  console.log('Orphan visKeys dropped:', dropped);
  console.log('portalVis keys after:', Object.keys(cleaned).length);

  if (dropped > 0) {
    const sr = await fetch(SUPA_URL + '/rest/v1/store', {
      method: 'POST',
      headers: { ...h, Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ key: 'expo-portal-vis', value: cleaned }),
    });
    console.log('portalVis save status:', sr.status);
  }
})();
