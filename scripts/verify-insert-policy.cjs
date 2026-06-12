// Verify the tightened form-videos INSERT policy:
//  A) authenticated athlete -> OWN folder      : must SUCCEED
//  B) authenticated athlete -> ANOTHER folder   : must FAIL (forgery blocked)
//  C) anon (publishable key) -> any folder      : must FAIL (DoS vector closed)
const fs = require('fs');
const URL_ = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
function envVal(k){ for (const f of ['.env.canary','.env.canary2']) { try { const l=fs.readFileSync(f,'utf8').split('\n').find(x=>x.startsWith(k+'=')); if(l){ let v=l.slice(k.length+1).trim(); if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1); if(v) return v; } } catch {} } return ''; }
(async () => {
  const pw = envVal('CANARY_PASSWORD');
  const si = await fetch(`${URL_}/auth/v1/token?grant_type=password`, { method:'POST', headers:{apikey:KEY,'content-type':'application/json'}, body:JSON.stringify({email:'diego@diegoday.com',password:pw})});
  const tok = (await si.json())?.access_token;
  if (!tok) { console.error('Diego sign-in failed'); process.exit(1); }
  const put = async (folder, bearer, label) => {
    const r = await fetch(`${URL_}/storage/v1/object/form-videos/${folder}/policy-test-${Math.floor(Math.random()*1e6).toString(36)}.txt`, {
      method:'POST', headers:{apikey:KEY, Authorization:`Bearer ${bearer}`, 'content-type':'text/plain','x-upsert':'true'}, body:'x' });
    let m=''; try{m=(await r.json())?.message||'';}catch{}
    console.log(`${label}: HTTP ${r.status} ${r.ok?'OK':m}`);
    return r;
  };
  const a = await put('tr_diego', tok, 'A authed->own  (expect 200)');
  const b = await put('tr_amit',  tok, 'B authed->other(expect 403)');
  const c = await put('tr_diego', KEY, 'C anon->any    (expect 4xx)');
  const pass = a.ok && !b.ok && !c.ok;
  console.log('\nVERDICT:', pass ? 'PASS — real upload works, forgery + anon blocked' : 'FAIL — review above');
  process.exit(pass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
