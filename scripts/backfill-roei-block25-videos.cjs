// Backfill videoLink + cues on the 7 new library entries created for Roei Block #25.
// Confident generic-tutorial YouTube clips where the public-internet match is good;
// leaves the 3 Ohad-system-specific titles with empty videoLink (no equivalent public clip).
const { createClient } = require('@supabase/supabase-js');
const SB = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const s = createClient(SB, 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
const COMMIT = process.argv.includes('--commit');

// title -> { videoLink, cues } — only fill what is confidently a close match.
const updates = {
  'Standing Rotational OHP MED-Ball Slam': {
    videoLink: 'https://www.youtube.com/watch?v=W_4eq6r00zw',
    cues: 'Feet wider than hips. Scoop ball overhead, rotate the trail hip, slam down 1–2 ft outside the lead foot. Alternate sides.',
  },
  'Tall-Kneeling (Bench) Hand-Supported SA DB Row': {
    videoLink: 'https://www.youtube.com/watch?v=BvpdSJeX6dk',
    cues: 'Tall kneel facing the bench, opposite hand braced flat on the bench. Long spine, retract & drive elbow back to the hip.',
  },
  'Declined-Laying Leg-Raise': {
    videoLink: 'https://www.youtube.com/watch?v=I2r_m_85Qys',
    cues: 'Lay on a declined bench, head high. Hold pads above head. Press low back into the bench, raise legs to vertical, control down.',
  },
  'Contralateral Walking OH DB Lunge': {
    videoLink: 'https://www.youtube.com/watch?v=qhlGekPq-8s',
    cues: 'One DB locked overhead, opposite leg leads each step. Stack ribs over hips, elbow locked, alternate sides as you walk.',
  },
  // Ohad-system-specific titles — no clean public match; leave videoLink empty for him to swap in his own clip.
  'Hand-Assisted Unilateral DB Shrimp Squat': {
    videoLink: '',
    cues: 'Hold one DB; opposite hand on a rail/wall for assist. Free leg tucked behind, knee tracks toe, sit back-trailing knee to brush floor.',
  },
  'Prone-Laying Supinated to Pronated DB Y-Raise': {
    videoLink: '',
    cues: 'Face-down on bench, arms in Y. Start supinated (palms up), rotate to pronated (palms down) at the top, reverse on the way down.',
  },
  'Hollow-POS Clams': {
    videoLink: '',
    cues: 'Hold hollow body (low back glued, shoulders + heels off floor). Knees bent, soles together. Open and close knees like a clamshell while holding hollow.',
  },
};

(async () => {
  await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  const { data: row } = await s.from('store').select('value').eq('key', 'expo-exercises').maybeSingle();
  const lib = row.value;
  let touched = 0, skipped = 0;
  for (const e of lib) {
    const u = updates[e.title];
    if (!u) continue;
    e.videoLink = u.videoLink;
    e.cues = u.cues;
    console.log(`${u.videoLink ? '[VID]' : '[---]'} ${e.id}  ${e.title}`);
    touched++;
  }
  for (const t of Object.keys(updates)) {
    if (!lib.find(e => e.title === t)) { console.log('  *missing in lib:', t); skipped++; }
  }
  console.log(`\ntouched ${touched}, missing ${skipped}`);
  if (!COMMIT) { console.log('DRY RUN — re-run with --commit'); return; }
  const { error } = await s.from('store').upsert({ key: 'expo-exercises', value: lib, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  console.log('library updated.');
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
