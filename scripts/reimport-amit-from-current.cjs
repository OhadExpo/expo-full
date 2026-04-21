// Re-import Amit's plans from the CURRENT Google Sheet export ("מעקב - עמית יהודאי").
// Deletes all existing tr_amit plans, parses the downloaded xlsx, inserts fresh.
// Preserves visibility preferences: after import, re-picks the latest block
// (highest #N or Comeback) as visible, hides the rest.
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const XLSX = require('xlsx');
const { parseSpreadsheet, xlsxBytesFromDriveDownload, uid } = require('./drive-import-core.cjs');

const SUPA_URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const SUPA_KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
const DL_PATH = 'C:/Users/Administrator/.claude/projects/C--Users-Administrator-Desktop-expo-full/a0f0d386-669e-42c3-8161-49f6fd76d278/tool-results/mcp-claude_ai_Google_Drive-download_file_content-1776778887508.txt';
const TRAINEE_ID = 'tr_amit';
const TRAINEE_NAME = 'עמית יהודאי';

const s = createClient(SUPA_URL, SUPA_KEY);

const blockNum = n => { const m = /#(\d+)/.exec(n || ''); return m ? parseInt(m[1], 10) : -Infinity; };
const isComeback = n => /comeback/i.test(n || '');

(async () => {
  console.log(`Loading ${DL_PATH}...`);
  const bytes = xlsxBytesFromDriveDownload(DL_PATH);
  const { plans, exercises } = parseSpreadsheet(new Uint8Array(bytes));
  console.log(`Parsed ${plans.length} blocks, ${exercises.length} exercise entries.`);

  // Build library remap: dedup by title against the existing library
  const { data: libStore } = await s.from('store').select('value').eq('key','expo-exercises').maybeSingle();
  const lib = [...(libStore?.value || [])];
  const titleToId = {};
  lib.forEach(e => { if (e.title) titleToId[e.title.toLowerCase()] = e.id; });

  const remap = {};
  let appended = 0;
  for (const ex of exercises) {
    const key = ex.title.toLowerCase();
    if (titleToId[key]) { remap[ex.id] = titleToId[key]; }
    else { const newId = 'ex_' + uid(); titleToId[key] = newId; remap[ex.id] = newId; lib.push({ ...ex, id: newId }); appended++; }
  }
  console.log(`Library: +${appended} new exercises (was ${(libStore?.value || []).length}, now ${lib.length}).`);

  // Remap plan eids
  const planData = plans.map(p => ({
    ...p,
    days: p.days.map(d => ({ ...d, ex: d.ex.map(e => ({ ...e, eid: remap[e.eid] || e.eid })) })),
  }));

  // Dedup by block name (keep rightmost tab per name)
  const nameSeen = new Map();
  planData.forEach((p, i) => nameSeen.set(p.name, i));
  const uniquePlans = planData.filter((p, i) => nameSeen.get(p.name) === i);
  if (uniquePlans.length !== planData.length) {
    console.log(`Deduped ${planData.length - uniquePlans.length} same-named blocks.`);
  }

  console.log('\nFresh plan list from current sheet:');
  uniquePlans.forEach(p => console.log(`  "${p.name}" — ${p.days.length} days, ${p.days.reduce((a,d)=>a+d.ex.length,0)} exercises`));

  if (process.argv[2] !== '--apply') {
    console.log('\nDry run. Re-run with --apply to delete-and-replace tr_amit plans.');
    return;
  }

  // 1) Save library (only if anything appended)
  if (appended > 0) {
    const { error: lErr } = await s.from('store').upsert({ key: 'expo-exercises', value: lib });
    if (lErr) { console.error('lib write error:', lErr); process.exit(1); }
  }

  // 2) Delete existing Amit plans
  const { data: deleted, error: dErr } = await s.from('plans')
    .delete({ returning: 'representation' })
    .eq('trainee_id', TRAINEE_ID)
    .select('id,name');
  if (dErr) { console.error('delete error:', dErr); process.exit(1); }
  console.log(`\nDeleted ${deleted.length} existing plans.`);

  // 3) Insert fresh plans
  const payload = uniquePlans.map(p => ({
    id: 'plan_' + uid(),
    name: p.name,
    trainee_id: TRAINEE_ID,
    phase: p.phase || '',
    notes: p.notes || '',
    active: true,
    data: { days: p.days, warmup: p.warmup || [] },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));
  const { data: inserted, error: iErr } = await s.from('plans').insert(payload).select('id,name');
  if (iErr) { console.error('insert error:', iErr); process.exit(1); }
  console.log(`Inserted ${inserted.length} fresh plans.`);

  // 4) Remediate portalVis: latest block visible, rest hidden
  const { data: visStore } = await s.from('store').select('value').eq('key','expo-portal-vis').maybeSingle();
  const vis = { ...(visStore?.value || {}) };

  // Strip any stale Amit keys (names that no longer exist)
  const liveNames = new Set(uniquePlans.map(p => p.name));
  Object.keys(vis).forEach(k => {
    if (k.startsWith(`${TRAINEE_NAME}:`)) {
      const planName = k.slice(TRAINEE_NAME.length + 1).replace(/:m\d+$/,'');
      if (!liveNames.has(planName)) delete vis[k];
    }
  });

  // Pick latest
  const sorted = uniquePlans.slice().sort((a, b) => {
    const cb = (isComeback(b.name) ? 1 : 0) - (isComeback(a.name) ? 1 : 0);
    if (cb !== 0) return cb;
    return blockNum(b.name) - blockNum(a.name);
  });
  const latest = sorted[0];
  for (const p of uniquePlans) {
    vis[`${TRAINEE_NAME}:${p.name}`] = p.name === latest.name;
  }
  const { error: vErr } = await s.from('store').upsert({ key: 'expo-portal-vis', value: vis });
  if (vErr) { console.error('vis write error:', vErr); process.exit(1); }
  console.log(`Portal visibility set: "${latest.name}" visible, ${uniquePlans.length - 1} hidden.`);

  console.log('\nDone.');
})();
