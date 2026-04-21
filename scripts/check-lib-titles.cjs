const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
(async () => {
  const { data: er } = await s.from('store').select('value').eq('key','expo-exercises').maybeSingle();
  const exs = er?.value || [];
  const check = ['BB Deadlift','Seated Cable Facepull','Standing DB Lateral Raise','Inclined DB Chest Press','BB OHP','Chin-Up','Wide-Grip Pull-Up','BW Step-Up','GHD ABs Sit-Up'];
  for (const q of check) {
    const keyword = q.toLowerCase().split(/[\s\-]+/).filter(w => w.length > 3).slice(-1)[0] || q.toLowerCase();
    const hits = exs.filter(e => (e.title||'').toLowerCase().includes(keyword));
    console.log(`\n"${q}" (searching "${keyword}") → ${hits.length} lib entries:`);
    hits.slice(0,6).forEach(h => console.log(`  - "${h.title}" ${h.videoLink?'['+h.videoLink.slice(0,60)+']':'[no vid]'}`));
  }
})().catch(e => { console.error(e); process.exit(1); });
