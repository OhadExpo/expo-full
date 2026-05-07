// Aggressive second pass: fill close-variant URLs for the 5 unmatched
// exercises where a same-base-movement video exists in the מעקב corpus.
// Marks them with a Hebrew note so the trainee knows the video is for the
// base movement and the actual variant has a small adjustment.
const { createClient } = require('@supabase/supabase-js');
const SB = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
const PLAN_ID = 'plan_yuvb_alpha_2605';

// title → {url, note} — explicit close-variant fills, with a note that
// flags the gap. Two exercises (Push-Up POS Hand to Alternate Foot Tap +
// Inverted Row Drop & Catch) have zero candidates across 13 sheets — left blank.
const FILLS = {
  'Bent-Knee SL POGO Jump': {
    url: 'https://www.youtube.com/shorts/8duLF5AnxZQ',  // SL POGO Jump base
    note: 'סרטון של SL POGO רגיל — בגרסה הזו הברך כפופה יותר (Bent-Knee).',
  },
  'Drop & Catch DB SLDL': {
    url: 'https://www.youtube.com/shorts/uA0G20kU_d4',  // SLDL MED-Ball Drop & Catch
    note: 'סרטון עם MED-Ball — בגרסה הזו אנחנו עם DB.',
  },
  'ISO Wide-Grip Pull-Up + Knee Raise': {
    url: 'https://www.youtube.com/watch?v=lTblcfblSlg',  // ISO Wide-Grip Pull-Up base
    note: 'סרטון של ISO Wide-Grip Pull-Up — להוסיף Knee Raise בקצה העליון.',
  },
  'SL Walkout to SL Plank': {
    url: 'https://www.youtube.com/watch?v=2XEIhh2N7qA',  // SL ABs Walkout to Superman Plank
    note: 'סרטון מסתיים ב-Superman Plank — בגרסה הזו לסיים ב-SL Plank.',
  },
  'Side-Plank Crunch': {
    url: 'https://www.youtube.com/shorts/_aG33nGLe9Q',  // ISO Side Plank
    note: 'סרטון של Side Plank בסיסי — להוסיף תנועת Crunch (קירוב מרפק לברך).',
  },
};

(async () => {
  const sb = createClient(SB, KEY, { auth: { persistSession: false } });
  await sb.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });

  const { data: planRow } = await sb.from('plans').select('data').eq('id', PLAN_ID).single();
  const data = planRow.data;
  let filled = 0;
  for (const day of data.days) {
    for (const ex of day.exercises) {
      const f = FILLS[ex.title];
      if (!f) continue;
      if (ex.videoUrl && ex.videoUrl.trim()) continue; // don't overwrite
      ex.videoUrl = f.url;
      ex.notes = f.note;
      filled++;
      console.log(`  ✓ ${ex.title}`);
      console.log(`     ${f.url}`);
      console.log(`     "${f.note}"`);
    }
  }

  await sb.from('plans').update({ data, updated_at: new Date().toISOString() }).eq('id', PLAN_ID);
  console.log(`\nFilled ${filled} close-variant exercises in ${PLAN_ID}`);
  await sb.auth.signOut();
})().catch(e => { console.error(e); process.exit(1); });
