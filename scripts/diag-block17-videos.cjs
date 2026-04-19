// Diagnostic: for each of Amit's 24 exercises in Block #17,
// check whether there's a matching library entry by title, and if so,
// whether that library entry has a videoLink.
const { createClient } = require('@supabase/supabase-js');
const s = createClient(
  'https://gtcbfglttoiyfsnfbhdy.supabase.co',
  'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv'
);

(async () => {
  const { data: pr } = await s.from('store').select('value').eq('key','expo-plans').maybeSingle();
  const plans = pr?.value || [];
  const b17 = plans.find(p => p.traineeId === 'tr_amit' && p.name === 'Block #17');
  if (!b17) { console.log('Block #17 not found'); return; }

  const { data: er } = await s.from('store').select('value').eq('key','expo-exercises').maybeSingle();
  const exs = er?.value || [];
  console.log('Exercise library count:', exs.length);

  // Build a title-index for exact and fuzzy lookups
  const byTitle = {};
  exs.forEach(e => { if (e.title) byTitle[e.title.toLowerCase().trim()] = e; });

  const simplify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '').trim();
  const bySimp = {};
  exs.forEach(e => { if (e.title) (bySimp[simplify(e.title)] ||= []).push(e); });

  console.log('\n=== BLOCK #17 EXERCISE → LIBRARY LINKAGE ===\n');
  let missingTotally = 0, noVideo = 0, noLibMatch = 0, withVideo = 0;
  b17.days.forEach(d => {
    console.log('--- ' + d.name + ' ---');
    d.exercises.forEach((ex, i) => {
      const title = ex.title;
      const linked = ex.exerciseId ? exs.find(e => e.id === ex.exerciseId) : null;
      const exactMatch = byTitle[title.toLowerCase().trim()];
      const fuzzyMatches = bySimp[simplify(title)];
      const libEntry = linked || exactMatch || (fuzzyMatches?.length === 1 ? fuzzyMatches[0] : null);

      let status, note = '';
      if (!libEntry) {
        status = '❌ NO LIB';
        noLibMatch++;
      } else if (!libEntry.videoLink) {
        status = '⚠️  NO VIDEO';
        noVideo++;
        note = ' (lib id=' + libEntry.id + ')';
      } else {
        status = '✓ OK';
        withVideo++;
        note = ' video=' + libEntry.videoLink.substring(0, 60);
      }
      if (ex.exerciseId && !linked) { status = '🔴 BAD LINK'; missingTotally++; }
      if (!ex.exerciseId) note += ' [exerciseId empty]';

      console.log(`  ${i + 1}. [${status}] ${title}${note}`);
    });
    console.log('');
  });

  console.log('SUMMARY:');
  console.log('  ✓ with video:    ', withVideo);
  console.log('  ⚠️ lib but no vid:', noVideo);
  console.log('  ❌ no lib match:  ', noLibMatch);
  console.log('  🔴 broken link:   ', missingTotally);
  console.log('  TOTAL:            ', withVideo + noVideo + noLibMatch + missingTotally);
})().catch(e => console.error(e));
