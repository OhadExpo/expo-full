// Fill Block #9's still-missing videoUrls from OMER'S OWN sheet (blocks 1-6),
// EXACT normalized-title match only — no fuzzy, no cross-athlete. Dry by default.
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
const APPLY = process.argv.includes('--apply');
const B9 = 'pl_t7582oqqmr0cjblm4870';
const norm = (t) => String(t || '').toLowerCase().replace(/\s+/g, ' ').trim().replace(/[.\s]+$/, '');
const omerMap = JSON.parse(fs.readFileSync('scripts/omer-only-video-map.json', 'utf8'));
const allMap = JSON.parse(fs.readFileSync('scripts/omer-video-map.json', 'utf8'));

(async () => {
  await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  const { data: p } = await s.from('plans').select('data').eq('id', B9).single();
  let filled = 0;
  for (const d of p.data.days) {
    for (const ex of d.exercises) {
      const has = ex.videoUrl && ex.videoUrl !== '';
      if (has) continue;
      const k = norm(ex.title);
      // Omer's own sheet wins; else any sheet (exact full-name match = same exercise)
      const src = Object.prototype.hasOwnProperty.call(omerMap, k) ? 'OMER' : (Object.prototype.hasOwnProperty.call(allMap, k) ? 'ALL' : null);
      const v = src === 'OMER' ? omerMap[k] : (src === 'ALL' ? allMap[k] : null);
      if (src) {
        console.log(`FILL [${src}]  "${ex.title}"`);
        console.log(`        ->  ${v}`);
        ex.videoUrl = v; filled++;
      } else {
        console.log(`miss  "${ex.title}"  (in no sheet — left blank)`);
      }
    }
  }
  console.log(`\nExact-match fills from Omer's own sheet: ${filled}`);
  if (APPLY && filled) {
    const { error } = await s.from('plans').update({ data: p.data, updated_at: new Date().toISOString() }).eq('id', B9);
    console.log(error ? `UPDATE FAILED: ${error.message}` : `✅ APPLIED — ${filled} videos added.`);
  } else if (!APPLY) console.log('(dry run — add --apply to save)');
  process.exit(0);
})();
