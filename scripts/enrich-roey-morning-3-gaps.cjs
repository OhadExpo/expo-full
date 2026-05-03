// Patch the 3 morning-routine library entries that we created with no video.
// Sources: web search for the exercise names — best public reference videos +
// short cues. Ohad can replace with his own demos later.
const { createClient } = require('@supabase/supabase-js');
const SB = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';

const PATCHES = {
  ex_roeb25m_rdl_baby_sq: {
    cues: 'Hip-hinge to RDL bottom (hams loaded, neutral spine), then drop into a deep "baby squat" hold (heels down, knees out, chest tall). Owns the hinge → squat transition with control.',
    videoLink: 'https://b-reddy.org/my-favorite-mobility-corrective-exercise-the-toddler-squat/',
  },
  ex_roeb25m_iso_prone_t: {
    cues: 'Lay prone, arms straight out to the sides in a T. Thumbs up. Squeeze mid/lower traps to lift arms ~1-2" off the floor and HOLD. Static — no reps.',
    videoLink: 'https://www.acefitness.org/resources/everyone/exercise-library/249/prone-scapular-shoulder-stabilization-series-i-y-t-w-o-formation/',
  },
  ex_roeb25m_wall_ball_slide: {
    cues: 'Stand ~10cm from wall, soft knees. Place a small ball on the wall at forehead/occipital height. Press ~50% pressure with the head, slight chin tuck, then slowly slide chin toward chest and back without losing the dent in the ball.',
    videoLink: 'https://www.youtube.com/watch?v=pds731yXRnY',
  },
};

(async () => {
  const s = createClient(SB, KEY);
  await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });

  const { data: row, error } = await s.from('store').select('value').eq('key', 'expo-exercises').maybeSingle();
  if (error) throw error;
  const lib = Array.isArray(row?.value) ? row.value : [];

  let patched = 0;
  const updated = lib.map(e => {
    const p = PATCHES[e.id];
    if (!p) return e;
    patched++;
    return { ...e, cues: p.cues, videoLink: p.videoLink };
  });
  console.log('Patched library entries:', patched);

  const { error: uerr } = await s.from('store').upsert({ key: 'expo-exercises', value: updated });
  if (uerr) throw uerr;
  console.log('✓ library updated');
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
