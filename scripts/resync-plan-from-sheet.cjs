// Rebuild an existing plan's CONTENT from its Drive sheet block.
//
// For when the app holds an older generation of a program than the sheet does.
// Keeps the plan's id, name and active flag — only days + warm-up are replaced —
// so nothing referencing the plan breaks.
//
// REFUSES if the athlete has logged workouts against that plan name, because
// replacing the days would orphan real history. Backs every plan up first and
// verifies the result from the database.
//
// Usage:
//   node scripts/resync-plan-from-sheet.cjs <sheet.xlsx> <trainee_id> [--apply] [--only "Block #19"]
const { createClient } = require('@supabase/supabase-js');
const { parseWorkbook } = require('./reconcile-sheet-vs-app.cjs');
const fs = require('fs');
const path = require('path');

const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
const [, , XLSX_PATH, TRAINEE] = process.argv;
const APPLY = process.argv.includes('--apply');
const onlyIdx = process.argv.indexOf('--only');
const ONLY = onlyIdx > -1 ? process.argv[onlyIdx + 1] : null;

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const clean = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
const norm = (t) => clean(t).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const canon = (t) => norm(t).split(' ').filter(Boolean).map((w) => w.slice(0, 5)).sort().join('|');
const base = (t) => clean(t).split(/\s+[-–—]\s+/)[0];
const DITTO = /^(>|»|"|''|”|same|idem|-{1,2})$/;
const isSerial = (v) => /^\d{5}(\.\d+)?$/.test(clean(v)) && +clean(v) > 30000 && +clean(v) < 60000;
const val = (v) => { const c = clean(v); return (!c || DITTO.test(c) || isSerial(c)) ? '' : c; };
const blockNum = (n) => { const m = String(n).match(/#\s*(\d+)/); return m ? +m[1] : null; };

(async () => {
  await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  const { data: libRow } = await s.from('store').select('value').eq('key', 'expo-exercises').single();
  const lib = libRow.value || [];
  const byTitle = new Map(), byCanon = new Map();
  for (const e of lib) { byTitle.set(norm(e.title), e); if (!byCanon.has(canon(e.title))) byCanon.set(canon(e.title), e); }
  const findLib = (t) => byTitle.get(norm(t)) || byCanon.get(canon(t)) || byTitle.get(norm(base(t))) || byCanon.get(canon(base(t))) || null;

  const ids = [TRAINEE, TRAINEE + '__0', TRAINEE + '__1'];
  const { data: plans } = await s.from('plans').select('*').in('trainee_id', ids);
  const { data: logs } = await s.from('client_workouts').select('plan_name').in('client_id', ids);
  const logged = new Set((logs || []).map((w) => norm(w.plan_name)));

  const blocks = parseWorkbook(XLSX_PATH).filter((b) => b.days.length && (!ONLY || b.tab === ONLY));
  const stamp = new Date().toISOString().slice(0, 10);
  const dir = `scripts/_resync-backups-${stamp}`;
  const planned = [];

  for (const sb of blocks) {
    const n = blockNum(sb.tab);
    const plan = (plans || []).find((p) => (n != null && blockNum(p.name) === n) || norm(p.name) === norm(sb.tab));
    if (!plan) { console.log(`  SKIP  ${sb.tab} — no app plan`); continue; }
    if (logged.has(norm(plan.name))) { console.log(`  REFUSE ${plan.name} — athlete has logged workouts against it`); continue; }

    let matched = 0, vids = 0;
    const days = sb.days.map((sd) => {
      const groupOf = (x) => { const m = String(x).match(/^(\d+)[a-z]$/i); return m ? m[1] : null; };
      const seq = []; for (const r of sd.rows) { const g = groupOf(r.n); if (g && !seq.includes(g)) seq.push(g); }
      const real = seq.filter((g) => sd.rows.filter((r) => groupOf(r.n) === g).length > 1);
      const letter = (g) => { const i = real.indexOf(g); return i < 0 ? '' : 'ABCDE'[i % 5]; };
      return {
        id: uid(), name: clean(sd.name),
        exercises: sd.rows.map((r, i) => {
          const L = findLib(r.title); if (L) matched++;
          const url = clean(r.url).replace(/&amp;/g, '&');
          const row = {
            id: uid(), exerciseId: L ? L.id : '', title: clean(r.title),
            sets: val(r.sets) || '3', reps: val(r.reps) || '', load: '', rpe: '',
            tempo: val(r.tempo), rest: '90',
            notes: val(r.notes) || (L && L.cues) || '',
            order: i, superset: letter(groupOf(r.n)), wk: null, wkS: null,
          };
          if (url) { row.videoUrl = url; vids++; }
          else if (L && L.videoLink) { row.videoUrl = L.videoLink; vids++; }
          return row;
        }),
      };
    });
    const warmup = (sb.warmup || []).filter((w) => w.title).map((w) => ({ t: w.title, rx: w.rx || '', vid: clean(w.url).replace(/&amp;/g, '&') }));
    const rows = days.reduce((a, d) => a + d.exercises.length, 0);
    const wasRows = (plan.data?.days || []).reduce((a, d) => a + (d.exercises || d.ex || []).length, 0);
    console.log(`  ${plan.name.slice(0, 32).padEnd(33)} app ${wasRows}ex -> sheet ${rows}ex (${days.length} days, ${vids} videos, ${matched}/${rows} library-matched)`);
    planned.push({ plan, data: { ...(plan.data || {}), days, warmup: warmup.length ? warmup : (plan.data?.warmup || []) }, rows });
  }

  console.log(`\nplans to resync: ${planned.length}`);
  if (!APPLY) { console.log('DRY RUN — pass --apply'); process.exit(0); }
  if (!planned.length) process.exit(0);
  fs.mkdirSync(dir, { recursive: true });
  let done = 0;
  for (const p of planned) {
    fs.writeFileSync(path.join(dir, p.plan.id + '.json'), JSON.stringify(p.plan, null, 2));
    const { error } = await s.from('plans').update({ data: p.data }).eq('id', p.plan.id);
    if (error) { console.log('  FAIL', p.plan.id, error.message); continue; }
    done++;
  }
  // verify
  let okCount = 0;
  for (const p of planned) {
    const { data: back } = await s.from('plans').select('data').eq('id', p.plan.id).single();
    const got = (back?.data?.days || []).reduce((a, d) => a + (d.exercises || []).length, 0);
    if (got === p.rows) okCount++;
  }
  console.log(`VERIFIED FROM DB: ${okCount}/${planned.length} plans now match the sheet row count | backups: ${dir}`);
  process.exit(okCount === planned.length ? 0 : 1);
})();
