// Full re-verification of the Yuval "בלוק אלפא" enrichment.
// Logs every plan exercise's current state + every plausible library hit
// (loose token search, scored) + every מעקב hit from the 5 cached sheets.
// Read-only.
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const SB = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
const PLAN_ID = 'plan_yuvb_alpha_2605';

const STOP = new Set(['the','a','an','to','and','of','for','with','on','in','&','+','db','bb','iso','sl','sa','pos']);
const norm = (s) => (s || '').toLowerCase().replace(/[+&/().,:;'"-]/g, ' ').replace(/\s+/g, ' ').trim();
const toks = (s, dropStop = true) => norm(s).split(' ').filter(t => t && (!dropStop || !STOP.has(t)));
const score = (a, b) => {
  const A = new Set(toks(a)), B = new Set(toks(b));
  if (!A.size || !B.size) return 0;
  let inter = 0; for (const t of A) if (B.has(t)) inter++;
  return (inter / new Set([...A, ...B]).size) * 0.4 + (inter / A.size) * 0.6;
};

(async () => {
  const sb = createClient(SB, KEY, { auth: { persistSession: false } });
  await sb.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });

  const [{ data: libRow }, { data: planRow }] = await Promise.all([
    sb.from('store').select('value').eq('key', 'expo-exercises').single(),
    sb.from('plans').select('data').eq('id', PLAN_ID).single(),
  ]);
  const library = (libRow.value || []).filter(e => e && e.title);
  const byId = new Map(library.map(e => [e.id, e]));

  // Load מעקב maps
  const sources = [];
  const dir = path.join(__dirname, 'meakav-out');
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
    const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    sources.push({ source: j.source, map: j.map });
  }

  // Pre-tokenize library
  const indexed = library.map(e => ({
    id: e.id, title: e.title,
    cues: e.cues || '', vid: e.videoLink || '',
    tk: toks(e.title),
  }));

  for (const day of planRow.data.days) {
    console.log(`\n=== ${day.name} ===`);
    for (const ex of day.exercises) {
      console.log(`\n• ${ex.title}`);
      console.log(`  state: eid=${ex.exerciseId || '-'.padEnd(28)}  vid=${ex.videoUrl ? 'Y' : '-'}  notes=${ex.notes ? 'Y' : '-'}`);

      // If linked, show what the eid'd library entry has
      if (ex.exerciseId && byId.has(ex.exerciseId)) {
        const le = byId.get(ex.exerciseId);
        console.log(`  linked-lib: title="${le.title}"  cues=${le.cues ? `"${le.cues.slice(0, 60)}..."` : '-'}  videoLink=${le.videoLink || '-'}`);
      }

      // Top-5 fresh library candidates
      const ranked = indexed
        .map(c => ({ ...c, s: score(ex.title, c.title) }))
        .filter(c => c.s > 0.35)
        .sort((a, b) => b.s - a.s)
        .slice(0, 5);
      console.log(`  library top-5:`);
      for (const c of ranked) {
        const tags = `${c.vid ? '🎥' : '  '}${c.cues ? '📝' : '  '}`;
        console.log(`    ${c.s.toFixed(2)} ${tags} ${c.id.padEnd(28)} ${c.title}`);
      }

      // מעקב candidates (≥0.5)
      const meak = [];
      for (const s of sources) {
        for (const [t, url] of Object.entries(s.map)) {
          const sc = score(ex.title, t);
          if (sc >= 0.5) meak.push({ s: sc, t, url, source: s.source });
        }
      }
      meak.sort((a, b) => b.s - a.s);
      const top3 = meak.slice(0, 3);
      if (top3.length) {
        console.log(`  מעקב top-3:`);
        for (const m of top3) console.log(`    ${m.s.toFixed(2)}  "${m.t}" ← ${m.source}`);
      }
    }
  }

  await sb.auth.signOut();
})().catch(e => { console.error(e); process.exit(1); });
