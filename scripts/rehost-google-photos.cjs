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
const s = createClient(
  'https://gtcbfglttoiyfsnfbhdy.supabase.co',
  'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv'
);
const APPLY = process.argv[2] === 'apply';
const ONLY_ID = process.argv[3] || null;

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

async function uploadToSupabase(libId, buf, contentType) {
  const path = `_lib/${libId}.mp4`;
  const { error } = await s.storage.from('form-videos').upload(path, buf, {
    upsert: true,
    contentType: 'video/mp4', // force; some lh3 responses come back as octet-stream
  });
  if (error) throw error;
  const { data } = s.storage.from('form-videos').getPublicUrl(path);
  return data.publicUrl;
}

async function rehostOne(libEntry) {
  const oldUrl = libEntry.videoLink;
  console.log(`\n→ ${libEntry.id} "${libEntry.title}"`);
  console.log(`   old: ${oldUrl}`);
  const direct = await scrapeOgVideo(oldUrl);
  console.log(`   og:video: ${direct.slice(0, 110)}...`);
  const { buf, contentType } = await downloadVideo(direct);
  console.log(`   downloaded ${(buf.length / 1e6).toFixed(2)} MB (${contentType})`);
  const newUrl = await uploadToSupabase(libEntry.id, buf, contentType);
  console.log(`   new: ${newUrl}`);
  return newUrl;
}

(async () => {
  console.log(APPLY ? '=== APPLY ===' : '=== DRY RUN ===');
  const { error: aErr } = await s.auth.signInWithPassword({
    email: 'ohadyproductions@gmail.com', password: '1234',
  });
  if (aErr) throw aErr;

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
      const newUrl = await rehostOne(ex);
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
