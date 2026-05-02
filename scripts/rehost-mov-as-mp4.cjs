// Walk client_workouts, find every form_videos[].cloudUrl pointing at a .MOV
// in form-videos storage, copy the bytes to a sibling .mp4 path with
// Content-Type: video/mp4, patch the cw row's cloudUrl.
//
// Why: iPhone uploads land as .MOV / video/quicktime. Chrome/Edge on Windows
// refuse to decode that MIME, so the trainer sees a black player. Most
// iPhone web-share .MOV files are H.264 inside, which plays fine when served
// as video/mp4. (HEVC clips will still fail on Chrome — those need a real
// transcode, deferred.)
//
// Idempotent. Old .MOV is left in place, so re-runs do nothing extra.
//
//   node scripts/rehost-mov-as-mp4.cjs              dry-run
//   node scripts/rehost-mov-as-mp4.cjs apply
//   node scripts/rehost-mov-as-mp4.cjs apply tr_amit  (limit to one client)

const { createClient } = require('@supabase/supabase-js');
const SB = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const s = createClient(SB, 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
const APPLY = process.argv[2] === 'apply';
const ONLY_CLIENT = process.argv[3] || null;

const isMov = (u) => typeof u === 'string' && /\.mov(\?|$)/i.test(u);
const movToMp4 = (u) => u.replace(/\.mov(\?|$)/i, '.mp4$1');

// Convert a public form-videos URL to its storage path.
//   https://...supabase.co/storage/v1/object/public/form-videos/<path>
function urlToStoragePath(url) {
  const m = url.match(/\/storage\/v1\/object\/public\/form-videos\/(.+?)(\?|$)/);
  return m ? m[1] : null;
}

async function rehostOne(oldUrl) {
  const oldPath = urlToStoragePath(oldUrl);
  if (!oldPath) return { ok: false, reason: 'unparseable url' };
  const newPath = oldPath.replace(/\.mov$/i, '.mp4');
  if (newPath === oldPath) return { ok: false, reason: 'not a .mov path' };

  // Fast path: if the .mp4 already exists, just return its URL.
  const { data: probe } = await s.storage.from('form-videos').list(
    newPath.split('/').slice(0, -1).join('/'),
    { search: newPath.split('/').pop(), limit: 1 }
  );
  if (probe && probe.length && probe[0].name === newPath.split('/').pop()) {
    const { data } = s.storage.from('form-videos').getPublicUrl(newPath);
    return { ok: true, newUrl: data.publicUrl, alreadyExisted: true };
  }

  // Download .MOV bytes
  const dl = await fetch(oldUrl);
  if (!dl.ok) return { ok: false, reason: 'download ' + dl.status };
  const buf = Buffer.from(await dl.arrayBuffer());

  // Upload as .mp4 with video/mp4 MIME
  const { error: upErr } = await s.storage.from('form-videos').upload(newPath, buf, {
    upsert: true, contentType: 'video/mp4',
  });
  if (upErr) return { ok: false, reason: 'upload: ' + upErr.message };

  const { data } = s.storage.from('form-videos').getPublicUrl(newPath);
  return { ok: true, newUrl: data.publicUrl, alreadyExisted: false, sizeMB: (buf.length / 1e6).toFixed(2) };
}

(async () => {
  console.log(APPLY ? '=== APPLY ===' : '=== DRY RUN ===');
  await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });

  let q = s.from('client_workouts').select('*').order('date', { ascending: false });
  if (ONLY_CLIENT) q = q.eq('client_id', ONLY_CLIENT);
  const { data: rows, error } = await q;
  if (error) throw error;

  let totalRows = 0, totalMov = 0, totalRewritten = 0, totalSkipped = 0;
  const updates = [];

  for (const w of rows) {
    const fvs = w.form_videos || [];
    let dirty = false;
    const nextFvs = [];
    for (const fv of fvs) {
      if (!fv?.cloudUrl || !isMov(fv.cloudUrl)) { nextFvs.push(fv); continue; }
      totalMov++;
      console.log(`\n[${w.client_id}] ${w.date} ${w.day_name} → ${fv.cloudUrl}`);
      if (!APPLY) { nextFvs.push(fv); continue; }
      const out = await rehostOne(fv.cloudUrl);
      if (!out.ok) {
        console.log(`   FAIL: ${out.reason}`);
        nextFvs.push(fv); totalSkipped++;
      } else {
        console.log(`   ${out.alreadyExisted ? 'already mp4' : 'rehosted ' + out.sizeMB + 'MB'} → ${out.newUrl}`);
        nextFvs.push({ ...fv, cloudUrl: out.newUrl });
        dirty = true; totalRewritten++;
      }
    }
    if (dirty) updates.push({ id: w.id, form_videos: nextFvs });
    totalRows++;
  }

  console.log(`\nrows scanned=${totalRows} mov_links=${totalMov} rewritten=${totalRewritten} skipped=${totalSkipped}`);
  if (!APPLY) { console.log('(dry run)'); return; }

  for (const u of updates) {
    const { error: uErr } = await s.from('client_workouts').update({ form_videos: u.form_videos }).eq('id', u.id);
    if (uErr) console.log('   row update fail', u.id, uErr.message);
  }
  console.log(`patched ${updates.length} client_workouts rows.`);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
