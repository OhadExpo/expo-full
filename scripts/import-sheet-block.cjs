// Import a block that exists in a Drive sheet but not in the app.
//
// Reuses the reconciler's parser so the block is read exactly the way the audit
// reads it — one parser, no second opinion to drift.
//
// Every row is written SELF-CONTAINED: title, sets, reps, tempo, notes, the
// superset letter derived from the 3a/3b numbering, and the video URL from the
// cell hyperlink. exerciseId is filled when the title matches the library so
// the app can still resolve cues, but nothing depends on that match.
//
// Usage: node scripts/import-sheet-block.cjs <sheet.xlsx> <trainee_id> "<tab>" [--apply] [--inactive]
const { createClient } = require('@supabase/supabase-js');
const { parseWorkbook } = require('./reconcile-sheet-vs-app.cjs');
const fs = require('fs');

const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
const [, , XLSX_PATH, TRAINEE, TAB] = process.argv;
const APPLY = process.argv.includes('--apply');
const INACTIVE = process.argv.includes('--inactive');

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const clean = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
const norm = (t) => clean(t).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const canonKey = (t) => norm(t).split(' ').filter(Boolean).map((w) => w.slice(0, 5)).sort().join('|');
const baseTitle = (t) => clean(t).split(/\s+[-–—]\s+/)[0];
const DITTO = /^(>|»|"|''|”|same|idem|-{1,2})$/;
const isDateSerial = (v) => /^\d{5}(\.\d+)?$/.test(clean(v)) && Number(clean(v)) > 30000 && Number(clean(v)) < 60000;
const val = (v) => { const c = clean(v); return (!c || DITTO.test(c) || isDateSerial(c)) ? '' : c; };

(async () => {
  await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  const { data: libRow } = await s.from('store').select('value').eq('key', 'expo-exercises').single();
  const lib = libRow.value || [];
  const byTitle = new Map(), byCanon = new Map();
  for (const e of lib) { byTitle.set(norm(e.title), e); if (!byCanon.has(canonKey(e.title))) byCanon.set(canonKey(e.title), e); }
  const findLib = (t) => byTitle.get(norm(t)) || byCanon.get(canonKey(t)) || byTitle.get(norm(baseTitle(t))) || byCanon.get(canonKey(baseTitle(t))) || null;

  const blocks = parseWorkbook(XLSX_PATH);
  const sb = blocks.find((b) => b.tab === TAB) || blocks.find((b) => norm(b.tab) === norm(TAB));
  if (!sb) { console.log('tab not found. tabs:', blocks.map((b) => b.tab).join(' | ')); process.exit(1); }

  // Refuse to create a duplicate.
  const ids = [TRAINEE, TRAINEE + '__0', TRAINEE + '__1'];
  const { data: existing } = await s.from('plans').select('id,name').in('trainee_id', ids);
  if ((existing || []).some((p) => norm(p.name) === norm(sb.tab))) {
    console.log(`REFUSING: "${sb.tab}" already exists for ${TRAINEE}`); process.exit(1);
  }

  let matched = 0, unmatched = 0, withVideo = 0, withSS = 0;
  const days = sb.days.map((sd) => {
    const groupOf = (n) => { const m = String(n).match(/^(\d+)[a-z]$/i); return m ? m[1] : null; };
    const seq = []; for (const r of sd.rows) { const g = groupOf(r.n); if (g && !seq.includes(g)) seq.push(g); }
    const real = seq.filter((g) => sd.rows.filter((r) => groupOf(r.n) === g).length > 1);
    const letter = (g) => { const i = real.indexOf(g); return i < 0 ? '' : 'ABCDE'[i % 5]; };
    return {
      id: uid(),
      name: clean(sd.name),
      exercises: sd.rows.map((r, i) => {
        const L = findLib(r.title);
        if (L) matched++; else unmatched++;
        const url = clean(r.url).replace(/&amp;/g, '&');
        if (url) withVideo++;
        const ss = letter(groupOf(r.n));
        if (ss) withSS++;
        const row = {
          id: uid(),
          exerciseId: L ? L.id : '',
          title: clean(r.title),
          sets: val(r.sets) || '3',
          reps: val(r.reps) || '',
          load: '', rpe: '', tempo: val(r.tempo), rest: '90',
          notes: val(r.notes) || (L && L.cues) || '',
          order: i,
          superset: ss,
          wk: null, wkS: null,
        };
        // Self-contained: the athlete must not depend on the library.
        if (url) row.videoUrl = url;
        else if (L && L.videoLink) row.videoUrl = L.videoLink;
        return row;
      }),
    };
  });

  const rows = days.reduce((a, d) => a + d.exercises.length, 0);
  console.log(`"${sb.tab}" -> ${TRAINEE}: ${days.length} days, ${rows} exercises`);
  console.log(`  library matched ${matched}, unmatched ${unmatched} | videos ${withVideo} | superset rows ${withSS}`);
  days.forEach((d) => console.log(`   ${d.name}: ${d.exercises.length} ex`));
  if (!APPLY) { console.log('DRY RUN — pass --apply to create.'); process.exit(0); }

  const plan = {
    id: 'pl_' + uid(),
    name: clean(sb.tab),
    trainee_id: TRAINEE,
    phase: '',
    notes: '',
    active: !INACTIVE,
    data: { days, warmup: [], weeks: 4 },
  };
  const { error } = await s.from('plans').insert(plan);
  if (error) { console.log('INSERT FAILED:', error.message); process.exit(1); }

  const { data: back } = await s.from('plans').select('id,name,data').eq('id', plan.id).single();
  const gotRows = (back.data.days || []).reduce((a, d) => a + (d.exercises || []).length, 0);
  const gotVid = (back.data.days || []).reduce((a, d) => a + (d.exercises || []).filter((e) => e.videoUrl).length, 0);
  console.log(`VERIFIED FROM DB: "${back.name}" ${back.data.days.length} days, ${gotRows} exercises, ${gotVid} with a video  (${plan.id})`);
  fs.appendFileSync('scripts/_imported-blocks.log', `${new Date().toISOString()} ${plan.id} ${TRAINEE} ${plan.name} ${gotRows}ex\n`);
  process.exit(gotRows === rows ? 0 : 1);
})();
