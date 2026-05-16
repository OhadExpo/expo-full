// One-off: rehost the broken "Prone-Laying Supinated to Pronated DB Y-Raise"
// video on Roei Block #25 Day A. Google Photos' transcoder is choking on
// this upload (404/500 on every MP4 stream variant), but the source file is
// downloadable via the lh3 `=dv` suffix. Pull it, push to form-videos via
// TUS, swap the plan-row videoUrl.

const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const SB = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const ANON = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
const BUCKET = 'form-videos';
const CHUNK = 256 * 1024;
const PATCH_RETRIES = 3;
const PATCH_BACKOFF_MS = 1500;

const PLAN_ID = 'plan_tb6bfw9qmoosndn9';
const DAY_ID = 'pd_w6937ctvmoosndn8';
const ROW_ID = 'pe_wua1sfkrmoosndn8';
const STORAGE_PATH = `_lib/${PLAN_ID}_${ROW_ID}.mp4`;
const path = require('path');
const SOURCE_FILE = path.join(process.env.TEMP || process.env.TMP || '/tmp', 'roe25_prone_y.mp4');

const s = createClient(SB, ANON);
const APPLY = process.argv[2] === 'apply';

const b64 = (str) => Buffer.from(String(str), 'utf8').toString('base64');

async function tusUpload({ token, body, storagePath, contentType }) {
  const meta = [
    `bucketName ${b64(BUCKET)}`,
    `objectName ${b64(storagePath)}`,
    `contentType ${b64(contentType)}`,
    `cacheControl ${b64('3600')}`,
  ].join(',');
  const create = await fetch(`${SB}/storage/v1/upload/resumable`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: ANON,
      'Tus-Resumable': '1.0.0',
      'Upload-Length': String(body.length),
      'Upload-Metadata': meta,
      'x-upsert': 'true',
    },
  });
  if (!create.ok) throw new Error(`tus create HTTP ${create.status} ${await create.text().catch(() => '')}`);
  const location = create.headers.get('location') || create.headers.get('Location');
  if (!location) throw new Error('tus create: no Location header');
  let offset = 0;
  while (offset < body.length) {
    const end = Math.min(offset + CHUNK, body.length);
    const slice = body.subarray(offset, end);
    let landed = false;
    let lastErr;
    for (let attempt = 0; attempt < PATCH_RETRIES; attempt++) {
      try {
        const r = await fetch(location, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: ANON,
            'Tus-Resumable': '1.0.0',
            'Upload-Offset': String(offset),
            'Content-Type': 'application/offset+octet-stream',
          },
          body: slice,
        });
        if (!r.ok) throw new Error(`tus patch HTTP ${r.status} ${await r.text().catch(() => '')}`);
        const newOff = parseInt(r.headers.get('upload-offset') || '0', 10);
        if (newOff !== end) throw new Error(`tus offset mismatch server=${newOff} expected=${end}`);
        offset = newOff;
        landed = true;
        break;
      } catch (e) {
        lastErr = e;
        if (attempt < PATCH_RETRIES - 1) await new Promise(r => setTimeout(r, PATCH_BACKOFF_MS * (attempt + 1)));
      }
    }
    if (!landed) throw lastErr;
    process.stdout.write(`\r  uploaded ${(offset / 1e6).toFixed(1)}/${(body.length / 1e6).toFixed(1)} MB`);
  }
  console.log('');
}

(async () => {
  console.log(APPLY ? '=== APPLY ===' : '=== DRY RUN ===');

  if (!fs.existsSync(SOURCE_FILE)) {
    console.error(`Source file missing: ${SOURCE_FILE}`);
    process.exit(1);
  }
  const buf = fs.readFileSync(SOURCE_FILE);
  console.log(`Source: ${SOURCE_FILE} (${(buf.length / 1e6).toFixed(2)} MB)`);

  const { data: auth, error: aErr } = await s.auth.signInWithPassword({
    email: 'ohadyproductions@gmail.com',
    password: '1234',
  });
  if (aErr) throw aErr;
  const token = auth.session.access_token;
  console.log('Authed as trainer.');

  if (!APPLY) {
    console.log(`\nWould upload to: ${SB}/storage/v1/object/public/${BUCKET}/${STORAGE_PATH}`);
    console.log(`Would patch plan ${PLAN_ID} day ${DAY_ID} row ${ROW_ID}`);
    console.log('\n(dry run; rerun with `apply` to upload + patch)');
    return;
  }

  // Wipe any previous attempt at this path so .upload() doesn't 409 without upsert.
  await s.storage.from(BUCKET).remove([STORAGE_PATH]).catch(() => {});

  console.log('\nUploading via supabase-js .upload()...');
  const { error: upErr } = await s.storage.from(BUCKET).upload(STORAGE_PATH, buf, {
    contentType: 'video/mp4',
    upsert: true,
  });
  if (upErr) {
    console.error('Direct .upload() failed:', upErr.message, '— falling back to TUS');
    await tusUpload({ token, body: buf, storagePath: STORAGE_PATH, contentType: 'video/mp4' });
  }
  const { data: pub } = s.storage.from(BUCKET).getPublicUrl(STORAGE_PATH);
  const newUrl = pub.publicUrl;
  console.log(`✓ Uploaded: ${newUrl}`);

  console.log('\nPatching plan...');
  const { data: planRow, error: pErr } = await s.from('plans').select('data').eq('id', PLAN_ID).single();
  if (pErr) throw pErr;
  const planData = planRow.data;
  let touched = 0;
  for (const day of (planData.days || [])) {
    if (day.id !== DAY_ID) continue;
    for (const ex of (day.exercises || [])) {
      if (ex.id !== ROW_ID) continue;
      console.log(`  ${ROW_ID}: ${(ex.videoUrl || '').slice(0, 60)} → ${newUrl}`);
      ex.videoUrl = newUrl;
      touched++;
    }
  }
  if (!touched) { console.error('No row patched — IDs mismatch.'); process.exit(1); }
  const { error: uErr } = await s.from('plans')
    .update({ data: planData, updated_at: new Date().toISOString() })
    .eq('id', PLAN_ID);
  if (uErr) throw uErr;
  console.log(`\n✓ Patched ${touched} row(s) in ${PLAN_ID}`);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
