// Backfill the exercise library's videoLink from Ohad's Drive sheets.
//
// The sheets are the source of truth for what a program actually links to; the
// library drifted from them. A plan row with no per-row override inherits the
// library's videoLink, so filling the library gives every athlete the video —
// no plan rows are touched at all.
//
// EXACT title match only. Blank beats wrong ([[videolink_accuracy]]) — a
// near-miss title can be a different exercise entirely, so those are reported
// for Ohad to rule on, never auto-applied. Fill-empty-only: an entry that
// already has a videoLink is never overwritten.
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co','sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
const norm = (t) => String(t||'').toLowerCase().replace(/\s+/g,' ').trim().replace(/[.\s]+$/,'');
const isHttp = (u) => typeof u === 'string' && /^https?:\/\//i.test(u);
const APPLY = process.argv.includes('--apply');
(async () => {
  await s.auth.signInWithPassword({ email:'ohadyproductions@gmail.com', password:'1234' });
  const map = JSON.parse(fs.readFileSync('scripts/omer-video-map.json','utf8'));
  console.log('sheet map entries:', Object.keys(map).length);
  const { data: row } = await s.from('store').select('value').eq('key','expo-exercises').single();
  const lib = row.value || [];

  const stamp = new Date().toISOString().slice(0,10);
  const backup = `scripts/_backup-expo-exercises-${stamp}.json`;
  if (!fs.existsSync(backup)) { fs.writeFileSync(backup, JSON.stringify(lib, null, 2)); console.log('backup written:', backup); }
  else console.log('backup already exists:', backup);

  let filled = 0, had = 0, noMatch = 0;
  const changes = [];
  const next = lib.map((e) => {
    if (isHttp(e.videoLink)) { had++; return e; }
    const v = map[norm(e.title)];
    if (isHttp(v)) { filled++; changes.push(`${e.id}  ${e.title}`); return { ...e, videoLink: v }; }
    noMatch++; return e;
  });
  console.log(`library=${lib.length} alreadyHadVideo=${had} FILLED=${filled} stillNoVideo=${noMatch}`);
  if (!APPLY) { console.log('\nDRY RUN — pass --apply to write.'); console.log(changes.slice(0,10).map(c=>'  '+c).join('\n')); process.exit(0); }
  const { error } = await s.from('store').update({ value: next }).eq('key','expo-exercises');
  if (error) { console.log('WRITE FAILED:', error.message); process.exit(1); }
  const { data: after } = await s.from('store').select('value').eq('key','expo-exercises').single();
  const nowHas = (after.value||[]).filter(e=>isHttp(e.videoLink)).length;
  console.log(`VERIFIED FROM DB: ${nowHas} of ${(after.value||[]).length} exercises now have a video (was ${had})`);
  process.exit(0);
})();
