// Comprehensive verification: parse every available source xlsx, build a
// {trainee → block → day → expected superset sequence} map, then compare
// against every EXPO plan and report deltas. No DB writes — strictly
// diagnostic. Output: scripts/verify-supersets-all.json + console summary.
//
// Source mapping uses the existing audit-all-clients.cjs convention plus
// the two root-level xlsx files (Nadav, Yoav).

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

const SUPA_URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const SUPA_PUBLISHABLE_KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
const sb = createClient(SUPA_URL, SUPA_PUBLISHABLE_KEY);

const LETTERS = ['A', 'B', 'C', 'D', 'E'];
const ROOT = path.join(__dirname, '..');
const SHEETS_DIR = path.join(ROOT, 'sheets');

// trainee_id → list of xlsx filenames (relative to repo root)
const TRAINEE_SHEETS = {
  tr_roei:         ['sheets/roei.xlsx'],
  tr_tal:          ['sheets/tal.xlsx'],
  tr_yuval:        ['sheets/yuval_barko.xlsx'],
  tr_yuval_gotlib: ['sheets/yuval_gotlib.xlsx'],
  tr_neta_tom:     ['sheets/neta.xlsx', 'sheets/tom_ronen.xlsx'],
  tr_nadav:        ['Nadav Blachar - Training Program.xlsx'],
  tr_yoav:         ['Yoav Shamri - Training Program.xlsx'],
};

function parseBlockSheet(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const blocks = [];
  let curBlock = null;
  let curDay = null;
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] || [];
    const c0 = String(row[0] || '').trim();
    const c1 = String(row[1] || '').trim();
    const blockMatch = (c0 + ' ' + c1).match(/Block\s*\\?#\s*(\d+)/i);
    if (blockMatch) {
      curBlock = { num: parseInt(blockMatch[1], 10), days: [] };
      blocks.push(curBlock);
      curDay = null;
      continue;
    }
    if (c0 === '#' && c1) {
      curDay = { name: c1, exercises: [] };
      if (curBlock) curBlock.days.push(curDay);
      else blocks.push({ num: null, days: [curDay] });
      continue;
    }
    if (curDay && /^\d+[a-z]?$/i.test(c0)) {
      const groupNum = parseInt(c0.match(/^(\d+)/)[1], 10);
      const letter = (c0.match(/[a-z]/i) || [''])[0].toLowerCase();
      const isPaired = !!letter;
      curDay.exercises.push({
        label: c0,
        name: c1,
        correctSuperset: isPaired ? LETTERS[(groupNum - 1) % LETTERS.length] : '',
      });
    }
  }
  return blocks;
}

function loadSourceForTrainee(traineeId) {
  const files = TRAINEE_SHEETS[traineeId] || [];
  const blocksByNum = {};
  // Also collect blocks we couldn't number (no "Block #N" header found)
  // keyed by their first-day name as a fallback.
  const orphanBlocks = [];
  for (const f of files) {
    const full = path.join(ROOT, f);
    if (!fs.existsSync(full)) continue;
    const wb = XLSX.read(fs.readFileSync(full));
    for (const sheetName of wb.SheetNames) {
      const blocks = parseBlockSheet(wb.Sheets[sheetName]);
      for (const b of blocks) {
        if (b.num != null) {
          // Merge if multiple files contribute days to the same block
          if (!blocksByNum[b.num]) blocksByNum[b.num] = { num: b.num, days: [] };
          blocksByNum[b.num].days.push(...b.days);
        } else {
          orphanBlocks.push(b);
        }
      }
    }
  }
  return { blocksByNum, orphanBlocks };
}

