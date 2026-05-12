// Rehost Roei's 2 FFESS POGO Jump videos from Google Photos (which rotates
// share URLs and broke playback) to Supabase Storage (stable, permanent).
//
// 1. Resolve each photos.app.goo.gl URL via /api/resolve-video
// 2. Download the resolved lh3 MP4 stream
// 3. Upload to form-videos/_lib/{plan_id}_{ex_id}.mp4 via TUS chunked upload
// 4. Patch Roei's Block #25 plan: replace videoUrl in those 2 exercises with
//    the new Supabase URL
//
// Usage:
//   node scripts/rehost-ffess-videos.cjs           # dry-run
//   node scripts/rehost-ffess-videos.cjs apply     # do it

const fs = require('fs');
const path = require('path');
const https = require('https');
const { createClient } = require('@supabase/supabase-js');

const SUPA_URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const SUPA_KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
const TRAINER_EMAIL = 'ohadyproductions@gmail.com';
const TRAINER_PASS = '1234';
const APPLY = process.argv.includes('apply');

const PLAN_ID = 'plan_tb6bfw9qmoosndn9';   // Roei Block #25
const BUCKET = 'form-videos';

// Two FFESS POGO Jump rows on this plan, with stable plan-row ids:
const TARGETS = [
  { rowId: 'pe_4be9s7f7moosndn8', exerciseId: 'ex_34r9xg3amnxqyj3e', share: 'https://photos.app.goo.gl/ALQk6mMp6gsZeD9P6', label: 'FFESS Standing→Lunge POGO' },
  { rowId: 'pe_njzfe911moosndn8', exerciseId: 'e37',                  share: 'https://photos.app.goo.gl/N7j4otgviVkiuZGfA', label: 'FFESS→Lunge POGO' },
];

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function downloadToBuffer(url, hops = 0) {
  const opts = {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
      'Accept': 'video/mp4,video/*;q=0.9,*/*;q=0.8',
    },
  };
  return new Promise((resolve, reject) => {
    const chunks = [];
    https.get(url, opts, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        if (hops >= 5) { reject(new Error('too many redirects')); return; }
        const next = new URL(res.headers.location, url).toString();
        res.resume();
        downloadToBuffer(next, hops + 1).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) { reject(new Error(`status ${res.statusCode}`)); return; }
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

(async () => {
  console.log('=== AUTH ===');
  const supa = createClient(SUPA_URL, SUPA_KEY);
  const { error: authErr } = await supa.auth.signInWithPassword({ email: TRAINER_EMAIL, password: TRAINER_PASS });
  if (authErr) { console.error('Auth failed:', authErr.message); process.exit(1); }

  console.log('\n=== RESOLVE + DOWNLOAD ===');
  for (const t of TARGETS) {
    console.log(`\n[${t.label}]`);
    const r = await fetchJson(`https://expo-app.co.il/api/resolve-video?url=${encodeURIComponent(t.share)}`);
    if (!r?.url) { console.error('  ✗ resolver returned no url'); continue; }
    console.log(`  resolved: ${r.url.slice(0, 80)}…`);
    const buf = await downloadToBuffer(r.url);
    console.log(`  downloaded: ${(buf.length / 1024).toFixed(0)} KB`);
    t.buf = buf;
    t.storagePath = `_lib/${PLAN_ID}_${t.rowId}.mp4`;
  }

  if (!APPLY) {
    console.log('\nDry-run only. Pass `apply` to upload + patch.');
    return;
  }

  console.log('\n=== UPLOAD TO SUPABASE STORAGE ===');
  for (const t of TARGETS) {
    if (!t.buf) continue;
    const { error: upErr } = await supa.storage.from(BUCKET).upload(t.storagePath, t.buf, { contentType: 'video/mp4', upsert: true });
    if (upErr) { console.error(`  ✗ ${t.label} upload failed:`, upErr.message); continue; }
    const { data: pub } = supa.storage.from(BUCKET).getPublicUrl(t.storagePath);
    t.publicUrl = pub.publicUrl;
    console.log(`  ✓ ${t.label} → ${t.publicUrl}`);
  }

  console.log('\n=== PATCH PLAN ===');
  const { data: planRow, error: planErr } = await supa.from('plans').select('data').eq('id', PLAN_ID).single();
  if (planErr) { console.error('Plan fetch failed:', planErr.message); process.exit(1); }
  const planData = planRow.data;
  let patched = 0;
  for (const day of (planData.days || [])) {
    const exList = day.exercises || day.ex || [];
    for (const ex of exList) {
      const t = TARGETS.find(tt => tt.publicUrl && (ex.id === tt.rowId));
      if (!t) continue;
      const prev = ex.videoUrl;
      ex.videoUrl = t.publicUrl;
      console.log(`  ${t.label}: ${prev?.slice(0,60) || 'null'} → ${t.publicUrl}`);
      patched++;
    }
  }
  if (patched === 0) { console.error('No rows patched — row IDs may not match'); process.exit(1); }
  const { error: updErr } = await supa.from('plans').update({ data: planData, updated_at: new Date().toISOString() }).eq('id', PLAN_ID);
  if (updErr) { console.error('Plan update failed:', updErr.message); process.exit(1); }
  console.log(`\n✓ Patched ${patched} rows in ${PLAN_ID}`);
})();
