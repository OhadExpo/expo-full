// Fill Block #9's still-missing notes from OMER'S OWN sheet cue-comments,
// EXACT normalized-title match only (his own authored cues). Dry by default.
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
const APPLY = process.argv.includes('--apply');
const B9 = 'pl_t7582oqqmr0cjblm4870';
const norm = (t) => String(t || '').toLowerCase().replace(/\s+/g, ' ').trim().replace(/[.\s]+$/, '');
const cues = JSON.parse(fs.readFileSync('scripts/omer-cue-map.json', 'utf8'));

(async () => {
  await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  const { data: p } = await s.from('plans').select('data').eq('id', B9).single();
  let filled = 0;
  for (const d of p.data.days) {
    for (const ex of d.exercises) {
      if (ex.notes && ex.notes.trim()) continue;
      const k = norm(ex.title);
      if (Object.prototype.hasOwnProperty.call(cues, k)) {
        console.log(`FILL "${ex.title}"\n   => ${cues[k].replace(/\n/g, ' / ').slice(0, 70)}`);
        ex.notes = cues[k]; ex.notesEdited = true; filled++;
      } else {
        console.log(`miss "${ex.title}" (no cue in Omer sheet)`);
      }
    }
  }
  console.log(`\nCue fills from Omer's own sheet: ${filled}`);
  if (APPLY && filled) {
    const { error } = await s.from('plans').update({ data: p.data, updated_at: new Date().toISOString() }).eq('id', B9);
    console.log(error ? `UPDATE FAILED: ${error.message}` : `✅ APPLIED — ${filled} cues added.`);
  } else if (!APPLY) console.log('(dry run — add --apply to save)');
  process.exit(0);
})();