function blockNumOfPlanName(name) {
  const m = String(name || '').match(/#\s*(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

(async () => {
  await sb.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  const { data: tr } = await sb.from('store').select('value').eq('key', 'expo-trainees').maybeSingle();
  const trainees = tr?.value || [];
  const traineeName = (tid) => {
    if (!tid) return '(unassigned)';
    const t = trainees.find(x => x.id === tid);
    if (t) return t.name;
    const m = tid.match(/^(.+?)__(\d+)$/);
    if (m) {
      const parent = trainees.find(x => x.id === m[1]);
      const i = parseInt(m[2], 10);
      return (parent?.members?.[i]?.name) || (parent?.name) || tid;
    }
    return tid;
  };

  const { data: plans } = await sb.from('plans').select('id, name, trainee_id, data');

  // Group plans by trainee_id (for couples, use parent ID since the source
  // sheet covers both members under one file).
  const baseId = (tid) => tid?.split('__')[0] || tid;
  const plansByTrainee = {};
  for (const p of plans) {
    const k = baseId(p.trainee_id);
    if (!plansByTrainee[k]) plansByTrainee[k] = [];
    plansByTrainee[k].push(p);
  }

  const deltas = [];
  const skipped = [];
  for (const [tid, files] of Object.entries(TRAINEE_SHEETS)) {
    const myPlans = plansByTrainee[tid] || [];
    if (!myPlans.length) continue;
    const { blocksByNum, orphanBlocks } = loadSourceForTrainee(tid);
    if (Object.keys(blocksByNum).length === 0 && !orphanBlocks.length) {
      skipped.push({ tid, name: traineeName(tid), reason: 'no parsed blocks' });
      continue;
    }
    for (const plan of myPlans) {
      const num = blockNumOfPlanName(plan.name);
      const sourceBlock = num != null ? blocksByNum[num] : null;
      if (!sourceBlock) {
        skipped.push({ tid, name: traineeName(tid), plan: plan.name, reason: `no source block matched (num=${num})` });
        continue;
      }
      for (let di = 0; di < (plan.data?.days || []).length; di++) {
        const expoDay = plan.data.days[di];
        const expoExs = expoDay.exercises || expoDay.ex || [];
        const sourceDay = sourceBlock.days.find(sd => sd.name === expoDay.name) || sourceBlock.days[di];
        if (!sourceDay) continue;
        if (sourceDay.exercises.length !== expoExs.length) continue;
        const target = sourceDay.exercises.map(e => e.correctSuperset);
        const current = expoExs.map(e => e?.superset || e?.ss || '');
        const diffPositions = [];
        for (let i = 0; i < target.length; i++) {
          if (target[i] !== current[i]) diffPositions.push(i);
        }
        if (diffPositions.length) {
          deltas.push({
            trainee: traineeName(tid),
            plan: plan.name,
            planId: plan.id,
            dayIdx: di,
            dayName: expoDay.name,
            current: current.join(','),
            target: target.join(','),
            diffPositions,
          });
        }
      }
    }
  }

  console.log(`\n=== VERIFY ALL ===`);
  console.log(`Athletes with local source: ${Object.keys(TRAINEE_SHEETS).length}`);
  console.log(`Total deltas (days where EXPO ≠ source): ${deltas.length}\n`);

  console.log('--- by athlete ---');
  const byAthlete = {};
  deltas.forEach(d => { byAthlete[d.trainee] = (byAthlete[d.trainee] || 0) + 1; });
  Object.entries(byAthlete).sort((a, b) => b[1] - a[1]).forEach(([name, n]) => {
    console.log(`  ${name.padEnd(28)} ${String(n).padStart(3)} days`);
  });

  console.log('\n--- detail (first 80) ---');
  deltas.slice(0, 80).forEach(d => {
    console.log(`  [${d.trainee}] ${d.plan.padEnd(20)} · ${d.dayName.padEnd(28)}`);
    console.log(`     current: ${d.current}`);
    console.log(`     target:  ${d.target}`);
  });

  console.log(`\n--- skipped ${skipped.length} (no match) ---`);
  skipped.slice(0, 20).forEach(s => {
    console.log(`  [${s.name}] ${s.plan || ''} — ${s.reason}`);
  });

  fs.writeFileSync('scripts/verify-supersets-all.json',
    JSON.stringify({ generatedAt: new Date().toISOString(), deltas, skipped }, null, 2));
  console.log('\nwrote scripts/verify-supersets-all.json');
  await sb.auth.signOut();
})();
