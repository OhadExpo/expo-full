// Verify Nadav Block #2 against the source xlsx — the stricter audit
// flagged this plan with HIGH-NO-LOW (sequence ,B,B,C,C,D,D — uses
// B/C/D without A). Likely the same 1a/1b corruption family.
//
// Reads the local Nadav Blachar - Training Program.xlsx, finds Block #2,
// extracts the # column for each day, computes the correct grouping per
// the documented mod-5 rule, and compares against EXPO data.

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

const SUPA_URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const SUPA_PUBLISHABLE_KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
const sb = createClient(SUPA_URL, SUPA_PUBLISHABLE_KEY);

const XLSX_PATH = path.join(__dirname, '..', 'Nadav Blachar - Training Program.xlsx');
const LETTERS = ['A', 'B', 'C', 'D', 'E'];

// Parse a sheet name + cells, find every "block" section + its days
// + their per-position labels (1, 1a, 1b, 2, 2a, 3a, etc.).
function parseBlockSheet(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const blocks = [];
  let curBlock = null;
  let curDay = null;
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] || [];
    const c0 = String(row[0] || '').trim();
    const c1 = String(row[1] || '').trim();
    // Block header — looks like "Block #N" or "Block \\#N" in col 0 or 1
    const blockMatch = (c0 + ' ' + c1).match(/Block\s*\\?#\s*(\d+)/i);
    if (blockMatch) {
      curBlock = { num: parseInt(blockMatch[1], 10), days: [] };
      blocks.push(curBlock);
      continue;
    }
    // Day header — col 0 == "#" and col 1 is some text like "Day A" or "Game Day -1"
    if (c0 === '#' && c1) {
      curDay = { name: c1, exercises: [] };
      if (curBlock) curBlock.days.push(curDay);
      continue;
    }
    // Exercise row — col 0 is a label like "1", "1a", "1b", "2a"
    if (curDay && /^\d+[a-z]?$/i.test(c0)) {
      const groupNum = parseInt(c0.match(/^(\d+)/)[1], 10);
      const letter = (c0.match(/[a-z]/i) || [''])[0].toLowerCase(); // 'a', 'b', 'c', or ''
      const isPaired = !!letter;
      curDay.exercises.push({
        label: c0,
        groupNum,
        partLetter: letter,
        isPaired,
        name: c1,
        // Correct EXPO superset = letter for the GROUP if paired; '' if standalone
        correctSuperset: isPaired ? LETTERS[(groupNum - 1) % LETTERS.length] : '',
      });
    }
  }
  return blocks;
}

(async () => {
  const wb = XLSX.read(fs.readFileSync(XLSX_PATH));
  console.log(`Sheets: ${wb.SheetNames.join(', ')}\n`);

  // Aggregate every block from every tab.
  const blocksByNum = {};
  for (const sheetName of wb.SheetNames) {
    const blocks = parseBlockSheet(wb.Sheets[sheetName]);
    for (const b of blocks) {
      blocksByNum[b.num] = b;
    }
  }
  console.log(`Parsed blocks: ${Object.keys(blocksByNum).sort((a,b) => Number(a)-Number(b)).join(', ')}\n`);

  // Show Block #2 details
  const b2 = blocksByNum[2];
  if (!b2) { console.log('Block #2 not found in xlsx'); process.exit(1); }
  console.log(`Block #2 — ${b2.days.length} days:\n`);
  for (const d of b2.days) {
    console.log(`  ${d.name}`);
    for (const ex of d.exercises) {
      console.log(`    ${ex.label.padEnd(4)} → ${ex.correctSuperset || '(none)'}  ${ex.name}`);
    }
    console.log('');
  }

  // Cross-check with EXPO
  await sb.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  const { data: plans } = await sb.from('plans').select('id, name, trainee_id, data').like('name', '%Block #2%');
  const nadavPlan = plans.find(p => /נדבר|Nadav/i.test(JSON.stringify(p)));
  // Better: find by trainee_id matching the audit
  const { data: tr } = await sb.from('store').select('value').eq('key', 'expo-trainees').maybeSingle();
  const trainees = tr?.value || [];
  const nadav = trainees.find(t => /Nadav|נדבר/i.test(t.name || ''));
  console.log(`Nadav trainee_id: ${nadav?.id}`);
  const matchingPlans = plans.filter(p => p.trainee_id === nadav?.id);
  console.log(`Nadav plans matching name 'Block #2': ${matchingPlans.length}`);
  for (const plan of matchingPlans) {
    console.log(`\n=== EXPO plan: ${plan.name} (${plan.id}) ===`);
    for (let di = 0; di < (plan.data?.days || []).length; di++) {
      const d = plan.data.days[di];
      const exs = d.exercises || d.ex || [];
      const seq = exs.map(e => e?.superset || e?.ss || '').join(',');
      console.log(`  ${d.name || `Day ${di + 1}`}: current=[${seq}]`);
      const sourceDay = b2.days.find(sd => sd.name === d.name) || b2.days[di];
      if (sourceDay) {
        const target = sourceDay.exercises.map(e => e.correctSuperset).join(',');
        console.log(`  ${' '.repeat((d.name || `Day ${di + 1}`).length)}  target =[${target}]`);
      } else {
        console.log(`  (no matching source day)`);
      }
    }
  }

  await sb.auth.signOut();
})();
