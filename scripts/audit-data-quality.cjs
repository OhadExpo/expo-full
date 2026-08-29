// Data-quality audit — what clients actually experience.
// Read-only. Reports: exercises clients see with NO video, library gaps,
// duplicate library titles, orphaned plans, broken video URLs.
const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
const blockNum = (n) => { const m = /(?:block|phase)\s*#?\s*(\d+)|#(\d+)/i.exec(n || ''); return m ? parseInt(m[1] || m[2], 10) : -1; };
const norm = (t) => String(t || '').toLowerCase().replace(/\s+/g, ' ').trim();
const isHttp = (u) => typeof u === 'string' && /^https?:\/\//i.test(u);

(async () => {
  await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  const { data: exRow } = await s.from('store').select('value').eq('key', 'expo-exercises').single();
  const lib = exRow?.value || [];
  const libById = new Map(lib.map(e => [e.id, e]));
  const { data: trRow } = await s.from('store').select('value').eq('key', 'expo-trainees').single();
  const trainees = trRow?.value || [];
  const trIds = new Set();
  trainees.forEach(t => { trIds.add(t.id); trIds.add(t.id + '__0'); trIds.add(t.id + '__1'); });
  const nameById = new Map(trainees.map(t => [t.id, t.name]));
  const { data: plans } = await s.from('plans').select('id,name,trainee_id,data');

  console.log('=== SCALE ===');
  console.log(`library exercises: ${lib.length} | plans: ${plans.length} | trainees: ${trainees.length}`);

  // 1. Library gaps
  const libNoVideo = lib.filter(e => !isHttp(e.videoLink || e.videoUrl));
  const libNoCues = lib.filter(e => !(e.cues || e.notes || '').trim());
  const titleMap = new Map();
  lib.forEach(e => { const k = norm(e.title); if (!titleMap.has(k)) titleMap.set(k, []); titleMap.get(k).push(e.id); });
  const dupTitles = [...titleMap.entries()].filter(([, ids]) => ids.length > 1);
  console.log('\n=== LIBRARY QUALITY ===');
  console.log(`no videoLink: ${libNoVideo.length}/${lib.length}`);
  console.log(`no cues: ${libNoCues.length}/${lib.length}`);
  console.log(`duplicate titles: ${dupTitles.length} (${dupTitles.slice(0, 8).map(([t, ids]) => `"${t}"×${ids.length}`).join(', ')})`);

  // 2. Orphaned plans
  const orphans = plans.filter(p => p.trainee_id && !trIds.has(p.trainee_id));
  console.log('\n=== ORPHANED PLANS (trainee_id not in roster) ===');
  console.log(`count: ${orphans.length}`);
  orphans.slice(0, 10).forEach(p => console.log(`   ${p.name} → ${p.trainee_id} [${p.id}]`));

  // 3. Active athletes' LATEST block — exercises a client sees with NO video
  const activeTrainees = trainees.filter(t => t.status === 'Active');
  const byTid = new Map();
  for (const p of plans) { if (!p.trainee_id) continue; (byTid.get(p.trainee_id) || byTid.set(p.trainee_id, []).get(p.trainee_id)).push(p); }
  console.log('\n=== CLIENT-FACING: exercises with NO resolvable video in each active athlete\'s LATEST block ===');
  let totalNoVid = 0, badUrls = 0;
  const badUrlSamples = [];
  for (const t of activeTrainees) {
    const ids = [t.id, t.id + '__0', t.id + '__1'];
    const theirs = plans.filter(p => ids.includes(p.trainee_id));
    if (!theirs.length) continue;
    const latest = theirs.slice().sort((a, b) => blockNum(b.name) - blockNum(a.name))[0];
    const days = latest.data?.days || [];
    let noVid = 0, exCount = 0;
    for (const d of days) {
      const exs = d.exercises || d.ex || [];
      for (const ex of exs) {
        exCount++;
        const eid = ex.exerciseId || ex.eid;
        const override = ('videoUrl' in ex) ? ex.videoUrl : ex.vid;
        const libVid = libById.get(eid)?.videoLink || libById.get(eid)?.videoUrl;
        const resolved = (override && override !== '') ? override : libVid;
        if (!resolved || !isHttp(resolved)) noVid++;
        if (override && override !== '' && !isHttp(override)) { badUrls++; if (badUrlSamples.length < 8) badUrlSamples.push(`${t.name}/${ex.title || eid}: ${String(override).slice(0, 40)}`); }
      }
    }
    if (noVid > 0) { totalNoVid += noVid; console.log(`   ${t.name} · ${latest.name}: ${noVid}/${exCount} exercises with NO video`); }
  }
  console.log(`   >>> total client-facing no-video exercises (latest blocks): ${totalNoVid}`);
  console.log(`\n=== NON-HTTP video overrides on plans (broken): ${badUrls} ===`);
  badUrlSamples.forEach(x => console.log('   ' + x));
  process.exit(0);
})();
