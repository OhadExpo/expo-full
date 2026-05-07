// Apply confident library matches to Yuval's "בלוק אלפא" plan.
// For each matched exercise: set exerciseId AND delete the explicit
// videoUrl/notes "" keys so library videoLink + cues auto-inherit
// (per reference_plan_ex_videoUrl.md 3-state override).
// Unmatched exercises stay as-is (eid blank, video blank, ohad fills later).
const { createClient } = require('@supabase/supabase-js');
const SB = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
const PLAN_ID = 'plan_yuvb_alpha_2605';

// Keyed by the title we wrote in the plan. eid = library entry to inherit from.
const MATCHES = {
  // Day A
  'Drop & Catch DB SLDL':                      'ex_fxnxx24x8vomobz1x89',
  'BB Back Squat':                             'ex_nsbfggpdmnxqyj3e',
  'BB Larsen Press':                           'ex_gmn4zkn0acmo7afevm',
  'Hand-Supported BW Shrimp Squat':            'ex_5o17lczbmo2his7p',
  // Day B
  'Box Jump to SL Landing':                    'ex_upgzd5b721omo7aflod',
  'Deficit BB RDL':                            'e216',
  'Standing SA MID-POS OHP':                   'ex_y4okjkabmnxqyj3e',
  'Forward+Reverse DB Lunge':                  'ex_9f3errabdv8mo7afloc',
  'Tall-Kneeling Cable Facepull':              'ex_iikbgkmutq8mo7afevn',
  'Wall-Supported Supinated DB Front-Raise':   'ex_4a2o5d8z6cvmo7afd6v',
  'SL Hip Thrust March':                       'ex_fcyafpl2k3mo7afd6v',
  // Day C
  'Wall-Assisted 90/90 POS Rear Leg Heel Clicks': 'e227',
  '90/90 POS Thoracic Rotation + Rear Foot Raise': 'ex_3kr9sokznavmo7afm16',
  'Squatting Alternating Knee to Floor':       'ex_oxp5e58csgqmo7afloe',
  'Push-Up Drop & Catch':                      'ex_gc4b4dyomnxusfgq',
  'Laying Elbow-Supported Knee Extension':     'ex_g59rwh64bamo7afd6u',
};

(async () => {
  const sb = createClient(SB, KEY, { auth: { persistSession: false } });
  const { error: authErr } = await sb.auth.signInWithPassword({
    email: 'ohadyproductions@gmail.com', password: '1234',
  });
  if (authErr) { console.error('AUTH FAIL', authErr.message); process.exit(1); }

  const { data: planRow, error: pErr } = await sb
    .from('plans').select('data').eq('id', PLAN_ID).single();
  if (pErr) { console.error('PLAN FAIL', pErr.message); process.exit(1); }

  const data = planRow.data;
  let matched = 0, unmatched = 0;
  for (const day of data.days) {
    for (const ex of day.exercises) {
      const eid = MATCHES[ex.title];
      if (eid) {
        ex.exerciseId = eid;
        // Remove explicit-empty overrides so library inherits.
        delete ex.videoUrl;
        delete ex.notes;
        matched++;
      } else {
        unmatched++;
      }
    }
  }

  const { error: upErr } = await sb
    .from('plans').update({ data, updated_at: new Date().toISOString() }).eq('id', PLAN_ID);
  if (upErr) { console.error('UPDATE FAIL', upErr.message); process.exit(1); }

  console.log(`updated ${PLAN_ID}: matched=${matched}, unmatched=${unmatched}`);
  await sb.auth.signOut();
})().catch(e => { console.error(e); process.exit(1); });
