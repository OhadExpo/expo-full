// Import Yoav Shamri + Nadav Blachar from their xlsx training programs.
// Adds two trainee rows to expo-trainees (Online Client default), creates
// one plan per sheet (3 blocks each = 6 plans total), preserves video
// hyperlinks and Hebrew tempo strings.
//
// Default trainee shape: Online Client / Active / Custom package / 0 monthly.
// Ohad edits the rest in the EXPO UI post-import (email, phone, billing).
//
// Run:
//   node scripts/import-yoav-nadav.cjs            # dry run, prints summary
//   node scripts/import-yoav-nadav.cjs apply      # actually writes to prod

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const SUPA_URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const SUPA_KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
const TRAINER_EMAIL = 'ohadyproductions@gmail.com';
const TRAINER_PASSWORD = '1234';

const APPLY = process.argv[2] === 'apply';

const uid = (prefix) => prefix + crypto.randomBytes(6).toString('hex') + Date.now().toString(36).slice(-4);

const ATHLETES = [
  { id: 'tr_yoav',  name: 'Yoav Shamri',   file: path.join(__dirname, '..', 'Yoav Shamri - Training Program.xlsx') },
  { id: 'tr_nadav', name: 'Nadav Blachar', file: path.join(__dirname, '..', 'Nadav Blachar - Training Program.xlsx') },
];

// --- Inline copy of src/spreadsheetImport.js (Node-friendly) ---------------
function parseSingleSheet(ws, sheetName) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const getHyperlink = (r, c) => {
    const cellRef = XLSX.utils.encode_cell({ r, c });
    const cell = ws[cellRef];
    return cell?.l?.Target || cell?.l?.target || '';
  };
  let firstDayRow = rows.length;
  for (let r = 0; r < rows.length; r++) {
    if (String(rows[r][0]||'').trim() === '#' && String(rows[r][1]||'').trim()) { firstDayRow = r; break; }
  }
  const WU_HEADER_RE = /^\s*(warm[-\s]?up|morning routine|חימום|instructions?|notes?|neck exc|bb\s*-\s*barbell|everything else|bb exercises|week\s*\d|rest|home routine|date:|day\s+\w)/i;
  const WU_RX_RE = /^(.+?)\s*\(\s*([^()]+?)\s*\)\s*$/;
  const warmup = [];
  const wuSeen = new Set();
  for (let r = 0; r < firstDayRow; r++) {
    const row = rows[r] || [];
    for (let c = 0; c < row.length; c++) {
      const v = String(row[c]||'').trim();
      if (!v || WU_HEADER_RE.test(v)) continue;
      const m = v.match(WU_RX_RE);
      if (!m) continue;
      const t = m[1].trim(); const rx = m[2].trim();
      if (!t || !rx) continue;
      if (!/\d|sec|rep|min/i.test(rx)) continue;
      if (/[:]/.test(t)) continue;
      if (/^(week\s|date\s|new\s+gym)/i.test(t)) continue;
      const key = t.toLowerCase();
      if (wuSeen.has(key)) continue; wuSeen.add(key);
      const vid = getHyperlink(r, c);
      warmup.push(vid ? { t, rx, vid } : { t, rx });
    }
  }
  const days = []; let currentDay = null; let blockName = '';
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]; const a = String(row[0]||'').trim(); const b = String(row[1]||'').trim();
    if (r===0 && a && !blockName) { blockName = a; continue; }
    if (r===0 && !a && b && !blockName) { blockName = b; continue; }
    if (a==='#' && b) { if (currentDay?.exercises.length>0) days.push(currentDay); currentDay={ id: uid(''), name: b, exercises: [] }; continue; }
    if (!a||a==='#'||a.toLowerCase().includes('rest')||a.toLowerCase().includes('off')) continue;
    if (b.toLowerCase()==='exercise'||b.toLowerCase()==='name') continue;
    if (b.toLowerCase().includes('rest')&&b.toLowerCase().includes('off')) continue;
    if (a.toLowerCase()==='instructions'||a.toLowerCase().startsWith('bb -')||a.toLowerCase().startsWith('bb exercises')) continue;
    const tempoRaw = String(row[4]||'').trim();
    const tempo = (tempoRaw.toLowerCase()==='tempo' || tempoRaw.toLowerCase()==='none') ? '' : tempoRaw;
    const setsRaw = String(row[5]||'3').trim();
    const repsRaw = String(row[6]||'').trim();
    const sets = parseInt(setsRaw)||3;
    const wave=[];
    if (repsRaw.includes('>')) { for(let ci=7;ci<=10;ci++){if(row[ci])wave.push(String(row[ci]).trim())} }
    // Source uses "6a"/"6b" pairs; map group number to a single EXPO letter
    // so both rows end up in the same superset block (mod-5 cycle).
    let superset='';
    const ssMatch=a.match(/(\d+)[a-e]/i);
    if (ssMatch) {
      const groupN = parseInt(ssMatch[1], 10);
      if (Number.isFinite(groupN) && groupN >= 1) {
        superset = String.fromCharCode(64 + (((groupN - 1) % 5) + 1));
      }
    }
    // Col B may carry a "SuperSet:" label; col C has the real name.
    // Falling through to col C also salvages rows where col B is empty.
    let exName = b;
    if (!exName || /^superset:?$/i.test(exName)) exName = String(row[2]||'').trim();
    if (!exName) continue;
    const videoLink = getHyperlink(r, 3);
    const ex = {
      id: uid(''),
      exerciseId: '',
      sets, reps: repsRaw || '8-12', load: '', rpe: '', tempo, rest: '120',
      notes: '', order: currentDay?.exercises.length || 0,
      superset, wk: wave.length>0 ? wave : null,
      videoUrl: videoLink || undefined,
      title: exName,
    };
    if (!currentDay) currentDay = { id: uid(''), name: 'Day 1', exercises: [] };
    currentDay.exercises.push(ex);
  }
  if (currentDay?.exercises.length>0) days.push(currentDay);
  return { blockName: blockName || sheetName, days, warmup };
}

