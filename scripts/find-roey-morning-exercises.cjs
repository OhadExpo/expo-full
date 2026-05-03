// Search the exercise library for the 8 morning-routine exercises listed in
// "תכנון בלוק #25 - רועי הצבי.pdf" (page 2). For each candidate, dump every
// matching library row + its cues + videoLink so Ohad can confirm picks.
const { createClient } = require('@supabase/supabase-js');
const SB = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';

const TARGETS = [
  { idx: '1',  pdf: 'RDL to Baby Squat Stretch',                              tokens: ['rdl', 'baby squat'] },
  { idx: '2',  pdf: 'Squat-POS Alternating Knee to floor',                    tokens: ['squat-pos', 'alternating knee', 'knee to floor'] },
  { idx: '3',  pdf: 'SA Crab-POS Raise',                                      tokens: ['crab-pos', 'crab pos'] },
  { idx: '4',  pdf: 'Prone-Laying Deficit SA Y-Raise',                        tokens: ['prone-laying', 'deficit', 'y-raise'] },
  { idx: '5',  pdf: 'ISO Prone-Laying T-Raise',                               tokens: ['iso prone', 't-raise'] },
  { idx: '6a', pdf: 'Supine-Laying Deficit External Rotation',                tokens: ['supine', 'external rotation'] },
  { idx: '6b', pdf: 'SA Bear-POS SCAP Protraction/Retraction',                tokens: ['bear-pos', 'bear pos', 'scap'] },
  { idx: '7a', pdf: 'Wall-Supported Forhead (Occipital) Ball Slide',          tokens: ['ball slide', 'occipital', 'forehead'] },
];

const norm = (s) => (s || '').toLowerCase().replace(/[\s\-_/\\.()]+/g, ' ').trim();

(async () => {
  const s = createClient(SB, KEY);
  const { error: aerr } = await s.auth.signInWithPassword({
    email: 'ohadyproductions@gmail.com',
    password: '1234',
  });
  if (aerr) throw new Error('auth: ' + aerr.message);

  const { data: row, error } = await s
    .from('store')
    .select('value')
    .eq('key', 'expo-exercises')
    .maybeSingle();
  if (error) throw error;
  const lib = Array.isArray(row?.value) ? row.value : [];
  console.log('LIBRARY SIZE:', lib.length, '\n');

  for (const t of TARGETS) {
    console.log(`══════════════════════════════════════════════`);
    console.log(`#${t.idx}  PDF: "${t.pdf}"`);
    console.log(`──────────────────────────────────────────────`);

    // Score each library row by how many of the target tokens appear in title/cues
    const scored = lib.map(e => {
      const hay = norm(`${e.title || ''} ${e.cues || ''}`);
      const hits = t.tokens.filter(tok => hay.includes(norm(tok))).length;
      return { e, hits };
    }).filter(x => x.hits > 0)
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 6);

    if (!scored.length) {
      console.log('  (no library match)\n');
      continue;
    }
    for (const { e, hits } of scored) {
      console.log(`  · ${e.title}`);
      console.log(`      id:    ${e.id}    matchHits: ${hits}`);
      if (e.cues)        console.log(`      cues:  ${e.cues}`);
      if (e.videoLink)   console.log(`      video: ${e.videoLink}`);
      else if (e.videoUrl) console.log(`      video: ${e.videoUrl}`);
      const tags = [e.category, e.movementPattern, e.bodyPosition, e.resistanceType, e.movementType].filter(Boolean).join(' · ');
      if (tags) console.log(`      tags:  ${tags}`);
      console.log('');
    }
  }
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
