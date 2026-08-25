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
// Google Sheets silently turns "6-8" into a DATE. Such a cell comes back as a
// 5-digit serial (~40000-50000). The APP holds the real value in these cases,
// so the sheet is the corrupted side and must not be treated as authoritative.
const isDateSerial = (v) => /^\d{5}(\.\d+)?$/.test(clean(v)) && Number(clean(v)) > 30000 && Number(clean(v)) < 60000;
const hasVal = (v) => { const c = clean(v); return !!c && !DITTO.test(c) && !isDateSerial(c); };
const normVal = (v) => clean(v).toLowerCase().replace(/\s+/g, '');
// The sheet annotates numbers — "2 E POS", "2 x 2 E". If the leading number is
// the same on both sides the prescription agrees and the rest is shorthand.
const leadNum = (v) => { const m = clean(v).match(/^(\d+(?:\.\d+)?)/); return m ? m[1] : null; };
const sameVal = (a, b) => {
  if (normVal(a) === normVal(b)) return true;
  const la = leadNum(a), lb = leadNum(b);
  return !!(la && lb && la === lb);
};

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
      const isLabel = (/^(superset|super ?set|circuit|giant ?set|complex|back-?off ?set|dropset|drop ?set|amrap|rest|note)s?\s*:?\s*$/i.test(title)
        // decorative group banners: '^ Super Exercies # 5+6 ^'
        || /^\s*[\^*~]+.*[\^*~]+\s*$/.test(title) || /super\s*exerc/i.test(title));
      if (isLabel) { cur.sawSupersetLabel = true; continue; }
      if (!/^\d+[a-z]?$/i.test(num) || !title) {
        // A blank/rest line ends the day section.
        if (!title && !num) cur = null;
        continue;
      }
      cur.rows.push({
        n: num,
        title,
        // The URL can hang off the title cell OR the Vid cell, and they are not
        // always the same link — taking only the first missed real videos.
        url: link(r, cols.title) || (cols.vid != null ? link(r, cols.vid) : ''),
        urlAlt: (cols.vid != null ? link(r, cols.vid) : '') || link(r, cols.title),
        tempo: cols.tempo != null ? rowVals[cols.tempo] : '',
        sets: cols.sets != null ? rowVals[cols.sets] : '',
        reps: cols.reps != null ? rowVals[cols.reps] : '',
        notes: cols.notes != null ? rowVals[cols.notes] : '',
      });
    }
    // WARM-UP. It sits above the day tables under a "Warm-Up" header, in its
    // own column, and carries its own hyperlinks. The audit walked only day
    // rows for a long time, so every warm-up video was invisible to it — an
    // adversarial spot-check against the raw sheets is what surfaced this.
    const warmup = [];
    outer:
    for (let r = range.s.r; r <= Math.min(range.e.r, range.s.r + 12); r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        if (!/^warm[\s-]?up\s*:?\s*$/i.test(val(r, c))) continue;
        for (let rr = r + 1; rr <= Math.min(range.e.r, r + 14); rr++) {
          const t = val(rr, c);
          if (!t) break;
          if (/^(#|day\s)/i.test(t)) break;
          // "High BW Step-Up (1x10 E)" -> title + prescription
          const m = t.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
          const wt = clean(m ? m[1] : t);
          // A bare number is the Vid column's index, not a warm-up exercise —
          // some blocks put that column right under a "Warm-Up" header.
          if (!wt || /^\d+[a-z]?$/i.test(wt) || wt.length < 4) continue;
          warmup.push({ title: wt, rx: clean(m ? m[2] : ''), url: link(rr, c) });
        }
        break outer;
      }
    }
    blocks.push({ tab, warmup, days: days.filter((d) => d.rows.length) });
  }
  return blocks;
}

// Exported so the importer reads a block with the EXACT same parser the audit
// uses — one implementation, no second opinion to drift out of step.
module.exports = { parseWorkbook };