function parseFile(file) {
  const wb = XLSX.read(fs.readFileSync(file), { type: 'buffer' });
  const blocks = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const { blockName, days, warmup } = parseSingleSheet(ws, sheetName);
    if (days.length === 0) continue;
    blocks.push({ blockName, days, warmup });
  }
  return blocks;
}

const todayIso = new Date().toISOString().slice(0, 10);

const newTrainee = (id, name) => ({
  id, name,
  email: '',
  phone: '',
  age: '', weight: '', height: '',
  injuries: '', goals: '', notes: '',
  format: 'Online Client',
  status: 'Active',
  package: 'Custom',
  monthly: 0,
  perSession: 0,
  startDate: todayIso,
  monthlyPrice: '0',
  packagePrice: '',
  sessionPrice: '0',
  sessionsRemaining: 8,
});

(async () => {
  const supabase = createClient(SUPA_URL, SUPA_KEY);
  console.log('signing in as trainer…');
  const { data: auth, error: aErr } = await supabase.auth.signInWithPassword({ email: TRAINER_EMAIL, password: TRAINER_PASSWORD });
  if (aErr) { console.error('auth failed:', aErr); process.exit(1); }
  console.log('signed in:', auth.user?.email);

  const { data: storeRow, error: rErr } = await supabase.from('store').select('value').eq('key', 'expo-trainees').maybeSingle();
  if (rErr) { console.error('read trainees failed:', rErr); process.exit(1); }
  const trainees = Array.isArray(storeRow?.value) ? [...storeRow.value] : [];
  console.log(`current trainees: ${trainees.length}`);

  const newPlans = [];
  const newTrainees = [];

  for (const { id, name, file } of ATHLETES) {
    const exists = trainees.find(t => t.id === id || t.name === name);
    if (exists) {
      console.log(`! trainee ${name} already exists (id=${exists.id}); skipping trainee row, will still add plans.`);
    } else {
      newTrainees.push(newTrainee(id, name));
    }

    const blocks = parseFile(file);
    console.log(`\n${name}: ${blocks.length} blocks parsed from ${path.basename(file)}`);
    for (const { blockName, days, warmup } of blocks) {
      const totalEx = days.reduce((a, d) => a + d.exercises.length, 0);
      console.log(`  ${blockName} — ${days.length} days, ${totalEx} exercises, ${warmup.length} warm-up entries`);
      newPlans.push({
        id: uid('pl_'),
        name: blockName,
        trainee_id: id,
        phase: '',
        notes: '',
        active: true,
        data: { days, warmup, weeks: 4 },
      });
    }
  }

  console.log(`\nplan: insert ${newPlans.length} plan rows; append ${newTrainees.length} trainees to expo-trainees.`);

  if (!APPLY) {
    console.log('\n[DRY RUN] re-run with `apply` to write.');
    process.exit(0);
  }

  if (newTrainees.length > 0) {
    const next = [...trainees, ...newTrainees];
    const { error: wErr } = await supabase.from('store').upsert({ key: 'expo-trainees', value: next });
    if (wErr) { console.error('write trainees failed:', wErr); process.exit(1); }
    console.log(`✓ wrote ${next.length} trainees to expo-trainees (added ${newTrainees.length}).`);
  }

  if (newPlans.length > 0) {
    const rows = newPlans.map(p => ({
      id: p.id,
      name: p.name,
      trainee_id: p.trainee_id,
      phase: p.phase,
      notes: p.notes,
      active: p.active,
      data: p.data,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));
    const { error: pErr } = await supabase.from('plans').insert(rows);
    if (pErr) { console.error('insert plans failed:', pErr); process.exit(1); }
    console.log(`✓ inserted ${rows.length} plans.`);
  }

  console.log('\n✓ DONE');
})();
