// Audit the three plans imported in the last 48h:
//   - Omer Block #8     pl_3a55ef962099rwed
//   - Nadav Block #4    pl_9fec230d9951te9m
//   - Yoav Block #4     pl_fd1f29e1... (look up by trainee_id+name)
//
// For each exercise, report whether it has:
//   - a video URL (per-plan ex.videoUrl OR library videoLink)
//   - cue notes (per-plan ex.notes OR library cues)
// Surface every gap.
const { createClient } = require('@supabase/supabase-js');
const sb = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');

const TARGETS = [
  { trainee: 'tr_omer',  name: 'Block #8', label: 'Omer Sadeh' },
  { trainee: 'tr_nadav', name: 'Block #4', label: 'Nadav Blachar' },
  { trainee: 'tr_yoav',  name: 'Block #4', label: 'Yoav Shamri' },
];

(async () => {
  await sb.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  const { data: libRow } = await sb.from('store').select('value').eq('key', 'expo-exercises').maybeSingle();
  const lib = libRow?.value || [];
  const libById = new Map(lib.map(L => [L.id, L]));

  for (const t of TARGETS) {
    const { data: plan } = await sb.from('plans').select('id,name,trainee_id,data,updated_at').eq('trainee_id', t.trainee).eq('name', t.name).maybeSingle();
    if (!plan) {
      console.log(`\n══════ ${t.label} / ${t.name}: PLAN NOT FOUND ══════`);
      continue;
    }
    console.log(`\n══════ ${t.label} / ${t.name} (${plan.id}) — updated ${plan.updated_at} ══════`);

    let total = 0, missingUrl = 0, missingCue = 0;
    const gaps = [];
    for (const d of plan.data?.days || []) {
      for (const ex of d.exercises || []) {
        total++;
        const linked = ex.exerciseId ? libById.get(ex.exerciseId) : null;
        const libUrl = linked?.videoLink || '';
        const libCues = linked?.cues || '';
        const planUrl = (typeof ex.videoUrl === 'string' && ex.videoUrl) || '';
        const planNote = (typeof ex.notes === 'string' && ex.notes.trim()) || '';
        const haveUrl = !!(libUrl || planUrl);
        const haveCue = !!(libCues || planNote);
        if (!haveUrl) missingUrl++;
        if (!haveCue) missingCue++;
        if (!haveUrl || !haveCue) {
          gaps.push({ day: d.name, title: ex.title, missing: [!haveUrl && 'URL', !haveCue && 'CUES'].filter(Boolean).join('+') });
        }
      }
    }
    console.log(`  total: ${total}  missing URL: ${missingUrl}  missing cues: ${missingCue}`);
    if (gaps.length) {
      console.log(`  gaps:`);
      for (const g of gaps) console.log(`    [${g.missing}] ${g.day} — ${g.title}`);
    } else {
      console.log(`  ✓ every exercise has both a URL and cues`);
    }
  }
})();
