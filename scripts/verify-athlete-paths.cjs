// Live verification AS A REAL ATHLETE (Diego, the canary fixture):
// exercises every ClientPortal read/write path against prod RLS, including
// the exact x-upsert XHR upload shape that broke on 2026-06-12.
// Secrets come from .env.canary (vercel env pull, gitignored).
const fs = require('fs');
const URL_ = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
const env = Object.fromEntries(fs.readFileSync('.env.canary','utf8').split('\n')
  .filter(l => /^[A-Z_]+=/.test(l)).map(l => { const i = l.indexOf('='); let v = l.slice(0,i); let val = l.slice(i+1).trim(); if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1,-1); return [v, val]; }));

(async () => {
  // 0. trigger the deployed canary itself
  const canary = await fetch('https://expo-app.co.il/api/cron/athlete-health', {
    headers: { Authorization: `Bearer ${env.HEALTH_SECRET}` } });
  console.log('deployed canary:', canary.status, JSON.stringify(await canary.json()));

  // 1. sign in as Diego
  const si = await fetch(`${URL_}/auth/v1/token?grant_type=password`, { method:'POST',
    headers:{ apikey:KEY,'content-type':'application/json' },
    body: JSON.stringify({ email:'diego@diegoday.com', password: env.CANARY_PASSWORD }) });
  const tok = (await si.json())?.access_token;
  console.log('diego sign-in:', si.status, tok ? 'token ok' : 'NO TOKEN');
  if (!tok) process.exit(1);
  const ah = { apikey:KEY, Authorization:`Bearer ${tok}`, 'content-type':'application/json' };
  const probe = async (label, url, opts={}) => {
    const r = await fetch(url, { headers: ah, ...opts, headers: { ...ah, ...(opts.headers||{}) } });
    let body = ''; try { body = (await r.text()).slice(0,140); } catch {}
    console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${label}: ${r.status}${r.ok ? '' : ' ' + body}`);
    return r;
  };

  // 2. reads — every table the portal touches
  await probe('plans read', `${URL_}/rest/v1/plans?select=id&limit=1`);
  await probe('exercises read', `${URL_}/rest/v1/store?key=eq.expo-exercises&select=key&limit=1`);
  await probe('client_workouts read', `${URL_}/rest/v1/client_workouts?select=id&limit=1`);
  await probe('bw_logs read', `${URL_}/rest/v1/bw_logs?select=id&limit=1`);
  await probe('weekly_focus read', `${URL_}/rest/v1/weekly_focus?select=*&limit=1`);
  await probe('athlete_meals read', `${URL_}/rest/v1/athlete_meals?select=id&limit=1`);
  await probe('coach_messages read', `${URL_}/rest/v1/coach_messages?select=id&limit=1`);
  await probe('challenges read', `${URL_}/rest/v1/challenges?select=id&limit=1`);
  await probe('challenge_participants read', `${URL_}/rest/v1/challenge_participants?select=*&limit=1`);

  // 3. rpcs
  await probe('rpc my_trainee', `${URL_}/rest/v1/rpc/my_trainee`, { method:'POST', body:'{}' });
  await probe('rpc current_trainee_id', `${URL_}/rest/v1/rpc/current_trainee_id`, { method:'POST', body:'{}' });

  // 4. EXACT app upload shape: POST + x-upsert as the athlete (fresh ts path)
  const path1 = `tr_diego/${Date.now()}-verify.txt`;
  await probe('video upload (authed, x-upsert, fresh path)', `${URL_}/storage/v1/object/form-videos/${path1}`,
    { method:'POST', headers:{ 'content-type':'text/plain','x-upsert':'true' }, body:'verify' });

  // 5. same shape but ANON (the XHR primary path)
  const path2 = `tr_diego/${Date.now()}-verify-anon.txt`;
  const anonH = { apikey:KEY, Authorization:`Bearer ${KEY}` };
  const r5 = await fetch(`${URL_}/storage/v1/object/form-videos/${path2}`,
    { method:'POST', headers:{ ...anonH, 'content-type':'text/plain','x-upsert':'true' }, body:'verify' });
  console.log(`${r5.ok?'OK  ':'FAIL'} video upload (anon XHR shape): ${r5.status}${r5.ok?'':' '+(await r5.text()).slice(0,140)}`);

  // 6. RETRY same path (x-upsert on EXISTING object → ON CONFLICT DO UPDATE arm)
  await probe('video upload RETRY same path (authed)', `${URL_}/storage/v1/object/form-videos/${path1}`,
    { method:'POST', headers:{ 'content-type':'text/plain','x-upsert':'true' }, body:'verify-retry' });

  // 7. presence heartbeat write (the one store key athletes write)
  const pres = await fetch(`${URL_}/rest/v1/store?on_conflict=key`, { method:'POST',
    headers:{ ...ah, Prefer:'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ key:'expo-presence-tr_diego', value:{ at: new Date().toISOString(), canary:true } }) });
  console.log(`${pres.ok?'OK  ':'FAIL'} presence heartbeat upsert: ${pres.status}${pres.ok?'':' '+(await pres.text()).slice(0,140)}`);

  console.log('\npaths used:', path1, path2, '(cleanup via trainer next)');
})().catch(e => { console.error(e); process.exit(1); });
