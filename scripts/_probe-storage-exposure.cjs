// Read-only proof of the open item from the 2026-07-19 security audit:
// "all 4 storage buckets are public:true → object READS need no auth at all".
//
// Takes a SMALL sample of URLs already stored in the DB and issues an
// UNAUTHENTICATED HEAD (never downloads the body) to establish whether a
// stranger with the URL can fetch an athlete's video / meal photo / voice note.
// Nothing is written and no content is retrieved.
const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');

const SAMPLE = 2; // per bucket — enough to prove the rule, minimal touching

const headNoAuth = async (url) => {
  try {
    const r = await fetch(url, { method: 'HEAD' });
    return { status: r.status, type: r.headers.get('content-type'), len: r.headers.get('content-length') };
  } catch (e) { return { status: 'ERR', msg: String(e).slice(0, 60) }; }
};

const bucketOf = (u) => { const m = String(u).match(/\/object\/public\/([^/]+)\//); return m ? m[1] : null; };

(async () => {
  const { error } = await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  if (error) { console.log('AUTH FAIL', error.message); process.exit(1); }

  const found = new Map(); // bucket -> [urls]
  const add = (u) => {
    const b = bucketOf(u);
    if (!b) return;
    const arr = found.get(b) || [];
    if (arr.length < SAMPLE && !arr.includes(u)) { arr.push(u); found.set(b, arr); }
  };

  // form videos live on client_workouts.form_videos
  const cw = await s.from('client_workouts').select('form_videos').not('form_videos', 'is', null).limit(60);
  for (const r of (cw.data || [])) {
    const fv = r.form_videos;
    const vals = Array.isArray(fv) ? fv : Object.values(fv || {});
    for (const v of vals) { if (v && typeof v === 'object' && v.cloudUrl) add(v.cloudUrl); }
  }
  // coach voice notes
  const cm = await s.from('coach_messages').select('voice_url').not('voice_url', 'is', null).limit(30);
  for (const r of (cm.data || [])) add(r.voice_url);

  console.log('sampled buckets:', [...found.keys()].join(', ') || '(none found in the sampled rows)');
  console.log('');
  for (const [bucket, urls] of found) {
    for (const u of urls) {
      const res = await headNoAuth(u);
      const path = u.split('/object/public/')[1] || u;
      console.log(`${bucket.padEnd(20)} HEAD(no auth) -> ${String(res.status).padEnd(5)} ${res.type || ''} ${res.len ? res.len + 'B' : ''}`);
      console.log(`  ${path.slice(0, 110)}`);
    }
  }
  console.log('\n200 = a stranger holding the URL can fetch it. 400/403 = the bucket is private.');
})();
