// Port of parseSpreadsheet / parseSingleSheet from src/App.jsx for Node use.
// Keep in sync with App.jsx if the logic there changes.
const XLSX = require('xlsx');

const uid = () => Math.random().toString(36).slice(2, 18) + Date.now().toString(36);

function parseSingleSheet(ws, sheetName) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const getHyperlink = (r, c) => {
    const cellRef = XLSX.utils.encode_cell({ r, c });
    const cell = ws[cellRef];
    return cell?.l?.Target || cell?.l?.target || '';
  };

  let firstDayRow = rows.length;
  for (let r = 0; r < rows.length; r++) {
    if (String(rows[r][0] || '').trim() === '#' && String(rows[r][1] || '').trim()) { firstDayRow = r; break; }
  }
  const WU_HEADER_RE = /^\s*(warm[-\s]?up|morning routine|חימום|instructions?|notes?|neck exc|bb\s*-\s*barbell|everything else|bb exercises|week\s*\d|rest|home routine|date:|day\s+\w)/i;
  const WU_RX_RE = /^(.+?)\s*\(\s*([^()]+?)\s*\)\s*$/;
  const warmup = [];
  const wuSeen = new Set();
  for (let r = 0; r < firstDayRow; r++) {
    const row = rows[r] || [];
    for (let c = 0; c < row.length; c++) {
      const v = String(row[c] || '').trim();
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

  // Column positions for sets/reps/tempo/vid vary across sheets:
  //   Ayelet-style: #|name|Sets|Reps|Tempo|week1|week2|...
  //   Tom-style:    #|name|Vid|Tempo|Sets|Reps
  // Auto-detect from the `#` header row so we don't mis-read week-log columns
  // as sets/reps.
  const exercises = []; const days = []; let currentDay = null; let blockName = '';
  let colSets = 5, colReps = 6, colTempo = 4, colVid = 3; // fallback defaults
  const findCol = (hdr, rx) => { for (let c = 0; c < hdr.length; c++) { if (rx.test(String(hdr[c]||'').trim())) return c; } return -1; };
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]; const a = String(row[0] || '').trim(); const b = String(row[1] || '').trim();
    if (r === 0 && a && !blockName) { blockName = a; continue; }
    if (r === 0 && !a && b && !blockName) { blockName = b; continue; }
    if (a === '#' && b) {
      if (currentDay?.ex.length > 0) days.push(currentDay);
      currentDay = { name: b, ex: [] };
      // re-detect columns for this day — Ohad's sheets sometimes change layout between days
      const sC = findCol(row, /^sets?$/i);       if (sC !== -1) colSets = sC;
      const rC = findCol(row, /^reps?$/i);       if (rC !== -1) colReps = rC;
      const tC = findCol(row, /^tempo$/i);       if (tC !== -1) colTempo = tC;
      const vC = findCol(row, /^vid(eo)?$/i);    if (vC !== -1) colVid = vC;
      continue;
    }
    if (!a || a === '#' || a.toLowerCase().includes('rest') || a.toLowerCase().includes('off')) continue;
    if (!b || b.toLowerCase() === 'exercise' || b.toLowerCase() === 'name') continue;
    if (b.toLowerCase().includes('rest') && b.toLowerCase().includes('off')) continue;
    if (a.toLowerCase() === 'instructions' || a.toLowerCase().startsWith('bb -') || a.toLowerCase().startsWith('bb exercises')) continue;
    const tempo = String(row[colTempo] || '').trim();
    const setsRaw = String(row[colSets] || '3').trim();
    const repsRaw = String(row[colReps] || '').trim();
    let sets = parseInt(setsRaw) || 3; const wave = [];
    // wave columns are everything past the reps column (typically week logs)
    if (repsRaw.includes('>') || setsRaw.includes('>')) {
      const waveStart = Math.max(colSets, colReps, colTempo, colVid) + 1;
      for (let ci = waveStart; ci <= waveStart + 3; ci++) { if (row[ci]) wave.push(String(row[ci]).trim()); }
    }
    // Superset letter must be at the start of the row label (e.g. "1a", "2b") —
    // unanchored match false-positives on "3a" embedded inside other cell content.
    let superset = ''; const ssMatch = /^(\d+)([a-e])\b/i.exec(a); if (ssMatch) superset = ssMatch[2].toUpperCase();
    const eid = 'ex_' + uid();
    const exName = b || String(row[2] || '').trim();
    if (!exName) continue;
    const videoLink = getHyperlink(r, colVid);
    exercises.push({ id: eid, title: exName, videoLink, cues: '', category: '', resistanceType: '', movementPattern: '', laterality: '', primaryMuscles: '', secondaryMuscles: '', primaryJoints: '', jointMovements: '', bodyPosition: '', movementType: '', notes: '' });
    const dayEx = { eid, s: sets, r: repsRaw || '8-12' };
    if (tempo && tempo.toLowerCase() !== 'tempo' && tempo.toLowerCase() !== 'none') dayEx.tempo = tempo;
    if (wave.length > 0) dayEx.wk = wave;
    if (superset) dayEx.superset = superset;
    if (!currentDay) currentDay = { name: 'Day 1', ex: [] };
    currentDay.ex.push(dayEx);
  }
  if (currentDay?.ex.length > 0) days.push(currentDay);
  // Prefer the sheet tab name (user-authored, stable) over cell-A0 which is
  // often a stale copy-paste header (caused Ayelet's #15/#17/#18 to emit as
  // "Block #16" and "(" / "[" to become plan names).
  return { blockName: sheetName || blockName, exercises, days, warmup };
}

function parseSpreadsheet(data, fileName) {
  const wb = XLSX.read(data, { type: 'array' });
  const allExercises = []; const allPlans = []; const exTitleMap = {};
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const { blockName, exercises, days, warmup } = parseSingleSheet(ws, sheetName);
    if (days.length === 0) continue;
    const sheetExercises = [];
    for (const ex of exercises) {
      if (!exTitleMap[ex.title]) { exTitleMap[ex.title] = ex.id; allExercises.push(ex); }
      sheetExercises.push({ ...ex, dedupId: exTitleMap[ex.title] });
    }
    const remappedDays = days.map(d => ({
      ...d,
      ex: d.ex.map(e => {
        const orig = sheetExercises.find(se => se.id === e.eid);
        return { ...e, eid: orig ? orig.dedupId : e.eid };
      }),
    }));
    allPlans.push({ id: 'plan_' + uid(), name: blockName, phase: '', rest: '', warmup: warmup || [], days: remappedDays });
  }
  return { exercises: allExercises, plans: allPlans };
}

function xlsxBytesFromDriveDownload(jsonPath) {
  const fs = require('fs');
  const j = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const b64 = j.content[0].embeddedResource.contents.blob;
  return Buffer.from(b64, 'base64');
}

module.exports = { parseSingleSheet, parseSpreadsheet, xlsxBytesFromDriveDownload, uid };
