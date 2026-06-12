// Verify the audit's load-bearing claims:
// 1. total form-videos storage usage (is the 1GB free-tier cap imminent?)
// 2. count + size distribution per trainee folder
// 3. orphan check: objects whose folder isn't a known trainee id
const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co','sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
(async () => {
  const { error: aerr } = await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  if (aerr) { console.error('AUTH FAIL', aerr.message); process.exit(1); }

  const { data: tr } = await s.from('store').select('value').eq('key','expo-trainees').maybeSingle();
  const traineeIds = new Set();
  (tr?.value || []).forEach(t => { traineeIds.add(t.id); traineeIds.add(t.id+'__0'); traineeIds.add(t.id+'__1'); });

  // list top-level folders
  const { data: folders, error } = await s.storage.from('form-videos').list('', { limit: 1000 });
  if (error) { console.error('LIST FAIL', error.message); process.exit(1); }
  let grand = 0, grandCount = 0;
  const orphans = [];
  const perFolder = [];
  for (const f of folders || []) {
    if (f.id) { // a file at root, not a folder
      if (f.metadata?.size) { grand += f.metadata.size; grandCount++; }
      continue;
    }
    let folderBytes = 0, folderCount = 0, biggest = 0;
    let offset = 0;
    while (true) {
      const { data: files } = await s.storage.from('form-videos').list(f.name, { limit: 100, offset });
      if (!files || !files.length) break;
      for (const file of files) {
        const sz = file.metadata?.size || 0;
        folderBytes += sz; folderCount++; grand += sz; grandCount++;
        if (sz > biggest) biggest = sz;
      }
      if (files.length < 100) break;
      offset += 100;
    }
    perFolder.push({ folder: f.name, mb: (folderBytes/1e6).toFixed(1), count: folderCount, biggestMB: (biggest/1e6).toFixed(1), known: traineeIds.has(f.name) });
    if (!traineeIds.has(f.name)) orphans.push(f.name);
  }
  perFolder.sort((a,b) => b.mb - a.mb);
  console.log('=== form-videos storage ===');
  console.log('TOTAL:', (grand/1e6).toFixed(1), 'MB across', grandCount, 'objects  (free-tier cap = 1024 MB)');
  console.log('pct of cap:', ((grand/1e9)*100).toFixed(1) + '%');
  console.log('\nper folder (top 25):');
  perFolder.slice(0,25).forEach(p => console.log(`  ${p.folder.padEnd(24)} ${String(p.mb).padStart(7)}MB  ${String(p.count).padStart(3)} files  max ${p.biggestMB}MB  ${p.known?'':'<<ORPHAN/unknown id>>'}`));
  if (orphans.length) console.log('\nORPHAN folders (not a known trainee id):', orphans.join(', '));
  console.log('\noversized (>=50MB) objects would now be rejected; largest single file above is the ceiling.');
})().catch(e => { console.error(e); process.exit(1); });
