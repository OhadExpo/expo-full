// Rehost Google Photos shared-video links to Supabase storage so they play
// embedded on the trainer review screen (Google Photos refuses iframe + the
// og:video direct URL is signed-and-expiring, so it has to be downloaded).
//
// Idempotent. Run with no args to scan and report; pass `apply` to write.
//
//   node scripts/rehost-google-photos.cjs            (dry-run: list candidates)
//   node scripts/rehost-google-photos.cjs apply      (download, upload, patch)
//   node scripts/rehost-google-photos.cjs apply <ex_id>   (rehost one entry)

const { createClient } = require('@supabase/supabase-js');
const SB = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const ANON = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
const BUCKET = 'form-videos';
const CHUNK = 256 * 1024;        // TUS chunk size — direct PUTs of >1MB
const PATCH_RETRIES = 3;          // ECONNRESET on this box; see
const PATCH_BACKOFF_MS = 1500;    // reference_storage_upload_tus memory.

const s = createClient(SB, ANON);
const APPLY = process.argv[2] === 'apply';
const ONLY_ID = process.argv[3] || null;

const b64 = (str) => Buffer.from(String(str), 'utf8').toString('base64');

// TUS resumable upload — chunked PUT under the failing 1MB direct-PUT
// threshold. Mirrors the working uploader from rehost-mov-as-mp4.cjs.
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
  }
}

const GPHOTOS_RE = /(?:photos\.app\.goo\.gl|photos\.google\.com\/share)/i;

// Browser-y UA — Google's share page hides og:video for some bot UAs.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function scrapeOgVideo(shareUrl) {
  const r = await fetch(shareUrl, {
    redirect: 'follow',
    headers: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9' },
  });
  if (!r.ok) throw new Error('share fetch ' + r.status);
  const html = await r.text();
  const m = html.match(/<meta[^>]+property="og:video"[^>]+content="([^"]+)"/i);
  if (!m) throw new Error('no og:video meta tag in share page (private link or video removed?)');
  return m[1];
}

async function downloadVideo(directUrl) {
  // The lh3 URL 302s to a signed googlevideo.com playback URL. fetch follows.
  const r = await fetch(directUrl, { redirect: 'follow', headers: { 'user-agent': UA } });
  if (!r.ok) throw new Error('media fetch ' + r.status);
  const ct = r.headers.get('content-type') || 'video/mp4';
  const buf = Buffer.from(await r.arrayBuffer());
  return { buf, contentType: ct };
}

async function uploadToSupabase(libId, buf, _contentType, token) {
  const storagePath = `_lib/${libId}.mp4`;
  // TUS doesn't honor x-upsert — delete first so a re-run doesn't 409.
  // DELETE is a small-body request and works fine on this box.
  await s.storage.from(BUCKET).remove([storagePath]).catch(() => {});
  await tusUpload({ token, body: buf, storagePath, contentType: 'video/mp4' });
  const { data } = s.storage.from(BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}

async function rehostOne(libEntry, token) {
  const oldUrl = libEntry.videoLink;
  console.log(`\n→ ${libEntry.id} "${libEntry.title}"`);
  console.log(`   old: ${oldUrl}`);
  const direct = await scrapeOgVideo(oldUrl);
  console.log(`   og:video: ${direct.slice(0, 110)}...`);
  const { buf, contentType } = await downloadVideo(direct);
  console.log(`   downloaded ${(buf.length / 1e6).toFixed(2)} MB (${contentType})`);
  const newUrl = await uploadToSupabase(libEntry.id, buf, contentType, token);
  console.log(`   new: ${newUrl}`);
  return newUrl;
}

(async () => {
  console.log(APPLY ? '=== APPLY ===' : '=== DRY RUN ===');
  const { data: auth, error: aErr } = await s.auth.signInWithPassword({
    email: 'ohadyproductions@gmail.com', password: '1234',
  });
  if (aErr) throw aErr;
  const token = auth.session.access_token;

  const { data: er } = await s.from('store').select('value').eq('key', 'expo-exercises').maybeSingle();
  const exs = er?.value || [];
  const candidates = exs.filter(e =>
    e.videoLink && GPHOTOS_RE.test(e.videoLink) && (!ONLY_ID || e.id === ONLY_ID)
  );
  console.log(`Candidates: ${candidates.length}${ONLY_ID ? ` (filtered to ${ONLY_ID})` : ''}`);
  candidates.forEach(e => console.log(`  ${e.id}  "${e.title}"  ${e.videoLink}`));

  if (!APPLY) { console.log('\n(dry run; rerun with `apply` to rehost)'); return; }

  const updates = [];
  for (const ex of candidates) {
    try {
      const newUrl = await rehostOne(ex, token);
      updates.push({ id: ex.id, newUrl });
    } catch (e) {
      console.error(`   FAIL: ${e.message}`);
    }
  }
  if (!updates.length) { console.log('\nNothing to write.'); return; }

  // Patch the library blob.
  const next = exs.map(e => {
    const u = updates.find(x => x.id === e.id);
    return u ? { ...e, videoLink: u.newUrl } : e;
  });
  const { error: wErr } = await s.from('store').update({ value: next }).eq('key', 'expo-exercises');
  if (wErr) throw wErr;
  console.log(`\n✓ patched ${updates.length} library entries`);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