// ---------- compare ----------
// A typo-tolerant key: sorted tokens, each shortened to its first 5 letters so
// "Suppoted"/"Supported" and "Thorasic"/"Thoracic" collapse together.
// The sheet appends load qualifiers to a title — "BB Squat - 80% of Last 3x5".
// The app stores the exercise, and the qualifier lives in load/notes. Strip it
// before matching, or the same exercise reads as missing.
const baseTitle = (t) => clean(t).split(/\s+[-–—]\s+/)[0];
const canonKey = (t) => norm(t).split(' ').filter(Boolean).map((w) => w.slice(0, 5)).sort().join('|');
// A letter-sorted key catches TRANSPOSITIONS that a prefix key misses:
// "Golbet" and "Goblet" are anagrams, so they collapse; "Suppoted"/"Supported"
// are already handled by the prefix key above.
const anagramKey = (t) => norm(t).split(' ').filter(Boolean).map((w) => w.split('').sort().join('')).sort().join('|');
const blockNum = (name) => { const m = String(name).match(/#\s*(\d+)/); return m ? Number(m[1]) : null; };

if (require.main !== module) { /* imported for parseWorkbook only */ } else (async () => {
  await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  const { data: libRow } = await s.from('store').select('value').eq('key', 'expo-exercises').single();
  const lib = libRow.value || [];
  const libById = new Map(lib.map((e) => [e.id, e]));

  const ids = [TRAINEE, TRAINEE + '__0', TRAINEE + '__1'];
  const { data: plans } = await s.from('plans').select('id,name,data').in('trainee_id', ids);
  const byBlock = new Map();      // numeric "Block #N"
  const byName = new Map();       // everything else, matched on the name itself
  for (const p of plans || []) {
    const n = blockNum(p.name);
    if (n != null) byBlock.set(n, p);
    byName.set(norm(p.name), p);
  }

  const sheetBlocks = parseWorkbook(XLSX_PATH);
  const gaps = { missingBlock: [], missingDay: [], missingRow: [], extraRow: [], title: [], sets: [], reps: [], tempo: [], notes: [], url: [], superset: [], warmup: [], rehosted: [] };
  let compared = 0;
  // Machine-applicable fixes: exact plan id + day + row index, so the
  // applier never has to re-match anything by string.
  const fixes = [];

  for (const sb of sheetBlocks) {
    if (/^(history|log|archive|records?|maxes|testing)\b/i.test(sb.tab.trim())) continue;
    const n = blockNum(sb.tab);
    // Not every block is called "Block #N" — there are tabs named "Phase 9",
    // "Comeback Block", "Lower-Body WO". Fall back to the NAME before calling a
    // block missing, or a differently-named plan reads as never imported.
    let plan = n != null ? byBlock.get(n) : null;
    if (!plan) plan = byName.get(norm(sb.tab));
    if (!plan) {
      const rows = sb.days.reduce((a, d) => a + d.rows.length, 0);
      // A tab with no exercise rows is a note/scratch tab, not a program.
      if (rows === 0) continue;
      // Neither is a history/log tab — it records what was done, and is not
      // something the app is supposed to hold as a program.
      if (/^(history|log|archive|records?|maxes|testing)/i.test(sb.tab.trim())) continue;
      gaps.missingBlock.push(`${sb.tab} (${rows} rows) — no app plan`);
      continue;
    }
    // Warm-up steps are stored as { t, rx, vid } on the plan, not on a day.
    const appWarm = plan.data?.warmup || [];
    for (const sw of sb.warmup) {
      if (!sw.url) continue;
      const wi = appWarm.findIndex((w) => norm(w.t) === norm(sw.title) || canonKey(w.t) === canonKey(sw.title));
      if (wi < 0) {
        gaps.warmup.push(`${sb.tab} / warm-up / ${sw.title} — not in the app's warm-up`);
        // Restore the step the sheet says belongs here. Purely additive.
        fixes.push({ planId: plan.id, field: 'warmAdd', value: { t: sw.title, rx: sw.rx, vid: clean(sw.url).replace(/&amp;/g, '&') }, where: `${sb.tab} / warm-up / ${sw.title}` });
        continue;
      }
      const have = clean(appWarm[wi].vid || '');
      if (!have) {
        gaps.warmup.push(`${sb.tab} / warm-up / ${sw.title} — sheet has a video, app has NONE`);
        fixes.push({ planId: plan.id, warmIdx: wi, field: 'warmVid', value: clean(sw.url).replace(/&amp;/g, '&'), where: `${sb.tab} / warm-up / ${sw.title}` });
      } else if (normUrl(have) !== normUrl(sw.url) && !isRehosted(have)) {
        gaps.warmup.push(`${sb.tab} / warm-up / ${sw.title} — differs`);
        fixes.push({ planId: plan.id, warmIdx: wi, field: 'warmVid', value: clean(sw.url).replace(/&amp;/g, '&'), where: `${sb.tab} / warm-up / ${sw.title}` });
      }
    }

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
      // Pick the day by a SCORE, not by a rule: content overlap plus a bonus
      // when the name also matches. A hard name-match trusted the label over the
      // content and mis-paired days; a hard content threshold threw away days
      // whose exercises had simply been rewritten. Scoring gets both right.
      let ad = null, bestScore = 0;
      for (const d of appDays) {
        if (claimed.has(d)) continue;
        const nameHit = norm(d.name || d.n) === norm(sd.name) ? 0.4 : 0;
        const sc = overlap(d) + nameHit;
        if (sc > bestScore) { bestScore = sc; ad = d; }
      }
      if (bestScore < 0.3) ad = null;
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
      const pool = appRows.map((e, idx) => ({ e, idx, t: appTitleOf(e), k: canonKey(appTitleOf(e)), used: false }));
      // Exact title first; then a canonical token key. The sheets are full of
      // typos — "Chest-Suppoted", "DB Golbet", "Thorasic" — and an exact join
      // reported those real exercises as missing from the app.
      const takeByTitle = (t) => {
        let hit = pool.find((c) => !c.used && c.t === t);
        if (!hit) { const k = canonKey(t); if (k) hit = pool.find((c) => !c.used && c.k === k); }
        if (!hit) { const a = anagramKey(t); if (a) hit = pool.find((c) => !c.used && anagramKey(c.t) === a); }
        if (!hit) hit = pool.find((c) => !c.used && c.t && (c.t.includes(t) || t.includes(c.t)) && Math.abs(c.t.length - t.length) <= 4);
        if (hit) hit.used = true;
        return hit;
      };

      sd.rows.forEach((sr) => {
        const where = `${sb.tab} / ${sd.name} / #${sr.n} ${sr.title}`;
        const match = takeByTitle(norm(sr.title)) || takeByTitle(norm(baseTitle(sr.title)));
        if (!match) { gaps.missingRow.push(`${where} — no app row with this exercise`); return; }
        const ar = match.e;
        compared++;
        const aSets = clean(ar.sets ?? ar.s), aReps = clean(ar.reps ?? ar.r), aTempo = clean(ar.tempo);
        if (hasVal(sr.sets) && !sameVal(aSets, sr.sets)) gaps.sets.push(`${where}  sheet=${sr.sets} app=${aSets}`);
        if (hasVal(sr.reps) && !sameVal(aReps, sr.reps)) gaps.reps.push(`${where}  sheet=${sr.reps} app=${aReps}`);
        if (hasVal(sr.tempo) && !sameVal(aTempo, sr.tempo)) gaps.tempo.push(`${where}  sheet=${sr.tempo} app=${aTempo}`);
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
          else if (sr.urlAlt && normUrl(effective) === normUrl(sr.urlAlt)) { /* the row's other link — agrees */ }
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
  const order = ['missingBlock', 'missingDay', 'missingRow', 'extraRow', 'sets', 'reps', 'tempo', 'notes', 'superset', 'warmup', 'url'];
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
