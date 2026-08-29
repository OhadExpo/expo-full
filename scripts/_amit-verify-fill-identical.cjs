// Did the fill change what Amit SEES, or only make the rows self-contained?
// The portal resolves a blank row by eid against the library. If the URL I
// wrote equals that, nothing he sees changed. If it differs, I changed his
// programme and that needs review.
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
(async () => {
  await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  const { data: lib } = await s.from('store').select('value').eq('key', 'expo-exercises').single();
  const byId = new Map((lib.value || []).map((e) => [e.id, e]));
  const before = JSON.parse(fs.readFileSync('scripts/_backup-amit-pl_czpgs9z9mt8kh0cw-2026-08-26.json', 'utf8'));
  const { data: plans } = await s.from('plans').select('id,data').eq('id', before.id);
  const after = plans[0];
  let same = 0, changed = 0, noLibVideo = 0;
  const diffs = [];
  (before.data.days || []).forEach((d, di) => {
    const bl = (d.exercises && d.exercises.length) ? d.exercises : (d.ex || []);
    const ad = after.data.days[di];
    const al = (ad.exercises && ad.exercises.length) ? ad.exercises : (ad.ex || []);
    bl.forEach((bex, xi) => {
      const bv = bex.videoUrl !== undefined ? bex.videoUrl : bex.video;
      if (bv != null && String(bv).trim() !== '') return;      // was not blank
      const eid = bex.exerciseId || bex.eid;
      const libEntry = eid ? byId.get(eid) : null;
      const libUrl = libEntry && (libEntry.videoLink || libEntry.video);
      const aex = al[xi];
      const av = aex.videoUrl !== undefined ? aex.videoUrl : aex.video;
      if (!libUrl) { noLibVideo++; return; }
      if (av === libUrl) same++;
      else { changed++; diffs.push(`day${di+1}#${xi+1} "${bex.title||bex.name}"\n      library: ${libUrl}\n      written: ${av}`); }
    });
  });
  console.log(`identical to what the library would have shown: ${same}`);
  console.log(`DIFFERENT (his programme changed):              ${changed}`);
  console.log(`library had no video for that eid:              ${noLibVideo}`);
  diffs.forEach((d) => console.log('   ' + d));
})();
