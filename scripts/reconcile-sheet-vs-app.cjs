// Sheet → App reconciliation, FIELD level. AUDIT ONLY — writes nothing.
//
// Ohad's Drive sheet is the source of truth for a program. This walks every
// block tab, every day, every exercise row, and reports what the app is missing
// or disagrees about across: exercise title, sets, reps, tempo, notes and the
// VIDEO URL (which lives in the sheet as a cell hyperlink, not as text).
//
// Layout is detected per day rather than hard-coded, because the column order
// moves between blocks (Block #7 puts Vid at column D, Block #3 at column H).
//
// Usage: node scripts/reconcile-sheet-vs-app.cjs <sheet.xlsx> <trainee_id> [--json out.json]
const XLSX = require('xlsx');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
const [, , XLSX_PATH, TRAINEE] = process.argv;
const jsonIdx = process.argv.indexOf('--json');
const JSON_OUT = jsonIdx > -1 ? process.argv[jsonIdx + 1] : null;

const clean = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
const norm = (t) => clean(t).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
// Two URLs can point at the SAME video and look nothing alike: a shorts URL vs
// a watch?v= URL, a trailing '?', an &ab_channel= suffix. Compare YouTube by
// its 11-char video ID and everything else by a cleaned string, or the report
// drowns in false positives — on the first run 29 of 31 "gaps" were exactly
// that.
const ytId = (u) => {
  const m = String(u).match(/(?:youtu\.be\/|\/shorts\/|[?&]v=|\/embed\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
};
// The app sometimes serves its own re-hosted copy of a clip. That is deliberate
// and BETTER than the sheet's link, so it is reported separately, not as a gap.
const isRehosted = (u) => /supabase\.co\/storage|googleusercontent\.com|photos\.app\.goo\.gl/i.test(String(u));
const normUrl = (u) => {
  const raw = clean(u).replace(/&amp;/g, '&').replace(/^http:/, 'https:');
  const id = ytId(raw);
  if (id) return 'yt:' + id;
  return raw.replace(/[?&](ab_channel|feature|t|si)=[^&]*/g, '').replace(/[?&]+$/, '').replace(/\/$/, '');
};
// Sets/reps/tempo compare loosely: the sheet writes " 3 " and "10 E", the app "3"/"10 E".
// A sheet cell holding '>' (or a ditto mark) means "same as the row above" —
// it is a formatting device, not a value. Reading it as one produced 334 false
// "sets" gaps on the first full run.
const DITTO = /^(>|»|"|''|”|same|idem|-{1,2})$/;
const hasVal = (v) => { const c = clean(v); return !!c && !DITTO.test(c); };
const normVal = (v) => clean(v).toLowerCase().replace(/\s+/g, '');

// ---------- parse the workbook ----------
function parseWorkbook(path) {
  const wb = XLSX.readFile(path);
  const blocks = [];
  for (const tab of wb.SheetNames) {
    const ws = wb.Sheets[tab];
    const range = XLSX.utils.decode_range(ws['!ref']);
    const at = (r, c) => ws[XLSX.utils.encode_cell({ r, c })];
    const val = (r, c) => clean((at(r, c) || {}).v);
    const link = (r, c) => { const cell = at(r, c); return cell && cell.l && cell.l.Target ? cell.l.Target : ''; };

    const days = [];
    let cur = null, cols = null;
    for (let r = range.s.r; r <= range.e.r; r++) {
      const rowVals = [];
      for (let c = range.s.c; c <= range.e.c; c++) rowVals.push(val(r, c));

      // A day header: a '#' cell followed by a 'Day X' cell on the same row.
      const hashCol = rowVals.findIndex((v) => v === '#');
      const dayCol = rowVals.findIndex((v) => /^day\s+\S/i.test(v));
      if (hashCol > -1 && dayCol > -1) {
        cols = { num: hashCol, title: dayCol };
        for (let c = 0; c < rowVals.length; c++) {
          const h = rowVals[c].toLowerCase().replace(/\s+/g, '');
          if (h === 'vid') cols.vid = c;
          else if (h === 'tempo') cols.tempo = c;
          else if (h === 'sets') cols.sets = c;
          else if (h === 'reps') cols.reps = c;
          else if (h.startsWith('note')) cols.notes = c;
        }
        cur = { name: rowVals[dayCol], rows: [] };
        days.push(cur);
        continue;
      }
      if (!cur || !cols) continue;

      // An exercise row: a numeric '#' and a non-empty title.
      const num = rowVals[cols.num];
      const title = rowVals[cols.title];
      // 'SuperSet:' is a LABEL the sheet puts above a grouped pair — the real
      // exercise sits elsewhere on the row. Treating it as a title produced 172
      // bogus "title" gaps for one athlete alone.
      const isLabel = /^(superset|super set|circuit|giant set|complex)\s*:?\s*$/i.test(title);
      if (isLabel) { cur.sawSupersetLabel = true; continue; }
      if (!/^\d+[a-z]?$/i.test(num) || !title) {
        // A blank/rest line ends the day section.
        if (!title && !num) cur = null;
        continue;
      }
      cur.rows.push({
        n: num,
        title,
        // The URL can hang off the title cell or the Vid cell.
        url: link(r, cols.title) || (cols.vid != null ? link(r, cols.vid) : ''),
        tempo: cols.tempo != null ? rowVals[cols.tempo] : '',
        sets: cols.sets != null ? rowVals[cols.sets] : '',
        reps: cols.reps != null ? rowVals[cols.reps] : '',
        notes: cols.notes != null ? rowVals[cols.notes] : '',
      });
    }
    blocks.push({ tab, days: days.filter((d) => d.rows.length) });
  }
  return blocks;
}

// ---------- compare ----------
const blockNum = (name) => { const m = String(name).match(/#\s*(\d+)/); return m ? Number(m[1]) : null; };

(async () => {
  await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  const { data: libRow } = await s.from('store').select('value').eq('key', 'expo-exercises').single();
  const lib = libRow.value || [];
  const libById = new Map(lib.map((e) => [e.id, e]));

  const ids = [TRAINEE, TRAINEE + '__0', TRAINEE + '__1'];
  const { data: plans } = await s.from('plans').select('id,name,data').in('trainee_id', ids);
  const byBlock = new Map();
  for (const p of plans || []) { const n = blockNum(p.name); if (n != null) byBlock.set(n, p); }

  const sheetBlocks = parseWorkbook(XLSX_PATH);
  const gaps = { missingBlock: [], missingDay: [], missingRow: [], extraRow: [], title: [], sets: [], reps: [], tempo: [], notes: [], url: [], superset: [], rehosted: [] };
  let compared = 0;
  // Machine-applicable fixes: exact plan id + day + row index, so the
  // applier never has to re-match anything by string.
  const fixes = [];

  for (const sb of sheetBlocks) {
    const n = blockNum(sb.tab);
    const plan = n != null ? byBlock.get(n) : null;
    if (!plan) { gaps.missingBlock.push(`${sb.tab} (${sb.days.reduce((a, d) => a + d.rows.length, 0)} rows) — no app plan`); continue; }
    const appDays = plan.data?.days || [];
    // One app day may be claimed by only ONE sheet day. Without this, two sheet
    // days both matched the same app day and wrote fixes to the same row index —
    // 41 duplicate targets on the first real run, so the later write silently
    // overwrote the earlier one and 31 "applied" fixes were wrong.
    const claimed = new Set();
    for (const sd of sb.days) {
      // Match the day by NAME, else by best exercise-title overlap. The old
      // positional fallback aligned sheet "Day A" against a different app day
      // and then reported every single row as a title mismatch.
      const sheetTitles = new Set(sd.rows.map((r) => norm(r.title)));
      const overlap = (d) => {
        const rows = d.exercises || d.ex || [];
        let hit = 0;
        for (const e of rows) {
          const t = norm(clean(e.title || (libById.get(e.exerciseId || e.eid || '') || {}).title));
          if (t && sheetTitles.has(t)) hit++;
        }
        return rows.length ? hit / Math.max(rows.length, sheetTitles.size) : 0;
      };
      let ad = appDays.find((d) => !claimed.has(d) && norm(d.name || d.n) === norm(sd.name));
      if (!ad) {
        let best = null, bestScore = 0;
        for (const d of appDays) {
          if (claimed.has(d)) continue;
          const sc = overlap(d);
          if (sc > bestScore) { bestScore = sc; best = d; }
        }
        // Below half-overlap it is not the same day; say so instead of guessing.
        ad = bestScore >= 0.5 ? best : null;
      }
      if (ad) claimed.add(ad);
      // Address the day by INDEX: plan data contains duplicate day ids, so
      // find(d => d.id === dayId) resolved three different days to the first
      // one and three separate fixes fought over one row.
      const adIdx = appDays.indexOf(ad);
      if (!ad) { gaps.missingDay.push(`${sb.tab} / ${sd.name} — no app day`); continue; }
      const appRows = ad.exercises || ad.ex || [];
      // SUPERSETS. The sheet groups them by row number — 3a/3b are one group —
      // and the app stores a LETTER per group in order of appearance (A..E).
      // Derive the expected letter so a superset that never made it across is
      // visible instead of silently flattened into ordinary rows.
      const groupOf = (n) => { const m = String(n).match(/^(\d+)[a-z]$/i); return m ? m[1] : null; };
      const groupSeq = [];
      for (const r of sd.rows) { const g = groupOf(r.n); if (g && !groupSeq.includes(g)) groupSeq.push(g); }
      const realGroups = groupSeq.filter((g) => sd.rows.filter((r) => groupOf(r.n) === g).length > 1);
      const letterFor = (g) => { const i = realGroups.indexOf(g); return i < 0 ? '' : 'ABCDE'[i % 5]; };

      // Match rows by TITLE, not by position. Comparing row i to row i turned a
      // day where the app simply held the same exercises in a different order —
      // or carried two extra warm-up rows — into dozens of bogus title/reps
      // gaps. The title is the join key; ordering is not data.
      const appTitleOf = (e) => norm(clean(e.title || (libById.get(e.exerciseId || e.eid || '') || {}).title));
      const pool = appRows.map((e, idx) => ({ e, idx, t: appTitleOf(e), used: false }));
      const takeByTitle = (t) => { const hit = pool.find((c) => !c.used && c.t === t); if (hit) hit.used = true; return hit; };

      sd.rows.forEach((sr) => {
        const where = `${sb.tab} / ${sd.name} / #${sr.n} ${sr.title}`;
        const match = takeByTitle(norm(sr.title));
        if (!match) { gaps.missingRow.push(`${where} — no app row with this exercise`); return; }
        const ar = match.e;
        compared++;
        const aSets = clean(ar.sets ?? ar.s), aReps = clean(ar.reps ?? ar.r), aTempo = clean(ar.tempo);
        if (hasVal(sr.sets) && normVal(aSets) !== normVal(sr.sets)) gaps.sets.push(`${where}  sheet=${sr.sets} app=${aSets}`);
        if (hasVal(sr.reps) && normVal(aReps) !== normVal(sr.reps)) gaps.reps.push(`${where}  sheet=${sr.reps} app=${aReps}`);
        if (hasVal(sr.tempo) && normVal(aTempo) !== normVal(sr.tempo)) gaps.tempo.push(`${where}  sheet=${sr.tempo} app=${aTempo}`);
        if (hasVal(sr.notes) && !clean(ar.notes ?? ar.n)) gaps.notes.push(`${where}  sheet note not in app`);
        const wantSS = letterFor(groupOf(sr.n));
        if (wantSS) {
          const gotSS = clean(ar.superset);
          if (!gotSS) {
            gaps.superset.push(`${where}  sheet groups it as a superset (${sr.n}), app has NONE`);
            fixes.push({ planId: plan.id, dayIdx: adIdx, rowIdx: match.idx, field: 'superset', value: wantSS, where });
          } else if (gotSS.toUpperCase() !== wantSS) {
            gaps.superset.push(`${where}  sheet group ${sr.n} -> ${wantSS}, app has ${gotSS}`);
            fixes.push({ planId: plan.id, dayIdx: adIdx, rowIdx: match.idx, field: 'superset', value: wantSS, where });
          }
        }
        if (sr.url) {
          const rowUrl = ar.videoUrl !== undefined && ar.videoUrl !== '' ? ar.videoUrl : '';
          const libUrl = (libById.get(ar.exerciseId || ar.eid || '') || {}).videoLink || '';
          const effective = rowUrl || libUrl;
          const sheetUrl = clean(sr.url).replace(/&amp;/g, '&');
          if (!effective) {
            gaps.url.push(`${where}\n      sheet has a video, app has NONE: ${sr.url.slice(0, 60)}`);
            fixes.push({ planId: plan.id, dayIdx: adIdx, rowIdx: match.idx, field: 'videoUrl', value: sheetUrl, reason: 'app had none', where });
          }
          else if (isRehosted(effective) || isRehosted(sr.url)) gaps.rehosted.push(`${where} — re-hosted copy`);
          else if (normUrl(effective) !== normUrl(sr.url)) {
            gaps.url.push(`${where}\n      sheet: ${normUrl(sr.url).slice(0, 58)}\n      app:   ${normUrl(effective).slice(0, 58)}`);
            fixes.push({ planId: plan.id, dayIdx: adIdx, rowIdx: match.idx, field: 'videoUrl', value: sheetUrl, reason: 'differs from sheet', where });
          }
        }
      });
      // App rows the sheet never mentions. Usually deliberate (a warm-up row
      // added in the app); listed so it is a decision, not a blind spot.
      for (const c of pool) {
        if (!c.used && c.t) gaps.extraRow.push(`${sb.tab} / ${sd.name} / ${clean(c.e.title || '')} — in app, not in sheet`);
      }
    }
  }

  const sheetRows = sheetBlocks.reduce((a, b) => a + b.days.reduce((x, d) => x + d.rows.length, 0), 0);
  console.log(`\n=== ${XLSX_PATH.split(/[\\/]/).pop()} → ${TRAINEE} ===`);
  console.log(`sheet: ${sheetBlocks.length} blocks, ${sheetRows} exercise rows | app plans matched: ${byBlock.size} | rows compared: ${compared}`);
  const order = ['missingBlock', 'missingDay', 'missingRow', 'extraRow', 'sets', 'reps', 'tempo', 'notes', 'superset', 'url'];
  let total = 0;
  for (const k of order) { if (k !== 'extraRow') total += gaps[k].length; console.log(`  ${k.padEnd(13)} ${gaps[k].length}`); }
  console.log(`  ${'TOTAL GAPS'.padEnd(13)} ${total}`);
  console.log(`  ${'(rehosted)'.padEnd(13)} ${gaps.rehosted.length}  — app serves its own copy, informational`);
  for (const k of order) {
    if (!gaps[k].length) continue;
    console.log(`\n--- ${k} (${gaps[k].length}) ---`);
    gaps[k].slice(0, 12).forEach((g) => console.log('  ' + g));
    if (gaps[k].length > 12) console.log(`  … and ${gaps[k].length - 12} more`);
  }
  if (JSON_OUT) { fs.writeFileSync(JSON_OUT, JSON.stringify({ trainee: TRAINEE, sheetRows, compared, gaps, fixes }, null, 2)); console.log('\nfull report:', JSON_OUT); }
  process.exit(0);
})();
